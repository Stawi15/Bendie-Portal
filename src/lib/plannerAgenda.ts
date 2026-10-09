import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { getPlannerAdminClient } from '@/lib/plannerAdmin';
import { resolveProductionCapability, type ProductionCapability } from '@/lib/plannerProduction';
import type { PlannerEventAccess } from '@/lib/plannerModuleAccess';

/**
 * Feature 018 — Planner Agenda authoring. Narrow, server-only access to the
 * Planner event's programme table `event_agenda_items` (the same table the
 * Feature 001 Bendie → Planner agenda push writes). No Portal-side copy.
 *
 * Permission is Production's (spec clarification; Planner has no agenda flag).
 * Rows pushed from a Bendie Agenda (`source_portal_session_id IS NOT NULL`) are
 * read-only here — the next push would overwrite any edit.
 *
 * Shape written matches Planner-native rows (verified live 2026-10-09): local
 * `agenda_date`, naive `start_at`/`end_at`, `start_time`/`end_time`, day number
 * and label. Every query is scoped to the resolved Planner event id.
 */

export type AgendaCapability = ProductionCapability;

export type AgendaItem = {
  id: number;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  dayNumber: number | null;
  dayLabel: string | null;
  title: string;
  subtitle: string | null;
  speakers: string | null;
  mc: string | null;
  roomName: string | null;
  trackName: string | null;
  itemType: string | null;
  description: string | null;
  notes: string | null;
  sortOrder: number;
  /** True for items pushed from a Bendie Agenda — edit them there. */
  readOnly: boolean;
};

export class AgendaValidationError extends Error {}
export class AgendaNotFoundError extends Error {}
export class AgendaReadOnlyError extends Error {}

const COLUMNS =
  'agenda_item_id,agenda_date,start_time,end_time,day_number,day_label,item_title,subtitle,speakers,mc,room_name,track_name,item_type,description,notes,sort_order,source_portal_session_id';

type Row = {
  agenda_item_id: number;
  agenda_date: string | null;
  start_time: string | null;
  end_time: string | null;
  day_number: number | null;
  day_label: string | null;
  item_title: string;
  subtitle: string | null;
  speakers: string | null;
  mc: string | null;
  room_name: string | null;
  track_name: string | null;
  item_type: string | null;
  description: string | null;
  notes: string | null;
  sort_order: number;
  source_portal_session_id: string | null;
};

const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

function toItem(r: Row): AgendaItem {
  return {
    id: r.agenda_item_id,
    date: r.agenda_date,
    startTime: hhmm(r.start_time),
    endTime: hhmm(r.end_time),
    dayNumber: r.day_number,
    dayLabel: r.day_label,
    title: r.item_title,
    subtitle: r.subtitle,
    speakers: r.speakers,
    mc: r.mc,
    roomName: r.room_name,
    trackName: r.track_name,
    itemType: r.item_type,
    description: r.description,
    notes: r.notes,
    sortOrder: r.sort_order,
    readOnly: r.source_portal_session_id !== null,
  };
}

