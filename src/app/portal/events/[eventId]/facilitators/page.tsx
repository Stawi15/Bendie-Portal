'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Avatar } from '@/components/portal/Avatar';
import { SectionHeader } from '@/components/portal/SectionHeader';
import { CsvImportModal } from '@/components/portal/CsvImportModal';
import { FormModal } from '@/components/portal/FormModal';
import { getField, type ColumnSpec, type RowResult } from '@/lib/csvImport';
import { useConfirm } from '@/contexts/ConfirmContext';
import toast from 'react-hot-toast';
import { friendlyError } from '@/lib/userFacingError';
import { useLatestRequest } from '@/lib/useLatestRequest';

const ROLE_TYPES = ['speaker', 'presenter'] as const;
const ROLE_TYPE_LABELS: Record<string, string> = { speaker: 'Speaker', presenter: 'Presenter' };

type FacilitatorCsvRow = {
  rowIndex: number;
  full_name: string;
  email: string | null;
  job_title: string | null;
  organization: string | null;
  facilitator_group: string | null;
  role_type: string;
  linkedin_url: string | null;
  expertise: string | null;
  bio: string | null;
  avatar_url: string | null;
};

const FACILITATOR_CSV_COLUMNS: ColumnSpec[] = [
  { key: 'full_name', label: 'Full Name', required: true },
  { key: 'email', label: 'Email' },
  { key: 'job_title', label: 'Job Title' },
  { key: 'organization', label: 'Organisation' },
  // Template header is "speaker_group"; the parser still accepts the old "facilitator_group" header (pre-rename templates).
  { key: 'speaker_group', label: 'Speaker Group' },
  { key: 'role_type', label: 'Role Type (speaker, presenter)' },
  { key: 'linkedin_url', label: 'LinkedIn URL' },
  { key: 'expertise', label: 'Expertise' },
  { key: 'bio', label: 'Bio' },
  { key: 'avatar_url', label: 'Avatar URL' },
];

const FACILITATOR_CSV_SAMPLES: Record<string, string>[] = [
  {
    full_name: 'Jane Smith',
    email: 'jane@example.com',
    job_title: 'Head of Product',
    organization: 'TechCorp',
    speaker_group: 'Keynote Speakers',
    role_type: 'speaker',
    linkedin_url: 'https://linkedin.com/in/janesmith',
    expertise: 'AI, Machine Learning',
    bio: 'Short biography...',
    avatar_url: '',
  },
  {
    full_name: 'David Otieno',
    email: 'david@example.com',
    job_title: 'Workshop Lead',
    organization: 'Bendie',
    speaker_group: 'Breakout Sessions',
    role_type: 'presenter',
    linkedin_url: '',
    expertise: 'Team Building',
    bio: '',
    avatar_url: '',
  },
];

function parseFacilitatorCsvRow(raw: Record<string, string>, rowIndex: number): RowResult<FacilitatorCsvRow> {
  const errors: string[] = [];
  const full_name = getField(raw, 'full_name');
  if (!full_name) errors.push('full_name is required');

  const roleTypeRaw = getField(raw, 'role_type').toLowerCase();
  const role_type = roleTypeRaw || 'speaker';
  if (roleTypeRaw && !ROLE_TYPES.includes(roleTypeRaw as (typeof ROLE_TYPES)[number])) {
    errors.push(`role_type must be one of: ${ROLE_TYPES.join(', ')}`);
  }

  const data: FacilitatorCsvRow = {
    rowIndex,
    full_name,
    email: getField(raw, 'email') || null,
    job_title: getField(raw, 'job_title') || null,
    organization: getField(raw, 'organization') || null,
    facilitator_group: getField(raw, 'speaker_group') || getField(raw, 'facilitator_group') || null,
    role_type,
    linkedin_url: getField(raw, 'linkedin_url') || null,
    expertise: getField(raw, 'expertise') || null,
    bio: getField(raw, 'bio') || null,
    avatar_url: getField(raw, 'avatar_url') || null,
  };

  return { rowIndex, raw, data: errors.length === 0 ? data : undefined, errors };
}

