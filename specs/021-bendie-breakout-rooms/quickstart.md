# Quickstart: validating Bendie Breakout Rooms (Feature 021)

Validation guide only. Formats: [contracts/csv-formats.md](contracts/csv-formats.md); functions: [contracts/database-functions.md](contracts/database-functions.md); tables: [data-model.md](data-model.md).

## Prerequisites

- Feature 020 committed (done: `3aca993`).
- A test event with Bendie active, at least 2 Speakers and 5 attendee accounts you can sign in as.
- Accounts for: a platform admin; an owner/admin of the test event's organisation who is not a platform admin; an owner/admin of a *different* organisation; an event host/organizer who is not an organisation admin.
- Remember: the database is shared with the live attendee app. Run the pre-flight before applying the migration.

## 1. Pre-flight and migration (R14)

1. Save a snapshot of `id, breakout_rooms` for every `agenda_sessions` row where `breakout_rooms` is a non-empty array (3 rows today).
2. Apply `supabase/migrations/bendie_breakout_rooms_and_assignments.sql`.
3. Expect: 5 rooms in `agenda_breakout_rooms` (3 with `legacy_key`), their blocks in `agenda_breakout_room_items`, `breakout_mode = 'attendee_choice'` everywhere.
4. Compare the rebuilt `breakout_rooms` with the snapshot: same room ids (legacy ids preserved), names, descriptions, facilitator names, block ids/titles/descriptions/locations and instants.
5. Re-run the migration's backfill section: nothing changes (idempotent).
6. Supabase advisors (security): no new warnings for the new tables/functions.

## 2. Room editor (User Story 1)

1. As platform admin, open the existing breakout on "Stawi Escape" → rooms and mini-agendas unchanged.
2. Create a session "Afternoon Breakouts" with Room A (facilitator from Speakers, capacity 2, two blocks), Room B (no capacity), Room C. Save; reopen → identical.
3. Rename Room A → reopen: same room (id unchanged in `agenda_breakout_rooms`).
4. In the currently released attendee app, open the session → rooms, descriptions, facilitator names, mini-agendas match the Portal.
5. Events without breakouts: create/edit a normal session → behaves as before; `breakout_rooms` stays null.
6. Organisation admin (FR-033): as the test organisation's owner/admin, create, edit (including rooms and mode) and delete a session → all succeed. Upload the agenda CSV → rows save.
7. As another organisation's admin → that event's sessions and rooms can't be changed (refused by row-level security). As an event host/organizer who isn't an org admin → no session edit controls are shown (FR-034), and a direct save is still refused; "Manage people", both breakout uploads and the download are shown and work. As a member who is neither (e.g. staff) → the agenda is read-only, with no breakout controls.

## 3. Assignments view (User Story 2)

1. As the event host/organizer, open "Manage people" on Afternoon Breakouts → 3 rooms, headcounts `0 / 2`, `0`, `0`, all attendees unassigned.
2. Assign 3 attendees to Room A → `3 / 2` shown as over capacity; unassigned list shrinks.
3. Move one to Room B; unassign one → lists and counts update immediately; source shows "Organiser" and time.
4. Delete Room B in the editor → warning names 1 attendee; confirm → that attendee is unassigned.
5. Loading, error (e.g. offline) and empty states (no attendees / no rooms) render with the standard patterns.

## 4. Agenda spreadsheet and people list (User Story 3)

1. Download the agenda template. It shows a regular session and a breakout with two rooms. Adapt it to the test event and upload. Expect one regular session per regular row, and one breakout session with its rooms, capacities and facilitators.
2. Upload the same file again. Nothing should be duplicated; the results say "Updated the existing session".
3. Mixed rows (same title and start, one row without `breakout_room`), a room listed twice, and an unknown room facilitator should each show as errors in the preview.
4. Manage people → Download list: every attendee, with rooms. Upload it unchanged; nothing should change.
5. Edit the list: two people moved, one unknown email, one room not in this session, one person listed twice, one blank room, one room pushed over capacity. Check the preview errors and the warning, then confirm the moves (source "CSV upload") and the removal.
6. Time a 300-row people list upload: under 3 minutes (SC-003).

## 5. Attendee choice rules (User Story 4)

Call `choose_breakout_room` signed in as attendees (SQL editor with a JWT, or a small script with the anon key + attendee sign-in):

1. Attendee picks Room C → `ok`; switch to Room B → `ok`, Room C count drops.
2. Room A at capacity → `room_full`, existing assignment unchanged.
3. Set mode `organizer_assigns` → `organizer_assigns`; set `preassigned_switchable`, organiser-assign then attendee switch → `ok`, source becomes attendee.
4. Non-attendee member (e.g. staff) → `not_attendee`.
5. Race: Room capacity 5 with 0 assigned, 20 parallel picks from 20 attendees → exactly 5 `ok`, 15 `room_full` (SC-005).
6. `get_breakout_room_availability` as an attendee → counts only; as a non-member → no rows. Attendee selecting from `agenda_breakout_assignments` sees only their own row.

## 6. Unchanged behaviour (FR-030, SC-008)

1. On an event linked to Planner with Bendie active, press "Push to Planner" → the breakout session pushes as one item, as before.
2. On a Bendie-only event the Bendie Planner page shows no push button (unchanged).
3. `npm run lint`, `npm run type-check`, `npm run build` pass.

## 7. Release 2 (attendee app, later)

Follow [contracts/attendee-app-release-2.md](contracts/attendee-app-release-2.md); acceptance = spec User Story 5 and SC-007.
