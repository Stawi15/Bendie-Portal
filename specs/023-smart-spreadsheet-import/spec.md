# Feature Specification: Smart Spreadsheet Import

**Feature Branch**: `023-smart-spreadsheet-import`

**Created**: 2026-11-16

**Status**: Draft

**Input**: User description: "Feature 023 — Smart Spreadsheet Import. Bring over ONLY the standard (non-AI) Excel/CSV column-matching work from the unmerged Codex branch `codex/ux-foundations-smart-import` (commit 45a2a91), rebuilt on current main. Every existing CsvImportModal consumer gains: .xlsx upload (legacy .xls rejected with re-save guidance), a sheet picker for multi-sheet workbooks, a "match your columns" step when headings aren't exact template keys (deterministic suggestions from key/label/optional aliases, never guessing an unresolved required column, no duplicate source assignments, manual confirmation), and client-side downloads of a template-aligned corrected CSV and a row-error report. Limits 5,000 rows / 10 MB. Exact-template files (case-insensitive) skip the mapping step. Paste-from-spreadsheet uses the same mapping. Must preserve every consumer's parseRow/beforeImport/importRow and main's Feature 021 refineResults/previewWarnings/importAll, authorization, event scoping and partial-success semantics; CSV parsing leniency stays as today. Out of scope: AI/Ollama mapping (commit d013ddf), sidebar/copy/org-home UX changes, globals.css, any DB/RLS/API change, per-consumer alias additions. Spreadsheet content never leaves the browser."

## Background

Every bulk-import screen in the Portal (19 today: Bendie content sections such as Facilitators, Agenda, FAQs, Members, Networking, Activities, Excursions, News, Expo and People; Planner modules such as People, Flights, Hotels, Vendors, Checklist, Production, Tasks and Agenda; plus breakout-room and Planner team-access imports) shares one import dialog. Today that dialog accepts only CSV files or pasted rows, and only when the column headings exactly match the module's template. Event teams usually receive data as Excel workbooks with their own headings ("Speaker Name", "Company / Org", "E-mail"), so they must rebuild the file by hand before importing.

An unmerged branch (`codex/ux-foundations-smart-import`) built a solution for this. It was never merged and has since fallen behind `main` (Features 020–022, including breakout-room grouped import, changed the same dialog). This feature brings over **only its spreadsheet-import capability**, rebuilt on current `main`. That branch's navigation, wording and home-page changes, and the follow-up AI column-matching branch, are not part of this feature.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Import an ordinary Excel workbook (Priority: P1)

An event manager has speaker data in an Excel workbook with headings that don't match the Facilitators template. They open the import dialog, choose the `.xlsx` file, pick the worksheet that holds the data if the workbook has several, confirm or correct the suggested match for each template field, and reach the usual valid/invalid preview. They import the valid rows exactly as they would from a template CSV.

**Why this priority**: This is the core problem — data arrives as Excel with the organiser's own headings. Without it, nothing else in this feature matters.

**Independent Test**: Upload a single-sheet `.xlsx` whose headings differ from the template (e.g. "Speaker Name", "Position", "Company / Org"), confirm the suggestions, and verify the preview and import behave exactly as a template CSV with the same data would.

**Acceptance Scenarios**:

1. **Given** a workbook with one populated sheet and non-template headings, **When** the manager chooses it, **Then** they see a matching step listing each template field with a suggested source column (or none), and required fields without a match are clearly marked.
2. **Given** a workbook with two or more populated sheets, **When** the manager chooses it, **Then** they are asked which sheet to import before the matching step; empty sheets are not offered.
3. **Given** the matching step, **When** a required field has no source column, **Then** the manager cannot continue until they choose one, and the dialog says which required fields are still unmatched.
4. **Given** the matching step, **When** the manager assigns the same source column to two fields, **Then** the dialog points out the duplicate and blocks continuing until it is resolved.
5. **Given** confirmed matches, **When** the manager continues, **Then** the existing preview shows valid and invalid rows, and importing behaves exactly as it does today for that module (same validation, same per-row results, same partial success).
6. **Given** a sheet with a title or notes row above the real heading row, **When** it is read, **Then** the heading row is found automatically (within the first 25 rows) and the rows above it are ignored.

---

### User Story 2 - Existing template files work exactly as before (Priority: P1)

A manager who already uses the module's CSV template (downloaded from the dialog) uploads or pastes it. Nothing new appears: they go straight to the preview as they do today.

**Why this priority**: Equally critical — every one of the 19 import screens is in use, and the new step must not slow down or break the files that already work.

**Independent Test**: For each import screen type, upload the module's own downloaded template filled with sample rows (including headings that differ only in letter case or surrounding spaces) and confirm the dialog goes straight to the preview with identical results to today.

**Acceptance Scenarios**:

