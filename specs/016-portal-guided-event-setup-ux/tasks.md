# Feature 016 Tasks: Bendie Portal Guided Event Setup UX

## Phase A — Grouped navigation

- [x] T01 Add additive `group` field to `EventSectionMeta` + assign a group to all 30 sections (`src/lib/eventSectionMeta.ts`).
- [x] T02 Reorder `EVENT_SECTIONS` entries so each group's tabs are contiguous (display-order only, no behavior change).
- [x] T03 `EventLayout`: compute `groupedVisibleSections` from the existing `visibleSections`, preserving first-appearance group order.
- [x] T04 `EventLayout`: `selectedGroup` state, synced to the active tab's group on every navigation (deep link/refresh safe).
- [x] T05 `EventLayout`: render a group-pill row; filter the existing tab `<nav>` to `tabsToShow`.
- [x] T06 Fix the tab-strip scroll-affordance effect to recompute when the visible subset changes (`tabsToShow` added as a dependency).
- [x] T07 `type-check`/`lint` clean.

## Phase B — Dashboard command centre

- [x] T08 Fix pre-existing crash: add the 5 missing `SECTION_CHECKS` entries (`planner-vendors`/`planner-checklist`/`planner-people`/`planner-logistics`/`planner-production`).
- [x] T09 Verify (script-level) every `EVENT_SECTIONS` key has a `SECTION_CHECKS` entry — 30/30 confirmed.
- [x] T10 `nextBendieSection` — deterministic first-incomplete-scored-section logic.
- [x] T11 `plannerRecommendation` — deterministic, dependency-ordered Planner next-action logic.
- [x] T12 "Recommended next" callout rendered above the existing section grid.
- [x] T13 `isPlannerApplicable()` helper (existing-data-only signal, no new fetch).
- [x] T14 Fetch + shape 8 existing Planner GET endpoints into `PlannerCounts`, each field independently nullable on failure (`extractArray` helper).
- [x] T15 "Bendie Planner Readiness" card grid (People/Flights/Hotels/Ground Transport/Tasks/Vendors/Checklist/Production), each card linking to its real tab with `?product=planner`.
- [x] T16 `type-check`/`lint` clean.

## Phase C — Save & Add Another + empty states

- [x] T17 `PlannerVendorModal`: `onSubmit(values, keepOpen)` signature + "Save & Add Another" button.
- [x] T18 `planner-vendors/page.tsx`: `handleCreate` honors `keepOpen`; `modalResetKey` remount pattern.
- [x] T19 Empty-state CTAs (Add + Import CSV) — Vendors.
- [x] T20 Empty-state CTAs — Checklist.
- [x] T21 Empty-state CTAs — People (with the explicit Logistics-dependency line).
- [x] T22 Empty-state CTAs — Flights.
- [x] T23 Empty-state CTAs — Hotels.
- [x] T24 Empty-state CTA (Add Movement only, honest "no CSV" note) — Ground Transport.
- [x] T25 Empty-state CTAs — Production.
- [x] T26 Empty-state CTA (Add only, honest "no CSV" note) — Tasks.
- [x] T27 `type-check`/`lint` clean across all 8 list components + 6 page files touched.

## Status after continuation pass 2 (superseding the block below — see per-item notes)

