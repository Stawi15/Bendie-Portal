---

description: "Task list for Feature 022 — Organisation Products Management"
---

# Tasks: Organisation Products Management

**Input**: specs/022-org-products-admin/ (spec.md, plan.md, research.md, data-model.md, contracts/admin-organizations-api.md, quickstart.md)
**Tests**: none requested. Verification is manual and SQL checks (quickstart.md), plus type-check, lint (baseline 28 warnings) and an isolated build.
**Databases**:
- **Portal migration:** the developer runs it in the **Bendie** project `droaamagpsojkzznywgd` SQL editor, because the MCP declines DDL. It is then verified read-only and recorded in the migration history.
- **Planner SQL:** the developer runs it in the **Planner** project `zghoaawgrmvqdlksuiam`. Check the project id in the URL before running anything.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Pre-flight snapshot, read-only, saved in the session scratchpad (not the repo):
  - **Portal:** `organization_products` (all rows) and `organization_planner_links` (all rows), plus event and event_products counts per organisation.
  - **Planner:** `organizations` (id, name, slug, is_active).

  This is the "before" for SC-003.

---

## Phase 2: Foundational (blocks all stories)

- [X] T002 Create `supabase/migrations/organization_products_admin.sql`, with a "why" header (Constitution III), per data-model.md:
  - **Columns:**
    - `ALTER TABLE organization_products ADD COLUMN IF NOT EXISTS status_changed_at timestamptz NULL, ADD COLUMN IF NOT EXISTS status_changed_by uuid NULL REFERENCES profiles(id) ON DELETE SET NULL`
    - `ALTER TABLE organization_planner_links ADD COLUMN IF NOT EXISTS planner_app_paused_at timestamptz NULL, ADD COLUMN IF NOT EXISTS planner_app_paused_by uuid NULL REFERENCES profiles(id) ON DELETE SET NULL`
  - **Stamp trigger:** `stamp_organization_product_status()`, BEFORE UPDATE on `organization_products`: when `NEW.is_active IS DISTINCT FROM OLD.is_active`, set `status_changed_at = now()` and `status_changed_by = auth.uid()`.
  - **Audit trigger:** `log_organization_product_change()`, `SECURITY DEFINER`, `SET search_path = public`, AFTER INSERT/UPDATE on `organization_products` (row_id = `product_key`) and `organization_planner_links` (row_id = `planner_organization_id::text`).
    - It inserts into `organization_audit_log (organization_id, table_name, action, row_id, diff, actor_user_id)`, with `diff` = the full row on INSERT and the changed columns on UPDATE (same shape as `log_org_content_change`).
    - It skips UPDATEs with no changes.
  - **Grants:** revoke EXECUTE on both trigger functions from public, anon and authenticated.
  - **Create function (/speckit-analyze U1):** `admin_create_organization(p_name text, p_slug text, p_products text[], p_planner_organization_id bigint, p_planner_organization_name text) RETURNS uuid`, `SECURITY INVOKER`, `SET search_path = public`.
    - **Atomic:** in one transaction it inserts `organizations` (`created_by = auth.uid()`), one `organization_products` row per product (`is_active = true`, `enabled_by = auth.uid()`), and, when `'planner' = ANY(p_products)`, the `organization_planner_links` row (`linked_by = auth.uid()`).
    - **Platform admins only:** it raises `insufficient_privilege` unless `portal_is_global_admin()`.
    - **Validation:** it raises `invalid_parameter_value` for empty products, unknown products, Planner without a Planner org id, or a Planner org id without Planner.
    - **Grants:** EXECUTE to authenticated only.
  - **Idempotent:** `DROP TRIGGER IF EXISTS` before each `CREATE TRIGGER`.
- [X] T003 Developer applies T002 in the Bendie SQL editor. Then, read-only via MCP:
  - confirm the 4 columns and 3 triggers exist
  - insert the migration-history row (`supabase_migrations.schema_migrations`, version `20261015…`, name `organization_products_admin`, statement = a pointer to the file)
  - run the security advisors and confirm no new findings for these objects
- [X] T004 [P] Update `src/types/database.ts` by hand:
  - the new `organization_products` columns `status_changed_at`, `status_changed_by`
  - the new `organization_planner_links` columns `planner_app_paused_at`, `planner_app_paused_by`
  - `export type ProductState = 'active' | 'paused' | 'none'`
- [X] T005 [P] Create `src/lib/orgProductsAdmin.ts` (pure, no Supabase):
  - `PRODUCT_LABEL`
  - `productStateOf(rows, product)` → `ProductState`
  - `plannerSlugFrom(name, slug)` (lowercase, dashes, ≤ 60 chars)
  - `STAWI_PLANNER_ORG_ID = 1`
  - request body validators for the contract's bodies, returning `{ ok: true, value } | { ok: false, error }`
