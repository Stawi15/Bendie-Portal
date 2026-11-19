import 'server-only';
import { deactivateAssignmentForRemoval, recordAuditEntry } from '@/lib/plannerPermissions';

/**
 * Feature 008's member-removal side effect: switch off the removed person's Planner
 * assignment on the event's linked Planner event, and record it in the Planner
 * permissions audit. Extracted unchanged from
 * `deactivate-on-removal/route.ts` (Feature 028) so the moderation screen's
 * "Remove from event" does the same. Never throws: callers must not block or
 * reverse the Portal removal on a Planner-side failure (FR-041).
 *
 * The caller MUST already have authorised the removal (Stawi admin).
 */
export type PlannerRemovalResult = { ok: true; status?: 'unavailable' | 'backend_error'; deactivationConfirmed?: boolean };

export async function deactivatePlannerOnRemoval(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  portalAdmin: any,
  eventId: string,
  userId: string,
  actorUserId: string
): Promise<PlannerRemovalResult> {
  const { data: targetProfile, error: profileError } = await portalAdmin.from('profiles').select('planner_profile_id').eq('id', userId).maybeSingle();
  if (profileError) {
    console.error('planner-permissions/deactivate-on-removal: profile lookup failed', profileError);
    return { ok: true, status: 'backend_error' };
  }
  if (!targetProfile?.planner_profile_id) {
    return { ok: true, status: 'unavailable' };
  }

  const { data: activeLink, error: linkError } = await portalAdmin
    .from('event_planner_links')
    .select('planner_event_id')
    .eq('event_id', eventId)
    .eq('is_active', true)
    .maybeSingle();
  if (linkError) {
    console.error('planner-permissions/deactivate-on-removal: event_planner_links lookup failed', linkError);
    return { ok: true, status: 'backend_error' };
  }
  if (!activeLink) {
    return { ok: true, status: 'unavailable' };
  }

  try {
    const { deactivationConfirmed } = await deactivateAssignmentForRemoval(activeLink.planner_event_id as number, targetProfile.planner_profile_id);

    // Best-effort snapshot for the audit row — a member-removal deactivation
    // that finds no existing assignment (deactivationConfirmed: false) still
    // gets an audit entry recording the attempt, per FR-041.
    await recordAuditEntry(portalAdmin, {
      eventId,
      memberUserId: userId,
      actorUserId: actorUserId,
      actionType: 'access_disabled',
      beforeState: null,
      afterState: { deactivationConfirmed },
      operationId: crypto.randomUUID(),
    });

    return { ok: true, deactivationConfirmed };
  } catch (err) {
    console.error('planner-permissions/deactivate-on-removal: deactivation failed', err);
    // Never blocks or reverses the Portal-side removal (FR-041) — the caller
    // (EventAssignmentsDropdown.tsx) fires this without awaiting the result.
    return { ok: true, status: 'backend_error' };
  }
}
