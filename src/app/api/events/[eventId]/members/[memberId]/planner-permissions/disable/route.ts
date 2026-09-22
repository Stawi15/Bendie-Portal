import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { requireEventWorkspaceAccess, isProductAvailableForEvent, canAdministerPlannerPermissions } from '@/lib/eventAuth';
import { resolveProvisioningPhase } from '@/lib/plannerOverview';
import { disableAssignment, snapshotFromAssignment, recordAuditEntry, PlannerPermissionValidationError } from '@/lib/plannerPermissions';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Feature 008 — `disable` Bendie Planner access for a target event member.
 * Same authorization steps 1–7 as `../route.ts` (copied inline).
 *
 * Per spec.md FR-036a (added during `/speckit.analyze`): if
 * `planner_permissions_configured_at` is still unset at the moment access is
 * disabled (enabled then disabled without an intervening explicit Save),
 * this route ALSO sets it here — exactly mirroring what the `PATCH` route
 * already does for a Save. Without this, a person disabled before ever being
 * explicitly configured would not be protected by `plannerStaffSync.ts`'s
 * guard clause, since that guard's only signal is this same marker, and the
 * very next automatic-sync trigger (a confirmed-real CSV re-import path)
 * would silently reactivate them — the exact failure FR-045 forbids.
 */

type AuthorizedContext = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  portalAdmin: any;
  callerId: string;
  eventId: string;
  memberId: string;
  plannerEventId: number;
  member: { plannerPermissionsConfiguredAt: string | null; plannerProfileId: string | null };
};

async function resolveAuthorizedContext(eventId: string, memberId: string): Promise<NextResponse | AuthorizedContext> {
  if (!eventId || !memberId) return NextResponse.json({ error: 'event_not_found' }, { status: 404 });

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
    if (membershipsError) console.error('planner-permissions/disable: organization_members lookup failed', membershipsError);
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
    console.error('planner-permissions/disable: missing SUPABASE_SERVICE_ROLE_KEY');
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
    console.error('planner-permissions/disable: event_planner_links lookup failed', linkError);
    return NextResponse.json({ ok: true, status: 'backend_error' });
  }
  if (!activeLink) {
    return NextResponse.json({ ok: true, status: 'unavailable' });
  }

  const canAdminister = await canAdministerPlannerPermissions(eventId, user.id, authClient);
  if (!canAdminister) {
    return NextResponse.json({ error: 'permission_admin_denied' }, { status: 403 });
  }

  const { data: targetMember, error: targetMemberError } = await portalAdmin
    .from('event_members')
    .select('planner_permissions_configured_at,profiles!event_members_user_id_fkey(planner_profile_id)')
    .eq('event_id', eventId)
    .eq('user_id', memberId)
    .maybeSingle();
  if (targetMemberError) {
    console.error('planner-permissions/disable: target member lookup failed', targetMemberError);
    return NextResponse.json({ ok: true, status: 'backend_error' });
  }
  if (!targetMember) {
    return NextResponse.json({ error: 'member_not_found' }, { status: 404 });
  }

  const targetProfile = Array.isArray(targetMember.profiles) ? targetMember.profiles[0] : targetMember.profiles;

  return {
    portalAdmin,
    callerId: user.id,
    eventId,
    memberId,
    plannerEventId: activeLink.planner_event_id as number,
    member: {
      plannerPermissionsConfiguredAt: targetMember.planner_permissions_configured_at,
      plannerProfileId: targetProfile?.planner_profile_id ?? null,
    },
  };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string; memberId: string }> }) {
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

  if (!context.member.plannerProfileId) {
    return NextResponse.json({ error: 'not_enabled' }, { status: 409 });
  }

  try {
    const { before, after, state, wasNoop } = await disableAssignment(context.plannerEventId, context.member.plannerProfileId);

    // spec.md FR-036a — see file-level doc comment. Kept unconditional (even on
    // a no-op) since it's idempotent (`WHERE ... IS NULL`) and harmless — it
    // only ever transitions a genuinely-unset marker, noop or not.
    if (!context.member.plannerPermissionsConfiguredAt) {
      const { error: markError } = await context.portalAdmin
        .from('event_members')
        .update({ planner_permissions_configured_at: new Date().toISOString() })
        .eq('event_id', eventId)
        .eq('user_id', memberId)
        .is('planner_permissions_configured_at', null);
      if (markError) console.error('planner-permissions/disable: FR-036a configured-at update failed (Planner write already stands)', markError);
    }

    // Corrective fix (2026-09-21, /review finding, LOW): skip the audit write
    // for a no-op (already disabled) — mirrors enable/route.ts's existing
    // `if (branch !== 'noop')` guard for the identical class of case. Nothing
    // changed, so there is nothing "meaningful" to record (spec.md Locked
    // Decision 4), and repeated no-op disable clicks no longer create
    // duplicate-ish audit rows (each with its own fresh operationId, so the
    // idempotency constraint alone would not have caught this).
    if (!wasNoop) {
      await recordAuditEntry(context.portalAdmin, {
        eventId,
        memberUserId: memberId,
        actorUserId: context.callerId,
        actionType: 'access_disabled',
        beforeState: snapshotFromAssignment(before),
        afterState: snapshotFromAssignment(after),
        operationId: body.operationId as string,
      });
    }

    return NextResponse.json({ ok: true, state });
  } catch (err) {
    if (err instanceof PlannerPermissionValidationError) {
      return NextResponse.json({ error: err.code, message: err.message }, { status: 409 });
    }
    console.error('planner-permissions/disable: POST failed', err);
    return NextResponse.json({ error: 'planner_write_failed', message: 'Could not save — try again.' }, { status: 500 });
  }
}
