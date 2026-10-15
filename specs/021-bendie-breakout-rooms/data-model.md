# Data Model: Bendie Breakout Rooms (Feature 021)

Shared Bendie Supabase database, `public` schema. One migration: `supabase/migrations/bendie_breakout_rooms_and_assignments.sql`. Decisions referenced as R# are in [research.md](research.md).

## Changed table: `agenda_sessions`

| Column | Type | Rules |
|---|---|---|
| `breakout_mode` | `text NOT NULL DEFAULT 'attendee_choice'` | CHECK in (`attendee_choice`, `organizer_assigns`, `preassigned_switchable`). Meaningful only when the session has rooms. Written under the session's write policies. |

**New policies on `agenda_sessions` (FR-033, R1):** permissive `agenda_sessions_insert_org_admin` (WITH CHECK), `agenda_sessions_update_org_admin` (USING + WITH CHECK), `agenda_sessions_delete_org_admin` (USING), each `event_id IS NOT NULL AND is_event_org_admin(event_id)`. Existing policies are unchanged.

**Organiser predicate** used below: `is_event_host_or_organizer(event_id) OR is_event_org_admin(event_id) OR portal_is_global_admin()`.
| `breakout_rooms` | `jsonb` (existing) | **Now derived** from the tables below by `rebuild_breakout_rooms_json` (R4). The Portal stops writing it. |

