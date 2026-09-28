import { NextRequest, NextResponse } from 'next/server';
import { resolvePlannerEventAccess } from '@/lib/plannerModuleAccess';
import { resolveLogisticsCapability, listFlights, listHotelBookings, listMovements, type ResolvedLogisticsCapability } from '@/lib/plannerLogistics';
import { listParticipants, resolvePeopleCapability } from '@/lib/plannerPeople';

/**
 * Feature 016 (performance pass) — the Logistics page's INITIAL load in one
 * request (was four parallel requests, each re-running the full Portal +
 * Planner authorization chain).
 *
 * Authorization:
 * - The Portal → Planner access chain is the shared `resolvePlannerEventAccess`
 *   (also behind `/planner-capabilities` and `/planner-readiness`), so a fix to
 *   the chain can't miss this route.
 * - Logistics access then follows `flights/route.ts` exactly: Portal admin
 *   override ⇒ full; no Planner identity ⇒ 403 `planner_identity_unavailable`;
 *   otherwise `resolveLogisticsCapability` (failure ⇒ `backend_error`);
 *   `canView` false ⇒ 403 `logistics_access_denied`. Hotels and movements use
 *   the identical logistics capability.
 * - Participants are included only under the People route's own rule (Portal
 *   admin override, else `resolvePeopleCapability(...).canView`) — never
 *   inferred from Logistics `canManage`, which Planner-side admins also get.
 *   Otherwise `participants: null`, exactly what a 403 from the People route
 *   produced before (the page then offers an empty participant list).
 * The individual collection routes are unchanged and still serve every
 * mutation and refresh.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  if (!eventId) return NextResponse.json({ error: 'event_not_found' }, { status: 404 });

  const access = await resolvePlannerEventAccess(eventId, 'planner-logistics/overview');
  if (access.kind === 'error') return NextResponse.json({ error: access.error }, { status: access.httpStatus });
  if (access.kind === 'phase') return NextResponse.json({ ok: true, status: access.status });

  const { plannerEventId, plannerProfileId, canAdminister } = access;

  let capability: ResolvedLogisticsCapability;
  if (canAdminister) {
    capability = { hasPlannerIdentity: true, canView: true, canManage: true };
  } else if (!plannerProfileId) {
    return NextResponse.json({ error: 'planner_identity_unavailable' }, { status: 403 });
  } else {
    try {
      capability = await resolveLogisticsCapability(plannerEventId, plannerProfileId);
    } catch (err) {
      console.error('planner-logistics/overview: capability resolution failed', err);
      return NextResponse.json({ ok: true, status: 'backend_error' });
    }
  }
  if (!capability.canView) {
    return NextResponse.json({ error: 'logistics_access_denied' }, { status: 403 });
  }

  // People is a different module permission, evaluated with the People route's own rule.
  const loadParticipants = async () => {
    try {
      if (!canAdminister) {
        if (!plannerProfileId) return null;
        const peopleCapability = await resolvePeopleCapability(plannerEventId, plannerProfileId);
        if (!peopleCapability.canView) return null;
      }
      return await listParticipants(plannerEventId);
    } catch (err) {
      console.error('planner-logistics/overview: participants load failed', err);
      return null;
    }
  };

  const [flights, bookings, movements, participants] = await Promise.allSettled([
    listFlights(plannerEventId),
    listHotelBookings(plannerEventId),
    listMovements(plannerEventId),
    loadParticipants(),
  ]);

  // Same failure semantics as the separate routes: a flights failure surfaced as
  // `status: backend_error`; hotels/movements failures left those lists empty.
  if (flights.status === 'rejected') {
    console.error('planner-logistics/overview: flights load failed', flights.reason);
    return NextResponse.json({ ok: true, status: 'backend_error' });
  }
  if (bookings.status === 'rejected') console.error('planner-logistics/overview: hotels load failed', bookings.reason);
  if (movements.status === 'rejected') console.error('planner-logistics/overview: movements load failed', movements.reason);

  return NextResponse.json({
    ok: true,
    capability,
    flights: flights.value,
    bookings: bookings.status === 'fulfilled' ? bookings.value : [],
    movements: movements.status === 'fulfilled' ? movements.value : [],
    participants: participants.status === 'fulfilled' ? participants.value : null,
  });
}
