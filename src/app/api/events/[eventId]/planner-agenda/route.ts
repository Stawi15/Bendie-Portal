import { NextRequest, NextResponse } from 'next/server';
import { resolvePlannerEventAccess } from '@/lib/plannerModuleAccess';
import {
  AgendaValidationError,
  createAgendaItem,
  listAgendaItems,
  readPortalEventStartDate,
  resolveAgendaCapability,
  validateAgendaInput,
} from '@/lib/plannerAgenda';

/**
 * Feature 018 — Planner Agenda: collection route (GET list + capability,
 * POST create, manage only). Contract: specs/018-planner-agenda-authoring/
 * contracts/planner-agenda.md. Authorization is the shared Planner access
 * check (session, workspace, Planner product, provisioning, active link) plus
 * Production's capability (plan D1).
 */

export async function GET(_request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const access = await resolvePlannerEventAccess(eventId, 'planner-agenda');
  if (access.kind === 'error') return NextResponse.json({ error: access.error }, { status: access.httpStatus });
  if (access.kind === 'phase') return NextResponse.json({ ok: true, status: access.status });

  try {
    const capability = await resolveAgendaCapability(access);
    const items = capability.hasPlannerIdentity && capability.canView ? await listAgendaItems(access.plannerEventId) : [];
    return NextResponse.json({ ok: true, capability, items });
  } catch (err) {
    console.error('planner-agenda: GET failed', err);
    return NextResponse.json({ ok: true, status: 'backend_error' });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const access = await resolvePlannerEventAccess(eventId, 'planner-agenda');
  if (access.kind === 'error') return NextResponse.json({ error: access.error }, { status: access.httpStatus });
  if (access.kind === 'phase') return NextResponse.json({ error: 'planner_unavailable', message: 'Bendie Planner isn’t ready for this event yet.' }, { status: 409 });

  let capability;
  try {
    capability = await resolveAgendaCapability(access);
  } catch (err) {
    console.error('planner-agenda: capability failed', err);
    return NextResponse.json({ error: 'backend_error', message: 'Could not check your access — try again.' }, { status: 500 });
  }
  if (!capability.hasPlannerIdentity || !capability.canManage) {
    return NextResponse.json({ error: 'agenda_manage_denied', message: 'You can view this agenda but not change it.' }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => null);
    const input = validateAgendaInput(body, false);
    const item = await createAgendaItem(access.plannerEventId, input, await readPortalEventStartDate(eventId));
    return NextResponse.json({ ok: true, item }, { status: 201 });
  } catch (err) {
    if (err instanceof AgendaValidationError) return NextResponse.json({ error: 'invalid_request', message: err.message }, { status: 400 });
    console.error('planner-agenda: POST failed', err);
    return NextResponse.json({ error: 'planner_write_failed', message: 'Could not save — try again.' }, { status: 500 });
  }
}
