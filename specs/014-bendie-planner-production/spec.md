# Feature 014 Spec: Bendie Planner Production Management

Rapid-implementation lightweight spec. This is the schedule-**authoring** interface — not a copy of the current Planner app's read-only `ProductionRepository.ts`, and not Feature 016 Agenda.

## Scope

New standalone Planner event-workspace tab: **Production**. Manages the canonical run-of-show/production schedule an operations team builds before an event.

## Canonical Model (verified live + against current Planner app source, this pass)

- **`production_tasks`** — the sole canonical writable base table. `production_sessions_v` (what the current Planner app actually reads) is a **plain, unfiltered `SELECT ... FROM production_tasks`** — no joins, no other base table involved. Confirmed by tracing the view's SQL definition directly, not inferred.
- **`production_events_v`**/`event_summary_realtime` — an unrelated, event-level multi-event rollup (used by a different Planner screen), built from `events` + aggregate session counts. Not a Feature 014 write target; Feature 014 never touches it.
- No triggers block any field edit. `set_timestamp_production_tasks` auto-maintains `updated_at` (Portal never stamps it manually — genuinely simpler than Vendors/Checklist here). `trg_notify_production_task_change` generates the same class of notification as every other module (actor attribution degrades to generic under service-role, an accepted pre-existing pattern).
- `assigned_to` FKs to the **legacy `users` table** (not `profiles`) — the same abandoned-identity pattern found in `transport_logistics` during Feature 013 discovery. **Never populated or exposed** — there is no meaningful staff-assignment bridge here.
- `location_override` exists on the table but is **not selected by `production_sessions_v` at all** — invisible to the current Planner app. **Never exposed** — `room_name` (which the view does select) is the only location field Feature 014 uses.
- `parent_production_id` (self-FK, `NO ACTION` on delete) + `is_parallel` support genuine parallel/child sessions — exposed as an optional "parallel to" picker (select another session in the same event), not a new concept invented for this feature.

### The `start_at`/`end_at` vs. `base_start_at`/`base_end_at` mechanical finding

`production_sessions_v`'s automatic Active/Completed detection (`display_status`) depends entirely on `start_at`/`end_at` (timestamps) — `WHEN now() BETWEEN start_at AND end_at THEN 'Active'`. These are nullable at the schema level, but if left null the automatic detection can never fire (always falls through to `'Pending'`). `base_start_time`/`base_end_time` are the only `NOT NULL` timing columns, existing to support a live-day mechanism (see below) — Portal mirrors them to the same initial values as `start_at`/`end_at`/`start_time`/`end_time` at creation and on every edit during authoring (before any live-day advancement has occurred), so the schedule Portal builds actually drives the automatic status the current Planner app displays.

### `advance_production_session` — excluded from Feature 014 (verified, not assumed)

Traced the function body: it requires an session that is **currently, actively running** (`start_at <= now() < end_at`) to do anything at all — it snaps the active session's `end_at` to `now()` and starts the next pending session immediately, raising `'Session is not currently active'` otherwise. This is a **live production-day run-of-show control** mechanism, structurally incompatible with an authoring workflow building a future schedule (which, by definition, has no currently-active session). It is explicitly **not implemented** in Feature 014 — it belongs to a future "Production Live Control" feature, not schedule authoring. Portal instead lets the `status` column (a plain, unconstrained free-text field) be optionally set directly, and otherwise leaves Active/Completed detection to the view's own time-based logic.

## Field Classification

USER-MANAGED: `sessionTitle`, `sessionDate`, `startTime`, `endTime`, `dayNumber`, `taskType`, `trackName`, `roomName`, `isParallel`, `parentProductionId`, `sortOrder`, `participants`, `mode`, `micType`, `presentation`, `mainScreen`, `notes`, `stageHandNotes`, `guestExperience`, `status` (free text; a "Mark Completed" quick action sets it to `'Completed'`, clearing it reverts to automatic detection).
SYSTEM-MANAGED: `createdAt`, `updatedAt` (trigger-maintained), `displayStatus` (the view's computed status — read-only, never itself editable).
DERIVED: `base_start_at`/`base_end_at`/`base_start_time`/`base_end_time` — Portal-maintained internally (mirrored from the current schedule during authoring), never a form field.
ATTACHMENT METADATA: `slidesFileName` (and bucket/path) — **read-only display only** this pass; upload authoring is explicitly deferred (spec.md Exclusions) rather than expanding scope.
INTERNAL, never exposed: `production_id`, `assigned_to`, `location_override`, `shift_minutes`.

## Authorization (consistent with Features 012/013, not a new product decision)

`can_view_production` is a real, Feature-008-administered flag (same shape as `can_view_logistics` — a real view flag, no matching manage flag, permissive native RLS Portal does not mirror). Locked model, applying the now-established precedent directly: **View** = `can_view_production` on an active assignment, or `canAdministerPlannerPermissions`, or Planner platform-admin. **Manage** = `canAdministerPlannerPermissions` or Planner platform-admin only.

## Supported Operations

- List the schedule for the resolved event, grouped/sorted by `sessionDate` then `sortKey` (matching the view's own `COALESCE(sort_order, 999999)` ordering).
- Create a session (title + date required; all other fields optional) — sets `start_at`/`end_at` and mirrors `base_*` from the same initial values whenever both a start and end time are given.
- Edit any field, including re-mirroring `base_*` to the edited schedule (still pre-live-day; Feature 014 never implements live advancement).
- Delete — blocked with a clear message if the session is the `parent_production_id` of any other session (matches the live `NO ACTION` FK behavior).
- Optional "Mark Completed" / "Reset to automatic" quick actions on `status`.

## Security Requirements

- Every mutation resolves Portal `eventId` → workspace access → active `event_planner_links` → Planner `event_id` before touching any Production data.
- Cross-event session IDs return 404, never leaking existence.
- Parent-session picker is scoped to the resolved event only — never a cross-event `parent_production_id`.

## Acceptance Criteria

1. A Manage-capable caller can list, create, edit, and delete sessions; every mutation is visible immediately in `production_tasks` and correctly reflected through `production_sessions_v` (the same view the current Planner app reads).
2. A View-only (`can_view_production=true`, non-admin) caller sees the schedule but has no mutation controls.
3. A caller with neither is denied entirely.
4. Deleting a session that is another session's parallel parent is rejected with a clear message.
5. A newly created session with both start and end times shows the correct automatic `display_status` (Pending/Active/Completed) through `production_sessions_v`, proven by direct query, not assumed.
6. The module works fully for a Planner-only event.
7. Overview, Tasks, Vendors, Checklist, People, Flights, Hotels, Ground Transport, and Staff/Permissions are unaffected.

## Exclusions

- `advance_production_session` / any live production-day run-of-show control.
- Slide file upload (metadata display only).
- `location_override`, `assigned_to` (legacy, unused by the current read model / abandoned identity table).
- Any work on `session_summary_realtime`, `session_status_realtime`, `overall_session_summary`, `staging_production_csv` — confirmed via current Planner application source to have zero live references; not touched, not cleaned up.
- Feature 016 Agenda authoring — Production sessions are a distinct concept; no merge.
- Any new `event_user_assignments` permission flag.
