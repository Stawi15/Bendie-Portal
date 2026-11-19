# Feature Specification: Event Time Zone

**Feature Branch**: `024-event-timezone`

**Created**: 2026-11-17

**Status**: Implemented, reviewed and browser-verified (2026-11-19)

**Input**: User description: "Add a time zone to every Bendie event (Bendie Events backend brief, action items 1 and 2): a required, searchable time zone on the event create form, pre-filled from the organiser's computer, and editable on the basics page. Dates and times organisers enter are read as venue time in that zone. When the event includes Bendie Planner, copy the time zone to the Planner event when it is created (Planner backend brief, 2026-10-07). Planner agenda day numbers use the event's time zone. Explain the new effect of the feedback form link."

## Background

The Bendie attendee app now sends automatic pushes for each event: a countdown the day before, "today's the day", a lunchtime nudge, an evening recap and a last-day "share your feedback" message. It works out the local day from the event's **time zone** (`events.timezone`, an IANA name such as `Africa/Nairobi`). **An event with no time zone gets none of these pushes.** The Portal has no way to set it today.

Two more problems surface once a time zone exists:
- **Dates aren't stored in venue time.** The create form sends plain dates, which are stored as midnight UTC. For an event west of UTC, such as New York, midnight UTC is the evening before, so the app would treat the event as starting a day early. The basics page shows and saves times in the organiser's own computer's time zone, not the venue's.
- **Planner defaults to Nairobi.** Bendie Planner has its own required event time zone, and every time on a Planner event is venue-local. The Portal creates Planner events without one, so they all default to Africa/Nairobi.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Set the time zone when creating an event (Priority: P1)

An organiser creates an event. The form shows a **Time zone** field, already filled with their computer's time zone. They can search and pick another (e.g. "Kigali" finds `Africa/Kigali`). The event is created with that time zone, and the dates they picked are that day in that time zone.

**Why this priority**: Every new event needs this, or attendees get none of the automatic pushes. This is the core of the feature.

**Independent Test**: Create an event with time zone `America/New_York` and start date 20 Nov. Check that the saved event has that time zone and that its start, read in New York time, is 20 Nov.

**Acceptance Scenarios**:

1. **Given** the create form, **When** it opens, **Then** the Time zone field is filled with the organiser's computer time zone.
2. **Given** the Time zone field, **When** the organiser types part of a city or region, **Then** matching time zones are offered.
3. **Given** a time zone that isn't a recognised name (typed freely), **When** they try to continue or create, **Then** they see "Choose a time zone from the list" and creation doesn't proceed.
4. **Given** time zone `America/New_York` and start date 20 Nov, **When** the event is created, **Then** its start is the beginning of 20 Nov in New York, and its end date likewise.
5. **Given** an event that includes Bendie Planner, **When** it is created, **Then** the Planner event gets the same time zone.

---

### User Story 2 - Set or change the time zone on an existing event (Priority: P1)

An organiser opens an existing event's basics page. If it has no time zone, a notice explains that automatic reminders are off until one is set. They pick the time zone and save. Start and end times on the page are shown and saved in the event's time zone, labelled with it.

**Why this priority**: Existing events (all but two) have no time zone, so their organisers need to set it to switch the pushes on.

**Independent Test**: On an event with no time zone, see the notice, set `Africa/Kigali`, save, reload, and confirm it's kept and the notice is gone.

**Acceptance Scenarios**:

1. **Given** an event with no time zone, **When** the basics page opens, **Then** a notice says automatic reminders, nudges, the recap and the wrap-up message are off until a time zone is set.
2. **Given** an event with a time zone, **When** the basics page opens, **Then** the start and end times are shown in that time zone, with the zone named next to them.
3. **Given** an organiser whose computer is in London editing an event in `Africa/Nairobi`, **When** they set the start to 09:00 and save, **Then** the event starts at 09:00 Nairobi time.
4. **Given** an event with no time zone, **When** the page opens, **Then** times are shown in the organiser's computer time zone, as today.
5. **Given** an event with Bendie Planner, **When** the organiser changes the time zone, **Then** the page tells them the Planner app keeps its own time zone, set in Planner.

---

### User Story 3 - Planner agenda days and the feedback link follow the event (Priority: P2)

An organiser adding Planner agenda items gets day numbers counted from the event's local start date in the event's time zone, whatever their own computer's zone. On the terminology page, the feedback form link explains that it also triggers the last-day "share your feedback" push.

**Why this priority**: Correctness and clarity improvements built on Stories 1–2; nothing breaks without them.

**Independent Test**: On a Planner event in `America/New_York` that starts on 20 Nov, add an agenda item for 20 Nov from a computer set to Nairobi time, and confirm it's Day 1.

**Acceptance Scenarios**:

