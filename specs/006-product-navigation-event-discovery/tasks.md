# Tasks: Product-Level Navigation & Product-Aware Event Discovery

**Input**: Design documents from `specs/006-product-navigation-event-discovery/` (spec.md, plan.md, research.md, data-model.md, contracts/, quickstart.md)

**Tests**: No automated test suite exists in this repository (Features 001–005 precedent); verification tasks below are code-trace/query-level (implementation phase) and manual-browser (final phase), per plan.md's Technical Context.

**Organization**: Per plan.md's actual architecture (URL-derived product context → data layer → routes → switcher → event entry/routing → org interaction → legacy/no-product → creation → shared surfaces → hardening → security → fixtures → gates → manual acceptance) — not a generic per-user-story template, matching this repository's established Feature 001–005 convention of phases mirroring the real implementation dependency order. Each task still carries a `[US#]` label wherever it implements or verifies a specific user story's acceptance criteria; foundational, security, and quality-gate tasks carry no story label, per the standard checklist convention.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[US#]**: Maps to spec.md's User Story 1–6
- File paths are exact and relative to the repository root

---

## Phase 1: Domain / Product Resolution Foundation

**Purpose**: Pure, DB-free domain functions every later phase depends on. No Supabase call, no React, no persistence.

- [x] T001 Add `ProductKey` re-export and new `AvailableProducts = { bendie: boolean; planner: boolean }` type to new file `src/lib/productNavigation.ts` (FR-005)
- [x] T002 Implement `resolveDefaultProduct(available: AvailableProducts): ProductKey | null` in `src/lib/productNavigation.ts`: bendie-only → `'bendie'`, planner-only → `'planner'`, both active → `'bendie'`, neither → `null` (FR-013, FR-014, FR-015, FR-016) (depends on T001)
- [x] T003 Implement `resolveProductFallback(current: ProductKey | null, available: AvailableProducts): ProductKey | null` in `src/lib/productNavigation.ts`, returning `current` unchanged when `available[current]` is `true`, else `resolveDefaultProduct(available)` (FR-018, FR-019) (depends on T002)
- [x] T004 Implement `parseProductFromPathname(pathname: string): ProductKey | null` in `src/lib/productNavigation.ts`, matching `/portal/bendie` and `/portal/planner` path prefixes only, `null` otherwise (FR-002, FR-056) (depends on T001)
- [x] T005 Implement `parseEventOriginSignal(searchParams: URLSearchParams | null): ProductKey | undefined` in `src/lib/productNavigation.ts`, returning `'bendie'`/`'planner'` only for an exact `product` query-param match, `undefined` for missing, empty, or any other value (FR-034; edge case: invalid/unsupported origin signal) (depends on T001)
- [x] T006 Implement `resolveProductSwitchDestination(input: { location: 'product-home' | 'product-events' | 'shared' | 'event-workspace'; targetProduct: ProductKey; eventId?: string; eventProductMembership?: AvailableProducts }): string` in `src/lib/productNavigation.ts` per contracts/product-navigation-contracts.md contract 4 (FR-052, FR-053) (depends on T001)

**Checkpoint**: Pure resolvers exist and are unit-traceable before any data or UI layer consumes them.

---

## Phase 2: Organization Product Data

**Purpose**: Expose real `organization_products.is_active` truth for a selected organization.

- [x] T007 Add `getAvailableProducts(organizationId: string, client: SupabaseClient = supabase): Promise<AvailableProducts>` to `src/lib/eventAuth.ts`, querying `organization_products.select('product_key, is_active').eq('organization_id', organizationId).eq('is_active', true)` and reducing to `{ bendie, planner }` booleans (FR-005, FR-006, FR-008)
- [x] T008 Create `useAvailableProducts(organizationId: string | null, orgLoading: boolean)` hook in new file `src/lib/useAvailableProducts.ts`, wrapping T007, exposing `{ available, loading, error }`, with a generation-ref guard so a stale organization's result can never overwrite a newer organization's state (FR-017, FR-049) (depends on T007)
- [x] T009 Add a one-line code comment in `getAvailableProducts` (`src/lib/eventAuth.ts`) documenting that `organization_products` alone is authoritative and `event_planner_links` must never be consulted here, matching this codebase's established "why" comment convention (FR-006) (depends on T007)

**Checkpoint**: Real, RLS-governed entitlement truth is available to any consumer, with staleness protection.

---

## Phase 3: Product-Aware Event Retrieval

**Purpose**: Make the one existing shared event-fetch hook product-aware at the query layer. Security/regression-sensitive.

- [x] T010 Add `EVENTS_SELECT_COLUMNS_WITH_PRODUCT_FILTER` template-literal `as const` export to `src/lib/eventColumns.ts`: `` `${EVENTS_SELECT_COLUMNS}, event_products!inner(product_key)` as const `` (FR-029)
- [x] T011 Modify `useOrgEvents(organizationId, orgLoading, product?: ProductKey | null)` in `src/lib/useOrgEvents.ts`: add the optional third parameter; when provided, query `.select(EVENTS_SELECT_COLUMNS_WITH_PRODUCT_FILTER).eq('organization_id', organizationId).eq('event_products.product_key', product)` instead of the current unfiltered select, stripping the embedded `event_products` field from each row before `setEvents` so the returned shape stays `EventRow[]` (FR-022, FR-023, FR-024, FR-026) (depends on T010)
- [x] T012 Add a generation-ref guard inside `useOrgEvents.ts`'s fetch effect (matching `EventContext.tsx`'s established pattern) so a stale in-flight fetch for a superseded `(organizationId, product)` pair can never overwrite current state (FR-049, FR-050) (depends on T011)
- [x] T013 [P] Confirm, by reading the modified `useOrgEvents.ts`, that `organization_id` scoping still applies unconditionally regardless of whether `product` is passed, preserving Feature 003 organization isolation (FR-024 regression guard) (depends on T012)
- [x] T014 [P] Add a one-line code comment in `useOrgEvents.ts` documenting why `event_products` (never `event_planner_links`) is the filter source (FR-025) (depends on T012)
- [x] T015 [P] Run a live verification query (documented, not committed as app code) confirming a Bendie-only event is included when `product='bendie'` and excluded when `product='planner'` (FR-022; quickstart B1/B2) (depends on T011)
- [x] T016 [P] Run the same verification for a Planner-only event (FR-023; quickstart B3/B4) (depends on T011)
- [x] T017 [P] Run the same verification for a Both-product event, confirming inclusion in both product queries (quickstart B5) (depends on T011)
- [x] T018 [P] Run the same verification for an organization with an active product but zero matching events, confirming an empty, non-erroring result (FR-057; quickstart B7) (depends on T011)

