# Feature Specification: Bendie Planner Integration

**Feature Branch**: `001-bendie-planner-integration`

**Created**: 2026-09-10

**Status**: Draft

**Input**: User description: "Create the formal feature specification for Bendie Planner Integration — a cross-system integration between Bendie Portal (client/attendee-facing, authoritative for event members and agenda) and Bendie Planner (a separate application for event organizers/production staff, authoritative for travel logistics). Approved product decisions: (1) only staff-tier event members (host, organizer, admin, facilitator, staff, speaker) sync to Planner — ordinary attendees never do; (2) event linking is one-to-one for MVP — one Portal event to one Planner event, discovered via a flat/searchable list, with organization-level linking deferred; (3) Planner is authoritative for travel data it supplies, which must be read-only and visibly distinguishable in Portal, matched to Portal members by email, with unmatched Planner travelers skipped and surfaced rather than misattached; (4) member sync is automatic at provisioning time (best-effort, non-blocking, with visible status), agenda push and travel pull are manually triggered by an administrator. Full behavioral detail supplied in conversation and reflected in the requirements below."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Link a Portal event to its Bendie Planner event (Priority: P1)

An administrator managing an event in Bendie Portal wants to connect it to the corresponding event already set up in Bendie Planner, so that member, agenda, and travel synchronization become available for that event.

**Why this priority**: Every other capability in this feature depends on an active link existing first. Without it, nothing else in this feature can be demonstrated or tested.

**Independent Test**: Can be fully tested by opening an unlinked Portal event's Bendie Planner control area, selecting an available Planner event from a searchable list, confirming the link, and observing the event now shows as linked with the chosen Planner event's identity displayed — independent of whether any member, agenda, or travel action is ever performed.

**Acceptance Scenarios**:

1. **Given** a Portal event with no active Planner link, **When** the administrator opens that event's Bendie Planner control area, **Then** the area clearly indicates the event is not linked and offers a way to find and select an available Planner event.
2. **Given** an administrator is choosing a Planner event to link, **When** they search or browse the list of available Planner events, **Then** they can find and select one, and the search/browse experience does not require any organization-level configuration to work.
3. **Given** an administrator selects a Planner event and confirms the link, **When** the link is created, **Then** the Portal event's control area displays the linked Planner event's identity and an active status.
4. **Given** a Planner event that is already linked to a different Portal event, **When** an administrator attempts to link a second Portal event to that same Planner event, **Then** the system rejects the attempt and the pre-existing link is not altered.
5. **Given** a Portal event with an active Planner link, **When** the administrator chooses to unlink it, **Then** the event's control area returns to an unlinked state and no further member, agenda, or travel synchronization actions are available for that event until it is linked again.

---

### User Story 2 - Eligible staff members automatically become available in the linked Planner event (Priority: P2)

An administrator provisioning a host, organizer, admin, facilitator, staff, or speaker for a Portal event wants that person to also become available in Bendie Planner for the corresponding event, without a separate manual step, so organizers and production staff have access to the tools they need in Planner as soon as they're set up in Portal.

**Why this priority**: This is the highest-value, highest-frequency flow — it removes the exact manual double-entry problem the integration exists to solve — but it depends on User Story 1's linking capability already existing.

**Independent Test**: Can be fully tested by provisioning a staff-tier member on an event that has an active Planner link, and observing that the system attempts to make that person available in Planner and reports a clear status (succeeded, failed, or skipped) for that attempt — independent of whether agenda or travel actions are ever used.

**Acceptance Scenarios**:

