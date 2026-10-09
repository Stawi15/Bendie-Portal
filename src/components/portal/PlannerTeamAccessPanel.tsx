'use client';

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Avatar } from '@/components/portal/Avatar';
import { PlannerPermissionsModal } from '@/components/portal/PlannerPermissionsModal';
import { AddPeopleModal } from '@/components/portal/AddPeopleModal';
import { useEvent } from '@/contexts/EventContext';
import { resolveEventProductContext } from '@/lib/eventTeamProvisioning';
import toast from 'react-hot-toast';
import { EVENT_MEMBER_ROLE_LABELS } from '@/lib/portalLabels';

type Row = {
  user_id: string;
  role: string;
  profiles: { full_name: string | null; email: string | null; avatar_url: string | null } | null;
};

const PAGE = 25;

/**
 * Feature 016 (organizer-experience pass) — Planner Team & Access inside the
 * Planner workspace. Before this, the only entry point was a row action on
 * Bendie's Attendees & Access page, which a Planner-only event cannot open (the
 * route is Bendie-classified and the layout redirects it to Planner Overview).
 *
 * Reuses everything that already exists: the event's `event_members` roster
 * (the same read Attendees & Access does, under the same RLS) and Feature 008's
 * `PlannerPermissionsModal`, whose routes independently re-verify
 * `canAdministerPlannerPermissions` server-side. No new permission concept, no
 * new endpoint; Participants and Attendees are not merged into this list.
 *
 * Only rendered for callers who can administer Planner access (the page decides).
 *
 * Feature 017 — "Add team member" reuses AddPeopleModal's invite mode: the
 * account, organisation membership and roster row are written server-side by
 * POST /api/events/[eventId]/members (one roster for every product view), then
 * Planner access is granted through the same Feature 008 routes.
 */
