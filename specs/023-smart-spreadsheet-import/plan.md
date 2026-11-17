# Implementation Plan: Smart Spreadsheet Import

**Branch**: `023-smart-spreadsheet-import` | **Date**: 2026-11-16 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/023-smart-spreadsheet-import/spec.md`

## Summary

The shared import dialog (`CsvImportModal`, used by 19 screens) gains:
- `.xlsx` upload, with a sheet picker;
- a rule-based "match your columns" step, shown only when it's useful;
- a corrected-CSV download and an error-report download.

The work is a selective port of the unmerged Codex branch `codex/ux-foundations-smart-import` (`45a2a91`), rebuilt on current `main` so Feature 020–021's replace, cross-row, warnings and grouped-import options keep working. Only the import capability is ported; that branch's UX changes and the AI commit (`d013ddf`) stay out.

Four corrections to the Codex logic come from research:
- headings that differ only in case count as exact (R2);
- unmatched columns pass through (R3);
- CSV parsing stays as lenient as today (R4);
- Excel time and date cells convert correctly (R5).

No screen, database, RLS or route changes.

## Technical Context

**Language/Version**: TypeScript 5.3, React 18.3, Next.js 14.2 App Router (client component)

**Primary Dependencies**: existing `papaparse` ^5.5.4. New: `exceljs` ^4.4.0 (runtime, lazy-loaded; its `uuid` pinned to 11.1.1 via `overrides`) and `vitest` ^4.1.12 (dev). *(Versions changed after `/review`, 2026-11-16: `vitest` 2.x and `exceljs`'s default `uuid` carried published advisories.)*

**Storage**: N/A (browser memory only; nothing persisted)

**Testing**: `vitest run` for pure helpers (new `npm test`). Existing `npm run type-check`, `npm run lint`, `npm run build`. Manual scenarios in [quickstart.md](quickstart.md).

**Target Platform**: Desktop browsers used by Portal admins (Chrome, Edge, Safari, Firefox current)

**Project Type**: Web application (single Next.js app, `src/`)

**Performance Goals**: A 5,000-row, 10 MB workbook reaches the matching step in under 10 s (SC-005). No added weight on initial page loads (exceljs is lazy).

**Constraints**:
- `CsvImportModal` props are unchanged.
- Rows that skip matching reach `parseRow` byte-for-byte as today.
- No network I/O for spreadsheet content.
- No new size or row limit on CSV or paste.

**Scale/Scope**: 1 shared component, 2 lib files (1 new, 1 additive), 1 new test file, `package.json`, docs. 19 consumer screens verified, none edited.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design: still passes.*

| Principle | Result | Notes |
|---|---|---|
| I. Brownfield preservation | PASS | Extends the existing shared importer instead of building a parallel one. Template files keep today's exact path (R2), unmatched columns pass through (R3), CSV leniency is unchanged (R4). The Codex UX changes are excluded as unrelated. |
| II. Architecture boundaries | PASS | Client-only. No Server Actions, service layer or routes. New helpers live in `src/lib/` beside `csvImport.ts`. |
| III. Supabase & DB safety | PASS (N/A) | No schema, RLS or `types/database.ts` change. No migration. |
| IV. Security | PASS | No secrets or env vars. Spreadsheet data stays in the browser (FR-018). Writes still go through each screen's existing, already-authorized import path. No new dependency runs server-side. |
| V. UI consistency | PASS, with a flag | Reuses the modal shell, `.btn-*`, `.input`, tokens and Material Symbols. New markup uses tokens only. The modal's existing raw `green-*`/`amber-*` classes are left as they are (no unrelated refactor) and flagged for `/review`. `/imprint` follows for the new matching-step pattern. |
| VI. Scope discipline | PASS | AI mapping, per-screen aliases and cross-module splitting are explicitly out. Spec FR-003 was narrowed during planning to remove a self-contradiction with FR-007, and the change is recorded in the spec. |
| VII. Documentation | PASS (planned) | `progress-tracker.md`, `architecture.md` (stack table: exceljs, vitest; CSV row), `library-docs.md`, `ui-registry.md` (via `/imprint`), `specs/015` CSV matrix note. No new competing doc. |
| VIII. Verification | PASS (planned) | type-check, lint, build, plus new `npm test`. Loading, error and empty states for the new steps: reading-file spinner, every rejection in the contract table, and "no populated sheet". `/review` before done. |
| IX. Spec Kit + JSM | PASS | This plan is authoritative. `/architect` output (2026-11-16 session) is folded in, not kept as a competing plan. |

No violations, so **Complexity Tracking** is empty.

## Project Structure

### Documentation (this feature)

```text
specs/023-smart-spreadsheet-import/
├── spec.md
├── plan.md                         # this file
├── research.md                     # R1–R11 decisions
├── data-model.md                   # in-memory entities and dialog steps
├── quickstart.md                   # automated + manual validation
├── contracts/
│   └── import-module-contract.md   # modal props, helper API, messages
├── checklists/requirements.md
└── tasks.md                        # /speckit-tasks (not yet created)
```

### Source Code (repository root)

```text
src/
├── components/portal/
│   └── CsvImportModal.tsx          # EDIT: new sheet/map steps, downloads, copy (R10), row numbers (R6)
└── lib/
    ├── csvImport.ts                # EDIT (additive): ColumnSpec.aliases, shared downloadCsv
    ├── spreadsheetImport.ts        # NEW: ported from 45a2a91 + R2/R3/R5/R6 corrections
    └── spreadsheetImport.test.ts   # NEW: ported + extended tests
