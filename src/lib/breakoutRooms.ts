import type { BreakoutMode } from '@/types/database';
import { getField, type ColumnSpec, type RowResult } from '@/lib/csvImport';

/**
 * Feature 021 — Bendie breakout rooms. Pure helpers only (no Supabase calls): editor form
 * types, rows ⇄ form mapping, the save_breakout_rooms payload and validation. Rooms are stored in
 * agenda_breakout_rooms / agenda_breakout_room_items; agenda_sessions.breakout_rooms is derived
 * from them by the database for the released attendee app.
 */

export type BreakoutRoomRow = {
  id: string;
  session_id: string;
  name: string;
  description: string | null;
  location: string | null;
  facilitator_id: string | null;
  facilitator_name: string | null;
  capacity: number | null;
  display_order: number;
};

export type BreakoutRoomItemRow = {
  id: string;
  room_id: string;
  title: string;
  description: string | null;
  starts_at: string | null;
  ends_at: string | null;
  location: string | null;
  display_order: number;
};

export type BreakoutBlockForm = {
  /** Saved block id, or a client-only key for a new block (see `isNew`). */
  id: string;
  isNew: boolean;
  title: string;
  description: string;
  starts_at: string; // datetime-local value
  ends_at: string;
  location: string;
};

export type BreakoutRoomForm = {
  /** Saved room id, or a client-only key for a new room (see `isNew`). */
  id: string;
  isNew: boolean;
  name: string;
  description: string;
  location: string;
  facilitator_id: string;
  /** Free-text facilitator kept from before rooms linked to Speakers; shown until a Speaker is picked. */
  legacyFacilitatorName: string;
  capacity: string;
  blocks: BreakoutBlockForm[];
};

export const BREAKOUT_MODE_LABELS: Record<BreakoutMode, { label: string; hint: string }> = {
  attendee_choice: { label: 'Attendees choose', hint: 'Attendees pick a room in the app and can switch while seats are free.' },
  organizer_assigns: { label: 'Organiser assigns', hint: 'You place attendees; they see their room and cannot change it.' },
  preassigned_switchable: { label: 'Pre-assigned, can switch', hint: 'You place attendees first; they can move to another room with free seats.' },
};

export const BREAKOUT_MODES = Object.keys(BREAKOUT_MODE_LABELS) as BreakoutMode[];

export const normalizeName = (s: string) => s.trim().toLowerCase();

/** Same session = same title (ignoring case/spaces) and same start, to the minute (agenda spreadsheet re-uploads). */
export const sessionMatchKey = (title: string, startIso: string) =>
  `${normalizeName(title)}|${Math.floor(new Date(startIso).getTime() / 60000)}`;

const pad = (n: number) => String(n).padStart(2, '0');

/** ISO → `datetime-local` value in the browser's local time (same rule as the agenda page). */
export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const localToIso = (value: string) => (value ? new Date(value).toISOString() : null);
const blankToNull = (value: string) => (value.trim() ? value.trim() : null);

export function newRoomForm(): BreakoutRoomForm {
  return { id: crypto.randomUUID(), isNew: true, name: '', description: '', location: '', facilitator_id: '', legacyFacilitatorName: '', capacity: '', blocks: [] };
}

export function newBlockForm(): BreakoutBlockForm {
  return { id: crypto.randomUUID(), isNew: true, title: '', description: '', starts_at: '', ends_at: '', location: '' };
}

