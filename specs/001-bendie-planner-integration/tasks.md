---
description: "Task list for Bendie Planner Integration"
---

# Tasks: Bendie Planner Integration

**Input**: Design documents from `/specs/001-bendie-planner-integration/` (`spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/planner-integration.md`, `quickstart.md`)

**Tests**: Not included — no automated test framework exists in this repository (confirmed in `research.md`/`plan.md`'s Technical Context) and none was requested in `spec.md`. Verification is the manual `quickstart.md` walkthrough (Phase G) plus the repository's existing lint/type-check/build gate.

**Organization**: Phases A–G below correspond to the template's Setup / Foundational / User-Story / Polish structure: **A = Setup**, **B = Foundational** (blocks every user story), **C–F = User Stories 1–4** from `spec.md` (in priority order, each independently testable per its own section of `quickstart.md`), **G = Polish & Cross-Cutting**.

**Revision note (post-`/speckit.analyze`)**: this version corrects two items found during the final consistency analysis — (1) the `event_planner_links` uniqueness design (T010, T016, T017) now correctly permits reusing a Planner event whose only prior link is inactive, matching spec FR-004's "actively linked" wording, and (2) a new task (T022) was inserted to actually surface member-sync status to an administrator (FR-013/SC-002), which the previous revision wrote to the database but never rendered anywhere. Everything from the old T022 onward is renumbered by one as a result (old T022–T032 → new T023–T033).

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files/systems, no dependency on an incomplete task)
- **[US#]**: Which `spec.md` user story this task belongs to — only used in Phases C–F

---

## Phase A: Setup — Pre-Implementation Verification

**Purpose**: Resolve every live-schema fact `research.md` flagged as unverified, before any dependent code is written. Nothing in Phase B or later may assume these facts without this phase completing first.

- [x] T001 Reauthorize/confirm connectivity for both the `supabase` (Portal) and `supabase-planner` (Planner) MCP connections — blocks every task below in this phase. **Result: both connected and queried successfully (Portal 50 tables, Planner 35 tables).**
- [x] T002 [P] Live-verify the current definitions of `is_event_member()` and `portal_is_global_admin()` against Portal's live schema via the `supabase` MCP (`research.md` item 1). **Result: both match the planning assumption exactly — `is_event_member(ev_id uuid, uid uuid default auth.uid())` checks `event_members`; `portal_is_global_admin()` checks `profiles.global_role = 'admin'`. No drift.**
- [x] T003 [P] Live-verify the current next-available migration number in `supabase/migrations/` via the `supabase` MCP (`research.md` item 4) — required before T010 can be numbered. **Result: the assumed "next sequential number" premise was wrong — see `research.md` item 4 for the full finding. The migration must be created as plain `bendie_planner_integration.sql` (no numeric prefix), applied via `apply_migration`. `data-model.md`/`plan.md`/T010 below corrected accordingly.**
- [x] T004 [P] Live-verify current column shapes of Portal's `profiles`, `event_members`, `agenda_sessions`, `attendee_travel_details`, `events` tables against `src/types/database.ts`, flagging any drift (`code-standards.md`'s hand-maintained-types verification note) — feeds T012. **Result: `event_members`, `agenda_sessions`, `attendee_travel_details`, and `events` all match `database.ts` exactly. One pre-existing, unrelated drift found: live `profiles` has a `linkedin_url` column not present in `database.ts` (a known, deliberate omission per `context/updatedmobilefeatures.md`'s 2026-08-14 changelog entry — attendee self-service field, not portal-editable). Not this feature's to fix; T012 should add `planner_profile_id` without needing to also correct this unrelated gap.**
- [x] T005 [P] Live-verify whether Bendie Planner's `profiles` table auto-seeds a row on `auth.admin.createUser()` (an on-signup trigger) via the `supabase-planner` MCP (`research.md` item 2) — blocks T021's identity-creation logic. **Result: confirmed NO trigger exists on Planner's `auth.users` (direct `pg_trigger` query returned zero rows). T020 must perform an explicit `profiles` insert after `auth.admin.createUser()` — the no-trigger contingency applies, not the auto-seed assumption.**
- [x] T006 [P] Live-verify Bendie Planner's `event_agenda_items.item_type` constraint (free text vs. enum, and if enum, its allowed values) via the `supabase-planner` MCP (`research.md` item 3) — blocks T023's `item_type` mapping. **Result: confirmed plain nullable `text`, no `CHECK` constraint of any kind on this column (the table's only constraints are its PK, an `event_id` FK, and an unrelated `start_at < end_at` check). Portal's `block_type` values pass through directly — no translation table needed.**
- [x] T007 [P] Live-verify current column shapes of Bendie Planner's `events`, `event_user_assignments`, `passengers`, `all_flights_combined_table`, `hotel_bookings` tables via the `supabase-planner` MCP (`research.md` item 5) — blocks T013 and every Phase C–F route task. **Result: all confirmed to match `plannerDatabase.ts`'s planned shape exactly, including PKs/FKs (`events.event_id` integer PK; `event_user_assignments`/`passengers`/`all_flights_combined_table`/`hotel_bookings`/`event_agenda_items` FKs all resolve as expected). The corrected event-link partial-unique-index design remains valid: `events.event_id` is confirmed `integer`, matching the planned `event_planner_links.planner_event_id integer` column with no type mismatch.**

**Checkpoint**: All five live-verification blockers resolved. Two purely technical corrections were applied to the planning artifacts as a result (migration naming in `research.md`/`data-model.md`/`plan.md`/T010 below; no product-scope change). Phase B may now begin.

---

## Phase B: Foundational — Database/Schema Foundation

**Purpose**: The shared schema, types, env config, and cross-project client every user story depends on. **Blocks all of Phases C–F.**

- [x] T008 [P] Add the `server-only` package to `package.json` (confirmed absent in `research.md`/`plan.md` Technical Context).
- [x] T009 [P] Add `PLANNER_SUPABASE_URL` and `PLANNER_SUPABASE_SERVICE_ROLE_KEY` to `.env.example`, with the existing "server-only, never `NEXT_PUBLIC_`" convention comment.
- [x] T010 Create `supabase/migrations/bendie_planner_integration.sql` (no numeric prefix — corrected per T003's live finding; apply via the `apply_migration` MCP tool, which assigns the version timestamp automatically) implementing, per `data-model.md` in full: the `event_planner_links` table (note: `planner_event_id` carries **no plain `UNIQUE` constraint** — instead a **partial unique index** `event_planner_links_active_planner_event_uidx ON event_planner_links (planner_event_id) WHERE is_active = true`, so an inactive (unlinked) row never blocks a different Portal event from linking to the same Planner event later, matching spec FR-004's "actively linked" wording exactly) + its admin-only `FOR ALL` RLS policy; `planner_profile_id` on `profiles`; `planner_assignment_id`/`planner_synced_at`/`planner_sync_status`/`planner_sync_error` on `event_members`; `planner_agenda_item_id`/`planner_synced_at` on `agenda_sessions`; `source_planner_key`/`synced_from_planner_at` on `attendee_travel_details`; the partial unique index `attendee_travel_details_planner_key_uidx`; and the two corrected restrictive RLS policies (`attendee_travel_details_planner_sourced_immutable_update` `FOR UPDATE` with both `USING`/`WITH CHECK (source_planner_key IS NULL)`, and `attendee_travel_details_planner_sourced_immutable_insert` `FOR INSERT WITH CHECK (source_planner_key IS NULL)`) — deliberately **not** extended to `DELETE`, per `data-model.md`'s `/speckit.analyze` verdict that spec.md's "read-only" language is edit-scoped only. Depends on T002, T003.
- [x] T011 Apply the migration from T010 to Portal's Supabase project via the `supabase` MCP; confirm via `list_tables`/`get_advisors` that RLS is enabled on the new table and no new advisories appear. Depends on T010.
- [x] T012 [P] Update `src/types/database.ts` by hand to add the `event_planner_links` table type and the new columns on `profiles`, `event_members`, `agenda_sessions`, `attendee_travel_details`. Depends on T004, T011.
- [x] T013 [P] Create `src/types/plannerDatabase.ts` — hand-maintained types for Planner's `profiles`, `events`, `event_user_assignments`, `event_agenda_items`, `passengers`, `all_flights_combined_table`, `hotel_bookings`, matching the shapes confirmed in T007. Depends on T007.
- [x] T014 Create `src/lib/plannerAdmin.ts` — a `server-only`-guarded `getPlannerAdminClient()` helper reading the env vars from T009 and typed with `PlannerDatabase` from T013, matching the construction pattern in `plan.md`'s Security Design. Depends on T008, T009, T013.

**Checkpoint**: Foundation ready — Phases C, D, E, and F may now proceed (C should land first since D/E/F all require an active Planner link to be testable end-to-end, but nothing technically blocks parallel work once T014 is done).

---

## Phase C: User Story 1 — Link a Portal event to its Bendie Planner event (Priority: P1) 🎯 MVP

**Goal**: An administrator can see, search, link, and unlink a Portal event's Bendie Planner counterpart (spec User Story 1, FR-001–007).

**Independent Test**: `quickstart.md` §1 — link, verify duplicate-link rejection, verify an unlinked-elsewhere Planner event is reusable, unlink, re-link.

- [x] T015 [P] [US1] Add the `bendie-planner` entry to `EVENT_SECTIONS` in `src/lib/eventSectionMeta.ts` (icon, label, description, badge colors reusing existing tokens per `ui-tokens.md` — no new hex values). Depends on Phase B only.
- [x] T016 [US1] Create `src/app/api/admin/planner-events/route.ts` (GET) — standard admin-gate pattern, then queries Planner's `events` table via `getPlannerAdminClient()` and returns a flat, unscoped list (spec decision #4 — no organization filtering); cross-references Portal's `event_planner_links` (active rows only) so each returned Planner event is annotated with whether it's already actively linked to a Portal event, per the corrected contract in `contracts/planner-integration.md` — an already-linked event is still listed, just marked unavailable, not hidden or silently offered as selectable. Depends on T014, T011.
- [x] T017 [US1] Create `src/app/api/admin/planner-link/route.ts` (POST) — admin-gate, then link/unlink against `event_planner_links` using the Portal's authenticated client (RLS already permits an admin write here); attempts the write and catches the corrected partial-unique-index violation (T010) to return the FR-004 rejection when a Planner event is already actively linked elsewhere; **permits** linking to a Planner event whose only prior link is inactive; re-linking replaces the existing row; unlinking sets `is_active = false` without deleting anything. Depends on T011.
- [x] T018 [US1] Create `src/app/portal/events/[eventId]/bendie-planner/page.tsx` — loads current link state; "browse/search available Planner events" UI calling T016, visually distinguishing/disabling any entry already marked as actively linked elsewhere; link/unlink actions calling T017; loading/empty/error states matching existing conventions (`SectionHeader`, pulse skeleton, `toast.error`); placeholder action areas for Members/Agenda/Travel status (wired live in Phases D–F). Depends on T015, T016, T017.

**Checkpoint**: User Story 1 fully functional and independently testable (`quickstart.md` §1).

---

## Phase D: User Story 2 — Eligible staff members automatically become available in Planner (Priority: P2)

**Goal**: Staff-tier members provisioned on a linked event sync to Planner automatically, with visible status, never blocking Portal provisioning (spec User Story 2, FR-008–014).

**Independent Test**: `quickstart.md` §2 — provision via all four paths, confirm attendee exclusion, confirm a Planner-side failure never fails the Portal action, confirm the sync outcome is actually visible to an administrator.

- [x] T019 [US2] Fix the `pointCurrentEventAt` gap in `src/app/portal/events/[eventId]/members/page.tsx`: add the missing call inside both `handleAddAllOrgMembers`'s and `handleAssignTeam`'s `runWithConcurrency` success paths (mirroring `handleAddMember`/`importMemberRow`'s existing calls) — resolves the pre-existing "missing event" bug and is the same hook point this feature needs anyway. Depends on Phase B only (no Planner dependency).
- [x] T020 [US2] Create `src/app/api/admin/planner-sync-member/route.ts` (POST) — admin-gate; no-ops (`skipped`) when the event has no active link or the member's role is `attendee` (defense in depth — the call sites in T021 already exclude attendees); resolves the person's Planner identity by email, creating one via `auth.admin.createUser()` (plus an explicit profile insert if T005 found no auto-seed trigger); maps the Portal role to Planner `access_role`/`can_view_*`/`can_manage_*` per `research.md`'s role table; upserts the Planner `event_user_assignments` row; stamps `event_members.planner_assignment_id`/`planner_synced_at`/`planner_sync_status`/`planner_sync_error`. Depends on T014, T011, T005.
- [x] T021 [US2] Add the fire-and-forget sync-trigger call (`fetch(...).catch(console.error)`, never awaited, never affecting the provisioning success/failure result) to all four provisioning paths in `members/page.tsx` — `handleAddMember`, `importMemberRow`, and the now-fixed `handleAddAllOrgMembers`/`handleAssignTeam` — calling T020, and never invoked at all for attendee-role provisioning. Depends on T019, T020.
- [x] T022 [US2] Add a Members sync-status summary to `bendie-planner/page.tsx` — list each staff-tier member of the event alongside their `planner_sync_status` (succeeded/failed/skipped) and, when failed, `planner_sync_error`, read from `event_members` (`/speckit.analyze` correction: FR-013/SC-002 require this status be visible to an administrator, and no prior task actually rendered it anywhere). Depends on T018, T020.

**Checkpoint**: User Story 2 fully functional and independently testable (`quickstart.md` §2), including the administrator-visible status requirement.

---

## Phase E: User Story 3 — Push the Portal agenda to the linked Planner event (Priority: P3)

**Goal**: An administrator can manually, idempotently push agenda content to Planner (spec User Story 3, FR-015–019).

**Independent Test**: `quickstart.md` §3 — push, edit-and-repush (no duplication), delete-and-repush (no Planner-side deletion).

- [x] T023 [US3] Create `src/app/api/admin/planner-push-agenda/route.ts` (POST) — admin-gate; rejects if unlinked; fetches `agenda_sessions` ordered by `starts_at`, then separately fetches `agenda_session_speakers` + `facilitators` per session and joins in code (matching `agenda/page.tsx`'s established two-query pattern — not an embedded PostgREST select, per `research.md`'s correction); derives `day_number`/`day_label`/`agenda_date` via the same UTC-date-slice grouping key `agenda/page.tsx` already uses (`dateKeyOf`-equivalent), not its locale-display formatting; maps `block_type` → `item_type` (passthrough, pending T006 — revise if T006 found a stricter constraint); flattens speakers to text; upserts into Planner's `event_agenda_items` keyed on `agenda_sessions.planner_agenda_item_id` (update if set, else insert and capture the new id); never deletes Planner-side content; stamps `planner_agenda_item_id`/`planner_synced_at` back onto the Portal row on success; returns a pushed/failed count. Depends on T014, T011, T006.
- [x] T024 [US3] Add the "Push to Planner" action and status display to `bendie-planner/page.tsx` (rendered only when linked; calls T023; toasts the pushed/failed count; shows last-synced summary). Depends on T018, T023.

**Checkpoint**: User Story 3 fully functional and independently testable (`quickstart.md` §3).

---

## Phase F: User Story 4 — Pull flight and hotel travel information from the linked Planner event (Priority: P4)

**Goal**: An administrator can manually, idempotently pull flight/hotel data from Planner, with Planner-sourced rows read-only and unmatched travelers safely skipped and reported (spec User Story 4, FR-020–026).

**Independent Test**: `quickstart.md` §4 — pull, edit-rejected, manual-row-unaffected, re-pull-updates-not-duplicates, unmatched-traveler reporting.

- [x] T025 [US4] Create `src/app/api/admin/planner-pull-travel/route.ts` (POST) — admin-gate; rejects if unlinked; reads Planner's `all_flights_combined_table` and `hotel_bookings` rows (plus their referenced `passengers`) scoped to the linked `planner_event_id`; builds an email→Portal-`user_id` map from this event's `event_members` joined to `profiles(email)` (event-scoped matching, not a global Portal search); skips and collects any unmatched Planner passenger rather than attaching them to the wrong person; builds `type:'flight'` rows (`source_planner_key: flight:<passenger_id>:<record_id>`) and `type:'other'` rows for hotel bookings (`source_planner_key: hotel:<passenger_id>:<booking_id>`) per `data-model.md`'s field mapping; **writes every row using the Portal service-role client specifically — never the authenticated client** (required for the write to succeed at all under the T010 restrictive RLS policies, per `plan.md`'s Remaining Technical Risks) via `upsert(..., { onConflict: 'event_id,source_planner_key' })`, stamping `synced_from_planner_at`; returns pulled/unmatched counts with unmatched identifiers for the administrator. Depends on T014, T011.
- [x] T026 [US4] Add the "Pull from Planner" action and status display to `bendie-planner/page.tsx` (rendered only when linked; calls T025; toasts pulled/unmatched counts). Depends on T018, T025.
- [x] T027 [P] [US4] Add the read-only visual treatment for Planner-sourced rows in `src/app/portal/events/[eventId]/attendee-travel/page.tsx` — a visible badge distinguishing any row with `source_planner_key` set, and disabling/hiding that row's **edit** action in the UI (the actual enforcement is the two restrictive RLS policies from T010, scoped to `INSERT`/`UPDATE` only — the row's existing delete action is deliberately left as-is, per `data-model.md`'s `/speckit.analyze` verdict that spec.md's "read-only" language is edit-scoped, not delete-scoped). Depends on T012.

**Checkpoint**: User Story 4 fully functional and independently testable (`quickstart.md` §4). All four user stories now complete.

---

## Phase G: Polish & Cross-Cutting Concerns

**Purpose**: Documentation and final verification, per Constitution Principle VII/VIII. Depends on Phases C–F being complete.

- [x] T028 [P] Update `context/progress-tracker.md` with a dated entry for this feature.
- [x] T029 [P] Update `context/schema-reference.md` documenting `event_planner_links` and the new tracking columns, and why they carry no foreign key into Planner's database (cross-project) — explicitly flag, but do **not** resolve, the duplication with `context/updatedmobilefeatures.md` (Constitution Principle VII; architecture-validation correction #4).
- [x] T030 [P] Update `context/architecture.md` with a new section describing the cross-project integration pattern (two Supabase projects, service-role-to-service-role, email-based identity bridging, which flows are automatic vs. manual).
- [x] T031 [P] Update `context/project-overview.md` only if it enumerates features at a level of detail where this integration belongs — check before assuming a change is needed.
- [x] T032 Run the repository's `lint`, `type-check`, and `build` scripts; resolve any failures before considering the feature done. **Result: all three clean.** Lint: no new errors (pre-existing warnings only, none introduced by this feature). Type-check: found and fixed a real issue — `plannerAdmin.ts` originally parameterized `createClient<PlannerDatabase>`, but this codebase's Supabase clients are all untyped (`supabaseClient.ts`, `create-user/route.ts`); a partial `Row`-only type broke insert/update inference across every new route. Fixed by dropping the generic to match the existing convention — `plannerDatabase.ts` remains as a hand-maintained reference, just not wired into the client. Build: succeeds, all 5 new routes and the new `bendie-planner` page appear correctly in the route manifest.
- [x] T033 Execute every manual scenario in `quickstart.md` (§1–§5) end-to-end against a real linked test event and confirm each expected outcome, including the security checks in §5 and the corrected link-reuse behavior in §1. **COMPLETED — full live pass, real browser, real dev server, real Planner secret, real temporary test accounts and data (all created and fully cleaned up afterward), not code review.** All five sections genuinely exercised end-to-end: §1 linking/duplicate-rejection/unlink/reuse-via-real-UI all confirmed (including a real 409 rejection and a real cross-event Planner-event reuse after unlink); §2 real staff-tier sync confirmed at every layer (Planner auth identity created, `profiles` row created, `event_user_assignments` row created, status shown as "succeeded" in the control page) and attendee exclusion confirmed (no assignment, no status entry); §3 agenda push confirmed idempotent (repeat push held at 2 items, not 4), edit-then-push confirmed update-in-place (same `agenda_item_id`, new title), delete-then-push confirmed no Planner-side deletion, speaker/mc/`item_type` mapping all confirmed correct in Planner's actual rows; §4 travel pull confirmed matched-import, idempotent repeat pull, value-change-then-repull updating the *same* Portal row (not a duplicate), manual rows left untouched, "From Planner" badge and Edit-button absence confirmed visually, and the RLS negative tests (via a genuine non-service-role anon-key client) confirmed SELECT works, UPDATE of a Planner-sourced row is rejected, and a forged INSERT is rejected by name-matched policy; §5 reconfirmed no real secret value appears in any response after the real key was added. **Two real implementation bugs were found and fixed live** (see below) — both required a corrected migration/code change, both retested and confirmed fixed, lint/type-check/build all rerun clean afterward.

**Post-review hardening pass (JSM `/code-review` findings)**: after `/review` returned APPROVED WITH MINOR FINDINGS, four additional findings were fixed and retested — unchecked Planner/Portal query errors in `planner-pull-travel` now return a structured `502`/`500` instead of a false-empty success; `getPlannerAdminClient()` in `planner-push-agenda`/`planner-pull-travel` is now try/caught matching `planner-sync-member`'s existing pattern; the `profiles` lookup failure in `planner-sync-member` no longer gets misreported as "no email on file"; and a corrective migration (`add_planner_sync_status_check.sql`) now enforces the `planner_sync_status` invariant `data-model.md` had always documented but the original migration never applied — live-verified via a rolled-back negative test. Two findings (the Planner `event_user_assignments` concurrency race, and the agenda-push lost-response duplicate-insert case) were investigated but **not fixed** — both require a Planner-side schema change outside this feature's approved boundary; see `plan.md`'s Remaining Technical Risks for the full analysis and the minimal schema change identified for each, should Planner's own team choose to apply it. The `STAFF_ROLES` duplication (route + page) was investigated and left as-is — no existing shared role-grouping constant in this codebase matches its 6-role shape, so centralizing it would be a new abstraction for two call sites, not a genuine reuse.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase A (Setup)**: No dependencies — start immediately. T001 blocks T002–T007; T002–T007 are mutually parallel.
- **Phase B (Foundational)**: Depends on Phase A completing (T002/T003/T004/T005/T006/T007 each gate a specific Phase B task as noted). **Blocks all of Phases C–F.**
- **Phases C–F (User Stories)**: All depend on Phase B (specifically T011 and T014) completing. Story dependency notes:
  - **Phase C (US1)** has no dependency on D/E/F — it is the true MVP slice (nothing else is demonstrable without a link existing).
  - **Phase D (US2)**, **Phase E (US3)**, **Phase F (US4)** each depend on Phase C's `bendie-planner/page.tsx` (T018) existing as a mounting point for their status/trigger UI (T022, T024, T026), but their **route logic** (T020, T023, T025) has no cross-dependency on each other and can be built in parallel once Phase B is done.
- **Phase G (Polish)**: Depends on Phases C–F all being complete.

### Parallel Opportunities

- Phase A: T002–T007 (six tasks) once T001 completes.
- Phase B: T008/T009 together; T012/T013 together once their respective blockers clear.
- Once Phase B and T018 (Phase C) are done: the three route-logic tasks T020, T023, T025 can be built in parallel by different people, since they touch entirely different files and different Planner tables.
- Phase F: T027 (attendee-travel UI) can run parallel to T025/T026 (different file).
- Phase G: T028–T031 (four doc updates) are all parallel; T032 and T033 run after all functional work is complete.

---

## Parallel Example: Phase A

```
Task: "Live-verify is_event_member()/portal_is_global_admin() via the supabase MCP"
Task: "Live-verify the next available migration number via the supabase MCP"
Task: "Live-verify Portal table shapes against src/types/database.ts"
Task: "Live-verify Planner profiles auto-seed trigger behavior via the supabase-planner MCP"
Task: "Live-verify Planner event_agenda_items.item_type constraint via the supabase-planner MCP"
Task: "Live-verify Planner events/event_user_assignments/passengers/flights/hotel_bookings shapes"
```

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase A (verification) and Phase B (foundation).
2. Complete Phase C (event linking).
3. **Stop and validate** against `quickstart.md` §1 independently — a working link/unlink control surface with no sync behavior yet is a legitimate, demonstrable increment.

### Incremental Delivery

1. A + B → foundation ready.
2. + C → linking works (MVP demo).
3. + D → staff members start appearing in Planner automatically, with visible status.
4. + E → agenda becomes pushable.
5. + F → travel data becomes pullable, read-only, and safely re-pullable.
6. + G → documented and verified complete.

Each increment adds value without breaking the previous one, and each of C–F is independently testable per its own `quickstart.md` section before moving on.

## Explicitly Not Tasked (carried forward from `spec.md`'s Out of Scope)

No task above implements: ordinary-attendee synchronization, ground-transfer synchronization, agenda breakout/sub-item synchronization, automatic/continuous agenda synchronization, agenda delete-synchronization, organization-level Planner linking, general-purpose two-way synchronization, an automatic retry system for failed syncs, or any resolution of the `schema-reference.md`/`updatedmobilefeatures.md` documentation duplication. If any of these appear necessary during implementation, treat that as a signal to stop and re-check against `spec.md` rather than silently adding scope.
