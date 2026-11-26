# Feature Specification: Speakers Table and Inspector Pilot

**Feature Branch**: `031-speakers-table-inspector`

**Created**: 2026-11-23

**Status**: Draft

**Input**: User description: "Speakers table and inspector pilot (roadmap docs/bendie-revamp/36 Phase 3, first half; docs 20, 21, 22; constitution v2.0.0). Architect blueprint confirmed by the developer 2026-11-23. In the Studio 2.0 layout (v2) the Speakers page (/portal/events/[eventId]/facilitators) becomes a sortable, searchable, filterable table with a side inspector for viewing, adding and editing a speaker (replacing the edit modal), with an unsaved-changes guard and the open speaker in the page address; the current layout (v1) keeps today's page. Every current Speakers capability is preserved (fields, validation, display order, spreadsheet import, claim status, empty states). New: sort (name, organisation, group, claim status), filters (group, role, not yet claimed), claim status badge with icon and label, and a read-only list of the agenda sessions the speaker is on. All speaker reads/writes (v1 page, v2 page, Attendees 'Add to speakers') go through one shared speakers module. Inspector docks beside the table on wide screens and becomes a sheet on smaller ones; table becomes a list on phones. Reusable DataTable, Inspector and unsaved-changes guard for later page migrations. Out of scope: bulk actions, reordering, photo upload, Agenda, permission changes."

## Context

Speakers is the pilot page for the Studio 2.0 way of working with lists (docs 20, 21): a table to scan and narrow the list, and a side **inspector** to view and edit one record without leaving it. Today the page is a card list with a pop-up form; the pop-up hides the list, has no unsaved-changes protection, and can't be linked to. What's built here (the table, the inspector, the unsaved-changes guard and the shared speaker logic) is reused by every later page migration, starting with Agenda.

The new page appears only in the Studio 2.0 layout (Feature 030). The current layout keeps today's Speakers page; switching layouts is the fallback.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find and review speakers quickly (Priority: P1)

An event organiser opens Speakers in the new layout and sees every speaker in a table: photo, name, job title and organisation, group, role and whether the speaker has claimed their profile. They search, sort and filter to find who they need (for example "everyone in Keynote Speakers who hasn't claimed their profile yet").

**Why this priority**: Scanning and narrowing the list is the most frequent Speakers task, and the table is the reusable foundation for every later page.

**Independent Test**: In the new layout, open Speakers on an event with speakers; search, sort by each sortable column, apply each filter, and check the rows shown.

**Acceptance Scenarios**:

1. **Given** an event with speakers, **When** the page opens, **Then** speakers are listed in their saved display order (the order attendees see in the app), with a count of speakers.
2. **Given** the list, **When** the organiser types in search, **Then** only speakers whose name, email, job title, organisation, group or expertise contain the text are shown.
3. **Given** the list, **When** the organiser sorts by name, organisation, group or claim status, **Then** rows reorder by that column, ascending then descending, and the active sort is announced.
4. **Given** the list, **When** the organiser filters by group, by role (Speaker or Presenter) or to "not claimed yet", **Then** only matching speakers are shown, filters combine with search, and a clear way to reset them is shown.
5. **Given** filters or search match nothing, **Then** a "No speakers match" message with a reset action is shown; **given** the event has no speakers at all, **Then** today's empty state (add a speaker or import a spreadsheet) is shown.

---

### User Story 2 - View, add and edit a speaker beside the list (Priority: P1)

The organiser opens a speaker and an inspector shows their details beside the table, which stays visible. They edit fields and save, add a new speaker, or delete one, with the same fields, rules and messages as today. The inspector also lists the agenda sessions the speaker is on.

**Why this priority**: Editing is the other core task and replaces the pop-up form; it is the pattern every later page will use.

**Independent Test**: Open a speaker, change a field, save; add a new speaker; try to save without a name and with an invalid email; delete a speaker; open a speaker who is on agenda sessions and one who isn't.

