import 'server-only';
import { getPlannerAdminClient } from '@/lib/plannerAdmin';
import {
  PLANNER_MODULES,
  type PlannerModuleKey,
  type PlannerPermissionFlags,
  derivePresetLabel,
  deriveAccessRole,
  normalizeManageImpliesView,
  defaultFlagsForPortalRole,
} from '@/lib/plannerPermissionPresets';

/**
 * Feature 008 — narrow, server-only Bendie Planner permission-administration
 * data-access module, mirroring `src/lib/plannerTasks.ts`'s Feature 007
 * shape: explicit column lists (never `select('*')`), narrow single-purpose
 * functions, no route-handler concerns (those live in
 * `src/app/api/events/[eventId]/members/[memberId]/planner-permissions*`).
 *
 * Identity resolution/creation (`findOrCreatePlannerProfile`, Feature 001,
 * exported from `plannerStaffSync.ts`) and the Portal-side
 * `planner_permissions_configured_at`/audit coordination are deliberately
 * left to the route layer, matching Feature 007's own split between
 * cross-database orchestration (route) and narrow Planner-only reads/writes
 * (this module) — every function below touches Planner's
 * `event_user_assignments` only, given an already-resolved `plannerProfileId`.
 */

export type PlannerModuleState = { key: PlannerModuleKey; label: string; view: boolean; manage: boolean | null };

export type PlannerPermissionState = {
  isEnabled: boolean;
  hasBeenConfigured: boolean;
  preset: 'viewer' | 'manager' | 'custom';
  modules: PlannerModuleState[];
};

export type RawAssignment = PlannerPermissionFlags & { is_active: boolean };

const ASSIGNMENT_SELECT_COLUMNS =
  'is_active, can_view_overview, can_view_production, can_view_logistics, can_view_tasks, can_manage_tasks, can_view_notifications, can_view_checklist, can_manage_checklist, can_view_vendors, can_manage_vendors';

function stripIsActive(row: RawAssignment): PlannerPermissionFlags {
  return {
    can_view_overview: row.can_view_overview,
    can_view_production: row.can_view_production,
    can_view_logistics: row.can_view_logistics,
    can_view_tasks: row.can_view_tasks,
    can_manage_tasks: row.can_manage_tasks,
    can_view_notifications: row.can_view_notifications,
    can_view_checklist: row.can_view_checklist,
    can_manage_checklist: row.can_manage_checklist,
    can_view_vendors: row.can_view_vendors,
    can_manage_vendors: row.can_manage_vendors,
  };
}

function shapeModules(flags: PlannerPermissionFlags): PlannerModuleState[] {
  return PLANNER_MODULES.map((m) => ({
    key: m.key,
    label: m.label,
    view: flags[m.view],
    manage: m.manage ? flags[m.manage] : null,
  }));
}

function shapeState(isEnabled: boolean, hasBeenConfigured: boolean, flags: PlannerPermissionFlags): PlannerPermissionState {
  return { isEnabled, hasBeenConfigured, preset: derivePresetLabel(flags), modules: shapeModules(flags) };
}

/** Throws on a genuine query error (never returns `null` for a failure — only for a legitimately absent row), matching `plannerTasks.ts`'s established convention. */
async function readAssignment(plannerEventId: number, plannerProfileId: string): Promise<RawAssignment | null> {
  const planner = getPlannerAdminClient();
  const { data, error } = await planner
    .from('event_user_assignments')
    .select(ASSIGNMENT_SELECT_COLUMNS)
    .eq('event_id', plannerEventId)
    .eq('profile_id', plannerProfileId)
    .maybeSingle();
  if (error) throw error;
  return (data as RawAssignment | null) ?? null;
}

/** FR-004: never writes anything. When no assignment/identity exists yet, previews the FR-016 role-derived defaults without persisting them. */
export async function readPermissionState(
  plannerEventId: number,
  plannerProfileId: string | null,
  currentPortalRole: string,
  hasBeenConfigured: boolean
): Promise<PlannerPermissionState> {
  const assignment = plannerProfileId ? await readAssignment(plannerEventId, plannerProfileId) : null;
  if (!assignment) {
    return shapeState(false, hasBeenConfigured, defaultFlagsForPortalRole(currentPortalRole));
  }
  return shapeState(assignment.is_active === true, hasBeenConfigured, stripIsActive(assignment));
}

