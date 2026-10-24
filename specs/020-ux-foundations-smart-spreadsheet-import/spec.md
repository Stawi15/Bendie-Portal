# Feature 020: UX Foundations and Smart Spreadsheet Import

**Feature Branch**: `codex/ux-foundations-smart-import`  
**Created**: 2026-10-24  
**Status**: Approved for implementation  
**Input**: Improve the Portal's clarity without adding visual noise, and let event teams turn ordinary Excel/CSV data into template-aligned imports.

## User Scenarios & Testing

### User Story 1 — Import an existing spreadsheet (P1)

An event manager can upload a modern Excel workbook (`.xlsx`) or CSV, select a populated worksheet when needed, map unfamiliar headers to the current module template, preview row errors, and import only valid rows through the module's existing write path.

**Independent Test**: Upload a workbook whose headers differ from the template, confirm the suggested mappings, and reach the existing valid/invalid preview without editing the source workbook.

### User Story 2 — Produce a schema-ready CSV (P1)

Before importing, the manager can download the mapped data with the exact current template headers. After an import, they can download an error report containing the affected row and actionable message.

**Independent Test**: Map an `.xlsx` file, download the corrected CSV, and verify its header order matches the selected module's `ColumnSpec[]`.

### User Story 3 — Understand where to start (P2)

A portal user sees a concise explanation of Bendie versus Bendie Planner, can find event search and workspace configuration using outcome-oriented language, and sees desktop navigation labels by default while retaining control over sidebar width.

**Independent Test**: Open a product home and confirm its purpose and primary event action are visible; collapse/re-expand the desktop sidebar and confirm the choice persists after reload.

## Requirements

- **FR-001**: Preserve every existing CSV consumer's `parseRow`, `beforeImport`, `importRow`, authorization, event scoping, and partial-success semantics.
- **FR-002**: Accept `.csv` and `.xlsx`; explain that legacy `.xls` files must be re-saved as `.xlsx` or CSV.
- **FR-003**: Detect populated worksheets, allow selection when more than one is present, reject empty/encrypted/unreadable/oversized files with actionable messages, and cap imports at 5,000 rows and 10 MB.
- **FR-004**: Suggest mappings deterministically from template keys, labels, and optional aliases. Never guess an unresolved required column.
- **FR-005**: Require manual confirmation when headers are not already exact template keys.
- **FR-006**: Prevent one source column from being assigned to multiple template fields and show which required fields remain unresolved.
- **FR-007**: Provide schema-ready CSV and error-report downloads without sending spreadsheet content to a server.
- **FR-008**: Keep contextual notes limited to the choose, map, and preview decisions.
- **FR-009**: Use friendly errors and never expose raw database, parser, or stack details.
- **FR-010**: Default the desktop sidebar to expanded, provide a visible collapse control, and persist the preference locally.
- **FR-011**: Rename event search and module configuration controls using task-oriented language.
- **FR-012**: Explain Bendie and Bendie Planner as two capabilities within Bendie Studio on product home pages without adding a new route or onboarding system.

## Scope Boundaries

- No database, RLS, API, or canonical write-path changes.
- No LLM receives spreadsheet rows. A future optional Qwen/Ollama header-mapping adapter is documented, not activated, because no approved model endpoint or data-processing policy exists.
- No full information-architecture rewrite, first-run wizard, new readiness engine, or live phone preview.
- Existing grouped event areas, readiness views, empty-state patterns, and terminology remain authoritative.

## Success Criteria

- Exact-template CSV imports take no additional mapping step.
- A non-template `.xlsx` reaches preview after one mapping confirmation.
- The feature remains fully usable without AI or network access beyond existing import writes.
- All existing import pages compile without consumer-specific changes.
- Type-check, lint, unit tests, format check, and production build pass.
