# Feature Specification: Photo Games Editor and Chat Switch

**Feature Branch**: `032-photo-games-editor` (from `main`, the live portal)

**Created**: 2026-11-26

**Status**: Draft

**Input**: User description: "The Bendie Events backend now has two Interactives photo games, Human Bingo and Connects (docs/bendie-events-backend-changes.md action items 14–17 and §6; docs/benid-events-games.md). Organisers need to manage what players see on the Bingo squares and Connects cards from the portal, see the games' activity and leaderboard, and switch chat off per event. Ship to the live portal and the redesign. Architect blueprint confirmed by the developer 2026-11-26."

## Context

The games' content (15 Bingo prompts and 60 Connects cards) lives in the database and is read every time a player opens a game, so edits go live with no app update. Today it can only be changed with SQL. The backend is already live; this feature is the portal side.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Change what players see (Priority: P1)

An organiser opens Games → Human Bingo (or Connects) for their event. They see whether the event uses the shared library or its own content. They press "Use own content", then edit a prompt's text, reorder it, switch prompts on or off, and add new ones. Bingo shows a preview of the 3×5 board players will see.

**Independent Test**: On a test event, switch to own content, edit, reorder, switch off and add a prompt; the board preview and the saved rows match.

**Acceptance Scenarios**:

1. **Given** an event using the library, **Then** the tab says so, lists the library rows read-only, and offers "Use own content".
2. **Given** "Use own content" is pressed, **Then** the event gets its own copy (all library rows) and the rows become editable. Pressing "Pull in new library rows" later adds only rows the event doesn't have, never overwriting edits.
3. **Given** own content, **When** text is edited (1–300 characters), a row is moved up or down, or a row is switched on or off, **Then** the change is saved and the list and board preview update.
4. **Given** "Add prompt"/"Add card", **Then** a new row is created with a safe new id (Bingo: a lowercase slug from the text; Connects: the next free `card-NN`). Ids can't be edited and rows can't be deleted.
5. **Given** Bingo, **Then** the preview shows exactly the first 15 active prompts in order; with fewer than 15 active, a warning says the board will have empty squares.
6. **Given** Connects with no active cards, **Then** a warning says players won't get a card. Each card shows how many players hold it right now.
7. **Given** the event is running (between its start and end dates), **When** reordering or switching off a Bingo prompt, **Then** a warning says filled squares that leave the board stop counting.

---

### User Story 2 - Manage the master library (Priority: P1)

A Stawi admin opens Games library and edits the master prompts and cards (the same editor), which every event without its own copy uses.

**Acceptance Scenarios**:

1. **Given** a Stawi admin, **Then** Games library is reachable from the admin menu and editable. Non-admins can't open it.

---

### User Story 3 - See the games being played (Priority: P2)

The organiser opens Games → Activity and sees each game photo (photo, game, square or card, who took it, who was in it, when), newest first. Games → Leaderboard shows players ranked by total points.

**Acceptance Scenarios**:

1. **Given** game photos exist, **Then** Activity lists them with player names and numbers; with none, an empty state explains how the games work.
2. **Given** points exist, **Then** Leaderboard ranks players with name, player number and points.

---

### User Story 4 - Switch chat off and see player numbers (Priority: P1)

In Basics, under the attendee app menu ("hide items"), the organiser can tick **Chats** to switch chat off for the event. The Attendees list shows each person's player number.

**Acceptance Scenarios**:

1. **Given** Chats is ticked and saved, **Then** the event's chat is off (`chat_enabled = false`); unticking switches it back on.
2. **Given** the Attendees list, **Then** each member shows their player number (read-only).

### Edge Cases

- A role without edit rights (e.g. event staff): rows are shown read-only, and a refused save shows a clear error.
- Duplicate or invalid new ids: refused before saving with a clear message.
- Hold counts or the leaderboard can't be loaded: a message instead of numbers; the editor still works.
- An event that hides Interactives: the editor still works, with a note that players can't see the games.

## Requirements *(mandatory)*

- **FR-001**: The Games section MUST offer tabs Quiz games (unchanged), Human Bingo, Connects, Activity and Leaderboard.
- **FR-002**: Each game tab MUST show whether the event uses the library or its own content, and offer "Use own content" / "Pull in new library rows" (`photo_game_copy_library_to_event`).
- **FR-003**: With own content, organisers MUST be able to edit text (1–300 characters), reorder, switch on/off and add rows; deleting rows and editing ids MUST NOT be possible (action item 15).
- **FR-004**: New ids MUST match `^[a-z0-9][a-z0-9-]{0,62}$` and be unique for the game (Connects suggests the next `card-NN`).
- **FR-005**: Bingo MUST show a board preview of the first 15 active rows and warn when fewer than 15 are active and when changing the board while the event is running.
- **FR-006**: Connects MUST warn when no card is active and show how many players hold each card (server-side count, organisers only).
- **FR-007**: Stawi admins MUST be able to edit the master library on an admin page; others MUST NOT.
- **FR-008**: Activity MUST list game photos (read-only); Leaderboard MUST rank players by points.
- **FR-009**: Basics MUST offer a Chats item in the attendee-app "hide items" list that saves `events.chat_enabled`.
- **FR-010**: The Attendees list MUST show each member's player number (read-only).
- **FR-011**: Nothing may write `photo_game_entries`, `connect_hands`, `game_points` or `player_number` (action item rules).
- **FR-012**: Existing quiz games, Basics and Attendees behaviour MUST be unchanged apart from these additions.

## Success Criteria *(mandatory)*

- **SC-001**: An organiser can change a Bingo square's text and see it on the board preview in under a minute, with no SQL.
- **SC-002**: 100% of the editing actions (edit, reorder, on/off, add, use own content, pull new rows) save correctly and never delete rows or change ids.
- **SC-003**: Activity, Leaderboard and hold counts match the database for the test event.
- **SC-004**: The chat switch saves and reloads correctly; player numbers match the database.
- **SC-005**: The access walk-through shows no change for existing pages.

## Assumptions

- The backend (tables, permissions, copy function) is live in production and mirrored on the test database (docs/test-env/photo-games-test-setup.sql). No production database change.
- The live layout's patterns are used (tabs, edit pop-up, ↑/↓ reorder); the redesign gets the same page by merging `main`.
- Hiding game photos is out of scope (needs a backend permission change).
