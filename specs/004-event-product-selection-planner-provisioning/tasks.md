---

description: "Task list for Feature 004: Event Product Selection & Planner Provisioning"
---

# Tasks: Event Product Selection & Planner Provisioning

**Input**: Design documents from `specs/004-event-product-selection-planner-provisioning/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/create-event.md](./contracts/create-event.md), [contracts/retry-planner-provisioning.md](./contracts/retry-planner-provisioning.md), [quickstart.md](./quickstart.md)

**Tests**: No automated test framework exists in this repository (unchanged from Features 001–003). "Test"/"verification" tasks below are live, manual verification against the real Portal and Planner databases, per `quickstart.md`'s A–J matrix — not automated test files, matching every prior feature's own convention.

**Organization**: Tasks are grouped by implementation phase (per the locked architecture in plan.md/research.md), not purely by user story, matching Feature 003's own established precedent for this repository — each task still carries a `[USn]` label wherever it maps to one of spec.md's 5 user stories. Foundational/cross-cutting/regression tasks carry no story label.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task, no shared security-sensitive file)
- **[Story]**: US1–US5 map to spec.md's 5 user stories (US1/US2 = P1, US3/US4/US5 = P2)

---

## Implementation status (2026-09-16, final)

`/speckit.implement` completed in full, including live database work. Both the Portal and Planner
Supabase projects were in scheduled maintenance for the first part of this session (`"Service
temporarily unavailable for scheduled maintenance"`, hit repeatedly, including right before starting
and again after all code was written) — per this feature's own "STOP-AND-REPORT RULE," no migration
was applied and no live verification was attempted while that held, and all code/migration-file
authoring proceeded in the meantime (this is why some tasks below cite "written, not yet applied" in
their own history before being superseded by a later live-applied confirmation). **The databases came
back before this implementation pass ended.** All 4 migrations were then applied and independently
re-verified live; the `create_event_with_products` RPC was exercised end-to-end for Bendie-only,
Planner-only (including the full cross-database provisioning sequence through to a real linked Planner
event), and Both product selections; both `/speckit.analyze` HIGH findings (provisioning-column
INSERT/UPDATE forgery, conflicting-payload idempotency) and both MEDIUM findings (mapping-drift,
RPC-internal mapping TOCTOU) were each independently reproduced and confirmed fixed against the real
privilege engine; the Feature 001 product guards were confirmed both necessary (old check alone would
have passed) and effective (new check correctly blocks); Feature 003 regressions (`event_members`
Planner-column hardening, role-immutability trigger) were re-confirmed unweakened. All temporary test
data (2 organizations, 3 test users, 6 events, their Planner-side counterparts and assignments) was
cleaned up and both projects' baseline counts (Portal: 7 organizations/16 events; Planner: 2
organizations/13 events) were re-confirmed exactly restored.

Five specific scenarios were **not independently exercised** as isolated tests this pass (T044, T064,
T073, T076, T077) — marked individually below with the honest reason (mostly: they require either
deliberately injecting a Planner-side network/credential failure, which risks real disruption to
exercise safely, or a dedicated multi-actor retry-endpoint HTTP test that requires a running Next.js
server this non-interactive session did not start). T076 in particular surfaced a genuine, worth-
recording design note: the CAS claim only reclaims from `pending`/`failed`, so a row genuinely stuck at
`provisioning` (e.g. from a real server crash) is **not** auto-recovered by a retry — this matches
research.md §14 scenario 12's own documented "known MVP limitation, requires administrator/support
action" framing exactly; it is a consistent, intentional property of the shipped design, not a gap
discovered late.

**Post-review corrective pass (2026-09-16, Phase 12, T091–T109)**: an independent review of the above
identified five actionable findings (R1 stuck-`provisioning` UX truthfulness, R2 a retry-contract
documentation defect, R3 a concurrent same-idempotency-key creation race, R4 an authorization-ordering
gap on the idempotency-replay path, R5 a duplicate-product-value validation gap) — all five resolved
and live-verified; see research.md §21 and tasks.md Phase 12 for full detail. Of the five originally
unexercised tasks: **T064, T073, T077 were executed** in this pass to the extent practical without a
running application server (T102/T103/T105 respectively — SQL/data-level reproduction of the same
logic, not the literal HTTP/TypeScript-module vehicle originally described) and are now checked off
with that distinction documented inline. **T044 and T076 remain correctly unchecked** — the independent
review directly proved their literal premise (recovery from a row stuck at `provisioning`) is not
achievable by the shipped, intentional design, not merely untested; see the corrective notes appended
directly after each.

---

## Phase 1: Setup / Schema Foundation

**Purpose**: All new database objects this feature needs, created and verified in isolation, before any application code depends on them.

- [x] T001 Live-verify (re-confirm, not assume) `public.events`'s current `pg_class.relacl`, full column list, and existing RLS policies against the Portal database, matching research.md/data-model.md's recorded evidence exactly — STOP and report if drift is found before proceeding. **Verified live during this same session's immediately preceding `/speckit.analyze` pass** (minutes before the Supabase maintenance outage began) — `relacl` confirmed as `arwdDxtm` for `authenticated`/`anon`, full 33-column list confirmed; not re-queried a second time once the outage started, per the Implementation status note above. Depends on: none.
- [x] T002 [P] Live-verify Planner's `public.events.event_code` datatype (`text`), `NOT NULL`, `character_maximum_length IS NULL`, and its `ux_events_event_code` UNIQUE index against the live Planner database — confirms the `'PORTAL-' || events.id` algorithm (research.md §10) has no length constraint to violate. **Verified live earlier this session** (architecture and analyze passes); not re-queried once the outage started. Depends on: none.
- [x] T003 [P] Live-verify Planner's `public.events.setup_date` has no `CHECK` constraint relating it to `start_date` (re-run the exact query used in research.md §13/spec.md Clarifications) — confirms `setup_date = start_date` remains a valid default. **Verified live earlier this session** (13/13 live events checked, 0 ever after `start_date`, no `CHECK` constraint present); not re-queried once the outage started. Depends on: none.
- [x] T004 Create migration `supabase/migrations/event_creation_provisioning_foundation.sql` adding to `public.events`: `planner_provisioning_status text NOT NULL DEFAULT 'not_required' CHECK (planner_provisioning_status IN ('not_required','pending','provisioning','succeeded','failed'))`, `planner_provisioning_error text`, `planner_provisioning_attempts integer NOT NULL DEFAULT 0`, `planner_provisioning_last_attempted_at timestamptz`, `planner_provisioning_succeeded_at timestamptz` — exact column set and CHECK per data-model.md. Depends on: T001.
- [x] T005 In the same migration file as T004, create `public.event_creation_requests (idempotency_key uuid PRIMARY KEY, event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE, organization_id uuid NOT NULL, products text[] NOT NULL, created_at timestamptz NOT NULL DEFAULT now())` — `organization_id`/`products` are stored alongside the key so a later reuse of the same key with a *different* payload can be detected and rejected rather than silently returning an unrelated event (data-model.md/research.md §7, corrected during `/speckit.analyze`). No RLS policy granting any privilege to `authenticated`/`anon` on this table (only `create_event_with_products`, running as its `SECURITY DEFINER` owner, ever touches it). Depends on: T004.
- [x] T006 In the same migration file, correct `public.events`'s column privileges — **expanded during `/speckit.analyze` to cover `INSERT`/`UPDATE`, not only `SELECT`, closing a real gap the first pass of this task missed**: (a) `REVOKE SELECT ON public.events FROM authenticated, anon;` then `GRANT SELECT (` the full existing 33-column list plus `planner_provisioning_status, planner_provisioning_attempts, planner_provisioning_last_attempted_at, planner_provisioning_succeeded_at` — excluding `planner_provisioning_error` — `) ON public.events TO authenticated, anon;`; (b) `REVOKE INSERT, UPDATE ON public.events FROM authenticated, anon;` then `GRANT INSERT (...)`/`GRANT UPDATE (...)` on exactly the 33 pre-existing columns only — **all five new provisioning columns excluded from both `INSERT` and `UPDATE`, not just from `SELECT`** — exactly as data-model.md's "Column privilege change" section now specifies (full table-level-revoke-then-regrant for all three privilege types, per the Feature 003 `event_members` lesson, applied completely this time). Depends on: T004.
- [x] T007 Apply the `event_creation_provisioning_foundation.sql` migration (T004–T006) via `apply_migration` against the Portal project; confirm via `list_migrations`. Depends on: T004, T005, T006.
- [x] T008 Live-verify T006's grant correction actually took effect: query `information_schema.column_privileges` and `pg_class.relacl` for `public.events` and confirm `authenticated`/`anon` hold column-level `SELECT` on every column except `planner_provisioning_error`, and hold **no** table-level `SELECT` grant. Depends on: T007.
- [x] T009 [P] Update `src/types/database.ts` (hand-maintained) with the five new `events` columns and the new `event_creation_requests` table shape. Depends on: T007.
- [x] T010 [P] Append this migration to `supabase/migrations/MIGRATION_ORDER.md`'s documented fresh-bootstrap order (after the current last entry), per Feature 003's established convention. Depends on: T007.

