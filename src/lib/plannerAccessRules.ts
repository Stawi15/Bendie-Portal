/**
 * Feature 026 — the Portal's copy of Bendie Planner's access rule.
 *
 * The Portal reads and writes Planner data with the Planner service-role key,
 * which bypasses Planner's RLS, so it must re-apply Planner's own decision
 * itself. That decision is `public.has_event_module(event_id, module)` in the
 * Planner database (verified live 2026-11-17):
 *
 *   platform admin (`profiles.is_platform_admin` flag only)
 *   OR org admin of the event's organization (`is_org_admin` + same `organization_id`)
 *   OR an ACTIVE assignment on the event, while the event's organization is active,
 *      whose switch for the module is on. `can_manage_production` /
 *      `can_manage_logistics` NULL means "same as the view switch".
 *
 * Job titles (`profiles.role`) grant nothing (Planner, 2026-10-15). The Portal
 * used to treat `role` = admin/super_admin/superadmin as platform admin, and
 * ignored org admins entirely; both are fixed by routing every module through
 * this file.
 */
import 'server-only';
import { getPlannerAdminClient } from '@/lib/plannerAdmin';
import { moduleAccess, type PlannerAccessFacts, type PlannerAssignmentFlags } from '@/lib/plannerAccessRulesCore';

export { moduleAccess };
export type { PlannerAccessFacts, PlannerAccessModule, ModuleAccess } from '@/lib/plannerAccessRulesCore';

const ASSIGNMENT_COLUMNS =
  'can_view_overview, can_view_production, can_manage_production, can_view_logistics, can_manage_logistics, can_view_tasks, can_manage_tasks, can_view_notifications, can_view_checklist, can_manage_checklist, can_view_vendors, can_manage_vendors';

/**
 * Loads the facts `moduleAccess` needs for one Planner profile on one Planner event.
 * Throws on any genuine read error — callers map that to `backend_error`, never to
 * "no access" (Feature 006 F1 defect class).
 */
export async function loadPlannerAccessFacts(plannerEventId: number, plannerProfileId: string): Promise<PlannerAccessFacts> {
  const planner = getPlannerAdminClient();
  const [profileRes, eventRes, assignmentRes] = await Promise.all([
    planner.from('profiles').select('is_platform_admin, is_org_admin, organization_id').eq('id', plannerProfileId).maybeSingle(),
    planner.from('events').select('organization_id').eq('event_id', plannerEventId).maybeSingle(),
    planner
      .from('event_user_assignments')
      .select(ASSIGNMENT_COLUMNS)
      .eq('event_id', plannerEventId)
      .eq('profile_id', plannerProfileId)
      .eq('is_active', true)
      .maybeSingle(),
  ]);
  if (profileRes.error) throw profileRes.error;
  if (eventRes.error) throw eventRes.error;
  if (assignmentRes.error) throw assignmentRes.error;

  const eventOrgId = eventRes.data?.organization_id ?? null;
  let eventOrgActive = true; // Planner's is_event_org_active() defaults to true when unknown.
  if (eventOrgId !== null) {
    const { data: org, error: orgError } = await planner.from('organizations').select('is_active').eq('organization_id', eventOrgId).maybeSingle();
    if (orgError) throw orgError;
    if (org && org.is_active === false) eventOrgActive = false;
  }

  const profile = profileRes.data;
  return {
    isPlatformAdmin: profile?.is_platform_admin === true,
    isOrgAdminOfEvent: profile?.is_org_admin === true && eventOrgId !== null && Number(profile.organization_id) === Number(eventOrgId),
    eventOrgActive,
    assignment: (assignmentRes.data as PlannerAssignmentFlags | null) ?? null,
  };
}
