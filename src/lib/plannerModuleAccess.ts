import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { requireEventWorkspaceAccess, isProductAvailableForEvent, canAdministerPlannerPermissions } from '@/lib/eventAuth';
import { resolveProvisioningPhase } from '@/lib/plannerOverview';
import { resolveTaskCapability } from '@/lib/plannerTasks';
import { resolveVendorCapability } from '@/lib/plannerVendors';
import { resolveChecklistCapability } from '@/lib/plannerChecklist';
import { resolvePeopleCapability } from '@/lib/plannerPeople';
import { resolveLogisticsCapability } from '@/lib/plannerLogistics';
import { resolveProductionCapability } from '@/lib/plannerProduction';

/**
 * Feature 016 (performance passes) — the Portal → Planner access chain run ONCE
 * per request, shared by the aggregate read endpoints (`/planner-capabilities`,
 * `/planner-readiness`). The per-module routes keep their own inline copies
 * (established precedent); this module exists so the two aggregates don't each
 * carry a third and fourth copy.
 *
 * Steps are identical to every per-module route: auth → profile (including
 * planner_profile_id, so no second read) → organisation selection → workspace
 * access → event → Planner product availability → provisioning phase → active
 * Planner link → Portal admin override. Nothing is cached between requests.
 */

export type ModuleKey = 'tasks' | 'vendors' | 'checklist' | 'people' | 'logistics' | 'production';
export const MODULE_KEYS: ModuleKey[] = ['tasks', 'vendors', 'checklist', 'people', 'logistics', 'production'];

type Capability = { hasPlannerIdentity: boolean; canView?: boolean; canManage?: boolean };
export type ModuleResult = { capability: Capability } | { status: 'backend_error' };

export type PlannerEventAccess =
  /** Stop: return this HTTP error as-is (401/403/404), exactly like the per-module routes. */
  | { kind: 'error'; httpStatus: number; error: string }
  /** Stop: a whole-event phase (pending/stale/failed/unavailable/backend_error) returned as `{ ok: true, status }`. */
  | { kind: 'phase'; status: string }
  | { kind: 'ready'; plannerEventId: number; plannerProfileId: string | null; canAdminister: boolean };

export async function resolvePlannerEventAccess(eventId: string, logPrefix: string): Promise<PlannerEventAccess> {
  const cookieStore = await cookies();
  const authClient = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll().map(({ name, value }) => ({ name, value }));
      },
      setAll() {
        // No session refresh needed for these read handlers.
      },
    },
  });

  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return { kind: 'error', httpStatus: 401, error: 'not_authenticated' };

  const { data: profile } = await authClient
    .from('profiles')
    .select('global_role, current_organization_id, planner_profile_id')
    .eq('id', user.id)
    .maybeSingle();

  const isPlatformAdmin = profile?.global_role === 'admin';
  let selectedOrganizationId: string | null = null;
  if (!isPlatformAdmin) {
    const { data: memberships, error: membershipsError } = await authClient
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .order('organization_id', { ascending: true });
    if (membershipsError) console.error(`${logPrefix}: organization_members lookup failed`, membershipsError);
    const accessibleOrgIds = (memberships ?? []).map((m) => m.organization_id);
    const savedOrganizationId = profile?.current_organization_id ?? null;
    selectedOrganizationId = savedOrganizationId && accessibleOrgIds.includes(savedOrganizationId) ? savedOrganizationId : (accessibleOrgIds[0] ?? null);
  }
  if (!isPlatformAdmin && !selectedOrganizationId) return { kind: 'error', httpStatus: 403, error: 'forbidden' };

  const hasWorkspaceAccess = await requireEventWorkspaceAccess(eventId, user.id, selectedOrganizationId, authClient);
  if (!hasWorkspaceAccess) return { kind: 'error', httpStatus: 404, error: 'event_not_found' };

  const { data: event } = await authClient
    .from('events')
    .select('organization_id, planner_provisioning_status, planner_provisioning_last_attempted_at, created_at')
    .eq('id', eventId)
    .maybeSingle();
  if (!event) return { kind: 'error', httpStatus: 404, error: 'event_not_found' };

  const productAvailable = await isProductAvailableForEvent(eventId, event.organization_id, 'planner', authClient);
  if (!productAvailable) return { kind: 'error', httpStatus: 403, error: 'product_unavailable' };

  const provisioningPhase = resolveProvisioningPhase(event);
  if (provisioningPhase !== 'needs-link-check') return { kind: 'phase', status: provisioningPhase };

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error(`${logPrefix}: missing SUPABASE_SERVICE_ROLE_KEY`);
    return { kind: 'phase', status: 'backend_error' };
  }
  const portalAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: activeLink, error: linkError } = await portalAdmin
    .from('event_planner_links')
    .select('planner_event_id')
    .eq('event_id', eventId)
    .eq('is_active', true)
    .maybeSingle();
  if (linkError) {
    console.error(`${logPrefix}: event_planner_links lookup failed`, linkError);
    return { kind: 'phase', status: 'backend_error' };
  }
  if (!activeLink) return { kind: 'phase', status: 'unavailable' };

  const canAdminister = await canAdministerPlannerPermissions(eventId, user.id, authClient);
  return { kind: 'ready', plannerEventId: activeLink.planner_event_id as number, plannerProfileId: profile?.planner_profile_id ?? null, canAdminister };
}

const RESOLVERS: Record<ModuleKey, { resolve: (e: number, p: string) => Promise<Capability>; adminOverride: boolean }> = {
  // Tasks/Vendors/Checklist deliberately have NO Portal-admin override (unchanged from their routes).
  tasks: { resolve: resolveTaskCapability, adminOverride: false },
  vendors: { resolve: resolveVendorCapability, adminOverride: false },
  checklist: { resolve: resolveChecklistCapability, adminOverride: false },
  // People/Logistics/Production: Portal admin ⇒ full access, regardless of Planner identity.
  people: { resolve: resolvePeopleCapability, adminOverride: true },
  logistics: { resolve: resolveLogisticsCapability, adminOverride: true },
  production: { resolve: resolveProductionCapability, adminOverride: true },
};

/** Each module's capability with the exact per-route precedence; one module's failure never affects another. */
export async function resolveAllModuleCapabilities(
  access: Extract<PlannerEventAccess, { kind: 'ready' }>,
  logPrefix: string
): Promise<Record<ModuleKey, ModuleResult>> {
  const entries = await Promise.all(
    MODULE_KEYS.map(async (key): Promise<[ModuleKey, ModuleResult]> => {
      const { resolve, adminOverride } = RESOLVERS[key];
      if (adminOverride && access.canAdminister) return [key, { capability: { hasPlannerIdentity: true, canView: true, canManage: true } }];
      if (!access.plannerProfileId) return [key, { capability: { hasPlannerIdentity: false } }];
      try {
        return [key, { capability: await resolve(access.plannerEventId, access.plannerProfileId) }];
      } catch (err) {
        // Must stay distinguishable from `{ canView: false }` (Feature 006 F1 defect class).
        console.error(`${logPrefix}: ${key} capability resolution failed`, err);
        return [key, { status: 'backend_error' }];
      }
    })
  );
  return Object.fromEntries(entries) as Record<ModuleKey, ModuleResult>;
}
