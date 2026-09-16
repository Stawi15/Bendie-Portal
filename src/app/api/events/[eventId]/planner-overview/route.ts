import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { requireEventWorkspaceAccess, isProductAvailableForEvent } from '@/lib/eventAuth';
import { getPlannerOverviewSummary, resolveProvisioningPhase } from '@/lib/plannerOverview';

/**
 * Feature 005 — read-only Planner Overview. See
 * specs/005-planner-event-workspace-foundation/contracts/get-planner-overview.md
 * for the full contract. Authorization sequence (every step independently
 * re-verified on every request, per FR-013 — never trusting a client-supplied
 * value or an earlier layer's check):
 *
 *   1. authenticate
 *   2. resolve the caller's selected organization (membership-derived fallback,
 *      matching OrganizationContext exactly — see the inline comment below)
 *   3. Portal event-workspace admission (requireEventWorkspaceAccess)
 *   4. Planner product availability (isProductAvailableForEvent)
 *   5. link-independent provisioning precedence (resolveProvisioningPhase) —
 *      returns a final status directly for every case except `succeeded`
 *   6. only when step 5 says `needs-link-check`: resolve the canonical active
 *      event_planner_links row (Portal service-role client) and read
 *      event_summary_realtime (Planner service-role client)
 *
 * No Planner or Portal service-role query is ever attempted before steps 1-4
 * succeed, and the Portal service-role client itself is never even constructed
 * unless step 5 actually requires it.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  if (!eventId) return NextResponse.json({ error: 'event_not_found' }, { status: 404 });

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
          // Read-only route — no session refresh needed here.
        },
      },
    }
  );

  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) return NextResponse.json({ error: 'not_authenticated' }, { status: 401 });

  const { data: profile } = await authClient
    .from('profiles')
    .select('global_role, current_organization_id')
    .eq('id', user.id)
    .maybeSingle();

  const isPlatformAdmin = profile?.global_role === 'admin';
  let selectedOrganizationId: string | null = null;

  // Mirrors OrganizationContext's own resolution exactly (review finding F1 — the
  // original version here only fell back when current_organization_id was null,
  // missing the case where it's set but STALE, i.e. no longer one of the caller's
  // memberships; OrganizationContext falls back in both cases:
  // `accessible.find(o => o.id === saved) ?? accessible[0]`). The fallback is
  // membership-derived only — never derived from which organization happens to own
  // the requested event, which would weaken selected-organization isolation.
  //
  // Re-review finding (determinism): `.order('organization_id', { ascending: true })`
  // added so `accessibleOrgIds[0]` below is provably the SAME organization
  // `getAccessibleOrganizations()` (`src/lib/portalAuth.ts`) resolves as `accessible[0]`
  // — without an explicit order, Postgres/PostgREST gives no guarantee that this
  // plain-select query and that structurally different embedded-join query return
  // `organization_members` rows in the same order, even against identical underlying
  // data. `organization_id` is a pure, meaningless-by-design tie-break (not join date,
  // not name, not entitlement) — this fixes determinism only, it does not redefine
  // which organization the fallback picks in any product sense.
  if (!isPlatformAdmin) {
    const { data: memberships, error: membershipsError } = await authClient
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .order('organization_id', { ascending: true });
    if (membershipsError) console.error('planner-overview: organization_members lookup failed', membershipsError);
    const accessibleOrgIds = (memberships ?? []).map((m) => m.organization_id);
    const savedOrganizationId = profile?.current_organization_id ?? null;
    selectedOrganizationId =
      savedOrganizationId && accessibleOrgIds.includes(savedOrganizationId) ? savedOrganizationId : (accessibleOrgIds[0] ?? null);
  }

  // A genuinely unresolvable organization context (the caller has no memberships at
  // all) — distinct from "saved selection was null/stale but a membership-derived
  // fallback exists," which is not this case and is not denied.
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
    // Should not happen — requireEventWorkspaceAccess just confirmed this row is
    // readable — but fail closed rather than assume.
    return NextResponse.json({ error: 'event_not_found' }, { status: 404 });
  }

  const productAvailable = await isProductAvailableForEvent(eventId, event.organization_id, 'planner', authClient);
  if (!productAvailable) {
    return NextResponse.json({ error: 'product_unavailable' }, { status: 403 });
  }

  // Evaluate the link-independent half of the precedence table FIRST (review
  // finding F5) — for pending/provisioning/stale/failed/the not_required anomaly,
  // the outcome never depends on link presence, so no service-role client is built
  // and no event_planner_links query is issued for those paths at all.
  const provisioningPhase = resolveProvisioningPhase(event);
  if (provisioningPhase !== 'needs-link-check') {
    return NextResponse.json({ ok: true, status: provisioningPhase });
  }

  // Only reached when planner_provisioning_status === 'succeeded': resolve the
  // canonical counterpart server-side only, via the Portal service-role client —
  // event_planner_links has admin-only RLS (live-verified), so an ordinary caller's
  // own authClient can never read it, even for their own event. The client never
  // supplies or chooses this value (FR-012).
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    console.error('planner-overview: missing SUPABASE_SERVICE_ROLE_KEY');
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

  // Review finding F3 — a genuine query failure on this lookup must map to
  // 'backend_error', never silently fall through to 'unavailable' (which would
  // misleadingly tell the customer the event "hasn't been fully set up" when it
  // may in fact be correctly linked and the read itself just failed).
  if (linkError) {
    console.error('planner-overview: event_planner_links lookup failed', linkError);
    return NextResponse.json({ ok: true, status: 'backend_error' });
  }

  if (!activeLink) {
    return NextResponse.json({ ok: true, status: 'unavailable' });
  }

  let summary;
  try {
    summary = await getPlannerOverviewSummary(activeLink.planner_event_id);
  } catch (err) {
    console.error('planner-overview: Planner read failed', err);
    return NextResponse.json({ ok: true, status: 'backend_error' });
  }

  if (!summary) {
    // Dangling/externally-deleted Planner event — distinct from a legitimate
    // zero-session row (data-model.md precedence step 4).
    return NextResponse.json({ ok: true, status: 'unavailable' });
  }

  return NextResponse.json({
    ok: true,
    status: 'ready',
    event: {
      title: summary.event_title,
      ...(summary.description ? { description: summary.description } : {}),
      ...(summary.location ? { location: summary.location } : {}),
      ...(summary.start_date ? { startDate: summary.start_date } : {}),
      ...(summary.end_date ? { endDate: summary.end_date } : {}),
      ...(summary.setup_date ? { setupDate: summary.setup_date } : {}),
    },
    sessionSummary: {
      totalSessions: summary.number_of_sessions,
      eventPhase: summary.status,
    },
  });
}
