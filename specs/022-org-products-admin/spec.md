# Feature Specification: Organisation Products Management

**Feature Branch**: `022-org-products-admin`

**Created**: 2026-10-15

**Status**: Draft

**Input**: User description: "A platform-admin-only Organisations area in the Bendie Portal for managing which products each client organisation has: create organisations with one or both products, connect Planner, upgrade and pause products with the impact shown, optionally pause Planner app access, add a newly enabled product to existing events, and show organisation users a clear paused state (confirmed /architect blueprint, 2026-10-15)."

## Context

Stawi (the platform admins) offers two products to client organisations: **Bendie** (the attendee app and the Portal content behind it) and **Bendie Planner**. An organisation can have one product or both.

Today:
- The products an organisation has, and its connection to a Planner organisation, can only be set by hand in the database.
- "Create organisation" in the Portal asks only for a name and a short code (slug).
- Switching a product off already hides it in the Portal without deleting anything. But nobody can do that from the Portal, and nobody can see what it will affect first.
- The Planner app ignores its own organisation on/off switch. Switching a client off therefore doesn't stop that client's people using Planner.

### Agreed language

- **Products**: Bendie and Bendie Planner. An organisation can have one or both.
- **Upgrade**: switching a product **on** for an organisation. For Planner this includes connecting the organisation to a Planner organisation.
- **Pause** (downgrade): switching a product **off**. Nothing is deleted, and switching it back on restores everything: events keep their product settings, and Planner data and links stay.
- **Pause Planner app access**: the organisation's Planner organisation is switched off, so only platform admins can open its events in the Planner app.
- **Bendie paused**: the Portal shows a paused state; live events keep working for attendees in the attendee app.
- **Platform admin**: a Stawi administrator, the only kind of user who may manage organisations' products.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See every organisation and its products in one place (Priority: P1)

A platform admin opens **Manage organisations** from the top menu. They see every organisation with each product's state (Active, Paused or Not included), whether it is connected to Planner, how many events and members it has, and when it was created. No one else can open this area.

**Why this priority**: every other capability starts here, and today this information can only be found in the database.

**Independent Test**: as a platform admin, open the area and check every organisation's product states and Planner connection against the database. As an organisation owner/admin, confirm the menu entry is absent and the address is refused.

**Acceptance Scenarios**:

1. **Given** a platform admin, **When** they open Manage organisations, **Then** every organisation is listed with each product's state, its Planner connection (or "Not connected"), event and member counts, and created date.
2. **Given** an organisation owner/admin or any other non-platform-admin user, **When** they look at the top menu, **Then** there is no Manage organisations entry. **When** they open the area's address directly, **Then** they are refused and nothing about other organisations is shown.
3. **Given** the list, **When** a platform admin searches by name, **Then** only matching organisations are shown.

---

### User Story 2 - Create an organisation with the right products (Priority: P1)

A platform admin creates an organisation, choosing Bendie, Planner or both. If Planner is chosen, they connect it to a Planner organisation in the same step: an existing one not yet connected to any organisation, or a new one created with the organisation's name. The organisation can create events for its products straight away.

**Why this priority**: today a new client can't use Planner until someone edits the database. This removes that step.

**Independent Test**: create an organisation with both products and a new Planner organisation. As its admin, create a Planner event successfully (no "Planner hasn't been set up" error).

**Acceptance Scenarios**:

1. **Given** the create form, **When** a platform admin enters a name and chooses Bendie only, **Then** the organisation is created with Bendie active and Planner not included.
2. **Given** the create form with Planner chosen, **When** the admin picks an existing Planner organisation that isn't connected to any other organisation, **Then** the organisation is created with Planner active and connected to it.
3. **Given** the create form with Planner chosen, **When** the admin chooses "Create a new Planner organisation", **Then** a Planner organisation with the same name is created and connected.
4. **Given** the create form, **When** no product is chosen, **Then** creation is refused with "Choose at least one product."
5. **Given** a Planner organisation already connected to another organisation, **When** the admin opens the Planner choice, **Then** it is not offered.
6. **Given** a slug already in use, **When** the admin saves, **Then** they are told to choose another, as today.

