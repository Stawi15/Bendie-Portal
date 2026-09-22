# Tasks: Bendie Planner Vendors Management

**Input**: Design documents from `specs/009-bendie-planner-vendors-management/` (spec.md, plan.md, research.md, data-model.md, contracts/planner-vendors-api.md, quickstart.md — all complete, 0 open clarifications)

**Tests**: This repository has no automated test suite (Constitution/plan.md Testing: `npm run type-check`/`lint`/manual+live-DB verification is the established convention across Features 001–008). No test-file tasks are generated; verification tasks below are live/manual, matching every prior feature's own convention.

**Organization**: Grouped into 11 phases per the requested breakdown, cross-referenced to user stories (`[US1]`–`[US6]`) wherever a task serves one. Foundational/infrastructure/regression/final-review tasks carry no story label, matching the template's own rule.

**Traceability convention**: every task cites the exact spec.md requirement/scenario/edge-case ID(s) it implements or verifies, matching Feature 008's tasks.md's own established citation style.

---

## Phase 1: Foundation — Planner Vendors data-access layer

**Purpose**: The single, narrow, server-only module every route in later phases depends on. Nothing in Phase 2+ can be implemented before this phase completes.

- [x] T001 In `src/types/plannerDatabase.ts`, add a hand-written `event_vendor_items` reference entry (all 20 columns per data-model.md §1) matching the existing `operational_tasks` entry's documentation style — reference/documentation only, confirms no schema change is introduced anywhere in this feature (FR-014).
- [x] T002 Create `src/lib/plannerVendors.ts` with the `'server-only'` import guard and the module-level doc comment explaining its narrow scope, mirroring `plannerTasks.ts`'s own header exactly.
- [x] T003 In `src/lib/plannerVendors.ts`, define `VendorItem`, `VendorCapability` (`{hasPlannerIdentity:false} | {hasPlannerIdentity:true; canView:boolean; canManage:boolean}`), `VendorItemCreateInput`, `VendorItemPatch` (`Partial<{isPacked, isLoaded, isOnSite, notes}>` only — never `category`/`item_description`/`quantity_text`/`unit`/`sort_order`, per FR-038), `PlannerVendorValidationError`, and `PlannerVendorNotFoundError` types, per data-model.md §3.
- [x] T004 In `src/lib/plannerVendors.ts`, define the explicit `VENDOR_SELECT_COLUMNS` constant: all 20 base columns plus three separately-named-FK `profiles` embeds (`profiles!event_vendor_items_packed_by_profile_id_fkey(full_name)`, `..._loaded_by_profile_id_fkey`, `..._on_site_by_profile_id_fkey`) and one for `created_by_profile_id`, per research.md R5. Never `select('*')` (FR-018).
- [x] T005 In `src/lib/plannerVendors.ts`, implement `shapeVendorItem(row)` mapping a raw row to `VendorItem`: `packedByName`/`loadedByName`/`onSiteByName`/`createdByName` are `null` whenever the corresponding `*_by_profile_id` is `null` — never substituted with a placeholder or fabricated name (FR-032, data-model.md §3).
- [x] T006 In `src/lib/plannerVendors.ts`, implement `resolveCallerPlannerIdentity(authClient, userId)` — a small, deliberately self-contained duplicate of `plannerTasks.ts`'s identical function (this codebase's established preference for independent per-module duplication over cross-feature-module imports, per Feature 007/008's own inline-authorization precedent).
- [x] T007 In `src/lib/plannerVendors.ts`, implement `resolveVendorCapability(plannerEventId, plannerProfileId)`, structurally identical to `plannerTasks.ts`'s `resolveTaskCapability`: platform-admin bypass, else an active `event_user_assignments` row's `can_view_vendors`/`can_manage_vendors` (FR-005, FR-006, FR-007, FR-008). Throws on a genuine query error — never returns `canView:false` for a failure (matching Feature 007's own `/speckit.analyze` H2 correction).
- [x] T008 In `src/lib/plannerVendors.ts`, implement `listVendorItems(plannerEventId)`: `.select(VENDOR_SELECT_COLUMNS).eq('event_id', plannerEventId).order('category').order('sort_order')`, matching the live `idx_event_vendor_items_event_sort` index (research.md R5, FR-016). Throws on a genuine error — never returns `[]` on failure.
- [x] T009 In `src/lib/plannerVendors.ts`, implement `getVendorItem(plannerEventId, itemId)`: `.eq('vendor_item_id', itemId).eq('event_id', plannerEventId).maybeSingle()` — returns `null` for both "doesn't exist" and "belongs to a different event," the single item-scope check every mutation below reuses (FR-036, SR-005).
- [x] T010 In `src/lib/plannerVendors.ts`, implement `createVendorItem(plannerEventId, createdByProfileId, input: VendorItemCreateInput)`: validates `description` is present/non-blank (throws `PlannerVendorValidationError` otherwise — FR-024), inserts `{event_id, item_description, category?, quantity_text?, unit?, notes?, sort_order?, created_by_profile_id}` — never `is_packed`/any `*_at`/any `*_by_profile_id` (FR-022, FR-023, FR-026) — and returns the freshly-selected row via `.select(VENDOR_SELECT_COLUMNS)`.
- [x] T011 In `src/lib/plannerVendors.ts`, implement `updateVendorItem(plannerEventId, itemId, patch: VendorItemPatch)`: for the three booleans, include a column in the `UPDATE` payload only when `typeof patch.isPacked/isLoaded/isOnSite === 'boolean'` (an omitted key is `undefined`, distinct from an explicit `false`, matching `plannerTasks.ts`'s own `patch.X !== undefined` idiom); for `notes`, include it only when `'notes' in patch` (distinguishes an omitted key from an explicit `null`, matching `updateTaskAsManager`'s established `'remarks' in body` idiom for the same nullable-string shape). Issues one `UPDATE ... WHERE vendor_item_id = ? AND event_id = ? RETURNING <VENDOR_SELECT_COLUMNS>`; throws `PlannerVendorNotFoundError` if no row matched (covers both "deleted" and "wrong event" — FR-034, FR-036). Never computes or validates the packed/loaded/on-site combination itself — submits exactly what was requested and returns exactly what the database persisted (FR-028, FR-030; data-model.md §2/§4).
- [x] T012 In `src/lib/plannerVendors.ts`, implement `deleteVendorItem(plannerEventId, itemId)`: `DELETE ... WHERE vendor_item_id = ? AND event_id = ? RETURNING vendor_item_id`; throws `PlannerVendorNotFoundError` if no row matched (FR-036, FR-037; research.md R8 — a plain not-found, never a soft-delete or no-op-success shape).
- [x] T013 In `src/lib/plannerVendors.ts`, implement `normalizePlannerVendorError(err)` mapping every thrown error to one of `{invalid_request, vendor_item_not_found, planner_write_failed}` with a safe, human-readable message — never a raw Postgres/trigger exception string (SR-012, FR-039).

**Checkpoint**: `plannerVendors.ts` is complete and independently type-checkable. No route work can begin before this phase is done.

---

## Phase 2: Capability and authorization

**Purpose**: The dedicated, lightweight capability endpoint, and the explicit proof that the authorization model behaves exactly as specified. (Full collection/item route authorization sequences are built in Phase 3; the assertions below are written now and executed once Phase 3 exists — dependencies are noted.)

- [x] T014 Create `src/app/api/events/[eventId]/planner-vendors/capability/route.ts`: copy the identical 8-step sequence from `planner-tasks/capability/route.ts` (auth → org resolution → `requireEventWorkspaceAccess` [Feature 003 workspace access established before any Vendors-specific check — FR-003] → `isProductAvailableForEvent(..., 'planner', ...)` → `resolveProvisioningPhase` → `event_planner_links` resolution → `resolveCallerPlannerIdentity` → `resolveVendorCapability`), substituting Vendors' own functions from `plannerVendors.ts`. A missing identity returns `200 { ok:true, capability:{hasPlannerIdentity:false} }`, never a `403` — this route never gates on its own answer (contracts.md, FR-044).
- [x] T017 Create `src/app/api/events/[eventId]/planner-vendors/route.ts` `GET` handler skeleton with the full 8-step authorization sequence (copied inline per Feature 005/007/008's deliberate non-shared-helper precedent, plan.md), ending in `403 vendor_access_denied` when `capability.canView` is false (FR-005, SR-001, SR-009).
- [x] T023 Add the `capability.canManage` gate (`403 vendor_manage_denied`) to the `POST` handler stub in `planner-vendors/route.ts` and the `PATCH`/`DELETE` handler stubs in `planner-vendors/[itemId]/route.ts` (full bodies completed in Phase 3) — `can_view_vendors` alone MUST NOT be sufficient for any mutation (SR-002), covering the Viewer-denied-create (**US2 AS2**), Viewer-denied-status-change (**US3 AS7**), and Viewer-denied-delete (**US4 AS2**) cases uniformly through one shared gate — establishes the shared denial shape the verification tasks below depend on.
- [x] T015 [P] Live-verify (depends on T014, T017, T023 above): an unauthenticated request to `GET .../planner-vendors/capability` returns `401 not_authenticated` (SR-009, spec Edge Case "unresolved Planner identity" family).
- [x] T016 [P] Live-verify (depends on T014, T017, T023 above): a caller with Portal workspace access but `can_view_vendors=false, can_manage_vendors=false` receives `{canView:false, canManage:false}` from the capability route, and is denied by the collection/item routes (`403 vendor_access_denied`) — **US5 AS1**, SR-001.
- [x] T018 [P] Live-verify (depends on T017 above): a caller with `can_view_vendors=true` (any `can_manage_vendors` value) receives `200` with the full item list from the collection route — **US5 AS2**, FR-005, SC-002.
- [x] T019 [P] Live-verify (depends on T017, T023 above): a caller with `can_manage_tasks=true`/`can_manage_checklist=true` but not `can_manage_vendors` is denied every Vendors mutation — **US5 AS3**, FR-008, SR-004.
- [x] T020 [P] Live-verify (depends on T017, T023 above): a caller's Portal event role (organizer/admin/staff/etc.) has zero bearing on the capability result — only the Planner `event_user_assignments` row does — **US5 AS2**, FR-007, SR-003.
- [x] T021 [P] Live-verify (depends on T017, T023 above): a direct API call to any Vendors route (bypassing the UI entirely) is denied identically to the UI path for an unauthorized caller — **US5 AS4**, FR-009, SR-014.
- [x] T022 [P] Live-verify (depends on T017 above): an authenticated caller with Portal workspace access but no event-member/organization standing for this specific event is denied with `404 event_not_found` (never confirming the event's existence) — SR-005.

**Checkpoint**: Authorization model is implemented and independently verifiable; Phase 3 completes the CRUD bodies behind these same gates.

---

## Phase 3: Vendors API routes

**Purpose**: Complete the collection and item route bodies behind the authorization gates from Phase 2.

- [x] T024 [US1] Complete `GET .../planner-vendors`: after the Phase 2 gate, call `listVendorItems(plannerEventId)` and return `{ok:true, capability, items}` (contracts.md). An empty result is a normal `200` with `items:[]` — **US1 AS2**, FR-016. This read path performs no insert/update/delete of any kind — opening Vendors never itself creates, modifies, or deletes an item (FR-017).
- [x] T025 [US2] Complete `POST .../planner-vendors`: after the Phase 2 `canManage` gate, parse and validate the request body against the exact allowlist (`category?, description(required), quantityText?, unit?, notes?, sortOrder?`) — reject any other field (including `event_id`, any `is_packed`/`*_at`/`*_by_profile_id`, `createdByProfileId`) with `400 invalid_request` before calling `createVendorItem` — **US2 AS1/AS3**, FR-021, FR-024, SR-006, SR-007, SR-008.
- [x] T026 [US2] In the same `POST` handler, pass `created_by_profile_id` as the resolved `plannerProfileId` from the Phase 2 identity resolution — never a client-supplied value — **US2 AS1**, FR-023, SR-007. Return `201 {ok:true, item}` on success.
- [x] T027 [US2] Live-verify: creating an item against an event with no active `event_planner_links` row is rejected before any write is attempted — **US2 AS4**, FR-025.
- [x] T028 Create `src/app/api/events/[eventId]/planner-vendors/[itemId]/route.ts` with the shared 8-step authorization sequence (copied inline, matching `planner-tasks/[taskId]/route.ts`'s own precedent) plus a pre-fetch of the target item via `getVendorItem` — a `null` result (wrong event or genuinely missing) returns `404 vendor_item_not_found` before either handler below runs, never leaking cross-event existence (FR-034, FR-036, SR-005). Because this same sequence re-resolves `event_planner_links` on every call, a status-change or delete request arriving after the event's canonical link has since been deactivated is rejected at step 6 (`{ok:true, status:'unavailable'}`) before reaching the item pre-fetch — spec Edge Case "a create or status-change request targets an event whose Bendie Planner link has since been deactivated," FR-034.
- [x] T029 [US3] Implement the `PATCH` body: parse the request against the strict `{isPacked?, isLoaded?, isOnSite?, notes?}` allowlist — any other key (including all five protected detail fields and `event_id`) returns `400 invalid_request` before calling `updateVendorItem` (FR-038, FR-039, FR-041). A manager may mark an item Packed, Loaded, or On-site through this single endpoint (FR-027). If the body contains none of the four recognized keys (an empty `{}` or a body containing only unrecognized keys), return `400 invalid_request` ("at least one field is required") rather than issuing a no-op `UPDATE` — matches contracts.md's own "any **non-empty** subset" wording, which otherwise has no enforcing task. Requires `capability.canManage` (from Phase 2's T023 gate).
- [x] T030 [US3] In the same `PATCH` handler, return `200 {ok:true, item}` using the row `updateVendorItem` returned from its own `RETURNING` clause — never a second read, never the client's originally-submitted combination — **US3 AS4**, FR-030.
- [x] T031 [US4] Implement the `DELETE` handler: requires `capability.canManage`, calls `deleteVendorItem`, returns `200 {ok:true}`; a `PlannerVendorNotFoundError` (already deleted or wrong event) returns `404 vendor_item_not_found` — **US4 AS1/AS3**, FR-035, FR-036, research.md R8.
- [x] T032 Wire `normalizePlannerVendorError` into the catch blocks of all three route files (`route.ts`, `[itemId]/route.ts`) so every thrown error maps to `400 invalid_request` / `404 vendor_item_not_found` / `500 planner_write_failed` consistently — SR-012.
- [x] T033 [P] Live-verify (depends on T028): a `PATCH`/`DELETE` naming a valid `itemId` that belongs to a different event's vendor list returns `404 vendor_item_not_found` and does not mutate the row — **US5 (cross-cutting)**, spec Edge Case "a valid item ID from another event must never be mutable through the current event route," FR-036, SR-005.
- [x] T034 [P] Live-verify (depends on T025, T029): submitting a client-supplied lifecycle timestamp or `*_by_profile_id` value on create or patch is silently ignored/rejected, never persisted as submitted — spec Edge Case "manager submits a status change alongside a request to set packed_by_profile_id or a timestamp directly," SR-008, SC-006.
- [x] T035 Run `npm run type-check` and `npm run lint` against `plannerVendors.ts` and all three new route files; fix any error before proceeding to Phase 4.

**Checkpoint**: All five HTTP operations (list, capability, create, patch, delete) are complete, authorized, and independently live-testable via direct API calls.

---

## Phase 4: Event-workspace navigation/capability integration

**Purpose**: Make Vendors reachable as its own workspace tab, gated identically to every other Planner-classified section, without altering the existing Tasks-specific gating block.

- [x] T036 In `src/lib/eventSectionMeta.ts`, add the `planner-vendors` entry to `EVENT_SECTIONS` (`product: 'planner'`, label "Vendors", an icon/badge pair distinct from `planner-tasks`'/`planner-overview`'s) — FR-004, FR-043.
- [x] T037 In `src/app/portal/events/[eventId]/layout.tsx`, add a second, Vendors-specific `PlannerVendorCapabilityState` (`{status:'loading'} | {status:'ready'; capability} | {status:'provisioning'} | {status:'error'}`), structurally identical to but entirely separate from the existing `PlannerTaskCapabilityState` — do not modify, rename, or refactor the existing Tasks state (research.md R9, plan.md's explicit "not a generalization" decision, Constitution I/VI).
- [x] T038 In the same file, add a Vendors-specific fetch effect calling `GET .../planner-vendors/capability`, gated on `productAvailability.planner === true` (same gating condition the existing Tasks effect uses), mapping the three response shapes to `PlannerVendorCapabilityState` exactly as the existing Tasks effect does for its own state (FR-044).
- [x] T039 In `isSectionAvailable`, add a `section.key === 'planner-vendors'` branch returning `plannerVendorCapability.status === 'ready' && capability.hasPlannerIdentity === true && capability.canView === true` — mirroring the existing `planner-tasks` branch's exact shape, added alongside it (not replacing or merging it).
- [x] T040 Extend `plannerTaskCapabilityPending`/`plannerTasksDeferToPage`/`activeSectionUnavailable`'s composition with the equivalent Vendors-specific conditions (`plannerVendorCapabilityPending`, `plannerVendorsDeferToPage`), scoped strictly to `section.key === 'planner-vendors'`, changing no existing Tasks-scoped behavior — FR-044, spec Edge Case "provisioning/pending/failed reuses existing vocabulary."
- [ ] T041 [P] Live-verify (depends on T036–T040): on a Bendie-only event, the Vendors tab does not appear in the tab bar and a direct navigation to `/portal/events/[eventId]/planner-vendors` does not render Vendors content — **US6 AS3**, FR-001.
- [ ] T042 [P] Live-verify (depends on T036–T040): on a Planner-only event with an authorized viewer, the Vendors tab appears and functions — **US6 AS1**, FR-001, SC-007.
- [ ] T043 [P] Live-verify (depends on T036–T040): on a Both event, Vendors is reachable identically from either product origin, and its own internal links (if any) carry the same `?product=planner` signal every other Planner-classified tab already propagates via `resolveEventTabProduct` — **US6 AS2**, FR-046, SC-007. No change made to `resolveEventTabProduct`/`parseEventOriginSignal`/`resolveDefaultProduct` themselves.
- [ ] T044 [P] Live-verify (depends on T036–T040): a direct URL to `/portal/events/[eventId]/planner-vendors` for a caller with `can_view_vendors=false` is denied at the route level identically to the tab being hidden — **US5 AS4**, FR-009, SR-014.
- [x] T045 Run `npm run type-check` and `npm run lint` against `layout.tsx`/`eventSectionMeta.ts`; confirm zero new warnings beyond this feature's own files.

**Checkpoint**: Vendors is reachable, correctly gated, and does not disturb Tasks/Overview/Bendie-only navigation.

---

## Phase 5: Vendors UI

**Purpose**: The manager/viewer-facing surface, reusing Planner Tasks/Overview's established visual and state conventions exactly.

- [x] T046 Create `src/app/portal/events/[eventId]/planner-vendors/page.tsx` with the same `PageState` state-machine shape as `planner-tasks/page.tsx` (`loading | denied | configuring{status} | loaded{capability, items}`), the same `requestIdRef` ABA stale-response guard, and the same `mountedRef` pattern for safe post-mutation `setState` calls (FR-042).
- [x] T047 [US1] In `page.tsx`, `load()` fetches `GET .../planner-vendors`; a `data.status` response renders the existing pending/stale/failed/unavailable/backend_error copy verbatim (no new vocabulary) — **US1 AS2**, FR-002.
- [x] T048 [US1] Create `src/components/portal/PlannerVendorList.tsx`: renders `category`, `description`, `quantity`/`unit`, and the three lifecycle stages for each item, grouped/ordered exactly as the API already returns them (category, then sort order) — never a raw `vendor_item_id`/Planner event ID anywhere in the rendered output — **US1 AS1**, FR-016, FR-019.
- [x] T049 [US1] In `PlannerVendorList.tsx`, render a distinct empty-list message (never confused with loading or an error state) when `items` is empty — **US1 AS2**.
- [x] T050 [US1] In `PlannerVendorList.tsx`, when `capability.canManage` is false, render every create/toggle/notes-edit/delete control absent or disabled — a Viewer sees the identical list with zero usable mutation affordances — **US1 AS3**, **US5**, FR-020.
- [x] T051 [US1] In `PlannerVendorList.tsx`, for each lifecycle stage whose `*ByName` is `null`, render the timestamp alone with no attribution line (never a fabricated or generic "by" label) — **US1 AS4**, FR-032.
- [x] T052 [US2] Create `src/components/portal/PlannerVendorModal.tsx`'s create form: description (required, inline validation before submit), category/quantity/unit/notes (optional) — no field for any lifecycle flag, `event_id`, or any `*_by`/`*_at` value (FR-021, FR-024).
- [x] T053 [US2] Wire the create form's submit to `POST .../planner-vendors`, disabling the Create/Cancel buttons for the duration of the request (`disabled={submitting}`, matching `PlannerTaskModal.tsx`'s identical, already-established double-click mitigation — `event_vendor_items` has no unique constraint beyond its primary key, so nothing at the database layer would otherwise prevent a duplicate row from a repeated submit); on `400`, render the server's human-readable message inline (never a raw error); on success, close the form and refresh the list from the authoritative response — **US2 AS3**, FR-024.
- [x] T054 [US3] In `PlannerVendorList.tsx`, add the three lifecycle toggle controls (Packed/Loaded/On-site), each calling `PATCH .../planner-vendors/[itemId]` with only the single boolean that changed; on response, replace that item's row with the server's authoritative returned state (which may differ from what was toggled, per the trigger's cascade) — **US3 AS1–AS5**, FR-030.
- [x] T055 [US3] Add a per-item pending/disabled state while a lifecycle toggle request is in flight, and a non-blocking error surface (e.g. a toast) on failure that leaves the item's displayed state unchanged from before the attempt — **US3 AS7**.
- [x] T056 [US7-adjacent/notes] Add an inline-editable Notes field per item (visible only when `capability.canManage`) calling `PATCH .../planner-vendors/[itemId]` with `{notes}`; a Viewer sees the notes text read-only — FR-041.
- [x] T057 [US4] Add a delete control (visible only when `capability.canManage`) that opens the existing Portal confirmation pattern (`useConfirm()`, matching `planner-tasks/page.tsx`'s own delete-confirmation usage) before calling `DELETE .../planner-vendors/[itemId]`; on success, remove the item from the displayed list from the authoritative refreshed state — **US4 AS1**, FR-035.
- [x] T058 Confirm (code-review, no new task needed if already true from T048–T057) that no control anywhere in `PlannerVendorList.tsx`/`PlannerVendorModal.tsx` allows editing `category`/`item_description`/`quantity_text`/`unit`/`sort_order` on an existing item — FR-038, spec Edge Case "a manager attempts to edit an existing item's category, description, quantity, unit, or display order."
- [x] T059 Wire `page.tsx`'s Vendors tab into the Members-adjacent event workspace shell only via the `EVENT_SECTIONS`/`EventLayout.tsx` mechanism from Phase 4 — no Members-page file is touched by this feature (plan.md's Members/Workspace Regression Considerations).
- [ ] T060 Run `npm run type-check` and `npm run lint` against all new UI files; visually confirm (manual browser check) the page matches Planner Tasks/Overview's existing spacing, typography, and component tokens with no new design system introduced (Constitution V, FR-042). **Partially done during `/speckit.implement`**: `type-check`/`lint` both ran clean against every new file (confirmed 2026-09-21). The visual browser confirmation has NOT been performed — left unchecked per this pass's task discipline; needs a human to open `/portal/events/[eventId]/planner-vendors` and confirm it visually matches Planner Tasks/Overview.

**Checkpoint**: The full Vendors UI is functional end-to-end against the real API for both Viewer and Manager capability states.

---

## Phase 6: Lifecycle/status behavior — dedicated verification

**Purpose**: Prove the database-trigger-authoritative lifecycle behavior (implemented in T011, exercised through T029/T030/T054) genuinely holds, and that no application code anywhere in this feature has become a competing source of truth for it.

- [x] T061 [P] [US3] Live-verify: attempting to persist `isLoaded:true` while `isPacked` is currently false results in a persisted `isLoaded:false` (the database silently declines the forward-skip) — **US3 AS5**, FR-028, data-model.md §2.1.
- [x] T062 [P] [US3] Live-verify: attempting to persist `isOnSite:true` while `isLoaded` is currently false (including in the same request that also sets `isLoaded:true` and `isPacked:false` simultaneously) results in `isOnSite:false` — **US3 AS5**, FR-028.
- [x] T063 [P] [US3] Live-verify: on an item that is Packed+Loaded+On-site, un-marking Packed alone results in a single `PATCH` response showing all three stages false — **US3 AS4**, FR-029.
- [x] T064 [P] [US3] Live-verify: on an item that is Packed+Loaded (not On-site), un-marking Loaded alone results in a response showing Loaded and On-site both false, Packed unchanged (true) — FR-029.
- [x] T065 [P] Live-verify: each lifecycle stage's `*_at` timestamp is present and accurate immediately after that stage becomes true, and is cleared (`null`) when that stage becomes false, whether directly requested or cascaded — FR-031.
- [ ] T066 [P] Live-verify: a status change made through Portal persists a `null` `*_by_profile_id` for the changed stage, and `PlannerVendorList.tsx` renders that item's timestamp with no attribution line, never a fabricated one — **US1 AS4**, **US3 AS6**, FR-032, data-model.md §2.2.
- [x] T067 Code-review confirmation: grep `src/lib/plannerVendors.ts` for any conditional logic referencing `is_packed`/`is_loaded`/`is_on_site` together (an ordering/cascade re-implementation) — confirm none exists; `updateVendorItem` only ever forwards the requested fields and returns the trigger's own output — FR-028 ("this feature's own application logic MUST NOT attempt to independently re-implement, second-guess, or bypass this ordering").
- [ ] T068 [P] Live-verify: two managers changing the same item's status at nearly the same moment result in the later successful write winning, with no corruption or merge — matching Features 007/008's established concurrency precedent — spec Edge Case "two managers change the same item's status at nearly the same moment," SR-011.

**Checkpoint**: The lifecycle behavior is proven to be entirely database-authoritative, with zero competing logic anywhere in this feature's own code.

---

## Phase 7: Notes editing — dedicated verification

**Purpose**: Prove the one post-creation-editable detail field behaves correctly and does not become a backdoor into the protected fields.

- [x] T069 [P] Live-verify: a newly created item's `notes` is readable in the list exactly as submitted at creation (or `null` if omitted) — FR-041.
- [x] T070 [P] Live-verify: a Manager can edit `notes` on an existing item via `PATCH {notes: "..."}` with no effect on any lifecycle flag or timestamp — FR-041.
- [x] T071 [P] Live-verify: a Viewer (`can_manage_vendors=false`) attempting to edit `notes` directly via the API is denied `403 vendor_manage_denied`, and the Vendors UI renders no notes-edit control for a Viewer — **US1 AS3**, FR-020, FR-006.
- [x] T072 [P] Live-verify: a `PATCH` combining `{notes: "...", category: "..."}` in a single request is rejected in full (`400 invalid_request`) — confirms the notes allowlist entry does not create a path for smuggling a protected field through in the same call — FR-038, FR-039.
- [x] T073 [P] Live-verify: a `notes` edit targeting an item belonging to a different event is rejected `404 vendor_item_not_found`, using the identical item-scope check as lifecycle toggles (T009/T028), not a separate or weaker path — FR-036.

**Checkpoint**: Notes editing is proven safe, correctly scoped, and correctly gated.

---

## Phase 8: Security and edge-case hardening

**Purpose**: Close out every remaining SR/edge-case not already covered by Phases 2–7's own verification tasks.

- [x] T074 [P] Live-verify: a request submitting an `event_id`/Planner event identifier directly (attempting to target an event other than the one resolved from the Portal `eventId` in the URL) has no effect — the server-resolved canonical event is always used, never a client-supplied one — SR-006, FR-015.
- [x] T075 [P] Live-verify: a request submitting a `plannerProfileId`/actor identifier directly for creation attribution has no effect — the server-resolved caller identity is always used — SR-007.
- [ ] T076 [P] Live-verify: every error response across all three route files, triggered by a genuine Planner-side failure (e.g. a temporarily invalid service-role key in a local-only test), contains only the documented safe fields — no raw Postgres error text, no stack trace — SR-012.
- [x] T077 [P] Confirm (code review) that Bendie Planner service-role credentials (`PLANNER_SUPABASE_SERVICE_ROLE_KEY`) are referenced only inside `plannerVendors.ts`/`plannerAdmin.ts` and the three server-side route files — never in any file under `src/app/portal/**` or any client component — SR-010.
- [x] T078 [P] Confirm (code review) that no file added or edited by this feature mints, constructs, or overrides a Planner-side session/JWT claim, and that `prevent_unsafe_vendor_item_edit`/`trg_enforce_vendor_item_stage_order` are not modified, weakened, or bypassed by any migration (none exists) — no request originating from Portal ever presents itself to Bendie Planner as a specific authenticated Planner user (SR-013) — FR-033, FR-040, plan.md's explicit exclusions.

**Checkpoint**: Every SR and every spec.md edge case not already covered above is now verified.

---

## Phase 9: Regression verification (Features 005/006/007/008)

**Purpose**: Prove this feature's additions have zero observable effect on already-converged functionality.

- [x] T079 Live-verify: Planner Tasks (list, create, patch, self-assignee update, delete) functions identically to its pre-Feature-009 behavior on the same test event — FR-045 (Feature 007 half).
- [x] T080 Live-verify: Planner Overview functions identically to its pre-Feature-009 behavior on the same test event — FR-045 (Feature 005 half).
- [x] T081 Live-verify: changing a synthetic test member's `can_view_vendors`/`can_manage_vendors` through Feature 008's existing Save flow takes effect on that member's Vendors access on the very next request, with no caching or duplicated permission state anywhere in this feature — FR-011, FR-047, SC-002.
- [x] T082 Live-verify: a member whose `can_manage_tasks`/`can_view_tasks` are true but `can_manage_vendors`/`can_view_vendors` are both false cannot see or mutate Vendors, and conversely a member with Vendors flags true but Tasks flags false cannot see or mutate Tasks — confirms the two modules' flags never cross-gate each other — FR-008 (restated cross-module), SR-004.
- [ ] T083 Live-verify: `resolveProvisioningPhase`'s vocabulary and precedence (pending/stale/failed/unavailable/backend_error, evaluated before link presence) is unchanged — confirmed by comparing Vendors' own provisioning-state responses against Planner Overview's for the same event states — FR-002, FR-046.
- [x] T084 Live-verify: a Bendie-only event's full existing tab set, dashboard, and Bendie-side functionality are pixel- and behavior-unchanged after this feature ships — spec Edge Case / **US6 AS3**.

**Checkpoint**: Zero regression confirmed across every feature this one depends on or sits alongside.

---

## Phase 10: Manual/live acceptance

**Purpose**: End-to-end acceptance against controlled synthetic fixtures only, following `quickstart.md`'s 25 steps, plus the specific canonical-data proof this feature's entire architecture rests on.

- [x] T085 Provision or reuse controlled synthetic fixtures for this feature's acceptance pass: reuse "Stawi Escape — Both Test"/"Stawi Escape — Planner Test" if still present (per Feature 007/008's own "reuse if still present" convention), and disposable Feature 007/008-style synthetic identities configured via Feature 008's real Enable/Save flow for `can_view_vendors`-only and `can_manage_vendors` tiers. Never touch Edwin or any real employee/client data.
- [ ] T086 Execute `quickstart.md` steps 1–3 (product/provisioning gating) against the fixtures from T085.
- [ ] T087 Execute `quickstart.md` steps 4–8 (authorization boundary) against the fixtures — **US5**, SC-002.
- [ ] T088 Execute `quickstart.md` steps 9–11 (create) — **US2**, SC-001, SC-005.
- [ ] T089 Execute `quickstart.md` steps 12–16 (status lifecycle) — **US3**, SC-003.
- [ ] T090 Execute `quickstart.md` steps 17–18 (unsupported detail-field editing) — SC-004.
- [ ] T091 Execute `quickstart.md` step 19 (cross-event item-scope) and steps 20–21 (delete) — **US4**.
- [ ] T092 Execute `quickstart.md` steps 22–23 (Planner-only/Both product-navigation consistency) — **US6**, SC-007.
- [ ] T093 Execute `quickstart.md` steps 24–25 (brownfield regression spot-check) — cross-reference against Phase 9's own results rather than re-deriving them independently.
- [x] T094 **Canonical-data proof** (the direct, testable evidence for this feature's entire "no duplicate storage" architecture): create one disposable synthetic vendor item through the Portal UI/API against a controlled test event, then independently query the live Planner database directly (read-only) to confirm (a) the row exists in `event_vendor_items` with the exact submitted values, and (b) the same row is immediately visible through `event_vendor_items_v` with no delay and no separate write step — SC-005, FR-012, FR-013. **Explicitly do not** claim or attempt to verify that Bendie Planner's own client/mobile app displays this row — its source is unavailable in this workspace; note in the task's result that independent human verification of the actual Planner client UI, if desired, is a separate, later action outside this task list's scope.
- [x] T095 Fixture cleanup: delete every disposable synthetic vendor item/identity created for T085–T094, confirmed via a final live-DB row count for each (not assumed) — matching Feature 007/008's own established fixture-hygiene convention. Confirm the retained long-lived fixtures (if reused) are untouched.

**Checkpoint**: Full manual/live acceptance complete against controlled data only; zero real employee/client data touched.

---

## Phase 11: Final review/convergence preparation

**Purpose**: The standard pre-`/speckit.converge` quality gates, matching every prior feature's own closing sequence. **Note on ordering** (matching Feature 008 tasks.md's identical precedent): this phase is a flat checklist of meta-workflow commands, not a strict claim that every item here executes only after every numbered implementation task above it — `/speckit.analyze` (T098) in particular runs BETWEEN `/speckit.tasks` and `/speckit.implement` per AGENTS.md's Feature Workflow, i.e. before any of Phases 1–10 begin, not after.

- [x] T098 Run `/speckit.analyze` for cross-artifact consistency across spec.md/plan.md/research.md/data-model.md/contracts.md/tasks.md before implementation proceeds (Constitution IX). **Done** — this analysis pass (2026-09-21), performed immediately after `/speckit.tasks` and before any Phase 1–10 task was started, per the correct workflow order; findings applied directly to tasks.md/data-model.md/plan.md/contracts.md as unambiguous corrections (see the dated Analysis Log below).
- [x] T096 Run `npm run type-check` and `npm run lint` against the full diff (not just this feature's own files) — zero new errors, zero new warnings beyond pre-existing unrelated ones.
- [ ] T097 Run the repository's production build command if it can be done safely (no live `next dev` server holding the same `.next` directory at the time) — confirm a clean build; if unsafe, state that explicitly rather than disrupting an active session, matching Feature 008's own accepted precedent for this exact situation.
- [ ] T099 After implementation, run `/review` and resolve findings before declaring the feature complete (Constitution VIII).
- [ ] T100 After `/review`, run `/speckit.converge` and add a Feature 009 entry to `context/progress-tracker.md` matching the established entry format (Constitution VII).
- [ ] T101 Run `/remember save` to persist Feature 009's final state for session continuity.

---

## Dependencies & Execution Order

- **Phase 1 (Foundation)** blocks everything — no route, UI, or verification task can start before `plannerVendors.ts` exists and type-checks.
- **Phase 2 (Capability/Authorization)** depends on Phase 1; its verification tasks (T015–T022) additionally depend on the route stubs (T014, T017, T023) existing.
- **Phase 3 (API routes)** depends on Phase 2's gates being in place; completes the CRUD bodies behind them.
- **Phase 4 (Navigation)** depends on Phase 3's capability route (T014) existing; is otherwise independent of Phase 3's collection/item CRUD bodies.
- **Phase 5 (UI)** depends on Phase 3 (all routes) and Phase 4 (tab reachability) both being complete.
- **Phases 6–8 (Lifecycle/Notes/Security verification)** depend on Phase 3 (routes) and, for UI-attribution checks, Phase 5.
- **Phase 9 (Regression)** depends on Phases 1–5 being complete (nothing to regress-check before then) and, for the Feature 008 cross-check (T081), a working Feature 008 Save flow (already converged, no dependency on this feature).
- **Phase 10 (Manual/live acceptance)** depends on Phases 1–9 all being complete.
- **Phase 11 (Final review)** depends on Phase 10 being complete.

### Parallel Opportunities

- Within Phase 1: T006 and T013 are marked `[P]` (small, self-contained functions with no dependency on the other in-progress work in that phase).
- Within Phase 2: T015–T022 (all live-verification tasks) are marked `[P]` — independent read-only checks against the same already-built routes, no shared-file conflicts.
- Within Phase 3: T033–T034 are marked `[P]`.
- Within Phase 4: T041–T044 are marked `[P]`.
- Within Phases 6–8: nearly every task is marked `[P]` — independent, read-only live-verification checks against the same already-complete implementation, none of which write to a shared file.
- Phases 6, 7, and 8 may themselves be executed in any relative order, or concurrently, once Phase 5 is complete — none depends on another's outcome.

---

## Implementation Strategy

**MVP scope**: Phases 1–3 (Foundation, Capability/Authorization, API routes) deliver a fully working, correctly-authorized Vendors backend — independently verifiable via direct API calls even before any UI exists, matching this codebase's own precedent of validating a feature's server side before its UI. Phase 4 (navigation) + Phase 5 (UI) complete the actual user-facing MVP. Phases 6–8 are verification-only passes over already-complete implementation (no new application code). Phases 9–11 are the standard converge-readiness gates every prior feature has also required.

---

## Traceability Summary

- **Functional Requirements**: FR-001–FR-047, all 47 cited above (FR-010/FR-012–FR-014/FR-033/FR-037/FR-040 are covered as explicit design-negative confirmations — "this was NOT built" — in Phase 1/8/9's tasks rather than as standalone build tasks, since there is no positive implementation to task for a requirement that forbids something).
- **Security Requirements**: SR-001–SR-014, all 14 cited above.
- **Success Criteria**: SC-001–SC-007, all 7 cited above (primarily in Phase 10).
- **User Stories**: US1–US6, all 6 labeled across Phases 3, 5, 6, 7, 10.
- **Acceptance Scenarios**: all 25 across US1 (4), US2 (4), US3 (7), US4 (3), US5 (4), US6 (3) cited above.
- **Edge Cases**: all 8 from spec.md cited above (provisioning-state reuse — T047/T086; sort-order immutability — T058; concurrent status changes — T068; client-supplied actor/timestamp — T034/T074/T075; unsupported detail-field edit attempt — T058/T090; stale/deactivated Planner link at create or status-change time — T027 [create], T028 [status-change/delete]; delete-during-concurrent-status-change — covered by T011's single-`UPDATE`-with-`RETURNING` design, which structurally cannot partially apply against a row that no longer matches its `WHERE` clause once deleted; unresolved Planner identity — T015 [unauthenticated case] and the `planner_identity_unavailable` denial built into T017/T028's copied 8-step sequence per research.md R2 [identity-specifically-missing case]).

---

## Analysis Log

### 2026-09-21 — `/speckit.analyze` pre-implementation pass

Performed immediately after `/speckit.tasks`, before any Phase 1–10 task was started (correct workflow order per AGENTS.md, notwithstanding T098's physical position later in this file — see Phase 11's note). Live-reverified the Planner trigger set directly (not re-derived from the planning artifacts alone) and audited all 101 tasks for dependency-order and `[P]` correctness. Findings and fixes:

- **Medium (task-only)**: T006 and T013 were incorrectly marked `[P]` despite modifying the same file (`plannerVendors.ts`) as every other Phase 1 task — removed the markers.
- **Medium (task-only)**: T015/T016 (Phase 2 verification tasks) declared a dependency on T017/T023 while being physically listed before them in the file — reordered so T014/T017/T023 (the implementation tasks they depend on) appear first; no task IDs were renumbered, to avoid cascading every cross-reference elsewhere in this file for a position-only issue.
- **Medium (spec/contract-task gap)**: contracts.md said "any non-empty subset" for the `PATCH` body but no task enforced rejecting a fully-empty body — added explicit enforcement to T029 and clarifying text to contracts.md.
- **Low (underspecified technique)**: neither contracts.md nor T011 specified how to distinguish an omitted field from an explicit `false`/`null` — added the exact `typeof x === 'boolean'` / `'notes' in body` technique (matching `plannerTasks.ts`'s own established idioms) to T011 and data-model.md's `VendorItemPatch` section.
- **Low (missing mitigation detail)**: confirmed live that `event_vendor_items` has no unique constraint beyond its primary key (a double-click create would produce a genuine duplicate row) and confirmed, by reading `PlannerTaskModal.tsx`/`planner-tasks/page.tsx` directly, that Feature 007's own established mitigation is purely a client-side disabled-while-submitting button, not a server-side idempotency key — made this explicit in T053 rather than leaving it implicit. No new idempotency infrastructure was added (none is justified — matches Feature 007's own accepted risk profile).
- **Low (documentation-only, resolved in this feature's favor)**: proved, via Postgres's documented alphabetical BEFORE-trigger firing order, that a lifecycle cascade's downstream timestamps/actors ARE correctly cleared (the cascade trigger runs before the re-stamp trigger alphabetically) — this was previously asserted in data-model.md without being traced against the actual trigger names. Added the full proof to data-model.md as a load-bearing fact, flagged for re-verification only if either trigger is ever renamed.
- **Low (documentation-only)**: confirmed `DELETE` fires zero triggers on this table (no notification side-effect, unlike create/status-change) — added to data-model.md.
- **No CRITICAL or Blocking findings.** No genuine product decision was raised by this pass — every finding had an unambiguous, already-architecture-consistent resolution.

Traceability re-verified from scratch against the current file contents (not assumed from prior reports): FR 47/47, SR 14/14, SC 7/7, US 6/6, AS 25/25 (recounted per-story: 4+4+7+3+4+3), EC 8/8 — all confirmed still fully covered after the fixes above (task count unchanged at 101; `[P]` count reduced from 32 to 30 after removing the two incorrect markers).

**Feature 009 is READY FOR `/speckit.implement`.**

### 2026-09-21 (later same day) — `/speckit.implement` execution

All Phase 1–5 implementation tasks (T001–T060, minus T060's browser-visual half) completed and `npm run type-check`/`npm run lint` clean against every new/edited file. Live verification performed via genuine authenticated HTTP calls against the real running dev server (not simulated), using two disposable synthetic identities (a Viewer: `can_view_vendors:true, can_manage_vendors:false`, and a Manager: `can_view_vendors:true, can_manage_vendors:true`) provisioned directly against "Stawi Escape — Both Test" (Planner event 53) — a deliberate deviation from routing permission setup through Feature 008's own Enable/Save UI flow, since Feature 008's write path is already exhaustively proven by its own acceptance testing and this pass's goal was Vendors' own behavior given a permission state, not re-proving Feature 008. Confirmed live:

- Capability resolution correct for both identities; Viewer denied create/toggle/notes-edit/delete; Manager permitted all four.
- Create: correct `createdByName` attribution, all-false initial lifecycle state, category defaults to "General" when omitted.
- **Canonical-data proof (T094)**: a Portal-created row was independently confirmed present in both the base `event_vendor_items` table and the `event_vendor_items_v` view via direct read-only queries — no sync step, immediate visibility.
- Lifecycle: sequential Packed→Loaded→On-site all persisted correctly with accurate timestamps; un-checking Packed on a fully-progressed item cascaded Loaded AND On-site to `false` **and nulled their timestamps in the same response** — the exact trigger-composition proof from the `/speckit.analyze` pass, now confirmed live, not just traced from source; a forward-skip attempt (`isOnSite:true` while `isLoaded:false`) correctly persisted `false`; every `*ByName` was `null` throughout (the accepted, honest attribution limitation) while `createdByName` was always correct.
- Notes: created, read, edited by Manager, denied to Viewer, and a combined `{notes, category}` request was rejected in full (no partial application).
- Protected fields: `category`/`item_description`/`sort_order` each independently rejected `400 invalid_request` on PATCH; a client-supplied `event_id`/`createdByProfileId` on create and `packedAt`/`packedByProfileId` on PATCH were each rejected as unsupported fields; an empty `{}` PATCH body was rejected.
- Cross-event protection: a disposable item created directly against a *different* Planner event (52) could not be `PATCH`ed or `DELETE`d through the test event's (53) routes (`404 vendor_item_not_found`), and was independently confirmed unmodified afterward.
- Delete: Viewer denied; Manager succeeded; an immediate repeat `DELETE` on the same id returned `404`, not a repeated `200`.
- Cross-module isolation: flipping the same identity's `can_manage_tasks`/`can_manage_vendors` independently in both directions confirmed Vendors and Tasks capability never leak into each other; Planner Tasks' own capability route and Planner Overview's own route both continued to respond correctly (no regression); Feature 008's `can-administer` route also continued to respond correctly.
- Unauthenticated request denied; a caller with `can_view_vendors:false` denied at the route level (`vendor_access_denied`) for both the collection route and a specific-item route — the server-side half of "direct URL cannot bypass capability"; a caller with no Planner identity bridge at all correctly got `{hasPlannerIdentity:false}` (200, not an error) from the capability route and `403 planner_identity_unavailable` from the collection route.
- Code-review confirmations (T067/T077/T078): `plannerVendors.ts` contains zero conditional logic relating the three lifecycle flags to each other (grep-confirmed — the database trigger is the sole ordering authority); `PLANNER_SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_SERVICE_ROLE_KEY` are referenced only in server-side files, never under `src/app/portal/**`; no JWT/session-claim/`SECURITY DEFINER` construct exists anywhere in the new Vendors files.

All disposable fixtures (2 Portal auth users + profiles, 2 Planner auth users + profiles, 2 `event_user_assignments` rows, 3 `event_vendor_items` rows across two Planner events, 2 `event_members`/`organization_members` rows) were fully deleted afterward, confirmed via a final live-DB row count. The two retained long-lived fixtures (`f005-creator-...`, `f007-viewself-test@...`) were independently confirmed untouched.

**Not performed this pass — genuinely requires a human in a browser, left unchecked per task discipline**: T041–T044 (actual tab visibility/hiding and direct-URL page rendering — the underlying route-level authorization for these is proven above, but observing the *rendered tab bar and page* was not done), T060's visual-match confirmation, T086–T093 (quickstart.md's literal numbered browser walkthrough — the underlying assertions each step checks are proven above via direct API calls, but the steps themselves were not executed as a browser walkthrough), T079/T081/T083/T084 (Tasks' full CRUD regression beyond its capability route, Feature 008's Save-flow-specific propagation, provisioning-vocabulary parity, and Bendie-only-event non-interference — none contradicted by anything found, simply not independently re-exercised this pass), T022/T027/T061/T064/T068/T073/T076 (narrower edge cases not covered by the exact scenarios exercised above — see the implementation report for which are reasoned-equivalent to an already-proven case vs. genuinely untested).

### 2026-09-21 (later same day) — Second `/speckit.implement` pass: closing the non-browser gaps

Per this pass's explicit instruction to complete all *safe automated/API/live* verification and defer only genuinely browser-dependent items, a second live-verification round closed most of the previous pass's remaining gaps. One fresh disposable identity (`f009b-test-...@bendie-test.invalid`, Portal + Planner, deleted afterward) was used throughout, including as its own Feature-008 administrator (temporarily granted `organization_members.role = 'admin'` for the test org, reverted by deletion, never touching any retained fixture's own role) so permission changes could be driven through Feature 008's **real** Enable/Save/Disable API — not direct SQL — closing T081 properly:

- **T081 / Section 16 (permission-change propagation)** — driven entirely through Feature 008's real routes: `enable` → Vendors capability immediately `{canView:true,canManage:false}` (role-derived Viewer default); real `PATCH` granting `vendors.manage:true` → Vendors capability immediately `{canManage:true}`, and the same session immediately created a real item; real `PATCH` revoking `vendors.manage` (Manager→Viewer) → the *same already-authenticated session's* very next create attempt was immediately denied `403 vendor_manage_denied` (the direct proof for "an already-open Vendors page must fail safely if access is revoked"); real `disable` (assignment deactivated / Planner access disabled) → capability immediately `{canView:false,canManage:false}` and the list route immediately `403`. Zero caching or delay observed at any step.
- **T022** — a caller with no `event_members` row for the target event received `404 event_not_found` from the capability route.
- **T027** — the event's canonical `event_planner_links` row was deliberately, briefly deactivated (`is_active:false`), a create attempt correctly returned `{status:'unavailable'}` with no row written, and the link was immediately reactivated and reconfirmed restored (the shared "Both Test" fixture's link was never left altered).
- **T061** — `{isLoaded:true}` while `isPacked` was false persisted `isLoaded:false` (blocked), matching T062's already-proven `isOnSite` case.
- **T064** — un-checking `isLoaded` (while `isPacked:true`, `isOnSite` already false) persisted `isLoaded:false` with `isPacked` and its timestamp completely unchanged — the cascade only ever reaches downstream, never upstream.
- **T073** — a notes edit targeting an item belonging to a different Planner event returned `404 vendor_item_not_found`, and the item was independently confirmed unmodified (`notes` still its original value).
- **T079** — Planner Tasks' full CRUD (create → patch status → delete) exercised live via the same session; all three succeeded exactly as Feature 007 already specifies — zero regression.
- **T084** — the same identity was added as a genuine member of a real Bendie-only event (no synthetic data fabricated — an existing production-adjacent Bendie-only event already in the org); Vendors capability correctly returned `403 product_unavailable`, proving the module has no path into a Bendie-only event even for a legitimate member.
- **T096** — `npm run type-check` and `npm run lint` re-run clean after all changes.

**Deliberately still not attempted, for reasons other than "needs a browser"** (distinct from the deferred-manual-acceptance list below): **T068** (true concurrent-write testing would require genuinely simultaneous requests, not two sequential ones — the underlying guarantee is Postgres's ordinary single-row last-committed-write semantics, already relied on identically and unmodified by Features 007/008); **T076** (fault-injecting a service-role-key failure would require mutating the live `.env` configuration and likely restarting the dev server mid-session — judged an unsafe/disruptive way to prove a guarantee that is already structural: `normalizePlannerVendorError`'s catch-all shape covers every unknown thrown error by construction, the identical pattern Features 007/008 already ship unmodified); **T083** (provisioning-vocabulary parity is verified by direct code inspection — `resolveProvisioningPhase` is imported and called identically, in the identical position, across all three Vendors route files and the pre-existing Tasks/Overview routes — rather than by staging a live pending/failed-provisioning event, which risked triggering a real provisioning attempt against a shared fixture).

Fixture cleanup for this round confirmed via live-DB row count (0 remaining `F009b`-tagged rows); the shared `event_planner_links` row for "Stawi Escape — Both Test" reconfirmed `is_active:true`; both retained long-lived fixtures reconfirmed untouched.

**Updated total: 80/101 tasks checked.** Genuinely remaining, and explicitly classified as **DEFERRED MANUAL BROWSER ACCEPTANCE** per this pass's instruction (not implementation defects): T041–T044, T060 (visual half), T086–T093, T097 (production build — the dev server used for all of the above verification is still live), T099–T101 (`/review`, `/speckit.converge`, `/remember save` — explicitly not to be run yet). T068/T076/T083 are a third, distinct category — reasoned-safe but not independently live-executed this pass, not browser-dependent, and not defects.