export function PlannerTeamAccessPanel({ eventId }: { eventId: string }) {
  const { currentEvent } = useEvent();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [includeAttendees, setIncludeAttendees] = useState(false);
  const [visible, setVisible] = useState(PAGE);
  const [managing, setManaging] = useState<Row | null>(null);
  // Resolved when "Add team member" is clicked, so the panel itself adds no load-time reads.
  const [addContext, setAddContext] = useState<{ organizationId: string; bendieAvailable: boolean } | null>(null);
  const [openingAdd, setOpeningAdd] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setRows(null);
    setLoadError(false);
    supabase
      .from('event_members')
      .select('user_id,role,profiles!event_members_user_id_fkey(full_name,email,avatar_url)')
      .eq('event_id', eventId)
      .order('created_at', { ascending: true })
      .abortSignal(controller.signal)
      .then(({ data, error }) => {
        if (controller.signal.aborted) return; // navigation, not failure
        if (error) {
          console.error('PlannerTeamAccessPanel: event team read failed', error);
          setLoadError(true);
          setRows([]);
          return;
        }
        setRows((data as unknown as Row[]) ?? []);
      });
    return () => controller.abort();
  }, [eventId, reloadKey]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (!includeAttendees && r.role === 'attendee') return false;
      if (!q) return true;
      return (r.profiles?.full_name ?? '').toLowerCase().includes(q) || (r.profiles?.email ?? '').toLowerCase().includes(q);
    });
  }, [rows, search, includeAttendees]);

  const attendeeCount = (rows ?? []).filter((r) => r.role === 'attendee').length;
  const existingMemberIds = useMemo(() => new Set((rows ?? []).map((r) => r.user_id)), [rows]);

  async function openAdd() {
    setOpeningAdd(true);
    const context = await resolveEventProductContext(eventId);
    setOpeningAdd(false);
    if (!context) {
      toast.error('Couldn’t load this event — refresh and try again.');
      return;
    }
    setAddContext({ organizationId: context.organizationId, bendieAvailable: context.bendieAvailable });
  }

  const addButton = (
    <button type="button" className="btn-primary flex-shrink-0" onClick={openAdd} disabled={openingAdd}>
      <span className="material-symbols-outlined text-[18px]" aria-hidden="true">person_add</span>
      {openingAdd ? 'Opening…' : 'Add team member'}
    </button>
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-3">
        <input
          type="search"
          aria-label="Search the event team"
          placeholder="Search by name or email…"
          className="input sm:max-w-xs"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setVisible(PAGE);
          }}
        />
        {attendeeCount > 0 && (
          <label className="inline-flex items-center gap-2 text-sm text-on-surface-variant cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 accent-primary rounded"
              checked={includeAttendees}
              onChange={(e) => {
                setIncludeAttendees(e.target.checked);
                setVisible(PAGE);
              }}
            />
            Include attendees ({attendeeCount})
          </label>
        )}
        {rows !== null && rows.length > 0 && <div className="sm:ml-auto">{addButton}</div>}
      </div>

      {rows === null ? (
        <div className="space-y-2" aria-busy="true">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-11 bg-surface-container-low rounded-xl animate-pulse" />
          ))}
        </div>
      ) : loadError ? (
        <p className="text-sm text-on-surface-variant">Couldn&apos;t load this event&apos;s team right now — refresh to try again.</p>
      ) : rows.length === 0 ? (
        <div className="border border-dashed border-outline-variant rounded-xl p-5 text-center space-y-3">
          <p className="text-sm text-on-surface-variant">
            No one is on this event&apos;s team yet. Add a team member by email — they get an account if they don&apos;t have one, join your
            organisation, and get Planner access in one step.
          </p>
          <div className="flex justify-center">{addButton}</div>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-on-surface-variant">
          {search ? 'No one matches your search.' : 'No team members besides attendees. Tick “Include attendees” to grant one of them Planner access.'}
        </p>
      ) : (
        <ul className="divide-y divide-outline-variant/40 border border-outline-variant/60 rounded-xl">
          {filtered.slice(0, visible).map((r) => {
            const name = r.profiles?.full_name || r.profiles?.email || 'Unknown person';
            return (
              <li key={r.user_id} className="flex items-center gap-3 px-3 py-2">
                <Avatar name={r.profiles?.full_name} email={r.profiles?.email} avatarUrl={r.profiles?.avatar_url} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-on-surface truncate">{name}</p>
                  <p className="text-xs text-on-surface-variant truncate">
                    {EVENT_MEMBER_ROLE_LABELS[r.role] ?? r.role}
                    {r.profiles?.email && r.profiles.full_name ? ` · ${r.profiles.email}` : ''}
                  </p>
                </div>
                <button type="button" className="row-action flex-shrink-0" onClick={() => setManaging(r)}>
                  Manage access
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {filtered.length > visible && (
        <button type="button" className="row-action mt-2" onClick={() => setVisible((v) => v + PAGE)}>
          Show {Math.min(PAGE, filtered.length - visible)} more
        </button>
      )}

      {managing && (
        <PlannerPermissionsModal
          open
          eventId={eventId}
          userId={managing.user_id}
          displayName={managing.profiles?.full_name || managing.profiles?.email || 'this person'}
          onClose={() => setManaging(null)}
        />
      )}

      {addContext && (
        <AddPeopleModal
          open
          mode="invite"
          title="Add Team Member"
          initialConfig={{ eventRole: 'staff', grantBendie: false, plannerAccess: 'viewer' }}
          eventId={eventId}
          eventName={currentEvent?.id === eventId ? currentEvent.name : 'this event'}
          organizationId={addContext.organizationId}
          existingEventMemberIds={existingMemberIds}
          bendieAvailable={addContext.bendieAvailable}
          plannerAvailable
          canAdministerPlanner
          onClose={() => setAddContext(null)}
          onDone={() => setReloadKey((k) => k + 1)}
        />
      )}
    </div>
  );
}
