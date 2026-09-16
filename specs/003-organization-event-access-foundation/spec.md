# Feature Specification: Organization & Event Access Foundation

**Feature Branch**: `003-organization-event-access-foundation`

**Created**: 2026-09-15

**Status**: Draft

**Input**: User description: "Establish the customer-access and product-aware navigation foundation required before product-aware event creation or Planner provisioning can safely be built: open Bendie Portal to authenticated organization customers (not just platform/global admins), preserve a strict separation between organization membership and event content access, separate platform-admin functionality from the customer workspace, make active product entitlement (organization_products.is_active) the real gate for product availability, and make event navigation product-aware using event_products — without building product-aware event creation, Planner provisioning, or any Planner workspace module."

## Context

Feature 001 (Bendie Planner Integration) and Feature 002 (Organization Product Entitlements & Event Product Foundation) are both complete and converged. Feature 002 established `organization_products`, `event_products`, and `organization_planner_links` as a data/security foundation only — no application code reads or writes them yet.

Brownfield discovery for this feature found that `/portal` is currently gated to `profiles.global_role = 'admin'` only (`middleware.ts`), and the app's own event-listing helper (`getAccessibleEvents`) hard-returns no results for anyone who isn't a global admin. Meanwhile, multi-organization context (`OrganizationContext`, `profiles.current_organization_id`) and non-admin organization listing (`getAccessibleOrganizations`) already exist and already work — they are simply unreachable today because no non-admin user can get past the Portal admission gate. This feature closes that gap: it lets real organization customers into the Portal, without granting them anything they should not have, and without redesigning anything that already works.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Customer organization member can enter Portal safely (Priority: P1)

An authenticated user who belongs to at least one organization (but is not a platform admin) can open the Portal, have their organization resolved or selected, and see only the organization and event information they are actually permitted to see.

**Why this priority**: This is the feature's entire purpose — until this works, no other customer-facing behavior in the Portal is reachable by anyone except a platform admin.

**Independent Test**: Log in as a real `organization_members` user with `global_role` not `'admin'`; confirm the Portal loads (no redirect to `/unauthorized`), the correct organization is resolved, and only that user's organizations/events appear.

**Acceptance Scenarios**:

1. **Given** an authenticated user with exactly one `organization_members` row, **When** they open the Portal, **Then** they are admitted (not redirected to `/unauthorized`) and their one organization is auto-selected.
2. **Given** an authenticated user with zero `organization_members` rows and `global_role` not `'admin'`, **When** they open the Portal, **Then** they see a safe no-organization/no-access state and no tenant data of any kind is exposed.
3. **Given** an authenticated user with two or more `organization_members` rows, **When** they open the Portal, **Then** the existing organization switcher lets them choose, and only the selected organization's data is shown.

---

### User Story 2 - Customer can access an assigned event (Priority: P1)

A customer with an explicit `event_members` row for a specific event can enter that event's workspace and use whatever product navigation the organization's active entitlement and that event's `event_products` allow.

**Why this priority**: Organization admission alone delivers no value without being able to actually reach the event content the customer needs to work in.

**Independent Test**: As a user with an `event_members` row on one event in their organization, open that event; confirm workspace access succeeds and only the tabs matching that event's actual `event_products` (filtered by active organization entitlement) render.

**Acceptance Scenarios**:

1. **Given** a user with an `event_members` row on event E, **When** they open event E's workspace, **Then** access succeeds.
2. **Given** the same event E has only a `bendie` row in `event_products` and the organization's `bendie` entitlement is active, **When** the user views the event, **Then** only Bendie navigation is shown.
3. **Given** the user has no `event_members` row on a different event F in the same organization, **When** they attempt to open event F's workspace directly, **Then** access is denied.

---

### User Story 3 - Tenant isolation (Priority: P1)

A customer cannot reach another organization's events or content by manipulating URLs, organization IDs, event IDs, or a stale/forged current-organization selection.

**Why this priority**: This is a hard security boundary; any gap here is a cross-tenant data breach, not a usability defect.

**Independent Test**: As a user belonging only to Organization A, attempt to load Organization B's event/workspace URLs directly and confirm every attempt is denied server-side, independent of client state.

**Acceptance Scenarios**:

1. **Given** a user's `profiles.current_organization_id` points at an organization they no longer belong to, **When** the Portal loads, **Then** the stale ID is revalidated against live `organization_members` and rejected, falling back to a valid organization or the no-access state.
2. **Given** a user manually edits an event URL to an `eventId` belonging to an organization they are not a member of, **When** the request is made, **Then** it is denied regardless of any client-side state.
3. **Given** a user manually supplies a different `organization_id` in a client request, **When** the server processes it, **Then** the server independently validates membership rather than trusting the supplied value.