**Checkpoint**: Product-aware, query-layer-filtered event retrieval works and is race-safe, with zero duplicate fetch implementation.

---

## Phase 4: Product Routes / Product Homes

**Purpose**: The four product-scoped pages, reusing existing Overview/Events UI.

- [x] T019 [US2] Extract `src/app/portal/page.tsx`'s existing Overview logic into a `product`-parameterized `OrganizationHome({ product }: { product: ProductKey })` component in new file `src/components/portal/OrganizationHome.tsx`, feeding `product` into `useOrgEvents(organizationId, orgLoading, product)` (FR-032, FR-033, FR-056)
- [x] T020 [P] [US2] Create `src/app/portal/bendie/page.tsx` rendering `<OrganizationHome product="bendie" />` (FR-022, FR-030) (depends on T019)
- [x] T021 [P] [US2] Create `src/app/portal/planner/page.tsx` rendering `<OrganizationHome product="planner" />` (FR-023, FR-031) (depends on T019)
- [x] T022 [US2] Extract `src/app/portal/events/page.tsx`'s existing list logic into a `product`-parameterized `OrganizationEventsList({ product }: { product: ProductKey })` component in new file `src/components/portal/OrganizationEventsList.tsx`, feeding `product` into `useOrgEvents` the same way (FR-022, FR-023, FR-056)
- [x] T023 [P] [US2] Create `src/app/portal/bendie/events/page.tsx` rendering `<OrganizationEventsList product="bendie" />` (FR-022) (depends on T022)
- [x] T024 [P] [US2] Create `src/app/portal/planner/events/page.tsx` rendering `<OrganizationEventsList product="planner" />` (FR-023) (depends on T022)
- [x] T025 [US2] In `OrganizationHome`, confirm every event-derived figure (active/upcoming counts, next event, "Needs Attention," recent activity, shared-speaker stats) is computed from the product-filtered `events` array returned by `useOrgEvents`, not a second unfiltered fetch (FR-027; SC-002) (depends on T019)
- [x] T026 [US2] In `OrganizationHome`, confirm organization-global, non-event metrics (`peopleTotal`, `elevatedCount`) remain unfiltered/global (FR-046) (depends on T019)
- [x] T027 [P] [US2] Confirm `EventsOverviewPanel`'s existing empty-state copy ("No events in this view yet.") reads correctly for a product-scoped, zero-event, active-entitlement context; adjust copy only if it reads as ambiguous about which product is empty (FR-057) (depends on T022)

**Checkpoint**: All four product-scoped pages render product-correct data using entirely reused components.

---

## Phase 5: Product Context + Switcher

**Purpose**: URL-derived product identity, exposed and made switchable in the existing header.

