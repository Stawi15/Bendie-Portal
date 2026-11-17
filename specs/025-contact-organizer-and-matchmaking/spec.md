# Feature Specification: Contact Organizer Toggle and Matchmaking Checks

**Feature Branch**: `025-contact-organizer-and-matchmaking`

**Created**: 2026-11-17

**Status**: Draft

**Input**: Bendie Events backend brief, action items 6 and 10. (6) Add a "Show on access screen (Contact Organizer)" toggle to each support contact (`support_contacts.show_on_access_screen`, at most one per event). (10) Every matchmaking select question needs at least one option, and question keys should stay stable.

## Background

**Contact Organizer.** In the attendee app, someone who enters an email that isn't registered for an event sees "Not registered" with a **Contact Organizer** button. It shows the one support contact marked for this, with Call and Email buttons. That person isn't signed in, so the contact's **name, phone, email and group become visible to anyone with the event's link**. At most one contact per event can be marked; the database enforces it with a unique index (error `23505`). With none marked, or when the event isn't active or published, the app shows "Contact Bendie support" (bendie@stawiexperiences.com) instead. The Portal can't mark a contact today.

**Matchmaking.** The app skips a select question (single or multi) that has no options. In Stawi Escape, `goals` was hidden this way until it was fixed by hand on 10 Nov. Answers are matched by question key, so a changed key breaks matching. The Portal already has no way to rename a key, but nothing warns about select questions without options.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Choose the Contact Organizer contact (Priority: P1)

An organiser editing a support contact ticks **Show on access screen (Contact Organizer)**. A warning explains that the contact's name, phone, email and group become public to anyone with the event link. If another contact was already ticked, they're asked to confirm the replacement, and the old one is unticked. The list shows which contact is on the access screen.

**Independent Test**: Tick contact A and save; the list shows A as the access-screen contact. Tick contact B, confirm the replacement and save; only B is marked.

**Acceptance Scenarios**:

1. **Given** the contact form, **When** the organiser ticks the toggle, **Then** the public-visibility warning is shown.
2. **Given** a ticked contact with neither phone nor email, **When** they save, **Then** they're told the contact needs a phone or an email to be shown, and nothing is saved.
3. **Given** contact A is ticked, **When** the organiser ticks contact B and saves, **Then** they confirm "B will replace A on the access screen", A is unticked, and B is ticked.
4. **Given** the replacement is cancelled, **When** they cancel the confirmation, **Then** nothing changes.
5. **Given** the contact list, **When** a contact is ticked, **Then** it shows a "Shown on access screen" badge.
6. **Given** no contact is ticked, **When** the page loads, **Then** a note explains that unregistered people will see "Contact Bendie support" instead.

---

### User Story 2 - Select questions are never silently hidden (Priority: P2)

An organiser sees a clear warning on any single- or multi-select question that has no options, saying attendees won't see it. Deleting the last option asks for confirmation. Importing a spreadsheet that leaves a select question without options warns in the preview. When adding a question, they're told the key can't be changed later.

**Independent Test**: Add a select question with no options and see the warning. Add an option and the warning goes. Delete it and confirm the prompt.

**Acceptance Scenarios**:

1. **Given** a select question with no options, **When** the page shows it, **Then** it's marked "Hidden from attendees" with an explanation.
2. **Given** a select question with exactly one option, **When** the organiser deletes that option, **Then** they're asked to confirm, being told the question will be hidden from attendees.
3. **Given** a spreadsheet import where a select question would end up with no options (after counting existing ones), **When** it's previewed, **Then** a non-blocking warning names the question.
4. **Given** the add-question form, **When** it's shown, **Then** the key field explains that keys can't be changed later because answers are matched by them.

### Edge Cases

- **Saving the replacement fails half-way:** the old contact is unticked, then ticking the new one fails. The Portal re-ticks the old contact and reports the failure.
- **Someone else ticked a contact in the meantime:** the unique index rejects the save. The Portal reloads and says another contact is already on the access screen.
- **Deleting a ticked contact:** allowed. The event then has none, and the "no contact" note appears.
- **A ticked contact's phone and email are later both removed:** saving is blocked by the same rule as scenario US1 #2.
- **A text question** (short or long text) needs no options and gets no warning.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The support-contact form MUST include a "Show on access screen (Contact Organizer)" toggle.
- **FR-002**: When ticked, the form MUST warn that the contact's name, phone, email and group become visible to anyone with the event's link, before sign-in.
- **FR-003**: A ticked contact MUST have a phone or an email.
- **FR-004**: At most one contact per event MUST be ticked. Ticking a different one MUST ask for confirmation, untick the current one, then tick the new one. On failure the previous state MUST be restored.
- **FR-005**: A save rejected by the one-per-event rule MUST show a plain message and reload the list.
- **FR-006**: The contact list MUST mark the ticked contact. The page MUST note when none is ticked and say what unregistered people see instead.
- **FR-007**: Select questions with no options MUST be visibly marked as hidden from attendees.
- **FR-008**: Deleting a select question's last option MUST ask for confirmation.
- **FR-009**: The networking spreadsheet import MUST warn, without blocking, about select questions that would have no options.
- **FR-010**: The add-question form MUST state that a question's key can't be changed later.

### Out of scope

- Choosing which events are active or published.
- Editing the fallback "Bendie support" address.
- Renaming question keys (deliberately not offered).
- Any database change.

## Success Criteria *(mandatory)*

- **SC-001**: An organiser can mark an event's Contact Organizer contact in under 30 seconds.
- **SC-002**: It's impossible to end a save with two contacts marked on one event.
- **SC-003**: 100% of select questions without options are visibly flagged on the networking page.

## Assumptions

- Live state, per the brief (2026-11-09):
  - `support_contacts.show_on_access_screen` exists as boolean, not null, default false;
  - its partial unique index is `support_contacts_one_access_contact_per_event`;
  - organisers can update it under the existing RLS.

  To be confirmed before merge, with the Feature 024 check.
- The confirm dialog and toasts follow existing Portal patterns.
