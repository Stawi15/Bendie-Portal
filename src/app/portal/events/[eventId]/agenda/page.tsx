'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Avatar } from '@/components/portal/Avatar';
import { CsvImportModal } from '@/components/portal/CsvImportModal';
import { FormModal } from '@/components/portal/FormModal';
import { getField, parseFlexibleDate, type ColumnSpec, type RowResult } from '@/lib/csvImport';
import { moveItem } from '@/lib/reorder';
import { useConfirm } from '@/contexts/ConfirmContext';
import toast from 'react-hot-toast';

type Session = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  location: string | null;
  block_type: string | null;
  audience: string;
  facilitator_id: string | null;
  accent_color: string | null;
  display_order: number;
  breakout_rooms: unknown;
};

type Facilitator = { id: string; full_name: string | null; email: string | null };

type SessionForm = {
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  location: string;
  block_type: string;
  audience: string;
  accent_color: string;
};

const EMPTY_FORM: SessionForm = {
  title: '', description: '', starts_at: '', ends_at: '',
  location: '', block_type: 'session', audience: 'everyone',
  accent_color: '',
};

const BLOCK_TYPES = ['session', 'activity', 'meal', 'transfer', 'freetime', 'ceremony', 'break'];

// ─── Multi-speaker assignment (agenda_session_speakers) ────────────────────

const SPEAKER_TYPES = ['speaker', 'panelist', 'moderator', 'facilitator', 'host'] as const;
const SPEAKER_TYPE_LABELS: Record<string, string> = {
  speaker: 'Speaker', panelist: 'Panelist', moderator: 'Moderator', facilitator: 'Facilitator', host: 'Host',
};

type SessionSpeaker = {
  key: string; // stable React key — equals dbId when loaded from DB, a generated id when newly added
  dbId: string | null; // agenda_session_speakers.id — null until this row has been saved
  facilitator_id: string;
  speaker_type: string;
};

// ─── Breakout rooms (agenda_sessions.breakout_rooms jsonb) ─────────────────

type BreakoutAgendaItem = {
  id: string;
  title: string;
  description: string;
  starts_at: string; // datetime-local string while in form state, ISO when persisted
  ends_at: string;
  location: string;
};

type BreakoutRoom = {
  id: string;
  name: string;
  description: string;
  facilitator_name: string;
  agenda: BreakoutAgendaItem[];
};

function parseBreakoutRooms(raw: unknown): BreakoutRoom[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((r) => ({
    id: r?.id ?? crypto.randomUUID(),
    name: r?.name ?? '',
    description: r?.description ?? '',
    facilitator_name: r?.facilitator_name ?? '',
    agenda: Array.isArray(r?.agenda)
      ? r.agenda.map((a: Partial<BreakoutAgendaItem>) => ({
          id: a?.id ?? crypto.randomUUID(),
          title: a?.title ?? '',
          description: a?.description ?? '',
          starts_at: toLocal(a?.starts_at || null),
          ends_at: toLocal(a?.ends_at || null),
          location: a?.location ?? '',
        }))
      : [],
  }));
}

function serializeBreakoutRooms(rooms: BreakoutRoom[]): BreakoutRoom[] {
  return rooms.map((r) => ({
    ...r,
    agenda: r.agenda.map((a) => ({
      ...a,
      starts_at: a.starts_at ? new Date(a.starts_at).toISOString() : '',
      ends_at: a.ends_at ? new Date(a.ends_at).toISOString() : '',
    })),
  }));
}

type AgendaCsvRow = {
  rowIndex: number;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  location: string | null;
  block_type: string;
  audience: string;
  facilitator_id: string | null;
  facilitator_ids: string[];
  accent_color: string | null;
};

const AGENDA_CSV_COLUMNS: ColumnSpec[] = [
  { key: 'title', label: 'Title', required: true },
  { key: 'starts_at', label: 'Start (YYYY-MM-DD HH:mm)', required: true },
  { key: 'ends_at', label: 'End (YYYY-MM-DD HH:mm)', required: true },
  { key: 'location', label: 'Location' },
  { key: 'block_type', label: 'Block Type' },
  { key: 'audience', label: 'Audience' },
  { key: 'facilitator', label: 'Facilitator(s) (name or email; semicolon-separated for multiple)' },
  { key: 'accent_color', label: 'Accent Color' },
  { key: 'description', label: 'Description' },
];