- [x] T028 [P] Create `src/contexts/ProductContext.tsx`: a `ProductProvider` exposing `{ product: ProductKey | null }`, computed each render via `parseProductFromPathname(usePathname())` — no internal state, no setter (FR-002) (depends on T004)
- [x] T029 Mount `ProductProvider` in `src/app/portal/layout.tsx` alongside the existing `OrganizationProvider`/`EventProvider` (FR-001) (depends on T028)
- [x] T030 In `src/components/portal/TopHeader.tsx`, load `availableProducts` via `useAvailableProducts(organizationId, orgLoading)` and the current product via a new `useProduct()` hook from `ProductContext` (FR-005) (depends on T008, T029)
- [x] T031 [US1] Add a product-switcher dropdown to `TopHeader.tsx`, reusing the existing organization-switcher dropdown markup/pattern, rendering only entries present in `availableProducts`, with the current product checkmarked, and rendering nothing when neither product is active (FR-007, FR-009, FR-010, FR-011) (depends on T030)
- [x] T032 [US1] Wire each switcher option's click handler to call `resolveProductSwitchDestination` (T006) with the `location` derived from the current pathname (`product-home` / `product-events` / `shared` / `event-workspace`) and `router.push` to the result (FR-051, FR-052, FR-053) (depends on T031, T006)
- [x] T033 [US1] **[Corrected 2026-09-17, /speckit.analyze finding H1 — `EventLayout`'s local `productAvailability` state is not reachable from `TopHeader` via `useEvent()`; that data path does not exist and the original wording is retracted.]** For the `event-workspace` case in T032, at click-time call `isProductAvailableForEvent(currentEventId, organizationId, targetProduct)` (`src/lib/eventAuth.ts`) directly — `currentEventId` from `useEvent()`, `organizationId` from `useOrganization()`, both already consumed by `TopHeader.tsx` — and pass the resulting boolean as `resolveProductSwitchDestination`'s `eventProductMembership[targetProduct]` input. Introduces no new query implementation (reuses the same helper `EventLayout` already calls per-product in its own effect) and no `EventContext` expansion (FR-052, FR-053) (depends on T032)
- [x] T034 [P] [US1] Confirm `TopHeader.tsx`'s new switcher logic never substitutes `isGlobalAdmin` for the real `availableProducts` result (FR-012, FR-059) (depends on T033)
- [x] T035 [P] [US1] Confirm no other existing `TopHeader.tsx` element (search, notifications, org switcher, Create button, avatar menu) changed visually or behaviorally as a side effect of T030–T033 (Constitution V — no header redesign) (depends on T033)

**Checkpoint**: A real, entitlement-truthful, visually-consistent product switcher exists and is wired to the resolver.

---

## Phase 6: Event Entry + Product Origin

**Purpose**: Product-aware surfaces link into events carrying an explicit, validated origin signal.

- [x] T036 [US3][US5] Add an optional `product?: ProductKey` prop to `EventsOverviewPanel` (`src/components/portal/EventsOverviewPanel.tsx`); when present, each row's entry link targets `/portal/events/${event.id}/${product === 'planner' ? 'planner-overview' : 'dashboard'}?product=${product}` instead of the current hardcoded `.../dashboard` (FR-034, FR-035, FR-036)
- [x] T037 Confirm that when `product` is omitted (existing/legacy call sites), the link continues to target plain `.../dashboard` with no query string, preserving exact current behavior (FR-040, FR-041) (depends on T036)
- [x] T038 [P] [US3] **[Corrected 2026-09-17, /speckit.analyze finding M1 — merged with the former T039, which described the identical edit.]** Pass the existing `product` prop through to `EventsOverviewPanel` inside `OrganizationHome` and `OrganizationEventsList` (`<EventsOverviewPanel product={product} />`) — one edit in each of the two shared components covers both Bendie-mode and Planner-mode rendering, since each already receives a literal `product` value from its own outer page file (T020/T021/T023/T024) (FR-035, FR-036) (depends on T036, T019, T022)

> T039 retired 2026-09-17 (/speckit.analyze finding M1): it described the same single edit as T038, not a second call site — no separate task remains. Nothing else in this file depended on T039.
- [x] T040 [P] [US5] Confirm `TopHeader.tsx`'s existing event-search `goToEvent` action (hardcoded to `.../dashboard`) is left untouched — it is not a product-discovery surface and needs no origin signal (FR-003)

**Checkpoint**: Every product-aware event link carries a correct, validated origin signal; every legacy link is untouched.

---

## Phase 7: Event Workspace Routing

**Purpose**: Generalize Feature 005's one-directional Planner-only landing effect into the full Both-event and mismatched-origin contract.

- [x] T041 In `src/app/portal/events/[eventId]/layout.tsx`, read the `?product=` query parameter via `useSearchParams()` and parse it with `parseEventOriginSignal` (T005) (FR-034) (depends on T005)
- [x] T042 [US3] Extend the Both-event landing logic: when the entry tab is `dashboard` and the parsed origin signal is `'planner'`, redirect to `planner-overview`; when the signal is `'bendie'` or absent, no redirect (Feature 005 default preserved) (FR-035, FR-036, FR-037) (depends on T041)
- [x] T043 [US4] Generalize the existing `productAvailability`-driven redirect effect (currently one-directional: unavailable `dashboard` + available `planner` → `planner-overview`) into a bidirectional rule: whenever `activeSection.product` is `'bendie'` or `'planner'` and unavailable for this event while the OTHER classified product IS available, redirect to that other product's entry tab (FR-038) (depends on T042)
- [x] T044 [US4] Confirm the T043 redirect is placed strictly after the existing `workspaceAuthPending`/`workspaceAuthDenied` early-return gates, never before (FR-039, FR-058) (depends on T043)
- [x] T045 [P] [US4] Confirm the T043 redirect cannot loop: the destination tab is, by construction, available, so the condition cannot re-match after redirecting (FR-038 loop-safety) (depends on T043)
- [x] T046 Update the existing code comment above the redirect effect in `layout.tsx` to describe the generalized bidirectional behavior and its origin-signal interaction (Constitution VII) (depends on T043)

**Checkpoint**: Both-event landing and mismatched-origin redirects behave per contracts 7 and 8, strictly after authorization.

---

## Phase 8: Deliberate In-Event Product Switching

**Purpose**: Confirm the switcher's event-workspace path (Phase 5) is distinct from and independent of the mismatched-origin safety net (Phase 7), per the clarification session.

- [x] T047 [P] [US4] Confirm (code trace across T006, T032, T033) that the deliberate-switch path computes its destination directly via `resolveProductSwitchDestination` and navigates in one step, never depending on or triggering the Phase 7 redirect effect (FR-052, FR-053)
- [x] T048 [P] [US4] Verify the Both-event deliberate-switch case: `resolveProductSwitchDestination({ location: 'event-workspace', targetProduct: 'planner', eventProductMembership: { bendie: true, planner: true }, eventId })` returns the same event's `planner-overview` path (FR-052; quickstart C6)
- [x] T049 [P] [US4] Verify the single-product-event deliberate-switch case: `resolveProductSwitchDestination({ location: 'event-workspace', targetProduct: 'planner', eventProductMembership: { bendie: true, planner: false }, eventId })` returns `/portal/planner/events` (FR-053; quickstart C7)

**Checkpoint**: Deliberate switching and mismatched-origin redirects are provably distinct mechanisms, as required.

---

## Phase 9: Organization Switching

**Purpose**: Product availability and event-workspace presence both react correctly to an organization change.

- [x] T050 Create `useProductGuard(desiredProduct: ProductKey)` hook in new file `src/lib/useProductGuard.ts`: on `organizationId`/`orgLoading` change, call `getAvailableProducts`; if `desiredProduct` is unavailable, `router.replace()` to `resolveProductFallback`'s result (same path shape) or `/portal/no-product` if `null`; guarded by its own generation ref (FR-017, FR-018, FR-019, FR-020, FR-049) (depends on T003, T007)
- [x] T051 [US1][US6] Call `useProductGuard('bendie')` from `src/app/portal/bendie/page.tsx` and `bendie/events/page.tsx`; `useProductGuard('planner')` from the two Planner equivalents (FR-017–FR-020) (depends on T050, T020, T021, T023, T024)
- [x] T052 [US6] In `src/app/portal/events/[eventId]/layout.tsx`, add a `prevOrgIdRef`-based effect: when `organizationId` changes to a new non-null value while the layout is mounted, synchronously set a local `orgSwitchRedirecting` state to `true` in the same tick (**hardening added 2026-09-17, /speckit.analyze finding L1** — before this flag existed, the existing `workspaceAuthDenied` render could paint "You don't have access to this event" for one frame while the redirect below was still in flight, misleadingly implying an authorization failure rather than a deliberate organization switch), then compute `getAvailableProducts(newOrgId)` → `resolveDefaultProduct` and `router.replace()` to that product's home route, guarded by its own generation ref. While `orgSwitchRedirecting` is `true`, render the component's existing `workspaceAuthPending` loading-skeleton branch instead of evaluating `workspaceAuthDenied` — reusing the already-established loading treatment, not a new one (FR-054) (depends on T007, T002, T046)
- [x] T053 [P] [US6] Confirm T052's redirect does not suppress or replace `EventContext.tsx`'s existing `checkWorkspaceAccess` re-verification — both must run; confirm separately that the `orgSwitchRedirecting` flag only changes what is *rendered* during the transition (suppressing the misleading denial screen) and never skips or short-circuits the underlying re-check itself, and that no old-event data is rendered as current while the flag is `true` (FR-054; Constitution IV) (depends on T052)
- [x] T054 [P] [US6] Trace every `router.replace()` target introduced in T050/T052 against `resolveDefaultProduct`'s exhaustive four-branch output to confirm no redirect loop is reachable (FR-020) (depends on T050, T052)

**Checkpoint**: Organization switching preserves or deterministically falls back the product context everywhere, including from inside an event.

---

## Phase 10: Legacy Routes + No-Product

**Purpose**: `/portal` and `/portal/events` become resolving redirects; a real no-product state exists.

- [x] T055 [P] [US5] Replace `src/app/portal/page.tsx`'s implementation (now moved to `OrganizationHome`, Phase 4) with a thin redirect: resolve `availableProducts` via `useAvailableProducts`, compute `resolveDefaultProduct`, `router.replace()` to `/portal/bendie`, `/portal/planner`, or `/portal/no-product`, rendering `portal/loading.tsx`'s existing skeleton while resolving (FR-055) (depends on T008, T002, T019)
- [x] T056 [P] [US5] Replace `src/app/portal/events/page.tsx`'s implementation the same way, redirecting to `/portal/bendie/events`, `/portal/planner/events`, or `/portal/no-product` (FR-055) (depends on T008, T002, T022)
- [x] T057 [P] Create `src/app/portal/no-product/page.tsx`, structurally parallel to the existing `src/app/portal/no-access/page.tsx`: a centered message explaining the organization has no active Bendie or Bendie Planner entitlement, no switcher, no event-discovery content (FR-011, FR-016, FR-047)
- [x] T058 [P] Confirm `OrgSideNav`'s existing shared-page links remain visible and functional from `/portal/no-product` — no `OrgSideNav` change required (FR-048) (depends on T057)
- [x] T059 [P] Confirm an active-product-but-zero-events organization never reaches `/portal/no-product` — that route is reached only via `resolveDefaultProduct` returning `null` (FR-057) (depends on T055, T056)

**Checkpoint**: No unfiltered legacy view remains reachable; the no-product state is safe and distinct from an empty product.

---

## Phase 11: Event Creation Integration

**Purpose**: Product context supplies only a UI default for event creation; Feature 004 stays authoritative.

- [x] T060 [US2] Add an optional `initialProduct?: ProductKey` prop to `CreateEventModal` (`src/components/portal/CreateEventModal.tsx`); when both `bendieActive` and `plannerActive` resolve `true` and `initialProduct` is set, default `productChoice` to it — the user remains free to change it (FR-042, FR-044)
- [x] T061 [P] [US2] **[Corrected 2026-09-17, /speckit.analyze finding M2 — merged with the former T062, which described the identical edit.]** Pass the existing `product` prop through to `CreateEventModal` as `initialProduct` inside `OrganizationHome` and `OrganizationEventsList` (`<CreateEventModal initialProduct={product} .../>`) — one edit in each shared component covers both the Bendie and Planner default, since each already receives a literal `product` value from its own outer page file (FR-042) (depends on T060, T019, T022)

> T062 retired 2026-09-17 (/speckit.analyze finding M2): it described the same single edit as T061, not a second call site — no separate task remains. Nothing else in this file depended on T062.
- [x] T063 [P] Confirm `CreateEventModal`'s existing single-product-active auto-selection branch is unchanged — `initialProduct` only affects the both-active branch (FR-042, FR-044) (depends on T060)
- [x] T064 [P] Confirm `POST /api/events/create` and `create_event_with_products` (Feature 004) receive no new parameter and are not modified by this feature (FR-037, FR-043)

**Checkpoint**: Creation defaults follow product context without altering Feature 004's authoritative validation.

---

## Phase 12: Shared Organization Surfaces

**Purpose**: People/Assets/Teams/Activity Log/Settings stay exactly where they are.

- [x] T065 [P] Confirm `OrgSideNav.tsx`'s `NAV_ITEMS` are not modified to add product-namespaced variants — People/Assets/Teams/Activity Log/Settings links remain `/portal/people`, `/portal/assets`, `/portal/teams`, `/portal/activity-log`, `/portal/settings` (FR-051, FR-045)
- [x] T066 Update `OrgSideNav.tsx`'s "Overview" and "Events" nav items' `isActive` highlighting so they still highlight correctly now that `/portal` and `/portal/events` are redirects and the resolved product route is what's actually active (FR-055, FR-056) (depends on T055, T056)
- [x] T067 [P] Confirm no new file exists under any product-namespaced shared-page path (e.g. `/portal/bendie/people`) (FR-051)

**Checkpoint**: Zero shared-page duplication; nav highlighting stays correct through the new redirects.

---

## Phase 13: Race / Loading Hardening

**Purpose**: Confirm every generation-ref guard actually closes the races the spec requires closed.

- [x] T068 [P] Trace the rapid Bendie→Planner→Bendie switch scenario against T012's and T008's generation guards, confirming the final render reflects only the last-selected product (quickstart G1) (depends on T012, T008)
- [x] T069 [P] Trace a rapid Org A→Org B switch against T012, T008, and T050's generation guards (FR-049, FR-050; quickstart G2) (depends on T012, T008, T050)
- [x] T070 [P] Trace an organization switch immediately followed by a manual product switch, and the reverse order, confirming no intermediate stale state is committed (FR-043) (depends on T050, T032)
- [x] T071 [P] Confirm browser back/forward across two different product routes re-renders each route's own `usePathname()`-derived product value correctly (FR-002; quickstart G3) (depends on T028)
- [x] T072 [P] Confirm a full page refresh on any product route, and on an event workspace reached with `?product=`, re-derives all state identically to first load (FR-034) (depends on T041)

**Checkpoint**: No stale-state or race scenario in the spec's edge cases can be reproduced.

---

## Phase 14: Security / Regression

**Purpose**: Prove Features 001–005 are untouched and no known-defect pattern was reintroduced.

- [x] T073 [P] Confirm zero changes to any `app/api/admin/planner-*` route, `plannerStaffSync.ts`, or `plannerAdmin.ts` (Feature 001 regression)
- [x] T074 [P] Grep this feature's diff for any `INSERT`/`UPDATE`/`DELETE` against `organization_products` or `event_products` — expect zero (Feature 002 regression; FR-005, FR-022–FR-029)
- [x] T075 [P] Confirm `requireEventWorkspaceAccess`'s signature and behavior in `src/lib/eventAuth.ts` are unchanged (only `getAvailableProducts` is added alongside it) (Feature 003 regression; FR-058)
- [x] T076 [P] Confirm `src/app/api/events/create/route.ts`, `src/lib/plannerEventProvisioning.ts`, and `create_event_with_products` are unmodified (Feature 004 regression; FR-037, FR-043)
- [x] T077 [P] Confirm `src/lib/plannerOverview.ts`, `src/app/api/events/[eventId]/planner-overview/route.ts`, and the Planner Overview page are unmodified, and the no-signal Both-event fallback is preserved exactly (Feature 005 regression; FR-030, FR-031, FR-037)
- [x] T078 [P] Grep this feature's diff for `event_planner_links` and confirm every match is either absent or inside pre-existing, unmodified code (FR-006, FR-025)
- [x] T079 [P] Grep this feature's diff for `organization_planner_links` and confirm zero new reads via the caller's RLS-governed client (FR-025 regression guard — the admin-only-RLS trap must not be reintroduced)
- [x] T080 [P] Grep this feature's diff for `.select('*')` against `events` and confirm zero matches (FR-029)
- [x] T081 [P] Confirm no new `app/api/**` route was added anywhere in this feature's diff (plan.md's "no new HTTP API" constraint)
- [x] T082 [P] Confirm no new `supabase/migrations/*.sql` file was added (plan.md's "no migration" constraint)
- [x] T083 Re-trace quickstart §E (Authorization) at the code level: authorized event member, org member without `event_members`, cross-tenant user, and platform admin with no active Planner entitlement manually visiting `/portal/planner` (FR-039, FR-058, FR-059) (depends on T043, T044, T034)

**Checkpoint**: Zero regressions against Features 001–005; zero reintroduction of any previously-fixed defect class.

---

## Phase 15: Controlled Test Fixtures

**Purpose**: Add the one new fixture the spec requires, without touching the preserved Feature 005 fixture — only after implementation is verification-ready.

- [x] T084 Confirm the existing fixture (organization "Bendie Planner Sample," "Stawi Escape" [Bendie-only], "Stawi Escape — Planner Test" [Planner-only]) is untouched by every task above
- [x] T085 Create ONE controlled Both-product event inside "Bendie Planner Sample" (e.g. "Stawi Escape — Both Test") via the existing Feature 004 creation flow with `products: ['bendie', 'planner']` — perform only once Phases 1–14 are implemented (supports quickstart C6, D3, D4) (depends on T084, Phases 1–14 complete)
- [x] T086 Confirm via live query that the new Both event appears in both `/portal/bendie/events` and `/portal/planner/events` result sets (depends on T085)
- [x] T087 Document the new Both fixture's identifiers in `context/schema-reference.md`'s changelog, following the existing dated-entry convention, without altering any prior fixture entry (depends on T085)

**Checkpoint**: A real, verified Both-product fixture exists for manual acceptance, and the Feature 005 fixture is intact.

---

## Phase 16: Quality Gates

- [x] T088 [P] Run `npm run lint` and resolve any warning/error introduced by this feature's files
- [x] T089 [P] Run the repository's TypeScript type-check command and resolve any error introduced by this feature's files, including the T010 template-literal type inference
- [x] T090 Run `npm run build` and confirm it succeeds (depends on T088, T089)
- [x] T091 Re-run the Phase 3 verification queries (T015–T018) once more against the completed implementation to confirm no regression (depends on T090)

**Checkpoint**: Lint, types, and build are clean; query-layer filtering still behaves correctly end-to-end.

---

## Phase 17: Manual Browser Acceptance

**Purpose**: Real, human-in-the-browser confirmation. None of these may be marked complete from static code inspection alone.

- [ ] T092 [US1] Verify the product switcher visibly distinguishes Bendie and Bendie Planner and reflects "Bendie Planner Sample"'s real entitlement (quickstart H)
- [ ] T093 [US2] Verify `/portal/bendie` and `/portal/bendie/events` show "Stawi Escape" and the Both fixture, and do NOT show "Stawi Escape — Planner Test" (quickstart H2)
- [ ] T094 [US2] Verify `/portal/planner` and `/portal/planner/events` show "Stawi Escape — Planner Test" and the Both fixture, and do NOT show "Stawi Escape" (quickstart H3)
- [ ] T095 [US2] Verify displayed counts on both product homes match their visible filtered event lists (quickstart H4; SC-002)
- [ ] T096 [US6] Verify empty-product and no-product states each render correctly against a suitable test organization (quickstart B7, A4)
- [ ] T097 [US3] Verify opening the Both fixture from the Bendie context lands on its Bendie dashboard, and from the Planner context lands on its Planner Overview (quickstart D3, D4)
- [ ] T098 [US4] Verify, inside the Both fixture's Bendie dashboard, using the switcher to go to Planner stays in the same event and lands on its Planner Overview — and the reverse (quickstart C6)
- [ ] T099 [US4] Verify, inside "Stawi Escape" (Bendie-only), using the switcher to go to Planner leaves the event and lands on `/portal/planner/events` — and the symmetric case from "Stawi Escape — Planner Test" to Bendie (quickstart C7)
- [ ] T100 [US6] Verify switching organization while inside an event workspace exits that event and lands on the new organization's resolved product home (quickstart C8)
- [ ] T101 [US5] Verify a full page refresh on an event reached via `?product=` preserves correct landing (quickstart D refresh check)
- [ ] T102 [US5] Verify browser back/forward between two different product contexts renders each correctly (quickstart G3)
- [ ] T103 [US5] Verify legacy `/portal` and `/portal/events` redirect correctly for "Bendie Planner Sample" (both active → Bendie) (quickstart G4, G5)
- [ ] T104 Verify all pre-existing Bendie event-workspace functionality on "Stawi Escape" is visually and functionally unchanged (Constitution I regression check)

**Checkpoint**: Every acceptance scenario has real browser evidence, not inference from code review.

**Manual-acceptance finding, 2026-09-17 (corrected)**: during browser testing of T092/T104, the header breadcrumb showed generic placeholder labels ("Choose product", "Event") instead of the actual resolved product/event context. Root cause: `TopHeader.tsx`'s product-breadcrumb label read `ProductContext.product` directly, which is (by design) `null` on event-workspace routes since the URL there isn't under a product namespace; and the event-name breadcrumb used `getPortalPageLabel()`'s generic `'Event'` fallback instead of the already-fetched `currentEvent.name`. Fixed in `TopHeader.tsx` only: added a display-only `breadcrumbProduct` derivation (falls back to the active event tab's own `EVENT_SECTIONS` product classification when `ProductContext.product` is `null`) and a `pageLabel` override that uses `currentEvent?.name` on event routes — no second product state, no second event fetch, `ProductContext`/`EventContext` authority unchanged. `typecheck`/`lint`/`build` re-run clean after the fix. None of T092–T104 have been marked complete by this fix — they remain the user's own manual verification.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1** (Domain Foundation): No dependencies — start immediately.
- **Phase 2** (Org Product Data): Independent of Phase 1's UI-facing parsers; depends on nothing else.
- **Phase 3** (Event Retrieval): Independent of Phases 1–2's exports except where noted; can start immediately, but its consumers (Phase 4) need it done first.
- **Phase 4** (Product Routes): Depends on Phase 3 (T011) for filtered `useOrgEvents`.
- **Phase 5** (Switcher): Depends on Phase 1 (T004, T006), Phase 2 (T008).
- **Phase 6** (Event Entry): Depends on Phase 4 (T019, T022).
- **Phase 7** (Workspace Routing): Depends on Phase 1 (T005).
- **Phase 8** (Deliberate Switch verification): Depends on Phase 5 (T032, T033) and Phase 1 (T006).
- **Phase 9** (Org Switching): Depends on Phase 1 (T002, T003), Phase 2 (T007), Phase 4, Phase 7.
- **Phase 10** (Legacy/No-Product): Depends on Phase 1 (T002), Phase 2 (T008), Phase 4.
- **Phase 11** (Creation): Depends on Phase 4.
- **Phase 12** (Shared Surfaces): Depends on Phase 10.
- **Phase 13** (Race Hardening): Depends on Phases 2, 3, 5, 7, 9.
- **Phase 14** (Security/Regression): Depends on Phases 1–13 being implemented (it verifies them).
- **Phase 15** (Fixtures): Depends on Phases 1–14 complete.
- **Phase 16** (Quality Gates): Depends on all implementation phases (1–13) complete.
- **Phase 17** (Manual Acceptance): Depends on Phase 15 (fixture) and Phase 16 (gates passed).