1. **Given** a Portal event with an active Planner link, **When** an administrator provisions a new member with a staff-tier role (host, organizer, admin, facilitator, staff, or speaker) for that event, **Then** the system attempts to make that person available in the corresponding Planner event, matching identity by the person's email address.
2. **Given** the person being provisioned has no existing identity in Planner, **When** the synchronization attempt runs, **Then** the system is able to establish the necessary identity in Planner so the person can participate, without requiring the administrator to do this manually in a separate system.
3. **Given** a Portal event with an active Planner link, **When** an administrator provisions a new member with the ordinary attendee role, **Then** the system does not attempt to make that person available in Planner, and no attendee ever appears in Planner as a result of Portal provisioning.
4. **Given** a Portal event provisioning action for an eligible staff-tier member, **When** the Portal-side provisioning completes successfully but the Planner-side synchronization attempt fails, **Then** the Portal provisioning action is still reported to the administrator as successful, and the Planner synchronization failure is reported separately and distinctly.
5. **Given** a Portal event with no active Planner link, **When** an administrator provisions an eligible staff-tier member, **Then** no Planner synchronization is attempted, and the member is provisioned in Portal exactly as it works today.
6. **Given** any completed provisioning action for an eligible staff-tier member on a linked event, **When** the administrator reviews that member's synchronization outcome, **Then** they can determine whether it succeeded, failed, or was skipped, and why.

---

### User Story 3 - Push the Portal agenda to the linked Planner event (Priority: P3)

An administrator who has finished editing an event's agenda in Bendie Portal wants to manually send that agenda to the corresponding Bendie Planner event, so Planner's production/organizer view reflects the same schedule.

**Why this priority**: High value for organizers running the event day-of, but it is an explicitly manual, on-demand action rather than something that happens automatically — it can be built and demonstrated independently once linking exists, and does not block or depend on member sync.

**Independent Test**: Can be fully tested by editing a linked event's Portal agenda, triggering the push action, and observing the Planner event's schedule reflects the pushed content — then repeating the push with no changes and observing no duplicate content is produced.

**Acceptance Scenarios**:

1. **Given** a Portal event with an active Planner link and existing agenda content, **When** an administrator triggers the agenda push action, **Then** the system sends the current Portal agenda content to the corresponding Planner event and reports whether the push succeeded.
2. **Given** an agenda that was already pushed once, **When** the administrator edits the Portal agenda and pushes again, **Then** the previously synchronized agenda content in Planner is updated to reflect the changes rather than duplicated alongside the old copy.
3. **Given** a Portal agenda item that was previously pushed and has since been removed from the Portal agenda, **When** the administrator pushes again, **Then** the system does not automatically delete the corresponding content from Planner.
4. **Given** a Portal event with no active Planner link, **When** an administrator attempts to push the agenda, **Then** the action is not available or is rejected, consistent with the event having no active link.
5. **Given** an agenda push in progress or just completed, **When** the administrator checks the event's Bendie Planner control area, **Then** they can tell whether the most recent push succeeded or failed.

---

### User Story 4 - Pull flight and hotel travel information from the linked Planner event (Priority: P4)

An administrator wants to manually pull the flight and hotel/accommodation information already managed in Bendie Planner into the corresponding Portal event, so that information is visible to Portal-side attendees without being re-entered by hand.

**Why this priority**: Valuable but the most operationally complex of the three flows (identity matching, read-only ownership, no-duplicate guarantees) and is explicitly a manual, on-demand action independent of the other three stories.

**Independent Test**: Can be fully tested by triggering a travel pull on a linked event with known flight/hotel data in Planner, and observing that matched travelers' information appears in Portal as read-only, visibly Planner-sourced records, unmatched travelers are skipped and reported, and a repeated pull does not duplicate anything.

**Acceptance Scenarios**:

1. **Given** a Portal event with an active Planner link, **When** an administrator triggers the travel pull action, **Then** the system retrieves flight and hotel/accommodation information from the corresponding Planner event.
2. **Given** a Planner traveler whose email matches an existing member of the linked Portal event, **When** the pull runs, **Then** that traveler's flight/hotel information is attached to the matching Portal member's travel information, marked as Planner-sourced.
3. **Given** a Planner traveler whose email does not match any member of the linked Portal event, **When** the pull runs, **Then** that traveler's information is not attached to any Portal member, and the administrator is informed that it was skipped and why.
4. **Given** travel information previously pulled from Planner, **When** the administrator views it in the Portal, **Then** it is visibly distinguishable from travel information a Portal user entered manually, and any attempt to edit it directly in the Portal is prevented.
5. **Given** travel information previously pulled from Planner for a given traveler, **When** the administrator pulls again after that data has changed in Planner, **Then** the previously imported record is updated to reflect the new information rather than duplicated.
6. **Given** a Portal event with manually entered travel records that did not come from Planner, **When** a travel pull runs, **Then** those manually entered records are left exactly as they were, remaining fully editable.
7. **Given** a Portal event with no active Planner link, **When** an administrator attempts to pull travel information, **Then** the action is not available or is rejected, consistent with the event having no active link.

---

### Edge Cases