---

### User Story 3 - Upgrade an organisation (Priority: P2)

On an organisation's page, a platform admin switches on a product it doesn't have (or has paused). For Planner, they connect a Planner organisation first if none is connected yet. The page then lists the organisation's existing events, each with an "Add Bendie" or "Add Planner" action, so chosen events can start using the product.

**Why this priority**: clients add the second product after they've started. Today this is a database job.

**Independent Test**: on a Bendie-only organisation, switch on Planner (creating a Planner organisation). Add Planner to one existing event and confirm its Planner tabs appear and its Planner side is set up.

**Acceptance Scenarios**:

1. **Given** a Bendie-only organisation, **When** a platform admin switches on Planner, **Then** they must connect a Planner organisation (existing unconnected one, or new) before it becomes Active.
2. **Given** a paused product, **When** a platform admin switches it back on, **Then** it becomes Active and everything paused is visible again, unchanged (events, content, Planner links).
3. **Given** a product just switched on, **When** the admin views the "Existing events" list, **Then** each event without that product shows an Add action. **When** they add Planner to an event, **Then** its Planner side is set up and its Planner tabs appear for the organisation.
4. **Given** an event whose Planner set-up fails, **When** the admin adds Planner, **Then** they see the reason and a way to retry, and the event keeps its other product unchanged.

---

### User Story 4 - Pause a product, knowing what it affects (Priority: P2)

A platform admin switches off a product. Before confirming, they see what it affects: how many events use it and, for Planner, how many people have Planner access. For Planner they can tick **"Also pause Planner app access"**.

On confirming:
- The product is hidden in the Portal for that organisation, and its people see a clear paused message.
- Nothing is deleted.
- If the checkbox was ticked, the organisation's people (and Stawi staff assigned to its events) can no longer open its events in the Planner app; platform admins still can.

Switching the product back on reverses all of it.

**Why this priority**: downgrades must be safe and predictable. Today switching Planner off doesn't stop the client using the Planner app.

**Independent Test**: pause Planner for a test organisation with app access paused. Confirm its admin sees the paused banner in the Portal, a client Planner user can no longer open its events in the Planner app, and a Planner platform admin still can. Switch it back on and confirm everything returns.

**Acceptance Scenarios**:

1. **Given** an organisation with Planner active, **When** a platform admin switches it off, **Then** a confirmation shows the number of events using Planner and the number of people with Planner access, with an "Also pause Planner app access" checkbox (unticked by default).
2. **Given** the admin confirms without the checkbox, **Then** Planner is Paused in the Portal for that organisation, and its Planner app access is unchanged.
3. **Given** the admin confirms with the checkbox, **Then** in addition the organisation's people and assigned Stawi staff can't open its events in the Planner app, while Planner platform admins still can.
4. **Given** Planner was paused with app access paused, **When** a platform admin switches Planner back on, **Then** Planner app access is restored too, and all Planner data is as it was.
5. **Given** an organisation with Bendie active, **When** a platform admin pauses Bendie, **Then** the confirmation states that live events keep working in the attendee app. Bendie is Paused in the Portal; the attendee app is unchanged.
6. **Given** any pause or resume, **Then** nothing about the organisation's events, content, people or Planner data is deleted.

---

### User Story 5 - Organisation users see a clear paused state (Priority: P3)

When one of its organisation's products is paused, an organisation user (owner, admin, member) sees a clear message in the Portal, such as **"Bendie Planner is paused for your organisation — contact Stawi to resume it."**, instead of the product silently disappearing. If every product is paused, they land on a page saying so.

**Why this priority**: removes confusion and support calls. It depends on Story 4.

**Independent Test**: pause Planner for an organisation that also has Bendie. As its admin, confirm the Planner switcher entry or area shows the paused message and Bendie works normally. Pause Bendie too, and confirm the all-paused page.

**Acceptance Scenarios**:

