/**
 * Navigation pass (016 continuation 5) — shared, human-readable presentation
 * layer for both Activity Log surfaces (`organization_audit_log` on
 * `/portal/activity-log`, `event_content_audit_log` on the event workspace's
 * own Activity Log tab). Both pages share the identical audit-row shape and
 * the identical raw-JSON problem, so this is one small module rather than
 * two copies of the same mapping.
 *
 * Live-verified `diff` shapes (queried read-only against real audit rows):
 * - INSERT/DELETE: `diff` is a flat snapshot of the row's own columns.
 * - UPDATE: `diff` has one key per CHANGED column only, each value shaped
 *   `{ old, new }` — the trigger that populates this already excludes
 *   unchanged fields, so no "unchanged fields" filtering is needed here.
 */

export type AuditAction = 'INSERT' | 'UPDATE' | 'DELETE';

export type AuditEntry = {
  id: string;
  table_name: string;
  action: AuditAction;
  row_id: string;
  diff: Record<string, unknown> | null;
  created_at: string;
  profiles: { full_name: string | null; email: string | null; avatar_url: string | null } | null;
};

/** Friendly area/module name per audited table — used for both the row's "area" text and the filter dropdown. Unknown tables fall back to a humanized version of the raw name rather than breaking. */
export const TABLE_AREA_LABELS: Record<string, string> = {
  organization_assets: 'Assets',
  organization_members: 'Organisation People',
  teams: 'Teams',
  team_members: 'Teams',
  events: 'Events',
  event_members: 'Event Members',
  agenda_sessions: 'Agenda',
  facilitators: 'Facilitators',
  emergency_contacts: 'Emergency',
  support_contacts: 'Info Center',
  faqs: 'FAQs',
  posts: 'Gallery',
  event_photos: 'Event Photos',
  event_interest_options: 'Networking',
  activities: 'Activities',
  excursions: 'Excursions',
  expo_spaces: 'Expo Directory',
  news_items: 'News Feed',
  games: 'Games',
};

export function friendlyArea(table: string): string {
  return TABLE_AREA_LABELS[table] ?? humanizeFieldName(table);
}

/** Which `diff` field (a foreign key to `profiles`) identifies the PERSON this row is about — the "John Kamau" in "added John Kamau to an event" — distinct from `actor_user_id` (who performed the action, already resolved via the `profiles` join every caller already does). */
const SUBJECT_ID_FIELD: Record<string, string> = {
  event_members: 'user_id',
  organization_members: 'user_id',
  team_members: 'user_id',
};

export function tableHasSubject(table: string): boolean {
  return table in SUBJECT_ID_FIELD;
}

/** Extracts the raw subject profile id from a diff, handling both the INSERT/DELETE flat shape and the UPDATE `{old,new}` shape. Returns null if this table has no subject concept or the id can't be found. */
export function extractSubjectId(entry: AuditEntry): string | null {
  const field = SUBJECT_ID_FIELD[entry.table_name];
  if (!field || !entry.diff) return null;
  const raw = entry.diff[field];
  if (raw && typeof raw === 'object' && 'new' in (raw as Record<string, unknown>)) {
    const shaped = raw as { old: unknown; new: unknown };
    const v = shaped.new ?? shaped.old;
    return typeof v === 'string' ? v : null;
  }
  return typeof raw === 'string' ? raw : null;
}

/** Per-table, per-action human verb phrase. `{subject}` is substituted with a resolved person name (or a graceful fallback) for tables with a subject concept. Tables/actions not listed here fall back to a generic "{Added/Updated/Removed} {area}" phrase — never a raw INSERT/UPDATE/DELETE label, and never a broken UI for an audited table nobody anticipated. */
const ACTION_PHRASES: Partial<Record<string, Partial<Record<AuditAction, string>>>> = {
  organization_assets: { INSERT: 'uploaded an asset', UPDATE: 'updated an asset', DELETE: 'removed an asset' },
  organization_members: {
    INSERT: 'added {subject} to the organisation',
    UPDATE: "updated {subject}'s organisation membership",
    DELETE: 'removed {subject} from the organisation',
  },
  teams: { INSERT: 'created a team', UPDATE: 'renamed a team', DELETE: 'deleted a team' },
  team_members: { INSERT: 'added {subject} to a team', DELETE: 'removed {subject} from a team' },
  events: { INSERT: 'created an event', UPDATE: 'updated an event', DELETE: 'deleted an event' },
  event_members: {
    INSERT: 'added {subject} to the event',
    UPDATE: "updated {subject}'s event membership",
    DELETE: 'removed {subject} from the event',
  },
  agenda_sessions: { INSERT: 'added an agenda session', UPDATE: 'updated an agenda session', DELETE: 'removed an agenda session' },
  facilitators: { INSERT: 'added a facilitator', UPDATE: 'updated a facilitator', DELETE: 'removed a facilitator' },
  emergency_contacts: { INSERT: 'added an emergency contact', UPDATE: 'updated an emergency contact', DELETE: 'removed an emergency contact' },
  support_contacts: { INSERT: 'added a support contact', UPDATE: 'updated a support contact', DELETE: 'removed a support contact' },
  faqs: { INSERT: 'added an FAQ', UPDATE: 'updated an FAQ', DELETE: 'removed an FAQ' },
  posts: { INSERT: 'added a gallery photo', UPDATE: 'updated a gallery photo', DELETE: 'removed a gallery photo' },
  event_photos: { INSERT: 'added an event photo', UPDATE: 'updated an event photo', DELETE: 'removed an event photo' },
  event_interest_options: { INSERT: 'added a networking option', UPDATE: 'updated a networking option', DELETE: 'removed a networking option' },
};

