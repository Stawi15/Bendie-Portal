# Feature Specification: Planner Agenda Authoring

**Feature Branch**: `018-planner-agenda-authoring` (work continues on `developement`)

**Created**: 2026-10-09

**Status**: Draft

**Input**: User description: "The agenda can't be added through the Portal if it's only a Planner event — tasks and travel details can be added, but the agenda can't. I want it implemented." Clarified 2026-10-09: the missing schedule is the **Planner Agenda** (the day-by-day programme in the Planner app), not the Production run-of-show, which the Portal already authors (Feature 014).

## Context

Bendie Planner keeps an event's programme in its own agenda (`event_agenda_items`). Today the
Portal only fills it by pushing a **Bendie** Agenda across (Feature 001, Stawi-only). A
Planner-only event has no Bendie Agenda, so its Planner agenda can only be built inside the Planner
app. Planner events already contain both kinds of rows: agenda items created in the Planner app,
and items pushed from a Bendie Agenda.

## Clarifications

### Session 2026-10-09 (decisions; defaults chosen from existing patterns, flagged for the developer)

- Which schedule? → The Planner Agenda (`event_agenda_items`). Production (`production_tasks`)
  already has a Portal tab and is unchanged.
- Who can see and edit it? → The same people as Production: anyone who can view Production can view
  the agenda; Stawi admins and the event organisation's owners/admins can edit it. Planner has no
  separate agenda permission, and the agenda is the programme the run-of-show is built from.
- Items pushed from a Bendie Agenda? → Shown, but read-only in this tab, labelled "From the Bendie
  Agenda — edit it there". Editing them here would be overwritten by the next push.
- Bulk entry? → Yes, spreadsheet import, consistent with every other Planner module.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Build the agenda of a Planner-only event in the Portal (Priority: P1)

Maria opens her Planner-only event, goes to **Agenda** in the Planner workspace, and adds the
programme item by item: date, start and end time, title, and optionally a subtitle, speakers, MC,
room, track, type, description and notes. She edits and deletes items. The Planner app shows the
same agenda.

**Why this priority**: It is the reported gap; without it the programme of a Planner-only event
can only be entered in the Planner app.

**Independent Test**: On a Planner-only event, add, edit and delete agenda items in the Portal and
confirm the Planner agenda (`event_agenda_items` for the linked Planner event) matches.

**Acceptance Scenarios**:

1. **Given** a Planner-only event with no agenda, **When** an org admin opens Agenda, **Then** they
   see an empty state with "Add item" and "Import spreadsheet".
2. **Given** the Add form, **When** they save a title and date (times optional), **Then** the item
   appears in the list, grouped by day and ordered by time, and exists in the Planner agenda.
3. **Given** an item, **When** they edit or delete it, **Then** the Planner agenda reflects it.
4. **Given** an end time before the start time, **When** they save, **Then** it is refused with a
   clear message.
5. **Given** a user who can view Production but is not an organisation admin, **When** they open
   Agenda, **Then** they see the agenda without add/edit/delete controls.

---

### User Story 2 - Import an agenda from a spreadsheet (Priority: P2)

Maria imports the whole programme from a spreadsheet instead of typing each item.

**Why this priority**: Programmes usually exist as documents already; typing 30 items is slow.

**Independent Test**: Import a sheet with valid and invalid rows; valid rows appear, invalid ones
are listed with reasons before anything is imported.

**Acceptance Scenarios**:

1. **Given** a sheet with date, times, title and optional columns, **When** imported, **Then** each
   valid row becomes an agenda item and the result lists any rows that failed and why.

---

### User Story 3 - See pushed Bendie Agenda items safely (Priority: P3)

On an event that uses both products, the Planner Agenda tab shows items that came from the Bendie
Agenda as read-only, so nobody edits them in a place where the next push would overwrite them.

**Independent Test**: On an event with pushed items, they are visible, labelled, and have no
edit/delete controls; Planner-native items on the same event remain editable.

### Edge Cases

- Event not yet linked to Planner (provisioning pending/failed) → the same setup message as other
  Planner tabs; no editing.
- Item with a date but no times → allowed (all-day/untimed item), listed first in its day.
- Item dated outside the event's dates → allowed (setup and teardown days happen); no warning.
- Day number left blank → derived from the Portal event's start date (day 1 = start date); left
  empty when the event has no start date.
- Deleting is permanent; ask for confirmation first.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Planner events MUST have an **Agenda** section in the Planner workspace, visible to
  users who can view Production for that event.
- **FR-002**: Users who can manage Production (Stawi admins, owners/admins of the event's
  organisation) MUST be able to add, edit and delete agenda items.
- **FR-003**: An item MUST have a title and a date; start time, end time, day label, day number,
  subtitle, speakers, MC, room, track, type, description and notes are optional.
- **FR-004**: When both times are given, end MUST be after start.
- **FR-005**: Items MUST be listed grouped by date, then by start time, then by sort order.
- **FR-006**: Items created or edited here MUST be stored in the linked Planner event's agenda in
  the same shape as items created in the Planner app (local date + time, day number, day label).
- **FR-007**: Items pushed from a Bendie Agenda MUST be shown read-only with a label saying where to
  edit them.
- **FR-008**: Agenda items MUST be importable from a spreadsheet with per-row validation and
  per-row results.
- **FR-009**: Every list, form and import MUST have loading, error and empty states.
- **FR-010**: Nothing about Production, the Bendie Agenda, the agenda push, or other Planner modules
  may change.

### Key Entities

- **Planner agenda item**: one programme entry of a Planner event — date, optional times, title,
  optional subtitle/speakers/MC/room/track/type/description/notes, day number and label, sort order;
  either Planner-native/Portal-authored (editable here) or pushed from a Bendie Agenda (read-only
  here).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An organisation admin can build a 10-item agenda for a Planner-only event entirely in
  the Portal, without the Planner app.
- **SC-002**: 100% of agenda items added in the Portal appear in the Planner agenda for that event.
- **SC-003**: 0 pushed Bendie Agenda items can be edited or deleted from this tab.
- **SC-004**: A 30-row agenda spreadsheet imports in one step with a result for every row.

## Assumptions

- Reuses the Planner link, permissions and patterns of the Production tab (Feature 014); no new
  Planner permission flag is introduced and no Planner schema change is needed.
- The `is_parallel` and `source_document` columns are not exposed (Planner-native rows rarely use
  them); `source_document` is left empty for Portal-authored items.
- Out of scope: changing the Bendie → Planner agenda push, two-way sync, Production, and Planner
  app changes.
