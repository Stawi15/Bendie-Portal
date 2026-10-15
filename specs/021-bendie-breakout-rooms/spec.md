# Feature Specification: Bendie Breakout Rooms

**Feature Branch**: `021-bendie-breakout-rooms`

**Created**: 2026-10-13

**Status**: Draft

**Input**: User description: "Make Bendie agenda breakout rooms first-class data with persisted attendee room assignments, per the confirmed /architect blueprint (rooms as durable records, per-session assignment mode, optional capacity, rooms and assignments CSV uploads with download, Portal headcounts and assignment management; Bendie only, Planner unchanged; database + Portal first, attendee app second)."

## Context

A Bendie event's agenda can contain **breakouts**: one agenda session that splits into several rooms running at the same time, with each attendee going to exactly one room. Today:

- Rooms are stored as part of the session and have no durable identity of their own.
- The attendee app lets an attendee pick a room, but the pick is not saved: it is lost when the app restarts, does not follow the attendee to another device, and organisers cannot see it.
- Rooms have no capacity, organisers cannot assign people, and nobody can see who is going where.
- The agenda CSV upload cannot create rooms, and nothing can be uploaded to assign people to rooms.

This feature makes rooms and room assignments durable, organiser-managed data that the Portal, CSV uploads and the attendee app all work from.

### Agreed language

