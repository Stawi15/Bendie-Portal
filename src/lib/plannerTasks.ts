import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPlannerAdminClient } from '@/lib/plannerAdmin';

/**
 * Feature 007 — narrow, server-only Bendie Planner Tasks data-access module.
 * Deliberately not a generic Planner repository: exposes exactly the
 * operations the Tasks module needs, each with an explicit column list, never
 * `select('*')` (FR-058). Route-handler concerns (NextRequest/NextResponse,
 * cookies, HTTP status mapping) stay out of this file entirely — see
 * `src/app/api/events/[eventId]/planner-tasks*` for those.
 *
 * `/speckit.analyze` corrections applied here (see tasks.md's Correction
 * Log): status/priority comparisons are case-insensitive and canonicalized on
 * read (the live `enforce_operational_task_status()` trigger stores
 * `'In progress'`, not `'In Progress'`, for that one state); platform-admin
 * detection checks both `profiles.is_platform_admin` and `profiles.role`
 * (matching the live `is_platform_admin()` SQL function exactly); a genuine
 * Planner query failure always throws rather than being reported as an
 * ordinary denial.
 */

export const TASK_STATUS_VALUES = ['Pending', 'In Progress', 'Completed'] as const;
export const TASK_PRIORITY_VALUES = ['Low', 'Medium', 'High'] as const;

export type PlannerTaskStatus = (typeof TASK_STATUS_VALUES)[number];
export type PlannerTaskPriority = (typeof TASK_PRIORITY_VALUES)[number];

