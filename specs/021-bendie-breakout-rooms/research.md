# Research: Bendie Breakout Rooms (Feature 021)

All facts below were verified against the live shared Bendie database and the current code on 2026-10-13, unless marked otherwise.

## Live-state findings

| # | Finding | Evidence | Consequence |
|---|---|---|---|
| L1 | `agenda_sessions` writes are **platform-admin only**: the only permissive write policy is `Global admins can manage all agenda sessions`; the `agenda_sessions_event_scope_*_restrictive` policies only narrow. | `pg_policy` on `agenda_sessions` | **Developer decision 2026-10-13: extended to organisation owners/admins (FR-033)**, see R1. |
| L15 | All 36 (org owner/admin × event of that org) pairs have an `event_members` row with role `admin` or `host`; 0 without membership. Membership is maintained by the `zz_organization_admin_event_membership*` guard chain. | query, 2026-10-13 | The restrictive event-scope policies (which require `is_event_member`) never block org admins; an extra permissive policy is enough. |
| L2 | `agenda_session_speakers` (a child table of sessions) lets `is_event_host_or_organizer(event_id)` **or** `portal_is_global_admin()` write, and event members read. | `pg_policy` on `agenda_session_speakers` | Precedent for the new child tables (R1). |
| L3 | Helpers exist: `is_event_member(ev_id, uid)`, `is_event_host_or_organizer(ev_id, uid)` (roles `host`/`organizer`/`admin`), `portal_is_global_admin()`. All `SECURITY DEFINER`, `search_path = public`. | `pg_proc` | Reused; no new auth helper. |
| L4 | 3 sessions have rooms, 5 rooms in total. 3 room ids are **not UUIDs** (`room-innovation-lab`, `room-leadership-circle`, `room-storytelling-studio`, on the "Stawi Escape" sample event); 2 are UUIDs. All rooms have an id. | query on `breakout_rooms` | Durable rooms need a place to keep a non-UUID legacy id (R2). |
| L5 | None of the 3 non-empty legacy `facilitator_name` values matches a Speaker (`facilitators.full_name`) on its event. | same query | Legacy names must be preserved as text (R3). |
| L6 | JSON shape: room keys `id, name, description, facilitator_name, agenda`; block keys `id, title, description, starts_at, ends_at, location`. The Portal writes empty strings for blank values and ISO-8601 UTC strings for times. | query and `serializeBreakoutRooms` in `agenda/page.tsx` | Derived JSON must reproduce this shape (R4). |
| L7 | The app reads agenda data through the view `agenda_sessions_summary`, which selects `s.breakout_rooms` explicitly. | `pg_get_viewdef` | Keeping `breakout_rooms` filled keeps the released app working; the view doesn't need to change. |
| L8 | `agenda_sessions` has triggers `trg_agenda_sessions_updated_at` and `trg_audit_agenda_sessions` (`log_content_change()`, needs `NEW.event_id`/`NEW.id`, writes `event_content_audit_log`). | `pg_trigger` | Rebuilding the JSON also logs a session update. Rooms can reuse `log_content_change()` if they carry `event_id`. |
| L9 | `event_members` PK is `(event_id, user_id)`; role check allows `host, organizer, admin, attendee, facilitator, staff, speaker`; 326 attendee rows across all events. | `pg_constraint` | Assignments can reference `(event_id, user_id)` with `ON DELETE CASCADE` (FR-029). |
| L10 | `session_attendees` and `agenda_session_speakers` cascade on session delete; `agenda_sessions.event_id` is nullable (`ON DELETE SET NULL`). | `pg_constraint` | Rooms and assignments cascade from the session. A session with no event cannot take assignments. |
| L11 | Room choice in the app is in-memory only and awards `award_game_point('breakout_room_join', session_id, event_id)` (idempotent). | `Evently-App/domains/agenda/infrastructure/supabase/agenda.repository.ts:32,140-168` | Release 2 keeps the point call unchanged; it stays client-side. |
| L12 | `CsvImportModal` validates **per row** only, has no file-level warnings, and imports per row (concurrency 5), with optional `beforeImport` and `replaceOption` (added by Feature 020, committed `3aca993` on 2026-10-13). | `src/components/portal/CsvImportModal.tsx:36-50,195-241` | Needs small optional extensions (R9). |
| L13 | The agenda page saves the session, then speakers, from one form, and writes `breakout_rooms` as part of the session payload. | `agenda/page.tsx:333-393` | The room save moves to an atomic function call after the session save (R5). |
| L14 | `buildCsvTemplate(columns, rows)` is a generic CSV builder. | `src/lib/csvImport.ts:69` | Reused for the assignments download (R11). |