---

### User Story 4 - Organization administrator can oversee events without automatically gaining event content (Priority: P2)

An organization `owner`/`admin` can see event metadata/listing for every event in their organization so they can administer the organization, without that visibility alone granting access to any event's attendee/content/operational workspace.

**Why this priority**: Org admins need enough visibility to manage their organization's events and entitlements, but content access must remain a deliberate, explicit grant — this is the core authorization boundary the whole feature exists to get right.

**Independent Test**: As an `organization_members` row with `role IN ('owner','admin')` and no `event_members` row on event E, confirm event E appears in the org's event list with metadata, but opening its workspace is denied; then add an `event_members` row and confirm workspace access now succeeds.

**Acceptance Scenarios**:

1. **Given** an org owner/admin with no `event_members` row on event E, **When** they view their organization's event list, **Then** event E appears with its metadata (name, status, dates, `event_products`).
2. **Given** the same org owner/admin and event E, **When** they attempt to open event E's workspace/content, **Then** access is denied.
3. **Given** the same org owner/admin is subsequently added to `event_members` for event E, **When** they open event E's workspace, **Then** access succeeds.

---

### User Story 5 - Multi-organization user can switch safely (Priority: P2)

A user who is `admin` in Organization A and `member` in Organization B can switch between them without any role or access leaking from one organization into the other.

**Why this priority**: Real users in this system already hold different roles in different organizations; this must not become a privilege-escalation path.

**Independent Test**: As a user with `admin` in Org A and `member` in Org B, select Org B and confirm event-listing/admin-level behavior reflects the `member` role, not the `admin` role from Org A.

**Acceptance Scenarios**:

1. **Given** a user is `admin` in Org A and `member` in Org B, **When** Org B is the selected organization, **Then** they see only what an ordinary member of Org B is permitted to see (explicit `event_members` events only, no implicit event-list visibility).
2. **Given** the same user switches back to Org A, **When** Org A is selected, **Then** the org-admin implicit event-list visibility from User Story 4 applies again, scoped to Org A only.

---

### User Story 6 - Product-aware navigation (Priority: P2)

Event navigation reflects the organization's active product entitlement and the event's actual `event_products`, while every existing Bendie event continues to navigate exactly as it does today.

**Why this priority**: This is the visible foundation later Planner-provisioning and event-creation features will build on; getting the filtering rule right now avoids rework later.

**Independent Test**: View one of the 16 pre-existing events (Bendie-only, active Bendie entitlement) and confirm identical navigation to today; then (using test data) confirm a hypothetical Planner-context event does not display any Planner workspace screens (none exist yet), only the product context/route foundation.

**Acceptance Scenarios**:

1. **Given** an existing event with only a `bendie` row in `event_products` and an active `bendie` organization entitlement, **When** it is viewed, **Then** all 23 existing Bendie tabs render exactly as before this feature.
2. **Given** an event's organization entitlement for a product used by that event is inactive (`is_active = false`), **When** the event is viewed, **Then** that product's navigation is not presented as available, even though the `event_products` row still exists.
3. **Given** an event has both `bendie` and `planner` in `event_products` with both entitlements active, **When** it is viewed, **Then** both product contexts are representable in navigation/route metadata, without any Planner workspace screen being rendered (none exist yet).

---

### User Story 7 - Platform admin compatibility (Priority: P2)

A platform admin (`profiles.global_role = 'admin'`) retains full existing cross-tenant operational access without requiring a fake `organization_members` or `event_members` row anywhere.

**Why this priority**: Regressing platform-admin operations would break the team's actual day-to-day ability to run the business; this must be explicitly protected, not just assumed to survive.

**Independent Test**: As a platform admin with zero `organization_members`/`event_members` rows, confirm every existing admin capability (organization list, event list, event workspace entry, all 24 tabs) continues to work exactly as before.

**Acceptance Scenarios**:

1. **Given** a platform admin with no `organization_members` rows, **When** they view the organization list, **Then** all organizations appear (existing behavior, unchanged).
2. **Given** a platform admin with no `event_members` row on any event, **When** they open any event's workspace, **Then** access succeeds exactly as before this feature.

---

### Edge Cases

