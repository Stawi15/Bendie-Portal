import { describe, expect, it } from 'vitest';
import { moduleAccess, type PlannerAccessFacts, type PlannerAssignmentFlags } from './plannerAccessRulesCore';

const none: PlannerAssignmentFlags = {
  can_view_overview: false,
  can_view_production: false,
  can_manage_production: null,
  can_view_logistics: false,
  can_manage_logistics: null,
  can_view_tasks: false,
  can_manage_tasks: false,
  can_view_notifications: false,
  can_view_checklist: false,
  can_manage_checklist: false,
  can_view_vendors: false,
  can_manage_vendors: false,
};
const facts = (assignment: Partial<PlannerAssignmentFlags> | null, extra: Partial<PlannerAccessFacts> = {}): PlannerAccessFacts => ({
  isPlatformAdmin: false,
  isOrgAdminOfEvent: false,
  eventOrgActive: true,
  assignment: assignment ? { ...none, ...assignment } : null,
  ...extra,
});

describe('moduleAccess (mirrors Planner has_event_module)', () => {
  it('gives platform admins and org admins of the event full access, even without an assignment', () => {
    for (const extra of [{ isPlatformAdmin: true }, { isOrgAdminOfEvent: true }]) {
      expect(moduleAccess(facts(null, extra), 'tasks')).toEqual({ canView: true, canManage: true });
      expect(moduleAccess(facts(null, extra), 'logistics')).toEqual({ canView: true, canManage: true });
    }
  });

  it('keeps admin access when the organization is paused (Planner only gates assignments on it)', () => {
    expect(moduleAccess(facts(null, { isOrgAdminOfEvent: true, eventOrgActive: false }), 'vendors').canManage).toBe(true);
  });

  it('gives nothing without an active assignment, or when the organization is paused', () => {
    expect(moduleAccess(facts(null), 'tasks')).toEqual({ canView: false, canManage: false });
    expect(moduleAccess(facts({ can_view_tasks: true }, { eventOrgActive: false }), 'tasks')).toEqual({ canView: false, canManage: false });
    expect(moduleAccess(facts(null), 'people').canView).toBe(false);
  });

  it('tasks / checklist / vendors: manage implies view', () => {
    expect(moduleAccess(facts({ can_manage_tasks: true }), 'tasks')).toEqual({ canView: true, canManage: true });
    expect(moduleAccess(facts({ can_view_checklist: true }), 'checklist')).toEqual({ canView: true, canManage: false });
    expect(moduleAccess(facts({ can_manage_vendors: true }), 'vendors')).toEqual({ canView: true, canManage: true });
  });

  it('production / logistics: a NULL manage switch follows the view switch', () => {
    expect(moduleAccess(facts({ can_view_production: true, can_manage_production: null }), 'production')).toEqual({ canView: true, canManage: true });
    expect(moduleAccess(facts({ can_view_logistics: true, can_manage_logistics: null }), 'logistics')).toEqual({ canView: true, canManage: true });
  });

  it('production / logistics: view without manage when the manage switch is explicitly off', () => {
    expect(moduleAccess(facts({ can_view_production: true, can_manage_production: false }), 'production')).toEqual({ canView: true, canManage: false });
    expect(moduleAccess(facts({ can_view_logistics: true, can_manage_logistics: false }), 'logistics')).toEqual({ canView: true, canManage: false });
  });

  it('production / logistics: manage on but view off grants nothing (as in Planner)', () => {
    expect(moduleAccess(facts({ can_view_production: false, can_manage_production: true }), 'production')).toEqual({ canView: false, canManage: false });
  });

  it('people: any active assignment can view, nobody but admins manages', () => {
    expect(moduleAccess(facts({}), 'people')).toEqual({ canView: true, canManage: false });
  });
});
