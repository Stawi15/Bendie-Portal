# Feature Specification: Client Admins Edit Their People; Batch Task Status Updates

**Feature Branch**: `019-team-edits-and-task-batch-status` (work on `developement`)
**Created**: 2026-10-09 | **Status**: Draft (lightweight spec, from client testing feedback)

**Input**: "Ann (client org admin) can't update someone's name on People. Colour the Tasks status
pills — In Progress orange/mustard, Pending red, Completed green. Updating a task reloads the page
and jumps back to task 1 — users want to change several tasks and save once. Improve loading speed."

## Findings (source + live database, 2026-10-09)

- The Edit Profile window writes `profiles` from the browser; `profiles` UPDATE is allowed only on
  your own row or for platform admins, so a client admin's edit of a colleague silently changes
  nothing. The same People screen also offers client admins "Make Admin" (platform admin), which a
  database trigger silently reverts — so it reports a false success.
- Each Tasks status change PATCHes immediately and then reloads the whole page into its loading
  state, which unmounts the list (scroll lost) — one round trip + full reload per change.
- The Tasks GET reads tasks, then assignable staff, sequentially.

## User Stories

### US1 — Client admins edit people in their organisation (P1)
Ann edits a colleague's name, phone, job title, bio or avatar from People (or an event's Attendees
& Access) and it saves. Email (used to match accounts) and Stawi staff profiles stay Stawi-only.

1. **Given** an org admin and a member of their organisation, **When** they edit the name and save,
   **Then** the new name is stored and shown.
2. **Given** an org admin, **When** they try to edit someone outside their organisation, a platform
   admin's profile, or anyone's email, **Then** it is refused (email field not offered to them).
3. **Given** a client admin on People, **Then** the Platform Admin column / "Make Admin" is not shown.

### US2 — Clearer task statuses (P1)
Status pills and status pickers are coloured: Pending red, In Progress orange/mustard, Completed
green — in the list and in the picker itself.

### US3 — Change many task statuses, save once (P1)
A manager changes the status of several tasks; nothing is saved until "Save changes"; the list
never reloads or scrolls away; "Discard" reverts; leaving with unsaved changes asks first; failed
rows stay marked with the reason while the rest save.

### US4 — Faster Tasks (P2)
Saving and editing tasks update the list in place without the loading skeleton; the Tasks request
loads tasks and the assignable team in parallel.

## Functional Requirements

- **FR-001** Profile edits by a client org admin go through a server route authorised as platform
  admin, or owner/admin of an organisation the target belongs to; the target must not be a platform
  admin unless the caller is one. Editable: full name (required, ≤ 200), phone, job title, bio,
  avatar URL. Email: platform admins only.
- **FR-002** "Make Admin"/Platform Admin controls are shown only to platform admins.
- **FR-003** Task status colours: Pending red, In Progress amber/mustard, Completed green, on pills
  and on the status picker for its current value.
- **FR-004** Manager status changes are held as unsaved edits with a visible count, "Save changes"
  and "Discard"; one save sends every change; the list keeps its scroll position and filters.
- **FR-005** Partial failure: successful rows are saved and cleared; failed rows stay as unsaved
  edits with an error message.
- **FR-006** Navigating away or closing the tab with unsaved status edits asks for confirmation.
- **FR-007** After any task mutation the list refreshes silently (no loading state).
- **FR-008** The Tasks GET runs the task list and assignable-staff reads in parallel.
- **FR-009** No change to who may change task status (manager / self-assignee rules unchanged).

## Success Criteria

- **SC-001** An org admin's name edit for a colleague is persisted (verified in the database).
- **SC-002** Changing 5 statuses and saving produces 0 list reloads to the loading state and keeps
  the scroll position.
- **SC-003** Client admins see 0 platform-admin controls.