### Parallel Opportunities

- Phases 1, 2, and 3's T010 can all start immediately in parallel (different files, no shared dependency).
- Within Phase 4: T020/T021 in parallel once T019 lands; T023/T024 in parallel once T022 lands.
- Within Phase 6: T038 and T040 in parallel once T036 lands (T039 retired 2026-09-17 — merged into T038, see M1 correction).
- Most of Phases 13 and 14 are pure verification/grep tasks with no file writes and no interdependency — nearly all are `[P]`.
- Phase 17's tasks are manual and performed sequentially by a human in one browser session — none are marked `[P]`.

---

## Implementation Strategy

### Foundation-first (this feature has no independent-MVP slice — the product axis is meaningless until the switcher, retrieval, and at least one product route all exist together)

1. Complete Phases 1–3 (pure resolvers, entitlement data, product-aware retrieval).
2. Complete Phase 4 (the four product routes render correctly) — **first point at which the feature is visibly real**.
3. Complete Phase 5 (switcher) — users can now move between products.
4. Complete Phases 6–8 (event entry, workspace routing, deliberate switching) — event-level correctness.
5. Complete Phases 9–12 (organization interaction, legacy routes, creation, shared surfaces).
6. Complete Phase 13 (race hardening) and Phase 14 (security/regression) before touching real data.
7. Complete Phase 15 (add the Both fixture) only once everything above is implemented.
8. Complete Phase 16 (quality gates), then Phase 17 (manual browser acceptance) last.

