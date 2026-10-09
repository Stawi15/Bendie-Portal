import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resolvePlannerEventAccess, resolveAllModuleCapabilities } from '@/lib/plannerModuleAccess';
import { ensureOrgAdminPlannerAccess } from '@/lib/plannerStaffSync';

/**
 * Feature 016 (performance pass) — ONE capability request for every Planner
 * module, used by EventLayout for tab visibility (replaced six parallel
 * `/planner-{module}/capability` requests that each re-ran the full ~10-round-
 * trip chain). The chain and the per-module precedence (People/Logistics/
 * Production-only Portal-admin override; per-module `backend_error` isolation)
 * live in `src/lib/plannerModuleAccess.ts`, shared with `/planner-readiness`.
 * Response shape is unchanged: `{ ok, status }` for a whole-event phase, or
 * `{ ok, modules: { tasks, vendors, checklist, people, logistics, production } }`.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  if (!eventId) return NextResponse.json({ error: 'event_not_found' }, { status: 404 });

  const access = await resolvePlannerEventAccess(eventId, 'planner-capabilities');
  if (access.kind === 'error') return NextResponse.json({ error: access.error }, { status: access.httpStatus });
  if (access.kind === 'phase') return NextResponse.json({ ok: true, status: access.status });

  // Feature 017 (US6, FR-027): an owner/admin of the event's organisation who
  // has no Planner assignment yet (added later, older event, or a missed sync)
  // gets full Planner access on first opening the event, so Tasks / Vendors /
  // Checklist — which need a real Planner assignment — appear for them.
  // ensureOrgAdminPlannerAccess is read-only when nothing is needed, skips
  // non-org-admins (incl. platform admins outside the org) and never touches
  // manager-configured access (FR-028).
  let ready = access;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (access.canAdminister && serviceRoleKey) {
    const portalAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const outcome = await ensureOrgAdminPlannerAccess({ portalAdmin, eventId, userId: access.userId }).catch((err: unknown) => {
      console.error('planner-capabilities: org admin Planner access check failed', err);
      return null;
    });
    if (outcome?.status === 'failed') console.error('planner-capabilities: org admin Planner sync failed', { eventId, reason: outcome.reason });
    if (outcome?.status === 'succeeded' && !access.plannerProfileId) {
      const { data } = await portalAdmin.from('profiles').select('planner_profile_id').eq('id', access.userId).maybeSingle();
      ready = { ...access, plannerProfileId: data?.planner_profile_id ?? null };
    }
  }

  const modules = await resolveAllModuleCapabilities(ready, 'planner-capabilities');
  return NextResponse.json({ ok: true, modules });
}
