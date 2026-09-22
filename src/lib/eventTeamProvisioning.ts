'use client';

import { supabase } from '@/lib/supabaseClient';
import { isProductAvailableForEvent } from '@/lib/eventAuth';
import { VIEWER_FLAGS, MANAGER_FLAGS, PLANNER_MODULES, type PlannerPermissionFlags } from '@/lib/plannerPermissionPresets';

/**
 * Feature 016 (Event Team Foundation Fix) — the single, shared provisioning
 * service every "add a person to an event" entry point routes through: the
 * Event Team page's Add People menu (From organisation / From team / Invite
 * new / Add all / CSV) and the Organisation People page's per-row event
 * assignment. Replaces the previously-divergent hardcoded-attendee paths
 * (handleAddAllOrgMembers/handleAssignTeam/EventAssignmentsDropdown all wrote
 * `role: 'attendee'` directly and never checked Planner sync responses).
 *
 * Event Role and Product Access are deliberately independent here, matching
 * the locked product decision: adding someone to the Event Team always
 * writes an `event_members` row (Event Role is a required field of that
 * row — there is no way to represent "product access with no event role" in
 * the current schema, and none is invented here). Bendie/Planner access are
 * then separate, optional steps layered on top of that same row, each
 * awaited and independently reported — never silently assumed to have
 * succeeded (the audited "fire-and-forget, never checks the response"
 * failure class this pass fixes).
 */

export const EVENT_MEMBER_ROLES = ['host', 'organizer', 'admin', 'facilitator', 'staff', 'attendee', 'speaker'] as const;
export type EventMemberRole = (typeof EVENT_MEMBER_ROLES)[number];

export type PlannerAccessChoice = 'none' | 'viewer' | 'manager' | 'custom';

export type EventAccessConfig = {
  eventRole: EventMemberRole;
  grantBendie: boolean;
  plannerAccess: PlannerAccessChoice;
  /** Only read when plannerAccess === 'custom'. */
  customPlannerFlags?: PlannerPermissionFlags;
};

export const DEFAULT_ACCESS_CONFIG: EventAccessConfig = {
  eventRole: 'attendee',
  grantBendie: true,
  plannerAccess: 'none',
};

export type PersonOutcome = {
  userId: string;
  label: string;
  eventMembership: 'added' | 'already_member' | 'failed';
  eventMembershipError?: string;
  currentEventPointer: 'ok' | 'failed' | 'skipped';
  bendieAccess: 'sent' | 'skipped' | 'failed';
  bendieAccessError?: string;
  plannerAccess: 'granted' | 'skipped' | 'failed' | 'denied';
  plannerAccessError?: string;
};

function outcomeSucceeded(o: PersonOutcome): boolean {
  return (
    o.eventMembership !== 'failed' &&
    o.bendieAccess !== 'failed' &&
    o.plannerAccess !== 'failed' &&
    o.plannerAccess !== 'denied'
  );
}

export function summarizeOutcomes(outcomes: PersonOutcome[]): {
  fullySucceeded: number;
  partial: number;
  failed: number;
} {
  let fullySucceeded = 0,
    partial = 0,
    failed = 0;
  for (const o of outcomes) {
    if (o.eventMembership === 'failed') {
      failed++;
    } else if (outcomeSucceeded(o)) {
      fullySucceeded++;
    } else {
      partial++;
    }
  }
  return { fullySucceeded, partial, failed };
}

/** A short, human sentence describing what happened to one person — used for toasts and per-row result lists. */
export function describeOutcome(o: PersonOutcome): string {
  if (o.eventMembership === 'failed') return `${o.label}: could not be added — ${o.eventMembershipError ?? 'unknown error'}`;
  const parts: string[] = [o.eventMembership === 'already_member' ? `${o.label} was already on this event` : `${o.label} added to the event`];
  if (o.bendieAccess === 'failed') parts.push(`Bendie access code could not be sent (${o.bendieAccessError ?? 'unknown error'})`);
  if (o.plannerAccess === 'denied') parts.push('Planner access could not be granted — you do not have permission to administer Planner access for this event');
  else if (o.plannerAccess === 'failed') parts.push(`Planner access could not be enabled (${o.plannerAccessError ?? 'unknown error'})`);
  return parts.join(', but ');
}

