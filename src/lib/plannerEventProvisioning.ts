import { getPlannerAdminClient } from '@/lib/plannerAdmin';
import { plannerEventCode } from '@/lib/plannerEventCode';
import { syncStaffMemberToPlanner } from '@/lib/plannerStaffSync';

export type ProvisioningFailureCode = 'entitlement_inactive' | 'planner_mapping_missing' | 'mapping_drift' | 'provisioning_error';

export type ProvisioningOutcome =
  | { ok: true; status: 'succeeded' }
  | { ok: true; status: 'failed'; reason: string; code: ProvisioningFailureCode }
  | { ok: true; status: 'provisioning_in_progress' };

/**
 * Shared Planner-provisioning orchestration (Feature 004, research.md §5
 * Phases 2-4), called identically from the create-event route (right after
 * a successful atomic Portal creation, when the RPC returns
 * planner_provisioning_status = 'pending') and the retry endpoint (for an
 * event whose provisioning previously failed). Implements:
 *
 *   - the compare-and-swap concurrency claim (research.md §9)
 *   - the re-verification of entitlement/mapping immediately before any
 *     Planner-side write (research.md §5 Phase 2 step 2)
 *   - the deterministic event_code lookup-before-insert idempotency
 *     (research.md §8/§10), including the mapping-drift failure path added
 *     during /speckit.analyze (research.md §5 Phase 2 step 4, §14
 *     scenario 15)
 *   - the counterpart-link upsert (research.md §5 Phase 3)
 *   - finalization to 'succeeded' only after every prerequisite holds
 *     (research.md §5 Phase 4)
 *   - the creator's staff-sync, reusing the existing Feature 001 capability
 *     (research.md §11)
 *
 * `authClient` is the caller's own authenticated session (used for ordinary
 * RLS-governed reads); `portalAdmin` is Portal's service-role client (used
 * only for the two writes that need to bypass RLS: the provisioning-state
 * columns' privilege-restricted UPDATEs, and event_planner_links' admin-only
 * RLS). Both are deliberately untyped, matching this codebase's existing
 * convention for every service-role/Planner-touching client.
 */
