'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/contexts/AuthContext';
import { SectionHeader } from '@/components/portal/SectionHeader';
import { FormModal } from '@/components/portal/FormModal';
import toast from 'react-hot-toast';

const STAFF_ROLES = ['host', 'organizer', 'admin', 'facilitator', 'staff', 'speaker'];

type PlannerLink = {
  planner_event_id: number;
  planner_event_title: string | null;
  is_active: boolean;
} | null;

type PlannerEvent = {
  event_id: number;
  event_title: string;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  is_actively_linked: boolean;
};

type MemberStatus = {
  user_id: string;
  role: string;
  planner_sync_status: 'succeeded' | 'failed' | 'skipped' | null;
  planner_sync_error: string | null;
  planner_synced_at: string | null;
  profiles: { full_name: string | null; email: string | null } | null;
};

const SYNC_STATUS_LABELS: Record<string, string> = {
  succeeded: 'Synced',
  failed: 'Failed',
  skipped: 'Skipped',
};

// 'failed' maps onto the error token pair (a real semantic match). No
// success/green token exists anywhere in this project's design system
// (tailwind.config.js only defines primary/secondary/tertiary/error) — left
// as a raw class rather than inventing a new token during this pass.
const SYNC_STATUS_COLORS: Record<string, string> = {
  succeeded: 'bg-green-100 text-green-700',
  failed: 'bg-error-container text-on-error-container',
  skipped: 'bg-surface-container-low text-on-surface-variant',
};

type PushResult = { pushed: number; failed: number };
type PullResult = { pulled: number; unmatched: number; unmatchedEmails?: string[] };

