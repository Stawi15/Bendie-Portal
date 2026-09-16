---

description: "Task list for Feature 003: Organization & Event Access Foundation"
---

# Tasks: Organization & Event Access Foundation

**Input**: Design documents from `specs/003-organization-event-access-foundation/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [quickstart.md](./quickstart.md)

**Tests**: No automated test framework exists in this repository (unchanged from Features 001/002). "Test" tasks below are live, manual verification against the real Portal Supabase database, per `quickstart.md`'s A–Z matrix — not automated test files.

**Organization**: Tasks are grouped by user story per `spec.md`'s 7 stories. **Critical ordering note**: unlike a typical Spec Kit feature, Phase 2 (Foundational) here is not optional infrastructure — it is the security foundation (RLS policy, `eventAuth.ts`, `EventContext` workspace guard) that MUST exist and be live-verified *before* Phase 3 widens Portal admission. Widening `middleware.ts` before Phase 2 completes would create a real, temporarily-unsafe state (an org admin could reach the event tab shell for events they don't hold `event_members` on). Phase 3 (US1) is therefore not a standalone "MVP" in the usual sense — it is only safe to ship once Phase 2 has passed its own checkpoint.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task, no shared security-sensitive file)
- **[Story]**: US1–US7 map to spec.md's 7 user stories in priority order (US1–US3 = P1, US4–US7 = P2)

---

## Phase 1: Setup (Brownfield Re-verification)

**Purpose**: Re-confirm the live brownfield facts plan.md/research.md relied on, immediately before touching anything, since state can drift between planning and implementation.

- [x] T001 Re-verify live `events`/`event_members`/`organization_members`/`organization_products`/`event_products` RLS policy text via direct query against the Portal database, and confirm it still matches research.md items 4–6 exactly (no drift since planning).
- [x] T002 Re-verify `middleware.ts`, `src/contexts/EventContext.tsx`, `src/app/portal/events/[eventId]/layout.tsx`, `src/lib/portalAuth.ts`, `src/contexts/OrganizationContext.tsx`, and `src/lib/eventSectionMeta.ts` still match the exact behavior described in plan.md/research.md (no unrelated changes landed since planning).
- [x] T003 [P] Re-verify no code path in `src/app/portal/**` writes `events.organization_id` (research.md item 14) — if one is found, STOP and report the conflict rather than proceeding.

**Checkpoint**: Brownfield assumptions confirmed current. Proceed only if T001–T003 found no discrepancy.

---

## Phase 2: Foundational — Authorization Core (BLOCKING, must complete before ANY user story, including US1)

**Purpose**: Establish the server-side authorization foundation (metadata-visibility RLS + workspace-access guard) *before* Portal admission is widened, per the critical ordering constraint above.

**⚠️ CRITICAL**: No user story work — especially the `middleware.ts` change in Phase 3 — may begin until this phase's checkpoint passes.

- [x] T004 Create migration `supabase/migrations/organization_admin_event_metadata_visibility.sql` adding exactly one new policy, `events_select_org_admin` (`FOR SELECT USING (public.is_organization_admin(organization_id))`), per data-model.md's exact SQL. Do not modify any Feature 002 migration file. Do not add, modify, or remove any other policy on `events`, `event_members`, or any content table.
- [x] T005 Apply the migration via `apply_migration` against the Portal project; confirm via `list_migrations` it is recorded, and via `get_advisors` (security) that no new advisory is introduced.
- [x] T006 Create `src/lib/eventAuth.ts` exporting: `canViewEventMetadata(userId, event)` (true if platform admin, or caller's `organization_members.role` for the event's organization is `owner`/`admin`, or caller holds an `event_members` row for the event); `requireEventWorkspaceAccess(eventId, userId, selectedOrganizationId)` (true only if platform admin OR (a live `event_members` row exists for `(eventId, userId)` AND the event's own `organization_id` equals `selectedOrganizationId`) — resolved from the database, never from client-supplied role/organization claims, never satisfied by organization-admin role alone. **Correction from /speckit.analyze (Finding A, HIGH)**: FR-013 requires "event belongs to the user's currently selected organization" as a condition distinct from holding `event_members` — a multi-org user may legitimately hold `event_members` rows in more than one organization; without this check, a direct URL to an event in a *non-selected* organization the user also belongs to would incorrectly succeed. This must be an explicit, required parameter, not an optional enhancement); `isProductActiveForOrg(organizationId, productKey)` (reads `organization_products` filtered to `is_active = true`); `isProductAvailableForEvent(event, organizationId, productKey)` (`isProductActiveForOrg(...) && event.event_products includes productKey`). Depends on: T004, T005 (must query against the live post-migration schema).
- [x] T007 Modify `src/contexts/EventContext.tsx`: after fetching an `events` row (`handleSetCurrentEvent`, initial `loadEvents`, `refreshEvent`), call `requireEventWorkspaceAccess(eventId, currentUserId)` from `src/lib/eventAuth.ts` and expose the result as a new `canAccessWorkspace: boolean` (and `workspaceAccessChecked: boolean` to distinguish "not yet checked" from "checked and denied") field on `EventContextType`. A successful `events` row fetch MUST NOT by itself set `canAccessWorkspace` to true. Depends on: T006.
- [x] T008 Modify `src/app/portal/events/[eventId]/layout.tsx`: render the existing tab shell (`EVENT_SECTIONS` nav + `children`) only when `canAccessWorkspace === true`; otherwise render a forbidden/no-access state (reuse the portal's existing empty/error-state pattern — no new visual component). Depends on: T007.
- [x] T009 Live verification (attack scenario, mandatory): as a real test organization owner/admin with an `event_members` row on **no** event in their organization, confirm (a) a direct `events` table SELECT for one of their organization's events succeeds (new RLS policy working), and (b) opening `/portal/events/<that-event-id>/dashboard` in the running app renders the forbidden state, not the tab shell, not a silently-empty page. Depends on: T004–T008.
- [x] T010 [P] Live verification: an ordinary member of a *different* organization cannot SELECT the test event's metadata at all (cross-tenant denial, confirming the new policy is scoped correctly by `organization_id`, not global). Depends on: T004, T005.
- [x] T011 [P] Live verification: an ordinary member *of the same organization* with no `event_members` row also cannot see the event via the new policy (it is `owner`/`admin`-only, not all-members) — confirms `is_organization_admin()` is doing real role filtering, not a bare membership check. Depends on: T004, T005.

### Finding C/D closure — existing event/organization creation over-exposure (added by /speckit.analyze)

**Discovery**: brownfield inspection during analysis found that `events_insert_creator`'s `WITH CHECK` permits **any** `is_organization_member(organization_id)` — not just `owner`/`admin` — to create an event (`src/app/portal/events/page.tsx`'s "New Event" button has no role gate), and `organizations_insert_creator`'s `WITH CHECK` permits **any authenticated user** (`created_by = auth.uid()`, no membership requirement at all) to create a brand-new organization (`src/components/portal/TopHeader.tsx`'s "New Organisation" trigger has no role gate). Both were previously harmless only because middleware blocked every non-platform-admin from reaching `/portal` at all. Once Phase 3 widens admission, both become newly, silently reachable by ordinary customers — a real capability expansion spec.md never requested and FR-035 explicitly says must not happen "beyond what is strictly required," undocumented. This is a security-compatibility fix required by Feature 003's own admission change, not Feature 004 scope, per AGENTS.md's "document and fix if it blocks the current feature."

- [x] T046 Create migration `supabase/migrations/event_and_organization_creation_admin_restriction.sql`: change `events_insert_creator`'s `WITH CHECK` from `is_organization_member(organization_id)` to `is_organization_admin(organization_id)` (keep the existing org-creator fallback clause unchanged — an organization's own creator may still create its first event); change `organizations_insert_creator`'s `WITH CHECK` from `(created_by = auth.uid())` to `portal_is_global_admin()`, restoring organization creation to its pre-Feature-003 effective capability (platform-admin-only). Apply via `apply_migration`; confirm via `list_migrations`/`get_advisors`. Depends on: T001 (must re-verify these exact policies live before writing the migration).
- [x] T047 [P] Modify `src/app/portal/events/page.tsx`: hide/disable the "New Event" button unless the caller is a platform admin or holds `owner`/`admin` role in the selected organization (reuse `isOrgAdmin()` from `src/lib/portalAuth.ts`). Depends on: T046.
- [x] T048 [P] Modify `src/components/portal/TopHeader.tsx`: hide the "New Organisation" trigger in both org-switcher menus (mobile and desktop) for non-platform-admin users, matching T046's RLS restriction exactly. Depends on: T046.
- [x] T049 [P] Live verification: as a real ordinary organization member (not `owner`/`admin`), attempt to insert an `events` row directly (bypassing the now-hidden UI) — confirm RLS denies it; as a real org `owner`/`admin`, confirm event creation still succeeds exactly as before. Depends on: T046.
- [x] T050 [P] Live verification: as a real authenticated customer of any role, attempt to insert an `organizations` row directly — confirm RLS denies it; as a real platform admin, confirm organization creation still succeeds exactly as before. Depends on: T046.

**Checkpoint (MANDATORY GATE)**: T001–T011 and T046–T050 must all pass before Phase 3 begins. This is the point at which "org admin metadata visibility never satisfies workspace access" AND "widened admission does not silently expand who can create events/organizations" are both proven live, not just designed.

---

## Phase 3: User Story 1 - Customer organization member can enter Portal safely (Priority: P1)

**Goal**: An authenticated user with ≥1 `organization_members` row (and not a platform admin) can open the Portal and see only what they're permitted to see; a user with zero memberships gets a safe no-access state.

**Independent Test**: Log in as a real `organization_members` user with `global_role` not `'admin'`; confirm admission (no `/unauthorized` redirect) and correct organization resolution.

- [x] T012 [US1] Modify `src/middleware.ts`: change the `/portal` admission condition from `role !== 'admin'` to `role !== 'admin' AND` (no live `organization_members` row for this user) — i.e., admit when platform admin OR ≥1 membership row exists. Reuse the existing `portal_role_cache` cookie mechanism's pattern for a second, similarly-scoped 60s-cached existence check (a stale cache entry here only delays a demotion's UX effect, exactly as the existing role cache already documents — it must never be treated as authorization evidence for any specific resource, only as a Portal-admission UX cache). Redirect users who satisfy neither condition to a new no-access route (T013), not `/unauthorized`. Depends on: Phase 2 checkpoint.
- [x] T013 [US1] Create a no-organization/no-access route (e.g. `src/app/portal/no-access/page.tsx`) reusing the portal's existing empty-state visual pattern — no tenant data, org list, or event data is fetched or rendered on this page. Depends on: none (can be built alongside T012).
- [x] T014 [US1] Confirm (read-only inspection, no code change expected) that `getAccessibleOrganizations()` (`src/lib/portalAuth.ts`) and `OrganizationContext` require no modification for this story, per research.md item 2 — if inspection finds a real gap, document it as a new task here rather than silently patching. Depends on: T001.
- [x] T015 [US1] Live verification: identity B (authenticated, 0 orgs, not platform admin) → admitted, routed to the T013 no-access state, zero tenant data visible. Depends on: T012, T013.
- [x] T016 [P] [US1] Live verification: identity C (customer, exactly 1 org) → admitted, organization auto-selected via existing `OrganizationContext` behavior. Depends on: T012.
- [x] T017 [P] [US1] Live verification: identity A (unauthenticated) → unchanged redirect-to-login behavior, confirming the middleware change did not affect this branch. Depends on: T012.

**Checkpoint**: Customers with valid organization membership can now enter the Portal; customers with none see a safe, empty state. Not yet complete without US2/US3 (an admitted customer still cannot safely browse or open events until those ship — do not treat this checkpoint as deployable alone).

---

## Phase 4: User Story 2 - Customer can access an assigned event (Priority: P1)

**Goal**: A customer with an explicit `event_members` row can open that event's workspace.

**Independent Test**: As a user with `event_members` on event E, open E and confirm workspace access succeeds; confirm a different event F (no `event_members`) is denied.

- [x] T018 [US2] Modify `getAccessibleEvents()` in `src/lib/portalAuth.ts`: replace the hard `if (profile.global_role !== 'admin') return [];` branch with a real query: `supabase.from('events').select('id,name,status,starts_at,organization_id').eq('organization_id', selectedOrganizationId).order('starts_at', { ascending: false })`, scoped to the caller's currently-selected organization (per FR-007), letting the Phase 2 RLS policies determine which rows actually come back for each caller (platform-admin branch stays exactly as-is; this only replaces the previously-hardcoded `[]` path). Depends on: Phase 2 checkpoint, T012.
- [x] T019 [US2] Confirm `EventContext`'s `loadEvents()` correctly surfaces the `canAccessWorkspace`/`workspaceAccessChecked` fields (T007) for whichever event ends up selected as `currentEvent` on initial load, and that navigating between events in the `events` list re-runs the Phase 2 workspace check for the newly-selected event. Depends on: T007, T018.
- [x] T020 [US2] Live verification: identity E (ordinary member, has `event_members` on E1) → E1 appears in their event list and opens successfully (tab shell renders). Depends on: T018, T019.
- [x] T021 [P] [US2] Live verification: identity F (ordinary member, no `event_members` anywhere in their organization) → event list is empty for that organization; direct URL to any event in that organization is denied (reuses the Phase 2 workspace guard). Depends on: T018, T019.

**Checkpoint**: A real customer can now both discover and enter events they're explicitly assigned to.

---

## Phase 5: User Story 3 - Tenant isolation (Priority: P1)

**Goal**: No cross-tenant access via manipulated IDs or stale context.

**Independent Test**: As a member of Org A only, attempt direct access to Org B's organization/event data via manipulated IDs and confirm denial at every layer.

- [x] T022 [US3] Live verification (attack R): supply a manipulated/arbitrary `organization_id` in a client request for org-scoped data (e.g. the `getAccessibleEvents()` query from T018) and confirm the server/RLS layer denies or returns nothing, never trusting the value directly. Depends on: T018.
- [x] T023 [P] [US3] Live verification (attack S): supply a manipulated/arbitrary `event_id` (an event belonging to an organization the caller is not a member of) directly to `requireEventWorkspaceAccess` and to a direct URL visit; confirm denial in both cases. **Additionally verify the Finding-A case**: a real test user with a genuine `event_members` row on an event in Organization B, but with Organization A currently selected, must be denied direct-URL access to that Organization-B event (not merely returned a wrong-context UI — an actual `requireEventWorkspaceAccess` denial), proving selected-organization scoping is enforced, not just cross-tenant membership. Depends on: T007, T008.
- [x] T024 [P] [US3] Live verification (attack T): set a test user's `profiles.current_organization_id` to an organization they no longer belong to (membership row deleted), reload the Portal, and confirm `OrganizationContext`'s existing revalidation (research.md item 2) falls back to a valid organization or the T013 no-access state — never the stale organization's data. Depends on: T012, T013.
- [x] T025 [P] [US3] Live verification (attack V): as a customer (non-platform-admin) test user, attempt to call one `app/api/admin/**` route directly (e.g. `planner-link`) and confirm the existing independent `global_role==='admin'` check still rejects them post-middleware-change. Depends on: T012.

**Checkpoint**: Tenant isolation is proven under direct manipulation, not just through the normal UI.

---

## Phase 6: User Story 4 - Organization administrator can oversee events without automatically gaining event content (Priority: P2)

**Goal**: Org owner/admin sees all org event metadata but still needs explicit `event_members` for workspace access.

**Independent Test**: As an org owner/admin with no `event_members` on event E, confirm E appears in the event list but its workspace is denied; add `event_members` and confirm access.

- [x] T026 [US4] Confirm (via T018's query + the Phase 2 RLS policy) that an org owner/admin's event list includes every event in their organization, including ones with no `event_members` row for them — no additional application code should be required beyond T018, since RLS does the filtering; if a gap is found, add the minimal fix here rather than in Phase 2. Depends on: T018, Phase 2 checkpoint.
- [x] T027 [US4] Live verification: identity G (org admin, no `event_members`) — full quickstart.md row G: event list shows all org events, direct workspace URL is denied (re-confirms T009 under the real UI flow, not just a raw query). Depends on: T026.
- [x] T028 [P] [US4] Live verification: identity H (org admin, has `event_members` on one event) — that event opens successfully; a second event in the same org (no `event_members`) is still denied. Depends on: T026.

**Checkpoint**: Org admins can administer without an implicit content-access escalation.

---

## Phase 7: User Story 5 - Multi-organization user can switch safely (Priority: P2)

**Goal**: A user with different roles in different organizations never leaks privilege across the organization boundary.

**Independent Test**: User is `admin` in Org A, `member` in Org B; confirm Org-B behavior matches an ordinary member, not an admin, when Org B is selected.

- [x] T029 [US5] Live verification: identity I — with Org A selected, confirm US4's org-admin event-list behavior applies to Org A only; switch to Org B via the existing `OrganizationContext` switcher and confirm the event list immediately reflects ordinary-member scoping (only `event_members`-granted events), with zero Org-A-derived elevation. Depends on: T018, T026, Phase 3 checkpoint.
- [x] T030 [P] [US5] Confirm no code path anywhere in T006/T018/T026 derives organization authority from "the user's highest role across all memberships" rather than the specific `organization_id` being evaluated (read-only code review of `eventAuth.ts` and the modified `getAccessibleEvents()`). Depends on: T006, T018.

**Checkpoint**: Multi-org role isolation proven, not just assumed from RLS parameterization.

---

## Phase 8: User Story 6 - Product-aware navigation (Priority: P2)

**Goal**: Event navigation reflects active entitlement + `event_products`; existing Bendie events are unaffected.

**Independent Test**: View a pre-existing event and confirm identical navigation to today; confirm an inactive-entitlement test event hides that product's tabs.

- [x] T031 [US6] Modify `EventSectionMeta` type and every entry in `EVENT_SECTIONS` (`src/lib/eventSectionMeta.ts`) to add `product: 'bendie' | 'planner' | 'shared'`. Classify all 23 existing Bendie-content tabs and the Feature-001 `bendie-planner` tab as `'bendie'` (per research.md item 10 — the linking tab is Bendie-side tooling, not a Planner workspace module). Do not add any entry with `product: 'planner'` (no Planner workspace module exists to classify — per research.md item 11 / FR-024). Depends on: none (independent of Phase 2–7's auth work; touches only this config file's shape).
- [x] T032 [US6] Modify `src/app/portal/events/[eventId]/layout.tsx`: (a) for the tab-rendering `.map()` over `EVENT_SECTIONS`, render a tab link only when `isProductAvailableForEvent(currentEvent, organizationId, tab.product)` is true (from `src/lib/eventAuth.ts`, T006); `'shared'` tabs (none currently classified as such, reserved for future non-product-specific tabs) always render; (b) **Correction from /speckit.analyze (Finding B, HIGH — "Navigation vs Authorization")**: also compare the currently-active route's section (derived from `pathname`) against `EVENT_SECTIONS`, and when the active section's product is not available per `isProductAvailableForEvent`, render the same forbidden/unavailable state used for denied workspace access (T008) instead of `children` — hiding a tab link is UX only and MUST NOT be the sole enforcement; direct navigation to a product-unavailable tab's URL must be blocked at this same layout gate, not merely omitted from the nav bar. Depends on: T006, T031, T008 (same file as the Phase 2 forbidden-state change — sequential, not parallel).
- [x] T033 [US6] Live verification (regression, SC-005): view several of the 16 pre-existing events as their real assigned members/admins; confirm all 23 Bendie tabs render identically to pre-Feature-003 behavior (every existing event already has an active `bendie` entitlement + `bendie` `event_products` row per Feature 002's backfill, so this must be a no-op). Depends on: T032.
- [x] T034 [P] [US6] Live verification (product states L, M): using temporary test data only, confirm (L) an event with active Bendie entitlement + `bendie` `event_products` shows Bendie tabs, and (M) temporarily flipping that test organization's `organization_products.is_active` to `false` hides the tabs without deleting the underlying `event_products` row; restore `is_active = true` afterward. Depends on: T032.
- [x] T035 [P] [US6] Live verification (product states N–Q): using temporary test data only (no production organization has a Planner entitlement today), confirm `isProductAvailableForEvent` computes the correct true/false result for active/inactive Planner entitlement combined with a `planner` `event_products` row, and for "row exists but entitlement inactive" — with no Planner tab ever rendering, since none is classified `'planner'` (T031). Depends on: T006, T031.
- [x] T051 [US6] Live verification (Finding B closure): with a test event's Bendie entitlement temporarily set `is_active = false` (restored immediately after), attempt **direct URL navigation** to one of that event's Bendie tab routes (not just checking the nav bar) and confirm the T032(b) forbidden/unavailable state renders instead of the tab's real content — proving product availability is an access-control gate, not merely a navigation hide. Depends on: T032.

**Checkpoint**: Navigation is provably data-driven, and existing Bendie events are provably unchanged.

---

## Phase 9: User Story 7 - Platform admin compatibility (Priority: P2)

**Goal**: Platform admins retain full existing behavior with zero `organization_members`/`event_members` rows.

**Independent Test**: As a platform admin with no membership rows, confirm every existing capability still works after all prior phases.

- [x] T036 [US7] Live verification: identity J (platform admin, 0 `organization_members`) — organization list still shows all organizations (existing `getAccessibleOrganizations()` admin branch, untouched). Depends on: Phase 3–8 complete.
- [x] T037 [P] [US7] Live verification: identity K (platform admin, 0 `event_members`) — can open any event's workspace (all 24 tabs, filtered only by that event's real `event_products`/entitlement, never by membership) exactly as before this feature. Depends on: T007, T008, T032.

**Checkpoint**: All 7 user stories independently verified live.

---

## Phase 10: Polish & Cross-Cutting Concerns (Regression, Documentation)

**Purpose**: Feature 001/002 regression proof, M2 confirmation, platform-admin route documentation, quality gates, docs.

- [x] T038 [P] Live regression verification (Feature 001, quickstart.md X): open the `bendie-planner` tab on a real linked test event as an authorized user; confirm link/unlink, member sync (`planner-sync-member`), agenda push, and travel pull all behave exactly as before this feature. Confirm all 5 `app/api/admin/planner-*` routes still reject a non-global-admin caller (re-run T025's check against each of the 5, not just `planner-link`). Depends on: Phase 3 checkpoint.
- [x] T039 [P] Live regression verification (Feature 002, quickstart.md Y): re-run Feature 002's own quickstart checks — `organization_members`/`organization_products`/`event_products`/`organization_planner_links` live row counts and RLS policy text unchanged; the `event_products` composite FK and `enforce_event_product_org_consistency()` trigger still reject an unentitled product; `organization_planner_links`'s `UNIQUE(planner_organization_id)` still holds. Depends on: T004, T005.
- [x] T040 [P] Confirm (read-only, per research.md item 14) that no code path added anywhere in Phases 2–9 introduced a way to update `events.organization_id`; if the earlier T003 finding was clean and nothing in this feature touched event-editing code, this is a pure confirmation, not new work.
- [x] T041 [P] Confirm existing platform-only surfaces remain independently protected now that `/portal` admits customers: re-verify `teams` table RLS is still 100% `portal_is_global_admin()`-only (no policy added by this feature touches it), and that `/portal/people`, `/portal/assets`, `/portal/activity-log`, `/portal/settings` remain correctly organization-scoped by their existing `useOrganization()` usage (no change expected — confirmation only, per data-model.md's route inventory). Do not create a `/portal/admin/*` directory or any page in it — document the reservation in T043 instead.
- [x] T042 Run the project's lint, type-check, and build commands (quickstart.md Z); fix only failures actually caused by this feature's changes.
- [x] T043 [P] Update `context/progress-tracker.md` with a new entry for this feature (admission change, new RLS policy, new `eventAuth.ts`, product-aware navigation, and a note reserving `/portal/admin/*` for future platform-admin-only surfaces — no page created).
- [x] T044 [P] Update `context/schema-reference.md` documenting both new `events`/`organizations` RLS changes: the new `events_select_org_admin` policy (metadata visibility) and the `events_insert_creator`/`organizations_insert_creator` restriction tightening (`event_and_organization_creation_admin_restriction.sql`, added during `/speckit.analyze` to close a real over-exposure this feature's admission change would otherwise have introduced); no table/column changes to document.
- [x] T045 Clean up all temporary test data (test organizations, users, memberships, events, and any `organization_products.is_active` values flipped for T034) created across every live-verification task in this file; re-confirm baseline live counts (6 organizations, 16 events) are unchanged.

---

## Phase 11: Corrective Pass (independent post-implementation review, F-R1–F-R6)

**Purpose**: An independent `/code-review` after the 51/51-task implementation found two BLOCKING gaps (F-R1, F-R2) and three lower-severity findings (F-R4, F-R5 corrected here as security-adjacent; F-R3, F-R6 documented, not code-changed). All tasks below were added and completed in this corrective pass; no historical T001–T045 task text was altered.

- [x] T052 Fix F-R1 in `src/app/portal/events/[eventId]/layout.tsx`: replace the fall-through render (which let `children` mount while `workspaceAccessChecked`/`productAvailabilityChecked` were still resolving) with an explicit CHECKING → AUTHORIZED/DENIED state machine — a loading skeleton renders for both the workspace check and the per-tab product-availability check, and `children` never mounts until both have resolved to true. Depends on: none (isolated to this file).
- [x] T053 Live verification (F-R1 outcome-level): an ordinary member with no `event_members` row on a test event still receives the workspace-forbidden state on direct URL, not the tab shell (re-confirms T009 continues to hold after the state-machine rewrite). Note: the exact render-timing race itself (whether `children` could theoretically mount for one tick before the check starts) is verified by code inspection of the new control flow, not by an injected-delay live test — documented as such rather than overclaiming a timing-level live proof. Depends on: T052.
- [x] T054 Create and apply migration `supabase/migrations/event_members_role_self_promotion_guard.sql`: a `BEFORE UPDATE` trigger, `enforce_event_member_role_immutability()`, rejecting any change to `event_members.role` unless the caller is a platform admin or `is_event_host_or_organizer(event_id)` for that event — closing the F-R2 self-role-escalation gap in `event_members_update_self_or_host`'s unconditional `user_id = auth.uid()` clause. Non-role self-updates (e.g. `onboarding_status`) remain unaffected. Depends on: none (new migration, does not edit `event_and_organization_creation_admin_restriction.sql` or any other applied migration).
- [x] T055 **Bug found during T057's own live verification, fixed same pass**: the T054 trigger also blocked legitimate service-role writes to `role` (any `app/api/admin/**` route, or ordinary test/ops tooling), because `portal_is_global_admin()`/`is_event_host_or_organizer()` resolve via `auth.uid()`, which is null for a service-role connection. Two incorrect exemption attempts (`current_user = 'service_role'` — wrong because `current_user` reflects the function owner inside this `SECURITY DEFINER` function, not the caller; `session_user = 'service_role'` — wrong because PostgREST connects every request, service-role included, as the pooled `authenticator` role) were applied and superseded live before landing the correct one, `current_setting('role', true) = 'service_role'` (confirmed via a temporary debug-probe function, removed in the same migration) — see `supabase/migrations/event_members_role_guard_role_setting_fix.sql` (final) and the two now-superseded intermediate migration files (kept, per this repo's migration-immutability rule — an applied migration is never deleted even when superseded). Depends on: T054.
- [x] T056 Add a management-role guard to `src/app/portal/events/[eventId]/members/page.tsx`: reuses the existing `is_event_host_or_organizer` RPC (the same predicate `event_members`' own RLS already uses for this exact distinction — no new role invented) to fail-closed the entire page (loading → forbidden/allowed) for platform admin or event host/organizer/admin only; `fetchData()` no longer runs until the check resolves true. Depends on: none (isolated to this file, reuses an existing DB function).
- [x] T057 Live verification (F-R2, database + route level): ordinary attendee cannot self-promote to `admin` or `host` (denied by T054/T055's trigger); ordinary attendee's non-role self-update (`onboarding_status`) still succeeds; ordinary attendee cannot modify another member's row at all (row state unchanged, verified via service-role read, not merely absence of a client error — an RLS-narrowed-to-zero-rows `UPDATE` is a silent no-op, not an error); event host **can** still change another member's role (manager capability preserved); `is_event_host_or_organizer` returns `false`/`true` correctly for attendee/host respectively (the exact predicate T056's page guard uses); UI-level: attendee sees the forbidden page and zero management controls, host sees the real page. Depends on: T054, T055, T056.
- [x] T058 F-R4 (handled conservatively, no privilege granted): `src/app/portal/events/[eventId]/members/page.tsx` — hide "Import CSV" and "Add Member" (the two controls that can reach `/api/admin/create-user` / `/api/admin/bulk-create-users`, both correctly platform-admin-only) for event managers who are not platform admins, replaced with an inline note that new-account provisioning is currently a platform-administration function; "Add All Organisation Members" and "Assign a Team" (which only add existing accounts, no `create-user` call) remain visible to event managers. No API route was weakened. Depends on: T056.
- [x] T059 F-R5: add a platform-admin-only guard to `src/app/portal/events/[eventId]/bendie-planner/page.tsx` (loading → forbidden/allowed on `useAuth().isGlobalAdmin`), and stop its `fetchLink`/`fetchMembers` effect from running until that check passes — the Feature 001 integration surface is administrative (all 5 `planner-*` API routes have only ever authorized platform admins; this page previously relied entirely on the old admin-only `/portal` middleware gate for the same boundary). `EVENT_SECTIONS`' `product: 'bendie'` classification for this tab is left unchanged (product classification and administrative role are different concerns, per the review's own framing) — the fix is a page-level authorization guard, not a product-classification change. Depends on: none (isolated to this file).
- [x] T060 Live verification (F-R5): ordinary attendee and event host (neither a platform admin) both see the forbidden state on direct URL to `bendie-planner`; platform admin sees the real page unchanged; no member sync-status data (including other members' `planner_sync_status`/`planner_sync_error`) is fetched for a non-platform-admin caller. Depends on: T059.
- [x] T061 Re-audit all 24 `/portal/events/[eventId]/*` tabs for the same "safe only because Portal was previously global-admin-only" pattern that produced F-R2/F-R5. Findings documented in `research.md` addendum item 17 rather than applied as code changes here (see rationale there): the broad `is_event_member(event_id)`-scoped UPDATE/DELETE RLS on ~15 ordinary content tables (agenda_sessions, facilitators, activities, excursions, expo_spaces, games, faqs, emergency_contacts, info_content, support_contacts, event_photos, etc.) is a pre-existing, deliberately-hardened (its own dedicated `rls_audit_fix_missing_and_loose_write_policies` migration predates Feature 001) collaborative-content-editing model, not a privilege-escalation vector — none of those tables has a role/privilege column analogous to `event_members.role`. No second concrete privilege-escalation path was found. Depends on: none.
- [x] T062 F-R3 investigation (no code change): confirmed the `events_insert_creator` org-creator fallback clause is byte-for-byte pre-existing (present before any Feature 003 migration, inherited from Feature 002/earlier). Feature 003's own admission widening does incrementally increase its practical reachability (previously required global-admin access to exploit at all; now requires only any live authenticated Portal session, via a direct API call, plus the narrow precondition of having created an organization and later been fully removed from its membership). Per this task's explicit instruction not to silently decide a product policy, this is reported — not fixed — as requiring an explicit decision before `/speckit.converge`; see the corrective-pass report and `research.md` addendum item 18. Depends on: none.
- [x] T063 F-R6 decision: deferred, not fixed in this pass, per the review's own explicit "do not prioritize this over security corrections" instruction — the duplicated `canCreateEvent` effect (`events/page.tsx`, `portal/page.tsx`) remains LOW-severity maintainability debt, documented in `research.md` addendum item 19. Depends on: none.
- [x] T064 Full live security regression (18-item list): unauthenticated denial, no-org no-access, ordinary member assigned/unassigned event, org-admin metadata-yes/workspace-no, org-admin-with-event_members workspace-yes, selected-org mismatch denial (F1), cross-tenant denial, inactive-product direct-route denial (F2), ordinary-member event-creation denial (F3), customer organization-creation denial (F4), ordinary-member Members-management denial (F-R2), ordinary-member self-role-escalation denial (F-R2), Feature-001 integration-surface customer denial (F-R5), Feature-001 authorized behavior preserved, platform-admin preserved, multi-org role isolation preserved, existing Bendie routes preserved — all re-confirmed live against the corrected code. Depends on: T052–T060.
- [x] T065 Run lint, type-check, and production build after all corrective changes; fix only failures caused by this pass's changes. Depends on: T052–T063.
- [x] T066 Update `context/progress-tracker.md` and `context/schema-reference.md` and `specs/003-organization-event-access-foundation/research.md` with the review findings, the corrections made, the final Members/`event_members`/Bendie-Planner authorization boundaries, and the F-R3/F-R4/F-R6 status. Depends on: T052–T063.
- [x] T067 Clean up all temporary test data created during this corrective pass (test users/organizations/events across all scripts in T053, T057, T060, T064); re-confirm baseline live counts unchanged. Depends on: T064.
- [x] T068 **Bug found live during T053/T060's own UI verification, fixed same pass (not in the original review findings)**: `EventContext.loadEvents()` (`src/contexts/EventContext.tsx`) unconditionally overwrote `currentEventId`/`currentEvent` with "the first accessible event" once its own `getAccessibleEvents()` call resolved — racing against, and (deterministically, since it always resolves later) beating, `EventLayout`'s own synchronous `setCurrentEvent(eventId)` call for the event actually named in the URL. Live-observed effect: navigating directly to a workspace-denied event's URL instead silently displayed a *different*, legitimately-accessible event's full dashboard, with the URL bar still showing the denied event's id. Fixed with a ref (`explicitEventIdRef`) that `handleSetCurrentEvent` sets synchronously; `loadEvents()` now checks it (both before and after its own async fetch) and skips its auto-select entirely once a specific event has been explicitly requested — regardless of which async call resolves first. Re-verified live: the denied event now correctly shows the workspace-forbidden state instead of a substituted event's content. This is exactly the class of defect the corrective pass's re-audit (T061) was designed to catch, found through live testing rather than static review. Depends on: none (isolated to `EventContext.tsx`).

---

## Phase 12: Second Corrective Pass (second independent review, R2-F1–R2-F4)

**Purpose**: A second independent `/code-review` found the first corrective pass incomplete in three ways: F-R3 was documented but never actually implemented; the T068 stale-response fix covered only one specific race, not the general class; and F-R5's Bendie Planner fix was UI-only, with the underlying `event_members` Planner-sync columns still readable by any event member via a direct client query. All four findings (R2-F1–R2-F4) are corrected below, live-verified, including one additional live-discovered defect in the fix itself (R2-F4's first attempt).

- [x] T069 **R2-F1** — create and apply `supabase/migrations/event_members_creator_fallback_removed_and_planner_metadata_locked.sql`: drop and recreate `events_insert_creator` removing the `organizations.created_by = auth.uid()` fallback entirely, leaving `created_by = auth.uid() AND is_organization_admin(organization_id)` as the sole condition. Verified live beforehand that exactly one other permissive policy (`Global admins can manage all events`, `portal_is_global_admin()`) also affects `events` INSERT, and is untouched by this change. Depends on: none (new migration; `event_and_organization_creation_admin_restriction.sql` from the first corrective pass is not edited).
- [x] T070 **R2-F1 live verification**: former organization creator (fully removed from `organization_members`) → INSERT denied; current org owner/admin → INSERT allowed; ordinary current member → denied; unrelated authenticated user → denied; platform admin (no organization membership at all) → allowed; manipulated/nonexistent `organization_id` → denied. All 6 scenarios run against real temporary users/organization, cleaned up after. Depends on: T069.
- [x] T071 **R2-F4 consumer discovery** (performed before choosing a design, not assumed): grepped the full repository for `planner_sync_status`/`planner_sync_error` and every `event_members` query. Found exactly 3 consumers: `bendie-planner/page.tsx` (platform-admin-gated page, reads all 4 Planner columns for display), `planner-sync-member/route.ts` (Feature 001, **writes** these columns via the calling admin's own authenticated session — not service-role), and `src/types/database.ts` (type declarations only). No other page/component/RPC reads or depends on these columns; `members/page.tsx` and all other `event_members` selects already only request non-Planner columns. Depends on: none.
- [x] T072 **R2-F4 database design and fix — first attempt found insufficient by live testing**: initial migration used `REVOKE SELECT (planner_assignment_id, planner_synced_at, planner_sync_status, planner_sync_error) ON event_members FROM authenticated, anon` plus a new `SECURITY DEFINER` RPC, `get_event_planner_sync_status(p_event_id)`, that re-verifies `portal_is_global_admin()` before returning these columns. **Live-tested immediately per this task's own instruction not to assume the REVOKE worked — and it did not**: an ordinary member's direct `SELECT planner_sync_status` still succeeded. Root cause found by inspecting `pg_class.relacl` directly: `authenticated`/`anon` each still held the table-level SELECT bit, and in PostgreSQL a table-level SELECT grant subsumes any column-level REVOKE — the column REVOKE was a no-op in practice. Depends on: none (new migration).
- [x] T073 **R2-F4 corrected fix**: `supabase/migrations/event_members_planner_metadata_column_grant_fix.sql` — `REVOKE SELECT ON event_members FROM authenticated, anon` (the whole table-level grant, the only mechanism that actually enforces column restriction), then `GRANT SELECT (event_id, user_id, organization_id, role, onboarding_status, onboarding_completed_at, invited_by, created_at)` back to both roles — i.e. every column except the 4 Planner ones. `service_role` untouched throughout (separate grant, RLS-bypassing). Re-verified live immediately: direct `SELECT planner_sync_status` now correctly denied (`42501 permission denied`); `SELECT role, onboarding_status` still succeeds; `get_event_planner_sync_status` still denies non-admins and still returns full data to platform admins; a platform admin's own authenticated-session `UPDATE` of `planner_sync_status` (matching `planner-sync-member/route.ts`'s real write pattern) still succeeds, confirming the SELECT-only revoke does not affect the legitimate Feature 001 write path. Depends on: T071, T072.
- [x] T074 Update `src/app/portal/events/[eventId]/bendie-planner/page.tsx`'s `fetchMembers()` to call `get_event_planner_sync_status` via `.rpc()` instead of a direct `.from('event_members').select(...)` for the Planner columns, mapping the flat RPC rows into the existing `MemberStatus`/nested-`profiles` shape the render code already expects (no render-code changes needed beyond the mapping). Depends on: T073.
- [x] T075 **R2-F2 + R2-F3 — EventContext async state redesign** (not another narrow patch): mapped every async writer of `currentEvent`/`events`/`canAccessWorkspace`/`workspaceAccessChecked` in `src/contexts/EventContext.tsx` (`loadEvents`'s auto-select fetch, `handleSetCurrentEvent`'s explicit-selection fetch, `checkWorkspaceAccess`, `refreshEvent`) before changing anything. Replaced the single-purpose `explicitEventIdRef` (T068, permanently latched once set) with two coordinated mechanisms: (1) `latestEventIdRef`, always holding the eventId that is currently authoritative — every async writer above compares its own target eventId against it immediately before any `setState` call and silently discards itself on mismatch, so an older, slower response can never overwrite state committed by a newer one, and `currentEvent`/`canAccessWorkspace` can never desynchronize from independently-stale responses; (2) `hasExplicitEventRef`, scoped to the *navigation lifecycle* rather than permanent — set by `handleSetCurrentEvent` (called only by a mounted `EventLayout`), and cleared by a new `clearCurrentEvent()` context method that `EventLayout` calls on unmount, so leaving the event route, later organization switches, and later unrelated event loads all correctly regain normal auto-select behavior. An organization change while no event-scoped route is mounted now also explicitly clears `currentEvent`/`currentEventId` rather than leaving the previous organization's event displayed. Depends on: T068 (supersedes it).
- [x] T076 `src/app/portal/events/[eventId]/layout.tsx`: destructure `clearCurrentEvent` from `useEvent()` and call it in a new unmount-only `useEffect` cleanup, per T075's lifecycle design. Depends on: T075.
- [x] T077 **R2-F2/R2-F3 live regression** (live browser verification, distinguished from the code-level stale-response guarantee which is verified by inspection, not by forcing an adversarial out-of-order network response): authorized event → unauthorized event shows forbidden, no leaked prior content; unauthorized → authorized (again) shows real content, no stale denial; rapid authorized→unauthorized and unauthorized→authorized sequences settle on the correct final state; leaving the event route for the organization overview does not get stuck on a forbidden/loading state; after actually switching the persisted organization selection (matching what the real org-switcher UI writes) and navigating to the new organization's own event, that event's real content loads correctly — confirming the corrected lifecycle does not leave stale explicit-intent state blocking a legitimate post-switch event. One scenario (a bare cross-organization deep link with no accompanying organization switch) was initially misread as a failure; live investigation confirmed it is the F1 selected-organization-mismatch protection working correctly, not a defect. Depends on: T075, T076.
- [x] T078 Re-verify the event-member role-escalation guard (T054/T055 from the first corrective pass) is unweakened after touching `event_members` migrations again: ordinary member self→admin and self→host still denied; event host/admin can still manage another member's role; service-role write to `role` still works. Re-confirm the `current_setting('role', true) = 'service_role'` exemption itself: it is a session-scoped Postgres GUC set by PostgREST from the connecting role, not a value an ordinary `authenticated`-role request can set for itself — no escalation path found; left unchanged. Depends on: T073 (same migration file set touching `event_members`).
- [x] T079 Full live security regression re-run (23-item list from the second review, encompassing R2-F1–R2-F4 plus the original Feature 003 matrix): Portal unauthenticated/no-org states, ordinary member assigned/unassigned event, org-admin metadata/workspace split, F1 selected-org mismatch, cross-tenant denial, F2 inactive-product direct-route denial, F3/R2-F1 event-creation authorization (ordinary member/former creator denied, current admin/platform admin allowed), F4 organization-creation denial, Members-page denial and role-escalation denial, legitimate member management preserved, Bendie Planner page and Planner-metadata direct-read denial (R2-F4), Feature 001 authorized behavior and unauthorized-API denial preserved, platform admin preserved, multi-org isolation preserved, EventContext navigation-race scenarios (T077), existing Bendie routes preserved. Depends on: T069–T078.
- [x] T080 Run lint, type-check, and production build after all second-corrective-pass changes; fix only failures caused by this pass's changes. Depends on: T069–T078.
- [x] T081 Update `context/progress-tracker.md`, `context/schema-reference.md`, and `research.md` (supersede items 18/19 where F-R3 is now resolved) documenting: F-R3 now RESOLVED (not deferred); the final `events_insert_creator` policy; the `event_members` column-privilege boundary and `get_event_planner_sync_status()`; the EventContext stale-response and explicit-intent-lifecycle design; live verification evidence; remaining debt (F-R6 only). Depends on: T069–T079.
- [x] T082 Clean up all temporary test data created during this second corrective pass (test users/organizations/events across T070, T073, T077, T079); re-confirm baseline live counts unchanged (7 organizations, 16 events) and confirm no temporary debug functions (e.g. the probe function used to diagnose T072's REVOKE failure) remain live. Depends on: T079.

---

## Phase 13: Third Corrective Pass (third independent review, R3-F1–R3-F6)

**Purpose**: A third independent review found six remaining issues — four database/reproducibility
findings (R3-F1, R3-F2, R3-F3, R3-F5) and two `EventContext` concurrency/consistency findings
(R3-F4, R3-F6) — and required this pass to independently establish whether the repository can
reproducibly build its database from committed migration history. On investigation, R3-F2, R3-F3,
R3-F5's database fixes and R3-F4/R3-F6's `EventContext` redesign were found **already implemented**
by an earlier, uncommitted session of this same corrective pass (the database fixes were already
live). This pass's job was therefore to verify each is actually correct and complete rather than
assume it, close the one real gap found (R3-F1, plus one further missing helper function and one
`loading`-state staleness bug found during the required audits), and bring all of it under
documentation and `tasks.md` for the first time.

- [x] T083 Determine the repository's actual migration-ordering mechanism (evidence-based, not
  assumed alphabetical): confirmed no `supabase/config.toml`, no installed Supabase CLI, and no
  script/CI anywhere globs `supabase/migrations/`; the only apply mechanism is the Supabase MCP
  `apply_migration` tool, which stamps its own UTC timestamp as the live `version` independent of
  local filename. `list_migrations` against the live Portal project is the ground truth for real
  apply order. Documented in `specs/003-organization-event-access-foundation/research.md` addendum
  item 24. Depends on: none.
- [x] T084 Full migration dependency audit across all 26 committed migration files (not limited to
  the six named findings): every `CREATE TABLE`/`CREATE FUNCTION` cross-checked against every
  reference, and all 26 local files cross-checked against the live project's full 62-entry
  `list_migrations` history. Found: 36 live migrations (pre-dating Feature 001) with zero committed
  source; ~44 further live functions with zero committed source; migrations `003`–`009` present
  locally but with no entry at all in the live `supabase_migrations.schema_migrations` history
  table; one further ordering mismatch (`organization_admin_event_metadata_visibility.sql` vs.
  `organization_and_event_product_foundation.sql`) confirmed functionally inconsequential (the two
  touch independent policy/table domains). Documented in `context/schema-reference.md`'s new
  "Fresh-bootstrap reproducibility" section. Depends on: T083.
- [x] T085 R3-F1: create `supabase/migrations/MIGRATION_ORDER.md`, the fresh-bootstrap manifest
  documenting the exact required apply order (derived from `list_migrations`, not filename sort).
  Empirically reproduced the crash (disposable local Postgres 15 container: naive alphabetical
  replay of `add_planner_sync_status_check.sql` before `bendie_planner_integration.sql` fails with
  `column "planner_sync_status" does not exist`) and empirically confirmed the documented order
  succeeds. Neither original migration file renamed or edited. Depends on: T083, T084.
- [x] T086 R3-F2: verify `000_authorization_helper_functions_baseline.sql` (found already applied
  live, version `20260915130254`) byte-for-byte against live `pg_get_functiondef()` output for all
  7 functions — exact match. Found one further gap via T084's audit: `public.set_updated_at()`,
  used by Feature 002's `organization_and_event_product_foundation.sql`, had no committed source.
  Created and applied `supabase/migrations/shared_trigger_helper_functions_baseline.sql` (verified
  byte-identical to live; idempotent no-op against the current database). Depends on: T084.
- [x] T087 R3-F3: verify `zz_event_members_role_guard_final_authoritative.sql` (found already
  applied live, version `20260915130515`) byte-for-byte against the live
  `enforce_event_member_role_immutability()` definition and the live `event_members_role_
  immutability` trigger's target — exact match, service-role exemption intact. Empirically
  confirmed (disposable Postgres container) that replaying all five role-guard files in pure
  alphabetical order still ends with the correct body (self-healing by filename, unlike R3-F1).
  Depends on: T083.
- [x] T088 R3-F5: verify `get_event_planner_sync_status_execute_lockdown.sql` (found already
  applied live, version `20260915130736`) via direct `pg_proc.proacl` inspection — confirmed
  `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`, no `PUBLIC`/`anon`
  entry. Depends on: none.
- [x] T089 R3-F4: async-writer audit of every writer of `currentEvent`/`currentEventId`/`events`/
  `canAccessWorkspace`/`workspaceAccessChecked`/`loading` in `src/contexts/EventContext.tsx`
  (found already redesigned, uncommitted, to two independent generation counters —
  `eventGenerationRef`, `workspaceGenerationRef`). Found one real bug the redesign itself had not
  caught: three early-return branches in the org-switch effect's `loadEvents()` forced
  `setLoading(false)` unconditionally on a stale/superseded response, which could prematurely clear
  `loading` while a newer, still-in-flight generation's own fetch should own that state. Fixed by
  removing the forced clears from the two genuinely stale branches. Depends on: none (isolated to
  `EventContext.tsx`).
- [x] T090 R3-F4 required ABA test: added
  `specs/003-organization-event-access-foundation/verify-event-context-aba.mjs`, a standalone
  deterministic script (deferred promises, not browser timing; not wired into any test
  runner — none exists in this repository) mirroring the real generation/discard-before-commit
  logic. Both required scenarios pass: (1) X₁→Y→X₂, X₂ resolves first, X₁ resolves last → X₁
  discarded; (2) Org A/X₁→Org B→Org A/X₂, stale Org A/X₁ resolves last → old X₁ discarded. Depends
  on: T089.
- [x] T091 R3-F6: verified already implemented (`loadEvents()`'s `setEvents(fullEvents)` runs for
  the current generation regardless of `hasExplicitEventRef`; only auto-*selection* is suppressed
  by that ref; organization switch clears `events` to `[]` immediately while the new fetch is in
  flight). Verified by code inspection of the exact control flow, consistent with the second
  corrective pass's own T077 precedent for this class of guarantee (not re-forced with a live
  adversarial-timing browser test this pass). Depends on: T089.
- [x] T092 Clean migration replay: no `supabase/config.toml`/CLI installed in this environment: full
  from-scratch replay of the entire schema is **NOT POSSIBLE** here regardless of T085's fix, both
  for that environmental reason and because of T084's 36-migration gap (pre-existing, unrelated to
  Feature 003). A **targeted, empirical replay was performed** instead, against a disposable local
  Postgres 15 container (removed after use, no persistent infrastructure added to the repository):
  (a) reproduced the R3-F1 crash under naive alphabetical order and confirmed success under
  `MIGRATION_ORDER.md`'s documented order; (b) confirmed the R3-F3 role-guard chain is self-healing
  under naive alphabetical replay. Reported as **STATICALLY VERIFIED for the full schema, LIVE
  (locally) VERIFIED for the specific R3-F1/R3-F3 ordering mechanisms** — not a false "LIVE
  VERIFIED" claim for the whole schema. Depends on: T085, T087.
- [x] T093 Fresh-vs-live security comparison: for every object the task asked to compare
  (`is_organization_admin`, `is_event_host_or_organizer`, the `event_members` role-guard
  function/trigger, `events`/`organizations` INSERT policies, `event_members` SELECT/UPDATE
  policies, `get_event_planner_sync_status`, relevant grants), the "fresh" side is the
  byte-identical `pg_get_functiondef()`/`proacl`/policy-text captured directly from the live
  database in T086–T088 and used verbatim as the new migrations' bodies — by construction, not by
  independent re-derivation, these match live exactly. No separate full fresh database exists to
  diff against per T092's environmental limit. Depends on: T086, T087, T088, T092.
- [x] T094 Regression re-confirmation (read-only, live): `events_insert_creator`/
  `organizations_insert_creator` policy text, `event_members` Planner-column SELECT grants (still
  excluding the 4 Planner columns for `authenticated`/`anon`), and all `events`/`organizations` RLS
  policy text re-queried live and confirmed to match the second corrective pass's documented final
  state exactly — no regression from this pass's changes. Full live user-simulated re-verification
  of the broader 18-item Feature 003 matrix, Feature 001, and Feature 002 behavior was not re-run
  from scratch this pass (nothing in T085–T091 touches any policy, trigger, or component those
  suites exercise beyond what T094 itself re-confirmed) — relies on T001–T082's already-recorded
  live evidence for the surfaces this pass did not touch. Depends on: T083–T091.
- [x] T095 Quality gates: `npm run type-check` (clean), `npm run lint` (clean — only pre-existing
  warnings, none in any file this pass touched), `npm run build` (production build succeeds, all
  routes compile). Depends on: T085–T091.
- [x] T096 Documentation: updated `tasks.md` (this section), `research.md` (addendum items 24–27),
  `context/progress-tracker.md` ("Third corrective pass" entry), and `context/schema-reference.md`
  (new Changelog entry + "Fresh-bootstrap reproducibility" section). Depends on: T083–T094.
- [x] T097 Cleanup: no temporary test data was created this pass (all database verification was
  read-only live queries against existing state); the one disposable local Postgres container used
  for T085/T087/T092's empirical replay tests was removed (`docker rm -f`) after use, leaving no
  persistent test infrastructure in the repository or environment. Depends on: T092.

**Checkpoint**: All six third-review findings resolved or verified-already-resolved with evidence;
one additional helper-function gap (T086) and one `loading`-state staleness bug (T089) found and
fixed via the mandated audits, beyond the six named findings; full dependency audit performed and
its result (repository-wide migration/bootstrap debt predating Feature 003) documented, not
silently fixed or silently ignored.

---

## Phase 14: F-NEW-1 Correction (final narrow verification's one new MEDIUM finding)

**Purpose**: The final narrow verification (post-third-review) found the third corrective pass's
Planner-metadata hardening (R2-F4/R3-F5) closed the SELECT/EXECUTE exposure but never applied the
same fix to UPDATE (or INSERT): `authenticated`/`anon` still held table-level UPDATE/INSERT on
`event_members` covering all columns, including the four Planner-managed ones. Combined with
`event_members_update_self_or_host`'s self-row `WITH CHECK`, an ordinary event member could
directly forge their own row's Planner sync state via a raw PostgREST call.

- [x] T098 Root-cause confirmation (live, not assumed): queried
  `information_schema.column_privileges` and `pg_attribute.attacl` directly — confirmed
  `authenticated`/`anon` held table-level UPDATE and INSERT covering
  `planner_sync_status`/`planner_sync_error`/`planner_synced_at`/`planner_assignment_id`, while
  SELECT on those same columns was already correctly restricted (R2-F4). Read every repository
  consumer of these four columns (3 total, matching T071's earlier consumer discovery: `bendie-
  planner/page.tsx` via RPC, `planner-sync-member/route.ts`'s two `UPDATE` calls, `types/database.ts`
  types-only) — no other writer exists. Depends on: none.
- [x] T099 Created and applied `supabase/migrations/event_members_planner_metadata_update_
  privilege_fix.sql`: revoke table-level INSERT/UPDATE from `authenticated`/`anon`, re-grant both
  only on the existing customer-safe column set (matching R2-F4's SELECT precedent exactly). INSERT
  was included, not just UPDATE: `event_members_insert_self_or_host`'s `WITH CHECK` permits an
  ordinary member to self-insert their own row, and the identical table-level-grant-subsumes-
  column-control root cause would otherwise let the same forgery happen at row-creation time instead
  of via UPDATE — verified every legitimate app-code INSERT already omits all four columns (all are
  nullable with no default), so this closes an equivalent gap with zero behavior change. **A second,
  distinct privilege-semantics pitfall was found live while verifying this migration itself**:
  `GRANT INSERT, UPDATE (column_list) ON t TO role` — multiple privilege keywords sharing one
  trailing column list — applies that column list only to the LAST-listed privilege; INSERT was
  silently left at the unrestricted table level. Caught via direct `pg_class.relacl` inspection
  immediately after the first apply (not assumed correct), corrected to two separate single-privilege
  `GRANT` statements, and re-applied; both live migration versions remain in history per this
  repository's immutability rule (documented in the migration file's own header, same pattern as the
  role-guard chain). Depends on: T098.
- [x] T100 Modified `src/app/api/admin/planner-sync-member/route.ts`: the two `event_members`
  UPDATE calls (`markResult`, the final success update) now use a Portal service-role client
  (`SUPABASE_SERVICE_ROLE_KEY`) instead of the caller's own authenticated session — the identical,
  already-established pattern used by its sibling route, `/api/admin/planner-pull-travel`, for the
  same class of "system-managed field, ordinary client privileges must not reach it" problem. No RPC
  was introduced (the route already verifies `portal_is_global_admin()` via the authenticated client
  before any privileged action; switching only these two writes to service-role changes no
  authorization behavior and reuses rather than duplicates an existing mechanism). Depends on: T099.
- [x] T101 Live verification (real Postgres privilege engine, transaction rolled back, no residual
  state): as `authenticated` — direct `UPDATE` of each of the four Planner columns → **DENIED**
  (`permission denied for table event_members`) for all four; direct `INSERT` setting
  `planner_sync_status` → **DENIED**; `UPDATE` of a safe column (`onboarding_status`) → privilege
  check **PASSED**. As `service_role` — `UPDATE` of `planner_sync_status` → privilege check
  **PASSED** (the legitimate Feature 001 write path's new mechanism). Depends on: T099, T100.
- [x] T102 Immediately-related regression re-confirmation (live, narrow — not a full re-audit):
  `event_members_role_immutability` trigger still enabled and its function body still contains the
  `service_role` exemption (role-escalation guard unweakened); Planner SELECT restriction
  (`authenticated`/`anon` excluded from the four columns) still intact. Depends on: T101.
- [x] T103 Quality gates: `npm run type-check` (clean), `npm run lint` (clean — pre-existing
  warnings only, none in `planner-sync-member/route.ts`), `npm run build` (production build
  succeeds). Depends on: T100.
- [x] T104 Documentation: `research.md` (addendum item 28), `context/progress-tracker.md` (F-NEW-1
  entry), `context/schema-reference.md` (Changelog entry), this `tasks.md` section. F-NEW-1 recorded
  as RESOLVED, not carried forward as debt. Depends on: T098–T103.

**Checkpoint**: F-NEW-1 resolved at the database privilege layer (not RLS, not a new RPC), the
legitimate Feature 001 write path preserved via an established pattern, and both the original gap
and a second gap found while fixing it (the multi-privilege `GRANT` column-list scoping pitfall) are
closed and empirically verified against the real Postgres privilege engine.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Phase 1. **BLOCKS all user stories** — this is the security-foundation gate described in the critical-ordering note above; it is not merely conventional Spec Kit structure here, it is a genuine safety requirement.
- **US1 (Phase 3)**: Depends on Phase 2 checkpoint (middleware may not widen admission before the workspace guard exists).
- **US2 (Phase 4)**: Depends on Phase 2 checkpoint and US1 (needs widened admission to test as a real customer).
- **US3 (Phase 5)**: Depends on US1 + US2 (needs a real admitted customer and a real event to attack).
- **US4 (Phase 6)**: Depends on Phase 2 + US2's `getAccessibleEvents()` change.
- **US5 (Phase 7)**: Depends on US4 (reuses its event-list scoping) and US1 (org switching).
- **US6 (Phase 8)**: Independent of US1–US5's auth work for T031 (pure config); T032 depends on Phase 2's `eventAuth.ts` and T008.
- **US7 (Phase 9)**: Depends on Phases 3–8 being complete (verifies nothing broke for platform admins across the whole feature).
- **Polish (Phase 10)**: Depends on all prior phases.

### Parallel Opportunities

- T003, T010, T011 within Phase 2 (after their respective sequential prerequisites).
- T047, T048 within Phase 2's Finding C/D closure (different files); T049, T050 similarly parallel (independent verification targets), all after T046.
- T016, T017 within Phase 3.
- T023, T024, T025 within Phase 5 (independent attack vectors).
- T028 within Phase 6.
- T030 within Phase 7.
- T034, T035 within Phase 8 (independent of T033).
- T037 within Phase 9.
- T038–T041, T043, T044 within Phase 10 (independent regression/doc tracks) — **not** T042/T045, which should run after the others as final gates.
- **Never parallel**: any two tasks touching `middleware.ts` (only T012 touches it), any two touching `EventContext.tsx` (T007 then T019, sequential), the RLS migration (T004) and anything verifying it (T005 to T011, sequential), `eventAuth.ts` (T006) and anything consuming it (T007, T032, T034, T035 — all sequential after T006), and `eventSectionMeta.ts`'s type change (T031) before its consumer (T032).

---

## Implementation Strategy

This feature is not suited to a "ship US1 alone" MVP the way a typical additive feature is — Phase 2's checkpoint is the real safety gate, and US1 (Portal admission) is only safe to deploy once it has passed. The practical increments are:

1. Phase 1 + Phase 2 → security foundation live-verified (nothing user-visible changes yet; `/portal` is still admin-only).
2. Phase 3 (US1) → Portal admission widens. This is the first user-visible change, and it is safe specifically because Phase 2 already completed.
3. Phase 4 + Phase 5 (US2, US3) → customers can actually use events they're assigned to, with tenant isolation proven under attack.
4. Phase 6 + Phase 7 (US4, US5) → org-admin oversight and multi-org correctness.
5. Phase 8 (US6) → product-aware navigation (can technically start T031 earlier in parallel, since it's config-only, but T032 still waits on Phase 2).
6. Phase 9 + Phase 10 → platform-admin compatibility proof, full regression, docs, cleanup.

---

## Requirement Traceability

| Requirement | Task(s) |
|---|---|
| FR-001, FR-003 | T012, T017 |
| FR-002 | T013, T015 |
| FR-004, FR-006 | T014, T016 |
| FR-005 | T024 |
| FR-007 | T018, T022, T029 |
| FR-008 | T006, T009 |
| FR-009 | T004, T005, T026, T027 |
| FR-010 | T007, T008, T009, T027 |
| FR-011 | T018, T020, T021 |
| FR-012, FR-014 | T036, T037 |
| FR-013, FR-015 | T006, T007, T008, T009, T023 |
| FR-016, FR-017 | T041 |
| FR-018, FR-019 | T006, T034, T035 |
| FR-020, FR-021 | T034, T035, T045 |
| FR-022, FR-024, FR-025 | T031, T032, T033 |
| FR-023 | T031, T035 |
| FR-026, FR-027 | T006, T022, T023 |
| FR-028 | T004–T011 (RLS remains the backstop under the new application checks) |
| FR-029 | T004 |
| FR-030 | T004, T011, T039 |
| FR-031 | T033 |
| FR-032 | T038 |
| FR-033 | T039 |
| FR-034 | T003, T040 |
| FR-035 | T012, T018, T046–T050 (the creation-restriction fix is itself the "strictly required" adjustment FR-035 anticipates, documented here per its own text rather than silently expanding scope) |

| Success Criterion | Verified by |
|---|---|
| SC-001 | T015, T016 |
| SC-002 | T022, T023, T024 |
| SC-003 | T027, T028 |
| SC-004 | T034 |
| SC-005 | T033 |
| SC-006 | T036, T037 |
| SC-007 | T038 |
| SC-008 | T029, T030 |
| SC-009 | T031 (no Planner tab/screen exists), T035 |

| User Story | Tasks |
|---|---|
| US1 | T012–T017 |
| US2 | T018–T021 |
| US3 | T022–T025 |
| US4 | T026–T028 |
| US5 | T029–T030 |
| US6 | T031–T035 |
| US7 | T036–T037 |
