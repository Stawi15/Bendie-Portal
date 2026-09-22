import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { requireEventWorkspaceAccess, isProductAvailableForEvent } from '@/lib/eventAuth';
import { resolveProvisioningPhase } from '@/lib/plannerOverview';
import {
  resolveCallerPlannerIdentity,
  resolveChecklistCapability,
  listChecklistItems,
  listEligibleOwners,
  createChecklistItem,
  normalizePlannerChecklistError,
  type ResolvedChecklistCapability,
} from '@/lib/plannerChecklist';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Feature 010 — Bendie Planner Checklist: collection route (list + capability
 * + eligible owners on GET; manager-only create on POST). Same 8-step
 * authorization sequence as `planner-vendors/route.ts`, copied inline per
 * Feature 007/008/009's own precedent.
 */

type AuthorizedContext = { authClient: SupabaseClient; plannerEventId: number; plannerProfileId: string; capability: ResolvedChecklistCapability };

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
    if (membershipsError) console.error('planner-checklist: organization_members lookup failed', membershipsError);
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
    console.error('planner-checklist: missing SUPABASE_SERVICE_ROLE_KEY');
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
    console.error('planner-checklist: event_planner_links lookup failed', linkError);
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

  let capability: ResolvedChecklistCapability;
  try {
    capability = await resolveChecklistCapability(plannerEventId, plannerProfileId);
  } catch (err) {
    console.error('planner-checklist: capability resolution failed', err);
    return NextResponse.json({ ok: true, status: 'backend_error' });
  }

  if (!capability.canView) {
    return NextResponse.json({ error: 'checklist_access_denied' }, { status: 403 });
  }

  return { authClient, plannerEventId, plannerProfileId, capability };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const context = await resolveAuthorizedContext(eventId);
  if (context instanceof NextResponse) return context;

  const { plannerEventId, plannerProfileId, capability } = context;

  try {
    const items = await listChecklistItems(plannerEventId, plannerProfileId, capability.canManage);
    const eligibleOwners = capability.canManage ? await listEligibleOwners(plannerEventId) : [];
    return NextResponse.json({ ok: true, capability, items, eligibleOwners });
  } catch (err) {
    console.error('planner-checklist: GET failed', err);
    return NextResponse.json({ ok: true, status: 'backend_error' });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const context = await resolveAuthorizedContext(eventId);
  if (context instanceof NextResponse) return context;

  const { plannerEventId, plannerProfileId, capability } = context;

  if (!capability.canManage) {
    return NextResponse.json({ error: 'checklist_manage_denied' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_request', message: 'Malformed request body.' }, { status: 400 });
  }

  const allowedFields = new Set(['category', 'itemName', 'quantityText', 'specification', 'notes', 'dayNumber', 'eventDayDate', 'ownerProfileId', 'sortOrder']);
  const unknownField = Object.keys(body).find((key) => !allowedFields.has(key));
  if (unknownField) {
    return NextResponse.json({ error: 'invalid_request', message: `Unsupported field: ${unknownField}.` }, { status: 400 });
  }

  if (typeof body.itemName !== 'string' || !body.itemName.trim()) {
    return NextResponse.json({ error: 'invalid_request', message: 'Item name is required.' }, { status: 400 });
  }
  if (body.dayNumber !== undefined && body.dayNumber !== null && typeof body.dayNumber !== 'number') {
    return NextResponse.json({ error: 'invalid_request', message: 'dayNumber must be a number.' }, { status: 400 });
  }
  if (body.sortOrder !== undefined && typeof body.sortOrder !== 'number') {
    return NextResponse.json({ error: 'invalid_request', message: 'sortOrder must be a number.' }, { status: 400 });
  }

  try {
    const item = await createChecklistItem(plannerEventId, plannerProfileId, {
      itemName: body.itemName,
      category: typeof body.category === 'string' ? body.category : null,
      quantityText: typeof body.quantityText === 'string' ? body.quantityText : null,
      specification: typeof body.specification === 'string' ? body.specification : null,
      notes: typeof body.notes === 'string' ? body.notes : null,
      dayNumber: typeof body.dayNumber === 'number' ? body.dayNumber : null,
      eventDayDate: typeof body.eventDayDate === 'string' ? body.eventDayDate : null,
      ownerProfileId: typeof body.ownerProfileId === 'string' ? body.ownerProfileId : null,
      sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : undefined,
    });
    return NextResponse.json({ ok: true, item }, { status: 201 });
  } catch (err) {
    const { category, message } = normalizePlannerChecklistError(err);
    const status = category === 'planner_write_failed' ? 500 : 400;
    return NextResponse.json({ error: category, message }, { status });
  }
}