export async function provisionPlannerEvent(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  authClient: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  portalAdmin: any;
  eventId: string;
  organizationId: string;
}): Promise<ProvisioningOutcome> {
  const { authClient, portalAdmin, eventId, organizationId } = params;

  // Phase 2 step 1 — CAS claim: only a 'pending' or 'failed' row can be
  // claimed; a concurrent claim (or an already-succeeded row) leaves this
  // UPDATE affecting 0 rows. The claim itself is the single atomic
  // statement that decides the winner under concurrency (research.md §9);
  // the attempts counter is bumped in a separate follow-up write, which is
  // safe specifically because only the CAS winner ever reaches this line —
  // no other concurrent caller can interleave here, since every other
  // caller's own CAS attempt would already have failed above.
  const { data: claimed, error: claimError } = await portalAdmin
    .from('events')
    .update({
      planner_provisioning_status: 'provisioning',
      planner_provisioning_last_attempted_at: new Date().toISOString(),
    })
    .eq('id', eventId)
    .in('planner_provisioning_status', ['pending', 'failed'])
    .select('id, planner_provisioning_attempts')
    .maybeSingle();

  if (claimError) {
    return { ok: true, status: 'failed', reason: 'Could not start Planner provisioning — try again', code: 'provisioning_error' };
  }

  if (!claimed) {
    return { ok: true, status: 'provisioning_in_progress' };
  }

  await portalAdmin
    .from('events')
    .update({ planner_provisioning_attempts: (claimed.planner_provisioning_attempts ?? 0) + 1 })
    .eq('id', eventId);

  const fail = async (reason: string, code: ProvisioningFailureCode) => {
    await portalAdmin
      .from('events')
      .update({ planner_provisioning_status: 'failed', planner_provisioning_error: reason })
      .eq('id', eventId);
    return { ok: true as const, status: 'failed' as const, reason, code };
  };

  // Phase 2 step 2 — re-verify (not reused from Phase 0) that entitlement
  // and mapping still hold at the moment provisioning actually runs (a real
  // TOCTOU guard against revocation in the narrow window since the RPC's own
  // check committed — not redundant with it, so this check itself is kept,
  // unlike the route-level preflight removed alongside this fix).
  //
  // organization_products has a member-readable SELECT policy
  // (`is_organization_member`), so authClient is correct for the entitlement
  // check. organization_planner_links does NOT — its only policy is
  // `portal_is_global_admin()` — so an authClient read here silently returns
  // no row (not an error) for the ordinary org owner/admin caller this whole
  // flow exists to serve, misreporting a valid mapping as missing (review
  // finding, 2026-09-16 — the same defect class as the just-removed route
  // preflight, found by auditing the rest of this creation sequence). Fixed
  // by reading it through `portalAdmin` instead, matching the identical
  // established pattern this function already uses for `event_planner_links`
  // below (admin-only RLS) and the one Feature 005's planner-overview route
  // uses for the same table. `organizationId` here is already
  // server-trustworthy by this point — the RPC has already authorized this
  // caller for this exact organization and written the new event under it.
  const { data: entitlement } = await authClient
    .from('organization_products')
    .select('is_active')
    .eq('organization_id', organizationId)
    .eq('product_key', 'planner')
    .maybeSingle();

  if (!entitlement || entitlement.is_active !== true) {
    return await fail('Bendie Planner is no longer active for your organisation.', 'entitlement_inactive');
  }

  const { data: mapping, error: mappingError } = await portalAdmin
    .from('organization_planner_links')
    .select('planner_organization_id')
    .eq('organization_id', organizationId)
    .maybeSingle();

  // Distinguish a genuine query/backend failure from a real absence — never
  // collapse the former into `planner_mapping_missing` (the same mistake
  // corrected in Feature 005's F3 finding).
  if (mappingError) {
    return await fail('Could not verify your organization’s Bendie Planner setup — try again.', 'provisioning_error');
  }

  if (!mapping) {
    return await fail(
      "Bendie Planner hasn't been set up for this organization yet. Please contact your administrator to complete the Planner setup before creating this event.",
      'planner_mapping_missing'
    );
  }

  const { data: event } = await authClient
    .from('events')
    .select('name,location,starts_at,ends_at')
    .eq('id', eventId)
    .single();

  if (!event) {
    return await fail('Could not read this event — try again', 'provisioning_error');
  }

  let planner;
  try {
    planner = getPlannerAdminClient();
  } catch (err) {
    return await fail((err as Error).message, 'provisioning_error');
  }

  const code = plannerEventCode(eventId);
  const toDateOnly = (iso: string | null) => (iso ? iso.slice(0, 10) : null);
  const startDate = toDateOnly(event.starts_at);
  const endDate = toDateOnly(event.ends_at);

  // Phase 2 step 3/4 — lookup-before-insert idempotency anchor.
  const { data: existingPlannerEvent } = await planner
    .from('events')
    .select('event_id,organization_id')
    .eq('event_code', code)
    .maybeSingle();

  let plannerEventId: number;

  if (existingPlannerEvent) {
    if (existingPlannerEvent.organization_id !== mapping.planner_organization_id) {
      // Mapping-drift (research.md §5 Phase 2 step 4, §14 scenario 15,
      // added during /speckit.analyze): a Planner event already exists
      // under a DIFFERENT Planner organization than the one currently
      // mapped. Never create a second Planner event under the new mapping,
      // and never link this mismatched one — either would silently
      // misattribute data across Planner tenants. Requires a platform
      // administrator to manually reconcile; not self-service-retryable.
      return await fail(
        `Mapping drift: a Planner event (organization ${existingPlannerEvent.organization_id}) already exists for this Portal event under a different Bendie Planner organization than the one currently mapped (organization ${mapping.planner_organization_id}). An administrator must reconcile this manually.`,
        'mapping_drift'
      );
    }
    plannerEventId = existingPlannerEvent.event_id;
  } else {
    const { data: created, error: insertError } = await planner
      .from('events')
      .insert({
        event_code: code,
        event_title: event.name,
        location: event.location,
        start_date: startDate,
        end_date: endDate,
        setup_date: startDate,
        organization_id: mapping.planner_organization_id,
      })
      .select('event_id')
      .single();

    if (insertError || !created) {
      return await fail(insertError?.message ?? 'Failed to create the Bendie Planner event', 'provisioning_error');
    }
    plannerEventId = created.event_id;
  }

  // Phase 3 — counterpart link, via Portal's service-role client
  // (event_planner_links is admin-only RLS; this deliberately bypasses it,
  // matching Feature 001's own established write pattern in planner-link's
  // own route). ON CONFLICT (event_id) recovers a prior partial attempt.
  const { error: linkError } = await portalAdmin.from('event_planner_links').upsert(
    {
      event_id: eventId,
      planner_event_id: plannerEventId,
      planner_event_title: event.name,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'event_id' }
  );

  if (linkError) {
    return await fail(linkError.message, 'provisioning_error');
  }

  // Phase 4 — finalize. The only code path in the codebase that ever
  // writes 'succeeded' (research.md §5 Phase 4, data-model.md's
  // by-construction guarantee).
  await portalAdmin
    .from('events')
    .update({ planner_provisioning_status: 'succeeded', planner_provisioning_succeeded_at: new Date().toISOString() })
    .eq('id', eventId);

  // Reuse the existing staff-sync capability for the event's original
  // creator, if staff-eligible (research.md §11) — never reimplemented.
  const { data: createdEvent } = await authClient.from('events').select('created_by').eq('id', eventId).single();
  if (createdEvent?.created_by) {
    await syncStaffMemberToPlanner({ authClient, portalAdmin, eventId, userId: createdEvent.created_by }).catch(() => {});
  }

  return { ok: true, status: 'succeeded' };
}