const GENERIC_VERBS: Record<AuditAction, string> = { INSERT: 'Added', UPDATE: 'Updated', DELETE: 'Removed' };

/** Best-effort resolved subject name — falls back honestly ("a member") rather than ever showing a raw UUID inline. */
function resolveSubjectPhrase(table: string, subjectId: string | null, subjectName: string | undefined): string {
  if (subjectName) return subjectName;
  const generic = table === 'event_members' ? 'a member' : table === 'organization_members' ? 'a member' : table === 'team_members' ? 'a member' : 'someone';
  return subjectId ? generic : generic;
}

/** The full "{actor} {verb phrase}" line, minus the actor's own name (the caller already has that from the `profiles` join). */
export function describeAction(entry: AuditEntry, subjectName?: string): string {
  const phrase = ACTION_PHRASES[entry.table_name]?.[entry.action];
  if (phrase) {
    if (phrase.includes('{subject}')) {
      const subjectId = extractSubjectId(entry);
      return phrase.replace('{subject}', resolveSubjectPhrase(entry.table_name, subjectId, subjectName));
    }
    return phrase;
  }
  return `${GENERIC_VERBS[entry.action]} ${friendlyArea(entry.table_name).toLowerCase()}`;
}

/** A short secondary "what/where" line — e.g. an asset's file name, an event's name — extracted from whichever common headline-shaped field is present. Returns null (render nothing) rather than a guess when none is found. */
const HEADLINE_FIELD_CANDIDATES = ['name', 'title', 'full_name', 'item_name', 'question', 'label'];

export function extractHeadline(entry: AuditEntry): string | null {
  if (!entry.diff) return null;
  // Subject-bearing tables already name the person in the action line itself — a second headline would be redundant.
  if (tableHasSubject(entry.table_name)) return null;
  for (const key of HEADLINE_FIELD_CANDIDATES) {
    const raw = entry.diff[key];
    if (typeof raw === 'string' && raw.trim()) return raw;
    if (raw && typeof raw === 'object' && 'new' in (raw as Record<string, unknown>)) {
      const nv = (raw as { new: unknown }).new;
      if (typeof nv === 'string' && nv.trim()) return nv;
    }
  }
  return null;
}

/** Internal/technical fields never worth showing in the human "Changes" list, regardless of table — ids, foreign keys, storage plumbing, sync bookkeeping. */
const DEFAULT_HIDDEN_FIELDS = new Set([
  'id',
  'organization_id',
  'event_id',
  'row_id',
  'created_at',
  'updated_at',
  'storage_path',
  'user_id', // already surfaced as the subject in the action line
  'uploaded_by',
  'invited_by',
  'created_by',
  'planner_synced_at',
  'planner_sync_status',
  'planner_sync_error',
  'planner_assignment_id',
  'planner_permissions_configured_at',
]);

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  full_name: 'Full Name',
  location: 'Location',
  status: 'Status',
  role: 'Role',
  description: 'Description',
  starts_at: 'Start Date',
  ends_at: 'End Date',
  file_type: 'File Type',
  size_bytes: 'File Size',
  url: 'File',
  hero_title: 'Hero Title',
  hero_description: 'Hero Description',
  hero_image_url: 'Hero Image',
  image_url: 'Image',
  attendee_limit: 'Attendee Limit',
  onboarding_status: 'Onboarding Status',
};

function humanizeFieldName(field: string): string {
  return field
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? humanizeFieldName(field);
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) {
        return d.toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      }
    }
    return value.length > 80 ? `${value.slice(0, 77)}…` : value;
  }
  return String(value);
}

export type ChangeRow = { field: string; label: string; from: string; to: string };

/** The human "Changes" list — for UPDATE, one row per genuinely-changed field (old → new); for INSERT/DELETE, a handful of the record's own meaningful fields (no "from" value, since there's no prior state). Internal fields are always excluded. */
export function summarizeChanges(entry: AuditEntry): ChangeRow[] {
  if (!entry.diff) return [];
  const hidden = DEFAULT_HIDDEN_FIELDS;

  if (entry.action === 'UPDATE') {
    return Object.entries(entry.diff)
      .filter(([field, v]) => !hidden.has(field) && v && typeof v === 'object' && 'new' in (v as Record<string, unknown>))
      .map(([field, v]) => {
        const shaped = v as { old: unknown; new: unknown };
        return { field, label: fieldLabel(field), from: formatValue(shaped.old), to: formatValue(shaped.new) };
      })
      .filter((row) => row.from !== row.to);
  }

  // INSERT/DELETE — the row's own snapshot, skipping internal fields and
  // whichever field was already used as the headline (avoid repeating it).
  const headline = extractHeadline(entry);
  return Object.entries(entry.diff)
    .filter(([field, v]) => !hidden.has(field) && typeof v !== 'object' && v !== headline)
    .map(([field, v]) => ({ field, label: fieldLabel(field), from: '', to: formatValue(v) }));
}
