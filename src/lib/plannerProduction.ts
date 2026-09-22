import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPlannerAdminClient } from '@/lib/plannerAdmin';

/**
 * Feature 014 — narrow, server-only Bendie Planner Production data-access
 * module. Own file, own permission domain (`can_view_production`, distinct
 * from Logistics' `can_view_logistics`) — not folded into
 * `plannerLogistics.ts`.
 *
 * Operates directly against the canonical `production_tasks` base table for
 * mutations and item reads, and against `production_sessions_v` (the exact
 * view the current Bendie Planner application reads) for list display —
 * `display_status` is the view's own computed column and is read from there
 * rather than re-derived in application code, so it can never drift from the
 * live app's own logic. No Portal-side copy, no sync layer.
 *
 * `advance_production_session` (a live production-day run-of-show control
 * RPC requiring a currently-active session) is deliberately NOT used here —
 * traced and confirmed structurally incompatible with an authoring workflow
 * building a future schedule (spec.md).
 */

export type ProductionCapability = { hasPlannerIdentity: false } | { hasPlannerIdentity: true; canView: boolean; canManage: boolean };
export type ResolvedProductionCapability = Extract<ProductionCapability, { hasPlannerIdentity: true }>;

export class PlannerProductionValidationError extends Error {
  code: 'invalid_request';
  constructor(message: string) {
    super(message);
    this.code = 'invalid_request';
  }
}

export class PlannerProductionNotFoundError extends Error {}

export async function resolveCallerPlannerIdentity(portalAuthClient: SupabaseClient, portalUserId: string): Promise<string | null> {
  const { data, error } = await portalAuthClient.from('profiles').select('planner_profile_id').eq('id', portalUserId).maybeSingle();
  if (error) {
    console.error('resolveCallerPlannerIdentity (production): profiles lookup failed', error);
    return null;
  }
  return data?.planner_profile_id ?? null;
}

/** `can_view_production` is a real, Feature-008-administered flag (same shape as Logistics' `can_view_logistics`) — `canView` honors it directly. `canManage` is always `false` here; manage authority only ever comes from the Portal-layer `canAdministerPlannerPermissions` check, applied by the route. */
export async function resolveProductionCapability(plannerEventId: number, plannerProfileId: string): Promise<ResolvedProductionCapability> {
  const planner = getPlannerAdminClient();

  const { data: profile, error: profileError } = await planner.from('profiles').select('is_platform_admin, role').eq('id', plannerProfileId).maybeSingle();
  if (profileError) throw profileError;

  const role = (profile?.role ?? '').trim().toLowerCase();
  const isPlatformAdmin = profile?.is_platform_admin === true || ['admin', 'super_admin', 'superadmin'].includes(role);
  if (isPlatformAdmin) {
    return { hasPlannerIdentity: true, canView: true, canManage: true };
  }

  const { data: assignment, error: assignmentError } = await planner
    .from('event_user_assignments')
    .select('can_view_production')
    .eq('event_id', plannerEventId)
    .eq('profile_id', plannerProfileId)
    .eq('is_active', true)
    .maybeSingle();
  if (assignmentError) throw assignmentError;

  return { hasPlannerIdentity: true, canView: assignment?.can_view_production === true, canManage: false };
}

