/**
 * Feature 008 — the single canonical representation of Bendie Planner's
 * module permission surface (`event_user_assignments`'s 7 view + 3 manage
 * flags). Extracted from `plannerStaffSync.ts`'s `roleToPlannerFlags()` so the
 * Feature 008 UI/API and Feature 001's automatic role-derived sync can never
 * define Viewer/Manager as two independently-drifting mappings (spec.md
 * FR-020; research.md R6). `plannerStaffSync.ts` imports `VIEWER_FLAGS`/
 * `MANAGER_FLAGS` from here instead of inlining its own object literals.
 */

export type PlannerPermissionFlags = {
  can_view_overview: boolean;
  can_view_production: boolean;
  can_view_logistics: boolean;
  can_view_tasks: boolean;
  can_manage_tasks: boolean;
  can_view_notifications: boolean;
  can_view_checklist: boolean;
  can_manage_checklist: boolean;
  can_view_vendors: boolean;
  can_manage_vendors: boolean;
};

export type PlannerModuleKey = 'overview' | 'production' | 'logistics' | 'tasks' | 'notifications' | 'checklist' | 'vendors';

export type PlannerModuleDef = {
  key: PlannerModuleKey;
  label: string;
  view: keyof PlannerPermissionFlags;
  manage: keyof PlannerPermissionFlags | null;
};

/** Exactly the 7 modules the live `event_user_assignments` schema supports today (spec.md FR-011). `manage: null` (never `false`) for the 4 modules with no live manage column — FR-013 forbids inventing one. */
export const PLANNER_MODULES: readonly PlannerModuleDef[] = [
  { key: 'overview', label: 'Overview', view: 'can_view_overview', manage: null },
  { key: 'production', label: 'Production', view: 'can_view_production', manage: null },
  { key: 'logistics', label: 'Logistics', view: 'can_view_logistics', manage: null },
  { key: 'tasks', label: 'Tasks', view: 'can_view_tasks', manage: 'can_manage_tasks' },
  { key: 'notifications', label: 'Notifications', view: 'can_view_notifications', manage: null },
  { key: 'checklist', label: 'Checklist', view: 'can_view_checklist', manage: 'can_manage_checklist' },
  { key: 'vendors', label: 'Vendors', view: 'can_view_vendors', manage: 'can_manage_vendors' },
];

/** Every view flag true, every manage flag false — identical to `roleToPlannerFlags()`'s existing facilitator/staff/speaker output (spec.md FR-020). */
export const VIEWER_FLAGS: PlannerPermissionFlags = {
  can_view_overview: true,
  can_view_production: true,
  can_view_logistics: true,
  can_view_tasks: true,
  can_manage_tasks: false,
  can_view_notifications: true,
  can_view_checklist: true,
  can_manage_checklist: false,
  can_view_vendors: true,
  can_manage_vendors: false,
};

/** Every view flag true, every manage flag true — identical to `roleToPlannerFlags()`'s existing host/organizer/admin output (spec.md FR-020). */
export const MANAGER_FLAGS: PlannerPermissionFlags = {
  can_view_overview: true,
  can_view_production: true,
  can_view_logistics: true,
  can_view_tasks: true,
  can_manage_tasks: true,
  can_view_notifications: true,
  can_view_checklist: true,
  can_manage_checklist: true,
  can_view_vendors: true,
  can_manage_vendors: true,
};

/** The Portal event roles that map to `MANAGER_FLAGS` as their initial default (spec.md FR-016) — the single canonical classification, imported by both `plannerStaffSync.ts` (automatic sync) and `plannerPermissions.ts` (Feature 008's own "Enable" first-time defaults), so the two can never diverge on which roles count as full-access. */
export const FULL_ACCESS_PORTAL_ROLES = new Set(['host', 'organizer', 'admin']);

/** `VIEWER_FLAGS` or `MANAGER_FLAGS` per the member's current Portal event role (FR-016) — the one place this decision is made. */
export function defaultFlagsForPortalRole(portalRole: string): PlannerPermissionFlags {
  return FULL_ACCESS_PORTAL_ROLES.has(portalRole) ? MANAGER_FLAGS : VIEWER_FLAGS;
}

function flagsEqual(a: PlannerPermissionFlags, b: PlannerPermissionFlags): boolean {
  return PLANNER_MODULES.every((m) => a[m.view] === b[m.view] && (m.manage === null || a[m.manage] === b[m.manage]));
}

/** `'viewer'`/`'manager'` only on an exact full-object match; `'custom'` otherwise (FR-020). Never persisted as its own field — always re-derived from the actual flags. */
export function derivePresetLabel(flags: PlannerPermissionFlags): 'viewer' | 'manager' | 'custom' {
  if (flagsEqual(flags, VIEWER_FLAGS)) return 'viewer';
  if (flagsEqual(flags, MANAGER_FLAGS)) return 'manager';
  return 'custom';
}

/** `'admin'` only when every currently-supported Manage flag is true (FR-027). Never reads a client-supplied `access_role`. */
export function deriveAccessRole(flags: PlannerPermissionFlags): 'admin' | 'member' {
  return flags.can_manage_tasks && flags.can_manage_checklist && flags.can_manage_vendors ? 'admin' : 'member';
}

/** For Tasks/Checklist/Vendors, `manage: true` forces `view: true`. The result never contains `view: false` alongside `manage: true` (FR-023–FR-025). Server-authoritative — must be applied unconditionally on every write, never merely mirrored by the client. */
export function normalizeManageImpliesView(flags: PlannerPermissionFlags): PlannerPermissionFlags {
  const normalized = { ...flags };
  for (const moduleDef of PLANNER_MODULES) {
    if (moduleDef.manage && normalized[moduleDef.manage]) {
      normalized[moduleDef.view] = true;
    }
  }
  return normalized;
}
