// UI-only display labels — not enforced schema semantics, chosen to read
// naturally in the org People/Events surfaces.

export const ORG_ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Employee',
  attendee: 'Attendee',
  facilitator: 'External Facilitator',
  staff: 'Staff',
};

export const EVENT_MEMBER_ROLE_LABELS: Record<string, string> = {
  host: 'Host',
  organizer: 'Organiser',
  admin: 'Admin',
  attendee: 'Attendee',
  facilitator: 'Facilitator',
  staff: 'Staff',
  speaker: 'Speaker',
};

export const EVENT_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  published: 'Published',
  active: 'Live',
  completed: 'Completed',
  archived: 'Archived',
};

export const EVENT_STATUS_PILL_CLASSES: Record<string, string> = {
  draft: 'bg-surface-container-high text-on-surface-variant',
  published: 'bg-primary/10 text-primary',
  active: 'bg-green-100 text-green-700',
  completed: 'bg-surface-container-high text-on-surface-variant',
  archived: 'bg-surface-container-high text-on-surface-variant',
};

const AUDIT_TABLE_LABELS: Record<string, string> = {
  facilitators: 'a facilitator',
  agenda_sessions: 'the agenda',
  events: 'the event',
  emergency_contacts: 'emergency contacts',
  faqs: 'an FAQ',
  activities: 'an activity',
  event_photos: 'the gallery',
  games: 'a game',
  event_members: 'a member',
  support_contacts: 'a support contact',
  event_interest_options: 'networking options',
};

const AUDIT_ACTION_VERBS: Record<string, string> = {
  INSERT: 'added',
  UPDATE: 'updated',
  DELETE: 'removed',
};

export function formatAuditAction(tableName: string, action: string): string {
  const label = AUDIT_TABLE_LABELS[tableName] ?? tableName.replace(/_/g, ' ');
  const verb = AUDIT_ACTION_VERBS[action] ?? action.toLowerCase();
  return `${verb} ${label}`;
}