const AGENDA_CSV_SAMPLES: Record<string, string>[] = [
  {
    title: 'Opening Keynote',
    starts_at: '2026-09-01 09:00',
    ends_at: '2026-09-01 10:00',
    location: 'Main Hall',
    block_type: 'session',
    audience: 'everyone',
    facilitator: 'Jane Smith; John Doe',
    accent_color: '#3B82F6',
    description: 'Welcome address and event overview.',
  },
  {
    title: 'Lunch Break',
    starts_at: '2026-09-01 12:30',
    ends_at: '2026-09-01 13:30',
    location: 'Dining Tent',
    block_type: 'meal',
    audience: 'everyone',
    facilitator: '',
    accent_color: '',
    description: '',
  },
];

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function toLocal(iso: string | null) {
  if (!iso) return '';
  return new Date(iso).toISOString().slice(0, 16);
}

function dateKeyOf(iso: string) {
  return new Date(iso).toISOString().slice(0, 10);
}

function formatDateLabel(iso: string) {
  return new Date(iso).toLocaleDateString('en-ZA', { weekday: 'short', day: '2-digit', month: 'short' });
}

function formatTimeOnly(iso: string) {
  return new Date(iso).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
}

const BLOCK_COLOR: Record<string, string> = {
  session: 'bg-primary/10 text-primary',
  activity: 'bg-green-100 text-green-700',
  meal: 'bg-orange-100 text-orange-700',
  transfer: 'bg-surface-container-low text-on-surface-variant',
  freetime: 'bg-purple-100 text-purple-700',
  ceremony: 'bg-secondary/10 text-secondary',
  break: 'bg-surface-container-low text-on-surface-variant',
};

const BLOCK_ACCENT: Record<string, string> = {
  session: '#3B82F6',
  activity: '#16A34A',
  meal: '#EA580C',
  transfer: '#94A3B8',
  freetime: '#9333EA',
  ceremony: '#0D9488',
  break: '#94A3B8',
};