/** Explicit allowlist projection returned to the client — never the raw `operational_tasks` row (FR-058). */
export type PlannerTask = {
  taskId: number;
  taskCode: string;
  task: string;
  category: string | null;
  status: PlannerTaskStatus;
  priority: PlannerTaskPriority;
  dueDate: string | null;
  remarks: string | null;
  assignedProfileId: string | null;
  /** FR-032/FR-033: a historical/inactive/unresolvable assignee still renders a safe label, never omitted or cleared. */
  assignedProfileName: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TaskCapability =
  | { hasPlannerIdentity: false }
  | { hasPlannerIdentity: true; canView: boolean; canManage: boolean };

/** The narrower shape `resolveTaskCapability` always returns — it is only ever called once a non-null Planner identity is already confirmed (T005), so it structurally never produces the `hasPlannerIdentity: false` arm of `TaskCapability`. */
export type ResolvedTaskCapability = Extract<TaskCapability, { hasPlannerIdentity: true }>;

export type AssignableStaffMember = { profileId: string; name: string };

/** Distinguishable error categories `normalizePlannerTaskError` maps to safe, documented contract codes. */
export class PlannerTaskValidationError extends Error {
  code: 'invalid_request' | 'invalid_status' | 'invalid_priority' | 'invalid_assignee';
  constructor(code: PlannerTaskValidationError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

export class PlannerTaskNotFoundError extends Error {}

const STATUS_CANONICAL: Record<string, PlannerTaskStatus> = {
  pending: 'Pending',
  'in progress': 'In Progress',
  completed: 'Completed',
};

const PRIORITY_CANONICAL: Record<string, PlannerTaskPriority> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

function normalizeKey(value: string): string {
  return value.trim().toLowerCase();
}

/** Case-insensitive — a task read back with the live trigger's `'In progress'` casing must still validate if resubmitted unchanged. */
export function validateTaskStatus(value: unknown): value is PlannerTaskStatus {
  return typeof value === 'string' && normalizeKey(value) in STATUS_CANONICAL;
}

export function validateTaskPriority(value: unknown): value is PlannerTaskPriority {
  return typeof value === 'string' && normalizeKey(value) in PRIORITY_CANONICAL;
}

function canonicalizeStatus(value: string): PlannerTaskStatus {
  return STATUS_CANONICAL[normalizeKey(value)] ?? 'Pending';
}

function canonicalizePriority(value: string): PlannerTaskPriority {
  return PRIORITY_CANONICAL[normalizeKey(value)] ?? 'Medium';
}

const TASK_SELECT_COLUMNS =
  'task_id, task_code, task, category, status, priority, due_date, remarks, assigned_profile_id, created_at, updated_at, profiles(full_name)';

type RawTaskRow = {
  task_id: number;
  task_code: string | null;
  task: string;
  category: string | null;
  status: string | null;
  priority: string | null;
  due_date: string | null;
  remarks: string | null;
  assigned_profile_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  profiles?: { full_name: string | null } | { full_name: string | null }[] | null;
};

/** Explicit allowlist projection — never spreads the raw row (FR-058). */
function shapePlannerTask(row: RawTaskRow): PlannerTask {
  const assigneeProfile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
  return {
    taskId: row.task_id,
    taskCode: row.task_code ?? '',
    task: row.task,
    category: row.category,
    status: row.status ? canonicalizeStatus(row.status) : 'Pending',
    priority: row.priority ? canonicalizePriority(row.priority) : 'Medium',
    dueDate: row.due_date,
    remarks: row.remarks,
    assignedProfileId: row.assigned_profile_id,
    assignedProfileName: !row.assigned_profile_id
      ? null
      : assigneeProfile
        ? assigneeProfile.full_name?.trim() || 'Unnamed staff member'
        : 'Unknown staff member',
    createdAt: row.created_at ?? '',
    updatedAt: row.updated_at ?? '',
  };
}

/** Reads the caller's Planner identity from Portal's own `profiles.planner_profile_id` (Feature 001 bridge). `null` covers both absence and a genuine read error — this table's existing precedent (`planner-overview/route.ts`) does not throw on it either. */
export async function resolveCallerPlannerIdentity(
  portalAuthClient: SupabaseClient,
  portalUserId: string
): Promise<string | null> {
  const { data, error } = await portalAuthClient
    .from('profiles')
    .select('planner_profile_id')
    .eq('id', portalUserId)
    .maybeSingle();
  if (error) {
    console.error('resolveCallerPlannerIdentity: profiles lookup failed', error);
    return null;
  }
  return data?.planner_profile_id ?? null;
}

/**
 * Mirrors the live `operational_tasks` RLS's own read-permission logic
 * server-side (the service-role client bypasses RLS entirely, so this is not
 * optional). A genuine query error on either lookup THROWS — callers
 * (the route handlers) must map that to a distinct `backend_error` response,
 * never to `canView: false` (Feature 006 F1 defect class; `/speckit.analyze` H2).
 */
export async function resolveTaskCapability(plannerEventId: number, plannerProfileId: string): Promise<ResolvedTaskCapability> {
  const planner = getPlannerAdminClient();

  const { data: profile, error: profileError } = await planner
    .from('profiles')
    .select('is_platform_admin, role')
    .eq('id', plannerProfileId)
    .maybeSingle();
  if (profileError) throw profileError;

  const role = (profile?.role ?? '').trim().toLowerCase();
  const isPlatformAdmin = profile?.is_platform_admin === true || ['admin', 'super_admin', 'superadmin'].includes(role);

  if (isPlatformAdmin) {
    return { hasPlannerIdentity: true, canView: true, canManage: true };
  }

  const { data: assignment, error: assignmentError } = await planner
    .from('event_user_assignments')
    .select('can_view_tasks, can_manage_tasks')
    .eq('event_id', plannerEventId)
    .eq('profile_id', plannerProfileId)
    .eq('is_active', true)
    .maybeSingle();
  if (assignmentError) throw assignmentError;

  if (!assignment) {
    return { hasPlannerIdentity: true, canView: false, canManage: false };
  }

  return {
    hasPlannerIdentity: true,
    canView: assignment.can_view_tasks === true || assignment.can_manage_tasks === true,
    canManage: assignment.can_manage_tasks === true,
  };
}

/** Event-scoped only (FR-029) — never the organization-wide `get_task_assignable_profiles()` helper, never fuzzy matching (FR-030). */
export async function listAssignableStaff(plannerEventId: number): Promise<AssignableStaffMember[]> {
  const planner = getPlannerAdminClient();
  const { data, error } = await planner
    .from('event_user_assignments')
    .select('profile_id, profiles(full_name)')
    .eq('event_id', plannerEventId)
    .eq('is_active', true);
  if (error) throw error;

  return (data ?? []).map((row: { profile_id: string; profiles?: { full_name: string | null } | { full_name: string | null }[] | null }) => {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    return { profileId: row.profile_id, name: profile?.full_name?.trim() || 'Unnamed staff member' };
  });
}

/** Explicit-column select, never `select('*')`; scoped strictly to one event (FR-016, FR-037, FR-038). Throws on a genuine read error — never returns `[]` on failure (FR-045). */
export async function listEventTasks(plannerEventId: number): Promise<PlannerTask[]> {
  const planner = getPlannerAdminClient();
  const { data, error } = await planner
    .from('operational_tasks')
    .select(TASK_SELECT_COLUMNS)
    .eq('event_id', plannerEventId)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => shapePlannerTask(row as unknown as RawTaskRow));
}

/** Returns `null` (treated as not-found by callers) whenever the task doesn't belong to `plannerEventId` — never reinterpreted against a different event (FR-016, FR-028, FR-054). */
export async function getEventTask(plannerEventId: number, taskId: number): Promise<PlannerTask | null> {
  const planner = getPlannerAdminClient();
  const { data, error } = await planner
    .from('operational_tasks')
    .select(TASK_SELECT_COLUMNS)
    .eq('task_id', taskId)
    .eq('event_id', plannerEventId)
    .maybeSingle();
  if (error) throw error;
  return data ? shapePlannerTask(data as unknown as RawTaskRow) : null;
}

export type CreateTaskInput = {
  task: string;
  category?: string | null;
  priority: string;
  dueDate?: string | null;
  remarks?: string | null;
  assignedProfileId?: string | null;
};

/** Manager-only (FR-019). Server controls `event_id`/`task_code`/`created_by_profile_id`/`status` — none are client-authoritative. */
export async function createTask(plannerEventId: number, createdByProfileId: string, input: CreateTaskInput): Promise<PlannerTask> {
  // `operational_tasks.event_id` has no NOT NULL constraint at the database level
  // (fresh column re-verification, `/speckit.analyze`) — this assertion is the only backstop.
  if (!plannerEventId) throw new Error('createTask: plannerEventId is required');

  const task = input.task?.trim();
  if (!task) throw new PlannerTaskValidationError('invalid_request', 'Task title is required.');

  if (!validateTaskPriority(input.priority)) {
    throw new PlannerTaskValidationError('invalid_priority', 'Priority must be Low, Medium, or High.');
  }

  if (input.assignedProfileId) {
    const assignable = await listAssignableStaff(plannerEventId);
    if (!assignable.some((s) => s.profileId === input.assignedProfileId)) {
      throw new PlannerTaskValidationError('invalid_assignee', 'Selected assignee is not active staff for this event.');
    }
  }

  const planner = getPlannerAdminClient();

  // Race-safe (atomic upsert inside the function) — never MAX()+1, never a new counter (FR-039).
  const { data: taskCode, error: codeError } = await planner.rpc('next_event_task_code', { p_event_id: plannerEventId });
  if (codeError) throw codeError;

  const { data, error } = await planner
    .from('operational_tasks')
    .insert({
      event_id: plannerEventId,
      task_code: taskCode,
      task,
      category: input.category ?? null,
      priority: canonicalizePriority(input.priority),
      status: 'Pending',
      due_date: input.dueDate ?? null,
      remarks: input.remarks ?? null,
      assigned_profile_id: input.assignedProfileId ?? null,
      created_by_profile_id: createdByProfileId,
    })
    .select(TASK_SELECT_COLUMNS)
    .single();
  if (error) throw error;
  return shapePlannerTask(data as unknown as RawTaskRow);
}

export type ManagerTaskPatch = Partial<{
  task: string;
  category: string | null;
  priority: string;
  dueDate: string | null;
  remarks: string | null;
  assignedProfileId: string | null;
  status: string;
}>;

/**
 * Manager-only (FR-021–FR-025, FR-027, FR-034). Never accepts
 * `event_id`/`task_id`/`task_code`/`created_by_profile_id` — those simply
 * aren't fields on `ManagerTaskPatch`.
 *
 * `currentAssignedProfileId` — the task's persisted `assigned_profile_id` at
 * the time of the caller's read, supplied by the route (`getEventTask`'s
 * pre-read) — is REQUIRED so this function can distinguish "resubmitting the
 * unchanged assignment" from "a genuine reassignment" (`/code-review` M1
 * correction). A historical/inactive assignee must remain valid to KEEP
 * (exact equality with the persisted value only) but must NEVER become newly
 * selectable — that distinction cannot be made correctly without knowing what
 * was actually persisted before this call.
 */
export async function updateTaskAsManager(
  plannerEventId: number,
  taskId: number,
  currentAssignedProfileId: string | null,
  patch: ManagerTaskPatch
): Promise<PlannerTask> {
  const updates: Record<string, unknown> = {};

  if (patch.task !== undefined) {
    const trimmed = patch.task.trim();
    if (!trimmed) throw new PlannerTaskValidationError('invalid_request', 'Task title is required.');
    updates.task = trimmed;
  }
  if (patch.category !== undefined) updates.category = patch.category;
  if (patch.priority !== undefined) {
    if (!validateTaskPriority(patch.priority)) throw new PlannerTaskValidationError('invalid_priority', 'Priority must be Low, Medium, or High.');
    updates.priority = canonicalizePriority(patch.priority);
  }
  if (patch.dueDate !== undefined) updates.due_date = patch.dueDate;
  if (patch.remarks !== undefined) updates.remarks = patch.remarks;
  if (patch.status !== undefined) {
    if (!validateTaskStatus(patch.status)) throw new PlannerTaskValidationError('invalid_status', 'Status must be Pending, In Progress, or Completed.');
    updates.status = canonicalizeStatus(patch.status);
  }
  if (patch.assignedProfileId !== undefined) {
    if (patch.assignedProfileId === currentAssignedProfileId) {
      // `/code-review` M1 — unchanged from the persisted value (including
      // both null). Exempt from active-assignment validation: a
      // historical/inactive assignee must remain valid to KEEP (FR-032), so
      // an unrelated edit (priority, due date, title, ...) that simply
      // resends the task's current assignment can never be blocked by it.
      // Exact equality only — never inferred from "the current assignee
      // happens to be historical," so this can never widen into "any
      // inactive profile is acceptable."
      updates.assigned_profile_id = patch.assignedProfileId;
    } else if (patch.assignedProfileId === null) {
      // Explicit clear/unassign — always allowed, no validation needed.
      updates.assigned_profile_id = null;
    } else {
      // A genuine reassignment (different from the persisted value) — always
      // validated against the CURRENT active, event-scoped assignable staff
      // list. Never exempted, regardless of the task's prior assignee.
      const assignable = await listAssignableStaff(plannerEventId);
      if (!assignable.some((s) => s.profileId === patch.assignedProfileId)) {
        throw new PlannerTaskValidationError('invalid_assignee', 'Selected assignee is not active staff for this event.');
      }
      updates.assigned_profile_id = patch.assignedProfileId;
    }
  }

  const planner = getPlannerAdminClient();
  const { data, error } = await planner
    .from('operational_tasks')
    .update(updates)
    .eq('task_id', taskId)
    .eq('event_id', plannerEventId)
    .select(TASK_SELECT_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new PlannerTaskNotFoundError('Task not found.');
  return shapePlannerTask(data as unknown as RawTaskRow);
}

export type SelfAssigneeTaskPatch = Partial<{ status: string; remarks: string | null }>;

/**
 * Self-assignee-only (FR-022–FR-024): accepts only `status`/`remarks`, enforced
 * both by `SelfAssigneeTaskPatch`'s type and by this being the only path the
 * route ever calls for a non-manager caller. The `UPDATE` itself carries
 * `assigned_profile_id = callerPlannerProfileId` as an ATOMIC condition — not a
 * pre-read followed by an unrestricted update — so a task reassigned away from
 * this caller between the route's read and this call is safely rejected (zero
 * rows match) rather than silently mutated.
 */
export async function updateTaskAsSelfAssignee(
  plannerEventId: number,
  taskId: number,
  callerPlannerProfileId: string,
  patch: SelfAssigneeTaskPatch
): Promise<PlannerTask> {
  const updates: Record<string, unknown> = {};
  if (patch.status !== undefined) {
    if (!validateTaskStatus(patch.status)) throw new PlannerTaskValidationError('invalid_status', 'Status must be Pending, In Progress, or Completed.');
    updates.status = canonicalizeStatus(patch.status);
  }
  if (patch.remarks !== undefined) updates.remarks = patch.remarks;

  const planner = getPlannerAdminClient();
  const { data, error } = await planner
    .from('operational_tasks')
    .update(updates)
    .eq('task_id', taskId)
    .eq('event_id', plannerEventId)
    .eq('assigned_profile_id', callerPlannerProfileId)
    .select(TASK_SELECT_COLUMNS)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new PlannerTaskNotFoundError('Task not found, or no longer assigned to you.');
  return shapePlannerTask(data as unknown as RawTaskRow);
}

/** Hard delete, manager-only (FR-026) — no archive/soft-delete column exists on the live table. */
export async function deleteTask(plannerEventId: number, taskId: number): Promise<void> {
  const planner = getPlannerAdminClient();
  const { data, error } = await planner
    .from('operational_tasks')
    .delete()
    .eq('task_id', taskId)
    .eq('event_id', plannerEventId)
    .select('task_id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new PlannerTaskNotFoundError('Task not found.');
}

/** Maps any thrown error from the functions above to one of the safe, documented contract categories — never returns raw Planner error text/stack traces (FR-050, FR-058). */
export function normalizePlannerTaskError(err: unknown): { category: string; message: string } {
  if (err instanceof PlannerTaskValidationError) {
    return { category: err.code, message: err.message };
  }
  if (err instanceof PlannerTaskNotFoundError) {
    return { category: 'task_not_found', message: err.message };
  }
  console.error('plannerTasks: unexpected error', err);
  return { category: 'planner_write_failed', message: 'Could not save — try again.' };
}
