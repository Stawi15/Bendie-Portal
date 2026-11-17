# Feature Specification: Planner Access Alignment

**Feature Branch**: `026-planner-access-alignment`

**Created**: 2026-11-17

**Status**: Implemented (pending browser pass and `/review`)

**Input**: The Bendie Planner backend brief, "Current access model (as of 2026-10-15)". Make the Portal's Planner access checks and permission writes follow Planner's current rules:
- job titles grant nothing;
- org admins have full access to their organization's events;
- the new `can_manage_production` / `can_manage_logistics` switches;
- contractors need access end dates;
- "all organization events" access (`org_member_access`) is never written as assignments.

Decision (developer, 2026-11-17): changes the Portal makes in Planner keep sending **no** Planner notifications, as today.

## Background

The Portal reads and writes Planner data with the Planner service-role key, which bypasses Planner's own access rules, so the Portal re-applies them in code. That copy was written before Planner's October changes:

- **Job titles still granted admin.** A Planner profile whose `role` text was "admin", "super_admin" or "superadmin" got full access in the Portal. Planner stopped honouring this on 2026-10-15.
- **Org admins were refused.** Planner gives org admins full access to every event of their organization without an assignment. The Portal ignored them.
- **The new manage switches were unknown.** For Production and Logistics, the Portal offered no Manage choice. Its "Viewer" preset left Planner's manage switch blank, which Planner reads as "same as view", so **Portal Viewers could edit production schedules and logistics in the Planner app.**
- **Contractors weren't handled.** Planner refuses an active contractor assignment without an end date, so a Portal attempt failed with a generic error.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Portal access matches Planner (Priority: P1)

A Planner org admin opens a Planner module in the Portal for one of their organization's events and has full access, as in the Planner app. A Planner user whose job title is "admin", but who has no admin flag, gets only their assignment's access.

**Independent Test**: For every active assignment and every org admin on their organization's events, the Portal's view/manage decision for Tasks, Checklist, Vendors, Logistics and Production equals Planner's own `has_event_module` answer.

**Acceptance Scenarios**:

1. **Given** a Planner org admin with no assignment on an event of their organization, **When** they open any Planner module, **Then** they can view and manage it.
2. **Given** a profile with job title "admin" and no admin flag, **When** they open a module, **Then** only their assignment's switches apply.
3. **Given** an assignment with Logistics view on and manage explicitly off, **When** they open Logistics, **Then** they can view but not edit.
4. **Given** an assignment with Logistics view on and manage blank, **When** they open Logistics, **Then** they can edit (Planner's rule).
5. **Given** the event's organization is paused in Planner, **When** a non-admin member opens a module, **Then** they have no access; admins keep theirs.

### User Story 2 - Manage switches for Production and Logistics (Priority: P1)

An organiser editing someone's Planner permissions sees a Manage choice for Production and Logistics. Viewer sets both off, Manager sets both on, and whatever they choose is saved explicitly.

**Acceptance Scenarios**:

1. **Given** the permissions editor, **When** it opens, **Then** Production and Logistics each have View and Manage.
2. **Given** the Viewer preset, **When** it's saved, **Then** Production and Logistics manage are explicitly off.
3. **Given** an existing assignment with a blank manage switch, **When** the editor opens, **Then** Manage shows its effective value (the same as View).
4. **Given** Manage is turned on, **When** it's saved, **Then** View is on too.

### User Story 3 - Contractors (Priority: P2)

Granting Planner access to someone who's a contractor in Planner, when no end date is set, tells the organiser to set the end date in the Planner app, instead of failing with a generic error.

### Edge Cases

- **Existing assignments with blank manage switches** (150 for Production, 87 for Logistics, of 160 active, as of 2026-11-17) keep their current effective access. They're rewritten explicitly only when someone saves them in the Portal. No bulk change.
- **Becoming "admin" (`access_role`)** now needs every manage switch on, including the two new ones. A blank switch counts as its effective value, so existing managers stay admins.
- **"All organization events" rows** (`assignment_source = 'org_default'`): the Portal still edits an existing assignment in place, and Planner's trigger turns it into a manual one, as in Planner's own app. The Portal never creates or deletes `org_default` rows, and none exist today.

## Requirements *(mandatory)*

- **FR-001**: Every Portal decision on Planner Tasks, Checklist, Vendors, Logistics and Production access MUST equal Planner's `has_event_module`: platform admin by flag only; org admin of the event's organization; or an active assignment on an event whose organization is active, with the module's switch on (blank manage = view).
- **FR-002**: Job titles MUST NOT grant any access.
- **FR-003**: People (participants) MUST be viewable by admins and by anyone with an active assignment, and editable only through the existing Portal-admin path (unchanged).
- **FR-004**: The permissions editor and presets MUST include Manage for Production and Logistics. Viewer = off, Manager = on, and Manage implies View.
- **FR-005**: Every Portal assignment write MUST store explicit values for both new manage switches.
- **FR-006**: Reads MUST resolve a blank manage switch to its effective value.
- **FR-007**: A Planner refusal for a contractor without an end date MUST produce a message saying to set it in the Planner app, in both the Enable action and automatic staff sync.
- **FR-008**: The Portal MUST NOT send Planner notifications for its own writes. This is unchanged and was decided on 2026-11-17.

### Out of scope

- Creating contractors, changing member type, setting access end dates, or managing "all organization events" from the Portal. These stay in the Planner app's Event Access screen, because Planner's `set_member_type` requires a signed-in Planner user.
- Bulk-rewriting existing blank manage switches.
- Planner task notes, slides and blueprints.

## Success Criteria *(mandatory)*

- **SC-001**: 0 mismatches between the Portal's decision and Planner's `has_event_module` across all live active assignments, org admins and platform admins.
- **SC-002**: A Portal "Viewer" can't edit production or logistics in the Planner app.
- **SC-003**: No Portal code grants access from a job title.
