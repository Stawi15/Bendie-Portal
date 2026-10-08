'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Avatar } from '@/components/portal/Avatar';
import { SectionHeader } from '@/components/portal/SectionHeader';
import { RowActionsMenu } from '@/components/portal/RowActionsMenu';
import { CsvImportModal } from '@/components/portal/CsvImportModal';
import { FormModal } from '@/components/portal/FormModal';
import { getField, parseFlexibleDate, type ColumnSpec, type RowResult } from '@/lib/csvImport';
import { moveItem } from '@/lib/reorder';
import { useConfirm } from '@/contexts/ConfirmContext';
import toast from 'react-hot-toast';
import { friendlyError } from '@/lib/userFacingError';

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
const BLOCK_TYPE_LABELS: Record<string, string> = {
  session: 'Session', activity: 'Activity', meal: 'Meal', transfer: 'Transfer', freetime: 'Free time', ceremony: 'Ceremony', break: 'Break',
};

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
  // Template header is "speakers"; the parser still accepts "speaker" and the pre-rename "facilitator" header.
  { key: 'speakers', label: 'Speaker(s) (name or email; semicolon-separated for multiple)' },
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
    speakers: 'Jane Smith; John Doe',
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
    speakers: '',
    accent_color: '',
    description: '',
  },
];

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * ISO → `datetime-local` value in the browser's LOCAL time. Feature 016 fix: this used
 * `toISOString().slice(0, 16)` (UTC) while saving parses the input as local time, so in
 * any non-UTC timezone opening and re-saving a session shifted it by the UTC offset.
 */