export type ProductionSession = {
  id: number;
  sessionTitle: string | null;
  sessionDate: string | null;
  dayNumber: number | null;
  startTime: string | null;
  endTime: string | null;
  taskType: string | null;
  trackName: string | null;
  roomName: string | null;
  isParallel: boolean;
  parentProductionId: number | null;
  sortOrder: number | null;
  participants: string | null;
  mode: string | null;
  micType: string | null;
  presentation: string | null;
  mainScreen: string | null;
  notes: string | null;
  stageHandNotes: string | null;
  guestExperience: string | null;
  status: string | null;
  displayStatus: string | null;
  slidesFileName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type ProductionSessionCreateInput = {
  sessionTitle: string;
  sessionDate: string;
  dayNumber?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  taskType?: string | null;
  trackName?: string | null;
  roomName?: string | null;
  isParallel?: boolean;
  parentProductionId?: number | null;
  sortOrder?: number | null;
  participants?: string | null;
  mode?: string | null;
  micType?: string | null;
  presentation?: string | null;
  mainScreen?: string | null;
  notes?: string | null;
  stageHandNotes?: string | null;
  guestExperience?: string | null;
  status?: string | null;
};

export type ProductionSessionPatch = Partial<Omit<ProductionSessionCreateInput, 'sessionTitle' | 'sessionDate'>> & {
  sessionTitle?: string;
  sessionDate?: string;
};

const SESSION_VIEW_COLUMNS =
  'production_id, event_id, session_title, session_date, day_number, start_time, end_time, task_type, track_name, room_name, is_parallel, ' +
  'participants, mode, mic_type, presentation, main_screen, notes, stage_hand_notes, guest_experience, display_status, sort_key';

const SESSION_BASE_COLUMNS =
  'production_id, event_id, session_title, session_date, day_number, start_time, end_time, start_at, end_at, base_start_time, base_end_time, base_start_at, base_end_at, ' +
  'task_type, track_name, room_name, is_parallel, parent_production_id, sort_order, participants, mode, mic_type, presentation, main_screen, notes, stage_hand_notes, ' +
  'guest_experience, status, slides_file_name, created_at, updated_at';

type RawViewRow = {
  production_id: number;
  session_title: string | null;
  session_date: string | null;
  day_number: number | null;
  start_time: string | null;
  end_time: string | null;
  task_type: string | null;
  track_name: string | null;
  room_name: string | null;
  is_parallel: boolean;
  participants: string | null;
  mode: string | null;
  mic_type: string | null;
  presentation: string | null;
  main_screen: string | null;
  notes: string | null;
  stage_hand_notes: string | null;
  guest_experience: string | null;
  display_status: string | null;
  sort_key: number | null;
};

type RawBaseRow = {
  production_id: number;
  event_id: number;
  session_title: string | null;
  session_date: string | null;
  day_number: number | null;
  start_time: string | null;
  end_time: string | null;
  start_at: string | null;
  end_at: string | null;
  base_start_time: string;
  base_end_time: string;
  base_start_at: string | null;
  base_end_at: string | null;
  task_type: string | null;
  track_name: string | null;
  room_name: string | null;
  is_parallel: boolean;
  parent_production_id: number | null;
  sort_order: number | null;
  participants: string | null;
  mode: string | null;
  mic_type: string | null;
  presentation: string | null;
  main_screen: string | null;
  notes: string | null;
  stage_hand_notes: string | null;
  guest_experience: string | null;
  status: string | null;
  slides_file_name: string | null;
  created_at: string | null;
  updated_at: string | null;
};

function shapeFromView(row: RawViewRow): ProductionSession {
  return {
    id: row.production_id,
    sessionTitle: row.session_title,
    sessionDate: row.session_date,
    dayNumber: row.day_number,
    startTime: row.start_time,
    endTime: row.end_time,
    taskType: row.task_type,
    trackName: row.track_name,
    roomName: row.room_name,
    isParallel: row.is_parallel,
    parentProductionId: null,
    sortOrder: row.sort_key,
    participants: row.participants,
    mode: row.mode,
    micType: row.mic_type,
    presentation: row.presentation,
    mainScreen: row.main_screen,
    notes: row.notes,
    stageHandNotes: row.stage_hand_notes,
    guestExperience: row.guest_experience,
    status: null,
    displayStatus: row.display_status,
    slidesFileName: null,
    createdAt: null,
    updatedAt: null,
  };
}

function shapeFromBase(row: RawBaseRow): ProductionSession {
  return {
    id: row.production_id,
    sessionTitle: row.session_title,
    sessionDate: row.session_date,
    dayNumber: row.day_number,
    startTime: row.start_time,
    endTime: row.end_time,
    taskType: row.task_type,
    trackName: row.track_name,
    roomName: row.room_name,
    isParallel: row.is_parallel,
    parentProductionId: row.parent_production_id,
    sortOrder: row.sort_order,
    participants: row.participants,
    mode: row.mode,
    micType: row.mic_type,
    presentation: row.presentation,
    mainScreen: row.main_screen,
    notes: row.notes,
    stageHandNotes: row.stage_hand_notes,
    guestExperience: row.guest_experience,
    status: row.status,
    displayStatus: null,
    slidesFileName: row.slides_file_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/** Reads `production_sessions_v` — the exact view the current Planner application consumes — for list display, sorted to match its own `sort_key` ordering. */
export async function listSessions(plannerEventId: number): Promise<ProductionSession[]> {
  const planner = getPlannerAdminClient();
  const { data, error } = await planner.from('production_sessions_v').select(SESSION_VIEW_COLUMNS).eq('event_id', plannerEventId);
  if (error) throw error;
  const sessions = (data ?? []).map((row) => shapeFromView(row as unknown as RawViewRow));
  return sessions.sort((a, b) => (a.sessionDate ?? '').localeCompare(b.sessionDate ?? '') || (a.sortOrder ?? 999999) - (b.sortOrder ?? 999999));
}

/** Reads the base table (never the view) — mutations need the raw editable columns (`start_at`/`base_*`) the view never exposes. Item-scope check. */
export async function getSession(plannerEventId: number, productionId: number): Promise<ProductionSession | null> {
  const planner = getPlannerAdminClient();
  const { data, error } = await planner.from('production_tasks').select(SESSION_BASE_COLUMNS).eq('production_id', productionId).eq('event_id', plannerEventId).maybeSingle();
  if (error) throw error;
  return data ? shapeFromBase(data as unknown as RawBaseRow) : null;
}

/**
 * Live `production_tasks` CHECK constraint (`production_tasks_status_chk`,
 * discovered only during live verification — not caught by the FK/PK-only
 * constraint query in the original discovery pass): `status`, when
 * non-null, must be exactly one of these five values (case/whitespace
 * insensitive). `NULL` is always allowed (the "Auto" / time-based-detection
 * case).
 */
const VALID_STATUSES = new Set(['pending', 'ready', 'active', 'completed', 'cancelled']);

function validateStatus(status: string | null): string | null {
  if (status === null) return null;
  if (!VALID_STATUSES.has(status.trim().toLowerCase())) {
    throw new PlannerProductionValidationError('status must be one of: pending, ready, active, completed, cancelled.');
  }
  return status.trim();
}

/** Combines a date with a time-of-day into a plain `timestamp` string. Returns `null` when `time` is `null` — never synthesizes a fake `00:00:00` timestamp, because two synthesized-equal `_at` timestamps would violate the live `..._before_..._chk` `CHECK (start_at < end_at)` constraint (also discovered only during live verification) when both start and end are otherwise absent. */
function combineDateTimeOrNull(date: string, time: string | null): string | null {
  if (!time) return null;
  return `${date} ${time}`;
}

/**
 * `base_start_time`/`base_end_time` are the only `NOT NULL` timing columns
 * (defaulted to `00:00:00` when absent — safe, since no CHECK constraint
 * applies to the time-only pair, only to the timestamp `_at` pair).
 * `start_at`/`end_at`/`base_start_at`/`base_end_at` are mirrored to the same
 * initial values whenever a time is given, so `production_sessions_v`'s
 * automatic Active/Completed detection can actually function (plan.md's
 * mechanical finding) — left `null` when the corresponding time is absent,
 * satisfying the live `CHECK (start_at IS NULL OR end_at IS NULL OR
 * start_at < end_at)` constraint rather than fighting it.
 */
function computeTimingFields(sessionDate: string, startTime: string | null, endTime: string | null) {
  if (startTime && endTime && startTime >= endTime) {
    throw new PlannerProductionValidationError('End time must be after start time.');
  }
  const startAt = combineDateTimeOrNull(sessionDate, startTime);
  const endAt = combineDateTimeOrNull(sessionDate, endTime);
  return {
    start_time: startTime,
    end_time: endTime,
    start_at: startAt,
    end_at: endAt,
    base_start_time: startTime ?? '00:00:00',
    base_end_time: endTime ?? '00:00:00',
    base_start_at: startAt,
    base_end_at: endAt,
  };
}

export async function createSession(plannerEventId: number, input: ProductionSessionCreateInput): Promise<ProductionSession> {
  const sessionTitle = input.sessionTitle?.trim();
  if (!sessionTitle) throw new PlannerProductionValidationError('Session title is required.');
  if (!input.sessionDate) throw new PlannerProductionValidationError('Session date is required.');
  if (input.parentProductionId != null) {
    const parent = await getSession(plannerEventId, input.parentProductionId);
    if (!parent) throw new PlannerProductionValidationError('The selected parallel-parent session was not found in this event.');
  }

  const startTime = normalizeOptionalString(input.startTime);
  const endTime = normalizeOptionalString(input.endTime);
  const timing = computeTimingFields(input.sessionDate, startTime, endTime);
  const status = validateStatus(normalizeOptionalString(input.status));

  const planner = getPlannerAdminClient();
  const { data, error } = await planner
    .from('production_tasks')
    .insert({
      event_id: plannerEventId,
      session_title: sessionTitle,
      session_date: input.sessionDate,
      day_number: input.dayNumber ?? null,
      ...timing,
      task_type: normalizeOptionalString(input.taskType),
      track_name: normalizeOptionalString(input.trackName),
      room_name: normalizeOptionalString(input.roomName),
      is_parallel: input.isParallel ?? false,
      parent_production_id: input.parentProductionId ?? null,
      sort_order: input.sortOrder ?? null,
      participants: normalizeOptionalString(input.participants),
      mode: normalizeOptionalString(input.mode),
      mic_type: normalizeOptionalString(input.micType),
      presentation: normalizeOptionalString(input.presentation),
      main_screen: normalizeOptionalString(input.mainScreen),
      notes: normalizeOptionalString(input.notes),
      stage_hand_notes: normalizeOptionalString(input.stageHandNotes),
      guest_experience: normalizeOptionalString(input.guestExperience),
      status,
    })
    .select('production_id')
    .single();
  if (error) throw error;

  const session = await getSession(plannerEventId, data.production_id as number);
  if (!session) throw new Error('plannerProduction: session vanished immediately after creation');
  return session;
}

/** Re-mirrors `base_*` to any edited timing — Feature 014 never implements live-day advancement, so there is no baseline-vs-actual distinction to preserve during authoring. */
export async function updateSession(plannerEventId: number, productionId: number, patch: ProductionSessionPatch): Promise<ProductionSession> {
  const existing = await getSession(plannerEventId, productionId);
  if (!existing) throw new PlannerProductionNotFoundError('Session not found.');

  if (patch.parentProductionId != null) {
    if (patch.parentProductionId === productionId) throw new PlannerProductionValidationError('A session cannot be its own parallel parent.');
    const parent = await getSession(plannerEventId, patch.parentProductionId);
    if (!parent) throw new PlannerProductionValidationError('The selected parallel-parent session was not found in this event.');
  }

  const updates: Record<string, unknown> = {};
  if ('sessionTitle' in patch) {
    const sessionTitle = patch.sessionTitle?.trim();
    if (!sessionTitle) throw new PlannerProductionValidationError('Session title is required.');
    updates.session_title = sessionTitle;
  }
  if ('sessionDate' in patch) {
    if (!patch.sessionDate) throw new PlannerProductionValidationError('Session date is required.');
    updates.session_date = patch.sessionDate;
  }
  if ('dayNumber' in patch) updates.day_number = patch.dayNumber ?? null;
  if ('taskType' in patch) updates.task_type = normalizeOptionalString(patch.taskType);
  if ('trackName' in patch) updates.track_name = normalizeOptionalString(patch.trackName);
  if ('roomName' in patch) updates.room_name = normalizeOptionalString(patch.roomName);
  if (typeof patch.isParallel === 'boolean') updates.is_parallel = patch.isParallel;
  if ('parentProductionId' in patch) updates.parent_production_id = patch.parentProductionId ?? null;
  if ('sortOrder' in patch) updates.sort_order = patch.sortOrder ?? null;
  if ('participants' in patch) updates.participants = normalizeOptionalString(patch.participants);
  if ('mode' in patch) updates.mode = normalizeOptionalString(patch.mode);
  if ('micType' in patch) updates.mic_type = normalizeOptionalString(patch.micType);
  if ('presentation' in patch) updates.presentation = normalizeOptionalString(patch.presentation);
  if ('mainScreen' in patch) updates.main_screen = normalizeOptionalString(patch.mainScreen);
  if ('notes' in patch) updates.notes = normalizeOptionalString(patch.notes);
  if ('stageHandNotes' in patch) updates.stage_hand_notes = normalizeOptionalString(patch.stageHandNotes);
  if ('guestExperience' in patch) updates.guest_experience = normalizeOptionalString(patch.guestExperience);
  if ('status' in patch) updates.status = validateStatus(normalizeOptionalString(patch.status));

  const startTime = 'startTime' in patch ? normalizeOptionalString(patch.startTime) : undefined;
  const endTime = 'endTime' in patch ? normalizeOptionalString(patch.endTime) : undefined;
  if (startTime !== undefined || endTime !== undefined || 'sessionDate' in patch) {
    const effectiveDate = ('sessionDate' in patch ? patch.sessionDate : existing.sessionDate) ?? existing.sessionDate;
    const effectiveStart = startTime !== undefined ? startTime : existing.startTime;
    const effectiveEnd = endTime !== undefined ? endTime : existing.endTime;
    if (effectiveDate) {
      Object.assign(updates, computeTimingFields(effectiveDate, effectiveStart, effectiveEnd));
    }
  }

  if (Object.keys(updates).length === 0) {
    throw new PlannerProductionValidationError('At least one field is required.');
  }

  const planner = getPlannerAdminClient();
  const { error } = await planner.from('production_tasks').update(updates).eq('production_id', productionId).eq('event_id', plannerEventId);
  if (error) throw error;

  const session = await getSession(plannerEventId, productionId);
  if (!session) throw new PlannerProductionNotFoundError('Session not found.');
  return session;
}

/** `parent_production_id` is `NO ACTION` on delete — pre-checks to turn a raw FK violation into a clean operator-readable message. */
export async function deleteSession(plannerEventId: number, productionId: number): Promise<void> {
  const planner = getPlannerAdminClient();
  const { count, error: countError } = await planner.from('production_tasks').select('production_id', { count: 'exact', head: true }).eq('parent_production_id', productionId);
  if (countError) throw countError;
  if (count && count > 0) {
    throw new PlannerProductionValidationError('Other sessions reference this one as their parallel parent — reassign or delete those first.');
  }

  const { data, error } = await planner.from('production_tasks').delete().eq('production_id', productionId).eq('event_id', plannerEventId).select('production_id').maybeSingle();
  if (error) throw error;
  if (!data) throw new PlannerProductionNotFoundError('Session not found.');
}

export function normalizePlannerProductionError(err: unknown): { category: string; message: string } {
  if (err instanceof PlannerProductionValidationError) {
    return { category: err.code, message: err.message };
  }
  if (err instanceof PlannerProductionNotFoundError) {
    return { category: 'production_session_not_found', message: err.message };
  }
  console.error('plannerProduction: unexpected error', err);
  return { category: 'planner_write_failed', message: 'Could not save — try again.' };
}