**Checkpoint**: New schema exists, is live-verified byte-for-byte, and customer-facing column privileges are confirmed correct before any RPC or route is built on top of it.

---

## Phase 2: Atomic Portal Creation (SECURITY DEFINER RPC)

**Purpose**: `create_event_with_products` — the single, atomic mechanism that closes the pre-existing gap (no `event_products`/`event_members` at creation) for every product mix. (FR-001–FR-009, FR-021, FR-025–FR-028, FR-031–FR-034)

- [x] T011 Create migration `supabase/migrations/create_event_with_products_function.sql` defining `public.create_event_with_products(p_idempotency_key uuid, p_organization_id uuid, p_name text, p_location text, p_starts_at timestamptz, p_ends_at timestamptz, p_products text[]) RETURNS TABLE(event_id uuid, planner_provisioning_status text)`, `LANGUAGE plpgsql`, `SECURITY DEFINER`, `SET search_path TO 'public'`. Depends on: T007.
- [x] T012 [P] Within T011's function body, implement the idempotency-key check as the function's first statement: `SELECT event_id, organization_id, products FROM event_creation_requests WHERE idempotency_key = p_idempotency_key` — if found AND `organization_id = p_organization_id AND products = p_products`, `SELECT`/`RETURN` that event's current `id, planner_provisioning_status` immediately with no further writes; if found with a **different** `organization_id`/`products`, `RAISE EXCEPTION` with a distinguishable `idempotency_conflict` condition rather than returning the unrelated event (research.md §7, FR-023, corrected during `/speckit.analyze` to compare payload, not just the key). Depends on: T011.
- [x] T013 [P] Within T011's function body, implement the authorization re-check: `portal_is_global_admin() OR is_organization_admin(p_organization_id)` — `events_insert_creator`'s exact existing predicate, reused verbatim, not reinvented — `RAISE EXCEPTION` with a distinguishable error code/message if neither holds (FR-025, FR-031). Depends on: T011.
- [x] T014 Within T011's function body, implement per-product entitlement validation: for every value in `p_products`, an active (`is_active = true`) `organization_products` row for `p_organization_id` must exist — `RAISE EXCEPTION` naming the specific missing/inactive product if not (FR-001, FR-005, FR-006, FR-032). **Expanded during `/speckit.analyze`**: immediately after the entitlement check, also implement the internal mapping re-check — if `'planner'` is in `p_products`, an `organization_planner_links` row for `p_organization_id` MUST exist, `RAISE EXCEPTION` with a distinguishable `planner_mapping_missing` condition if not. This closes a TOCTOU gap between the calling route's own Phase 0 mapping check (T025) and this RPC's transaction actually running — without it, a mapping removed in that narrow window would still let the RPC proceed to write `events`/`event_products`/`event_members`, violating FR-019's "zero writes" guarantee in a rare race (research.md §3 step 4, §5 Phase 0/1 note). Depends on: T013.
- [x] T015 Within T011's function body, `INSERT INTO events (organization_id, name, location, starts_at, ends_at, status, created_by) VALUES (...)` using `auth.uid()` as `created_by`, `status = 'draft'` — identical field set to today's `CreateEventModal.tsx` insert (FR-007). Depends on: T014.
- [x] T016 [P] Within T011's function body, `INSERT INTO event_products (event_id, product_key, organization_id)` once per entry in `p_products` — never any product not present in the validated array (FR-003, FR-006). Depends on: T015.
- [x] T017 [P] Within T011's function body, `INSERT INTO event_members (event_id, user_id, organization_id, role) VALUES (new_event_id, auth.uid(), p_organization_id, 'admin')` — every product mix, unconditionally (FR-008, FR-009). Depends on: T015.
- [x] T018 Within T011's function body, set `planner_provisioning_status = 'not_required'` if `'planner'` is not in `p_products`, else `'pending'`, on the just-inserted `events` row (FR-021, data-model.md's state-transition diagram — `not_required` is set here, never anywhere else). Depends on: T016.
- [x] T019 Within T011's function body, `INSERT INTO event_creation_requests (idempotency_key, event_id) VALUES (p_idempotency_key, new_event_id)` as the function's last write before returning (research.md §7). Depends on: T012, T015.
- [x] T020 Apply `create_event_with_products_function.sql` via `apply_migration`; confirm via `list_migrations`. Depends on: T011–T019.
- [x] T021 Create migration `supabase/migrations/create_event_with_products_execute_lockdown.sql`: `REVOKE EXECUTE ON FUNCTION public.create_event_with_products(...) FROM PUBLIC, anon; GRANT EXECUTE ON FUNCTION public.create_event_with_products(...) TO authenticated;` — mirrors `get_event_planner_sync_status()`'s exact, already-audited grant shape (plan.md Constitution Check, data-model.md). Apply and verify via `pg_proc.proacl`. Depends on: T020.
- [x] T022 Live-verify (via `pg_proc.proconfig`/`pg_get_functiondef`) that `create_event_with_products` has an explicit `search_path`, is genuinely `SECURITY DEFINER`, and performs no dynamic SQL / no arbitrary-table mutation (every `INSERT` target is a fixed literal table/column list in the function body, not built from a parameter). Depends on: T020.

**Checkpoint**: Portal-side atomic creation is a single, hardened, live-verified database function — no browser-side multi-row orchestration exists anywhere.

---

## Phase 3: Server Creation Orchestrator

**Purpose**: `POST /api/events/create` — the server boundary that performs entitlement/mapping preflight (before any write) and calls Phase 2's RPC. (FR-001–FR-006, FR-018–FR-020, FR-025–FR-028)

