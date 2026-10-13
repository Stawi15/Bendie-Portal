# Tasks: Edit, Replace-on-Import and Delete-All (Checklist & Vendors)

- [X] T001 Planner SQL (developer runs in the Planner project): service-role exemption in `prevent_unsafe_checklist_item_edit` and `prevent_unsafe_vendor_item_edit` (FR-006); file kept at `specs/020-…/planner-sql/allow_portal_server_item_edits.sql`. — applied by the developer 2026-10-12; verified live.
- [X] T002 [US1] `src/lib/plannerChecklist.ts` / `plannerVendors.ts`: patch types + `update*Item` map detail fields (required name/description non-empty when present).
- [X] T003 [US1] PATCH routes accept the detail fields (same validation as create).
- [X] T004 [US2/US3] Collection routes: `DELETE` with `{ all: true }` or `{ itemIds: number[] }`, manager-only, event-scoped, returns `{ deleted }`; lib `deleteChecklistItems` / `deleteVendorItems` (optional `itemIds`).
- [X] T005 [US1] Modals: optional `editing` item → pre-filled, "Edit …" title, "Save changes".
- [X] T006 [US1] Lists: `Edit` row action before `Delete` (manager only).
- [X] T007 [US2] Pages: "Delete all" header button + `useConfirm` destructive dialog.
- [X] T008 [US3] `CsvImportModal`: optional replace mode (radio in preview when existing items > 0, confirm before import, `replaceOption.deleteExisting(ids)` called only when every row imported, outcome shown on the result screen); pages snapshot existing ids and delete them only when all rows imported.
- [ ] T009 Validate: type-check, lint, isolated build; dry run against a scratch Planner event (edit, delete all, replace import) with cleanup; commit; push after dry run. — type-check, lint, isolated build: pass. Dry run 28/28 after T001. Type-check re-run 2026-10-13: pass. Committed 2026-10-13 on developer go-ahead; push pending.