/** The session's saved rooms (already filtered to one session) as editor state, in display order. */
export function roomsFromRows(rooms: BreakoutRoomRow[], items: BreakoutRoomItemRow[]): BreakoutRoomForm[] {
  return [...rooms]
    .sort((a, b) => a.display_order - b.display_order)
    .map((r) => ({
      id: r.id,
      isNew: false,
      name: r.name,
      description: r.description ?? '',
      location: r.location ?? '',
      facilitator_id: r.facilitator_id ?? '',
      legacyFacilitatorName: r.facilitator_id ? '' : r.facilitator_name ?? '',
      capacity: r.capacity == null ? '' : String(r.capacity),
      blocks: items
        .filter((i) => i.room_id === r.id)
        .sort((a, b) => a.display_order - b.display_order)
        .map((i) => ({
          id: i.id,
          isNew: false,
          title: i.title,
          description: i.description ?? '',
          starts_at: toLocalInput(i.starts_at),
          ends_at: toLocalInput(i.ends_at),
          location: i.location ?? '',
        })),
    }));
}

/**
 * Editor state → `p_rooms` for save_breakout_rooms (editor save: every room sends every field and
 * its full block list). A legacy free-text facilitator name is sent back as-is until a Speaker is
 * chosen (the database clears it then) or the organiser removes it.
 */
export function toSaveRoomsPayload(forms: BreakoutRoomForm[]) {
  return forms.map((r) => {
    const room: Record<string, unknown> = {
      ...(r.isNew ? {} : { id: r.id }),
      name: r.name.trim(),
      description: blankToNull(r.description),
      location: blankToNull(r.location),
      facilitator_id: r.facilitator_id || null,
      facilitator_name: r.facilitator_id ? null : blankToNull(r.legacyFacilitatorName),
      capacity: r.capacity.trim() ? Number(r.capacity) : null,
      blocks: r.blocks.map((b) => ({
        ...(b.isNew ? {} : { id: b.id }),
        title: b.title.trim(),
        description: blankToNull(b.description),
        starts_at: localToIso(b.starts_at),
        ends_at: localToIso(b.ends_at),
        location: blankToNull(b.location),
      })),
    };
    return room;
  });
}

/** Client-side check before saving; returns the first problem in plain language, or null. */
export function validateRoomForms(forms: BreakoutRoomForm[]): string | null {
  const seen = new Set<string>();
  for (const r of forms) {
    const name = r.name.trim();
    if (!name) return 'Every breakout room needs a name.';
    if (name.length > 200) return `Room name "${name.slice(0, 40)}…" is longer than 200 characters.`;
    if (seen.has(normalizeName(name))) return `Room names must be unique in a session ("${name}").`;
    seen.add(normalizeName(name));
    if (r.description.length > 2000) return `The description of "${name}" is longer than 2000 characters.`;
    if (r.location.length > 200) return `The location of "${name}" is longer than 200 characters.`;
    if (r.capacity.trim() && !/^[1-9]\d*$/.test(r.capacity.trim())) return `Capacity for "${name}" must be a whole number of 1 or more (or blank for no limit).`;
    for (const b of r.blocks) {
      const title = b.title.trim();
      if (!title) return `Every time block in "${name}" needs a title.`;
      if (title.length > 300) return `A time block title in "${name}" is longer than 300 characters.`;
      if (b.description.length > 2000) return `A time block description in "${name}" is longer than 2000 characters.`;
      if (b.location.length > 200) return `A time block location in "${name}" is longer than 200 characters.`;
      if (b.starts_at && b.ends_at && new Date(b.ends_at) <= new Date(b.starts_at)) return `"${title}" in "${name}" must end after it starts.`;
    }
  }
  return null;
}

// ─── People list (Feature 021 US3, simplified 2026-10-14) ─────────────────────
// One list per breakout session, downloaded and uploaded from "Manage people":
// attendee email, name (reference only), room. A blank room means "not in a room".

export const PEOPLE_LIST_COLUMNS: ColumnSpec[] = [
  { key: 'attendee_email', label: 'Attendee email', required: true },
  { key: 'attendee_name', label: 'Name (for reference — not imported)' },
  { key: 'room', label: 'Room (blank = not in a room)' },
];