## New table: `agenda_breakout_rooms`

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid PK DEFAULT gen_random_uuid()` | Stable identity (FR-002). |
| `session_id` | `uuid NOT NULL` → `agenda_sessions(id) ON DELETE CASCADE` | |
| `event_id` | `uuid` | Copied from the session by a BEFORE trigger. Used by RLS and audit (`log_content_change`). |
| `legacy_key` | `text NULL` | Pre-feature non-UUID room id (R2). Never set by the Portal. |
| `name` | `text NOT NULL` | Trimmed, 1–200 chars. UNIQUE INDEX `(session_id, lower(btrim(name)))` (FR-003). |
| `description` | `text NULL` | ≤ 2000 |
| `location` | `text NULL` | ≤ 200 |
| `facilitator_id` | `uuid NULL` → `facilitators(id) ON DELETE SET NULL` | Must belong to the same event (trigger check). |
| `facilitator_name` | `text NULL` | Legacy/free text; cleared when `facilitator_id` is set (R3). |
| `capacity` | `integer NULL` | CHECK `capacity IS NULL OR capacity >= 1`. NULL = unlimited. |
| `display_order` | `integer NOT NULL DEFAULT 0` | |
| `created_at`, `updated_at` | `timestamptz NOT NULL DEFAULT now()` | `updated_at` via existing `set_updated_at()`. |

- UNIQUE `(id, session_id)` — target of the assignments composite FK.
- Triggers: BEFORE INSERT/UPDATE (set `event_id`, check facilitator event, `set_updated_at`); AFTER INSERT/UPDATE/DELETE → `rebuild_breakout_rooms_json(session_id)` (both OLD and NEW session if it changed); AFTER → `log_content_change()`.
- RLS (R1): SELECT permissive `is_event_member(event_id) OR portal_is_global_admin()`; INSERT/UPDATE/DELETE permissive organiser predicate; restrictive event-scope policies mirroring `agenda_session_speakers`.

## New table: `agenda_breakout_room_items` (room mini-agenda)

| Column | Type | Rules |
|---|---|---|
| `id` | `uuid PK DEFAULT gen_random_uuid()` | Backfill keeps legacy block id when UUID; otherwise new UUID and `legacy_key`. |
| `room_id` | `uuid NOT NULL` → `agenda_breakout_rooms(id) ON DELETE CASCADE` | |
| `event_id` | `uuid` | Copied from the room (RLS, audit). |
| `legacy_key` | `text NULL` | |
| `title` | `text NOT NULL` | 1–300 |
| `description` | `text NULL` | ≤ 2000 |
| `starts_at`, `ends_at` | `timestamptz NULL` | CHECK `ends_at > starts_at` when both set. |
| `location` | `text NULL` | ≤ 200 |
| `display_order` | `integer NOT NULL DEFAULT 0` | |
| `created_at`, `updated_at` | `timestamptz NOT NULL DEFAULT now()` | |

- Triggers and RLS as rooms (rebuild JSON for the room's session; audit).

## New table: `agenda_breakout_assignments`

| Column | Type | Rules |
|---|---|---|
| `session_id` | `uuid NOT NULL` → `agenda_sessions(id) ON DELETE CASCADE` | PK part. |
| `user_id` | `uuid NOT NULL` | PK part. |
| `room_id` | `uuid NOT NULL` | FK `(room_id, session_id)` → `agenda_breakout_rooms(id, session_id) ON DELETE CASCADE`. |
| `event_id` | `uuid NOT NULL` | Set from session by trigger. FK `(event_id, user_id)` → `event_members(event_id, user_id) ON DELETE CASCADE` (FR-029). |
| `source` | `text NOT NULL` | CHECK in (`attendee`, `organizer`, `csv`). |
| `assigned_by` | `uuid NULL` → `profiles(id) ON DELETE SET NULL` | Stamped `auth.uid()` by trigger. |
| `assigned_at` | `timestamptz NOT NULL DEFAULT now()` | Stamped by trigger. |

- PRIMARY KEY `(session_id, user_id)` — at most one room per attendee per breakout (FR-009).
- Index `(room_id)` for headcounts.
- **Headcount** of a room = assignments in it whose `(event_id, user_id)` member currently has role `attendee` (R6). Used for capacity, availability and every Portal or CSV count. The delete-room warning counts all rows.
- BEFORE INSERT/UPDATE trigger (R6): set `event_id`; refuse if session has no event; refuse unless `event_members.role = 'attendee'`; refuse `source='attendee'` unless `user_id = auth.uid()`; stamp `assigned_by`/`assigned_at`; on UPDATE with unchanged `room_id` keep OLD `source`/`assigned_by`/`assigned_at`.
- RLS (R1): SELECT `user_id = auth.uid()` OR organiser predicate; INSERT/UPDATE/DELETE organiser predicate. No audit trigger (R13).

## Functions

| Function | Security | Purpose |
|---|---|---|
| `is_event_org_admin(ev_id uuid) returns boolean` | DEFINER, STABLE, `search_path=public`; EXECUTE to `authenticated` | R1: is the **caller** (`auth.uid()`) an owner/admin of the event's organisation (resolved from `events.organization_id`). No `uid` parameter. |
| `rebuild_breakout_rooms_json(p_session_id uuid) returns void` | DEFINER, `search_path=public`; EXECUTE revoked from `public`/`anon`/`authenticated` (trigger-only) | R4 derived JSON. |
| `save_breakout_rooms(p_session_id uuid, p_rooms jsonb, p_prune boolean) returns jsonb` | INVOKER | R5 atomic editor / CSV save. See [contracts/database-functions.md](contracts/database-functions.md). |
| `choose_breakout_room(p_room_id uuid) returns jsonb` | DEFINER; EXECUTE to `authenticated` only | R7 attendee pick. |
| `get_breakout_room_availability(p_session_id uuid) returns table(...)` | DEFINER; EXECUTE to `authenticated` only | R8 fullness for attendees. |

## Backfill (same migration, idempotent)

For each session whose `breakout_rooms` is a non-empty array and which has no rows in `agenda_breakout_rooms`: insert rooms in array order (`display_order` = index), ids per R2, `facilitator_name` from JSON (link `facilitator_id` only on a unique exact match — none today, L5), then blocks in array order with ids per R2 and times cast from the ISO strings (`''` → NULL). Then call `rebuild_breakout_rooms_json` for each backfilled session and run the R14 comparison.

## State: an attendee's assignment for one breakout

```text
(none) --attendee picks [mode ≠ organizer_assigns, seat free]--> attendee-sourced
(none) --organiser / CSV assigns--------------------------------> organizer- / csv-sourced
attendee-sourced --attendee switches [mode ≠ organizer_assigns, seat free]--> attendee-sourced (new room)
any --organiser / CSV assigns other room------------------------> organizer- / csv-sourced (new room)
organizer/csv-sourced --attendee switches [mode = preassigned_switchable or attendee_choice, seat free]--> attendee-sourced
any --organiser unassigns / CSV blank room / room deleted / attendee removed from event / session deleted--> (none)
```

## Hand-maintained types

Add to `src/types/database.ts`: `BreakoutMode`, `AgendaBreakoutRoom`, `AgendaBreakoutRoomItem`, `AgendaBreakoutAssignment` (+ `breakout_mode` on the agenda session type), and the `choose_breakout_room` result union.
