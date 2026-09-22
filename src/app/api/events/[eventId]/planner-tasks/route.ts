import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { requireEventWorkspaceAccess, isProductAvailableForEvent } from '@/lib/eventAuth';
import { resolveProvisioningPhase } from '@/lib/plannerOverview';
import {
  resolveCallerPlannerIdentity,
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

  const { data: profile } = await authClient.from('profiles').select('global_role, current_organization_id').eq('id', user.id).maybeSingle();

  const isPlatformAdmin = profile?.global_role === 'admin';
  let selectedOrganizationId: string | null = null;

  // Mirrors OrganizationContext's own resolution exactly, including the
  // `.order('organization_id',{ascending:true})` determinism fix — see
  // `planner-overview/route.ts` for the full rationale; copied verbatim.
  if (!isPlatformAdmin) {
    const { data: memberships, error: membershipsError } = await authClient
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .order('organization_id', { ascending: true });
    if (membershipsError) console.error('planner-tasks: organization_members lookup failed', membershipsError);
    const accessibleOrgIds = (memberships ?? []).map((m) => m.organization_id);
    const savedOrganizationId = profile?.current_organization_id ?? null;
    selectedOrganizationId = savedOrganizationId && accessibleOrgIds.includes(savedOrganizationId) ? savedOrganizationId : (accessibleOrgIds[0] ?? null);
  }

  if (!isPlatformAdmin && !selectedOrganizationId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const hasWorkspaceAccess = await requireEventWorkspaceAccess(eventId, user.id, selectedOrganizationId, authClient);
  if (!hasWorkspaceAccess) {
    return NextResponse.json({ error: 'event_not_found' }, { status: 404 });
  }

  const { data: event } = await authClient
    .from('events')
    .select('organization_id, planner_provisioning_status, planner_provisioning_last_attempted_at, created_at')
    .eq('id', eventId)
    .maybeSingle();
  if (!event) {
    return NextResponse.json({ error: 'event_not_found' }, { status: 404 });
  }

  const productAvailable = await isProductAvailableForEvent(eventId, event.organization_id, 'planner', authClient);
  if (!productAvailable) {
    return NextResponse.json({ error: 'product_unavailable' }, { status: 403 });
  }

  const provisioningPhase = resolveProvisioningPhase(event);
  if (provisioningPhase !== 'needs-link-check') {
    return NextResponse.json({ ok: true, status: provisioningPhase });
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error('planner-tasks: missing SUPABASE_SERVICE_ROLE_KEY');
    return NextResponse.json({ ok: true, status: 'backend_error' });
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
    console.error('planner-tasks: event_planner_links lookup failed', linkError);
    return NextResponse.json({ ok: true, status: 'backend_error' });
  }
  if (!activeLink) {
    return NextResponse.json({ ok: true, status: 'unavailable' });
  }

  const plannerEventId = activeLink.planner_event_id as number;

  const plannerProfileId = await resolveCallerPlannerIdentity(authClient, user.id);
  if (!plannerProfileId) {
    return NextResponse.json({ error: 'planner_identity_unavailable' }, { status: 403 });
  }

  let capability;
  try {
    capability = await resolveTaskCapability(plannerEventId, plannerProfileId);
  } catch (err) {
    // `/speckit.analyze` H2 — a genuine capability-read failure MUST NOT be
    // reported as an ordinary denial (Feature 006 F1 defect class).
    console.error('planner-tasks: capability resolution failed', err);
    return NextResponse.json({ ok: true, status: 'backend_error' });
  }

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
    const tasks = await listEventTasks(plannerEventId);
    const assignableStaff = capability.canManage ? await listAssignableStaff(plannerEventId) : [];
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
