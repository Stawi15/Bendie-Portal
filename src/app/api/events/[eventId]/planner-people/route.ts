import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { requireEventWorkspaceAccess, isProductAvailableForEvent, canAdministerPlannerPermissions } from '@/lib/eventAuth';
import { resolveProvisioningPhase } from '@/lib/plannerOverview';
import {
  resolveCallerPlannerIdentity,
  resolvePeopleCapability,
  listParticipants,
  createNewParticipant,
  normalizePlannerPeopleError,
  type ResolvedPeopleCapability,
} from '@/lib/plannerPeople';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Feature 011 — Bendie Planner People/Participants: collection route (list +
 * capability on GET; manage-only create-new-person-and-link on POST).
 *
 * Authorization sequence (every step independently re-verified on every
 * request, matching every prior module's established shape) — diverges from
 * Vendors/Checklist/Tasks at step 6 (plan.md, locked product decision — no
 * `can_view_people`/`can_manage_people` flag exists, none was invented):
 *
 *   1. authenticate
 *   2. resolve the caller's selected organization
 *   3. Portal event-workspace admission (requireEventWorkspaceAccess)
 *   4. Planner product availability (isProductAvailableForEvent)
 *   5. provisioning/link precedence (resolveProvisioningPhase + event_planner_links)
 *   6. Portal-side admin authority (canAdministerPlannerPermissions) — if
 *      true, full access regardless of Planner identity. Otherwise Planner
 *      identity is required; capability falls back to
 *      resolvePeopleCapability (platform-admin bypass, else "does an active
 *      assignment exist at all").
 *
 * Deliberately NOT refactored into a shared helper with the other
 * planner-people routes (established Feature 007–010 precedent).
 */

type AuthorizedContext = { authClient: SupabaseClient; plannerEventId: number; capability: ResolvedPeopleCapability };

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
    if (membershipsError) console.error('planner-people: organization_members lookup failed', membershipsError);
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
    console.error('planner-people: missing SUPABASE_SERVICE_ROLE_KEY');
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
    console.error('planner-people: event_planner_links lookup failed', linkError);
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
      console.error('planner-people: capability resolution failed', err);
      return NextResponse.json({ ok: true, status: 'backend_error' });
    }
  }

  if (!capability.canView) {
    return NextResponse.json({ error: 'people_access_denied' }, { status: 403 });
  }

  return { authClient, plannerEventId, capability };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const context = await resolveAuthorizedContext(eventId);
  if (context instanceof NextResponse) return context;

  const { plannerEventId, capability } = context;

  try {
    const participants = await listParticipants(plannerEventId);
    return NextResponse.json({ ok: true, capability, participants });
  } catch (err) {
    console.error('planner-people: GET failed', err);
    return NextResponse.json({ ok: true, status: 'backend_error' });
  }
}

const ALLOWED_FIELDS = new Set(['fullName', 'title', 'passport', 'dietaryRequirements', 'gender', 'email', 'phone']);

export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const context = await resolveAuthorizedContext(eventId);
  if (context instanceof NextResponse) return context;

  const { plannerEventId, capability } = context;

  if (!capability.canManage) {
    return NextResponse.json({ error: 'people_manage_denied' }, { status: 403 });
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

  if (typeof body.fullName !== 'string' || !body.fullName.trim()) {
    return NextResponse.json({ error: 'invalid_request', message: 'Full name is required.' }, { status: 400 });
  }

  const optionalStringFields = ['title', 'passport', 'dietaryRequirements', 'gender', 'email', 'phone'] as const;
  for (const field of optionalStringFields) {
    if (field in body && body[field] !== null && typeof body[field] !== 'string') {
      return NextResponse.json({ error: 'invalid_request', message: `${field} must be a string or null.` }, { status: 400 });
    }
  }

  try {
    const participant = await createNewParticipant(plannerEventId, {
      fullName: body.fullName,
      title: (body.title as string | null | undefined) ?? null,
      passport: (body.passport as string | null | undefined) ?? null,
      dietaryRequirements: (body.dietaryRequirements as string | null | undefined) ?? null,
      gender: (body.gender as string | null | undefined) ?? null,
      email: (body.email as string | null | undefined) ?? null,
      phone: (body.phone as string | null | undefined) ?? null,
    });
    return NextResponse.json({ ok: true, participant }, { status: 201 });
  } catch (err) {
    const { category, message } = normalizePlannerPeopleError(err);
    const status = category === 'planner_write_failed' ? 500 : 400;
    return NextResponse.json({ error: category, message }, { status });
  }
}
