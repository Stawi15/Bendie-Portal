# Feature Specification: Client Admins Set Up Their Own Team

**Feature Branch**: `017-client-admin-team-setup`

**Created**: 2026-10-09

**Status**: Draft

**Input**: User description: "Feature 017 — Client organization admins add their own team (account creation + Planner 'Add team member'). After Stawi onboards a client, the client's organization admins cannot fully build their own team: creating a new account is Stawi-only, and a Planner-only event has no in-event way to add a team member (four steps across three screens). Goal: a client organization owner/admin can, on their own, add a person to their organization and to a Planner event as a team member with Planner access, in one flow from the Planner event's Team & Access panel, including creating the account if the person is new; and can create member accounts wherever account creation is currently Stawi-only."

## Context

Stawi onboards each paying client by creating their organization, switching on the products they
bought, linking Planner where bought, and creating the client's organization admins. From then on
the client is meant to run their own events. Two gaps stop that today:

1. **Only Stawi can create a new account.** A client admin who tries to add someone without an
   existing account is refused, so every new colleague needs a request to Stawi. Several "add new
   person" entry points are hidden from client admins entirely.
2. **A Planner-only event has no "add team member" action.** The Bendie "Attendees & Access" page
   is not available on Planner-only events. Planner Overview's Team & Access panel can only manage
   people already on the event, and tells the admin to go to Organisation People, assign the event
   there, then come back and enable Planner access.

## Clarifications

### Session 2026-10-09 (decisions approved by the developer before specification)

- Q: May client organization admins create new accounts? → A: Yes, only for their own
  organization, authorized on the server every time (constitution v1.1.0, Principle II,
  organization-scoped tier). Stawi admins keep every current ability.
- Q: What organization role can a client admin give a new account? → A: Member only. Only Stawi
  creates organization owners/admins.
- Q: How does a newly created person first sign in? → A: Silent account creation as today (no
  password, no email sent); the person sets a password with "Forgot password". No invite email.
- Q: If the person is already on the event (e.g. as an attendee) and is added from Planner as team,
  is their event role changed? → A: No. They keep their existing role; only Planner access is
  switched on.
- Q: For an event using both products, are there separate Bendie and Planner rosters? → A: No. One
  roster per event; each product's page is a view of it. Someone added from either side appears on
  both.
- Q: Should every organization owner/admin be able to work on every event in their organization
  (e.g. Ann manages events Maria created)? → A: Yes. Every organization owner/admin is
  automatically an event admin on each of their organization's events: when an event is created,
  when someone becomes an organization owner/admin, and once for all existing events. This keeps
  Feature 003's rule that event access comes from being on the event's roster.
- Q: May client organization admins grant or change the organization owner/admin role at all? →
  A: No. Only Stawi creates, promotes, demotes or edits organization owners/admins. Client admins
  can manage only non-admin organization roles. This closes a pre-existing gap where the database
  allowed it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Add a team member from the Planner event (Priority: P1)

Maria, an organization admin of a Planner-only client, opens one of her events' Planner Overview.
In Team & Access she chooses "Add team member", enters a colleague's email (and optionally name),
picks their event role and Planner access level, and confirms. The colleague is now in her
organization, on the event's team, and has Planner access to that event — whether or not they had
an account before.

**Why this priority**: This is the reported problem. Without it, a Planner-only client cannot staff
their own events without Stawi's help and a four-step, three-screen workaround.

**Independent Test**: As a client organization admin on a Planner-only event, add (a) a brand-new
email and (b) an email already in the organization; both appear in Team & Access with Planner access
enabled, and the new person can set a password via "Forgot password" and sign in.

**Acceptance Scenarios**:

1. **Given** a client admin on a Planner event's Team & Access panel, **When** they add an email
   that has no account, **Then** an account is created, the person joins the organization as a
   member, joins the event with the chosen role, and gets the chosen Planner access, and the admin
   sees one confirmation summarising each step's result.
2. **Given** the email belongs to someone already in the organization but not on the event, **When**
   the admin adds them, **Then** no new account is created and the person joins the event with the
   chosen role and Planner access.
