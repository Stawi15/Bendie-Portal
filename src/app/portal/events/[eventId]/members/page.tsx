'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Avatar } from '@/components/portal/Avatar';
import { EditProfileModal } from '@/components/portal/EditProfileModal';
import { FormModal } from '@/components/portal/FormModal';
import { CsvImportModal } from '@/components/portal/CsvImportModal';
import { useEvent } from '@/contexts/EventContext';
import { useAuth } from '@/contexts/AuthContext';
import { runWithConcurrency, getField, type ColumnSpec, type RowResult } from '@/lib/csvImport';
import { useConfirm } from '@/contexts/ConfirmContext';
import { SectionHeader } from '@/components/portal/SectionHeader';
import toast from 'react-hot-toast';

const MEMBER_ROLES = ['host', 'organizer', 'admin', 'facilitator', 'staff', 'attendee', 'speaker'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type NewMemberCsvRow = { rowIndex: number; email: string; full_name: string | null; role: string };

const MEMBER_CSV_COLUMNS: ColumnSpec[] = [
  { key: 'email', label: 'Email', required: true },
  { key: 'full_name', label: 'Full Name' },
  { key: 'role', label: `Role (${MEMBER_ROLES.join(', ')})` },
];

const MEMBER_CSV_SAMPLES: Record<string, string>[] = [
  { email: 'jane@example.com', full_name: 'Jane Smith', role: 'attendee' },
  { email: 'david@example.com', full_name: 'David Otieno', role: 'facilitator' },
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
  // Members management is an event-manager surface (host/organizer/admin),
  // not something every event member gets by virtue of being on this page's
  // route -- Feature 003 corrective pass (F-R2). This page previously relied
  // entirely on the old admin-only /portal middleware gate; now that ordinary
  // event members can reach it, it needs its own management-role guard,
  // reusing the same is_event_host_or_organizer() predicate event_members'
  // own RLS already uses for exactly this distinction. Fails closed: nothing
  // in this page (including fetchData's own roster read) runs until the
  // check resolves.
  const [canManage, setCanManage] = useState<boolean | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [updatingRole, setUpdatingRole] = useState<string | null>(null);
  const [makingFacilitator, setMakingFacilitator] = useState<string | null>(null);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [addingAll, setAddingAll] = useState(false);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [assigningTeam, setAssigningTeam] = useState(false);
  const [resendingCode, setResendingCode] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [newMember, setNewMember] = useState({ email: '', fullName: '', role: 'attendee' });
  const [addingMember, setAddingMember] = useState(false);

  // Populated once per CSV import by beforeImportMembers, read per-row by importMemberRow.
  const emailToIdRef = useRef<Map<string, string>>(new Map());
  const createErrorsRef = useRef<Map<string, string>>(new Map());
  const organizationIdRef = useRef<string | null>(null);

  const fetchData = async () => {
    const { data, error } = await supabase
      .from('event_members')
      .select('event_id,user_id,role,onboarding_status,onboarding_completed_at,created_at,profiles!event_members_user_id_fkey(full_name,email,avatar_url,job_title,phone,bio)')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false });
    if (error) toast.error('Failed to load members');
    else setMembers((data as unknown as Member[]) ?? []);
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
    const organizationId = currentEvent?.organization_id;
    if (!organizationId) return;
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
    else { toast.success(`${m.profiles?.full_name ?? 'Member'} is now a facilitator`); fetchData(); }
    setMakingFacilitator(null);
  };

  const handleResendAccessCode = async (m: Member) => {
    const email = m.profiles?.email;
    if (!email) { toast.error('This member has no email on file'); return; }

    const proceed = await confirm({
      title: 'Resend access code?',
      message: `Send a new access code to ${m.profiles?.full_name ?? email} (${email})? Their previous code will stop working.`,
      confirmLabel: 'Send',
    });
    if (!proceed) return;

    setResendingCode(m.user_id);

    // Never surfaced in the UI — goes straight from this RPC into the email
    // function below. Generates a fresh code and invalidates the previous one.
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

  const handleAddAllOrgMembers = async () => {
    const organizationId = await resolveOrganizationId();
    if (!organizationId) { toast.error('Could not determine this event\'s organisation'); return; }

    setAddingAll(true);
    const { data: orgMembers, error } = await supabase
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', organizationId);

    if (error) { toast.error(error.message); setAddingAll(false); return; }

    const existingIds = new Set(members.map(m => m.user_id));
    const toAdd = (orgMembers ?? []).filter(om => !existingIds.has(om.user_id));

    if (toAdd.length === 0) {
      toast.success('Everyone in this organisation is already a member of this event');
      setAddingAll(false);
      return;
    }

    const proceed = await confirm({
      title: 'Add all organisation members?',
      message: `Add ${toAdd.length} organisation member${toAdd.length !== 1 ? 's' : ''} to this event?`,
      confirmLabel: 'Add',
    });
    if (!proceed) {
      setAddingAll(false);
      return;
    }

    const outcomes = await runWithConcurrency(
      toAdd,
      5,
      async (om) => {
        const { error: insertError } = await supabase
          .from('event_members')
          .insert({ event_id: eventId, user_id: om.user_id, organization_id: organizationId, role: 'attendee' });
        if (insertError && insertError.code !== '23505') return false;
        const pointed = await pointCurrentEventAt(om.user_id, organizationId);
        // role is hardcoded 'attendee' here, which never syncs to Bendie
        // Planner (see STAFF_ROLES in planner-sync-member/route.ts) — skip
        // the guaranteed-no-op HTTP round trip rather than firing and
        // letting the server discover the same thing every time.
        return pointed.ok;
      },
      () => false
    );

    const succeeded = outcomes.filter(Boolean).length;
    if (succeeded === toAdd.length) toast.success(`Added ${succeeded} member${succeeded !== 1 ? 's' : ''} to this event`);
    else toast.error(`Added ${succeeded} of ${toAdd.length} members — some failed`);

    setAddingAll(false);
    fetchData();
  };

  const handleAssignTeam = async (teamId: string) => {
    const organizationId = await resolveOrganizationId();
    const team = teams.find(t => t.id === teamId);
    if (!organizationId || !team) return;

    setAssigningTeam(true);
    const { data: teamMembers, error } = await supabase.from('team_members').select('user_id').eq('team_id', teamId);

    if (error) { toast.error(error.message); setAssigningTeam(false); return; }

    const existingIds = new Set(members.map(m => m.user_id));
    const toAdd = (teamMembers ?? []).filter(tm => !existingIds.has(tm.user_id));

    if (toAdd.length === 0) {
      toast.success(`Everyone in "${team.name}" is already a member of this event`);
      setAssigningTeam(false);
      return;
    }

    const proceed = await confirm({
      title: `Assign team "${team.name}"?`,
      message: `Add ${toAdd.length} member${toAdd.length !== 1 ? 's' : ''} from this team to the event?`,
      confirmLabel: 'Add',
    });
    if (!proceed) { setAssigningTeam(false); return; }

    const outcomes = await runWithConcurrency(
      toAdd,
      5,
      async (tm) => {
        const { error: insertError } = await supabase
          .from('event_members')
          .insert({ event_id: eventId, user_id: tm.user_id, organization_id: organizationId, role: 'attendee' });
        if (insertError && insertError.code !== '23505') return false;
        const pointed = await pointCurrentEventAt(tm.user_id, organizationId);
        // role is hardcoded 'attendee' here — never eligible for Bendie
        // Planner sync, so skip the guaranteed-no-op HTTP round trip.
        return pointed.ok;
      },
      () => false
    );

    const succeeded = outcomes.filter(Boolean).length;
    if (succeeded === toAdd.length) toast.success(`Added ${succeeded} member${succeeded !== 1 ? 's' : ''} from "${team.name}"`);
    else toast.error(`Added ${succeeded} of ${toAdd.length} members — some failed`);

    setAssigningTeam(false);
    fetchData();
  };

  /**
   * Points this person's "which event am I in" state at this event. Without
   * this, someone newly provisioned here has an event_members row but the
   * mobile app still can't resolve them into the event until they separately
   * join by slug/access code — see the memory note on this recurring gap.
   * Only backfills current_organization_id if it was unset, so an existing
   * user's other active org context isn't silently clobbered.
   */
  const pointCurrentEventAt = async (userId: string, organizationId: string): Promise<{ ok: true } | { ok: false; error: string }> => {
    const { data: profile, error: selectError } = await supabase.from('profiles').select('current_organization_id').eq('id', userId).maybeSingle();
    if (selectError) return { ok: false, error: selectError.message };

    const { error: updateError } = await supabase.from('profiles').update({
      current_event_id: eventId,
      current_organization_id: profile?.current_organization_id ?? organizationId,
    }).eq('id', userId);
    if (updateError) return { ok: false, error: updateError.message };

    return { ok: true };
  };

  /**
   * Best-effort, fire-and-forget: attempts to make this person available in
   * Bendie Planner if this event is linked and their role is staff-tier.
   * Both checks happen server-side (the route no-ops otherwise) so every
   * provisioning path can call this uniformly rather than duplicating the
   * "is this event linked / is this role eligible" logic here. Never
   * awaited by callers and never lets a Planner-side failure affect the
   * Portal provisioning result it's attached to.
   */
  const syncToPlanner = (userId: string) => {
    fetch('/api/admin/planner-sync-member', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventId, userId }),
    }).catch((err) => console.error('Planner member sync failed', err));
  };

  /**
   * The `currentEvent` context value can still be mid-fetch (or briefly hold
   * the previous event) right after navigating here, so a provisioning
   * action fired quickly after landing on the page can silently register
   * people against the WRONG organization. Always resolve it fresh from the
   * URL's eventId instead of trusting context state for anything that writes
   * event_members/organization_members.
   */
  const resolveOrganizationId = async (): Promise<string | null> => {
    const { data } = await supabase.from('events').select('organization_id').eq('id', eventId).single();
    return data?.organization_id ?? null;
  };

  const handleAddMember = async () => {
    const organizationId = await resolveOrganizationId();
    const email = newMember.email.trim().toLowerCase();
    if (!organizationId) { toast.error('Could not determine this event\'s organisation'); return; }
    if (!email || !EMAIL_RE.test(email)) { toast.error('A valid email is required'); return; }

    setAddingMember(true);

    const { data: existing } = await supabase.from('profiles').select('id').ilike('email', email).maybeSingle();
    let userId = existing?.id ?? null;

    if (!userId) {
      try {
        const res = await fetch('/api/admin/create-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, fullName: newMember.fullName.trim(), organizationId, orgRole: 'member' }),
        });
        const body = await res.json();
        if (!res.ok) { toast.error(body.error ?? 'Failed to create account'); setAddingMember(false); return; }
        userId = body.id;
      } catch (err) {
        toast.error('Failed to create account');
        console.error(err);
        setAddingMember(false);
        return;
      }
    } else {
      const { error: orgError } = await supabase.from('organization_members').insert({ organization_id: organizationId, user_id: userId, role: 'member' });
      if (orgError && orgError.code !== '23505') { toast.error(orgError.message); setAddingMember(false); return; }
    }

    const { error: eventError } = await supabase.from('event_members').insert({
      event_id: eventId, user_id: userId, organization_id: organizationId, role: newMember.role,
    });
    if (eventError && eventError.code !== '23505') { toast.error(eventError.message); setAddingMember(false); return; }

    const pointed = await pointCurrentEventAt(userId as string, organizationId);
    syncToPlanner(userId as string);

    const label = newMember.fullName.trim() || email;
    if (pointed.ok) {
      toast.success(`${label} added to this event`);
    } else {
      toast.error(`${label} added to this event, but their current event couldn't be set — they may not see it in the mobile app yet`);
    }
    setNewMember({ email: '', fullName: '', role: 'attendee' });
    setAddOpen(false);
    setAddingMember(false);
    fetchData();
  };

  const parseMemberCsvRow = (raw: Record<string, string>, rowIndex: number): RowResult<NewMemberCsvRow> => {
    const errors: string[] = [];

    const email = getField(raw, 'email').toLowerCase();
    if (!email) errors.push('email is required');
    else if (!EMAIL_RE.test(email)) errors.push('email is not a valid email address');

    const roleRaw = getField(raw, 'role').toLowerCase();
    const role = roleRaw || 'attendee';
    if (roleRaw && !MEMBER_ROLES.includes(roleRaw)) errors.push(`role must be one of: ${MEMBER_ROLES.join(', ')}`);

    const data: NewMemberCsvRow = { rowIndex, email, full_name: getField(raw, 'full_name') || null, role };
    return { rowIndex, raw, data: errors.length === 0 ? data : undefined, errors };
  };

  const beforeImportMembers = async (rows: NewMemberCsvRow[]) => {
    emailToIdRef.current = new Map();
    createErrorsRef.current = new Map();
    organizationIdRef.current = await resolveOrganizationId();
    if (!organizationIdRef.current) { toast.error('Could not determine this event\'s organisation'); return; }

    const emails = rows.map(r => r.email);
    const { data: existingProfiles, error } = await supabase.from('profiles').select('id,email').in('email', emails);
    if (error) { toast.error('Failed to check existing accounts'); console.error(error); return; }
    for (const p of existingProfiles ?? []) {
      if (p.email) emailToIdRef.current.set(p.email.toLowerCase(), p.id);
    }

    const newRows = rows.filter(r => !emailToIdRef.current.has(r.email));
    if (newRows.length === 0) return;

    try {
      const res = await fetch('/api/admin/bulk-create-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: newRows.map(r => ({ email: r.email, fullName: r.full_name ?? '' })) }),
      });
      const body = await res.json();
      if (!res.ok) {
        const message = body.error ?? 'Failed to create new accounts';
        for (const r of newRows) createErrorsRef.current.set(r.email, message);
        return;
      }
      for (const result of body.results as { email: string; id?: string; error?: string }[]) {
        const key = result.email.toLowerCase();
        if (result.id) emailToIdRef.current.set(key, result.id);
        else createErrorsRef.current.set(key, result.error ?? 'Failed to create account');
      }
    } catch (err) {
      console.error(err);
      for (const r of newRows) createErrorsRef.current.set(r.email, 'Failed to create account');
    }
  };

  const importMemberRow = async (row: NewMemberCsvRow) => {
    const userId = emailToIdRef.current.get(row.email);
    if (!userId) return { error: createErrorsRef.current.get(row.email) ?? 'Could not resolve or create this account' };

    const organizationId = organizationIdRef.current;
    if (!organizationId) return { error: 'No organisation for this event' };

    const { error: orgError } = await supabase.from('organization_members').insert({ organization_id: organizationId, user_id: userId, role: 'member' });
    if (orgError && orgError.code !== '23505') return { error: `Account ready, but failed to join organisation: ${orgError.message}` };

    const { error: eventError } = await supabase.from('event_members').insert({
      event_id: eventId, user_id: userId, organization_id: organizationId, role: row.role,
    });
    if (eventError && eventError.code !== '23505') return { error: `Joined organisation, but failed to join event: ${eventError.message}` };

    const pointed = await pointCurrentEventAt(userId, organizationId);
    syncToPlanner(userId);
    if (!pointed.ok) return { error: `Joined event, but failed to set their current event: ${pointed.error}` };
    return {};
  };

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
          Managing event members requires the host, organizer, or admin role for this event.
        </p>
        <Link href={`/portal/events/${eventId}/dashboard`} className="btn-secondary mt-4">
          Back to Event
        </Link>
      </div>
    );
  }

  return (
    <div>
      {!isGlobalAdmin && (
        <p className="hint mb-3">
          Creating brand-new accounts (Import CSV / Add Member) is currently a platform-administration function.
          You can still add existing organisation or team members and manage roles below.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <SectionHeader sectionKey="members" desc={`${members.length} member${members.length !== 1 ? 's' : ''} in this event`} />
        <div className="flex flex-wrap gap-2">
          {teams.length > 0 && (
            <select
              value=""
              onChange={(e) => e.target.value && handleAssignTeam(e.target.value)}
              disabled={assigningTeam}
              className="btn-secondary flex-shrink-0 disabled:opacity-50 cursor-pointer"
            >
              <option value="">{assigningTeam ? 'Adding…' : 'Assign a Team…'}</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          <button onClick={handleAddAllOrgMembers} disabled={addingAll} className="btn-secondary flex-shrink-0 disabled:opacity-50">
            <span className="material-symbols-outlined text-[18px]">group_add</span> {addingAll ? 'Adding…' : 'Add All Organisation Members'}
          </button>
          {/* Import CSV / Add Member can create brand-new Portal accounts via
              /api/admin/create-user and /api/admin/bulk-create-users, both of
              which are (correctly, deliberately) platform-admin-only server
              routes -- see F-R4 in the Feature 003 corrective pass. Event
              managers who aren't also platform admins get a real, working
              page (role changes, adding existing org/team members) rather
              than controls that promise an operation the server will 403.
              Customer-side new-account provisioning remains an explicit,
              deferred product decision, not silently granted here. */}
          {isGlobalAdmin && (
            <>
              <button onClick={() => setCsvOpen(true)} className="btn-secondary flex-shrink-0">
                <span className="material-symbols-outlined text-[18px]">upload_file</span> Import CSV
              </button>
              <button onClick={() => setAddOpen(true)} className="btn-primary flex-shrink-0">
                <span className="material-symbols-outlined text-[18px]">person_add</span> Add Member
              </button>
            </>
          )}
        </div>
      </div>

      <FormModal open={addOpen} onClose={() => setAddOpen(false)} title="Add Member" maxWidthClassName="max-w-md">
        <p className="hint mb-3">
          If this email doesn&apos;t have an account yet, one is created automatically — no password, no email sent.
          Either way, they&apos;re registered to this event&apos;s organisation and to this event itself.
        </p>
        <div className="space-y-3">
          <div>
            <label className="label">Email *</label>
            <input className="input" type="email" value={newMember.email} onChange={e => setNewMember(p => ({ ...p, email: e.target.value }))} placeholder="jane@example.com" />
          </div>
          <div>
            <label className="label">Full Name</label>
            <input className="input" value={newMember.fullName} onChange={e => setNewMember(p => ({ ...p, fullName: e.target.value }))} placeholder="Jane Smith" />
          </div>
          <div>
            <label className="label">Event Role</label>
            <select className="input" value={newMember.role} onChange={e => setNewMember(p => ({ ...p, role: e.target.value }))}>
              {MEMBER_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-3 mt-4 pt-4 border-t border-outline-variant">
          <button onClick={handleAddMember} disabled={addingMember} className="btn-primary">{addingMember ? 'Adding…' : 'Add to Event'}</button>
          <button onClick={() => setAddOpen(false)} className="btn-secondary">Cancel</button>
        </div>
      </FormModal>

      <CsvImportModal<NewMemberCsvRow>
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        onImported={fetchData}
        title="Import Members"
        templateFilename="event-members-template.csv"
        columns={MEMBER_CSV_COLUMNS}
        sampleRows={MEMBER_CSV_SAMPLES}
        parseRow={parseMemberCsvRow}
        beforeImport={beforeImportMembers}
        importRow={importMemberRow}
      />

      {/* Role breakdown */}
      <div className="flex flex-wrap gap-2 mb-5">
        {Object.entries(roleCounts).map(([role, count]) => (
          <button key={role} onClick={() => setRoleFilter(roleFilter === role ? 'all' : role)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${roleFilter === role ? 'border-primary bg-primary/5 text-primary' : 'border-outline-variant bg-white text-on-surface-variant hover:border-primary/30'}`}>
            {role} ({count})
          </button>
        ))}
      </div>

      {/* Search + filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <input type="text" placeholder="Search by name or email..." value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 input" />
        <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="input sm:w-40">
          {roles.map(r => <option key={r} value={r}>{r === 'all' ? 'All Roles' : r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-16 bg-surface-container-low rounded-[20px]" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow">
          <p className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-3">groups</p>
          <p className="text-on-surface-variant">{search ? 'No members match your search.' : 'No members found.'}</p>
        </div>
      ) : (
        <div className="bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow overflow-hidden">
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-surface-container-low/50 border-b border-outline-variant">
              <tr>
                <th className="text-left px-5 py-3 font-label-md text-label-md text-on-surface-variant">Member</th>
                <th className="text-left px-5 py-3 font-label-md text-label-md text-on-surface-variant">Role</th>
                <th className="text-left px-5 py-3 font-label-md text-label-md text-on-surface-variant">Onboarding</th>
                <th className="text-left px-5 py-3 font-label-md text-label-md text-on-surface-variant">Joined</th>
                <th className="text-right px-5 py-3 font-label-md text-label-md text-on-surface-variant">Actions</th>
                <th className="text-right px-5 py-3 font-label-md text-label-md text-on-surface-variant">Change Role</th>
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
                          aria-label={`Edit ${p?.full_name ?? 'member'}`}
                        >
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold capitalize ${ROLE_COLORS[m.role] ?? 'bg-surface-container-low text-on-surface-variant'}`}>{m.role}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${ONBOARDING_COLORS[m.onboarding_status] ?? 'bg-surface-container-low text-on-surface-variant'}`}>
                        {m.onboarding_status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-on-surface-variant text-xs">
                      {new Date(m.created_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}
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
                          title="Send this member a new event access code by email"
                          className="text-xs text-primary hover:opacity-80 font-medium px-2 py-1 rounded-lg hover:bg-primary/5 transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          {resendingCode === m.user_id ? 'Sending…' : 'Resend Code'}
                        </button>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <select value={m.role} onChange={e => changeRole(m.user_id, e.target.value)} disabled={updatingRole === m.user_id}
                        className="text-xs border border-outline-variant rounded-lg px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary disabled:opacity-50">
                        {['host','organizer','admin','facilitator','staff','attendee','speaker'].map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          <div className="px-5 py-3 border-t border-outline-variant text-xs text-on-surface-variant/70">
            Showing {filtered.length} of {members.length} members
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
    </div>
  );
}
