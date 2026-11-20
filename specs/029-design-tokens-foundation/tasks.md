# Tasks: Design Tokens, Focus Ring and Reduced-Motion Foundation

**Input**: Design documents from `/specs/029-design-tokens-foundation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ui-tokens-contract.md, quickstart.md

**Tests**: The spec doesn't request automated test files. Verification uses the existing checks plus the quickstart's browser checks against the test environment (Polish phase).

**Organization**: Tasks are grouped by user story so each can be done and checked on its own.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on incomplete tasks)
- **[Story]**: US1–US4 from spec.md

## Path Conventions

Single Next.js app at the repo root: `tailwind.config.js`, `src/globals.css`, `context/*.md`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Capture the baseline so "no visual change" (SC-003) and "same access" (SC-004) can be proven.

- [X] T001 Record baseline check results (tsc, lint error/warning counts (expect 0 errors / 28 warnings), vitest 79/79, build) into `specs/029-design-tokens-foundation/verification.md`
- [X] T002 [P] Copy the 2026-11-19 walk-through baseline (`docs/bendie-revamp/data/walkthrough.json` and `docs/bendie-revamp/screenshots/stawi_admin/`) to a scratch baseline folder outside the repo, for comparison in T020

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: None. Every story edits only `tailwind.config.js`, `src/globals.css` or `context/*.md`; there's no shared prerequisite beyond Phase 1.

**Checkpoint**: Baseline recorded, so stories can start.

---

## Phase 3: User Story 1: Keyboard users can always see where they are (Priority: P1) 🎯 MVP

**Goal**: One consistent, keyboard-only focus indicator on all interactive controls, with no double rings (FR-007).

**Independent Test**: quickstart §4. Tab through org Overview, event Dashboard, Agenda and Create event: every control shows exactly one indicator, and mouse clicks show none.

### Implementation for User Story 1

- [X] T003 [US1] In `src/globals.css`, add an `@layer base` rule: `:where(a[href], button, [role="button"], [role="tab"], [role="menuitem"], [role="option"], summary, [tabindex]:not([tabindex="-1"])):focus-visible { outline: 2px solid theme('colors.primary'); outline-offset: 2px; }`. It must have **zero specificity** (`:where`) so existing component focus styles win; form fields (`input`, `select`, `textarea`) are deliberately not in the selector (research R2).
- [X] T004 [US1] In `src/globals.css`, add `@layer utilities { .focus-ring { … } }`, giving the same 2px `primary` outline with a 2px offset on `:focus-visible` only. This is the single shared utility required by constitution v2.0.0 Principle V.
- [X] T005 [US1] Verify the two known `outline-none` cases need no change (research R4): `src/components/portal/RowActionsMenu.tsx:113` (has `focus-visible:bg-surface-container-low`) and `src/components/portal/ThemeDesignerModal.tsx:51` (`tabIndex={-1}`). Record the result in `specs/029-design-tokens-foundation/verification.md`.

**Checkpoint**: Focus is visible everywhere it should be (US1 done).

---

## Phase 4: User Story 2: People who prefer reduced motion see no non-essential animation (Priority: P1)

**Goal**: Honour `prefers-reduced-motion` globally without touching components (FR-008).

**Independent Test**: quickstart §5. With reduced motion emulated: no sidebar width animation, no press-scale; spinners and skeletons still animate; hover-intent delay still works.

### Implementation for User Story 2

- [X] T006 [US2] In `src/globals.css`, add `@media (prefers-reduced-motion: reduce)`:
  - `*, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }`
  - `:active { --tw-scale-x: 1 !important; --tw-scale-y: 1 !important; }`
  - Exempt `.animate-spin` and `.animate-pulse` by restoring their animation duration and iteration count.
  - **Don't** change `transition-delay` (research R3).

**Checkpoint**: Reduced motion is honoured (US2 done).

---

## Phase 5: User Story 3: The Studio team can build from documented tokens (Priority: P2)

**Goal**: Add every token in data-model.md under `theme.extend`, namespaced so no existing class changes (FR-001–FR-006, FR-009, FR-010).

**Independent Test**: Every class in `contracts/ui-tokens-contract.md` compiles (appears in a test build when used) and is documented in `context/ui-tokens.md`.

### Implementation for User Story 3

- [X] T007 [US3] In `tailwind.config.js` `theme.extend.borderRadius`, add `'ui-sm': '6px'`, `'ui-md': '10px'`, `'ui-lg': '14px'`. Don't redefine the built-in `sm`/`md`/`lg`/`xl` (research R1).
- [X] T008 [US3] In `tailwind.config.js` `theme.extend.boxShadow`, add `'elev-0': 'none'`, `'elev-1': '0 1px 2px rgba(17,28,45,0.06), 0 1px 3px rgba(17,28,45,0.04)'`, `'elev-2': '0 8px 24px rgba(17,28,45,0.10), 0 2px 6px rgba(17,28,45,0.06)'`, `'elev-3': '0 20px 48px rgba(17,28,45,0.18), 0 4px 12px rgba(17,28,45,0.08)'` (data-model.md).
- [X] T009 [US3] In `tailwind.config.js` `theme.extend.colors`, add `status: { blocking: { fg: '#ba1a1a', bg: '#ffdad6', border: '#ffb4ab' }, warning: { fg: '#8c4f06', bg: '#ffdcc0', border: '#ffb877' }, done: { fg: '#146c2e', bg: '#d6f5dc', border: '#9ad9a8' }, info: { fg: '#00629d', bg: '#cfe5ff', border: '#99cbff' }, neutral: { fg: '#404751', bg: '#e8eeff', border: '#bfc7d2' } }` and `product: { bendie: { fg: '#00629d', bg: '#e3f0fb', dot: '#00629d' }, planner: { fg: '#c2410c', bg: '#fff1e6', dot: '#f97316' } }`. Contrast as in research R5, all ≥4.5:1.
- [X] T010 [US3] In `tailwind.config.js` `theme.extend`, add `height` and `minHeight` entries `row: '44px'`, `'row-compact': '36px'`, `control: '36px'`, `'control-touch': '44px'`.
- [X] T011 [US3] In `tailwind.config.js` `theme.extend`, add `transitionDuration` `{ 'motion-fast': '120ms', 'motion-base': '200ms', 'motion-panel': '300ms' }` and `transitionTimingFunction` `{ 'motion-standard': 'cubic-bezier(0.2, 0, 0, 1)', 'motion-panel': 'cubic-bezier(0.32, 0.72, 0, 1)' }`.
- [X] T012 [US3] In `context/ui-tokens.md`, add a "Studio 2.0 tokens (Feature 029)" section with tables for radius, elevation, status (fg/bg/border + **icon** + "never colour alone"), product ("tags only, never actions"), density, motion (each with its **reduced-motion fallback**), the global focus behaviour and `.focus-ring`. Include one example per family, using only token classes (FR-010, contract).

**Checkpoint**: Tokens are available and documented (US3 done).

---

## Phase 6: User Story 4: Project rules agree with constitution v2.0.0 (Priority: P3)

**Goal**: Reconcile the day-to-day rule files with the amended constitution (FR-011).

**Independent Test**: quickstart §6. Superseded rules are gone or explicitly reconciled, citing the constitution.

### Implementation for User Story 4

- [X] T013 [P] [US4] Update `context/code-standards.md`:
  - "Next.js 14 Conventions" becomes Next.js 15 App Router / React 19.
  - Replace "no service layer / no Server Actions" wording with constitution v2.0.0 Principle II: domain modules in `src/lib/<domain>.ts` taking a passed-in Supabase client, required when logic has more than one caller, created on demand; still no Server Actions or repository/ORM.
  - In Dependencies, add "headless primitives (Radix UI primitives, TanStack Table/Virtual, cmdk) allowed when pinned and listed here; none installed yet".
- [X] T014 [P] [US4] Update `context/ui-rules.md`:
  - Replace "Add/edit forms … are always a FormModal" with Inspector (list records) / Sheet (short tasks), FormModal valid until a page is migrated, and the inline-panel ban kept (with its history).
  - Add rules: shared focus ring (`.focus-ring`; never remove focus without a replacement), reduced motion (every motion needs a fallback), status never by colour alone.
  - Cite constitution v2.0.0 Principle V.
- [X] T015 [US4] Grep `context/code-standards.md` and `context/ui-rules.md` for "Next.js 14", "no service layer", "always a `FormModal`" and "component library"; confirm each remaining hit is reconciled. Note that `context/architecture.md` is deliberately deferred (research R7) in `specs/029-design-tokens-foundation/verification.md`.

**Checkpoint**: Rules are consistent (US4 done).

---

## Phase 7: Polish & Cross-Cutting Concerns (verification)

- [X] T016 Run `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run build` (placeholder env); record the results in `specs/029-design-tokens-foundation/verification.md`. Expected: same as the T001 baseline. Also confirm FR-012: `git diff --stat redesign -- package.json package-lock.json supabase/migrations` is empty.
- [X] T017 Confirm the new classes compile. Temporarily add `src/app/__token-check.tsx` (inside a path Tailwind scans; **not** outside `src/`) that references `rounded-ui-md shadow-elev-2 bg-status-done-bg text-product-planner-fg h-row duration-motion-panel ease-motion-panel`. Build, confirm each class appears in the generated CSS, then **delete the file** before committing. Record in verification.md.
- [X] T018 Start `next dev` against the **test** environment (`set -a; source .env.test.local; set +a; npm run dev`, in the background); every Playwright script keeps the production-request guard from `tools/walkthrough.py` so it aborts if production is reached. Then the keyboard focus check (quickstart §4, SC-001) on the test env with Playwright: Tab through 4 screens, screenshot focused controls, confirm single indicators and no indicator after a click. Save evidence under `specs/029-design-tokens-foundation/evidence/`.
- [X] T019 Reduced-motion check (quickstart §5, SC-002) with `emulateMedia({ reducedMotion: 'reduce' })`: sidebar expand, button press, dialog open and close; confirm no positional or scale animation and that spinners still run. Record in verification.md.
- [X] T020 Visual and access regression (SC-003, SC-004): re-run `docs/bendie-revamp/tools/walkthrough.py` against the test env; diff screenshots against the T002 baseline (pixel diff, flagging non-data differences) and diff `walkthrough.json` access results per role and path. Record in verification.md. **Don't** commit the regenerated baseline screenshots unless they're intentionally updated.
- [X] T021 Run `/imprint` to record the new token families and the global focus/motion behaviour in `context/ui-registry.md`.
- [X] T022 Update `context/progress-tracker.md` with a Feature 029 entry (constitution VII).
- [ ] T023 Run `/review`, then `/speckit-converge`, before declaring done (constitution VIII).

---

## Dependencies & Execution Order

- **Phase 1** (T001–T002) → everything else.
- **US1** (T003–T005) and **US2** (T006) both edit `src/globals.css`, so do them **sequentially** (same file).
- **US3** (T007–T011) all edit `tailwind.config.js`, so sequential; T012 (docs) after T007–T011.
- **US4** (T013, T014) touch different files, so they can run in parallel with each other and with US1–US3.
- **Polish** (T016–T023) after all stories.

## Parallel Example

```text
In parallel: T013 (code-standards.md) | T014 (ui-rules.md) | T003→T004→T006 (globals.css) | T007→…→T011 (tailwind.config.js)
```

## Implementation Strategy

- **MVP:** US1 (focus ring), the main accessibility win, verified with T018.
- **Increment 2:** US2 (reduced motion).
- **Increment 3:** US3 tokens + docs (unblocks the app-shell feature).
- **Increment 4:** US4 rule reconciliation.
- Then the polish/verification gate. Each increment leaves every page looking as it did (FR-009).
