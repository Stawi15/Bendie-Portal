---

description: "Task list for Feature 021 — Bendie Breakout Rooms"
---

# Tasks: Bendie Breakout Rooms

**Input**: specs/021-bendie-breakout-rooms/ (spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md)
**Tests**: none requested. Verification is manual and SQL checks (quickstart.md), plus type-check, lint and an isolated build.
**Database**: the shared Bendie Supabase project, which the live attendee app also uses. Apply migrations only through T009, after T001.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US5 from spec.md

---

## Phase 1: Setup

- [X] T001 Pre-flight (research R14). Read `id, event_id, breakout_rooms` for every `agenda_sessions` row where `jsonb_typeof(breakout_rooms) = 'array' AND jsonb_array_length(breakout_rooms) > 0` (3 rows on 2026-10-13). Save the result in the session scratchpad, **not** in the repo. Record the counts: 3 sessions, 5 rooms, 3 non-UUID room ids.

---

## Phase 2: Foundational (blocks all stories)

Everything in T002–T008 goes in **one new file**, `supabase/migrations/bendie_breakout_rooms_and_assignments.sql`, in this order. The file starts with a header comment explaining why it exists (Constitution III): Feature 021, durable rooms and assignments, the JSON kept derived for the released app, and org-admin session editing (FR-033).

- [X] T002 Migration part A: org admins and mode (research R1, data-model).
  - **Helper**: `public.is_event_org_admin(ev_id uuid) RETURNS boolean`, `LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public`, with **no `uid` parameter**. It returns whether `auth.uid()` is an owner/admin of `events.organization_id` for `ev_id`, by calling `public.is_organization_admin(org_id, auth.uid())`.
  - **Grants on the helper**: `REVOKE ALL ... FROM public, anon`; `GRANT EXECUTE ... TO authenticated`.
  - **Three new permissive policies on `agenda_sessions`**, each `event_id IS NOT NULL AND public.is_event_org_admin(event_id)`:
    - `agenda_sessions_insert_org_admin`: `FOR INSERT WITH CHECK`
    - `agenda_sessions_update_org_admin`: `FOR UPDATE USING` and `WITH CHECK`
    - `agenda_sessions_delete_org_admin`: `FOR DELETE USING`
  - **Existing policies are left untouched.**
  - **Mode column**: `ALTER TABLE agenda_sessions ADD COLUMN IF NOT EXISTS breakout_mode text NOT NULL DEFAULT 'attendee_choice'`, with CHECK `breakout_mode IN ('attendee_choice','organizer_assigns','preassigned_switchable')`.
- [X] T003 Migration part B: tables. Create `agenda_breakout_rooms`, `agenda_breakout_room_items` and `agenda_breakout_assignments` exactly as in data-model.md.
  - **Rooms**:
    - `name text NOT NULL` with CHECK on `btrim(name)` length 1–200
    - `description` ≤ 2000, `location` ≤ 200
    - `capacity integer NULL CHECK (capacity IS NULL OR capacity >= 1)`
    - `facilitator_id → facilitators(id) ON DELETE SET NULL`
    - `session_id → agenda_sessions(id) ON DELETE CASCADE`
    - `UNIQUE (id, session_id)`
    - `UNIQUE INDEX (session_id, lower(btrim(name)))`
  - **Items**:
    - `title` with CHECK on `btrim` length 1–300
    - `description` ≤ 2000, `location` ≤ 200
    - CHECK `(starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)`
    - `room_id → agenda_breakout_rooms(id) ON DELETE CASCADE`
  - **Assignments**:
    - `PRIMARY KEY (session_id, user_id)`
    - `FOREIGN KEY (room_id, session_id) REFERENCES agenda_breakout_rooms(id, session_id) ON DELETE CASCADE`
    - `FOREIGN KEY (event_id, user_id) REFERENCES event_members(event_id, user_id) ON DELETE CASCADE`
    - `session_id → agenda_sessions(id) ON DELETE CASCADE`
    - `source text NOT NULL CHECK (source IN ('attendee','organizer','csv'))`
    - `assigned_by → profiles(id) ON DELETE SET NULL`
    - an index on `room_id`
  - **On all three tables**: `display_order integer NOT NULL DEFAULT 0` where listed, plus `created_at`/`updated_at` where listed, and `legacy_key text NULL` on rooms and items.
