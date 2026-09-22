import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { requireEventWorkspaceAccess, isProductAvailableForEvent } from '@/lib/eventAuth';
import { resolveProvisioningPhase } from '@/lib/plannerOverview';
import {
  resolveCallerPlannerIdentity,
  resolveTaskCapability,
  getEventTask,
  updateTaskAsManager,
  updateTaskAsSelfAssignee,
  deleteTask,
  normalizePlannerTaskError,
  type ResolvedTaskCapability,
} from '@/lib/plannerTasks';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Feature 007 — Bendie Planner Tasks: single-task route (manager or
 * self-assignee update on PATCH; manager-only hard delete on DELETE).
 *
 * Same steps 1-7 as `../route.ts` (copied inline, see that file's doc
 * comment for the full rationale), plus a shared step resolving the specific
 * task and verifying it belongs to the resolved event BEFORE either handler
 * runs (FR-016, FR-028, FR-054, FR-055) — a `taskId` from another event
 * returns `404 task_not_found`, never leaking cross-event existence.
 */

type AuthorizedContext = {
  authClient: SupabaseClient;
  plannerEventId: number;
  plannerProfileId: string;
  capability: ResolvedTaskCapability;
};

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

  if (!isPlatformAdmin) {
    const { data: memberships, error: membershipsError } = await authClient
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .order('organization_id', { ascending: true });
    if (membershipsError) console.error('planner-tasks/[taskId]: organization_members lookup failed', membershipsError);
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
    console.error('planner-tasks/[taskId]: missing SUPABASE_SERVICE_ROLE_KEY');
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
    console.error('planner-tasks/[taskId]: event_planner_links lookup failed', linkError);
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
    console.error('planner-tasks/[taskId]: capability resolution failed', err);
    return NextResponse.json({ ok: true, status: 'backend_error' });
  }

  if (!capability.canView) {
    return NextResponse.json({ error: 'task_access_denied' }, { status: 403 });
  }

  return { authClient, plannerEventId, plannerProfileId, capability };
}

function parseTaskId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ eventId: string; taskId: string }> }) {
  const { eventId, taskId: rawTaskId } = await params;
  const context = await resolveAuthorizedContext(eventId);
  if (context instanceof NextResponse) return context;

  const { plannerEventId, plannerProfileId, capability } = context;

  const taskId = parseTaskId(rawTaskId);
  if (!taskId) return NextResponse.json({ error: 'task_not_found' }, { status: 404 });

  let existing;
  try {
    existing = await getEventTask(plannerEventId, taskId);
  } catch (err) {
    console.error('planner-tasks/[taskId]: PATCH pre-read failed', err);
    return NextResponse.json({ error: 'planner_write_failed', message: 'Could not save — try again.' }, { status: 500 });
  }
  if (!existing) return NextResponse.json({ error: 'task_not_found' }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_request', message: 'Malformed request body.' }, { status: 400 });
  }

  const isSelfAssignee = existing.assignedProfileId === plannerProfileId;

  try {
    if (capability.canManage) {
      const task = await updateTaskAsManager(plannerEventId, taskId, existing.assignedProfileId, {
        task: typeof body.task === 'string' ? body.task : undefined,
        category: 'category' in body ? ((body.category as string | null) ?? null) : undefined,
        priority: typeof body.priority === 'string' ? body.priority : undefined,
        dueDate: 'dueDate' in body ? ((body.dueDate as string | null) ?? null) : undefined,
        remarks: 'remarks' in body ? ((body.remarks as string | null) ?? null) : undefined,
        assignedProfileId: 'assignedProfileId' in body ? ((body.assignedProfileId as string | null) ?? null) : undefined,
        status: typeof body.status === 'string' ? body.status : undefined,
      });
      return NextResponse.json({ ok: true, task });
    }

    if (isSelfAssignee) {
      const allowedFields = new Set(['status', 'remarks']);
      const submittedFields = Object.keys(body);
      const hasStructuralField = submittedFields.some((field) => !allowedFields.has(field));
      if (hasStructuralField) {
        return NextResponse.json({ error: 'task_manage_denied' }, { status: 403 });
      }
      const task = await updateTaskAsSelfAssignee(plannerEventId, taskId, plannerProfileId, {
        status: typeof body.status === 'string' ? body.status : undefined,
        remarks: 'remarks' in body ? ((body.remarks as string | null) ?? null) : undefined,
      });
      return NextResponse.json({ ok: true, task });
    }

    return NextResponse.json({ error: 'task_manage_denied' }, { status: 403 });
  } catch (err) {
    const { category, message } = normalizePlannerTaskError(err);
    const status = category === 'task_not_found' ? 404 : category === 'planner_write_failed' ? 500 : 400;
    return NextResponse.json({ error: category, message }, { status });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ eventId: string; taskId: string }> }) {
  const { eventId, taskId: rawTaskId } = await params;
  const context = await resolveAuthorizedContext(eventId);
  if (context instanceof NextResponse) return context;

  const { plannerEventId, capability } = context;

  const taskId = parseTaskId(rawTaskId);
  if (!taskId) return NextResponse.json({ error: 'task_not_found' }, { status: 404 });

  if (!capability.canManage) {
    return NextResponse.json({ error: 'task_manage_denied' }, { status: 403 });
  }

  try {
    await deleteTask(plannerEventId, taskId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { category, message } = normalizePlannerTaskError(err);
    const status = category === 'task_not_found' ? 404 : 500;
    return NextResponse.json({ error: category, message }, { status });
  }
}
