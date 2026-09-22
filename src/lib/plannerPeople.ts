import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getPlannerAdminClient } from '@/lib/plannerAdmin';

/**
 * Feature 011 — narrow, server-only Bendie Planner People/Participant
 * data-access module, mirroring `plannerVendors.ts`/`plannerChecklist.ts`'s
 * shape: explicit column lists (never `select('*')`), narrow single-purpose
 * functions, no route-handler concerns.
 *
 * Operates directly against the canonical `passengers` (global person
 * identity) and `event_passengers` (event-participation join) tables — no
 * Portal-side copy, no sync layer. Unlike Vendors/Checklist/Tasks, neither
 * table has any trigger at all — no auto-`updated_at`, no notification
 * generation, no `auth.uid()`-dependent logic — so this module is
 * responsible for stamping `updated_at` itself on every edit.
 */

export type Participant = {
  id: number;
  eventPassengerId: number;
  fullName: string;
  title: string | null;
  passport: string | null;
  dietaryRequirements: string | null;
  gender: string | null;
  email: string | null;
  phone: string | null;
  createdAt: string;
  updatedAt: string;
  linkedAt: string;
};

export type PeopleCapability = { hasPlannerIdentity: false } | { hasPlannerIdentity: true; canView: boolean; canManage: boolean };

/** The narrower shape callers get once a non-null Planner identity (or a Portal-admin bypass) is already confirmed. */
export type ResolvedPeopleCapability = Extract<PeopleCapability, { hasPlannerIdentity: true }>;