export default function AgendaPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const confirm = useConfirm();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [facilitators, setFacilitators] = useState<Facilitator[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Session | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<SessionForm>(EMPTY_FORM);
  const [speakers, setSpeakers] = useState<SessionSpeaker[]>([]);
  const [originalSpeakerIds, setOriginalSpeakerIds] = useState<Set<string>>(new Set());
  const [breakoutRooms, setBreakoutRooms] = useState<BreakoutRoom[]>([]);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [csvOpen, setCsvOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const fetchData = async () => {
    const [sessRes, facRes] = await Promise.all([
      supabase.from('agenda_sessions').select('id,title,description,starts_at,ends_at,location,block_type,audience,facilitator_id,accent_color,display_order,breakout_rooms').eq('event_id', eventId).order('starts_at'),
      supabase.from('facilitators').select('id,full_name,email').eq('event_id', eventId).order('display_order'),
    ]);
    if (sessRes.error) toast.error('Failed to load agenda');
    else setSessions(sessRes.data ?? []);
    setFacilitators(facRes.data ?? []);
    setLoading(false);
  };

  useEffect(() => { if (eventId) fetchData(); }, [eventId]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSpeakers([]);
    setOriginalSpeakerIds(new Set());
    setBreakoutRooms([]);
    setShowForm(true);
  };

  const openEdit = async (s: Session) => {
    setEditing(s);
    setForm({
      title: s.title, description: s.description ?? '', starts_at: toLocal(s.starts_at),
      ends_at: toLocal(s.ends_at), location: s.location ?? '',
      block_type: s.block_type ?? 'session', audience: s.audience,
      accent_color: s.accent_color ?? '',
    });
    setBreakoutRooms(parseBreakoutRooms(s.breakout_rooms));
    setSpeakers([]);
    setOriginalSpeakerIds(new Set());
    setShowForm(true);

    const { data, error } = await supabase
      .from('agenda_session_speakers')
      .select('id,facilitator_id,speaker_type,display_order')
      .eq('session_id', s.id)
      .order('display_order');
    if (error) { toast.error('Failed to load speakers'); return; }
    const loaded: SessionSpeaker[] = (data ?? []).map((row) => ({
      key: row.id, dbId: row.id, facilitator_id: row.facilitator_id, speaker_type: row.speaker_type,
    }));
    setSpeakers(loaded);
    setOriginalSpeakerIds(new Set(loaded.map((l) => l.dbId as string)));
  };

  const set = (field: keyof SessionForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(prev => ({ ...prev, [field]: e.target.value }));

  // Speaker handlers
  const handleAddSpeaker = (facilitatorId: string, speakerType: string) =>
    setSpeakers(prev => [...prev, { key: crypto.randomUUID(), dbId: null, facilitator_id: facilitatorId, speaker_type: speakerType }]);
  const handleRemoveSpeaker = (key: string) => setSpeakers(prev => prev.filter(s => s.key !== key));
  const handleMoveSpeaker = (key: string, direction: 'up' | 'down') =>
    setSpeakers(prev => moveItem(prev, prev.findIndex(s => s.key === key), direction));
  const handleChangeSpeakerType = (key: string, speakerType: string) =>
    setSpeakers(prev => prev.map(s => (s.key === key ? { ...s, speaker_type: speakerType } : s)));

  // Breakout room handlers
  const handleAddRoom = () =>
    setBreakoutRooms(prev => [...prev, { id: crypto.randomUUID(), name: '', description: '', facilitator_name: '', agenda: [] }]);
  const handleRemoveRoom = (roomId: string) => setBreakoutRooms(prev => prev.filter(r => r.id !== roomId));
  const handleMoveRoom = (roomId: string, direction: 'up' | 'down') =>
    setBreakoutRooms(prev => moveItem(prev, prev.findIndex(r => r.id === roomId), direction));
  const handleChangeRoomField = (roomId: string, field: 'name' | 'description' | 'facilitator_name', value: string) =>
    setBreakoutRooms(prev => prev.map(r => (r.id === roomId ? { ...r, [field]: value } : r)));
  const handleAddAgendaItem = (roomId: string) =>
    setBreakoutRooms(prev => prev.map(r => (r.id === roomId
      ? { ...r, agenda: [...r.agenda, { id: crypto.randomUUID(), title: '', description: '', starts_at: '', ends_at: '', location: '' }] }
      : r)));
  const handleRemoveAgendaItem = (roomId: string, itemId: string) =>
    setBreakoutRooms(prev => prev.map(r => (r.id === roomId ? { ...r, agenda: r.agenda.filter(a => a.id !== itemId) } : r)));
  const handleMoveAgendaItem = (roomId: string, itemId: string, direction: 'up' | 'down') =>
    setBreakoutRooms(prev => prev.map(r => (r.id === roomId
      ? { ...r, agenda: moveItem(r.agenda, r.agenda.findIndex(a => a.id === itemId), direction) }
      : r)));
  const handleChangeAgendaItemField = (roomId: string, itemId: string, field: keyof BreakoutAgendaItem, value: string) =>
    setBreakoutRooms(prev => prev.map(r => (r.id === roomId
      ? { ...r, agenda: r.agenda.map(a => (a.id === itemId ? { ...a, [field]: value } : a)) }
      : r)));

  const handleSave = async () => {
    if (!form.title) { toast.error('Title is required'); return; }
    if (!form.starts_at || !form.ends_at) { toast.error('Start and end time are required'); return; }
    for (const room of breakoutRooms) {
      if (!room.name.trim()) { toast.error('Every breakout room needs a name'); return; }
      for (const item of room.agenda) {
        if (!item.title.trim()) { toast.error(`Every time block in "${room.name}" needs a title`); return; }
      }
    }

    setSaving(true);

    const payload = {
      title: form.title,
      description: form.description || null,
      starts_at: new Date(form.starts_at).toISOString(),
      ends_at: new Date(form.ends_at).toISOString(),
      location: form.location || null,
      block_type: form.block_type || null,
      audience: form.audience || 'everyone',
      facilitator_id: speakers[0]?.facilitator_id ?? null,
      accent_color: form.accent_color || null,
      breakout_rooms: breakoutRooms.length > 0 ? serializeBreakoutRooms(breakoutRooms) : null,
    };

    let sessionId: string | null = editing?.id ?? null;

    if (editing) {
      const { error } = await supabase.from('agenda_sessions').update(payload).eq('id', editing.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
    } else {
      const { data, error } = await supabase.from('agenda_sessions').insert({
        ...payload, event_id: eventId, display_order: sessions.length,
      }).select().single();
      if (error) { toast.error(error.message); setSaving(false); return; }
      sessionId = data.id;
    }

    if (sessionId) {
      const toDelete = [...originalSpeakerIds].filter(id => !speakers.some(s => s.dbId === id));
      if (toDelete.length > 0) {
        const { error } = await supabase.from('agenda_session_speakers').delete().in('id', toDelete);
        if (error) toast.error(`Failed to remove some speakers: ${error.message}`);
      }
      for (let i = 0; i < speakers.length; i++) {
        const sp = speakers[i];
        if (sp.dbId) {
          const { error } = await supabase.from('agenda_session_speakers')
            .update({ speaker_type: sp.speaker_type, display_order: i }).eq('id', sp.dbId);
          if (error) toast.error(`Failed to update a speaker: ${error.message}`);
        } else {
          const { error } = await supabase.from('agenda_session_speakers').insert({
            session_id: sessionId, facilitator_id: sp.facilitator_id, speaker_type: sp.speaker_type, display_order: i,
          });
          if (error) toast.error(`Failed to add a speaker: ${error.message}`);
        }
      }
    }

    toast.success(editing ? 'Session updated' : 'Session added');
    setShowForm(false);
    fetchData();
    setSaving(false);
  };

  const handleDelete = async (id: string, title: string) => {
    if (!(await confirm({ message: `Delete "${title}"?`, confirmLabel: 'Delete', destructive: true }))) return;
    const { error } = await supabase.from('agenda_sessions').delete().eq('id', id);
    if (error) toast.error(error.message);
    else { toast.success('Deleted'); fetchData(); }
  };

  const parseAgendaCsvRow = (raw: Record<string, string>, rowIndex: number): RowResult<AgendaCsvRow> => {
    const errors: string[] = [];

    const title = getField(raw, 'title');
    if (!title) errors.push('title is required');

    const startsAtRaw = getField(raw, 'starts_at');
    const endsAtRaw = getField(raw, 'ends_at');
    const startsAt = parseFlexibleDate(startsAtRaw);
    const endsAt = parseFlexibleDate(endsAtRaw);
    if (!startsAt) errors.push('starts_at is not a valid date/time');
    if (!endsAt) errors.push('ends_at is not a valid date/time');
    if (startsAt && endsAt && endsAt.getTime() <= startsAt.getTime()) errors.push('ends_at must be after starts_at');

    const blockTypeRaw = getField(raw, 'block_type').toLowerCase();
    const blockType = blockTypeRaw || 'session';
    if (blockTypeRaw && !BLOCK_TYPES.includes(blockTypeRaw)) {
      errors.push(`block_type must be one of: ${BLOCK_TYPES.join(', ')}`);
    }

    const accentColor = getField(raw, 'accent_color');
    if (accentColor && !HEX_COLOR_RE.test(accentColor)) {
      errors.push('accent_color must be a hex color like #3B82F6');
    }

    const facilitatorIds: string[] = [];
    const facilitatorRaw = getField(raw, 'facilitator');
    if (facilitatorRaw) {
      const names = facilitatorRaw.split(';').map((n) => n.trim()).filter(Boolean);
      for (const name of names) {
        const match = facilitators.find(
          (f) =>
            (f.full_name ?? '').toLowerCase() === name.toLowerCase() ||
            (f.email ?? '').toLowerCase() === name.toLowerCase()
        );
        if (!match) errors.push(`Facilitator "${name}" not found — add them first`);
        else if (!facilitatorIds.includes(match.id)) facilitatorIds.push(match.id);
      }
    }

    const data: AgendaCsvRow = {
      rowIndex,
      title,
      description: getField(raw, 'description') || null,
      starts_at: startsAt?.toISOString() ?? '',
      ends_at: endsAt?.toISOString() ?? '',
      location: getField(raw, 'location') || null,
      block_type: blockType,
      audience: getField(raw, 'audience') || 'everyone',
      facilitator_id: facilitatorIds[0] ?? null,
      facilitator_ids: facilitatorIds,
      accent_color: accentColor || null,
    };

    return { rowIndex, raw, data: errors.length === 0 ? data : undefined, errors };
  };

  const importAgendaRow = async (row: AgendaCsvRow) => {
    const { rowIndex, facilitator_ids, ...rest } = row;
    const { data, error } = await supabase.from('agenda_sessions').insert({
      event_id: eventId,
      ...rest,
      display_order: sessions.length + rowIndex,
    }).select('id').single();
    if (error) return { error: error.message };

    if (facilitator_ids.length > 0) {
      const { error: speakerError } = await supabase.from('agenda_session_speakers').insert(
        facilitator_ids.map((facilitatorId, i) => ({
          session_id: data.id, facilitator_id: facilitatorId, speaker_type: 'speaker', display_order: i,
        }))
      );
      if (speakerError) return { error: `Session imported but speaker link failed: ${speakerError.message}` };
    }

    return { error: undefined };
  };

  const searched = sessions.filter(s => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    const fac = facilitators.find(f => f.id === s.facilitator_id);
    return (
      s.title.toLowerCase().includes(q) ||
      (s.description ?? '').toLowerCase().includes(q) ||
      (s.location ?? '').toLowerCase().includes(q) ||
      (fac?.full_name ?? '').toLowerCase().includes(q)
    );
  });

  const dateGroups = (() => {
    const map = new Map<string, { count: number; sample: string }>();
    for (const s of searched) {
      const key = dateKeyOf(s.starts_at);
      const entry = map.get(key);
      if (entry) entry.count += 1;
      else map.set(key, { count: 1, sample: s.starts_at });
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, { count, sample }]) => ({ key, count, label: formatDateLabel(sample) }));
  })();

  const effectiveDate = selectedDate ?? dateGroups[0]?.key ?? null;
  const filtered = effectiveDate ? searched.filter(s => dateKeyOf(s.starts_at) === effectiveDate) : searched;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="font-headline-md text-headline-md text-on-surface">Agenda</h1>
          <span className="px-2.5 py-1 rounded-full bg-surface-container-low text-on-surface-variant text-xs font-semibold whitespace-nowrap">
            {sessions.length} session{sessions.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={() => setCsvOpen(true)} className="btn-secondary">
            <span className="material-symbols-outlined text-[18px]">upload_file</span> Import CSV
          </button>
          <button onClick={openAdd} className="btn-primary">
            <span className="material-symbols-outlined text-[18px]">add</span> Add Session
          </button>
        </div>
      </div>

      {/* Form modal */}
      <FormModal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Session' : 'New Session'}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="label">Session Title *</label>
              <input className="input" value={form.title} onChange={set('title')} placeholder="Opening Keynote" />
            </div>
            <div>
              <label className="label">Start *</label>
              <input type="datetime-local" className="input" value={form.starts_at} onChange={set('starts_at')} />
            </div>
            <div>
              <label className="label">End *</label>
              <input type="datetime-local" className="input" value={form.ends_at} onChange={set('ends_at')} />
            </div>
            <div>
              <label className="label">Block Type</label>
              <select className="input" value={form.block_type} onChange={set('block_type')}>
                {BLOCK_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Audience</label>
              <input className="input" value={form.audience} onChange={set('audience')} placeholder="everyone" />
            </div>
            <div>
              <label className="label">Location</label>
              <input className="input" value={form.location} onChange={set('location')} placeholder="Main Hall" />
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="label">Accent Color</label>
                <input className="input font-mono" value={form.accent_color} onChange={set('accent_color')} placeholder="#3B82F6" />
              </div>
              <input type="color" value={form.accent_color || '#3B82F6'} onChange={e => setForm(p => ({ ...p, accent_color: e.target.value }))}
                className="mt-5 w-10 h-10 rounded-lg cursor-pointer border border-outline-variant p-0.5" />
            </div>
            <div className="sm:col-span-2">
              <label className="label">Description</label>
              <textarea className="input h-20 resize-none" value={form.description} onChange={set('description')} placeholder="Session description..." data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false" />
            </div>
          </div>

          <SpeakersPanel
            facilitators={facilitators}
            speakers={speakers}
            onAdd={handleAddSpeaker}
            onRemove={handleRemoveSpeaker}
            onMove={handleMoveSpeaker}
            onChangeType={handleChangeSpeakerType}
          />

          <BreakoutRoomsPanel
            rooms={breakoutRooms}
            onAddRoom={handleAddRoom}
            onRemoveRoom={handleRemoveRoom}
            onMoveRoom={handleMoveRoom}
            onChangeRoomField={handleChangeRoomField}
            onAddAgendaItem={handleAddAgendaItem}
            onRemoveAgendaItem={handleRemoveAgendaItem}
            onMoveAgendaItem={handleMoveAgendaItem}
            onChangeAgendaItemField={handleChangeAgendaItemField}
          />

          <div className="flex gap-3 mt-4 pt-4 border-t border-outline-variant">
            <button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? 'Saving...' : editing ? 'Update' : 'Add Session'}</button>
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
      </FormModal>

      {loading ? (
        <div className="animate-pulse space-y-3">{[1, 2, 3].map(i => <div key={i} className="h-20 bg-surface-container-low rounded-[20px]" />)}</div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-16 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow">
          <p className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-3">calendar_month</p>
          <p className="text-on-surface-variant">No sessions yet. Add the first agenda item.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-5">
          {/* Dates sidebar */}
          <div className="bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow p-4 lg:self-start">
            <h3 className="font-semibold text-on-surface mb-3">Dates</h3>
            <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible">
              {dateGroups.map(d => {
                const active = d.key === effectiveDate;
                return (
                  <button
                    key={d.key}
                    onClick={() => setSelectedDate(d.key)}
                    className={`flex-shrink-0 flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition ${
                      active
                        ? 'bg-primary/10 text-primary border border-primary/30'
                        : 'text-on-surface-variant border border-transparent hover:bg-surface-container-low'
                    }`}
                  >
                    <span>{d.label}</span>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${active ? 'bg-primary text-white' : 'bg-surface-container-low text-on-surface-variant'}`}>
                      {d.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Sessions for the selected date */}
          <div>
            <div className="mb-4 max-w-sm">
              <input
                type="text"
                placeholder="Search by title, location, speaker..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="input w-full"
              />
            </div>

            {filtered.length === 0 ? (
              <div className="text-center py-16 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow">
                <p className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-3">search</p>
                <p className="text-on-surface-variant">No sessions match your search.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map(s => {
                  const fac = facilitators.find(f => f.id === s.facilitator_id);
                  const accent = s.accent_color || (s.block_type ? BLOCK_ACCENT[s.block_type] : undefined) || '#3B82F6';
                  const roomCount = parseBreakoutRooms(s.breakout_rooms).length;
                  return (
                    <div
                      key={s.id}
                      className="bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow p-5 hover:border-primary/30 transition"
                      style={{ borderLeftColor: accent, borderLeftWidth: 4 }}
                      onClick={() => openEdit(s)}
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                            {s.block_type && (
                              <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${BLOCK_COLOR[s.block_type] ?? 'bg-surface-container-low text-on-surface-variant'}`}>
                                {s.block_type}
                              </span>
                            )}
                            {roomCount > 0 && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-purple-100 text-purple-700">
                                <span className="material-symbols-outlined text-[12px]">meeting_room</span> {roomCount} room{roomCount !== 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                          <p className="font-bold text-lg text-on-surface">{s.title}</p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={(e) => { e.stopPropagation(); openEdit(s); }} className="p-1.5 rounded-lg text-on-surface-variant hover:text-primary hover:bg-primary/5 transition-colors" aria-label={`Edit ${s.title}`}>
                            <span className="material-symbols-outlined text-[18px]">edit</span>
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(s.id, s.title); }} className="p-1.5 rounded-lg text-on-surface-variant hover:text-error hover:bg-error/5 transition-colors" aria-label={`Delete ${s.title}`}>
                            <span className="material-symbols-outlined text-[18px]">delete</span>
                          </button>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div className="flex items-start gap-2">
                          <span className="material-symbols-outlined text-on-surface-variant text-[18px] mt-0.5">schedule</span>
                          <div>
                            <p className="text-xs text-on-surface-variant">Time</p>
                            <p className="text-sm text-on-surface font-medium">{formatDateLabel(s.starts_at)}</p>
                            <p className="text-sm text-on-surface-variant">{formatTimeOnly(s.starts_at)} → {formatTimeOnly(s.ends_at)}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="material-symbols-outlined text-on-surface-variant text-[18px] mt-0.5">location_on</span>
                          <div>
                            <p className="text-xs text-on-surface-variant">Location</p>
                            <p className="text-sm text-on-surface font-medium">{s.location || '—'}</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-2">
                          {fac ? (
                            <Avatar name={fac.full_name} email={fac.email} size={28} />
                          ) : (
                            <span className="material-symbols-outlined text-on-surface-variant text-[18px] mt-0.5">person</span>
                          )}
                          <div>
                            <p className="text-xs text-on-surface-variant">Speaker</p>
                            <p className="text-sm text-on-surface font-medium">{fac?.full_name ?? 'No speaker'}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      <CsvImportModal<AgendaCsvRow>
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        onImported={fetchData}
        title="Import Agenda Sessions"
        templateFilename="agenda-template.csv"
        columns={AGENDA_CSV_COLUMNS}
        sampleRows={AGENDA_CSV_SAMPLES}
        parseRow={parseAgendaCsvRow}
        importRow={importAgendaRow}
      />
    </div>
  );
}

// ─── Speakers panel ─────────────────────────────────────────────────────────

function SpeakersPanel({
  facilitators,
  speakers,
  onAdd,
  onRemove,
  onMove,
  onChangeType,
}: {
  facilitators: Facilitator[];
  speakers: SessionSpeaker[];
  onAdd: (facilitatorId: string, speakerType: string) => void;
  onRemove: (key: string) => void;
  onMove: (key: string, direction: 'up' | 'down') => void;
  onChangeType: (key: string, speakerType: string) => void;
}) {
  const [addFid, setAddFid] = useState('');
  const [addType, setAddType] = useState('speaker');
  const availableFacilitators = facilitators.filter(f => !speakers.some(s => s.facilitator_id === f.id));

  return (
    <div className="border-t border-outline-variant mt-4 pt-4">
      <h3 className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wide mb-3">Speakers</h3>
      {speakers.length === 0 ? (
        <p className="text-sm text-on-surface-variant/70 italic mb-3">No speakers assigned yet.</p>
      ) : (
        <div className="space-y-2 mb-3">
          {speakers.map((sp, i) => {
            const fac = facilitators.find(f => f.id === sp.facilitator_id);
            return (
              <div key={sp.key} className="flex items-center gap-3 bg-surface-container-low rounded-xl p-3">
                <span className="text-sm font-medium text-on-surface flex-1 min-w-0 truncate">{fac?.full_name ?? 'Unknown facilitator'}</span>
                <select className="input text-xs w-auto py-1" value={sp.speaker_type} onChange={e => onChangeType(sp.key, e.target.value)}>
                  {SPEAKER_TYPES.map(t => <option key={t} value={t}>{SPEAKER_TYPE_LABELS[t]}</option>)}
                </select>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button type="button" onClick={() => onMove(sp.key, 'up')} disabled={i === 0} className="p-1 rounded text-on-surface-variant hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed">
                    <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
                  </button>
                  <button type="button" onClick={() => onMove(sp.key, 'down')} disabled={i === speakers.length - 1} className="p-1 rounded text-on-surface-variant hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed">
                    <span className="material-symbols-outlined text-[18px]">arrow_downward</span>
                  </button>
                  <button type="button" onClick={() => onRemove(sp.key)} className="p-1 rounded text-on-surface-variant hover:text-error">
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[160px]">
          <label className="label text-xs">Facilitator</label>
          <select className="input text-sm" value={addFid} onChange={e => setAddFid(e.target.value)}>
            <option value="">— Select —</option>
            {availableFacilitators.map(f => <option key={f.id} value={f.id}>{f.full_name}</option>)}
          </select>
        </div>
        <div className="w-36">
          <label className="label text-xs">Role</label>
          <select className="input text-sm" value={addType} onChange={e => setAddType(e.target.value)}>
            {SPEAKER_TYPES.map(t => <option key={t} value={t}>{SPEAKER_TYPE_LABELS[t]}</option>)}
          </select>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!addFid) { toast.error('Select a facilitator'); return; }
            onAdd(addFid, addType);
            setAddFid('');
            setAddType('speaker');
          }}
          className="btn-secondary text-sm"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ─── Breakout rooms panel ───────────────────────────────────────────────────

function BreakoutRoomsPanel({
  rooms,
  onAddRoom,
  onRemoveRoom,
  onMoveRoom,
  onChangeRoomField,
  onAddAgendaItem,
  onRemoveAgendaItem,
  onMoveAgendaItem,
  onChangeAgendaItemField,
}: {
  rooms: BreakoutRoom[];
  onAddRoom: () => void;
  onRemoveRoom: (roomId: string) => void;
  onMoveRoom: (roomId: string, direction: 'up' | 'down') => void;
  onChangeRoomField: (roomId: string, field: 'name' | 'description' | 'facilitator_name', value: string) => void;
  onAddAgendaItem: (roomId: string) => void;
  onRemoveAgendaItem: (roomId: string, itemId: string) => void;
  onMoveAgendaItem: (roomId: string, itemId: string, direction: 'up' | 'down') => void;
  onChangeAgendaItemField: (roomId: string, itemId: string, field: keyof BreakoutAgendaItem, value: string) => void;
}) {
  return (
    <div className="border-t border-outline-variant mt-4 pt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wide">Breakout Rooms</h3>
        <button type="button" onClick={onAddRoom} className="btn-secondary text-xs py-1.5">
          <span className="material-symbols-outlined text-[16px]">add</span> Add Room
        </button>
      </div>
      {rooms.length === 0 ? (
        <p className="text-sm text-on-surface-variant/70 italic">No breakout rooms — attendees will see this as a regular session.</p>
      ) : (
        <div className="space-y-4">
          {rooms.map((room, ri) => (
            <div key={room.id} className="bg-surface-container-low rounded-xl p-4">
              <div className="flex items-start gap-3 mb-3">
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label text-xs">Room Name *</label>
                    <input className="input text-sm" value={room.name} onChange={e => onChangeRoomField(room.id, 'name', e.target.value)} placeholder="Room A — Product Track" />
                  </div>
                  <div>
                    <label className="label text-xs">Facilitator Name</label>
                    <input className="input text-sm" value={room.facilitator_name} onChange={e => onChangeRoomField(room.id, 'facilitator_name', e.target.value)} placeholder="Jane Smith" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label text-xs">Description</label>
                    <input className="input text-sm" value={room.description} onChange={e => onChangeRoomField(room.id, 'description', e.target.value)} placeholder="What happens in this room" />
                  </div>
                </div>
                <div className="flex items-center gap-0.5 flex-shrink-0 pt-6">
                  <button type="button" onClick={() => onMoveRoom(room.id, 'up')} disabled={ri === 0} className="p-1 rounded text-on-surface-variant hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed">
                    <span className="material-symbols-outlined text-[18px]">arrow_upward</span>
                  </button>
                  <button type="button" onClick={() => onMoveRoom(room.id, 'down')} disabled={ri === rooms.length - 1} className="p-1 rounded text-on-surface-variant hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed">
                    <span className="material-symbols-outlined text-[18px]">arrow_downward</span>
                  </button>
                  <button type="button" onClick={() => onRemoveRoom(room.id)} className="p-1 rounded text-on-surface-variant hover:text-error">
                    <span className="material-symbols-outlined text-[18px]">delete</span>
                  </button>
                </div>
              </div>

              <div className="border-t border-outline-variant/50 pt-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Mini-Agenda</p>
                  <button type="button" onClick={() => onAddAgendaItem(room.id)} className="text-xs text-primary hover:opacity-80 font-medium">+ Add Time Block</button>
                </div>
                {room.agenda.length === 0 ? (
                  <p className="text-xs text-on-surface-variant/70 italic">No time blocks yet.</p>
                ) : (
                  <div className="space-y-2">
                    {room.agenda.map((item, ai) => (
                      <div key={item.id} className="bg-white border border-outline-variant rounded-lg p-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                          <input className="input text-xs" value={item.title} onChange={e => onChangeAgendaItemField(room.id, item.id, 'title', e.target.value)} placeholder="Time block title" />
                          <input className="input text-xs" value={item.location} onChange={e => onChangeAgendaItemField(room.id, item.id, 'location', e.target.value)} placeholder="Location" />
                          <input type="datetime-local" className="input text-xs" value={item.starts_at} onChange={e => onChangeAgendaItemField(room.id, item.id, 'starts_at', e.target.value)} />
                          <input type="datetime-local" className="input text-xs" value={item.ends_at} onChange={e => onChangeAgendaItemField(room.id, item.id, 'ends_at', e.target.value)} />
                        </div>
                        <div className="flex items-start gap-2">
                          <input className="input text-xs flex-1" value={item.description} onChange={e => onChangeAgendaItemField(room.id, item.id, 'description', e.target.value)} placeholder="Description" />
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            <button type="button" onClick={() => onMoveAgendaItem(room.id, item.id, 'up')} disabled={ai === 0} className="p-1 rounded text-on-surface-variant hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed">
                              <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
                            </button>
                            <button type="button" onClick={() => onMoveAgendaItem(room.id, item.id, 'down')} disabled={ai === room.agenda.length - 1} className="p-1 rounded text-on-surface-variant hover:text-primary disabled:opacity-30 disabled:cursor-not-allowed">
                              <span className="material-symbols-outlined text-[16px]">arrow_downward</span>
                            </button>
                            <button type="button" onClick={() => onRemoveAgendaItem(room.id, item.id)} className="p-1 rounded text-on-surface-variant hover:text-error">
                              <span className="material-symbols-outlined text-[16px]">close</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
