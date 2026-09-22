import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { requireEventWorkspaceAccess, isProductAvailableForEvent, canAdministerPlannerPermissions } from '@/lib/eventAuth';
import { resolveProvisioningPhase } from '@/lib/plannerOverview';
import {
  resolveCallerPlannerIdentity,
  resolvePeopleCapability,
  getParticipant,
  updateParticipant,
  removeParticipantFromEvent,
  normalizePlannerPeopleError,
  type ResolvedPeopleCapability,
  type ParticipantPatch,
} from '@/lib/plannerPeople';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Feature 011 — single-participant route (manage-only field edit on PATCH;
 * manage-only remove-from-event on DELETE — never deletes the global
 * `passengers` record).
 *
 * Same steps 1-6 as `../route.ts` (copied inline, same rationale), plus a
 * shared step resolving the specific participant and verifying they're
 * actually linked to the resolved event BEFORE either handler runs — a
 * `passengerId` linked only to a different event returns `404
 * participant_not_found`, never leaking cross-event existence.
 */

type AuthorizedContext = { plannerEventId: number; capability: ResolvedPeopleCapability };

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
    if (membershipsError) console.error('planner-people/[passengerId]: organization_members lookup failed', membershipsError);
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
    console.error('planner-people/[passengerId]: missing SUPABASE_SERVICE_ROLE_KEY');
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
    console.error('planner-people/[passengerId]: event_planner_links lookup failed', linkError);
    return NextResponse.json({ ok: true, status: 'backend_error' });
  }
  if (!activeLink) {
    return NextResponse.json({ ok: true, status: 'unavailable' });
  }

  const plannerEventId = activeLink.planner_event_id as number;

  const canAdminister = await canAdministerPlannerPermissions(eventId, user.id, authClient);
  const plannerProfileId = await resolveCallerPlannerIdentity(authClient, user.id);

  let capability: ResolvedPeopleCapability;
  if (canAdminister) {
    capability = { hasPlannerIdentity: true, canView: true, canManage: true };
  } else if (!plannerProfileId) {
    return NextResponse.json({ error: 'planner_identity_unavailable' }, { status: 403 });
  } else {
    try {
      capability = await resolvePeopleCapability(plannerEventId, plannerProfileId);
    } catch (err) {
      console.error('planner-people/[passengerId]: capability resolution failed', err);
      return NextResponse.json({ ok: true, status: 'backend_error' });
    }
  }

  if (!capability.canView) {
    return NextResponse.json({ error: 'people_access_denied' }, { status: 403 });
  }

  return { plannerEventId, capability };
}

function parsePassengerId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

const PATCH_ALLOWED_FIELDS = new Set(['fullName', 'title', 'passport', 'dietaryRequirements', 'gender', 'email', 'phone']);

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ eventId: string; passengerId: string }> }) {
  const { eventId, passengerId: rawPassengerId } = await params;
  const context = await resolveAuthorizedContext(eventId);
  if (context instanceof NextResponse) return context;

  const { plannerEventId, capability } = context;

  if (!capability.canManage) {
    return NextResponse.json({ error: 'people_manage_denied' }, { status: 403 });
  }

  const passengerId = parsePassengerId(rawPassengerId);
  if (!passengerId) return NextResponse.json({ error: 'participant_not_found' }, { status: 404 });

  let existing;
  try {
    existing = await getParticipant(plannerEventId, passengerId);
  } catch (err) {
    console.error('planner-people/[passengerId]: PATCH pre-read failed', err);
    return NextResponse.json({ error: 'planner_write_failed', message: 'Could not save — try again.' }, { status: 500 });
  }
  if (!existing) return NextResponse.json({ error: 'participant_not_found' }, { status: 404 });

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

  for (const field of PATCH_ALLOWED_FIELDS) {
    if (field in body && body[field] !== null && typeof body[field] !== 'string') {
      return NextResponse.json({ error: 'invalid_request', message: `${field} must be a string or null.` }, { status: 400 });
    }
  }

  try {
    const patch: ParticipantPatch = {};
    if ('fullName' in body) patch.fullName = body.fullName as string;
    if ('title' in body) patch.title = body.title as string | null;
    if ('passport' in body) patch.passport = body.passport as string | null;
    if ('dietaryRequirements' in body) patch.dietaryRequirements = body.dietaryRequirements as string | null;
    if ('gender' in body) patch.gender = body.gender as string | null;
    if ('email' in body) patch.email = body.email as string | null;
    if ('phone' in body) patch.phone = body.phone as string | null;
    const participant = await updateParticipant(plannerEventId, passengerId, patch);
    return NextResponse.json({ ok: true, participant });
  } catch (err) {
    const { category, message } = normalizePlannerPeopleError(err);
    const status = category === 'participant_not_found' ? 404 : category === 'planner_write_failed' ? 500 : 400;
    return NextResponse.json({ error: category, message }, { status });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ eventId: string; passengerId: string }> }) {
  const { eventId, passengerId: rawPassengerId } = await params;
  const context = await resolveAuthorizedContext(eventId);
  if (context instanceof NextResponse) return context;

  const { plannerEventId, capability } = context;

  if (!capability.canManage) {
    return NextResponse.json({ error: 'people_manage_denied' }, { status: 403 });
  }

  const passengerId = parsePassengerId(rawPassengerId);
  if (!passengerId) return NextResponse.json({ error: 'participant_not_found' }, { status: 404 });

  try {
    await removeParticipantFromEvent(plannerEventId, passengerId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const { category, message } = normalizePlannerPeopleError(err);
    const status = category === 'participant_not_found' ? 404 : 500;
    return NextResponse.json({ error: category, message }, { status });
  }
}