**Acceptance Scenarios**:

1. **Given** the table, **When** the organiser opens a row (click, or Enter on the focused row), **Then** the inspector shows that speaker's details and the table stays visible on wide screens.
2. **Given** the inspector, **When** fields are changed and saved, **Then** the speaker is updated, a confirmation is shown, and the table reflects the change without a full page reload.
3. **Given** "Add speaker", **When** the organiser fills in at least a name and saves, **Then** the speaker is added at the end of the display order and opens in the inspector.
4. **Given** the name is empty or the email is not a valid address, **When** saving, **Then** the field shows the same message as today next to it and nothing is saved.
5. **Given** a save fails, **Then** everything typed stays in the inspector and a clear error is shown.
6. **Given** the organiser deletes a speaker and confirms, **Then** the speaker is removed and the inspector closes; cancelling keeps everything as it was.
7. **Given** a speaker who is on agenda sessions, **Then** the inspector lists those sessions (title, day and time); **given** none, **Then** it says the speaker isn't on any sessions yet.
8. **Given** a speaker has claimed their profile, **Then** a status badge with an icon and the words "Profile claimed" is shown (never colour alone); otherwise "Not claimed".

---

### User Story 3 - Never lose unsaved changes, and link to a speaker (Priority: P1)

While editing, the organiser clicks another speaker, closes the inspector, clicks a sidebar link, presses Back, or reloads. Each time, they're asked before unsaved changes are thrown away. The open speaker is part of the page address, so Back closes it, reload reopens it, and a copied link opens the same speaker for a colleague.

**Why this priority**: Losing typed work is a recorded pain point (doc 13 #4); the guard is required for the inspector to replace the pop-up safely.

**Independent Test**: Make an unsaved change, then try each way of leaving; check the prompt appears and both choices work. Copy the address with a speaker open, open it in a new tab, and press Back.

**Acceptance Scenarios**:

1. **Given** unsaved changes, **When** the organiser closes the inspector, opens another row, follows any in-app link, presses Back, or presses Escape, **Then** they are asked whether to discard the changes; choosing to keep editing leaves everything as it was.
2. **Given** unsaved changes, **When** the organiser reloads or closes the tab, **Then** the browser's own leave-page warning appears.
3. **Given** no unsaved changes, **Then** none of these actions ask anything.
4. **Given** a speaker is open, **Then** the page address identifies that speaker; opening that address opens the same speaker; Back closes the inspector rather than leaving the page.
5. **Given** an address for a speaker that doesn't exist (deleted, or another event's), **Then** the page shows the list and a short "That speaker couldn't be found" message, not an error page.

---

### User Story 4 - Import and other existing capabilities keep working (Priority: P1)

Everything the current page does still works in the new layout: spreadsheet import (CSV and Excel) with the same template and checks, the claim status, and adding a speaker from the Attendees page. The current layout's Speakers page looks and behaves exactly as before.

**Why this priority**: The pilot must not lose capability (constitution I, doc 16 parity).

**Independent Test**: Import the template file in the new layout; add an attendee as a speaker from Attendees in both layouts; in the current layout, use Speakers as before.

**Acceptance Scenarios**:

1. **Given** the new layout, **When** the organiser imports a speakers spreadsheet, **Then** the same import dialog, template, column matching and row checks are used, and imported speakers appear in the table afterwards.
2. **Given** either layout, **When** an attendee is added to speakers from Attendees, **Then** the result is exactly as today (one speaker record per person, marked as claimed, the attendee's role set to facilitator, no duplicate if they're already a speaker).
3. **Given** the current layout, **Then** the Speakers page looks and behaves exactly as before this feature.

---

### User Story 5 - Works on any screen and by keyboard (Priority: P2)

On a laptop the inspector docks beside the table; on smaller screens it slides over the page as a sheet; on a phone the table becomes a list. Everything can be done with the keyboard and a screen reader.

