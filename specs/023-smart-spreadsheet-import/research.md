# Research: Smart Spreadsheet Import (Feature 023)

All decisions below were made against current `main` (`4c1c805`) and the unmerged Codex branch `origin/codex/ux-foundations-smart-import` (`45a2a91`, merge base `422c743`). No live-database facts are involved: this feature has no schema, RLS or server-route change.

## R1. How to bring the Codex work in

- **Decision**: Rebuild on a fresh branch from `main`, porting files selectively. Don't rebase or merge the Codex branch.
- **Rationale**:
  - The branch is 8 commits behind `main`. A trial merge conflicts in `CsvImportModal.tsx`, `context/progress-tracker.md` and `context/ui-registry.md`.
  - It mixes in out-of-scope UX changes (sidebar, `globals.css`, wording, `OrganizationHome`, `TopHeader`, `CreateEventModal`, `ManageModulesModal`, `basics`, event `layout`) that the user asked to leave behind.
  - Its spec folder numbers (`020`, `021`) collide with shipped features on `main`.
- **What is ported**:
  - `src/lib/spreadsheetImport.ts` and `src/lib/spreadsheetImport.test.ts` from `45a2a91`, corrected per R3–R6.
  - Only the `aliases?: string[]` addition to `ColumnSpec` in `src/lib/csvImport.ts`.
  - The mapping, sheet-picker and download UI from the Codex `CsvImportModal.tsx`, hand-merged into `main`'s version.
  - `exceljs` and `vitest` in `package.json`, plus a `test` script.
- **Not ported**: commit `d013ddf` (AI mapping) in full; the Prettier-only reformatting of `csvImport.ts`; the stricter Papa error rejection in `parseCsvFile` (see R4); every non-import file.
- **Alternatives considered**: rebase then revert the UX files (noisier history, same conflict work); cherry-pick `45a2a91` (pulls every UX file in).

## R2. When the matching step is skipped (FR-008)

- **Decision**: Skip the matching step only when both of these hold:
  1. Today's acceptance check passes: every required column key is present, ignoring case and surrounding spaces.
  2. No heading that isn't a template key resembles a template field the file doesn't already cover.

  When it's skipped, the rows go to `parseRow` **unchanged**, byte-for-byte as today.
- **Rationale**:
  - Codex's `suggestColumnMappings` marks only a byte-identical key as `'exact'`. A key that differs only in case scores 0.97, which becomes `'suggested'` and forces a mapping step for files that import directly today. That breaks spec User Story 2.
  - Condition 2 stops the opposite problem. A file with every required key plus "Company / Org" would otherwise skip mapping and silently lose the optional organization value. That loss happens today, but this feature exists to fix exactly that.
  - Extra columns that resemble nothing (e.g. a notes column the template lacks) don't trigger mapping.
