# Feature 016 Plan: Bendie Portal Guided Event Setup UX

## Phase A — Grouped navigation (DELIVERED)

**Files**: `src/lib/eventSectionMeta.ts`, `src/app/portal/events/[eventId]/layout.tsx`.

- Added an additive `group: string` field to `EventSectionMeta` (every existing entry updated; `key`/`label`/`desc`/`icon`/`badgeBg`/`badgeFg`/`product` all unchanged). Groups: Bendie → Overview, Event Setup, Programme, Attendees, Content, Media, Operations. Planner → Overview, People, Planning, Logistics, Production. Reordered a handful of entries within `EVENT_SECTIONS` so each group's tabs sit contiguously (e.g. `members` moved next to `attendee-travel`/`networking` under Attendees) — this changes the *display* order the tab bar and Dashboard grid render in, never a route or availability check.
- `EventLayout`: derived `groupedVisibleSections` (a `useMemo` grouping of the existing `visibleSections` by `.group`, preserving first-appearance order — no new availability logic, `isSectionAvailable` untouched). Added `selectedGroup` state, synced via `useEffect` to whichever group contains the currently active tab (so a direct link/refresh always shows the right group, never a stale one). Rendered a pill row above the existing tab strip; clicking a pill filters which tabs the (otherwise unchanged) `<nav>` renders via `tabsToShow`. The existing scroll-affordance effect (`updateScrollState`) gained `tabsToShow` as a dependency so the left/right chevrons recompute correctly when the visible subset changes.
- Zero hrefs changed — every `<Link>` still points at the exact same route it always did; grouping only changes which links are visible at once.

## Phase B — Dashboard command centre (DELIVERED)

**Files**: `src/app/portal/events/[eventId]/dashboard/page.tsx`.

