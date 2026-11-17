/**
 * Feature 026 — pure part of the Planner access rule (no I/O, unit-tested).
 * Mirrors Planner's `has_event_module`; see `plannerAccessRules.ts` for the full rule.
 */

export type PlannerAssignmentFlags = {
  can_view_overview: boolean;
  can_view_production: boolean;
  can_manage_production: boolean | null;
  can_view_logistics: boolean;
  can_manage_logistics: boolean | null;
  can_view_tasks: boolean;
  can_manage_tasks: boolean;
  can_view_notifications: boolean;
  can_view_checklist: boolean;
  can_manage_checklist: boolean;
  can_view_vendors: boolean;
  can_manage_vendors: boolean;
};

export type PlannerAccessFacts = {
  isPlatformAdmin: boolean;
  isOrgAdminOfEvent: boolean;
  eventOrgActive: boolean;
  /** The caller's ACTIVE assignment on the event, or null. */
  assignment: PlannerAssignmentFlags | null;
};

/** `people` = participants: Planner shows them to anyone who can view the event (`can_view_event`). */
export type PlannerAccessModule = 'tasks' | 'checklist' | 'vendors' | 'logistics' | 'production' | 'people';

export type ModuleAccess = { canView: boolean; canManage: boolean };

const truthy = (v: boolean | null | undefined) => v === true;

/** The Portal's decision for one module, identical to Planner's `has_event_module(module)` / `has_event_module('manage_' + module)`. */
export function moduleAccess(facts: PlannerAccessFacts, module: PlannerAccessModule): ModuleAccess {
  if (facts.isPlatformAdmin || facts.isOrgAdminOfEvent) return { canView: true, canManage: true };

  const a = facts.eventOrgActive ? facts.assignment : null;
  if (!a) return { canView: false, canManage: false };

  switch (module) {
    case 'tasks':
      return { canView: truthy(a.can_view_tasks) || truthy(a.can_manage_tasks), canManage: truthy(a.can_manage_tasks) };
    case 'checklist':
      return { canView: truthy(a.can_view_checklist) || truthy(a.can_manage_checklist), canManage: truthy(a.can_manage_checklist) };
    case 'vendors':
      return { canView: truthy(a.can_view_vendors) || truthy(a.can_manage_vendors), canManage: truthy(a.can_manage_vendors) };
    case 'logistics': {
      const view = truthy(a.can_view_logistics);
      return { canView: view, canManage: view && (a.can_manage_logistics ?? view) === true };
    }
    case 'production': {
      const view = truthy(a.can_view_production);
      return { canView: view, canManage: view && (a.can_manage_production ?? view) === true };
    }
    case 'people':
      // Any active assignment can see the event's participants; editing them stays a Portal-admin action (unchanged).
      return { canView: true, canManage: false };
  }
}