- **Breakout**: an agenda session that splits into parallel rooms; each attendee is in at most one of its rooms.
- **Room**: one option within a breakout: name, description, location, facilitator (one of the event's Speakers), optional capacity, and its own mini-agenda of time blocks.
- **Assignment**: the record that a given attendee is in a given room for a breakout, including where it came from (the attendee, an organiser, or a CSV upload), who made it, and when.
- **Assignment mode**: a per-breakout setting that decides who places attendees: *Attendees choose*, *Organiser assigns*, or *Pre-assigned, can switch*.
- **Organiser**: a person who manages the event's content in the Portal (event host, organiser or admin; an owner/admin of the organisation that owns the event; or a platform admin).
- **Attendee**: a person who is a member of the event with the attendee role.

### Releases

- **Release 1 (this repository)**: durable rooms and assignments, the attendee-choice rule available to the app, and all Portal capabilities (User Stories 1–4).
- **Release 2 (attendee app, separate repository)**: the app reads durable rooms and saves attendee picks through the Release 1 rule (User Story 5). Specified here as a contract; implemented outside this repository.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Organiser sets up breakout rooms that persist (Priority: P1)

An organiser opens a session on the event's agenda in the Portal and turns it into a breakout. For each room they enter a name, description and location; choose the facilitator from the event's Speakers; optionally set a capacity; and build the room's mini-agenda of time blocks. They choose the breakout's assignment mode. Rooms keep their identity when renamed, reordered or edited. Rooms that already exist on events today are carried over unchanged, and the currently released attendee app keeps showing them exactly as before.

**Why this priority**: Every other capability (assignments, headcounts, uploads, saved picks) depends on rooms having a durable identity. It also must not break breakouts that already exist on live events.

**Independent Test**: On an event with an existing breakout, confirm its rooms appear in the Portal unchanged; create a new breakout with three rooms, a facilitator, a capacity and mini-agenda blocks; rename a room; and confirm the current attendee app still shows all rooms and mini-agendas correctly.

**Acceptance Scenarios**:

1. **Given** an event whose session already has rooms from before this feature, **When** an organiser opens that session in the Portal, **Then** every room, its description, facilitator name and mini-agenda appear unchanged.
2. **Given** a session with no rooms, **When** an organiser adds three rooms with names, a facilitator chosen from Speakers, a capacity of 30 on one room and two mini-agenda blocks on another, and saves, **Then** reopening the session shows exactly those rooms, values and blocks in the saved order.
3. **Given** a saved room, **When** an organiser renames it, **Then** it remains the same room (anything linked to it, such as assignments, stays linked).
4. **Given** rooms saved or edited in the Portal, **When** an attendee opens that session in the currently released attendee app, **Then** they see the same rooms, descriptions, facilitator names and mini-agendas as the Portal shows.
5. **Given** a new breakout, **When** the organiser has not chosen a mode, **Then** the mode is *Attendees choose*.
6. **Given** a room's capacity field left blank, **When** saved, **Then** the room has no capacity limit.
7. **Given** an owner/admin of the organisation that owns the event (not a platform admin), **When** they create or edit a session and its rooms, **Then** the save succeeds; **Given** an owner/admin of a different organisation, **Then** they cannot change that event's sessions or rooms.

---

### User Story 2 - Organiser sees and manages who is in each room (Priority: P2)

For any breakout, an organiser sees each room with its headcount against capacity (for example "18 / 30"), the list of attendees in each room, and the list of attendees not yet in any room. They can assign an unassigned attendee to a room, move an attendee between rooms, and unassign an attendee. Assigning past a room's capacity is allowed but clearly warned.

**Why this priority**: Knowing and controlling who goes where is the main reason for the feature, and it delivers value even before uploads and the app update exist.

**Independent Test**: On a breakout with two rooms (capacity 2 on Room A), assign three attendees to Room A and one to Room B from the Portal; confirm headcounts, the over-capacity warning, the unassigned list, and that moving and unassigning update everything immediately.

**Acceptance Scenarios**:

1. **Given** a breakout with rooms and attendees, **When** an organiser opens its assignments view, **Then** each room shows its headcount and capacity (or "no limit"), its attendees, and a separate list shows attendees with no room.
2. **Given** an unassigned attendee, **When** an organiser assigns them to Room A, **Then** they appear under Room A, leave the unassigned list, and Room A's headcount increases by one.
3. **Given** an attendee in Room A, **When** an organiser moves them to Room B, **Then** Room A's headcount decreases and Room B's increases immediately; the attendee is never in two rooms of the same breakout.
4. **Given** Room A is at capacity, **When** an organiser assigns another attendee to it, **Then** the assignment is saved and the Portal shows Room A as over capacity (e.g. "31 / 30").
5. **Given** an assigned attendee, **When** an organiser unassigns them, **Then** they return to the unassigned list.
6. **Given** any assignment, **When** an organiser views it, **Then** they can see whether it was made by the attendee, an organiser, or a CSV upload, and when.
7. **Given** a room with attendees in it, **When** an organiser deletes the room, **Then** they are first warned how many attendees will be unassigned, and on confirming, those attendees become unassigned.

---

### User Story 3 - One agenda spreadsheet for sessions and breakouts, and a people list per breakout (Priority: P3)

*(Simplified 2026-10-14 at the developer's request: "make it as easy as possible". This replaces the earlier design of separate rooms and assignments uploads.)*

An organiser builds the whole programme, breakouts included, in **one agenda spreadsheet**:
- A regular session is one row with `breakout_room` left blank.
- A breakout is one row per room, with the same title and times on each row and the room in `breakout_room`, plus optional `room_capacity` and `room_facilitator`.
- Uploading the spreadsheet again **updates** sessions with the same title and start instead of adding duplicates.
- A room's mini-agenda is set in the editor, not the spreadsheet.

When the organiser decides who goes where, they open **Manage people** on a breakout:
1. **Download list**: every attendee with their current room.
2. Type a room next to each name in a spreadsheet.
3. **Upload list**.

When attendees choose for themselves, there is no list to upload.

**Why this priority**: large events need spreadsheets, but organisers must not juggle several files. Depends on Stories 1 and 2.

**Independent Test**: upload an agenda spreadsheet with two regular sessions and one breakout of three rooms. Confirm one regular session each, and one breakout session with three rooms. Upload the same file again and confirm nothing is duplicated. In Manage people, download the list, fill in rooms for five attendees (one making a room over capacity, one unknown email, one unknown room, one person listed twice, one blank room), upload, and confirm the preview and results.

**Acceptance Scenarios**:

1. **Given** an agenda spreadsheet with a row whose `breakout_room` is blank, **When** imported, **Then** it creates (or updates) one regular session as before.
2. **Given** three rows with the same title and times and different `breakout_room` values, **When** imported, **Then** one breakout session is created with those three rooms, using the given capacities and facilitators.
3. **Given** a row whose title and start match an existing session, **When** imported, **Then** that session is updated (blank cells keep its current values) and its rooms are added or updated; nothing is duplicated.
4. **Given** rows with the same title and start where some have a room and some don't, or a room listed twice, or rooms disagreeing on the session's end time or details, **When** previewed, **Then** those rows are shown as errors.
5. **Given** a room facilitator that matches no Speaker, or a capacity that is not a whole number of 1 or more, **When** previewed, **Then** the row is an error.
6. **Given** a breakout session, **When** an organiser clicks Download list in Manage people, **Then** they get every attendee of the event (email, name, current room, blank when none); uploading it unchanged changes nothing.
7. **Given** an uploaded list, **When** previewed, **Then** unknown emails, rooms not in this session, and the same person listed twice are errors; rooms that would end up over capacity are warnings that don't block the upload.
8. **Given** a valid list, **When** uploaded, **Then** each attendee is placed in the given room (recorded as a CSV upload), moved if already elsewhere, or taken out of their room when the room cell is blank.

---

### User Story 4 - Assignment mode and capacity rules are enforced for attendee picks (Priority: P4)

When an attendee picks or switches a room, the system applies the breakout's mode and the room's capacity in one place, so every client that lets attendees pick gets the same rules. In *Attendees choose* mode an attendee may pick any room with a free seat and switch freely. In *Organiser assigns* mode an attendee cannot pick or switch. In *Pre-assigned, can switch* mode an attendee may move to another room with a free seat. A full room cannot be picked by an attendee, even if two attendees try for the last seat at the same moment. Switching frees the old seat immediately.

**Why this priority**: Required before the attendee app can save picks (Story 5), and is what makes capacity trustworthy. Delivered in Release 1 so the app update is a pure client change.

**Independent Test**: Exercise the attendee pick rule directly as attendee accounts: pick, switch, pick a full room, pick in *Organiser assigns* mode, and have two attendees race for a single remaining seat; confirm outcomes and that only one of the racing attendees gets the seat.

**Acceptance Scenarios**:

1. **Given** *Attendees choose* mode and a room with free seats, **When** an attendee picks it, **Then** they are assigned to it, recorded as their own choice.
2. **Given** an attendee already in Room A, **When** they pick Room B with a free seat, **Then** they move to Room B and Room A's seat is freed immediately.
3. **Given** a room at capacity, **When** an attendee tries to pick it, **Then** the pick is refused with a "room is full" reason and their current assignment (if any) is unchanged.
4. **Given** a room with exactly one free seat, **When** two attendees pick it at the same moment, **Then** exactly one succeeds and the other is refused as full.
5. **Given** *Organiser assigns* mode, **When** an attendee tries to pick or switch, **Then** the pick is refused with a "rooms are assigned by the organiser" reason.
6. **Given** *Pre-assigned, can switch* mode and an attendee assigned by an organiser, **When** they pick another room with a free seat, **Then** they move, recorded as their own choice.
7. **Given** a person who is not an attendee of the event, **When** they try to pick a room, **Then** the pick is refused.
8. **Given** an attendee's own pick, **When** an organiser later assigns them elsewhere, **Then** the organiser's assignment replaces the pick.

---

### User Story 5 - Attendees' room choices are saved in the app (Priority: P5, Release 2 — attendee app)

In the attendee app, an attendee's room pick is saved: it is still there after restarting the app and on another device, and the organiser sees it in the Portal. The app follows the breakout's mode: it shows rooms that are full, shows the attendee's assigned room, and in *Organiser assigns* mode shows "Your room will be announced" until they are assigned. Joining a room still earns the existing leaderboard point.

**Why this priority**: Completes the attendee side, but is delivered in the separate attendee-app repository after Release 1.

**Independent Test**: In the updated app, pick a room, restart the app and sign in on a second device; confirm the pick persists and appears in the Portal's assignments view.

**Acceptance Scenarios**:

1. **Given** an attendee who picked a room, **When** they restart the app or open it on another device, **Then** the same room is shown as theirs.
2. **Given** an attendee's pick in the app, **When** an organiser opens the breakout in the Portal, **Then** the attendee appears in that room, recorded as their own choice.
3. **Given** a full room, **When** an attendee views the room list, **Then** that room is marked full and cannot be picked.
4. **Given** *Organiser assigns* mode and no assignment, **When** an attendee opens the breakout, **Then** they see "Your room will be announced" and no picker.
5. **Given** *Organiser assigns* mode and an assignment, **When** an attendee opens the breakout, **Then** they see their room and mini-agenda and cannot switch.
6. **Given** an attendee joins a room, **When** the pick succeeds, **Then** the existing leaderboard point for joining a breakout room is awarded as today.

---

### Edge Cases

- **Capacity lowered below the current headcount**: allowed; nobody is removed; the room shows as over capacity and attendees cannot pick it until it has free seats.
- **Capacity removed**: the room becomes unlimited.
- **Mode changed after assignments exist**: existing assignments are kept; only future attendee picks follow the new mode.
- **Room deleted**: its assignments are removed (attendees become unassigned) after the organiser confirms the warning.
- **Breakout session deleted**: its rooms, mini-agendas and assignments are removed with it.
- **Session time or title changed**: rooms and assignments are unaffected (CSV matching uses the current title and start).
- **Two rooms in one session with the same name (ignoring case and surrounding spaces)**: not allowed, since room names identify rooms in uploads.
- **Attendee removed from the event**: their assignments are removed and no longer count toward headcounts.
- **Attendee's role changed (e.g. to staff) after being assigned**: the assignment is kept but no longer counts toward the room's headcount or capacity. The Portal lists such people separately as "No longer attendees" so an organiser can remove them.
- **Session with no event**: rooms can't be added to it (all sessions created in the Portal belong to an event).
- **Same person listed twice in a people list**: both rows are shown as errors; neither is saved.
- **People list row with a blank room**: takes that attendee out of their room (so a downloaded list round-trips).
- **Agenda spreadsheet row for an existing breakout room**: updates the room's capacity or facilitator and keeps its mini-agenda (mini-agendas are edited in the editor only).
- **Mini-agenda block with end time not after its start time**: rejected, consistent with agenda sessions.
- **Attendee picks a room in a session that has no rooms, or a room from another session**: refused.
- **Attendee app released before this feature**: continues to show rooms correctly; its picks remain unsaved, as today, until Release 2.
- **Event linked to Planner with Bendie active**: the manual "Push to Planner" still pushes the breakout session as a single item; rooms and assignments are not sent.

## Requirements *(mandatory)*

### Functional Requirements

**Rooms**

- **FR-001**: The system MUST store breakout rooms as durable records belonging to one agenda session, each with a name (required), description, location, facilitator (optional, one of the event's Speakers), optional capacity (whole number of 1 or more; blank means unlimited), display order, and an ordered mini-agenda of time blocks (title required; description, start, end, location optional).
- **FR-002**: A room MUST keep its identity across edits (rename, reorder, detail changes) so that assignments remain linked to it.
- **FR-003**: Room names MUST be unique within a session, ignoring letter case and surrounding spaces.
- **FR-004**: Each breakout session MUST have an assignment mode of *Attendees choose* (default), *Organiser assigns*, or *Pre-assigned, can switch*.
- **FR-005**: All rooms that exist on events before this feature MUST be carried over with their existing room identities, names, descriptions, facilitator names and mini-agendas, with no organiser action. A pre-existing facilitator name that matches one of the event's Speakers SHOULD be linked to that speaker; otherwise it MUST be preserved as text.
- **FR-006**: Whenever rooms or their mini-agendas change, the currently released attendee app MUST continue to show the same rooms, descriptions, facilitator names and mini-agendas as the Portal, without an app update.

**Portal — room editing**

- **FR-007**: Organisers MUST be able to add, edit, reorder and delete rooms and mini-agenda blocks on a session, choose the facilitator from the event's Speakers, set capacity and location, and set the assignment mode.
- **FR-008**: Before deleting a room that has attendees assigned, the Portal MUST warn with the number of attendees who will be unassigned and require confirmation.

**Assignments**

- **FR-009**: The system MUST store at most one assignment per attendee per breakout session, recording the room, the source (attendee / organiser / CSV upload), who made it, and when.
- **FR-010**: Only attendees of the event (event members with the attendee role) can be assigned.
- **FR-011**: Organisers MUST be able to assign, move and unassign attendees in the Portal, in any mode.
- **FR-012**: Organiser and CSV assignments MUST be allowed to exceed room capacity; the Portal MUST show a room as over capacity whenever its headcount exceeds its capacity.
- **FR-013**: An organiser or CSV assignment MUST replace any existing assignment the attendee has for that breakout, including the attendee's own pick.

**Portal — assignments view**

- **FR-014**: For each breakout, the Portal MUST show each room's headcount and capacity (or "no limit"), the attendees in each room with their assignment source and time, and the attendees with no room.
- **FR-015**: Headcounts and lists MUST reflect the current saved state each time the view is opened or refreshed, and immediately after the organiser's own changes.

**Attendee room choice (rule available to any attendee client)**

- **FR-016**: The system MUST provide a single attendee room-choice action that applies these rules atomically:
  - the person must be an attendee of the session's event;
  - the room must belong to that session;
  - in *Organiser assigns* mode the action is refused;
  - in *Attendees choose* and *Pre-assigned, can switch* modes the attendee may pick or switch to a room with a free seat;
  - a pick of a room at or over capacity is refused, and of two simultaneous picks for the last seat exactly one succeeds;
  - a successful pick replaces the attendee's previous assignment for that breakout immediately, recorded as the attendee's own choice.

  *Attendees choose* and *Pre-assigned, can switch* follow the same pick rules. They differ only in how organisers work (pre-assigning first) and in what the app shows.
- **FR-017**: A refused pick MUST return a distinguishable reason (not an attendee, room not in this session, assigned by organiser, room full) and leave the attendee's existing assignment unchanged.
- **FR-018**: Attendees MUST be able to read the rooms and mini-agendas of breakouts in their own events, their own assignments, the breakout's mode, and whether each room is full or how many seats remain — but MUST NOT be able to see which other attendees are in a room.

**Agenda spreadsheet (sessions and breakouts)**

- **FR-019**: The existing agenda spreadsheet import MUST accept three optional columns: `breakout_room`, `room_capacity` (whole number ≥ 1, blank = no limit) and `room_facilitator` (speaker name or email). The template and its sample rows MUST show a regular session and a breakout with two rooms.
- **FR-020**: Rows with the same title (ignoring case and surrounding spaces) and start (to the minute) MUST be treated as one session. More than one such row is only valid when every one has a `breakout_room`, all room names differ, and the rows don't disagree on end time or other filled-in session details. Otherwise the rows MUST be shown as errors.
- **FR-021**: A session whose title and start match exactly one existing session of the event MUST be updated, not duplicated. Filled-in cells overwrite; blank cells keep the current values; filled-in speakers replace the session's speakers. A match with more than one existing session MUST be an error for those rows.
- **FR-022**: Rows with `breakout_room` MUST add or update those rooms on the session, matching rooms by name. Rooms not in the file and rooms' mini-agendas are left unchanged. An unknown room facilitator or an invalid capacity MUST be a row error.

**People list (per breakout session, in Manage people)**

- **FR-023**: Manage people MUST offer **Download list**: one row per attendee of the event with attendee email, name and current room (blank when none), and **Upload list** in the same format, with a downloadable template.
- **FR-024**: Uploaded rows MUST be matched to an attendee of the event by email, and to a room of this session by name. Failed matches and a person listed more than once MUST be row errors. A blank room MUST take the attendee out of their room. The name column is for reference only.
- **FR-025**: Valid rows MUST create, move or remove the attendee's assignment for this breakout, recorded as coming from a CSV upload. Rooms that would end up over capacity MUST be shown as preview warnings without blocking the upload.
- **FR-026**: Both imports MUST show a preview with per-row errors and warnings before saving, save only valid rows, and change nothing when the same file is uploaded again.
- **FR-027**: *(Merged into FR-023.)*

**Access and integrity**

- **FR-028**: Only organisers MUST be able to create, edit or delete rooms, or create, change or remove other people's assignments. Organisers here are the event's hosts, organisers and admins, owners/admins of the organisation that owns the event, and platform admins.
- **FR-033** *(developer decision, 2026-10-13)*: Owners/admins of the organisation that owns the event MUST be able to create, edit and delete that event's agenda sessions in the Portal, including the session's assignment mode and its rooms. Today only platform admins can save agenda sessions, so this is a deliberate change to existing behaviour. Event hosts and organisers who are not organisation admins keep today's session rights; they manage rooms and assignments through FR-028.
- **FR-029**: When an attendee is removed from an event or a session is deleted, their related assignments (or the session's rooms and assignments) MUST be removed and no longer counted.

- **FR-034**: The Portal MUST show controls only to people who can use them:
  - create, edit and delete session controls: platform admins and owners/admins of the event's organisation
  - "Manage people", both breakout uploads and the assignments download: organisers (FR-028)
  - everyone else with access to the event workspace sees the agenda read-only

**Unchanged behaviour**

- **FR-030**: Apart from FR-033 and the agenda spreadsheet changes in FR-019–FR-022 (breakout columns; re-uploads update instead of duplicating), the existing agenda session editing and the manual "Push to Planner" behaviour (shown only on events linked to Planner with Bendie active, pushing each session as one Planner item) MUST remain unchanged. No Planner data or behaviour changes.
- **FR-031**: Events without breakouts MUST look and behave exactly as before.

**Release 2 contract (attendee app)**

- **FR-032**: The updated attendee app MUST read rooms, mini-agendas, mode, room fullness and the attendee's own assignment from the durable data (FR-018), make all picks through the room-choice action (FR-016), show the refusal reasons from FR-017 in plain language, show "Your room will be announced" in *Organiser assigns* mode when unassigned, and keep awarding the existing leaderboard point on a successful join.

### Key Entities

- **Breakout session**: an existing agenda session that has one or more rooms; gains an assignment mode.
- **Breakout room**: belongs to one breakout session; name (unique in the session), description, location, facilitator (a Speaker of the event, or a preserved legacy name), optional capacity, display order.
- **Room time block**: belongs to one room; title, description, start, end, location, order. Forms the room's mini-agenda.
- **Room assignment**: links one attendee to one room of one breakout session (at most one per attendee per session); source (attendee / organiser / CSV upload), made by, made at.
- **Attendee**: an existing event member with the attendee role (unchanged).
- **Speaker**: an existing event speaker/facilitator record (unchanged), referenced as a room's facilitator.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of rooms existing before release appear unchanged in the Portal and in the currently released attendee app after release, with no organiser action.
- **SC-002**: An organiser can set up a breakout with three rooms, facilitators, capacities and a two-block mini-agenda each in under 5 minutes.
- **SC-003**: An organiser can assign 300 attendees across rooms with one assignments upload in under 3 minutes end to end, with every rejected row identified individually with its reason.
- **SC-004**: Uploading the same rooms or assignments file a second time produces zero new rooms or assignments.
- **SC-005**: In a test of 20 attendees picking simultaneously for a room with 5 free seats, exactly 5 succeed and the room never exceeds its capacity through attendee picks.
- **SC-006**: Headcounts shown in the Portal match the actual number of assigned attendees in 100% of checked breakouts.
- **SC-007**: After Release 2, an attendee's room pick is still shown as theirs after an app restart and on a second device in 100% of tested cases, and appears in the Portal on the organiser's next view.
- **SC-008**: Events without breakouts, and the Planner push for linked events, show no change in behaviour (verified by regression check).

## Assumptions

- Attendees are bulk-registered through the Portal before the event, so every attendee has an account and event membership to be assigned against; assignments are tied to the attendee's account, as the existing "add to my agenda" data is.
- Only members with the attendee role are assignable; speakers, staff and organisers are not placed in rooms.
- Owners/admins of an organisation are always members of that organisation's events (role admin or host). This is maintained automatically and was true for every case on 2026-10-13. The agenda's existing rule that only event members can read and write agenda data still applies to them, so FR-033 relies on this membership.
- "Session start" in CSV files uses the same date-time formats the existing agenda CSV upload accepts, interpreted the same way.
- The assignments download covers all breakout sessions of the event in one file.
- Attendees may see whether a room is full and how many seats remain, but not who else is in it.
- The Portal and the attendee app share one live database; Release 1 changes must be safe for the currently released app (verified before release).
- Mini-agenda block times are not required to fall within the parent session's time window (matching today's behaviour).

## Dependencies

- The event's Speakers list (room facilitator selection and CSV matching).
- The event's membership and roles (who counts as an attendee and as an organiser).
- The existing agenda page, its CSV upload experience, and its access rules.
- Release 2 depends on the attendee-app repository adopting the FR-032 contract.

## Out of Scope

- Any Planner change; rooms and assignments are not sent to Planner.
- Waitlists for full rooms.
- Notifying attendees when they are assigned or moved.
- Reporting beyond the Portal headcounts, lists and the assignments download.
- Implementing the attendee-app changes in this repository (Release 2 is specified here, built in the app repository).