function toLocal(iso: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Local calendar day (matches the date shown in the chip and on the session). */
function dateKeyOf(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
  // Feature 016: field-level validation + 'More options' disclosure for rarer settings.
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; starts_at?: string; ends_at?: string }>({});
  const [moreOpen, setMoreOpen] = useState(false);

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
    setFieldErrors({});
    setMoreOpen(false);
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
    setFieldErrors({});
    // Never hide settings this session already uses.
    setMoreOpen((s.audience && s.audience !== 'everyone') || !!s.accent_color || parseBreakoutRooms(s.breakout_rooms).length > 0);
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

  const handleSave = async (keepOpen = false) => {
    const errors: { title?: string; starts_at?: string; ends_at?: string } = {};
    if (!form.title.trim()) errors.title = 'Give the session a title.';
    if (!form.starts_at) errors.starts_at = 'Choose when the session starts.';
    if (!form.ends_at) errors.ends_at = 'Choose when the session ends.';
    else if (form.starts_at && new Date(form.ends_at) <= new Date(form.starts_at)) errors.ends_at = 'The end must be after the start.';
    setFieldErrors(errors);
    if (errors.title || errors.starts_at || errors.ends_at) return;
    for (const room of breakoutRooms) {
      if (!room.name.trim()) { setMoreOpen(true); toast.error('Every breakout room needs a name'); return; }
      for (const item of room.agenda) {
        if (!item.title.trim()) { setMoreOpen(true); toast.error(`Every time block in "${room.name}" needs a title`); return; }
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
      if (error) { toast.error(friendlyError(error)); setSaving(false); return; }
    } else {
      const { data, error } = await supabase.from('agenda_sessions').insert({
        ...payload, event_id: eventId, display_order: sessions.length,
      }).select().single();
      if (error) { toast.error(friendlyError(error)); setSaving(false); return; }
      sessionId = data.id;
    }

    if (sessionId) {
      const toDelete = [...originalSpeakerIds].filter(id => !speakers.some(s => s.dbId === id));
      if (toDelete.length > 0) {
        const { error } = await supabase.from('agenda_session_speakers').delete().in('id', toDelete);
        if (error) toast.error(friendlyError(error, 'Some speakers couldn’t be removed from this session — try again.'));
      }
      for (let i = 0; i < speakers.length; i++) {
        const sp = speakers[i];
        if (sp.dbId) {
          const { error } = await supabase.from('agenda_session_speakers')
            .update({ speaker_type: sp.speaker_type, display_order: i }).eq('id', sp.dbId);
          if (error) toast.error(friendlyError(error, 'A speaker on this session couldn’t be updated — try again.'));
        } else {
          const { error } = await supabase.from('agenda_session_speakers').insert({
            session_id: sessionId, facilitator_id: sp.facilitator_id, speaker_type: sp.speaker_type, display_order: i,
          });
          if (error) toast.error(friendlyError(error, 'A speaker couldn’t be added to this session — try again.'));
        }
      }
    }

    toast.success(editing ? 'Session updated' : 'Session added');
    if (keepOpen && !editing) {
      // Feature 016 — Save & Add Another: the next session usually follows this one in the
      // same place, so it starts when this one ended (same length) with the same type and
      // location. Title, description, speakers and breakout rooms are cleared.
      const lengthMs = new Date(form.ends_at).getTime() - new Date(form.starts_at).getTime();
      const nextStart = new Date(form.ends_at);
      setForm({ ...EMPTY_FORM, block_type: form.block_type, location: form.location, starts_at: toLocal(nextStart.toISOString()), ends_at: toLocal(new Date(nextStart.getTime() + lengthMs).toISOString()) });
      setSpeakers([]);
      setOriginalSpeakerIds(new Set());
      setBreakoutRooms([]);
      setFieldErrors({});
    } else {
      setShowForm(false);
    }
    fetchData();
    setSaving(false);
  };

  const handleDelete = async (id: string, title: string) => {
    if (!(await confirm({ message: `Delete "${title}"?`, confirmLabel: 'Delete', destructive: true }))) return;
    const { error } = await supabase.from('agenda_sessions').delete().eq('id', id);
    if (error) toast.error(friendlyError(error));
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
    const facilitatorRaw = getField(raw, 'speakers') || getField(raw, 'speaker') || getField(raw, 'facilitator');
    if (facilitatorRaw) {
      const names = facilitatorRaw.split(';').map((n) => n.trim()).filter(Boolean);
      for (const name of names) {
        const match = facilitators.find(
          (f) =>
            (f.full_name ?? '').toLowerCase() === name.toLowerCase() ||
            (f.email ?? '').toLowerCase() === name.toLowerCase()
        );
        if (!match) errors.push(`Speaker "${name}" not found — add them on the Speakers tab first`);
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

  const allDateCount = new Set(sessions.map((x) => dateKeyOf(x.starts_at))).size;
  // A selected day that the search no longer matches falls back to the first matching day.
  const effectiveDate = (selectedDate && dateGroups.some((d) => d.key === selectedDate) ? selectedDate : null) ?? dateGroups[0]?.key ?? null;
  const filtered = effectiveDate ? searched.filter(s => dateKeyOf(s.starts_at) === effectiveDate) : searched;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <SectionHeader
          sectionKey="agenda"
          desc={sessions.length === 0 ? undefined : `${sessions.length} session${sessions.length !== 1 ? 's' : ''} across ${allDateCount} day${allDateCount !== 1 ? 's' : ''}`}
        />
        <div className="flex gap-2 flex-shrink-0">
          <button onClick={() => setCsvOpen(true)} className="btn-secondary">
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">upload_file</span> Import spreadsheet
          </button>
          <button onClick={openAdd} className="btn-primary">
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">add</span> Add session
          </button>
        </div>
      </div>

      {/* Form modal */}
      <FormModal open={showForm} onClose={() => setShowForm(false)} title={editing ? 'Edit Session' : 'New Session'}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
            <div className="sm:col-span-2">
              <label className="label" htmlFor="agenda-title">Session Title *</label>
              <input
                id="agenda-title"
                className={`input ${fieldErrors.title ? 'border-error' : ''}`}
                value={form.title}
                onChange={(e) => { set('title')(e); if (fieldErrors.title) setFieldErrors((p) => ({ ...p, title: undefined })); }}
                placeholder="Opening Keynote"
                aria-invalid={!!fieldErrors.title}
                aria-describedby={fieldErrors.title ? 'agenda-title-error' : undefined}
              />
              {fieldErrors.title && <p id="agenda-title-error" className="text-xs text-error mt-1">{fieldErrors.title}</p>}
            </div>
            <div>
              <label className="label" htmlFor="agenda-start">Start *</label>
              <input
                id="agenda-start"
                type="datetime-local"
                className={`input ${fieldErrors.starts_at ? 'border-error' : ''}`}
                value={form.starts_at}
                onChange={(e) => { set('starts_at')(e); setFieldErrors((p) => ({ ...p, starts_at: undefined, ends_at: undefined })); }}
                aria-invalid={!!fieldErrors.starts_at}
                aria-describedby={fieldErrors.starts_at ? 'agenda-start-error' : undefined}
              />
              {fieldErrors.starts_at && <p id="agenda-start-error" className="text-xs text-error mt-1">{fieldErrors.starts_at}</p>}
            </div>
            <div>
              <label className="label" htmlFor="agenda-end">End *</label>
              <input
                id="agenda-end"
                type="datetime-local"
                className={`input ${fieldErrors.ends_at ? 'border-error' : ''}`}
                value={form.ends_at}
                min={form.starts_at || undefined}
                onChange={(e) => { set('ends_at')(e); setFieldErrors((p) => ({ ...p, ends_at: undefined })); }}
                aria-invalid={!!fieldErrors.ends_at}
                aria-describedby={fieldErrors.ends_at ? 'agenda-end-error' : undefined}
              />
              {fieldErrors.ends_at && <p id="agenda-end-error" className="text-xs text-error mt-1">{fieldErrors.ends_at}</p>}
            </div>
            <div>
              <label className="label">Session Type</label>
              <select className="input" value={form.block_type} onChange={set('block_type')}>
                {BLOCK_TYPES.map(t => <option key={t} value={t}>{BLOCK_TYPE_LABELS[t] ?? t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Location</label>
              <input className="input" value={form.location} onChange={set('location')} placeholder="Main Hall" />
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

          {/* Feature 016 density pass — rarer settings (audience, accent colour, breakout rooms)
              behind a disclosure; opened automatically when the session already uses them. */}
          <details className="border-t border-outline-variant mt-4 pt-3 group" open={moreOpen} onToggle={(e) => setMoreOpen((e.target as HTMLDetailsElement).open)}>
            <summary className="cursor-pointer select-none text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wide flex items-center gap-1">
              <span className="material-symbols-outlined text-[18px] transition-transform group-open:rotate-90" aria-hidden="true">chevron_right</span>
              More options
              <span className="normal-case tracking-normal font-normal text-xs text-on-surface-variant/80 ml-1">Audience, accent colour, breakout rooms</span>
            </summary>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 mt-3">
              <div>
                <label className="label">Audience</label>
                <input className="input" value={form.audience} onChange={set('audience')} placeholder="everyone" />
                <p className="hint">Shown as a pill on the session in the attendee app.</p>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <label className="label">Accent Colour</label>
                  <input className="input font-mono" value={form.accent_color} onChange={set('accent_color')} placeholder="#3B82F6" />
                  <p className="hint">Leave empty to use the session type&apos;s colour.</p>
                </div>
                <input
                  type="color"
                  aria-label="Pick accent colour"
                  value={form.accent_color || '#3B82F6'}
                  onChange={e => setForm(p => ({ ...p, accent_color: e.target.value }))}
                  className="mt-6 w-9 h-9 rounded-lg cursor-pointer border border-outline-variant p-0.5"
                />
              </div>
            </div>
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
          </details>

          <div className="flex gap-3 mt-4 pt-4 border-t border-outline-variant flex-wrap">
            <button onClick={() => handleSave(false)} disabled={saving} className="btn-primary">{saving ? 'Saving...' : editing ? 'Update' : 'Add Session'}</button>
            {!editing && (
              <button onClick={() => handleSave(true)} disabled={saving} className="btn-secondary">
                {saving ? 'Saving...' : 'Save & Add Another'}
              </button>
            )}
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
          </div>
      </FormModal>

      {loading ? (
        <div className="animate-pulse space-y-2">{[1, 2, 3, 4].map(i => <div key={i} className="h-14 bg-surface-container-low rounded-xl" />)}</div>
      ) : sessions.length === 0 ? (
        <div className="text-center py-10 px-6 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow">
          <p className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-2" aria-hidden="true">calendar_month</p>
          <p className="font-medium text-on-surface">No sessions yet</p>
          <p className="text-sm text-on-surface-variant mt-1 max-w-md mx-auto">
            Build the programme attendees see in the app&apos;s Agenda. Add sessions one by one, or bring in your whole schedule from a spreadsheet.
          </p>
          <div className="flex flex-wrap justify-center gap-2 mt-4">
            <button onClick={openAdd} className="btn-primary">
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">add</span> Add session
            </button>
            <button onClick={() => setCsvOpen(true)} className="btn-secondary">
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">upload_file</span> Import spreadsheet
            </button>
          </div>
        </div>
      ) : (
        <div>
          {/* Feature 016 density pass — dates as compact horizontal chips (was a 220px side rail);
              same "one day at a time" behaviour, counts follow the search. */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-3">
            <div role="tablist" aria-label="Agenda days" className="flex gap-1.5 overflow-x-auto custom-scrollbar pb-1 lg:pb-0 flex-1 min-w-0">
              {dateGroups.map(d => {
                const active = d.key === effectiveDate;
                return (
                  <button
                    key={d.key}
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedDate(d.key)}
                    className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap border transition ${
                      active
                        ? 'bg-primary/10 text-primary border-primary/30'
                        : 'text-on-surface-variant border-outline-variant bg-white hover:border-primary/30 hover:text-on-surface'
                    }`}
                  >
                    {d.label}
                    <span className={`text-[11px] font-bold px-1.5 rounded-full ${active ? 'bg-primary text-white' : 'bg-surface-container-low text-on-surface-variant'}`}>
                      {d.count}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="lg:w-72 flex-shrink-0">
              <input
                type="search"
                aria-label="Search sessions"
                placeholder="Search title, location, speaker…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="input w-full"
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-10 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow">
              <p className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-2" aria-hidden="true">search</p>
              <p className="text-on-surface-variant">No sessions match your search.</p>
            </div>
          ) : (
            <div className="bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow">
              <div className="hidden md:grid grid-cols-[112px_minmax(0,1fr)_minmax(0,160px)_minmax(0,180px)_40px] gap-4 px-4 py-2 border-b border-outline-variant text-xs font-semibold text-on-surface-variant">
                <span>Time</span>
                <span>Session</span>
                <span>Location</span>
                <span>Speaker</span>
                <span className="sr-only">Actions</span>
              </div>
              <ul className="divide-y divide-outline-variant/40">
                {filtered.map(s => {
                  const fac = facilitators.find(f => f.id === s.facilitator_id);
                  const accent = s.accent_color || (s.block_type ? BLOCK_ACCENT[s.block_type] : undefined) || '#3B82F6';
                  const roomCount = parseBreakoutRooms(s.breakout_rooms).length;
                  return (
                    <li
                      key={s.id}
                      className="relative grid grid-cols-[minmax(0,1fr)_40px] md:grid-cols-[112px_minmax(0,1fr)_minmax(0,160px)_minmax(0,180px)_40px] gap-x-4 gap-y-1 items-center pl-4 pr-2 py-2.5 hover:bg-surface-container-low/40 transition-colors"
                    >
                      <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r" style={{ backgroundColor: accent }} aria-hidden="true" />
                      <p className="text-sm font-semibold text-on-surface tabular-nums whitespace-nowrap md:col-auto col-span-1">
                        {formatTimeOnly(s.starts_at)}–{formatTimeOnly(s.ends_at)}
                      </p>
                      <div className="min-w-0 row-start-2 col-start-1 md:row-auto md:col-auto">
                        <button
                          type="button"
                          onClick={() => openEdit(s)}
                          className="text-left text-sm font-semibold text-on-surface hover:text-primary truncate max-w-full block focus-visible:outline-none focus-visible:underline"
                          title={`Edit ${s.title}`}
                        >
                          {s.title}
                        </button>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {s.block_type && (
                            <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-1.5 py-px rounded ${BLOCK_COLOR[s.block_type] ?? 'bg-surface-container-low text-on-surface-variant'}`}>
                              {BLOCK_TYPE_LABELS[s.block_type] ?? s.block_type}
                            </span>
                          )}
                          {roomCount > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider px-1.5 py-px rounded bg-purple-100 text-purple-700">
                              <span className="material-symbols-outlined text-[12px]" aria-hidden="true">meeting_room</span> {roomCount} room{roomCount !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      <p className="text-sm text-on-surface-variant truncate row-start-3 col-start-1 md:row-auto md:col-auto">
                        <span className="md:hidden material-symbols-outlined text-[14px] align-[-2px] mr-0.5" aria-hidden="true">location_on</span>
                        {s.location || <span className="text-on-surface-variant/50">—</span>}
                      </p>
                      <div className="flex items-center gap-2 min-w-0 row-start-4 col-start-1 md:row-auto md:col-auto">
                        {fac ? (
                          <>
                            <Avatar name={fac.full_name} email={fac.email} size={22} />
                            <span className="text-sm text-on-surface truncate">{fac.full_name}</span>
                          </>
                        ) : (
                          <span className="text-sm text-on-surface-variant/60">No speaker</span>
                        )}
                      </div>
                      <div className="row-start-1 col-start-2 md:row-auto md:col-auto justify-self-end">
                        <RowActionsMenu
                          label={`Actions for ${s.title}`}
                          actions={[
                            { label: 'Edit', icon: 'edit', onSelect: () => openEdit(s) },
                            { label: 'Delete', icon: 'delete', destructive: true, onSelect: () => handleDelete(s.id, s.title) },
                          ]}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
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
    <div className="border-t border-outline-variant mt-4 pt-3">
      <h3 className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wide mb-2">Speakers</h3>
      {speakers.length === 0 ? (
        <p className="text-sm text-on-surface-variant/70 italic mb-3">No speakers assigned yet.</p>
      ) : (
        <div className="space-y-2 mb-3">
          {speakers.map((sp, i) => {
            const fac = facilitators.find(f => f.id === sp.facilitator_id);
            return (
              <div key={sp.key} className="flex items-center gap-3 bg-surface-container-low rounded-xl p-3">
                <span className="text-sm font-medium text-on-surface flex-1 min-w-0 truncate">{fac?.full_name ?? 'Unknown speaker'}</span>
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
          <label className="label text-xs">Speaker</label>
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
            if (!addFid) { toast.error('Select a speaker'); return; }
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
    <div className="mt-4">
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
