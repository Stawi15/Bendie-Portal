import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { requireEventWorkspaceAccess, isProductAvailableForEvent } from '@/lib/eventAuth';
import { resolveProvisioningPhase } from '@/lib/plannerOverview';
import {
  resolveTaskCapability,
  listEventTasks,
  listAssignableStaff,
  createTask,
  normalizePlannerTaskError,
  type ResolvedTaskCapability,
} from '@/lib/plannerTasks';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Feature 007 — Bendie Planner Tasks: collection route (list + capability +
 * assignable staff bundled on GET; manager-only create on POST).
 *
 * Authorization sequence (every step independently re-verified on every
 * request, matching `planner-overview/route.ts`'s established shape,
 * extended with steps 6-7 for Tasks' own identity/capability resolution):
 *
 *   1. authenticate
 *   2. resolve the caller's selected organization (membership-derived fallback)
 *   3. Portal event-workspace admission (requireEventWorkspaceAccess)
 *   4. Planner product availability (isProductAvailableForEvent)
 *   5. provisioning/link precedence (resolveProvisioningPhase + event_planner_links)
 *   6. Planner identity resolution (profiles.planner_profile_id bridge)
 *   7. Planner task capability resolution (event_user_assignments / platform-admin)
 *
 * Deliberately NOT refactored into a shared helper with `planner-overview/route.ts`
 * (research.md Q5) — copied inline, matching that converged route's own
 * precedent, so this new feature never risks altering Feature 005's behavior.
 */

type AuthorizedContext = { authClient: SupabaseClient; plannerEventId: number; plannerProfileId: string; capability: ResolvedTaskCapability };

async function resolveAuthorizedContext(eventId: string): Promise<NextResponse | AuthorizedContext> {
  if (!eventId) return NextResponse.json({ error: 'event_not_found' }, { status: 404 });

  const cookieStore = await cookies();
  const authClient = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll().map(({ name, value }) => ({ name, value }));
      },
      setAll() {
        // No session refresh needed for these handlers.
      },
    },
  });

  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });

  // Feature 019 (performance): the same checks as before, but every read that does not depend on
  // an earlier result runs in parallel — about 3 sequential database round trips instead of ~11
  // (each ~0.25–0.5 s from Nairobi). Nothing is returned until every check has passed.
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error('planner-tasks: missing SUPABASE_SERVICE_ROLE_KEY');
    return NextResponse.json({ ok: true, status: 'backend_error' });
  }
  const portalAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Wave 2 — profile (incl. planner_profile_id, Feature 016), memberships (ordered, as
  // OrganizationContext — see planner-overview/route.ts), the event row and the Planner link.
  const [{ data: profile }, membershipsResult, { data: event }, linkResult] = await Promise.all([
    authClient.from('profiles').select('global_role, current_organization_id, planner_profile_id').eq('id', user.id).maybeSingle(),
    authClient.from('organization_members').select('organization_id').eq('user_id', user.id).order('organization_id', { ascending: true }),
    authClient
      .from('events')
      .select('organization_id, planner_provisioning_status, planner_provisioning_last_attempted_at, created_at')
      .eq('id', eventId)
      .maybeSingle(),
    portalAdmin.from('event_planner_links').select('planner_event_id').eq('event_id', eventId).eq('is_active', true).maybeSingle(),
  ]);

  const isPlatformAdmin = profile?.global_role === 'admin';
  let selectedOrganizationId: string | null = null;
  if (!isPlatformAdmin) {
    if (membershipsResult.error) console.error('planner-tasks: organization_members lookup failed', membershipsResult.error);
    const accessibleOrgIds = (membershipsResult.data ?? []).map((m) => m.organization_id);
    const savedOrganizationId = profile?.current_organization_id ?? null;
    selectedOrganizationId = savedOrganizationId && accessibleOrgIds.includes(savedOrganizationId) ? savedOrganizationId : (accessibleOrgIds[0] ?? null);
  }
  if (!isPlatformAdmin && !selectedOrganizationId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  // Wave 3 — workspace access, product availability and the Planner task capability.
  const plannerEventIdOrNull = (linkResult.data?.planner_event_id as number | undefined) ?? null;
  const plannerProfileId = profile?.planner_profile_id ?? null;
  const [hasWorkspaceAccess, productAvailable, capabilityResult] = await Promise.all([
    requireEventWorkspaceAccess(eventId, user.id, selectedOrganizationId, authClient, {
      isPlatformAdmin,
      eventOrganizationId: event?.organization_id ?? null,
    }),
    event ? isProductAvailableForEvent(eventId, event.organization_id, 'planner', authClient) : Promise.resolve(false),
    plannerEventIdOrNull !== null && plannerProfileId
      ? resolveTaskCapability(plannerEventIdOrNull, plannerProfileId).then(
          (capability) => ({ capability }),
          (err: unknown) => ({ err })
        )
      : Promise.resolve(null),
  ]);

  // Same order of checks and the same responses as before.
  if (!hasWorkspaceAccess) {
    return NextResponse.json({ error: 'event_not_found' }, { status: 404 });
  }
  if (!event) {
    return NextResponse.json({ error: 'event_not_found' }, { status: 404 });
  }
  if (!productAvailable) {
    return NextResponse.json({ error: 'product_unavailable' }, { status: 403 });
  }

  const provisioningPhase = resolveProvisioningPhase(event);
  if (provisioningPhase !== 'needs-link-check') {
    return NextResponse.json({ ok: true, status: provisioningPhase });
  }

  if (linkResult.error) {
    console.error('planner-tasks: event_planner_links lookup failed', linkResult.error);
    return NextResponse.json({ ok: true, status: 'backend_error' });
  }
  if (plannerEventIdOrNull === null) {
    return NextResponse.json({ ok: true, status: 'unavailable' });
  }
  const plannerEventId = plannerEventIdOrNull;

  if (!plannerProfileId) {
    return NextResponse.json({ error: 'planner_identity_unavailable' }, { status: 403 });
  }

  if (!capabilityResult || 'err' in capabilityResult) {
    // `/speckit.analyze` H2 — a genuine capability-read failure MUST NOT be
    // reported as an ordinary denial (Feature 006 F1 defect class).
    console.error('planner-tasks: capability resolution failed', capabilityResult && capabilityResult.err);
    return NextResponse.json({ ok: true, status: 'backend_error' });
  }
  const { capability } = capabilityResult;

  if (!capability.canView) {
    // `/speckit.analyze` H1 — no self-assignee read bypass. Failing this gate
    // denies the caller unconditionally, regardless of any task assignment.
    return NextResponse.json({ error: 'task_access_denied' }, { status: 403 });
  }

  return { authClient, plannerEventId, plannerProfileId, capability };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const context = await resolveAuthorizedContext(eventId);
  if (context instanceof NextResponse) return context;

  const { plannerEventId, plannerProfileId, capability } = context;

  try {
    // Feature 019 (FR-008): independent reads — run them in parallel.
    const [tasks, assignableStaff] = await Promise.all([
      listEventTasks(plannerEventId),
      capability.canManage ? listAssignableStaff(plannerEventId) : Promise.resolve([]),
    ]);
    // `callerProfileId` is the caller's OWN Planner identity, echoed back so the
    // client can identify which task (if any) is assigned to them for the
    // self-assignee status/remarks control (FR-022/FR-023) -- safe to expose
    // since it is never another user's identifier.
    return NextResponse.json({ ok: true, capability, callerProfileId: plannerProfileId, tasks, assignableStaff });
  } catch (err) {
    console.error('planner-tasks: GET failed', err);
    return NextResponse.json({ ok: true, status: 'backend_error' });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const context = await resolveAuthorizedContext(eventId);
  if (context instanceof NextResponse) return context;

  const { plannerEventId, plannerProfileId, capability } = context;

  if (!capability.canManage) {
    return NextResponse.json({ error: 'task_manage_denied' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_request', message: 'Malformed request body.' }, { status: 400 });
  }

  if (typeof body.task !== 'string' || !body.task.trim()) {
    return NextResponse.json({ error: 'invalid_request', message: 'Task title is required.' }, { status: 400 });
  }

  try {
    const task = await createTask(plannerEventId, plannerProfileId, {
      task: body.task,
      category: typeof body.category === 'string' ? body.category : null,
      priority: typeof body.priority === 'string' ? body.priority : '',
      dueDate: typeof body.dueDate === 'string' ? body.dueDate : null,
      remarks: typeof body.remarks === 'string' ? body.remarks : null,
      assignedProfileId: typeof body.assignedProfileId === 'string' ? body.assignedProfileId : null,
    });
    return NextResponse.json({ ok: true, task }, { status: 201 });
  } catch (err) {
    const { category, message } = normalizePlannerTaskError(err);
    const status = category === 'planner_write_failed' ? 500 : 400;
    return NextResponse.json({ error: category, message }, { status });
  }
}
