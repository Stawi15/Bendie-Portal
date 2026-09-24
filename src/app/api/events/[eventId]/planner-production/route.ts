import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { requireEventWorkspaceAccess, isProductAvailableForEvent, canAdministerPlannerPermissions } from '@/lib/eventAuth';
import { resolveProvisioningPhase } from '@/lib/plannerOverview';
import {
  resolveProductionCapability,
  listSessions,
  createSession,
  normalizePlannerProductionError,
  type ResolvedProductionCapability,
} from '@/lib/plannerProduction';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Feature 014 — Production: collection route (list from `production_sessions_v`
 * + capability on GET; manage-only create on POST). Authorization sequence
 * identical to every prior planner-* route (plan.md).
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

  // Feature 016 performance pass — also select `planner_profile_id` here so the
  // separate `resolveCallerPlannerIdentity` round trip below (which queried
  // this exact same row by the same id) can be eliminated entirely.
  const { data: profile } = await authClient.from('profiles').select('global_role, current_organization_id, planner_profile_id').eq('id', user.id).maybeSingle();

  const isPlatformAdmin = profile?.global_role === 'admin';
  let selectedOrganizationId: string | null = null;

  if (!isPlatformAdmin) {
    const { data: memberships, error: membershipsError } = await authClient
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .order('organization_id', { ascending: true });
    if (membershipsError) console.error('planner-production: organization_members lookup failed', membershipsError);
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
    console.error('planner-production: missing SUPABASE_SERVICE_ROLE_KEY');
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
    console.error('planner-production: event_planner_links lookup failed', linkError);
    return NextResponse.json({ ok: true, status: 'backend_error' });
  }
  if (!activeLink) {
    return NextResponse.json({ ok: true, status: 'unavailable' });
  }

  const plannerEventId = activeLink.planner_event_id as number;

  const canAdminister = await canAdministerPlannerPermissions(eventId, user.id, authClient);
  const plannerProfileId = profile?.planner_profile_id ?? null;

  let capability: ResolvedProductionCapability;
  if (canAdminister) {
    capability = { hasPlannerIdentity: true, canView: true, canManage: true };
  } else if (!plannerProfileId) {
    return NextResponse.json({ error: 'planner_identity_unavailable' }, { status: 403 });
  } else {
    try {
      capability = await resolveProductionCapability(plannerEventId, plannerProfileId);
    } catch (err) {
      console.error('planner-production: capability resolution failed', err);
      return NextResponse.json({ ok: true, status: 'backend_error' });
    }
  }

  if (!capability.canView) {
    return NextResponse.json({ error: 'production_access_denied' }, { status: 403 });
  }

  return { plannerEventId, capability };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const context = await resolveAuthorizedContext(eventId);
  if (context instanceof NextResponse) return context;

  const { plannerEventId, capability } = context;

  try {
    const sessions = await listSessions(plannerEventId);
    return NextResponse.json({ ok: true, capability, sessions });
  } catch (err) {
    console.error('planner-production: GET failed', err);
    return NextResponse.json({ ok: true, status: 'backend_error' });
  }
}

const ALLOWED_FIELDS = new Set([
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

export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const context = await resolveAuthorizedContext(eventId);
  if (context instanceof NextResponse) return context;

  const { plannerEventId, capability } = context;

  if (!capability.canManage) {
    return NextResponse.json({ error: 'production_manage_denied' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_request', message: 'Malformed request body.' }, { status: 400 });
  }

  const unknownField = Object.keys(body).find((key) => !ALLOWED_FIELDS.has(key));
  if (unknownField) {
    return NextResponse.json({ error: 'invalid_request', message: `Unsupported field: ${unknownField}.` }, { status: 400 });
  }
  if (typeof body.sessionTitle !== 'string' || !body.sessionTitle.trim()) {
    return NextResponse.json({ error: 'invalid_request', message: 'Session title is required.' }, { status: 400 });
  }
  if (typeof body.sessionDate !== 'string' || !body.sessionDate.trim()) {
    return NextResponse.json({ error: 'invalid_request', message: 'Session date is required.' }, { status: 400 });
  }
  if ('isParallel' in body && typeof body.isParallel !== 'boolean') {
    return NextResponse.json({ error: 'invalid_request', message: 'isParallel must be a boolean.' }, { status: 400 });
  }
  if ('dayNumber' in body && body.dayNumber !== null && !Number.isInteger(body.dayNumber)) {
    return NextResponse.json({ error: 'invalid_request', message: 'dayNumber must be a number or null.' }, { status: 400 });
  }
  if ('sortOrder' in body && body.sortOrder !== null && !Number.isInteger(body.sortOrder)) {
    return NextResponse.json({ error: 'invalid_request', message: 'sortOrder must be a number or null.' }, { status: 400 });
  }
  if ('parentProductionId' in body && body.parentProductionId !== null && !Number.isInteger(body.parentProductionId)) {
    return NextResponse.json({ error: 'invalid_request', message: 'parentProductionId must be a number or null.' }, { status: 400 });
  }

  const stringField = (key: string) => (typeof body[key] === 'string' ? (body[key] as string) : null);

  try {
    const session = await createSession(plannerEventId, {
      sessionTitle: body.sessionTitle,
      sessionDate: body.sessionDate,
      dayNumber: (body.dayNumber as number | null | undefined) ?? null,
      startTime: stringField('startTime'),
      endTime: stringField('endTime'),
      taskType: stringField('taskType'),
      trackName: stringField('trackName'),
      roomName: stringField('roomName'),
      isParallel: typeof body.isParallel === 'boolean' ? body.isParallel : undefined,
      parentProductionId: (body.parentProductionId as number | null | undefined) ?? null,
      sortOrder: (body.sortOrder as number | null | undefined) ?? null,
      participants: stringField('participants'),
      mode: stringField('mode'),
      micType: stringField('micType'),
      presentation: stringField('presentation'),
      mainScreen: stringField('mainScreen'),
      notes: stringField('notes'),
      stageHandNotes: stringField('stageHandNotes'),
      guestExperience: stringField('guestExperience'),
      status: stringField('status'),
    });
    return NextResponse.json({ ok: true, session }, { status: 201 });
  } catch (err) {
    const { category, message } = normalizePlannerProductionError(err);
    const status = category === 'planner_write_failed' ? 500 : 400;
    return NextResponse.json({ error: category, message }, { status });
  }
}