export type EnableBranch = 'first_enable' | 'reactivate' | 'noop';

/**
 * research.md R9's three branches, keyed purely on server-read state — the
 * caller never chooses which applies. `plannerProfileId` must already be
 * resolved/created by the caller (the `enable` route owns identity
 * resolution via Feature 001's `findOrCreatePlannerProfile`, per FR-029/030).
 */
export async function enableAssignment(
  plannerEventId: number,
  plannerProfileId: string,
  currentPortalRole: string,
  hasBeenConfigured: boolean
): Promise<{ before: RawAssignment | null; after: RawAssignment; state: PlannerPermissionState; branch: EnableBranch }> {
  const existing = await readAssignment(plannerEventId, plannerProfileId);
  const planner = getPlannerAdminClient();

  if (existing?.is_active === true) {
    return { before: existing, after: existing, state: shapeState(true, hasBeenConfigured, stripIsActive(existing)), branch: 'noop' };
  }

  if (existing && hasBeenConfigured) {
    // Reactivate (FR-037) — restore exactly what was there before disabling; flags untouched.
    const { data, error } = await planner
      .from('event_user_assignments')
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq('event_id', plannerEventId)
      .eq('profile_id', plannerProfileId)
      .select(ASSIGNMENT_SELECT_COLUMNS)
      .single();
    if (error) throw error;
    const after = data as RawAssignment;
    return { before: existing, after, state: shapeState(true, hasBeenConfigured, stripIsActive(after)), branch: 'reactivate' };
  }

  // First enable — also the re-add-after-removal path (FR-041a): `hasBeenConfigured`
  // is false here because a re-added member's marker was reset to NULL by the
  // Portal-side hard delete, so a prior, now-inactive assignment's stale flags are
  // intentionally overwritten with fresh role-derived defaults below, exactly as a
  // genuinely first-ever assignment would be.
  const flags = defaultFlagsForPortalRole(currentPortalRole);
  const { data, error } = await planner
    .from('event_user_assignments')
    .upsert(
      { event_id: plannerEventId, profile_id: plannerProfileId, ...flags, access_role: deriveAccessRole(flags), is_active: true, updated_at: new Date().toISOString() },
      { onConflict: 'event_id,profile_id' }
    )
    .select(ASSIGNMENT_SELECT_COLUMNS)
    .single();
  if (error) throw error;
  const after = data as RawAssignment;
  return { before: existing, after, state: shapeState(true, false, stripIsActive(after)), branch: 'first_enable' };
}

export type ModulePatch = Partial<Record<PlannerModuleKey, { view?: boolean; manage?: boolean }>>;

