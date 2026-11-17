# Data Model: Smart Spreadsheet Import (Feature 023)

Nothing is stored. Every entity below lives only in browser memory while the import dialog is open, and is discarded when it closes (spec edge case "closes the dialog mid-way"). There is no database table, column or RLS change.

## ColumnSpec (existing, extended)

`src/lib/csvImport.ts`. One template field a screen's import expects.

| Field | Type | Notes |
|---|---|---|
| `key` | string | Template heading and the key screens read through `getField`. Unchanged. |
| `label` | string | Human label. Unchanged. |
| `required` | boolean? | Unchanged. |
| `aliases` | string[]? | **New, optional.** Alternative headings used only for suggestions. No screen sets it in this feature. |

## ParsedSheet (new)

`src/lib/spreadsheetImport.ts`. One source of rows: a CSV, a pasted block, or one worksheet.

| Field | Type | Notes |
|---|---|---|
| `name` | string | Worksheet name; `"CSV data"` / `"Pasted rows"` otherwise. |
| `headers` | string[] | Trimmed, non-empty headings, in order. |
| `rows` | `Record<string,string>[]` | Keyed by heading; values are text per research R5. Fully blank rows removed. |
| `rowNumbers` | number[]? | Excel only: the real worksheet row of each entry in `rows` (research R6). Same length as `rows`. |

**Validation (Excel only, research R4):**
- Duplicate headings are rejected; comparison uses normalized headings.
- A sheet with no data rows is not returned.
- More than 5,000 rows is rejected.
- The workbook must be 10 MB or smaller.
- At least one sheet must remain.

## ParsedWorkbook (new)

| Field | Type | Notes |
|---|---|---|
| `filename` | string | Original file name. |
| `sheets` | ParsedSheet[] | One or more. A CSV gives exactly one. |

## ColumnMapping (new)

One entry per template field.

| Field | Type | Notes |
|---|---|---|
| `targetKey` | string | A `ColumnSpec.key`. |
| `sourceHeader` | string \| null | The chosen source heading, or none. |
| `confidence` | `'exact' \| 'suggested' \| 'manual' \| 'unmapped'` | `exact`: the heading equals the key, ignoring case and surrounding spaces. `suggested`: a rule-based match the user hasn't changed. `manual`: chosen by the user. `unmapped`: none. Codex had no `manual` state; it is added so FR-011 ("see which suggestions were automatic") can be shown. |

**Rules:**
- No two mappings share a `sourceHeader` (FR-012).
- Suggestions require a score of at least 0.6 (Codex threshold, kept). Weaker matches are `unmapped` (FR-010).
- Each source heading is suggested at most once, best score first.

**State transitions:**

```text
unmapped ──suggest──▶ suggested ──user changes──▶ manual
   ▲                     │                          │
   └──── user picks "None" ◀──────────────────────────┘
exact ──user changes──▶ manual
```

## SuggestionDecision (new, derived)

The result of `needsColumnReview(headers, columns, mappings)` (research R2): `true` means show the matching step, `false` means skip it and pass the rows through unchanged.

## RowResult (existing, unchanged)

`{ rowIndex, raw, data?, errors }`. `raw` holds the mapped row: template keys plus passed-through columns (research R3). When mapping was skipped, it holds the original row.

## Import dialog step (existing, extended)

```text
pick ──file/paste──▶ [sheet] ──▶ [map] ──▶ preview ──▶ result
         (only if >1 sheet)  (only if needsColumnReview)
```

- **Back navigation:**
  - From `map`, the user can go back to `sheet` (if shown) or `pick`.
  - From `preview`, the user can go back to `map` if the mapping step was shown, or to `pick` as today.
- **Reset:** "Choose a different file" and "Start over" clear the sheet, mapping and source-row state as well as the existing state.

## Downloads (derived)

| Download | Step | Headings | Rows |
|---|---|---|---|
| Corrected CSV | preview, when no missing required columns | `ColumnSpec.key` in order | every parsed row's template-key values (pass-through columns excluded) |
| Error report | result, when any row invalid or failed | `Row`, `First value`, `Reason` | invalid rows, then rows that failed during import |
