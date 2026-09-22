import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { requireEventWorkspaceAccess, isProductAvailableForEvent, canAdministerPlannerPermissions } from '@/lib/eventAuth';
import { resolveProvisioningPhase } from '@/lib/plannerOverview';
import {
  resolveCallerPlannerIdentity,
  resolveProductionCapability,
  getSession,
  updateSession,
  deleteSession,
  normalizePlannerProductionError,
  type ResolvedProductionCapability,
  type ProductionSessionPatch,
} from '@/lib/plannerProduction';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Feature 014 — Production: single-session route (manage-only field edit on
 * PATCH; manage-only delete on DELETE, blocked while another session
 * references it as its parallel parent).
 */

type AuthorizedContext = { plannerEventId: number; capability: ResolvedProductionCapability };

async function resolveAuthorizedContext(eventId: string): Promise<NextResponse | AuthorizedContext> {
  if (!eventId) return NextResponse.json({ error: 'event_not_found' }, { status: 404 });

  const cookieStore = await cookies();
  const authClient: SupabaseClient = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
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
    if (membershipsError) console.error('planner-production/[productionId]: organization_members lookup failed', membershipsError);
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
    console.error('planner-production/[productionId]: missing SUPABASE_SERVICE_ROLE_KEY');
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
    console.error('planner-production/[productionId]: event_planner_links lookup failed', linkError);
    return NextResponse.json({ ok: true, status: 'backend_error' });
  }
  if (!activeLink) {
    return NextResponse.json({ ok: true, status: 'unavailable' });
  }

  const plannerEventId = activeLink.planner_event_id as number;

  const canAdminister = await canAdministerPlannerPermissions(eventId, user.id, authClient);
  const plannerProfileId = await resolveCallerPlannerIdentity(authClient, user.id);

  let capability: ResolvedProductionCapability;
  if (canAdminister) {
    capability = { hasPlannerIdentity: true, canView: true, canManage: true };
  } else if (!plannerProfileId) {
    return NextResponse.json({ error: 'planner_identity_unavailable' }, { status: 403 });
  } else {
    try {
      capability = await resolveProductionCapability(plannerEventId, plannerProfileId);
    } catch (err) {
      console.error('planner-production/[productionId]: capability resolution failed', err);
      return NextResponse.json({ ok: true, status: 'backend_error' });
    }
  }

  if (!capability.canView) {
    return NextResponse.json({ error: 'production_access_denied' }, { status: 403 });
  }

  return { plannerEventId, capability };
}

