# Bendie Planner Backend Coverage Audit

**Purpose**: The canonical source for "which Bendie Planner backend data domains Bendie Portal currently manages, partially manages, or does not manage at all." Produced before scoping Feature 010 onward, so the remaining roadmap is driven by verified live-schema coverage gaps rather than by the modules that happen to already exist. Update this file (not a new one) the next time this audit needs revisiting — e.g., after Feature 010 ships, or if the live Planner schema changes materially.

**Method**: Every fact below was checked directly against the **live** Bendie Planner Supabase project (schema, RLS policies, triggers, functions, views) during this audit, and against this repository's actual Feature 001–009 source code. `Evently-App` (the Bendie attendee mobile client) was never used as evidence of Planner behavior. **The Bendie Planner client source itself is not available in this workspace** — every claim about what Planner's own app does or doesn't let a human do is marked **EXPECTED** (inferred from schema/RLS shape), never **VERIFIED**, unless it was independently confirmed some other way (e.g., a Portal integration route's own live behavior).

- **VERIFIED** = confirmed directly against live database/schema/RLS/trigger/view definitions, or against this repo's actual source code.
- **EXPECTED** = a reasonable inference from schema naming/shape/relationships about what a human user or the Planner client probably does with this data — not independently confirmed.

---

## 1. Product Purpose (context for this audit)

Bendie Portal's product goal is to be the operational management interface for **both** Bendie (attendee-facing) and Bendie Planner (ops-facing) backend data, so that an operations team never needs to open Supabase directly to prepare or run an event — for Bendie-only, Planner-only, and Both events alike. A Planner-only event in particular must be **fully** operationally manageable through Portal; the absence of the Bendie attendee product must never force manual Supabase editing for Planner data. This audit exists to determine, module by module, whether that's actually true today.

---

## 2. Current Portal Coverage (treated as foundational, not reassessed here)