/** Production's capability, from the shared Planner access check (plan D1). */
export async function resolveAgendaCapability(access: Extract<PlannerEventAccess, { kind: 'ready' }>): Promise<AgendaCapability> {
  if (access.canAdminister) return { hasPlannerIdentity: true, canView: true, canManage: true };
  if (!access.plannerProfileId) return { hasPlannerIdentity: false };
  return resolveProductionCapability(access.plannerEventId, access.plannerProfileId);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type AgendaInput = {
  title?: string;
  date?: string;
  startTime?: string | null;
  endTime?: string | null;
  dayNumber?: number | null;
  dayLabel?: string | null;
  subtitle?: string | null;
  speakers?: string | null;
  mc?: string | null;
  roomName?: string | null;
  trackName?: string | null;
  itemType?: string | null;
  description?: string | null;
  notes?: string | null;
  sortOrder?: number | null;
};

const TEXT_FIELDS = ['dayLabel', 'subtitle', 'speakers', 'mc', 'roomName', 'trackName', 'itemType', 'description', 'notes'] as const;
const ALLOWED = new Set<string>(['title', 'date', 'startTime', 'endTime', 'dayNumber', 'sortOrder', 'timeZone', ...TEXT_FIELDS]);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Validates a create (`partial = false`) or patch body; returns a normalized input. */
export function validateAgendaInput(body: unknown, partial: boolean): AgendaInput {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new AgendaValidationError('Malformed request body.');
  const raw = body as Record<string, unknown>;
  const unknown = Object.keys(raw).find((k) => !ALLOWED.has(k));
  if (unknown) throw new AgendaValidationError(`Unsupported field: ${unknown}.`);

  const out: AgendaInput = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(raw, k);
  const text = (k: string, max: number): string | null => {
    const v = raw[k];
    if (v === null || v === undefined) return null;
    if (typeof v !== 'string') throw new AgendaValidationError(`${k} must be text.`);
    const t = v.trim();
    if (t.length > max) throw new AgendaValidationError(`${k} must be at most ${max} characters.`);
    return t || null;
  };

  if (!partial || has('title')) {
    const title = text('title', 300);
    if (!title) throw new AgendaValidationError('Title is required.');
    out.title = title;
  }
  if (!partial || has('date')) {
    const date = text('date', 10);
    if (!date || !DATE_RE.test(date) || Number.isNaN(Date.parse(date))) throw new AgendaValidationError('Date is required (YYYY-MM-DD).');
    out.date = date;
  }
  for (const k of ['startTime', 'endTime'] as const) {
    if (has(k)) {
      const t = text(k, 5);
      if (t && !TIME_RE.test(t)) throw new AgendaValidationError(`${k === 'startTime' ? 'Start' : 'End'} time must be HH:MM.`);
      out[k] = t;
    }
  }
  for (const k of ['dayNumber', 'sortOrder'] as const) {
    if (has(k)) {
      const v = raw[k];
      if (v === null || v === undefined || v === '') out[k] = null;
      else if (typeof v !== 'number' || !Number.isInteger(v) || (k === 'dayNumber' && v < 1)) {
        throw new AgendaValidationError(`${k === 'dayNumber' ? 'Day number must be a whole number of 1 or more' : 'Sort order must be a whole number'}.`);
      } else out[k] = v;
    }
  }
  for (const k of TEXT_FIELDS) if (has(k)) out[k] = text(k, 2000);
  return out;
}

function assertTimeOrder(startTime: string | null | undefined, endTime: string | null | undefined) {
  if (startTime && endTime && endTime <= startTime) throw new AgendaValidationError('End time must be after start time.');
}

/** Day 1 = the Portal event's local start date (plan D4); null when unknown or before the start. */
function deriveDayNumber(date: string, eventStartLocalDate: string | null): number | null {
  if (!eventStartLocalDate) return null;
  const days = Math.round((Date.parse(date) - Date.parse(eventStartLocalDate)) / 86_400_000) + 1;
  return days >= 1 ? days : null;
}

const DEFAULT_TIME_ZONE = 'Africa/Nairobi';

/** A valid IANA time zone from the request, else Stawi's default. */
export function resolveTimeZone(raw: unknown): string {
  if (typeof raw === 'string' && raw.length <= 64) {
    try {
      new Intl.DateTimeFormat('en-CA', { timeZone: raw });
      return raw;
    } catch {
      // fall through to the default
    }
  }
  return DEFAULT_TIME_ZONE;
}

function timingColumns(date: string, startTime: string | null, endTime: string | null) {
  return {
    agenda_date: date,
    start_time: startTime ? `${startTime}:00` : null,
    end_time: endTime ? `${endTime}:00` : null,
    start_at: startTime ? `${date}T${startTime}:00` : null,
    end_at: endTime ? `${date}T${endTime}:00` : null,
  };
}

// ---------------------------------------------------------------------------
// Data access
// ---------------------------------------------------------------------------

/**
 * The Portal event's start date as a LOCAL calendar date (YYYY-MM-DD) in `timeZone` — day 1 for
 * derived day numbers (plan D4). `events.starts_at` is a timestamptz, so its UTC date can be the
 * previous day for an event starting just after local midnight (/code-review #6).
 */
export async function readPortalEventStartDate(eventId: string, timeZone: string): Promise<string | null> {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) return null;
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data } = await admin.from('events').select('starts_at').eq('id', eventId).maybeSingle();
  if (!data?.starts_at) return null;
  const start = new Date(data.starts_at);
  if (Number.isNaN(start.getTime())) return null;
  return start.toLocaleDateString('en-CA', { timeZone }); // en-CA formats as YYYY-MM-DD
}