1. **Given** an event with a time zone, **When** a Planner agenda item is saved or imported, **Then** its day number counts from the event's start date in that time zone.
2. **Given** an event with no time zone, **When** an agenda item is saved, **Then** day numbers behave as today (the organiser's computer time zone).
3. **Given** the terminology page, **When** the organiser looks at Feedback Form URL, **Then** the hint says that, when set, attendees get a "share your feedback" push at 18:00 on the event's last day.

### Edge Cases

- **Browser offers no time zone list** (very old browser): a built-in list of common zones is used instead.
- **The organiser's computer zone can't be detected**: the field starts empty and must be chosen.
- **The database rejects a name** (its list differs slightly from the browser's): the save fails with "That time zone isn't recognised. Choose another from the list." Nothing else on the form is lost.
- **Planner rejects the time zone at provisioning**: the Planner event is still created, with Planner's default zone, and the fallback is logged.
- **Daylight-saving zones** (e.g. `Europe/London`, `America/New_York`): times on the change-over days convert correctly.
- **An event with no start date**: the time zone can still be set.
- **Changing the time zone of an event that already has dates**: the dates keep their stored moment; the page shows them in the new zone. A hint says to check the dates after changing the zone.
- **Clearing the time zone** on the basics page: allowed, with the "reminders are off" notice shown.

## Requirements *(mandatory)*

### Functional Requirements

**Choosing a time zone**

- **FR-001**: The event create form MUST include a required Time zone field, pre-filled with the organiser's computer time zone when it can be detected.
- **FR-002**: The field MUST offer a searchable list of IANA time zone names (e.g. `Africa/Nairobi`), each shown with its current UTC offset. A built-in list is used when the browser provides none.
- **FR-003**: The form MUST accept only names from the list, and MUST say "Choose a time zone from the list" otherwise.
- **FR-004**: The basics page MUST let organisers set, change or clear the event's time zone with the same field.
- **FR-005**: The basics page MUST show a notice when an event has no time zone: automatic countdowns, nudges, the evening recap and the wrap-up push are off until one is set.

**Venue time**

- **FR-006**: When an event is created with a time zone, its start and end dates MUST be stored as the start of those days in that time zone.
- **FR-007**: The basics page MUST show and save start and end times in the event's time zone when it has one, labelled with the zone name, and in the organiser's computer time zone otherwise (as today).
- **FR-008**: Changing the time zone on the basics page MUST NOT silently move the stored moments. The times are re-shown in the new zone, with a hint to check them.

**Bendie Planner**

- **FR-009**: When an event that includes Bendie Planner is created, the Planner event MUST receive the event's time zone.
- **FR-010**: If Planner rejects the time zone, the Planner event MUST still be created (with Planner's default), and the fallback MUST be logged on the server. *(Narrowed during `/speckit.plan`, 2026-11-17: provisioning has no notes channel to surface it in; research R4.)*
- **FR-011**: Changing the time zone later MUST NOT change the Planner event. For events with Planner, the basics page MUST say Planner keeps its own time zone, set in the Planner app.
- **FR-012**: Planner agenda day numbers MUST be counted from the event's start date in the event's time zone when it has one, and in the organiser's time zone (as today) otherwise.

**Feedback link and errors**

- **FR-013**: The Feedback Form URL hint MUST say that, when set, attendees also get a "share your feedback" push at 18:00 local time on the event's last day.
- **FR-014**: A time zone the database rejects MUST produce a plain-language message, never a raw constraint error.

### Out of scope

- Syncing the time zone to Planner after creation (decided 2026-11-17).
- Changing how dates are displayed anywhere other than the create form and basics page.
- Back-filling time zones for existing events (organisers set them; a later data task may).
- Any database migration, since the column, its grant and its check already exist live (to be verified).
- Announcement push data (Events brief #4), which belongs to the app team's push function.

### Key Entities

- **Event time zone**: an IANA name on the Bendie event. Empty means no automatic engagement pushes.
- **Planner event time zone**: the Planner event's own required zone. Set from the Bendie event at creation, then managed in Planner.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of events created through the Portal after this feature have a time zone.
- **SC-002**: For an event created in any time zone, its start date read in that time zone equals the date the organiser picked (tested for at least `Africa/Nairobi`, `Europe/London` and `America/New_York`).
- **SC-003**: An organiser can find and choose a time zone by typing part of a city name in under 10 seconds.
- **SC-004**: 100% of Planner events created through the Portal after this feature carry the Bendie event's time zone, unless Planner rejected it, in which case it's reported.
- **SC-005**: Existing events show the "reminders are off" notice until a time zone is set.

## Assumptions

- Live state, per the Bendie Events brief (2026-10-30):
  - `events.timezone` exists as nullable text;
  - it's granted `select, insert, update` to `authenticated` (not `anon`);
  - it's checked by `events_timezone_valid`.
- Live state, per the Planner brief (2026-10-07): Planner's `events.timezone` is NOT NULL with default `Africa/Nairobi`, validated by `trg_validate_event_timezone`.
- These facts MUST be confirmed against the live databases before release (constitution III). They decide whether adding `timezone` to the Portal's event column list is safe.
- All Portal users are signed in. No anonymous page reads `events`.
- Only the create form and the basics page edit dates; other screens that show dates are unchanged.
