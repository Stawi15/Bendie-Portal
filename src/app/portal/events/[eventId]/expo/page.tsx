'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useEvent } from '@/contexts/EventContext';
import { useConfirm } from '@/contexts/ConfirmContext';
import { SectionHeader } from '@/components/portal/SectionHeader';
import { FormModal } from '@/components/portal/FormModal';
import { ImageField } from '@/components/portal/ImageField';
import { TagInput } from '@/components/portal/TagInput';
import { AssetPickerModal } from '@/components/portal/AssetPickerModal';
import { CsvImportModal } from '@/components/portal/CsvImportModal';
import { getField, parseFlexibleBoolean, type ColumnSpec, type RowResult } from '@/lib/csvImport';
import toast from 'react-hot-toast';

/**
 * Feature 016 CSV coverage expansion. This module represents the Expo
 * DIRECTORY of exhibiting/sponsoring organisations (`expo_spaces` —
 * name/summary/contact/is_exhibitor/is_sponsor), NOT Feature 009's Bendie
 * Planner Vendors (`event_vendor_items`, a completely different canonical
 * table and product) — confirmed by inspecting this page's own data model
 * before writing this CSV, per the explicit instruction not to assume
 * Expo === Vendors.
 */
type ExpoCsvRow = {
  name: string; summary: string | null; image_url: string | null; chips: string[]; intro: string | null; offering: string | null;
  contact_name: string | null; contact_email: string | null; contact_phone: string | null; is_exhibitor: boolean; is_sponsor: boolean;
};

const EXPO_CSV_COLUMNS: ColumnSpec[] = [
  { key: 'name', label: 'Name', required: true },
  { key: 'summary', label: 'Summary' },
  { key: 'imageUrl', label: 'Logo / Image URL' },
  { key: 'chips', label: 'Chips (comma-separated)' },
  { key: 'intro', label: 'Intro' },
  { key: 'offering', label: "What They're Offering" },
  { key: 'contactName', label: 'Contact Name' },
  { key: 'contactEmail', label: 'Contact Email' },
  { key: 'contactPhone', label: 'Contact Phone' },
  { key: 'isExhibitor', label: 'Exhibitor (true/false)' },
  { key: 'isSponsor', label: 'Sponsor (true/false)' },
];

const EXPO_CSV_SAMPLES: Record<string, string>[] = [
  {
    name: 'TechCorp Solutions', summary: 'POS devices and merchant loans', imageUrl: '', chips: 'POS devices, Loans',
    intro: 'TechCorp helps merchants accept payments anywhere.', offering: 'Live demos of our latest POS terminal.',
    contactName: 'Amina Yusuf', contactEmail: 'amina@techcorp.com', contactPhone: '+254 700 000000', isExhibitor: 'true', isSponsor: 'false',
  },
  {
    name: 'Coastal Bank', summary: 'Headline event sponsor', imageUrl: '', chips: 'Banking',
    intro: '', offering: '', contactName: '', contactEmail: '', contactPhone: '', isExhibitor: 'false', isSponsor: 'true',
  },
];

function parseExpoCsvRow(raw: Record<string, string>, rowIndex: number): RowResult<ExpoCsvRow> {
  const errors: string[] = [];
  const name = getField(raw, 'name');
  if (!name) errors.push('name is required');

  const exhibitorRaw = parseFlexibleBoolean(getField(raw, 'isExhibitor'));
  if (!exhibitorRaw.ok) errors.push('isExhibitor must be true or false');
  const sponsorRaw = parseFlexibleBoolean(getField(raw, 'isSponsor'));
  if (!sponsorRaw.ok) errors.push('isSponsor must be true or false');

  const chipsRaw = getField(raw, 'chips');
  const chips = chipsRaw ? chipsRaw.split(',').map((c) => c.trim()).filter(Boolean) : [];

  const email = getField(raw, 'contactEmail');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('contactEmail is not a valid email address');

  const data: ExpoCsvRow = {
    name,
    summary: getField(raw, 'summary') || null,
    image_url: getField(raw, 'imageUrl') || null,
    chips,
    intro: getField(raw, 'intro') || null,
    offering: getField(raw, 'offering') || null,
    contact_name: getField(raw, 'contactName') || null,
    contact_email: email || null,
    contact_phone: getField(raw, 'contactPhone') || null,
    // Matches the manual form's own default (is_exhibitor: true) when left blank.
    is_exhibitor: exhibitorRaw.ok ? exhibitorRaw.value ?? true : true,
    is_sponsor: sponsorRaw.ok ? sponsorRaw.value ?? false : false,
  };

  return { rowIndex, raw, data: errors.length === 0 ? data : undefined, errors };
}

