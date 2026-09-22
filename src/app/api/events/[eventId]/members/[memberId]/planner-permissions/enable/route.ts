import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { requireEventWorkspaceAccess, isProductAvailableForEvent, canAdministerPlannerPermissions } from '@/lib/eventAuth';
import { resolveProvisioningPhase } from '@/lib/plannerOverview';
import { findOrCreatePlannerProfile } from '@/lib/plannerStaffSync';
import { getPlannerAdminClient } from '@/lib/plannerAdmin';
import { enableAssignment, snapshotFromAssignment, recordAuditEntry } from '@/lib/plannerPermissions';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Feature 008 — `enable` Bendie Planner access for a target event member.
 * Same authorization steps 1–7 as `../route.ts` (copied inline, see that
 * file's doc comment for the full rationale).
 *
 * Internally branches into first-enable / reactivate / no-op purely from
 * server-read state (`enableAssignment`, research.md R9) — the client never
 * chooses which applies. Identity resolution (`findOrCreatePlannerProfile`,
 * Feature 001, unmodified) happens here, at the route layer, only on the
 * first-enable path where no `planner_profile_id` exists yet — never as a
 * side effect of `GET` (FR-004/FR-030).
 */

type AuthorizedContext = {
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
    if (membershipsError) console.error('planner-permissions/enable: organization_members lookup failed', membershipsError);
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
    console.error('planner-permissions/enable: missing SUPABASE_SERVICE_ROLE_KEY');
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
    console.error('planner-permissions/enable: event_planner_links lookup failed', linkError);
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
    .select('role,planner_permissions_configured_at,profiles!event_members_user_id_fkey(email,full_name,planner_profile_id)')
    .eq('event_id', eventId)
    .eq('user_id', memberId)
    .maybeSingle();
  if (targetMemberError) {
    console.error('planner-permissions/enable: target member lookup failed', targetMemberError);
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
      role: targetMember.role,
      plannerPermissionsConfiguredAt: targetMember.planner_permissions_configured_at,
      email: targetProfile?.email ?? null,
      fullName: targetProfile?.full_name ?? null,
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

  if (!context.member.email) {
    return NextResponse.json(
      { error: 'planner_write_failed', message: "Couldn't set up Bendie Planner access — this member has no email on file." },
      { status: 500 }
    );
  }

  try {
    let plannerProfileId = context.member.plannerProfileId;

    if (!plannerProfileId) {
      const planner = getPlannerAdminClient();
      const resolved = await findOrCreatePlannerProfile(planner, context.member.email, context.member.fullName);
      if ('error' in resolved) {
        return NextResponse.json({ error: 'planner_write_failed', message: "Couldn't set up Bendie Planner access — try again." }, { status: 500 });
      }
      plannerProfileId = resolved.id;
      const { error: profileUpdateError } = await context.portalAdmin.from('profiles').update({ planner_profile_id: plannerProfileId }).eq('id', memberId);
      if (profileUpdateError) console.error('planner-permissions/enable: profiles.planner_profile_id update failed', profileUpdateError);
    }

    const { before, after, state, branch } = await enableAssignment(
      context.plannerEventId,
      plannerProfileId,
      context.member.role,
      !!context.member.plannerPermissionsConfiguredAt
    );

    if (branch !== 'noop') {
      await recordAuditEntry(context.portalAdmin, {
        eventId,
        memberUserId: memberId,
        actorUserId: context.callerId,
        actionType: branch === 'first_enable' ? 'access_enabled' : 'access_reactivated',
        beforeState: before ? snapshotFromAssignment(before) : null,
        afterState: snapshotFromAssignment(after),
        operationId: body.operationId as string,
      });
    }

    return NextResponse.json({ ok: true, state });
  } catch (err) {
    console.error('planner-permissions/enable: POST failed', err);
    return NextResponse.json({ error: 'planner_write_failed', message: "Couldn't set up Bendie Planner access — try again." }, { status: 500 });
  }
}