export class PlannerPermissionValidationError extends Error {
  code: 'invalid_request' | 'not_enabled';
  constructor(code: PlannerPermissionValidationError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Rejects unknown module keys and a `manage` field on a no-manage module;
 * normalizes Manage→View unconditionally (server-authoritative, FR-023–025);
 * derives `access_role` (FR-027/028). Does not touch
 * `planner_permissions_configured_at` or write an audit row — the `PATCH`
 * route (contracts.md) coordinates those against the Portal database.
 *
 * `hasBeenConfigured` (the caller's current `planner_permissions_configured_at
 * IS NOT NULL` read) and the returned `wasNoop` (added 2026-09-21, /review
 * finding, LOW) let the `PATCH` route skip an unnecessary Planner write and
 * `permissions_changed` audit row when nothing would actually change — but
 * ONLY when no ownership-state transition is also required. A first-ever
 * explicit Save that happens to match the current (role-derived-default)
 * flags is deliberately NOT a no-op: `hasBeenConfigured` is still `false` at
 * that point, so it still needs to persist and establish manager ownership.
 */
export async function savePermissions(
  plannerEventId: number,
  plannerProfileId: string,
  requestedModules: ModulePatch,
  hasBeenConfigured: boolean
): Promise<{ before: RawAssignment; after: RawAssignment; state: PlannerPermissionState; wasNoop: boolean }> {
  const existing = await readAssignment(plannerEventId, plannerProfileId);
  if (!existing || existing.is_active !== true) {
    throw new PlannerPermissionValidationError('not_enabled', 'Bendie Planner access is not currently enabled for this person.');
  }

  const nextFlags: PlannerPermissionFlags = stripIsActive(existing);
  // Corrective fix (2026-09-21, /review finding, MEDIUM — FR-024): tracked here,
  // at merge time, while it's still known whether `view` was EXPLICITLY patched
  // to `false` in this request — that information is lost once flags are merged
  // into `nextFlags` (a carried-over `true` and a freshly-patched `true` look
  // identical afterward). `normalizeManageImpliesView` alone can only enforce
  // FR-023's direction (Manage=true forces View=true); it cannot distinguish
  // "manage was already true and view merely wasn't touched" from "the manager
  // just explicitly turned view off," so it isn't the right place for FR-024.
  const explicitlyDisabledView = new Set<PlannerModuleKey>();
  for (const key of Object.keys(requestedModules) as PlannerModuleKey[]) {
    const moduleDef = PLANNER_MODULES.find((m) => m.key === key);
    if (!moduleDef) throw new PlannerPermissionValidationError('invalid_request', `Unknown module: ${key}`);
    const patch = requestedModules[key];
    if (!patch) continue;
    if (patch.view !== undefined) {
      nextFlags[moduleDef.view] = patch.view;
      if (patch.view === false && moduleDef.manage) explicitlyDisabledView.add(key);
    }
    if (patch.manage !== undefined) {
      if (!moduleDef.manage) throw new PlannerPermissionValidationError('invalid_request', `Module "${key}" has no manage capability.`);
      nextFlags[moduleDef.manage] = patch.manage;
    }
  }

  // FR-024: explicitly turning View off always forces Manage off too — even if
  // the same request also explicitly (and, per FR-025, invalidly) asked for
  // Manage=true. An explicit View=false is never "a valid different final
  // state" for Manage=true, since FR-025 forbids that combination outright, so
  // this takes priority over whatever `manage` was set to above.
  for (const key of explicitlyDisabledView) {
    const moduleDef = PLANNER_MODULES.find((m) => m.key === key)!;
    nextFlags[moduleDef.manage!] = false;
  }

  // FR-023's remaining direction (Manage=true forces View=true) — a safety net
  // for flags carried over unchanged from the existing row, not touched above.
  const normalized = normalizeManageImpliesView(nextFlags);
  const accessRole = deriveAccessRole(normalized);

  const currentFlags = stripIsActive(existing);
  const flagsUnchanged = (Object.keys(normalized) as (keyof PlannerPermissionFlags)[]).every((key) => normalized[key] === currentFlags[key]);

  // No-op determination (2026-09-21, /review finding, LOW): a true no-op
  // requires BOTH the effective permission values being unchanged AND no
  // ownership-state transition being required (`hasBeenConfigured` already
  // true). See the doc comment above for why a first-ever Save matching the
  // current defaults must NOT take this branch.
  if (flagsUnchanged && hasBeenConfigured) {
    return { before: existing, after: existing, state: shapeState(true, true, currentFlags), wasNoop: true };
  }

  const { data, error } = await getPlannerAdminClient()
    .from('event_user_assignments')
    .update({ ...normalized, access_role: accessRole, updated_at: new Date().toISOString() })
    .eq('event_id', plannerEventId)
    .eq('profile_id', plannerProfileId)
    .select(ASSIGNMENT_SELECT_COLUMNS)
    .single();
  if (error) throw error;

  const after = data as RawAssignment;
  return { before: existing, after, state: shapeState(true, true, stripIsActive(after)), wasNoop: false };
}

/**
 * FR-036: `is_active` only — flags/identity/row untouched. Idempotent:
 * already-disabled is a success no-op, not an error (contracts.md).
 *
 * `wasNoop` (added 2026-09-21, /review finding, LOW) lets the `disable` route
 * skip writing an audit entry for a no-op, exactly mirroring
 * `enableAssignment`'s existing `branch: 'noop'` handling — nothing changed,
 * so there is nothing "meaningful" for spec.md's Locked Decision 4 to record.
 */
export async function disableAssignment(
  plannerEventId: number,
  plannerProfileId: string
): Promise<{ before: RawAssignment; after: RawAssignment; state: PlannerPermissionState; wasNoop: boolean }> {
  const existing = await readAssignment(plannerEventId, plannerProfileId);
  if (!existing) {
    throw new PlannerPermissionValidationError('not_enabled', 'Bendie Planner access is not currently enabled for this person.');
  }
  if (existing.is_active === false) {
    return { before: existing, after: existing, state: shapeState(false, true, stripIsActive(existing)), wasNoop: true };
  }
  const { data, error } = await getPlannerAdminClient()
    .from('event_user_assignments')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('event_id', plannerEventId)
    .eq('profile_id', plannerProfileId)
    .select(ASSIGNMENT_SELECT_COLUMNS)
    .single();
  if (error) throw error;
  const after = data as RawAssignment;
  return { before: existing, after, state: shapeState(false, true, stripIsActive(after)), wasNoop: false };
}

/**
 * research.md R10 / FR-039–041 — the member-removal side effect. A narrow,
 * non-upserting update: never creates a row, so a member with no Planner
 * assignment at all is a harmless no-op (`deactivationConfirmed: false`).
 */
export async function deactivateAssignmentForRemoval(plannerEventId: number, plannerProfileId: string): Promise<{ deactivationConfirmed: boolean }> {
  const { data, error } = await getPlannerAdminClient()
    .from('event_user_assignments')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('event_id', plannerEventId)
    .eq('profile_id', plannerProfileId)
    .select('assignment_id');
  if (error) throw error;
  return { deactivationConfirmed: (data ?? []).length > 0 };
}

/** data-model.md §2's exact before/after snapshot JSON shape — one function so every audit call site produces an identical structure. */
export function snapshotFromAssignment(row: RawAssignment): Record<string, unknown> {
  return {
    isActive: row.is_active,
    accessRole: deriveAccessRole(row),
    flags: {
      canViewOverview: row.can_view_overview,
      canViewProduction: row.can_view_production,
      canViewLogistics: row.can_view_logistics,
      canViewTasks: row.can_view_tasks,
      canManageTasks: row.can_manage_tasks,
      canViewNotifications: row.can_view_notifications,
      canViewChecklist: row.can_view_checklist,
      canManageChecklist: row.can_manage_checklist,
      canViewVendors: row.can_view_vendors,
      canManageVendors: row.can_manage_vendors,
    },
  };
}

export type AuditActionType = 'access_enabled' | 'permissions_changed' | 'access_disabled' | 'access_reactivated';

/**
 * research.md R3/R4 — on a `23505` unique-violation on
 * `(event_id, member_user_id, operation_id)`, the same logical operation was
 * already recorded (a lost-response retry); resolves successfully rather than
 * throwing. Any other error is logged server-side and reported via
 * `auditPending: true` WITHOUT throwing — callers must never let an audit
 * failure roll back or fail an already-applied permission mutation.
 */
export async function recordAuditEntry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  portalAdmin: any,
  params: {
    eventId: string;
    memberUserId: string;
    actorUserId: string;
    actionType: AuditActionType;
    beforeState: Record<string, unknown> | null;
    afterState: Record<string, unknown>;
    operationId: string;
  }
): Promise<{ auditPending: boolean }> {
  const { error } = await portalAdmin.from('planner_permission_audit_log').insert({
    event_id: params.eventId,
    member_user_id: params.memberUserId,
    actor_user_id: params.actorUserId,
    action_type: params.actionType,
    before_state: params.beforeState,
    after_state: params.afterState,
    operation_id: params.operationId,
  });
  if (!error) return { auditPending: false };
  if (error.code === '23505') return { auditPending: false };
  console.error('recordAuditEntry: audit insert failed', error);
  return { auditPending: true };
}
