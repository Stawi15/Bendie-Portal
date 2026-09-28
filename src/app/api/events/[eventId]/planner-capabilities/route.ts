import { NextRequest, NextResponse } from 'next/server';
import { resolvePlannerEventAccess, resolveAllModuleCapabilities } from '@/lib/plannerModuleAccess';

/**
 * Feature 016 (performance pass) — ONE capability request for every Planner
 * module, used by EventLayout for tab visibility (replaced six parallel
 * `/planner-{module}/capability` requests that each re-ran the full ~10-round-
 * trip chain). The chain and the per-module precedence (People/Logistics/
 * Production-only Portal-admin override; per-module `backend_error` isolation)
 * live in `src/lib/plannerModuleAccess.ts`, shared with `/planner-readiness`.
 * Response shape is unchanged: `{ ok, status }` for a whole-event phase, or
 * `{ ok, modules: { tasks, vendors, checklist, people, logistics, production } }`.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  if (!eventId) return NextResponse.json({ error: 'event_not_found' }, { status: 404 });

  const access = await resolvePlannerEventAccess(eventId, 'planner-capabilities');
  if (access.kind === 'error') return NextResponse.json({ error: access.error }, { status: access.httpStatus });
  if (access.kind === 'phase') return NextResponse.json({ ok: true, status: access.status });

  const modules = await resolveAllModuleCapabilities(access, 'planner-capabilities');
  return NextResponse.json({ ok: true, modules });
}
