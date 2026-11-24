/**
 * Feature 031 — Speakers domain module (constitution v2.0.0, Principle II).
 *
 * The single home for speaker (`facilitators`) reads, writes and rules used by
 * the Speakers page (both layouts) and the Attendees page's "Add to speakers".
 * Every function takes the caller's Supabase client, so it runs under that
 * caller's RLS (browser or a server route); it never creates a client and never
 * uses the service role. Behaviour is moved unchanged from the pages: same
 * columns, same validation messages, same display-order rules.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { getField, type ColumnSpec, type RowResult } from './csvImport';

// ─── Types ──────────────────────────────────────────────────────────────────

export const SPEAKER_ROLE_TYPES = ['speaker', 'presenter'] as const;
export type SpeakerRoleType = (typeof SPEAKER_ROLE_TYPES)[number];
export const SPEAKER_ROLE_LABELS: Record<string, string> = { speaker: 'Speaker', presenter: 'Presenter' };

export type Speaker = {
  id: string;
  full_name: string | null;
  email: string | null;
  job_title: string | null;
  organization: string | null;
  bio: string | null;
  avatar_url: string | null;
  facilitator_group: string | null;
  role_type: string;
  linkedin_url: string | null;
  expertise: string | null;
  display_order: number;
  claim_status: string;
};

/** The editable fields (as typed in a form: strings, possibly empty). */
export type SpeakerInput = {
  full_name: string;
  email: string;
  job_title: string;
  organization: string;
  bio: string;
  avatar_url: string;
  facilitator_group: string;
  role_type: string;
  linkedin_url: string;
  expertise: string;
};

export const EMPTY_SPEAKER_INPUT: SpeakerInput = {
  full_name: '',
  email: '',
  job_title: '',
  organization: '',
  bio: '',
  avatar_url: '',
  facilitator_group: '',
  role_type: 'speaker',
  linkedin_url: '',
  expertise: '',
};

export const SPEAKER_SELECT =
  'id,full_name,email,job_title,organization,bio,avatar_url,facilitator_group,role_type,linkedin_url,expertise,display_order,claim_status';

export function speakerToInput(s: Speaker): SpeakerInput {
  return {
    full_name: s.full_name ?? '',
    email: s.email ?? '',
    job_title: s.job_title ?? '',
    organization: s.organization ?? '',
    bio: s.bio ?? '',
    avatar_url: s.avatar_url ?? '',
    facilitator_group: s.facilitator_group ?? '',
    role_type: s.role_type ?? 'speaker',
    linkedin_url: s.linkedin_url ?? '',
    expertise: s.expertise ?? '',
  };
}

// ─── Rules (pure) ───────────────────────────────────────────────────────────

export type SpeakerFieldErrors = { full_name?: string; email?: string };

export const SPEAKER_NAME_REQUIRED = 'Enter the speaker’s name.';
export const SPEAKER_EMAIL_INVALID = 'Enter a valid email address, for example name@company.com — or leave it empty.';

/** Same checks and messages as the Speakers page had before Feature 031. */
export function validateSpeaker(input: Pick<SpeakerInput, 'full_name' | 'email'>): SpeakerFieldErrors {
  const errors: SpeakerFieldErrors = {};
  if (!input.full_name?.trim()) errors.full_name = SPEAKER_NAME_REQUIRED;
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) errors.email = SPEAKER_EMAIL_INVALID;
  return errors;
}

/** Row values to store: empty strings become null; role defaults to `speaker`. The name is stored as typed. */
export function normaliseSpeakerInput(input: SpeakerInput) {
  return {
    full_name: input.full_name,
    email: input.email || null,
    job_title: input.job_title || null,
    organization: input.organization || null,
    bio: input.bio || null,
    avatar_url: input.avatar_url || null,
    facilitator_group: input.facilitator_group || null,
    role_type: input.role_type || 'speaker',
    linkedin_url: input.linkedin_url || null,
    expertise: input.expertise || null,
  };
}

