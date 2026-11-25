'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Avatar } from '@/components/portal/Avatar';
import { SectionHeader } from '@/components/portal/SectionHeader';
import { CsvImportModal } from '@/components/portal/CsvImportModal';
import { FormModal } from '@/components/portal/FormModal';
import { useConfirm } from '@/contexts/ConfirmContext';
import toast from 'react-hot-toast';
import { friendlyError } from '@/lib/userFacingError';
import { useLatestRequest } from '@/lib/useLatestRequest';
import {
  EMPTY_SPEAKER_INPUT,
  SPEAKER_CSV_COLUMNS,
  SPEAKER_CSV_SAMPLES,
  SPEAKER_ROLE_LABELS,
  SPEAKER_ROLE_TYPES,
  createSpeaker,
  deleteSpeaker,
  importSpeakerRow,
  listSpeakers,
  matchesSearch,
  nextSpeakerDisplayOrder,
  parseSpeakerCsvRow,
  speakerToInput,
  updateSpeaker,
  validateSpeaker,
  type Speaker,
  type SpeakerCsvRow,
  type SpeakerInput,
} from '@/lib/speakers';

type Facilitator = Speaker;
type FacilitatorForm = SpeakerInput;
const EMPTY_FORM: FacilitatorForm = EMPTY_SPEAKER_INPUT;
const ROLE_TYPES = SPEAKER_ROLE_TYPES;
const ROLE_TYPE_LABELS = SPEAKER_ROLE_LABELS;

/**
 * Feature 031 — the CURRENT Speakers page ("v1"), moved verbatim from
 * `facilitators/page.tsx`. Only its data calls and validation now go through
 * `src/lib/speakers.ts` (the single home for speaker rules); markup and copy are
 * unchanged. Shown in the current layout; the Studio 2.0 layout uses SpeakersPageV2.
 */
export function SpeakersPageV1() {
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
    const { data, error } = await listSpeakers(supabase, eventId, signal);
    if (signal.aborted) return;
    if (error) toast.error('Failed to load speakers');
    else setFacilitators(data ?? []);
    setLoading(false);
  };

  useEffect(() => { if (eventId) fetch(); }, [eventId]);

  const openAdd = () => { setEditing(null); setForm(EMPTY_FORM); setFieldErrors({}); setShowForm(true); };
  const openEdit = (f: Facilitator) => { setEditing(f); setFieldErrors({}); setForm(speakerToInput(f)); setShowForm(true); };

  const set = (field: keyof FacilitatorForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  const handleSave = async () => {
    const errors = validateSpeaker(form);
    setFieldErrors(errors);
    if (errors.full_name || errors.email) return;
    setSaving(true);

    if (editing) {
      const { error } = await updateSpeaker(supabase, editing.id, form);
      // On failure the form stays open with everything the user typed.
      if (error) toast.error(friendlyError(error, 'We couldn’t save this speaker. Check the fields and try again.'));
      else { toast.success('Speaker updated'); setShowForm(false); fetch(); }
    } else {
      const { error } = await createSpeaker(supabase, eventId, form, nextSpeakerDisplayOrder(facilitators));
      if (error) toast.error(friendlyError(error, 'We couldn’t add this speaker. Check the fields and try again.'));
      else { toast.success('Speaker added'); setShowForm(false); fetch(); }
    }
    setSaving(false);
  };

  const handleDelete = async (id: string, name: string | null) => {
    if (!(await confirm({ title: 'Remove speaker?', message: `Remove "${name}" from this event's speakers?`, confirmLabel: 'Remove', destructive: true }))) return;
    const { error } = await deleteSpeaker(supabase, id);
    if (error) toast.error(friendlyError(error));
    else { toast.success('Speaker removed'); fetch(); }
  };

  const importFacilitatorRow = (row: SpeakerCsvRow) =>
    importSpeakerRow(supabase, eventId, row, nextSpeakerDisplayOrder(facilitators) + row.rowIndex);

  const filtered = facilitators.filter(f => matchesSearch(f, search));

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

      <CsvImportModal<SpeakerCsvRow>
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        onImported={fetch}
        title="Import Speakers"
        templateFilename="speakers-template.csv"
        columns={SPEAKER_CSV_COLUMNS}
        sampleRows={SPEAKER_CSV_SAMPLES}
        parseRow={parseSpeakerCsvRow}
        importRow={importFacilitatorRow}
      />
    </div>
  );
}
