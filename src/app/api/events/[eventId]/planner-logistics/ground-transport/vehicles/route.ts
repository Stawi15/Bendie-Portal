import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { requireEventWorkspaceAccess, isProductAvailableForEvent, canAdministerPlannerPermissions } from '@/lib/eventAuth';
import { resolveProvisioningPhase } from '@/lib/plannerOverview';
import { resolveCallerPlannerIdentity, resolveLogisticsCapability, createVehicle, normalizePlannerLogisticsError, type ResolvedLogisticsCapability } from '@/lib/plannerLogistics';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Feature 013 — Ground Transport: vehicle creation (manage-only). No GET
 * here — the movements endpoint's nested response is the single source for
 * the whole hierarchy (plan.md), avoiding an extra route and N+1 fetches.
 */

type AuthorizedContext = { plannerEventId: number; capability: ResolvedLogisticsCapability };

async function resolveAuthorizedContext(eventId: string): Promise<NextResponse | AuthorizedContext> {
  if (!eventId) return NextResponse.json({ error: 'event_not_found' }, { status: 404 });

  const cookieStore = await cookies();
  const authClient: SupabaseClient = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll().map(({ name, value }) => ({ name, value }));
      },
      setAll() {
        // No session refresh needed for this handler.
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
    if (membershipsError) console.error('ground-transport/vehicles: organization_members lookup failed', membershipsError);
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
    console.error('ground-transport/vehicles: missing SUPABASE_SERVICE_ROLE_KEY');
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
    console.error('ground-transport/vehicles: event_planner_links lookup failed', linkError);
    return NextResponse.json({ ok: true, status: 'backend_error' });
  }
  if (!activeLink) {
    return NextResponse.json({ ok: true, status: 'unavailable' });
  }

  const plannerEventId = activeLink.planner_event_id as number;

  const canAdminister = await canAdministerPlannerPermissions(eventId, user.id, authClient);
  const plannerProfileId = await resolveCallerPlannerIdentity(authClient, user.id);

  let capability: ResolvedLogisticsCapability;
  if (canAdminister) {
    capability = { hasPlannerIdentity: true, canView: true, canManage: true };
  } else if (!plannerProfileId) {
    return NextResponse.json({ error: 'planner_identity_unavailable' }, { status: 403 });
  } else {
    try {
      capability = await resolveLogisticsCapability(plannerEventId, plannerProfileId);
    } catch (err) {
      console.error('ground-transport/vehicles: capability resolution failed', err);
      return NextResponse.json({ ok: true, status: 'backend_error' });
    }
  }

  return { plannerEventId, capability };
}

const ALLOWED_FIELDS = new Set(['movementId', 'vehicleType', 'vehicleNo', 'maxCapacity', 'date', 'route', 'pickupTime', 'endTime', 'status', 'notes']);

export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const context = await resolveAuthorizedContext(eventId);
  if (context instanceof NextResponse) return context;

  const { plannerEventId, capability } = context;

  if (!capability.canManage) {
    return NextResponse.json({ error: 'logistics_manage_denied' }, { status: 403 });
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

  const movementId = Number(body.movementId);
  if (!Number.isInteger(movementId) || movementId <= 0) {
    return NextResponse.json({ error: 'invalid_request', message: 'movementId is required.' }, { status: 400 });
  }
  if (typeof body.vehicleType !== 'string' || !body.vehicleType.trim()) {
    return NextResponse.json({ error: 'invalid_request', message: 'Vehicle type is required.' }, { status: 400 });
  }
  if (!Number.isInteger(body.vehicleNo)) {
    return NextResponse.json({ error: 'invalid_request', message: 'Vehicle number is required.' }, { status: 400 });
  }
  if (!Number.isInteger(body.maxCapacity) || (body.maxCapacity as number) <= 0) {
    return NextResponse.json({ error: 'invalid_request', message: 'Max capacity must be a positive number.' }, { status: 400 });
  }
  if (typeof body.date !== 'string' || !body.date.trim()) {
    return NextResponse.json({ error: 'invalid_request', message: 'Date is required.' }, { status: 400 });
  }
  if (typeof body.route !== 'string' || !body.route.trim()) {
    return NextResponse.json({ error: 'invalid_request', message: 'Route is required.' }, { status: 400 });
  }

  try {
    const vehicle = await createVehicle(plannerEventId, movementId, {
      vehicleType: body.vehicleType,
      vehicleNo: body.vehicleNo as number,
      maxCapacity: body.maxCapacity as number,
      date: body.date,
      route: body.route,
      pickupTime: typeof body.pickupTime === 'string' ? body.pickupTime : null,
      endTime: typeof body.endTime === 'string' ? body.endTime : null,
      status: typeof body.status === 'string' ? body.status : null,
      notes: typeof body.notes === 'string' ? body.notes : null,
    });
    return NextResponse.json({ ok: true, vehicle }, { status: 201 });
  } catch (err) {
    const { category, message } = normalizePlannerLogisticsError(err);
    const status = category === 'logistics_record_not_found' ? 404 : category === 'planner_write_failed' ? 500 : 400;
    return NextResponse.json({ error: category, message }, { status });
  }
}
