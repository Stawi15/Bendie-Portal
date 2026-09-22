'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Avatar } from '@/components/portal/Avatar';
import { EditProfileModal } from '@/components/portal/EditProfileModal';
import { CsvImportModal } from '@/components/portal/CsvImportModal';
import { PlannerPermissionsModal } from '@/components/portal/PlannerPermissionsModal';
import { AddPeopleMenu } from '@/components/portal/AddPeopleMenu';
import { AddPeopleModal } from '@/components/portal/AddPeopleModal';
import { AddFromTeamModal } from '@/components/portal/AddFromTeamModal';
import { AddAllOrgPeopleModal } from '@/components/portal/AddAllOrgPeopleModal';
import { useEvent } from '@/contexts/EventContext';
import { useAuth } from '@/contexts/AuthContext';
import { getField, type ColumnSpec, type RowResult } from '@/lib/csvImport';
import { useConfirm } from '@/contexts/ConfirmContext';
import { SectionHeader } from '@/components/portal/SectionHeader';
import { EVENT_MEMBER_ROLE_LABELS } from '@/lib/portalLabels';
import {
  EVENT_MEMBER_ROLES,
  resolveEventProductContext,
  checkCanAdministerPlanner,
  resolveOrCreatePersonByEmail,
  addPersonToEvent,
  type EventAccessConfig,
  type PlannerAccessChoice,
} from '@/lib/eventTeamProvisioning';
import { useLatestRequest } from '@/lib/useLatestRequest';
import toast from 'react-hot-toast';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type NewMemberCsvRow = {
  rowIndex: number;
  email: string;
  full_name: string | null;
  role: string;
  bendieAccess: boolean;
  plannerAccess: PlannerAccessChoice;
};

const MEMBER_CSV_COLUMNS: ColumnSpec[] = [
  { key: 'email', label: 'Email', required: true },
  { key: 'full_name', label: 'Full Name' },
  { key: 'role', label: `Event Role (${EVENT_MEMBER_ROLES.join(', ')})` },
  { key: 'bendieAccess', label: 'Bendie Access (yes/no)' },
  { key: 'plannerAccess', label: 'Planner Access (none/viewer/manager)' },
];

const MEMBER_CSV_SAMPLES: Record<string, string>[] = [
  { email: 'jane@example.com', full_name: 'Jane Smith', role: 'attendee', bendieAccess: 'yes', plannerAccess: 'none' },
  { email: 'david@example.com', full_name: 'David Otieno', role: 'facilitator', bendieAccess: 'yes', plannerAccess: 'none' },
];

type Member = {
  event_id: string;
  user_id: string;
  role: string;
  onboarding_status: string;
  onboarding_completed_at: string | null;
  created_at: string;
  profiles: {
    full_name: string | null;
    email: string | null;
    avatar_url: string | null;
    job_title: string | null;
    phone: string | null;
    bio: string | null;
  } | null;
};

const ROLE_COLORS: Record<string, string> = {
  host: 'bg-purple-100 text-purple-700',
  organizer: 'bg-blue-100 text-blue-700',
  admin: 'bg-red-100 text-red-700',
  facilitator: 'bg-green-100 text-green-700',
  staff: 'bg-secondary/10 text-secondary',
  attendee: 'bg-surface-container-low text-on-surface-variant',
  speaker: 'bg-primary/10 text-primary',
};

const ONBOARDING_COLORS: Record<string, string> = {
  completed: 'bg-green-100 text-green-700',
  in_progress: 'bg-secondary/10 text-secondary',
  pending: 'bg-surface-container-low text-on-surface-variant',
};

type IssueAccessCodeResult = {
  event_id: string;
  user_id: string;
  access_code: string;
  expires_at: string;
};