**Why this priority**: Organisers use tablets and phones on site (doc 22); accessibility is required (constitution V).

**Independent Test**: Repeat stories 1–3 at 1440, 1024, 768 and 390 px wide and with the keyboard only.

**Acceptance Scenarios**:

1. **Given** a screen at least 1280 px wide, **Then** the inspector sits beside the table; **given** a narrower screen, **Then** it opens as a sheet over the page that can be closed with Escape or a close button, and focus returns to the row that opened it.
2. **Given** a phone-width screen, **Then** speakers show as a list (name, title and organisation, claim status) with no sideways scrolling, and search, filters, add and import remain available.
3. **Given** keyboard-only use, **Then** every control and row can be reached and used, the focus indicator is always visible (at least 3:1 contrast), and the sheet keeps focus inside it while open.
4. **Given** reduced motion is preferred, **Then** the sheet appears without sliding.

### Edge Cases

- A speaker without a name (older data): shown as "Unnamed" in the list and inspector; saving still requires a name.
- A very long name, title or bio: truncated in the table with the full text available; the inspector wraps it.
- Many speakers (over 100): the table stays responsive; search and filters still apply instantly.
- Two people edit the same speaker: the last save wins (as today); the table refreshes after each save.
- The list fails to load: an error message with a retry action instead of an empty state.
- The sessions list fails to load or isn't readable for this role: the inspector says sessions aren't available, and the rest of the inspector works.
- A role that can't edit speakers (database rules reject the change): the save shows a clear error and keeps the typed values, as today.
- A filter for a group that no longer exists after edits: the filter options list only groups present in the current speakers.
- Switching layouts with an inspector open: the new layout's address is kept; the current layout ignores the speaker parameter.

## Requirements *(mandatory)*

### Functional Requirements

**Layout and fallback**

- **FR-001**: In the Studio 2.0 layout, the Speakers page MUST show the new table and inspector; in the current layout it MUST look and behave exactly as before this feature.
- **FR-002**: The route MUST stay `/portal/events/[eventId]/facilitators`; who can open the page and what the database allows MUST be unchanged.

**Table**

- **FR-003**: The table MUST list the event's speakers in display order by default, with photo, name, job title and organisation, group, role, and claim status, plus a speaker count.
- **FR-004**: Search MUST match name, email, job title, organisation, group and expertise (as today), case-insensitively.
- **FR-005**: Users MUST be able to sort by name, organisation, group and claim status, in both directions, and return to display order.
- **FR-006**: Users MUST be able to filter by group (groups present on this event), by role (Speaker, Presenter) and to "not claimed yet"; filters MUST combine with search and be resettable in one action.
- **FR-007**: Empty, no-match, loading and load-error states MUST be shown as described in the scenarios.

**Inspector**

- **FR-008**: Opening a row MUST show the speaker in an inspector beside the table (wide screens) or as a sheet (narrower screens), without hiding the table on wide screens.
- **FR-009**: The inspector MUST offer the same ten fields as today (name, email, job title, organisation, group, role type, LinkedIn URL, expertise, bio, avatar URL with preview), the same required-name and email rules with the same messages, and save, add, cancel and delete (with confirmation).
- **FR-010**: The inspector MUST show the claim status as a status badge with icon and text.
- **FR-011**: The inspector MUST list, read-only, the agenda sessions the speaker is on (title, day and time), or say there are none or that they aren't available.
- **FR-012**: Speakers added on the Speakers page or by import MUST be added at the end of the display order; edits MUST NOT change the display order. (Attendees' "Add to speakers" keeps today's behaviour, per FR-016.)

**Unsaved changes and the address**