1. **Given** a CSV whose headings match the template keys (ignoring letter case and surrounding spaces), **When** it is uploaded or pasted, **Then** the matching step is skipped and the preview appears immediately.
2. **Given** a CSV that imports successfully today, **When** it is uploaded after this feature, **Then** it is accepted with the same valid/invalid rows and the same import outcome — no file that imports today is newly rejected.
3. **Given** a module with cross-row checks, preview warnings or grouped import (e.g. breakout rooms), **When** a file is imported through the new matching step, **Then** those checks, warnings and the grouped import still apply to the matched rows.
4. **Given** pasted rows copied from Excel or Google Sheets with non-template headings, **When** they are pasted, **Then** the same matching step appears as for an uploaded file.

---

### User Story 3 - Get a clean CSV and an error list (Priority: P2)

After matching, the manager can download the data as a CSV with the module's exact template headings, to keep or re-use. After an import, they can download a list of every row that wasn't imported with the reason, fix those rows, and import them again.

**Why this priority**: Useful for correcting data and record-keeping, but the import works without it.

**Independent Test**: Match an `.xlsx`, download the corrected CSV and check its headings and column order match the template; import a file with some bad rows and check the error list names each failed row and its reason.

**Acceptance Scenarios**:

1. **Given** confirmed matches, **When** the manager downloads the corrected CSV, **Then** it contains every data row, with headings and column order exactly matching the module's template, and unmatched optional fields left blank.
2. **Given** an import where some rows were invalid or failed, **When** the manager downloads the error list, **Then** each entry identifies the row (its position in the original file) and gives the same plain-language reason shown on screen.
3. **Given** the corrected CSV, **When** it is uploaded back into the same module, **Then** it skips the matching step (User Story 2).

---

### Edge Cases