type Facilitator = {
  id: string;
  full_name: string | null;
  email: string | null;
  job_title: string | null;
  organization: string | null;
  bio: string | null;
  avatar_url: string | null;
  facilitator_group: string | null;
  role_type: string;
  linkedin_url: string | null;
  expertise: string | null;
  display_order: number;
  claim_status: string;
};

type FacilitatorForm = Omit<Facilitator, 'id' | 'display_order' | 'claim_status'>;
const EMPTY_FORM: FacilitatorForm = { full_name: '', email: '', job_title: '', organization: '', bio: '', avatar_url: '', facilitator_group: '', role_type: 'speaker', linkedin_url: '', expertise: '' };

export default function FacilitatorsPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const confirm = useConfirm();
  const [facilitators, setFacilitators] = useState<Facilitator[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Facilitator | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FacilitatorForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [csvOpen, setCsvOpen] = useState(false);
  // Feature 016 (reliability pass): field-level validation shown next to the field.
  const [fieldErrors, setFieldErrors] = useState<{ full_name?: string; email?: string }>({});

  // Feature 016 (main-tab performance pass): cancel this load when the user leaves the
  // tab (or reloads it); an aborted load never toasts or writes state.
  const startRequest = useLatestRequest();

  const fetch = async () => {
    const signal = startRequest();
    const { data, error } = await supabase
      .from('facilitators')
      .select('id,full_name,email,job_title,organization,bio,avatar_url,facilitator_group,role_type,linkedin_url,expertise,display_order,claim_status')
      .eq('event_id', eventId)
      .order('display_order')
      .abortSignal(signal);
    if (signal.aborted) return;
    if (error) toast.error('Failed to load speakers');
    else setFacilitators(data ?? []);
    setLoading(false);
  };

  useEffect(() => { if (eventId) fetch(); }, [eventId]);

  const openAdd = () => { setEditing(null); setForm(EMPTY_FORM); setFieldErrors({}); setShowForm(true); };
  const openEdit = (f: Facilitator) => { setEditing(f); setFieldErrors({}); setForm({ full_name: f.full_name ?? '', email: f.email ?? '', job_title: f.job_title ?? '', organization: f.organization ?? '', bio: f.bio ?? '', avatar_url: f.avatar_url ?? '', facilitator_group: f.facilitator_group ?? '', role_type: f.role_type ?? 'speaker', linkedin_url: f.linkedin_url ?? '', expertise: f.expertise ?? '' }); setShowForm(true); };

  const set = (field: keyof FacilitatorForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSave = async () => {
    const errors: { full_name?: string; email?: string } = {};
    if (!form.full_name?.trim()) errors.full_name = 'Enter the speaker’s name.';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Enter a valid email address, for example name@company.com — or leave it empty.';
    setFieldErrors(errors);
    if (errors.full_name || errors.email) return;
    setSaving(true);

    if (editing) {
      const { error } = await supabase.from('facilitators').update({
        full_name: form.full_name, email: form.email || null, job_title: form.job_title || null,
        organization: form.organization || null, bio: form.bio || null,
        avatar_url: form.avatar_url || null, facilitator_group: form.facilitator_group || null,
        role_type: form.role_type || 'speaker', linkedin_url: form.linkedin_url || null,
        expertise: form.expertise || null,
      }).eq('id', editing.id);
      // On failure the form stays open with everything the user typed.
      if (error) toast.error(friendlyError(error, 'We couldn’t save this speaker. Check the fields and try again.'));
      else { toast.success('Speaker updated'); setShowForm(false); fetch(); }
    } else {
      const { error } = await supabase.from('facilitators').insert({
        event_id: eventId, full_name: form.full_name, email: form.email || null,
        job_title: form.job_title || null, organization: form.organization || null,
        bio: form.bio || null, avatar_url: form.avatar_url || null,
        facilitator_group: form.facilitator_group || null,
        role_type: form.role_type || 'speaker', linkedin_url: form.linkedin_url || null,
        expertise: form.expertise || null,
        display_order: facilitators.length,
      });
      if (error) toast.error(friendlyError(error, 'We couldn’t add this speaker. Check the fields and try again.'));
      else { toast.success('Speaker added'); setShowForm(false); fetch(); }
    }
    setSaving(false);
  };

  const handleDelete = async (id: string, name: string | null) => {
    if (!(await confirm({ title: 'Remove speaker?', message: `Remove "${name}" from this event's speakers?`, confirmLabel: 'Remove', destructive: true }))) return;
    const { error } = await supabase.from('facilitators').delete().eq('id', id);
    if (error) toast.error(friendlyError(error));
    else { toast.success('Speaker removed'); fetch(); }
  };

  const importFacilitatorRow = async (row: FacilitatorCsvRow) => {
    const { rowIndex, ...rest } = row;
    const { error } = await supabase.from('facilitators').insert({
      event_id: eventId,
      ...rest,
      display_order: facilitators.length + rowIndex,
    });
    return { error: error?.message };
  };

  const filtered = facilitators.filter(f => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      (f.full_name ?? '').toLowerCase().includes(q) ||
      (f.email ?? '').toLowerCase().includes(q) ||
      (f.job_title ?? '').toLowerCase().includes(q) ||
      (f.organization ?? '').toLowerCase().includes(q) ||
      (f.facilitator_group ?? '').toLowerCase().includes(q) ||
      (f.expertise ?? '').toLowerCase().includes(q)
    );
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <SectionHeader
          sectionKey="facilitators"
          desc={`${facilitators.length} speaker${facilitators.length !== 1 ? 's' : ''} for this event`}
        />
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={() => setCsvOpen(true)} className="btn-secondary">
            <span className="material-symbols-outlined text-[18px]">upload_file</span> Import spreadsheet
          </button>
          <button onClick={openAdd} className="btn-primary">
            <span className="material-symbols-outlined text-[18px]">add</span> Add Speaker
          </button>
        </div>
      </div>

      {/* Form modal */}
      <FormModal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Speaker' : 'New Speaker'}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Full Name *</label>
              <input
                className={`input ${fieldErrors.full_name ? 'border-error' : ''}`}
                value={form.full_name ?? ''}
                onChange={(e) => { set('full_name')(e); if (fieldErrors.full_name) setFieldErrors((p) => ({ ...p, full_name: undefined })); }}
                placeholder="Jane Smith"
                aria-invalid={!!fieldErrors.full_name}
                aria-describedby={fieldErrors.full_name ? 'speaker-name-error' : undefined}
              />
              {fieldErrors.full_name && <p id="speaker-name-error" className="text-xs text-error mt-1">{fieldErrors.full_name}</p>}
            </div>
            <div>
              <label className="label">Email</label>
              <input
                className={`input ${fieldErrors.email ? 'border-error' : ''}`}
                type="email"
                value={form.email ?? ''}
                onChange={(e) => { set('email')(e); if (fieldErrors.email) setFieldErrors((p) => ({ ...p, email: undefined })); }}
                placeholder="jane@example.com"
                aria-invalid={!!fieldErrors.email}
                aria-describedby={fieldErrors.email ? 'speaker-email-error' : undefined}
              />
              {fieldErrors.email && <p id="speaker-email-error" className="text-xs text-error mt-1">{fieldErrors.email}</p>}
            </div>
            <div>
              <label className="label">Job Title</label>
              <input className="input" value={form.job_title ?? ''} onChange={set('job_title')} placeholder="Head of Product" />
            </div>
            <div>
              <label className="label">Organisation</label>
              <input className="input" value={form.organization ?? ''} onChange={set('organization')} placeholder="TechCorp" />
            </div>
            <div>
              <label className="label">Speaker Group</label>
              <input className="input" value={form.facilitator_group ?? ''} onChange={set('facilitator_group')} placeholder="Keynote Speakers" />
            </div>
            <div>
              <label className="label">Role Type</label>
              <select className="input" value={form.role_type ?? 'speaker'} onChange={set('role_type')}>
                {ROLE_TYPES.map(t => <option key={t} value={t}>{ROLE_TYPE_LABELS[t]}</option>)}
              </select>
              <p className="hint">Drives the Speakers vs. Presenters tabs in-app</p>
            </div>
            <div>
              <label className="label">LinkedIn URL</label>
              <input className="input" type="url" value={form.linkedin_url ?? ''} onChange={set('linkedin_url')} placeholder="https://linkedin.com/in/..." />
            </div>
            <div>
              <label className="label">Expertise</label>
              <input className="input" value={form.expertise ?? ''} onChange={set('expertise')} placeholder="AI, Machine Learning" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Bio</label>
              <textarea className="input h-20 resize-none" value={form.bio ?? ''} onChange={set('bio')} placeholder="Short biography..." data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Avatar URL</label>
              <input className="input" value={form.avatar_url ?? ''} onChange={set('avatar_url')} placeholder="https://..." />
              {form.avatar_url && (
                <div className="mt-2">
                  <Avatar name={form.full_name} avatarUrl={form.avatar_url} size={48} />
                </div>
              )}
            </div>
          </div>
          <div className="flex gap-3 mt-4 pt-4 border-t border-outline-variant">
            <button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? 'Saving...' : (editing ? 'Update' : 'Add Speaker')}</button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
      </FormModal>

      {/* Search */}
      {!loading && facilitators.length > 0 && (
        <div className="mb-4 max-w-sm">
          <input
            type="text"
            placeholder="Search by name, email, title, org..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input w-full"
          />
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="animate-pulse space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-surface-container-low rounded-[20px]" />)}</div>
      ) : facilitators.length === 0 ? (
        <div className="text-center py-10 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow">
          <p className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-3">mic</p>
          <p className="font-medium text-on-surface">No speakers yet</p>
          <p className="text-sm text-on-surface-variant mt-1 max-w-md mx-auto px-4">
            Add the people presenting at your event. They appear in the attendee app and can be assigned to agenda sessions.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            <button onClick={openAdd} className="btn-primary">
              <span className="material-symbols-outlined text-[18px]">add</span> Add Speaker
            </button>
            <button onClick={() => setCsvOpen(true)} className="btn-secondary">
              <span className="material-symbols-outlined text-[18px]">upload_file</span> Import spreadsheet
            </button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow">
          <p className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-3">search</p>
          <p className="text-on-surface-variant">No speakers match your search.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((f) => (
            <div key={f.id} className="flex items-center gap-3 bg-white border border-[#E4EAF0] rounded-2xl panel-shadow px-4 py-2.5 hover:border-primary/30 transition">
              <Avatar name={f.full_name} avatarUrl={f.avatar_url} size={40} />
              <div className="flex-1 min-w-0 leading-tight">
                <p className="font-semibold text-sm text-on-surface truncate">{f.full_name ?? 'Unnamed'}</p>
                {f.job_title && <p className="text-xs text-on-surface-variant truncate">{f.job_title}{f.organization ? ` · ${f.organization}` : ''}</p>}
                {f.facilitator_group && <p className="text-[11px] text-on-surface-variant/70 truncate">{f.facilitator_group}</p>}
              </div>
              <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                <span className={`hidden sm:inline text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${f.claim_status === 'claimed' ? 'bg-green-100 text-green-700' : 'bg-surface-container-low text-on-surface-variant'}`} title="Whether this speaker has claimed their profile in the attendee app">
                  {f.claim_status === 'claimed' ? 'Profile claimed' : 'Not claimed'}
                </span>
                <button onClick={() => openEdit(f)} title="Edit" className="text-sm text-primary hover:opacity-80 font-medium px-2 py-1 rounded-lg hover:bg-primary/5 transition">
                  <span className="hidden sm:inline">Edit</span>
                  <span className="material-symbols-outlined text-[16px] sm:hidden">edit</span>
                </button>
                <button onClick={() => handleDelete(f.id, f.full_name)} title="Delete" className="text-sm text-error hover:opacity-80 font-medium px-2 py-1 rounded-lg hover:bg-error/5 transition">
                  <span className="hidden sm:inline">Delete</span>
                  <span className="material-symbols-outlined text-[16px] sm:hidden">delete</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <CsvImportModal<FacilitatorCsvRow>
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        onImported={fetch}
        title="Import Speakers"
        templateFilename="speakers-template.csv"
        columns={FACILITATOR_CSV_COLUMNS}
        sampleRows={FACILITATOR_CSV_SAMPLES}
        parseRow={parseFacilitatorCsvRow}
        importRow={importFacilitatorRow}
      />
    </div>
  );
}