3. **Given** the person is already on the event as an attendee, **When** the admin adds them as a
   team member, **Then** their event role stays "attendee" and only Planner access is switched on;
   the admin is told their role was kept.
4. **Given** the person already has Planner access on the event, **When** the admin adds them
   again, **Then** nothing is duplicated and the admin is told they are already set up.
5. **Given** the event is not yet linked to a Planner event, **When** the admin tries to add a team
   member, **Then** the person is still added to the organization and event, and the admin is told
   clearly that Planner access could not be switched on yet and why.

---

### User Story 2 - Client admins create accounts from Organisation People (Priority: P2)

A client admin on Organisation People adds a new colleague by email, or imports a spreadsheet of
colleagues, without Stawi's help. New people become organization members.

**Why this priority**: Organisation People is the organization-wide way to add people. Today it
fails for new emails with "Forbidden", which reads as a bug to clients.

**Independent Test**: As a client admin, add one new email and import a spreadsheet containing new
and existing emails; every row ends up as a member of the client's organization, and existing
accounts are reused.

**Acceptance Scenarios**:

1. **Given** a client admin on Organisation People, **When** they add a new email, **Then** an
   account is created and the person appears in the organization as a member.
2. **Given** a spreadsheet import with a mix of new and existing emails, **When** the client admin
   runs it, **Then** new accounts are created, existing ones are reused, and the result lists each
   row's outcome.
3. **Given** a spreadsheet row that asks for an organization role of owner or admin, **When** a
   client admin imports it, **Then** that person is added as a member and the result says the role
   was limited to member.

---

### User Story 3 - Client admins add new people from event Add People flows (Priority: P3)

On an event that uses Bendie, the "Invite new attendee" and "Import spreadsheet" options in Add
People are available to client organization admins, not only to Stawi.

**Why this priority**: Same gap as Story 2 on the Bendie side; lower priority because Bendie events
already offer "add from organisation" as a workaround.

**Independent Test**: As a client admin on a Bendie event, invite a new attendee and import a
spreadsheet of attendees; both succeed without Stawi involvement.

**Acceptance Scenarios**:

1. **Given** a client admin on a Bendie event, **When** they open Add People, **Then** "Invite new
   attendee" and "Import spreadsheet" are offered.
2. **Given** a user who is not an owner/admin of the event's organization, **When** they open Add
   People, **Then** those options are not offered, as today.

---

### User Story 4 - Every organization admin can work on every organization event (Priority: P1)

Ann, a second Xperia organization admin, opens an event Maria created. She can open its workspace,
see its team, add people (from the organization, from a team, or by email) and manage their access,
without Maria adding her first.

**Why this priority**: Without it, User Story 1 only works for the admin who created each event;
a client with several admins (Xperia has three) cannot share the work.

**Independent Test**: As an organization admin who did not create an event, open it, see its full
team, and add a person from the organization; then have Stawi make a new person an organization
admin and confirm they can open every existing event of that organization.

**Acceptance Scenarios**:

1. **Given** an organization with two admins, **When** admin A creates an event, **Then** admin B
   is on that event's team as an event admin and can open and manage it.
2. **Given** an existing organization with events, **When** Stawi makes someone an organization
   owner/admin, **Then** that person is added as an event admin on every event of that
   organization.
3. **Given** an organization admin is already on an event with a lower role (e.g. attendee),
   **When** they are added automatically, **Then** their event role becomes admin.
4. **Given** existing organizations and events before release, **When** the feature ships,
   **Then** every current organization owner/admin is on every event of their organization as
   an event admin.

---

### User Story 5 - Only Stawi manages organization owners/admins (Priority: P2)

A client admin can add and manage ordinary organization members, but cannot make anyone an
organization owner/admin, and cannot change or remove an existing owner/admin's role, through any
screen or by any direct request.

**Why this priority**: Organization admins can make other people admins, which lets them in turn
reach every event (User Story 4). Keeping that power with Stawi matches the decision that only
Stawi creates client admins.

**Independent Test**: As a client admin, attempt (via the Portal and by direct requests) to insert
a member with role admin/owner, promote a member to admin, and demote an existing admin; all are
refused. As Stawi, all three succeed.