/**
 * /code-review #2 — Planner orders an agenda day by sort_order before start time, so sort_order must
 * follow the times. Renumbers the day's Planner-native/Portal-authored rows (pushed rows keep the
 * order the push gives them) by start time (untimed first), then current sort_order, then id. Idempotent:
 * concurrent imports converge on the same order because every call recomputes from the full day.
 */
async function renumberDay(plannerEventId: number, date: string): Promise<void> {
  const planner = getPlannerAdminClient();
  const { data, error } = await planner
    .from('event_agenda_items')
    .select('agenda_item_id,start_time,sort_order')
    .eq('event_id', plannerEventId)
    .eq('agenda_date', date)
    .is('source_portal_session_id', null);
  if (error) throw error;
  const rows = (data ?? []) as { agenda_item_id: number; start_time: string | null; sort_order: number }[];
  rows.sort(
    (a, b) =>
      (a.start_time === null ? -1 : 0) - (b.start_time === null ? -1 : 0) ||
      (a.start_time ?? '').localeCompare(b.start_time ?? '') ||
      a.sort_order - b.sort_order ||
      a.agenda_item_id - b.agenda_item_id
  );
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].sort_order === i + 1) continue;
    const { error: updateError } = await planner
      .from('event_agenda_items')
      .update({ sort_order: i + 1 })
      .eq('event_id', plannerEventId)
      .eq('agenda_item_id', rows[i].agenda_item_id);
    if (updateError) throw updateError;
  }
}

// ---------------------------------------------------------------------------
// Planner agenda rows
// ---------------------------------------------------------------------------

export async function listAgendaItems(plannerEventId: number): Promise<AgendaItem[]> {
  const planner = getPlannerAdminClient();
  const { data, error } = await planner
    .from('event_agenda_items')
    .select(COLUMNS)
    .eq('event_id', plannerEventId)
    .order('agenda_date', { ascending: true, nullsFirst: false })
    .order('start_time', { ascending: true, nullsFirst: true })
    .order('sort_order', { ascending: true })
    .order('agenda_item_id', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as Row[]).map(toItem);
}

async function loadRow(plannerEventId: number, itemId: number): Promise<Row> {
  const planner = getPlannerAdminClient();
  const { data, error } = await planner.from('event_agenda_items').select(COLUMNS).eq('event_id', plannerEventId).eq('agenda_item_id', itemId).maybeSingle();
  if (error) throw error;
  if (!data) throw new AgendaNotFoundError('Agenda item not found.');
  return data as Row;
}

export async function createAgendaItem(plannerEventId: number, input: AgendaInput, eventStartLocalDate: string | null): Promise<AgendaItem> {
  const date = input.date as string;
  const startTime = input.startTime ?? null;
  const endTime = input.endTime ?? null;
  assertTimeOrder(startTime, endTime);

  const planner = getPlannerAdminClient();
  let sortOrder = input.sortOrder ?? null;
  if (sortOrder === null) {
    // sort_order is NOT NULL: provisional value, then renumberDay puts it in time order.
    const { data: last } = await planner
      .from('event_agenda_items')
      .select('sort_order')
      .eq('event_id', plannerEventId)
      .eq('agenda_date', date)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    sortOrder = (last?.sort_order ?? 0) + 1;
  }

  const { data, error } = await planner
    .from('event_agenda_items')
    .insert({
      event_id: plannerEventId,
      ...timingColumns(date, startTime, endTime),
      day_number: input.dayNumber ?? deriveDayNumber(date, eventStartLocalDate),
      day_label: input.dayLabel ?? null,
      item_title: input.title,
      subtitle: input.subtitle ?? null,
      speakers: input.speakers ?? null,
      mc: input.mc ?? null,
      room_name: input.roomName ?? null,
      track_name: input.trackName ?? null,
      item_type: input.itemType ?? null,
      description: input.description ?? null,
      notes: input.notes ?? null,
      sort_order: sortOrder,
    })
    .select(COLUMNS)
    .single();
  if (error) throw error;
  await renumberDay(plannerEventId, date);
  return toItem((await loadRow(plannerEventId, (data as Row).agenda_item_id)) as Row);
}