---

## Traceability

### Functional Requirements → Tasks

| FR range | Covered by |
|---|---|
| FR-001–FR-004 (product context/URL authority) | T004, T028, T029, T040 |
| FR-005–FR-012 (switcher/entitlement) | T001, T007, T008, T009, T030, T031, T034 |
| FR-013–FR-021 (default/org-switch resolution) | T002, T003, T050, T051 |
| FR-022–FR-029 (discovery/retrieval) | T010–T018, T025 |
| FR-030–FR-033 (Bendie/Planner experience isolation) | T020, T021, T073, T077 |
| FR-034–FR-041 (entry, Both-landing, legacy compatibility) | T005, T036–T042 |
| FR-042–FR-044 (creation defaults) | T060–T064 |
| FR-045–FR-050 (shared surfaces, no-product, races) | T026, T057–T059, T068–T072 |
| FR-051 (shared pages neutral) | T065, T067 |
| FR-052–FR-053 (in-event deliberate switch) | T006, T032, T033, T047–T049 |
| FR-054 (org switch from event) | T052, T053 |
| FR-055–FR-056 (legacy redirects, root vs. events) | T004, T019, T022, T055, T056, T066 |
| FR-057 (empty vs. no-product) | T018, T027, T059, T096 |
| FR-058 (authorization precedence) | T044, T075, T083 |
| FR-059 (platform admin real truth) | T034, T083 |

