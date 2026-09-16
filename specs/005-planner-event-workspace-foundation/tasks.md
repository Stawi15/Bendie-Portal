# Tasks: Planner Event Workspace Foundation

**Input**: Design documents from `specs/005-planner-event-workspace-foundation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/get-planner-overview.md, quickstart.md — all complete, zero unresolved questions.

**Tests**: No automated test framework exists in this repository (unchanged convention from Features 001–004). All verification below is manual, live-database validation per `quickstart.md`, expressed as explicit tasks rather than automated test files.

**Migrations**: None. Confirmed during `/speckit.plan` and re-confirmed here — no task in this file creates a migration on either the Portal or Bendie Planner project.

**Organization**: Tasks are grouped by user story (from `spec.md`) after one shared Foundational phase. This feature is a single, tightly-coupled read-only vertical slice (one route, one page, one nav entry, one landing-redirect) — the Foundational phase therefore contains most of the implementation, and each user-story phase is primarily the explicit verification that phase's acceptance scenarios pass. Every task below states its exact prerequisite task IDs — not just a phase name — so the dependency graph is unambiguous.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Genuinely parallel-safe — either a distinct file with no shared runtime state, or a verification check whose fixtures/session/environment are isolated from every other concurrently-`[P]` task (see the Fixture Isolation table in Notes).
- **[Story]**: Which user story this task belongs to (US1–US5, per spec.md's priority order)

---

## Phase 1: Setup

- [x] T001 [P] Add the `event_summary_realtime` row shape to `src/types/plannerDatabase.ts` (hand-maintained, matching that file's existing convention): `event_title: string`, `description: string | null`, `location: string | null`, `setup_date: string | null`, `start_date: string | null`, `end_date: string | null`, `number_of_sessions: number`, `status: string`. Do **not** add `event_id` or `attendees` to this type — their absence is a deliberate guard against ever selecting them (data-model.md). No dependencies.

**Checkpoint**: Type reference in place; no behavior change yet.

---

## Phase 2: Foundational (blocking prerequisites for all user stories)

**⚠️ CRITICAL**: No user story's page/verification can be completed until this phase is done — it produces the API route, data access, section entry, and landing redirect every story depends on.

- [x] T002 In `src/lib/eventAuth.ts`, add an optional, defaulted parameter `client: SupabaseClient = supabase` (import the `SupabaseClient` type from `@supabase/supabase-js`; do **not** parameterize it as `SupabaseClient<Database>` — this codebase's `supabase` singleton in `src/lib/supabaseClient.ts` is itself constructed without the `<Database>` generic, and `src/lib/plannerAdmin.ts` documents this untyped-client convention as deliberate, so the new parameter must match that existing convention, not introduce a stricter one) to `requireEventWorkspaceAccess(eventId, userId, selectedOrganizationId, client: SupabaseClient = supabase)`, threading `client` into its internal `.from(...)` calls in place of the module-level `supabase` import. Every existing call site (which passes no fourth argument) must keep its exact current behavior (research.md Q4/Q6; plan.md's Constitution Check re-evaluation). No dependencies.
- [x] T003 In `src/lib/eventAuth.ts`, add the same optional, defaulted `client: SupabaseClient = supabase` parameter (identical type per T002 — plain `SupabaseClient`, not `SupabaseClient<Database>`) to `isProductActiveForOrg(organizationId, productKey, client: SupabaseClient = supabase)` and `isProductAvailableForEvent(eventId, organizationId, productKey, client: SupabaseClient = supabase)`, threading it through `isProductAvailableForEvent`'s internal call to `isProductActiveForOrg` as well as its own `.from(...)` call. Depends on T002 (same file, same pattern).
- [x] T004 [P] Create `src/lib/plannerOverview.ts` (`import 'server-only'` at the top, matching `src/lib/plannerAdmin.ts`'s guard) exporting `getPlannerOverviewSummary(plannerEventId: number)`, which calls `getPlannerAdminClient()` and runs exactly one query: `SELECT event_title, description, location, setup_date, start_date, end_date, number_of_sessions, status FROM event_summary_realtime WHERE event_id = :plannerEventId` — an explicit column list, never `select('*')` (FR-004, FR-015; data-model.md). No dependencies (independent new file).
- [x] T005 In `src/lib/plannerOverview.ts`, add a `resolvePlannerOverviewStatus(event, activeLink)` helper implementing data-model.md's precedence table exactly: `not_required` (anomaly) or no active link → `'unavailable'`; `pending`/`provisioning` not stale (reuse `isPlannerProvisioningStale()` from `src/lib/plannerProvisioningStaleness.ts` unchanged) → `'pending'`; same, stale → `'stale'`; `failed` → `'failed'`; `succeeded` with an active link → proceed to a Planner read. Depends on T004 (same file).
- [x] T006 Create `src/app/api/events/[eventId]/planner-overview/route.ts` (GET handler) implementing contracts/get-planner-overview.md end-to-end: build a cookie-bound `createServerClient` (matching `src/app/api/events/create/route.ts`'s exact pattern) → `auth.getUser()` (401 if none) → resolve the caller's selected organization (403 if none) → `requireEventWorkspaceAccess(eventId, userId, organizationId, authClient)` (T002; 404 if denied) → `isProductAvailableForEvent(eventId, organizationId, 'planner', authClient)` (T003; 403 `product_unavailable` if false) → read `events.planner_provisioning_status, planner_provisioning_last_attempted_at, created_at` and the active `event_planner_links` row (`SELECT planner_event_id, is_active FROM event_planner_links WHERE event_id = :eventId AND is_active = true`) → `resolvePlannerOverviewStatus` (T005) → when it indicates a Planner read is needed, call `getPlannerOverviewSummary` (T004) inside a try/catch, mapping any thrown error to `status: 'backend_error'` (log the real error via `console.error` server-side only) and mapping "no matching row" to `status: 'unavailable'` → return the exact `200 { ok: true, status, ... }` / error shapes from contracts/get-planner-overview.md, never a client-supplied Planner id, never a raw diagnostic (FR-006, FR-012, FR-013, FR-014, FR-016, FR-019). Depends on T002, T003, T004, T005.
- [x] T007 [P] In `src/lib/eventSectionMeta.ts`, add one new `EVENT_SECTIONS` entry: `{ key: 'planner-overview', label: 'Planner Overview', desc: 'Event identity and live session status from Bendie Planner', icon: 'insights', badgeBg: 'bg-orange-50', badgeFg: 'text-orange-600', product: 'planner' }`. No existing entry, the `EventSectionMeta` type, or `getSectionMeta` changes (FR-021). Confirm no other new entry, placeholder, or "coming soon" tab is added anywhere in this file (FR-026). No dependencies (independent existing file, additive entry only).
- [x] T008 In `src/app/portal/events/[eventId]/layout.tsx` (`EventLayout`), implement the default-landing redirect as a **`useEffect`** (not inline logic during render — a render-body `router.replace` call is a React anti-pattern and risks an update-during-render warning or repeated navigation attempts before the redirect completes), with dependency array `[activeSectionKey, productAvailability, productAvailabilityChecked, eventId, router]`. Inside the effect: if `productAvailabilityChecked` is `false`, return immediately without redirecting (guards against firing on unresolved/loading product state — the same guard already used by this file's existing `productAuthPending` branch). Otherwise, if `activeSectionKey === 'dashboard'` and `productAvailability['bendie'] !== true` and `productAvailability['planner'] === true`, call `router.replace(\`/portal/events/${eventId}/planner-overview\`)`; otherwise do nothing. Explicitly verify by construction (no additional runtime guard needed, but confirm during implementation): (a) **no redirect loop** — once the replace navigates to `planner-overview`, `activeSectionKey` becomes `'planner-overview'`, which never again satisfies `activeSectionKey === 'dashboard'`, so the effect cannot re-fire the same redirect; (b) **a directly-navigated valid Planner Overview URL is never redirected away** — the condition only ever matches `activeSectionKey === 'dashboard'`, never `'planner-overview'`; (c) **Bendie-only events are never redirected** — `productAvailability['bendie'] === true` for them, so the condition is never satisfied; (d) **Both events are never redirected away from the dashboard** — same reason as (c), since Bendie remains available. No other section key triggers this redirect (FR-022, FR-023, FR-024; research.md Q1/Q2/Q20). Depends on T007 (the target route must exist).

**Checkpoint**: Foundational phase complete. The API route, data-access module, provisioning/link precedence, section metadata, and landing redirect all exist and are independently exercisable (e.g. via a direct authenticated request to the new route) even before the page in Phase 3 exists.

---

## Phase 3: User Story 1 — Viewing the Planner Overview as an ordinary event member (Priority: P1) 🎯 MVP

**Goal**: An ordinary Portal event-workspace member (no Bendie Planner staff assignment required) sees a correct, safe Planner Overview.

**Independent Test**: As an ordinary event member of a Planner-active, successfully-linked event, open the Planner Overview and confirm it renders event identity and session summary without requiring platform-admin privilege or any Bendie Planner staff assignment.

- [x] T009 [US1] Create `src/app/portal/events/[eventId]/planner-overview/page.tsx` — a `'use client'` page that fetches `GET /api/events/${eventId}/planner-overview` on mount, reusing `SectionHeader` and `EventLayout`'s existing `animate-pulse` skeleton pattern while the request is in flight. Depends on T006 (the route it fetches).
- [x] T010 [US1] In the same page, implement the `status: 'ready'` branch: an event-identity block (title always shown; description, location, start date, end date, setup date each rendered only when present in the response, never as a blank/placeholder value) and a session-summary block (total session count, event phase) (FR-002, FR-003). Depends on T009 (same file).
- [ ] T011 [P] [US1] **Depends on T009, T010** (this loads the actual page and observes its `ready` rendering — not achievable against the API alone). Verify (quickstart.md §D): as an authorized ordinary event member holding **no** Bendie Planner `event_user_assignments` row for this event, load the Overview; confirm it succeeds with zero additional setup, and confirm via a direct read of Bendie Planner's `event_user_assignments` table (before/after) that no row was created (FR-009, FR-010, SC-001). Read-only against the pre-configured Planner-only/Both baseline event from quickstart.md's Prerequisites — no dedicated fixture needed (see Notes).
- [ ] T012 [P] [US1] **Depends on T009, T010.** Verify (quickstart.md §M): point a test event's active link at a real Planner event with zero `production_tasks` rows; confirm the response is `status: 'ready'` with `sessionSummary.totalSessions: 0`, and confirm the page renders this as a normal state, not a warning or error (FR-005). **Mutates event-level state** (repoints a link) — requires its own dedicated test event, isolated per the Fixture Isolation table in Notes.
- [x] T013 [P] [US1] **Depends on T009, T010.** Verify (quickstart.md §Q, content scope only): inspect a real `ready` response body and rendered page; confirm no participant record, attendee count, flight/accommodation/transfer record, staff/coordinator name or email, task/checklist/vendor content or count, blueprint content, notification content, or agenda content appears anywhere (FR-004, SC-003). Read-only — no dedicated fixture needed.

**Checkpoint**: User Story 1 independently functional — an authorized ordinary event member can view a correct, safe Overview.

---

## Phase 4: User Story 2 — Planner-only event lands in a real workspace, not a dead end (Priority: P1)

**Goal**: A Planner-only event has a real, deterministic landing experience instead of a blocked Bendie dashboard.

**Independent Test**: Open a Planner-only event's base URL with no section specified; confirm the result is the Planner Overview, never a blocked state.

- [ ] T014 [P] [US2] **Depends on T007, T008, T009** (the redirect target page must exist for "lands on Planner Overview" to be observable, in addition to the redirect logic itself). Verify (quickstart.md §B.1): open a Planner-only event (active `planner` product, no active `bendie` product) with no section specified; confirm `EventLayout`'s redirect (T008) lands the user on Planner Overview, never the Bendie dashboard's blocked "unavailable for this event" state. Read-only against the pre-configured Planner-only baseline event.
- [ ] T015 [P] [US2] **Depends on T007 only** (tab-bar membership is decided by the section entry alone; no page content or redirect logic is involved). Verify (quickstart.md §B.2): inspect the same event's tab bar; confirm no Bendie-classified tab is visible and no placeholder Bendie workspace appears. Read-only.
- [ ] T016 [P] [US2] **Depends on T006, T007, T008, T009** (both the direct-URL path, which needs the route/page, and the refresh-from-dashboard path referenced by quickstart §P, which needs the redirect). Verify (quickstart.md §B.3 and §P): reach the Planner Overview via a pasted/bookmarked direct URL and via a hard browser refresh; confirm both behave identically to in-app navigation, with authorization re-applied every time. Read-only.
- [ ] T017 [P] [US2] **Depends on T007, T008 only** (confirms the redirect does *not* fire for a Both event — no Planner Overview page content is involved). Verify (quickstart.md §C.4): confirm a Both event (active `bendie` and `planner`) opened with no section specified still lands on the Bendie dashboard, unchanged by T008's redirect (FR-024). Read-only.

**Checkpoint**: User Story 2 independently functional — Planner-only landing is fixed; Both events are unaffected.

---

## Phase 5: User Story 3 — Bendie-only events are completely unaffected (Priority: P2)

**Goal**: Zero observable change for Bendie-only events.

**Independent Test**: Open a pre-existing Bendie-only event and confirm identical navigation/landing to its pre-Feature-005 state; confirm the Planner Overview route is blocked.

- [ ] T018 [P] [US3] **Depends on T007, T008** (confirms neither the new section entry nor the new redirect disturbs a Bendie-only event, so both must exist to be meaningfully "confirmed absent in effect"). Verify (quickstart.md §A.1–A.2): open a Bendie-only event; confirm the tab bar, default landing (Bendie dashboard), and every existing route are pixel-for-pixel unchanged, and confirm no Planner Overview tab appears. Read-only.
- [ ] T019 [P] [US3] **Depends on T003, T006, T007** (the blocked-state render is `EventLayout`'s existing mechanism gated on the section's `product` classification, and the 403 is the new route's own check — neither needs T009, since the Planner Overview page itself is never reached or rendered when blocked). Verify (quickstart.md §A.3): visit the Planner Overview URL directly for the same event; confirm it is blocked by the existing product-availability mechanism (same "not available for this event" state as any other unavailable-product route) and that the API returns `403 { error: 'product_unavailable' }`. Read-only.

**Checkpoint**: User Story 3 independently verified — zero regression for Bendie-only events.

---

## Phase 6: User Story 4 — Both event: Bendie and Planner sections coexist without a mode switch (Priority: P2)

**Goal**: A Both event shows Bendie tabs and Planner Overview together, with no new switcher UI.

**Independent Test**: Open a Both event; confirm both tab groups render in one bar and moving between them requires nothing beyond clicking a tab.

- [ ] T020 [P] [US4] **Depends on T007 only** (tab-bar membership, no page content involved). Verify (quickstart.md §C.1–C.2): open a Both event; confirm existing Bendie tabs and the new Planner Overview tab render together in the same tab bar (cross-referencing T017 for the default-landing angle). Read-only.
- [ ] T021 [P] [US4] **Depends on T007, T009** (clicking into Planner Overview needs the page to exist and render, not just the tab to be listed). Verify (quickstart.md §C.3): move from a Bendie tab to Planner Overview and back; confirm no product-switcher control, mode toggle, or confirmation step is ever presented (FR-025). Read-only.

**Checkpoint**: User Story 4 independently verified — Both events combine correctly with no new UI surface.

---

## Phase 7: User Story 5 — Planner Overview handles an incomplete or inconsistent counterpart truthfully (Priority: P3)

**Goal**: Every non-ready state (setup pending, stale, failed, unavailable, backend failure) renders honestly, with no raw diagnostics and no misrepresentation of zero sessions as a failure.

**Independent Test**: For a Planner-active event whose provisioning state is, in turn, pending/provisioning, stale, failed, and with no active link, open the Overview each time and confirm the correct honest state renders.

- [x] T022 [US5] In `src/app/portal/events/[eventId]/planner-overview/page.tsx`, implement the `status: 'pending'` and `status: 'stale'` branches, reusing `PlannerProvisioningBanner`'s existing copy/severity conventions rather than new UI language (FR-017; research.md Q19). Depends on T009 (same file).
- [x] T023 [US5] In the same page, implement the `status: 'failed'` branch (reusing `PlannerProvisioningBanner`'s failure copy) and the `status: 'unavailable'` branch (a distinct "not yet set up" state, visually different from `failed`) (FR-017). Depends on T022 (same file).
- [x] T024 [US5] In the same page, implement the `status: 'backend_error'` branch — a generic "couldn't load right now" message with no diagnostic detail of any kind (FR-006, FR-019). Depends on T023 (same file).
- [ ] T025 [P] [US5] **Depends on T005, T006, T009, T022, T023** (this verifies *rendered* pending/stale/failed states, not just the API response — it needs both the precedence logic and the corresponding UI branches). Verify (quickstart.md §K): set a test event's `planner_provisioning_status` to `pending` (recent `last_attempted_at`), then to `pending`/`provisioning` (older than `PLANNER_PROVISIONING_STALE_AFTER_MS`), then to `failed`; confirm each renders its distinct state and that no Planner query is attempted in any of the three cases (FR-017, FR-018). **Mutates event-level state** (`planner_provisioning_status`) — requires its own dedicated test event (see Notes).
- [ ] T026 [P] [US5] **Depends on T005, T006, T009, T022, T023** (combination 5 renders as `pending`/`stale`, needing T022; combinations 1–4 render as `unavailable`/`failed`, needing T023). Verify (quickstart.md §L, five combinations, each on its own dedicated test event — see Notes): (1) `succeeded` with no active link → `unavailable`; (2) `not_required` despite an active `planner` row in `event_products` → `unavailable`; (3) an active link pointing at a non-existent Planner event id → `unavailable`; (4) `failed` while an active `event_planner_links` row also exists → `failed` (status precedence wins over link presence — the active link must never be treated as sufficient authority to load Planner Overview data); (5) `provisioning` while an active `event_planner_links` row also exists → `pending` (or `stale`, per `isPlannerProvisioningStale()`), same precedence reason. Confirm all five render their specified status, that none is repaired/written to/reconciled, and that no Planner query is attempted in cases (1)–(5) except where the precedence table calls for one. **Mutates event-level state** (`event_planner_links`, `planner_provisioning_status`, and, for combination 2 only, one event's own `event_products` row — not organization-level `organization_products`) — requires its own dedicated test event (see Notes).
- [ ] T027 [US5] **Depends on T006, T009, T024** (verifies the *rendered* `backend_error` state, not just the API response). Verify (quickstart.md §N): simulate a genuine Planner-side read failure for a `succeeded`+linked event; confirm the response is `backend_error`, the real error appears in server logs only, and the rendered state is visually distinct from both the zero-session state (T012) and the `unavailable` state (T026). **Not marked `[P]`**: the planned simulation method (e.g. temporarily pointing `PLANNER_SUPABASE_URL`/the service-role key at an invalid value) mutates process-wide server configuration, not an isolated test row — it cannot safely run concurrently with any other task that needs a real Planner connection during the same window (see Notes).

**Checkpoint**: User Story 5 independently verified — every provisioning/link/backend state is truthful and safe.

---

## Phase 8: Polish & Cross-Cutting Verification

- [ ] T028 [P] **Depends on T002, T006 for checks (1)–(5); additionally T007, T008, T009, T010 for check (6)** (the platform-admin check requires "Overview loads" — i.e. the `ready` content actually renders, not merely that the request isn't rejected — so it needs the full page/ready-branch, not just the route). Verify (quickstart.md §E–§H, six checks): (1) no authenticated session at all → `401 { error: 'not_authenticated' }`, confirming no Planner query is attempted and the response reveals nothing about the event's existence, product usage, or counterpart; (2) authenticated with no resolvable selected organization → `403 { error: 'forbidden' }`, confirming no Planner query and no cross-tenant/counterpart leakage (Feature 003 semantics unchanged, only newly verified here); (3) an org member without `event_members` is denied (404); (4) `event_members` under the wrong selected organization is denied; (5) a cross-tenant event id is denied; (6) a platform admin succeeds via the existing override, including through T008's redirect and T009/T010's page (SC-004). Read-only — each check uses a different caller identity against pre-configured baseline fixtures, no shared mutation.
- [ ] T029 [P] **Depends on T003, T006, T007, T009** ("with the Overview already open" requires the page to have loaded successfully first — a loading or non-ready state still counts as "open" for this check's purpose, so T010 is not required). Verify (quickstart.md §I): deactivate the organization's `planner` entitlement (or remove the event's `event_products` `planner` row) with the Overview already open; confirm the next request returns `403 product_unavailable`, the tab disappears from nav, and direct navigation is blocked. **Mutates organization-level state** (`organization_products` entitlement, not just one event) — requires its own dedicated test **organization** (with its own event), never the shared organization used by T012/T025/T026/T030 (see Notes) — deactivating an entitlement at the organization level would otherwise break every other concurrently-running task whose event happens to belong to that same organization, regardless of each using its own event.
- [ ] T030 [P] **Depends on T005, T006** (this is an API/network-level check — `status: 'unavailable'` and "no Planner query attempted" are both observable without the Overview page rendering anything, unlike T025–T027 which check rendered UI). Verify (quickstart.md §J): flip a test event's `event_planner_links.is_active` to `false`; confirm `status: 'unavailable'` and, via logs/network inspection, that no Planner query was attempted. **Mutates event-level state** (`event_planner_links.is_active`) — requires its own dedicated test event (see Notes).
- [x] T031 [P] **Depends on T006.** Verify (quickstart.md §O): attempt to supply a `plannerEventId` (or similarly named) parameter on the request; confirm it is ignored entirely and the response still reflects the event resolved server-side via `event_planner_links` (FR-012). Read-only.
- [ ] T032 [P] **Depends on T004, T006, and the completion of T011–T027** (this task inspects the actual network traffic those tasks produce — it cannot run before they have). Verify (quickstart.md §Q, security): inspect network responses across every state exercised in T011–T027; confirm no service-role key, raw Supabase/Postgres error, Planner integer id, or any field outside the `EventIdentity`/`SessionSummary` allowlist ever appears (FR-014, FR-015, FR-016, SC-007); confirm `src/lib/plannerOverview.ts` is never imported from a `'use client'` file. Read-only (inspection only).
- [ ] T033 [P] **Depends on T006, T007, T009, T010** (corrected — "an ordinary event member who can view the new Overview" requires that viewing to actually succeed, which needs the route, the section entry, and the rendered `ready` page; the admin-tab/route-authorization half of this check involves no Feature 005 task at all, since Feature 001's routes are independently gated, but the cross-check clause is what creates the real dependency). Verify (quickstart.md §R, Feature 001 regression): the `bendie-planner` admin tab and its 5 `planner-*` routes remain platform-admin-only; link/unlink, staff sync, agenda push, and travel pull behave exactly as before; an ordinary event member who can view the new Overview still cannot reach any `bendie-planner` admin action (FR-011, FR-027). Read-only against Feature 001's own existing data and the Feature 005 baseline fixture — independent of every dedicated test fixture from Notes.
- [ ] T034 [P] **No functional dependency on any Feature 005 task** — `organization_products`/`event_products`/`organization_planner_links` are never written by any task in this file (confirmed: only read by T003/T005/T006), so this check would produce the same true result at any point before or after Feature 005 ships. Conventionally sequenced in Phase 8 as part of the final consolidated regression sweep, not because of a real prerequisite. Verify (quickstart.md §S, Feature 002 regression): row counts, schema, and RLS for those three tables unchanged (FR-028). Read-only, independent of every Feature 005 test fixture.
- [ ] T035 [P] **Depends on T002, T003, T007, T008** (corrected — T002/T003 for "behaves identically after the eventAuth change"; **T007 and T008 were missing from the previous revision** and are required for "Bendie-only and Both events' default landing/tab bar are pixel-for-pixel unchanged," since T008's redirect and T007's new section entry are precisely the changes that could have introduced this regression — verifying it before either exists would be meaningless). Verify (quickstart.md §T, Feature 003 regression): at least one pre-existing call site of `requireEventWorkspaceAccess`/`isProductAvailableForEvent` (e.g. `EventContext.tsx`) behaves identically after T002/T003; organization membership alone still never grants workspace access; Bendie-only and Both events' default landing/tab bar are pixel-for-pixel unchanged (FR-029). Read-only.
- [ ] T036 [P] **No functional dependency on any Feature 005 task** — event creation, retry-provisioning, idempotency, mapping-drift, and stale-provisioning are implemented entirely in Feature 004's own routes/helpers, none of which import anything Feature 005 modifies or adds (confirmed: `src/app/api/events/create/route.ts` and `.../retry-planner-provisioning/route.ts` do not import `eventAuth.ts` at all). Conventionally sequenced in Phase 8 for the same reason as T034. Verify (quickstart.md §U, Feature 004 regression): event creation, retry-provisioning, idempotency, mapping-drift handling, and stale-provisioning messaging continue to work exactly as before (FR-030). Read-only, independent of every Feature 005 test fixture.
- [x] T037 **Depends on T001–T010 and T022–T024** (every file this feature touches must be in its final state). Run `npm run lint`, `npm run type-check`, and the production build (this repository's current equivalent commands); confirm clean with no new warnings (quickstart.md §V). Not `[P]` — must run after all implementation is complete.
- [x] T038 **Depends on T037** (T037's own dependency set — T001–T010, T022–T024 — already transitively guarantees every implementation task is complete, which is what "Feature 005's shipped scope" requires to be documented truthfully; chaining through T037 rather than re-listing its ten prerequisites also means documentation is written only once the quality gates it will describe as passing have actually passed). Update `context/progress-tracker.md` and `context/schema-reference.md` (Constitution Principle VII) recording Feature 005's shipped scope, the `eventAuth.ts` optional-client-parameter change (T002/T003), and `event_summary_realtime` as the Overview's data source (T004/T005). Not `[P]` — a shared-file documentation step, sequenced after implementation and quality gates for accuracy.
- [x] T039 **Depends on every other task in this file having run.** Perform quickstart.md's cleanup step: delete every temporary test organization/event/user/link/row created across T011–T036 on both Portal's and Bendie Planner's projects (including each dedicated test event created for T012, T025, T026, T030, and the dedicated test organization created for T029, per the Fixture Isolation table in Notes); restore any `planner_provisioning_status`/`event_planner_links.is_active`/`event_products`/`organization_products` value manipulated for T012/T025/T026/T029/T030 testing; restore any environment/credential value temporarily changed for T027. Not `[P]` — must run last.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: T002→T003 (same file); T004→T005 (same file); T006 depends on T002–T005; T007 independent; T008 depends on T007. **Blocks every user story phase.**
- **User Stories (Phase 3–7)**: Every task's exact prerequisite task IDs are now stated inline on the task itself (see above) rather than only at the phase level — phase membership alone is not a reliable proxy for a task's real dependencies in this feature, since several verification tasks need a *specific* implementation task from a different phase (most commonly T009, the Overview page) in addition to whichever phase they're grouped under for narrative/story purposes.
- **Polish (Phase 8)**: Depends on all of Phases 2–7 being complete (it verifies regressions and runs quality gates across the whole feature); T039 (cleanup) must run last.

### Parallel Opportunities

Grouped by what a task actually needs, not by phase label:

- **No dependency, independent files**: T001, T004, T007 — parallelizable immediately.
- **Ready once T007 alone is done**: T015, T017, T018 (T017/T018 also want T008 present, per their own entries, to confirm the redirect logic doesn't disturb them), T020.
- **Ready once T003, T006, T007 are done** (API/route-level, no page needed): T019.
- **Ready once T005, T006 are done** (API/network-level only, no page needed): T030.
- **Ready once T006 is done**: T031.
- **Ready once T007, T008, T009 are done**: T014.
- **Ready once T006, T007, T008, T009 are done**: T016.
- **Ready once T007, T009 are done**: T021.
- **Ready once T009, T010 are done**: T011, T013.
- **Ready once T009, T010 are done, plus fixture isolation (see below)**: T012.
- **Ready once T005, T006, T009, T022, T023 are done, plus fixture isolation**: T025, T026.
- **Ready once T002, T006 (and, for check 6, T007, T008, T009, T010) are done**: T028.
- **Ready once T003, T006, T007, T009 are done, plus organization-level fixture isolation**: T029.
- **Ready once T006, T007, T009, T010 are done**: T033.
- **Ready once T002, T003, T007, T008 are done**: T035.
- **No real task dependency — conventionally sequenced in Phase 8 with the rest of the regression sweep**: T034, T036.
- **Never parallel**: T027 (environment/credential-level mutation), T037, T038, T039 (each has its own stated reason above).
- **Sequenced after T011–T027 finish, then parallel with T028/T029/etc.**: T032.

---

## Parallel Example: Phase 2 kickoff

```bash
Task: "Add event_summary_realtime type to src/types/plannerDatabase.ts"          # T001
Task: "Create src/lib/plannerOverview.ts with getPlannerOverviewSummary"          # T004
Task: "Add planner-overview entry to src/lib/eventSectionMeta.ts"                 # T007
# T002/T003 (eventAuth.ts) proceed sequentially in parallel with the above three
```

## Implementation Strategy

### MVP First (User Story 1 only)

1. Complete Phase 1 (Setup) and Phase 2 (Foundational) — this alone produces a working, authorized, safe-shaped API route.
2. Complete Phase 3 (US1): T009 → T010 → then T011, T012, T013 (which depend on both).
3. **STOP and VALIDATE**: T011–T013 confirm the MVP is correct and safe before proceeding.

### Incremental Delivery

1. Setup + Foundational → route/data-access/nav/landing-redirect all exist.
2. Add US1 (T009, T010) → Overview renders for the success path → validate with T011–T013.
3. Add US2 → Planner-only landing fixed → validate with T014–T017.
4. Add US3, US4 → regression-confirm Bendie-only and Both are unaffected (T018–T021).
5. Add US5 (T022–T024) → every non-ready state renders truthfully → validate with T025–T027.
6. Phase 8 → full regression/security sweep, quality gates, documentation, cleanup.

## Notes

- No task in this file creates a migration on either Portal or Bendie Planner — confirmed at plan time and unchanged here.
- No task touches Tasks/Agenda/Participants/Flights/Accommodation/Transfers/Event Access/Blueprints/Checklist/Vendors/Notifications, attendee count, staff roster, module counts, a product switcher, organization-mapping UI, billing, or Bendie Planner's own schema/views — all explicitly out of scope per spec.md.

### Fixture Isolation (required for genuine `[P]` safety)

Every `[P]`-marked verification task was classified by what it actually reads or mutates:

| Mutation scope | Tasks | Isolation required |
|---|---|---|
| File edit only, no runtime state | T001, T004, T007 | None — independent files. |
| Read-only, pre-configured baseline fixture | T011, T013, T014, T015, T016, T017, T018, T019, T020, T021, T028, T031, T032, T033, T034, T035, T036 | None beyond quickstart.md's Prerequisites already being set up; these never mutate shared state, so they cannot corrupt another task's fixture. |
| Event-level Portal state (`event_planner_links`, `planner_provisioning_status`, or one event's own `event_products` row) | T012, T025, T026, T030 | Each MUST use its own dedicated temporary test event. These four may all share the **same** parent test organization, since none of them touches organization-level entitlement — only T029 must not share that organization (see next row). |
| Organization-level entitlement (`organization_products`) | T029 | MUST use its own dedicated temporary test **organization** (with its own event, as needed) — never the organization shared by T012/T025/T026/T030. Flipping an organization-wide entitlement would otherwise break any concurrently-running task whose event belongs to that same organization, regardless of each task using a distinct event. |
| Environment/credential-level (process-wide) | T027 | Cannot be safely isolated from any other task needing a real Planner connection during the same window — **not** marked `[P]`; run alone. |

T039 is the single point where every fixture created above (each task's own dedicated test event, and T029's dedicated test organization) is torn down, and every manipulated value is restored.

### Implementation-pass verification status (2026-09-16)

All implementation tasks (T001–T010, T022–T024) are complete: `npm run lint`, `npm run type-check`, and `npm run build` all ran clean with zero new warnings (T037). Additionally verified, with genuine evidence rather than by inspection alone:

- **Precedence logic (T005)** — unit-tested standalone against all 10 named combinations from data-model.md/quickstart.md §K/§L, including both explicitly-flagged contradictory ones (`failed`+active-link, `provisioning`+active-link): 10/10 passed.
- **Data-layer query shape (T004, and the queries T006/T030 rely on)** — live-verified against a temporary real fixture (test organization, event, `organization_products`/`event_products`/`organization_planner_links`/`event_planner_links` rows, created and fully deleted this session): confirmed `event_summary_realtime` returns the exact declared column shape for both a zero-session event (id 23, `number_of_sessions: 0`) and a 33-session event (id 1), and confirmed the exact `organization_products`/`event_products` query `isProductAvailableForEvent` uses returns `true` for a correctly-configured fixture.
- **`event_planner_links` RLS (critical, and not assumed)** — live-inspected `pg_policies`: this table has exactly one policy, `FOR ALL USING (portal_is_global_admin())` — an ordinary (non-platform-admin) caller's own session can **never** read it. This directly shaped T006's implementation: the link lookup uses the Portal service-role client, never the caller's `authClient`, which was not explicitly called out in the original task wording and would have been a functional bug (silently reporting "unavailable" for every ordinary event member) had it been missed.
- **Static security/scope facts (T013, T031, half of T032)** — grep-confirmed: no reference to `event_user_assignments`, `attendees`, or the excluded Planner views anywhere in the new files; `src/lib/plannerOverview.ts` is never imported from any `'use client'` file; the new route parses no query string or request body, so no client input can influence which Planner event is read.
- **eventAuth backward-compatibility (relevant to T035)** — the whole-project `type-check` passing confirms every existing call site of `requireEventWorkspaceAccess`/`isProductAvailableForEvent`/`isProductActiveForOrg` (including `EventContext.tsx` and `EventLayout`'s own pre-existing 3-argument calls) still compiles unchanged against the new optional fourth parameter.

**Not performed in this pass, left unchecked rather than assumed**: T011, T012 (UI-rendering half), T014–T021, T025–T030 (UI-rendering/live-HTTP halves), T027, T028, T029, T032 (live network capture), T033, T034, T035 (live behavioral regression), T036. All of these require an authenticated browser session against a running dev server (login, real navigation, observing actual rendered pixels) or, for T027, deliberately degrading real Planner credentials in a shared environment — neither was done this pass. The underlying logic and data each depends on was verified as described above wherever feasible without one; nothing here is known or suspected to be broken, but "not contradicted by static/data-layer checks" is not the same claim as "observed working end-to-end," and this file does not check a box for the latter without the former having actually happened.

### Post-implementation review-correction pass (2026-09-16)

`/code-review` found 5 genuine defects (F1–F5) in the shipped Foundational-phase code; all five are now fixed in `src/app/api/events/[eventId]/planner-overview/route.ts`, `src/lib/plannerOverview.ts`, `src/app/portal/events/[eventId]/planner-overview/page.tsx`, `src/lib/eventSectionMeta.ts`, and `src/app/portal/events/[eventId]/bendie-planner/page.tsx`. This does **not** change the completion status of any task above — T006/T007/T009's underlying implementations were corrected, not newly completed, and none of the still-unchecked verification tasks had their actual (live-session) acceptance condition performed during this pass either. Recorded here because it materially changes what T005/T006's already-`[x]` status actually describes, and because it is new evidence beyond what the original implementation pass verified:

- **T005/T006 (precedence logic) — re-verified after the F5 refactor**, which split `resolvePlannerOverviewStatus` into a link-independent `resolveProvisioningPhase` plus the original combined function (kept for callers needing both together). Re-ran the standalone precedence check against all 12 named combinations (data-model.md/quickstart.md §K/§L) plus an added 13th property check (every non-`succeeded` case resolves without needing `activeLink` at all, proving T006 can now return before ever constructing the Portal service-role client): 13/13 passed.
- **T006 (organization resolution) — new unit-level verification, not performed during the original pass.** The org-fallback expression added for F1 (`savedOrganizationId && accessibleOrgIds.includes(savedOrganizationId) ? savedOrganizationId : (accessibleOrgIds[0] ?? null)`) was tested standalone against 5 cases: null-saved-with-memberships, stale-saved-with-memberships, valid-saved-preserved-not-overwritten, no-memberships-null-saved, no-memberships-stale-saved. 5/5 passed, including the required property that a valid explicit selection is never silently replaced.
- **T006 (F3, error handling) and the page's fetch (F4, stale-response race) — verified by code inspection**, not live browser session: `linkError` on the `event_planner_links` lookup now maps to `status: 'backend_error'` before the `!activeLink` check can ever be reached for a real query failure; the page's `requestIdRef` generation guard was confirmed to follow the same increment-before-request / compare-on-every-await-boundary / bump-on-unmount pattern as the already-shipped `eventGenerationRef`/`workspaceGenerationRef` pattern in `src/contexts/EventContext.tsx`.
- **F2 (`bendie-planner` tab classification)** — historical-semantics audit determined this was a genuine brownfield gap (CASE B, not a documentation error and not conflicting artifacts): the tab was classified `product: 'bendie'` since Feature 003, before Planner-only events were even possible, silently making Feature 001's admin surface unreachable for them despite `schema-reference.md`'s own Feature 004 operation matrix already documenting member sync/linking as product-mix-agnostic. Corrected by reclassifying to `product: 'shared'` in `eventSectionMeta.ts` (always listed in nav regardless of product mix, matching every other `'shared'`-handling code path already present in `EventLayout`) while gating the two genuinely Bendie-specific actions (Push Agenda, Pull Travel) behind a live `event_products` check inside the page itself. Live-queried the real Portal database: all 16 existing events are Bendie-only (zero Planner-only or Both events exist yet), so Bendie-only behavior was confirmed against real data; Planner-only and Both behavior were confirmed by code-path tracing only (same limitation already documented above for the rest of this feature's unexercised live-session paths), not a live rendered session.
- **F1 contract drift** — `contracts/get-planner-overview.md` step 2 and its 403 row, and `quickstart.md` §E (renumbered 2/2a), were rewritten to describe the corrected two-case reality (case A: fallback resolves via membership, not an error; case B: zero memberships, the only real 403) instead of the original "no selected organization → 403" wording, which no longer matched the fixed behavior.

No task's checkbox changed in this addendum. `npm run lint`, `npx tsc --noEmit`, and `npm run build` were all re-run after every F1–F5 code change and passed clean with zero new errors/warnings.

### Final corrective re-review pass (2026-09-16, same day)

A second `/code-review` re-review of the F1–F5 corrections found 4 further issues (none Blocking/High): one genuine Medium (organization-fallback ordering non-determinism, below), and three Low (two error-discard patterns fixed narrowly in `src/lib/eventAuth.ts`/`route.ts`'s own memberships query; a `bendieActive` initial-value race in `bendie-planner/page.tsx` fixed by defaulting to `false`; a pre-existing, unaffected-by-this-pass EventLayout nav-visibility characteristic left as reported-only follow-up debt, not fixed). None of these changed any task's completion status — same reasoning as the pass above.

**Medium — organization-fallback determinism, now closed.** F1's fallback (route.ts) and the browser's `getAccessibleOrganizations()` (`src/lib/portalAuth.ts`) are two structurally different Supabase queries against `organization_members` (a plain select vs. an embedded-resource join), and neither carried an explicit order — Postgres/PostgREST gives no guarantee that "the first row returned" is the same value between two differently-shaped queries, even against identical data, so the contract's claim to "exactly mirror" the browser's `accessible[0]` choice was not structurally proven, only incidentally true under today's query plans (confirmed live: both shapes, unordered, agreed for a real 6-membership user — but agreement without a guarantee is not the same claim as determinism). Fixed by adding the identical `.order('organization_id', { ascending: true })` to both queries — `organization_id` was chosen deliberately as a pure, product-meaningless tie-break (not join date, not name, not entitlement), so this closes the determinism gap without redefining which organization the fallback picks. Re-verified: (a) live SQL against a real multi-membership user proved both query shapes agree once explicitly ordered; (b) a standalone synthetic test fed the two shapes deliberately mismatched raw orderings (proving the fixture is genuinely adversarial, not accidentally already sorted) and confirmed both resolve to the identical fallback organization after the shared ordering is applied — 8/8 checks passed, covering null-selection, stale-selection, valid-selection-preserved, repeated-execution stability, and zero-membership.

No task's checkbox changed. `npm run lint`, `npx tsc --noEmit`, and `npm run build` re-run clean with zero new errors/warnings after this pass's changes (`src/lib/eventAuth.ts`, `src/app/api/events/[eventId]/planner-overview/route.ts`, `src/lib/portalAuth.ts`, `src/app/portal/events/[eventId]/bendie-planner/page.tsx`).

### Runtime verification pass (2026-09-16, same day)

No source code was modified in this pass. **No task checkbox was changed** — the environment has no browser-automation tool, so no task whose literal acceptance condition specifies loading a page and observing rendered output (tab bar presence, redirect navigation, banner rendering, responsive layout) could be executed; those all remain genuinely unperformed, not merely uninspected, exactly as the file already stated. What follows is a record of substantial *real, authenticated-HTTP-session* verification performed against the actual running application (not unit tests, not code inspection) that materially reduces the uncertainty several tasks were meant to resolve, even though it does not meet each task's literal wording closely enough to check its box.

**Method**: created two real Supabase Auth users via the standard Admin API (not raw `auth.users` SQL), signed in via the password grant to obtain genuine access/refresh tokens, and constructed the exact `@supabase/ssr` session-cookie format (verified against the installed `node_modules` source: `sb-<project-ref>-auth-token=base64-<base64url(JSON.stringify(session))>`) to issue real `curl` requests carrying a real, currently-valid Supabase session against the live `next dev` server on `localhost:3000` — the same code path a browser would exercise, minus actual DOM rendering/JS execution. Three dedicated test organizations and 16 dedicated test events (one per scenario, per the Fixture Isolation table's isolation requirement) were created via direct SQL, exercised, and then fully deleted; both test auth users were deleted via the Admin API. Cleanup verified: zero residual rows across `organizations`, `events`, `auth.users`, `profiles`, `organization_products`, `event_planner_links` matching the fixture tags.

**Genuinely confirmed live** (real HTTP responses from the real running server, not inspected source):
- Unauthenticated request → `401 { error: 'not_authenticated' }`.
- Zero-membership authenticated user → `403 { error: 'forbidden' }` (case B).
- `current_organization_id = null`, 2 real memberships → deterministic fallback to the lexicographically smaller `organization_id` (F1/determinism fix confirmed live, not just unit-tested).
- `current_organization_id` = a real org the user is no longer a member of (genuinely stale) → same deterministic fallback as the null case, confirmed to resolve identically.
- A valid, explicit `current_organization_id` → preserved, workspace admission proceeded against that org.
- Wrong selected org (event belongs to a different org than the one selected) → `404 event_not_found`, fallback did not chase the event.
- Org member without `event_members` → `404 event_not_found`.
- Genuine cross-tenant event (zero relationship to the owning org) → `404 event_not_found`.
- Platform admin (temporarily elevated `global_role`, reverted after) → bypassed workspace/org checks entirely and proceeded to the product-availability check on a cross-tenant event.
- Bendie-only event → `403 { error: 'product_unavailable' }`.
- Planner-only event, succeeded + valid link → `200 ready` with the exact allowlisted fields (title, location, start/end/setup date, session summary) and no extra fields, matching the real linked Planner event's actual data.
- Both event, zero-session Planner counterpart → `200 ready` with `totalSessions: 0`, rendered as a normal state (never `unavailable`/`failed`).
- `pending` (fresh) → `200 pending`; `provisioning` (fresh) → `200 pending`; `provisioning` (10 min stale) → `200 stale`; `failed` → `200 failed`.
- **Failed + active link (contradiction)** → `200 failed`, link correctly ignored, never `ready`.
- **Provisioning (fresh) + active link (contradiction)** → `200 pending`, link correctly ignored, never `ready`.
- `not_required` anomaly (active Planner product, status stuck) → `200 unavailable`, failed closed.
- `succeeded` + missing link → `200 unavailable`; `succeeded` + inactive link → `200 unavailable`; `succeeded` + dangling counterpart (link to a nonexistent Planner event id) → `200 unavailable`.
- Ordinary (non-platform-admin) event member with **zero** Planner-side identity of any kind → successfully loaded `ready` — architecturally proves no `event_user_assignments` dependency (the test user has no Planner-side existence at all).
- Feature 001 regression: an ordinary session's request to the admin-only `planner-link` route → `403 Forbidden`, unaffected by F2's nav-visibility change.

**Genuine incident, found and resolved during this pass (not a Feature 005 defect):** the pre-existing `next dev` server this pass used had its `.next` build cache corrupted by this session's own earlier `npm run build` (production build) invocations writing into the same `.next` directory a live dev server was using — surfaced as a `500` "Cannot find module './vendor-chunks/react-hot-toast.js'" error on **every** page, including unrelated pre-existing ones (`members`) — not specific to any Feature 005 file. Resolved by stopping the corrupted process, deleting `.next`, and starting a fresh `next dev`; confirmed recovered (`members` and `planner-overview` both returned `200` afterward). Documented here as an environment-management lesson: a production `npm run build` should not be run against the same `.next` directory a `next dev` instance is actively using.

**Not performed — genuine environment gaps, not assumed passing**: actual browser rendering of any page (tab bar presence/absence, default-landing redirect via `router.replace`, non-ready banner appearance, responsive layout at any width) — no browser-automation tool is available in this environment. The F4 stale-response race (`requestIdRef`) — inherently a client-side React state-ordering property that cannot be observed via HTTP requests alone; its established-pattern match against `EventContext.tsx` was code-inspected in the prior pass, not exercised live here. `backend_error` — deliberately not attempted, since the only way to safely reproduce a genuine Planner-side query failure without a dedicated broken fixture would require degrading real Planner credentials or infrastructure, which this pass's instructions explicitly prohibited; left unchecked per the instruction to report rather than fake this specific state.

### Manual browser verification paused (2026-09-16) — two brownfield defects found, both fixed, outside Feature 005's own scope

While preparing a controlled Planner-only manual-test event (`Stawi Escape — Planner Test`, in the
pre-existing `Bendie Planner Sample` sample organization) so the user could manually exercise Planner-only
landing/Planner Overview in a real browser, two pre-existing brownfield defects were found and fixed —
**neither is a Feature 005 code defect**; both are corrected here only because they blocked preparing
Feature 005's own manual-test fixture:

1. **Event discovery outage (Feature 004 grant/client mismatch)** — see the dated entry above and
   `context/schema-reference.md`/`context/progress-tracker.md`'s changelog entries of the same date.
2. **Planner-inclusive event creation was RLS-blind for non-platform-admin org owners/admins (Feature 004)**
   — full detail in `context/schema-reference.md`'s changelog entry of the same date; fixed in
   `src/app/api/events/create/route.ts`, `src/lib/plannerEventProvisioning.ts`,
   `src/lib/plannerStaffSync.ts`, `src/components/portal/CreateEventModal.tsx`.

Neither fix touched any Feature 005 file. `Stawi Escape — Planner Test` itself has **not** been created yet
— manual verification remains paused pending the user's review of this Feature 004 correction before
resuming the Feature 005 fixture setup.
