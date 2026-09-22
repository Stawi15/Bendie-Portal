import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { requireEventWorkspaceAccess, isProductAvailableForEvent } from '@/lib/eventAuth';
import { resolveProvisioningPhase } from '@/lib/plannerOverview';
import {
  resolveCallerPlannerIdentity,
  resolveVendorCapability,
  getVendorItem,
  updateVendorItem,
  deleteVendorItem,
  normalizePlannerVendorError,
  type ResolvedVendorCapability,
} from '@/lib/plannerVendors';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Feature 009 — Bendie Planner Vendors: single-item route (manager-only
 * lifecycle/notes update on PATCH; manager-only hard delete on DELETE).
 *
 * Same steps 1-7 as `../route.ts` (copied inline, see that file's doc comment
 * for the full rationale), plus a shared step resolving the specific item and
 * verifying it belongs to the resolved event BEFORE either handler below runs
 * (FR-034, FR-036, SR-005) — an `itemId` from another event returns
 * `404 vendor_item_not_found`, never leaking cross-event existence.
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

  const { data: profile } = await authClient.from('profiles').select('global_role, current_organization_id').eq('id', user.id).maybeSingle();

  const isPlatformAdmin = profile?.global_role === 'admin';
  let selectedOrganizationId: string | null = null;

  if (!isPlatformAdmin) {
    const { data: memberships, error: membershipsError } = await authClient
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .order('organization_id', { ascending: true });
    if (membershipsError) console.error('planner-vendors/[itemId]: organization_members lookup failed', membershipsError);
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
    console.error('planner-vendors/[itemId]: missing SUPABASE_SERVICE_ROLE_KEY');
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
    console.error('planner-vendors/[itemId]: event_planner_links lookup failed', linkError);
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

  let capability: ResolvedVendorCapability;
  try {
    capability = await resolveVendorCapability(plannerEventId, plannerProfileId);
  } catch (err) {
    console.error('planner-vendors/[itemId]: capability resolution failed', err);
    return NextResponse.json({ ok: true, status: 'backend_error' });
  }

  if (!capability.canView) {
    return NextResponse.json({ error: 'vendor_access_denied' }, { status: 403 });
  }

  return { authClient, plannerEventId, plannerProfileId, capability };
}

function parseItemId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const PATCH_ALLOWED_FIELDS = new Set(['isPacked', 'isLoaded', 'isOnSite', 'notes']);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ eventId: string; itemId: string }> }) {
  const { eventId, itemId: rawItemId } = await params;
  const context = await resolveAuthorizedContext(eventId);
  if (context instanceof NextResponse) return context;

  const { plannerEventId, capability } = context;

  if (!capability.canManage) {
    return NextResponse.json({ error: 'vendor_manage_denied' }, { status: 403 });
  }

  const itemId = parseItemId(rawItemId);
  if (!itemId) return NextResponse.json({ error: 'vendor_item_not_found' }, { status: 404 });

  // Item-scope pre-check (FR-034/FR-036/SR-005) — a `null` result covers both
  // "genuinely missing" and "belongs to a different event," never leaking
  // cross-event existence.
  let existing;
  try {
    existing = await getVendorItem(plannerEventId, itemId);
  } catch (err) {
    console.error('planner-vendors/[itemId]: PATCH pre-read failed', err);
    return NextResponse.json({ error: 'planner_write_failed', message: 'Could not save — try again.' }, { status: 500 });
  }
  if (!existing) return NextResponse.json({ error: 'vendor_item_not_found' }, { status: 404 });

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

  if ('isPacked' in body && typeof body.isPacked !== 'boolean') {
    return NextResponse.json({ error: 'invalid_request', message: 'isPacked must be a boolean.' }, { status: 400 });
  }
  if ('isLoaded' in body && typeof body.isLoaded !== 'boolean') {
    return NextResponse.json({ error: 'invalid_request', message: 'isLoaded must be a boolean.' }, { status: 400 });
  }
  if ('isOnSite' in body && typeof body.isOnSite !== 'boolean') {
    return NextResponse.json({ error: 'invalid_request', message: 'isOnSite must be a boolean.' }, { status: 400 });
  }
  if ('notes' in body && body.notes !== null && typeof body.notes !== 'string') {
    return NextResponse.json({ error: 'invalid_request', message: 'notes must be a string or null.' }, { status: 400 });
  }

  try {
    const item = await updateVendorItem(plannerEventId, itemId, {
      isPacked: 'isPacked' in body ? (body.isPacked as boolean) : undefined,
      isLoaded: 'isLoaded' in body ? (body.isLoaded as boolean) : undefined,
      isOnSite: 'isOnSite' in body ? (body.isOnSite as boolean) : undefined,
      ...('notes' in body ? { notes: body.notes as string | null } : {}),
    });
    return NextResponse.json({ ok: true, item });
  } catch (err) {
    const { category, message } = normalizePlannerVendorError(err);
    const status = category === 'vendor_item_not_found' ? 404 : category === 'planner_write_failed' ? 500 : 400;
    return NextResponse.json({ error: category, message }, { status });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ eventId: string; itemId: string }> }) {
  const { eventId, itemId: rawItemId } = await params;
  const context = await resolveAuthorizedContext(eventId);
  if (context instanceof NextResponse) return context;

  const { plannerEventId, capability } = context;

  if (!capability.canManage) {
    return NextResponse.json({ error: 'vendor_manage_denied' }, { status: 403 });
  }

  const itemId = parseItemId(rawItemId);
  if (!itemId) return NextResponse.json({ error: 'vendor_item_not_found' }, { status: 404 });

  try {
    await deleteVendorItem(plannerEventId, itemId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { category, message } = normalizePlannerVendorError(err);
    const status = category === 'vendor_item_not_found' ? 404 : 500;
    return NextResponse.json({ error: category, message }, { status });
  }
}