export async function updateAgendaItem(
  plannerEventId: number,
  itemId: number,
  input: AgendaInput,
  eventStartLocalDate: string | null
): Promise<AgendaItem> {
  const current = await loadRow(plannerEventId, itemId);
  if (current.source_portal_session_id !== null) throw new AgendaReadOnlyError('This item comes from the Bendie Agenda — edit it there.');

  const date = input.date ?? current.agenda_date ?? '';
  const startTime = input.startTime !== undefined ? input.startTime : hhmm(current.start_time);
  const endTime = input.endTime !== undefined ? input.endTime : hhmm(current.end_time);
  assertTimeOrder(startTime, endTime);

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.date !== undefined || input.startTime !== undefined || input.endTime !== undefined) {
    if (!date) throw new AgendaValidationError('Date is required (YYYY-MM-DD).');
    Object.assign(patch, timingColumns(date, startTime ?? null, endTime ?? null));
  }
  if (input.title !== undefined) patch.item_title = input.title;
  if (input.dayNumber !== undefined) patch.day_number = input.dayNumber ?? (date ? deriveDayNumber(date, eventStartLocalDate) : null);
  if (input.sortOrder !== undefined && input.sortOrder !== null) patch.sort_order = input.sortOrder;
  const map: Record<(typeof TEXT_FIELDS)[number], string> = {
    dayLabel: 'day_label',
    subtitle: 'subtitle',
    speakers: 'speakers',
    mc: 'mc',
    roomName: 'room_name',
    trackName: 'track_name',
    itemType: 'item_type',
    description: 'description',
    notes: 'notes',
  };
  for (const k of TEXT_FIELDS) if (input[k] !== undefined) patch[map[k]] = input[k];

  const planner = getPlannerAdminClient();
  const { data, error } = await planner
    .from('event_agenda_items')
    .update(patch)
    .eq('event_id', plannerEventId)
    .eq('agenda_item_id', itemId)
    .is('source_portal_session_id', null)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    // Changed since loadRow (deleted, or turned into a pushed row): report which.
    const latest = await loadRow(plannerEventId, itemId); // throws AgendaNotFoundError when deleted
    if (latest.source_portal_session_id !== null) throw new AgendaReadOnlyError('This item comes from the Bendie Agenda — edit it there.');
    throw new AgendaNotFoundError('Agenda item not found.');
  }
  const timingChanged = input.date !== undefined || input.startTime !== undefined || input.endTime !== undefined;
  if (timingChanged) {
    await renumberDay(plannerEventId, date);
    if (current.agenda_date && current.agenda_date !== date) await renumberDay(plannerEventId, current.agenda_date);
    return toItem(await loadRow(plannerEventId, itemId));
  }
  return toItem(data as Row);
}

export async function deleteAgendaItem(plannerEventId: number, itemId: number): Promise<void> {
  const current = await loadRow(plannerEventId, itemId);
  if (current.source_portal_session_id !== null) throw new AgendaReadOnlyError('This item comes from the Bendie Agenda — edit it there.');
  const planner = getPlannerAdminClient();
  const { error } = await planner
    .from('event_agenda_items')
    .delete()
    .eq('event_id', plannerEventId)
    .eq('agenda_item_id', itemId)
    .is('source_portal_session_id', null);
  if (error) throw error;
}