## Decisions

### R1 — Access model (updated 2026-10-13 for FR-033)

- **New helper**: `is_event_org_admin(ev_id uuid) returns boolean`. It is `SECURITY DEFINER`, `STABLE`, with `search_path = public`, and returns `is_organization_admin(events.organization_id, auth.uid())` for that event. It's resolved from the record, as Constitution Principle II requires. It deliberately has no `uid` parameter, so callers can't probe other users (/speckit-analyze S1).
- **Organiser predicate** (used below): `is_event_host_or_organizer(event_id) OR is_event_org_admin(event_id) OR portal_is_global_admin()`.
- **Decision**:
  - **`agenda_sessions`:** add permissive INSERT, UPDATE and DELETE policies `agenda_sessions_*_org_admin`, with `event_id IS NOT NULL AND is_event_org_admin(event_id)` (FR-033). The existing global-admin policy and the restrictive event-scope policies stay unchanged, and L15 shows those never block org admins. Hosts and organisers gain nothing on sessions. The mode column follows these policies.
  - **Rooms and blocks:**
    - read: event members or platform admin
    - write: the organiser predicate
    - plus restrictive event-scope policies, as on `agenda_session_speakers`
  - **Assignments:**
    - read: the attendee's own rows, or the organiser predicate
    - write: the organiser predicate
    - attendees never write directly; they go through `choose_breakout_room`
  - **`agenda_session_speakers`:** unchanged. It already allows the `admin`/`host` event roles that org admins hold (L15).
- **Rationale**: follows the closest precedent (L2), implements FR-028 and FR-033, and keeps attendees from seeing who else is in a room (FR-018).
- **Alternatives considered**:
  - Opening sessions to hosts/organizers as well: rejected. The developer chose organisation admins only.
  - Relying only on the event `admin` role as the permissive check: rejected. An explicit organisation check says what the decision means.
- **Dependency, stated explicitly (/speckit-analyze I2)**: the *restrictive* event-scope policies on sessions, rooms and blocks still require `is_event_member`. So FR-033 does rely on org admins being event members, which is maintained by the `zz_organization_admin_event_membership*` guard chain (L15, true 36/36). If that chain ever broke, org admins would be refused rather than over-granted, so it fails safe. The restrictive policies are deliberately left unchanged.
- **Portal controls (FR-034)**: the agenda page loads the caller's rights once on page load (platform admin from `useAuth`, `rpc('is_event_org_admin')`, `rpc('is_event_host_or_organizer')` as the Members page does) and shows each control only to people who can use it.
  - `canEditSessions` = platform admin, or org admin of the event.
  - `canManageBreakouts` = `canEditSessions`, or event host/organizer.

### R2 — Room identity

- **Decision**: `id uuid` primary key, plus a nullable `legacy_key text` column.
  - The backfill uses a legacy id directly as `id` when it is a UUID.
  - Otherwise it generates a UUID and stores the old id in `legacy_key`.
  - The derived JSON emits `coalesce(legacy_key, id::text)` as the room id.
- **Rationale**: room identities don't change for the released app (FR-005) and every room gets a proper key.
- **Alternative**: a text primary key. Rejected: it's inconsistent with every other table and weak for foreign keys.

### R3 — Facilitator

- **Decision**: `facilitator_id uuid` references `facilitators(id)` `ON DELETE SET NULL`, plus `facilitator_name text` for legacy or free-text names.
  - The editor and CSV set `facilitator_id` and clear `facilitator_name`.
  - The JSON emits the Speaker's name when linked, else `facilitator_name`.
  - The backfill links only an exact, unique, case-insensitive name match on the same event. That is zero rows today (L5), so all three names are kept as text.

### R4 — Keeping the released app working (derived JSON)

- **Decision**: a `SECURITY DEFINER` function `rebuild_breakout_rooms_json(session_id)` rewrites `agenda_sessions.breakout_rooms` from the tables.
  - It writes the L6 shape: empty strings for blanks, block times as UTC ISO with milliseconds (`YYYY-MM-DDTHH:MI:SS.MSZ`, matching JS `toISOString()`), in display order.
  - It writes `NULL` when the session has no rooms.
  - It is called by `AFTER INSERT/UPDATE/DELETE` row triggers on rooms and blocks.
  - It is `SECURITY DEFINER` so hosts/organizers can trigger it despite L1.
  - It skips the write when the JSON is unchanged, avoiding audit noise.
