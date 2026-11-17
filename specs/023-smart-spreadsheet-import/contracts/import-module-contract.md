# Contract: Import dialog and spreadsheet helpers (Feature 023)

The Portal exposes no new API. The contracts that matter are internal:
- the props that 19 screens pass to `CsvImportModal`, which **must not change**;
- the new helper module the dialog uses.

## 1. `CsvImportModal<T>` props: unchanged (FR-001, FR-014)

Every existing prop keeps its name, type and meaning:
- `open`, `onClose`, `onImported`
- `title`, `templateFilename`, `columns`, `sampleRows`
- `parseRow`, `importRow`, `beforeImport`, `replaceOption`
- `refineResults`, `previewWarnings`, `importAll`

**No new required prop.** No screen file changes in this feature.

Guarantees to consumers:
1. **Skipped matching step:** `parseRow(raw, rowIndex)` receives exactly the rows it receives today: same keys, same values, same indices.
2. **After matching:** `raw` holds each mapped template key with the mapped value, plus every unmapped source column under its original heading (unless that heading equals a template key ignoring case). `getField(raw, key)` therefore finds every template key it found before and every other column it could read before.
3. **Order of operations:** `refineResults` runs on the full parsed result list after mapping. `previewWarnings` and `beforeImport` receive the valid rows' `data`. `importAll`, when given, replaces the per-row loop. All of this is the same as today.
4. **Replace option:** behaviour, the confirmation and partial-success reporting are unchanged.
5. **Row indices** passed to `parseRow` stay 0-based positions in the chosen sheet's data rows.

## 2. `src/lib/csvImport.ts`: additive only

| Export | Change |
|---|---|
| `ColumnSpec` | adds optional `aliases?: string[]` |
| `downloadCsv(filename, headers, rows)` | **new** shared blob-download helper; `downloadCsvTemplate` delegates to it (identical output) |
| everything else | unchanged, including `parseCsvFile` / `parseCsvText` leniency |

## 3. `src/lib/spreadsheetImport.ts`: new

| Export | Signature | Behaviour |
|---|---|---|
| `MAX_SPREADSHEET_BYTES` | `10 * 1024 * 1024` | Excel only |
| `MAX_SPREADSHEET_ROWS` | `5000` | Excel only |
| `SpreadsheetImportError` | `class (code, message)` | `code`: `unsupported` \| `legacy_excel` \| `too_large` \| `empty` \| `duplicate_headers` \| `too_many_rows` \| `unreadable`. `message` is user-facing plain language (FR-019) |
| `parseSpreadsheetFile` | `(file: File) => Promise<ParsedWorkbook>` | `.csv` goes to `parseCsvFile` unchanged (one sheet, no new checks). `.xlsx` goes to exceljs (lazy import) with the R5 cell conversion, R6 row numbers and Excel-only checks. `.xls` throws `legacy_excel`; anything else throws `unsupported` |
| `normalizeHeader` | `(s) => string` | lower-case, word-split, punctuation-stripped, common variants folded (e-mail→email, mobile/telephone→phone, organisation→organization, …) |
| `suggestColumnMappings` | `(headers, columns) => ColumnMapping[]` | one entry per column. `exact` = trimmed header equals the key ignoring case. Otherwise a score from label, aliases, normalized equality and token overlap; ≥ 0.6 gives `suggested`, else `unmapped`. Each header is used at most once |
| `needsColumnReview` | `(headers, columns, mappings) => boolean` | research R2 |
| `applyColumnMappings` | `(rows, mappings, columns) => rows` | research R3: template keys plus pass-through of unused source columns; a pass-through heading equal to any template key (ignoring case) is dropped so it can't shadow the mapped value |
| `findDuplicateSources` | `(mappings) => string[]` | headings assigned to more than one field |
| `unmatchedRequired` | `(columns, mappings) => ColumnSpec[]` | required fields with no source |
| `buildCorrectedRows` | `(rows, columns, mappings) => Record<string,string>[]` | template-key-only rows for the corrected CSV |

All exports are pure except `parseSpreadsheetFile` (reads the `File`). None performs network I/O (FR-018).

## 4. User-facing messages (FR-019)

| Situation | Message (final wording may be polished, meaning fixed) |
|---|---|
| `.xls` | "Legacy .xls files aren't supported. In Excel, save the file as .xlsx or CSV, then try again." |
| other type | "Choose a CSV or Excel (.xlsx) file." |
| > 10 MB (Excel) | "This file is larger than 10 MB. Remove unused sheets or split the data, then try again." |
| > 5,000 rows (Excel) | "This sheet has N rows. Split it into files of 5,000 rows or fewer." |
| no populated sheet | "No sheet with data was found. Include a heading row and at least one row of data." |
| duplicate headings (Excel) | "Rename the duplicate column(s) before continuing: …" |
| unreadable / encrypted | "We couldn't open this workbook. If it's password-protected, remove the password or save it as CSV first." |
| unmatched required (map step) | "Choose a column for: …". When the file has no plausible column: "Your file has no column for: … Add it to your spreadsheet, or download the example spreadsheet." plus "Columns we found: …" and the template download (replaces today's missing-columns preview panel) |
| duplicate assignment (map step) | "Each column can only be used once: … is chosen more than once." |

Raw exceljs, Papa or database errors are logged to the console only, never shown.