export default function BendiePlannerPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { isGlobalAdmin, loading: authLoading } = useAuth();
  // The Bendie <-> Bendie Planner integration is an ADMINISTRATIVE surface
  // (Feature 001), not ordinary Bendie event content -- classified
  // `product: 'shared'` (Feature 005 review finding F2 correction; was
  // 'bendie' from Feature 003 onward, which predated Planner-only events even
  // being possible and made this tab wrongly unreachable for them -- linking
  // and member sync are product-mix-agnostic per their own routes/schema-
  // reference.md's "Final Feature 001 operation matrix"; only the Agenda/
  // Travel actions below require an active 'bendie' product, gated inline).
  // All 5 planner-* API routes have only ever authorized platform admins;
  // this page previously relied entirely on the old admin-only /portal
  // middleware gate for that same boundary. Feature 003 corrective pass
  // (F-R5): gate the page itself the same way, fail-closed, so an ordinary
  // event member reaching it under Feature 003's widened admission can no
  // longer see other members' Planner sync status/link metadata before the
  // mutating actions 403 server-side.

  const [link, setLink] = useState<PlannerLink>(null);
  const [loadingLink, setLoadingLink] = useState(true);

  // Review finding F2 — agenda push and travel pull require an active 'bendie'
  // row in event_products (Feature 004's own guard on those two routes; member
  // sync and linking are deliberately product-mix-agnostic — see
  // schema-reference.md's "Final Feature 001 operation matrix"). This tab is now
  // reachable for Planner-only events too (see eventSectionMeta.ts), so the two
  // Bendie-specific actions must say so honestly instead of rendering a button
  // that will just 403 when clicked. Re-review finding: defaults to `false`
  // (fail closed), not `true` — `fetchLink`/`fetchMembers`/`fetchBendieAvailability`
  // fire independently in the same effect with no guaranteed resolution order, so
  // a `true` default let the Agenda/Travel buttons render briefly enabled (on a
  // Planner-only event) in the window after `fetchLink` resolves but before this
  // fetch does. `false` closes that window: the buttons only ever appear once
  // this fetch has actually confirmed an active 'bendie' row exists.
  const [bendieActive, setBendieActive] = useState(false);

  const [browseOpen, setBrowseOpen] = useState(false);
  const [plannerEvents, setPlannerEvents] = useState<PlannerEvent[]>([]);
  const [loadingPlannerEvents, setLoadingPlannerEvents] = useState(false);
  const [plannerSearch, setPlannerSearch] = useState('');
  const [linkingId, setLinkingId] = useState<number | null>(null);
  const [unlinking, setUnlinking] = useState(false);

  const [members, setMembers] = useState<MemberStatus[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);

  const [pushingAgenda, setPushingAgenda] = useState(false);
  const [pushResult, setPushResult] = useState<PushResult | null>(null);

  const [pullingTravel, setPullingTravel] = useState(false);
  const [pullResult, setPullResult] = useState<PullResult | null>(null);

  const fetchLink = useCallback(async () => {
    setLoadingLink(true);
    const { data } = await supabase
      .from('event_planner_links')
      .select('planner_event_id,planner_event_title,is_active')
      .eq('event_id', eventId)
      .maybeSingle();
    setLink(data && data.is_active ? data : null);
    setLoadingLink(false);
  }, [eventId]);

  const fetchBendieAvailability = useCallback(async () => {
    const { data } = await supabase
      .from('event_products')
      .select('product_key')
      .eq('event_id', eventId)
      .eq('product_key', 'bendie')
      .maybeSingle();
    setBendieActive(!!data);
  }, [eventId]);

  const fetchMembers = useCallback(async () => {
    setLoadingMembers(true);
    // Corrective pass (R2-F4): planner_sync_status/planner_sync_error (and
    // the related planner_assignment_id/planner_synced_at) have their direct
    // client-side SELECT revoked for ordinary customers at the database
    // privilege layer -- this page's own platform-admin session reads them
    // through get_event_planner_sync_status() instead, a SECURITY DEFINER
    // function that re-verifies portal_is_global_admin() itself rather than
    // relying on this page's own client-side guard as the only boundary.
    const { data, error } = await supabase
      .rpc('get_event_planner_sync_status', { p_event_id: eventId });
    if (error) {
      toast.error('Failed to load member sync status');
    } else {
      const rows = ((data ?? []) as Array<{
        user_id: string;
        role: string;
        planner_sync_status: MemberStatus['planner_sync_status'];
        planner_sync_error: string | null;
        planner_synced_at: string | null;
        full_name: string | null;
        email: string | null;
      }>)
        .filter((row) => STAFF_ROLES.includes(row.role))
        .map((row) => ({
          user_id: row.user_id,
          role: row.role,
          planner_sync_status: row.planner_sync_status,
          planner_sync_error: row.planner_sync_error,
          planner_synced_at: row.planner_synced_at,
          profiles: { full_name: row.full_name, email: row.email },
        }));
      setMembers(rows);
    }
    setLoadingMembers(false);
  }, [eventId]);

  useEffect(() => {
    if (eventId && isGlobalAdmin) {
      fetchLink();
      fetchMembers();
      fetchBendieAvailability();
    }
  }, [eventId, isGlobalAdmin, fetchLink, fetchMembers, fetchBendieAvailability]);

  const openBrowse = async () => {
    setBrowseOpen(true);
    setLoadingPlannerEvents(true);
    try {
      const res = await fetch('/api/admin/planner-events');
      const body = await res.json();
      if (!res.ok) { toast.error(body.error ?? 'Failed to load Bendie Planner events'); return; }
      setPlannerEvents(body.events ?? []);
    } catch (err) {
      toast.error('Failed to load Bendie Planner events');
      console.error(err);
    } finally {
      setLoadingPlannerEvents(false);
    }
  };

  const handleLink = async (pe: PlannerEvent) => {
    setLinkingId(pe.event_id);
    try {
      const res = await fetch('/api/admin/planner-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, plannerEventId: pe.event_id, plannerEventTitle: pe.event_title }),
      });
      const body = await res.json();
      if (!res.ok) { toast.error(body.error ?? 'Failed to link'); return; }
      toast.success(`Linked to "${pe.event_title}"`);
      setBrowseOpen(false);
      fetchLink();
    } catch (err) {
      toast.error('Failed to link');
      console.error(err);
    } finally {
      setLinkingId(null);
    }
  };

  const handleUnlink = async () => {
    setUnlinking(true);
    try {
      const res = await fetch('/api/admin/planner-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, plannerEventId: null }),
      });
      const body = await res.json();
      if (!res.ok) { toast.error(body.error ?? 'Failed to unlink'); return; }
      toast.success('Unlinked from Bendie Planner');
      setLink(null);
    } catch (err) {
      toast.error('Failed to unlink');
      console.error(err);
    } finally {
      setUnlinking(false);
    }
  };

  const handlePushAgenda = async () => {
    setPushingAgenda(true);
    setPushResult(null);
    try {
      const res = await fetch('/api/admin/planner-push-agenda', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId }),
      });
      const body = await res.json();
      if (!res.ok) { toast.error(body.error ?? 'Failed to push agenda'); return; }
      setPushResult({ pushed: body.pushed ?? 0, failed: body.failed ?? 0 });
      if ((body.failed ?? 0) > 0) toast.error(`Pushed ${body.pushed}, ${body.failed} failed`);
      else toast.success(`Pushed ${body.pushed} agenda item${body.pushed === 1 ? '' : 's'} to Bendie Planner`);
    } catch (err) {
      toast.error('Failed to push agenda');
      console.error(err);
    } finally {
      setPushingAgenda(false);
    }
  };

  const handlePullTravel = async () => {
    setPullingTravel(true);
    setPullResult(null);
    try {
      const res = await fetch('/api/admin/planner-pull-travel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId }),
      });
      const body = await res.json();
      if (!res.ok) { toast.error(body.error ?? 'Failed to pull travel data'); return; }
      setPullResult({ pulled: body.pulled ?? 0, unmatched: body.unmatched ?? 0, unmatchedEmails: body.unmatchedEmails });
      if ((body.unmatched ?? 0) > 0) toast(`Pulled ${body.pulled}, ${body.unmatched} traveler(s) unmatched`, { icon: '⚠️' });
      else toast.success(`Pulled ${body.pulled} travel record${body.pulled === 1 ? '' : 's'} from Bendie Planner`);
    } catch (err) {
      toast.error('Failed to pull travel data');
      console.error(err);
    } finally {
      setPullingTravel(false);
    }
  };

  const filteredPlannerEvents = plannerEvents.filter((pe) => {
    if (!plannerSearch.trim()) return true;
    const q = plannerSearch.trim().toLowerCase();
    return pe.event_title.toLowerCase().includes(q) || (pe.location ?? '').toLowerCase().includes(q);
  });

  if (authLoading) {
    return (
      <div className="animate-pulse space-y-2" aria-busy="true">
        {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-surface-container-low rounded-[20px]" />)}
      </div>
    );
  }

  if (!isGlobalAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-4">
        <span className="material-symbols-outlined text-5xl text-on-surface-variant mb-3">lock</span>
        <h1 className="font-headline-sm text-headline-sm text-on-surface mb-1">You don&apos;t have access to this page</h1>
        <p className="text-body-md font-body-md text-on-surface-variant max-w-sm">
          Managing the Bendie Planner integration is a platform administration function.
        </p>
        <Link href={`/portal/events/${eventId}/dashboard`} className="btn-secondary mt-4">
          Back to Event
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <SectionHeader
          sectionKey="bendie-planner"
          desc={link ? `Linked to "${link.planner_event_title ?? link.planner_event_id}"` : 'Not linked to Bendie Planner'}
        />
      </div>

      {/* Link status card */}
      <div className="bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow p-6 sm:p-8 mb-6">
        {loadingLink ? (
          <div className="animate-pulse h-16 bg-surface-container-low rounded-xl" />
        ) : link ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-primary text-[20px]">sync_alt</span>
              </div>
              <div>
                <p className="font-medium text-on-surface">{link.planner_event_title ?? `Planner event #${link.planner_event_id}`}</p>
                <p className="text-xs text-on-surface-variant/70">Actively linked · Bendie Planner event #{link.planner_event_id}</p>
              </div>
            </div>
            <button onClick={handleUnlink} disabled={unlinking} className="btn-secondary">
              {unlinking ? 'Unlinking…' : 'Unlink'}
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-medium text-on-surface">Not linked to Bendie Planner</p>
              <p className="text-xs text-on-surface-variant/70">Link this event to enable member sync, agenda push, and travel pull.</p>
            </div>
            <button onClick={openBrowse} className="btn-primary">
              <span className="material-symbols-outlined text-[18px]">link</span> Find Planner Event
            </button>
          </div>
        )}
      </div>

      {!link ? (
        <div className="text-center py-16 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow text-on-surface-variant text-sm">
          Link this event to a Bendie Planner event to see member sync status and enable agenda/travel sync.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Members */}
          <div className="bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow p-5">
            <h3 className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wide mb-1">Members</h3>
            <p className="text-xs text-on-surface-variant/70 mb-3">Portal → Planner · automatic for staff-tier roles</p>
            {loadingMembers ? (
              <div className="animate-pulse space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-10 bg-surface-container-low rounded-lg" />)}</div>
            ) : members.length === 0 ? (
              <p className="text-sm text-on-surface-variant/70 italic">No staff-tier members yet.</p>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar pr-1">
                {members.map((m) => (
                  <div key={m.user_id} className="flex items-center justify-between gap-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-on-surface">{m.profiles?.full_name ?? m.profiles?.email ?? 'Unknown'}</p>
                      <p className="text-[11px] text-on-surface-variant/70 truncate capitalize">{m.role}</p>
                    </div>
                    <span
                      className={`flex-shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        m.planner_sync_status ? SYNC_STATUS_COLORS[m.planner_sync_status] : 'bg-surface-container-low text-on-surface-variant'
                      }`}
                      title={m.planner_sync_error ?? undefined}
                    >
                      {m.planner_sync_status ? SYNC_STATUS_LABELS[m.planner_sync_status] : 'Not yet synced'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Agenda — requires an active 'bendie' product (Feature 004 guard);
              a Planner-only event has nothing Bendie-side to push (F2). */}
          <div className="bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow p-5">
            <h3 className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wide mb-1">Agenda</h3>
            <p className="text-xs text-on-surface-variant/70 mb-3">Portal → Planner · manual</p>
            {bendieActive ? (
              <>
                <button onClick={handlePushAgenda} disabled={pushingAgenda} className="btn-primary w-full justify-center mb-2">
                  {pushingAgenda ? 'Pushing…' : 'Push to Planner'}
                </button>
                {pushResult && (
                  <p className="text-xs text-on-surface-variant">
                    Last push: {pushResult.pushed} pushed{pushResult.failed > 0 ? `, ${pushResult.failed} failed` : ''}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-on-surface-variant/70 italic">
                This event doesn&apos;t use Bendie, so there&apos;s no agenda to push.
              </p>
            )}
          </div>

          {/* Travel — same 'bendie' requirement as Agenda (F2). */}
          <div className="bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow p-5">
            <h3 className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wide mb-1">Travel</h3>
            <p className="text-xs text-on-surface-variant/70 mb-3">Planner → Portal · manual · flight &amp; hotel</p>
            {bendieActive ? (
              <>
                <button onClick={handlePullTravel} disabled={pullingTravel} className="btn-primary w-full justify-center mb-2">
                  {pullingTravel ? 'Pulling…' : 'Pull from Planner'}
                </button>
                {pullResult && (
                  <p className="text-xs text-on-surface-variant">
                    Last pull: {pullResult.pulled} pulled{pullResult.unmatched > 0 ? `, ${pullResult.unmatched} unmatched` : ''}
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-on-surface-variant/70 italic">
                This event doesn&apos;t use Bendie, so there&apos;s no attendee travel to pull into.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Browse Planner events modal */}
      <FormModal open={browseOpen} onClose={() => setBrowseOpen(false)} title="Find a Bendie Planner Event">
        <input
          type="text"
          placeholder="Search by title or location..."
          value={plannerSearch}
          onChange={(e) => setPlannerSearch(e.target.value)}
          className="input w-full mb-3"
        />
        {loadingPlannerEvents ? (
          <div className="animate-pulse space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-14 bg-surface-container-low rounded-xl" />)}</div>
        ) : filteredPlannerEvents.length === 0 ? (
          <p className="text-sm text-on-surface-variant/70 italic py-6 text-center">No Bendie Planner events found.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto custom-scrollbar pr-1">
            {filteredPlannerEvents.map((pe) => (
              <div key={pe.event_id} className="flex items-center justify-between gap-3 border border-outline-variant rounded-xl p-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-on-surface truncate">{pe.event_title}</p>
                  <p className="text-xs text-on-surface-variant/70 truncate">
                    {[pe.location, pe.start_date].filter(Boolean).join(' · ') || 'No location/date on file'}
                  </p>
                </div>
                {pe.is_actively_linked ? (
                  <span className="flex-shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-surface-container-low text-on-surface-variant">
                    Already linked
                  </span>
                ) : (
                  <button
                    onClick={() => handleLink(pe)}
                    disabled={linkingId === pe.event_id}
                    className="btn-secondary text-xs py-1.5 flex-shrink-0"
                  >
                    {linkingId === pe.event_id ? 'Linking…' : 'Link'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </FormModal>
    </div>
  );
}