export default function MembersPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { currentEvent } = useEvent();
  const { isGlobalAdmin } = useAuth();
  const confirm = useConfirm();
  // Event Team management is an event-manager surface (host/organizer/admin),
  // not something every event member gets by virtue of being on this page's
  // route -- Feature 003 corrective pass (F-R2). Reuses the same
  // is_event_host_or_organizer() predicate event_members' own RLS uses for
  // exactly this distinction (now also the source of the event_members
  // DELETE policy added in Feature 016's foundation fix).
  const [canManage, setCanManage] = useState<boolean | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);
  const [makingFacilitator, setMakingFacilitator] = useState<string | null>(null);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [resendingCode, setResendingCode] = useState<string | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [addFromOrgOpen, setAddFromOrgOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [addFromTeamOpen, setAddFromTeamOpen] = useState(false);
  const [addAllOpen, setAddAllOpen] = useState(false);
  // Feature 008 — independent of `canManage` above (event-role-based).
  // Bendie Planner permission administration is deliberately narrower:
  // platform admin, or organization owner/admin of the event's own
  // organization (never an event host/organizer/admin/facilitator/staff/
  // speaker role, and never any Planner can_manage_* flag). Resolved via the
  // dedicated can-administer endpoint (research.md R11) rather than the real
  // per-member GET, so this runs once per page load, not once per row.
  const [canAdministerPlanner, setCanAdministerPlanner] = useState(false);
  const [plannerPermissionsMember, setPlannerPermissionsMember] = useState<Member | null>(null);
  // Product availability (Feature 016) — which "Product Access" toggles the
  // Add People config step may offer at all; a Bendie-only event never shows
  // a Planner toggle and vice versa.
  const [productContext, setProductContext] = useState<{ organizationId: string; bendieAvailable: boolean; plannerAvailable: boolean } | null>(null);

  // Rapid-navigation performance pass — see src/lib/useLatestRequest.ts.
  // Aborts the previous in-flight roster query when a newer one supersedes
  // it (rapid re-navigation to this tab) or the page unmounts.
  const startRequest = useLatestRequest();

  const fetchData = async () => {
    const signal = startRequest();
    const { data, error } = await supabase
      .from('event_members')
      .select('event_id,user_id,role,onboarding_status,onboarding_completed_at,created_at,profiles!event_members_user_id_fkey(full_name,email,avatar_url,job_title,phone,bio)')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .abortSignal(signal);
    if (error) {
      // A deliberate cancellation (superseded by a newer load, or the page
      // unmounted) must never surface as a user-visible error.
      if (signal.aborted) return;
      toast.error('Failed to load attendees');
    } else {
      setMembers((data as unknown as Member[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!eventId) return;
    if (isGlobalAdmin) {
      setCanManage(true);
      return;
    }
    let cancelled = false;
    setCanManage(null);
    supabase.rpc('is_event_host_or_organizer', { ev_id: eventId }).then(({ data, error }) => {
      if (cancelled) return;
      setCanManage(!error && data === true);
    });
    return () => {
      cancelled = true;
    };
  }, [eventId, isGlobalAdmin]);

  useEffect(() => { if (eventId && canManage) fetchData(); }, [eventId, canManage]);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    checkCanAdministerPlanner(eventId).then((can) => {
      if (!cancelled) setCanAdministerPlanner(can);
    });
    resolveEventProductContext(eventId).then((ctx) => {
      if (!cancelled) setProductContext(ctx);
    });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  useEffect(() => {
    const organizationId = currentEvent?.organization_id;
    if (!organizationId) return;
    // Teams RLS (Feature 016 foundation fix) now lets any organisation member
    // read their org's teams, not only platform admins — this SELECT (and
    // the "From team" flow it feeds) is functional for ordinary event
    // managers for the first time.
    supabase.from('teams').select('id, name').eq('organization_id', organizationId).order('name').then(({ data }) => {
      setTeams(data ?? []);
    });
  }, [currentEvent?.organization_id]);

  const changeRole = async (userId: string, newRole: string) => {
    setUpdatingRole(userId);
    const { error } = await supabase.from('event_members').update({ role: newRole }).eq('event_id', eventId).eq('user_id', userId);
    if (error) toast.error(error.message);
    else { toast.success('Role updated'); fetchData(); }
    setUpdatingRole(null);
  };

  const makeFacilitator = async (m: Member) => {
    setMakingFacilitator(m.user_id);

    const { data: existing, error: checkError } = await supabase
      .from('facilitators')
      .select('id')
      .eq('event_id', eventId)
      .eq('user_id', m.user_id)
      .maybeSingle();

    if (checkError) { toast.error(checkError.message); setMakingFacilitator(null); return; }

    if (!existing) {
      const { error: insertError } = await supabase.from('facilitators').insert({
        event_id: eventId,
        user_id: m.user_id,
        full_name: m.profiles?.full_name ?? null,
        email: m.profiles?.email ?? null,
        job_title: m.profiles?.job_title ?? null,
        avatar_url: m.profiles?.avatar_url ?? null,
        claim_status: 'claimed',
        claimed_at: new Date().toISOString(),
      });
      if (insertError) { toast.error(insertError.message); setMakingFacilitator(null); return; }
    }

    const { error: roleError } = await supabase
      .from('event_members')
      .update({ role: 'facilitator' })
      .eq('event_id', eventId)
      .eq('user_id', m.user_id);

    if (roleError) toast.error(roleError.message);
    else { toast.success(`${m.profiles?.full_name ?? 'Person'} is now a facilitator`); fetchData(); }
    setMakingFacilitator(null);
  };

  const handleResendAccessCode = async (m: Member) => {
    const email = m.profiles?.email;
    if (!email) { toast.error('This person has no email on file'); return; }

    const proceed = await confirm({
      title: 'Resend access code?',
      message: `Send a new access code to ${m.profiles?.full_name ?? email} (${email})? Their previous code will stop working.`,
      confirmLabel: 'Send',
    });
    if (!proceed) return;

    setResendingCode(m.user_id);

    const { data, error } = await supabase.rpc('issue_event_access_code', {
      p_event_id: eventId,
      p_user_id: m.user_id,
    });

    const result = (Array.isArray(data) ? data[0] : data) as IssueAccessCodeResult | undefined;

    if (error || !result) {
      toast.error(error?.message ?? 'Failed to generate a new access code');
      setResendingCode(null);
      return;
    }

    const { error: fnError } = await supabase.functions.invoke('send-event-access-code-email', {
      body: {
        email,
        eventName: currentEvent?.name ?? 'this event',
        accessCode: result.access_code,
        expiresAt: result.expires_at,
      },
    });

    if (fnError) {
      toast.error('A new code was generated but the email failed to send — try again');
    } else {
      toast.success(`Access code sent to ${email}`);
    }
    setResendingCode(null);
  };

  const handleRemove = async (m: Member) => {
    const ok = await confirm({
      title: 'Remove from event',
      message: `Remove ${m.profiles?.full_name ?? m.profiles?.email ?? 'this person'} from this event? This does not remove them from the organisation.`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;

    setRemovingId(m.user_id);
    const { error } = await supabase.from('event_members').delete().eq('event_id', eventId).eq('user_id', m.user_id);
    if (error) {
      toast.error(error.message);
      setRemovingId(null);
      return;
    }
    // Best-effort Planner deactivation side effect (Feature 008 research.md
    // R10) — never awaited, a Planner-side failure must never block or
    // reverse the Portal removal that already succeeded.
    fetch(`/api/events/${eventId}/members/${m.user_id}/planner-permissions/deactivate-on-removal`, { method: 'POST' }).catch((err) =>
      console.error('Planner access deactivation on removal failed', err)
    );
    toast.success(`${m.profiles?.full_name ?? 'Person'} removed from this event`);
    setRemovingId(null);
    fetchData();
  };

  const parseMemberCsvRow = (raw: Record<string, string>, rowIndex: number): RowResult<NewMemberCsvRow> => {
    const errors: string[] = [];

    const email = getField(raw, 'email').toLowerCase();
    if (!email) errors.push('email is required');
    else if (!EMAIL_RE.test(email)) errors.push('email is not a valid email address');

    const roleRaw = getField(raw, 'role').toLowerCase();
    const role = roleRaw || 'attendee';
    if (roleRaw && !(EVENT_MEMBER_ROLES as readonly string[]).includes(roleRaw)) errors.push(`role must be one of: ${EVENT_MEMBER_ROLES.join(', ')}`);

    // Backward-compatible: both new columns are optional. Absent
    // bendieAccess defaults to false (matching the pre-existing CSV import,
    // which never auto-issued an access code — codes were always a
    // separate, deliberate Resend Code action). Absent plannerAccess
    // defaults to 'none' — a deliberate behavior change from the old
    // implicit role-based auto-sync (Feature 016: product access must never
    // be silently inferred from event role).
    const bendieRaw = getField(raw, 'bendieAccess').toLowerCase();
    const bendieAccess = bendieRaw ? bendieRaw === 'yes' || bendieRaw === 'true' : false;

    const plannerRaw = getField(raw, 'plannerAccess').toLowerCase();
    const plannerAccess: PlannerAccessChoice = plannerRaw === 'viewer' || plannerRaw === 'manager' ? plannerRaw : 'none';
    if (plannerRaw && plannerAccess === 'none' && plannerRaw !== 'none') errors.push('plannerAccess must be one of: none, viewer, manager');

    const data: NewMemberCsvRow = { rowIndex, email, full_name: getField(raw, 'full_name') || null, role, bendieAccess, plannerAccess };
    return { rowIndex, raw, data: errors.length === 0 ? data : undefined, errors };
  };

  const importMemberRow = async (row: NewMemberCsvRow) => {
    const organizationId = productContext?.organizationId ?? currentEvent?.organization_id;
    if (!organizationId) return { error: 'Could not determine this event\'s organisation' };

    const resolved = await resolveOrCreatePersonByEmail(row.email, row.full_name ?? '', organizationId);
    if ('error' in resolved) return { error: resolved.error };

    const config: EventAccessConfig = { eventRole: row.role as EventAccessConfig['eventRole'], grantBendie: row.bendieAccess, plannerAccess: row.plannerAccess };
    const label = row.full_name ?? row.email;
    const outcome = await addPersonToEvent(eventId, currentEvent?.name ?? 'this event', organizationId, { userId: resolved.userId, email: row.email, label }, config);

    if (outcome.eventMembership === 'failed') return { error: outcome.eventMembershipError ?? 'Failed to add to event' };
    const problems: string[] = [];
    if (outcome.bendieAccess === 'failed') problems.push('Bendie access code could not be sent');
    if (outcome.plannerAccess === 'failed' || outcome.plannerAccess === 'denied') problems.push('Planner access could not be granted');
    if (problems.length > 0) return { error: `Added to event, but: ${problems.join('; ')}` };
    return {};
  };

  const existingEventMemberIds = new Set(members.map((m) => m.user_id));

  const roles = ['all', ...Array.from(new Set(members.map(m => m.role)))];

  const filtered = members.filter(m => {
    const p = m.profiles;
    const matchesSearch = !search || p?.full_name?.toLowerCase().includes(search.toLowerCase()) || p?.email?.toLowerCase().includes(search.toLowerCase());
    const matchesRole = roleFilter === 'all' || m.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  const roleCounts = members.reduce<Record<string, number>>((acc, m) => { acc[m.role] = (acc[m.role] ?? 0) + 1; return acc; }, {});

  if (canManage === null) {
    return (
      <div className="animate-pulse space-y-2" aria-busy="true">
        {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-16 bg-surface-container-low rounded-[20px]" />)}
      </div>
    );
  }

  if (canManage === false) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center px-4">
        <span className="material-symbols-outlined text-5xl text-on-surface-variant mb-3">lock</span>
        <h1 className="font-headline-sm text-headline-sm text-on-surface mb-1">You don&apos;t have access to this page</h1>
        <p className="text-body-md font-body-md text-on-surface-variant max-w-sm">
          Managing attendees and access requires the host, organizer, or admin role for this event.
        </p>
        <Link href={`/portal/events/${eventId}/dashboard`} className="btn-secondary mt-4">
          Back to Event
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <SectionHeader sectionKey="members" desc={`${members.length} ${members.length === 1 ? 'person' : 'people'} on this event`} />
        {productContext && (
          <AddPeopleMenu
            canCreateAccounts={isGlobalAdmin}
            onFromOrganisation={() => setAddFromOrgOpen(true)}
            onFromTeam={() => setAddFromTeamOpen(true)}
            onInviteNew={() => setInviteOpen(true)}
            onImportCsv={() => setCsvOpen(true)}
            onAddAll={() => setAddAllOpen(true)}
          />
        )}
      </div>

      {!isGlobalAdmin && (
        <p className="hint mb-4">
          Creating brand-new accounts (Invite New / Import CSV) is currently a platform-administration function.
          You can still add existing organisation or team members below.
        </p>
      )}

      <p className="hint mb-5">People who are part of this Bendie event and their access.</p>

      {productContext && (
        <>
          <AddPeopleModal
            open={addFromOrgOpen}
            mode="organisation"
            eventId={eventId}
            eventName={currentEvent?.name ?? 'this event'}
            organizationId={productContext.organizationId}
            existingEventMemberIds={existingEventMemberIds}
            bendieAvailable={productContext.bendieAvailable}
            plannerAvailable={productContext.plannerAvailable}
            canAdministerPlanner={canAdministerPlanner}
            onClose={() => setAddFromOrgOpen(false)}
            onDone={fetchData}
          />
          <AddPeopleModal
            open={inviteOpen}
            mode="invite"
            eventId={eventId}
            eventName={currentEvent?.name ?? 'this event'}
            organizationId={productContext.organizationId}
            existingEventMemberIds={existingEventMemberIds}
            bendieAvailable={productContext.bendieAvailable}
            plannerAvailable={productContext.plannerAvailable}
            canAdministerPlanner={canAdministerPlanner}
            onClose={() => setInviteOpen(false)}
            onDone={fetchData}
          />
          <AddFromTeamModal
            open={addFromTeamOpen}
            teams={teams}
            eventId={eventId}
            eventName={currentEvent?.name ?? 'this event'}
            organizationId={productContext.organizationId}
            existingEventMemberIds={existingEventMemberIds}
            bendieAvailable={productContext.bendieAvailable}
            plannerAvailable={productContext.plannerAvailable}
            canAdministerPlanner={canAdministerPlanner}
            onClose={() => setAddFromTeamOpen(false)}
            onDone={fetchData}
          />
          <AddAllOrgPeopleModal
            open={addAllOpen}
            eventId={eventId}
            eventName={currentEvent?.name ?? 'this event'}
            organizationId={productContext.organizationId}
            existingEventMemberIds={existingEventMemberIds}
            bendieAvailable={productContext.bendieAvailable}
            plannerAvailable={productContext.plannerAvailable}
            canAdministerPlanner={canAdministerPlanner}
            onClose={() => setAddAllOpen(false)}
            onDone={fetchData}
          />
        </>
      )}

      <CsvImportModal<NewMemberCsvRow>
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        onImported={fetchData}
        title="Import Attendees"
        templateFilename="event-team-template.csv"
        columns={MEMBER_CSV_COLUMNS}
        sampleRows={MEMBER_CSV_SAMPLES}
        parseRow={parseMemberCsvRow}
        importRow={importMemberRow}
      />

      {/* Role breakdown */}
      <div className="flex flex-wrap gap-2 mb-5">
        {Object.entries(roleCounts).map(([role, count]) => (
          <button key={role} onClick={() => setRoleFilter(roleFilter === role ? 'all' : role)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${roleFilter === role ? 'border-primary bg-primary/5 text-primary' : 'border-outline-variant bg-white text-on-surface-variant hover:border-primary/30'}`}>
            {EVENT_MEMBER_ROLE_LABELS[role] ?? role} ({count})
          </button>
        ))}
      </div>

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input type="text" placeholder="Search by name or email..." value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 input" />
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="input sm:w-40">
          {roles.map(r => <option key={r} value={r}>{r === 'all' ? 'All Roles' : (EVENT_MEMBER_ROLE_LABELS[r] ?? r)}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-16 bg-surface-container-low rounded-[20px]" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow">
          <p className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-3">groups</p>
          <p className="text-on-surface-variant">{search ? 'No one matches your search.' : 'No one on this event yet.'}</p>
        </div>
      ) : (
        <div className="bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-surface-container-low/50 border-b border-outline-variant">
              <tr>
                <th className="text-left px-5 py-3 font-label-md text-label-md text-on-surface-variant">Person</th>
                <th className="text-left px-5 py-3 font-label-md text-label-md text-on-surface-variant">Event Role</th>
                <th className="text-left px-5 py-3 font-label-md text-label-md text-on-surface-variant">Bendie Access</th>
                <th className="text-left px-5 py-3 font-label-md text-label-md text-on-surface-variant">Onboarding</th>
                <th className="text-right px-5 py-3 font-label-md text-label-md text-on-surface-variant">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {filtered.map(m => {
                const p = m.profiles;
                return (
                  <tr key={m.user_id} className="hover:bg-surface-container-low/20 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={p?.full_name} email={p?.email} avatarUrl={p?.avatar_url} size={32} />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-on-surface">{p?.full_name ?? 'Unknown'}</p>
                          <p className="text-xs text-on-surface-variant/70">{p?.email}</p>
                        </div>
                        <button
                          onClick={() => setEditingMember(m)}
                          className="flex-shrink-0 p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/5 transition-colors"
                          aria-label={`Edit ${p?.full_name ?? 'person'}`}
                        >
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <select
                        value={m.role}
                        onChange={e => changeRole(m.user_id, e.target.value)}
                        disabled={updatingRole === m.user_id}
                        className={`text-xs font-semibold capitalize rounded-full px-2.5 py-1 border-0 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 cursor-pointer ${ROLE_COLORS[m.role] ?? 'bg-surface-container-low text-on-surface-variant'}`}
                      >
                        {EVENT_MEMBER_ROLES.map(r => <option key={r} value={r}>{EVENT_MEMBER_ROLE_LABELS[r] ?? r}</option>)}
                      </select>
                    </td>
                    <td className="px-5 py-3">
                      {/* Corrective fix (Feature 016 continuation, Part 15) — this
                          column previously also showed a "Planner…" pill styled
                          identically to this real status badge, but it never
                          reflected whether the person actually had live Planner
                          staff access (Feature 008) — it was only a management
                          action shortcut, shown to anyone who could administer
                          permissions, regardless of the target's real state.
                          Fetching real per-row Planner status would require a new
                          batch endpoint against event_user_assignments that
                          doesn't exist today (deferred — see plan.md; not built
                          here to avoid an N+1 request pattern). Honest fix: this
                          column now shows only what's actually true (every
                          Event Team row is Bendie-eligible by current
                          architecture — an access code can always be issued, see
                          Resend Code below), and the Planner-access action moved
                          to Actions, framed as an action, not a status pill. */}
                      <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">Eligible</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${ONBOARDING_COLORS[m.onboarding_status] ?? 'bg-surface-container-low text-on-surface-variant'}`}>
                        {m.onboarding_status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2 flex-wrap">
                        {m.role === 'facilitator' || m.role === 'speaker' ? (
                          <span className="text-xs text-on-surface-variant/70 italic whitespace-nowrap">Already a facilitator</span>
                        ) : (
                          <button
                            onClick={() => makeFacilitator(m)}
                            disabled={makingFacilitator === m.user_id}
                            className="text-xs text-primary hover:opacity-80 font-medium px-2 py-1 rounded-lg hover:bg-primary/5 transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                          >
                            {makingFacilitator === m.user_id ? 'Adding…' : 'Make Facilitator'}
                          </button>
                        )}
                        <button
                          onClick={() => handleResendAccessCode(m)}
                          disabled={resendingCode === m.user_id}
                          title="Send this person a new event access code by email"
                          className="text-xs text-primary hover:opacity-80 font-medium px-2 py-1 rounded-lg hover:bg-primary/5 transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          {resendingCode === m.user_id ? 'Sending…' : 'Resend Code'}
                        </button>
                        {canAdministerPlanner && productContext?.plannerAvailable && (
                          <button
                            onClick={() => setPlannerPermissionsMember(m)}
                            title="Manage this person's Bendie Planner access"
                            className="text-xs text-secondary hover:opacity-80 font-medium px-2 py-1 rounded-lg hover:bg-secondary/5 transition whitespace-nowrap"
                          >
                            Team &amp; Access
                          </button>
                        )}
                        <button
                          onClick={() => handleRemove(m)}
                          disabled={removingId === m.user_id}
                          className="text-xs text-error hover:opacity-80 font-medium px-2 py-1 rounded-lg hover:bg-error/5 transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          {removingId === m.user_id ? 'Removing…' : 'Remove'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          <div className="px-5 py-3 border-t border-outline-variant text-xs text-on-surface-variant/70">
            Showing {filtered.length} of {members.length}
          </div>
        </div>
      )}

      <EditProfileModal
        open={editingMember !== null}
        userId={editingMember?.user_id ?? null}
        initial={{
          full_name: editingMember?.profiles?.full_name ?? '',
          email: editingMember?.profiles?.email ?? '',
          phone: editingMember?.profiles?.phone ?? '',
          job_title: editingMember?.profiles?.job_title ?? '',
          avatar_url: editingMember?.profiles?.avatar_url ?? '',
          bio: editingMember?.profiles?.bio ?? '',
        }}
        onClose={() => setEditingMember(null)}
        onSaved={fetchData}
      />

      {plannerPermissionsMember && (
        <PlannerPermissionsModal
          open={plannerPermissionsMember !== null}
          eventId={eventId as string}
          userId={plannerPermissionsMember.user_id}
          displayName={plannerPermissionsMember.profiles?.full_name || plannerPermissionsMember.profiles?.email || 'this person'}
          onClose={() => setPlannerPermissionsMember(null)}
        />
      )}
    </div>
  );
}