function parseProductionId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const PATCH_ALLOWED_FIELDS = new Set([
  'sessionTitle',
  'sessionDate',
  'dayNumber',
  'startTime',
  'endTime',
  'taskType',
  'trackName',
  'roomName',
  'isParallel',
  'parentProductionId',
  'sortOrder',
  'participants',
  'mode',
  'micType',
  'presentation',
  'mainScreen',
  'notes',
  'stageHandNotes',
  'guestExperience',
  'status',
]);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ eventId: string; productionId: string }> }) {
  const { eventId, productionId: rawProductionId } = await params;
  const context = await resolveAuthorizedContext(eventId);
  if (context instanceof NextResponse) return context;

  const { plannerEventId, capability } = context;

  if (!capability.canManage) {
    return NextResponse.json({ error: 'production_manage_denied' }, { status: 403 });
  }

  const productionId = parseProductionId(rawProductionId);
  if (!productionId) return NextResponse.json({ error: 'production_session_not_found' }, { status: 404 });

  let existing;
  try {
    existing = await getSession(plannerEventId, productionId);
  } catch (err) {
    console.error('planner-production/[productionId]: PATCH pre-read failed', err);
    return NextResponse.json({ error: 'planner_write_failed', message: 'Could not save — try again.' }, { status: 500 });
  }
  if (!existing) return NextResponse.json({ error: 'production_session_not_found' }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_request', message: 'Malformed request body.' }, { status: 400 });
  }

  const unknownField = Object.keys(body).find((key) => !PATCH_ALLOWED_FIELDS.has(key));
  if (unknownField) {
    return NextResponse.json({ error: 'invalid_request', message: `Unsupported field: ${unknownField}.` }, { status: 400 });
  }
  const presentFields = Object.keys(body).filter((key) => PATCH_ALLOWED_FIELDS.has(key));
  if (presentFields.length === 0) {
    return NextResponse.json({ error: 'invalid_request', message: 'At least one field is required.' }, { status: 400 });
  }
  if ('sessionTitle' in body && (typeof body.sessionTitle !== 'string' || !body.sessionTitle.trim())) {
    return NextResponse.json({ error: 'invalid_request', message: 'Session title cannot be empty.' }, { status: 400 });
  }
  if ('sessionDate' in body && (typeof body.sessionDate !== 'string' || !body.sessionDate.trim())) {
    return NextResponse.json({ error: 'invalid_request', message: 'Session date cannot be empty.' }, { status: 400 });
  }
  if ('isParallel' in body && typeof body.isParallel !== 'boolean') {
    return NextResponse.json({ error: 'invalid_request', message: 'isParallel must be a boolean.' }, { status: 400 });
  }

  try {
    const patch: ProductionSessionPatch = {};
    if ('sessionTitle' in body) patch.sessionTitle = body.sessionTitle as string;
    if ('sessionDate' in body) patch.sessionDate = body.sessionDate as string;
    if ('dayNumber' in body) patch.dayNumber = body.dayNumber as number | null;
    if ('startTime' in body) patch.startTime = body.startTime as string | null;
    if ('endTime' in body) patch.endTime = body.endTime as string | null;
    if ('taskType' in body) patch.taskType = body.taskType as string | null;
    if ('trackName' in body) patch.trackName = body.trackName as string | null;
    if ('roomName' in body) patch.roomName = body.roomName as string | null;
    if ('isParallel' in body) patch.isParallel = body.isParallel as boolean;
    if ('parentProductionId' in body) patch.parentProductionId = body.parentProductionId as number | null;
    if ('sortOrder' in body) patch.sortOrder = body.sortOrder as number | null;
    if ('participants' in body) patch.participants = body.participants as string | null;
    if ('mode' in body) patch.mode = body.mode as string | null;
    if ('micType' in body) patch.micType = body.micType as string | null;
    if ('presentation' in body) patch.presentation = body.presentation as string | null;
    if ('mainScreen' in body) patch.mainScreen = body.mainScreen as string | null;
    if ('notes' in body) patch.notes = body.notes as string | null;
    if ('stageHandNotes' in body) patch.stageHandNotes = body.stageHandNotes as string | null;
    if ('guestExperience' in body) patch.guestExperience = body.guestExperience as string | null;
    if ('status' in body) patch.status = body.status as string | null;
    const session = await updateSession(plannerEventId, productionId, patch);
    return NextResponse.json({ ok: true, session });
  } catch (err) {
    const { category, message } = normalizePlannerProductionError(err);
    const status = category === 'production_session_not_found' ? 404 : category === 'planner_write_failed' ? 500 : 400;
    return NextResponse.json({ error: category, message }, { status });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ eventId: string; productionId: string }> }) {
  const { eventId, productionId: rawProductionId } = await params;
  const context = await resolveAuthorizedContext(eventId);
  if (context instanceof NextResponse) return context;

  const { plannerEventId, capability } = context;

  if (!capability.canManage) {
    return NextResponse.json({ error: 'production_manage_denied' }, { status: 403 });
  }

  const productionId = parseProductionId(rawProductionId);
  if (!productionId) return NextResponse.json({ error: 'production_session_not_found' }, { status: 404 });

  try {
    await deleteSession(plannerEventId, productionId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { category, message } = normalizePlannerProductionError(err);
    const status = category === 'production_session_not_found' ? 404 : category === 'planner_write_failed' ? 500 : 400;
    return NextResponse.json({ error: category, message }, { status });
  }
}