| Feature | What it built | Scope |
|---|---|---|
| 001 | Portal↔Planner identity bridge, automatic role-derived staff sync; **narrow** one-way Agenda push (Bendie→Planner) and Travel pull (Planner→Bendie) | Integration plumbing, not full domain management (see §4.6/§4.2) |
| 005 | Planner Overview (read-only event identity + live session status) | Read-only |
| 006 | Product-aware navigation/event discovery (Planner-only vs. Both vs. Bendie-only) | Navigation infrastructure |
| 007 | Planner Tasks Management (full CRUD against `operational_tasks`) | **COMPLETE** management of one domain |
| 008 | Planner Staff & Module Permissions (administers `event_user_assignments`' 10 permission flags) | **COMPLETE** — permission administration, not content |
| 009 | Planner Vendors Management (full CRUD against `event_vendor_items`, notes-editable, lifecycle-cascade-authoritative) | **COMPLETE** management of one domain; manual browser acceptance intentionally deferred |

Feature 001's agenda push / travel pull are **explicitly narrow integration operations**, verified in this audit (§4.2, §4.6) to fall well short of full domain management — this was a live-code finding, not an assumption carried over from the roadmap brief.

---

## 3. Live Schema Inventory

**34 base tables + 28 views/materialized-view-derived views = 62 relations audited** in the live Bendie Planner `public` schema (fresh `information_schema.tables` query, this pass).

### 3.1 Classification key
1. **HUMAN-MANAGED EVENT DATA** — a person populates/maintains this for a specific event.
2. **SYSTEM/DERIVED DATA** — computed, trigger-generated, or a read-optimized view; no human writes it directly.
3. **AUTH/IDENTITY/PERMISSION INFRASTRUCTURE** — identity, membership, or permission plumbing.
4. **SUPPORTING/LOOKUP DATA** — small reference data, not itself the operational content.
5. **LEGACY/UNUSED/UNCERTAIN** — live, but evidence points to it being superseded, abandoned, or not part of the current active data path.

### 3.2 Full table classification

| Table/View | Rows | Class | Notes |
|---|---|---|---|
| `events` | 15 | 3 | Planner's own event identity row, keyed by `event_code` (`PORTAL-<uuid>`), bridged via `event_planner_links` |
| `profiles` | 27 | 3 | Planner-side staff identity (bridged via `profiles.planner_profile_id` on the Portal side) |
| `users` | 9 | 5 | **VERIFIED** distinct from `profiles`; not referenced by any FK inspected in this audit — likely a pre-`profiles` legacy identity table |
| `organizations` | 2 | 3 | Planner-side org, bridged via `organization_planner_links` (Feature 002) |
| `event_user_assignments` | 122 | 3 | Feature 008's entire domain — the permission-flag source of truth |
| `operational_tasks` | 524 | 1 | Feature 007 — **COMPLETE** |
| `event_vendor_items` | 48 | 1 | Feature 009 — **COMPLETE** |
| `event_checklist_items` | 16 | 1 | **NOT YET COVERED** — see §4.5 |
| `production_tasks` | 253 | 1 | **NOT YET COVERED** — see §4.1 |
| `staging_production_csv` | 33 | 5 | **VERIFIED** no `event_id` column at all, no RLS policies (default-deny); looks like a CSV-import staging table for `production_tasks`, likely populated by a Planner-side (or manual) import step outside this schema's own visibility |
| `event_task_counters` | 3 | 2 | **VERIFIED** — race-safe task-code counter, system-only |
| `session_summary_realtime`, `session_status_realtime`, `overall_session_summary` | 33/1/1 | 2 | Documented (Feature 005) as unreliable/excluded from Portal use; live-session-status derived data |
| `event_summary_realtime` | n/a (materialized) | 2 | `~1min pg_cron`-refreshed materialized view Feature 005's Planner Overview already reads; also the base for `production_events_v` |
| `production_events_v`, `production_sessions_v`, `production_event_status_counts_v` | views | 2 | **VERIFIED** live, actively-designed read views over `production_tasks`/`event_summary_realtime` — strong evidence Production is genuinely, currently consumed data, not dead schema |
| `passengers` | 342 | 1 | **VERIFIED** canonical event-attendee/delegate identity — passport, dietary requirements, contact info. Distinct from `profiles` (staff) and from Portal's `event_members`. `passengers_select_all` RLS policy is `USING (true)` — any authenticated Planner user can read every passenger globally, a real permissiveness worth noting, not something to imitate in Portal's own access design |
| `event_passengers` | 333 | 1 | Event↔passenger join table; **VERIFIED zero RLS policies** (default-deny for all non-service-role) |
| `all_flights_combined_table` | 511 | 1 | **VERIFIED** current, generic, event-scoped (`event_id NOT NULL`) canonical flight table, FK to `passengers` |
| `flights_cards_v`, `flights_feed_v`, `flights_status_counts_v` | views | 2 | **VERIFIED** built on `all_flights_combined_table` — the modern read-model family |
| `capetown`, `johburg_one`, `johburg_two`, `slt_vip` | 74/164/0/10 | 5 | **VERIFIED** legacy, per-city/region flight tables (each has its own `flight_one`/`flight_two`/`arrivaltime_one`/`date_time_one`-style columns) — a hardcoded-per-region predecessor to `all_flights_combined_table` |
| `flight_overview`, `individual_flight_overview` | views | 5 | **VERIFIED** built directly on the legacy city tables above — a parallel, superseded read-model family coexisting with the modern one |
| `hotel_bookings` | 85 | 1 | **VERIFIED** canonical, event+passenger-scoped rooming data (hotel, room number, rooming label, check-in/out). **RLS is `USING (true)` for both SELECT and ALL — completely ungated even by event membership**, a real, notable permissiveness |
| `hotel_bookings_with_roommates` | view | 2 | Derived rooming-pair view |
| `transport_logistics` | 3 | 5 | **VERIFIED** near-zero usage, no current view references it — an early, likely-superseded ground-transport table |
| `transport_movements` | 24 | 5 | **VERIFIED** no current view references it either — a second, also-likely-superseded generation |
| `vehicles` | 60 | 1 | **VERIFIED current canonical** — the base of the actively-maintained `ground_routes_v`/`ground_routes_feed_v`/`ground_routes_status_counts_v` view family |
| `vehicle_boardings` | 20 | 1 | **VERIFIED** current canonical boarding-status join for `vehicles`, used by `ground_routes_v`/`ground_routes_feed_v` |
| `vehicle_passengers` | 13 | 5 | **VERIFIED** denormalized (free-text passenger name/passport, no FK to `passengers`), still referenced by the older `combined_transport_summary` view but **not** by the newer `ground_routes_*` family — looks superseded but not fully retired |
| `passenger_vehicle_assignments` | 37 | 1 (uncertain) | **VERIFIED** more normalized than `vehicle_passengers` (real `passenger_id` FK, tracks `moved_from_vehicle_id`/`boarded_at`/`ended_at`) but **not yet referenced by any view found in this audit** — plausibly a newer, still-being-adopted model. **This ambiguity is a real, unresolved finding, not a gap in this audit's effort** — see §4.3. |
| `shuttles` | 10 | 5 | **VERIFIED** a structurally separate mini-system: `event_name` is free **text**, not an `event_id` FK — cannot be reliably joined to a canonical Planner event at all |
| `ground_routes_v`, `ground_routes_feed_v`, `ground_routes_status_counts_v`, `combined_transport_summary`, `transport_summary` | views | 2 | The read-model layer over the ground-transport tables above |
| `event_agenda_items` | 76 | 1 | **VERIFIED** rich schema (day/date, start/end, title/subtitle/description, speakers/mc, track/room, `is_parallel`, `sort_order`) with a `source_portal_session_id` column — **VERIFIED via Feature 001's actual push route source** that this is the write target of the one-way Bendie→Planner agenda push, which explicitly rejects any event without the Bendie product |
| `event_blueprints` | 10 | 1 | **VERIFIED** versioned file/document metadata (bucket, path, mime type, size, version, `is_active`, uploader) — genuine document-management domain, distinct in shape (needs file storage, not just row CRUD) from Production/Checklist/Vendors |
| `event_notifications` | 2198 | 2 | **VERIFIED 100% system/trigger-generated** — every write traced to `notify_checklist_item_change/created`, `notify_vendor_item_change/created`, `notify_operational_task_status_change`, `notify_production_task_change`. **No human-compose/send function exists anywhere in the schema.** |
| `event_notification_reads`, `device_push_tokens`, `notification_preferences` | 319/30/11 | 2/3 | Read-receipt, device-token, and per-user mute-preference plumbing — none of it event-operational content a Portal ops team would author |
| `event_checklist_items_v`, `event_vendor_items_v`, `operational_tasks_mobile_v`, `operational_tasks_status`, `task_assignee_options_v`, `user_event_assignments_v`, `dashboard_summary`, `all_travel_logs` | views | 2 | Existing read-model views for already-covered or supporting domains |

---

## 4. Mandatory Domain Deep-Dives

### 4.1 Production

**Canonical table**: `production_tasks` (253 rows). **Canonical read views**: `production_sessions_v` (adds computed `display_status`/`sort_key`), `production_events_v`, `production_event_status_counts_v`.

**Schema** (33 columns, **VERIFIED** fresh this pass): full run-of-show shape — `session_date`/`day_number`, `start_at`/`end_at`/`base_start_at`/`base_end_at` (a base-schedule vs. actual-schedule distinction), `session_title`, `participants`, `mode`, `mic_type`, `presentation`, `main_screen`, `notes`, `stage_hand_notes`, `guest_experience`, `task_type`, `track_name`, `room_name`, `sort_order`, `is_parallel`, `parent_production_id` (self-referencing — parallel/child sessions), `slides_bucket_name`/`slides_file_path`/`slides_file_name` (file attachments), `status`.

**RLS — VERIFIED genuinely inconsistent**: three policies exist. `production_tasks_select_assigned_or_admin` and `production_tasks_write_event_members` both grant access to **any** active `event_user_assignments` row, full stop — no flag check at all. A third, `production_tasks_write_assigned_or_admin`, additionally checks `can_manage_tasks OR can_view_tasks`, but since Postgres RLS policies for the same command are OR'd together, the looser `production_tasks_write_event_members` policy already grants write to every active assignment regardless of any flag. **Net effect: today, any active Planner staff assignment can write `production_tasks`, and `can_view_production` has zero enforcement effect at the database level.** This is a genuine, pre-existing schema/RLS inconsistency, not something Feature 009's own architecture pass invented — confirmed present again in this fresh audit.

**Permission model**: `can_view_production` exists in `event_user_assignments`; **no `can_manage_production` flag exists**. Given the RLS finding above, adding one and actually wiring it into the RLS policies (or at minimum into Portal's own independent authorization, as every prior Portal-Planner feature already does) would be necessary before Portal could offer permission-gated production-schedule management with any real teeth — otherwise Portal would be building a manage UI on top of a permission concept the database doesn't actually enforce.

**What Portal would need**: a schedule-grid-style CRUD surface (session title/time/track/room/type/notes at minimum), respecting the live parent/child (`parent_production_id`) and file-attachment (slides) shape. This is materially more complex than Vendors/Checklist/Tasks — closer in shape to Feature 007's own scope, but larger.

### 4.2 Logistics — Flights / Travel

**Canonical table**: `all_flights_combined_table` (511 rows, event-scoped). **Canonical read views**: `flights_cards_v`, `flights_feed_v`, `flights_status_counts_v`.

**Legacy, coexisting parallel schema — VERIFIED**: `capetown`/`johburg_one`/`johburg_two`/`slt_vip` (city/region-hardcoded flight tables) and their own view family `flight_overview`/`individual_flight_overview`. These are structurally distinct from, and not joined to, the modern `all_flights_combined_table` family. **Any Feature 010+ Logistics work must target `all_flights_combined_table` exclusively** — building against the legacy city tables would be building on schema the product has already moved away from.

**Feature 001's travel pull — VERIFIED insufficient for the product goal, not merely "narrow" by assumption**: read the actual route source (`src/app/api/admin/planner-pull-travel/route.ts`). It (a) reads `all_flights_combined_table` + `hotel_bookings` from Planner, (b) writes into **Portal's own Bendie-side** `attendee_travel_details` table for display on the Bendie "Attendee Travel" tab, and (c) **explicitly rejects any event without the Bendie product** ("This event does not use Bendie — there is nothing to pull travel data into"). It has **zero write path back into Planner's canonical flight/hotel tables** — Portal cannot create or edit a single flight or hotel-booking row in Planner today, for any event, Bendie or Planner-only. **A Planner-only event has no Portal path whatsoever to populate flight data.**

**People note**: flights are keyed to `passengers` (a Planner-native attendee/delegate identity), not to Portal's `event_members`/`profiles` — see §4.9.

### 4.3 Logistics — Hotels / Rooming

**Canonical table**: `hotel_bookings` (85 rows, event+passenger-scoped: hotel name, room number, rooming label, check-in/out dates, nights, special stay pattern, notes). **Read view**: `hotel_bookings_with_roommates`.

**RLS — VERIFIED, worth flagging plainly**: both policies are `USING (true)` — any authenticated Planner user can read or write **any** event's hotel bookings, with no event-membership check at all. This is a real, live permissiveness in Planner's own schema. It does not obligate Portal to replicate that permissiveness — every prior Portal↔Planner feature has always independently re-derived and enforced its own event-scoped authorization server-side regardless of what Planner's own RLS allows (since Portal always writes via service-role, bypassing RLS entirely) — but it is worth knowing when reasoning about the true blast radius of any bug in this area on the Planner side itself.

Feature 001's travel pull already reads this table (see §4.2) but, again, only to populate Portal's own Bendie-side display — no write path exists.

### 4.4 Logistics — Ground Transport

**RESOLVED — Feature 013 targeted discovery pass (2026-09-21).** The ambiguity below was left open by the original audit; it has now been conclusively resolved using two kinds of hard evidence the original pass didn't examine: (a) the live app's own write-path RPC functions (`assign_or_board_passenger`, `move_passenger_to_vehicle`, `unassign_passenger_from_vehicle`), and (b) real usage timelines/event coverage per table, not table presence or view references alone.

**Original finding (superseded by the resolution below)**: at least three overlapping attempts coexist — `transport_logistics`/`transport_movements`, `vehicles`+`vehicle_boardings`, `vehicle_passengers` vs. `passenger_vehicle_assignments`, and `shuttles`.

**Canonical active write model — VERIFIED via the live RPC layer**: `assign_or_board_passenger`, `move_passenger_to_vehicle`, and `unassign_passenger_from_vehicle` (the functions Planner's own client calls to manage ground transport) read `vehicles` only to resolve `movement_id`, and exclusively INSERT/UPDATE `passenger_vehicle_assignments` — none of the three ever touches `vehicle_boardings`, `vehicle_passengers`, or `transport_logistics`. This is the definitive signal: **`passenger_vehicle_assignments` is the sole canonical write target**, with `vehicles` (a specific vehicle instance — event- and date-scoped, not a reusable fleet master) and `transport_movements` (the logical route/date/time grouping a vehicle belongs to, `vehicles.movement_id` is a required FK) as its two required structural parents. A `BEFORE INSERT/UPDATE` trigger (`trg_validate_passenger_vehicle_assignment`) enforces, at the database level: the passenger must already be linked to the event via **`event_passengers`** (Feature 011's own model — Planner's own schema already requires it, independent of Portal), and the row's `vehicle_id`/`movement_id`/`event_id` must all agree with the vehicle's own values — service-role bypasses RLS but not this trigger (the Feature 009 lesson, directly confirmed applicable here).

**Usage-timeline evidence confirming `vehicle_boardings` is superseded, not parallel-current**: `vehicle_boardings`' 20 rows are 100% confined to a single event (`event_id=1`) with `created_at` entirely within 2026-03-05–2026-03-27. `passenger_vehicle_assignments` spans three events (1, 19, 22) with activity continuing through 2026-07-30 — including two events `vehicle_boardings` has zero presence in at all. `vehicle_boardings` was an early, abandoned attempt; the `ground_routes_v`/`ground_routes_feed_v`/`vehicle_boarding_counts_v` read-view family that still counts passengers from it is now a **stale dashboard for any event created after March 2026** — a live bug in Planner's own read model, not something Portal needs to replicate or fix.

**Final classification**: `passenger_vehicle_assignments` — **CANONICAL ACTIVE** (sole write path, trigger-validated, actively used across the most recent events in the dataset). `vehicles` — **CANONICAL ACTIVE** (required parent; one row = one vehicle instance for one movement, not a fleet master — no persistent vehicle registry exists or is needed). `transport_movements` — **CANONICAL ACTIVE** (required parent of `vehicles`; the route/date/time grouping). `vehicle_boardings` — **LEGACY** (abandoned March 2026; RPC layer never touches it). `vehicle_passengers` — **LEGACY** (denormalized, no passenger FK, referenced only by the also-legacy `combined_transport_summary` view). `transport_logistics` — **LEGACY** (3 rows, FKs to the abandoned `users` table not `profiles`, structurally unconnected to the vehicles/movements/assignments layer). `shuttles` — **SUPPORTING, OUT OF SCOPE** (no `event_id` FK at all — `event_name` is free text — a structurally separate, non-event-scoped mini-system; the only table anywhere in Ground Transport with a `driver_name` field, confirming it's a different tool, not part of the canonical event-scoped model).

**Participant relationship**: `passenger_vehicle_assignments.passenger_id` (bigint) is used exactly as a `passengers.passenger_id` reference (the trigger enforces this via `event_passengers`, though — a minor, non-blocking schema inconsistency worth noting — there is no formal FK constraint declared on this column, unlike every other passenger reference in the schema). One passenger can hold multiple assignments over time (historical ones marked `is_active=false`); one vehicle can hold many passengers (one row each). No participant system duplication needed — Feature 011's model is already the schema's own dependency.

**Flight relationship**: `passenger_vehicle_assignments.passenger_record_id` (nullable, FK → `all_flights_combined_table.record_id`) is an **optional** secondary link — none of the three write RPCs set or require it. Feature 013 may expose it as an optional "related flight leg" field, never a required one.

**Hotel relationship**: **None exists anywhere in the schema.** No FK from any Ground Transport table to `hotel_bookings`. A "hotel transfer" is only ever a free-text `route`/`movement_name` (e.g. "Hotel → Venue"), never a structural relationship.

**Vehicle/driver model**: `vehicles` has `vehicle_type`/`vehicle_no`/`max_capacity` (free text/integer, entered fresh per event-run, not a master record) and no driver concept at all — no `driver_name`/`driver_phone`/`driver_id` column exists anywhere in the canonical model (only the out-of-scope `shuttles` table has one). `vehicles.current_pax`/`num_pax` are **not** kept live-accurate under the current assignment-based flow (no trigger updates them from `passenger_vehicle_assignments`; the only capacity-maintaining trigger, `trg_increment_vehicle_capacity`, fires on the legacy `vehicle_passengers` table instead) — a future implementation should compute live occupancy by counting active `passenger_vehicle_assignments` rows rather than trusting these two stored columns.

**Safe CRUD boundary**: Creating/editing `transport_movements` and `vehicles` rows is fully safe (no blocking triggers; only a `UNIQUE(event_id, route, movement_date, pickup_time)` constraint on movements to respect). Passenger assignment/move/unassign should call the existing `assign_or_board_passenger`/`move_passenger_to_vehicle`/`unassign_passenger_from_vehicle` RPCs directly (via the service-role client's `.rpc()`) rather than hand-writing raw inserts against `passenger_vehicle_assignments` — they are plain (non-`SECURITY DEFINER`) functions with no internal auth check, they already correctly implement the "already assigned elsewhere → move" state machine and `moved_from_vehicle_id` history tracking, and reusing them avoids re-deriving non-trivial business logic Planner's own team already wrote and validated.

**Authorization**: No `can_view_ground_transport`/`can_manage_ground_transport` flag exists. RLS confirms the same "any active assignment" shape as Flights/Hotels. Per the explicit instruction to prefer consistency within an already-verified permission domain rather than raise a new product decision: Ground Transport reuses Feature 012's exact model — **View** = `can_view_logistics` or admin bypass; **Manage** = `canAdministerPlannerPermissions` only.

**Event mapping**: All three canonical tables (`transport_movements`, `vehicles`, `passenger_vehicle_assignments`) carry a plain, `NOT NULL` `event_id` integer column — cleanly resolvable via the standard `event_planner_links` pattern, no architectural concern.

**UI placement recommendation**: A third sub-tab (**Flights | Hotels | Ground Transport**) inside the existing Logistics workspace module — same permission domain, same optional Flight-leg linkage, same participant model, matching the coverage audit's own original grouping rationale (§7).

### 4.5 Checklist (fresh re-verification, not carried over from Feature 009's earlier pass)

**Canonical table**: `event_checklist_items` (16 rows). **Read view**: `event_checklist_items_v`.

**Schema — VERIFIED unchanged**: `category`, `item_name`, `quantity_text`, `specification`, `sort_order`, `owner_profile_id`, `is_sourced`/`sourced_at`/`sourced_by_profile_id`, `is_on_site`/`on_site_at`/`on_site_by_profile_id`, `notes`, `day_number`/`event_day_date`, `created_by_profile_id`.

**Triggers — VERIFIED, structurally near-identical to Vendors' own**: `trg_prevent_unsafe_checklist_item_edit` (blocks editing `category`/`item_name`/`quantity_text`/`specification`/`sort_order`/`event_id` outside a live Planner session — the identical class of constraint Feature 009 already navigated for Vendors; `notes` again excluded from the guard). `trg_notify_checklist_item_change`/`trg_notify_checklist_item_created` mirror Vendors' notification triggers exactly. **No stage-order-cascade trigger exists** — Checklist has only two independent boolean stages (`is_sourced`, `is_on_site`), not three, and there is no `enforce`-style trigger forcing an ordering between them; either can be set independently of the other. This is a **materially simpler** lifecycle than Vendors', not a twin of it in that respect.

**RLS — VERIFIED, and genuinely more complex than Vendors', a real finding worth being precise about**: the `SELECT` policy is `can_manage_event_checklist(event_id) OR (can_view_event_checklist(event_id) AND owner_profile_id = auth.uid())`. **A plain Viewer (`can_view_checklist` true, `can_manage_checklist` false) can only see checklist items they personally own — not the full event checklist.** Only a Manager (`can_manage_checklist` true) sees every item. The `UPDATE` policy mirrors this: a non-manager owner may update their own item even without any broader flag. This is structurally closer to Feature 007's self-assignee pattern than to Feature 009's simple two-tier Viewer/Manager model, and is a genuine complexity driver Feature 010 (if it targets Checklist) must design around explicitly — not something that can be copied mechanically from `plannerVendors.ts`.

**Permission model**: `can_view_checklist`/`can_manage_checklist` already exist in `event_user_assignments` and are already administered by Feature 008 — the same "Feature 008 already exposes this permission, Portal has no module for it yet" gap pattern as Vendors had before Feature 009.

### 4.6 Agenda / Programme

**Canonical table**: `event_agenda_items` (76 rows). Rich schema (§3.2) including day/date, start/end, title/subtitle/description, speakers/mc, track/room, parallel-session flag, sort order, and a `source_portal_session_id` column.

**Feature 001's agenda push — VERIFIED insufficient, from the actual route source**: `src/app/api/admin/planner-push-agenda/route.ts` pushes Bendie's own `agenda_sessions` into `event_agenda_items` via an upsert keyed on `(event_id, source_portal_session_id)`, **and explicitly rejects any event without the Bendie product** ("This event does not use Bendie — there is no agenda to synchronize"). **A Planner-only event has zero Portal path to populate its agenda at all** — there is no Bendie agenda to push from, by definition, and no direct Planner-agenda-authoring surface exists anywhere in Portal today. This is the identical class of gap as Flights (§4.2): a one-way, Bendie-gated bridge, not Planner-native management.

**No permission flag exists** for Agenda in `event_user_assignments` at all — unlike Checklist/Vendors/Tasks, a dedicated Agenda feature would need to introduce a new Planner-side permission concept (a schema change Feature 008 itself never needed for its existing three manage flags), a real complexity/scope consideration.

### 4.7 Notifications

**VERIFIED conclusively**: `event_notifications` is entirely system/trigger-generated (four trigger functions, zero human-compose function found anywhere in the schema). `can_view_notifications` exists purely to gate who **sees** these auto-generated notifications (already read-gated correctly wherever Portal reads Planner data that could trigger one, per Features 007/008/009's own already-verified attribution-degradation behavior). **No Portal management UI is needed or appropriate here** — there is nothing for a human to author. `notification_preferences`/`device_push_tokens` are per-user app settings (mute/unmute, push registration), not event-operational content Portal should manage either.

### 4.8 Blueprints / Prints / Event Documents

**Canonical table**: `event_blueprints` (10 rows) — versioned file metadata (bucket/path/filename/mime-type/size/version/`is_active`/uploader/notes), genuinely event-scoped.

This is real, human-managed operational data (venue diagrams, run-of-show printouts, etc.), but its shape is fundamentally a **file-upload-and-versioning** problem, not a row-editing problem — it needs Supabase Storage bucket integration in a way Production/Checklist/Vendors/Tasks never did. Recommendation in §6: keep it a **separate** feature from Production rather than folding it in, precisely because the implementation shape (storage integration, versioning UX) differs enough from schedule-grid editing to be its own coherent unit of work, even though the two are thematically adjacent.

### 4.9 People / Participants

**VERIFIED: not adequately covered by existing Portal Members + Feature 008, and this is a distinct, currently-uncovered domain, not an oversight to dismiss.** Planner's canonical attendee/delegate identity is `passengers` (342 rows: full name, passport, dietary requirements, gender, email, phone) joined to events via `event_passengers` (333 rows). This is **structurally separate** from:
- Portal's `event_members` (Portal-side event staff/role membership), and
- the Portal↔Planner **staff** identity bridge (`profiles.planner_profile_id`) Features 001/007/008/009 all build on.

`passengers`/`event_passengers` represent **event attendees/delegates who need logistics** (flights, hotels, ground transport) — not necessarily Planner "staff" with an `event_user_assignments` row at all. **Flights, Hotels, and Ground Transport all key off `passengers`, not off Portal's staff-oriented member model.** This means any Logistics feature (§4.2–4.4) has a hard prerequisite: Portal needs a way to know which `passengers` row corresponds to which trip/booking, and today Portal has **no create/manage path for `passengers`/`event_passengers` at all** — Feature 001's travel pull only *reads* existing Planner passenger rows to match them (by email) against existing Portal `event_members`, it never creates one. **A People/Participants (attendee-logistics-identity) module is very likely a genuine prerequisite for any real Logistics feature, not an optional nice-to-have** — see §6/§7.

### 4.10 Other domains surfaced by this audit

No further human-managed, event-scoped, currently-uncovered operational domain was found beyond what's listed above. `users` (5, legacy identity), `event_task_counters`/`event_summary_realtime`/`session_*_realtime` (system-derived), and the various `_v` read views were all classified as system/derived or supporting data, not candidates for their own management feature.

---

## 5. Permission-Flag → Module Mapping (`event_user_assignments`, 10 flags, VERIFIED fresh this pass)

| Flag | Governs | Portal Module | RLS Actually Enforces It? |
|---|---|---|---|
| `can_view_overview` | Planner Overview | Feature 005 (read-only) | N/A — Overview has no Planner-side write table |
| `can_view_production` | Production schedule (read) | **None** | **NO** — `production_tasks` RLS grants read to any active assignment regardless |
| `can_view_logistics` | Flights/Hotels/Ground Transport (read) | **None** | **NO** — same "any active assignment" pattern across all logistics tables |
| `can_view_tasks` / `can_manage_tasks` | Operational Tasks | Feature 007 — **COMPLETE** | Yes |
| `can_view_notifications` | Auto-generated notifications (read) | N/A — nothing to manage (§4.7) | Used by every `notify_*` trigger's recipient filter |
| `can_view_checklist` / `can_manage_checklist` | Checklist | **None yet** | Yes, plus the owner-carve-out (§4.5) |
| `can_view_vendors` / `can_manage_vendors` | Vendors | Feature 009 — **COMPLETE** | Yes |

**No flag exists at all** for Agenda, Blueprints, or People/Participants — a dedicated feature for any of these would need a new Planner-side permission concept, unlike Checklist/Vendors which reused flags Feature 008 had already built. **This is the single clearest "Feature 008 already grants a permission Portal has no module for" signal**: `can_view_production`/`can_view_logistics` already exist and are already assignable through Feature 008's UI today, but Portal has zero module consuming either.

---

## 6. Current Coverage Matrix

| Module | Canonical Table(s) | Canonical View(s) | Human-Managed? | Event-Scoped? | Current Portal Support | Feature | Read Perm. | Manage Perm. | Planner-Only Supported? | Manual Supabase Required? | Complexity | Recommended Action |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Tasks | `operational_tasks` | `operational_tasks_mobile_v`, `_status`, `task_assignee_options_v` | Yes | Yes | **COMPLETE** | 007 | `can_view_tasks` | `can_manage_tasks` | Yes | No | — | Maintain |
| Staff & Permissions | `event_user_assignments` | `user_event_assignments_v` | Yes | Yes | **COMPLETE** | 008 | n/a | n/a | Yes | No | — | Maintain |
| Vendors | `event_vendor_items` | `event_vendor_items_v` | Yes | Yes | **COMPLETE**\* | 009 | `can_view_vendors` | `can_manage_vendors` | Yes | No | — | Manual browser acceptance still pending (see §9) |
| Planner Overview | `event_summary_realtime` | `production_events_v` | No (derived) | Yes | **COMPLETE** (read-only by design) | 005 | `can_view_overview` | n/a | Yes | No | — | Maintain |
| Checklist | `event_checklist_items` | `event_checklist_items_v` | Yes | Yes | **NONE** | — | `can_view_checklist` (unused) | `can_manage_checklist` (unused) | No | **YES** | Medium (owner-carve-out RLS) | Feature 010 candidate |
| Production | `production_tasks` | `production_sessions_v` + 2 more | Yes | Yes | **NONE** | — | `can_view_production` (unenforced) | none exists | No | **YES** | High (RLS fix + parent/child + files) | Later feature |
| Blueprints | `event_blueprints` | — | Yes | Yes | **NONE** | — | none exists | none exists | No | **YES** | Medium-High (file storage) | Later feature, separate from Production |
| Flights/Travel | `all_flights_combined_table` | `flights_cards_v` + 2 more | Yes | Yes | **PARTIAL** (Bendie-side pull-and-display only; zero write into Planner) | 001 (partial) | `can_view_logistics` (unenforced) | none exists | **NO** | **YES** | High (new manage flag + People prerequisite) | Later feature, needs People first |
| Hotels/Rooming | `hotel_bookings` | `hotel_bookings_with_roommates` | Yes | Yes | **PARTIAL** (same pull-only path as Flights) | 001 (partial) | `can_view_logistics` (unenforced) | none exists | **NO** | **YES** | Medium-High | Bundle with Flights (see §7) |
| Ground Transport | `passenger_vehicle_assignments`+`vehicles`+`transport_movements` (canonical, resolved §4.4) | `ground_routes_v` family is now stale/legacy, not authoritative | Yes | Yes | **NONE** | — | `can_view_logistics` (real, unenforced at RLS but Portal honors it) | none exists (mirrors Feature 012) | **YES** | **YES** | Medium (once resolved) | Feature 013 candidate — ready for rapid implementation |
| Agenda | `event_agenda_items` | — | Yes | Yes | **PARTIAL** (one-way Bendie push only) | 001 (partial) | none exists | none exists | **NO** | **YES** | Medium-High (new permission flag) | Later feature |
| Notifications | `event_notifications` | — | **No** (system-generated) | Yes | **SYSTEM ONLY / NO UI NEEDED** | — | `can_view_notifications` | n/a | n/a | No | — | No feature needed |
| People/Participants | `passengers`+`event_passengers` | — | Yes | Yes | **NONE** | — | none exists | none exists | **NO** | **YES** | Medium | Likely prerequisite for Logistics (§7) |

\* Vendors is functionally complete; manual browser acceptance is the one remaining item, intentionally deferred per the current roadmap decision.

---

## 7. Feature Boundary Analysis

**Flights + Hotels + Ground Transport — recommend split, not one mega-feature**, for concrete, schema-grounded reasons:
- Flights and Hotels share the same participant model (`passengers`) and a clean, already-canonical table each (`all_flights_combined_table`, `hotel_bookings`) — genuinely coherent to bundle **with each other**.
- Ground Transport's own canonical model is **unresolved** (§4.4) — bundling it into the same feature as Flights/Hotels would force resolving that ambiguity under the time pressure of an unrelated feature's delivery, or ship Ground Transport on a table the live app may have already abandoned. It should be its own feature, gated on its own short discovery pass first.
- All three do share one real prerequisite: a working People/Participants module, so they should be **sequenced** (People → Flights+Hotels → Ground Transport-after-its-own-discovery), not necessarily merged.

**Production + Blueprints — recommend separate features**, despite thematic adjacency:
- Production is a schedule-grid content-editing problem (parent/child sessions, timing, track/room) — the same *shape* of problem Feature 007/009 already solved, just larger.
- Blueprints is a file-storage-and-versioning problem — a genuinely different technical shape (Supabase Storage bucket integration, upload UX, version history) that neither Feature 007 nor 009 needed at all.
- Forcing them into one feature would mean the file-upload half either drags out the schedule-editing half's delivery, or gets scoped down to fit — better as two coherent, independently-shippable units. (They may reasonably share a workspace tab or navigation grouping later; that's a UI decision, not a reason to merge the underlying feature work.)

**Checklist** stands alone — it is Vendors' closest sibling in table shape, but its RLS owner-carve-out (§4.5) makes it materially different in permission design, not a copy-paste of `plannerVendors.ts`.

**Agenda** stands alone — needs its own new permission flag and its own authoring surface; not naturally coupled to any other domain in this audit.

---

## 8. Prioritization Principle Applied

The test applied throughout: *"Can an operations team prepare and run a Planner-only event entirely through Bendie Portal without manually editing Supabase?"* — not "which table is easiest to build against."

By that test, the **highest-priority gaps** are the ones where Feature 001's existing integration actively **excludes** Planner-only events by design (Agenda, Flights, Hotels — all explicitly Bendie-product-gated) — these are the domains where a Planner-only event user hits a hard wall today, not just a UI inconvenience. Checklist and Production, while also uncovered, at least have **no** existing Bendie-only exclusion — a Planner-only event's staff simply has no Portal UI for them yet, which is a smaller gap than "structurally impossible today."

---

## 9. Recommended Remaining Feature Roadmap

| # | Name | Problem Solved | Canonical Table(s) | Why It Belongs Together | Dependencies | Complexity | Essential for Planner-Only Operational Completeness? |
|---|---|---|---|---|---|---|---|
| **010** | **Bendie Planner Checklist Management** | The nearest, best-understood remaining gap — Feature 008 already grants `can_view_checklist`/`can_manage_checklist` with no module consuming it | `event_checklist_items` | Own module — sibling-shaped to Vendors but not a copy (owner-carve-out RLS, 2-stage not 3-stage lifecycle) | Feature 008 (permissions), Feature 009's pattern (data-access/route/UI shape) | Medium | Yes — closes an existing permission-without-module gap |
| **011** | **Bendie Planner People / Participant Identity** | Portal cannot create/manage the `passengers`/`event_passengers` records that Flights/Hotels/Ground-Transport all depend on | `passengers`, `event_passengers` | Standalone identity domain, prerequisite for 012–013 | Feature 001 (existing email-matching precedent), Feature 008 (if participant-level permissions are desired) | Medium | Yes — structurally blocks real Logistics management otherwise |
| **012** | **Bendie Planner Flights & Hotels (Travel Logistics)** | Closes the two explicitly Bendie-gated, Planner-only-excluding gaps in §4.2/§4.3 | `all_flights_combined_table`, `hotel_bookings` | Share the same participant model and are each already individually canonical | Feature 011 (People), a **new** `can_manage_logistics` Planner-side permission flag (schema change) | High | Yes — currently the most concrete "Planner-only event structurally cannot do this" gap |
| **013** | **Bendie Planner Ground Transport** | Closes the third Logistics gap — canonical model now resolved (§4.4) | `passenger_vehicle_assignments`+`vehicles`+`transport_movements` | Shares the participant model and authorization domain with 012; recommended as a third Logistics sub-tab | Feature 011 (People), Feature 012 (Logistics workspace/permission precedent) | Medium | Yes — ready for rapid implementation |
| **014** | **Bendie Planner Production Schedule** | Closes the Production gap; also requires fixing the live RLS inconsistency (§4.1) or matching it with independent Portal-side enforcement | `production_tasks` | Own module — schedule-grid shape, parent/child sessions | Feature 008 (a genuinely-enforced `can_manage_production` flag is recommended here) | High | Yes |
| **015** | **Bendie Planner Blueprints / Documents** | Closes the document/file-versioning gap | `event_blueprints` | Own module — file storage shape, not row-editing | None beyond Features 001–009's established patterns | Medium-High (storage integration) | Desirable, not structurally blocking (teams can share files outside Portal as a fallback in a way they cannot "share" live flight/hotel/production data) |
| **016** | **Bendie Planner Agenda / Programme Management** | Closes the Agenda gap; needs a genuinely Planner-native authoring surface, not a Bendie-push extension | `event_agenda_items` | Own module — needs a new permission flag | A new Planner-side permission flag (schema change) | Medium-High | Yes for Planner-only events wanting a programme at all |

Do not stop at Feature 010 — the list above is what this audit's own evidence supports as genuinely required, not an arbitrarily bounded set.

---

## 10. Explicit Functional Completion Gate

**The Portal should not begin the broad UI/UX redesign merely because a feature-number milestone is reached.** The recommended gate, grounded in this audit's actual findings:

> **A Planner-only event can be created, staffed (Feature 008), and have every one of the following populated or maintained entirely through Bendie Portal, with zero direct Supabase access: Tasks (007 ✅), Vendors (009 ✅), Checklist (010), Participant/Passenger records (011), Flights and Hotels (012), Ground Transport (013), Production Schedule (014). Blueprints (015) and Agenda (016) are desirable but not gate-blocking**, since a team can fall back to sharing documents/programme information outside Portal without it being structurally impossible the way missing Flights/Hotels/Ground-Transport/Production/Checklist management currently is.

Concretely, the gate is satisfied when Features 010–014 are each independently complete (their own manual acceptance passed, not just implementation-complete) — at that point, re-evaluate whether 015/016 are still worth doing before or after the broader redesign, since neither blocks the core "run an event with zero manual Supabase" claim.

---

## 11. Testing Roadmap

Feature 009's manual browser acceptance is deferred, by design, until enough of the above is built that a single, realistic combined workflow can be tested meaningfully rather than piecemeal. Recommended trigger point: **after Feature 012 (Flights & Hotels) ships**, since that's the point at which a genuinely representative Planner-only event workflow first becomes fully exercisable —

> Create a Planner-only event → configure staff and permissions (008) → populate Tasks (007), Vendors (009), Checklist (010) → add participants (011) and their flights/hotels (012) → verify every canonical Planner table directly → navigate the full event workspace → confirm zero manual Supabase entry was required for any of the above.

Ground Transport (013), Production (014), Blueprints (015), and Agenda (016) can reasonably be added to this same combined pass once they exist, rather than triggering a second full combined-acceptance cycle — but the first combined pass should not wait for all six.

This section is a recommendation only — **no manual or live acceptance testing was performed as part of this audit**, per this turn's explicit instruction.

---

## 12. Schema/Client-Behavior Uncertainties Remaining

1. ~~Ground Transport's true canonical table is unresolved~~ — **RESOLVED**, see §4.4's Feature 013 update: `passenger_vehicle_assignments`+`vehicles`+`transport_movements` confirmed canonical via the live app's own RPC layer and real usage timelines.
2. **`staging_production_csv`'s actual population mechanism** is not visible from the schema alone (no `event_id`, no RLS policies, no trigger connecting it to `production_tasks`) — EXPECTED to be a manual or Planner-app-side CSV import staging step, not VERIFIED.
3. ~~Whether Planner's own client currently lets a human directly create/edit... any Logistics table at all~~ — **partially resolved for Production** by §13's current-source evidence (`ProductionRepository.ts` reads only, no authoring code found); Agenda/Blueprints/People-side client authoring remains EXPECTED, not VERIFIED, absent further source evidence.
4. **`hotel_bookings`' and `event_passengers`' RLS permissiveness/absence** (§3.2, §4.3) is a live characteristic of Planner's own schema today — worth flagging to whoever owns that project, independent of anything Portal does.

---

## 13. Current Bendie Planner Application Usage Verification (Features 013/014, 2026-09-21)

This section incorporates two new kinds of evidence not available to the original audit: **live-schema tracing of exact view/RPC dependency chains** (Ground Transport, Production) and, for Production specifically, **current Bendie Planner application source** (`domains/production/infrastructure/ProductionRepository.ts`). Distinguishing three evidence tiers throughout: **LIVE SCHEMA VERIFIED** (queried directly against the live database), **CURRENT PLANNER SOURCE VERIFIED** (read directly from the current application's own code), **INFERRED** (a reasonable but unconfirmed inference).

### Logistics — Ground Transport (Feature 013)

- **LIVE SCHEMA VERIFIED**: canonical write model is `transport_movements` (route/date/time grouping) → `vehicles` (a per-event vehicle instance, required FK to its movement) → `passenger_vehicle_assignments` (one passenger's assignment to one vehicle). Proven via the live app's own RPC functions (`assign_or_board_passenger`, `move_passenger_to_vehicle`, `unassign_passenger_from_vehicle`), which exclusively read/write these three tables, and via real usage timelines (`passenger_vehicle_assignments` active across 3 events through the most recent one in the dataset; the competing `vehicle_boardings` table's usage stopped entirely in March 2026, confined to a single event).
- **LIVE SCHEMA VERIFIED**: `vehicle_boardings`, `vehicle_passengers`, `transport_logistics` are legacy — no current RPC or trigger writes to any of them. `shuttles` has no `event_id` FK at all (`event_name` is free text) and is a structurally separate, non-event-scoped system.
- **LIVE SCHEMA VERIFIED**: no driver concept exists anywhere in the canonical model — no `driver_name`/`driver_phone`/`driver_id` column on `vehicles`, `transport_movements`, or `passenger_vehicle_assignments`. Only the out-of-scope `shuttles` table has a `driver_name` field.
- Hotels (`hotel_bookings`): unchanged from the original audit — **LIVE SCHEMA VERIFIED** canonical, multiple bookings per passenger supported, `accommodation_required=false` is a genuine "not needed" marker (Feature 012).
- Active flight table/view: unchanged from the original audit — **LIVE SCHEMA VERIFIED** `all_flights_combined_table` canonical, `flights_cards_v`/`flights_feed_v` the current read-model family (Feature 012).

### Production (Feature 014)

- **LIVE SCHEMA VERIFIED**: `production_sessions_v` is a plain, unfiltered `SELECT ... FROM production_tasks` — no joins, no other base table. `production_tasks` is the sole canonical writable base table for the production/run-of-show schedule.
- **LIVE SCHEMA VERIFIED**: `production_events_v` (and `production_event_status_counts_v`) are built from `event_summary_realtime` — an unrelated, event-level multi-event rollup, not a Feature 014 write target.
- **LIVE SCHEMA VERIFIED, previously undocumented**: `production_tasks` carries two `CHECK` constraints not surfaced by the original audit's FK/PK-only constraint query — `start_at`/`end_at` must satisfy `start_at < end_at` when both are non-null (same for `base_start_at`/`base_end_at`), and `status`, when non-null, must be exactly one of `pending`/`ready`/`active`/`completed`/`cancelled` (case-insensitive). Both were discovered only during Feature 014's live write verification (an initial implementation attempt violated the first one) and are now correctly handled.
- **CURRENT PLANNER SOURCE VERIFIED** (`ProductionRepository.ts` and related usage, per this turn's supplied evidence): the current Planner application reads `production_events_v`/`production_sessions_v`, uses `production_tasks` directly only for `slides_bucket_name`/`slides_file_path`/`slides_file_name`, and calls `get_production_status_counts`/`advance_production_session`. No authoring/write code path was found in the supplied source.
- **LIVE SCHEMA VERIFIED**: `advance_production_session` (`SECURITY DEFINER`) requires a session that is currently, actively running (`start_at <= now() < end_at`) — it snaps that session's end to `now()` and starts the next pending one immediately, raising an exception otherwise. This is a live production-day run-of-show control mechanism, not a schedule-authoring one — deliberately not used by Feature 014 (which authors future schedules, which by definition have no currently-active session).
- **LIVE SCHEMA VERIFIED**: `assigned_to` FKs to the legacy `users` table (not `profiles`) — the same abandoned-identity pattern as `transport_logistics.assigned_to` (§4.4). `location_override` exists on `production_tasks` but is not selected by `production_sessions_v` at all — invisible to the current read model. Neither is used by Feature 014.
- **CURRENT PLANNER SOURCE VERIFIED**: `session_summary_realtime`, `session_status_realtime`, `overall_session_summary`, and `staging_production_csv` have zero references in the supplied current source. Not implemented, not cleaned up, per explicit instruction — historical data may exist and cleanup is a separate concern.

### Blueprints

- **INFERRED only, not verified this pass** — no current Planner source for the Blueprints domain was supplied in this turn, and no fresh live-schema tracing of `event_blueprints`/its storage bucket was performed (out of scope for Features 013/014's discovery). The original audit's §4.8 characterization (file-metadata table, genuinely event-scoped, needs Storage bucket integration) stands unrevised.
