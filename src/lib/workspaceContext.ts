/**
 * Feature 030 — the words the Studio 2.0 context strip shows: who can see the
 * event (from `events.status`, attendee app only) and the user's role here.
 * Pure functions, no data access (research R4, R5).
 */
import type { EventMemberRole, EventStatus, OrgMemberRole } from '@/types/database';

/** `events.status` controls the attendee app only; Bendie Planner ignores it. */
export const PLANNER_SCOPE_NOTE = 'Applies to the attendee app (Bendie Planner ignores status)';

export function visibilitySentence(status: EventStatus | string | null | undefined): string {
  switch (status) {
    case 'published':
    case 'active':
      return "Public in the attendee app · anyone can view this event's public details.";
    case 'completed':
    case 'archived':
      return 'Not public · past event. Members can still open it in the attendee app.';
    case 'draft':
    default:
      // Unknown or missing status is treated like draft: the safest, least public reading.
      return 'Draft · not public. Event members see changes in the attendee app immediately.';
  }
}

/** The visibility line plus, on events that have Planner, the scope note. */
export function visibilityLines(
  status: EventStatus | string | null | undefined,
  hasPlanner: boolean
): string[] {
  return hasPlanner
    ? [visibilitySentence(status), PLANNER_SCOPE_NOTE]
    : [visibilitySentence(status)];
}

const EVENT_ROLE_LABEL: Record<EventMemberRole, string> = {
  host: 'Event host',
  organizer: 'Event organiser',
  admin: 'Event admin',
  staff: 'Event staff',
  speaker: 'Speaker',
  facilitator: 'Facilitator',
  attendee: 'Attendee',
};

/** Precedence: Stawi admin > organisation owner/admin > event role > organisation member. */
export function roleLabel({
  isGlobalAdmin,
  orgRole,
  eventRole,
}: {
  isGlobalAdmin: boolean;
  orgRole: OrgMemberRole | string | null | undefined;
  eventRole: EventMemberRole | string | null | undefined;
}): string {
  if (isGlobalAdmin) return 'Stawi admin';
  if (orgRole === 'owner') return 'Organisation owner';
  if (orgRole === 'admin') return 'Organisation admin';
  if (eventRole && eventRole in EVENT_ROLE_LABEL)
    return EVENT_ROLE_LABEL[eventRole as EventMemberRole];
  return 'Organisation member';
}
