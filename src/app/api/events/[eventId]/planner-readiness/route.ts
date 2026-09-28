import { NextRequest, NextResponse } from 'next/server';
import { resolvePlannerEventAccess, resolveAllModuleCapabilities, type ModuleResult } from '@/lib/plannerModuleAccess';
import { listEventTasks } from '@/lib/plannerTasks';
import { listVendorItems } from '@/lib/plannerVendors';
import { listChecklistItems } from '@/lib/plannerChecklist';
import { listParticipants } from '@/lib/plannerPeople';
import { listFlights, listHotelBookings, listMovements } from '@/lib/plannerLogistics';
import { listSessions } from '@/lib/plannerProduction';

/**
 * Feature 016 (main-tab performance pass) — the Dashboard's Planner readiness
 * COUNTS in one request. The Dashboard used to fire eight Planner collection
 * requests (people, tasks, vendors, checklist, flights, hotels, movements,
 * production), each re-running the full Portal + Planner authorization chain
 * and returning whole collections only so the browser could count them. They
 * were never cancelled, so leaving the Dashboard left up to eight long requests
 * holding the browser's same-origin connections (see spec pass 23).
 *
 * One access chain (`plannerModuleAccess`), per-module capabilities with the
 * exact per-route precedence, then only the modules the caller may VIEW are
 * read and counted server-side. A module the caller can't view — or whose read
 * fails — comes back as `null` ("Not available"), exactly what a 403/error from
 * that module's own route produced before. No row data is returned, only counts.
 */
type Counts = {
  peopleTotal: number | null;
  flightsCovered: number | null;
  hotelsCovered: number | null;
  groundTransportAssigned: number | null;
  tasksTotal: number | null;
  tasksOutstanding: number | null;
  checklistTotal: number | null;
  checklistUnsourced: number | null;
  vendorsTotal: number | null;
  vendorsNotOnSite: number | null;
  productionTotal: number | null;
};

const canView = (m: ModuleResult) => 'capability' in m && m.capability.canView === true;

async function safe<T>(label: string, work: () => Promise<T>): Promise<T | null> {
  try {
    return await work();
  } catch (err) {
    console.error(`planner-readiness: ${label} failed`, err);
    return null;
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  if (!eventId) return NextResponse.json({ error: 'event_not_found' }, { status: 404 });

  const access = await resolvePlannerEventAccess(eventId, 'planner-readiness');
  if (access.kind === 'error') return NextResponse.json({ error: access.error }, { status: access.httpStatus });
  if (access.kind === 'phase') return NextResponse.json({ ok: true, status: access.status });

  const caps = await resolveAllModuleCapabilities(access, 'planner-readiness');
  const e = access.plannerEventId;
  const checklistCap = 'capability' in caps.checklist ? caps.checklist.capability : null;

  const [people, tasks, vendors, checklist, flights, hotels, movements, sessions] = await Promise.all([
    canView(caps.people) ? safe('participants', () => listParticipants(e)) : null,
    canView(caps.tasks) ? safe('tasks', () => listEventTasks(e)) : null,
    canView(caps.vendors) ? safe('vendors', () => listVendorItems(e)) : null,
    // Checklist visibility is viewer-scoped — counted exactly as the Checklist route lists it.
    canView(caps.checklist) && access.plannerProfileId
      ? safe('checklist', () => listChecklistItems(e, access.plannerProfileId as string, checklistCap?.canManage === true))
      : null,
    canView(caps.logistics) ? safe('flights', () => listFlights(e)) : null,
    canView(caps.logistics) ? safe('hotels', () => listHotelBookings(e)) : null,
    canView(caps.logistics) ? safe('movements', () => listMovements(e)) : null,
    canView(caps.production) ? safe('production', () => listSessions(e)) : null,
  ]);

  const distinct = (ids: (number | string | null | undefined)[]) => new Set(ids.filter((v) => v != null)).size;

  // Same arithmetic the Dashboard used to do client-side.
  const counts: Counts = {
    peopleTotal: people ? people.length : null,
    flightsCovered: flights ? distinct(flights.map((f) => (f as { passengerId?: number }).passengerId)) : null,
    hotelsCovered: hotels ? distinct(hotels.map((h) => (h as { passengerId?: number }).passengerId)) : null,
    groundTransportAssigned: movements
      ? distinct(
          movements.flatMap((m) =>
            ((m as { vehicles?: { assignments?: { passengerId?: number }[] }[] }).vehicles ?? []).flatMap((v) => (v.assignments ?? []).map((a) => a.passengerId))
          )
        )
      : null,
    tasksTotal: tasks ? tasks.length : null,
    tasksOutstanding: tasks ? tasks.filter((t) => (t as { status?: string }).status !== 'Completed').length : null,
    checklistTotal: checklist ? checklist.length : null,
    checklistUnsourced: checklist ? checklist.filter((c) => !(c as { isSourced?: boolean }).isSourced).length : null,
    vendorsTotal: vendors ? vendors.length : null,
    vendorsNotOnSite: vendors ? vendors.filter((v) => !(v as { isOnSite?: boolean }).isOnSite).length : null,
    productionTotal: sessions ? sessions.length : null,
  };

  return NextResponse.json({ ok: true, counts });
}
