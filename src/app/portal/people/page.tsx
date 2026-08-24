'use client';

import { useState, useRef } from 'react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { useOrgPeople } from '@/lib/useOrgPeople';
import { useOrgEvents } from '@/lib/useOrgEvents';
import { OrgPeoplePanel, type OrgPersonRow } from '@/components/portal/OrgPeoplePanel';
import { AddPersonModal, ORG_ROLES } from '@/components/portal/AddPersonModal';
import { EditProfileModal } from '@/components/portal/EditProfileModal';
import { CsvImportModal } from '@/components/portal/CsvImportModal';
import { getField, type ColumnSpec, type RowResult } from '@/lib/csvImport';
import { supabase } from '@/lib/supabaseClient';
import { useConfirm } from '@/contexts/ConfirmContext';
import toast from 'react-hot-toast';

type PersonCsvRow = {
  rowIndex: number;
  full_name: string | null;
  email: string;
  org_role: string;
  event_ids: string[];
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const PEOPLE_CSV_COLUMNS: ColumnSpec[] = [
  { key: 'full_name', label: 'Full Name' },
  { key: 'email', label: 'Email', required: true },
  { key: 'org_role', label: `Org Role (${ORG_ROLES.join(', ')})` },
  { key: 'event_slugs', label: 'Event Slugs (comma-separated)' },
];

const PEOPLE_CSV_SAMPLES: Record<string, string>[] = [
  { full_name: 'Jane Smith', email: 'jane@example.com', org_role: 'member', event_slugs: 'stawi-escape-2026' },
  { full_name: 'David Otieno', email: 'david@example.com', org_role: 'attendee', event_slugs: '' },
];

export default function PeoplePage() {
  const { organizationId, loading: orgLoading } = useOrganization();
  const { user } = useAuth();
  const { people, total, elevatedCount, loading, refetch } = useOrgPeople(organizationId, orgLoading);
  const { events } = useOrgEvents(organizationId, orgLoading);
  const confirm = useConfirm();
  const [addOpen, setAddOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [updatingAdminId, setUpdatingAdminId] = useState<string | null>(null);
  const [editingPerson, setEditingPerson] = useState<OrgPersonRow | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Populated once per import by beforeImportPeople, read per-row by importPersonRow.
  const emailToIdRef = useRef<Map<string, string>>(new Map());
  const createErrorsRef = useRef<Map<string, string>>(new Map());

  const filtered = people.filter((p) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (p.fullName ?? '').toLowerCase().includes(q) || (p.email ?? '').toLowerCase().includes(q);
  });

  const handleToggleAdmin = async (userId: string, newRole: 'admin' | 'attendee') => {
    setUpdatingAdminId(userId);
    const { error } = await supabase.from('profiles').update({ global_role: newRole }).eq('id', userId);
    if (error) {
      toast.error('Failed to update portal access');
      console.error(error);
    } else {
      toast.success(newRole === 'admin' ? 'User promoted to Admin' : 'Admin access revoked');
      refetch();
    }
    setUpdatingAdminId(null);
  };

  const handleRemovePerson = async (person: OrgPersonRow) => {
    if (!organizationId) return;
    const ok = await confirm({
      title: 'Remove from organisation?',
      message: `Remove ${person.fullName ?? person.email} from this organisation? This also removes their access to any events in this organisation.`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;

    setRemovingId(person.userId);
    const { error: orgError } = await supabase
      .from('organization_members')
      .delete()
      .eq('organization_id', organizationId)
      .eq('user_id', person.userId);

    if (orgError) {
      toast.error(orgError.message);
      setRemovingId(null);
      return;
    }

    const { error: eventError } = await supabase
      .from('event_members')
      .delete()
      .eq('organization_id', organizationId)
      .eq('user_id', person.userId);

    if (eventError) {
      toast.error(`Removed from organisation, but failed to remove event access: ${eventError.message}`);
    } else {
      toast.success(`${person.fullName ?? person.email} removed from this organisation`);
    }

    setRemovingId(null);
    refetch();
  };

  const parsePersonCsvRow = (raw: Record<string, string>, rowIndex: number): RowResult<PersonCsvRow> => {
    const errors: string[] = [];

    const email = getField(raw, 'email').toLowerCase();
    if (!email) errors.push('email is required');
    else if (!EMAIL_RE.test(email)) errors.push('email is not a valid email address');

    const orgRoleRaw = getField(raw, 'org_role').toLowerCase();
    const orgRole = orgRoleRaw || 'member';
    if (orgRoleRaw && !ORG_ROLES.includes(orgRoleRaw)) {
      errors.push(`org_role must be one of: ${ORG_ROLES.join(', ')}`);
    }

    const eventIds: string[] = [];
    const slugsRaw = getField(raw, 'event_slugs');
    if (slugsRaw) {
      const slugs = slugsRaw.split(',').map((s) => s.trim()).filter(Boolean);
      for (const slug of slugs) {
        const match = events.find((e) => e.slug === slug);
        if (!match) errors.push(`Event slug "${slug}" not found`);
        else eventIds.push(match.id);
      }
    }

    const data: PersonCsvRow = {
      rowIndex,
      full_name: getField(raw, 'full_name') || null,
      email,
      org_role: orgRole,
      event_ids: eventIds,
    };

    return { rowIndex, raw, data: errors.length === 0 ? data : undefined, errors };
  };

  const beforeImportPeople = async (rows: PersonCsvRow[]) => {
    emailToIdRef.current = new Map();
    createErrorsRef.current = new Map();

    const emails = rows.map((r) => r.email);
    const { data: existing, error } = await supabase.from('profiles').select('id,email').in('email', emails);
    if (error) {
      toast.error('Failed to check existing accounts');
      console.error(error);
      return;
    }
    for (const p of existing ?? []) {
      if (p.email) emailToIdRef.current.set(p.email.toLowerCase(), p.id);
    }

    const newRows = rows.filter((r) => !emailToIdRef.current.has(r.email));
    if (newRows.length === 0) return;

    try {
      const res = await fetch('/api/admin/bulk-create-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ users: newRows.map((r) => ({ email: r.email, fullName: r.full_name ?? '' })) }),
      });
      const body = await res.json();
      if (!res.ok) {
        const message = body.error ?? 'Failed to create new accounts';
        for (const r of newRows) createErrorsRef.current.set(r.email, message);
        return;
      }
      for (const result of body.results as Array<{ email: string; id?: string; error?: string }>) {
        const key = result.email.toLowerCase();
        if (result.id) emailToIdRef.current.set(key, result.id);
        else createErrorsRef.current.set(key, result.error ?? 'Failed to create account');
      }
    } catch (err) {
      console.error(err);
      for (const r of newRows) createErrorsRef.current.set(r.email, 'Failed to create account');
    }
  };

  const importPersonRow = async (row: PersonCsvRow) => {
    const userId = emailToIdRef.current.get(row.email);
    if (!userId) {
      return { error: createErrorsRef.current.get(row.email) ?? 'Could not resolve or create this account' };
    }
    if (!organizationId) return { error: 'No organisation selected' };

    const { error: orgError } = await supabase
      .from('organization_members')
      .insert({ organization_id: organizationId, user_id: userId, role: row.org_role });
    if (orgError && orgError.code !== '23505') {
      return { error: orgError.message };
    }

    for (const eventId of row.event_ids) {
      const { error: eventError } = await supabase
        .from('event_members')
        .insert({ event_id: eventId, user_id: userId, organization_id: organizationId, role: 'attendee' });
      if (eventError && eventError.code !== '23505') {
        return { error: `Added to organisation, but failed to add to an event: ${eventError.message}` };
      }
    }

    return {};
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-lg">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface">People</h1>
          <p className="text-body-md font-body-md text-on-surface-variant mt-1">
            {loading ? 'Loading…' : `${total ?? 0} people, ${elevatedCount ?? 0} organisation admins`}
          </p>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button
            onClick={() => setCsvOpen(true)}
            className="border border-outline-variant text-on-surface font-label-md text-label-md px-4 py-2.5 rounded-xl hover:bg-surface-container-low transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">upload_file</span> Import CSV
          </button>
          <button
            onClick={() => setAddOpen(true)}
            className="bg-primary text-white font-label-md text-label-md px-6 py-2.5 rounded-xl hover:opacity-90 active:scale-95 transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">person_add</span> Add Person
          </button>
        </div>
      </div>

      <div className="mb-md max-w-sm">
        <input
          className="input"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <OrgPeoplePanel
        people={filtered}
        loading={loading}
        onAddPerson={() => setAddOpen(true)}
        currentUserId={user?.id}
        onToggleAdmin={handleToggleAdmin}
        updatingAdminId={updatingAdminId}
        organizationId={organizationId}
        events={events.map((e) => ({ id: e.id, name: e.name }))}
        onEditPerson={setEditingPerson}
        onRemovePerson={handleRemovePerson}
        removingId={removingId}
      />

      {organizationId && (
        <AddPersonModal
          open={addOpen}
          organizationId={organizationId}
          onClose={() => setAddOpen(false)}
          onAdded={refetch}
        />
      )}

      <EditProfileModal
        open={editingPerson !== null}
        userId={editingPerson?.userId ?? null}
        initial={{
          full_name: editingPerson?.fullName ?? '',
          email: editingPerson?.email ?? '',
          phone: editingPerson?.phone ?? '',
          job_title: editingPerson?.jobTitle ?? '',
          avatar_url: editingPerson?.avatarUrl ?? '',
          bio: editingPerson?.bio ?? '',
        }}
        onClose={() => setEditingPerson(null)}
        onSaved={refetch}
      />

      {organizationId && (
        <CsvImportModal<PersonCsvRow>
          open={csvOpen}
          onClose={() => setCsvOpen(false)}
          onImported={refetch}
          title="Import People"
          templateFilename="people-template.csv"
          columns={PEOPLE_CSV_COLUMNS}
          sampleRows={PEOPLE_CSV_SAMPLES}
          parseRow={parsePersonCsvRow}
          beforeImport={beforeImportPeople}
          importRow={importPersonRow}
        />
      )}
    </div>
  );
}