- [x] T28 Replicate Save & Add Another to Checklist — **done**, with category/day/date/owner context preservation.
- [x] T29 Replicate Save & Add Another to People — **done** ("New person" path only, full reset per the brief's own instruction; "Search existing" and edit never show the button).
- [x] T30 Replicate Save & Add Another to Flights — **done**, preserves the selected participant.
- [x] T31 Replicate Save & Add Another to Hotels — **done**, preserves the selected participant.
- [x] T32 Replicate Save & Add Another to Tasks — **done**, preserves category only (deliberately not assignee — see plan.md rationale).
- [x] T33 Replicate Save & Add Another to Production — **done**, preserves date/day/track/room.
- [~] T34 Phase D — person-centric Logistics readiness view on the People tab — **partially done**: a Logistics column (Flights/Hotel/Transport status) plus deep-link contextual actions now exist on the People list, built from 3 aggregate fetches (no N+1). Not done: any richer participant-detail drawer/expand beyond the compact column.
- [~] T35 Phase E — composite Ground Transport workflow — **partially done**: Movement→Vehicle→Assign now auto-chains with guiding toasts, and Assign is multi-select (existing RPC called once per passenger, partial failure reported by name). Not done: a single orchestrated panel/drawer replacing the three separate modals — the continuity is achieved by auto-opening the next modal, not by merging them into one surface.
- [x] T36 Phase F — Production form progressive disclosure — **done**: 5 sections, Advanced collapsed on create / auto-expanded on edit when populated, zero validation/write changes.
- [~] T37 Phase G — Team & Access discoverability — **partially done**: a card on Planner Overview explains where access is managed and links to Members when the caller can administer it. Not done: any "who currently has access" roster (would require an N+1 fetch across org members — not attempted, disclosed as a real gap, not silently skipped).
- [ ] T38 Phase H — dedicated Review & Readiness page/tab — **still deferred**. The Dashboard's existing Planner Readiness grid (Phase B) now deep-links each card to its exact Logistics sub-tab via `?view=`, which covers the "click an issue → go directly to the relevant module" ask (§12) without a second readiness engine — but no separate page/tab was built.
- [~] T39 Phase I — responsive collapse for multi-column create-form grids; mobile card view for wide tables — **partially done**: every remaining `grid-cols-2`/`grid-cols-3` in all 9 Planner create/edit modals now collapses to 1 column below `sm`. Not done: the table→card rewrite for Flights/Hotels/Production on narrow screens — those tables still rely on horizontal scroll.
- [ ] T40 Browser/manual click-through verification — **still not performed**. Confirmed this pass, explicitly, that no browser-automation or screenshot tool exists in this environment (`ToolSearch` returned nothing; `WebFetch` cannot reach `localhost`). This is a genuine, disclosed limitation, not an oversight.

## Original deferred list (pass 1) — kept for history, see status block above for what changed

- [x] T28 Replicate Save & Add Another to Checklist.
- [x] T29 Replicate Save & Add Another to People (+ context preservation: keep the same person selected for a second record where that's the safe default — e.g. Flights/Hotels, not People itself).
- [x] T30 Replicate Save & Add Another to Flights (+ preserve the selected participant for "add the return leg").
- [x] T31 Replicate Save & Add Another to Hotels (+ preserve the selected participant).
- [x] T32 Replicate Save & Add Another to Tasks.
- [x] T33 Replicate Save & Add Another to Production.
- [~] T34 Phase D — person-centric Logistics readiness view on the People tab.
- [~] T35 Phase E — composite Ground Transport workflow (Movement→Vehicles→Assignments in one guided flow).
- [x] T36 Phase F — Production form progressive disclosure (grouped sections, Advanced collapsed by default).
- [~] T37 Phase G — Team & Access discoverability widget inside the Planner workspace.
- [ ] T38 Phase H — dedicated Review & Readiness page/tab.
- [~] T39 Phase I — responsive collapse for multi-column create-form grids; mobile card view for wide tables.
- [ ] T40 Browser/manual click-through verification of everything shipped in Phases A/B/C (Bendie-only, Planner-only, Both-product events; desktop + mobile viewport).

## Continuation pass 2 — new tasks

- [x] T48 Ground Transport multi-passenger assignment: checkbox multi-select in `PlannerAssignPassengerModal`, `handleAssignSubmit` fans out to the existing single-assign endpoint via `Promise.allSettled`, partial-failure names surfaced back into the modal.
- [x] T49 Ground Transport workflow chaining: Movement-create → auto-open Add Vehicle; Vehicle-create → auto-open Assign, each with a guiding toast.
- [x] T50 People page: 3-endpoint aggregate fetch (Flights/Hotels/Ground Transport movements) correlated by `passengerId` into a `Map`, exposed as a new Logistics column.
- [x] T51 People list: contextual "Add Flight"/"Add Hotel"/"Transport" deep-links with participant preselection.
- [x] T52 Logistics page: `?participant=` deep-link consumption — opens the matching modal preselected, then strips the param.
- [x] T53 Logistics page: `?view=` URL-backed sub-tab state (replaces plain `useState`), safe fallback to `flights` on invalid/missing values.
- [x] T54 Logistics page: truthful summary strip (Participants/Flights/Accommodation/Ground Transport) computed from already-fetched data, each stat double-acting as sub-tab navigation.
- [x] T55 Planner Overview: Team & Access card, reusing the existing `can-administer` endpoint.
- [x] T56 Dashboard: Planner Readiness Logistics cards now deep-link to the exact sub-tab (`&view=`) instead of defaulting to Flights.
- [x] T57 Responsive: `grid-cols-2`/`grid-cols-3` → `grid-cols-1 sm:grid-cols-*` in Vendors/Checklist/People/Flights/Hotels/Movement/Vehicle modals (Tasks/Production covered by their own Save & Add Another edits in this pass).
- [x] T58 `npm run type-check` clean after every batch this pass.
- [x] T59 `npm run lint` clean (zero new warnings, confirmed by grepping the full output for every touched filename) after every batch this pass.
- [ ] T60 `npm run build` — not run; dev server continuously active, per established precedent.
- [ ] T61 Live HTTP smoke test (Feature-015-style, disposable fixtures) of the new multi-assign/People-hub/workflow-chaining logic — not performed this pass, disclosed as a real verification gap alongside T40's browser-verification gap.

## Quality gate

- [x] T41 `npm run type-check` clean after every phase.
- [x] T42 `npm run lint` clean (zero new warnings) after every phase.
- [ ] T43 `npm run build` — not run; the shared dev server has been continuously active throughout this session, per established precedent from every prior feature in this repo.

## Regression (code-level reasoning only — see Deferred T40 for the browser pass)

- [x] T44 Confirmed every `<Link href>` in the modified `EventLayout` tab strip is byte-identical to its pre-Phase-A form (same `basePath`/`effectiveTabProduct` construction) — grouping only changes which are rendered, never their target.
- [x] T45 Confirmed `isSectionAvailable` (capability/product gating) was not touched by Phase A — grouping is a pure display filter applied *after* availability filtering, never a replacement for it.
- [x] T46 Confirmed the Dashboard's new Planner Readiness fetches use `fetch()` with default same-origin credentials, identical to every existing Planner page's own fetch calls — no new auth mechanism, and a Viewer/denied caller gets the same 403 each underlying endpoint already returns (surfaced here as "Not available," never bypassed).
- [x] T47 Confirmed Vendors' "Add Item" (original, non-keepOpen) path is unchanged byte-for-byte in its request payload and close/refetch behavior — only a new sibling button was added.

## Continuation pass 3 — Navigation Hierarchy & Dashboard Simplification

- [x] T62 Sidebar: fix "Events" never highlighting inside an event workspace (`OrgSideNav.tsx`, `isActive('/portal/events')` now also matches `/portal/events/`-prefixed routes).
- [x] T63 Sidebar: tighten the generic fallback from `startsWith` to exact match for People/Assets/Teams/Activity Log/Settings (none has nested children; removes a theoretical false-positive class entirely).
- [x] T64 Top bar: remove the redundant event-name segment from the breadcrumb on event-workspace routes; drop the now-unused `currentEvent`/`canAccessWorkspace`/`workspaceAccessChecked`/`eventLoading` destructure from `TopHeader.tsx`.
- [x] T65 Confirmed organisation selector, product selector, `CreateOrganizationModal` reuse, search, notifications, settings link, and global Create button are all unchanged.
- [x] T66 **Confirmed bug fix**: group pills are no longer independent React state — deleted `selectedGroup`/its sync effect; `currentGroupKey` is purely derived from `activeSection.group`.
- [x] T67 Group pills converted from buttons to real `<Link>`s targeting each group's first section (or the product-context-matching section, for the one merged Bendie/Planner "Overview" pill).
- [x] T68 Horizontal-scroll affordance (chevrons) added to the group-pill row, mirroring the pre-existing child-tab-row pattern.
- [x] T69 Both-event product separation: subtle divider + faint orange tint distinguishing Planner group pills from Bendie ones at rest.
- [x] T70 Child-tab active-state clarity: added a subtle background tint alongside the existing colored underline/bold treatment.
- [x] T71 Suppress the floating "Next" button specifically on the Dashboard tab (Recommended Next already covers it there); left unchanged on every other tab.
- [x] T72 Source-level trace confirming the Logistics page's own `?view=` sub-tab layer (built in pass 2) correctly composes with the group/child-tab layer above it — no code change needed, verified as already correct.
- [x] T73 Dashboard: replaced the 25+-card flat section grid with 5 Bendie setup-area cards + 1 Bendie Planner card, reusing the exact same per-section `SECTION_CHECKS` completion truth, aggregated per area.
- [x] T74 Dashboard: condensed the 8-card "Bendie Planner Readiness" grid into a compact list panel with the same links/values plus a "View Planner details" entry point.
- [x] T75 `npm run type-check` clean after every batch this pass.
- [x] T76 `npm run lint` clean (zero new warnings, grepped for every touched filename) after every batch this pass.
- [x] T77 Source-level verification of all 14 route/navigation scenarios from the brief's §21 and all 7 sidebar routes from §22 — traced against the actual rewritten logic (not executed in a browser).
- [ ] T78 Actual browser rendering/click verification — still not performed; no browser-automation tool available in this environment (same disclosed gap as passes 1/2).
- [ ] T79 Responsive table→card rewrite (Flights/Hotels/Production) — still deferred, unchanged from pass 2.
- [ ] T80 Dedicated Review & Readiness page/tab — still deferred, unchanged from pass 2 (the Dashboard's condensed Planner Readiness panel remains a lighter-weight partial step toward this, not the full page).

## Continuation pass 4 — Global Header Redesign, Organisation Isolation & Event Status Audit

- [x] T81 Organisation access audit: verified `getAccessibleOrganizations()` client-side scoping and live Supabase RLS (`organizations_select_member`, `organization_members_select_org_member`, admin-bypass policies) via read-only `mcp__supabase__execute_sql` queries against the Portal project — **no security bug found**.
- [x] T82 Organisation creation gating audit: confirmed both client-side (`isGlobalAdmin` in `TopHeader.tsx`) and server-side (`organizations_insert_creator` RLS, platform-admin-only) enforcement — no change needed, both already correct.
- [x] T83 Header redesign: removed the entire "Organisations > Org > Product > Page" breadcrumb (arrows, repeated labels, page-name segment) per the approved mockup.
- [x] T84 Organisation selector: compact pill, real dropdown only when `organizations.length > 1`, plain static label otherwise; "New Organisation" reachable only for `isGlobalAdmin` in both cases.
- [x] T85 Product switcher: two-segment control when both products entitled, plain static label when only one — entitlement source, `?product=` semantics, and `resolveProductSwitchDestination` all unchanged.
- [x] T86 Confirmed Create button, search, notifications, settings link, and profile menu are all byte-identical in behavior — only spacing adjusted.
- [x] T87 Responsive: organisation pill always visible (truncating); product segmented control desktop-only with an icon-triggered mobile fallback, shown only when there's a real choice to make.
- [x] T88 Event status audit: documented the current `events.status` model (5-value manual enum, live-verified via `information_schema`/`pg_constraint`) and every place status/lifecycle was derived or displayed across the codebase.
- [x] T89 **Confirmed bug**: a `published` (and, found during live verification, also `active`) event whose dates had passed but whose `status` was never manually updated became invisible from both "Upcoming" and "Live" everywhere, stuck under "All" with a stale label.
- [x] T90 New canonical `src/lib/eventLifecycle.ts` (`deriveEventLifecycle`) — single shared derivation, replacing the duplicated compound logic in `EventsOverviewPanel.tsx` and `OrganizationHome.tsx`.
- [x] T91 Wired the shared helper into `EventsOverviewPanel.tsx` (tabs + pill), `OrganizationHome.tsx` (metric counts + attention-scan filter), and `EventLayout.tsx` (workspace status pill) — same derivation everywhere status is shown, closing the exact "Live on Overview but Published on Events" inconsistency the brief named.
- [x] T92 Live, read-only verification against real production events (Portal Supabase project, `SELECT`-only) — 7-event before/after table plus a 30-row staleness scan confirming the bug's real-world prevalence; documented in plan.md.
- [x] T93 Overview greeting copy simplified (`OrganizationHome.tsx`) — no longer repeats the product name now that the header's segmented control shows it visually.
- [x] T94 `npm run type-check` clean after every batch this pass.
- [x] T95 `npm run lint` clean (zero new warnings) after every batch this pass.
- [x] T96 Confirmed via `git status` that zero files under `src/app/api/` were touched — no backend/API/schema change of any kind this pass.
- [ ] T97 Actual browser rendering/click verification of the new header — still not performed; no browser-automation tool available in this environment (same disclosed gap as every prior pass).

## Continuation pass 5 — Activity Log Simplification + People/Teams/Event Access Discovery

- [x] T98 Live-verified real `diff` shapes for INSERT/UPDATE/DELETE across both audit tables via read-only `SELECT` before designing the presentation layer.
- [x] T99 New shared `src/lib/activityPresentation.ts` — `friendlyArea`, `describeAction`, `extractHeadline`, subject-id extraction/resolution, `summarizeChanges` — one module for both Activity Log pages.
- [x] T100 Rewrote `src/app/portal/activity-log/page.tsx` to use the shared module — human action line, optional headline, friendly area + date, human "Changes" list by default.
- [x] T101 Rewrote `src/app/portal/events/[eventId]/activity-log/page.tsx` identically.
- [x] T102 Subject-name resolution: one batch `profiles` lookup per page load (not per-row) for `event_members`/`organization_members`/`team_members`, enabling "removed John Kamau from the event" instead of a raw UUID.
- [x] T103 Raw JSON demoted to a nested "Technical details" disclosure, collapsed by default, gated to `isGlobalAdmin` (existing flag, no new permission concept invented).
- [x] T104 Filters renamed: "All Tables" → "All Areas" (friendly labels, raw values preserved for querying); "Insert/Update/Delete" → "Added/Updated/Removed".
- [x] T105 Manually traced INSERT, UPDATE, and DELETE presentation against real captured rows (documented in plan.md) — confirmed correct output for each.
- [x] T106 Confirmed the unmapped-table/action fallback never breaks (generic "{Verb} {area}" phrase, never a raw INSERT/UPDATE/DELETE token as primary text).
- [x] T107 `npm run type-check` clean.
- [x] T108 `npm run lint` clean (zero new warnings).
- [x] T109 People/Teams/Event Members/Access model discovery — delegated to a background research agent, read-only, no code/schema changes; findings consolidated into the final chat report (not this file, to avoid drift between two copies of the same findings).
- [ ] T110 Browser/visual verification of the Activity Log redesign — still not performed; no browser-automation tool available in this environment.
- [x] T111 People/Teams/Members/Access **redesign implementation** — implemented this pass (see Continuation pass 6 below), superseding this item's original "not yet" status.

## Continuation pass 6 — Event Team Foundation Fix + Unified People Assignment

- [x] T112 Teams RLS fix: 8 new organisation-scoped policies on `teams`/`team_members`, additive alongside existing global-admin policies (migration `teams_org_admin_rls`).
- [x] T113 `event_members` DELETE RLS fix: `event_members_delete_host_or_organizer`, mirroring the existing UPDATE policy's host/organizer half (migration `event_members_manager_delete_rls`).
- [x] T114 Live boolean-expression verification of both fixes against real multi-organisation admin data (cross-org denial, cross-event denial, non-manager denial) — documented in plan.md.
- [x] T115 New shared `src/lib/eventTeamProvisioning.ts` — single provisioning service (Event Role + independent Bendie/Planner product access) replacing four previously-divergent hardcoded-`attendee` implementations.
- [x] T116 Planner access in the new flow reuses Feature 008's existing `enable`/`PATCH` routes verbatim — no second permissions implementation; both independently re-verify `canAdministerPlannerPermissions` server-side.
- [x] T117 Event Team page (`members/page.tsx`) terminology renamed throughout ("Members" → "Event Team"); route path and `key` unchanged.
- [x] T118 Unified `+ Add People ▾` menu (`AddPeopleMenu.tsx`) — From organisation, From team, Invite new, Import CSV, Add all (deliberately last/secondary).
- [x] T119 `AddPeopleModal.tsx` — From organisation (multi-select) and Invite new (email/name), sharing one config step.
- [x] T120 `AddFromTeamModal.tsx` — team preview with already-in-event exclusion and individual deselection, never a blind whole-team insert.
- [x] T121 `AddAllOrgPeopleModal.tsx` — shows total/already-in-event/will-add counts and the shared config step before any write.
- [x] T122 `EventAccessConfigFields.tsx` — Event Role and Product Access visually separated into two sections; Planner control replaced with explanatory text (not a toggle) when the caller cannot administer Planner permissions.
- [x] T123 Event Team list redesigned: Person / Event Role / Products / Onboarding / Actions columns; "Remove" action added (now functional thanks to T113).
- [x] T124 People page (`EventAssignmentsDropdown.tsx`) "add" path now opens an inline Event Role + Bendie-access picker and calls the same shared `addPersonToEvent` function, replacing the old instant hardcoded-`attendee` insert.
- [x] T125 Teams page gains a client-side `is_organization_admin` check so management controls are only shown to people who can actually use them post-RLS-fix; copy updated.
- [x] T126 CSV (`Import Event Team`) extended with two optional, backward-compatible columns (`bendieAccess`, `plannerAccess`); routes through the same shared service as every other entry point. `csvImport.ts`/`CsvImportModal.tsx` (Feature 015) unchanged.
- [x] T127 `npm run type-check` clean.
- [x] T128 `npm run lint` clean (no new warning categories).
- [x] T129 Regression spot-check via source-reading: Planner Tasks/Vendors/Checklist/People/Logistics/Production, Feature 008, Feature 015 CSV core, Activity Log all confirmed untouched (`git status`).
- [x] T130 Confirmed via `git status` that zero files under `src/app/api/` were created or modified — every Planner-access call reuses existing Feature 008/006 routes.
- [ ] T131 Browser/visual verification — still not performed; no browser-automation tool available in this environment.
- [ ] T132 Full session-level RLS behavioral impersonation test — not performed (see plan.md for why; the boolean-expression proof is the accepted safe substitute, precedented by Feature 008's convergence pass).
- [ ] T133 Live Planner-access batch status display on the Event Team list ("Products" column shows static Bendie eligibility + a Planner link, not live per-row Planner status) — deferred; would require a new batch-read endpoint against `event_user_assignments` not currently exposed.
- [ ] T134 Read-only "view members" affordance for non-admin organisation members on the Teams page (RLS already allows the SELECT; no UI surfaces it) — deferred, disclosed minor UX gap.

## Continuation pass 7 — Attendees / Participants Person-Journey Clarification

- [x] T135 Stage 1 discovery: traced Bendie Attendees, Planner Participants (`passengers`/`event_passengers`), Event Team, and Planner Staff/Permissions models against actual source (`plannerPeople.ts`, `planner-pull-travel/route.ts`, `context/planner-backend-coverage-audit.md`) — see plan.md for the full trace and person-type matrix.
- [x] T136 Confirmed (not assumed): "Bendie Attendees" is not a separate table — it is `event_members` itself (the same model as Event Team), and "Attendees" is currently a group label around the Event Team tab, not a distinct page.
- [x] T137 Confirmed the existing, twice-precedented exact-email matching rule (Feature 001's travel pull, Feature 015's Planner People CSV importer) is architecturally sufficient for a "From Bendie Attendees"/"From Organisation" reuse flow — no new stable cross-model ID exists or was needed.
- [x] T138 Decision gate (Part O): architecture clearly supports the preferred UX with zero schema changes and zero new API routes — proceeded without AskUserQuestion.
- [x] T139 New shared `src/lib/plannerParticipantMatching.ts` (`matchOrCreateParticipant`) — the one exact-email match-then-link-else-create rule, reusing only Feature 011's existing `/planner-people`, `/planner-people/search`, `/planner-people/link` routes.
- [x] T140 Refactored `planner-people/page.tsx`'s CSV `importPersonRow` (Feature 015) to call the new shared matcher for the common case (no passport/dietary/gender fields) — identical behavior, no duplicated logic.
- [x] T141 New `AddParticipantMenu.tsx` — From Bendie Attendees (only when the event has the Bendie product) / From organisation / Add new participant / Import CSV.
- [x] T142 New `AddParticipantFromPortalModal.tsx` — multi-select picker over Event Team (attendees source) or organisation people (organisation source), excludes/marks already-linked participants by exact email, calls the shared matcher per selection, reports per-person outcome.
- [x] T143 `eventSectionMeta.ts`: `planner-people` entry relabeled "People" → "Participants" (label, desc, and group) — cosmetic only, `key`/route unchanged.
- [x] T144 Cross-product status indicator (Part K): a "Bendie Attendee" badge on a Participant row, shown only on an exact lowercased-email match against the event's own `event_members`, `undefined` (not yet loaded) renders no badge — never inferred from name.
- [x] T145 Explanatory copy added/updated on both the Event Team page and the Participants page distinguishing Event Team / Attendees / Participants (Part I).
- [x] T146 Visual cleanup: Event Team role duplication (`[ Staff ] [ staff ▾ ]`) collapsed into one editable colored-pill `<select>`; the Person-column pencil icon was inspected and retained (it opens `EditProfileModal` for profile fields, not role — a different edit entirely).
- [x] T147 Visual cleanup: organisation selector's hard `max-w-[220px]` cap widened to `max-w-[360px]` (both the dropdown-button and static-label variants) so a name like "Bendie Planner Sample" displays fully at normal desktop widths; `truncate` kept as a safety net for genuinely long names.
- [x] T148 Visual cleanup: confirmed Activity Log's raw/technical-details disclosure is still gated to `isGlobalAdmin` only (unchanged from the prior pass) — organisation admins see only the human-readable view.
- [ ] T149 Visual cleanup: "Planner…" product-label truncation — searched `TopHeader.tsx`/`OrganizationEventsList.tsx`/`EventLayout.tsx`/`OrgSideNav.tsx` for a truncating product-label site and found none beyond the organisation-selector width issue already fixed in T147; deferred pending a concrete repro (e.g. a screenshot) since no further site could be located from source alone.
- [x] T150 `npm run type-check` clean.
- [x] T151 `npm run lint` clean — identical file list to the pre-pass baseline, zero new warning categories.
- [x] T152 Confirmed via `git status` that zero files under `src/app/api/` or `supabase/migrations/` were created or modified this pass — every Participant-add flow reuses Feature 011's existing routes exclusively.
- [ ] T153 Browser/visual verification — not performed; no browser-automation tool available in this environment.

## Continuation pass 8 — Portal UX Cleanup, Identity Clarity & Navigation Polish

- [x] T154 Planner Participants navigation-stability investigation: traced EventLayout's capability/redirect state machine end-to-end against the reported "crashes and falls back to Overview" symptom; found the state machine itself structurally sound (matches every other shipped Planner module) but found and fixed two genuine, concrete defects in the Participants-specific code added last pass.
- [x] T155 Fixed a real stuck-loading bug: `AddParticipantFromPortalModal`'s candidate-fetch effect had no error handling and no staleness guard — a query failure left the modal spinning forever with no recovery path. Now has a `cancelled` guard and a `loadError` state.
- [x] T156 Fixed the same missing-error-handling gap in `planner-people/page.tsx`'s two Feature-016-added effects (product context, Bendie-attendee-email cross-reference) — both now fail closed/degrade gracefully instead of leaving an unhandled promise rejection.
- [x] T157 Found and fixed a real, confirmed navigation bug: `EventLayout`'s group-pill href builder used the CURRENTLY active tab's product signal for every group's `?product=` query param, including single-product groups (e.g. "Participants") — clicking "Participants" from a Bendie tab produced `planner-people?product=bendie`, a self-contradictory signal that visibly showed the wrong active product in the header's segmented control immediately after navigating.
- [x] T158 Added defense-in-depth hardening to `EventLayout`'s mismatch-redirect effect: a section whose own module-specific capability check has already confirmed real access is now never redirected away from, regardless of what the coarser event-level product-availability snapshot says at that render — closes the entire class of "transient disagreement" redirect bugs even without isolating one single exact trigger through static reading alone.
- [x] T159 Locked terminology recorded in spec.md: Organisation People / Bendie Attendees & Access (`event_members`) / Planner Participants (`passengers`+`event_passengers`) / Planner Team & Access (`event_user_assignments`) — independent concepts, no merge.
- [x] T160 Renamed "Event Team" → "Attendees & Access" (`eventSectionMeta.ts`'s `members` entry — label/desc only, route `key` unchanged) and updated every user-visible copy string referencing the old name (toast, access-denied copy, CSV modal title, hint text, Teams-page cross-references, Planner Overview's "Team & Access" card copy).
- [x] T161 Audited and fixed remaining user-visible "People" labels specific to the Planner participant model: Dashboard's Planner Readiness card ("People" → "Participants" — the actual source of the reported stale screenshot, missed by the previous pass because it lives outside `eventSectionMeta.ts`). Confirmed Organisation People (`/portal/people`, `OrgSideNav.tsx`) deliberately left untouched — a distinct, legitimate concept.
- [x] T162 Fixed the misleading Products column on Attendees & Access: the "Planner…" pill looked like a live status badge but was only ever a management-action shortcut, never reflecting the target person's real Planner access state. Renamed the column "Bendie Access", removed the fabricated Planner pill, and moved the action (relabeled "Team & Access") into the Actions column where it reads as an action, not a status. No new endpoint/N+1 pattern introduced.
- [x] T163 Cleaned up duplicate empty-state actions on Planner Participants: the header's "+ Add Participant" menu and the empty state's own actions were both visible simultaneously at zero participants. The menu element is now shared (rendered once, in whichever location applies) — header when participants exist, empty state when they don't.
- [x] T164 Rewrote Attendees & Access and Planner Participants page copy to concise, non-technical product language, replacing the previous pass's architecture-explaining paragraph.
- [x] T165 Verified Event Role duplicate-control cleanup (single colored-pill `<select>`) from the prior pass is still correctly in place across all 7 roles — no regression, no further change needed.
- [x] T166 Verified Activity Log's raw/technical-details disclosure is still gated to `isGlobalAdmin` only — no change needed.
- [x] T167 Organisation selector width: replaced the max-width-only approach with an explicit `min-w-[240px] max-w-[400px]` band plus a corrected `flex-1 min-w-0` truncation pairing on the text span (the textbook-correct setup `truncate` needs inside a flex row) — the previous pass's `max-w-[360px]`-only fix lacked a floor, which was the likely reason it "did not solve the actual rendered layout sufficiently."
- [x] T168 Re-confirmed organisation-isolation authorization at the live RLS level (not just client code): `organizations_select_member` policy requires `is_organization_member(id) OR created_by = auth.uid()`; platform admins have a separate, intentionally broader policy. Already correct — documented, not changed.
- [x] T169 Re-confirmed Event Status derivation (`eventLifecycle.ts`, built and live-verified in an earlier pass) remains the single source of truth used consistently by Events Overview, Organisation Home, and the event workspace status pill — no new bug found, no change made this pass.
- [x] T170 Confirmed Dashboard's simplified Feature 016 hierarchy (Setup Progress → Recommended Next → Bendie areas → Planner readiness) is unchanged; only its Planner Readiness card's "People" label was relabeled (T161).
- [x] T171 `npm run type-check` clean.
- [x] T172 `npm run lint` clean — identical warning file list to the pre-pass baseline (23 files), zero new categories.
- [x] T173 Confirmed via `git status` that zero files under `src/app/api/` or `supabase/migrations/` were created or modified this pass.
- [ ] T174 Browser/visual verification of the crash fix and every layout/terminology change — not performed; no browser-automation tool available in this environment. The crash investigation used live route/API HTTP probing (curl against a running dev server) to rule out server-side/build-level failure, but could not reproduce the client-side, post-authentication symptom directly.
- [ ] T175 Broader empty-state duplicate-action audit of Tasks/Vendors/Checklist/Production/Flights/Hotels pages — spot-checked Tasks (found only a single header button, not the two-button duplication pattern Participants had) and deliberately not extended further, per the explicit "do not launch a broad redesign" instruction; flagged as a possible follow-up if confirmed elsewhere.

## Continuation pass 9 — Portal Performance, Navigation Stability & Login UX Pass

- [x] T176 Root cause of intermittent Logistics/Production tab visibility found and fixed: `EventLayout`'s six Planner sub-module capability fetches (Tasks/Vendors/Checklist/Participants/Logistics/Production) all start concurrently but resolve independently at different real-world speeds; `visibleSections`/`groupedVisibleSections` were recomputed on every render straight from whichever had resolved *so far*, so a module whose fetch simply hadn't completed yet was transiently excluded from the tab bar while its faster-resolving siblings were already shown — a genuine, evidenced race, not a capability/config-dependent bug.
- [x] T177 Fix: a new `plannerCapabilitiesSettled`/`navSettled` flag tracks whether every relevant Planner sub-module capability has left `'loading'`; the group-pill and child-tab rows now render a stable skeleton placeholder while unsettled, instead of a partially-computed, flicker-prone section list — `undefined`/loading is no longer silently treated as `false`/denied for navigation purposes.
- [x] T178 Fixed a real, confirmed AuthContext bug: `getSession()` on mount AND the `onAuthStateChange` subscription (which itself already fires once immediately with the current session) were BOTH independently fetching the user's profile on every single page load — a genuine duplicate round trip on every login and every fresh page load. Removed the redundant explicit `getSession()` call; the listener alone is the correct, sufficient, already-documented Supabase pattern.
- [x] T179 Fixed the same class of redundancy in `getAccessibleOrganizations()` and `getAccessibleEvents()` (`portalAuth.ts`): both always independently called `supabase.auth.getUser()` (a real network round trip) plus a separate `profiles.global_role` query, even though their one real caller in each case (`OrganizationContext`/`EventContext`) already has both from `AuthContext` by the time it calls them. Added an optional, backward-compatible `knownUser` parameter both callers now pass — removes 2 redundant sequential Supabase round trips from organisation resolution and 2 more from event-list resolution, on every page load.
- [x] T180 Login page: added the existing Bendie logo (`/public/bendie.png`, the same asset already used in `OrgSideNav.tsx`) above the form; rewrote the header to the requested "Welcome back / Sign in to continue" hierarchy; confirmed the existing submit-button loading state ("Signing in…", disabled inputs, no premature credential clearing, form restores on failure) already met the requirements — no regression, light polish only. The post-login `authLoading` transitional screen also now shows the logo and clearer copy ("Getting things ready…") instead of a bare spinner.
- [x] T181 Small terminology/UI cleanup: removed duplicated Participants description (one concise line now lives in `eventSectionMeta.ts`; the page shows a subtle "Team & Access" contextual link instead of a second explanatory paragraph). "Add People" → "Add Attendees"; "Invite new person" → "Invite new attendee" (menu + modal titles), "From organisation"/"From team"/"Import CSV"/"Add all organisation people" left unchanged as instructed. Attendees & Access description simplified to one sentence. Role filter chips and role `<select>`s now use `EVENT_MEMBER_ROLE_LABELS` for proper capitalization (stored role values unchanged).
- [x] T182 Bendie Access / Onboarding audit (documentation only, per the explicit "do not invent replacement statuses" instruction): re-confirmed "Eligible" reflects real architecture (an `event_members` row is always Bendie-eligible — an access code can be issued at any time), `onboarding_status` has no write path anywhere in the codebase (dead/display-only column, unchanged from the earlier finding), and `event_user_access_codes` SELECT RLS is `user_id = auth.uid()` only — a manager cannot read whether another person's code exists, was sent, or was used, so no richer truthful status (Not Invited/Invited/Active) can be shown without an RLS change, which was correctly not made this pass. No status logic invented; existing truthful labels kept.
- [x] T183 `npm run type-check` clean.
- [x] T184 `npm run lint` clean — identical file list to the pre-pass baseline (23 files), zero new categories.
- [x] T185 Live HTTP verification against the running dev server: login page (200), event workspace routes (307 unauthenticated redirect, as expected) — no server/build-level errors introduced by any change this pass.
- [x] T186 Confirmed via `git status` that zero files under `src/app/api/` or `supabase/migrations/` were created or modified this pass.
- [ ] T187 Browser verification of the navigation-flicker fix, login page, and loading states — not performed; no browser-automation tool available in this environment.
- [ ] T188 Deeper performance work deferred (documented, not attempted this pass): route-level `loading.tsx` files, further Supabase query column-trimming beyond the two `knownUser` fixes, prefetch tuning, and a full before/after timing comparison (no APM/browser-timing tool available — only qualitative request-count reduction could be established from source).

## Continuation pass 10 — Portal Navigation Performance & Stress-Stability Pass

- [x] T189 Investigated rapid-navigation instability as a concurrency problem. Confirmed every event-workspace child page already involved in the reported stress sequences (`members`/Attendees & Access, and all six Planner sub-module pages) already had a `requestIdRef`-based staleness guard protecting their own local state from a late-arriving stale response — ruling out "stale state corruption" as the primary mechanism.
- [x] T190 Confirmed the genuine, evidenced mechanism instead: none of these pages' `fetch()`/Supabase calls were ever actually CANCELLED on rapid navigation — only state-guarded. Under rapid tab switching, every previous tab's in-flight request kept running to full completion regardless, competing for real network/Supabase capacity with whatever the user is now actually waiting to see — a genuine "request storm," not a logic bug, matching every symptom reported (slow, feels frozen, unstable under stress).
- [x] T191 New shared `src/lib/useLatestRequest.ts` — a small, focused "latest request wins" primitive (`useLatestRequest()` returns an `AbortSignal`-yielding `start()`; `isAbortError()` distinguishes deliberate cancellation from genuine failure). Not a caching framework, not a global request registry — purely stops already-superseded traffic and its error handling.
- [x] T192 Retrofitted `useLatestRequest` into the four highest-traffic pages named in the stress sequences: `planner-people` (Participants), `planner-logistics` (Logistics), `planner-production` (Production), `members` (Attendees & Access, via Supabase's own `.abortSignal()`). Each now aborts its previous in-flight request when a newer load supersedes it or the page unmounts; abort errors are silently ignored — never a toast, never an error state, never a redirect.
- [x] T193 Confirmed `EventLayout`'s six Planner capability fetches only run ONCE per event (keyed on `[currentEvent, organizationId]`, not on tab/pathname changes) — rapid tab-switching within an already-loaded event does not re-trigger them at all, so the previous pass's `navSettled` fix is not itself a source of per-click instability; it only affects the brief window immediately after first landing on an event.
- [x] T194 Confirmed `EventLayout`'s redirect effect has a single authority per redirect decision (the `isSectionAvailable(activeSection)` bypass added last pass, checked first) and traced that, once capability state has settled, no redirect condition can be triggered merely by pathname changes from tab-clicking — `productAvailability`/capability states are stable across same-event navigation, so the redirect effect's inputs don't change in a way that could fire spuriously during a rapid-click sequence.
- [x] T195 Confirmed tab/group-pill visual highlighting is already purely derived from `pathname` (no async dependency) — clicking a tab updates its highlighted state on the next render, synchronously with the URL change, not gated on any data fetch. No change needed for "immediate navigation feedback."
- [x] T196 Deliberately did NOT retrofit `useLatestRequest` into the remaining ~16 Bendie content pages (activities, agenda, basics, dashboard, etc.) — none of them appear in the reported stress sequences, their fetches are simple single-table reads (not the multi-request Planner/roster loads implicated here), and blanket-retrofitting every page would be the "broad refactor" this pass was explicitly warned against. Flagged as a candidate for a future pass if evidence emerges.
- [x] T197 Investigated Next.js `<Link>` prefetch as a request-storm contributor (item 12) — ruled out for this codebase's architecture: App Router prefetch fetches the route's RSC/JS payload only; these are all `'use client'` pages whose actual Supabase/API calls live in `useEffect` hooks that only run once a component actually mounts, never during prefetch. No prefetch-related change made.
- [x] T198 Investigated Planner cross-database re-resolution (item 20) — confirmed every Planner API route (Tasks/Vendors/Checklist/Participants/Logistics/Production) deliberately, independently re-verifies the full authorization chain (auth → workspace access → product availability → provisioning phase → `event_planner_links` → capability) on EVERY request, per this codebase's own established, repeatedly-documented security philosophy ("never trusts a prior check in the same request chain"). This is real, measurable redundant server-side work per navigation — but changing it would weaken a deliberate, tested security posture across 6+ already-shipped modules, which the explicit "authorization must remain correct" / "do not weaken RLS" instructions rule out. Documented as a known, accepted trade-off, not fixed this pass.
- [x] T199 `npm run type-check` clean.
- [x] T200 `npm run lint` clean — identical file list to the pre-pass baseline (23 files), zero new categories.
- [x] T201 Live HTTP verification against the running dev server for all four newly-touched pages — correct 307 unauthenticated redirects, no server/build-level errors.
- [x] T202 Confirmed via `git status` that zero files under `src/app/api/` or `supabase/migrations/` were created or modified this pass.
- [ ] T203 Browser-based stress verification (rapid real clicking through Sequences A–E) — not performed; no browser-automation tool available in this environment. Verification this pass is source-level/logical tracing plus live HTTP probing, honestly disclosed as such throughout.
- [ ] T204 No automated tests added for the navigation/capability logic — this codebase has no existing test framework, and standing up one for this pass alone was judged out of scope per "do not introduce a large testing framework."