export type ParticipantCreateInput = {
  fullName: string;
  title?: string | null;
  passport?: string | null;
  dietaryRequirements?: string | null;
  gender?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type ParticipantPatch = Partial<{
  fullName: string;
  title: string | null;
  passport: string | null;
  dietaryRequirements: string | null;
  gender: string | null;
  email: string | null;
  phone: string | null;
}>;

export class PlannerPeopleValidationError extends Error {
  code: 'invalid_request' | 'already_linked';
  constructor(message: string, code: 'invalid_request' | 'already_linked' = 'invalid_request') {
    super(message);
    this.code = code;
  }
}

export class PlannerPeopleNotFoundError extends Error {}

const PEOPLE_SELECT_COLUMNS =
  'event_passenger_id, event_id, created_at, ' +
  'passenger:passengers(passenger_id, full_name, title, passport, dietary_requirements, gender, email, phone, created_at, updated_at)';

type RawPassengerEmbed = {
  passenger_id: number;
  full_name: string;
  title: string | null;
  passport: string | null;
  dietary_requirements: string | null;
  gender: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
};

type RawParticipantRow = {
  event_passenger_id: number;
  event_id: number;
  created_at: string;
  passenger: RawPassengerEmbed | RawPassengerEmbed[] | null;
};

function embedPassenger(embed: RawPassengerEmbed | RawPassengerEmbed[] | null): RawPassengerEmbed | null {
  return Array.isArray(embed) ? (embed[0] ?? null) : embed;
}

/** Explicit allowlist projection — never spreads the raw row. */
function shapeParticipant(row: RawParticipantRow): Participant {
  const passenger = embedPassenger(row.passenger);
  if (!passenger) throw new Error('plannerPeople: participant row missing embedded passenger');
  return {
    id: passenger.passenger_id,
    eventPassengerId: row.event_passenger_id,
    fullName: passenger.full_name,
    title: passenger.title,
    passport: passenger.passport,
    dietaryRequirements: passenger.dietary_requirements,
    gender: passenger.gender,
    email: passenger.email,
    phone: passenger.phone,
    createdAt: passenger.created_at,
    updatedAt: passenger.updated_at,
    linkedAt: row.created_at,
  };
}

/** Reads the caller's Planner identity from Portal's own `profiles.planner_profile_id` (Feature 001 bridge). A small, deliberately self-contained duplicate of `plannerVendors.ts`'s identical function. */
export async function resolveCallerPlannerIdentity(portalAuthClient: SupabaseClient, portalUserId: string): Promise<string | null> {
  const { data, error } = await portalAuthClient.from('profiles').select('planner_profile_id').eq('id', portalUserId).maybeSingle();
  if (error) {
    console.error('resolveCallerPlannerIdentity (people): profiles lookup failed', error);
    return null;
  }
  return data?.planner_profile_id ?? null;
}

/**
 * Unlike every prior module's `resolveXCapability`, this one never reads a
 * per-event `can_view_people`/`can_manage_people` flag — none exists, and
 * none was invented (locked product decision, plan.md). A Planner
 * platform-admin bypass still grants full access; otherwise `canView`
 * reflects only whether an *active* `event_user_assignments` row exists at
 * all (any flags), and `canManage` is always `false` from this function —
 * manage authority only ever comes from the Portal-layer
 * `canAdministerPlannerPermissions` check, applied by the route before this
 * function is even called (see route files).
 */
export async function resolvePeopleCapability(plannerEventId: number, plannerProfileId: string): Promise<ResolvedPeopleCapability> {
  const planner = getPlannerAdminClient();

  const { data: profile, error: profileError } = await planner.from('profiles').select('is_platform_admin, role').eq('id', plannerProfileId).maybeSingle();
  if (profileError) throw profileError;

  const role = (profile?.role ?? '').trim().toLowerCase();
  const isPlatformAdmin = profile?.is_platform_admin === true || ['admin', 'super_admin', 'superadmin'].includes(role);
  if (isPlatformAdmin) {
    return { hasPlannerIdentity: true, canView: true, canManage: true };
  }

  const { data: assignment, error: assignmentError } = await planner
    .from('event_user_assignments')
    .select('assignment_id')
    .eq('event_id', plannerEventId)
    .eq('profile_id', plannerProfileId)
    .eq('is_active', true)
    .maybeSingle();
  if (assignmentError) throw assignmentError;

  return { hasPlannerIdentity: true, canView: !!assignment, canManage: false };
}

/** Explicit-column select, never `select('*')`; scoped strictly to one event. Sorted by name in application code (an event's roster, not the full global table — sort-at-scale is not a concern here). */
export async function listParticipants(plannerEventId: number): Promise<Participant[]> {
  const planner = getPlannerAdminClient();
  const { data, error } = await planner.from('event_passengers').select(PEOPLE_SELECT_COLUMNS).eq('event_id', plannerEventId);
  if (error) throw error;
  const participants = (data ?? []).map((row) => shapeParticipant(row as unknown as RawParticipantRow));
  return participants.sort((a, b) => a.fullName.localeCompare(b.fullName));
}

/** Returns `null` whenever the passenger doesn't exist OR isn't linked to `plannerEventId` — the single item-scope check every mutation below reuses. */
export async function getParticipant(plannerEventId: number, passengerId: number): Promise<Participant | null> {
  const planner = getPlannerAdminClient();
  const { data, error } = await planner
    .from('event_passengers')
    .select(PEOPLE_SELECT_COLUMNS)
    .eq('event_id', plannerEventId)
    .eq('passenger_id', passengerId)
    .maybeSingle();
  if (error) throw error;
  return data ? shapeParticipant(data as unknown as RawParticipantRow) : null;
}

export type PassengerSearchResult = { passengerId: number; fullName: string; email: string | null; phone: string | null };

/**
 * Global search across `passengers` (spec.md Verified Business Rule 8 —
 * deliberately not org-scoped, matching Planner's own already-global
 * `passengers_select_all` RLS policy), filtered against the event's
 * already-linked passenger IDs so "add existing" never re-offers someone
 * already on the roster.
 */
export async function searchUnlinkedPassengers(plannerEventId: number, query: string): Promise<PassengerSearchResult[]> {
  const planner = getPlannerAdminClient();
  const trimmed = query.trim();
  if (!trimmed) return [];

  const { data: linked, error: linkedError } = await planner.from('event_passengers').select('passenger_id').eq('event_id', plannerEventId);
  if (linkedError) throw linkedError;
  const linkedIds = new Set((linked ?? []).map((r) => r.passenger_id as number));

  const { data, error } = await planner
    .from('passengers')
    .select('passenger_id, full_name, email, phone')
    .or(`full_name.ilike.%${trimmed}%,email.ilike.%${trimmed}%`)
    .limit(20);
  if (error) throw error;

  return (data ?? [])
    .filter((row) => !linkedIds.has(row.passenger_id as number))
    .map((row) => ({ passengerId: row.passenger_id as number, fullName: row.full_name as string, email: row.email as string | null, phone: row.phone as string | null }));
}

function normalizeOptional(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/** Manager-only (enforced by the route). Inserts `passengers` then `event_passengers`; rolls back the `passengers` row if the link insert fails, avoiding an orphaned, invisible identity. Not a distributed transaction — acceptable at this scale (plan.md). */
export async function createNewParticipant(plannerEventId: number, input: ParticipantCreateInput): Promise<Participant> {
  const fullName = input.fullName?.trim();
  if (!fullName) throw new PlannerPeopleValidationError('Full name is required.');

  const planner = getPlannerAdminClient();
  const { data: passenger, error: passengerError } = await planner
    .from('passengers')
    .insert({
      full_name: fullName,
      title: normalizeOptional(input.title),
      passport: normalizeOptional(input.passport),
      dietary_requirements: normalizeOptional(input.dietaryRequirements),
      gender: normalizeOptional(input.gender),
      email: normalizeOptional(input.email),
      phone: normalizeOptional(input.phone),
    })
    .select('passenger_id')
    .single();
  if (passengerError) throw passengerError;

  const passengerId = passenger.passenger_id as number;
  const { error: linkError } = await planner.from('event_passengers').insert({ event_id: plannerEventId, passenger_id: passengerId });
  if (linkError) {
    await planner.from('passengers').delete().eq('passenger_id', passengerId);
    throw linkError;
  }

  const participant = await getParticipant(plannerEventId, passengerId);
  if (!participant) throw new Error('plannerPeople: participant vanished immediately after creation');
  return participant;
}

/** Manager-only (enforced by the route). Links an already-existing global passenger to the event; never mutates the `passengers` row. */
export async function linkExistingParticipant(plannerEventId: number, passengerId: number): Promise<Participant> {
  const planner = getPlannerAdminClient();

  const { data: passenger, error: passengerError } = await planner.from('passengers').select('passenger_id').eq('passenger_id', passengerId).maybeSingle();
  if (passengerError) throw passengerError;
  if (!passenger) throw new PlannerPeopleNotFoundError('Passenger not found.');

  const { error: linkError } = await planner.from('event_passengers').insert({ event_id: plannerEventId, passenger_id: passengerId });
  if (linkError) {
    if ((linkError as { code?: string }).code === '23505') {
      throw new PlannerPeopleValidationError('This person is already part of this event.', 'already_linked');
    }
    throw linkError;
  }

  const participant = await getParticipant(plannerEventId, passengerId);
  if (!participant) throw new Error('plannerPeople: participant vanished immediately after linking');
  return participant;
}

/**
 * Item-scope check via `event_passengers` existence, then updates only the
 * `passengers` fields present in `patch` (`'field' in patch` idiom — every
 * field here is a nullable string with no separate "explicit false" case to
 * distinguish, unlike Vendors/Checklist's booleans). Manually stamps
 * `updated_at` — no trigger does this on `passengers` (plan.md).
 */
export async function updateParticipant(plannerEventId: number, passengerId: number, patch: ParticipantPatch): Promise<Participant> {
  const existing = await getParticipant(plannerEventId, passengerId);
  if (!existing) throw new PlannerPeopleNotFoundError('Participant not found.');

  const updates: Record<string, unknown> = {};
  if ('fullName' in patch) {
    const fullName = patch.fullName?.trim();
    if (!fullName) throw new PlannerPeopleValidationError('Full name is required.');
    updates.full_name = fullName;
  }
  if ('title' in patch) updates.title = normalizeOptional(patch.title);
  if ('passport' in patch) updates.passport = normalizeOptional(patch.passport);
  if ('dietaryRequirements' in patch) updates.dietary_requirements = normalizeOptional(patch.dietaryRequirements);
  if ('gender' in patch) updates.gender = normalizeOptional(patch.gender);
  if ('email' in patch) updates.email = normalizeOptional(patch.email);
  if ('phone' in patch) updates.phone = normalizeOptional(patch.phone);

  if (Object.keys(updates).length === 0) {
    throw new PlannerPeopleValidationError('At least one field is required.');
  }
  updates.updated_at = new Date().toISOString();

  const planner = getPlannerAdminClient();
  const { error } = await planner.from('passengers').update(updates).eq('passenger_id', passengerId);
  if (error) throw error;

  const participant = await getParticipant(plannerEventId, passengerId);
  if (!participant) throw new PlannerPeopleNotFoundError('Participant not found.');
  return participant;
}

/** Manager-only (enforced by the route). Deletes the `event_passengers` link only — the global `passengers` record, and any other event's link to it, is never touched. */
export async function removeParticipantFromEvent(plannerEventId: number, passengerId: number): Promise<void> {
  const planner = getPlannerAdminClient();
  const { data, error } = await planner
    .from('event_passengers')
    .delete()
    .eq('event_id', plannerEventId)
    .eq('passenger_id', passengerId)
    .select('event_passenger_id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new PlannerPeopleNotFoundError('Participant not found.');
}

/** Maps any thrown error from the functions above to one of the safe, documented contract categories — never returns raw Planner error text/stack traces. */
export function normalizePlannerPeopleError(err: unknown): { category: string; message: string } {
  if (err instanceof PlannerPeopleValidationError) {
    return { category: err.code, message: err.message };
  }
  if (err instanceof PlannerPeopleNotFoundError) {
    return { category: 'participant_not_found', message: err.message };
  }
  console.error('plannerPeople: unexpected error', err);
  return { category: 'planner_write_failed', message: 'Could not save — try again.' };
}
