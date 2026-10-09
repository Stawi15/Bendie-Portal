import { NextRequest, NextResponse } from 'next/server';
import { resolvePlannerEventAccess, type PlannerEventAccess } from '@/lib/plannerModuleAccess';
import {
  AgendaNotFoundError,
  AgendaReadOnlyError,
  AgendaValidationError,
  deleteAgendaItem,
  readPortalEventStartDate,
  resolveAgendaCapability,
  updateAgendaItem,
  validateAgendaInput,
} from '@/lib/plannerAgenda';

/**
 * Feature 018 — Planner Agenda: item route (PATCH, DELETE; manage only).
 * Items outside this event's Planner event → 404 (never leaks existence);
 * items pushed from a Bendie Agenda → 409 (edit them in the Bendie Agenda).
 */

type Ready = Extract<PlannerEventAccess, { kind: 'ready' }>;

async function authorizeManage(eventId: string): Promise<NextResponse | Ready> {
  const access = await resolvePlannerEventAccess(eventId, 'planner-agenda/item');
  if (access.kind === 'error') return NextResponse.json({ error: access.error }, { status: access.httpStatus });
  if (access.kind === 'phase') return NextResponse.json({ error: 'planner_unavailable', message: 'Bendie Planner isn’t ready for this event yet.' }, { status: 409 });
  try {
    const capability = await resolveAgendaCapability(access);
    if (!capability.hasPlannerIdentity || !capability.canManage) {
      return NextResponse.json({ error: 'agenda_manage_denied', message: 'You can view this agenda but not change it.' }, { status: 403 });
    }
  } catch (err) {
    console.error('planner-agenda/item: capability failed', err);
    return NextResponse.json({ error: 'backend_error', message: 'Could not check your access — try again.' }, { status: 500 });
  }
  return access;
}

function parseItemId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function errorResponse(err: unknown, action: string) {
  if (err instanceof AgendaValidationError) return NextResponse.json({ error: 'invalid_request', message: err.message }, { status: 400 });
  if (err instanceof AgendaNotFoundError) return NextResponse.json({ error: 'not_found', message: 'That agenda item no longer exists.' }, { status: 404 });
  if (err instanceof AgendaReadOnlyError) return NextResponse.json({ error: 'pushed_item_read_only', message: err.message }, { status: 409 });
  console.error(`planner-agenda/item: ${action} failed`, err);
  return NextResponse.json({ error: 'planner_write_failed', message: `Could not ${action} — try again.` }, { status: 500 });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ eventId: string; itemId: string }> }) {
  const { eventId, itemId: rawId } = await params;
  const itemId = parseItemId(rawId);
  if (!itemId) return NextResponse.json({ error: 'not_found', message: 'That agenda item no longer exists.' }, { status: 404 });

  const access = await authorizeManage(eventId);
  if (access instanceof NextResponse) return access;

  try {
    const body = await request.json().catch(() => null);
    const input = validateAgendaInput(body, true);
    const item = await updateAgendaItem(access.plannerEventId, itemId, input, await readPortalEventStartDate(eventId));
    return NextResponse.json({ ok: true, item });
  } catch (err) {
    return errorResponse(err, 'save');
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ eventId: string; itemId: string }> }) {
  const { eventId, itemId: rawId } = await params;
  const itemId = parseItemId(rawId);
  if (!itemId) return NextResponse.json({ error: 'not_found', message: 'That agenda item no longer exists.' }, { status: 404 });

  const access = await authorizeManage(eventId);
  if (access instanceof NextResponse) return access;

  try {
    await deleteAgendaItem(access.plannerEventId, itemId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err, 'delete');
  }
}