- **Rationale**: the released app reads only the JSON (L7), so derivation in the database guarantees FR-006 whoever writes the rooms.
- **Alternatives considered**:
  - Writing the JSON from the Portal: rejected, it drifts when rooms change through CSV or another client.
  - Changing the view to build JSON on the fly: rejected for now. It works, but it changes the app's read path and also costs on every read. Revisit after Release 2.
- **Accepted**: the tables are the source of truth, and a direct write to `breakout_rooms` is overwritten on the next room change. Per-row triggers rebuild once per row changed, which is negligible at these sizes (rooms per session ≤ ~20).

### R5 — Atomic room save

- **Decision**: a `SECURITY INVOKER` function `save_breakout_rooms(p_session_id uuid, p_rooms jsonb, p_prune boolean)`, running under the caller's row-level security.
  - **Room matching**: by `id` when given (editor), else by normalised name (CSV).
  - **Room details**: inserts or updates them.
  - **Blocks**: a room's blocks are replaced when its `blocks` key is present, and left alone when absent. An identical block list is skipped, so block ids don't change.
  - **`p_prune = true`** (editor): rooms not in the payload are deleted.
  - **`p_prune = false`** (CSV): only the listed rooms are touched. Rooms that already exist keep their `display_order`. New rooms are appended after the session's current highest `display_order`, in file order (/speckit-analyze I1).
  - **Session with no event**: refused with `{ok:false, reason:'no_event'}` (/speckit-analyze E1).
  - **Returns**: the saved rooms, and how many assignments were removed by pruning.
- **Rationale**: one transaction per save, so a half-saved room set is impossible. Reused by the editor and the rooms CSV. It's a database function, like the existing `create_event_with_products`, not a service layer (Principle II).
- **Alternative**: client-side multi-call saves like the speakers loop. Rejected because they can leave a partial save.

### R6 — Assignment integrity

- **Decision**: table `agenda_breakout_assignments`.
  - **Primary key**: `(session_id, user_id)`.
  - **Foreign keys**:
    - `(room_id, session_id)` → `agenda_breakout_rooms(id, session_id)` `ON DELETE CASCADE`
    - `(event_id, user_id)` → `event_members(event_id, user_id)` `ON DELETE CASCADE`
    - `session_id` → `agenda_sessions` `ON DELETE CASCADE`
  - **`BEFORE INSERT/UPDATE` trigger**, which:
    - sets `event_id` from the session, and refuses a session with no event
    - checks the member's role is `attendee` (FR-010)
    - stamps `assigned_by := auth.uid()` and `assigned_at := now()`
    - on an update with the same `room_id`, keeps the old `source`/`assigned_by`/`assigned_at`, so re-uploads change nothing (FR-026, SC-004)
    - allows `source = 'attendee'` only when `user_id = auth.uid()`
- **Accepted edge**: if an attendee's role later changes away from `attendee`, the assignment stays until removed, and the Portal lists them separately under "No longer attendees". No trigger is added on `event_members`; that table carries a sensitive guard chain we won't touch.
- **Counting rule (/speckit-analyze C1)**: a room's **headcount** counts only assignments whose `(event_id, user_id)` member currently has role `attendee`. The same definition is used everywhere: the capacity check in `choose_breakout_room`, `get_breakout_room_availability`, the Portal headcounts and over-capacity warnings, and the CSV capacity warnings. The delete-room warning counts **all** assignments in the room, because all of them are removed.

### R7 — Attendee choice and capacity race

- **Decision**: `choose_breakout_room(p_room_id uuid) returns jsonb`, `SECURITY DEFINER`, `search_path = public`, `EXECUTE` granted to `authenticated` only. In order, it:
  1. checks `auth.uid()`
  2. loads the room `FOR UPDATE`, which serialises picks for that room
  3. reads the session's mode and event
  4. checks the caller is an attendee
  5. refuses in `organizer_assigns` mode
  6. returns ok without change if the attendee is already in this room
  7. counts the room's headcount (current attendees only, R6) and refuses if full
  8. upserts the assignment with `source = 'attendee'`
