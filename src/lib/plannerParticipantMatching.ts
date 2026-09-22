'use client';

/**
 * Feature 016 (Attendee/Participant Journey Clarification) — the one shared
 * "find-or-create a Planner Participant" client-side helper, reused by every
 * entry point that offers to add an existing Portal person (Bendie attendee
 * or organisation person) as a Planner Participant without retyping them:
 * the "From Bendie Attendees" / "From Organisation" picker flows, and (via a
 * small refactor) Feature 015's existing CSV importer, which already
 * implemented this exact email-match-then-link-else-create rule inline.
 *
 * Reuses Feature 011's existing routes only (`/planner-people/search`,
 * `/planner-people/link`, `/planner-people`) — no new API route, no second
 * Planner People implementation, per the explicit instruction to treat
 * Feature 011 as authoritative.
 *
 * Matching rule (per the locked "safe matching" decision): an EXACT,
 * case-insensitive email match against Planner's global `passengers` table
 * is used to link to an existing participant record — never a fuzzy
 * name-only match, and never a silent merge. This exact-email rule already
 * has two precedents in this codebase: Feature 001's travel-pull route
 * (matches Planner passengers to Portal event_members by exact lowercased
 * email) and Feature 015's CSV importer for Planner People (identical
 * exact-email-then-link-else-create rule). No email at all, or no exact
 * match found, always falls through to creating a brand-new participant
 * record seeded with the given name/email — still an explicit,
 * user-initiated action, never an automatic guess.
 */

export type ParticipantMatchInput = {
  fullName: string;
  email?: string | null;
  title?: string | null;
  phone?: string | null;
};

export type ParticipantMatchOutcome =
  | { status: 'already_participant'; label: string }
  | { status: 'linked'; label: string }
  | { status: 'created'; label: string }
  | { status: 'failed'; label: string; error: string };

/**
 * `existingParticipantEmails` should be the current event's already-linked
 * participant emails (lowercased) — callers check this first so a person
 * already tracked as a Planner Participant is reported as such rather than
 * silently re-processed (per the "do not create another record" rule).
 */
export async function matchOrCreateParticipant(
  eventId: string,
  input: ParticipantMatchInput,
  existingParticipantEmails: Set<string>
): Promise<ParticipantMatchOutcome> {
  const label = input.fullName || input.email || 'Unknown person';
  const email = input.email?.trim().toLowerCase() || null;

  if (email && existingParticipantEmails.has(email)) {
    return { status: 'already_participant', label };
  }

  if (email) {
    try {
      const searchRes = await fetch(`/api/events/${eventId}/planner-people/search?q=${encodeURIComponent(email)}`);
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const exactMatch = (searchData.results ?? []).find(
          (r: { passengerId: number; email: string | null }) => r.email?.trim().toLowerCase() === email
        );
        if (exactMatch) {
          const linkRes = await fetch(`/api/events/${eventId}/planner-people/link`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passengerId: exactMatch.passengerId }),
          });
          if (linkRes.ok) return { status: 'linked', label };
          const body = await linkRes.json().catch(() => ({}));
          return { status: 'failed', label, error: body.message ?? 'Could not link this participant' };
        }
      }
    } catch {
      // Search failure is not fatal — fall through to create-new below,
      // exactly as Feature 015's CSV importer already does.
    }
  }

  try {
    const createRes = await fetch(`/api/events/${eventId}/planner-people`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: input.fullName,
        title: input.title || null,
        email: input.email || null,
        phone: input.phone || null,
      }),
    });
    if (createRes.ok) return { status: 'created', label };
    const body = await createRes.json().catch(() => ({}));
    return { status: 'failed', label, error: body.message ?? 'Could not create this participant' };
  } catch {
    return { status: 'failed', label, error: 'Could not create this participant' };
  }
}

export function describeParticipantMatchOutcome(o: ParticipantMatchOutcome): string {
  switch (o.status) {
    case 'already_participant':
      return `${o.label}: already a Planner participant`;
    case 'linked':
      return `${o.label}: added (matched an existing Planner record by email)`;
    case 'created':
      return `${o.label}: added as a new participant`;
    case 'failed':
      return `${o.label}: could not be added — ${o.error}`;
  }
}
