import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { requireEventWorkspaceAccess, isProductAvailableForEvent } from '@/lib/eventAuth';
import { resolveProvisioningPhase } from '@/lib/plannerOverview';
import {
  resolveVendorCapability,
  listVendorItems,
  createVendorItem,
  normalizePlannerVendorError,
  type ResolvedVendorCapability,
} from '@/lib/plannerVendors';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Feature 009 — Bendie Planner Vendors: collection route (list + capability on
 * GET; manager-only create on POST).
 *
 * Authorization sequence (every step independently re-verified on every
 * request, matching `planner-tasks/route.ts`'s established shape exactly):
 *
 *   1. authenticate
 *   2. resolve the caller's selected organization (membership-derived fallback)
 *   3. Portal event-workspace admission (requireEventWorkspaceAccess) — FR-003
 *   4. Planner product availability (isProductAvailableForEvent)
 *   5. provisioning/link precedence (resolveProvisioningPhase + event_planner_links)
 *   6. Planner identity resolution (profiles.planner_profile_id bridge)
 *   7. Planner vendor capability resolution (event_user_assignments / platform-admin)
 *
 * Deliberately NOT refactored into a shared helper with the other
 * planner-vendors routes (matching Feature 007/008's own precedent) — copied
 * inline so no future edit to one route can silently alter another's
 * authorization behavior.
 */

type AuthorizedContext = { authClient: SupabaseClient; plannerEventId: number; plannerProfileId: string; capability: ResolvedVendorCapability };

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
    if (membershipsError) console.error('planner-vendors: organization_members lookup failed', membershipsError);
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
    console.error('planner-vendors: missing SUPABASE_SERVICE_ROLE_KEY');
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
    console.error('planner-vendors: event_planner_links lookup failed', linkError);
    return NextResponse.json({ ok: true, status: 'backend_error' });
  }
  if (!activeLink) {
    return NextResponse.json({ ok: true, status: 'unavailable' });
  }

  const plannerEventId = activeLink.planner_event_id as number;

  const plannerProfileId = profile?.planner_profile_id ?? null;
  if (!plannerProfileId) {
    return NextResponse.json({ error: 'planner_identity_unavailable' }, { status: 403 });
  }

  let capability: ResolvedVendorCapability;
  try {
    capability = await resolveVendorCapability(plannerEventId, plannerProfileId);
  } catch (err) {
    console.error('planner-vendors: capability resolution failed', err);
    return NextResponse.json({ ok: true, status: 'backend_error' });
  }

  if (!capability.canView) {
    return NextResponse.json({ error: 'vendor_access_denied' }, { status: 403 });
  }

  return { authClient, plannerEventId, plannerProfileId, capability };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const context = await resolveAuthorizedContext(eventId);
  if (context instanceof NextResponse) return context;

  const { plannerEventId, capability } = context;

  try {
    const items = await listVendorItems(plannerEventId);
    return NextResponse.json({ ok: true, capability, items });
  } catch (err) {
    console.error('planner-vendors: GET failed', err);
    return NextResponse.json({ ok: true, status: 'backend_error' });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const context = await resolveAuthorizedContext(eventId);
  if (context instanceof NextResponse) return context;

  const { plannerEventId, plannerProfileId, capability } = context;

  if (!capability.canManage) {
    return NextResponse.json({ error: 'vendor_manage_denied' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_request', message: 'Malformed request body.' }, { status: 400 });
  }

  const allowedFields = new Set(['category', 'description', 'quantityText', 'unit', 'notes', 'sortOrder']);
  const unknownField = Object.keys(body).find((key) => !allowedFields.has(key));
  if (unknownField) {
    return NextResponse.json({ error: 'invalid_request', message: `Unsupported field: ${unknownField}.` }, { status: 400 });
  }

  if (typeof body.description !== 'string' || !body.description.trim()) {
    return NextResponse.json({ error: 'invalid_request', message: 'Item description is required.' }, { status: 400 });
  }

  if (body.sortOrder !== undefined && typeof body.sortOrder !== 'number') {
    return NextResponse.json({ error: 'invalid_request', message: 'sortOrder must be a number.' }, { status: 400 });
  }

  try {
    const item = await createVendorItem(plannerEventId, plannerProfileId, {
      description: body.description,
      category: typeof body.category === 'string' ? body.category : null,
      quantityText: typeof body.quantityText === 'string' ? body.quantityText : null,
      unit: typeof body.unit === 'string' ? body.unit : null,
      notes: typeof body.notes === 'string' ? body.notes : null,
      sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : undefined,
    });
    return NextResponse.json({ ok: true, item }, { status: 201 });
  } catch (err) {
    const { category, message } = normalizePlannerVendorError(err);
    const status = category === 'planner_write_failed' ? 500 : 400;
    return NextResponse.json({ error: category, message }, { status });
  }
}
