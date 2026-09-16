import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { provisionPlannerEvent } from '@/lib/plannerEventProvisioning';

/**
 * Product-aware event creation (Feature 004). Replaces the previous direct
 * browser-client INSERT into `events` (CreateEventModal.tsx) — this route
 * is the sole server boundary for creation, per contracts/create-event.md.
 * UI-side filtering (canCreateEvent, isOrgAdmin) remains advisory only.
 *
 * Authorization/entitlement/mapping validation is deliberately single-source:
 * `create_event_with_products` (SECURITY DEFINER) alone. This route used to
 * ALSO run its own "fast, common-case" Planner-mapping preflight directly
 * against `organization_planner_links` using the caller's own RLS-governed
 * session — but that table's only RLS policy is `portal_is_global_admin()`,
 * so the preflight silently saw "no row" (not an error) for every legitimate
 * org owner/admin caller who is not also a platform admin, incorrectly
 * rejecting them with `planner_mapping_missing` even when a valid mapping
 * existed, before the RPC was ever reached (review finding, 2026-09-16).
 * Removed rather than patched into a second privileged check: the RPC's own
 * mapping check (its Phase 2 step, before any INSERT) already satisfies
 * FR-019/contracts/create-event.md's "no write of any kind occurs" guarantee
 * on its own, and this route's own RPC-error mapping below already returns
 * the exact same `409 planner_mapping_missing` body when the RPC raises it —
 * so the client-visible contract is unchanged; only the redundant,
 * RLS-blind, non-authoritative duplicate check is gone. Do not reintroduce a
 * second authorization/mapping check here without first solving how it
 * avoids the same RLS-visibility trap.
 */
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const idempotencyKey = typeof body?.idempotencyKey === 'string' ? body.idempotencyKey : '';
  const organizationId = typeof body?.organizationId === 'string' ? body.organizationId : '';
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const location = typeof body?.location === 'string' ? body.location.trim() || null : null;
  const startsAt = typeof body?.startsAt === 'string' && body.startsAt ? body.startsAt : null;
  const endsAt = typeof body?.endsAt === 'string' && body.endsAt ? body.endsAt : null;
  const products = Array.isArray(body?.products) ? body.products.filter((p: unknown) => typeof p === 'string') : [];

  if (!idempotencyKey || !organizationId || !name || products.length === 0) {
    return NextResponse.json({ error: 'invalid_request', message: 'idempotencyKey, organizationId, name, and at least one product are required' }, { status: 400 });
  }

  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll().map(({ name, value }) => ({ name, value }));
        },
        setAll() {
          // Read/write via RLS as the caller — no session refresh needed here.
        },
      },
    }
  );

  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });

  const { data: rpcResult, error: rpcError } = await authClient.rpc('create_event_with_products', {
    p_idempotency_key: idempotencyKey,
    p_organization_id: organizationId,
    p_name: name,
    p_location: location,
    p_starts_at: startsAt,
    p_ends_at: endsAt,
    p_products: products,
  });

  if (rpcError) {
    const message = rpcError.message ?? '';
    if (message.includes('idempotency_conflict')) {
      return NextResponse.json({ error: 'idempotency_conflict', message: 'This idempotency key was already used for a different request.' }, { status: 409 });
    }
    if (message.includes('forbidden')) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    if (message.includes('entitlement_inactive')) {
      return NextResponse.json({ error: 'entitlement_inactive', message: 'Your organisation is not currently entitled to one of the requested products.' }, { status: 422 });
    }
    if (message.includes('planner_mapping_missing')) {
      return NextResponse.json(
        {
          error: 'planner_mapping_missing',
          message:
            "Bendie Planner hasn't been set up for this organization yet. Please contact your administrator to complete the Planner setup before creating this event.",
        },
        { status: 409 }
      );
    }
    if (message.includes('invalid_request')) {
      return NextResponse.json({ error: 'invalid_request', message }, { status: 400 });
    }
    console.error('create_event_with_products failed', rpcError);
    return NextResponse.json({ error: 'invalid_request', message: 'Could not create the event — try again.' }, { status: 400 });
  }

  const created = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult;
  const eventId: string = created.event_id;
  let plannerProvisioningStatus: string = created.planner_provisioning_status;

  if (plannerProvisioningStatus === 'pending') {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return NextResponse.json({ error: 'server_error', message: 'Server is missing SUPABASE_SERVICE_ROLE_KEY' }, { status: 500 });
    }
    const portalAdmin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const outcome = await provisionPlannerEvent({ authClient, portalAdmin, eventId, organizationId });
    plannerProvisioningStatus = outcome.status === 'succeeded' ? 'succeeded' : 'failed';
  }

  // Partial-outcome shape (FR-021, contracts/create-event.md): a Planner
  // provisioning failure after a successful Portal creation is still a
  // 200 ok:true response — creation itself did not fail. The client must
  // render this as "created, Planner setup incomplete, retry available,"
  // never as a creation error.
  return NextResponse.json({ ok: true, eventId, plannerProvisioningStatus });
}