- What happens when an administrator tries to link a Portal event to a Planner event that is already linked to a different Portal event? The attempt is rejected and neither event's existing link state changes (see User Story 1, Scenario 4).
- What happens when a member's role changes after they've already been synchronized to Planner, or when they're removed from the Portal event entirely? Out of scope for this MVP — see Assumptions and Out of Scope.
- What happens when the administrator unlinks a Portal event that has previously synchronized members, agenda content, or travel data? The Portal event returns to an unlinked state; no automatic deletion of anything already sent to or pulled from Planner occurs.
- What happens when a Planner-side identity cannot be established for a staff-tier member being synchronized (for reasons outside the integration's control)? The Portal provisioning action still succeeds, and the synchronization outcome is reported as failed with enough detail for an administrator to follow up.
- What happens when an agenda push or travel pull is triggered on an event with no agenda content or no travel data respectively? The action completes and reports that there was nothing to synchronize, rather than behaving as an error.
- What happens if an administrator attempts to manually edit a Planner-sourced travel record through the Portal's existing travel-editing interface? The edit is prevented; only Portal-created travel records remain editable there.
- What happens when the same Planner traveler email matches more than one Portal member of the same linked event? This is not an expected case under normal data hygiene; the system's matching behavior in this situation is an implementation concern, not a product requirement, and does not change the feature's intended behavior for the normal case.

## Requirements *(mandatory)*

### Functional Requirements

**Event linking**

- **FR-001**: An administrator MUST be able to see, for any given Portal event, whether it currently has an active link to a Bendie Planner event.
- **FR-002**: An administrator MUST be able to search or browse a list of available Bendie Planner events when establishing a link, without any prerequisite organization-level configuration.
- **FR-003**: An administrator MUST be able to select a Bendie Planner event from that list and establish an active link between it and the current Portal event.
- **FR-004**: The system MUST prevent a single Bendie Planner event from being actively linked to more than one Portal event at the same time.
- **FR-005**: An administrator MUST be able to see the identity of the Bendie Planner event a Portal event is currently linked to.
- **FR-006**: An administrator MUST be able to unlink or deactivate an active link between a Portal event and its Bendie Planner event.
- **FR-007**: Member synchronization, agenda push, and travel pull MUST only be available or take effect for a Portal event that currently has an active Bendie Planner link.

**Member synchronization (Portal → Planner)**

- **FR-008**: When a member with a staff-tier role (host, organizer, admin, facilitator, staff, or speaker) is provisioned for a Portal event that has an active Planner link, the system MUST attempt to make that person available in the corresponding Planner event.
- **FR-009**: The system MUST NOT attempt to make an ordinary attendee-role member available in Bendie Planner under any circumstance.
- **FR-010**: The system MUST match a person's identity between Portal and Planner using their email address.
- **FR-011**: When a person being synchronized has no existing identity in Planner, the system MUST be able to establish one so that person can participate in the Planner event.
- **FR-012**: A failure in the Planner-side synchronization attempt MUST NOT cause an otherwise-successful Portal member-provisioning action to be reported to the administrator as failed.
- **FR-013**: The system MUST make the outcome of each Planner member-synchronization attempt (succeeded, failed, or skipped, with the reason when failed or skipped) available to an administrator.
- **FR-014**: Member synchronization to Planner MUST only be attempted for a Portal event that has an active Planner link at the time of provisioning; provisioning on an unlinked event MUST behave exactly as it does today, with no synchronization attempt.

**Agenda synchronization (Portal → Planner)**

- **FR-015**: An administrator MUST be able to manually trigger a push of a linked Portal event's agenda content to its corresponding Planner event.
- **FR-016**: Pushing agenda content that was already synchronized in a previous push MUST update the previously synchronized content in Planner rather than create a duplicate copy of it.
- **FR-017**: The system MUST NOT automatically delete agenda content in Planner solely because corresponding content is no longer present in the Portal agenda.
- **FR-018**: The system MUST make the outcome of each agenda push (succeeded, failed, and how much content was affected) available to an administrator.
- **FR-019**: Agenda synchronization MUST remain a manually triggered, on-demand action; the system MUST NOT synchronize agenda content automatically or continuously.

**Travel synchronization (Planner → Portal)**

- **FR-020**: An administrator MUST be able to manually trigger a pull of flight and hotel/accommodation information from a linked Portal event's corresponding Planner event.
- **FR-021**: The system MUST match each Planner traveler to a member of the linked Portal event using identity/email matching.
- **FR-022**: Travel information for a Planner traveler that cannot be matched to a member of the linked Portal event MUST NOT be attached to any Portal member; it MUST instead be skipped, and the administrator MUST be informed that it was skipped.
- **FR-023**: A travel record that originated from a Planner pull MUST be visibly distinguishable, in the Portal, from a travel record a Portal user created manually.
- **FR-024**: A travel record that originated from a Planner pull MUST NOT be editable by a Portal user through the Portal's existing travel-editing interface.
- **FR-025**: A travel record that a Portal user created manually MUST remain fully editable according to the Portal's existing permissions and behavior, and MUST NOT be affected by a Planner travel pull.
- **FR-026**: Pulling travel information that was already imported in a previous pull MUST update the previously imported record rather than create a duplicate of it.
- **FR-027**: Ground-transfer information MUST NOT be included in this feature's travel pull.

**Authorization and security**

- **FR-028**: Only an authorized Portal administrator MUST be able to view, configure, or trigger any part of this integration (linking, unlinking, member synchronization status, agenda push, travel pull).
- **FR-029**: The system MUST independently verify that the acting user is an authorized Portal administrator before performing any privileged integration action, regardless of what the requesting interface has already displayed or allowed.
- **FR-030**: No credential, key, or other secret used to communicate with Bendie Planner MUST ever be exposed to or reachable from a Portal user's browser session.
- **FR-031**: A user without authorized Portal administrator access MUST NOT be able to trigger any privileged integration action by any means, including bypassing the normal interface.

**General ownership boundaries**

- **FR-032**: Bendie Portal MUST remain the authoritative source for event member data and agenda content; Bendie Planner MUST only ever receive derived copies of that data through this integration, never the reverse for those two data types.
- **FR-033**: Bendie Planner MUST remain the authoritative source for the travel data it supplies through this integration; Bendie Portal MUST only ever receive a derived, read-only copy of it, never send Portal-originated travel data back to Planner through this integration.
- **FR-034**: The system MUST NOT synchronize any data type in both directions; each of the three supported data types (members, agenda, travel) has exactly one authoritative direction as defined above.

### Key Entities

- **Planner Link**: Represents the active or inactive association between one Portal event and one Planner event. Enforces the one-to-one rule (a Planner event backs at most one Portal event) and is the gate that determines whether member, agenda, or travel synchronization can occur for a given Portal event.
- **Planner Participant Reference**: Represents that a specific staff-tier Portal event member has been made available in the corresponding Planner event, including the outcome of that synchronization attempt (succeeded, failed, or skipped) so administrators can see status per person.
- **Synchronized Agenda Item**: Represents a piece of Portal agenda content that has been pushed to the linked Planner event, tracked so that a later push updates the same item rather than duplicating it.
- **Imported Travel Record**: Represents a flight or hotel/accommodation entry pulled from the linked Planner event and attached to a matched Portal event member. Distinguished from a manually created Portal travel record by its origin, is read-only within the Portal, and is tracked so a later pull updates it rather than duplicating it.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An administrator can determine whether a given Portal event is linked to Planner, and which Planner event it's linked to, entirely within that event's Bendie Planner control area, without consulting any other system.
- **SC-002**: 100% of staff-tier members provisioned on a Planner-linked Portal event have a visible synchronization outcome (succeeded, failed, or skipped) available to administrators; 0% of ordinary attendees ever appear as synchronized to Planner.
- **SC-003**: Repeating an agenda push on an unchanged Portal agenda never increases the amount of synchronized content in the linked Planner event.
- **SC-004**: Repeating a travel pull for the same Planner traveler never increases the number of travel records attributed to that traveler in the Portal.
- **SC-005**: 100% of travel records that originated from a Planner pull are both visibly marked as Planner-sourced and rejected when a Portal user attempts to edit them directly.
- **SC-006**: 100% of attempts to link a Planner event that is already linked to a different Portal event are rejected without altering the existing link.
- **SC-007**: 100% of Portal member-provisioning actions that succeed on the Portal side are reported to the administrator as successful, regardless of whether the associated Planner synchronization attempt succeeds, fails, or is skipped.
- **SC-008**: 0% of privileged integration actions (linking, unlinking, triggering synchronization) can be performed by a user who is not an authorized Portal administrator.

## Assumptions

- "Authorized Portal administrator" refers to the Portal's existing single administrator access level used throughout the rest of the application; this feature does not introduce a new or separate permission tier.
- Member synchronization to Planner happens at the moment a staff-tier member is provisioned. Later changes to that member's role, or their removal from the Portal event, are not synchronized to Planner as part of this MVP — this is a deliberate scope boundary, not an oversight (see Out of Scope).
- Unlinking a Portal event from its Planner event does not delete, modify, or deactivate any data previously sent to or pulled from Planner; it only stops further synchronization from occurring for that Portal event.
- Establishing a link when a Portal event already has an active link to a different Planner event replaces the existing link; it does not delete or alter anything previously synchronized under the prior link.
- Travel-traveler identity matching is scoped to the members of the specific linked Portal event, not to every Portal profile across all events.
- "Available Planner events" for the linking search/browse experience means all Planner events visible to an authorized administrator under the MVP's flat, non-organization-scoped discovery model.

## Out of Scope (MVP)

The following are explicitly excluded from this feature and MUST NOT be silently introduced during implementation:

- Synchronizing ordinary attendee-role members to Bendie Planner.
- Synchronizing ground-transfer information as part of the travel pull.
- Synchronizing agenda breakout rooms or other agenda sub-items, except where such content is already represented as ordinary supported agenda content.
- Automatic, continuous, or scheduled agenda synchronization — agenda push remains manually triggered only.
- Automatically deleting Planner agenda content because corresponding Portal content was removed.
- Organization-level linking or scoping between Portal organizations and Planner organizations — Planner event discovery for MVP is a flat, searchable list only.
- General-purpose two-way synchronization of any data type — each of members, agenda, and travel has exactly one authoritative direction, and this feature does not add a second direction for any of them.
- Synchronizing role changes or member removal after initial provisioning.
- Redesigning the existing architecture, permission model, or user experience of either Bendie Portal or Bendie Planner beyond what this feature explicitly requires.
- Any unrelated cleanup, refactor, or behavior change to existing Portal or Planner functionality.