### Success Criteria → Verification Tasks

| SC | Covered by |
|---|---|
| SC-001 | T031, T092 |
| SC-002 | T025, T095 |
| SC-003 | T042, T097 |
| SC-004 | T037, T101, T103 |
| SC-005 | T043, T045 |
| SC-006 | T083 |
| SC-007 | T012, T050, T054, T068–T070 |
| SC-008 | T034, T092 |

### User Stories → Tasks

| Story | Implementation | Manual acceptance |
|---|---|---|
| US1 — Product switcher | T030–T035 | T092 |
| US2 — Product-aware discovery | T019–T027, T036/T038, T060–T061 | T093, T094, T095 |
| US3 — Correct event-entry landing | T036, T041, T042 | T097 |
| US4 — Mismatch redirect / deliberate switch | T043–T049 | T098, T099 |
| US5 — Legacy compatibility | T036/T037/T040, T055/T056 | T101, T102, T103 |
| US6 — Organization-switch fallback | T003, T050–T054 | T096, T100 |

### Acceptance Scenarios & Edge Cases

All 27 acceptance scenarios and 17 edge cases from spec.md are represented via the quickstart.md sections (A–H) cited throughout the tasks above; quickstart.md's own matrix is the authoritative scenario-to-check mapping, cross-referenced by every relevant task's parenthetical citation (e.g. "quickstart B1/B2", "quickstart C6"). No scenario or edge case in spec.md lacks a corresponding quickstart row and at least one citing task.