/** Search across name, email, job title, organisation, group and expertise (case-insensitive). */
export function matchesSearch(s: Speaker, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [s.full_name, s.email, s.job_title, s.organization, s.facilitator_group, s.expertise].some((v) =>
    (v ?? '').toLowerCase().includes(q)
  );
}

export type SpeakerFilters = { group: string | null; role: string | null; unclaimedOnly: boolean };
export const NO_SPEAKER_FILTERS: SpeakerFilters = { group: null, role: null, unclaimedOnly: false };

export function applySpeakerFilters(speakers: Speaker[], query: string, f: SpeakerFilters): Speaker[] {
  return speakers.filter(
    (s) =>
      matchesSearch(s, query) &&
      (f.group === null || (s.facilitator_group ?? '') === f.group) &&
      (f.role === null || (s.role_type || 'speaker') === f.role) &&
      (!f.unclaimedOnly || s.claim_status !== 'claimed')
  );
}

export function isSpeakerFiltered(query: string, f: SpeakerFilters): boolean {
  return query.trim() !== '' || f.group !== null || f.role !== null || f.unclaimedOnly;
}

/** Distinct, non-empty groups present on these speakers, alphabetical. */
export function speakerGroups(speakers: Speaker[]): string[] {
  const set = new Set<string>();
  for (const s of speakers) if (s.facilitator_group?.trim()) set.add(s.facilitator_group);
  return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

export type SpeakerSortKey = 'display_order' | 'full_name' | 'organization' | 'facilitator_group' | 'claim_status';

/** Text compares case-insensitively; empty values sort last in both directions; ties by display order. */
export function compareSpeakers(a: Speaker, b: Speaker, key: SpeakerSortKey, desc = false): number {
  const tie = a.display_order - b.display_order;
  if (key === 'display_order') return desc ? -tie : tie;
  const av = key === 'claim_status' ? (a.claim_status === 'claimed' ? 'claimed' : 'not claimed') : ((a[key] ?? '') as string).trim();
  const bv = key === 'claim_status' ? (b.claim_status === 'claimed' ? 'claimed' : 'not claimed') : ((b[key] ?? '') as string).trim();
  if (!av && !bv) return tie;
  if (!av) return 1;
  if (!bv) return -1;
  const c = av.localeCompare(bv, undefined, { sensitivity: 'base' });
  return c === 0 ? tie : desc ? -c : c;
}

// ─── Spreadsheet import (moved verbatim from the Speakers page) ─────────────

export type SpeakerCsvRow = {
  rowIndex: number;
  full_name: string;
  email: string | null;
  job_title: string | null;
  organization: string | null;
  facilitator_group: string | null;
  role_type: string;
  linkedin_url: string | null;
  expertise: string | null;
  bio: string | null;
  avatar_url: string | null;
};

export const SPEAKER_CSV_COLUMNS: ColumnSpec[] = [
  { key: 'full_name', label: 'Full Name', required: true },
  { key: 'email', label: 'Email' },
  { key: 'job_title', label: 'Job Title' },
  { key: 'organization', label: 'Organisation' },
  // Template header is "speaker_group"; the parser still accepts the old "facilitator_group" header (pre-rename templates).
  { key: 'speaker_group', label: 'Speaker Group' },
  { key: 'role_type', label: 'Role Type (speaker, presenter)' },
  { key: 'linkedin_url', label: 'LinkedIn URL' },
  { key: 'expertise', label: 'Expertise' },
  { key: 'bio', label: 'Bio' },
  { key: 'avatar_url', label: 'Avatar URL' },
];

export const SPEAKER_CSV_SAMPLES: Record<string, string>[] = [
  {
    full_name: 'Jane Smith',
    email: 'jane@example.com',
    job_title: 'Head of Product',
    organization: 'TechCorp',
    speaker_group: 'Keynote Speakers',
    role_type: 'speaker',
    linkedin_url: 'https://linkedin.com/in/janesmith',
    expertise: 'AI, Machine Learning',
    bio: 'Short biography...',
    avatar_url: '',
  },
  {
    full_name: 'David Otieno',
    email: 'david@example.com',
    job_title: 'Workshop Lead',
    organization: 'Bendie',
    speaker_group: 'Breakout Sessions',
    role_type: 'presenter',
    linkedin_url: '',
    expertise: 'Team Building',
    bio: '',
    avatar_url: '',
  },
];

export function parseSpeakerCsvRow(raw: Record<string, string>, rowIndex: number): RowResult<SpeakerCsvRow> {
  const errors: string[] = [];
  const full_name = getField(raw, 'full_name');
  if (!full_name) errors.push('full_name is required');

  const roleTypeRaw = getField(raw, 'role_type').toLowerCase();
  const role_type = roleTypeRaw || 'speaker';
  if (roleTypeRaw && !SPEAKER_ROLE_TYPES.includes(roleTypeRaw as SpeakerRoleType)) {
    errors.push(`role_type must be one of: ${SPEAKER_ROLE_TYPES.join(', ')}`);
  }

  const data: SpeakerCsvRow = {
    rowIndex,
    full_name,
    email: getField(raw, 'email') || null,
    job_title: getField(raw, 'job_title') || null,
    organization: getField(raw, 'organization') || null,
    facilitator_group: getField(raw, 'speaker_group') || getField(raw, 'facilitator_group') || null,
    role_type,
    linkedin_url: getField(raw, 'linkedin_url') || null,
    expertise: getField(raw, 'expertise') || null,
    bio: getField(raw, 'bio') || null,
    avatar_url: getField(raw, 'avatar_url') || null,
  };

  return { rowIndex, raw, data: errors.length === 0 ? data : undefined, errors };
}

// ─── Reads and writes (passed-in client, RLS) ──────────────────────────────

type DbError = { message: string; code?: string; details?: string; hint?: string };

export async function listSpeakers(
  client: SupabaseClient,
  eventId: string,
  signal?: AbortSignal
): Promise<{ data: Speaker[]; error: null } | { data: null; error: DbError }> {
  let q = client.from('facilitators').select(SPEAKER_SELECT).eq('event_id', eventId).order('display_order');
  if (signal) q = q.abortSignal(signal);
  const { data, error } = await q;
  if (error) return { data: null, error };
  return { data: (data ?? []) as Speaker[], error: null };
}

/** `displayOrder`: the current speaker count when adding from the Speakers page (end of the list). */
export async function createSpeaker(client: SupabaseClient, eventId: string, input: SpeakerInput, displayOrder: number) {
  const { data, error } = await client
    .from('facilitators')
    .insert({ event_id: eventId, ...normaliseSpeakerInput(input), display_order: displayOrder })
    .select(SPEAKER_SELECT)
    .single();
  return { data: (data as Speaker | null) ?? null, error };
}

/** Never changes `display_order`. */
export async function updateSpeaker(client: SupabaseClient, id: string, input: SpeakerInput) {
  const { error } = await client.from('facilitators').update(normaliseSpeakerInput(input)).eq('id', id);
  return { error };
}

export async function deleteSpeaker(client: SupabaseClient, id: string) {
  const { error } = await client.from('facilitators').delete().eq('id', id);
  return { error };
}

/** One imported row; `displayOrder` = speaker count before the import + the row's index. Shape fits `CsvImportModal.importRow`. */
export async function importSpeakerRow(client: SupabaseClient, eventId: string, row: SpeakerCsvRow, displayOrder: number) {
  const rest: Partial<SpeakerCsvRow> = { ...row };
  delete rest.rowIndex;
  const { error } = await client.from('facilitators').insert({ event_id: eventId, ...rest, display_order: displayOrder });
  return { error: error?.message };
}

export type AttendeeForSpeaker = {
  user_id: string;
  profiles?: { full_name?: string | null; email?: string | null; job_title?: string | null; avatar_url?: string | null } | null;
};

/** The insert the Attendees page has always made (claimed, from the profile, no display order). */
export function attendeeSpeakerPayload(eventId: string, m: AttendeeForSpeaker, now: Date = new Date()) {
  return {
    event_id: eventId,
    user_id: m.user_id,
    full_name: m.profiles?.full_name ?? null,
    email: m.profiles?.email ?? null,
    job_title: m.profiles?.job_title ?? null,
    avatar_url: m.profiles?.avatar_url ?? null,
    claim_status: 'claimed',
    claimed_at: now.toISOString(),
  };
}

/**
 * Attendees' "Add to speakers", speaker part only: if the person isn't a speaker
 * on this event yet, add them as a claimed speaker. The event-role update stays
 * with the caller (member logic, not speaker logic).
 */
export async function addSpeakerFromAttendee(
  client: SupabaseClient,
  eventId: string,
  m: AttendeeForSpeaker
): Promise<{ created: boolean; error: null } | { created: false; error: DbError }> {
  const { data: existing, error: checkError } = await client
    .from('facilitators')
    .select('id')
    .eq('event_id', eventId)
    .eq('user_id', m.user_id)
    .maybeSingle();
  if (checkError) return { created: false, error: checkError };
  if (existing) return { created: false, error: null };
  const { error } = await client.from('facilitators').insert(attendeeSpeakerPayload(eventId, m));
  if (error) return { created: false, error };
  return { created: true, error: null };
}

// ─── Sessions a speaker is on (read only) ──────────────────────────────────

export type SpeakerSession = { id: string; title: string | null; starts_at: string | null; ends_at: string | null };

/** Merge the lead-speaker and linked sessions: de-duplicated by id, by start time (no time last). */
export function mergeSpeakerSessions(lead: SpeakerSession[], linked: SpeakerSession[]): SpeakerSession[] {
  const byId = new Map<string, SpeakerSession>();
  for (const s of [...lead, ...linked]) if (s && !byId.has(s.id)) byId.set(s.id, s);
  return [...byId.values()].sort((a, b) => {
    if (!a.starts_at && !b.starts_at) return 0;
    if (!a.starts_at) return 1;
    if (!b.starts_at) return -1;
    return a.starts_at.localeCompare(b.starts_at);
  });
}

/**
 * Sessions this speaker is on, as the Agenda page decides it: the session's lead
 * (`agenda_sessions.facilitator_id`) or a linked speaker (`agenda_session_speakers`).
 * Also returns the event's time zone for display (Feature 024).
 * NOTE (analysis N1): moves to `agenda.ts` when that domain module exists.
 */
export async function listSpeakerSessions(
  client: SupabaseClient,
  eventId: string,
  speakerId: string
): Promise<{ data: SpeakerSession[]; timeZone: string | null; error: null } | { data: null; timeZone: null; error: DbError }> {
  const [lead, linked, event] = await Promise.all([
    client.from('agenda_sessions').select('id,title,starts_at,ends_at').eq('event_id', eventId).eq('facilitator_id', speakerId),
    client
      .from('agenda_session_speakers')
      .select('agenda_sessions!inner(id,title,starts_at,ends_at,event_id)')
      .eq('facilitator_id', speakerId)
      .eq('agenda_sessions.event_id', eventId),
    client.from('events').select('timezone').eq('id', eventId).maybeSingle(),
  ]);
  const error = lead.error ?? linked.error;
  if (error) return { data: null, timeZone: null, error };
  const linkedSessions = ((linked.data ?? []) as unknown as { agenda_sessions: SpeakerSession | SpeakerSession[] | null }[])
    .flatMap((r) => (Array.isArray(r.agenda_sessions) ? r.agenda_sessions : r.agenda_sessions ? [r.agenda_sessions] : []))
    .map(({ id, title, starts_at, ends_at }) => ({ id, title, starts_at, ends_at }));
  return {
    data: mergeSpeakerSessions((lead.data ?? []) as SpeakerSession[], linkedSessions),
    timeZone: (event.data as { timezone?: string | null } | null)?.timezone ?? null,
    error: null,
  };
}