- **Returns**: `{ok:true, room_id, session_id}` or `{ok:false, reason}`, with `reason` one of `not_authenticated | room_not_found | no_event | not_attendee | organizer_assigns | room_full`.
- **Rationale**: the row lock on the room plus the `(session_id, user_id)` key guarantees the room never goes over capacity through picks (FR-016, SC-005). Reason codes rather than exceptions are easier for the app to map (FR-017).
- **Alternative**: an `exclusion`/check constraint. That can't express a count, so it was rejected.

### R8 — Fullness for attendees

- **Decision**: `get_breakout_room_availability(p_session_id uuid)` returns `(room_id, legacy_key, capacity, headcount, seats_left, is_full)`.
  - It is `SECURITY DEFINER`.
  - It returns nothing unless the caller is an event member or a platform admin.
  - It returns counts only, never identities (FR-018).
- The Portal counts directly from `agenda_breakout_assignments`, since organisers can read all rows.

### R9 — CSV uploads with the existing modal

- **Decision**: extend `CsvImportModal` with three **optional, backwards-compatible** props:
  - `refineResults(results) → results`: cross-row errors, e.g. the same attendee twice for a session.
  - `previewWarnings(validData) → string[]`: file-level warnings shown in the preview without blocking, e.g. over capacity.
  - `importAll(validData) → outcomes`: a grouped importer used instead of the per-row loop.
- **How each upload uses it**:
  - The rooms upload uses `importAll`: rows are grouped by session, and each session gets one `save_breakout_rooms(..., p_prune=false)` call.
  - The assignments upload uses the per-row path: an upsert on `(session_id, user_id)`, or a delete when the room is blank.
- **Rationale**: reuses the modal and its preview, paste and result steps, matching Feature 020's precedent of extending it with an option. Existing callers are unaffected.
- **Alternative**: a new modal. Rejected as a duplicate pattern (Principle V).

### R10 — Matching rules

- **Session**: same event, `lower(trim(title))` equal, and `starts_at` equal to the minute, using `parseFlexibleDate` exactly as the agenda CSV does (browser local time).
- **Room**: `lower(trim(name))` within the session. Uniqueness is enforced by a unique index on `(session_id, lower(btrim(name)))`.
- **Attendee**: `lower(trim(email))` against the event's `attendee` members, joined to `profiles`. Loaded once per upload with the same query shape the Members page uses.

### R11 — Assignments download

- **Decision**: built in the browser with `buildCsvTemplate(ASSIGNMENT_COLUMNS, rows)`. Rows cover every breakout session × every attendee, with a blank room for unassigned attendees, sorted by session start, then room, then email. The file is named `breakout-assignments-<event-slug-or-id>.csv`.

### R12 — Code placement

- **Pages and components own their data calls** (Principle II).
- **New `src/lib/breakoutRooms.ts`** holds pure helpers and types: JSON ⇄ form mapping, CSV column specs, row parsers and matchers. It has no Supabase calls.
- **New components:**
  - `src/components/portal/BreakoutRoomsEditor.tsx`: the existing `BreakoutRoomsPanel`, moved out of the 1,012-line page and extended with a facilitator picker, capacity, location and mode.
  - `src/components/portal/BreakoutAssignmentsModal.tsx`: headcounts, lists, assign/move/unassign.
- **The agenda page** wires the two upload buttons, the download and an entry point per breakout session (the session list already shows the room count, `agenda/page.tsx:743`).

### R13 — Audit

- **Decision**: attach the existing `log_content_change()` to rooms and blocks (both carry `event_id`). Don't audit assignments: attendee picks would flood the content audit log, and assignment rows record who and when themselves.

### R14 — Rollout safety (shared live database)

- **Additive only**: new tables, a nullable-safe new column with a default, functions and triggers. No existing column changes.
- **Pre-flight**: snapshot the current `breakout_rooms` JSON for the 3 sessions.
- **Post-flight**: compare it with the rebuilt JSON. It must match on ids, names, descriptions, facilitator names, block ids/titles/descriptions/locations and instants; key order and timestamp formatting may differ.
- **Idempotent backfill**: it skips sessions whose rooms already exist.
- **Mirroring**: also note the migration in `Evently-App` docs (`docs/MIGRATIONLOG.md`) so the app team knows the backend changed. The Portal repo owns the migration file.
