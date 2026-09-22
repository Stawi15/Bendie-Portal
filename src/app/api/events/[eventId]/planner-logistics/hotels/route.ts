import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { requireEventWorkspaceAccess, isProductAvailableForEvent, canAdministerPlannerPermissions } from '@/lib/eventAuth';
import { resolveProvisioningPhase } from '@/lib/plannerOverview';
import {
  resolveCallerPlannerIdentity,
  resolveLogisticsCapability,
  listHotelBookings,
  createHotelBooking,
  normalizePlannerLogisticsError,
  type ResolvedLogisticsCapability,
} from '@/lib/plannerLogistics';
import { getParticipant } from '@/lib/plannerPeople';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Feature 012 — Hotels: collection route (list + capability on GET;
 * manage-only create on POST). Same authorization composition as
 * `../flights/route.ts` (copied inline, same rationale).
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
    if (membershipsError) console.error('planner-logistics/hotels: organization_members lookup failed', membershipsError);
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
    console.error('planner-logistics/hotels: missing SUPABASE_SERVICE_ROLE_KEY');
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
    console.error('planner-logistics/hotels: event_planner_links lookup failed', linkError);
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
      console.error('planner-logistics/hotels: capability resolution failed', err);
      return NextResponse.json({ ok: true, status: 'backend_error' });
    }
  }

  if (!capability.canView) {
    return NextResponse.json({ error: 'logistics_access_denied' }, { status: 403 });
  }

  return { plannerEventId, capability };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const context = await resolveAuthorizedContext(eventId);
  if (context instanceof NextResponse) return context;

  const { plannerEventId, capability } = context;

  try {
    const bookings = await listHotelBookings(plannerEventId);
    return NextResponse.json({ ok: true, capability, bookings });
  } catch (err) {
    console.error('planner-logistics/hotels: GET failed', err);
    return NextResponse.json({ ok: true, status: 'backend_error' });
  }
}

const ALLOWED_FIELDS = new Set([
  'passengerId',
  'country',
  'hotelName',
  'roomNumber',
  'roomingLabel',
  'accommodationRequired',
  'checkInDate',
  'checkOutDate',
  'nightsCount',
  'specialStayPattern',
  'notes',
]);

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

  const passengerId = Number(body.passengerId);
  if (!Number.isInteger(passengerId) || passengerId <= 0) {
    return NextResponse.json({ error: 'invalid_request', message: 'passengerId is required.' }, { status: 400 });
  }
  if ('accommodationRequired' in body && typeof body.accommodationRequired !== 'boolean') {
    return NextResponse.json({ error: 'invalid_request', message: 'accommodationRequired must be a boolean.' }, { status: 400 });
  }
  if ('roomNumber' in body && body.roomNumber !== null && typeof body.roomNumber !== 'number') {
    return NextResponse.json({ error: 'invalid_request', message: 'roomNumber must be a number or null.' }, { status: 400 });
  }
  if ('nightsCount' in body && body.nightsCount !== null && typeof body.nightsCount !== 'number') {
    return NextResponse.json({ error: 'invalid_request', message: 'nightsCount must be a number or null.' }, { status: 400 });
  }

  // Participant-scope check (Feature 011 reuse, spec.md).
  let participant;
  try {
    participant = await getParticipant(plannerEventId, passengerId);
  } catch (err) {
    console.error('planner-logistics/hotels: participant lookup failed', err);
    return NextResponse.json({ error: 'planner_write_failed', message: 'Could not save — try again.' }, { status: 500 });
  }
  if (!participant) {
    return NextResponse.json({ error: 'participant_not_found', message: 'This participant is not part of the current event.' }, { status: 400 });
  }

  try {
    const booking = await createHotelBooking(plannerEventId, {
      passengerId,
      country: typeof body.country === 'string' ? body.country : null,
      hotelName: typeof body.hotelName === 'string' ? body.hotelName : null,
      roomNumber: typeof body.roomNumber === 'number' ? body.roomNumber : null,
      roomingLabel: typeof body.roomingLabel === 'string' ? body.roomingLabel : null,
      accommodationRequired: typeof body.accommodationRequired === 'boolean' ? body.accommodationRequired : undefined,
      checkInDate: typeof body.checkInDate === 'string' ? body.checkInDate : null,
      checkOutDate: typeof body.checkOutDate === 'string' ? body.checkOutDate : null,
      nightsCount: typeof body.nightsCount === 'number' ? body.nightsCount : null,
      specialStayPattern: typeof body.specialStayPattern === 'string' ? body.specialStayPattern : null,
      notes: typeof body.notes === 'string' ? body.notes : null,
    });
    return NextResponse.json({ ok: true, booking }, { status: 201 });
  } catch (err) {
    const { category, message } = normalizePlannerLogisticsError(err);
    const status = category === 'planner_write_failed' ? 500 : 400;
    return NextResponse.json({ error: category, message }, { status });
  }
}
