# Quickstart: validating Smart Spreadsheet Import (Feature 023)

## Prerequisites

- Branch `023-smart-spreadsheet-import`, `npm install` done (adds `exceljs`, `vitest`).
- `npm run dev` against the usual development Supabase settings in `.env.local`.
- A test event you can import into, on each product: a Bendie event and a Planner-enabled event. Use throwaway test events, and delete imported rows afterwards.
- Sample files (create locally, don't commit real attendee data):
  - `template.csv`: the screen's own "Download example spreadsheet" output, filled in.
  - `template-case.csv`: same, headings re-cased (`Full_Name`, ` EMAIL `).
  - `labels.xlsx`: one sheet, headings are the template **labels**.
  - `messy.xlsx`: a title row above the headings, headings like "Speaker Name", "Company / Org", "E-mail"; a blank row; a date column; a time-only column (`09:00`); a formula column; one bad row.
  - `two-sheets.xlsx`: two populated sheets plus one empty sheet.
  - `legacy.xls`, `protected.xlsx` (password), `big.xlsx` (> 5,000 rows).
  - `big.csv`: > 5,000 rows that imports today.

## Automated checks

```bash
npm run type-check
npm run lint
npm test
npm run build      # confirm exceljs appears only in a lazily loaded chunk
```

`npm test` must cover:
- `needsColumnReview` true/false cases;
- case-only headings counted as exact;
- label, alias and normalized matches;
- the weak-resemblance threshold;
- no duplicate source suggestions;
- pass-through of unmapped columns;
- corrected-row output;
- every cell-conversion case in research R5, under `TZ=UTC` and `TZ=Africa/Nairobi`.

## Manual scenarios

| # | Do | Expect | Spec |
|---|---|---|---|
| 1 | Import `template.csv` on Facilitators, Planner Tasks, Planner Checklist (with existing items), Agenda (breakout rows) | Straight to preview; same counts and results as on `main`; Replace option and breakout grouped import still work | US2, FR-008, FR-014, SC-001 |
| 2 | Import `template-case.csv` | No matching step | US2 #1 |
| 3 | Paste rows with template headings, then with label headings | First: straight to preview. Second: matching step | US2 #4, FR-013 |
| 4 | Import `labels.xlsx` | Matching step with every field already matched; one confirm reaches preview | SC-003 |
| 5 | Import `messy.xlsx` on Facilitators | Title row ignored; suggestions shown; date `YYYY-MM-DD`, time `HH:MM`, formula result shown in preview; blank row absent; bad row flagged with the real worksheet row number | US1 #1, #6, FR-005, FR-006 |
| 6 | In the matching step, clear a required field, then assign one source to two fields | Continue blocked with the named field; duplicate message shown | US1 #3, #4, FR-012 |
| 7 | Change a suggestion | Status shows "Chosen by you" | FR-011 |
| 8 | Import `two-sheets.xlsx` | Sheet picker lists only the two populated sheets | US1 #2, FR-004 |
| 9 | Download the corrected CSV from scenario 5, re-import it | Headings equal the template keys in order; re-import skips matching | US3 #1, #3, FR-016 |
| 10 | Finish scenario 5's import | Result offers the error report; it lists the bad row with its row, first value and reason | US3 #2, FR-017 |
| 11 | Try `legacy.xls`, a `.pdf`, `protected.xlsx`, `big.xlsx` | Each is rejected with the plain message from the contract; nothing technical is shown | edge cases, FR-002, FR-003, FR-019 |
| 12 | Import `big.csv` | Accepted exactly as on `main` (no new limit) | FR-003, FR-007, SC-004 |
| 13 | Browser devtools Network tab open for scenarios 4–10 | No request carries sheet contents until the screen's own import writes | FR-018, SC-006 |
| 14 | Time a 5,000-row, ~10 MB workbook to the matching step | Under 10 s | SC-005 |
| 15 | Close the dialog mid-way (sheet / map / preview) and reopen | Starts fresh; nothing imported | edge case |

Record the results (pass/fail plus notes) in `tasks.md`'s verification note.
