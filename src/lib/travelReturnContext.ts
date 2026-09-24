/**
 * Feature 016 — Both-Product Travel Journey guidance. A tiny, deliberately
 * narrow "where did the user come from" flag for exactly one guided journey:
 * Bendie Attendee Travel → Bendie Planner (Logistics/Participants) → back to
 * Attendee Travel. This is NOT a general navigation-state framework — it is
 * per-event `sessionStorage` (not shared across viewers, never sent to the
 * server, cleared when the browser tab closes) holding one fixed enum value,
 * never an arbitrary redirect URL. The two pages that read it
 * (`planner-people`, `planner-logistics`) always navigate back to a
 * hardcoded, constructed path (`/portal/events/{eventId}/attendee-travel`) —
 * the flag only ever controls whether a banner renders, never where a link
 * points, so there is nothing here for an untrusted value to redirect to.
 *
 * sessionStorage (rather than a `?from=` query param) was chosen because the
 * guided journey can legitimately hop across multiple Planner pages/tabs
 * (Participants, Flights, Hotels, Ground Transport) via the ordinary tab bar,
 * which does not thread arbitrary query params between tabs — a query param
 * would silently drop the moment the user used a normal nav click instead of
 * one of this feature's own contextual links.
 */

const RETURN_CONTEXT_KEY = (eventId: string) => `bendie:travelReturnContext:${eventId}`;
const RETURNED_FLAG_KEY = (eventId: string) => `bendie:travelReturnedFromPlanner:${eventId}`;

/** Called when the user clicks "Set up in Bendie Planner" from Attendee Travel. */
export function markTravelJourneyStarted(eventId: string) {
  try {
    sessionStorage.setItem(RETURN_CONTEXT_KEY(eventId), 'attendee-travel');
  } catch {
    // Private browsing / storage disabled — the guidance banner simply won't
    // show on the Planner side. Non-critical: the feature degrades to "no
    // contextual return button," never to a broken page.
  }
}

/** Read by `planner-people`/`planner-logistics` to decide whether to render the "Return to Attendee Travel" banner. */
export function hasActiveTravelJourney(eventId: string): boolean {
  try {
    return sessionStorage.getItem(RETURN_CONTEXT_KEY(eventId)) === 'attendee-travel';
  } catch {
    return false;
  }
}

/** Called when the user clicks "Return to Attendee Travel" from the Planner side — ends the guided journey and arms the one-time "pull now?" prompt back on Attendee Travel. */
export function completeTravelJourney(eventId: string) {
  try {
    sessionStorage.removeItem(RETURN_CONTEXT_KEY(eventId));
    sessionStorage.setItem(RETURNED_FLAG_KEY(eventId), '1');
  } catch {
    // See markTravelJourneyStarted — degrades to no one-time prompt, nothing breaks.
  }
}

/** Read once by Attendee Travel on mount. Consuming (clearing) it immediately keeps the prompt genuinely one-time, per FR — never claims Planner setup is complete, only that the user asked to return from it. */
export function consumeTravelJourneyReturnFlag(eventId: string): boolean {
  try {
    const flagged = sessionStorage.getItem(RETURNED_FLAG_KEY(eventId)) === '1';
    if (flagged) sessionStorage.removeItem(RETURNED_FLAG_KEY(eventId));
    return flagged;
  } catch {
    return false;
  }
}