- [x] T023 [US1][US2][US3] Create `src/app/api/events/create/route.ts`: parse and validate the request body per `contracts/create-event.md` (`idempotencyKey`, `organizationId`, `name`, `location`, `startsAt`, `endsAt`, `products`) — reject malformed payloads with `400 invalid_request` before any database call. Depends on: T021.
- [x] T024 [US1][US2][US3] In `create/route.ts`, authenticate the caller via the existing `createServerClient` cookie pattern (matching every `app/api/admin/**` route's own shape) — `401 not_authenticated` if no session. Depends on: T023.
- [x] T025 [US1][US2][US3] In `create/route.ts`, if `products` includes `"planner"`, read `organization_planner_links` for `organizationId` — if absent, return `409 planner_mapping_missing` with the exact FR-019 message **before calling `create_event_with_products` at all** — zero writes (FR-018, FR-019, US4). Depends on: T024.
- [x] T026 [US1][US2][US3] In `create/route.ts`, call `create_event_with_products` via the authenticated client (not service-role — the RPC's own `SECURITY DEFINER` privilege is what's elevated, the caller identity stays the real user's) with the validated/derived parameters; map its exception codes (unauthorized, entitlement-invalid) to `403`/`422` per `contracts/create-event.md`'s error table. Depends on: T025.
- [x] T027 [US1] In `create/route.ts`, when the resolved product selection is Bendie-only (or the RPC returns `planner_provisioning_status = 'not_required'`), return the success response immediately — no Phase 4 orchestration is entered. Depends on: T026.
- [x] T028 [US2][US3] In `create/route.ts`, when `planner_provisioning_status = 'pending'` is returned, proceed synchronously into the Phase 2 (Planner provisioning) orchestration described in Phase 4 of this task list below, within the same request/response cycle (research.md §5, §18 synchronous decision). Depends on: T026.
- [x] T029 [P] In `create/route.ts`, ensure every error response matches `contracts/create-event.md`'s table exactly (status code + machine-readable `reason` + plain-language `message`) and never includes a raw database error, stack trace, or credential detail (FR-024, FR-027). Depends on: T023–T028.

**Checkpoint**: A single server route now owns event creation end-to-end for Bendie-only requests; Planner-inclusive requests are wired to continue into Phase 4 below within the same request.

---

## Phase 4: Planner Provisioning & Idempotency

**Purpose**: The cross-database orchestration (Phases 2–4 of research.md §5) — event-code generation, Planner event creation/recovery, counterpart link, finalize. (FR-010–FR-017, FR-021–FR-030, US2, US3, US5)

- [x] T030 [US2][US3] Implement the deterministic event-code helper (e.g. `src/lib/plannerEventCode.ts`): `export function plannerEventCode(portalEventId: string) { return \`PORTAL-${portalEventId}\`; }` — pure function, no I/O, unit-testable in isolation (research.md §10). Depends on: T002.
- [x] T031 [US2][US3] In `create/route.ts`'s Planner-provisioning branch, perform the CAS claim: `UPDATE events SET planner_provisioning_status = 'provisioning', planner_provisioning_attempts = planner_provisioning_attempts + 1, planner_provisioning_last_attempted_at = now() WHERE id = $1 AND planner_provisioning_status IN ('pending','failed')` via Portal's service-role client — if 0 rows affected, return the current status without attempting Planner work (research.md §9, §11 concurrency). Depends on: T028.
- [x] T032 [US2][US3] Immediately after the successful claim, re-verify (not reuse from Phase 3) that the `'planner'` entitlement is still active for the organization and that `organization_planner_links` still has a row — on either failing, `UPDATE events SET planner_provisioning_status = 'failed', planner_provisioning_error = ...` and return the appropriate error (FR-029, failure-matrix scenarios 9–10). Depends on: T031.
- [x] T033 [US2][US3] Compute the event code via T030; using `getPlannerAdminClient()` (`src/lib/plannerAdmin.ts`, reused unmodified), `SELECT event_id, organization_id FROM events WHERE event_code = $1` on the Planner database — if found, compare its `organization_id` against `organization_planner_links.planner_organization_id` (as re-read in T032) for this organization: **match** → reuse it (research.md §8, defense-in-depth); **mismatch** → this is the mapping-drift case (research.md §5 Phase 2 step 4, §14 scenario 15, added during `/speckit.analyze`) — do NOT reuse it and do NOT proceed to T034 (never create a second Planner event for the same Portal event); instead follow the distinct mapping-drift failure handling implemented in T086 below, recording a `mapping_drift` diagnostic naming both organization ids. Depends on: T032.
- [x] T034 [US2][US3] If no existing Planner event was found in T033 (a clean miss, not a mismatch), `INSERT INTO events (event_code, event_title, location, start_date, end_date, setup_date, organization_id) VALUES (...)` on the Planner database via the service-role client, using the field mapping in data-model.md/research.md §13 (`event_title` from Portal `name`, `location` direct copy, `start_date`/`end_date` from `starts_at`/`ends_at` date parts, `setup_date` defaulting to `start_date`, `organization_id` from the resolved `planner_organization_id`) — `description`/`attendees` left `NULL`, never invented. Depends on: T033.
- [x] T035 [US2][US3] On any ordinary failure in T034 (not the mapping-drift case — see T086), `UPDATE events SET planner_provisioning_status = 'failed', planner_provisioning_error = <sanitized-but-informative text>` via Portal's service-role client and return the `contracts/create-event.md` partial-outcome response (`200 ok:true, plannerProvisioningStatus:"failed"`) — never surface the raw Planner API error to the customer-facing response body (FR-024). Depends on: T034.
- [x] T036 [US2][US3] On success of T033/T034, `UPSERT event_planner_links (event_id, planner_event_id, planner_event_title, is_active, linked_by, updated_at) ON CONFLICT (event_id) DO UPDATE ...` via **Portal's** service-role client (this table's RLS is admin-only; the service-role client deliberately bypasses it, matching Feature 001's own established write pattern) — the single canonical counterpart mapping, no new table (FR-015, FR-016, FR-017). Depends on: T034.
- [x] T037 [US2][US3] On failure of T036, mark `planner_provisioning_status = 'failed'` with diagnostic detail exactly as T035; on success, proceed to T038. Depends on: T036.
- [x] T038 [US2][US3] Only after T036 succeeds, `UPDATE events SET planner_provisioning_status = 'succeeded', planner_provisioning_succeeded_at = now() WHERE id = $1` — the sole code path in the entire codebase that ever writes `'succeeded'` (FR-023, data-model.md's by-construction guarantee). Depends on: T037.
- [x] T039 [US2][US3] If the creator's new `event_members.role` is staff-eligible (it always is — `'admin'` ∈ `STAFF_ROLES`), invoke the **existing** staff-sync logic from `src/app/api/admin/planner-sync-member/route.ts` (extract its member-sync body into a small shared function, e.g. `src/lib/plannerStaffSync.ts`, called by both routes, rather than duplicating it) once, after T038 succeeds — reusing, not reimplementing, Feature 001's capability (FR-013, research.md §11/§17). Depends on: T038.
- [x] T040 [P] Create `src/app/api/events/[eventId]/retry-planner-provisioning/route.ts` per `contracts/retry-planner-provisioning.md`: authenticate, re-verify authorization against the event's organization (identical predicate to creation, not restricted to the original creator), then re-enter T031–T039's sequence for the existing `eventId` — never calling `create_event_with_products` (FR-022, FR-026, FR-028, US5). Depends on: T030–T039.
- [x] T041 [P] In the retry route, return `404 event_not_found` if the event's `planner_provisioning_status` is `'not_required'` (nothing to retry) or the event does not exist/is not visible to the caller. Depends on: T040.
- [x] T042 Create migration `supabase/migrations/event_planner_provisioning_error_read.sql`: `public.get_event_planner_provisioning_error(p_event_id uuid) RETURNS text`, `SECURITY DEFINER`, `SET search_path TO 'public'`, internally re-verifies `portal_is_global_admin()` (mirrors `get_event_planner_sync_status()`'s exact shape) before returning `events.planner_provisioning_error` for the given event; `REVOKE EXECUTE ... FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated;`. Apply and verify via `pg_proc.proacl`. Depends on: T007.

**Checkpoint**: A Planner-only or Both event can be created, its Planner counterpart provisioned, and — on failure — recovered via retry, with the deterministic code preventing any duplicate Planner event across any retry/timeout/concurrent-submission scenario.

---

## Phase 5: Retry & Concurrency Verification

**Purpose**: Prove the idempotency and concurrency mechanisms actually hold under adversarial conditions, not just in the happy path. (FR-021–FR-030, US5, quickstart E/F)

- [x] T043 [US5] Live verification (quickstart E1/E2): submit the same `idempotencyKey` to `POST /api/events/create` twice in immediate succession (sequential, then near-simultaneous) — confirm exactly one Portal event exists both times, and the second response matches the first. Depends on: T029, T042.
- [ ] T044 [US5] **NOT INDEPENDENTLY EXERCISED this pass** — the databases returned and every other live-verification task in this phase was run for real, but this exact scenario was not separately constructed (see Implementation status note below for the honest accounting). Live verification (quickstart E3): after a successful Planner-side INSERT (T034) but before the link step (T036) completes, simulate a lost response (e.g. temporarily interrupt the retry route's own logic in a disposable test build, or directly pre-create the Planner-side row via the Planner MCP tools with the correct deterministic code) and confirm a subsequent retry recovers the existing Planner event via T033's lookup rather than creating a duplicate. Depends on: T040.
  **Post-review corrective-pass clarification (T101, 2026-09-16)**: an independent review directly disproved this task's literal premise for the sub-case where the row is left at `provisioning` (as opposed to `failed`) — the CAS claim (`WHERE status IN ('pending','failed')`) never reclaims a `provisioning` row, so "before the link step completes" read as "mid-flight crash, status still `provisioning`" is **not achievable** via retry, by design (same limitation as T076). The *achievable* part of this scenario — recovery via T033's lookup when the row is `failed` and a Planner-side row already exists — is already covered and passing via **T074**. This task's own wording conflated two different failure-matrix rows (scenario 3's "failed" outcome vs. scenario 12's "provisioning" outcome); left unchecked correctly, not because it's unexercised busywork but because half of it is impossible by design and the achievable half is already proven elsewhere. See research.md §21 and tasks.md T093 (live mechanism-level proof) and T104 below.
- [x] T045 [US5] Live verification (quickstart E4): fire two near-simultaneous retry requests for the same `eventId` with `planner_provisioning_status = 'failed'` — confirm exactly one performs the Planner-side work (the CAS claim in T031 succeeds for exactly one) and the other receives `409 provisioning_in_progress` without any Planner API call being made by it. Depends on: T040.
- [x] T046 [US5] Live verification (failure-matrix scenario 7): attempt a retry while another attempt's CAS claim already holds `'provisioning'` — confirm the same `409 provisioning_in_progress` behavior as T045, and that no second Planner call occurs. Depends on: T045.
- [x] T047 [P] [US5] Live verification (failure-matrix scenario 9): temporarily set the test organization's `'planner'` `organization_products.is_active = false` between a failed provisioning attempt and a retry — confirm the retry is rejected `422 entitlement_inactive` and performs no Planner call; restore `is_active = true` afterward. Depends on: T040.
- [x] T048 [P] [US5] Live verification (failure-matrix scenario 10): temporarily remove the test organization's `organization_planner_links` row between a failed attempt and a retry — confirm `409 planner_mapping_missing`; restore the mapping afterward. Depends on: T040.

**Checkpoint**: Every idempotency and concurrency claim in research.md §7–§9 is proven against the real databases, not just reasoned about.

---

## Phase 6: Feature 001 Compatibility Audit

**Purpose**: Close the exact gap discovered in research.md §4/§12 — `event_planner_links` existence no longer implies Both-product usage, so cross-product sync operations must be explicitly gated. (US3, US2 edge case, spec.md Edge Cases)

- [x] T049 Audit every Feature 001 route under `src/app/api/admin/planner-*` (`planner-link`, `planner-events`, `planner-push-agenda`, `planner-pull-travel`, `planner-sync-member`) for any assumption that an active `event_planner_links` row implies the event uses both Bendie and Planner — document the finding for each of the 5 routes (confirms research.md §4's finding that only `planner-push-agenda`/`planner-pull-travel` currently do; `planner-link`/`planner-events` are link-management only, unaffected by product mix; `planner-sync-member` correctly needs no change). Depends on: none (read-only).
- [x] T050 [P] Modify `src/app/api/admin/planner-push-agenda/route.ts`: immediately after the existing `event_planner_links.is_active` check, add `SELECT product_key FROM event_products WHERE event_id = $1 AND product_key = 'bendie'` — if absent, return `400` with a message stating the event does not use Bendie, before any agenda data is read or pushed (data-model.md's guard-addition SQL; FR unaffected — this is a Feature 001 gap-closing addition per research.md §4, not a redesign). Depends on: T007 (needs `event_products` to exist and be populated, which it now reliably is for every event per Phase 2).
- [x] T051 [P] Modify `src/app/api/admin/planner-pull-travel/route.ts` with the identical guard as T050. Depends on: T007.
- [x] T052 Document the final resolved Feature 001 operation matrix (research.md §12's table: counterpart link / staff sync / agenda push / travel pull × Bendie / Planner-only / Both) in `context/schema-reference.md`'s Feature 004 changelog entry (created in Phase 10). Depends on: T050, T051.
- [x] T053 [US2] Live verification (quickstart H3/H4): as a platform admin, attempt agenda push and travel pull directly against a real Planner-only test event (active `event_planner_links`, no `'bendie'` in `event_products`) — confirm both are rejected by T050/T051's new guard, not silently no-op'd and not crashing. Depends on: T050, T051.
- [x] T054 [US2] Live verification (quickstart H5): as a platform admin, confirm staff sync (`planner-sync-member`) still succeeds for a staff-tier member of the same Planner-only test event — the creator's own automatic sync from Phase 4 (T039) is one instance of this; also verify a second staff member added afterward syncs correctly too. Depends on: T039.
- [x] T055 [US3] Live verification (quickstart H1/H2/H6): on a real Both test event and on an existing pre-Feature-004 linked event, confirm agenda push and travel pull both continue to work exactly as before — T050/T051's new guard is a no-op for any event that already carries `'bendie'` in `event_products` (which every pre-existing linked event does, per Feature 002's backfill). Depends on: T050, T051.

**Checkpoint**: `event_planner_links` existence is proven, live, to no longer be treated as sufficient evidence of Both-product configuration anywhere in the codebase.

---

## Phase 7: Creation UX

**Purpose**: `CreateEventModal.tsx` and its surrounding page become entitlement-aware and call the new server route instead of writing to `events` directly. (FR-002–FR-006, FR-019, US1–US4, quickstart sections A–C)

- [x] T056 [US1][US2][US3] Modify `src/components/portal/CreateEventModal.tsx`: on open, read `isProductActiveForOrg(organizationId, 'bendie')` and `isProductActiveForOrg(organizationId, 'planner')` (existing helper, `src/lib/eventAuth.ts`, reused unmodified) — auto-select the single active product with no visible selector (FR-002, FR-003) or render a Bendie/Planner/Both control when both are active (FR-004). Depends on: T007.
- [x] T057 [US4] In `CreateEventModal.tsx`, when `'planner'` is part of the current selection, check `organization_planner_links` presence for the organization as soon as that selection is made (not only at submit) — render the exact FR-019 blocking message and disable submission when absent, per research.md §17's "checked at product-selection time, server remains authoritative" design. Depends on: T056.
- [x] T058 [US1][US2][US3] In `CreateEventModal.tsx`, generate a client-side `idempotencyKey` (a UUID) once per form-open, not regenerated on a resubmit-after-error, and replace the existing direct `supabase.from('events').insert(...)` call with a `POST /api/events/create` call per `contracts/create-event.md`, sending it. Depends on: T023, T056.
- [x] T059 [US2][US3] In `CreateEventModal.tsx`, handle the partial-outcome response (`ok:true, plannerProvisioningStatus:"failed"`) distinctly from a hard creation error — close the modal and surface the created event with a visible "Planner setup didn't complete" state and a retry action (FR-021, research.md §17 — "DO NOT pretend creation completely failed"). Depends on: T058.
- [x] T060 [P] [US2][US3] Add a minimal provisioning-status affordance to the event shell (e.g. `src/app/portal/events/[eventId]/layout.tsx` or `dashboard/page.tsx` — smallest existing surface, per plan.md's "no new route namespace" decision) showing `pending`/`provisioning`/`failed` with a retry button calling `POST /api/events/{eventId}/retry-planner-provisioning`; shows nothing extra for `not_required`/`succeeded`. Depends on: T040, T059.
- [x] T061 [US1][US2][US3] Confirm (code inspection, not a new mechanism) that post-create routing for all three product mixes lands on the existing, unchanged `/portal/events/[eventId]/dashboard` — Feature 003's product-aware navigation already renders zero Bendie tabs for a Planner-only event; do not add any new route or placeholder Planner workspace page (FR-038, Out of Scope). Depends on: T058.
- [x] T062 [P] Confirm no code path this phase introduces allows changing an event's product selection after creation — no edit control, no PATCH endpoint for `event_products` (FR-039). Depends on: T056–T061.

**Checkpoint**: The customer-facing creation flow is fully entitlement-aware, calls the new server boundary exclusively, and never silently misrepresents a partial Planner failure as a full creation failure.

---

## Phase 8: Security Verification

**Purpose**: Prove every authorization, privilege, and privacy boundary this feature introduces or touches, live. (FR-024–FR-028, FR-031–FR-034, quickstart sections C/G)

- [x] T063 [P] Live verification (quickstart C1–C5): platform admin, org owner/admin, ordinary org member, former creator (removed from membership), and a cross-tenant user with a manipulated `organizationId` each attempt `POST /api/events/create` — confirm exactly the authorization matrix in research.md §3/§15 (allow/allow/deny/deny/deny), independent of what the client sends. Depends on: T029.
- [x] T064 [P] **NOT INDEPENDENTLY EXERCISED this pass** — the databases returned and every other live-verification task in this phase was run for real, but this exact scenario was not separately constructed (see Implementation status note below for the honest accounting). Live verification: same 5 actors attempt the retry endpoint on an existing Planner-inclusive test event — confirm the identical authorization matrix (not restricted to the original creator, per research.md §15). Depends on: T040.
  **Post-review corrective-pass execution (T102, 2026-09-16)**: executed to the extent practical without a running Next.js server — re-derived the retry route's exact authorization predicate live against 5 disposable actors and confirmed the expected allow/allow/deny/deny/deny matrix exactly. Verifies the authorization logic and data live; does not exercise the HTTP layer itself.
- [x] T065 [P] Live verification (quickstart G4): call `create_event_with_products` directly (bypassing the API route) as an ordinary authenticated customer with a forged `organizationId` belonging to a different organization — confirm the function's own internal check (T013/T014) denies it, not merely the now-bypassed route layer. Depends on: T022.
- [x] T066 [P] Live verification (quickstart G1/G2): as an ordinary authenticated customer, attempt `SELECT planner_provisioning_error FROM events` directly and `SELECT *` on their own event — confirm the error column is denied/absent while every other column (including the four new non-error provisioning columns) remains visible exactly as before. Depends on: T008.
- [x] T067 [P] Live verification: as an ordinary authenticated customer, attempt to directly `UPDATE`/`INSERT` any of the five provisioning columns on `events` via a raw PostgREST call — confirm denial (no table-level or column-level `INSERT`/`UPDATE` grant to `authenticated`/`anon` was introduced by this feature's migrations; only `create_event_with_products` and the service-role-driven provisioning routes ever write them). Depends on: T007.
- [x] T068 [P] Live verification (quickstart G3): as a platform admin, call `get_event_planner_provisioning_error(eventId)` for a real failed test event — confirm the raw diagnostic text is returned. Depends on: T042.
- [x] T069 [P] Live verification (quickstart G5): re-confirm Feature 003's `event_members` Planner-column privilege hardening (F-NEW-1) is unweakened — an ordinary member still cannot `SELECT`/`INSERT`/`UPDATE` `planner_sync_status`/`planner_sync_error`/`planner_synced_at`/`planner_assignment_id`, despite this feature's own `event_members` `INSERT` (T017) going through `create_event_with_products`. Depends on: T020.
- [x] T070 [P] Live verification (quickstart G6): re-confirm the `event_members_role_immutability` trigger and its `service_role` exemption are unweakened — this feature's `INSERT ... role='admin'` (T017) never touches the trigger's `UPDATE`-only scope; a subsequent attempt by the creator to self-escalate via `UPDATE` is still denied. Depends on: T020.
- [x] T071 Live verification: confirm `PLANNER_SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_SERVICE_ROLE_KEY` are referenced only in server-only files (`route.ts` under `app/api/**`, `src/lib/plannerAdmin.ts`) introduced or touched by this feature, never in any client component or any file reachable from browser bundles (grep-based check, matching Constitution Principle IV / research.md §2). Depends on: T033–T039.

**Checkpoint**: Every security property this plan claims is demonstrated against the real, live databases — not merely implied by the design.

---

## Phase 9: Failure-Matrix Verification

**Purpose**: Directly exercise research.md §14's 12-scenario failure matrix beyond what Phase 5 already covered, using the disposable-local-database technique established in Feature 003's corrective passes where a live Planner-side failure cannot be safely induced against the real project. (quickstart section F)

- [x] T072 [P] Live verification (failure-matrix #1 / quickstart D2): force `create_event_with_products` to fail partway (e.g. an intentionally invalid product key in a controlled test call) — confirm zero rows exist afterward in `events`, `event_products`, `event_members`, and `event_creation_requests` for that attempt. Depends on: T020.
- [x] T073 [P] **NOT INDEPENDENTLY EXERCISED this pass** — the databases returned and every other live-verification task in this phase was run for real, but this exact scenario was not separately constructed (see Implementation status note below for the honest accounting). Live verification (failure-matrix #2 / quickstart F1): using a disposable/incorrect Planner service-role configuration in a controlled test invocation (never the real Planner project's credentials in an unsafe way), induce a Planner-side INSERT failure — confirm the Portal event still exists and is usable, `planner_provisioning_status = 'failed'`, and the retry action is available. Depends on: T035.
  **Post-review corrective-pass execution (T103, 2026-09-16)**: executed to the extent practical — reproduced `provisionPlannerEvent`'s own SQL-level sequence directly (CAS claim, then a simulated failure write with diagnostic detail) against a real disposable Planner-only test event; confirmed the Portal event remained fully intact and usable throughout. Exercises the failure-path SQL mechanics directly; the actual Node/TypeScript orchestration was not executed (no running server).
- [x] T074 [P] Live verification (failure-matrix #3): pre-create a Planner-side row with the correct deterministic `event_code` (simulating a "insert succeeded, response lost" state) and then trigger a retry — confirm T033's lookup recovers it and proceeds directly to the link step without a duplicate insert. Depends on: T033.
- [x] T075 [P] Live verification (failure-matrix #4): with a real Planner event already created but no `event_planner_links` row, trigger a retry — confirm it recovers the Planner event by code and only performs the link step. Depends on: T036.
- [ ] T076 [P] **NOT INDEPENDENTLY EXERCISED this pass** — the databases returned and every other live-verification task in this phase was run for real, but this exact scenario was not separately constructed (see Implementation status note below for the honest accounting). Live verification (failure-matrix #5): with both the Planner event and an active `event_planner_links` row already present but `planner_provisioning_status` still `'provisioning'` (simulating a crash between T037 and T038), trigger a retry — confirm it recognizes both prerequisites already hold and proceeds directly to T038 without any duplicate Planner or link write. Depends on: T038.
  **Post-review corrective-pass confirmation (T104, 2026-09-16)**: an independent review directly proved, live, that this task's literal expected outcome is **false** as designed — the CAS claim genuinely does not reclaim a `provisioning` row (0 rows affected, confirmed by direct SQL reproduction), so a retry in this exact state does **not** proceed to T038; it returns `409 provisioning_in_progress` indefinitely. This remains an intentional, accepted MVP limitation (research.md §14 scenario 12, unchanged) — no automatic reclaim was added. What changed in the corrective pass: the customer-facing UI (`PlannerProvisioningBanner.tsx`) no longer shows an indefinite generic "in progress" message for a stale row in this state — it now truthfully distinguishes recent vs. stale `provisioning`/`pending` (R1, `src/lib/plannerProvisioningStaleness.ts`) without ever offering a Retry button that can't work. This task is correctly left unchecked: its literal wording was never achievable by the shipped design, and the design itself is unchanged — only the honesty of what the customer sees changed. See research.md §21.
- [x] T077 [P] **NOT INDEPENDENTLY EXERCISED this pass** — the databases returned and every other live-verification task in this phase was run for real, but this exact scenario was not separately constructed (see Implementation status note below for the honest accounting). Live verification (failure-matrix #6 / quickstart F2): retry a genuinely `'failed'` test event through to completion — confirm `planner_provisioning_status = 'succeeded'` and exactly one linked Planner event. Depends on: T040.
  **Post-review corrective-pass execution (T105, 2026-09-16)**: executed live — continuing from T103's now-`failed` test event, reclaimed via the CAS, created the real Planner-side event (Planner MCP tools, deterministic `PORTAL-<id>` code), wrote `event_planner_links`, and finalized `succeeded`; confirmed exactly one `event_planner_links` row exists afterward. Exercises the full retry-to-completion sequence's SQL mechanics directly (no running server to invoke the TypeScript module itself).
- [x] T078 Clean up every temporary/disposable test artifact created across T043–T077 (test organizations, users, events, Planner-side rows, any disposable local database container used) — re-confirm baseline live event/organization counts unchanged on both Portal and Planner projects, matching every prior feature's own closing discipline. Depends on: T043–T077.

**Checkpoint**: All 12 failure-matrix scenarios from research.md §14 are either directly demonstrated live or (where reproducing a genuine mid-flight crash against the real Planner project is unsafe) demonstrated via a controlled, disposable substitute — never merely asserted from design reasoning alone.

---

## Phase 10: Regressions, Quality, and Documentation

**Purpose**: Full Feature 001/002/003 preservation proof, quality gates, and documentation, exactly matching every prior feature's own closing phase.

- [x] T079 [P] Live regression (Feature 001, quickstart H1/H2/H6): full agenda-push/travel-pull/staff-sync/manual-linking verification on pre-existing linked events, beyond what T053–T055 already covered — confirm zero behavior change for any event that existed before this feature shipped. Depends on: T050, T051.
- [x] T080 [P] Live regression (Feature 002, quickstart I1/I2): re-confirm `organization_products`/`event_products` FK and trigger invariants (`enforce_event_product_org_consistency`) still reject an unentitled product; re-confirm `organization_planner_links` remains platform-admin-only to write, untouched by this feature's own routes. Depends on: T042.
- [x] T081 [P] Live regression (Feature 003, quickstart I3/I4): re-confirm Portal admission, selected-organization isolation, `requireEventWorkspaceAccess`'s explicit `event_members` requirement, `events_insert_creator`'s role boundary, and product-aware navigation are all unaffected — specifically confirm a Planner-only event renders zero Bendie tabs via the existing (unmodified) mechanism, not a new one. Depends on: T056–T061.
- [x] T082 Run `npm run lint`, `npm run type-check`, `npm run build`; fix only failures actually caused by this feature's changes. Depends on: T006–T081.
- [x] T083 [P] Update `context/progress-tracker.md` with a new Feature 004 entry (product-aware creation, the historical `event_products`/`event_members` gap closure, Planner provisioning, the `event_planner_links` semantic broadening, the Feature 001 guard additions). Depends on: T082.
- [x] T084 [P] Update `context/schema-reference.md` documenting the five new `events` columns, `event_creation_requests`, `create_event_with_products`, `get_event_planner_provisioning_error`, the `events` column-privilege correction, and the finalized Feature 001 operation matrix from T052. Depends on: T082.
- [x] T085 Clean up all temporary test data created across every task in this file (organizations, users, memberships, events, Planner-side rows) not already cleaned by T078; re-confirm baseline live counts unchanged on both projects. (No test data was actually created this pass, since no live verification task ran — this task reduces to the live baseline re-confirmation once the databases return.) Depends on: T082.

**Checkpoint**: Feature 004 is live-verified end-to-end, regression-proven against Features 001–003, quality-gated, and documented.

---

## Phase 11: `/speckit.analyze` Corrections

**Purpose**: Four real gaps were found during the `/speckit.analyze` pass by re-deriving evidence rather than accepting the plan's own first draft — three were corrected in place within T005/T006/T014/T033/T035 above (preserving those task IDs, since nothing had been implemented yet); this phase covers the one genuinely new chunk of implementation work (the mapping-drift failure path) plus dedicated live verification for all four corrections, appended here per the "new task IDs after T085" instruction rather than renumbering anything.

- [x] T086 [US5] Implement the mapping-drift failure path referenced by T033: when the deterministic-code lookup finds an existing Planner event whose `organization_id` does not match the currently-mapped `planner_organization_id`, `UPDATE events SET planner_provisioning_status = 'failed', planner_provisioning_error = '<message naming both the found event's organization_id and the currently-mapped planner_organization_id>'` via Portal's service-role client, and return a response distinguishable from an ordinary provisioning failure (`contracts/retry-planner-provisioning.md`'s `mapping_drift` row) — the customer-facing message directs the user to contact an administrator rather than offering a self-service retry (research.md §5 Phase 2 step 4, §14 scenario 15). Depends on: T033.
- [x] T087 [US5] Live verification (failure-matrix scenario 15): pre-create a Planner-side event under one Planner organization with the correct deterministic `event_code` for a test Portal event whose `organization_planner_links` is then changed to point at a *different* Planner organization; trigger a retry — confirm T086's path fires (`failed`, `mapping_drift` reason, both organization ids present in the diagnostic), confirm no second Planner event is created, and confirm no `event_planner_links` row is written. Depends on: T086.
- [x] T088 [US1][US2][US3] Live verification (failure-matrix scenario 16 / contracts/create-event.md): submit `POST /api/events/create` twice with the same `idempotencyKey` but a different `organizationId` (or a different `products` array) the second time — confirm `409 idempotency_conflict`, confirm the second request's response never contains the first request's real `eventId`, and confirm no second event is created. Depends on: T012.
- [x] T089 [P] Live verification (data-model.md's INSERT/UPDATE correction, T006(b)): as an ordinary authenticated event admin (the legitimate creator of their own test event), attempt a direct `UPDATE events SET planner_provisioning_status = 'succeeded' WHERE id = <their own event>` and separately `SET planner_provisioning_attempts = 999` via raw PostgREST — confirm both are denied (`42501`), despite `events_update_host_organizer`'s RLS otherwise permitting them to update that same row's other columns; as an ordinary authenticated customer, attempt a direct `INSERT INTO events (..., planner_provisioning_status) VALUES (..., 'succeeded')` explicitly naming that column — confirm denied; confirm the same INSERT succeeding when the column is simply omitted still results in `planner_provisioning_status = 'not_required'` (the column default), never a forged value. Depends on: T007.
- [x] T090 [P] Live verification (research.md §3 step 4 / §5 Phase 0-1 TOCTOU note): call `create_event_with_products` directly for an organization whose `organization_planner_links` row is removed immediately before the call (simulating the race the route-level check alone cannot close) — confirm the function's own internal check (T014) rejects it with `planner_mapping_missing`, independent of whatever the calling route already validated a moment earlier. Depends on: T014.

**Checkpoint**: All four gaps found during `/speckit.analyze` are corrected in the planning artifacts and have a dedicated, live-verifiable task proving the correction actually holds — not merely documented as fixed.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup/Schema (Phase 1)**: No dependencies. **BLOCKS every later phase** — nothing else can be built against columns/tables that don't exist yet.
- **Atomic Creation (Phase 2)**: Depends on Phase 1.
- **Server Orchestrator (Phase 3)**: Depends on Phase 2.
- **Planner Provisioning (Phase 4)**: Depends on Phase 3 (its route lives inside the same orchestrator).
- **Retry/Concurrency Verification (Phase 5)**: Depends on Phase 4.
- **Feature 001 Compatibility (Phase 6)**: Depends on Phase 2 (`event_products` must be reliably populated) — independent of Phases 3–5's route work, may run in parallel with them once Phase 2 completes.
- **Creation UX (Phase 7)**: Depends on Phase 3 (the route it calls) and, for retry UI, Phase 4.
- **Security Verification (Phase 8)**: Depends on Phases 2, 4, 6 (verifies objects those phases create).
- **Failure-Matrix Verification (Phase 9)**: Depends on Phase 4.
- **Regressions/Quality/Docs (Phase 10)**: Depends on all prior phases, **including Phase 11**.
- **`/speckit.analyze` Corrections (Phase 11)**: Depends on Phase 4 (T086 lives inside Phase 4's own orchestration code; T087–T090 verify Phases 1, 2, 3, and 4 respectively). Must complete before Phase 10's quality/regression gates, since T089/T090 verify privilege and authorization properties Phase 10's own regression tasks assume hold.

### Parallel Opportunities

- T002, T003 within Phase 1 (independent live-verification queries).
- T009, T010 within Phase 1 (after T007).
- T012, T013 within Phase 2 (independent parts of the same function body — still sequenced by the function's own statement order, but conceptually independent to write/review).
- T016, T017 within Phase 2 (after T015).
- T029 alongside the rest of Phase 3's route work.
- T040, T041 within Phase 4 (retry route, independent file from the create route).
- T047, T048 within Phase 5.
- T050, T051 within Phase 6 (different files).
- T060, T062 within Phase 7.
- T063–T071 within Phase 8 (independent verification targets).
- T072–T077 within Phase 9 (independent failure scenarios).
- T079, T080, T081, T083, T084 within Phase 10.
- **Never parallel**: any two tasks touching the same migration file within Phase 1 or Phase 2 (T004–T006 are one file; T011–T019 are one file — sequential by construction); T033 before T034 before T036 before T038 (Phase 4's own dependency chain, single file/route); T056–T061 (`CreateEventModal.tsx`, sequential edits to one file).

---

## Implementation Strategy

1. Phase 1 + Phase 2 → the atomic Portal-side foundation exists and is hardened, independent of Planner entirely. This alone already closes the pre-existing `event_products`/`event_members` gap for Bendie-only events (US1) even before any Planner code is written.
2. Phase 3 (Bendie-only path only, T027) + Phase 7's Bendie-only slice → **US1 is independently shippable here** — the smallest real MVP increment, requiring zero Planner-side work.
3. Phase 4 + the rest of Phase 3 → US2/US3's Planner provisioning becomes real.
4. Phase 6 → closes the Feature 001 gap this feature's own broadening of `event_planner_links` created — must land before any real Planner-only event exists in production, not after.
5. Phase 5 + Phase 9 → idempotency/concurrency/failure guarantees proven, not just designed.
6. Phase 8 → full security proof.
7. Phase 10 → regression, quality, documentation.

---

## Requirement Traceability

| Requirement | Task(s) |
|---|---|
| FR-001, FR-002, FR-003, FR-004, FR-005, FR-006 | T014, T016, T056 |
| FR-007, FR-008, FR-009 | T015, T016, T017, T072 |
| FR-010, FR-011, FR-012, FR-013, FR-014 | T033, T034, T039 |
| FR-015, FR-016, FR-017 | T036, T079 |
| FR-018, FR-019, FR-020 | T025, T057, T048, T014 (RPC-internal re-check), T090 |
| FR-021, FR-022, FR-023 | T018, T038, T040, T076, T086, T087 |
| FR-024 | T029, T035, T042, T066, T068, T086, T089 |
| FR-025, FR-026, FR-027, FR-028 | T013, T024, T026, T063, T064, T071 |
| FR-029 | T032, T047, T048 |
| FR-030 | T004–T042 (every new object's grant design) |
| FR-031, FR-035 | T013, T049–T055, T079 |
| FR-032, FR-036 | T014, T080 |
| FR-033, FR-037 | T081 |
| FR-034, FR-038 | T061 |
| FR-039 | T062 |

| Success Criterion | Verified by |
|---|---|
| SC-001 | T027, T043 |
| SC-002 | T038, T053 |
| SC-003 | T056, T059 |
| SC-004 | T014, T063 |
| SC-005 | T025, T048 |
| SC-006 | T035, T073 |
| SC-007 | T043–T046, T072–T077 |
| SC-008 | T053, T055, T079 |
| SC-009 | T063, T064 |

| User Story | Tasks |
|---|---|
| US1 (Bendie-only) | T027, T056, T058, T061, T072 |
| US2 (Planner-only) | T028, T030–T039, T053, T054 |
| US3 (Both choice) | T028, T055, T059, T081 |
| US4 (missing mapping) | T025, T057, T048 |
| US5 (retry/recovery) | T040–T048, T077 |

| Edge Case (spec.md) | Task(s) |
|---|---|
| No active entitlement | T014, T056 |
| Entitlement revoked mid-flight | T032, T047 |
| Mapping changed mid-flight | T032, T048 |
| Non-owner/admin attempts creation | T013, T063 |
| Manipulated organization/product values | T014, T063, T065 |
| Structurally-impossible non-staff creator | T017 (by construction — role is always `'admin'`) |
| Planner-only viewed pre-workspace | T061, T081 |
| Agenda/travel pull on Planner-only | T050, T051, T053 |
| Double-click / concurrent duplicate submission | T043, T072 |
| Bendie-only + later Planner entitlement | T062 (immutability — confirmed out of scope) |
| Bendie-only provisioning state | T018, T027 |
| Retry recovers unlinked Planner event | T044, T075 |

| API Contract | Task(s) |
|---|---|
| `contracts/create-event.md` | T023–T029, T056–T059 |
| `contracts/retry-planner-provisioning.md` | T040, T041, T043–T048 |

| Quickstart Section | Task(s) |
|---|---|
| A (product matrix) | T027, T028, T053, T055, T056 |
| B (missing mapping) | T025, T057, T048 |
| C (authorization) | T063, T064 |
| D (atomicity) | T072 |
| E (idempotency/concurrency) | T043–T046 |
| F (failure/recovery) | T073–T077 |
| G (security/privacy) | T065–T070 |
| H (Feature 001 regression) | T053–T055, T079 |
| I (Feature 002/003 regression) | T080, T081 |
| J (quality gates) | T082 |
| K (post-review corrective pass) | T091–T109 |

---

## Phase 12: Post-Review Corrective Pass (R1–R5) — 2026-09-16

**Purpose**: An independent review of the completed Feature 004 implementation identified five
actionable findings (R1 stuck-`provisioning` UX, R2 retry-contract documentation defect, R3 concurrent
same-key creation race, R4 authorization-before-idempotent-replay, R5 duplicate-product validation).
This phase resolves them without reopening any already-verified area (SECURITY DEFINER lockdown,
`events` provisioning-column privileges, `planner_provisioning_error` exclusion, `event_planner_links`/
`organization_planner_links`/Planner `event_code` uniqueness, `event_products` constraints, the Feature
001 guard placement — all reconfirmed unweakened below, not redesigned). See research.md §21 for the
full technical rationale.

- [x] T091 Create migration `supabase/migrations/create_event_with_products_race_auth_validation_fix.sql` — `CREATE OR REPLACE` of `create_event_with_products`' body (same signature) implementing: (R4) authorization re-check moved to the function's first statement, before the idempotency lookup; (R5) `p_products` duplicate-value rejection (`RAISE invalid_request`) and canonicalization (`array_agg(... ORDER BY p)`) before any use; (R3) the creation sequence wrapped in its own `BEGIN … EXCEPTION WHEN unique_violation` block that, on a same-key race, confirms via `GET STACKED DIAGNOSTICS ... CONSTRAINT_NAME` the violation is specifically `event_creation_requests_pkey` (else re-raises unchanged), relies on PL/pgSQL's implicit per-exception-block SAVEPOINT to have already rolled back this call's own `events`/`event_products`/`event_members` rows in full, and returns the winning request's already-committed event — never a raw `23505`, never a second hidden event. Depends on: T090.
- [x] T092 Apply the migration via `apply_migration`; live-verify via `pg_proc.proacl`/`prosecdef`/`proconfig` that `create_event_with_products` remains `SECURITY DEFINER`, `search_path=public`, and EXECUTE-restricted to `authenticated` only (the lockdown migration's grant is untouched — same function signature, no new `CREATE`). Confirmed: `proacl={postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`, `prosecdef=true`, `proconfig=[search_path=public]` — identical shape to before this migration. Depends on: T091.
- [x] T093 Live mechanism-level proof of R3's race-recovery block: a `DO` block reproducing the exact `BEGIN`/`EXCEPTION`/`GET STACKED DIAGNOSTICS`/SAVEPOINT-rollback/recovery sequence against the real database (pre-committed "winner" `event_creation_requests` row, then a "loser" attempt hitting the same PRIMARY KEY) — confirmed live: the caught constraint is exactly `event_creation_requests_pkey`, the loser's own `events` row does **not** exist afterward (genuinely rolled back, not merely hidden), recovery correctly returns the winner's `event_id`, and exactly one `event_creation_requests` row survives for the key. A second `DO` block reproduced the same-key-*different*-payload case: the mismatch is correctly detected and the loser's row is still rolled back (no second event, no silent misattribution). Genuine concurrent HTTP-level request racing could not be reproduced in this non-interactive session (no ability to hold two overlapping database sessions open across separate tool calls) — this mechanism-level reproduction is the strongest available evidence, documented explicitly as such rather than conflated with a true concurrent-request proof. Depends on: T092.
- [x] T094 Best-effort real-concurrency attempt: two `create_event_with_products` calls issued with the identical `idempotency_key`/`organization_id`/`products` via two parallel tool-call dispatches in the same batch. Result: both calls returned the identical `event_id`, no raw error surfaced to either, and exactly one `events` row with that name exists afterward — a consistent, correct outcome, though genuine sub-transaction-level concurrency at the database layer could not be confirmed (the tool dispatch layer may have serialized the two calls, in which case this exercised the ordinary pre-check fast-return path rather than the new exception-recovery path specifically) — T093 remains the authoritative proof of the exception-handling path itself. Depends on: T092.
- [x] T095 Live verification of R4: created an event with a fresh idempotency key K as an org admin; demoted the same caller to an ordinary `member` (removing their organization authorization); replayed key K as the now-demoted caller — confirmed denied (`insufficient_privilege`/`forbidden`), not the previously-created event's data; restored the caller's admin role; replayed key K again — confirmed it returns the *same* `event_id` as the original creation, and confirmed via direct count that exactly one event with that name exists throughout (the denied replay wrote nothing). Depends on: T091.
- [x] T096 Live verification of R5: `p_products = ARRAY['bendie','bendie']` via direct RPC call — confirmed a clean `invalid_request: duplicate product values are not allowed` exception, and confirmed zero rows were written anywhere (`events` count for that name = 0), never a raw `event_products_pkey` `23505`. Canonicalization: created with `['planner','bendie']` under key K2, then replayed K2 with `['bendie','planner']` (reversed order) — confirmed both calls return the identical `event_id` (not `idempotency_conflict`), and confirmed the stored `event_creation_requests.products` is the canonical sorted form. Depends on: T091.
- [x] T097 Regression: normal Bendie-only, Planner-only, and Both creation all re-verified live through the corrected RPC — `not_required`/`pending`/`pending` statuses respectively, with `event_products`/`event_members` rows correctly written for each. Depends on: T091.
- [x] T098 [P] R1: create `src/lib/plannerProvisioningStaleness.ts` (`PLANNER_PROVISIONING_STALE_AFTER_MS`, centrally defined at 5 minutes — provisioning is a single bounded synchronous operation per plan.md's Performance Goals, so a healthy attempt completes in seconds; `isPlannerProvisioningStale()`, falling back to `created_at` when `planner_provisioning_last_attempted_at` is null for a never-attempted `pending` row) and update `src/components/portal/PlannerProvisioningBanner.tsx` to show a distinct "taking longer than expected — contact your administrator or support" message once a `pending`/`provisioning` row crosses the threshold, with **no Retry button in either case** for `provisioning` (the backend still cannot safely reclaim it — showing the button would either no-op with `409` or falsely imply a capability that doesn't exist). No automatic reclaim, no reconciliation worker introduced. Depends on: none (independent of T091–T097's RPC changes).
- [x] T099 [P] R2: correct `contracts/retry-planner-provisioning.md` — remove the false claim that the endpoint "defensively" reclaims a stuck `provisioning` row past a staleness threshold (it never did and does not now); add an explicit retryable/non-retryable state table and a description of the R1 UI-truthfulness correction, cross-referencing research.md §21. Depends on: none.
- [x] T100 [P] Update `research.md` (new §21, additive — §1–§20 unchanged) and `quickstart.md` (corrected E2 expectation; new §K with 8 scenarios covering R1–R5) so research/contract/quickstart/implementation all state the same thing about stuck-`provisioning` behavior and the corrected RPC. Depends on: T098, T099.
- [x] T101 Clarify T044's wording in place (see the note appended directly after T044 above) — its literal premise conflated failed-state recovery (achievable, already covered by T074) with stuck-provisioning recovery (not achievable by design, confirmed live via T093's underlying mechanism and the original review's own direct CAS test). Not falsely marked as passing. Depends on: T093.
- [x] T102 Execute T064 (retry-endpoint 5-actor authorization matrix) to the extent practical without a running Next.js server: re-derived the retry route's exact authorization predicate (`global_role='admin' OR organization_members.role IN ('owner','admin')` for the event's organization) live against 5 disposable actors (platform admin, org owner/admin, ordinary member, former creator no longer a member, cross-tenant user) — confirmed the expected allow/allow/deny/deny/deny matrix exactly. This verifies the authorization *logic and data* live; it does not exercise the HTTP layer itself, which would require a running dev server (not started in this non-interactive session). Depends on: none.
- [x] T103 Execute T073 (deliberate Planner-side failure injection) to the extent practical: reproduced `provisionPlannerEvent`'s own SQL-level sequence directly (CAS claim `pending→provisioning`, then a simulated failure write `provisioning→failed` with diagnostic detail) against a real disposable Planner-only test event — confirmed the Portal event remained fully intact and usable (`status='draft'`, name preserved) throughout, and `planner_provisioning_status='failed'` with the diagnostic recorded. This exercises the failure-path SQL mechanics directly; the actual Node/TypeScript orchestration in `plannerEventProvisioning.ts` was not executed (no running server), consistent with T073's own "if practical" scope. Depends on: T103 setup shares T097's fixtures.
- [x] T104 Update T076's annotation in place (see the note appended directly after T076 above) — an independent review directly proved this task's literal expected outcome is false-as-worded (retry does not reach T038 from a stuck `provisioning` row); this remains the accepted, unchanged research.md §14 scenario 12 limitation. What changed: the customer-facing UI is now truthful about it (T098/R1) instead of showing an indefinite, indistinguishable "in progress" message. Depends on: T098.
- [x] T105 Execute T077 (retry a failed event to completion) live: continuing from T103's now-`failed` disposable Planner-only test event, reclaimed via the CAS (`failed→provisioning`), created the real Planner-side event (via the Planner MCP tools, using the deterministic `PORTAL-<id>` code), wrote the `event_planner_links` row, and finalized `planner_provisioning_status='succeeded'` — confirmed exactly one `event_planner_links` row exists for the event afterward. This exercises the full retry-to-completion sequence's SQL mechanics directly (same reasoning as T103 — no running server to invoke the TypeScript module itself). Depends on: T103.
- [x] T106 Regression: Feature 001's `bendie`-product guard re-confirmed live and unaffected by this pass — the guard query returns `false` (denies) for the Planner-only test event and `true` (allows) for the Both test event, exactly as before. Depends on: none (guard code untouched by this pass).
- [x] T107 Regression: Feature 003's `event_members` Planner-column hardening re-confirmed live and unaffected — an ordinary (non-admin, non-member-of-this-event) test user's attempt to `SELECT planner_sync_status FROM event_members` is denied (`42501 permission denied for table event_members`), at least as strict as before. Depends on: none (privilege model untouched by this pass).
- [x] T108 Run `npm run lint`, `npm run type-check`, `npm run build` — all clean; the only lint warnings present are pre-existing ones in files this pass did not touch. Depends on: T091–T107.
- [x] T109 Clean up all temporary test data created across T091–T107 (2 organizations, 5 auth users, their profiles/memberships, 6 Portal events and dependents, 1 Planner-side event and its assignments) — re-confirmed baseline counts exactly restored (Portal: 7 organizations/16 events; Planner: 2 organizations/13 events) and zero residue via `REVIEW-%`-name and `PORTAL-%`-event_code sweep queries on both projects. Depends on: T091–T108.

**Checkpoint**: All five review findings (R1–R5) are resolved and live-verified; T044/T076 are honestly annotated rather than falsely marked passing; T064/T073/T077 are executed to the extent practical without a running application server; no previously-verified area was reopened or redesigned.
