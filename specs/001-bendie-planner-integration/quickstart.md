# Quickstart: Validating Bendie Planner Integration

A runnable, end-to-end validation guide. Each section maps to a user story/acceptance scenario in
`spec.md` and a success criterion (`SC-00N`). Run through all of it once before calling the
feature done — see `plan.md`'s Verification Plan for the full list this guide is derived from.

## Prerequisites

- Both Supabase MCP connections (`supabase` for Portal, `supabase-planner` for Planner)
  authorized and reachable, per `research.md`'s live-schema checks.
- A Portal test event with no existing Planner link.
- A Planner test event, not currently linked to any Portal event, with at least one seeded flight
  record and one seeded hotel/accommodation record whose traveler email matches a person you'll
  provision as a Portal test event member.
- One test person's email you can provision with a staff-tier role (e.g. `facilitator`), and a
  second test person's email you can provision with the `attendee` role, for the negative case.
- A signed-in Portal session with global-admin access, and (for the negative security check) a
  second signed-in session without it.

## 1. Event linking (User Story 1 → SC-001, SC-006)

1. Open the test Portal event's Bendie Planner control area. **Expect**: it clearly shows "not
   linked."
2. Search/browse the available Planner events list. **Expect**: the test Planner event appears,
   with no organization-scoping step required first.
3. Select it and confirm the link. **Expect**: the control area now shows the linked Planner
   event's identity and an active status — visible without leaving this screen (SC-001).
4. From a second Portal event, attempt to link to the *same* Planner event already linked in step
   3. **Expect**: rejected; the first event's link is unchanged (SC-006).
5. Unlink the test event. **Expect**: it returns to "not linked," and member/agenda/travel actions
   are no longer available for it.
6. Re-link it to the same Planner event for the remaining steps below.

## 2. Member sync (User Story 2 → SC-002, SC-007)

1. Provision the staff-tier test person (e.g. as `facilitator`) on the linked test event, using
   each of the four existing provisioning entry points in turn across repeated test runs: single
   add, CSV import, "Add All Organisation Members," "Assign a Team." **Expect** each time: the
   Portal-side provisioning action reports success, and a Planner-sync status (succeeded, failed,
   or skipped) is visible for that person (SC-002, SC-007).
2. Provision the attendee-role test person the same way. **Expect**: no Planner-sync status ever
   appears for this person — they're excluded entirely (SC-002).
3. Repeat step 1 on a Portal event with **no** active Planner link. **Expect**: provisioning
   behaves exactly as it does today, with no sync status shown at all (consistent with FR-014).
4. (Optional, if simulable) Force the Planner-side sync to fail for one provisioning attempt.
   **Expect**: the Portal provisioning action still reports success; only the sync status shows
   the failure (SC-007).

## 3. Agenda push (User Story 3 → SC-003)

1. With at least one agenda session on the linked test event, trigger the agenda push action.
   **Expect**: a success outcome, and the corresponding Planner event's schedule reflects the
   pushed content.
2. Edit the Portal agenda session's title, then push again. **Expect**: the Planner-side item
   updates in place — the total number of synchronized items does not increase (SC-003).
3. Delete the Portal agenda session entirely, then push again. **Expect**: the now-orphaned
   Planner-side item is left alone, not deleted (FR-017).
4. Trigger a push on an unlinked event. **Expect**: the action is unavailable or rejected.

## 4. Travel pull (User Story 4 → SC-004, SC-005)

1. Trigger the travel pull action on the linked test event. **Expect**: the seeded flight and
   hotel records for the matched traveler appear in Portal, marked as Planner-sourced.
2. Attempt to edit one of those pulled records directly in the Portal's travel-editing interface.
   **Expect**: the edit is rejected (SC-005).
3. Add a manually created travel record for a different attendee, then pull again. **Expect**: the
   manual record is untouched and remains editable (FR-025).
4. Change the seeded flight's details on the Planner side, then pull again. **Expect**: the
   Portal-side record updates to match — the traveler's record count does not increase (SC-004).
5. Seed one more Planner flight record for a traveler whose email does **not** match any member of
   the linked Portal event, then pull again. **Expect**: that record is skipped, and the pull
   result reports it as unmatched rather than silently dropping it or attaching it to the wrong
   person (FR-022).

## 5. Security (SC-008)

1. Using a Portal session without admin access, attempt to reach the Bendie Planner control area
   and, separately, attempt to call each of the five underlying actions directly (not just
   through the hidden UI). **Expect**: every attempt is rejected with an authorization error —
   none succeed (SC-008).
2. Confirm (by inspecting network responses, not just the UI) that no response from any of these
   actions ever contains a credential, key, or raw secret value.

## Done

All scenarios above passing is the exit criterion for this feature per the constitution's
Verification and Quality principle — combined with the repository's existing lint/type-check/build
commands passing, and `/review` having reported on the implementation.
