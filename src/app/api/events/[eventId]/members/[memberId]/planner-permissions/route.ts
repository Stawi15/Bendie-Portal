import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { requireEventWorkspaceAccess, isProductAvailableForEvent, canAdministerPlannerPermissions } from '@/lib/eventAuth';
import { resolveProvisioningPhase } from '@/lib/plannerOverview';
import {
  readPermissionState,
  savePermissions,
  snapshotFromAssignment,
  recordAuditEntry,
  PlannerPermissionValidationError,
  type ModulePatch,
} from '@/lib/plannerPermissions';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Feature 008 — Bendie Planner permission administration: collection route
 * (`GET` read, `PATCH` save) for one target event member.
 *
 * Authorization sequence (every step independently re-verified on every
 * request, matching `planner-tasks/route.ts`'s established shape, extended
 * with step 6 for Feature 008's own narrower administration-authority check
 * and step 7 for target-member resolution):
 *
 *   1. authenticate
 *   2. resolve the caller's selected organization (membership-derived fallback)
 *   3. Portal event-workspace admission (requireEventWorkspaceAccess) — the
 *      caller MUST also be an event_members participant of THIS event, a
 *      deliberate floor beneath step 6 (contracts.md), not relaxed here
 *   4. Planner product availability (isProductAvailableForEvent)
 *   5. provisioning/link precedence (resolveProvisioningPhase + event_planner_links)
 *   6. permission-administration authority (canAdministerPlannerPermissions) —
 *      platform admin or organization owner/admin of the event's own
 *      organization; never the caller's own event_members.role or any
 *      can_manage_* flag (spec.md FR-005–FR-007)
 *   7. target member resolution — via the Portal service-role client, not the
 *      caller's own authClient, because an organization owner/admin who is
 *      not also an event host/organizer for THIS event may be RLS-blind to
 *      another member's event_members row (the same class of blind spot
 *      already found and fixed for event_planner_links in Feature 001/004 —
 *      see plannerStaffSync.ts's own comment on this exact issue)
 *
 * Deliberately NOT refactored into a shared helper with the other
 * planner-permissions routes (matching `planner-tasks/route.ts`'s own
 * precedent) — copied inline so no future edit to one route can silently
 * alter another's authorization behavior.
 */

type AuthorizedContext = {
  authClient: SupabaseClient;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  portalAdmin: any;
  callerId: string;
  eventId: string;
  memberId: string;
  plannerEventId: number;
  member: {
    role: string;
    plannerPermissionsConfiguredAt: string | null;
    email: string | null;
    fullName: string | null;
    plannerProfileId: string | null;
  };
};