1. **Given** Planner paused and Bendie active, **When** an organisation user opens the Portal, **Then** Bendie works as usual and wherever Planner would appear they see the paused message instead.
2. **Given** both products paused, **When** an organisation user signs in, **Then** they see a page explaining their organisation's products are paused and to contact Stawi.
3. **Given** a paused product, **When** an organisation user opens a direct link to one of its event pages, **Then** they see the paused message, not an error or a blank page.

---

### User Story 6 - Product history for an organisation (Priority: P3)

On an organisation's page, a platform admin sees a history of product changes: each switch on/off, Planner connection, Planner app access pause/resume and product added to an event, with who did it and when.

**Why this priority**: accountability, and answering "when did this client lose Planner?".

**Independent Test**: make three product changes and confirm all three appear in the history, newest first, with the right person and time.

**Acceptance Scenarios**:

1. **Given** product changes made through this area, **When** a platform admin opens the organisation's History, **Then** each change is listed newest first with what changed, who and when.

---

### Edge Cases

- **Organisations that exist today with no products** (e.g. "Default Organization") are listed as having no products; a platform admin can switch products on for them.
- **Pausing the last active product** shows organisation users the all-paused page (Story 5).
- **A Planner organisation can be connected to only one Portal organisation.** The Planner connection can't be changed or removed in this feature once set; it shows as read-only.
- **Switching Planner on when a connection already exists** (e.g. resuming) needs no new connection.
- **A product with events can't be removed, only paused.** "Not included" is reachable only for products never switched on.
- **Adding a product to an event that already has it** isn't offered.
- **Two platform admins change the same organisation at once**: the second save sees the current state and is refused if it no longer applies (e.g. "Planner is already paused").
- **Planner can't be reached** when creating or connecting a Planner organisation or pausing app access: the admin sees a clear error and nothing in the Portal changes for that step.
- **Stawi's own organisation** (Planner organisation 1) isn't offered as a client Planner organisation to connect.
- **Platform admins working inside a paused organisation's workspace** see the same paused state as its users. They resume the product from the Organisations area.

## Requirements *(mandatory)*

### Functional Requirements

**Access**

- **FR-001**: The Organisations area and every action in it MUST be available only to platform admins. Every page load and every change MUST re-check this on the server; organisation owners/admins and all other users MUST be refused.
- **FR-002**: The top menu MUST show a "Manage organisations" entry to platform admins only.

**Organisation list**

- **FR-003**: The area MUST list every organisation with name, each product's state (Active / Paused / Not included), Planner connection (connected Planner organisation name, or "Not connected"), number of events, number of members, and created date, with search by name.

**Create**

