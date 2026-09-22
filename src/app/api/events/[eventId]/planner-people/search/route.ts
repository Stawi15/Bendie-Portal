import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { requireEventWorkspaceAccess, isProductAvailableForEvent, canAdministerPlannerPermissions } from '@/lib/eventAuth';
import { resolveProvisioningPhase } from '@/lib/plannerOverview';
import { resolveCallerPlannerIdentity, resolvePeopleCapability, searchUnlinkedPassengers, type ResolvedPeopleCapability } from '@/lib/plannerPeople';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Feature 011 — manage-only global passenger search, powering the "add
 * existing" flow. Same steps 1-6 as `../route.ts` (copied inline, same
 * rationale). Deliberately not org-scoped (spec.md Verified Business Rule 8).
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
    if (membershipsError) console.error('planner-people/search: organization_members lookup failed', membershipsError);
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
    console.error('planner-people/search: missing SUPABASE_SERVICE_ROLE_KEY');
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
    console.error('planner-people/search: event_planner_links lookup failed', linkError);
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
      console.error('planner-people/search: capability resolution failed', err);
      return NextResponse.json({ ok: true, status: 'backend_error' });
    }
  }

  return { plannerEventId, capability };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const context = await resolveAuthorizedContext(eventId);
  if (context instanceof NextResponse) return context;

  const { plannerEventId, capability } = context;

  if (!capability.canManage) {
    return NextResponse.json({ error: 'people_manage_denied' }, { status: 403 });
  }

  const query = request.nextUrl.searchParams.get('q') ?? '';

  try {
    const results = await searchUnlinkedPassengers(plannerEventId, query);
    return NextResponse.json({ ok: true, results });
  } catch (err) {
    console.error('planner-people/search: GET failed', err);
    return NextResponse.json({ error: 'planner_write_failed', message: 'Search failed — try again.' }, { status: 500 });
  }
}