package.json / package-lock.json    # EDIT: exceljs, vitest, "test" script
vitest.config.ts                    # NEW only if the '@/…' alias or TZ matrix needs it (Codex worked without one)
context/{architecture,library-docs,progress-tracker,ui-registry}.md, specs/015-bendie-planner-csv-import/spec.md  # docs
```

**Untouched (verified, not edited)**: the 19 consumer screens listed in research R1 and spec Background.

**Structure Decision**: single Next.js app, existing `src/lib` + `src/components/portal` layout. No new folders.

## Design

### Dialog flow

```text
pick ──▶ (xlsx with >1 populated sheet) sheet ──▶ (needsColumnReview) map ──▶ preview ──▶ result
  └─ csv / paste / single-sheet xlsx ─────────────▶ (needsColumnReview?) ─────┘
```

1. **pick**
   - `accept=".csv,.xlsx"`.
   - The file goes to `parseSpreadsheetFile`; pasted text goes to `parseCsvText`, wrapped as one sheet.
   - A reading indicator shows while an `.xlsx` loads.
   - `SpreadsheetImportError` messages go to the toast; anything else gets a generic message plus a console log.
2. **sheet**
   - Radio list of populated sheets (name and row count).
   - Continue selects the sheet. Back returns to pick.
3. **Decide**
   - Run `suggestColumnMappings`.
   - If `needsColumnReview` is false, go to preview **with the original rows** (today's path, including today's missing-required-columns panel).
4. **map**
   - Table of template fields, each with a source select and a status chip.
   - Shows the unmatched-required and duplicate messages.
   - Continue (disabled until ready) runs `applyColumnMappings`, then `parseRow`, then `refineResults`. Back returns to sheet or pick.
5. **preview**
   - Unchanged, plus "Download corrected CSV" and, when the mapping step was used, "Change column matches".
   - Row numbers use `rowNumbers` when present.
   - *(Accepted after `/review` and `/speckit.converge`, T034, 2026-11-17.)* When the mapping step was used, the preview's column headings show the template **labels** ("Full name") instead of keys, because the user just matched against labels. Files that skip matching still show their own headings, as before. The action row is `flex flex-wrap` so the extra buttons wrap on narrow screens.
6. **result**
   - Unchanged, plus "Download error report" when any rows weren't imported.

### Porting map (Codex, then this plan)

| Codex `45a2a91` | Here |
|---|---|
| `spreadsheetImport.ts` parsing, normalization, scoring | kept |
| `confidence: score === 1 ? 'exact'` | case-insensitive exact (R2), and a `manual` state added |
| `applyColumnMappings` drops unmapped columns | pass-through (R3) |
| CSV wrapper adds duplicate, empty and row-limit checks; `parseCsvFile` rejects on Papa errors | CSV untouched (R4) |
| `cellText` (`toISOString` for every Date) | typed conversion table (R5) |
| no worksheet row numbers | `rowNumbers` (R6) |
| `downloadCsv` in `spreadsheetImport.ts` | shared `downloadCsv` in `csvImport.ts`, template download reuses it (R7) |
| error-report download | kept; columns `Row`, `First value`, `Reason` (R7) |
| `CsvImportModal` rewrite on old base | re-applied onto `main`'s modal, keeping `replaceOption`, `refineResults`, `previewWarnings`, `importAll` |
| AI hooks (`d013ddf`), sidebar, `globals.css`, wording, home-page | not ported |

### Risks

| Risk | Mitigation |
|---|---|
| A consumer reads a column outside its template | pass-through (R3); quickstart scenario 1 covers the screens with the richest parsers |
| exceljs bundle or polyfill issues in Next 14 | lazy `import()`; `npm run build` gate; verify in the browser with a real `.xlsx` |
| Over-eager suggestion fills a wrong optional field | every non-exact match is shown for confirmation; 0.6 threshold; tests for near-miss headings ("Name" vs "Company Name") |
| Row numbers differ between preview and error report | single `sheetRow` helper used by both |
| First test runner conflicts with the `tsconfig` / Next lint | Codex ran `vitest`, `tsc` and lint clean on the same setup; re-verify on `main` |

## Complexity Tracking

Empty: no constitution violations.