export const PEOPLE_LIST_SAMPLES: Record<string, string>[] = [
  { attendee_email: 'jane@example.com', attendee_name: 'Jane Achieng', room: 'Room A: Innovation Lab' },
  { attendee_email: 'sam@example.com', attendee_name: 'Sam Otieno', room: 'Room B: Leadership Circle' },
  { attendee_email: 'lee@example.com', attendee_name: 'Lee Wanjiru', room: '' },
];

export type PeopleListRow = { rowIndex: number; userId: string; email: string; roomId: string | null };
type ListRoom = { id: string; name: string; capacity: number | null };
type ListAttendee = { user_id: string; email: string; name: string };

export function parsePeopleListRow(
  raw: Record<string, string>,
  rowIndex: number,
  ctx: { rooms: ListRoom[]; attendeesByEmail: Map<string, ListAttendee> }
): RowResult<PeopleListRow> {
  const errors: string[] = [];
  const email = getField(raw, 'attendee_email');
  const attendee = email ? ctx.attendeesByEmail.get(normalizeName(email)) : undefined;
  if (!email) errors.push('attendee_email is required');
  else if (!attendee) errors.push(`"${email}" is not an attendee of this event — add them on the Attendees tab first`);

  const roomName = getField(raw, 'room');
  let roomId: string | null = null;
  if (roomName) {
    const room = ctx.rooms.find((r) => normalizeName(r.name) === normalizeName(roomName));
    if (!room) errors.push(`Room "${roomName}" doesn't exist in this session (rooms: ${ctx.rooms.map((r) => r.name).join(', ')})`);
    else roomId = room.id;
  }

  const data = attendee ? { rowIndex, userId: attendee.user_id, email, roomId } : undefined;
  return { rowIndex, raw, data: errors.length === 0 ? data : undefined, errors };
}

/** The same person twice in one list is ambiguous: every such row is an error. */
export function refinePeopleList(results: RowResult<PeopleListRow>[]): RowResult<PeopleListRow>[] {
  const counts = new Map<string, number>();
  for (const r of results) if (r.data) counts.set(r.data.userId, (counts.get(r.data.userId) ?? 0) + 1);
  return results.map((r) =>
    r.data && (counts.get(r.data.userId) ?? 0) > 1
      ? { ...r, data: undefined, errors: [...r.errors, `${r.data.email} appears more than once — keep one row`] }
      : r
  );
}

/** Rooms that would be over capacity after the upload (current attendees only). */
export function peopleListCapacityWarnings(
  rows: PeopleListRow[],
  current: { user_id: string; room_id: string }[],
  rooms: ListRoom[],
  attendeeIds: Set<string>
): string[] {
  const placement = new Map<string, string | null>();
  for (const a of current) if (attendeeIds.has(a.user_id)) placement.set(a.user_id, a.room_id);
  for (const r of rows) placement.set(r.userId, r.roomId);
  const counts = new Map<string, number>();
  for (const roomId of placement.values()) if (roomId) counts.set(roomId, (counts.get(roomId) ?? 0) + 1);
  return rooms
    .filter((room) => room.capacity != null && (counts.get(room.id) ?? 0) > room.capacity)
    .map((room) => `${room.name}: ${counts.get(room.id)} / ${room.capacity} after this upload — over capacity`);
}

/** Every attendee with their current room (blank when not in one) — uploading it unchanged changes nothing. */
export function buildPeopleListRows(attendees: ListAttendee[], assignments: { user_id: string; room_id: string }[], rooms: ListRoom[]) {
  const roomName = new Map(rooms.map((r) => [r.id, r.name]));
  const placed = new Map(assignments.map((a) => [a.user_id, a.room_id]));
  return attendees
    .map((a) => ({ attendee_email: a.email, attendee_name: a.name, room: roomName.get(placed.get(a.user_id) ?? '') ?? '' }))
    .sort((x, y) => (x.room === '' ? 1 : 0) - (y.room === '' ? 1 : 0) || x.room.localeCompare(y.room) || x.attendee_name.localeCompare(y.attendee_name));
}
