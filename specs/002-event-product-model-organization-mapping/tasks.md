---
description: "Task list for Organization Product Entitlements & Event Product Foundation"
---

# Tasks: Organization Product Entitlements & Event Product Foundation

**Input**: Design documents from `/specs/002-event-product-model-organization-mapping/` (`spec.md`, `plan.md`, `research.md`, `data-model.md`, `quickstart.md`)

**Tests**: Not included as a separate automated suite — no automated test framework exists in this repository (confirmed in `plan.md`'s Technical Context, matching feature 001's own precedent). Verification is the manual `quickstart.md` walkthrough, broken into per-user-story tasks below, plus the repository's existing lint/type-check/build gate.

**Critical brownfield fact governing every task below**: `organization_members` already exists live in this codebase (`research.md` item 0) — no task in this list creates, migrates, or modifies it. It is read only, through its own pre-existing `is_organization_member()`/`is_organization_admin()` helper functions, by the new RLS policies below.

**Revision note (post-`/speckit.analyze`)**: this version adds two verification tasks the analysis found missing — `event_products` duplicate rejection (T016, mirroring T015's already-covered `organization_products` case) and organization-level cascade-on-delete for `organization_products` (T017, mirroring the already-covered event-level case) — and relabels the Phase 3 milestone to avoid implying Phases 4–6 are optional. Everything from the old T017 onward is renumbered by two as a result (old T017–T026 → new T019–T028).

**Organization**: Phases 1–2 are Setup/Foundational (the single migration creating all three tables — none of the three user stories can be independently tested until this exists, since `event_products`' composite FK requires `organization_products` to already exist in the same migration). Phases 3–5 = User Stories 1–3 from `spec.md` (in priority order, each independently verifiable per its own section of `quickstart.md`). Phase 6 = Polish & Cross-Cutting (security/regression verification, docs, final gate).

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files/systems, no dependency on an incomplete task)
- **[US#]**: Which `spec.md` user story this task belongs to — only used in Phases 3–5

---

## Phase 1: Setup — Pre-Implementation Verification

**Purpose**: Re-confirm every live-schema fact this revision's design depends on, immediately before writing the migration — matching feature 001's own T001–T007 precedent for this exact kind of foundational feature.

- [X] T001 Confirm connectivity to the `supabase` MCP (Portal project only — this feature touches no Planner-side schema, unlike feature 001). **Confirmed live 2026-09-16.**
- [X] T002 [P] Live-re-verify `organization_members`'s exact shape, RLS policies, and the `is_organization_member(org_id, uid)`/`is_organization_admin(org_id, uid)` helper function definitions (`research.md` item 0) — confirm no drift since planning; if any drift is found, STOP and report before proceeding to T006. **Confirmed: composite PK (organization_id,user_id), role CHECK unchanged, both helper functions exist. Zero drift.**
- [X] T003 [P] Live-re-verify `event_members`'s `enforce_event_member_integrity()` trigger definition (`research.md` item 4) — this is the exact precedent `event_products`' own consistency trigger (T006) is modeled on; confirm it still matches before copying its pattern. **Confirmed present, unchanged.**
- [X] T004 [P] Live-re-verify `event_planner_links.is_active` semantics, the primary-key/column types of `events`, `organizations`, and `profiles` that the new tables' foreign keys reference, and that `events.organization_id` has zero `NULL` values (a migration-safety precondition). **Confirmed: is_active is boolean; 0 events with NULL organization_id — migration is safe.**
- [X] T005 [P] Live-re-verify `public.portal_is_global_admin()` and `public.set_updated_at()` exist and match their expected definitions (`research.md` items referencing both). **Confirmed both exist.**

**Checkpoint**: All five live-verification facts confirmed current. Phase 2 may now begin.

---

## Phase 2: Foundational — Schema Migration (Blocks All User Stories)

**Purpose**: The single migration creating all three tables, their RLS, and the consistency trigger. **Blocks Phases 3–5** — none of the three user stories can be independently verified until this exists, since the backfill (US1) and the entitlement invariant (US2) both require all three tables to be present together in one transaction.

- [X] T006 Create `supabase/migrations/organization_and_event_product_foundation.sql` (no numeric prefix — this repo's live convention, applied via `apply_migration`) implementing, per `data-model.md`'s "Full Migration Structure" verbatim:
  - `organization_products`: composite `PRIMARY KEY (organization_id, product_key)`; `organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE`; `product_key text NOT NULL CHECK (product_key IN ('bendie', 'planner'))`; `is_active boolean NOT NULL DEFAULT true`; `enabled_at timestamptz NOT NULL DEFAULT now()`; `enabled_by uuid REFERENCES profiles(id) ON DELETE SET NULL`. RLS enabled; policy `"Global admins can manage all organization products"` (`FOR ALL`, `USING`/`WITH CHECK` both `portal_is_global_admin()`); policy `"Organization members can view their own organization's products"` (`FOR SELECT`, `USING (is_organization_member(organization_id))`).
  - `event_products`: composite `PRIMARY KEY (event_id, product_key)`; `event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE`; `product_key text NOT NULL CHECK (product_key IN ('bendie', 'planner'))`; `organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE` (denormalized — new in this revision); `FOREIGN KEY (organization_id, product_key) REFERENCES organization_products (organization_id, product_key)` (the entitlement invariant, `research.md` item 4); `enabled_at timestamptz NOT NULL DEFAULT now()`; `enabled_by uuid REFERENCES profiles(id) ON DELETE SET NULL`. RLS enabled; same two-policy pattern as `organization_products` (admin `FOR ALL`, member `FOR SELECT` via `is_organization_member(organization_id)`). Plus: `enforce_event_product_org_consistency()` trigger function (raises if `NEW.organization_id IS DISTINCT FROM` the referenced event's real `organization_id`, or if the event doesn't exist) and its `trg_event_products_org_consistency BEFORE INSERT OR UPDATE` trigger — exact logic mirrors `event_members`'s own `enforce_event_member_integrity()` (T003).
  - `organization_planner_links`: `organization_id uuid PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE`; `planner_organization_id bigint NOT NULL UNIQUE` (tenant isolation — new in this revision, `research.md` item 5); `planner_organization_name text`; `linked_by uuid REFERENCES profiles(id) ON DELETE SET NULL`; `created_at`/`updated_at timestamptz NOT NULL DEFAULT now()`. RLS enabled; single policy `"Global admins can manage all organization planner links"` (`FOR ALL`, admin-only, both read and write per spec FR-025 — no member-read policy on this one table). Plus: `set_organization_planner_links_updated_at BEFORE UPDATE` trigger using the existing `set_updated_at()` function.
  - The two-phase, order-dependent backfill from `data-model.md`'s "Migration / Backfill" section, in this exact order: (1) `organization_products` — every organization with ≥1 event gets `'bendie'`; every organization with ≥1 actively-linked (`event_planner_links.is_active = true`) event additionally gets `'planner'`; (2) `event_products` — every event gets `'bendie'` (with its real `organization_id`); every actively-linked event additionally gets `'planner'`. All four `INSERT ... SELECT` statements use `ON CONFLICT (...) DO NOTHING`.
  Depends on T001–T005. **Migration file created at `supabase/migrations/organization_and_event_product_foundation.sql`.**
- [X] T007 Apply the migration from T006 to Portal's Supabase project via the `apply_migration` MCP tool; confirm via `list_tables`/`get_advisors` that RLS is enabled on all three new tables and no new advisories appear. Depends on T006. **Applied successfully. `pg_class.relrowsecurity = true` confirmed on all 3 tables. Advisors show zero new `rls_enabled_no_policy` findings for them; the one new WARN (`enforce_event_product_org_consistency` mutable search_path) matches the identical pre-existing pattern already present for `enforce_event_member_integrity` and every other trigger function in this schema — not a regression.**
- [X] T008 [P] Update `src/types/database.ts` by hand (hand-maintained, not generated) to add the `organization_products`, `event_products` (including its new `organization_id` field), and `organization_planner_links` table types, exactly matching the `Row`/`Insert` shapes in `data-model.md`'s "`src/types/database.ts` additions" section. Depends on T007. **Done — inserted immediately after the existing `event_planner_links` entry.**

**Checkpoint**: Schema foundation live and type-safe. Phases 3–5 may now proceed (independently, in any order, since each verifies a different property of the same already-applied migration).

---

## Phase 3: User Story 1 — Existing events/organizations keep working, accurately classified (Priority: P1) 🎯 First independently verifiable milestone

**Goal**: The one-time backfill correctly and safely converts every pre-existing organization and event, deriving entitlement only from real existing data — never a blanket grant (spec FR-011–FR-016).

**Independent Test**: `quickstart.md` §1–§3 — backfill-correctness queries for both tables, plus a second-run idempotency check.

**Not a stopping point**: this phase proves the *backfill* is correct. It does not prove the entitlement invariant is unbypassable (Phase 4), that tenant isolation holds (Phase 5), that RLS/security is correctly scoped, or that feature 001 still works (Phase 6) — those are correctness and security gates, not optional polish, and per Constitution Principle VIII this feature is not considered complete until they pass too.

- [X] T009 [US1] Confirm the two-phase backfill from T006 executed as part of the single migration transaction in T007 (no separate execution step — `data-model.md` defines the backfill as part of the one migration file, not a follow-up script). Depends on T007. **Confirmed — 6 organization_products rows, 16 event_products rows present immediately after T007.**
- [X] T010 [P] [US1] Live-verify organization-level backfill correctness per `quickstart.md` §1: every organization with ≥1 event has exactly a `'bendie'` entitlement row; every organization with ≥1 actively-linked event additionally has a `'planner'` row; zero organizations without an actively-linked event have a `'planner'` row; organizations with zero events have zero entitlement rows. Depends on T009. **All 4 assertions returned 0 (clean).**
- [X] T011 [P] [US1] Live-verify event-level backfill correctness per `quickstart.md` §2: every event has a `'bendie'` row in `event_products`; every actively-linked event additionally has a `'planner'` row. Depends on T009. **Both assertions returned 0 (clean).**
- [X] T012 [US1] Live-verify idempotency per `quickstart.md` §3: re-run all four backfill `INSERT ... SELECT ... ON CONFLICT DO NOTHING` statements from T006 a second time; confirm zero new rows in either table and that T010/T011's queries still return identical results. Depends on T010, T011. **Confirmed idempotent — 6/16 rows before and after re-run, unchanged.**

**Checkpoint**: User Story 1 (backfill correctness) fully verified independently.

---

## Phase 4: User Story 2 — Entitlement invariant and duplicate rejection (Priority: P2)

**Goal**: An event can never be recorded as using a product its organization is not entitled to, unbypassably; no duplicate organization-entitlement or event-product record can exist; deleting an organization or an event cleans up its dependent rows (spec FR-001–FR-010).

**Independent Test**: `quickstart.md` §4–§6, §8 — rolled-back negative-transaction tests plus cascade-on-delete checks.

- [X] T013 [P] [US2] Live-verify the entitlement invariant is genuinely unbypassable per `quickstart.md` §4 (rolled-back transaction): attempt to insert an `event_products` row for `'planner'` against a real event whose organization has no `'planner'` entitlement row; confirm it fails with `foreign_key_violation` (`23503`) from the composite FK, not merely a warning. Depends on T007. **PASSED — 23503 raised exactly as required, transaction rolled back.**
- [X] T014 [P] [US2] Live-verify the organization-consistency trigger per `quickstart.md` §5 (rolled-back transaction): attempt to insert an `event_products` row whose `organization_id` deliberately does not match the referenced event's real `events.organization_id`; confirm `enforce_event_product_org_consistency()` raises its named exception. Depends on T007. **PASSED — trigger raised its exact named exception, isolated from the FK check.**
- [X] T015 [P] [US2] Live-verify duplicate rejection on `organization_products` per `quickstart.md` §6 (rolled-back transaction): attempt to insert a second `organization_products` row for an `(organization_id, product_key)` pair that already exists; confirm `unique_violation` (`23505`) from the composite primary key. Depends on T007. **PASSED — 23505 raised.**
- [X] T016 [P] [US2] Live-verify duplicate rejection on `event_products` (mirrors T015 — found missing in `/speckit.analyze`, spec FR-007/SC-006): in a rolled-back transaction, attempt to insert a second `event_products` row for an `(event_id, product_key)` pair that already exists (e.g. re-insert a `'bendie'` row for an event backfilled in Phase 3); confirm `unique_violation` (`23505`) from the composite primary key. Depends on T011. **PASSED — 23505 raised.**
- [X] T017 [P] [US2] Live-verify cascade-on-delete for `event_products` per `quickstart.md` §8 (rolled-back transaction): create a temporary test event with an `event_products` row, delete the event, confirm its `event_products` row is gone (via `ON DELETE CASCADE` on `event_id`). Depends on T007. **PASSED.**
- [X] T018 [P] [US2] Live-verify cascade-on-delete for `organization_products` (mirrors T017 — found missing in `/speckit.analyze`, spec FR-004): in a rolled-back transaction, create a temporary test organization, give it an `organization_products` row, delete the organization, confirm the `organization_products` row is gone (via `ON DELETE CASCADE` on `organization_id`); also confirm any `event_products` row that referenced that organization is gone too (the same cascade applies transitively). Depends on T007. **PASSED — both organization_products and the transitively-cascaded event_products row confirmed gone.**

**Checkpoint**: User Story 2 (entitlement integrity) fully verified independently.

---

## Phase 5: User Story 3 — Organization Planner mapping, tenant-isolated (Priority: P3)

**Goal**: A Portal organization's Bendie Planner mapping is recorded once and reused reliably; the same Bendie Planner organization can never be mapped from two different Portal organizations at once (spec FR-017–FR-022, FR-019 specifically for isolation).

**Independent Test**: `quickstart.md` §7 — a rolled-back negative-transaction tenant-isolation test.

- [X] T019 [P] [US3] Live-verify one-mapping-per-organization: insert an `organization_planner_links` row for a test organization, then attempt to insert a second row for the *same* `organization_id`; confirm it fails (primary-key violation on `organization_id`), matching spec FR-018. Rolled back, non-destructive. Depends on T007. **PASSED — 23505 on `organization_planner_links_pkey`.**
- [X] T020 [P] [US3] Live-verify tenant isolation per `quickstart.md` §7 (rolled-back transaction). **Use two genuinely distinct test organizations, not the same "first organization" row T019 might use** (a parallel-execution-safety note from `/speckit.analyze` — picking the same default row as T019 risks incidental lock contention between the two rolled-back transactions if run truly simultaneously): map organization A to a specific `planner_organization_id`, then attempt to map organization B to that same `planner_organization_id`; confirm `unique_violation` (`23505`) on the new `UNIQUE (planner_organization_id)` constraint. Depends on T007. **PASSED — 23505 on `organization_planner_links_planner_organization_id_key`, distinct organizations used per the analysis note.**

**Checkpoint**: User Story 3 (tenant isolation) fully verified independently. All three user stories now complete — this is the complete, safe data foundation described in `plan.md`.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Security regression, feature 001 regression, documentation, and final verification gate. Depends on Phases 3–5 being complete. **Mandatory, not optional** — see the note on Phase 3's milestone label above.

- [X] T021 [P] Live-verify RLS per `quickstart.md` §9, using a genuine authenticated non-admin client session: confirm writes to all three new tables are rejected; confirm a real member of a test organization can read (not write) that organization's own `organization_products`/`event_products` rows and cannot read another organization's rows; confirm `organization_planner_links` returns zero rows for a non-admin regardless of organization. Depends on T007. **PASSED — own-org reads succeed, other-org reads return empty, all three writes rejected with 403/42501 (event_products write isolated from the trigger using otherwise-valid data).**
- [X] T022 [P] Live-verify `organization_members`'s existing behavior is completely unchanged per `quickstart.md` §10: a non-admin, non-org-admin user cannot insert themselves into a different organization and cannot self-promote their own role — confirms this feature introduced zero weakening of the pre-existing table's RLS. Depends on T007. **PASSED — cross-org self-insert rejected (403); self-promotion PATCH matched 0 rows (confirmed via `Prefer: return=representation` returning `[]`, then re-verified via service-role read that the stored role is still `'member'`).**
- [X] T023 [P] Live-verify multi-organization membership remains intact (regression only, no schema touched by this feature): confirm an existing user with memberships in 2+ organizations, each with a different role, still has both rows correctly and independently represented in `organization_members`. Depends on T007. **PASSED — confirmed via existing real data (no new test data needed): a real user has 6 organization memberships mixing `member` and `owner` roles.**
- [X] T024 [P] Live-verify platform-admin cross-tenant access remains intact (regression only): confirm a genuine global-admin session (`profiles.global_role = 'admin'`) can read and write all three new tables across multiple different organizations without holding any `organization_members` row of its own in any of them. Depends on T007. **PASSED — confirmed zero `organization_members` rows for the test admin; successfully read/wrote `organization_products` and `organization_planner_links` across two different organizations; all test writes cleaned up immediately.**
- [X] T025 Live-verify feature 001 regression per `quickstart.md` §11, using real temporary test data created and fully cleaned up afterward: link a Portal event to a Bendie Planner event via the existing `bendie-planner` tab, provision a staff-tier member, push the agenda, pull travel data — confirm all four existing flows succeed exactly as before; confirm `event_planner_links`' schema and existing rows are completely untouched by the T007 migration. Depends on T007. **PASSED — real dev-server/browser pass: linking succeeded (confirmed "Actively linked" on page), staff sync succeeded (real Planner identity+assignment created), agenda push succeeded (1 pushed), travel pull succeeded (0 matched/16 unmatched, expected — test member had no travel data); `event_planner_links` schema confirmed byte-for-byte identical to pre-migration. All test data (Portal + Planner, both sides) fully cleaned up and verified at zero afterward.**
- [X] T026 [P] Update `context/schema-reference.md` with a changelog entry documenting `organization_products`, the revised `event_products` (new `organization_id` column, composite FK, consistency trigger), and the revised `organization_planner_links` (new `UNIQUE` constraint) — following the existing entry format from feature 001's own 2026-09-11 entry, and explicitly noting that `organization_members` already existed and was not created by this feature. Depends on T007. **Done.**
- [X] T027 [P] Update `context/progress-tracker.md` with a dated entry for this feature, including the `organization_members`-already-exists discovery so a future session doesn't re-propose creating it. Depends on T007. **Done.**
- [X] T028 Run the repository's `lint`, `type-check`, and `build` scripts; resolve any failures before considering the feature done. Depends on T008, T026, T027. **All three clean — lint: zero new warnings/errors (all pre-existing, unrelated to this feature). type-check: zero errors. build: succeeds, route manifest unchanged (correctly confirms zero UI/API surface added by this feature).**

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately. T002–T005 are mutually parallel once T001 completes.
- **Phase 2 (Foundational)**: Depends on Phase 1 completing. **Blocks all of Phases 3–6.** T006 is the single largest task in this feature (the entire migration); T007 depends on T006; T008 depends on T007.
- **Phases 3–5 (User Stories)**: All depend on Phase 2 (specifically T007) completing. Each story only reads/tests the already-applied schema — no story writes new schema, so **all three stories can be verified in parallel** if staffed, or sequentially in priority order.
- **Phase 6 (Polish)**: Depends on Phases 3–5 all being complete (T021–T025 could technically run as soon as T007 completes, but are sequenced last to match the "verify the full foundation before declaring it done" intent — see Implementation Strategy).

### Parallel Opportunities

- Phase 1: T002–T005 (four tasks) once T001 completes.
- Phase 3–5: T010/T011 (different tables) can run in parallel; T013–T018 are independent rolled-back transactions and can run in parallel (see T020's note on picking distinct test organizations to avoid incidental lock contention with T019); T019/T020 likewise. Across phases, US1/US2/US3 as a whole have no cross-dependency once T007 is done.
- Phase 6: T021–T024 (four independent regression checks) are mutually parallel; T026/T027 (different doc files) are mutually parallel.

---

## Parallel Example: Phase 1

```
Task: "Live-re-verify organization_members's exact shape, RLS, and helper functions"
Task: "Live-re-verify event_members's enforce_event_member_integrity() trigger definition"
Task: "Live-re-verify event_planner_links.is_active semantics, referenced PK types, and zero-NULL organization_id"
Task: "Live-re-verify portal_is_global_admin() and set_updated_at() exist as expected"
```

## Implementation Strategy

### Minimum Independently Verifiable Foundation

**Phases 1–2 plus Phase 3 (T001–T012)** constitute the minimum implementable slice: the complete,
safe, correctly-ordered schema foundation (all three tables, RLS, the consistency trigger) with the
backfill applied and verified correct. This is deliberately **not** a partial state in the sense of
missing enforcement — the entitlement FK, the consistency trigger, the uniqueness constraints, and
every RLS policy are all already fully active as soon as T007 completes, regardless of which later
verification tasks have run. What Phases 4–6 add is *proof* that this enforcement behaves as
designed, that tenant isolation holds, that RLS is correctly scoped, and that feature 001 was not
regressed — these are correctness and security gates this feature is not considered complete
without, per Constitution Principle VIII, not an optional next increment in the way "MVP" can
sometimes imply for a user-facing feature.

### Incremental Delivery

1. Phase 1 + Phase 2 → the full schema foundation exists, live, correctly ordered, type-safe.
2. + Phase 3 (US1) → backfill correctness proven for real existing data (first independently
   verifiable milestone).
3. + Phase 4 (US2) → entitlement-invariant/duplicate-safety/cascade proven for both new tables.
4. + Phase 5 (US3) → tenant isolation proven.
5. + Phase 6 → security/regression/documentation closed out — **feature 002 is only considered
   complete once this phase passes**.

Each increment adds verification confidence without changing the schema again — the only schema
write in this entire feature is T006/T007.

## Explicitly Not Tasked (carried forward from `spec.md`'s Out of Scope)

No task above implements: any UI (organization selector, product selector, dashboard switcher,
entitlement management, Planner workspace/Tasks/Participants/Agenda/Flights/Accommodation/Settings),
automatic Planner organization or event creation, billing/payments/subscriptions/invoicing,
invitations, any change to `organization_members`'s existing roles or RLS, any change to feature
001's sync behavior or `event_planner_links` schema, or any non-global-admin Portal
middleware/navigation change. If any of these appear necessary while executing the tasks above,
treat that as a signal to stop and re-check against `spec.md` rather than silently adding scope.
