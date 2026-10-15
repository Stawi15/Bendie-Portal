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
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { friendlyError } from '@/lib/userFacingError';
import { BreakoutRoomsEditor } from '@/components/portal/BreakoutRoomsEditor';
import { BreakoutAssignmentsModal } from '@/components/portal/BreakoutAssignmentsModal';
import {
  BREAKOUT_MODE_LABELS,
  newRoomForm,
  normalizeName,
  roomsFromRows,
  sessionMatchKey,
  toSaveRoomsPayload,
  validateRoomForms,
  type BreakoutRoomForm,
  type BreakoutRoomItemRow,
  type BreakoutRoomRow,
} from '@/lib/breakoutRooms';
import type { BreakoutMode, SaveBreakoutRoomsResult } from '@/types/database';

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
  breakout_mode: BreakoutMode;
};

type AssignmentRow = { session_id: string; room_id: string; user_id: string };

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

type AgendaCsvRow = {
  rowIndex: number;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  location: string | null;
  /** null = left blank (new sessions default to 'session'; updates keep the current value). */
  block_type: string | null;
  /** null = left blank (new sessions default to 'everyone'; updates keep the current value). */
  audience: string | null;
  facilitator_id: string | null;
  facilitator_ids: string[];
  accent_color: string | null;
  /** Feature 021 — set when this row is one room of a breakout session. */
  room: { name: string; capacity?: number; facilitatorId?: string } | null;
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
  // Feature 021 — a breakout session is one row per room with the same title and times.
  { key: 'breakout_room', label: 'Breakout room (blank = regular session)' },
  { key: 'room_capacity', label: 'Room capacity (blank = no limit)' },
  { key: 'room_facilitator', label: 'Room facilitator (speaker name or email)' },
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
  {
    title: 'Afternoon Breakouts',
    starts_at: '2026-09-01 14:00',
    ends_at: '2026-09-01 16:00',
    location: '',
    block_type: 'session',
    audience: 'everyone',
    speakers: '',
    accent_color: '',
    description: 'Choose one room.',
    breakout_room: 'Room A: Innovation Lab',
    room_capacity: '30',
    room_facilitator: 'Jane Smith',
  },
  {
    title: 'Afternoon Breakouts',
    starts_at: '2026-09-01 14:00',
    ends_at: '2026-09-01 16:00',
    location: '',
    block_type: 'session',
    audience: 'everyone',
    speakers: '',
    accent_color: '',
    description: '',
    breakout_room: 'Room B: Leadership Circle',
    room_capacity: '25',
    room_facilitator: '',
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
  const { isGlobalAdmin, loading: authLoading } = useAuth();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [facilitators, setFacilitators] = useState<Facilitator[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Session | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<SessionForm>(EMPTY_FORM);
  const [speakers, setSpeakers] = useState<SessionSpeaker[]>([]);
  const [originalSpeakerIds, setOriginalSpeakerIds] = useState<Set<string>>(new Set());
  // Feature 021 — rooms live in agenda_breakout_rooms/_items; assignments drive headcounts.
  const [roomRows, setRoomRows] = useState<BreakoutRoomRow[]>([]);
  const [itemRows, setItemRows] = useState<BreakoutRoomItemRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [attendeeIds, setAttendeeIds] = useState<Set<string>>(new Set());
  const [breakoutRooms, setBreakoutRooms] = useState<BreakoutRoomForm[]>([]);
  const [breakoutMode, setBreakoutMode] = useState<BreakoutMode>('attendee_choice');
  const [isBreakout, setIsBreakout] = useState(false);
  const [peopleSession, setPeopleSession] = useState<Session | null>(null);
  // Feature 021 FR-034 — which controls this person can use (null while checking; fails closed).
  const [rights, setRights] = useState<{ canEditSessions: boolean; canManageBreakouts: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [csvOpen, setCsvOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  // Feature 016: field-level validation + 'More options' disclosure for rarer settings.
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; starts_at?: string; ends_at?: string }>({});
  const [moreOpen, setMoreOpen] = useState(false);

  const fetchData = async () => {
    const [sessRes, facRes, roomRes, itemRes, assignRes, attendeeRes] = await Promise.all([
      supabase.from('agenda_sessions').select('id,title,description,starts_at,ends_at,location,block_type,audience,facilitator_id,accent_color,display_order,breakout_mode').eq('event_id', eventId).order('starts_at'),
      supabase.from('facilitators').select('id,full_name,email').eq('event_id', eventId).order('display_order'),
      supabase.from('agenda_breakout_rooms').select('id,session_id,name,description,location,facilitator_id,facilitator_name,capacity,display_order').eq('event_id', eventId).order('display_order'),
      supabase.from('agenda_breakout_room_items').select('id,room_id,title,description,starts_at,ends_at,location,display_order').eq('event_id', eventId).order('display_order'),
      supabase.from('agenda_breakout_assignments').select('session_id,room_id,user_id').eq('event_id', eventId),
      supabase.from('event_members').select('user_id').eq('event_id', eventId).eq('role', 'attendee'),
    ]);
    if (sessRes.error) toast.error('Failed to load agenda');
    else setSessions(sessRes.data ?? []);
    setFacilitators(facRes.data ?? []);
    if (roomRes.error || itemRes.error) toast.error('Failed to load breakout rooms');
    // Headcounts and the remove-room warning depend on these; say so rather than showing 0.
    if (assignRes.error || attendeeRes.error) toast.error('We couldn’t load who is in each room, so room headcounts may be wrong. Refresh to try again.');
    if (facRes.error) toast.error('Failed to load speakers');
    setRoomRows(roomRes.data ?? []);
    setItemRows(itemRes.data ?? []);
    setAssignments(assignRes.data ?? []);
    setAttendeeIds(new Set((attendeeRes.data ?? []).map((m) => m.user_id)));
    setLoading(false);
  };

  useEffect(() => { if (eventId) fetchData(); }, [eventId]);

  // FR-034: platform admin or organisation admin edits sessions; event hosts/organisers also manage breakouts.
  useEffect(() => {
    if (!eventId || authLoading) return;
    if (isGlobalAdmin) {
      setRights({ canEditSessions: true, canManageBreakouts: true });
      return;
    }
    let cancelled = false;
    setRights(null);
    Promise.all([
      supabase.rpc('is_event_org_admin', { ev_id: eventId }),
      supabase.rpc('is_event_host_or_organizer', { ev_id: eventId }),
    ]).then(([orgAdmin, organizer]) => {
      if (cancelled) return;
      if (orgAdmin.error || organizer.error) {
        toast.error('We couldn’t check your permissions, so the agenda is read-only. Refresh to try again.');
        setRights({ canEditSessions: false, canManageBreakouts: false });
        return;
      }
      const canEditSessions = orgAdmin.data === true;
      setRights({ canEditSessions, canManageBreakouts: canEditSessions || organizer.data === true });
    });
    return () => {
      cancelled = true;
    };
  }, [eventId, isGlobalAdmin, authLoading]);

  const canEditSessions = rights?.canEditSessions === true;
  const canManageBreakouts = rights?.canManageBreakouts === true;

  const roomsBySession = new Map<string, BreakoutRoomRow[]>();
  for (const r of roomRows) roomsBySession.set(r.session_id, [...(roomsBySession.get(r.session_id) ?? []), r]);
  // Headcount = current attendees only; the delete warning counts every assignment (Feature 021 R6).
  const headcountByRoom: Record<string, number> = {};
  const assignedTotalByRoom: Record<string, number> = {};
  for (const a of assignments) {
    assignedTotalByRoom[a.room_id] = (assignedTotalByRoom[a.room_id] ?? 0) + 1;
    if (attendeeIds.has(a.user_id)) headcountByRoom[a.room_id] = (headcountByRoom[a.room_id] ?? 0) + 1;
  }

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setSpeakers([]);
    setOriginalSpeakerIds(new Set());
    setBreakoutRooms([]);
    setBreakoutMode('attendee_choice');
    setIsBreakout(false);
    setFieldErrors({});
    setMoreOpen(false);
    setShowForm(true);
  };

  const handleFormatChange = async (toBreakout: boolean) => {
    if (toBreakout === isBreakout) return;
    if (toBreakout) {
      setIsBreakout(true);
      if (breakoutRooms.length === 0) setBreakoutRooms([newRoomForm()]);
      return;
    }
    if (breakoutRooms.length > 0) {
      const people = breakoutRooms.reduce((n, r) => n + (r.isNew ? 0 : assignedTotalByRoom[r.id] ?? 0), 0);
      const ok = await confirm({
        title: 'Make this a regular session',
        message: `This removes its ${breakoutRooms.length} breakout room${breakoutRooms.length !== 1 ? 's' : ''}${
          people > 0 ? ` and unassigns ${people} ${people === 1 ? 'person' : 'people'}` : ''
        } when you save.`,
        confirmLabel: 'Remove rooms',
        destructive: true,
      });
      if (!ok) return;
    }
    setBreakoutRooms([]);
    setIsBreakout(false);
  };

  const openEdit = async (s: Session) => {
    setEditing(s);
    setForm({
      title: s.title, description: s.description ?? '', starts_at: toLocal(s.starts_at),
      ends_at: toLocal(s.ends_at), location: s.location ?? '',
      block_type: s.block_type ?? 'session', audience: s.audience,
      accent_color: s.accent_color ?? '',
    });
    const sessionRooms = roomsBySession.get(s.id) ?? [];
    setBreakoutRooms(roomsFromRows(sessionRooms, itemRows.filter((i) => sessionRooms.some((r) => r.id === i.room_id))));
    setBreakoutMode(s.breakout_mode ?? 'attendee_choice');
    setIsBreakout(sessionRooms.length > 0);
    setFieldErrors({});
    // Never hide settings this session already uses.
    setMoreOpen((s.audience && s.audience !== 'everyone') || !!s.accent_color);
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

  const handleSave = async (keepOpen = false) => {
    const errors: { title?: string; starts_at?: string; ends_at?: string } = {};
    if (!form.title.trim()) errors.title = 'Give the session a title.';
    if (!form.starts_at) errors.starts_at = 'Choose when the session starts.';
    if (!form.ends_at) errors.ends_at = 'Choose when the session ends.';
    else if (form.starts_at && new Date(form.ends_at) <= new Date(form.starts_at)) errors.ends_at = 'The end must be after the start.';
    setFieldErrors(errors);
    if (errors.title || errors.starts_at || errors.ends_at) return;
    if (isBreakout && breakoutRooms.length === 0) {
      toast.error('A breakout session needs at least one room — add a room, or choose Regular session.');
      return;
    }
    const roomProblem = validateRoomForms(breakoutRooms);
    if (roomProblem) { toast.error(roomProblem); return; }

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
      // Rooms themselves are saved below through save_breakout_rooms (Feature 021); the
      // session's breakout_rooms JSON is derived by the database and never written here.
      breakout_mode: breakoutRooms.length > 0 ? breakoutMode : 'attendee_choice',
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

    let removedPeople = 0;
    const hadRooms = !!editing && (roomsBySession.get(editing.id)?.length ?? 0) > 0;
    if (sessionId && (breakoutRooms.length > 0 || hadRooms)) {
      const { data, error } = await supabase.rpc('save_breakout_rooms', {
        p_session_id: sessionId,
        p_rooms: toSaveRoomsPayload(breakoutRooms),
        p_prune: true,
      });
      const result = data as SaveBreakoutRoomsResult | null;
      if (error || !result || !result.ok) {
        const failure = result && !result.ok ? result : null;
        const message = error
          ? friendlyError(error, 'The breakout rooms couldn’t be saved — try again.')
          : failure?.reason === 'no_event'
            ? 'Breakout rooms need a session that belongs to an event.'
            : failure?.message ?? 'The breakout rooms couldn’t be saved — try again.';
        toast.error(`Session saved, but the rooms weren’t: ${message}`);
        // Keep the form open with the organiser's room edits; the session row now exists.
        if (!editing && sessionId) {
          const { data: created } = await supabase.from('agenda_sessions').select('id,title,description,starts_at,ends_at,location,block_type,audience,facilitator_id,accent_color,display_order,breakout_mode').eq('id', sessionId).maybeSingle();
          if (created) setEditing(created);
          // Speakers were inserted already; reload them so a retry updates instead of re-adding.
          const { data: savedSpeakers } = await supabase
            .from('agenda_session_speakers')
            .select('id,facilitator_id,speaker_type,display_order')
            .eq('session_id', sessionId)
            .order('display_order');
          const loaded: SessionSpeaker[] = (savedSpeakers ?? []).map((row) => ({
            key: row.id, dbId: row.id, facilitator_id: row.facilitator_id, speaker_type: row.speaker_type,
          }));
          setSpeakers(loaded);
          setOriginalSpeakerIds(new Set(loaded.map((l) => l.dbId as string)));
        }
        fetchData();
        setSaving(false);
        return;
      }
      removedPeople = result.removed_assignments;
    }

    toast.success(
      `${editing ? 'Session updated' : 'Session added'}${removedPeople > 0 ? ` — ${removedPeople} ${removedPeople === 1 ? 'person' : 'people'} unassigned from removed rooms` : ''}`
    );
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
      setBreakoutMode('attendee_choice');
      setIsBreakout(false);
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

    // Feature 021 — breakout room columns (one row per room; same title and times on each row).
    let room: AgendaCsvRow['room'] = null;
    const roomName = getField(raw, 'breakout_room');
    const roomCapacityRaw = getField(raw, 'room_capacity');
    const roomFacilitatorRaw = getField(raw, 'room_facilitator');
    if (roomName) {
      if (roomName.length > 200) errors.push('breakout_room must be 200 characters or fewer');
      room = { name: roomName };
      if (roomCapacityRaw) {
        if (!/^[1-9]\d*$/.test(roomCapacityRaw)) errors.push('room_capacity must be a whole number of 1 or more (or blank for no limit)');
        else room.capacity = Number(roomCapacityRaw);
      }
      if (roomFacilitatorRaw) {
        const f = facilitators.find(
          (x) => normalizeName(x.full_name ?? '') === normalizeName(roomFacilitatorRaw) || normalizeName(x.email ?? '') === normalizeName(roomFacilitatorRaw)
        );
        if (!f) errors.push(`Room facilitator "${roomFacilitatorRaw}" not found — add them on the Speakers tab first`);
        else room.facilitatorId = f.id;
      }
    } else if (roomCapacityRaw || roomFacilitatorRaw) {
      errors.push('breakout_room is required when room_capacity or room_facilitator is filled');
    }

    const data: AgendaCsvRow = {
      rowIndex,
      title,
      description: getField(raw, 'description') || null,
      starts_at: startsAt?.toISOString() ?? '',
      ends_at: endsAt?.toISOString() ?? '',
      location: getField(raw, 'location') || null,
      block_type: blockTypeRaw || null,
      audience: getField(raw, 'audience') || null,
      facilitator_id: facilitatorIds[0] ?? null,
      facilitator_ids: facilitatorIds,
      accent_color: accentColor || null,
      room,
    };

    return { rowIndex, raw, data: errors.length === 0 ? data : undefined, errors };
  };

  /**
   * Feature 021 — rows with the same title and start are one session. Several rows only make sense
   * for a breakout (one row per room); their session details must not disagree.
   */
  const refineAgendaCsv = (results: RowResult<AgendaCsvRow>[]): RowResult<AgendaCsvRow>[] => {
    const groups = new Map<string, RowResult<AgendaCsvRow>[]>();
    for (const r of results) {
      if (!r.data) continue;
      const key = sessionMatchKey(r.data.title, r.data.starts_at);
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    const extraErrors = new Map<number, string[]>();
    const add = (rowIndex: number, message: string) => extraErrors.set(rowIndex, [...(extraErrors.get(rowIndex) ?? []), message]);
    for (const rows of groups.values()) {
      if (rows.length < 2) continue;
      if (rows.some((r) => !r.data!.room)) {
        for (const r of rows) add(r.rowIndex, `"${r.data!.title}" appears more than once at the same start — for a breakout, fill breakout_room on every row; otherwise remove the extra row`);
        continue;
      }
      const seenRooms = new Set<string>();
      const first = rows[0].data!;
      // Compare each detail with the first row that fills it in (T035), not only the first row.
      const firstFilled: Partial<Record<'location' | 'description' | 'block_type' | 'audience' | 'accent_color' | 'speakers', string>> = {};
      for (const r of rows) {
        const d = r.data!;
        const roomKey = normalizeName(d.room!.name);
        if (seenRooms.has(roomKey)) add(r.rowIndex, `Room "${d.room!.name}" is listed twice for "${d.title}"`);
        seenRooms.add(roomKey);
        if (d.ends_at !== first.ends_at) add(r.rowIndex, `ends_at differs from the first row of "${d.title}" — every room of a breakout shares the session's times`);
        for (const field of ['location', 'description', 'block_type', 'audience', 'accent_color'] as const) {
          const value = d[field];
          if (!value) continue;
          if (firstFilled[field] === undefined) firstFilled[field] = value;
          else if (firstFilled[field] !== value) add(r.rowIndex, `${field} differs from an earlier row of "${d.title}" — fill it in on one row only`);
        }
        if (d.facilitator_ids.length > 0) {
          const speakers = d.facilitator_ids.join();
          if (firstFilled.speakers === undefined) firstFilled.speakers = speakers;
          else if (firstFilled.speakers !== speakers) add(r.rowIndex, `speakers differ from an earlier row of "${d.title}" — fill them in on one row only`);
        }
      }
    }
    return results.map((r) => (extraErrors.has(r.rowIndex) ? { ...r, data: undefined, errors: [...r.errors, ...extraErrors.get(r.rowIndex)!] } : r));
  };

  /**
   * Sets a session's speakers to `speakerIds` (in order) for a spreadsheet update. Existing links
   * are kept (and re-ordered), new ones inserted, and only after that succeeds are the links that
   * are no longer listed deleted — a failure part-way leaves the old speakers in place.
   * Returns an error message, or null.
   */
  const replaceSessionSpeakers = async (sessionId: string, speakerIds: string[]): Promise<string | null> => {
    const { data: existing, error: loadError } = await supabase
      .from('agenda_session_speakers')
      .select('id,facilitator_id')
      .eq('session_id', sessionId);
    if (loadError) return friendlyError(loadError);
    const byFacilitator = new Map((existing ?? []).map((row) => [row.facilitator_id, row.id]));
    for (let i = 0; i < speakerIds.length; i++) {
      const linkId = byFacilitator.get(speakerIds[i]);
      const { error } = linkId
        ? await supabase.from('agenda_session_speakers').update({ display_order: i }).eq('id', linkId)
        : await supabase.from('agenda_session_speakers').insert({ session_id: sessionId, facilitator_id: speakerIds[i], speaker_type: 'speaker', display_order: i });
      if (error) return friendlyError(error);
    }
    const toRemove = (existing ?? []).filter((row) => !speakerIds.includes(row.facilitator_id)).map((row) => row.id);
    if (toRemove.length > 0) {
      const { error } = await supabase.from('agenda_session_speakers').delete().in('id', toRemove);
      if (error) return friendlyError(error);
    }
    return null;
  };

  /**
   * Feature 021 — imports the agenda spreadsheet session by session. A session whose title and start
   * match an existing one is updated (blank cells keep current values) instead of duplicated; rows
   * with breakout_room become that session's rooms.
   */
  const importAgendaAll = async (rows: AgendaCsvRow[]) => {
    const groups = new Map<string, AgendaCsvRow[]>();
    for (const r of rows) {
      const key = sessionMatchKey(r.title, r.starts_at);
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    const outcomes: { rowIndex: number; error?: string; notice?: string }[] = [];
    let newCount = 0;
    for (const [key, groupRows] of groups) {
      const report = (error?: string, notice?: string) => groupRows.forEach((r) => outcomes.push({ rowIndex: r.rowIndex, error, notice }));
      // Session details come from the first row that fills each field.
      const pick = <K extends keyof AgendaCsvRow>(field: K) => groupRows.find((r) => r[field])?.[field] ?? null;
      const first = groupRows[0];
      const speakerIds = groupRows.find((r) => r.facilitator_ids.length > 0)?.facilitator_ids ?? [];
      const matches = sessions.filter((s) => sessionMatchKey(s.title, s.starts_at) === key);
      if (matches.length > 1) {
        report(`More than one session "${first.title}" already starts at this time — rename one in the agenda so they can be told apart`);
        continue;
      }

      let sessionId: string;
      let notice: string | undefined;
      if (matches.length === 1) {
        const patch: Record<string, unknown> = { ends_at: first.ends_at };
        for (const field of ['description', 'location', 'block_type', 'audience', 'accent_color'] as const) {
          const value = pick(field);
          if (value) patch[field] = value;
        }
        if (speakerIds.length > 0) patch.facilitator_id = speakerIds[0];
        const { error } = await supabase.from('agenda_sessions').update(patch).eq('id', matches[0].id);
        if (error) { report(friendlyError(error, 'This session couldn’t be updated.')); continue; }
        sessionId = matches[0].id;
        notice = 'Updated the existing session';
        if (speakerIds.length > 0) {
          // Replace speakers without ever leaving the session speakerless: keep/reorder the links that
          // stay, add the new ones, and only then remove links that are no longer listed.
          const speakerError = await replaceSessionSpeakers(sessionId, speakerIds);
          if (speakerError) { report(`Session updated but its speakers couldn’t be: ${speakerError}`); continue; }
        }
      } else {
        const { data, error } = await supabase
          .from('agenda_sessions')
          .insert({
            event_id: eventId,
            title: first.title,
            starts_at: first.starts_at,
            ends_at: first.ends_at,
            description: pick('description'),
            location: pick('location'),
            block_type: pick('block_type') ?? 'session',
            audience: pick('audience') ?? 'everyone',
            accent_color: pick('accent_color'),
            facilitator_id: speakerIds[0] ?? null,
            display_order: sessions.length + newCount,
          })
          .select('id')
          .single();
        if (error) { report(friendlyError(error, 'This session couldn’t be added.')); continue; }
        sessionId = data.id;
        newCount += 1;
        if (speakerIds.length > 0) {
          const { error: speakerError } = await supabase.from('agenda_session_speakers').insert(
            speakerIds.map((facilitatorId, i) => ({ session_id: sessionId, facilitator_id: facilitatorId, speaker_type: 'speaker', display_order: i }))
          );
          if (speakerError) { report(`Session added but its speakers couldn’t be: ${friendlyError(speakerError)}`); continue; }
        }
      }

      const roomRowsInFile = groupRows.filter((r) => r.room);
      if (roomRowsInFile.length > 0) {
        const { data, error } = await supabase.rpc('save_breakout_rooms', {
          p_session_id: sessionId,
          p_rooms: roomRowsInFile.map((r) => ({
            name: r.room!.name,
            ...(r.room!.capacity !== undefined ? { capacity: r.room!.capacity } : {}),
            ...(r.room!.facilitatorId ? { facilitator_id: r.room!.facilitatorId } : {}),
          })),
          p_prune: false,
        });
        const result = data as SaveBreakoutRoomsResult | null;
        const failure = result && !result.ok ? result : null;
        if (error || !result || failure) {
          report(`Session saved but its rooms weren’t: ${error ? friendlyError(error) : failure?.message ?? 'try again'}`);
          continue;
        }
        notice = `${notice ? `${notice}; ` : ''}${roomRowsInFile.length} breakout room${roomRowsInFile.length !== 1 ? 's' : ''}`;
      }
      report(undefined, notice);
    }
    return outcomes;
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
        {rights === null ? (
          <div className="h-9 w-56 rounded-lg bg-surface-container-low animate-pulse" aria-hidden="true" />
        ) : canEditSessions ? (
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={() => setCsvOpen(true)} className="btn-secondary">
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">upload_file</span> Import spreadsheet
            </button>
            <button onClick={openAdd} className="btn-primary">
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">add</span> Add session
            </button>
          </div>
        ) : null}
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

          {/* Feature 021 — a session is either regular (everyone together) or a breakout that splits
              into parallel rooms; the room editor only appears for breakouts. */}
          <fieldset className="border-t border-outline-variant mt-4 pt-3">
            <legend className="text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wide mb-2">Session format</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {([
                { value: false, icon: 'groups', label: 'Regular session', hint: 'Everyone attends together.' },
                { value: true, icon: 'meeting_room', label: 'Breakout session', hint: 'Splits into parallel rooms; each attendee goes to one.' },
              ] as const).map((opt) => (
                <label
                  key={opt.label}
                  className={`flex items-start gap-2 rounded-xl border p-3 cursor-pointer transition ${
                    isBreakout === opt.value ? 'border-primary/40 bg-primary/5' : 'border-outline-variant hover:border-primary/30'
                  }`}
                >
                  <input type="radio" name="session-format" className="mt-1" checked={isBreakout === opt.value} onChange={() => handleFormatChange(opt.value)} />
                  <span className="material-symbols-outlined text-[20px] text-on-surface-variant mt-0.5" aria-hidden="true">{opt.icon}</span>
                  <span>
                    <span className="block text-sm font-medium text-on-surface">{opt.label}</span>
                    <span className="block text-xs text-on-surface-variant">{opt.hint}</span>
                  </span>
                </label>
              ))}
            </div>
            {isBreakout && (
              <BreakoutRoomsEditor
                rooms={breakoutRooms}
                onChange={setBreakoutRooms}
                facilitators={facilitators}
                mode={breakoutMode}
                onModeChange={setBreakoutMode}
                headcounts={headcountByRoom}
                assignedTotal={assignedTotalByRoom}
              />
            )}
            {isBreakout && editing && (roomsBySession.get(editing.id)?.length ?? 0) > 0 && (
              <button type="button" className="btn-secondary text-sm mt-3" onClick={() => setPeopleSession(editing)}>
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">group</span> Manage people in these rooms
              </button>
            )}
          </fieldset>

          <SpeakersPanel
            facilitators={facilitators}
            speakers={speakers}
            onAdd={handleAddSpeaker}
            onRemove={handleRemoveSpeaker}
            onMove={handleMoveSpeaker}
            onChangeType={handleChangeSpeakerType}
          />

          {/* Feature 016 density pass — rarer settings (audience, accent colour)
              behind a disclosure; opened automatically when the session already uses them. */}
          <details className="border-t border-outline-variant mt-4 pt-3 group" open={moreOpen} onToggle={(e) => setMoreOpen((e.target as HTMLDetailsElement).open)}>
            <summary className="cursor-pointer select-none text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wide flex items-center gap-1">
              <span className="material-symbols-outlined text-[18px] transition-transform group-open:rotate-90" aria-hidden="true">chevron_right</span>
              More options
              <span className="normal-case tracking-normal font-normal text-xs text-on-surface-variant/80 ml-1">Audience, accent colour</span>
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
            {canEditSessions
              ? 'Build the programme attendees see in the app’s Agenda. Add sessions one by one, or bring in your whole schedule from a spreadsheet.'
              : 'The programme attendees see in the app’s Agenda will appear here.'}
          </p>
          {canEditSessions && (
            <div className="flex flex-wrap justify-center gap-2 mt-4">
              <button onClick={openAdd} className="btn-primary">
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">add</span> Add session
              </button>
              <button onClick={() => setCsvOpen(true)} className="btn-secondary">
                <span className="material-symbols-outlined text-[18px]" aria-hidden="true">upload_file</span> Import spreadsheet
              </button>
            </div>
          )}
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
                  const sessionRooms = roomsBySession.get(s.id) ?? [];
                  const roomCount = sessionRooms.length;
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
                        {canEditSessions ? (
                          <button
                            type="button"
                            onClick={() => openEdit(s)}
                            className="text-left text-sm font-semibold text-on-surface hover:text-primary truncate max-w-full block focus-visible:outline-none focus-visible:underline"
                            title={`Edit ${s.title}`}
                          >
                            {s.title}
                          </button>
                        ) : (
                          <p className="text-sm font-semibold text-on-surface truncate">{s.title}</p>
                        )}
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {s.block_type && (
                            <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-1.5 py-px rounded ${BLOCK_COLOR[s.block_type] ?? 'bg-surface-container-low text-on-surface-variant'}`}>
                              {BLOCK_TYPE_LABELS[s.block_type] ?? s.block_type}
                            </span>
                          )}
                          {roomCount > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold uppercase tracking-wider px-1.5 py-px rounded bg-tertiary-fixed text-on-tertiary-fixed-variant">
                              <span className="material-symbols-outlined text-[12px]" aria-hidden="true">meeting_room</span> Breakout · {roomCount} room{roomCount !== 1 ? 's' : ''}
                            </span>
                          )}
                          {roomCount > 0 && (
                            <span className="text-[11px] text-on-surface-variant">{BREAKOUT_MODE_LABELS[s.breakout_mode]?.label}</span>
                          )}
                        </div>
                        {roomCount > 0 && (
                          <p className="text-xs text-on-surface-variant truncate mt-0.5" title={sessionRooms.map((r) => r.name).join(' · ')}>
                            {sessionRooms.map((r) => r.name).join(' · ')}
                          </p>
                        )}
                      </div>
                      <p className="text-sm text-on-surface-variant truncate row-start-3 col-start-1 md:row-auto md:col-auto">
                        <span className="md:hidden material-symbols-outlined text-[14px] align-[-2px] mr-0.5" aria-hidden="true">location_on</span>
                        {s.location || (roomCount > 0
                          ? `${roomCount} room${roomCount !== 1 ? 's' : ''}`
                          : <span className="text-on-surface-variant/50">—</span>)}
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
                        {(canEditSessions || (canManageBreakouts && roomCount > 0)) && (
                          <RowActionsMenu
                            label={`Actions for ${s.title}`}
                            actions={[
                              ...(canManageBreakouts && roomCount > 0
                                ? [{ label: 'Manage people', icon: 'group', onSelect: () => setPeopleSession(s) }]
                                : []),
                              ...(canEditSessions
                                ? [
                                    { label: 'Edit', icon: 'edit', onSelect: () => openEdit(s) },
                                    { label: 'Delete', icon: 'delete', destructive: true, onSelect: () => handleDelete(s.id, s.title) },
                                  ]
                                : []),
                            ]}
                          />
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}

      <BreakoutAssignmentsModal
        open={peopleSession !== null}
        onClose={() => setPeopleSession(null)}
        onChanged={fetchData}
        eventId={eventId}
        session={peopleSession}
      />

      <CsvImportModal<AgendaCsvRow>
        open={csvOpen}
        onClose={() => setCsvOpen(false)}
        onImported={fetchData}
        title="Import Agenda Sessions"
        templateFilename="agenda-template.csv"
        columns={AGENDA_CSV_COLUMNS}
        sampleRows={AGENDA_CSV_SAMPLES}
        parseRow={parseAgendaCsvRow}
        refineResults={refineAgendaCsv}
        importRow={async () => ({ error: 'Sessions are imported together.' })}
        importAll={importAgendaAll}
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