- **Implementation note**: classify a match as `'exact'` when the trimmed header equals the key ignoring case. This changes Codex's `score === 1` rule. Add a pure helper `needsColumnReview(headers, columns, mappings)` that encodes both conditions, with unit tests.
- **Alternatives considered**: always show the step for non-byte-identical headers (regresses today's files); never show it when required keys are present (keeps the silent loss of optional fields).

## R3. Unmatched source columns pass through

- **Decision**: `applyColumnMappings` produces rows holding (a) each template key with its mapped source value, plus (b) every source column that isn't mapped, under its original heading, unless that heading equals a template key ignoring case.
- **Rationale**: screens read values through `getField(raw, key)` across more than 100 keys. Not every key read can be proven to be in that screen's `ColumnSpec[]`. Codex's version keeps only mapped keys, so any column a screen reads outside its template would vanish. Passing unmatched columns through preserves today's behaviour (FR-014) at no cost.
- **Alternatives considered**: drop unmapped columns (risks silent data loss); audit all 19 screens' parsers (expensive, and fragile as screens change).

## R4. CSV leniency stays as today (FR-007, FR-003 narrowed)

- **Decision**:
  - `parseCsvFile` and `parseCsvText` are unchanged.
  - The CSV path does **not** add Codex's duplicate-header rejection, empty-file rejection or 5,000-row and 10 MB limits.
  - Those checks apply to `.xlsx` only.
  - Spec FR-003 and its edge cases were narrowed to say this (recorded in the spec).
- **Rationale**: Codex rejected a CSV on any Papa warning (e.g. `TooFewFields` on a ragged last row) and on more than 5,000 rows. Both would reject CSVs that import today.

## R5. Excel cell conversion (FR-006)

- **Decision**: replace Codex's `cellText` with a converter that handles each cell type:

  | Cell value (exceljs) | Text produced |
  |---|---|
  | `Date` whose UTC date is 1899-12-30 or 1899-12-31 (Excel time-only serial) | `HH:MM` from UTC hours and minutes |
  | `Date` with a non-zero UTC time on a real date | `YYYY-MM-DD HH:MM` (accepted by `parseFlexibleDate`) |
  | `Date` at UTC midnight | `YYYY-MM-DD` |
  | Formula `{ result }` | the result, converted by this table |
  | Rich text `{ richText }` | concatenated text |
  | Hyperlink `{ text, hyperlink }` | `text` |
  | Error `{ error }` (e.g. `#N/A`) | empty |
  | `boolean` | `true` / `false` (accepted by `parseFlexibleBoolean`) |
  | `number` | `String(n)` |

- **Rationale**: exceljs gives date cells as UTC-based `Date` values, so reading UTC parts avoids a time-zone day shift. Using local getters, or `toISOString` on a value built from local time, could shift the date.
  - **Bug fixed:** Codex's `toISOString().slice(0,10)` turns a `09:00` time cell into `1899-12-30`, which breaks Agenda, Production and Flights times.
- **Verification**: unit tests for each row of the table, run in at least two time zones (`TZ=UTC` and `TZ=Africa/Nairobi` via the `vitest` env).

## R6. Row numbers in messages and the error report (FR-017)

- **Decision**: `ParsedSheet` gains an optional `rowNumbers: number[]`, the real worksheet row of each data row, filled by the Excel reader. The modal's `sheetRow(rowIndex)` uses it when present and otherwise keeps today's `rowIndex + 2`. Messages keep today's "row number plus first value" label.
- **Rationale**: an Excel heading row is often not row 1 (title rows above it), and blank rows are skipped. Without this, Excel row numbers in messages would be wrong. CSV numbering is unchanged.

## R7. Downloads (FR-016–FR-018)

- **Decision**:
  - **Corrected CSV**: available in the preview step whenever there are no missing required columns. Headings are the template **keys** in `ColumnSpec` order, the same headings as `downloadCsvTemplate`, so re-uploading skips mapping (User Story 3, scenario 3). Unmatched optional fields are blank. Pass-through columns are not included.
  - **Error report**: available in the result step when any row was invalid or failed. Columns are `Row`, `First value`, `Reason`, using the same humanized and readable messages the screen shows.
  - Both are built with `Papa.unparse` and downloaded through a blob link: the existing `downloadCsvTemplate` pattern, refactored into a shared `downloadCsv(filename, headers, rows)` in `csvImport.ts`, which the template download then uses. Nothing is sent over the network.
- **Filename**: `<templateFilename stem>-corrected.csv` and `<stem>-errors.csv`.

## R8. Excel library and bundle

- **Decision**: `exceljs@^4.4.0`, loaded with `await import('exceljs')` only inside the `.xlsx` branch.
- **Rationale**: it's the library Codex chose, it reads `.xlsx` in the browser, and it's MIT-licensed. The dynamic import keeps it out of every page's initial bundle (spec assumption).
  - **Rejected, SheetJS (`xlsx`):** the npm-published build is stale and has had advisories.
- **Verification**: `npm run build` must succeed, with `exceljs` appearing only in a lazily loaded chunk (check the build output).
- **Advisory (after `/review`)**: `exceljs` 4.4.0 depends on `uuid` 8.x (advisory GHSA-w5hq-g745-h8pq, fixed in 11.1.1). `package.json` `overrides.exceljs.uuid = "11.1.1"` pins the fixed version. 11.x is the newest line that still supports the `require('uuid')` call exceljs makes; its `v4` export is unchanged. Remove the override once exceljs ships a fixed dependency.

## R9. Tests

- **Decision**: add `vitest@^4.1.12` as a dev dependency (was `^2.1.9`, the Codex choice; raised after `/review` because 2.x has published advisories, including a critical one in `tinypool`. 4.1.12 clears them and still supports Node 20; 5.x needs Node ≥ 22.12) and `"test": "vitest run"`, scoped to pure functions in `src/lib/spreadsheetImport.ts` (and `csvImport.ts` helpers touched). There are no component tests, because the repo has no DOM test setup and adding one is out of scope.
- **Rationale**: this is the repo's first test runner. The matching and cell-conversion rules are the risky logic and are pure, so they're cheap to test. The constitution requires existing lint, type-check and build to pass; `npm test` is added to that list for this feature.

## R10. Dialog copy changes

- **Decision**: change only copy that becomes wrong:
  - "Upload CSV file" becomes "Upload file".
  - The pick-step intro mentions Excel.
  - The "What's a CSV file?" tip becomes "Which files can I use?" (CSV or Excel `.xlsx`; `.xls` must be re-saved).
  - The hint "must be the column names shown above (exactly as written)" says headings will be matched for you.
  - **The separate "missing required column" preview panel is retired.** `needsColumnReview` is true whenever a required key is missing, so that panel would be unreachable. The matching step takes over its job: for a required field with no source it says the file has no column for it, lists "Columns we found", and offers the example-spreadsheet download (`/speckit.analyze` I1).
  - The file input `accept` becomes `.csv,.xlsx`.
- **Rationale**: FR-015 keeps the existing behaviour; these strings would otherwise describe behaviour that no longer exists. Wording elsewhere in the Portal is out of scope.

## R11. UI pattern

- **Decision**: the sheet picker is a radio list. The matching step is a table: template field (label plus Required/Optional chip), a `select.input` of source headings plus "— None —", and a status chip (Matched / Suggested / Chosen by you / Not matched). Unmatched-required and duplicate messages use the existing error panel shape. Everything sits inside the existing modal shell, using `.btn-primary`/`.btn-secondary`, `.input` and Material Symbols.
- **Token note**: the existing modal already uses raw `green-*`/`amber-*` classes for its status chips. New markup will use tokens (`text-error`, `bg-error/5`, `bg-tertiary-fixed/40`, `text-primary`, `bg-primary/10`) rather than adding more raw colour classes. The existing ones are left alone (Principle I, no unrelated refactor). This is flagged for `/review`.
- `/imprint` records the column-matching step as a new pattern after implementation.
