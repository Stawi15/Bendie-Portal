# Feature Specification: Edit, Replace-on-Import and Delete-All for Planner Checklist & Vendors

**Feature Branch**: `020-planner-list-edit-replace-delete-all` (work on `developement`)
**Created**: 2026-10-12 | **Status**: Draft (lightweight spec, from client operations feedback)

**Input**: "After uploading a CSV, users want to either overwrite what was there or delete what
existed; a quick Delete All button with a confirmation dialog; and to edit Checklist and Vendors
content on the website — today there is only Delete. Match the application's UI."

## Clarifications (developer, 2026-10-12)

- **Editing details** (name/description, category, quantity, unit, specification, owner, day/date)
  is now allowed for managers. This **reverses** Feature 009 FR-038 / Feature 010 Rule 3 ("immutable
  after creation"). Requires a Planner database change: Planner's `prevent_unsafe_checklist_item_edit`
  and `prevent_unsafe_vendor_item_edit` triggers must accept writes from the Portal's server
  (service role), which already enforces manager capability before every write — verified live that
  both triggers currently refuse detail edits from the server, and refuse ANY checklist update on an
  owner-less item.
- **Replace on import = safe replace**: import the new rows first; delete the previous items only if
  every row imported; otherwise keep everything and say so.

## User Stories

### US1 — Edit an item (P1)
A manager clicks **Edit** on a checklist or vendor row, changes any field in the same form used to
add items, and saves; the row updates in place.

### US2 — Delete all (P1)
A manager clicks **Delete all** (shown only when items exist) and confirms in the standard
destructive confirmation dialog stating the count; every item of the event is removed.

### US3 — Add to or replace existing items on import (P1)
After choosing a spreadsheet, a manager picks **Add to existing items** (default) or **Replace
existing items** (shows how many will be deleted). Replace asks for confirmation, imports the new
rows, and deletes the previous items only when all rows imported.

## Functional Requirements

- **FR-001** Edit is manager-only and reuses each module's add form, pre-filled, titled "Edit …",
  with "Save changes" (no "Save & Add Another").
- **FR-002** Checklist edit fields: item name (required), category, quantity, specification, notes,
  day number, event day date, owner. Vendor: description (required), category, quantity, unit,
  notes. Status ticks keep working as today.
- **FR-003** Delete all is manager-only, appears only with ≥1 item, confirms with the exact count,
  and deletes only the current event's items.
- **FR-004** Import offers Add (default) / Replace when items exist; Replace confirms first; old
  items are deleted only if every new row imported; partial failure keeps old items and reports it.
- **FR-005** All destructive actions use the app's existing confirmation dialog (`useConfirm`,
  destructive style) and existing button styles; no new design patterns.
- **FR-006** The Planner database accepts detail edits from the Portal server only; Planner-app users
  keep exactly today's rules.

## Success Criteria
- **SC-001** A manager edits a checklist item's name and a vendor item's quantity; Planner stores both.
- **SC-002** Delete all removes N items and only from the current event.
- **SC-003** A replace-import with all rows valid leaves exactly the new rows; with a failing row it
  leaves old + successfully imported rows and reports the failure.
