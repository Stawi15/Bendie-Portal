# Tasks: Studio 2.0 App Shell

**Input**: Design documents from `/specs/030-studio-app-shell/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/shell-contract.md, quickstart.md

**Tests**: The plan calls for vitest tests of the new pure logic (area mapping, visibility, role, shell resolution, panel reducer). Browser verification uses the existing walk-through, extended to run in both layouts.

**Organization**: Grouped by user story (US1–US5 in spec.md).

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Record baseline checks (tsc, lint 0/28, vitest count, worktree build) in `specs/030-studio-app-shell/verification.md`; copy the 2026-11-19 walk-through baseline (json + `stawi_admin` screenshots) to the scratch folder
- [X] T002 [P] Add `STUDIO_SHELL` (`v1`|`v2`, default `v1`) to `docs/bendie-revamp/tools/walkthrough.py`: set the `studio_shell` cookie for `localhost` on each browser context before login; record `shell` in each result

---

## Phase 2: Foundational (blocking)

**Purpose**: Behaviour-preserving extraction that both layouts depend on. **No visible change.**

- [X] T003 Create `src/lib/useEventWorkspace.ts` by moving the logic half of `src/app/portal/events/[eventId]/layout.tsx` **verbatim** (state, effects in the same order, redirects, `isSectionAvailable`, `visibleSections`, `groupedVisibleSections`, `journey`, Manage modules state, content-gate flags, `sectionHref`); return everything the render uses (research R1)
- [X] T004 Create `src/components/shell/EventWorkspaceV1.tsx` containing today's render JSX **verbatim**, consuming `useEventWorkspace()`'s return; extract the content gate (auth pending/denied screens, paused notice, unavailable message, Planner deferral handling, page `children`) into `src/components/shell/EventWorkspaceParts.tsx` (`EventContentGate`, `EventWorkspaceLoading`, `EventWorkspaceDenied`, `EventStepNav`) with **identical markup**, used by V1 (and later V2); reduce `src/app/portal/events/[eventId]/layout.tsx` to call the hook and render `EventWorkspaceV1`
- [X] T005 Extract `TopHeader` into `src/components/header/useHeaderModel.ts` (its state and derived data, moved verbatim) and `src/components/header/HeaderParts.tsx` (`HeaderContextControls` = menu button, org switcher incl. Stawi items, product switcher; `HeaderActions` = event search, activity, settings, account menu, New event; `HeaderCreateOrganization`) with **identical markup and behaviour**; `src/components/portal/TopHeader.tsx` composes them (research R7). *Cut at the component's natural seams instead of six files; the v2 shell composes or wraps these parts.*
- [X] T006 Move today's client body of `src/app/portal/layout.tsx` into `src/components/shell/PortalShell.tsx` (providers, `OrgSideNav`, `TopHeader`, `main`, `Toaster`); make `src/app/portal/layout.tsx` a server component rendering `<PortalShell initialShell={...}>` (cookie read is added in T008)
- [ ] T007 **Checkpoint (no-change proof):** tsc, lint, tests, worktree build pass; run the walk-through with `STUDIO_SHELL=v1` and diff access results against the baseline (expect 0 differences) and screenshots (expect data-only differences). Record in verification.md

**Checkpoint**: Extraction proven behaviour-identical; v2 work can start.

---

## Phase 3: User Story 3: Try the new layout and switch back (P1)

**Goal**: The flag works; v1 stays the default.

**Independent Test**: quickstart §7.

- [ ] T008 [US3] Create `src/lib/shellLayout.ts`: `SHELL_COOKIE='studio_shell'`, `type Shell='v1'|'v2'`, `resolveShell(cookieValue, queryValue): Shell` (query wins; anything else gives `v1`), `shellCookieString(shell)` (path `/portal`, 1 year, SameSite=Lax). Add `src/lib/shellLayout.test.ts`
- [ ] T009 [US3] In `src/app/portal/layout.tsx`, read the cookie with `cookies()` and pass `initialShell`. In `PortalShell`, apply a `?shell=` override: write the cookie and `router.refresh()` **only when the value differs from the current cookie** (no refresh loop) and render v1 (today) or v2 (`AppShell`)
- [ ] T010 [US3] Create `src/components/shell/ShellToggle.tsx` ("Try the new layout" / "Back to the current layout"): writes the cookie and calls `router.refresh()`. Add it to `AccountMenu` (both layouts). If cookies are blocked it does nothing harmful (edge case)

---

## Phase 4: User Story 1: Find any event section in two steps (P1) 🎯 MVP

**Goal**: The v2 event sidebar with 6 areas from `useEventWorkspace()`.

**Independent Test**: quickstart §3–4.

- [ ] T011 [P] [US1] Add `area` to every entry in `src/lib/eventSectionMeta.ts` per data-model.md (display only; comment that availability never reads it). Create `src/lib/eventAreas.ts` (area order and labels: Overview, Setup, Programme, People, Logistics, Content; `utility` footer) and `src/lib/eventAreas.test.ts` asserting all 32 keys map to exactly one area and the counts 2/4/6/3/5/10/2
- [ ] T012 [US1] Create `src/components/shell/AppShell.tsx` (v2 frame: sidebar column, a slim **global top bar** on every v2 route (org **and** event) holding `EventSearch`, `ActivityBell`, `NewEventButton`, `AccountMenu` (incl. the layout toggle and Logout), canvas with optional toolbar slot + breadcrumbs + page, right-panel slot) using 029 tokens (`rounded-ui-*`, `shadow-elev-*`, `h-control`), with landmarks `nav`/`main`/`aside`
- [ ] T013 [US1] Create `src/components/shell/EventSidebar.tsx`: a header with "← Organisation" (to the user's events list, as today's "All Events") and the `ContextStrip`; areas built from `useEventWorkspace().visibleSections` grouped by `area` (areas with no visible sections are hidden); 2 levels; current area and page marked (`aria-current`); footer utilities: Activity log, Bendie Planner (only if visible), Manage modules (opens the existing `ManageModulesModal`); loading state while `navSettled` is false (no flash of disappearing pages, per edge case)
- [ ] T014 [US1] Create `src/components/shell/EventWorkspaceV2.tsx`: `AppShell` + `EventSidebar` + `ContextStrip` (T016) + the shared `EventContentGate` (from T004; never a second copy) + page `children` + the existing Previous/Next nav; wire `src/app/portal/events/[eventId]/layout.tsx` to render V1 or V2 by shell
- [ ] T015 [US1] Create `src/components/shell/Breadcrumbs.tsx` (org › event › area › page) using `getPortalPageLabel` and `eventAreas`

---

## Phase 5: User Story 2: Always know where I am (P1)

**Goal**: Context strip with products, visibility and role.

**Independent Test**: quickstart §5.

- [ ] T016 [P] [US2] Create `src/lib/workspaceContext.ts` with `visibilitySentence(status, hasPlanner)` (research R5 wording) and `roleLabel({ isGlobalAdmin, orgRole, eventRole })` (research R4 wording and precedence). Add `src/lib/workspaceContext.test.ts` covering all 5 statuses and the role precedence
- [ ] T017 [US2] Create `src/lib/useWorkspaceRole.ts`: `isGlobalAdmin` from `useAuth`; the org role from the user's own `organization_members` row (browser client, cached per org in memory); the event role via the existing `getUserEventRole`
- [ ] T018 [US2] Create `src/components/shell/ContextStrip.tsx`: org › event (truncated, full name in `title` and accessible name), product chips ("Attendee app", "Planner": text + `product-*` tokens), visibility sentence, role line. Used in the `EventSidebar` header

---

## Phase 6: User Story 4: Organisation workspace in v2 (P2)

**Independent Test**: quickstart §3 (org routes) + spec US4 scenarios.

- [ ] T019 [US4] Create `src/components/shell/OrgSidebar.tsx`: Home, Events, People (+ Teams second level), Library (`/portal/assets`), Activity; footer Settings, Help; header `OrgSwitcher` (incl. Stawi-only Organisations/Moderation, as today) and `ProductSwitcher`. Search, bell, New event and account menu (with Logout and the toggle) live in the `AppShell` global top bar (T012), so they're available on event pages too. Active-state rules as `OrgSideNav.isActive`
- [ ] T020 [US4] In `PortalShell` v2: render `AppShell` with `OrgSidebar` for org routes and with `EventSidebar` (via the event layout) for `/portal/events/[eventId]/*`. Pass the canvas the existing `<main>` scroll behaviour

---

## Phase 7: User Story 5: Responsive and keyboard (P2)

**Independent Test**: quickstart §6.

- [ ] T021 [US5] Responsive behaviour in `AppShell`/sidebars (doc 22): ≥1280 full sidebar; 1024–1279 collapsible rail (hover or focus expand, as v1's `desk` rule); <1024 drawer (`role="dialog"`, `aria-modal`, Escape closes, focus to first link, returns to the menu button, scrim closes); reduced motion = no slide
- [ ] T022 [US5] Fix K1 in v2: sidebar variants `ProductSwitcher.Sidebar` and `EventSearch.Sidebar` use `.focus-ring` (≥3:1); v1 variants unchanged
- [ ] T023 [US5] Create `src/components/shell/RightPanel.tsx` with `RightPanelProvider` (pure reducer in `src/lib/rightPanel.ts` + `src/lib/rightPanel.test.ts`), `useRightPanel()`, `registerRightPanelContent()`; ⌘./Ctrl+. bound only when content is registered (none in 030, so nothing is visible); focus return; reduced motion

---

## Phase 8: Polish & verification

- [ ] T024 Reconcile `context/architecture.md` with constitution v2.0.0 (stack Next 15/React 19; domain modules; admission = Stawi admin or org member; new shell structure and the `studio_shell` flag) and close G1 in `docs/bendie-revamp/40-unknowns-and-open-questions.md`
- [ ] T025 Static checks (tsc, lint, vitest incl. new tests, worktree build; confirm the expected build-output change: `/portal/*` routes now dynamic because the layout reads a cookie, with no behaviour change); FR-012 style check: no `package.json`/lockfile/migration changes. Record in verification.md
- [ ] T026 Walk-through in **v1** (SC-004 screenshots vs baseline) and **v2** (SC-003: access results identical to v1 for all 252 visits). Record in verification.md
- [ ] T027 v2 reachability (SC-001/002) and context strip (SC-005) checks per quickstart §4–5, including a temporary Published status on the test DB (restored afterwards)
- [ ] T028 v2 focus/contrast (corrected detector), 390 px drawer, reduced motion, and toggle persistence (SC-006, SC-007). Screenshots at 1440/1024/768/390 in `specs/030-studio-app-shell/evidence/`
- [ ] T029 `/imprint` the shell patterns (AppShell, sidebars, ContextStrip, product chips, drawer, right panel) into `context/ui-registry.md`; update `context/progress-tracker.md`
- [ ] T030 `/review`, then `/speckit-converge`

---

## Dependencies & Execution Order

- T001–T002 → **Phase 2 (T003–T007) blocks everything** (extraction must be proven unchanged first).
- US3 (T008–T010) before US1/US4 wiring (the switch is needed to render v2).
- US1 (T011–T015) and US2 (T016–T018): T011 and T016 [P] can start in parallel; T018 before T014's final wiring.
- US4 (T019–T020) after T012.
- US5 (T021–T023) after the sidebars exist.
- Polish (T024–T030) last.

## Implementation Strategy

1. **Safety first:** the Phase 2 extraction is verified behaviour-identical (T007) before any v2 UI.
2. **MVP:** US3 + US1 + US2 (switch, event sidebar, context strip) is usable for event work.
3. Then the org workspace (US4), responsive and keyboard (US5), verification, review.