- **FR-004**: Platform admins MUST be able to create an organisation from the area with name, slug (as today) and at least one product. The existing "Create organisation" action MUST lead to this flow instead of the old name-only form.
- **FR-005**: Choosing Planner when creating MUST require a Planner connection: an existing Planner organisation not connected to any organisation (excluding Stawi's own), or a new Planner organisation created with the organisation's name.

**Products (upgrade and pause)**

- **FR-006**: The organisation page MUST show each product's state, and when and by whom it was last changed, and let a platform admin switch it on or off.
- **FR-007**: Switching Planner on for an organisation with no Planner connection MUST first require connecting one, as in FR-005. An existing connection MUST be shown read-only.
- **FR-008**: Switching a product off MUST first show a confirmation stating its impact:
  - **Planner:** events using Planner, people with Planner access, and an unticked "Also pause Planner app access" checkbox.
  - **Bendie:** events using Bendie, and that live events keep working in the attendee app.
- **FR-009**: Pausing a product MUST hide it in the Portal for that organisation and MUST NOT delete or change any event, content, person, product setting of an event, Planner link or Planner data.
- **FR-010**: When Planner app access is paused, no one except Planner platform admins MUST be able to open the organisation's events or their data in the Planner app. That includes the organisation's own people and Stawi staff assigned to its events.
- **FR-011**: Switching a paused product back on MUST restore it exactly as it was. For Planner this MUST also resume Planner app access if it had been paused.
- **FR-012**: After a product is switched on, the organisation page MUST list existing events that don't use it, each with an "Add Bendie" / "Add Planner" action.
  - Adding Planner MUST set up the event's Planner side the same way creating a Planner event does today, with any failure shown and retryable.
  - The event's other product MUST be untouched.
- **FR-013**: A product an organisation has used MUST NOT be removable, only paused. Removing a Planner connection is out of scope.

**Organisation users**

- **FR-014**: When a product is paused, organisation users MUST see a clear paused message wherever the product would normally appear: switcher, home, event pages and direct links. When every product is paused, they MUST see a page explaining that their organisation's products are paused.
- **FR-015**: Organisation users, including owners/admins, MUST NOT be able to change products or the Planner connection by any means.

**History**

- **FR-016**: Every product change made in this area MUST be recorded with what changed, who and when, and listed newest first on the organisation's page: switch on/off, Planner connection or creation, Planner app access pause/resume, and product added to an event.

**Integrity**

- **FR-017**: Each Planner organisation MUST be connected to at most one Portal organisation.
- **FR-018**: A change based on stale information (the state changed since the page loaded) MUST be refused with a message, not applied.

### Key Entities

- **Organisation**: a client of Stawi; has a name, slug, members and events.
- **Organisation product**: whether an organisation has Bendie / Planner, and whether it is Active or Paused, with who and when it last changed. Already exists.
- **Planner connection**: the one-to-one link between an organisation and a Planner organisation. Already exists; set by hand today.
- **Planner organisation**: the client's counterpart in the Planner app. Its on/off switch becomes enforced: off means only Planner platform admins can open its events.
- **Event product**: which products an event uses. Already exists.
- **Product history entry**: one recorded product change (what, who, when).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A platform admin can create an organisation with both products and a new Planner connection in under 2 minutes, with no database work.
- **SC-002**: After that, the organisation's admin can create a Planner event on the first try (no "Planner hasn't been set up" error) in 100% of tested cases.
- **SC-003**: Pausing then resuming a product leaves 100% of the organisation's events, content and Planner data unchanged (verified by before/after comparison).
- **SC-004**: With Planner app access paused, 0 of the tested non-platform-admin Planner users can open the organisation's events in the Planner app, and 100% can again after resume.
- **SC-005**: 0 non-platform-admin users can open the Organisations area or perform any of its changes.
- **SC-006**: Organisation users of a paused product see the paused message (not a blank page or error) on 100% of tested entry points: switcher, home, event pages, direct links.
- **SC-007**: Every product change made in the area appears in the organisation's history with the right person and time.

## Assumptions

- Platform admin means the existing platform-admin role. Planner platform admins are the Planner app's own super-admin flag and are unaffected by pauses.
- The Planner-side change that makes the Planner organisation's on/off switch enforced is run by the developer in the Planner project, as with Feature 020's Planner SQL.
- Existing behaviour where a paused product is hidden in the Portal for everyone, platform admins included, is kept. Platform admins resume products from the Organisations area.
- New Planner organisations created from the Portal are active, with the organisation's name.
- Organisation member counts include every member role.
- While Planner is paused, the Portal still keeps Planner's team list up to date (member changes sync as usual; nothing is removed), so resuming needs no catch-up. People's access during the pause is still blocked.
- Billing, invoices and plan tiers are handled outside the Portal.

## Dependencies

- Feature 002/004: the organisation product and event product model, and Planner event set-up on event creation.
- Feature 008: per-person Planner permissions (unchanged; the organisation-level pause sits above them).
- Access to the Planner project with privileged credentials, server-side only, as other Planner features already use.

## Out of Scope

- Billing, payments, invoices and plan tiers beyond the two products.
- Deleting organisations, removing products that were used, or removing or changing a Planner connection.
- Any change to the attendee app (Bendie events stay live when Bendie is paused).
- Per-person Planner permissions (Feature 008), and removing a product from a single event.