async function resolveAuthorizedContext(eventId: string, memberId: string): Promise<NextResponse | AuthorizedContext> {
  if (!eventId || !memberId) return NextResponse.json({ error: 'event_not_found' }, { status: 404 });

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
    if (membershipsError) console.error('planner-permissions: organization_members lookup failed', membershipsError);
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
    console.error('planner-permissions: missing SUPABASE_SERVICE_ROLE_KEY');
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
    console.error('planner-permissions: event_planner_links lookup failed', linkError);
    return NextResponse.json({ ok: true, status: 'backend_error' });
  }
  if (!activeLink) {
    return NextResponse.json({ ok: true, status: 'unavailable' });
  }

  const canAdminister = await canAdministerPlannerPermissions(eventId, user.id, authClient);
  if (!canAdminister) {
    return NextResponse.json({ error: 'permission_admin_denied' }, { status: 403 });
  }

  // Target-member resolution via the service-role client (see doc comment above).
  const { data: targetMember, error: targetMemberError } = await portalAdmin
    .from('event_members')
    .select('role,planner_permissions_configured_at,profiles!event_members_user_id_fkey(email,full_name,planner_profile_id)')
    .eq('event_id', eventId)
    .eq('user_id', memberId)
    .maybeSingle();
  if (targetMemberError) {
    console.error('planner-permissions: target member lookup failed', targetMemberError);
    return NextResponse.json({ ok: true, status: 'backend_error' });
  }
  if (!targetMember) {
    return NextResponse.json({ error: 'member_not_found' }, { status: 404 });
  }

  const targetProfile = Array.isArray(targetMember.profiles) ? targetMember.profiles[0] : targetMember.profiles;

  return {
    authClient,
    portalAdmin,
    callerId: user.id,
    eventId,
    memberId,
    plannerEventId: activeLink.planner_event_id as number,
    member: {
      role: targetMember.role,
      plannerPermissionsConfiguredAt: targetMember.planner_permissions_configured_at,
      email: targetProfile?.email ?? null,
      fullName: targetProfile?.full_name ?? null,
      plannerProfileId: targetProfile?.planner_profile_id ?? null,
    },
  };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ eventId: string; memberId: string }> }) {
  const { eventId, memberId } = await params;
  const context = await resolveAuthorizedContext(eventId, memberId);
  if (context instanceof NextResponse) return context;

  try {
    const state = await readPermissionState(context.plannerEventId, context.member.plannerProfileId, context.member.role, !!context.member.plannerPermissionsConfiguredAt);
    return NextResponse.json({ ok: true, state });
  } catch (err) {
    console.error('planner-permissions: GET failed', err);
    return NextResponse.json({ ok: true, status: 'backend_error' });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ eventId: string; memberId: string }> }) {
  const { eventId, memberId } = await params;
  const context = await resolveAuthorizedContext(eventId, memberId);
  if (context instanceof NextResponse) return context;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid_request', message: 'Malformed request body.' }, { status: 400 });
  }

  if (typeof body.operationId !== 'string' || !body.operationId) {
    return NextResponse.json({ error: 'invalid_request', message: 'operationId is required.' }, { status: 400 });
  }
  if (typeof body.modules !== 'object' || body.modules === null) {
    return NextResponse.json({ error: 'invalid_request', message: 'modules is required.' }, { status: 400 });
  }

  if (!context.member.plannerProfileId) {
    return NextResponse.json({ error: 'not_enabled' }, { status: 409 });
  }

  try {
    const { before, after, state, wasNoop } = await savePermissions(
      context.plannerEventId,
      context.member.plannerProfileId,
      body.modules as ModulePatch,
      !!context.member.plannerPermissionsConfiguredAt
    );

    if (!context.member.plannerPermissionsConfiguredAt) {
      const { error: markError } = await context.portalAdmin
        .from('event_members')
        .update({ planner_permissions_configured_at: new Date().toISOString() })
        .eq('event_id', eventId)
        .eq('user_id', memberId)
        .is('planner_permissions_configured_at', null);
      if (markError) console.error('planner-permissions: PATCH configured-at update failed (Planner write already stands)', markError);
    }

    // Corrective fix (2026-09-21, /review finding, LOW): skip the audit write
    // for a true no-op — mirrors `disable/route.ts`'s existing `wasNoop` guard
    // for the identical class of case. `wasNoop` is only ever true when the
    // marker was already set (see savePermissions' doc comment), so this can
    // never suppress the audit row for a first-ever ownership-establishing Save.
    if (!wasNoop) {
      await recordAuditEntry(context.portalAdmin, {
        eventId,
        memberUserId: memberId,
        actorUserId: context.callerId,
        actionType: 'permissions_changed',
        beforeState: snapshotFromAssignment(before),
        afterState: snapshotFromAssignment(after),
        operationId: body.operationId as string,
      });
    }

    return NextResponse.json({ ok: true, state });
  } catch (err) {
    if (err instanceof PlannerPermissionValidationError) {
      const status = err.code === 'not_enabled' ? 409 : 400;
      return NextResponse.json({ error: err.code, message: err.message }, { status });
    }
    console.error('planner-permissions: PATCH failed', err);
    return NextResponse.json({ error: 'planner_write_failed', message: 'Could not save — try again.' }, { status: 500 });
  }
}