- Authenticated user with zero organization memberships and not a platform admin → safe no-organization/no-access state; no tenant data exposed.
- Authenticated user with exactly one organization membership → auto-selected via existing `OrganizationContext` behavior.
- Authenticated user with multiple organization memberships → existing organization switcher governs selection; only the selected organization's data is ever shown.
- `profiles.current_organization_id` refers to an organization the user no longer belongs to → revalidated against live `organization_members` on every load; never trusted blindly.
- Client supplies a manipulated/arbitrary `organization_id` → server independently re-derives and validates membership; the supplied value is never trusted as-is.
- Client supplies a manipulated/arbitrary `event_id` → server independently validates the event belongs to the caller's selected organization and that the caller has explicit `event_members` access before granting workspace entry.
- Ordinary organization member attempts to list an event they have no `event_members` row for → the event does not appear in their event list.
- Ordinary organization member attempts direct URL access to an event they have no `event_members` row for → denied server-side.
- Organization owner/admin lists events in their organization without an `event_members` row on a given event → event metadata appears in the list.
- The same organization owner/admin attempts to enter that event's workspace/content without an `event_members` row → denied.
- Organization owner/admin who is also granted explicit `event_members` access → successfully enters the event workspace.
- A user who is `admin` in Organization A and `member` in Organization B → access always reflects the role in the *currently selected* organization only.
- An organization's `bendie` entitlement is `is_active = false` while a `bendie` `event_products` row still exists for one of its events → Bendie is not presented as currently available for that event; the historical `event_products` row is not deleted.
- An organization's `planner` entitlement is `is_active = false` while a `planner` `event_products` row still exists → same rule as above, applied to Planner.
- An organization has an active `bendie` entitlement and a Bendie-only event → Bendie navigation available, exactly as today.
- An organization has an active `planner` entitlement and an event with a `planner` row in `event_products` → Planner product context/route foundation is representable (no Planner workspace screens exist yet to render).
- An organization has both entitlements active and an event with both products in `event_products` → both product contexts are representable simultaneously.
- An event's `event_products` contains a product that is not currently active at the organization level → that product is not presented as available for that event.
- A platform admin with zero `organization_members` rows → full existing cross-tenant behavior is preserved.
- A platform admin with zero `event_members` rows → full existing event-workspace access is preserved.
- An existing (pre-Feature-003) Bendie event's URL is opened → continues to function exactly as before this feature.
- The existing Feature 001 "Bendie Planner" integration tab/route is opened by an authorized user → continues to function exactly as before this feature; remains protected exactly as it is protected today.
- An unauthenticated user attempts to open any `/portal` route → redirected to login, exactly as today.
- A customer (non-platform-admin) attempts to open a platform-admin-only route → denied.

## Requirements *(mandatory)*

### Functional Requirements

**Portal admission**

- **FR-001**: The system MUST admit any authenticated user to the customer Portal flow if they are either (a) a platform admin (`profiles.global_role = 'admin'`), or (b) hold at least one `organization_members` row, instead of admitting only platform admins.
- **FR-002**: The system MUST present a safe no-organization/no-access state — with no organization, event, or other tenant data rendered — to an authenticated user who is not a platform admin and holds zero `organization_members` rows.
- **FR-003**: The system MUST continue to redirect unauthenticated users away from any `/portal` route, unchanged from current behavior.

**Organization context and selection**

- **FR-004**: The system MUST reuse the existing organization-selection mechanism (`profiles.current_organization_id` and `OrganizationContext`) rather than introducing a second organization-selection mechanism.
- **FR-005**: The system MUST revalidate any stored or client-supplied current-organization value against the user's live `organization_members` rows on every load, and MUST NOT grant access on the basis of a stale or manipulated value.
- **FR-006**: When a user belongs to exactly one organization, the system MUST auto-select it, consistent with existing `OrganizationContext` behavior.
- **FR-007**: When a user belongs to two or more organizations, the system MUST scope all organization- and event-related results to the currently selected organization only, with no cross-organization leakage.

**Organization membership vs. event access**

- **FR-008**: The system MUST treat `organization_members` (which organization(s), which role) and `event_members` (which specific events a user may access/run) as two distinct, independently enforced authorization layers. Holding an `organization_members` row MUST NOT, by itself, grant `event_members`-gated event content/workspace access.
- **FR-009**: A user whose role in the selected organization is `owner` or `admin` MUST be able to list/view event metadata (event name, identifying fields, status, dates, `event_products`) for every event belonging to that organization, even without an `event_members` row for those events.
- **FR-010**: The event-metadata visibility granted by FR-009 MUST NOT, by itself, grant access to any event's attendee/content/operational workspace.
- **FR-011**: A user whose role in the selected organization is not `owner`/`admin` (an ordinary member) MUST see and access only events for which they hold an explicit `event_members` row; they MUST NOT see other events in their organization merely by virtue of organization membership.
- **FR-012**: A platform admin MUST retain full existing cross-tenant event/organization access without requiring any `organization_members` or `event_members` row.

