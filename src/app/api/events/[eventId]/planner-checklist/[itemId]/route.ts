import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { requireEventWorkspaceAccess, isProductAvailableForEvent } from '@/lib/eventAuth';
import { resolveProvisioningPhase } from '@/lib/plannerOverview';
import {
  resolveCallerPlannerIdentity,
  resolveChecklistCapability,
  getChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  normalizePlannerChecklistError,
  type ResolvedChecklistCapability,
} from '@/lib/plannerChecklist';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Feature 010 — Bendie Planner Checklist: single-item route (manager-only
 * lifecycle/notes update on PATCH — Feature 020 adds item-detail edits; manager-only hard delete on DELETE).
 * Same 8-step sequence as `planner-vendors/[itemId]/route.ts`, plus the same
 * item-scope pre-fetch pattern.
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
    if (membershipsError) console.error('planner-checklist/[itemId]: organization_members lookup failed', membershipsError);
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
    console.error('planner-checklist/[itemId]: missing SUPABASE_SERVICE_ROLE_KEY');
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
    console.error('planner-checklist/[itemId]: event_planner_links lookup failed', linkError);
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
    console.error('planner-checklist/[itemId]: capability resolution failed', err);
    return NextResponse.json({ ok: true, status: 'backend_error' });
  }

  if (!capability.canView) {
    return NextResponse.json({ error: 'checklist_access_denied' }, { status: 403 });
  }

  return { authClient, plannerEventId, plannerProfileId, capability };
}

function parseItemId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const PATCH_ALLOWED_FIELDS = new Set(['isSourced', 'isOnSite', 'notes', 'itemName', 'category', 'quantityText', 'specification', 'dayNumber', 'eventDayDate', 'ownerProfileId']);
const NULLABLE_STRING_FIELDS = ['notes', 'category', 'quantityText', 'specification', 'eventDayDate'] as const;

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ eventId: string; itemId: string }> }) {
  const { eventId, itemId: rawItemId } = await params;
  const context = await resolveAuthorizedContext(eventId);
  if (context instanceof NextResponse) return context;

  const { plannerEventId, capability } = context;

  if (!capability.canManage) {
    return NextResponse.json({ error: 'checklist_manage_denied' }, { status: 403 });
  }

  const itemId = parseItemId(rawItemId);
  if (!itemId) return NextResponse.json({ error: 'checklist_item_not_found' }, { status: 404 });

  let existing;
  try {
    existing = await getChecklistItem(plannerEventId, itemId);
  } catch (err) {
    console.error('planner-checklist/[itemId]: PATCH pre-read failed', err);
    return NextResponse.json({ error: 'planner_write_failed', message: 'Could not save — try again.' }, { status: 500 });
  }
  if (!existing) return NextResponse.json({ error: 'checklist_item_not_found' }, { status: 404 });

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

  if ('isSourced' in body && typeof body.isSourced !== 'boolean') {
    return NextResponse.json({ error: 'invalid_request', message: 'isSourced must be a boolean.' }, { status: 400 });
  }
  if ('isOnSite' in body && typeof body.isOnSite !== 'boolean') {
    return NextResponse.json({ error: 'invalid_request', message: 'isOnSite must be a boolean.' }, { status: 400 });
  }
  const badStringField = NULLABLE_STRING_FIELDS.find((key) => key in body && body[key] !== null && typeof body[key] !== 'string');
  if (badStringField) {
    return NextResponse.json({ error: 'invalid_request', message: `${badStringField} must be a string or null.` }, { status: 400 });
  }
  if ('itemName' in body && (typeof body.itemName !== 'string' || !body.itemName.trim())) {
    return NextResponse.json({ error: 'invalid_request', message: 'Item name is required.' }, { status: 400 });
  }
  if ('dayNumber' in body && body.dayNumber !== null && typeof body.dayNumber !== 'number') {
    return NextResponse.json({ error: 'invalid_request', message: 'dayNumber must be a number.' }, { status: 400 });
  }
  if ('ownerProfileId' in body && (typeof body.ownerProfileId !== 'string' || !body.ownerProfileId)) {
    return NextResponse.json({ error: 'invalid_request', message: 'An owner is required.' }, { status: 400 });
  }

  try {
    const item = await updateChecklistItem(plannerEventId, itemId, {
      isSourced: 'isSourced' in body ? (body.isSourced as boolean) : undefined,
      isOnSite: 'isOnSite' in body ? (body.isOnSite as boolean) : undefined,
      ...('notes' in body ? { notes: body.notes as string | null } : {}),
      ...('itemName' in body ? { itemName: body.itemName as string } : {}),
      ...('category' in body ? { category: body.category as string | null } : {}),
      ...('quantityText' in body ? { quantityText: body.quantityText as string | null } : {}),
      ...('specification' in body ? { specification: body.specification as string | null } : {}),
      ...('dayNumber' in body ? { dayNumber: body.dayNumber as number | null } : {}),
      ...('eventDayDate' in body ? { eventDayDate: body.eventDayDate as string | null } : {}),
      ...('ownerProfileId' in body ? { ownerProfileId: body.ownerProfileId as string } : {}),
    });
    return NextResponse.json({ ok: true, item });
  } catch (err) {
    const { category, message } = normalizePlannerChecklistError(err);
    const status = category === 'checklist_item_not_found' ? 404 : category === 'planner_write_failed' ? 500 : 400;
    return NextResponse.json({ error: category, message }, { status });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ eventId: string; itemId: string }> }) {
  const { eventId, itemId: rawItemId } = await params;
  const context = await resolveAuthorizedContext(eventId);
  if (context instanceof NextResponse) return context;

  const { plannerEventId, capability } = context;

  if (!capability.canManage) {
    return NextResponse.json({ error: 'checklist_manage_denied' }, { status: 403 });
  }

  const itemId = parseItemId(rawItemId);
  if (!itemId) return NextResponse.json({ error: 'checklist_item_not_found' }, { status: 404 });

  try {
    await deleteChecklistItem(plannerEventId, itemId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { category, message } = normalizePlannerChecklistError(err);
    const status = category === 'checklist_item_not_found' ? 404 : 500;
    return NextResponse.json({ error: category, message }, { status });
  }
}
