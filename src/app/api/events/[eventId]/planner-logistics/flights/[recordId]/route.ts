import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { requireEventWorkspaceAccess, isProductAvailableForEvent, canAdministerPlannerPermissions } from '@/lib/eventAuth';
import { resolveProvisioningPhase } from '@/lib/plannerOverview';
import {
  resolveCallerPlannerIdentity,
  resolveLogisticsCapability,
  getFlight,
  updateFlight,
  deleteFlight,
  normalizePlannerLogisticsError,
  type ResolvedLogisticsCapability,
} from '@/lib/plannerLogistics';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Feature 012 — Flights: single-record route (manage-only field edit on
 * PATCH; manage-only delete on DELETE). Same steps as `../route.ts` (copied
 * inline, same rationale), plus a shared item-scope pre-check — a
 * `recordId` linked only to a different event returns `404
 * logistics_record_not_found`, never leaking cross-event existence.
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
    if (membershipsError) console.error('planner-logistics/flights/[recordId]: organization_members lookup failed', membershipsError);
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
    console.error('planner-logistics/flights/[recordId]: missing SUPABASE_SERVICE_ROLE_KEY');
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
    console.error('planner-logistics/flights/[recordId]: event_planner_links lookup failed', linkError);
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
      console.error('planner-logistics/flights/[recordId]: capability resolution failed', err);
      return NextResponse.json({ ok: true, status: 'backend_error' });
    }
  }

  if (!capability.canView) {
    return NextResponse.json({ error: 'logistics_access_denied' }, { status: 403 });
  }

  return { plannerEventId, capability };
}

function parseRecordId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const PATCH_ALLOWED_FIELDS = new Set(['flightType', 'flightCode', 'region', 'flightDate', 'departureTime', 'arrivalTime', 'stops', 'notes', 'marked']);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ eventId: string; recordId: string }> }) {
  const { eventId, recordId: rawRecordId } = await params;
  const context = await resolveAuthorizedContext(eventId);
  if (context instanceof NextResponse) return context;

  const { plannerEventId, capability } = context;

  if (!capability.canManage) {
    return NextResponse.json({ error: 'logistics_manage_denied' }, { status: 403 });
  }

  const recordId = parseRecordId(rawRecordId);
  if (!recordId) return NextResponse.json({ error: 'logistics_record_not_found' }, { status: 404 });

  let existing;
  try {
    existing = await getFlight(plannerEventId, recordId);
  } catch (err) {
    console.error('planner-logistics/flights/[recordId]: PATCH pre-read failed', err);
    return NextResponse.json({ error: 'planner_write_failed', message: 'Could not save — try again.' }, { status: 500 });
  }
  if (!existing) return NextResponse.json({ error: 'logistics_record_not_found' }, { status: 404 });

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
  if ('flightType' in body && body.flightType !== 'arrival' && body.flightType !== 'departure') {
    return NextResponse.json({ error: 'invalid_request', message: 'flightType must be "arrival" or "departure".' }, { status: 400 });
  }
  if ('marked' in body && typeof body.marked !== 'boolean') {
    return NextResponse.json({ error: 'invalid_request', message: 'marked must be a boolean.' }, { status: 400 });
  }

  try {
    const patch: Record<string, unknown> = {};
    if ('flightType' in body) patch.flightType = body.flightType;
    if ('flightCode' in body) patch.flightCode = body.flightCode;
    if ('region' in body) patch.region = body.region;
    if ('flightDate' in body) patch.flightDate = body.flightDate;
    if ('departureTime' in body) patch.departureTime = body.departureTime;
    if ('arrivalTime' in body) patch.arrivalTime = body.arrivalTime;
    if ('stops' in body) patch.stops = body.stops;
    if ('notes' in body) patch.notes = body.notes;
    if ('marked' in body) patch.marked = body.marked;
    const flight = await updateFlight(plannerEventId, recordId, patch);
    return NextResponse.json({ ok: true, flight });
  } catch (err) {
    const { category, message } = normalizePlannerLogisticsError(err);
    const status = category === 'logistics_record_not_found' ? 404 : category === 'planner_write_failed' ? 500 : 400;
    return NextResponse.json({ error: category, message }, { status });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ eventId: string; recordId: string }> }) {
  const { eventId, recordId: rawRecordId } = await params;
  const context = await resolveAuthorizedContext(eventId);
  if (context instanceof NextResponse) return context;

  const { plannerEventId, capability } = context;

  if (!capability.canManage) {
    return NextResponse.json({ error: 'logistics_manage_denied' }, { status: 403 });
  }

  const recordId = parseRecordId(rawRecordId);
  if (!recordId) return NextResponse.json({ error: 'logistics_record_not_found' }, { status: 404 });

  try {
    await deleteFlight(plannerEventId, recordId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { category, message } = normalizePlannerLogisticsError(err);
    const status = category === 'logistics_record_not_found' ? 404 : 500;
    return NextResponse.json({ error: category, message }, { status });
  }
}