/** Event's organisation + which products are actually available, so the UI never offers a toggle for a product the event doesn't have. */
export async function resolveEventProductContext(
  eventId: string
): Promise<{ organizationId: string; bendieAvailable: boolean; plannerAvailable: boolean } | null> {
  const { data: event, error } = await supabase.from('events').select('organization_id').eq('id', eventId).maybeSingle();
  if (error || !event) return null;
  const [bendieAvailable, plannerAvailable] = await Promise.all([
    isProductAvailableForEvent(eventId, event.organization_id, 'bendie'),
    isProductAvailableForEvent(eventId, event.organization_id, 'planner'),
  ]);
  return { organizationId: event.organization_id, bendieAvailable, plannerAvailable };
}

/** Feature 008's own authority boundary (org owner/admin or platform admin) — reused via its existing dedicated route, never re-derived. */
export async function checkCanAdministerPlanner(eventId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/events/${eventId}/planner-permissions/can-administer`);
    if (!res.ok) return false;
    const body = await res.json();
    return !!body.ok && body.canAdminister === true;
  } catch {
    return false;
  }
}

/**
 * Resolves an existing Portal identity by email, or creates a brand-new one
 * via the existing (deliberately platform-admin-only) /api/admin/create-user
 * route — never a second account-provisioning implementation. Ensures an
 * `organization_members` row exists either way (role 'member' at the org
 * tier, matching every existing provisioning path's convention — the event
 * role is configured separately).
 */
export async function resolveOrCreatePersonByEmail(
  email: string,
  fullName: string,
  organizationId: string
): Promise<{ userId: string; created: boolean } | { error: string }> {
  const normalized = email.trim().toLowerCase();
  const { data: existing } = await supabase.from('profiles').select('id').ilike('email', normalized).maybeSingle();

  if (existing?.id) {
    const { error: orgError } = await supabase
      .from('organization_members')
      .insert({ organization_id: organizationId, user_id: existing.id, role: 'member' });
    if (orgError && orgError.code !== '23505') return { error: orgError.message };
    return { userId: existing.id, created: false };
  }

  try {
    const res = await fetch('/api/admin/create-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalized, fullName, organizationId, orgRole: 'member' }),
    });
    const body = await res.json();
    if (!res.ok) return { error: body.error ?? 'Failed to create account' };
    return { userId: body.id as string, created: true };
  } catch {
    return { error: 'Failed to create account' };
  }
}

/**
 * Points this person's "which event am I in" state at this event, so the
 * mobile app can resolve them without a separate manual join step. Preserved
 * verbatim from the pre-existing members/page.tsx implementation (Feature
 * 003+ recurring-gap fix) — only backfills current_organization_id if unset.
 */
async function pointCurrentEventAt(userId: string, eventId: string, organizationId: string): Promise<'ok' | 'failed'> {
  const { data: profile, error: selectError } = await supabase.from('profiles').select('current_organization_id').eq('id', userId).maybeSingle();
  if (selectError) return 'failed';
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ current_event_id: eventId, current_organization_id: profile?.current_organization_id ?? organizationId })
    .eq('id', userId);
  return updateError ? 'failed' : 'ok';
}

async function issueBendieAccessCode(eventId: string, userId: string, email: string, eventName: string): Promise<'sent' | 'failed'> {
  const { data, error } = await supabase.rpc('issue_event_access_code', { p_event_id: eventId, p_user_id: userId });
  const result = (Array.isArray(data) ? data[0] : data) as { access_code: string; expires_at: string } | undefined;
  if (error || !result) return 'failed';
  const { error: fnError } = await supabase.functions.invoke('send-event-access-code-email', {
    body: { email, eventName, accessCode: result.access_code, expiresAt: result.expires_at },
  });
  return fnError ? 'failed' : 'sent';
}

function flagsToModulePatch(flags: PlannerPermissionFlags): Record<string, { view: boolean; manage?: boolean }> {
  const modules: Record<string, { view: boolean; manage?: boolean }> = {};
  for (const m of PLANNER_MODULES) {
    modules[m.key] = m.manage ? { view: flags[m.view], manage: flags[m.manage] } : { view: flags[m.view] };
  }
  return modules;
}

/**
 * Grants Planner access via Feature 008's own Enable + Save routes — never a
 * second Planner-permissions implementation. Both calls independently
 * re-verify `canAdministerPlannerPermissions` server-side (see
 * planner-permissions/enable/route.ts), so a caller who cannot administer
 * Planner access gets a real 403 here even if the UI incorrectly let them
 * choose this option — that 403 is surfaced as 'denied', never swallowed.
 * Always follows Enable with an explicit Save of the exact chosen
 * preset/custom flags, because Enable's own first-time defaults are derived
 * from the person's Portal event ROLE (defaultFlagsForPortalRole), which
 * will not necessarily match a Manager/Custom choice made independently of
 * that role in this flow.
 */
async function grantPlannerAccess(
  eventId: string,
  userId: string,
  choice: Exclude<PlannerAccessChoice, 'none'>,
  customFlags: PlannerPermissionFlags | undefined
): Promise<{ status: 'granted' | 'failed' | 'denied'; error?: string }> {
  const operationId = crypto.randomUUID();
  const enableRes = await fetch(`/api/events/${eventId}/members/${userId}/planner-permissions/enable`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operationId }),
  });
  if (enableRes.status === 403) return { status: 'denied' };
  if (!enableRes.ok) {
    const body = await enableRes.json().catch(() => ({}));
    return { status: 'failed', error: body.message ?? `Enable failed (HTTP ${enableRes.status})` };
  }
  const enableBody = await enableRes.json();
  if (enableBody.status && enableBody.status !== 'ready' && !enableBody.state) {
    return { status: 'failed', error: 'Bendie Planner is not yet available for this event' };
  }

  const flags = choice === 'viewer' ? VIEWER_FLAGS : choice === 'manager' ? MANAGER_FLAGS : (customFlags ?? VIEWER_FLAGS);
  const saveRes = await fetch(`/api/events/${eventId}/members/${userId}/planner-permissions`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ operationId: crypto.randomUUID(), modules: flagsToModulePatch(flags) }),
  });
  if (saveRes.status === 403) return { status: 'denied' };
  if (!saveRes.ok) {
    const body = await saveRes.json().catch(() => ({}));
    return { status: 'failed', error: body.message ?? `Save failed (HTTP ${saveRes.status})` };
  }
  return { status: 'granted' };
}

/**
 * Adds one person to the Event Team and applies their configured product
 * access. Every step after the event_members insert is awaited and its
 * result checked — no step assumes success. If the person is already an
 * event member, the existing role is left untouched (this call layers
 * product access on top rather than silently overwriting a role someone
 * else may have deliberately set), but Bendie/Planner access are still
 * applied since those are independent of role.
 */
export async function addPersonToEvent(
  eventId: string,
  eventName: string,
  organizationId: string,
  person: { userId: string; email: string | null; label: string },
  config: EventAccessConfig
): Promise<PersonOutcome> {
  const outcome: PersonOutcome = {
    userId: person.userId,
    label: person.label,
    eventMembership: 'failed',
    currentEventPointer: 'skipped',
    bendieAccess: 'skipped',
    plannerAccess: 'skipped',
  };

  const { error: insertError } = await supabase
    .from('event_members')
    .insert({ event_id: eventId, user_id: person.userId, organization_id: organizationId, role: config.eventRole });

  if (insertError && insertError.code !== '23505') {
    outcome.eventMembershipError = insertError.message;
    return outcome;
  }
  outcome.eventMembership = insertError?.code === '23505' ? 'already_member' : 'added';

  outcome.currentEventPointer = await pointCurrentEventAt(person.userId, eventId, organizationId);

  if (config.grantBendie) {
    if (!person.email) {
      outcome.bendieAccess = 'failed';
      outcome.bendieAccessError = 'No email on file';
    } else {
      outcome.bendieAccess = await issueBendieAccessCode(eventId, person.userId, person.email, eventName);
      if (outcome.bendieAccess === 'failed') outcome.bendieAccessError = 'Could not generate or send the access code';
    }
  }

  if (config.plannerAccess !== 'none') {
    const result = await grantPlannerAccess(eventId, person.userId, config.plannerAccess, config.customPlannerFlags);
    outcome.plannerAccess = result.status;
    if (result.error) outcome.plannerAccessError = result.error;
  }

  return outcome;
}

/** Batch version — bounded concurrency, per-person outcomes, never lets one failure abort the rest. */
export async function addPeopleToEvent(
  eventId: string,
  eventName: string,
  organizationId: string,
  people: { userId: string; email: string | null; label: string }[],
  config: EventAccessConfig,
  concurrency = 5
): Promise<PersonOutcome[]> {
  const results: PersonOutcome[] = new Array(people.length);
  let cursor = 0;
  async function runNext(): Promise<void> {
    const index = cursor++;
    if (index >= people.length) return;
    results[index] = await addPersonToEvent(eventId, eventName, organizationId, people[index], config);
    await runNext();
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, people.length) }, () => runNext()));
  return results;
}

export type PersonSummary = { userId: string; fullName: string | null; email: string | null; avatarUrl: string | null };

/** Organisation members not yet on this event, for the "From organisation" picker. */
export async function listOrganizationCandidates(organizationId: string, existingEventMemberIds: Set<string>): Promise<PersonSummary[]> {
  const { data } = await supabase
    .from('organization_members')
    .select('user_id, profiles:user_id(full_name, email, avatar_url)')
    .eq('organization_id', organizationId);
  type Raw = { user_id: string; profiles: { full_name: string | null; email: string | null; avatar_url: string | null } | null };
  return ((data as unknown as Raw[]) ?? [])
    .filter((r) => !existingEventMemberIds.has(r.user_id))
    .map((r) => ({ userId: r.user_id, fullName: r.profiles?.full_name ?? null, email: r.profiles?.email ?? null, avatarUrl: r.profiles?.avatar_url ?? null }));
}

export type TeamPreview = {
  teamId: string;
  teamName: string;
  totalMembers: number;
  alreadyInEvent: number;
  candidates: PersonSummary[];
};

/** Preview of who a team would actually add — never blindly inserts the whole team (per the locked product decision). */
export async function previewTeamForEvent(teamId: string, teamName: string, existingEventMemberIds: Set<string>): Promise<TeamPreview> {
  const { data } = await supabase.from('team_members').select('user_id, profiles:user_id(full_name, email, avatar_url)').eq('team_id', teamId);
  type Raw = { user_id: string; profiles: { full_name: string | null; email: string | null; avatar_url: string | null } | null };
  const rows = (data as unknown as Raw[]) ?? [];
  const candidates = rows
    .filter((r) => !existingEventMemberIds.has(r.user_id))
    .map((r) => ({ userId: r.user_id, fullName: r.profiles?.full_name ?? null, email: r.profiles?.email ?? null, avatarUrl: r.profiles?.avatar_url ?? null }));
  return { teamId, teamName, totalMembers: rows.length, alreadyInEvent: rows.length - candidates.length, candidates };
}

export type AddAllPreview = { totalOrgPeople: number; alreadyInEvent: number; candidates: PersonSummary[] };

/** Preview for "Add all organisation people" — counts + the exact candidate list to confirm before the bulk action (per the locked product decision: never silently added without the manager seeing the numbers first). */
export async function previewAddAllOrgPeople(organizationId: string, existingEventMemberIds: Set<string>): Promise<AddAllPreview> {
  const candidates = await listOrganizationCandidates(organizationId, existingEventMemberIds);
  const { count } = await supabase.from('organization_members').select('user_id', { count: 'exact', head: true }).eq('organization_id', organizationId);
  const totalOrgPeople = count ?? candidates.length + existingEventMemberIds.size;
  return { totalOrgPeople, alreadyInEvent: totalOrgPeople - candidates.length, candidates };
}