- [X] T006 Create `src/lib/orgProductsAdminServer.ts`, starting with `import 'server-only'`:
  - **`requirePlatformAdmin()`:** cookie-auth client as in `src/app/api/admin/planner-link/route.ts`. Returns `{ authClient, userId }` or a `401`/`403` `NextResponse`, checking `profiles.global_role = 'admin'`.
  - **`listUnconnectedPlannerOrgs()`:** Planner orgs minus the linked ids minus `STAWI_PLANNER_ORG_ID`.
  - **`createPlannerOrg(name, baseSlug)`:** insert with a slug suffix `-2`, `-3`… on unique violation, max 10 tries; returns the id and name.
  - **`deletePlannerOrg(id)`:** compensation only, for an org this request just created.
  - **`setPlannerOrgActive(id, active)`.**
  - **`computeImpact(orgId, product)`** (research R9).
  - **Clients:** Planner calls use `getPlannerAdminClient()`; the Portal service client is used only where the contract says so.
- [X] T007 Edit `src/middleware.ts`: requests to `/portal/admin` and below require a platform admin, using the existing role lookup and cache; otherwise redirect to `/unauthorized`. Other paths are unchanged.

**Checkpoint**: migration live, types and libraries ready, admin pages gated.

---

## Phase 3: User Story 1 — See every organisation and its products (P1) 🎯 MVP

**Goal**: a platform-admin-only list of all organisations with product states and Planner connection.
**Independent Test**: quickstart §2.