**Acceptance Scenarios**:

1. **Given** a client admin, **When** they try to give anyone the organization role owner or
   admin by any means, **Then** it is refused and nothing changes.
2. **Given** an existing organization owner/admin, **When** a client admin tries to change their
   role, **Then** it is refused.
3. **Given** a client admin, **When** they change a member's role between non-admin roles,
   **Then** it works as today.
4. **Given** a Stawi admin, **When** they create, promote or demote organization owners/admins,
   **Then** it works as today.

---

### Edge Cases

- **Email already has an account in another organization**: the existing account is reused and
  added to this organization as a member. The client admin is not shown anything about the
  person's other organizations.
- **Email is a Stawi admin or another organization's owner/admin**: the existing account is reused
  as a member of this organization; their roles elsewhere are unchanged.
- **Caller is an owner/admin of organization A but targets organization B's event or people**:
  refused, nothing is created.
- **Caller's organization role is removed mid-session**: the next request is refused, because
  authorization is checked on the server for every request.
- **Malformed or empty email**: rejected before anything is created.
- **Same email entered twice in one spreadsheet**: one account; the row outcome says duplicate.
- **Account creation succeeds but a later step fails** (organization, event, or Planner): what
  succeeded is kept, the failure is reported for that step, and retrying completes the remaining
  steps without duplicates.
- **Two admins add the same new email at the same moment**: exactly one account results.
- **Planner product switched off for the organization**: Planner Team & Access is unavailable, as
  today; account creation from Organisation People still works.
- **Someone stops being an organization owner/admin** (Stawi demotes them): their event-admin
  entries stay until Stawi removes them; automatic removal is out of scope (no record exists of
  which entries were automatic).
- **Organization admin added automatically to an event that uses Bendie**: the existing automatic
  access-code issue on joining an event applies, as for anyone joining; no email is sent by it.
- **Organization admin automatically added to a Planner event**: they get Portal access to the
  event; Planner access is not switched on automatically (enable it in Team & Access), except for
  the event's creator, who already gets it today.

## Requirements *(mandatory)*

### Functional Requirements

**Authorization**

- **FR-001**: The system MUST allow a platform (Stawi) admin, or an owner/admin of organization X,
  to create new accounts that join organization X.