- **Bug fix (prerequisite, found live during this pass)**: `SECTION_CHECKS` was missing `planner-vendors`/`planner-checklist`/`planner-people`/`planner-logistics`/`planner-production` — added by Features 009–014 to `EVENT_SECTIONS` but never added here. Every Dashboard render for an event with any of those tabs threw `TypeError: Cannot read properties of undefined (reading 'kind')`. Fixed by adding all five as `{ kind: 'none' }`, matching the existing treatment of `planner-tasks`/`planner-overview`/`bendie-planner` (Planner modules aren't part of Bendie-content "Setup Progress" scoring). Verified: every non-`dashboard` `EVENT_SECTIONS` key now has a `SECTION_CHECKS` entry (30/30, confirmed via a small Node script cross-referencing both files).
- **Recommended next**: `nextBendieSection` — first scored Bendie section (in `EVENT_SECTIONS` order) whose existing `SECTION_CHECKS` test fails. `plannerRecommendation` — a deterministic if/else chain over the new Planner counts (People → Flights → Hotels → Ground Transport → Tasks → Checklist → Vendors → Production), stopping at the first genuine gap. No ranking heuristic, no ML, no configuration — just the first unmet dependency in the order the audit's own §12 (Cross-Module Dependencies) already established.
- **Planner Readiness grid**: gated on `isPlannerApplicable(currentEvent)` (a new helper reading `currentEvent.planner_provisioning_status`, already present on `EventRow` — no new fetch needed to decide whether to show this section at all). When applicable, `Promise.allSettled` fires 8 fetches against **existing, unmodified** endpoints:
  - `GET /planner-people` → `participants[]`
  - `GET /planner-tasks` → `tasks[]`
  - `GET /planner-vendors` → `items[]`
  - `GET /planner-checklist` → `items[]`
  - `GET /planner-logistics/flights` → `flights[]`
  - `GET /planner-logistics/hotels` → `bookings[]`
  - `GET /planner-logistics/ground-transport/movements` → `movements[]` (already nested with `vehicles[].assignments[]` — confirmed by reading `plannerLogistics.ts`'s `listMovements`/`shapeMovement`/`shapeVehicle`, so Ground Transport "assigned" coverage is computed as `new Set(...).size` over real assignment rows, not guessed)
  - `GET /planner-production` → `sessions[]`

  Each response is read through `extractArray()`, which returns `null` (never `[]`) on any failure/denial/shape-mismatch — every card independently renders "Not available" instead of a fabricated zero if its own fetch didn't come back clean. One module failing never blocks the others.
- No new API routes. No change to any existing route's behavior, response shape, or authorization.

## Phase C (partial) — Save & Add Another + empty states (DELIVERED for Vendors + all empty states; remainder DEFERRED)

**Files**: `src/components/portal/PlannerVendorModal.tsx`, `src/app/portal/events/[eventId]/planner-vendors/page.tsx` (Save & Add Another); `PlannerVendorList.tsx`, `PlannerChecklistList.tsx`, `PlannerPeopleList.tsx`, `PlannerFlightList.tsx`, `PlannerHotelList.tsx`, `PlannerGroundTransportList.tsx`, `PlannerProductionList.tsx`, `PlannerTaskList.tsx` + their six page files (empty states).

- **Save & Add Another (Vendors only, reference pattern)**: `PlannerVendorModal`'s `onSubmit` signature gained a `keepOpen: boolean` second argument; a new "Save & Add Another" button (`btn-secondary`, between Cancel and the existing primary "Add Item") calls the same validation and `onSubmit(values, true)`. The page's `handleCreate` now takes `keepOpen`; on success it always refetches (unchanged), but only closes the modal when `!keepOpen` — when `keepOpen` is true it instead bumps a `modalResetKey` counter, which is passed as the modal's React `key`, remounting it with empty fields while staying open. **No API change**: both buttons call the identical existing `POST /planner-vendors`. This pattern is intentionally *not* yet replicated to the other 6 target modules (Checklist, People, Flights, Hotels, Tasks, Production) — doing so is mechanical repetition of this exact pattern, deferred so this pass stays fully verified rather than spread thin across 7 files under time pressure.
- **Empty states**: every one of the 8 Planner list components gained optional `onAdd`/`onImportCsv` props (or just `onAddMovement` for Ground Transport, which has no CSV). Wired from each page to the same handlers the header's existing Add/Import buttons already call — no new logic, just a second place to trigger the identical action. Copy follows the brief's own examples: "Add flights one at a time, or import several using the CSV template" for CSV-enabled modules; an honest "Bulk CSV import isn't available for Ground Transport / Tasks — add \[movements/tasks\] one at a time here" for the two modules that genuinely have no CSV (per the explicit instruction not to make an absent feature look broken). People's empty state states the real dependency ("Participants are needed before flights, hotels and ground transport can be configured").

## Deferred phases — not started this pass

| Phase | What it would take | Why deferred |
|---|---|---|
| C (remainder) | Repeat the Vendors Save & Add Another pattern in `PlannerChecklistModal`/`PlannerPeopleModal`/`PlannerFlightModal`/`PlannerHotelModal`/`PlannerTaskModal`/`PlannerProductionModal` + their 6 pages. Context-preservation (§10 of the brief — e.g. keep the same participant selected for a second flight leg) needs a small addition per form (pass the last-used `participantId`/`ownerProfileId` into the remounted modal's initial state instead of a full reset). | Mechanical but touches 12 files; deferred to keep this pass reviewable. |
| D | A participant-level readiness view on the People tab (Flights/Hotel/Transport status per person) — either an expanded row or a details drawer, built from the same 3 Logistics endpoints already fetched for Phase B, joined by `passengerId` client-side. Explicitly a view layer only, no new participant model (per the brief's own constraint). | Real design work (how to show 3 sub-statuses per row without another wide table) better done with the audit's screenshot review the user is doing next, not guessed at blind. |
| E | Compose Movement → Vehicle → Assignment into one guided flow (e.g. an accordion/wizard inside the Movement card that keeps "Add another vehicle" and "Assign passengers" reachable without returning to the top-level screen) while keeping the exact same 3 canonical tables and RPCs. | The current 3-tier nested-card UI already exists and works; redesigning its interaction flow is a meaningful, standalone effort deserving its own focused pass and manual verification of the RPC call sequence, not a rushed addition here. |
| F | Group `PlannerProductionModal`'s 17 fields into the brief's 5 named sections, with "Advanced" collapsed by default unless populated. | Needs care to avoid breaking the existing validation/required-field logic tied to field order; better isolated from this pass's other changes. |
| G | A "Team & Access" summary widget inside the Planner workspace (e.g. on Planner Overview) surfacing who has access without leaving Planner, reusing `PlannerPermissionsModal`/`can-administer` as-is. | Genuinely new UI surface, not a modification of an existing one — sequenced after D/E/F. |
| H | A dedicated Review & Readiness page/tab. | The Dashboard's new Planner Readiness grid (Phase B) already covers a meaningful subset of this; a dedicated page is additional scope, not a refinement of what shipped. |
| I | Responsive collapse for `grid-cols-2`/`grid-cols-3` create-form grids; mobile card view for wide tables (Flights/Hotels/Production). | Requires actual viewport testing (browser dev tools or real devices) to verify the collapse looks right, which this pass could not perform — see final report's "browser verification not performed." |

## Verification performed

- `npm run type-check` — clean after every phase (Phase A, Phase B, Phase C).
- `npm run lint` — zero new warnings in any modified/created file (confirmed by grepping the full lint output for each touched filename).
- Manual code-level audit: cross-referenced every `EVENT_SECTIONS` key against `SECTION_CHECKS` (30/30 covered) to confirm the dashboard crash fix is complete, not just fixed for the 5 keys found in this pass's stack trace.
- Manual code-level audit: confirmed each Planner GET endpoint's actual response field name (`participants`/`tasks`/`items`/`flights`/`bookings`/`movements`/`sessions`) by reading the route source directly, rather than assuming — avoids the Dashboard's new summary silently reading `undefined` from a wrong field name.
- **Not performed**: any browser/manual click-through verification. No dev-server HTTP smoke test was run for these UI-only changes (unlike Feature 015's fixture-based API verification, there is no safe, fast way to "curl" a React tab-bar grouping or a modal's second button). This is disclosed, not hidden.

---

## Continuation pass 2 — data-entry efficiency and workflow continuity

### Save & Add Another (People, Flights, Hotels, Checklist, Tasks, Production)

Same mechanical pattern as the Vendors reference (`onSubmit(values, keepOpen: boolean)`, a second `btn-secondary` button, the page bumping a `modalResetKey` used as the modal's React `key` to force a clean remount without closing). Context preservation required one addition to the pattern: instead of a bare remount to fully-empty fields, each modal's reset `useEffect` now seeds from an optional `presetContext`/`presetParticipantId`/`presetCategory` prop, populated by the page only on a `keepOpen` success:
- `PlannerFlightModal`/`PlannerHotelModal`: `presetParticipantId?: string`.
- `PlannerChecklistModal`: `presetContext?: Pick<..., 'category'|'dayNumber'|'eventDayDate'|'ownerProfileId'>`.
- `PlannerProductionModal`: `presetContext?: Pick<..., 'sessionDate'|'dayNumber'|'trackName'|'roomName'>`.
- `PlannerTaskModal`: `presetCategory?: string`.
- `PlannerPeopleModal`: no preset — "New person" always resets fully (brief's own instruction); "Search existing"/edit never show the button at all.

Every `openCreate` handler explicitly clears its preset state, so a fresh manual "Add" click never inherits a stale Save-&-Add-Another context. Files: `PlannerPeopleModal.tsx`, `PlannerFlightModal.tsx`, `PlannerHotelModal.tsx`, `PlannerChecklistModal.tsx`, `PlannerTaskModal.tsx`, `PlannerProductionModal.tsx`, and their six page files.

### Production progressive disclosure

`PlannerProductionModal.tsx` rewritten (fields unchanged, only layout): a local `FormSection` wrapper (not exported, no new shared component) groups fields into Session Details / Programme & Location / Production Requirements / Additional Details, followed by a collapsible Advanced panel (Runs in Parallel, Parent Session, Status Override). `hasAdvancedValues()` decides the panel's initial open state — open whenever `isParallel`, `parentProductionId`, or a non-`auto` `status` is already set (edit case), collapsed otherwise (create case). Validation (`sessionTitle`/`sessionDate` required) and the request body sent to `POST/PATCH .../planner-production` are byte-identical to before.

### Ground Transport workflow continuity + multi-passenger assignment

`planner-logistics/page.tsx`:
- `handleMovementSubmit`: on a successful **create** (not edit), reads `data.movement.id` from the create response and immediately opens the Vehicle modal for it (`setVehicleModalMovementId`, `setVehicleModalOpen(true)`), with a distinct toast ("Movement created — add a vehicle"). Edit keeps its original toast/close behavior.
- `handleVehicleSubmit`: on a successful **create**, uses `data.vehicle` directly (verified via the route source that a freshly created vehicle is always shaped with `assignments: []`/`occupancy: 0` — safe to use without a refetch) to open the Assign modal immediately (`setAssignTarget({kind:'assign', vehicle: data.vehicle})`), toast "Vehicle added — assign passengers."
- `PlannerAssignPassengerModal.tsx`: `mode: 'assign'` now renders a checkbox list instead of a single `<select>`; `onSubmit` changed from `(passengerId: number)` to `(passengerIds: number[])`. `mode: 'move'` is unchanged (a single destination vehicle is the only meaningful choice).
- `handleAssignSubmit` (page): for `assign`, runs `Promise.allSettled` over the selected IDs, calling the **existing** `/ground-transport/assignments/assign` endpoint once per passenger (which itself calls the canonical `assign_or_board_passenger` RPC, untouched) — never a bulk endpoint, never a bulk RPC. Successes and failures are tallied; complete success closes the modal and toasts a count; complete failure shows a generic retry error; partial failure keeps the modal open, toasts "`N` assigned, `M` failed," and passes the failed participants' names back into the modal via a new `partialFailures?: string[]` prop so the user can see exactly who still needs assigning and retry just them. `move` mode's request/response handling is unchanged.

### People as the participant hub

`planner-people/page.tsx` gained a second effect (independent of the main roster load) that fires three `Promise.allSettled` fetches — `GET .../planner-logistics/flights`, `.../hotels`, `.../ground-transport/movements` — the exact same endpoints and field names (`flights`/`bookings`/`movements`) Phase B's Dashboard already verified. Results are correlated into a `Map<passengerId, ParticipantLogisticsInfo>` (`flightsLabel`/`hotelLabel`/`transportLabel`), computed once for the whole page load — zero per-participant requests. `PlannerPeopleList.tsx` renders this as a new "Logistics" column plus three deep-link actions ("Add Flight"/"Add Hotel"/"Transport") pointing at `/planner-logistics?view=<sub-tab>&participant=<id>`.

`planner-logistics/page.tsx` reads that `?participant=` param once its own roster has loaded, opens the matching create modal (Flights or Hotels, matching whatever `?view=` is also present) preselected to that participant via the same `presetParticipantId` mechanism Save & Add Another uses, then strips the param from the URL via `router.replace` so a refresh doesn't reopen it. A `consumedParticipantParamRef` guards against re-triggering on subsequent re-renders of the same navigation.

### Logistics summary + URL-backed sub-tab

`subTab` moved from plain `useState` to a small wrapper (`setSubTab`) that also calls `router.replace` to set `?view=flights|hotels|ground-transport`, plus a `useEffect` that syncs `subTab` from `searchParams` whenever it changes externally (deep link arriving while already mounted). `VIEW_TO_SUBTAB`/`SUBTAB_TO_VIEW` maps handle the flights/hotels/groundTransport ↔ flights/hotels/ground-transport naming difference; an invalid or missing `view` value safely falls back to `flights`. The summary strip above the sub-tabs (Participants/Flights/Accommodation/Ground Transport counts) is computed from the same `flights`/`bookings`/`movements`/`participants` arrays the page's existing `load()` already fetches — no new requests — and each stat is itself a button that also calls `setSubTab`, giving it a dual role as both readout and navigation.

### Team & Access discoverability

`planner-overview/page.tsx` gained one new fetch, `GET .../planner-permissions/can-administer` (the exact endpoint the Members page's own "Bendie Planner Access" button gating already calls), and a new card explaining that Planner access is managed per staff member from Members, with a "Manage Team & Access" link shown only when `canAdminister` is true. No new permissions model, no aggregate "who has access" query (would require an N+1 fetch across every org member — not attempted), no changes to `PlannerPermissionsModal` or Feature 008's semantics.

### Dashboard readiness → exact sub-tab

The three Logistics-related Planner Readiness cards (Flights/Hotels/Ground Transport) on the Dashboard gained a `view` field; the card grid's `href` construction now appends `&view=<value>` for any card that declares one, so clicking "Flights" (say) lands directly on the Flights sub-tab rather than Logistics' default. Same underlying readiness data as Phase B — no second readiness engine, per the brief's explicit instruction.

### Responsive

`sed`-applied `grid-cols-2 gap-3` → `grid-cols-1 sm:grid-cols-2 gap-3` (and the `-3`-column equivalent) across `PlannerMovementModal.tsx`, `PlannerPeopleModal.tsx`, `PlannerVendorModal.tsx`, `PlannerVehicleModal.tsx` (the four modals Phase A's earlier pass hadn't already touched); Flights/Hotels/Checklist/Tasks/Production modals were updated individually as part of their own Save & Add Another edits in this same pass. No table→card rewrite was attempted (see spec.md's deferred list).

### Verification performed this pass

- `npm run type-check` — clean after every batch of changes (Save & Add Another ×6, Production rewrite, Ground Transport continuity + multi-assign, People hub, Logistics summary/URL, Team & Access, responsive grid sweep).
- `npm run lint` — full-repo run confirmed zero new warnings; explicitly grepped for every touched filename in the output to confirm none appear.
- Manual source-reads (not assumptions) to confirm: the `movements` GET response is pre-nested with `vehicles[].assignments[]` (so Ground Transport coverage/assignment data needs no extra request); a freshly created vehicle's API response is safe to use directly for the Assign-modal handoff (`assignments: []` guaranteed for a new row); the exact response field names for every endpoint newly consumed this pass (all already verified in Phase B, reused here without re-deriving).
- **Not performed**: browser/visual verification. Confirmed via `ToolSearch` that no browser-automation or screenshot tool is available in this environment, and that `WebFetch` explicitly cannot reach `localhost`. No live HTTP smoke test (Feature-015-style, with disposable fixtures) was run this pass either, given the time budget — this is a real gap, disclosed in the final report rather than glossed over.

---

## Continuation pass 3 — Navigation Hierarchy & Dashboard Simplification

### Sidebar active-state fix

`OrgSideNav.tsx`'s `isActive()`: the `/portal/events` branch gained `|| pathname.startsWith('/portal/events/')` so being inside any event workspace correctly highlights "Events." The generic fallback (previously `pathname.startsWith(href)`, covering People/Assets/Teams/Activity Log/Settings) is now `pathname === href` — every one of those routes is a leaf with no nested children today, so exact match can only ever remove a theoretical false positive, never a legitimate one.

### Top bar breadcrumb simplification

`TopHeader.tsx`: removed the `useEvent()` fields (`currentEvent`, `canAccessWorkspace`, `workspaceAccessChecked`, `loading: eventLoading`) that only existed to compute the event-workspace breadcrumb label — only `currentEventId` (still needed for the product-switch click handler) survives the destructure. `pageLabel` is now `null` for any event-workspace route, and the JSX conditionally omits the trailing `chevron_right` + label segment entirely when `pageLabel === null`, so the breadcrumb reads `Organisations > Org ▾ > Product ▾` and stops there — the event name lives exactly once, in `EventLayout`'s own `<h1>`. Organisation selector, product selector, `CreateOrganizationModal` reuse, search, notifications, settings, and the global Create button are all untouched.

### Group pills become real, route-derived navigation

`layout.tsx` (`EventLayout`) — the confirmed bug fix, per §8/§9 of the brief:
- Deleted `selectedGroup` state and its `useEffect` sync entirely. `currentGroupKey = activeSection?.group ?? groupedVisibleSections[0]?.group` is now a plain derived value computed fresh every render from `pathname` (via `activeSection`) — there is no state left that could ever disagree with the actual route, and it automatically follows deep links and browser Back/Forward for free (both just change `pathname`, which every derived value here already reacts to; no reasoning about invalidating or resyncing separate state was needed because that state no longer exists).
- Each group pill changed from a `<button onClick={setSelectedGroup}>` to a real `<Link>`. Its target is that group's first section (`sections[0]`) — **except** for the one group that legitimately spans both products ("Overview," containing both `dashboard` and `planner-overview`, per §11's own group list which names Overview once, not twice), where the target instead prefers whichever section matches `effectiveTabProduct` (`sections.find(s => s.product === effectiveTabProduct) ?? sections[0]`) — so clicking "Overview" while already oriented in Planner lands on Planner Overview, not Bendie's Dashboard. This preference is a no-op for every other group (all single-product already), so nothing else changed behavior.
- Horizontal-scroll affordance added to the group-pill row: a second `groupNavRef`/`canScrollGroupLeft`/`canScrollGroupRight` state trio, mirroring the pre-existing child-tab-row pattern exactly (this file's own established convention is to duplicate small pieces of UI logic across sibling surfaces rather than generalize them — followed here rather than introducing a new shared hook).
- §11 Both-event product separation: a 1px vertical divider renders once, exactly at the transition from the last Bendie-classified group to the first Planner-classified one; non-active Planner pills get a faint orange tint at rest (`bg-orange-50/70 text-orange-700/80`) instead of the neutral gray Bendie pills use, so the two areas are subtly but genuinely distinguishable without added height or loud color blocking.
- §10 child-tab clarity: active child tabs gained a subtle `bg-primary/5` background alongside the pre-existing colored underline + bold text; inactive tabs gained a matching hover background for consistency.
- §17: the floating `Next: {label}` button (`{nextTab && (...)}`) is now `{nextTab && activeSectionKey !== 'dashboard' && (...)}` — suppressed only on the Dashboard tab, where "Recommended Next" already serves the identical purpose; every other tab keeps it unchanged.

**Not touched**: `isSectionAvailable` (capability/product-availability gating), `effectiveTabProduct` resolution, the Both-event default-landing effect, the org-switch effect, the workspace-authorization state machine, and every tab `<Link>`'s `href` construction in the child-tab row — all byte-identical to before this pass.

### Logistics sub-tab layer (Level 5) — confirmed already correct, not modified

`planner-logistics/page.tsx`'s own `?view=` sub-tab mechanism (built in continuation pass 2) is a **separate navigation layer** from `EventLayout`'s group/child-tab bar: because Flights/Hotels/Ground Transport are internal sub-tabs of the single `planner-logistics` `EVENT_SECTIONS` entry (not three separate entries), `EventLayout` only ever shows one child tab, "Logistics," for that whole group — Level 5 (Flights/Hotels/Ground Transport) is handled entirely inside the page itself. Traced through the actual code (not executed in a browser) to confirm both layers correctly derive from the URL independently: the group/child-tab layer from the path segment (`planner-logistics`, unaffected by the query string), the page-internal sub-tab from `?view=`. No code change was needed here — this pass's job was confirming it, not fixing it.

### Dashboard — high-level setup-area cards

`dashboard/page.tsx`: added `BENDIE_DASHBOARD_AREAS`, a small, explicit array of 5 areas (Event Setup/Programme/Attendees/Content & Media/Operations) each listing its member `EVENT_SECTIONS` keys — deliberately **not** reusing `EVENT_SECTIONS.group` (which drives the *workspace tab bar's* 7 granular Bendie groups, keeping Content and Media apart) since the Dashboard's own brief explicitly asks for Content+Media merged into one card here; two different UI surfaces, two different groupings, kept as two small explicit definitions rather than one forced to serve both.

For each area, `bendieAreaStatuses` computes `{completed, total, targetKey}` by re-running the *exact same* `SECTION_CHECKS` truth (`check.kind === 'field' ? check.test(currentEvent) : (counts[check.table] ?? 0) > 0`) already used for the progress bar and Recommended Next — aggregated per area instead of per section, with `targetKey` set to the first incomplete section in that area (or its first section once complete). No new completion rule was invented.

The Bendie Planner area card reuses `plannerCounts` (unchanged from pass 1/2) to compute "N of M modules started" (`M` = count of Planner metrics that resolved at all, i.e. weren't `null`; `N` = count that are `> 0`), and links to `plannerRecommendation.href` when one exists (falling back to `planner-overview`) — so the single Planner card's action is already the most specific one available, not just a generic landing page.

The old 8-card "Bendie Planner Readiness" grid became a compact list (`Label — value` rows in a `divide-y` list) with the same 8 rows, same links (including the `?view=` deep-link for the three Logistics-related rows), same underlying `plannerCounts` values — just presented as scannable text instead of full bordered cards, plus one "View Planner details →" link to `planner-overview`.

### Verification performed this pass

- `npm run type-check` — clean after every batch (sidebar, top bar, EventLayout group-pill rewrite, Dashboard rewrite).
- `npm run lint` — full-repo run, zero new warnings; grepped the output for `layout.tsx`, `TopHeader.tsx`, `OrgSideNav.tsx`, and `dashboard/page.tsx` specifically to confirm none appear.
- Source-level route trace (not a browser session) against the actual `EVENT_SECTIONS` group values and the rewritten `EventLayout`/`OrgSideNav` logic, covering all 14 scenarios the brief's §21 lists (Dashboard/Basics/Members/Planner-People/Planner-Tasks/Planner-Logistics URLs, both `?view=` values, Planner Production, direct-URL entry, Back/Forward semantics, Bendie-only/Planner-only/Both filtering) plus the 7 sidebar routes from §22 — every one traces to the correct active state by construction, since the relevant state is now purely derived from `pathname`/`searchParams` with no separate React state left to fall out of sync. Findings and the one genuine edge case uncovered (the merged Bendie/Planner "Overview" pill) are in the final report.
- **Not performed**: any actual browser rendering/click verification — same disclosed limitation as passes 1 and 2 (no browser-automation tool available in this environment).

---

## Continuation pass 4 — Global Header Redesign, Organisation Isolation & Event Status Audit

### Organisation security audit — method and result

Delegated to a research subagent with explicit instructions to verify (not assume) both client-side query scoping and server-side RLS, using the `mcp__supabase__execute_sql` read-only tool against the live Portal project's `pg_policies`/`information_schema`. Findings:
- `getAccessibleOrganizations()` (`src/lib/portalAuth.ts:102-167`): non-admins get `.eq('user_id', user.id)`-scoped `organization_members` → derived org list; platform admins (`profile.global_role === 'admin'`) get an unfiltered `organizations` read.
- Live RLS on `organizations`: `organizations_select_member` (`is_organization_member(id) OR created_by = auth.uid()`) plus an additive `portal_is_global_admin()` bypass policy — confirmed a plain authenticated non-admin query cannot return organizations outside their own membership, independent of what the client asks for.
- Live RLS on `organization_members`: `organization_members_select_org_member` (`is_organization_member(organization_id)`) plus the same admin bypass.
- `organizations_insert_creator`: `WITH CHECK (portal_is_global_admin())` — organization creation is platform-admin-only at the DB level, matching `TopHeader.tsx`'s existing `isGlobalAdmin` client gate exactly.
- One reproducibility note (not a security issue): several of these live-enforced base policies have no corresponding file under `supabase/migrations/` — they were found only by querying the live database, not by reading the repo. Flagged for the team's own migration-history hygiene, out of scope to fix in a UX pass.

**Conclusion**: no security bug found, no fix made. This audit exists to *justify* the header's organisation-selector behavior (§below), not to report a vulnerability.

### Header redesign implementation

`TopHeader.tsx`: the entire breadcrumb block (roughly the file's original lines 142-327, spanning both the mobile icon-triggered dropdowns and the desktop `Organisations > Org > Product > Page` chain) was replaced with:
1. An organisation pill — `organizations.length > 1` renders it as a real dropdown button (identical dropdown menu contents/behavior to before: click an org to `setCurrentOrganization`, "New Organisation" for `isGlobalAdmin`); otherwise a plain `<div>` with the same visual weight but no click handler, no chevron, no dropdown markup at all.
2. A vertical divider (`h-6 w-px bg-outline-variant`), rendered only when at least one product is entitled — the literal `|` from the approved mockup.
3. A product control — `availableProducts.bendie && availableProducts.planner` renders the two-segment `[Bendie] [Bendie Planner]` control (reusing the existing `handleProductSwitch` handler unchanged); otherwise a plain static label naming whichever single product is entitled. A separate `sm:hidden` icon-triggered dropdown (only when both products are entitled) is the narrow-screen fallback, replacing the old icon-triggered breadcrumb-menu.
4. The event-workspace-specific `pageLabel` computation (already reduced to "stop the breadcrumb after product" in pass 3) and the generic `getPortalPageLabel(pathname)` branch for non-event routes are both removed entirely — the approved mockup shows no third "page name" segment at all, so nothing replaced it; page identity is already unambiguous from the (already-fixed, pass 3) sidebar active-state highlighting.

Right-side actions (search, notifications, settings link, profile menu, Create link) are **byte-identical** in behavior — only their container's spacing was adjusted to sit correctly next to the new left-side controls. `CreateOrganizationModal` usage (both its two trigger sites and its mount/props) is unchanged.

### Event status/lifecycle audit and fix

New file `src/lib/eventLifecycle.ts` — full derivation rules and rationale documented in its own header comment (see spec.md's summary for the short version). Wired into every consumer that previously computed or displayed event status:
- `EventsOverviewPanel.tsx`: `matchesTab()` now calls `deriveEventLifecycle()` instead of its own compound status+date check; the status pill does the same.
- `OrganizationHome.tsx`: `activeCount`/`upcomingEvents` (feeding the "Active Events"/"Upcoming Events" metric cards) now use the shared helper instead of their own independently-duplicated compound check; the "needs attention" scan's `activeEvents` filter (deciding which events are worth checking for missing emergency contacts) was also switched to the derived lifecycle, so an event whose dates show it's clearly over is correctly excluded from that scan even if its raw `status` was never manually updated — a small, low-risk, behavior-improving side effect of using the canonical rule consistently rather than a second bespoke one.
- `layout.tsx` (`EventLayout`)'s workspace status pill: switched from raw `EVENT_STATUS_LABELS`/`EVENT_STATUS_PILL_CLASSES` (`portalLabels.ts`) to the derived lifecycle equivalents, so the same event can never show a different status in the workspace header than it does on the Events list — the exact inconsistency §15 of the brief called out.
- `portalLabels.ts`'s original `EVENT_STATUS_LABELS`/`EVENT_STATUS_PILL_CLASSES` constants were left in place (now unused by any consumer found in the codebase) rather than deleted — they remain the correct labels for the raw 5-value `status` enum should any future raw-status editor need them (e.g. the Basics tab's manual status `<select>`, which hardcodes its own option list and was not touched).

### Live verification against real events (read-only, Portal Supabase project)

Queried real `events` rows via `mcp__supabase__execute_sql` (SELECT only; zero writes). Server time at verification: `2026-09-22 06:40:31 UTC`.

| Event | Start | End | Stored status | Derived lifecycle | Displayed before | Displayed after |
|---|---|---|---|---|---|---|
| Stawi Escape — Both Test | 2026-11-10 | 2026-11-12 | draft | draft | Draft | Draft |
| Stawi Escape — Planner Test | 2026-10-10 | 2026-10-11 | draft | draft | Draft | Draft |
| Bendie | 2026-08-05 | 2026-08-17 (passed) | draft | draft | Draft | Draft (correctly unaffected by passed dates — never published) |
| AfricaHackon Cyber Security Summit | 2026-08-25 | 2026-09-01 (passed) | published | completed | **Published (stuck forever — the bug)** | **Completed (fixed)** |
| Stawi Escape | 2026-08-30 | 2026-08-31 (passed) | published | completed | Published (bug) | Completed (fixed) |
| Watuhub Teambuilding | 2026-09-17 | 2026-09-20 (passed 2 days ago) | active | completed | Live (stale) | Completed (fixed) |
| Old Mutual General Insurance Kenya Strategy Retreat | 2026-07-03 | 2026-07-03 (passed ~2.5 months ago) | active | completed | **"Live" for 2.5 months (the worse bug)** | **Completed (fixed)** |

A broader 30-row scan (`ORDER BY starts_at DESC`) found the large majority of `active`-status events in the live database have an `ends_at` weeks-to-months in the past — confirming this wasn't a rare edge case. No genuinely currently-running event (`now` between `starts_at`/`ends_at`) or null-date event exists in the live data at verification time — both cases were instead verified by code-reading the helper's logic directly (a currently-running event: `active`-status stays `active` since its own `ends_at` hasn't passed yet, or a `published` event with `starts_at ≤ now ≤ ends_at` falls through to the final `return 'active'`; a null-`starts_at` `published` event: `return 'published'`, no fabricated date reasoning). No event data was modified — every query above was a plain `SELECT`.

### Verification performed this pass

- `npm run type-check` — clean after every batch (header, lifecycle helper wiring, Overview copy).
- `npm run lint` — zero new warnings; grepped specifically for `TopHeader.tsx`.
- Live, read-only Supabase queries (organization RLS inspection + real event data), documented above — the first pass in this feature's history to use actual live application data for verification, not just source-code reasoning.
- `git status` confirms zero files under `src/app/api/` were touched — no backend/API/schema change of any kind.
- **Not performed**: browser/visual verification (same disclosed environment limitation as every prior pass).

---

## Continuation pass 5 — Activity Log Simplification + People/Teams/Event Access Discovery

### A. Activity Log implementation

Files: new `src/lib/activityPresentation.ts`; rewritten `src/app/portal/activity-log/page.tsx` and `src/app/portal/events/[eventId]/activity-log/page.tsx` (both kept their existing data-fetching/pagination/filter-state structure — only the row rendering, filter labels, and a new one-shot subject-name batch lookup changed).

**Verification method** (no browser tool available, same disclosed limitation as every prior pass in this feature): every live `diff` shape claim was confirmed by direct read-only `SELECT` against `organization_audit_log`/`event_content_audit_log` (see below), and every presentation function was then traced by hand against those exact real rows — not merely unit-reasoned in the abstract.

**Live-verified diff shapes**:
- `organization_audit_log`, `organization_assets` INSERT: `diff` = `{id, url, name, file_type, created_at, size_bytes, uploaded_by, storage_path, organization_id}` (a flat row snapshot).
- `event_content_audit_log`, `events` UPDATE: `diff` = `{ends_at:{old,new}, starts_at:{old,new}, description:{old,new}, attendee_limit:{old,new}}` — confirms UPDATE `diff` already contains only genuinely-changed fields, each `{old,new}`-shaped.
- `event_content_audit_log`, `event_members` INSERT/DELETE: `diff` = `{role, user_id, event_id, created_at, invited_by, organization_id, onboarding_status, planner_synced_at, planner_sync_error, planner_sync_status, planner_assignment_id, onboarding_completed_at, planner_permissions_configured_at}` — a flat snapshot including several Planner-sync bookkeeping fields, all correctly hidden by `DEFAULT_HIDDEN_FIELDS`.
- Full distinct `(table_name, action)` pairs currently present: `organization_audit_log` → only `organization_assets`/INSERT (Teams changes exist in the UI but none have been logged yet in this org's real history). `event_content_audit_log` → `events`, `agenda_sessions`, `emergency_contacts`, `event_interest_options`, `support_contacts`, `faqs`, `facilitators`, `posts`, `event_members`, each across INSERT/UPDATE/DELETE as applicable — all covered by `TABLE_AREA_LABELS`/`ACTION_PHRASES` in the new module, with the humanized-fallback path available for anything not explicitly listed.

**Manual trace against real rows** (substituting into the actual implemented functions, not just describing intended behavior):
- `organization_assets` INSERT → `describeAction` → "uploaded an asset" (no subject template) → combined "{Actor} uploaded an asset." `extractHeadline` → `diff.name` = the real file name string → shown as the second line, exactly matching the brief's own worked example.
- `events` UPDATE → `describeAction` → "updated an event." `summarizeChanges` → 4 rows: End Date/Start Date (ISO strings reformatted to locale date+time), Description (both old and new truncated at 80 chars — the real descriptions here are ~90-100 chars, so both sides do truncate; acceptable, not raw JSON), Attendee Limit (`null → 500`, rendered as "— → 500").
- `event_members` DELETE → `tableHasSubject('event_members')` is true → `extractSubjectId` reads the flat `diff.user_id` UUID → `describeAction` → "removed {subject} from the event," subject resolved via the batch `profiles` lookup to a real name when resolvable, or "a member" (never a raw UUID) when not. `extractHeadline` returns `null` for this table by design (the subject is already named in the action line; a second identical name would be redundant) — see spec.md's disclosed gap regarding the brief's "event name" second-line example.
- An invented/unmapped table name → `describeAction` falls through to `` `${GENERIC_VERBS[action]} ${friendlyArea(table).toLowerCase()}` ``, e.g. "Added some new table" — never throws, never shows a raw `INSERT`/`UPDATE`/`DELETE` token as the primary text.

### B. People/Teams/Event Access discovery

Delegated to a background research agent (Explore-type) with explicit instructions: read-only, no writes, cite file:line for every claim, verify live schema via Supabase MCP where possible and clearly mark anything not live-verified as inferred from generated types/migrations instead. Full findings are consolidated into the final report's IDENTITY MODEL / PEOPLE / TEAMS / EVENT MEMBERS / PRODUCT ACCESS / PARTICIPANTS sections — not duplicated here to avoid the two documents drifting out of sync; the final chat report is authoritative for Part B's findings.

### Verification performed this pass

- `npm run type-check` — clean after the Activity Log rewrite.
- `npm run lint` — zero new warnings; grepped specifically for `activity-log`/`activityPresentation`.
- Manual trace of every presentation function against real, live-fetched audit rows (documented above) — not just abstract reasoning.
- `git status` confirms zero files under `src/app/api/` touched, and zero schema/migration files touched — Part A is a pure read-side presentation change; Part B made no code changes at all (discovery only, per explicit instruction).
- **Not performed**: browser/visual verification (same disclosed environment limitation as every prior pass).

---

## Continuation pass 6 — Event Team Foundation Fix + Unified People Assignment

### Migrations applied (both via `mcp__supabase__apply_migration` against the live Portal project — both additive, no existing policy dropped/altered)

1. `teams_org_admin_rls` — 8 new policies: `teams_select_org_member` (SELECT, `is_organization_member(organization_id, auth.uid())`), `teams_insert_org_admin`/`teams_update_org_admin`/`teams_delete_org_admin` (INSERT/UPDATE/DELETE, `is_organization_admin(organization_id, auth.uid())`, UPDATE additionally `WITH CHECK`-scoped so a team cannot be reassigned to a different org), `team_members_select_org_member` (SELECT, via `EXISTS (SELECT 1 FROM teams t WHERE t.id = team_members.team_id AND is_organization_member(t.organization_id, auth.uid()))`), `team_members_insert_org_admin` (INSERT, same join but `is_organization_admin` on the team's org AND `is_organization_member(t.organization_id, team_members.user_id)` on the person being added — enforces "team membership constrained to org members" at the DB layer, not just in `TeamMembersModal.tsx`'s existing app-level candidate-list filtering), `team_members_delete_org_admin` (DELETE, same admin join).
2. `event_members_manager_delete_rls` — 1 new policy: `event_members_delete_host_or_organizer` (DELETE, `is_event_host_or_organizer(event_id, auth.uid())`), mirroring `event_members_update_self_or_host`'s host/organizer half exactly.

### Live verification of the RLS fix (read-only boolean-expression proof, not full session impersonation)

Full session-level RLS impersonation (`SET LOCAL request.jwt.claims`) was not attempted — consistent with Feature 008's convergence-pass precedent, where two attempts to reach the live-HTTP/session tier were correctly blocked by this session's own safety controls as constructing an unauthenticated privileged surface. Instead, the exact boolean expressions the new policies evaluate were run directly against real data:

```
is_organization_admin('08bc8b7d…' [own org], 'd39d5af5…' [that org's real admin])   → true
is_organization_admin('94a9eb36…' [different org], 'd39d5af5…' [same admin])        → false
is_organization_admin('94a9eb36…' [org 1], '25ee98d5…' [real owner of orgs 1 & 2])   → true
is_organization_admin('c2d508fc…' [org 2], '25ee98d5…' [same owner])                → true
is_organization_admin('08bc8b7d…' [unrelated org 3], '25ee98d5…' [same owner])       → false
is_event_host_or_organizer(<real host's own event>, <that host>)                    → true
is_event_host_or_organizer(<a genuinely unrelated event>, <that host>)              → false
is_event_host_or_organizer(<that host's own event>, <a real non-manager member>)    → false
```
All values are real (multi-organisation ownership genuinely exists in production data, confirming the org-scoping is exercised by real rows, not a synthetic edge case). No row was written; every query was a plain `SELECT`/function call. `pg_policies` was re-queried after each migration to confirm exactly the intended policies exist and no existing policy was removed.

### Files created

`src/lib/eventTeamProvisioning.ts` (shared service — `EVENT_MEMBER_ROLES`, `EventAccessConfig`, `resolveEventProductContext`, `checkCanAdministerPlanner`, `resolveOrCreatePersonByEmail`, `addPersonToEvent`, `addPeopleToEvent`, `listOrganizationCandidates`, `previewTeamForEvent`, `previewAddAllOrgPeople`, `describeOutcome`/`summarizeOutcomes`), `src/components/portal/EventAccessConfigFields.tsx`, `AddPeopleMenu.tsx`, `AddPeopleModal.tsx`, `AddFromTeamModal.tsx`, `AddAllOrgPeopleModal.tsx`.

### Files modified

`src/app/portal/events/[eventId]/members/page.tsx` (full rewrite of its add/provisioning logic; route path, `canManage` gate, `changeRole`, `makeFacilitator`, `handleResendAccessCode`, `EditProfileModal`/`PlannerPermissionsModal` usage all preserved), `src/components/portal/EventAssignmentsDropdown.tsx` (inline role-picker add flow via the shared service), `src/components/portal/OrgPeoplePanel.tsx` (passes the two new props the dropdown needs), `src/app/portal/teams/page.tsx` (client-side org-admin gate + copy), `src/lib/eventSectionMeta.ts` (`members` entry's `label`/`desc` only — cosmetic, per its own doc comment never consulted for authorization/routing).

### API changes

None. Every Planner-access call reuses the existing Feature 008 routes (`/api/events/[eventId]/members/[memberId]/planner-permissions/enable` and the collection route's `PATCH`) and the existing `/api/events/[eventId]/planner-permissions/can-administer` route; account creation reuses the existing `/api/admin/create-user` route. No new route was added; no existing route's contract changed.

### Regression spot-check (source-reading, no browser)

- **Planner Tasks/Vendors/Checklist/People/Logistics/Production**: none of their source files were touched this pass (confirmed via `git status` — not in the modified list); they exclusively depend on `event_user_assignments`/Feature 008 flags, which this pass only *reads through existing routes*, never writes to directly.
- **Feature 008 itself**: `plannerPermissions.ts`, `plannerPermissionPresets.ts`, and every `planner-permissions/*` route are untouched; the new flow calls them exactly as `PlannerPermissionsModal.tsx` already does (same request shapes, same `operationId` convention).
- **Feature 015 (CSV)**: `csvImport.ts` and `CsvImportModal.tsx` untouched; only the column spec and per-row handler local to `members/page.tsx` changed.
- **Existing event navigation / Activity Log**: `eventSectionMeta.ts`'s `members` entry keeps its `key` (route-determining) unchanged — only cosmetic `label`/`desc` changed, per that file's own doc comment confirming this is never consulted for routing/authorization. Activity Log pages untouched this pass.

### Typecheck/lint/build

`npm run type-check` — clean. `npm run lint` — zero new warning categories; the one warning on the rewritten `members/page.tsx` (`react-hooks/exhaustive-deps` on a `fetchData` dependency) matches the exact same pre-existing pattern already present in essentially every other data-fetching page in this codebase, not a new class of issue. Production build not re-run this pass (same disclosed limitation as prior passes — a live dev server was active).

### Not performed

Browser/visual verification (no browser-automation tool available in this environment, disclosed every pass). Full session-level RLS behavioral impersonation (see above — the boolean-expression proof is the safe substitute).

---

## Continuation pass 7 — Attendees / Participants Person-Journey Clarification

### Stage 1 — person-model trace (evidence, no code changes)

**A. Organisation People** — unchanged from Continuation pass 5's trace: `organization_members` + `profiles`, Auth account required, multi-org possible.

**B. Event Team** — unchanged from Continuation pass 6: `event_members`, 7 role values, an `event_members` row (any role) is the precondition for Bendie access (`issue_event_access_code` re-confirmed this pass).

**C. Bendie Attendees** — traced fresh this pass, from the actual implementation rather than naming: there is no separate attendees table or page. The "Attendees" tab-bar group (`eventSectionMeta.ts`) contains the Event Team tab itself (`key: 'members'`), `attendee-travel`, and `networking`. `attendee-travel`'s table (`attendee_travel_details`) is keyed by `user_id` → `profiles`/`event_members`, confirmed via `planner-pull-travel/route.ts`'s own write path. **Conclusion: "Bendie Attendee" = "has an `event_members` row" — the same model as Event Team, not a fourth concept.**

**D. Planner Participants** — re-confirmed via fresh reads of `plannerPeople.ts` and the live-schema facts already recorded in `context/planner-backend-coverage-audit.md` §4.9: canonical `passengers` (global identity) + `event_passengers` (event join), zero FK to `profiles`/`event_members`/`organization_members` anywhere in the schema. No Auth account, no org membership, no Event Team membership required or implied. Flights (`all_flights_combined_table`), Hotels (`hotel_bookings`), and Ground Transport (`passenger_vehicle_assignments`) all key off `passengers.passenger_id` exclusively — confirmed again this pass, unchanged from the coverage audit.

**E. Planner Staff/Permissions** — unchanged from Continuation pass 5/6: `event_user_assignments` + `profiles.planner_profile_id` bridge, entirely independent of `passengers`. Re-confirmed this pass by reading `resolvePeopleCapability` in `plannerPeople.ts` itself: it reads `event_user_assignments` only to determine **view** capability for the People/Participants module (an active assignment, any flags) — it never reads or writes `passengers`/`event_passengers`, and manage authority for Participants comes exclusively from the Portal-layer `canAdministerPlannerPermissions` check applied at the route layer, never from `event_user_assignments` flags. This is the code-level proof behind Part H's rule: nothing in the Participant creation/link path touches `event_user_assignments`, confirmed by reading `createNewParticipant`/`linkExistingParticipant` in full — neither function references Planner permissions at all.

### The matching-mechanism precedent (the key evidence enabling Stage 2)

Read in full this pass: `src/app/api/admin/planner-pull-travel/route.ts` (lines 140–162) — builds `userIdByEmail` from this event's `event_members` joined to `profiles.email` (lowercased), then matches each Planner `passengers.email` (lowercased) against it, scoped to this event only. This is Feature 001's own, already-shipped precedent for treating exact email equality as sufficiently reliable to bridge these two models — not invented for this pass. Read in full: `planner-people/page.tsx`'s pre-existing `importPersonRow` (Feature 015) — identical rule applied in the reverse direction (Planner passenger ← Portal person), already calling `/planner-people/search` then `/planner-people/link` or the create route. Stage 2 generalizes this exact, already-accepted rule into a reusable helper rather than inventing a new one.

### Person-type matrix (Part B)

| Person type | Organisation Person? | Event Team? | Bendie Attendee? | Planner Participant? | Planner Staff? |
|---|---|---|---|---|---|
| 1. Normal conference delegate | Usually | Yes (role=attendee) | Yes (= Event Team) | Only if logistics needed | No |
| 2. Board chairman using Bendie | Usually | Yes (role=attendee) | Yes | Only if logistics needed | No |
| 3. Board chairman, logistics managed | Usually | Yes | Yes | Yes (separate `passengers` row) | No |
| 4. VIP, logistics managed, no Bendie | Not necessarily | Not necessarily | No (no event_members row) | Yes | No |
| 5. Sound engineer, Production only | Not necessarily | Not necessarily (Planner access doesn't require it) | No | No | Yes |
| 6. Event manager | Yes (often org admin) | Yes (role=host/organizer/admin) | Yes | Only if traveling | Yes (via Feature 008) |
| 7. Facilitator/speaker | Usually | Yes (role=facilitator/speaker) | Yes | Only if logistics needed | Not implied |
| 8. External guest, no Portal account | No | No | No | Yes — `passengers` has no Auth requirement at all | No |

Row 8 is the clearest proof the two models are genuinely independent: a Planner Participant can exist with **zero** Portal footprint of any kind.

### Stage 2 — decision gate (Part O)

Architecture clearly supports the preferred UX with zero schema changes, zero new API routes, and a matching rule that is already twice-precedented in shipped code — proceeded without `AskUserQuestion`, per the explicit instruction to only stop for a genuine, undeterminable product/architecture decision.

### Files created/modified this pass

Created: `src/lib/plannerParticipantMatching.ts`, `src/components/portal/AddParticipantMenu.tsx`, `src/components/portal/AddParticipantFromPortalModal.tsx`. Modified: `src/app/portal/events/[eventId]/planner-people/page.tsx` (menu wiring, product-context/badge-data effects, CSV handler refactor), `src/components/portal/PlannerPeopleList.tsx` (optional badge prop), `src/lib/eventSectionMeta.ts` (`planner-people` label/desc/group only), `src/app/portal/events/[eventId]/members/page.tsx` (role-control consolidation, updated explanatory copy), `src/components/portal/TopHeader.tsx` (organisation selector width).

### API/schema changes

None. Every new flow calls only Feature 011's existing routes (`GET/POST /planner-people`, `GET /planner-people/search`, `POST /planner-people/link`).

### Typecheck/lint/build

`npm run type-check` — clean. `npm run lint` — identical file list to the pre-pass baseline (23 files, all pre-existing `fetchData`-dependency/`<img>` warnings), zero new categories. Production build not re-run (same disclosed limitation as every prior pass).

### Not performed

Browser/visual verification (no browser-automation tool available in this environment). A concrete repro for the "Planner… truncation" cleanup item beyond the organisation-selector fix was not found from source alone.

---

## Continuation pass 8 — Portal UX Cleanup, Identity Clarity & Navigation Polish

### Planner Participants crash investigation — full trace

**Hypotheses examined and ruled out** (each traced in full against the actual source, not assumed):
1. **Hook-order violation** in `planner-people/page.tsx` (a classic cause of "works on first mount, breaks on remount") — ruled out: every hook is declared unconditionally before the `state.kind === 'loading'/'denied'/'configuring'` early returns; no hook exists after them.
2. **`EventLayout`'s capability state resetting on internal tab navigation** — ruled out: `productAvailability`/`plannerPeopleCapability` live in `EventLayout` (a persistent layout across page swaps within the same event) and are only reset by the effect keyed on `[currentEvent, organizationId]`; navigating between tabs within the same event does not change either reference.
3. **The mismatch-redirect firing for `planner-people` under normal conditions** — ruled out algebraically: `activeSection.product` for `planner-people` is the static `'planner'` classification (independent of the `?product=` query signal); the redirect only fires when `productAvailability.planner !== true`, which cannot be true while the tab is legitimately reachable (Participants' own `isSectionAvailable` branch requires `plannerPeopleCapability.status === 'ready'`, whose fetch itself only starts `if (next.planner === true)`).
4. **A React render exception with no recovery boundary** — checked for `error.tsx`/`global-error.tsx` anywhere under `src/app`: none exist. This makes an error-boundary-driven redirect impossible by construction, which is why the investigation focused on genuine `router.replace()` call sites instead.
5. **Server/build-level failure** — live-probed via `curl` against the actual running dev server (`http://localhost:3000`) for both a Both-product and a Planner-only fixture event's Participants page and its underlying API route: all three returned expected, non-error responses (307 redirect-to-login for the unauthenticated page requests, 401 for the unauthenticated API request) — ruling out a route-compilation/module-resolution failure.

**Confirmed, fixed defects** (found by exhaustive reading of every line touched by the previous pass):
- `AddParticipantFromPortalModal`'s candidate-fetch effect had no `.catch()` and no `cancelled`/staleness guard — a query failure (or a reopen before the first query resolved) left `loading` stuck `true` forever with no recovery path short of closing the modal. Fixed: added a `cancelled` guard (matching every other data-fetching effect in this codebase) and a `loadError` state that renders a real error message instead of an infinite skeleton.
- `planner-people/page.tsx`'s two Feature-016-added effects (product context, Bendie-attendee cross-reference) had the same missing-error-handling gap, creating unhandled promise rejections on any transient failure. Fixed with the same pattern.
- **A confirmed, real navigation bug in `EventLayout`'s group-pill href builder**: `sections.find((s) => s.product === effectiveTabProduct) ?? sections[0]` combined with `href = effectiveTabProduct ? \`${basePath}?product=${effectiveTabProduct}\` : basePath` used the CURRENTLY-active tab's product for every group's link, including single-product groups. For "Participants" (only `planner-people`, classified `'planner'`), clicking it while on a Bendie tab (e.g. Dashboard) produced `planner-people?product=bendie` — a self-contradictory signal. Traced through the redirect effect's own logic and confirmed this specific bug does NOT trigger the mismatch-redirect (since that effect reads the static `EVENT_SECTIONS` classification, not the query signal) — its confirmed effect is that `TopHeader`'s product segmented control would briefly show the wrong product highlighted immediately after navigating to Participants, a real, visible inconsistency. Fixed: the href now uses the target group's own product for every single-product group, and only prefers `effectiveTabProduct` for the one genuinely mixed-product group (Overview).

**Defense-in-depth hardening added** (not a guess at "the" root cause, but a structural invariant that closes the entire symptom class): `EventLayout`'s mismatch-redirect effect now short-circuits — never redirects away from — any section whose own `isSectionAvailable(activeSection)` check has already returned `true`. Since each Planner module's `isSectionAvailable` branch independently re-verifies access against its own live capability endpoint (a strictly more precise, per-caller, per-module signal than the coarser event-level `productAvailability` snapshot), this makes it structurally impossible for a transient disagreement between the two signals to bounce a legitimately-authorized user out of a tab they can actually use.

**Honest limitation**: this investigation could not reproduce the reported client-side, post-authentication symptom directly, because no browser-automation tool is available in this environment and constructing a privileged authenticated session via `curl` was deliberately not attempted (consistent with this session's established precedent from Feature 008's convergence pass, where the same class of workaround was correctly identified as building an unauthenticated privileged surface). The fixes above are the complete, evidence-based set of genuine defects found through exhaustive source tracing plus live server-level HTTP probing — not a single isolated "this was the exact bug" claim.

### Terminology/UI changes — files and exact edits

- `src/lib/eventSectionMeta.ts`: `members` entry `label: 'Event Team'` → `'Attendees & Access'`, `desc` updated. `planner-people` entry unchanged from the previous pass (already `'Participants'`) — re-verified still in place.
- `src/app/portal/events/[eventId]/dashboard/page.tsx`: Planner Readiness card's `label: 'People'` → `'Participants'` — the actual source of the reported stale "PEOPLE" label, since it lives outside `eventSectionMeta.ts` and was missed by the previous pass's audit.
- `src/app/portal/events/[eventId]/members/page.tsx`: access-denied copy, toast message, CSV modal title, and the long explanatory hint paragraph all updated to the locked terminology and concise product language; Products column renamed "Bendie Access" with the fabricated Planner pill removed and its action moved to the Actions column as "Team & Access".
- `src/app/portal/events/[eventId]/planner-people/page.tsx`: hint paragraph rewritten to concise language; header/empty-state add-menu deduplication (see below).
- `src/app/portal/events/[eventId]/planner-overview/page.tsx`: "Team & Access" card copy updated to reference "Attendees & Access page" instead of "Members page."
- `src/app/portal/teams/page.tsx`: two copy references updated to "Attendees & Access page."
- `src/components/portal/PlannerPeopleList.tsx`: `onAdd`/`onImportCsv` props replaced with a single `addMenu?: React.ReactNode` prop — the parent now passes the real `AddParticipantMenu` element down for the empty state, rather than the list rendering its own second, simpler action set.
- `src/components/portal/TopHeader.tsx`: organisation selector width fix (see below).
- `src/app/portal/events/[eventId]/layout.tsx`: group-pill href fix + mismatch-redirect hardening (see above).

### Organisation selector width — root cause and fix

The previous pass's `max-w-[360px]`-only change gave the control a ceiling but no floor, and the inner `truncate` text span had no `min-w-0`/`flex-1` pairing — the textbook-correct setup `truncate` requires inside a flex row to behave predictably (a `truncate` span without `min-w-0` can still be prevented from shrinking correctly by the flex algorithm's `min-width: auto` default in edge-case layouts, or conversely fail to grow to fill available space). Fixed: `min-w-[240px] max-w-[400px]` on both the dropdown-button and static-label variants, with the text span now `flex-1 min-w-0`. `position: relative` (needed for the dropdown panel's `absolute` positioning) was preserved on the correct element after an initial edit briefly misplaced it — caught and corrected before finalizing.

### Products/access column — before/after

**Before**: "Bendie" pill (accurate) + "Planner…" pill (styled identically, but actually just a button that opens Feature 008's permission modal — shown to any caller who could administer permissions, never reflecting the target person's actual live Planner access state). **After**: column renamed "Bendie Access", shows only the honest "Eligible" label (documented as reflecting architecture, not a confirmed-sent access code); the Planner-access management action moved to the Actions column, relabeled "Team & Access" so it reads as an action, not a status. No new endpoint was built to show live per-row Planner status — that would require a new batch-read endpoint against `event_user_assignments` that doesn't exist today, explicitly deferred per the "no N+1 pattern" instruction.

### Organisation-admin isolation — re-confirmed at the RLS level

Live-queried `pg_policies` for `organizations`: `organizations_select_member` (`SELECT`) requires `is_organization_member(id) OR created_by = auth.uid()`; platform admins have a separate `portal_is_global_admin()`-gated policy for full visibility. This is enforced at the database layer regardless of what the client requests — confirmed correct, not changed.

### Event status — re-confirmed, no new bug found

`src/lib/eventLifecycle.ts` (`deriveEventLifecycle`, built and live-verified against real production events in an earlier pass) remains the single canonical derivation, consumed identically by `EventsOverviewPanel.tsx`, `OrganizationHome.tsx`, and `EventLayout.tsx`'s own workspace status pill — re-confirmed via source read this pass, no duplicated/inconsistent derivation found, no change made.

### Typecheck/lint/build

`npm run type-check` — clean. `npm run lint` — identical file list to the pre-pass baseline (23 files), zero new warning categories.

### Not performed

Browser/visual verification of any change in this pass (disclosed, consistent with every prior pass). A full empty-state-duplication audit across every other Planner module (only Tasks was spot-checked).

---

## Continuation pass 9 — Portal Performance, Navigation Stability & Login UX Pass

### Request waterfall — login / initial page load (before → after)

**Before** (traced from source, `AuthProvider`/`OrganizationProvider`/`EventProvider`):
1. `AuthContext` mount: `getSession()` (round trip 1) → `fetchProfile()` (round trip 2) → **in parallel**, `onAuthStateChange`'s own initial callback fires (fires with the same current-session data `getSession()` already returned) → `fetchProfile()` again (round trip 3, duplicate of #2).
2. `OrganizationContext` effect waits for `authLoading === false`, then `getAccessibleOrganizations()`: `getUser()` (round trip 4) → `profiles.global_role` (round trip 5) → `organization_members`/`organizations` (round trip 6).
3. `EventContext` effect waits for `orgLoading === false`, then `getAccessibleEvents()`: `getUser()` (round trip 7) → `profiles.global_role` (round trip 8) → `events` (round trip 9).
4. `AvailableProductsContext` (already correctly consolidated in Feature 006 — one fetch, not duplicated).

**After**:
1. `AuthContext`: `onAuthStateChange` alone (round trip 1: session) → `fetchProfile()` (round trip 2) — the redundant explicit `getSession()`+its duplicate profile fetch removed.
2. `OrganizationContext`: `getAccessibleOrganizations({id, globalRole})` using the already-known user/profile — skips straight to `organization_members`/`organizations` (round trip 3) — 2 round trips removed.
3. `EventContext`: `getAccessibleEvents(organizationId, {id, globalRole})` — skips straight to `events` (round trip 4) — 2 round trips removed.

**Net measured-from-source reduction**: 9 sequential round trips → 4, on every login and every fresh page load. This is a request-count reduction established by reading the exact call chain, not a measured millisecond figure (no browser-timing tool available in this environment to measure wall-clock latency).

### Logistics/Production flicker — the exact fix

`src/app/portal/events/[eventId]/layout.tsx`: added `plannerCapabilitiesSettled` (all six of `plannerTaskCapability`/`plannerVendorCapability`/`plannerChecklistCapability`/`plannerPeopleCapability`/`plannerLogisticsCapability`/`plannerProductionCapability` have left `'loading'`) and `navSettled` (`productAvailabilityChecked && plannerCapabilitiesSettled`). The group-pill row and child-tab row are now wrapped: `!navSettled` renders a 3-pill skeleton placeholder; `navSettled` renders the existing (unchanged) computed nav. This is scoped narrowly to the NAV BAR — the content pane's own `productAuthPending` gating (which already correctly waits per-active-tab) is untouched.

### Duplicate requests found (full list)

1. `AuthContext`'s `getSession()` vs. `onAuthStateChange`'s initial fire — fixed.
2. `getAccessibleOrganizations()`'s internal `getUser()`+`profiles.global_role` vs. `AuthContext`'s already-resolved `user`/`profile` — fixed.
3. `getAccessibleEvents()`'s internal `getUser()`+`profiles.global_role` vs. the same already-resolved state — fixed.
4. `isOrgAdmin()`/`canManageEvent()` and the two `getUser()` calls inside `OrganizationContext`'s `setCurrentOrganization`/`addOrganization` were inspected — these are user-INITIATED, infrequent actions (switching/creating an organisation), not part of the reported slow paths (login, navigation, tab switching) — left unchanged, per "make targeted improvements only where they clearly reduce repeated work."

### Sequential requests safely parallelized

None were newly parallelized with `Promise.all` this pass — every waterfall found was a genuine *unnecessary duplicate* (the same fact re-fetched from scratch when already known), not two genuinely-independent requests being run sequentially for no reason. `EventLayout`'s own six Planner capability fetches were already firing concurrently (not sequentially) — confirmed, not changed.

### Supabase query efficiency

No `.select('*')` was introduced or found newly problematic. `getAccessibleEvents()` already uses a narrow, intentional column set (`id, name, status, starts_at`) distinct from (and correctly narrower than) Feature 004's `EVENTS_SELECT_COLUMNS` — this is a lightweight list/search use case, not full event detail, and was not touched. `profiles.select('*')` in `AuthContext.fetchProfile` was inspected and deliberately left unchanged — `profile` is consumed broadly across the app (avatars, names, job titles, bios) by many components expecting the full row shape; narrowing it risks breaking consumers for a table that isn't large, a worse risk/reward trade-off than the fixes above.

### Client/server rendering, Strict Mode

No client/server component boundary changes made — `'use client'` placement was inspected and found already correctly scoped (contexts and interactive pages only). React Strict Mode was not disabled; the duplicate-fetch bugs found were genuine (present in both dev and production, not a Strict-Mode-only double-invoke artifact) — confirmed by reading the actual call sites (`getSession()` and `onAuthStateChange` are two structurally different calls, not one effect running twice).

### Indexes

None added. No source/schema evidence gathered this pass pointed to a missing index on a frequently-filtered column strongly enough to justify one — per the explicit "only add an index if the evidence is strong" instruction, none was added.

### Typecheck/lint/build

`npm run type-check` — clean. `npm run lint` — identical file list to the pre-pass baseline (23 files), zero new categories.

### Live verification performed

`curl` against the running dev server: `/auth/login` (200, ~445ms first-compile response), three event-workspace routes under the fixed `EventLayout` (307 unauthenticated redirects, as expected, no 500s) — confirms no server/build-level regression from any change in this pass.

### Not performed

Browser verification of the navigation-flicker fix or any visual/timing change (no browser-automation tool available). Measured before/after millisecond timings (no APM/browser-timing tool available — the waterfall reduction above is a request-count fact, not a measured latency claim).

---

## Continuation pass 10 — Portal Navigation Performance & Stress-Stability Pass

### Investigation method

Traced rapid navigation as a concurrency problem, not a UI polish problem, per the brief. Checked every page named in Stress Sequences A/B/D (`members`, `planner-people`, `planner-logistics`, `planner-production`) for existing staleness protection first — found all four already had `requestIdRef` counters guarding their own `setState` calls against a late response. This ruled out "stale state overwrites current state" as the mechanism (the existing guards already prevent that specific failure). What none of them had: actual request CANCELLATION — the underlying `fetch()`/Supabase call kept running to completion regardless of whether its result would ever be used, meaning rapid switching among N tabs left N sets of requests genuinely in flight simultaneously, competing for real capacity with whatever the user is currently waiting on. This is the confirmed "request storm."

### Provider/context lifecycle — re-verified stable

Re-confirmed (not re-derived) from the previous pass's own findings: `AuthContext`/`OrganizationContext`/`EventContext` do not re-fetch on tab-to-tab navigation within the same event — their effects are keyed on `[currentEvent, organizationId]`/`user`/`profile identity`, none of which change when only `pathname` changes. `EventLayout`'s own capability-fetching effect is identically scoped. No provider remounting or unnecessary shared-context reload was found for same-event child navigation — this class of problem was already resolved by the prior pass's fixes, confirmed by re-tracing rather than assumed fixed.

### Fix implemented

`src/lib/useLatestRequest.ts` (new, ~50 lines): `useLatestRequest()` returns a `start()` function; each call aborts the previous `AbortController` from the same hook instance (if any) and returns a fresh `AbortSignal`; the hook also aborts on unmount. `isAbortError(err)` checks `err instanceof DOMException && err.name === 'AbortError'`.

Retrofitted into:
- `planner-people/page.tsx`'s `load()` — signal passed to the single `fetch()`; abort caught and silently ignored in the existing `catch` block (added alongside, not replacing, the existing `requestIdRef` guard).
- `planner-logistics/page.tsx`'s `load()` — signal passed to all four `Promise.all`-concurrent `fetch()` calls (flights/hotels/ground-transport/participants); `Promise.all`'s fail-fast rejection on any one abort is caught once in the outer `catch`, correctly silent.
- `planner-production/page.tsx`'s `load()` — identical single-fetch pattern to Participants.
- `members/page.tsx`'s `fetchData()` — uses supabase-js v2's own `.abortSignal(signal)` query-builder method (confirmed present at `@supabase/supabase-js: ^2.45.0`) rather than a raw `fetch()`; an aborted query's resulting `error` is checked against `signal.aborted` before deciding whether to show a toast, so a deliberate cancellation never surfaces as "Failed to load attendees."

### What was investigated and NOT changed (with reasoning)

- **The remaining ~16 Bendie content pages** (activities, agenda, basics, dashboard, emergency, etc.): none appear in the reported stress sequences; each does one simple table read, not the multi-request pattern implicated here. Retrofitting all of them would be the explicitly-warned-against "broad refactor." Left as a documented candidate for a future pass.
- **Next.js `<Link>` prefetch** (item 12): investigated and ruled out as a contributor for this architecture — App Router prefetch fetches only the route's RSC/JS payload; the actual Supabase/API calls in this codebase live inside `useEffect` hooks that run only once a `'use client'` component has actually mounted, never during prefetch. No prefetch configuration was changed.
- **Server-side Planner authorization re-verification** (item 20): every Planner module route independently re-derives the full chain (auth → workspace access → product availability → provisioning phase → `event_planner_links` → capability) on every single request — confirmed, real, measurable redundant work across navigations. This is also this codebase's own consistently-documented, deliberate security posture across Features 007–014 ("every request independently re-verifies... never trusts a prior check in the same request chain"). Changing it to cache/skip re-verification would be a genuine authorization-correctness trade-off the brief's own "do not weaken RLS"/"authorization must remain correct" rules explicitly forbid trading for speed. Documented as a known, accepted cost, not fixed.
- **EventLayout's redirect/capability logic**: re-traced specifically for the rapid-click scenario (distinct from the previous pass's initial-load race) and found already correct — no further change made.
- **Route-level `loading.tsx` files**: still deferred — the existing pages already implement their own internal loading states covering the actual data-wait; a route-level `loading.tsx` would only cover the JS-chunk-load window (already fast via Next's code splitting), not the data fetch itself, so the expected benefit was judged too small to justify the added complexity this pass.

### Typecheck/lint/build

`npm run type-check` — clean. `npm run lint` — identical file list to the pre-pass baseline (23 files), zero new categories (one transient `react-hooks/exhaustive-deps` warning was introduced and immediately fixed — `startRequest` added to `planner-people/page.tsx`'s `load` callback's dependency array).

### Live verification performed

`curl` against the running dev server for all four newly-touched pages (`members`, `planner-people`, `planner-logistics`, `planner-production`) — correct 307 unauthenticated redirects, no 500s, no server/build-level errors introduced.

### Not performed

Browser-based stress testing of the actual rapid-click sequences (no browser-automation tool available in this environment) — every claim above is either a source-level trace/proof or a live HTTP probe, never a fabricated browser-interaction claim. No automated tests added (no existing test framework in this codebase to extend).

## Continuation pass 11 — CSV Coverage Expansion & Both-Product Travel Journey Guidance

### Files changed — Part A (CSV)

- `src/lib/csvImport.ts` — added `parseFlexibleBoolean` (shared, Feature 015's own file extended in place).
- `src/app/portal/events/[eventId]/activities/page.tsx` — `ACTIVITY_CSV_COLUMNS`/`ACTIVITY_CSV_SAMPLES`/`parseActivityCsvRow`/`importActivityRow`, header "Import CSV" button, `CsvImportModal` instance.
- `src/app/portal/events/[eventId]/excursions/page.tsx` — `EXCURSION_CSV_COLUMNS`/`EXCURSION_CSV_SAMPLES`/`parseExcursionCsvRow`, `prepareExcursionImport` (`beforeImport`, resolves/creates categories sequentially), `importExcursionRow`, `csvCategoryMapRef`.
- `src/app/portal/events/[eventId]/news/page.tsx` — `NEWS_CSV_COLUMNS`/`NEWS_CSV_SAMPLES`/`parseNewsCsvRow`/`importNewsRow`.
- `src/app/portal/events/[eventId]/expo/page.tsx` — `EXPO_CSV_COLUMNS`/`EXPO_CSV_SAMPLES`/`parseExpoCsvRow`/`importExpoRow`.
- `src/app/portal/events/[eventId]/planner-tasks/page.tsx` — `resolveAssigneeForCsv`, `TASK_CSV_COLUMNS`/`TASK_CSV_SAMPLES`/`parseTaskCsvRow`/`importTaskRow` (posts to the existing route, gated behind `capability.canManage`).
- `src/lib/plannerTasks.ts` — `AssignableStaffMember`/`listAssignableStaff` now also select and return `email` (verified live that Planner's `profiles.email` column exists first).
- `src/components/portal/PlannerTaskModal.tsx` — `AssignableStaffMemberClient` type extended with `email`; the one existing synthetic "(no longer active)" assignee option updated to match the widened type. No visible UI change — the dropdown never renders email.

No API routes were created for Activities/Excursions/News/Expo (direct Supabase writes, matching the existing Bendie-side CSV precedent exactly). No API route was created for Tasks either — it reuses the existing `POST /api/events/[eventId]/planner-tasks` route unmodified. No database migrations. No RLS changes.

### Files changed — Part B (Travel Journey)

- `src/lib/travelReturnContext.ts` (new) — `markTravelJourneyStarted`/`hasActiveTravelJourney`/`completeTravelJourney`/`consumeTravelJourneyReturnFlag`, all `sessionStorage`-backed, keyed per `eventId`.
- `src/app/portal/events/[eventId]/attendee-travel/page.tsx` — Both-product detection (`isProductAvailableForEvent`), the guidance banner (both copy variants), `handleSetUpInPlanner`, `handlePullTravel` (a second caller of the existing `/api/admin/planner-pull-travel` endpoint).
- `src/app/portal/events/[eventId]/planner-logistics/page.tsx` — `hasReturnContext` state, `handleReturnToAttendeeTravel`, the return banner (with the empty-roster nudge), a new `Link` import.
- `src/app/portal/events/[eventId]/planner-people/page.tsx` — the same `hasReturnContext`/`handleReturnToAttendeeTravel`/return-banner pattern.

### Why `sessionStorage` instead of a query parameter

The guided journey can legitimately span Attendee Travel → Planner Logistics (Flights) → Planner Participants (to link a Bendie attendee, via the pre-existing "From Bendie Attendees" flow) → back to Planner Logistics (Hotels/Ground Transport) → back to Attendee Travel. Several of those hops happen via the ordinary event-workspace tab bar, which threads only its own `?product=`/section-routing state between tabs — it does not (and per `AGENTS.md`'s "no broad navigation redesign" constraint, should not be modified to) forward an arbitrary extra query parameter to every tab link. A `?from=attendee-travel` param would therefore silently vanish the moment the user clicked a normal tab instead of one of this feature's own contextual links, defeating the "remains available through the relevant Planner travel setup journey" requirement. Per-event `sessionStorage` survives any in-tab navigation path (tab bar, browser back, a direct URL, a refresh) without touching `EventLayout`'s shared tab-link-building code at all — zero cross-cutting risk to the other ~28 unrelated tabs. It holds exactly one fixed enum value per key, never a URL; every "return" destination in the two consuming pages is a hardcoded, locally-constructed path (`/portal/events/{eventId}/attendee-travel`), so there is no arbitrary-redirect surface for a tampered `sessionStorage` value to exploit even in principle. This was evaluated against, and preferred over, the query-param design the brief suggested as its primary option — a deliberate, disclosed engineering choice, not a misreading of the brief (which explicitly allowed "another lightweight route-state mechanism consistent with the current architecture" as an alternative).

### Destination choice — Planner Logistics, Flights sub-tab

`eventSectionMeta.ts` and `productNavigation.ts` were read before choosing a destination. `planner-logistics` (group "Logistics", `product: 'planner'`) already has an established `?view=` deep-link contract (`VIEW_TO_SUBTAB`/`SUBTAB_TO_VIEW`) built for exactly this purpose in Features 012/013 ("Deep links (e.g. from People's contextual actions...) may navigate here with a different `?view=`"). `planner-overview` was ruled out as the destination — it is read-only event-identity/session-status, not an entry point into configuring anything. `planner-logistics?product=planner&view=flights` was chosen as the concrete first actionable step of "setting up travel," matching `resolveEventTabProduct`'s existing rule that non-entry tabs (which `planner-logistics` is) simply carry forward whatever `?product=` origin they're given — confirmed this does not risk reintroducing the earlier "Planner route receives Bendie product context" navigation bug, since the origin here is explicitly set by this pass's own link, not inferred.

### Reused vs. new

Reused, unmodified: `POST /api/admin/planner-pull-travel` (Feature 001), `planner-logistics/page.tsx`'s `?view=` mechanism (Features 012/013), the `?product=` origin signal and `resolveEventTabProduct` (Feature 006), the "From Bendie Attendees" participant-linking flow (already existing), `isProductAvailableForEvent` (`eventAuth.ts`), `resolveParticipantForCsv`'s matching rule (mirrored, not imported, since the original is a private, non-exported function local to `planner-logistics/page.tsx`). New: the `travelReturnContext.ts` helper and the banners themselves. Nothing was added to `event_planner_links`, `attendee_travel_details`, or any Planner table.

### Typecheck/lint/build

`npm run type-check` — clean. `npm run lint` — identical warning file list to the pre-pass baseline; the five newly CSV-touched pages already carried a pre-existing `fetchData`-missing-dependency warning from before this pass (their `useEffect` dependency arrays were not touched), and no new warning category was introduced anywhere, including the three Part B pages. `npm run build` (production) — clean; confirmed no dev server held `.next` before running it.

### Not performed

Browser verification of the CSV upload/preview/import flow and the two-directional travel-journey banners (no browser-automation tool available in this environment) — verified via full source-level state-branch tracing instead, plus one live read-only schema check (Planner `profiles.email` column existence) before depending on it. No live/disposable-fixture CSV import run was performed this pass (not explicitly requested, and Feature 015's own underlying import mechanism was already live-verified in its own pass); the five new modules add only column specs/parse/insert logic on top of that already-proven mechanism.

## Continuation pass 12 — Portal Data Entry UX & Productivity Pass

### Files changed

- `src/lib/csvImport.ts` — new `parseCsvText(text): ParsedCsv`.
- `src/components/portal/CsvImportModal.tsx` — `sourceMode` state, `resetToPick` (split from the full-reset `handleClose` so switching source modes doesn't lose the user's choice), `applyParsedRows` (the now-shared tail of both `handleFile` and the new `handleParsePastedText`), the pick-step's Upload/Paste toggle UI and textarea.
- `src/app/portal/events/[eventId]/activities/page.tsx` — `openDuplicate`, `handleSave(keepOpen)` with `location` retention, Save & Add Another button, a Duplicate icon-button per row, empty-state copy.
- `src/app/portal/events/[eventId]/excursions/page.tsx` — `handleSaveExcursion(keepOpen)`, Save & Add Another button, empty-state copy (category already outside the form, needs no explicit retention).
- `src/app/portal/events/[eventId]/news/page.tsx` — `handleSave(keepOpen)` with `themes` retention, Save & Add Another button, empty-state copy.
- `src/app/portal/events/[eventId]/expo/page.tsx` — `handleSave(keepOpen)` with `is_exhibitor`/`is_sponsor` retention, Save & Add Another button, empty-state copy.
- `src/components/portal/PlannerTaskList.tsx` — `onManagerStatusChange` prop, manager-only inline status `<select>` with a self-clearing `statusOverride` map for optimistic-with-rollback behavior, corrected the stale "Bulk CSV import isn't available" empty-state copy.
- `src/app/portal/events/[eventId]/planner-tasks/page.tsx` — `handleManagerStatusChange`, wired to `PlannerTaskList`.

No API routes created. No database/RLS changes. Tasks' inline status control reuses the existing `PATCH /api/events/[eventId]/planner-tasks/[taskId]` route and `updateTaskAsManager` exactly as the Edit modal already does.

### Why extend `CsvImportModal` itself rather than build a new `PasteImportModal`

The brief's own item 34 lists `PasteImportModal` as a possible new component name, but also states the governing principle in item 9: "CSV and Paste should ideally converge into the SAME validated row representation... do not maintain separate business rules." A separate component sharing `columns`/`parseRow`/`importRow` props would still need to duplicate the entire pick→preview→import state machine (or import/wrap the existing one, which is more coupling for no benefit) and would only benefit the modules explicitly wired to render it — realistically a handful, given the pass's time budget. Extending the existing shared modal in place instead means every module that already calls `<CsvImportModal>` — all 16 of them, with zero per-module code changes — gained paste support the moment this one file was edited. This was judged the correct application of "reuse existing components... do not create a giant generic form engine" (item 3) over literally following item 34's suggested name.

### Duplicate — design decision

Considered two designs: (a) insert the duplicate row directly into the database, then open it in edit mode; (b) open the create form pre-filled, unsaved, requiring an explicit Save. Chose (b) exactly as the brief's item 7 prescribes ("Prefer: Duplicate → prefilled create form → user reviews → Save, rather than immediately creating the duplicate in the database") — this also means a duplicate that the user decides not to keep never touches the database at all, and the exact same validation path a normal "Add" goes through still applies (item 31 — convenience features never bypass validation/authorization, because there is no separate write path to bypass it with).

### Inline status edit — why optimistic-with-rollback, and why not the self-assignee draft pattern

`PlannerTaskList.tsx`'s existing self-assignee control intentionally does NOT fire on every `onChange` — a prior corrective fix (documented in that file) specifically moved it to an explicit draft+Save step, because it originally fired a PATCH straight from the status `<select>`'s `onChange` while a companion `remarks` field was also being edited in the same draft, and needed the two fields committed together. The new manager inline control has no companion field — it only ever sends `{ status }` — so item 14's "immediate saving state" contract is safe to implement directly via optimistic UI + rollback, without reintroducing the bug the draft pattern exists to prevent. This distinction is deliberate, not an inconsistency between the two controls.

### Typecheck/lint/build

`npm run type-check` — clean. `npm run lint` — identical 30-warning baseline, zero new categories. `npm run build` (production) — clean; a dev server was discovered running partway through this pass (started between two checks, not present at the start) — the build still completed successfully and the dev server was confirmed still responding (200) immediately after, but this is disclosed as a known-risk pattern per earlier passes' own documented caution about concurrent builds sharing `.next`, not silently glossed over.

### Not performed

Browser verification of paste, Save & Add Another retention, Duplicate, and inline status editing (no browser-automation tool available) — verified via full source-level tracing of every new state branch instead. No live/disposable-fixture import run was performed this pass (the underlying mechanism is unchanged from Feature 015/Continuation pass 11, both already live-verified). Bulk actions, column-alias matching, post-save next actions, and the Dashboard setup assistant were investigated (found safe/feasible where applicable) but deliberately not implemented — see spec.md's "Deliberately not done this pass" for the reasoning behind each.

## Continuation pass 13 — Theme Colour Picker & Measured Screen Performance Pass

### Files changed — theme picker

- `src/app/portal/events/[eventId]/theme/page.tsx` — full rewrite: `normalizeHex`, `relativeLuminance`/`contrastRatio` (pure, no dependency), `PRESETS` (from `tailwind.config.js`), a `draft`-based `ColorField` component (local draft absorbs in-progress invalid typing so nothing is destroyed mid-keystroke; only a valid HEX ever commits upward to `form`), session-only `recentColors` state, the contrast-warning banner, and a "Reset to Default" button restoring the pre-existing `DEFAULTS` constant. Storage contract (`events.theme_primary`/`theme_secondary`/`theme_tertiary`, six-digit HEX text, direct client-side `update`) is completely unchanged — this pass is UX-only, exactly as instructed.

### Files changed — performance

- `src/lib/eventAuth.ts` — `isProductAvailableForEvent` now runs its two independent reads via `Promise.all`.
- `src/app/api/events/[eventId]/planner-tasks/route.ts`, `planner-vendors/route.ts`, `planner-checklist/route.ts`, `planner-people/route.ts`, `planner-production/route.ts`, `planner-logistics/flights/route.ts`, `planner-logistics/hotels/route.ts`, `planner-logistics/ground-transport/movements/route.ts` — each route's initial `profiles` select now also includes `planner_profile_id`; the subsequent `resolveCallerPlannerIdentity(authClient, user.id)` call (a second round trip to the identical row) is replaced with `profile?.planner_profile_id ?? null`, reading the value already in hand. `resolveCallerPlannerIdentity` itself was NOT deleted from any of the 6 lib files that export it — other call sites (the ~21 item-mutation routes not touched this pass) still use it correctly, and it remains a valid, correct, independently-usable function; only these 8 routes' own now-redundant second call to it was removed.

No new API routes. No database/RLS/index changes — every fix this pass changes only which existing queries run in parallel vs. sequentially, or removes an exact-duplicate query; no query's filter, table, or resulting authorization decision changed in any way.

### Methodology — why these specific measurements, and what could not be measured

`EXPLAIN ANALYZE` was chosen over guessing at query cost because it is genuine, live evidence from the real databases (read-only, via the same MCP access already established for verification in earlier passes), immediately available without needing an authenticated browser session. `curl` timing against the live dev server was chosen to establish a routing/middleware baseline — sufficient because Next.js's own auth-check-and-redirect middleware fires and returns a 307 before any page component or data-fetching code ever runs, so its timing is a genuine, if partial, measurement, not a proxy standing in for something else.

What could not be measured, and is disclosed rather than glossed over: full authenticated end-to-end timing of a real Planner route's complete chain. Constructing a session for a disposable test identity to drive this was considered and rejected for the same reason Feature 008's convergence pass rejected it — it would mean adding an unauthenticated-reachable privileged network surface (a temporary internal route or a minted session cookie) purely for measurement purposes, which this session's own safety controls correctly treat as a real risk, not a formality to route around. No fabricated "before/after ms" figures are reported anywhere in this pass for the full chain; every number reported (query execution time, routing time, round-trip count) is something this pass genuinely measured or counted from source.

### Why the Logistics 4-way fan-out was documented, not fixed

Considered three options: (a) leave it; (b) apply the same small profiles-merge fix to all four of its routes (already done, since three of the four — flights, hotels, movements — are among the 8 routes fixed above; only `planner-people`, itself one of the 8, remains, so all four legs already got the small fix); (c) consolidate all four into one bundled route matching Tasks/Vendors/Checklist/People/Production's shape. (c) is the fix that actually addresses the structural problem (four parallel authorization chains instead of one), but it means rewriting `planner-logistics/page.tsx`'s fetch logic and merging four separate route handlers' worth of authorization/data logic into one — a genuinely larger change than anything else in this pass, and exactly the kind of thing the brief's "do not change architecture unless profiling proves necessary and the change is small/safe" instruction exists to gate. It was evaluated, understood, and deliberately left for a dedicated future pass rather than attempted here under time pressure.

### Typecheck/lint/build

`npm run type-check` — clean. `npm run lint` — identical 30-warning baseline, zero new categories. `npm run build` (production) — clean; this time the dev server was explicitly stopped (`taskkill`) before building and restarted fresh afterward, directly incorporating the lesson from the `.next` corruption incident earlier in this session rather than repeating it.

### Not performed

Browser verification of the colour picker and of normal/rapid/return navigation timing (no browser-automation tool available). Full authenticated end-to-end HTTP timing of a complete Planner request chain (see "Methodology" above for why). The Logistics bundled-endpoint consolidation, the remaining ~21 item-mutation routes' duplicate-profile-query fix, and blanket `useLatestRequest` retrofitting of the ~16 simple Bendie pages were all investigated and are documented as deliberate, reasoned deferrals — not oversights.
