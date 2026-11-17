---
description: "Task list for Feature 023 — Smart Spreadsheet Import"
---

# Tasks: Smart Spreadsheet Import

**Input**: Design documents from `specs/023-smart-spreadsheet-import/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/import-module-contract.md](contracts/import-module-contract.md), [quickstart.md](quickstart.md)

**Tests**: Included. The plan (research R9, quickstart) requires unit tests for the pure matching and cell-conversion helpers. There are no component tests (no DOM test setup in the repo).

**Source of ported code**: `origin/codex/ux-foundations-smart-import` at commit `45a2a91`. Read files with `git show 45a2a91:<path>`. **Never** port anything from `d013ddf` (AI mapping), and never port the non-import files (sidebar, `globals.css`, `OrganizationHome`, `TopHeader`, `CreateEventModal`, `ManageModulesModal`, `basics`, event `layout`).

**Invariant for every task**: `CsvImportModal`'s props, and all 19 consumer screens, stay unchanged (contract §1).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 from spec.md

---

## Phase 1: Setup

**Purpose**: dependencies and test runner (research R8, R9)

- [X] T001 Add `exceljs@^4.4.0` to `dependencies`, `vitest@^2.1.9` to `devDependencies`, and the script `"test": "vitest run"` in `package.json`. Run `npm install` so `package-lock.json` updates. Change nothing else in either file.
- [X] T002 Check whether `vitest` resolves the `@/` path alias and supports a per-run `TZ`. Codex's tests used relative imports and no config. Create `vitest.config.ts` at the repo root **only if needed**, for the `@/` → `src/` alias and/or `test.env.TZ`. Then confirm `npx vitest run` reports "no test files" cleanly, and that `npm run type-check` and `npm run lint` still pass.

---

## Phase 2: Foundational (blocks all stories)

**Purpose**: shared helper module and additive `csvImport.ts` changes that every story needs

- [X] T003 [P] In `src/lib/csvImport.ts`, add `aliases?: string[]` (with the comment "Optional human header variants used by the shared spreadsheet mapper.") to `ColumnSpec`. Add an exported `downloadCsv(filename: string, headers: string[], rows: Record<string, string>[])` that builds the CSV with `Papa.unparse({ fields: headers, data: rows.map(r => headers.map(h => r[h] ?? '')) })` and downloads it through the existing blob-link pattern. Make `downloadCsvTemplate` delegate to it with identical output. **Do not** touch `parseCsvFile`, `parseCsvText` or `validateHeaders` (research R4), and do not reformat the file.
- [X] T004 Create `src/lib/spreadsheetImport.ts`, starting from `git show 45a2a91:src/lib/spreadsheetImport.ts`. Keep these exports:
  - `MAX_SPREADSHEET_BYTES` (10 MB), `MAX_SPREADSHEET_ROWS` (5000)
  - the `SpreadsheetImportError` codes
  - `normalizeHeader` with its `TOKEN_ALIASES`
  - token `similarity` and `scoreHeader`

  Then make these changes:
  - (a) Add `rowNumbers?: number[]` to `ParsedSheet` (data-model.md).
  - (b) Make `ColumnMapping.confidence` the union `'exact' | 'suggested' | 'manual' | 'unmapped'`.
  - (c) In `suggestColumnMappings`, mark `'exact'` when `header.trim().toLowerCase() === column.key.toLowerCase()`, not only when `score === 1` (research R2). Keep the "score < 0.6 means `unmapped`" threshold and the rule that each source heading is used only once, best score first.
  - (d) Remove Codex's `downloadCsv` from this file; `csvImport.ts` owns it now (T003).
  - (e) Import `ColumnSpec`/`ParsedCsv` from `./csvImport`.
- [X] T005 In `src/lib/spreadsheetImport.ts`, implement `applyColumnMappings(rows, mappings)` per research R3. Each output row holds every mapped `targetKey` with `row[sourceHeader] ?? ''`, **plus** every source column not used as a `sourceHeader`, under its original heading, unless that heading equals any template key ignoring case. In that case it's dropped, so it can't shadow the mapped value through `getField`'s case-insensitive lookup. `applyColumnMappings` therefore takes the `columns` list, or the template key set, as a parameter; update its signature and the contract (§3) to match.
- [X] T006 In `src/lib/spreadsheetImport.ts`, add the pure helpers:
  - `findDuplicateSources(mappings): string[]`
  - `unmatchedRequired(columns, mappings): ColumnSpec[]`
  - `buildCorrectedRows(rows, columns, mappings)`: template keys only, in `columns` order, unmatched optional fields `''`
  - `needsColumnReview(headers, columns, mappings): boolean`, per research R2. Return `false` only when (1) `validateHeaders(headers, columns)` returns `[]`, **and** (2) no `suggested` mapping exists whose `sourceHeader` is a heading that isn't itself a template key (ignoring case). Otherwise return `true`.
- [X] T007 [P] Create `src/lib/spreadsheetImport.test.ts`, starting from `git show 45a2a91:src/lib/spreadsheetImport.test.ts`. Remove any AI-related cases and add these:
  - case-only and space-only header differences give `'exact'`;
  - label equality, `aliases` and normalized equality give `'suggested'`, e.g. "E-mail" → `email`, "Mobile" → `phone`, "Organisation" → `organization`;
  - "Name" vs a `company_name` field doesn't steal a better match, and a weak match stays `unmapped`;
  - no source heading is suggested twice;
  - `applyColumnMappings` pass-through, including dropping a passthrough that equals a template key ignoring case;
  - `findDuplicateSources` and `unmatchedRequired`;
  - `buildCorrectedRows` column order and blanks;
  - every `needsColumnReview` true/false case from research R2: exact template; case-only; missing required; required present plus a resembling extra heading; required present plus an unrelated extra heading;
  - *(analyze U1)*: required keys present plus one unrelated extra column (e.g. `internal_ref`) gives `false`; the same file plus an extra column resembling an unused optional field gives `true`.

  Run `npm test`; all must pass.

**Checkpoint**: helpers complete and tested. No UI changes yet; `main` behaviour is untouched.

---

## Phase 3: User Story 1 — Import an ordinary Excel workbook (P1) 🎯 MVP

**Goal**: `.xlsx` upload, a sheet picker, a matching step, then today's preview and import.

**Independent Test**: quickstart scenarios 4, 5, 6, 7, 8, 11 on Facilitators.

### Tests for User Story 1

- [X] T008 [P] [US1] In `src/lib/spreadsheetImport.test.ts`, add cell-conversion tests for the research R5 table. Export the converter as `cellText` for testing:
  - `Date` at `1899-12-30T09:00Z` → `09:00`
  - `1899-12-31T13:45Z` → `13:45`
  - `2026-11-20T00:00Z` → `2026-11-20`
  - `2026-11-20T14:30Z` → `2026-11-20 14:30`
  - `{ result: <Date> }` → converted result
  - `{ richText: [{text:'A'},{text:'B'}] }` → `AB`
  - `{ text: 'Site', hyperlink: 'https://…' }` → `Site`
  - `{ error: '#N/A' }` → `''`
  - `true` → `true`
  - `42` → `42`
  - `null` → `''`

  Make the date cases pass under both `TZ=UTC` and `TZ=Africa/Nairobi`: run `TZ=Africa/Nairobi npm test` as well as `npm test`, or use the T002 config.

### Implementation for User Story 1

- [X] T009 [US1] In `src/lib/spreadsheetImport.ts`, replace Codex's `cellText` with the research R5 converter. Read UTC parts (`getUTCFullYear`, `getUTCHours`, …), never local getters or `toISOString` on a value built from local time. Treat a UTC date of 1899-12-30 or 1899-12-31 as time-only.
- [X] T010 [US1] In `src/lib/spreadsheetImport.ts`, implement `parseSpreadsheetFile(file)`:
  - `.csv` → `parseCsvFile(file)` **unchanged**, returned as one sheet `{ name: 'CSV data', headers, rows }` with no duplicate, empty or row-limit checks (research R4).
  - `.xls` → throw `legacy_excel`.
  - Any other non-`.xlsx` extension → throw `unsupported`.
  - `.xlsx` → reject over `MAX_SPREADSHEET_BYTES` (`too_large`), then `await import('exceljs')` (lazy, research R8) and load the workbook.
  - For each worksheet:
    - find the heading row: the first of rows 1–25 with at least 2 non-empty cells, else the first non-empty row;
    - keep only non-empty headings, then run `assertUniqueHeaders` (`duplicate_headers`);
    - build the rows with `cellText` and skip fully blank rows;
    - record each kept row's real worksheet row number in `rowNumbers` (research R6);
    - skip a sheet with no data rows;
    - throw `too_many_rows` when a sheet has more than `MAX_SPREADSHEET_ROWS`.
  - If no sheet remains, throw `empty`.
  - Wrap anything unexpected as `unreadable` (console-log the original). User-facing messages come from contract §4.
- [X] T011 [US1] In `src/components/portal/CsvImportModal.tsx`, extend `Step` to `'pick' | 'sheet' | 'map' | 'preview' | 'result'` and add the state:
  - `sheets: ParsedSheet[]`, `selectedSheetIndex`
  - `sourceRows`, `sourceHeaders`, `sourceRowNumbers?`
  - `mappings: ColumnMapping[]`, `usedMapping: boolean`
  - `reading: boolean` (file is being read)

  Clear all of it in `resetToPick`. Keep every existing prop, state and handler. Port the matching UI ideas from `git show 45a2a91:src/components/portal/CsvImportModal.tsx`, but re-apply them onto **this** file; don't copy Codex's file over it. Keep `replaceOption`, `refineResults`, `previewWarnings` and `importAll` exactly as they work now.
- [X] T012 [US1] In `src/components/portal/CsvImportModal.tsx`, rewrite `handleFile` to set `reading`, call `parseSpreadsheetFile`, and then:
  - show `SpreadsheetImportError.message` in a toast, or otherwise a generic "We couldn't read that file. Choose a CSV or Excel (.xlsx) file and try again." plus `console.error`;
  - go to the `'sheet'` step when there's more than one sheet;
  - otherwise call `startFromSheet(sheet)`.

  Change the file input to `accept=".csv,.xlsx"`.
- [X] T013 [US1] In `src/components/portal/CsvImportModal.tsx`, add `startFromSheet(sheet)`:
  1. Store the source headers, rows and rowNumbers.
  2. Compute `suggestColumnMappings`.
  3. If `needsColumnReview` is false, call the **existing** `applyParsedRows(headers, rows)` with the original rows. That's today's path. It's only reached when every required key is present, so today's missing-required-columns panel can no longer appear. Remove that panel and `headerErrors` state, because the matching step now owns that case (analyze I1, research R10).
  4. Otherwise set `usedMapping = true` and go to `'map'`.
- [X] T014 [US1] In `src/components/portal/CsvImportModal.tsx`, render the `'sheet'` step:
  - heading "Which sheet should we import?";
  - a radio list of `sheets` showing name and "N rows";
  - "Continue" (`btn-primary`) → `startFromSheet(sheets[selectedSheetIndex])`;
  - "Choose a different file" (`btn-secondary`) → `resetToPick`.

  Use tokens only (no raw colour classes) and existing `.btn-*` and `.label` styles.
- [X] T015 [US1] In `src/components/portal/CsvImportModal.tsx`, render the `'map'` step:
  - **Table.** One row per `columns` entry:
    - label plus a Required/Optional chip (same styling as the pick step's column table);
    - a `select.input` of `sourceHeaders` plus "— None —";
    - a status chip: `exact` → "Matched", `suggested` → "Suggested", `manual` → "Chosen by you", `unmapped` → "Not matched".
  - **Change handler.** `updateMapping(targetKey, sourceHeader)` sets `confidence: sourceHeader ? 'manual' : 'unmapped'`.
  - **Error panels.** Show `unmatchedRequired` as "Choose a column for: …" and `findDuplicateSources` as "Each column can only be used once: …", using `bg-error/5 border-error/20 text-error`.
  - **Missing-column guidance (analyze I1).** When any unmatched required field had **no** suggestion at all, the panel also says "Your file has no column for: … Add it to your spreadsheet, or download the example spreadsheet." It lists "Columns we found: …" (`sourceHeaders`) and includes the existing "Download example spreadsheet (CSV)" button (`downloadCsvTemplate`). This replaces today's missing-columns preview panel.
  - **Continue** (disabled until there are no duplicates and no unmatched required fields):
    1. `rows = applyColumnMappings(sourceRows, mappings, columns)`;
    2. set `rawColumns` to the mapped template keys that have a source (preview columns);
    3. `parsed = rows.map(parseRow)`;
    4. `setResults(refineResults ? refineResults(parsed) : parsed)`;
    5. go to `'preview'`.
  - **Back** returns to `'sheet'` when there's more than one sheet, otherwise to `resetToPick`.
- [X] T016 [US1] In `src/components/portal/CsvImportModal.tsx`, change `sheetRow(rowIndex)` to use `sourceRowNumbers[rowIndex]` when present, otherwise `rowIndex + 2` (research R6). Use it in the preview table, the "needs attention" list and the result tables (via `rowLabel`). When row numbers come from Excel, change the "Row numbers count your header as row 1 and skip blank lines…" note to "Row numbers match your worksheet." Keep the existing note for CSV and paste.
- [X] T017 [US1] In `src/components/portal/CsvImportModal.tsx`, in the `'preview'` step: when `usedMapping`, add a "Change column matches" `btn-secondary` that returns to `'map'` with mappings kept. The preview no longer has a missing-columns branch (T013). The Import button's existing rules (disabled at 0 valid rows, while importing or while preparing) are unchanged.
- [X] T018 [US1] In `src/components/portal/CsvImportModal.tsx`, update only the copy listed in research R10:
  - "Upload CSV file" → "Upload file";
  - the pick intro mentions Excel (.xlsx);
  - the `DismissibleTip` becomes "Which files can I use?" (CSV or Excel .xlsx; .xls must be re-saved). Keep the same `id` semantics: change the `id` to `csv-which-files` so the new tip shows once;
  - the hint "must be the column names shown above (exactly as written)" says headings that differ will be matched for you;
  - the template button label "Download example spreadsheet (CSV)" is unchanged.

  Show a reading state ("Reading file…" with the `progress_activity` symbol, `animate-spin`) while `reading` is true.

**Checkpoint**: quickstart scenarios 4–8 and 11 pass in the browser on Facilitators.

---

## Phase 4: User Story 2 — Existing template files work exactly as before (P1)

**Goal**: no regression on any of the 19 screens; paste uses the same matching.

**Independent Test**: quickstart scenarios 1, 2, 3, 12.

- [X] T019 [US2] In `src/components/portal/CsvImportModal.tsx`, route `handleParsePastedText` through the same flow:
  - keep today's `parseCsvText` and today's "No rows found…" toast;
  - then call `startFromSheet({ name: 'Pasted rows', headers, rows })`, so pasted label headings get the matching step and pasted template headings go straight to preview (FR-013).

  Don't add Excel-only checks to paste.
- [X] T020 [US2] Code-check `src/components/portal/CsvImportModal.tsx` against contract §1. Confirm by reading the code that:
  - on the skip path, `parseRow` receives the untouched `rows` from `parseCsvFile`/`parseCsvText`;
  - `refineResults` runs on both paths;
  - `previewWarnings`, `beforeImport`, `importAll` and `replaceOption` code is byte-identical to `main` apart from row-label changes;
  - `git diff main -- src/app src/components/portal/BreakoutAssignmentsModal.tsx src/components/portal/PlannerTeamAccessPanel.tsx src/lib/csvImport.ts` shows no consumer changes and only T003's additive `csvImport.ts` change.

  Record the result in this file's Verification note.
- [X] T021 [US2] Browser-verify against a test event, comparing with `main`, and record pass/fail per scenario in the Verification note:
  - quickstart scenario 1 with a full import on Facilitators, Planner Tasks, Planner Checklist (existing items, using Replace) and Agenda (breakout rows);
  - scenarios 2, 3 and 12;
  - *(analyze C1)*: on **each of the other 15** import screens (Networking, People, Planner Vendors, Excursions, Expo, FAQs, Planner People, Planner Agenda, Activities, News, Planner Logistics, Members, Planner Production, the breakout-assignments modal, Planner team access), upload that screen's own downloaded template, filled in. Confirm it goes straight to preview with the same ready/needs-attention counts as `main`; no import is needed.

  *(analyze U1)*: note any screen whose own template unexpectedly shows the matching step. Agenda, Planner Logistics and Members have the richest parsers.

**Checkpoint**: US1 + US2 together are the shippable MVP.

---

## Phase 5: User Story 3 — Get a clean CSV and an error list (P2)

**Goal**: corrected-CSV and error-report downloads, both produced in the browser.

**Independent Test**: quickstart scenarios 9, 10, 13.

- [X] T022 [US3] In `src/components/portal/CsvImportModal.tsx`, preview step (always shown there, since the preview is only reached with every required column present): add "Download corrected CSV" (`btn-secondary text-sm py-1.5`, `download` symbol). It calls `downloadCsv(\`${stem}-corrected.csv\`, columns.map(c => c.key), buildCorrectedRows(...))`, where `stem` is `templateFilename` without `.csv`:
  - when `usedMapping`, build from `sourceRows` and `mappings`;
  - on the skip path, build from the original rows, using `getField` per key.
- [X] T023 [US3] In `src/components/portal/CsvImportModal.tsx`, result step (when `invalidRows.length + failedDuringImport.length > 0`): add "Download error report". It calls `downloadCsv(\`${stem}-errors.csv\`, ['Row', 'First value', 'Reason'], …)`:
  - invalid rows first: `sheetRow(rowIndex)`, `firstValue(raw)`, `errors.map(humanizeRowError).join(' ')`;
  - then failed rows: the same, with `readableImportError(error)`. These are the same strings shown on screen.
- [X] T024 [US3] Browser-verify quickstart scenarios 9, 10 and 13. Use devtools Network to confirm no request carries sheet contents before the screen's own import writes (FR-018, SC-006). Record the results in the Verification note.

---

## Phase 6: Polish & cross-cutting

- [X] T025 Run `npm run type-check`, `npm run lint`, `npm test` (also with `TZ=Africa/Nairobi`) and `npm run build`; all must pass. In the build output, confirm `exceljs` is only in a lazily loaded chunk, not the shared first-load JS (research R8). Record the results.
- [X] T026 Browser-verify quickstart scenarios 11 (all four rejections), 14 (5,000-row workbook under 10 s) and 15 (close mid-way). Record the results. *(analyze A2)*: reading runs on the page's main thread, so note whether the "Reading file…" indicator freezes on the large workbook. That's a known limitation, not a failure, if it stays under 10 s.
- [X] T027 [P] Update the docs:
  - `context/architecture.md`: stack table CSV row becomes "`papaparse` + `exceljs` (lazy) — shared import dialog", and add a Testing row for `vitest`.
  - `context/library-docs.md`: correct the stale "facilitators only" CSV note and add `exceljs` and `vitest` entries.
  - `specs/015-bendie-planner-csv-import/spec.md`: add a short "Updated — Feature 023" note under the CSV support matrix. It covers `.xlsx`, column matching and downloads on all import screens, and supersedes the line "Column-alias matching … remains deliberately unimplemented".
  - `context/progress-tracker.md`: add a Feature 023 entry (Principle VII).
- [X] T028 Run `/imprint` to record the column-matching step and sheet-picker pattern in `context/ui-registry.md`, and update its `CsvImportModal` entry.
- [X] T029 Run `/review` (plan alignment, system integrity, production readiness). Include the flagged item: pre-existing raw `green-*`/`amber-*` classes in `CsvImportModal`. Report findings before fixing anything.
- [X] T030 Run `/speckit.converge`, resolve the important gaps, then `/remember save`. Leave the Codex branches untouched. Don't commit or push unless the developer asks.

---

## Dependencies & Execution Order

- **Setup (T001–T002)** → **Foundational (T003–T007)** → user stories.
- **US1 (T008–T018)** depends on Foundational. T009 and T010 depend on T008's export decision. T011 comes before T012–T018, which touch the same file and run in order.
- **US2 (T019–T021)** depends on US1's `startFromSheet` (T013). T020 and T021 verify US1 + US2 together.
- **US3 (T022–T024)** depends on T003 (`downloadCsv`), T006 (`buildCorrectedRows`) and T016 (`sheetRow`). It can start after T016.
- **Polish (T025–T030)** comes after all stories. T029 comes before T030.

### Parallel opportunities

- T003 ∥ T004–T006, which are different files (`csvImport.ts` vs `spreadsheetImport.ts`).
- T007 ∥ T005/T006 once T004's exports exist: write the tests against the contract, then make them pass.
- T008 ∥ T011, which are different files (test file vs modal).
- T027 ∥ T025/T026.
- `CsvImportModal.tsx` tasks (T011–T019, T022–T023) are one file and run in order.

## Parallel example: User Story 1

```text
Together:  T008 cell-conversion tests (spreadsheetImport.test.ts)
           T011 modal state/steps scaffold (CsvImportModal.tsx)
Then:      T009 → T010 (spreadsheetImport.ts) alongside T012 → T018 (CsvImportModal.tsx)
```

## Implementation Strategy

1. **MVP = US1 + US2.** Excel import with matching, plus a proven no-regression guarantee. Both are P1 and ship together: US1 without US2's verification would risk all 19 screens.
2. **Then US3.** The downloads are an independent increment on the same dialog.
3. Stop at each checkpoint and validate in the browser before moving on.

## Verification note

**2026-11-16 (`/speckit.implement`)**

- **T002:** no `vitest.config.ts` needed. Tests use relative imports, and `TZ` is set per run.
- **T004 deviation, recorded:** suggestions are assigned in two passes. Exact key matches go first, then the remaining headings are suggested best-score-first across all fields. Codex's per-field greedy loop let an earlier field take a heading that was a later field's exact key. Covered by a test.
- **T007/T008:** `npm test`: 38 tests pass under `TZ=UTC`, `TZ=Africa/Nairobi` and `TZ=America/Los_Angeles`. That includes a real exceljs round trip: title row, blank rows, a date cell and `09:00` time cells give `2026-11-20` / `09:00`, with worksheet row numbers `[4, 6]`.
- **T020 (code check):** PASS.
  - `git diff main` shows no change to any consumer screen or other `src` file. `csvImport.ts` has only the additive `aliases` and `downloadCsv`.
  - `handleImport` (`beforeImport`, `importAll`, per-row loop, `replaceOption`) is byte-identical to `main`.
  - On the skip path, rows reach `parseRow` unchanged from `parseCsvFile`/`parseCsvText`. `refineResults` runs on both paths.
  - The only removed behaviour is the old missing-columns preview panel, replaced by the matching step (analyze I1).
  - A filled-in copy of any screen's own downloaded template uses the exact `ColumnSpec.key` headings, so every column is `exact` and no heading is left to suggest. `needsColumnReview` is therefore false and the file skips matching, for all 19 screens. This is a code-level guarantee; T021 still confirms it in the browser.
- **T025:** `type-check` PASS, `lint` PASS (pre-existing warnings only), `npm test` PASS. `npm run build`: without env vars, compilation succeeds but page-data collection stops at "Supabase URL and API key are required". This checkout has no `.env.local`, which is environmental, not this feature. With placeholder (fake) values the build PASSES. `exceljs` is only in its own lazy chunk (`6edf0643…js`, ~912 KB), not in the shared first-load JS or any page chunk.
- **T021, T024, T026 (browser acceptance): PASS (2026-11-17, developer).** Run on a test event with a generated Facilitators test set (template CSV, case-changed CSV, pasted label rows, label `.xlsx`, messy `.xlsx` with a merged title row, blank row, Phone + Mobile, formula cell and two invalid rows, two-sheet workbook, 6,000-row CSV, 5,000- and 5,001-row workbooks, `.xls` / `.pdf` / broken `.xlsx`). All behaved as specified: straight-to-preview for template files; matching step, blocking and "Chosen by you"; real worksheet row numbers; both downloads; corrected CSV re-import skipping matching; nothing sent before Import (Network tab); 5,000-row workbook under 10 s; all rejections with the planned messages. Each other import screen's own template went straight to preview; Planner Tasks, Planner Checklist (Replace) and Agenda (breakout rows) imported as before.
- **`/review` fixes (2026-11-16), the three Important findings:**
  1. **Merged title rows:** heading detection now ignores cells that are only merged copies (exceljs `isMerged`/`master`). A title merged across the top is skipped, and a one-column sheet with a merged heading still reads as one column. Two separate cells that both say "Name" are still rejected.
  2. **Same-meaning columns:** the Excel duplicate-heading check compares the text as written (ignoring case and spaces), not folded meanings. "Phone" + "Mobile" and "Email" + "E-mail" are now accepted.
  3. **Package advisories:** `vitest` went from ^2.1.9 to ^4.1.12, and `overrides.exceljs.uuid = 11.1.1`. `npm audit` has 19 findings, all already present on `main` (which has 21). None come from the packages this feature adds.

  Re-verified: 42 tests pass (UTC, Africa/Nairobi, America/Los_Angeles), type-check and lint pass, and the placeholder-env build passes with `exceljs` still only in its lazy chunk.
- **Note:** `tsconfig.tsbuildinfo` was rewritten by `tsc`. The repo commits this file (see the "chore: update tsconfig.tsbuildinfo" history), so it's left as is.

---

## Phase 7: Convergence

*Added by `/speckit.converge` (2026-11-17). All are LOW and match the Minor `/review` findings the developer chose to leave for now. Implement them, or record them as accepted.*

- [X] T031 In `src/lib/spreadsheetImport.ts` `cellText` (and its tests in `src/lib/spreadsheetImport.test.ts`), show percent-formatted number cells as displayed (e.g. `0.15` with `numFmt` `0%` → `15%`), per FR-006 (partial). Pass the cell's `numFmt` from `readWorksheet`. Leave other number formats as plain numbers unless FR-006 is narrowed to say so.
- [X] T032 In `src/lib/spreadsheetImport.ts` `applyColumnMappings`, emit the mapped template keys first (in `columns` order) and the passed-through columns after them, so `firstValue(raw)` in `src/components/portal/CsvImportModal.tsx` row labels and the error report show the record's identifying value, per FR-017 / US3/AC2 (partial). Update the R3 test for key order.
- [X] T033 In `src/components/portal/CsvImportModal.tsx` matching step, leave empty headings out of the "Your column" options (the CSV parse itself stays unchanged per FR-007), per FR-011 (partial).
- [X] T034 Review the two unrequested matching-path tweaks in `src/components/portal/CsvImportModal.tsx`: template labels in the preview header (`columnLabel`), and `flex-wrap` on the preview action row. Either record them in `specs/023-smart-spreadsheet-import/plan.md` (Design → preview) or revert them, per plan: dialog flow (unrequested).

**Convergence pass (2026-11-17):**
- **T031:** percent-formatted cells read as displayed (`15%`, `12.5%`); other number formats stay plain numbers.
- **T032:** mapped template keys come first, so row labels and the error report show the identifying value.
- **T033:** blank headings are left out of the matching options and the "Columns we found" list.
- **T034:** kept, and recorded in `plan.md`.

Re-verified: 50 tests pass (UTC, Africa/Nairobi, America/Los_Angeles); `tsc` and lint exit 0; the placeholder-env build passes. The first attempt failed only on the Google Fonts download for `Plus_Jakarta_Sans` (network) and passed on retry.