type ExpoSpace = {
  id: string;
  event_id: string | null;
  name: string;
  summary: string | null;
  image_url: string | null;
  chips: string[];
  intro: string | null;
  offering: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  is_exhibitor: boolean;
  is_sponsor: boolean;
  display_order: number;
};

type ExpoForm = {
  name: string;
  summary: string;
  image_url: string;
  chips: string[];
  intro: string;
  offering: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  is_exhibitor: boolean;
  is_sponsor: boolean;
  is_global: boolean;
};

// Matches the live column defaults (is_exhibitor: true, is_sponsor: false) —
// schema-reference.md explicitly warns against defaulting both to true, since
// that's exactly what made the original seed data's Exhibitors/Sponsors tabs
// look identical.
const EMPTY_FORM: ExpoForm = {
  name: '', summary: '', image_url: '', chips: [], intro: '', offering: '',
  contact_name: '', contact_email: '', contact_phone: '',
  is_exhibitor: true, is_sponsor: false, is_global: false,
};

export default function ExpoDirectoryPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const { currentEvent } = useEvent();
  const confirm = useConfirm();

  const [spaces, setSpaces] = useState<ExpoSpace[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ExpoSpace | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ExpoForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [csvOpen, setCsvOpen] = useState(false);

  const fetchData = async () => {
    const { data, error } = await supabase
      .from('expo_spaces')
      .select('id,event_id,name,summary,image_url,chips,intro,offering,contact_name,contact_email,contact_phone,is_exhibitor,is_sponsor,display_order')
      .or(`event_id.eq.${eventId},event_id.is.null`)
      .order('display_order');
    if (error) toast.error('Failed to load expo directory');
    else setSpaces(data ?? []);
    setLoading(false);
  };

  useEffect(() => { if (eventId) fetchData(); }, [eventId]);

  const openAdd = () => { setEditing(null); setForm({ ...EMPTY_FORM }); setShowForm(true); };
  const openEdit = (s: ExpoSpace) => {
    setEditing(s);
    setForm({
      name: s.name, summary: s.summary ?? '', image_url: s.image_url ?? '', chips: s.chips ?? [],
      intro: s.intro ?? '', offering: s.offering ?? '',
      contact_name: s.contact_name ?? '', contact_email: s.contact_email ?? '', contact_phone: s.contact_phone ?? '',
      is_exhibitor: s.is_exhibitor, is_sponsor: s.is_sponsor, is_global: s.event_id === null,
    });
    setShowForm(true);
  };

  const handleSave = async (keepOpen = false) => {
    if (!form.name.trim()) { toast.error('Name is required'); return; }
    setSaving(true);

    const payload = {
      name: form.name.trim(),
      summary: form.summary.trim() || null,
      image_url: form.image_url.trim() || null,
      chips: form.chips,
      intro: form.intro.trim() || null,
      offering: form.offering.trim() || null,
      contact_name: form.contact_name.trim() || null,
      contact_email: form.contact_email.trim() || null,
      contact_phone: form.contact_phone.trim() || null,
      is_exhibitor: form.is_exhibitor,
      is_sponsor: form.is_sponsor,
      event_id: form.is_global ? null : eventId,
    };

    // Feature 016 Data Entry UX pass — "Save & Add Another" retains
    // `is_exhibitor`/`is_sponsor` (organisers commonly enter a whole batch of
    // exhibitors, then a whole batch of sponsors, back-to-back) — every
    // identity/contact-specific field always clears.
    const afterSuccess = () => {
      if (keepOpen && !editing) setForm({ ...EMPTY_FORM, is_exhibitor: form.is_exhibitor, is_sponsor: form.is_sponsor });
      else setShowForm(false);
      fetchData();
    };

    if (editing) {
      const { error } = await supabase.from('expo_spaces').update(payload).eq('id', editing.id);
      if (error) toast.error(error.message);
      else { toast.success('Updated'); afterSuccess(); }
    } else {
      const { error } = await supabase.from('expo_spaces').insert({ ...payload, display_order: spaces.length });
      if (error) toast.error(error.message);
      else { toast.success('Added'); afterSuccess(); }
    }
    setSaving(false);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!(await confirm({ message: `Delete "${name}"?`, confirmLabel: 'Delete', destructive: true }))) return;
    const { error } = await supabase.from('expo_spaces').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Deleted'); fetchData(); }
  };

  const filtered = spaces.filter(s => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return s.name.toLowerCase().includes(q) || (s.summary ?? '').toLowerCase().includes(q);
  });

  const importExpoRow = async (row: ExpoCsvRow) => {
    const { error } = await supabase.from('expo_spaces').insert({ ...row, event_id: eventId, display_order: spaces.length });
    return { error: error?.message };
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <SectionHeader sectionKey="expo" desc={`${spaces.length} organisation${spaces.length !== 1 ? 's' : ''} in the directory`} />
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={() => setCsvOpen(true)} className="btn-secondary">
            <span className="material-symbols-outlined text-[18px]">upload_file</span> Import CSV
          </button>
          <button onClick={openAdd} className="btn-primary">
            <span className="material-symbols-outlined text-[18px]">add</span> Add Organisation
          </button>
        </div>
      </div>

      {/* Search */}
      {!loading && spaces.length > 0 && (
        <div className="mb-4 max-w-sm">
          <input type="text" placeholder="Search by name or summary..." value={search} onChange={e => setSearch(e.target.value)} className="input w-full" />
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="animate-pulse space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 bg-surface-container-low rounded-[20px]" />)}</div>
      ) : spaces.length === 0 ? (
        <div className="text-center py-16 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow">
          <p className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-3">storefront</p>
          <p className="text-on-surface-variant">No exhibitors or sponsors yet.</p>
          <p className="text-on-surface-variant/70 text-sm mt-1">Add one manually, paste from a spreadsheet, or import a CSV.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow">
          <p className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-3">search</p>
          <p className="text-on-surface-variant">No organisations match your search.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(s => (
            <div key={s.id} onClick={() => openEdit(s)} className="flex items-center gap-4 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow p-4 hover:border-primary/30 transition cursor-pointer">
              {s.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.image_url} alt={s.name} className="w-14 h-14 rounded-xl object-cover flex-shrink-0" />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-surface-container-low flex items-center justify-center flex-shrink-0">
                  <span className="material-symbols-outlined text-on-surface-variant/50">storefront</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-on-surface truncate">{s.name}</p>
                  {s.event_id === null && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant flex-shrink-0">Global</span>
                  )}
                  {s.is_exhibitor && <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/10 text-primary flex-shrink-0">Exhibitor</span>}
                  {s.is_sponsor && <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-secondary/10 text-secondary flex-shrink-0">Sponsor</span>}
                </div>
                {s.summary && <p className="text-sm text-on-surface-variant truncate mt-0.5">{s.summary}</p>}
                {s.chips.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {s.chips.slice(0, 4).map(chip => (
                      <span key={chip} className="text-[10px] px-1.5 py-0.5 rounded bg-surface-container-low text-on-surface-variant">{chip}</span>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                <button onClick={() => openEdit(s)} className="text-sm text-primary hover:opacity-80 font-medium px-2 py-1 rounded-lg hover:bg-primary/5 transition">Edit</button>
                <button onClick={() => handleDelete(s.id, s.name)} className="text-sm text-error hover:opacity-80 font-medium px-2 py-1 rounded-lg hover:bg-error/5 transition">Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Form modal */}
      <FormModal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Organisation' : 'New Organisation'}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="label">Name *</label>
            <input className="input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="TechCorp Solutions" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Summary</label>
            <input className="input" value={form.summary} onChange={e => setForm(p => ({ ...p, summary: e.target.value }))} placeholder="One-line summary shown on the list card" />
          </div>
          <div className="sm:col-span-2">
            <ImageField
              label="Logo / Image"
              value={form.image_url}
              onChange={(url) => setForm(p => ({ ...p, image_url: url }))}
              onBrowse={currentEvent?.organization_id ? () => setPickerOpen(true) : undefined}
              compact
            />
          </div>
          <div className="sm:col-span-2">
            <label className="label">Chips</label>
            <TagInput value={form.chips} onChange={(chips) => setForm(p => ({ ...p, chips }))} placeholder="POS devices" />
            <p className="hint">Short tags shown on the card, e.g. &quot;POS devices&quot;, &quot;Loans&quot;</p>
          </div>
          <div className="sm:col-span-2">
            <label className="label">Intro</label>
            <textarea className="input h-16 resize-none" value={form.intro} onChange={e => setForm(p => ({ ...p, intro: e.target.value }))} placeholder="Detail-page intro paragraph" data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false" />
          </div>
          <div className="sm:col-span-2">
            <label className="label">What We&apos;re Offering</label>
            <textarea className="input h-16 resize-none" value={form.offering} onChange={e => setForm(p => ({ ...p, offering: e.target.value }))} placeholder="Detail-page offering body" data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false" />
          </div>
          <div>
            <label className="label">Contact Name</label>
            <input className="input" value={form.contact_name} onChange={e => setForm(p => ({ ...p, contact_name: e.target.value }))} placeholder="Team Lead" />
          </div>
          <div>
            <label className="label">Contact Email</label>
            <input type="email" className="input" value={form.contact_email} onChange={e => setForm(p => ({ ...p, contact_email: e.target.value }))} placeholder="team@techcorp.com" />
          </div>
          <div>
            <label className="label">Contact Phone</label>
            <input className="input" value={form.contact_phone} onChange={e => setForm(p => ({ ...p, contact_phone: e.target.value }))} placeholder="+27 11 000 0000" />
            <p className="hint">Powers the in-app &quot;Call Booth&quot; button</p>
          </div>
          <div className="flex items-center gap-6 sm:col-span-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_exhibitor} onChange={e => setForm(p => ({ ...p, is_exhibitor: e.target.checked }))} className="w-4 h-4 accent-primary rounded" />
              <span className="text-sm font-medium text-on-surface">Exhibitor</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_sponsor} onChange={e => setForm(p => ({ ...p, is_sponsor: e.target.checked }))} className="w-4 h-4 accent-primary rounded" />
              <span className="text-sm font-medium text-on-surface">Sponsor</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.is_global} onChange={e => setForm(p => ({ ...p, is_global: e.target.checked }))} className="w-4 h-4 accent-primary rounded" />
              <span className="text-sm font-medium text-on-surface">Apply to all events</span>
            </label>
          </div>
        </div>
        <div className="flex gap-3 mt-4 pt-4 border-t border-outline-variant flex-wrap">
          <button onClick={() => handleSave(false)} disabled={saving} className="btn-primary">{saving ? 'Saving...' : editing ? 'Update' : 'Add Organisation'}</button>
          {!editing && (
            <button onClick={() => handleSave(true)} disabled={saving} className="btn-secondary">
              {saving ? 'Saving...' : 'Save & Add Another'}
            </button>
          )}
          <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
        </div>
      </FormModal>

      {currentEvent?.organization_id && (
        <AssetPickerModal
          open={pickerOpen}
          organizationId={currentEvent.organization_id}
          onClose={() => setPickerOpen(false)}
          onSelect={(url) => setForm(p => ({ ...p, image_url: url }))}
        />
      )}

      <CsvImportModal<ExpoCsvRow>
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        onImported={fetchData}
        title="Import Expo Directory"
        templateFilename="expo-template.csv"
        columns={EXPO_CSV_COLUMNS}
        sampleRows={EXPO_CSV_SAMPLES}
        parseRow={parseExpoCsvRow}
        importRow={importExpoRow}
      />
    </div>
  );
}
