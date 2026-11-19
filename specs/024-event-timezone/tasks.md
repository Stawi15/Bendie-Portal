---
description: "Task list for Feature 024 — Event Time Zone"
---

# Tasks: Event Time Zone

**Input**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [quickstart.md](quickstart.md)

**Tests**: included for the pure time zone helpers (plan step 1).

## Phase 1: Setup

- [X] T001 Confirm the live facts in research R9 before merge: the `events.timezone` column, its `authenticated` grant, `events_timezone_valid`, and Planner's `events.timezone` default. **The developer runs the SQL**; record the result in the Verification note. Implementation may proceed first, but the branch must not be merged until this passes.

## Phase 2: Foundational

- [X] T002 [P] Create `src/lib/eventTimeZone.ts` per research R2 (pure, `Intl` only):
  - `listTimeZones()` (supported values plus `UTC`, else a fallback list);
  - `detectTimeZone()`;
  - `isListedTimeZone()`;
  - `utcOffsetLabel(tz, at?)`;
  - `zonedLocalToUtcIso(local, tz)` (accepts `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm`; DST-safe two-pass offset);
  - `utcIsoToZonedLocal(iso, tz)`;
  - `zonedDateOf(iso, tz)`;
  - `isTimeZoneConstraintError(error)`, which detects `23514` / `events_timezone_valid` (R8).
- [X] T003 [P] Create `src/lib/eventTimeZone.test.ts` covering:
  - Nairobi round trip;
  - London and New York on both DST change-over days;
  - date-only input giving the start of day;
  - `zonedDateOf` near midnight;
  - invalid zone names;
  - `utcOffsetLabel`;
  - the constraint-error detection.

  Run under `TZ=UTC` and `TZ=America/Los_Angeles`.
- [X] T004 Add `timezone: string | null` to `events` Row (and `timezone?: string | null` to Insert/Update) in `src/types/database.ts`. Append `timezone` to `EVENTS_SELECT_COLUMNS` in `src/lib/eventColumns.ts`, and update its comment to note the column's authenticated-only grant (research R9).

## Phase 3: User Story 1 — Time zone on create (P1) 🎯 MVP

- [X] T005 [US1] `src/app/api/events/create/route.ts`:
  - accept `timeZone` and validate it with `Intl` (400 `invalid_request` if bad);
  - convert date-only `startsAt`/`endsAt` to the start of those days in the zone with `zonedLocalToUtcIso` before the RPC, passing other values through unchanged;
  - add `timezone` to the post-RPC caller `events` update (with `portal_setup_modules` when present, otherwise on its own), so it runs **before** `provisionPlannerEvent`;
  - return `timeZoneSaved` (false on a write error or zero rows), logging the error.
- [X] T006 [US1] `src/components/portal/CreateEventModal.tsx`:
  - add `timezone` to `form` and `EMPTY_FORM`, defaulting to `detectTimeZone()` (and to restored drafts that lack it);
  - add the picker to the basics step: label "Time zone *", `input list=` plus `<datalist>` of `listTimeZones()` with `utcOffsetLabel` labels, and a hint "Used for event dates and attendee reminders";
  - validate it with `isListedTimeZone` ("Choose a time zone from the list"), at the same point as the name check;
  - send `timeZone`;
  - when the response has `timeZoneSaved === false`, show a toast: "Event created, but its time zone wasn't saved. Set it on the event's Basics page."
- [X] T007 [US1] `src/lib/plannerEventProvisioning.ts`:
  - select `timezone` with the event;
  - when it's set, compute `start_date`/`end_date` with `zonedDateOf`; otherwise keep the current `slice(0, 10)`;
  - include `timezone` in the Planner insert when set;
  - if that insert errors and a timezone was sent, retry once without it and `console.warn` the fallback (FR-010).

## Phase 4: User Story 2 — Basics page (P1)

- [X] T008 [US2] `src/app/portal/events/[eventId]/basics/page.tsx`:
  - **Load and display:** load `timezone` into the form, and keep the loaded ISO `starts_at`/`ends_at`. Display them with `utcIsoToZonedLocal(iso, tz || browser)` in place of `toLocalDatetime`.
  - **Picker:** the same picker as create, beside the dates, labelled "Time zone". A label next to Start and End reads "in <zone>" (or "in your computer's time zone" when empty).
  - **Changing the zone:** re-render untouched dates from their stored ISO in the new zone (FR-008), and show a hint "Check the start and end times after changing the time zone".
  - **Saving:** convert edited dates with `zonedLocalToUtcIso(local, tz || browser)`. Save `timezone` (empty → `null`) after validating with `isListedTimeZone`.
  - **Notices:** when the zone is empty, show the token-styled notice (FR-005). When `planner_provisioning_status` isn't null, add the Planner hint (FR-011).
  - **Errors:** map `isTimeZoneConstraintError` to "That time zone isn't recognised. Choose another from the list."

