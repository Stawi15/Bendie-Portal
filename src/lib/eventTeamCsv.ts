import { getField, type ColumnSpec, type RowResult } from '@/lib/csvImport';
import { EVENT_MEMBER_ROLES } from '@/lib/eventMemberRoles';
import { EVENT_MEMBER_ROLE_LABELS } from '@/lib/portalLabels';
import { addPersonToEventByEmail, type EventAccessConfig, type PlannerAccessChoice } from '@/lib/eventTeamProvisioning';

/**
 * Feature 017 (FR-026) — the one event spreadsheet format, shared by Bendie's
 * Attendees & Access import and Planner's Team & Access import. Only the
 * defaults for blank cells differ between the two (attendee / no Planner access
 * vs. staff / Planner viewer); every row goes through addPersonToEventByEmail,
 * so it behaves exactly like a single "Invite new attendee" / "Add team member".
 */

export type EventTeamCsvRow = {
  rowIndex: number;
  email: string;
  full_name: string | null;
  role: string;
  bendieAccess: boolean;
  plannerAccess: PlannerAccessChoice;
};

export type EventTeamCsvDefaults = {
  defaultRole: (typeof EVENT_MEMBER_ROLES)[number];
  defaultPlannerAccess: Exclude<PlannerAccessChoice, 'custom'>;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const EVENT_TEAM_CSV_COLUMNS: ColumnSpec[] = [
  { key: 'email', label: 'Email', required: true },
  { key: 'full_name', label: 'Full Name' },
  { key: 'role', label: `Event Role (${EVENT_MEMBER_ROLES.join(', ')})` },
  { key: 'bendieAccess', label: 'Bendie Access (yes/no)' },
  { key: 'plannerAccess', label: 'Planner Access (none/viewer/manager)' },
];

export const ATTENDEE_CSV_SAMPLES: Record<string, string>[] = [
  { email: 'jane@example.com', full_name: 'Jane Smith', role: 'attendee', bendieAccess: 'yes', plannerAccess: 'none' },
  { email: 'david@example.com', full_name: 'David Otieno', role: 'facilitator', bendieAccess: 'yes', plannerAccess: 'none' },
];

export const TEAM_CSV_SAMPLES: Record<string, string>[] = [
  { email: 'jane@example.com', full_name: 'Jane Smith', role: 'staff', bendieAccess: 'no', plannerAccess: 'viewer' },
  { email: 'david@example.com', full_name: 'David Otieno', role: 'organizer', bendieAccess: 'no', plannerAccess: 'manager' },
];

export function parseEventTeamCsvRow(raw: Record<string, string>, rowIndex: number, defaults: EventTeamCsvDefaults): RowResult<EventTeamCsvRow> {
  const errors: string[] = [];

  const email = getField(raw, 'email').toLowerCase();
  if (!email) errors.push('email is required');
  else if (!EMAIL_RE.test(email)) errors.push('email is not a valid email address');

  const roleRaw = getField(raw, 'role').toLowerCase();
  const role = roleRaw || defaults.defaultRole;
  if (roleRaw && !(EVENT_MEMBER_ROLES as readonly string[]).includes(roleRaw)) errors.push(`role must be one of: ${EVENT_MEMBER_ROLES.join(', ')}`);

  // Absent bendieAccess defaults to false (the import never auto-issued an
  // access code — codes were always a separate, deliberate Resend Code
  // action). Absent plannerAccess uses the caller's default: 'none' on
  // Attendees & Access (Feature 016: product access is never inferred from
  // event role), 'viewer' on Planner Team & Access, where adding a team
  // member is explicitly about Planner access.
  const bendieRaw = getField(raw, 'bendieAccess').toLowerCase();
  const bendieAccess = bendieRaw ? bendieRaw === 'yes' || bendieRaw === 'true' : false;

  const plannerRaw = getField(raw, 'plannerAccess').toLowerCase();
  let plannerAccess: PlannerAccessChoice = defaults.defaultPlannerAccess;
  if (plannerRaw === 'none' || plannerRaw === 'viewer' || plannerRaw === 'manager') plannerAccess = plannerRaw;
  else if (plannerRaw) errors.push('plannerAccess must be one of: none, viewer, manager');

  const data: EventTeamCsvRow = { rowIndex, email, full_name: getField(raw, 'full_name') || null, role, bendieAccess, plannerAccess };
  return { rowIndex, raw, data: errors.length === 0 ? data : undefined, errors };
}

/**
 * Imports one row. `bendieAvailable` gates the Bendie access code so a
 * Planner-only event never issues one even if the sheet says "yes".
 */
export async function importEventTeamCsvRow(
  row: EventTeamCsvRow,
  event: { eventId: string; eventName: string; organizationId: string; bendieAvailable: boolean }
): Promise<{ error?: string; notice?: string }> {
  const config: EventAccessConfig = {
    eventRole: row.role as EventAccessConfig['eventRole'],
    grantBendie: row.bendieAccess && event.bendieAvailable,
    plannerAccess: row.plannerAccess,
  };
  const outcome = await addPersonToEventByEmail(event.eventId, event.eventName, event.organizationId, row.email, row.full_name ?? '', config);

  if (outcome.eventMembership === 'failed') return { error: outcome.eventMembershipError ?? 'Failed to add to event' };
  const problems: string[] = [];
  if (outcome.bendieAccess === 'failed') problems.push('Bendie access code could not be sent');
  if (outcome.plannerAccess === 'failed' || outcome.plannerAccess === 'denied') problems.push('Planner access could not be granted');
  if (problems.length > 0) return { error: `Added to event, but: ${problems.join('; ')}` };

  const notes: string[] = [];
  if (outcome.roleKept) notes.push(`Already on the event — kept their existing role: ${EVENT_MEMBER_ROLE_LABELS[outcome.roleKept] ?? outcome.roleKept}`);
  if (row.bendieAccess && !event.bendieAvailable) notes.push('Bendie access ignored — this event does not use Bendie');
  return notes.length > 0 ? { notice: notes.join('; ') } : {};
}
