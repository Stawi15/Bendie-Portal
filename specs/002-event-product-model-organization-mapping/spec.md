# Feature Specification: Organization Product Entitlements & Event Product Foundation

**Feature Branch**: `002-event-product-model-organization-mapping`

**Created**: 2026-09-15

**Revised**: 2026-09-16 — see Revision Note below.

**Status**: Draft

**Input**: User description: "Revise Feature 002 so its data/security foundation supports the full intended Portal product model: which organization(s) a user belongs to and with what role, which product(s) an organization has purchased/been granted, which product(s) a given event actually uses, and — only when an event uses both products — how it links to Bendie Planner via feature 001. Foundational only: no UI, no navigation, no Planner event/organization provisioning, no billing. Feature 001 (Bendie Planner Integration) is complete/converged and is preserved unchanged, its role clarified rather than altered."

## Revision Note

The original version of this spec covered only `event_products` and `organization_planner_links`.
Further product discovery established that this was incomplete: an event's product usage cannot
be evaluated in isolation from what its *organization* is actually entitled to use, and the
question "which organization(s) can this user access, with what role" turned out to already have
a real, live answer in this codebase — the `organization_members` table, with its `is_organization_member()`/`is_organization_admin()`
RLS helpers, already exists and is already used throughout the app (`portalAuth.ts`, the People
page, team-management modals, user provisioning). **This feature does not introduce
`organization_members` — it already exists and is reused as-is.** This revision adds the one
genuinely missing layer (`organization_products`, an organization's product entitlements) and
tightens `event_products`/`organization_planner_links` to correctly relate to it.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Existing events and organizations keep working, now accurately classified (Priority: P1)

An administrator managing any event or organization that existed before this feature was
introduced sees no change in behavior at all, while internally every organization now has an
accurate record of which product(s) it uses (derived from its real existing events and Planner
links, never guessed or blanket-granted), and every event has an accurate record of which
product(s) it uses.

**Why this priority**: Nothing downstream can be trusted unless existing data converts safely and
*accurately* first — an organization must never be granted an entitlement it never actually had.

**Independent Test**: After the one-time migration runs, directly inspect any pre-existing
organization's and event's recorded product data and confirm both match that organization's/event's
actual pre-migration state, with zero observable behavior change anywhere in the app.

**Acceptance Scenarios**:

1. **Given** an existing organization whose events have no Bendie Planner link, **When** the
   migration runs, **Then** that organization is recorded as entitled to exactly the Bendie
   product, and every one of its events is recorded as using exactly the Bendie product.
2. **Given** an existing organization with at least one event that has an active Bendie Planner
   link, **When** the migration runs, **Then** that organization is recorded as entitled to both
   the Bendie and Planner products, that specific event is recorded as using both products, and
   feature 001's existing linked behavior continues to function exactly as before.
3. **Given** an existing organization with no events at all, **When** the migration runs, **Then**
   that organization receives no product entitlement records — entitlement is derived only from
   real, existing usage, never assumed.
4. **Given** an existing organization that has never had any event with an active Bendie Planner
   link, **When** the migration runs, **Then** that organization is never recorded as entitled to
   the Planner product, even if other organizations in the system are.

---

### User Story 2 - An organization's product entitlements and an event's product usage are each recorded reliably, and stay consistent with each other (Priority: P2)

Later features need a trustworthy place to record and query both "what can this organization use"
and "what does this specific event use," with a hard guarantee that an event can never end up using
a product its own organization was never granted.

**Why this priority**: Every later feature (navigation, provisioning, the future product switcher)
depends on this being unambiguous and internally consistent — an event silently using an
unentitled product would be a real, hard-to-detect correctness and business-integrity problem for
anything built on top of this feature.

**Independent Test**: Record an organization's entitlement in a product, then record an event
belonging to that organization as using that same product — confirm it succeeds. Attempt to record
an event as using a product its organization has no entitlement record for — confirm the system
rejects it, not merely warns.

**Acceptance Scenarios**:

1. **Given** an organization, **When** its entitlement to a product is recorded, **Then** that
   exact organization/product pairing is stored and can be reliably found again, and cannot be
   recorded a second time for the same organization/product pair.
2. **Given** an organization entitled to a product, **When** one of its events is recorded as using
   that product, **Then** the event/product record succeeds.
3. **Given** an organization with no recorded entitlement to a product, **When** an attempt is made
   to record one of its events as using that product, **Then** the system rejects the attempt.
4. **Given** an event with one or more recorded product-usage records, **When** the event itself is
   deleted, **Then** its product-usage records are removed automatically, with nothing orphaned.
5. **Given** an organization with one or more recorded entitlements, **When** the organization
   itself is deleted, **Then** its entitlement records are removed automatically along with it.

---

### User Story 3 - A Portal organization's Bendie Planner organization is remembered once, per organization (Priority: P3)

An authorized Portal administrator who establishes that a Portal organization corresponds to a
specific, already-existing Bendie Planner organization needs that association remembered
permanently and exclusively — no two Portal organizations should ever be recorded as mapping to
the same Bendie Planner organization, preserving clean tenant separation.

**Why this priority**: This is the prerequisite every later automatic Planner-event-provisioning
feature depends on, and getting tenant isolation wrong here would be very difficult to safely
unwind once real data depends on it.

**Independent Test**: Record a mapping for a Portal organization directly against the model,
confirm it is retrievable without re-entry, confirm a second mapping attempt for the same
organization does not create two conflicting mappings, and confirm the same Bendie Planner
organization cannot be mapped from two different Portal organizations at once.

**Acceptance Scenarios**:

1. **Given** a Portal organization with no existing Bendie Planner mapping, **When** an authorized
   administrator records a mapping to a specific, already-existing Bendie Planner organization,
   **Then** that mapping is stored and can be retrieved afterward.
2. **Given** a Portal organization that already has a recorded mapping, **When** a new mapping is
   recorded for that same organization, **Then** the organization ends up with exactly one current
   mapping, never two.
3. **Given** a Bendie Planner organization that is already mapped from one Portal organization,
   **When** a different Portal organization attempts to map to that same Bendie Planner
   organization, **Then** the system rejects the attempt.

---

### Edge Cases

- What happens if the one-time migration is run more than once? It must not create duplicate
  organization-entitlement or event-product records the second time.
- What happens to an event whose organization loses an entitlement it previously had (a future
  revocation, not built by this feature)? This feature only establishes that an event cannot be
  *newly recorded* as using an unentitled product — it does not define what happens to an event
  already using a product whose organization entitlement is later revoked; that behavior belongs
  to whichever later feature actually builds entitlement management.
- Can an organization have zero recorded product entitlements? Yes — an organization with no
  events and nothing else recorded for it legitimately has none; later features that read this
  record must treat "no entitlement found" defensively rather than assuming at least one is always
  present.
- Can the same Bendie Planner organization ever legitimately correspond to more than one Portal
  organization (e.g., a shared reseller)? Not under this feature's rules — tenant isolation is the
  default posture in the absence of a verified business need otherwise; if that need is confirmed
  later, it is a deliberate, separate decision to loosen this constraint, not an oversight here.
- What is the relationship between organization-level membership/role (who can access an
  organization, and as what) and organization-level product entitlement (what that organization
  is allowed to use)? These are deliberately separate concepts recorded in separate places — an
  organization admin does not automatically gain the ability to grant their own organization new
  product entitlements; see Assumptions.
- What is the relationship between an event's product usage and feature 001's event-to-Planner-event
  link? They are deliberately separate concepts — an event using both products does not
  automatically have a Bendie Planner link; establishing that link remains feature 001's existing,
  separate, manual mechanism. An event using only one product never needs or gets a link at all.

## Requirements *(mandatory)*

### Functional Requirements

**Organization product entitlements**

- **FR-001**: System MUST allow recording that a specific organization is entitled to use a
  specific product (Bendie, Bendie Planner, or both, recorded independently).
- **FR-002**: System MUST prevent the same organization from having the same product entitlement
  recorded more than once.
- **FR-003**: System MUST support representing an organization's entitlement as later able to be
  turned inactive (without deleting its history), without this feature needing to build the
  interface that does so.
- **FR-004**: System MUST automatically remove an organization's product-entitlement records when
  the organization itself is deleted.
- **FR-005**: Only an authorized Portal administrator MUST be able to create or update an
  organization's product entitlements — an organization's own members, including its
  administrators, MUST NOT be able to grant their own organization a new product entitlement.

**Event product usage**

- **FR-006**: System MUST allow recording that a specific event uses a specific product (Bendie,
  Bendie Planner, or both, recorded independently).
- **FR-007**: System MUST prevent the same event from having the same product recorded more than
  once.
- **FR-008**: System MUST prevent an event from being recorded as using a product that the event's
  own organization does not currently have an entitlement record for — this MUST be enforced in a
  way that cannot be bypassed by a client-supplied value, not merely checked by an interface before
  the fact.
- **FR-009**: System MUST automatically remove an event's product-usage records when the event
  itself is deleted, leaving nothing orphaned.
- **FR-010**: System MUST NOT alter or remove any product-usage or entitlement record as a side
  effect of any unrelated existing operation (e.g., adding a member, pushing an agenda, pulling
  travel data).

**Migration / backfill**

- **FR-011**: System MUST derive every existing organization's initial product entitlements from
  its actual existing events and Bendie Planner links — never grant an entitlement an organization's
  real existing data does not support.
- **FR-012**: System MUST record every organization that has at least one existing event as
  entitled to the Bendie product.
- **FR-013**: System MUST additionally record an organization as entitled to the Planner product
  if, and only if, at least one of its existing events has an active Bendie Planner link at the
  time of migration, using feature 001's own existing definition of "actively linked."
- **FR-014**: System MUST record every existing event as using the Bendie product, and
  additionally as using the Planner product if, and only if, that specific event has an active
  Bendie Planner link — matching the entitlements established by FR-012/FR-013 for that event's
  organization, so no event-level record is ever created without its organization-level counterpart
  already existing.
- **FR-015**: The migration MUST be safe to run against a database containing real, existing data,
  and MUST NOT alter, remove, or duplicate any existing organization, event, membership, or
  Bendie-Planner-link record.
- **FR-016**: The migration MUST be safe to run more than once without creating duplicate
  entitlement or product-usage records.

**Organization mapping**

- **FR-017**: System MUST allow an authorized administrator to record that a specific Portal
  organization corresponds to a specific, already-existing Bendie Planner organization.
- **FR-018**: System MUST allow at most one Bendie-Planner-organization mapping to exist per Portal
  organization at any given time.
- **FR-019**: System MUST prevent the same Bendie Planner organization from being mapped from more
  than one Portal organization at the same time.
- **FR-020**: System MUST make a previously recorded organization mapping reliably retrievable
  without requiring it to be re-entered.
- **FR-021**: System MUST record which administrator established or most recently updated a given
  organization mapping.
- **FR-022**: System MUST NOT create, modify, or otherwise provision anything inside Bendie Planner
  as part of recording an organization mapping.

**Organization membership (existing, reused)**

- **FR-023**: This feature MUST reuse the Portal's existing organization membership and role
  record (organization-scoped membership with a role per organization) as the sole source of truth
  for which organizations a user belongs to and their role there — this feature MUST NOT introduce
  a second, competing membership or role model.

**Security**

- **FR-024**: Only an authorized Portal administrator MUST be able to view, create, or update
  organization product-entitlement records.
- **FR-025**: Only an authorized Portal administrator MUST be able to create or update
  organization-to-Planner-organization mapping records; visibility MUST also remain
  administrator-only, since this record exposes an internal Bendie Planner identifier with no
  currently-approved non-administrator reader.
- **FR-026**: A member of an organization (at any role) MAY be able to view — but never create or
  modify — that organization's own product entitlements and its own events' product usage, so a
  later feature can build the product-aware navigation this foundation exists for, without needing
  another migration first. This MUST NOT extend to any organization the user does not belong to.
- **FR-027**: The system MUST independently verify authorization at the point of accessing any new
  or revised record type, regardless of what a calling interface has already checked.
- **FR-028**: No user MUST be able to grant themselves organization membership, promote their own
  role within an organization, or grant their organization a product entitlement, through any
  available access path.
- **FR-029**: The existing Portal-wide global administrator capability MUST remain fully intact
  and MUST NOT be weakened by any policy introduced or revised in this feature.

**Feature 001 compatibility**

- **FR-030**: Feature 001's existing manual event linking, staff-tier member sync, agenda push,
  and travel pull MUST continue to function exactly as before this feature is introduced.
- **FR-031**: This feature MUST NOT modify the schema, semantics, or behavior of the existing
  Bendie-Planner event-link record.
- **FR-032**: An event's use of both products MUST NOT, by itself, create or imply a Bendie
  Planner link — establishing that link remains feature 001's existing, separate, manual
  mechanism, unaffected by this feature.
- **FR-033**: This feature MUST NOT introduce or require any change to the current Bendie event
  experience, other than the one-time, behavior-preserving migration described above.

### Key Entities *(include if feature involves data)*

- **Organization Product Entitlement**: Represents that a specific organization is entitled to use
  a specific product. Answers "what has this organization purchased or been granted?" — distinct
  from, and the prerequisite for, an event's own product usage.
- **Event Product Usage**: Represents that a specific event uses a specific product. Answers "what
  does this event actually use?" — always constrained to products its own organization is entitled
  to.
- **Organization Planner Mapping**: Represents the durable, one-to-one, tenant-isolated association
  between a Portal organization and a specific, already-existing Bendie Planner organization.
- **Organization Membership** *(existing, not introduced by this feature)*: Represents which
  organizations a user belongs to and their role in each — reused as-is.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of organizations with at least one existing event are correctly entitled to the
  Bendie product immediately after migration, with zero observable change in behavior.
- **SC-002**: 100% of organizations with at least one existing actively-linked event are
  additionally entitled to the Planner product immediately after migration, and 0% of unrelated
  organizations are.
- **SC-003**: 100% of existing events are correctly represented as using the product(s) matching
  their organization's derived entitlements, immediately after migration.
- **SC-004**: Every one of feature 001's existing capabilities continues to succeed at exactly the
  same rate as before this feature — zero regressions attributable to this feature.
- **SC-005**: Zero events can be recorded as using a product their organization is not entitled to,
  at any time, through any access path.
- **SC-006**: Zero duplicate organization-entitlement records, event-product records, or
  organization-to-Planner-organization mappings can exist at any time.
- **SC-007**: Zero Bendie Planner organizations are ever mapped from more than one Portal
  organization at the same time.
- **SC-008**: Zero unauthorized creation or modification of any record type introduced or revised
  by this feature succeeds, including self-service membership, self-promotion, and self-granted
  entitlements.

## Assumptions

- "Authorized Portal administrator" refers to the Portal's existing, unchanged single
  platform-administrator access level (`profiles.global_role = 'admin'`) — this feature does not
  introduce a new platform-level permission tier.
- Organization-scoped roles (owner/admin/member, and the Portal's existing broader role vocabulary)
  already exist and are reused unchanged; this feature does not redefine what an organization
  "owner" or "admin" can do generally — it only specifically prevents that role, however defined,
  from self-granting product entitlements (FR-005, FR-028), since entitlement remains a
  platform-administrator concern for now.
- Recording a new Planner mapping for a Portal organization that already has one replaces the
  existing mapping in place, rather than being rejected outright — consistent with feature 001's
  own established re-linking precedent.
- "Active" Bendie Planner link, for migration purposes, uses exactly feature 001's existing
  definition — no new definition is introduced.
- The real, administrator-facing interfaces for managing entitlements, memberships, or organization
  mappings are not part of this feature; a minimal, non-user-facing way to prove this feature's
  requirements is sufficient, and the actual user-facing flows are delivered by later features.
- Verifying that a referenced Bendie Planner organization actually exists is not required by this
  feature.

## Out of Scope

The following are explicitly excluded from this feature and MUST NOT be silently introduced during
implementation:

- Any new or changed user interface: organization selector, product selector, Bendie/Planner
  dashboard switcher, customer organization management, event-creation redesign, Planner workspace
  (Event Access, Tasks, Participants, Agenda, Flights, Accommodation, Event Settings).
- A new organization-membership or role table or model — the existing one is reused, not replaced.
- Billing, payments, subscriptions, pricing, or invoicing of any kind — entitlement state only.
- Automatic creation of a new organization or event inside Bendie Planner.
- Any change to who can access the Portal application itself — the existing global-admin-only
  middleware gate is unchanged.
- Any change to feature 001's existing sync behavior, schema, or semantics.
- Invitations, unless later found to be technically unavoidable for the foundational membership
  model (not expected, since that model already exists).
- Transfers, rooming, facilitators, notifications, and blueprints — none are relevant here.