## Phase 5: User Story 3 — Agenda days and feedback hint (P2)

- [X] T009 [P] [US3] In `src/lib/plannerAgenda.ts` `readPortalEventStartDate`, select `starts_at, timezone` and use `timezone` when it's a valid zone, otherwise the passed fallback (FR-012). Update its doc comment.
- [X] T010 [P] [US3] In `src/app/portal/events/[eventId]/terminology/page.tsx`, change the Feedback Form URL hint to: "Survey link shown to attendees after the event. When set, attendees also get a “share your feedback” push at 18:00 on the event's last day." (FR-013)

## Phase 6: Polish

- [X] T011 Run `npx tsc --noEmit`, `npm run lint`, `npm test` (also `TZ=America/Los_Angeles`), and the placeholder-env `npm run build`.
- [X] T012 Update the docs:
  - `context/schema-reference.md` changelog: `events.timezone` is now Portal-managed, plus the venue-time rule;
  - `context/architecture.md`: the venue-time rule under Data Flow;
  - `context/progress-tracker.md`: a Feature 024 entry.
- [ ] T013 Browser-verify [quickstart.md](quickstart.md) on a test event (developer).
- [ ] T014 Run `/review`, then `/speckit.converge`, then `/remember save`.

## Dependencies

- T002 comes before T005–T009.
- T004 comes before T006 and T008.
- T005 comes before T006 (response shape).
- T001 gates the merge, not the coding.
- T009 and T010 are independent.

## Verification note

**2026-11-17 (implementation)**

- **Checks:** `npx tsc --noEmit` exit 0; `npm run lint` exit 0; `npm test` 60/60 pass (10 new) under UTC, America/Los_Angeles and Africa/Nairobi, including both DST change-overs; the placeholder-env `npm run build` exit 0.
- **Shared component:** a `TimeZoneField` (`src/components/portal/TimeZoneField.tsx`) is used by both create and basics, rather than duplicating the picker.
- **Fixed during my own pre-review pass:**
  - (a) `planner_provisioning_status` defaults to `'not_required'`, not NULL, so the Planner hint now checks for that value.
  - (b) A rejected zone no longer also loses the module choices on create: the modules are retried alone.
  - (c) A stored zone missing from the browser's list (an alias) is shown and saved, not rejected.
  - (d) `isValidTimeZone` rejects raw offsets (`+03:00`), which Node 26 `Intl` accepts.
  - (e) The provisioning retry happens only when Planner's error names the time zone.
- **Still open:**
  - **T001:** run the live grant and constraint SQL. Required before merge.
  - **T013:** the browser pass (developer).
  - **T014:** `/review`, converge and remember.

- **T001, live verification: PASS (2026-11-17, via the Supabase MCP, read-only):**
  - **Bendie `droaamagpsojkzznywgd`:**
    - `events.timezone` is nullable `text`, granted `SELECT, INSERT, UPDATE, REFERENCES` to `authenticated`;
    - `anon` has only `REFERENCES`, so no read, which is correct;
    - `events_timezone_valid` = `CHECK (timezone IS NULL OR is_valid_timezone(timezone))`, where `is_valid_timezone` tests `AT TIME ZONE`.
  - **Planner `zghoaawgrmvqdlksuiam`:** `events.timezone` is `text NOT NULL DEFAULT 'Africa/Nairobi'`. Trigger `trg_validate_event_timezone` checks `pg_timezone_names` and raises "Unknown timezone …", which the provisioning retry regex `/time ?zone/i` matches.
  - **Picker vs Planner:** of the 419 picker zones, only `America/Coyhaique` (added 2025) is missing from Planner's `pg_timezone_names`. It's covered by the FR-010 fallback.
  - **Data:** 32 events, of which 2 have a zone and 30 live events have none, so they'll show the "reminders are off" notice.

## Review (2026-11-19)

`/review` found 1 minor issue, now fixed: while a time zone name was half-typed on Basics, the Start/End labels said "your computer’s time zone" although the times were still in the previous zone. They now always name the zone the times are written in. Converge remains to be run after the browser pass.