**Event workspace access**

- **FR-013**: The system MUST grant customer access to an event's workspace/content only when all of the following hold: the user is authenticated; the user has a valid Portal profile; the user holds a valid `organization_members` row for the event's organization; the event belongs to the user's currently selected organization; the user holds an explicit `event_members` row for that event; and, where a specific product's content is being accessed, the organization's entitlement for that product is active and the event's `event_products` includes that product.
- **FR-014**: Platform admins MUST retain the existing bypass of FR-013's `organization_members`/`event_members` requirements.
- **FR-015**: Org owner/admin event-metadata visibility (FR-009) MUST NOT be treated as satisfying the explicit `event_members` requirement in FR-013.

**Platform-admin / customer route separation**

- **FR-016**: The system MUST provide a minimum route/access separation sufficient that platform-admin-only functionality is never reachable by a customer organization user solely because the Portal is now open to organization members.
- **FR-017**: Existing platform-admin-only functionality MUST NOT require a large-scale route migration to satisfy FR-016; the minimum change necessary to prevent customer access is sufficient.

**Active product entitlement**

- **FR-018**: The system MUST treat `organization_products.is_active = true` as the sole authoritative signal that an organization is currently entitled to use a product; `is_active = false` MUST be treated as revoked/disabled for all current gating decisions.
- **FR-019**: Every Feature 003 behavior that gates on product entitlement (product navigation, product availability) MUST require `is_active = true`, not mere row existence.
- **FR-020**: When an organization's entitlement for a product is `is_active = false` while an `event_products` row for that product still exists on one of its events, the system MUST NOT present that product as currently available for that event, and MUST NOT delete the historical `event_products` row.
- **FR-021**: A product MUST be presented as available for a given event only when both the organization's entitlement for that product is active AND the event's `event_products` includes that product.

**Product-aware navigation**

- **FR-022**: The system MUST derive an event's available product navigation from live `organization_products.is_active` and `event_products` data, not from route names, hardcoded assumptions, or transient client-only state.
- **FR-023**: The system MUST establish route/navigation metadata sufficient to represent a Planner product context for an event without implementing any Planner workspace screen, so that later features can add Planner screens without re-deriving this foundation.
- **FR-024**: The system MUST NOT expose any Planner workspace tab, screen, or placeholder that this feature does not actually implement.
- **FR-025**: The system MUST preserve identical navigation for every existing Bendie-only event exactly as it renders today.

**Server-side authorization**

- **FR-026**: The system MUST independently validate, on the server, every request that depends on organization/event/product context — never trusting a client-supplied `organization_id`, `event_id`, or `product_key` as authoritative.
- **FR-027**: The server-side authorization check MUST be structured as a reusable sequence (authenticated → valid profile → platform admin bypass, else → valid organization membership → selected organization valid → event belongs to organization → explicit event access → active organization product entitlement → event uses requested product → allow) so that later features (event creation, Planner provisioning) can reuse it rather than re-deriving their own.
- **FR-028**: Database-level RLS and constraints MUST continue to serve as a backstop, not a substitute, for the server-side authorization checks in FR-026/FR-027.

**RLS**

- **FR-029**: The system MUST make the minimum RLS change necessary to allow an organization `owner`/`admin` to read event metadata (per FR-009) for events in their organization, reusing the existing `is_organization_member()`/`is_organization_admin()` helper functions rather than introducing new duplicate helpers.
- **FR-030**: The system MUST NOT broaden RLS in a way that grants organization owners/admins implicit read access to `event_members`-gated content tables (attendee/operational data) across events they do not hold explicit `event_members` access to.

**Compatibility and preservation**

- **FR-031**: The system MUST preserve all 16 existing events' current Bendie navigation, URLs, and behavior unchanged; no migration of existing event data is required by this feature.
- **FR-032**: The system MUST NOT modify `event_planner_links` schema/semantics, Planner linking behavior, member/staff sync, agenda push, travel pull, or any existing Feature 001 API route.
- **FR-033**: The system MUST NOT modify the schema of `organization_members`, `organization_products`, `event_products`, or `organization_planner_links`, and MUST NOT introduce a second organization-membership table, a second entitlement table, or merge `organization_products` and `event_products`.
- **FR-034**: The system MUST NOT introduce a capability to change `events.organization_id`; existing event-organization ownership remains fixed.
- **FR-035**: The system MUST NOT alter the existing event-creation flow's fields, behavior, or `event_products` handling beyond what is strictly required to satisfy FR-001–FR-034; any such adjustment MUST be documented with its reason rather than expanding scope silently.