- [X] T004 Migration part C: row-level security (R1). Enable RLS on the three tables. The organiser predicate below is `is_event_host_or_organizer(event_id) OR is_event_org_admin(event_id) OR portal_is_global_admin()`.
  - **Rooms and items**:
    - permissive SELECT: `is_event_member(event_id) OR portal_is_global_admin()`
    - permissive INSERT/UPDATE/DELETE: the organiser predicate
    - restrictive event-scope policies for SELECT/INSERT/UPDATE/DELETE: `is_event_member(event_id) OR portal_is_global_admin()`, mirroring `agenda_sessions_event_scope_*_restrictive`
  - **Assignments**:
    - permissive SELECT: `user_id = auth.uid()` OR the organiser predicate
    - permissive INSERT/UPDATE/DELETE: the organiser predicate
    - no attendee write policy
- [X] T005 Migration part D: triggers and derived JSON (R4, R6, R13).
  - **Rooms, BEFORE INSERT/UPDATE:**
    - set `event_id` from the session
    - if `facilitator_id` is set: it must belong to the same event, and `facilitator_name` is cleared
    - `updated_at` via the existing `set_updated_at()`
  - **Items, BEFORE INSERT/UPDATE:** set `event_id` from the room; `updated_at`.
  - **Assignments, BEFORE INSERT/UPDATE, `SECURITY DEFINER`:**
    - set `event_id` from the session; raise if NULL
    - raise unless `event_members.role = 'attendee'` for `(event_id, user_id)`
    - raise if `source = 'attendee'` and `user_id <> auth.uid()`
    - set `assigned_by = auth.uid()` and `assigned_at = now()`
    - on UPDATE with `NEW.room_id = OLD.room_id`, keep OLD `source`, `assigned_by` and `assigned_at`
  - **JSON rebuild function**: `public.rebuild_breakout_rooms_json(p_session_id uuid)`, `SECURITY DEFINER`, `SET search_path = public`, with EXECUTE revoked from public, anon and authenticated.
    - It builds a JSON array in `display_order`, one object per room: `id = coalesce(legacy_key, id::text)`, `name`, `description` (`''` when NULL), `facilitator_name` (the linked `facilitators.full_name`, else the stored name, else `''`), and `agenda`.
    - `agenda` is the room's items in `display_order`: `id = coalesce(legacy_key, id::text)`, `title`, `description`, `location` (`''` when NULL), and `starts_at`/`ends_at` as `to_char(x AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')` (`''` when NULL).
    - It writes NULL when the session has no rooms.
    - It updates `agenda_sessions.breakout_rooms` only when the new value `IS DISTINCT FROM` the current one.
  - **Rooms, AFTER INSERT/UPDATE/DELETE**: rebuild for NEW and OLD `session_id` (both when it changed).
  - **Items, AFTER INSERT/UPDATE/DELETE**: rebuild for the room's session (OLD and NEW room).
  - **Audit**: attach the existing `log_content_change()` AFTER INSERT/UPDATE/DELETE on rooms and items. Not on assignments.
- [X] T006 Migration part E: `public.save_breakout_rooms(p_session_id uuid, p_rooms jsonb, p_prune boolean) RETURNS jsonb`, `SECURITY INVOKER`, per contracts/database-functions.md.
  - **Session check first**: if the session has `event_id IS NULL`, return `{ok:false, reason:'no_event'}`.
  - **Matching and order**: match a room by `id` when given, else by `lower(btrim(name))`; insert or update its details.
    - `p_prune = true`: `display_order` follows array position.
    - `p_prune = false`: existing rooms keep their `display_order`; new rooms get `max(display_order) + 1, +2, …` in array order.
  - **Blocks**:
    - if a room has a `blocks` key, replace its items, but skip when they're identical (same count, and the same title/description/starts_at/ends_at/location in order)
    - if the key is absent, leave the items untouched
    - when replacing, keep a block's `id` when it's given and belongs to that room
  - **`p_prune = true`**: delete the session's rooms not in the payload, first counting their assignments into `removed_assignments`.
  - **Validation**: blank or duplicate names, capacity < 1, end ≤ start, or a facilitator from another event return `{ok:false, reason:'validation', message}` and leave nothing saved; use a savepoint or raise-and-catch so the call is all or nothing.
  - **Success**: return `{ok:true, rooms:[{id,name}], removed_assignments}`.
  - **Grants**: `GRANT EXECUTE TO authenticated`; revoke from public and anon.
- [X] T007 Migration part F: attendee functions (R7, R8).
  - **Headcount rule (both functions)**: count only assignments in the room whose `(event_id, user_id)` row in `event_members` has `role = 'attendee'`.
  - **`public.choose_breakout_room(p_room_id uuid) RETURNS jsonb`**, `SECURITY DEFINER`, `SET search_path = public`. It applies the rules in contract order, locking the room with `SELECT ... FOR UPDATE`, and returns `{ok, reason}` with reason codes `not_authenticated | room_not_found | no_event | not_attendee | organizer_assigns | room_full`. It never raises for these cases. On success it does `INSERT ... ON CONFLICT (session_id, user_id) DO UPDATE SET room_id, source = 'attendee'`.
  - **`public.get_breakout_room_availability(p_session_id uuid) RETURNS TABLE(room_id uuid, legacy_key text, capacity integer, headcount integer, seats_left integer, is_full boolean)`**, `SECURITY DEFINER`, `STABLE`. It returns no rows unless `is_event_member(session.event_id) OR portal_is_global_admin()`.
  - **Grants on both**: EXECUTE to authenticated only; revoke from public and anon.
- [X] T008 Migration part G: idempotent backfill (data-model "Backfill").
  - **Which sessions**: those whose `breakout_rooms` is a non-empty array and which have no rows in `agenda_breakout_rooms`.
  - **Rooms**: insert in array order. Use the legacy `id` as `id` when it matches the UUID pattern; otherwise generate a UUID and store the old id in `legacy_key`.
    - `facilitator_name` comes from the JSON (`''` becomes NULL).
    - Set `facilitator_id` only on a unique, case-insensitive exact `full_name` match within the same event.
  - **Items**: insert the same way. Cast `starts_at`/`ends_at` from the ISO strings, with `''` becoming NULL.
  - **Then** call `rebuild_breakout_rooms_json` for each backfilled session.
  - **Implementation notes (2026-10-14)**:
    - Added a guard trigger `trg_agenda_sessions_guard_breakout_rooms`. It refuses a direct *change* to `agenda_sessions.breakout_rooms` that isn't made by `rebuild_breakout_rooms_json` (which sets `app.breakout_rebuild`). This protects room edits made in the old Portal between the migration and the deploy. Saves that leave the JSON unchanged still pass.
    - `save_breakout_rooms` also accepts `facilitator_name`, so the editor can keep or remove a legacy free-text facilitator.
    - The restrictive event-scope policies mirror `agenda_sessions_event_scope_*` (`agenda_session_speakers` has none).
- [X] T009 Apply and verify the migration (quickstart §1) on the shared Bendie project, using the `supabase` MCP `apply_migration`. Then:
  - Compare the rebuilt `breakout_rooms` with the T001 snapshot. These must match: room ids (legacy preserved), names, descriptions, facilitator names, block ids/titles/descriptions/locations, and block instants (timestamp formatting may differ).
  - Confirm 5 rooms (3 with `legacy_key`) and `breakout_mode = 'attendee_choice'` on all sessions.
  - Re-run the backfill statement and confirm nothing changes.
  - Run the security advisors and confirm no new findings for the new objects.
  - **Stop and report if anything differs.**
- [X] T010 [P] Update `src/types/database.ts` by hand:
  - `BreakoutMode = 'attendee_choice' | 'organizer_assigns' | 'preassigned_switchable'`
  - `breakout_mode: BreakoutMode` on the agenda session row type (~line 228)
  - `AgendaBreakoutRoom`, `AgendaBreakoutRoomItem` and `AgendaBreakoutAssignment` row types matching data-model.md, with `source: 'attendee' | 'organizer' | 'csv'`
  - the `ChooseBreakoutRoomResult` union, and the `SaveBreakoutRoomsResult` type
- [X] T011 [P] Create `src/lib/breakoutRooms.ts`: pure helpers only, with no Supabase import (R12).
  - **Editor form types**: `BreakoutRoomForm` (`id?`, `name`, `description`, `location`, `facilitator_id`, `capacity` string, `blocks: BreakoutBlockForm[]`) and `BreakoutBlockForm` (`id?`, `title`, `description`, `starts_at` local datetime string, `ends_at`, `location`).
  - **Mapping**:
    - `roomsFromRows(rooms, items) → BreakoutRoomForm[]`
    - `toSaveRoomsPayload(forms) → p_rooms jsonb`, with local times converted to ISO and blank strings to null
  - **`validateRoomForms(forms)`**, returning field messages:
    - room name required, 1–200, unique ignoring case and spaces
    - description ≤ 2000, location ≤ 200
    - capacity blank, or a whole number ≥ 1
    - block title required, 1–300
    - block end after start
  - **`BREAKOUT_MODE_LABELS`**: Attendees choose / Organiser assigns / Pre-assigned, can switch.
  - **`normalizeName(s)`**: `s.trim().toLowerCase()`.

**Checkpoint**: the database is live and verified; types and helpers exist. The released app still shows the same rooms.

---

## Phase 3: User Story 1 — Organiser sets up breakout rooms that persist (P1) 🎯 MVP

**Goal**: rooms are durable, edited through `save_breakout_rooms`, with a Speaker picker, capacity, location and mode. Organisation admins can edit sessions (FR-033).
**Independent Test**: quickstart §2, steps 1–7.

- [X] T012 [US1] Create `src/components/portal/BreakoutRoomsEditor.tsx`.
  - **Move, don't copy**: move `BreakoutRoomsPanel` (`src/app/portal/events/[eventId]/agenda/page.tsx:907-1012`) and its handlers here, and delete them from the page.
  - **Props**: `rooms: BreakoutRoomForm[]`, `onChange`, `facilitators: {id, full_name, email}[]`, `mode`, `onModeChange`, `headcounts: Record<roomId, number>`, `assignedTotal: Record<roomId, number>`, `errors`.
  - **Room fields**:
    - name, description, location
    - facilitator: a `<select>` of the event's Speakers, plus "None"; a legacy text name shows as read-only "Was: <name>" until a Speaker is picked
    - capacity: a number input with `min=1`, blank means "No limit"
    - the time blocks (title, description, start, end, location), as today
  - **Ordering**: rooms and blocks can be reordered with up/down, as today.
  - **Mode selector**: the three `BREAKOUT_MODE_LABELS` options, each with a one-line hint. Shown only when there is at least one room.
  - **Removing a room**: if `assignedTotal[room.id] > 0` (all assignments, research R6), `useConfirm({destructive:true})` says "N people are in this room. Removing it unassigns them." before removing it from local state.
  - **Styling**: existing `.input`/`.label`/`.hint`/`.btn-*` classes and tokens only. No new hex colours; normalise any `border-[#E4EAF0]` in the moved markup to the token class.
- [X] T013 [US1] Edit `src/app/portal/events/[eventId]/agenda/page.tsx` so rooms load from the tables.
  - **Rights (FR-034)**: on page load, work out `canEditSessions` and `canManageBreakouts` (research R1).
    - `canEditSessions` = `isGlobalAdmin` from `useAuth`, or `rpc('is_event_org_admin', {ev_id})`.
    - `canManageBreakouts` = `canEditSessions`, or `rpc('is_event_host_or_organizer', {ev_id})` (as `members/page.tsx:149` does).
    - Hide New session, Edit, Delete, Duplicate, the agenda Import button and the edit form's save when `!canEditSessions`. The session title stays visible as plain text.
    - Show a loading placeholder until the rights are known. On an rpc error, fail closed: read-only plus a toast.
  - **`fetchData`**:
    - add `breakout_mode` to the sessions select, and remove `breakout_rooms` from it
    - also load `agenda_breakout_rooms` (filtered by `event_id`, ordered by `display_order`) and `agenda_breakout_room_items` (by `event_id`)
    - also load the event's assignments (`room_id`, `user_id`), and attendee user ids from `event_members` (`role = 'attendee'`). From these, derive two counts per room:
      - `headcount`: current attendees only, used for display
      - `assignedTotal`: all rows, used for the delete-room warning (research R6)
  - **`openAdd` / `openEdit`**: build the editor state with `roomsFromRows`, and set the mode from the session.
  - **Remove** `parseBreakoutRooms` and `serializeBreakoutRooms` and the old `BreakoutRoom` types from the page.
- [X] T014 [US1] Edit the agenda page save handler (`page.tsx` ~333-410).
  - **Validate first**: use `validateRoomForms` before saving, opening the "More options" section on error.
  - **Session payload**: drop `breakout_rooms`; add `breakout_mode`.
  - **Room save**: after the session insert or update and the speakers loop, call `supabase.rpc('save_breakout_rooms', { p_session_id, p_rooms: toSaveRoomsPayload(forms), p_prune: true })`. Skip it when the session never had rooms and has none now.
  - **Results**:
    - `{ok:false}`: show `message` in a toast and keep the form open
    - `removed_assignments > 0`: add "N people unassigned" to the success toast
  - **"Save & Add Another"**: also resets the rooms to `[]` and the mode to `attendee_choice`.
- [X] T015 [US1] Edit the agenda page session list (`page.tsx` ~743): the room count comes from the loaded rooms (`roomsBySession`), not the JSON.
  - **Developer feedback, 2026-10-14**: main and breakout sessions must look visibly different.
    - **Session form:** a "Session format" choice (Regular session / Breakout session) now sits above Speakers. The room editor only shows for breakouts and is no longer under "More options".
    - **Switching a breakout back to regular:** asks for confirmation, with the number of people who will be unassigned.
    - **Saving a breakout with no rooms:** refused.
    - **Agenda list rows:** a "Breakout · N rooms" badge, who places attendees, the room names under the title, and "N rooms" in Location when the session has no location of its own.
- [X] T016 [US1] Validate US1 using quickstart §2:
  - the existing "Stawi Escape" breakout is unchanged
  - create, rename and reorder rooms
  - the released attendee app shows the same rooms
  - sessions without rooms are unchanged
  - an org admin of the event's organisation can create, edit and delete sessions and rooms; another organisation's admin can't
  - a host/organizer who isn't an org admin sees no session edit controls (FR-034), and a direct save attempt is still refused by row-level security
  - time the setup of 3 rooms with facilitators, capacities and two blocks each: under 5 minutes (SC-002)

**Checkpoint**: US1 complete. This is the MVP: durable rooms, the app is unaffected, and org admins can edit.

---

## Phase 4: User Story 2 — Organiser sees and manages who is in each room (P2)

**Goal**: headcounts, lists, and assign/move/unassign.
**Independent Test**: quickstart §3.

- [X] T017 [US2] Create `src/components/portal/BreakoutAssignmentsModal.tsx`, using the existing modal shell the page already uses (`FormModal`) and the existing loading-skeleton, error and empty patterns.
  - **Props**: `open`, `onClose`, `onChanged`, `eventId`, `session {id, title, starts_at}`.
  - **Loads**:
    - the session's rooms, ordered
    - the session's assignments
    - attendees: `event_members` with `role = 'attendee'` for the event, joined to `profiles(full_name, email)`, using the same shape as `src/app/portal/events/[eventId]/members/page.tsx`
  - **Each room card shows**:
    - name and location
    - the headcount, `N / capacity` or `N · no limit`, with an over-capacity badge when N > capacity. N counts current attendees only (research R6).
    - its attendees: name, email, source label (Attendee / Organiser / CSV) and relative time
  - **Other lists**: "Not in a room" (attendees with no assignment), and "No longer attendees" for assignments whose member role isn't `attendee`. These aren't counted in any headcount, and each has an Unassign action.
  - **Actions**:
    - assign or move: a room `<select>` per attendee; `upsert({session_id, user_id, room_id, source: 'organizer'}, {onConflict: 'session_id,user_id'})`
    - unassign: `delete` by `(session_id, user_id)`
    - both refresh the counts optimistically and roll back with a toast on error
  - **Other UI**: a search box over names and emails, and the "Over capacity" warning text. Mode is shown read-only, with a hint to edit it in the session.
  - **States**: an empty state when the session has no rooms, and another when the event has no attendees.
- [X] T018 [US2] Edit `src/app/portal/events/[eventId]/agenda/page.tsx`: add a "Manage people" action on each session row that has rooms, plus a button in the edit form's breakout section for an existing session. Both are shown only when `canManageBreakouts` (FR-034), and both open `BreakoutAssignmentsModal`. Its `onChanged` refreshes the counts.
- [X] T019 [US2] Validate US2 using quickstart §3:
  - as an event host/organizer who isn't an org admin, and as an org admin
  - over capacity is allowed with a warning
  - moving an attendee never leaves them in two rooms
  - deleting a room in the editor warns, then unassigns its people
  - loading, error and empty states

**Checkpoint**: US1 and US2 work independently.

---

## Phase 5: User Story 3 — Rooms and assignments by CSV, and assignments download (P3)

**Goal**: two uploads with previews, updates instead of duplicates, and a round-trip download.
**Independent Test**: quickstart §4.

- [X] T020 [P] [US3] Edit `src/components/portal/CsvImportModal.tsx` to add three **optional** props, leaving existing callers' behaviour unchanged (R9):
  - **`refineResults?: (results: RowResult<T>[]) => RowResult<T>[]`**: runs after the per-row `parseRow` in `applyParsedRows`, and may add errors (cross-row checks).
  - **`previewWarnings?: (validData: T[]) => string[]`**: rendered in the preview step as a non-blocking warning list above the row table, using the existing hint/warning styling.
  - **`importAll?: (validData: T[]) => Promise<{ rowIndex: number; error?: string; notice?: string }[]>`**: when given, `handleImport` calls it instead of the `runWithConcurrency` per-row loop and maps the result to `ImportOutcome[]`; progress shows as indeterminate.
- [X] T021 [US3] Add the rooms CSV pieces to `src/lib/breakoutRooms.ts`, per contracts/csv-formats.md.
  - **`ROOMS_CSV_COLUMNS`**: keys `session_title*`, `session_start*`, `room_name*`, `room_description`, `room_location`, `facilitator`, `capacity`, `block_title`, `block_start`, `block_end`, `block_location`, `block_description`.
  - **`ROOMS_CSV_SAMPLES`**: the three sample rows from the contract.
  - **`parseRoomsCsvRow(raw, rowIndex, ctx)`**, where `ctx` = { sessions, facilitators }:
    - match the session by `normalizeName(title)` plus the minute-equal start from `parseFlexibleDate`; none or more than one is an error
    - match the facilitator by name or email
    - capacity must be a whole number ≥ 1
    - block columns require `block_title`, and `block_end` must be after `block_start`
  - **`refineRoomsCsv(results)`**: conflicting non-blank room details across rows of the same session + room are an error on the later rows.
  - **`groupRoomsCsv(validData, existingRoomsBySession)`**: builds `{ sessionId, rooms: p_rooms }[]`. A room is matched by name to an existing id. `blocks` is included only when any row of that room has `block_title`. Room details not given keep the existing values.
- [X] T022 [US3] Add the assignments CSV pieces to `src/lib/breakoutRooms.ts`, per the contract.
  - **`ASSIGNMENT_CSV_COLUMNS`**: keys `attendee_email*`, `session_title*`, `session_start*`, `room_name`.
  - **Samples**.
  - **`parseAssignmentCsvRow(raw, rowIndex, ctx)`**, where `ctx` = { sessions with rooms, attendeesByEmail }:
    - an unknown attendee, session or room is an error
    - a blank room means unassign
  - **`refineAssignmentsCsv`**: the same attendee + session on more than one row makes all those rows errors.
  - **`assignmentCapacityWarnings(validData, currentAssignments, rooms, attendeeIds)`**: one "Room A (Afternoon Breakouts): 32 / 30 after this upload" warning per over-capacity room. It counts current attendees only (research R6).
  - **`buildAssignmentDownloadRows(sessions, rooms, assignments, attendees)`**: every breakout session × every attendee, with the room blank when unassigned, sorted by session start, room name, email.
- [X] T023 [US3] Edit `src/app/portal/events/[eventId]/agenda/page.tsx` to add a "Breakout rooms" upload (a second `CsvImportModal`).
  - **Template**: `breakout-rooms-template.csv`.
  - **Wiring**: `parseRow` and `refineResults` use the T021 helpers; `importAll` runs `groupRoomsCsv`, then `rpc('save_breakout_rooms', {p_prune: false})` per session, and maps each session's result to all of its rows.
  - **After import**: `onImported` refreshes the data.
  - **Placement**: put the upload next to the existing agenda Import button. Show it only when `canManageBreakouts` (FR-034).
- [X] T024 [US3] Edit the agenda page to add the assignments upload and download.
  - **Upload ("Room assignments")**:
    - template `breakout-assignments-template.csv`
    - `parseRow`, `refineResults` and `previewWarnings` use the T022 helpers
    - `importRow`: upsert `{session_id, user_id, room_id, source: 'csv'}` with `onConflict: 'session_id,user_id'`; a blank room deletes the assignment
    - the attendee and assignment context is loaded when the modal opens
  - **Download ("Download assignments")**: `buildCsvTemplate(ASSIGNMENT_CSV_COLUMNS, buildAssignmentDownloadRows(...))` saved as `breakout-assignments-<eventId>.csv`, using the same object-URL pattern as `downloadCsvTemplate` in `src/lib/csvImport.ts:77`. Disabled when the event has no breakout sessions.
  - **Visibility**: both are shown only when `canManageBreakouts` (FR-034).
  - **Simplified 2026-10-14** (developer: "make it as easy as possible"). This replaces T021–T024 as originally written.
    - The separate rooms upload, the assignments upload and the breakout toolbar were removed.
    - **Agenda spreadsheet** (`agenda/page.tsx`):
      - optional `breakout_room`, `room_capacity` and `room_facilitator` columns
      - `refineAgendaCsv` groups rows by title + start
      - `importAgendaAll` updates a matching session instead of duplicating it, then saves rooms via `save_breakout_rooms(p_prune=false)`
    - **People list** (`BreakoutAssignmentsModal`): Download list / Upload list per breakout session (email, name, room).
    - **Helpers** in `breakoutRooms.ts`: `PEOPLE_LIST_*`, `parsePeopleListRow`, `refinePeopleList`, `peopleListCapacityWarnings`, `buildPeopleListRows`, `sessionMatchKey`.
    - `CsvImportModal` keeps the optional `refineResults` / `previewWarnings` / `importAll`.
    - Contract: contracts/csv-formats.md (rewritten).
- [X] T025 [US3] Validate US3 using quickstart §4:
  - the templates
  - rooms upload, then the same file again: no changes, ids stable
  - the assignments edge rows: over capacity is a warning; unknown email, unknown room and duplicates are errors; a blank room unassigns
  - download and re-upload: no change (`assigned_at` stable)
  - edit two rows and re-upload: exactly two attendees move, with source CSV
  - a rooms upload containing only some of a session's rooms leaves the other rooms' order unchanged, and new rooms appear last
  - time a 300-row assignments upload from file pick to result screen: under 3 minutes (SC-003)

**Checkpoint**: US1–US3 work independently.

---

## Phase 6: User Story 4 — Mode and capacity rules for attendee picks (P4)

**Goal**: prove that `choose_breakout_room` and `get_breakout_room_availability` (built in T007) behave exactly as the contract says.
**Independent Test**: quickstart §5.

- [X] T026 [US4] Write a throwaway verification script **in the session scratchpad (not the repo)**. It signs in as test attendees through the anon key and the normal email sign-in, using test accounts from the developer and never committing credentials.
  - **Single-attendee checks** (quickstart §5 steps 1–4): pick; switch; a full room; `organizer_assigns`; `preassigned_switchable`; a staff member gets `not_attendee`.
  - **Race (step 5)**: a room with capacity 5 and 20 parallel picks gives exactly 5 `ok`.
  - **Privacy (step 6)**: availability returns counts only; an attendee sees only their own assignment row.
  - **Clean-up**: remove all test assignments and rooms afterwards, and record the results in this task's note.

**Checkpoint**: Release 1 is functionally complete.

---

## Phase 7: User Story 5 — Attendee app saves picks (P5, Release 2, Evently-App)

**Goal**: hand over the contract. The app itself is built in the Evently-App repo, not here.

- [X] T027 [US5] Add an entry to `C:\Users\ADMIN\VScodeProjects\Evently-App\docs\MIGRATIONLOG.md`, using that file's existing entry format. It covers:
  - the new tables, column and functions, and that `breakout_rooms` is now derived (don't write to it)
  - that legacy room ids live in `legacy_key`
  - a pointer to `Bendie-Portal/specs/021-bendie-breakout-rooms/contracts/attendee-app-release-2.md` for the Release 2 work

  Edit only that file in the app repo.

---

## Phase 8: Polish & cross-cutting

- [X] T028 [P] Documentation (Constitution VII):
  - **`context/schema-reference.md`**:
    - the agenda section: the `breakout_rooms` row is now derived; the new tables, mode, functions and RLS; org-admin session editing
    - remove the "selection is only in memory" note once Release 2 ships, and mark it pending until then
  - **`context/progress-tracker.md`**: a Feature 021 entry.
  - **`context/architecture.md`**: the breakout data flow and the `CsvImportModal` optional props.
- [X] T029 `npm run type-check`; `npm run lint` (no new warnings over the baseline); `npm run build` in an isolated copy, never the live `.next` (as in Feature 018).
- [X] T030 Regression (quickstart §6, FR-030/031, SC-008):
  - the existing agenda CSV import still works
  - "Push to Planner" on a linked event with Bendie active still pushes the breakout session as one item
  - a Bendie-only event shows no push button
  - non-breakout sessions are unchanged
- [ ] T031 Wrap-up (AGENTS.md workflow): `/imprint` for the assignments modal and editor patterns, `/review` (report first), `/speckit-converge`, a commit on `developement` (feature commit, then the `tsconfig.tsbuildinfo` chore commit), `/remember save`.

---

## Dependencies & execution order

- **T001 → T002–T008** (one migration file, written in order) **→ T009** (apply and verify). T010 and T011 [P] can be written alongside T002–T008, but must match the applied schema.
- **US1 (T012–T016)** needs Phase 2.
- **US2 (T017–T019)** needs Phase 2. It shares `page.tsx` with US1, so do T018 after T013–T015.
- **US3 (T020–T025)** needs Phase 2. T020 [P] can run alongside T021 (different files). T021 → T022 (same file). T023/T024 need T020–T022 and come after the US1/US2 page edits.
- **US4 (T026)** needs T009 only.
- **US5 (T027)** needs T009.
- **Polish (T028–T031)** comes after the stories you are shipping.

## Parallel examples

```text
# During Phase 2 (after T002–T008 are drafted, before/while T009 runs):
T010 src/types/database.ts
T011 src/lib/breakoutRooms.ts

# Within US3:
T020 src/components/portal/CsvImportModal.tsx
T021 src/lib/breakoutRooms.ts  (then T022 in the same file)

# Independent of UI work once T009 is done:
T026 attendee-rule verification script (scratchpad)
T027 Evently-App MIGRATIONLOG entry
```

## Implementation strategy

1. **MVP**: Phase 1 + Phase 2 + US1. Rooms become durable, the released app is unaffected, and org admins can edit sessions. Validate with T016 and stop to review.
2. **Then** US2 (assignments view), then US3 (uploads and download), each validated on its own.
3. **Then** US4 verification, the US5 handover, and polish. Release 2 follows in Evently-App.

## Traceability (requirement → tasks)

| Requirement | Tasks |
|---|---|
| FR-001–003 | T003, T006, T011, T012 |
| FR-004 | T002, T012, T014 |
| FR-005–006 | T001, T005, T008, T009, T016 |
| FR-007–008 | T012, T013, T014 |
| FR-009–013 | T003, T004, T005, T017 |
| FR-014–015 | T017, T018 |
| FR-016–018 | T004, T007, T026 |
| FR-019–022 | T020, T021, T023 |
| FR-023–027 | T020, T022, T024 |
| FR-028–029 | T002, T003, T004, T019 |
| FR-030–031 | T013, T014, T030 |
| FR-032 | T027, plus the Evently-App Release 2 |
| FR-033 | T002, T016 |
| FR-034 | T013, T016, T018, T023, T024 |
| SC-002, SC-003 | T016, T025 |

## Phase 9: Convergence

- [X] T032 CRITICAL: Replace the raw colour classes added or edited in this feature with token classes: the preview-warnings box in `src/components/portal/CsvImportModal.tsx` (`border-amber-200 bg-amber-50/60 text-amber-900`) and the breakout badge in `src/app/portal/events/[eventId]/agenda/page.tsx` (`bg-purple-100 text-purple-700`), per Constitution V (contradicts)
- [ ] T033 Delete a test breakout session (with rooms and an assignment) in the Portal and confirm the delete succeeds, its rooms and assignments are gone, and no error comes from the room-list rebuild trigger, per FR-029 (partial)
- [ ] T034 Run the parallel capacity test (20 test attendees pick a room with 5 free seats at once; exactly 5 succeed) from a scratchpad script with test accounts, per SC-005 (partial)
- [X] T035 In `refineAgendaCsv` (`src/app/portal/events/[eventId]/agenda/page.tsx`), compare each breakout row's session details with the first *filled* value of each field, not only the first row, per FR-020 (partial)
- [ ] T036 Sign in as an event host or organiser who is not an org admin and confirm the agenda shows Manage people, but no Import spreadsheet / Add / Edit / Delete, per FR-034 (partial)
- [ ] T037 Time the 3-room breakout setup and a 300-row people-list upload, and record the results in this task, per SC-002 and SC-003 (partial)
- [X] T038 In `BreakoutAssignmentsModal` `importListRow`, skip blank-room rows for people who are not in a room, so uploads don't send no-op deletes, per SC-003 (partial)