- **FR-013**: With unsaved changes, closing the inspector, opening another row, following an in-app link, pressing Back or Escape MUST ask before discarding; reload and tab close MUST trigger the browser's leave-page warning. Without unsaved changes, none of these may ask.
- **FR-014**: The open speaker (or "new speaker") MUST be reflected in the page address; opening such an address MUST open the same inspector; Back MUST close the inspector; an unknown speaker in the address MUST show a short not-found message over the list.

**Existing capabilities**

- **FR-015**: Spreadsheet import (CSV and Excel) MUST use the existing import dialog with the same template, columns, samples and row checks, and refresh the table afterwards.
- **FR-016**: "Add to speakers" on the Attendees page MUST behave exactly as today in both layouts.
- **FR-017**: Every read and write of speakers made by the Speakers page (both layouts) and by Attendees' "Add to speakers" MUST go through one shared set of speaker operations, so the rules exist once (constitution II).

**Accessibility, responsiveness and design**

- **FR-018**: Below 1280 px the inspector MUST be a sheet that keeps focus inside while open, closes with Escape or a close button, and returns focus to the row that opened it; motion MUST follow the reduced-motion preference.
- **FR-019**: At phone width the table MUST become a list with no sideways scrolling; search, filters, add and import MUST remain available.
- **FR-020**: Every control MUST be keyboard-operable with a visible focus indicator of at least 3:1 contrast; sort state, row count changes and save results MUST be announced to screen readers.
- **FR-021**: The new UI MUST use the Studio 2.0 tokens (Feature 029), no hard-coded colours, and the approved copy standard (sentence case, British spelling).
- **FR-022**: The project's UI rules MUST be updated so that list records are created and edited in the inspector, never in an inline panel above a list (doc 20), and the table, inspector and unsaved-changes guard MUST be recorded as reusable patterns.

### Key Entities *(include if feature involves data)*

- **Speaker** (stored as `facilitators`): one person presenting at one event. Name, email, job title, organisation, group, role type (speaker or presenter), LinkedIn URL, expertise, bio, avatar URL, display order, claim status, and an optional link to a user account. No schema change.
- **Session assignment**: which agenda sessions a speaker is on, read only here; owned by the Agenda page.
- **Attendee** (event member): the source when an attendee is added to speakers.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the current Speakers capabilities (doc 16 row 21 and this spec's story 4) work in the new layout, verified one by one.
- **SC-002**: In the current layout, the Speakers and Attendees pages show no visual or behavioural change (walk-through access results identical, screenshots data-only differences).
- **SC-003**: Finding a given speaker by search or filter takes at most 2 actions from opening the page.
- **SC-004**: Editing a speaker takes the organiser from the list to a saved change without the list ever being hidden on screens 1280 px and wider.
- **SC-005**: 0 unsaved changes are lost silently: every way of leaving with unsaved changes (the 8 in-app ways: close, another row, in-app link, Back, Escape, Add speaker, event search, Logout; plus reload and tab close) asks first.
- **SC-006**: 100% of speaker links (open speaker, new speaker) reopen the same view, and Back closes the inspector in 100% of tries.
- **SC-007**: At 390 px, 0 controls are hidden or clipped and there is no sideways scrolling; 100% of controls show a focus indicator of at least 3:1.
- **SC-008**: Speaker rules (required name, email format, display order on add, the attendee-to-speaker steps) exist in exactly one place in the codebase.

## Assumptions

- Who can view and edit speakers is unchanged: the database's access rules decide, and the page shows the same actions to the same people as today.
- The sessions list reads existing agenda data under the same access rules; if a role can't read it, the inspector says sessions aren't available.
- Concurrent edits keep today's behaviour (last save wins); no locking is added.
- Speaker counts per event are small (dozens); the table is built so larger lists elsewhere can be added later without redesign.
- The current layout's Speakers page keeps its existing wording; the copy standard applies to the new UI only.
- Out of scope: bulk actions and multi-select, reordering speakers, photo upload (the avatar stays a URL), Agenda, readiness indicators, permission changes, and database changes.