- **Legacy `.xls` file**: rejected with guidance to re-save as `.xlsx` or CSV in Excel.
- **Other file types** (PDF, `.numbers`, images): rejected with "Choose a CSV or Excel (.xlsx) file."
- **Password-protected, corrupted or unreadable workbook**: rejected with guidance to remove the password or save as CSV; no technical detail is shown.
- **Excel workbook over 10 MB or worksheet over 5,000 data rows**: rejected with guidance to split the data. CSV and pasted rows have no new limit.
- **Workbook with no populated sheet**: rejected with "include a heading row and at least one data row". A sheet with headings but no data rows is not offered. A CSV with no data rows behaves as today.
- **Duplicate headings in an Excel sheet** (two columns both called "Name"): the manager is asked to rename one before continuing.
- **Duplicate headings in a CSV**: handled exactly as today (no new rejection).
- **Blank rows inside a sheet**: skipped, not reported as invalid.
- **Extra columns not in the template**: ignored, as today.
- **Excel cells holding dates, times, numbers, formulas or rich text**: read as the value the cell displays — dates as `YYYY-MM-DD`, time-only cells as `HH:MM`, formulas as their result — so the module's existing validation sees text it understands. The calendar date of a date cell must not shift by a day because of the viewer's time zone.
- **Merged or styled heading cells**: read by their text.
- **Template field and heading that only partly resemble each other** (e.g. "Name" vs "Company Name"): may be suggested, but always shown for confirmation; a weak resemblance is left unmatched rather than guessed.
- **File has no column at all for a required field**: the matching step names the field, says the file has no column for it, lists the headings it did find, and offers the example-spreadsheet download (this replaces today's separate "missing required column" screen).
- **Manager closes the dialog mid-way**: nothing is imported and no data is kept.

## Requirements *(mandatory)*

### Functional Requirements

**File input**

- **FR-001**: The shared import dialog MUST accept `.csv` and `.xlsx` files on every screen that uses it, with no change required to individual screens.
- **FR-002**: The dialog MUST reject `.xls` files with re-save guidance, and any other file type with a message naming the accepted types.
- **FR-003**: The dialog MUST reject Excel workbooks larger than 10 MB and worksheets with more than 5,000 data rows, with guidance to split the data. CSV files and pasted rows keep today's behaviour (no new size or row limit), so FR-007 holds. *(Narrowed during `/speckit.plan`, 2026-11-16: applying the limits to CSV would reject large CSVs that import today, contradicting FR-007.)*
- **FR-004**: For a workbook with more than one populated sheet, the dialog MUST let the manager choose the sheet; sheets with no data rows MUST NOT be offered. A single populated sheet MUST be used without asking.
- **FR-005**: For Excel sheets, the dialog MUST find the heading row among the first 25 rows (the first row with at least two filled cells), ignore rows above it, and skip fully blank data rows.
- **FR-006**: Excel cell values MUST be converted to the text the cell displays: dates as `YYYY-MM-DD` without a time-zone shift, time-only values as `HH:MM`, formula cells as their result, rich text as plain text.
- **FR-007**: CSV parsing tolerance MUST stay as it is today: a CSV that parses successfully today MUST NOT be rejected by this feature.

**Column matching**

- **FR-008**: When every template field that has a heading in the file matches a template key exactly (ignoring letter case and surrounding spaces), and no required field is missing, the dialog MUST skip the matching step and behave exactly as today.
- **FR-009**: Otherwise the dialog MUST show a matching step listing every template field with a suggested source column, using only rule-based comparison of headings with the field's key, label and any alternative names the screen already provides. No external service may be consulted.
- **FR-010**: A suggestion MUST only be made when the heading clearly resembles the field; weak resemblances MUST be left unmatched. A required field MUST never be filled by a guess the manager hasn't seen.
- **FR-011**: The manager MUST be able to change any suggestion, choose "none" for any optional field, and see which suggestions were automatic.
- **FR-012**: The dialog MUST prevent one source column being assigned to more than one field, and MUST block continuing while any required field is unmatched, naming the unmatched fields.
- **FR-013**: Rows pasted from a spreadsheet MUST go through the same matching rules as an uploaded file.

**Preserving existing behaviour**

- **FR-014**: After matching, every screen's existing row validation, pre-import step, row import, cross-row checks, preview warnings and grouped import MUST run unchanged on the matched rows, with the same authorization, event scoping and partial-success results as today.
- **FR-015**: The template download, the "Paste from Spreadsheet" option and all existing messages for a successful template import MUST remain as they are.

**Downloads**

- **FR-016**: In the preview (whether or not the matching step was shown), the manager MUST be able to download the data as a CSV whose headings and column order exactly match the module's template.
- **FR-017**: After an import with invalid or failed rows, the manager MUST be able to download a CSV listing each such row with the row number shown on screen (the real worksheet row for Excel files; today's numbering for CSV and pasted rows), the row's first value, and its reason.
- **FR-018**: Both downloads MUST be produced in the browser; spreadsheet contents MUST NOT be sent anywhere except through each screen's existing import action.

**Errors**

- **FR-019**: Every rejection or failure MUST show a plain-language message with a next step; parser, library or database error details MUST NOT be shown to the manager.

### Out of scope

- AI-assisted column matching (the separate `codex/ai-spreadsheet-mapping` commit) and any external mapping service.
- The unmerged branch's sidebar, navigation wording, product-home and global style changes.
- Adding alternative heading names to individual screens' templates (can follow later, screen by screen).
- Splitting one workbook across several modules.
- Any database, access-rule or server route change.
- Legacy `.xls`, `.ods`, `.numbers` or Google Sheets links.

### Key Entities

- **Template field**: one column a screen's import expects — key, human label, whether it is required, and optional alternative names.
- **Source sheet**: the headings and data rows read from one CSV, one pasted block or one worksheet.
- **Column match**: for each template field, the chosen source heading (or none) and whether it was matched exactly, suggested automatically, or chosen by the manager.
- **Row result**: a row's original position, whether it is valid, imported or failed, and its reason.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the 19 existing import screens accept a filled-in copy of their own template with no extra step and the same results as before this feature.
- **SC-002**: A manager can import a single-sheet Excel workbook with non-template headings in one matching confirmation, without editing the workbook, on every import screen.
- **SC-003**: For a workbook whose headings are the template labels (e.g. "Full name" for key `full_name`), every field is matched automatically with no manual correction.
- **SC-004**: No file that imports successfully today is rejected after this feature (zero regressions across the screen-type test set).
- **SC-005**: A 5,000-row, 10 MB workbook reaches the matching step in under 10 seconds on a typical office laptop.
- **SC-006**: Inspecting network activity during file selection, matching and both downloads shows no spreadsheet content leaving the browser.

## Assumptions

- The people using import are the existing Portal users with access to each screen; this feature changes no permissions.
- Rule-based suggestions (comparing heading words, labels and common variants such as "E-mail" → email, "Mobile" → phone, "Organisation" → organization) are good enough without AI; managers confirm every non-exact match.
- Alternative heading names per screen are optional and none are added in this feature, so suggestions rely on template keys and labels.
- Excel dates are calendar dates for this purpose; a date cell's displayed date is what should be imported.
- The unmerged branch's behaviour is the starting point, corrected where it conflicts with this spec (it treated case-only heading differences as needing confirmation, would turn time-only cells into `1899-12-30`, and newly rejected some CSVs that parse today).
- Uploads are limited to `.csv` and `.xlsx` by extension. A `.txt`/`.tsv` file chosen through "All files" was technically parsed before and is now rejected; this is accepted, since the dialog has only ever offered CSV.
- Excel support may add to the Portal's download size only when a manager actually chooses an `.xlsx` file; screens that never import Excel are not slowed down.
