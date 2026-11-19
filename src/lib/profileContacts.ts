import type { SupabaseClient } from '@supabase/supabase-js';
import { runWithConcurrency } from '@/lib/concurrency';

/**
 * Feature 027 (C1 readiness): other people's email/phone can't be selected from
 * `profiles` with a signed-in user's key once Bendie applies C1. These helpers get
 * them the supported ways, all following Bendie's `can_view_profile_contact` rule.
 * Each returns an empty map (and logs) when the caller isn't allowed or a call
 * fails, so a list still renders names without contacts.
 */
export type ProfileContact = { email: string | null; phone: string | null };
export type ContactMap = Map<string, ProfileContact>;

/** Every member of one event: one call. Allowed for the event's hosts/organisers, org admins and Stawi admins. */
export async function eventMemberContacts(client: SupabaseClient, eventId: string): Promise<ContactMap> {
  const map: ContactMap = new Map();
  const { data, error } = await client.rpc('get_event_member_contacts', { p_event_id: eventId });
  if (error) {
    // 42501 = the caller may not see this event's contacts: expected for some viewers.
    if (error.code !== '42501') console.error('eventMemberContacts: get_event_member_contacts failed', error);
    return map;
  }
  for (const row of (data as Array<{ user_id: string; email: string | null; phone: string | null }>) ?? []) {
    map.set(row.user_id, { email: row.email ?? null, phone: row.phone ?? null });
  }
  return map;
}

/** A small set of arbitrary people (e.g. one page of activity actors): one call each, at most 6 at a time. */
export async function profileContacts(client: SupabaseClient, userIds: Iterable<string>): Promise<ContactMap> {
  const ids = [...new Set([...userIds].filter(Boolean))];
  const map: ContactMap = new Map();
  await runWithConcurrency(ids, 6, async (id) => {
    const { data, error } = await client.rpc('get_profile_contact', { p_profile_id: id });
    if (error) {
      console.error('profileContacts: get_profile_contact failed', error);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row) map.set(id, { email: row.email ?? null, phone: row.phone ?? null });
  }, (_id, _index, err) => console.error('profileContacts: get_profile_contact failed', err));
  return map;
}

export type OrganizationPeopleContacts = {
  contacts: ContactMap;
  /** Only for Stawi admins; null otherwise. */
  globalRoles: Map<string, string> | null;
};

/** Every member of one organisation, through the org-scoped server route (org owners/admins and Stawi admins). */
export async function organizationPeopleContacts(organizationId: string): Promise<OrganizationPeopleContacts> {
  const empty: OrganizationPeopleContacts = { contacts: new Map(), globalRoles: null };
  try {
    const res = await fetch(`/api/organizations/${organizationId}/people/contacts`);
    if (res.status === 403) return empty;
    if (!res.ok) {
      console.error('organizationPeopleContacts: request failed', res.status);
      return empty;
    }
    const body = (await res.json()) as {
      contacts?: Record<string, ProfileContact>;
      globalRoles?: Record<string, string> | null;
    };
    return {
      contacts: new Map(Object.entries(body.contacts ?? {})),
      globalRoles: body.globalRoles ? new Map(Object.entries(body.globalRoles)) : null,
    };
  } catch (err) {
    console.error('organizationPeopleContacts: request failed', err);
    return empty;
  }
}

/**
 * Activity lists show a person's email only as a fallback when they have no name.
 * Looks up just those people (Bendie's contact rule applies) and returns id → email.
 */
export async function emailsForUnnamed(
  client: SupabaseClient,
  people: Array<{ id: string | null | undefined; fullName: string | null | undefined }>
): Promise<Map<string, string>> {
  const ids = people.filter((p) => p.id && !p.fullName).map((p) => p.id as string);
  const emails = new Map<string, string>();
  if (ids.length === 0) return emails;
  for (const [id, contact] of await profileContacts(client, ids)) {
    if (contact.email) emails.set(id, contact.email);
  }
  return emails;
}
