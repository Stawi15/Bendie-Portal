import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { provisionPlannerEvent } from '@/lib/plannerEventProvisioning';

/**
 * Retry Planner provisioning for an existing Portal event (Feature 004,
 * contracts/retry-planner-provisioning.md). Never creates a second Portal
 * event — always re-enters provisionPlannerEvent's Phase 2-4 sequence for
 * the eventId in the URL. Authorization is identical to creation (platform
 * admin, or owner/admin of the event's organization) — not restricted to
 * the original creator, since any authorized manager should be able to
 * unblock a stuck event.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  if (!eventId) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll().map(({ name, value }) => ({ name, value }));
        },
        setAll() {},
      },
    }
  );

  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });

  const { data: event } = await authClient
    .from('events')
    .select('id,organization_id,planner_provisioning_status')
    .eq('id', eventId)
    .maybeSingle();

  if (!event || event.planner_provisioning_status === 'not_required') {
    return NextResponse.json({ error: 'event_not_found' }, { status: 404 });
  }

  const { data: callerProfile } = await authClient.from('profiles').select('global_role').eq('id', user.id).single();
  const isPlatformAdmin = callerProfile?.global_role === 'admin';

  if (!isPlatformAdmin) {
    const { data: membership } = await authClient
      .from('organization_members')
      .select('role')
      .eq('organization_id', event.organization_id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    return NextResponse.json({ error: 'server_error', message: 'Server is missing SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 });
  }
  const portalAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const outcome = await provisionPlannerEvent({ authClient, portalAdmin, eventId, organizationId: event.organization_id });

  if (outcome.status === 'provisioning_in_progress') {
    return NextResponse.json({ error: 'provisioning_in_progress' }, { status: 409 });
  }

  if (outcome.status === 'failed' && outcome.code === 'entitlement_inactive') {
    return NextResponse.json({ error: 'entitlement_inactive', message: outcome.reason }, { status: 422 });
  }

  if (outcome.status === 'failed' && outcome.code === 'planner_mapping_missing') {
    return NextResponse.json({ error: 'planner_mapping_missing', message: outcome.reason }, { status: 409 });
  }

  // mapping_drift and ordinary provisioning_error both come back as a
  // successful retry-attempt response whose provisioning outcome is
  // 'failed' — the retry request itself was correctly authorized and
  // executed; only the underlying Planner-side operation did not succeed
  // (contracts/retry-planner-provisioning.md).
  return NextResponse.json({ ok: true, eventId, plannerProvisioningStatus: outcome.status });
}