- **FR-002**: The system MUST determine organization X from the target record on the server (the
  event's organization, or an organization the caller is verified to administer), never from a
  value the browser supplies on trust.
- **FR-003**: The system MUST refuse account creation to anyone else, including event hosts,
  organizers and staff who are not organization owners/admins, and organization members.
- **FR-004**: Accounts created by a client owner/admin MUST receive organization role "member" only.
  Any request for a higher role from a client admin MUST be limited to member, and the caller told.
- **FR-005**: Existing Stawi-only capabilities (creating owners/admins, acting in any organization)
  MUST remain Stawi-only and unchanged.

**Account creation**

- **FR-006**: New accounts MUST be created without a password and without sending an email, exactly
  as today; the person signs in for the first time via "Forgot password".
- **FR-007**: When an account with the entered email already exists, it MUST be reused and no
  second account created; matching is case-insensitive.
- **FR-008**: The system MUST NOT reveal to a client admin which other organizations an existing
  account belongs to.

**Planner Add team member**

- **FR-009**: Planner Overview's Team & Access panel MUST offer "Add team member" to users who can
  administer Planner access for that event (Stawi admins, owners/admins of the event's
  organization).
- **FR-010**: Add team member MUST accept an email, an optional full name, an event role, and a
  Planner access level, using the same role and access choices offered elsewhere in the Portal.
- **FR-011**: In one confirmation, Add team member MUST ensure the person has an account, is in the
  event's organization, is on the event, and has the chosen Planner access, skipping any step
  already true.
- **FR-012**: If the person is already on the event, their existing event role MUST be kept; only
  Planner access is applied.
- **FR-013**: The person MUST be added to the event's single roster, so they appear in every
  product view of that event; no separate Planner roster may be created.
- **FR-014**: Planner access MUST reuse the person's existing Planner account when one exists and
  never create a duplicate Planner account.
- **FR-015**: The admin MUST see the outcome of each step (account, organization, event, Planner
  access), including partial failures with a plain-language reason.
- **FR-016**: The Team & Access panel's empty state MUST point to Add team member instead of
  sending the admin to Organisation People.

**Other entry points**

- **FR-017**: Organisation People single add and spreadsheet import MUST work for client
  owners/admins, following FR-001 to FR-008.
- **FR-018**: On events using Bendie, the "Invite new attendee" and "Import spreadsheet" options
  MUST be offered to owners/admins of the event's organization as well as Stawi admins.

**Organization admins on every event**

- **FR-021**: Every owner/admin of an organization MUST be on every event of that organization
  with event role admin: added when the event is created, when the person becomes an
  organization owner/admin, and once for all existing events at release.
- **FR-022**: If such a person is already on the event with a role other than host, organizer or
  admin, their event role MUST be raised to admin; host, organizer and admin roles are left as is.
- **FR-023**: Automatic additions MUST NOT make event creation fail, MUST keep it completing within
  5 seconds as experienced by the creator, MUST NOT duplicate roster entries, and MUST NOT switch
  on Planner access by themselves.

**Organization role protection**

- **FR-024**: Only Stawi (platform) admins MAY create organization memberships with role owner or
  admin, change any membership to or from owner/admin, or change an owner/admin's membership. This
  MUST be enforced by the data layer, not only by screens.
- **FR-025**: Client owners/admins MUST still be able to add organization members and change roles
  between non-admin organization roles.

**Preservation**

- **FR-019**: Who can grant or change Planner permissions MUST remain exactly as today.
- **FR-020**: Existing behavior for Stawi admins, for event members who are not organization
  owners/admins, and for removing people MUST be unchanged, except as FR-021 to FR-025 state.

### Key Entities

- **Person (account)**: someone who can sign in; identified by email; may belong to several
  organizations.
- **Organization membership**: a person's role in an organization (owner, admin, member); client
  admins can only create memberships with role member.
- **Event membership**: the event's single roster entry for a person, carrying one event role
  (host, organizer, admin, facilitator, staff, speaker, attendee).
- **Planner access**: whether a person on the event can use the linked Planner event, and at what
  level; layered on the event membership, never a separate roster.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A client organization admin can give a brand-new colleague Planner access to an event
  in one flow on one screen, in under 1 minute, with no help from Stawi.
- **SC-002**: The number of screens needed to add a team member to a Planner-only event drops from
  3 (Organisation People, Planner Overview, permissions dialog) to 1.
- **SC-003**: 100% of attempts by people who are not Stawi admins or owners/admins of the target
  organization to create accounts are refused, verified by testing each disallowed role.
- **SC-004**: 0 duplicate accounts (Portal or Planner) and 0 duplicate event roster entries result
  from adding the same person repeatedly or concurrently.
- **SC-005**: 0 changes to an existing event member's role when they are added as a team member.
- **SC-006**: Stawi requests to create client accounts drop to zero for clients onboarded after
  release.
- **SC-007**: 100% of organization owners/admins are on 100% of their organization's events after
  release, and every new event or new organization admin keeps that true.
- **SC-008**: 0 successful attempts by non-Stawi users to create, promote to, demote from or edit
  organization owner/admin memberships.

## Assumptions

- Client admins are trusted to add people to their own organization; abuse controls (rate limits,
  approval) are not needed for this release.
- A person may belong to several organizations; adding an existing account to another organization
  is acceptable and is the existing behavior when adding by email.
- The Planner access levels and event roles already offered in the Portal are sufficient; no new
  roles are introduced.
- Bulk "Add team member" (many people at once from Planner) is out of scope; Organisation People
  spreadsheet import covers bulk.
- Out of scope: invite emails, billing or seat limits, Planner-app changes, a Stawi onboarding
  screen, and changes to who can grant Planner permissions.
- Depends on the Planner Team & Access panel shipped in Feature 016 pass 24 and on constitution
  v1.1.0's organization-scoped authorization tier.