---

## Notes

- No task introduces a migration, a new HTTP API, database persistence of product selection, a shared-page duplicate, a second event-retrieval implementation, `event_planner_links`-as-membership, or `events.select('*')` — confirmed explicitly by Phase 14.
- The Both-product test fixture (Phase 15) is deliberately sequenced after all implementation phases, per the user's explicit instruction not to create it during task generation or early implementation.
- Phase 17 tasks must reflect real, executed manual verification — never marked complete from code inspection alone, per this repository's established evidence standard (Features 004/005).

## Correction Log

**2026-09-17** — Artifact corrections applied following the `/speckit.analyze` pass (findings H1, M1, M2, L1). No application code, migration, or fixture was touched; this is a planning-artifact-only correction pass.

- **H1 (HIGH)**: T033 (and research.md Q9) incorrectly directed the product switcher to read `EventLayout`-local `productAvailability` state via `useEvent()` — that data path does not exist. Corrected T033 to call the existing `isProductAvailableForEvent()` helper directly at click-time instead. No behavior, routing outcome, or requirement coverage changed — only the internal data-sourcing mechanism.
- **M1 (MEDIUM)**: T038 and T039 described the same single edit twice. Merged into T038; T039 retired (see the note left in its place). FR-035/FR-036 coverage unchanged.
- **M2 (MEDIUM)**: T061 and T062 described the same single edit twice. Merged into T061; T062 retired (see the note left in its place). FR-042 coverage unchanged.
- **L1 (LOW)**: T052 hardened with an `orgSwitchRedirecting` flag so an organization switch from inside an event workspace shows the existing loading skeleton instead of momentarily flashing "You don't have access to this event." T053 extended to verify the flag never suppresses the underlying re-authorization check itself. FR-054 coverage unchanged.
- Task count: 104 → 102 (T039, T062 retired, no IDs reused). `[P]` markers: 54 → 52.