- [X] T008 [US1] Create `src/app/portal/admin/organisations/page.tsx`:
  - **Guard:** `useAuth().isGlobalAdmin`; non-admins get a "Not available" message (the middleware already redirects them).
  - **Loads (browser client, platform-admin RLS):** `organizations` (id, name, slug, created_at), `organization_products`, `organization_planner_links` (planner_organization_name), event counts (`events` organization_id), member counts (`organization_members`).
  - **Table:** Name (link to the organisation page), Bendie state, Planner state (Active / Paused / Not included chips, token classes), Planner connection ("Not connected" or the name), Events, Members, Created.
  - **Search** by name; a "Create organisation" button (opens T014's flow).
  - **States:** loading skeleton, error with retry, empty.
- [X] T009 [US1] Edit `src/components/portal/TopHeader.tsx`: add "Manage organisations" (icon `domain`, link `/portal/admin/organisations`) where the platform-admin-only controls already sit (~line 221), shown only when `isGlobalAdmin`.
- [ ] T010 [US1] Validate with quickstart §2: list accuracy against the T001 snapshot; a non-admin gets no menu entry, a redirect on the URL, and `403` from the routes (the latter once Phase 4 exists).

---

## Phase 4: User Story 2 — Create an organisation with the right products (P1)

**Goal**: creation with products and a Planner connection, replacing the name-only modal.
**Independent Test**: quickstart §3 (SC-001, SC-002).

- [X] T011 [P] [US2] Create `src/app/api/admin/planner-organizations/route.ts` (GET), per the contract, using `requirePlatformAdmin` and `listUnconnectedPlannerOrgs`. A Planner error returns `502`.
- [X] T012 [US2] Create `src/app/api/admin/organizations/route.ts` (POST), per the contract:
  - **Validate:**
    - name required
    - slug as today
    - products non-empty, from `bendie`/`planner`
    - `planner` present if and only if Planner is chosen
  - **Steps:**
    1. If mode is `new`, `createPlannerOrg`.
    2. Call `authClient.rpc('admin_create_organization', …)`. It creates the organisation, its products and the Planner link **all or nothing** (U1).
    3. If step 2 fails and step 1 created a Planner org, `deletePlannerOrg` (compensation).
  - **Errors:** `23505` on slug → `409` "That slug is already taken"; on `planner_organization_id` → `409` "That Planner organisation is already connected".
  - **RLS note (A1):** platform-admin RLS allows the inserts (verified 2026-10-15).
- [X] T013 [P] [US2] Create `src/components/portal/admin/PlannerConnectionPicker.tsx`: a radio choice between "Use an existing Planner organisation" (a select from GET planner-organizations, empty state "None available") and "Create a new Planner organisation named '{name}'". Emits `{ mode, plannerOrganizationId? }`.
- [X] T014 [US2] Create `src/components/portal/admin/CreateOrganizationFlow.tsx` (a `FormModal`):
  - **Fields:** name, slug (same slugify behaviour as the old modal), product choice cards (Bendie, Planner; at least one), and `PlannerConnectionPicker` shown when Planner is chosen.
  - **Submit:** POST `/api/admin/organizations`; field and toast errors.
  - **Wiring:** use it in `TopHeader.tsx` (where `CreateOrganizationModal` is opened, ~line 515) and on the list page; delete `src/components/portal/CreateOrganizationModal.tsx`.
- [ ] T015 [US2] Validate with quickstart §3: create with both products and a new Planner org; the org admin creates a Planner event first try; the rejection cases; time it (under 2 minutes).

---

## Phase 5: User Story 3 — Upgrade an organisation (P2)

**Goal**: switch a product on (with a connection for Planner) and add it to existing events.
**Independent Test**: quickstart §4.

- [X] T016 [P] [US3] Create `src/app/api/admin/organizations/[organizationId]/planner-connection/route.ts` (POST), per the contract: `409` if a link exists; a `new` mode creates a Planner org with compensation on failure.
- [X] T017 [US3] Create `src/app/api/admin/organizations/[organizationId]/products/[product]/route.ts` (PATCH), per the contract (research R8):
  - **`active: true`:**
    - Planner requires a link (else `400`).
    - Insert the row if absent, else update `WHERE is_active = expectedActive`.
    - If `planner_app_paused_at` is set: `setPlannerOrgActive(true)`, clear the paused columns (the links trigger records it in history).
  - **`active: false`:**
    - Update `WHERE is_active = expectedActive`.
    - If `pausePlannerAppAccess` and Planner: `setPlannerOrgActive(false)`, set `planner_app_paused_at/by` (the links trigger records it in history). If the Planner call fails, revert the product update and return `502`.
  - **Stale:** 0 rows → `409`.
- [X] T018 [P] [US3] Create `src/app/api/admin/organizations/[organizationId]/events/[eventId]/products/route.ts` (POST), per the contract:
  - **Bendie:** insert `event_products`.
  - **Planner:**
    - insert `event_products`
    - set `events.planner_provisioning_status = 'pending'` via the Portal service client, only if it isn't already `succeeded`
    - `provisionPlannerEvent({ authClient, portalAdmin, eventId, organizationId })`
  - **Log:** an ADD entry; return the outcome.
- [X] T019 [US3] Create `src/app/portal/admin/organisations/[organizationId]/page.tsx` (guard as T008), with a header (name, slug, created) and `src/components/portal/admin/ProductsCard.tsx`:
  - **Per product:**
    - a state chip
    - "Last changed {status_changed_at} by {name}" (or `enabled_*` if never changed)
    - the Planner connection (read-only once set; "Connect" with `PlannerConnectionPicker` when absent)
    - a switch
  - **Switching on:** calls PATCH with `expectedActive`; on `409` shows "This changed — reloading" and refetches.
  - **States (C1):** loading skeleton, error with retry, and "Organisation not found" for an unknown id.
- [X] T020 [P] [US3] Create `src/components/portal/admin/AddProductToEvents.tsx`, shown under each Active product:
  - lists the organisation's events without that product, with an "Add Bendie" / "Add Planner" button (confirm first)
  - calls the add-to-event route and shows the outcome
  - a failed Planner set-up shows the reason and a Retry button calling `/api/events/[eventId]/retry-planner-provisioning`
  - an empty state when every event has it
- [ ] T021 [US3] Validate with quickstart §4.

---

## Phase 6: User Story 4 — Pause a product, knowing what it affects (P2)

**Goal**: a safe pause/resume with impact shown, and an optional Planner app pause enforced by Planner.
**Independent Test**: quickstart §1 and §5 (SC-003, SC-004).

- [X] T022 [US4] Write `specs/022-org-products-admin/planner-sql/enforce_planner_organization_active.sql` (research R2):
  - **Re-read the live definitions** from Planner (read-only MCP) of `is_org_admin`, `is_assigned_to_event`, `is_event_admin`, `has_event_module`, `can_view_event_checklist`, `can_manage_event_checklist`, `can_view_event_vendors`, `can_manage_event_vendors`, `can_manage_operational_task`, `can_view_operational_task`, the 3 policies, and the RPCs `get_home_dashboard_summary`, `get_event_notifications`, `mark_event_notifications_as_read`, `get_event_task_assignable_profiles`, `create_operational_task_v2`, `set_operational_task_part_status`, `update_my_task`, `notify_event_audience`, `notify_task_audience`, `get_push_delivery_targets`.
  - **Add** `is_org_active(bigint)` and `is_event_org_active(bigint)`.
  - **Re-create each object with only the added condition:**
    - org admin: `AND is_org_active(org)`
    - assignment paths: `AND is_event_org_active(event)`
    - RPCs: an early guard (reads return empty; writes raise "This organisation's Planner access is paused."; push targets exclude paused-org events)
    - **Platform-admin paths stay untouched.**
  - **Storage (U3):** also read the Planner `storage.objects` policies. If any bucket is event- or organisation-scoped through these helpers or through direct assignment checks, gate it the same way. List the result (gated, or "not event-scoped") in the file header.
  - **Revert file (U2):** in the same pass, write `planner-sql/revert_enforce_planner_organization_active.sql`. It contains the **original live definitions** captured before editing (functions via `pg_get_functiondef`, policies as `DROP POLICY` + `CREATE POLICY` with the original expressions), plus `DROP FUNCTION is_event_org_active, is_org_active`, so the change can be rolled back in one paste.
  - **File header:** "PLANNER project — run in zghoaawgrmvqdlksuiam", with before/after notes.
  - *Implementation note (2026-10-16):* instead of hand-copied bodies, the script backs up the live definitions into `public.planner_access_backup_022` and patches each one at an anchor verified to occur exactly once (stops and rolls back otherwise). The revert file restores from that backup, which is exact by construction. Storage result: every event-scoped bucket is already gated through the helpers (listed in the header).
- [X] T023 [US4] Developer runs T022 in the Planner SQL editor; the revert file is kept ready in case anything breaks. Then verify with quickstart §1, using a test org's temporary `is_active = false` and restoring it:
  - active orgs are unchanged
  - a paused org's events are invisible to non-platform-admins
  - Planner platform admins are unaffected
- [X] T024 [P] [US4] Create `src/app/api/admin/organizations/[organizationId]/impact/route.ts` (GET), using `computeImpact`, per the contract.
  - **Enforcement check (I1):** the response includes `plannerEnforcementLive: boolean`, true only when Planner `rpc('is_org_active', { p_org_id })` succeeds (the Planner SQL is installed).
  - **PATCH safeguard:** the products PATCH (T017) refuses `pausePlannerAppAccess: true` with `409` "Planner app access can't be paused yet — the Planner update hasn't been installed" when enforcement isn't live.
- [X] T025 [US4] Create `src/components/portal/admin/PauseProductDialog.tsx`, wired into `ProductsCard` when switching a product off:
  - **Loads impact.**
  - **Planner:** "{events} events use Planner · {people} people have Planner access", plus an unticked "Also pause Planner app access" checkbox explaining that only Stawi platform admins keep access. The checkbox is shown **only when `plannerEnforcementLive`**; otherwise a note says "Pausing Planner app access becomes available once the Planner update is installed." (I1)
  - **Bendie:** "{events} events use Bendie. Live events keep working in the attendee app."
  - **Confirm:** calls PATCH; shows "Planner app access paused" on the card when it is.
- [ ] T026 [US4] Validate with quickstart §5: compare against the T001 snapshot after pause and resume (SC-003); check app access with the test accounts (SC-004).

---

## Phase 7: User Story 5 — Organisation users see a clear paused state (P3)

**Goal**: a paused notice everywhere instead of silent disappearance.
**Independent Test**: quickstart §6 (SC-006).

- [X] T027 [US5] Product states:
  - **`src/lib/eventAuth.ts`:** add `getProductStates(organizationId, client?)` → `{ bendie: ProductState; planner: ProductState }`, from all `organization_products` rows. It throws on error, like `getAvailableProducts`.
  - **`src/contexts/AvailableProductsContext.tsx`:** expose `states` alongside the existing `available` (unchanged meaning).
- [X] T028 [P] [US5] Create `src/components/portal/PausedProductNotice.tsx`: an icon `pause_circle`, the text "{Product} is paused for your organisation. Contact Stawi to resume it.", and token classes per the UI registry (the tertiary notice style).
- [X] T029 [US5] Edit `src/components/portal/TopHeader.tsx`: in the product switcher, a paused product shows disabled with a "Paused" pill and a title tooltip carrying the notice text.
- [X] T030 [US5] Paused presentation in the product areas:
  - **`src/app/portal/bendie/page.tsx` and `src/app/portal/planner/page.tsx`, and their events pages:** render `PausedProductNotice` when that product's state is `paused`, instead of the guard redirect.
  - **`src/app/portal/events/[eventId]/layout.tsx`:** for a tab whose product is paused, show the notice instead of redirecting.
  - **`src/app/portal/no-product/page.tsx`:** when every product is paused (states, not `none`), say "Your organisation's products are paused. Contact Stawi to resume them."
  - **Entitlement checks are unchanged.**
- [ ] T031 [US5] Validate with quickstart §6.

---

## Phase 8: User Story 6 — Product history (P3)

**Goal**: an accountable history on the organisation page.
**Independent Test**: quickstart §7 (SC-007).

- [X] T032 [US6] On `src/app/portal/admin/organisations/[organizationId]/page.tsx`, add:
  - **Overview:** events per product (from `event_products`), and member count.
  - **`src/components/portal/admin/OrganisationHistory.tsx`:**
    - reads `organization_audit_log` for the organisation with `table_name IN ('organization_products','organization_planner_links','event_products')`, newest first, limit 100
    - renders plain-language lines ("Planner paused", "Planner app access paused", "Connected to Planner organisation 'X'", "Planner added to event 'Y'") with the actor's name (from `profiles`) and time
    - loading, error and empty states
- [ ] T033 [US6] Validate with quickstart §7.

---

## Phase 9: Polish & cross-cutting

- [X] T034 [P] Docs (Constitution VII):
  - **`context/architecture.md`:** the platform-admin Organisations area, the `/portal/admin` gate, and Planner organisation enforcement.
  - **`context/schema-reference.md`:** the new columns and triggers, and the history table names.
  - **`context/progress-tracker.md`:** a Feature 022 entry.
  - **`context/ui-registry.md`** (via `/imprint`) — done as part of T037.
- [X] T035 `npm run type-check`, `npm run lint` (no new warnings over 28), and an isolated build in the scratchpad with placeholder env values (as in Feature 021 T029).
- [ ] T036 Regression:
  - creating events (Bendie, Planner, both) as an org admin is unchanged
  - Planner event set-up and retry are unchanged
  - an organisation with all products active sees no notices
  - Feature 021 agenda pages are unaffected
- [ ] T037 Wrap-up: `/imprint` (admin list, ProductsCard, paused notice), `/review` (report first), `/speckit-converge`, commit on `developement` (feature commit, then the `tsconfig.tsbuildinfo` chore), `/remember save`.

---

## Dependencies & execution order

- **T001 → T002 → T003** (migration live). T004, T005 [P] can run alongside. T006 → T007.
- **US1 (T008–T010)** needs Phase 2.
- **US2 (T011–T015)** needs Phase 2. T011 and T013 [P]. T014 needs T011–T013.
- **US3 (T016–T021)** needs Phase 2. T016, T018 and T020 are [P] (different files). T019 needs T017.
- **US4:**
  - **T022 → T023** (Planner SQL) can be done any time after T001, and is independent of the Portal UI.
  - **T024** [P].
  - **T025** needs T017, T019 **and T023** (I1: the checkbox only works once Planner enforcement is live; T024's `plannerEnforcementLive` guards against it being shown early).
  - **The app-pause part of T017** relies on T023 being live to have any effect.
- **US5 (T027–T031)** needs Phase 2 only (it reads states). It can run in parallel with US2–US4.
- **US6 (T032–T033)** needs T002/T003 and the US3/US4 routes to produce entries.
- **Polish** comes last.

## Parallel examples

```text
# Phase 2: T004 database.ts | T005 orgProductsAdmin.ts
# US2: T011 planner-organizations route | T013 PlannerConnectionPicker
# US3: T016 planner-connection route | T018 add-to-event route | T020 AddProductToEvents
# Independent tracks: T022/T023 Planner SQL | US5 paused presentation (T027–T030)
```

## Implementation strategy

1. **MVP:** Phase 2 + US1 + US2. Platform admins can see and create organisations with the right products, which removes the database work for new clients.
2. **Then** US3 (upgrade) and US4 (pause, with the Planner SQL run by the developer).
3. **Then** US5 (paused notices) and US6 (history), then polish.

## Traceability

| Requirement | Tasks |
|---|---|
| FR-001–002 | T006, T007, T008, T009, every route |
| FR-003 | T008 |
| FR-004–005 | T011–T014 |
| FR-006–007 | T016, T017, T019 |
| FR-008 | T024, T025 |
| FR-009, FR-011 | T017, T026 |
| FR-010 | T022, T023, T017 |
| FR-012 | T018, T020 |
| FR-013, FR-017 | existing DB constraints; T016, T019 (read-only connection) |
| FR-014–015 | T027–T030; routes are platform-admin only |
| FR-016 | T002, T017, T018, T032 |
| FR-018 | T017, T019 |
| SC-001–007 | T015, T026, T010, T031, T033 |
