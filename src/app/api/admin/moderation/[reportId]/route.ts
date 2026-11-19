import { NextRequest, NextResponse } from 'next/server';
import { requirePlatformAdmin } from '@/lib/orgProductsAdminServer';
import { MODERATION_ACTIONS, ModerationError, applyModerationAction, loadReportDetail, type ModerationAction } from '@/lib/moderation';

/**
 * Feature 028 — one report: GET its content, POST an action
 * (`{ action, commentId?, eventIds?, note? }`). Stawi admins only (spec FR-001).
 */
function errorResponse(err: unknown, logPrefix: string) {
  if (err instanceof ModerationError) return NextResponse.json({ error: err.code, message: err.message }, { status: err.httpStatus });
  console.error(logPrefix, err);
  return NextResponse.json({ error: 'backend_error', message: 'Something went wrong. Try again.' }, { status: 500 });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ reportId: string }> }) {
  const auth = await requirePlatformAdmin();
  if (auth instanceof NextResponse) return auth;
  const { reportId } = await params;
  try {
    return NextResponse.json(await loadReportDetail(reportId));
  } catch (err) {
    return errorResponse(err, 'admin/moderation/[reportId]: detail failed');
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ reportId: string }> }) {
  const auth = await requirePlatformAdmin();
  if (auth instanceof NextResponse) return auth;
  const { reportId } = await params;
  const body = await request.json().catch(() => null);
  const action = body?.action as ModerationAction | undefined;
  if (!action || !MODERATION_ACTIONS.includes(action)) {
    return NextResponse.json({ error: 'invalid_request', message: 'Unknown action.' }, { status: 400 });
  }
  try {
    const result = await applyModerationAction(
      reportId,
      {
        action,
        commentId: typeof body?.commentId === 'string' ? body.commentId : undefined,
        eventIds: Array.isArray(body?.eventIds) ? body.eventIds.filter((id: unknown): id is string => typeof id === 'string') : undefined,
        note: typeof body?.note === 'string' ? body.note : null,
      },
      auth.userId
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return errorResponse(err, 'admin/moderation/[reportId]: action failed');
  }
}