**2026-09-17 (later)** — Post-implementation `/code-review` corrective pass, findings F1–F5. Application code corrected; no migration, no new API, no application-code change to Features 001–005.

- **F1 (HIGH)**: `getAvailableProducts()` (`src/lib/eventAuth.ts`) collapsed a Supabase read error into the same `{bendie:false, planner:false}` shape as a genuine zero-entitlement organization, violating FR-050. Now throws on error; `useAvailableProducts` catches it into an explicit `{status:'error'}` state, distinct from `{status:'ready', available:{bendie:false, planner:false}}`.
- **F3 (HIGH) + F4 (LOW)**, corrected together per the review's own instruction not to layer independent patches: introduced `AvailableProductsProvider`/`useProductEntitlement()` (`src/contexts/AvailableProductsContext.tsx`) as the ONE coordinated `organization_products` load per organization context, mounted in `portal/layout.tsx`. `TopHeader` and `useProductGuard` both now consume this shared state instead of independently fetching it (removes the F4 duplicate read). The four product pages (`/portal/bendie`, `/portal/bendie/events`, `/portal/planner`, `/portal/planner/events`) gained an explicit render gate (`PortalLoadingSkeleton`/`PortalEntitlementError`, new `src/components/portal/PortalLoadingSkeleton.tsx`) so product content never renders while entitlement is `'loading'` or `'error'` (closes F3), and `useProductGuard` never redirects except from the `'ready'` state (never on `'error'`, satisfying F1's "do not redirect to /portal/no-product on a failed read"). The legacy `/portal` and `/portal/events` redirects were updated to the same shared context for consistency (same bug class, same fix).
- **F2 (MEDIUM)**: `TopHeader`'s event-name breadcrumb now mirrors `EventLayout`'s own `canAccessWorkspace`/`workspaceAccessChecked` gating exactly (both already returned by the existing `useEvent()` call — no second fetch) — the real event name only renders once workspace access is independently confirmed granted; pending shows "Loading…", denied shows the generic "Event" label.
- **F5 (MEDIUM)**: `TopHeader`'s breadcrumb product now falls back to the event's `?product=` origin signal (read via `useSearchParams()`, not any new stored state) when the active tab is `product:'shared'` (e.g. Members). `EventLayout` was extended to (a) normalize a signal-less legacy landing on a non-shared tab by backfilling `?product=` onto the current URL once, and (b) propagate whatever product is currently in effect onto every internal tab-bar link and the "Next" button — so a Both event's shared tab correctly shows whichever product the user actually arrived from or deliberately switched to, and a single-product event's shared tab always resolves to its one real product. Adding `useSearchParams()` to `TopHeader` (rendered on every portal page) required wrapping it in a `<Suspense>` boundary in `portal/layout.tsx` per Next.js's static-rendering requirement — confirmed via `next build`.
- **Known residual scope boundary (F5)**: a *direct, cold bookmark straight to a shared tab* (skipping any non-shared tab first) with no `?product=` in the URL at all has no prior tab or query signal to inherit from and will still show "Choose product." This is a narrower edge than any scenario in the review's required verification list (all of which involve arriving via a resolved product context first) and was left out of scope for this focused pass rather than fixed with a disproportionate new per-event query.
- New files: `src/contexts/AvailableProductsContext.tsx`, `src/components/portal/PortalLoadingSkeleton.tsx`. Modified: `src/lib/eventAuth.ts`, `src/lib/useAvailableProducts.ts`, `src/lib/useProductGuard.ts`, `src/app/portal/layout.tsx`, the four product pages, `src/app/portal/page.tsx`, `src/app/portal/events/page.tsx`, `src/components/portal/TopHeader.tsx`, `src/app/portal/events/[eventId]/layout.tsx`.
- `typecheck`/`lint`/`build` all re-run clean after these corrections.

**2026-09-17 (later still)** — Manual-recheck regression found and corrected: the F5 fix above used `EVENT_SECTIONS.product === 'shared'` as its criterion for "does this tab need to inherit the origin signal," but that field is Feature 003's **access-gating** classification ("which entitlement must be active for this tab to be reachable"), not a display/product-context signal — nearly every non-entry tab (Members, Basics, Activity Log, Files, ...) is classified `'bendie'` there for access-gating reasons unrelated to display, and is reachable from either product's session on a Both event. The bug: opening any such tab from a Planner-context session (e.g. Members from Planner Overview) silently forced the breadcrumb — and every subsequently-generated tab link — to "Bendie," discarding a correctly-preserved `?product=planner` origin signal.

- **Clarified distinction, recorded here rather than as a spec renumbering**: `EVENT_SECTIONS.product` = section access-gating classification (Feature 003, unchanged). `dashboard` / `planner-overview` = the only two product-**entry** sections (self-determine their product). `?product=` origin signal = the preserved product context for every other event tab. These are three separate concerns; the bug was conflating the first with the third.
- **Fix**: added one structural helper, `resolveEventTabProduct(sectionKey, originSignal)` (`src/lib/productNavigation.ts`), encoding exactly the entry-section rule above. Both `TopHeader.tsx` (breadcrumb) and `EventLayout.tsx` (`effectiveTabProduct`, used for tab-bar/Next-button link generation, and the origin-normalization backfill) now call this ONE function instead of each independently testing `EVENT_SECTIONS.product` — no growing manual exception list, no drift risk between the two call sites.
- `EVENT_SECTIONS` itself, its access-gating semantics, and the mismatch-redirect branch in `EventLayout` (which correctly still reads `activeSection.product` for its own, unrelated, authorization-driven purpose) are all unchanged.
- Files modified: `src/lib/productNavigation.ts`, `src/components/portal/TopHeader.tsx`, `src/app/portal/events/[eventId]/layout.tsx`. No file outside these three touched.
- `typecheck`/`lint`/`build` re-run clean.