### Key Entities

This feature introduces no new database tables. It establishes authorization/navigation behavior over existing entities:

- **Platform Administrator** — a `profiles` row with `global_role = 'admin'`; retains cross-tenant bypass of organization/event membership requirements.
- **Organization Member** — an `organization_members` row; establishes which organization(s) a user belongs to and their role (`owner`, `admin`, `member`, `attendee`, `facilitator`, `staff`) in each. Unchanged, reused as-is.
- **Organization Product Entitlement** — an `organization_products` row; its `is_active` value is now the authoritative signal for whether a product is currently usable by that organization.
- **Event Access Grant** — an `event_members` row; the sole basis (besides platform-admin bypass) for a customer's access to a specific event's workspace/content.
- **Event Product Usage** — an `event_products` row; identifies which product(s) an event uses, filtered against active organization entitlement to determine current availability.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A real organization-member user who is not a platform admin can log in and reach their organization's Portal workspace without being redirected to `/unauthorized`.
- **SC-002**: Zero cross-tenant event or organization data is retrievable by manipulating organization IDs, event IDs, or stale organization selection, verified against every route and API path this feature touches.
- **SC-003**: An organization owner/admin can see 100% of their organization's event metadata without an `event_members` row, while 0% of that same set grants entry into event workspace/content without an explicit `event_members` row.
- **SC-004**: An organization product marked `is_active = false` is never presented as an available/usable product in navigation or access decisions, even when historical `event_products` rows referencing it still exist.
- **SC-005**: All 16 pre-existing events render identical navigation and remain reachable at their existing URLs after this feature ships.
- **SC-006**: Platform admin operations (organization list, event list, event workspace entry) show no behavior change and require no new `organization_members`/`event_members` rows.
- **SC-007**: The existing Feature 001 Bendie Planner integration page and its API routes remain fully functional for authorized users, with no change in protection or behavior.
- **SC-008**: A user with different roles in two different organizations experiences access strictly scoped to whichever organization is currently selected, with zero observed leakage of the other organization's role or data.
- **SC-009**: No event-creation UI, Planner provisioning behavior, or Planner workspace screen exists anywhere in the shipped feature.

## Assumptions

- The live `organization_members` role vocabulary (`owner`, `admin`, `member`, `attendee`, `facilitator`, `staff`) and the live `event_members` role vocabulary (`host`, `organizer`, `admin`, `attendee`, `facilitator`, `staff`, `speaker`) are authoritative and unchanged by this feature; "org owner/admin" in this spec means `organization_members.role IN ('owner','admin')`.
- `getAccessibleOrganizations()`'s existing non-admin branch is correct and reusable as the basis for the organization-membership resolution in this feature; it is not being redesigned.
- `getAccessibleEvents()` currently returns no results for any non-platform-admin user; this feature is what adds its non-admin behavior (platform admin / org owner-admin metadata visibility / ordinary member explicit-access behavior), per FR-009–FR-013.
- All 16 existing events already carry a `bendie` row in `event_products` and belong to organizations with an active `bendie` `organization_products` row (per Feature 002's backfill), so no data migration is required for existing-event compatibility.
- No organization currently has an active Planner link or Planner entitlement in production; Planner-context navigation (FR-023) is therefore establishing foundation only, not changing any currently-visible behavior.
- Event-creation product selection, Planner organization linking UI, Planner event provisioning, and all Planner workspace modules are explicitly out of scope and are expected to be addressed in a subsequent feature (referred to during discovery as "Feature 004").
- Event-organization reassignment remains explicitly prohibited; no future need has been identified, and this feature does not build toward it.

## Out of Scope

- Product-aware event creation (Bendie/Planner/Both picker on Create Event, automatic `event_products` insertion at creation time).
- Planner organization creation or linking UI (`organization_planner_links` management UI).
- Planner event provisioning, including any provisioning saga, retry, or status tracking.
- A Planner authentication proxy or any second-login/session-minting work for Planner.
- Any Planner workspace module (Event Access, Participants, Tasks, Agenda, Flights, Accommodation, Settings), Transfers, Facilitator, or Notifications UI.
- Billing, subscriptions, payments, or invitations.
- Event-organization reassignment (changing `events.organization_id`).
- Any redesign of Feature 001 or Feature 002 artifacts, schema, or behavior.
