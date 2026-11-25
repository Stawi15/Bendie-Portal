# Tasks: Speakers Table and Inspector Pilot

**Input**: Design documents from `/specs/031-speakers-table-inspector/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/list-editing-contract.md, quickstart.md

**Tests**: The plan calls for vitest tests of `speakers.ts` (rules, payloads, sessions merge). Browser verification uses the walk-through (v1 and v2) and the quickstart parity script.

**Organization**: Grouped by user story (US1–US5 in spec.md).

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Record baseline checks (tsc, lint 0/28, vitest 105, worktree build) in `specs/031-speakers-table-inspector/verification.md`, and start a same-day v1 reference walk-through of `redesign@1426691` (port 3100, `WALKTHROUGH_OUT` in the scratch folder)
- [X] T002 Add `@tanstack/react-table@9.3.1` with `npm install --save-exact`; confirm `package.json` and the lockfile pin exactly 9.3.1 and nothing else changes; record it in `context/code-standards.md` (dependency + reason), together with the approved component folders `src/components/{data,form,entities}/` (doc 21)

---

## Phase 2: Foundational (blocking)

**Purpose**: One source of speaker rules and writes, used by the existing callers with **no visible change**.

- [X] T003 Create `src/lib/speakers.ts` per contracts/list-editing-contract.md:
  - `Speaker` type and the select column list;
  - `listSpeakers`, `createSpeaker`, `updateSpeaker`, `deleteSpeaker`, `importSpeakerRow`, `addSpeakerFromAttendee`, `listSpeakerSessions` (passed-in client, RLS);
  - pure `validateSpeaker` (today's exact messages), `normaliseSpeakerInput` (empty → null, `role_type` default `speaker`), `matchesSearch` (6 fields), `applySpeakerFilters`, `compareSpeakers` (data-model sort rules), `speakerGroups`;
  - `SPEAKER_CSV_COLUMNS`, `SPEAKER_CSV_SAMPLES` and `parseSpeakerCsvRow`, moved verbatim from the page.
- [X] T004 [P] Create `src/lib/speakers.test.ts`. Cover:
  - validation messages;
  - normalisation;
  - search on each field;
  - each filter and combinations;
  - sort (case-insensitive, empties last, ties by `display_order`);
  - groups;
  - the CSV parser on the template rows;
  - the sessions merge (lead + linked, de-duplicated, by `starts_at`) using a stub client;
  - the `addSpeakerFromAttendee` and `createSpeaker` insert payloads equal to today's;
  - the import `display_order` = count + row index.
- [X] T005 Move today's `src/app/portal/events/[eventId]/facilitators/page.tsx` into `src/components/speakers/SpeakersPageV1.tsx` **verbatim except** for its data calls and validation, which now use `speakers.ts`. The markup and copy are unchanged. The route file becomes a thin switch that renders V1 for now.
- [X] T006 In `src/app/portal/events/[eventId]/members/page.tsx`, replace `makeFacilitator`'s speaker existence check and insert with `addSpeakerFromAttendee`. Keep the `event_members` role update, the toasts and the refresh exactly as today.
- [X] T007 **Checkpoint (no-change proof):** tsc, lint and tests pass. Confirm by line comparison that the V1 markup is identical to the original. Run the walk-through in v1 and compare with the T001 reference: 0 access differences and data-only screenshot differences. Record the result in verification.md.

**Checkpoint**: Shared rules in place; v1 provably unchanged.

---

## Phase 3: User Story 1: Find and review speakers quickly (P1) 🎯 MVP

**Goal**: The v2 Speakers table with search, sort and filters.

**Independent Test**: quickstart §4 "List and narrowing".

- [X] T008 [P] [US1] Create `src/components/data/StatusBadge.tsx` with explicit variants (`StatusBadge.Done`, `.Neutral`, `.Warning`, `.Blocking`, `.Info`). Each always shows an icon and a text label, using the 029 `status-*` tokens and `rounded-full`.
- [X] T009 [US1] Create `src/components/data/DataTable.tsx`, a compound component on `@tanstack/react-table`:
  - `Root` takes `data`, `columns`, `getRowId`, `initialSort` and `onOpenRow`, and owns the sort state.
  - `Toolbar`, `Search` and `Filter` (a labelled `<select>`) and `Reset`.
  - `Body`:
    - at ≥768 px, a semantic `<table>` with `<th scope="col">`; sortable headers are buttons with `aria-sort`; one tab stop per row; Enter or Space opens the row; the selected row is marked;
    - below 768 px, a `<ul>` list mode.
  - `Empty`, `Error` (with a retry action) and `Loading` (skeleton).
  - A polite live region announcing the shown count and sort changes.
  - Sort cycle on a header: ascending → descending → off (back to `initialSort`); `Reset` also restores it (analysis A1).
  - Column priority: columns can be marked `priority: 'secondary'`; when the table area is narrower than about 800 px (for example 1280 px with the docked inspector), secondary columns are hidden through TanStack column visibility (ResizeObserver on the table area), so there's never sideways scroll (analysis U1).
  - Styling with 029 tokens (`h-row`, `rounded-ui-*`, `shadow-elev-*`).
- [X] T010 [US1] Create `src/components/speakers/SpeakersPageV2.tsx` (list part):
  - loads with `listSpeakers` (abortable, like today);
  - `SectionHeader` with the count;
  - toolbar: search, group / role / not-claimed filters and reset, "Import spreadsheet" and "Add speaker";
  - columns: photo + name, title · organisation, group (secondary), role (secondary), claim (`StatusBadge`);
  - default sort `display_order`; sortable name, organisation, group and claim;
  - today's empty state (copy-standard wording), a "No speakers match" state with reset, and a load-error state with a retry action (analysis C1).
- [X] T011 [US1] In `facilitators/page.tsx`, render `SpeakersPageV2` when `useShell().shell === 'v2'` and V1 otherwise.

---

## Phase 4: User Story 2: View, add and edit beside the list (P1)

**Goal**: The inspector replaces the modal in v2.

**Independent Test**: quickstart §4 "Editing".

- [X] T012 [US2] Extract the drawer focus-trap logic from `src/components/shell/AppShell.tsx` into `src/components/shell/focusTrap.ts` (`useFocusTrap(ref, active, { onEscape, returnFocusTo })`). `ShellSidebar` uses it with identical behaviour; re-run the 030 drawer check.
- [X] T013 [US2] Add `<RightPanel.Portal open title onClose>` to `src/components/shell/RightPanel.tsx` (research R4):
  - live children through `createPortal` into the slot host;
  - at ≥1280 px, docked beside the canvas (`w-[400px]`, `bg-surface-container-lowest border-l`);
  - below 1280 px, a fixed right sheet with `role="dialog"`, `aria-modal`, `aria-labelledby` the title, `useFocusTrap`, Escape, a close button, a scrim and `shadow-elev-3`;
  - focus returns to the invoker;
  - `duration-motion-panel ease-motion-panel` slide, none with reduced motion.
  
  Update the 030 shell contract's RightPanel row.
- [X] T014 [P] [US2] Create `src/components/form/zodlessResolver.ts`: `resolverFrom(validate)`, which adapts a pure `validate(values) → { field?: message }` to a react-hook-form resolver.
- [X] T015 [US2] Create `src/components/entities/SpeakerInspector.tsx`:
  - react-hook-form with `resolverFrom(validateSpeaker)`;
  - the 10 fields with labels, error text next to the field, `aria-invalid` and `aria-describedby`, and the avatar preview;
  - `StatusBadge` for the claim status;
  - the read-only Sessions list (`listSpeakerSessions`, loaded when opened), with title plus day and time in the event time zone (`Intl.DateTimeFormat`). It shows "Not on any sessions yet" or "Sessions aren't available".
  - Footer: Save (`createSpeaker` / `updateSpeaker`; on failure the values are kept and an error toast shows), Cancel, and Delete (confirm → `deleteSpeaker` → close).
  - A new speaker goes to the end of the display order and opens after save.
- [X] T016 [US2] Wire the inspector into `SpeakersPageV2`: open a row or "Add speaker" in `RightPanel.Portal`, refresh the list after save or delete, and mark the selected row.

---

## Phase 5: User Story 3: Never lose unsaved changes, and link to a speaker (P1)

**Goal**: The guard and the URL state.

**Independent Test**: quickstart §4 "URL" and "Guard".

- [X] T017 [US3] Create `src/components/form/DirtyGuard.tsx` (research R5):
  - `DirtyGuardProvider` and `useDirtyGuard(isDirty)`;
  - `useNavigationGuard().confirmLeave()`, which resolves `true` with no active guard;
  - while dirty: a capture-phase link click listener (same-origin, left-click, no modifier, not `_blank`, a different URL), `popstate` handling that restores the URL on "Keep editing", and `beforeunload`;
  - the prompt uses `useConfirm`: "Discard changes?" with "Discard" (destructive) and "Keep editing".
  
  Mount the provider in `PortalShell` (both layouts; inert without a dirty form).
- [X] T018 [US3] In `src/components/header/useHeaderModel.ts`, make `goToEvent` and `handleLogout` await `confirmLeave()` first (a no-op without a guard; v1 is unchanged).
- [X] T019 [US3] URL state in `SpeakersPageV2` (research R6):
  - `?speaker=<id>|new` drives the inspector;
  - opening uses `router.push`; closing removes the parameter (Back closes);
  - other parameters are kept;
  - an unknown id shows the toast "That speaker couldn't be found." and `router.replace` without it;
  - the inspector's close, row switch, Escape and "Add speaker" call `confirmLeave()` when dirty;
  - the form resets after a successful save.

---

## Phase 6: User Story 4: Import and existing capabilities (P1)

**Independent Test**: quickstart §4 "Import" and "Attendees".

- [X] T020 [US4] In `SpeakersPageV2`, "Import spreadsheet" opens the existing `CsvImportModal` with `SPEAKER_CSV_COLUMNS`, `SPEAKER_CSV_SAMPLES`, `parseSpeakerCsvRow` and `importSpeakerRow` (display order = count + row index), with title "Import speakers" and the same template filename. The list refreshes afterwards.

---

## Phase 7: User Story 5: Any screen and keyboard (P2)

**Independent Test**: quickstart §5.

- [X] T021 [US5] Responsive pass on `SpeakersPageV2` and `DataTable`:
  - 1440 px: docked inspector with the table still visible;
  - 1024 and 768 px: sheet;
  - 390 px: list mode, the toolbar wraps with search full width, and the primary action stays visible;
  - no sideways scroll at any width.
- [X] T022 [US5] Keyboard and screen reader pass: tab order (toolbar → rows → inspector), Enter or Space opens, Escape closes, focus returns to the row, `aria-sort`, the live-region announcements, and sheet focus trapping.

---

## Phase 8: Polish & verification

- [X] T023 Update `context/ui-rules.md`: list records are created and edited in the Inspector, never an inline panel above a list (doc 20). Record the DataTable, Inspector and DirtyGuard usage rules and the `?<entity>=` URL convention.
- [X] T024 Static checks: tsc, lint, vitest, and a worktree build. Confirm the only dependency change is `@tanstack/react-table@9.3.1`. Record the results in verification.md.
- [X] T025 Walk-throughs: v1 against the reference (SC-002) and v2 against v1 (access parity). Record the results in verification.md.
- [X] T026 Quickstart §4 parity and behaviour script (SC-001, SC-003–SC-006, SC-008). Every way of leaving while dirty is covered, including closing the page with the leave-page prompt enabled (expect the browser's dialog; analysis C2); test data is restored afterwards. Record the results.
- [X] T027 Quickstart §5: focus detector (≥3:1), 1440/1024/768/390 screenshots in `specs/031-speakers-table-inspector/evidence/`, and reduced motion (SC-007). Record the results.
- [X] T028 `/imprint` DataTable, StatusBadge, Inspector (RightPanel.Portal) and SpeakerInspector into `context/ui-registry.md`; update `context/progress-tracker.md`.
- [ ] T029 `/review`, then `/speckit-converge`.

---

## Dependencies & Execution Order

- T001–T002 → **Phase 2 (T003–T007) blocks everything**. The shared rules come first, and v1 is proven unchanged.
- US1 (T008–T011) before US2. The inspector opens from table rows.
- US2 (T012–T016) before US3 (T017–T019). The guard wraps the inspector form.
- US4 (T020) after T010. US5 (T021–T022) after US2 and US3.
- Polish (T023–T029) last.
- Can run in parallel: T004 with T005/T006; T008 with T009; T014 with T012/T013.

## Implementation Strategy

1. **Safety first:** shared rules plus an unchanged v1 (T007) before any new UI.
2. **MVP:** US1 + US2 + US3 (table, inspector, guard and URL). This is the reusable pattern.
3. Then import parity (US4), responsive and keyboard (US5), docs, verification and review.
