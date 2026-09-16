# Feature Specification: Event Product Selection & Planner Provisioning

**Feature Branch**: `004-event-product-selection-planner-provisioning`

**Created**: 2026-09-15

**Status**: Draft

**Input**: User description: "When an authorized user creates an event, the creation experience should depend on the selected organization's ACTIVE product entitlements. Bendie-only orgs get a Bendie event automatically. Planner-only orgs get a first-class Planner event (Portal shell + real Planner-side event + counterpart mapping), with no Bendie product silently added. Both-entitled orgs choose Bendie/Planner/Both at creation. Provisioning must be idempotent and recoverable across Portal's and Planner's separate databases, must not weaken any Feature 001/002/003 boundary, and must not build the Planner workspace itself."

## Context

Feature 001 (Bendie Planner Integration) established manual linking between an *already-existing* Portal event and an *already-existing* Planner event, plus one-directional staff sync, agenda push, and travel pull for linked events. Feature 002 established `organization_products` (what an organization is entitled to use), `event_products` (what a specific event actually uses), and `organization_planner_links` (the Portal-organization ↔ Planner-organization mapping, platform-admin-only to establish). Feature 003 established that Portal admission is now open to ordinary organization customers, subject to strict organization/event access boundaries.

None of those three features touch event *creation*. Today, creating a Portal event inserts only an `events` row — no `event_products` record and no `event_members` record are created for it, which (among other things) means a newly created event's own creator currently has no workspace access to it under Feature 003's access model, and no product tabs would render for it under Feature 003's product-aware navigation. Separately, no capability anywhere in this codebase creates a *new* Planner-side event; Feature 001 only ever links to one that already exists, created by Planner's own team through Planner's own application.

This feature makes event creation product-aware: it closes the pre-existing `event_products`/`event_members` gap for every event regardless of product mix, and it adds the genuinely new capability of provisioning a real Planner-side event (and its Portal-side counterpart mapping) when an event is created for a product entitlement that includes Planner. It does not build any Planner-facing workspace, does not touch how Planner organizations are mapped, and does not change anything about how an *existing* linked event's synchronization already works.

## Clarifications

### Session 2026-09-15

- **Q: When a customer selects Planner or Both but their organization has no Planner-organization mapping, what must happen?** → A: Block the creation attempt entirely, before any Portal event, product-usage record, Planner event, or counterpart link is created — no partial state of any kind. The user sees a plain-language message that Bendie Planner setup for their organization is incomplete and that an administrator must complete it; the message must not imply the current user can complete it themselves. Resolves FR-019 (see also User Story 4, Scenario 2).
- **Q: What generates the Planner-side event's required identifying code?** → A: The system generates it; the customer never enters or sees it. Live inspection of Bendie Planner's `events` table found `event_code` is `NOT NULL` with a `UNIQUE` index and no auto-generation trigger or RPC anywhere in Planner — every existing value was typed by hand by Planner's own operators, following a loose human style (organization prefix + descriptive slug + date), not a reusable formula. Because no reusable canonical generation algorithm exists to reuse, the system-generated code must instead be deterministically derived from the Portal event's own stable identity (its id), not from mutable fields like the event's title/name, so the exact same code is produced on every retry and satisfies Planner's uniqueness constraint. Resolves FR-010.
- **Q: What Planner-side provisioning state must the system track for Planner-inclusive events?** → A: An explicit, persisted provisioning state — not merely whether an active Planner link exists or not, since link-absence is ambiguous between "not started," "in progress," "failed," and "doesn't need one." At minimum: not required (Bendie-only), pending, in progress, succeeded, and failed (with enough detail for an administrator to diagnose the failure, never exposing secrets or raw internal errors to the customer). Provisioning is only ever "succeeded" once the Portal event, its correct `event_products`, the Planner event, and the active counterpart link all exist together — a Planner event existing without the counterpart link is not success. This state is orchestration state only; it does not replace `event_products` (authoritative for selected products) or `event_planner_links` (authoritative for the established counterpart). Resolves FR-021/FR-022 (expanded into FR-021–FR-030 below).
- **Q: What setup date is provisioned into the Planner-side event when the customer does not separately provide one?** → A: The event's own start date. Live inspection of Bendie Planner's `events` table found `setup_date` is nullable with **no database constraint relating it to `start_date`** — equality is not rejected (13/13 live events have a value; 12 are one day before `start_date`, 1 equals `start_date`, 0 are ever after it). Since no constraint blocks it and Portal does not collect a distinct setup date today, defaulting `setup_date = start_date` is valid and avoids adding a new field to the basic creation experience. The one-day-earlier pattern in real operational data is a human convention, not an enforced rule — noted as a limitation of this default, not a blocker. Resolves FR-010.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Creating an event for a Bendie-only organization (Priority: P1)

An organization owner/admin (or platform admin) whose organization is entitled only to Bendie creates a new event. The event is created exactly as today from their point of view, but now automatically becomes usable: it is recorded as a Bendie event, and the person who created it can immediately enter its workspace.

**Why this priority**: This is the feature's foundation — it closes an existing gap (no `event_products`, no `event_members` for the creator) that affects every event regardless of product mix, and it is the simplest path to prove the new creation flow end-to-end without any cross-database dependency.

**Independent Test**: As an organization owner/admin of a Bendie-only-entitled organization, create a new event; confirm it is recorded as using the Bendie product, confirm the creator can open its workspace immediately without any further setup step, and confirm its navigation is identical to every pre-existing Bendie event.

**Acceptance Scenarios**:

1. **Given** an organization entitled only to Bendie (`organization_products` has an active `bendie` row, no active `planner` row), **When** an org owner/admin creates a new event, **Then** the event is created, is recorded as using the Bendie product, and no Planner-side action is attempted.
2. **Given** the event created in Scenario 1, **When** the creator opens that event immediately after creation, **Then** they can enter its workspace (not denied), without being added to it by anyone else first.
3. **Given** the event created in Scenario 1, **When** its navigation is viewed, **Then** it renders identically to a pre-existing Bendie event with an active Bendie entitlement.

---

### User Story 2 - Creating an event for a Planner-only organization (Priority: P1)

An organization owner/admin (or platform admin) whose organization is entitled only to Bendie Planner creates a new event. A Portal event identity is created as the management record, a real corresponding event is provisioned inside Bendie Planner, and the two are linked — without any Bendie product ever being silently enabled.

**Why this priority**: This is the capability the feature exists to deliver — provisioning a real, usable Planner event from Portal for the first time anywhere in this system.

**Independent Test**: As an org owner/admin of a Planner-only-entitled organization (with an existing `organization_planner_links` mapping already in place), create a new event; confirm a Portal event exists, confirm it is recorded as using only the Planner product (never Bendie), confirm a real event now exists in Bendie Planner corresponding to it, and confirm the Portal event shows an active link to that Planner event.

**Acceptance Scenarios**:

1. **Given** an organization entitled only to Planner, with an existing Portal-organization-to-Planner-organization mapping already established, **When** an org owner/admin creates a new event, **Then** a Portal event is created, it is recorded as using only the Planner product, a corresponding event is created inside Bendie Planner under the mapped Planner organization, and the Portal event shows an active link to that Planner event.
2. **Given** the event created in Scenario 1, **When** its `event_products` are inspected, **Then** no Bendie product-usage record exists for it, under any circumstance.
3. **Given** the event created in Scenario 1, **When** the creator opens that event immediately after creation, **Then** they can enter its workspace, and — because the organization's entitlement includes only Planner and no Bendie navigation is classified for this organization's use — they see no Bendie tabs, consistent with existing product-aware navigation.
4. **Given** the creator of the event in Scenario 1 holds a staff-eligible role, **When** the event is created, **Then** the creator also becomes available inside the linked Bendie Planner event, using the same staff-synchronization mechanism Feature 001 already provides for any staff-tier member of a linked event.

---

### User Story 3 - Choosing a product for an organization entitled to both (Priority: P2)

An organization owner/admin (or platform admin) whose organization is entitled to both Bendie and Bendie Planner creates a new event and explicitly chooses whether it uses Bendie, Planner, or both.

**Why this priority**: This is the product-selection experience the feature is named for, but it depends on User Story 1 and User Story 2's provisioning mechanics already working correctly for each product individually.

**Independent Test**: As an org owner/admin of an organization entitled to both products, create three events choosing Bendie, Planner, and Both respectively; confirm each event's recorded product usage and Planner-provisioning outcome exactly matches the chosen option, with no product silently added or omitted.

**Acceptance Scenarios**:

1. **Given** an organization entitled to both Bendie and Planner, **When** an org owner/admin begins creating a new event, **Then** they are able to choose Bendie, Planner, or Both before the event is created.
2. **Given** "Bendie" is chosen, **When** the event is created, **Then** it behaves exactly as User Story 1 describes — no Planner event is provisioned.
3. **Given** "Planner" is chosen, **When** the event is created, **Then** it behaves exactly as User Story 2 describes — no Bendie product-usage record is created.
4. **Given** "Both" is chosen, **When** the event is created, **Then** the event is recorded as using both products, a Planner event is provisioned and linked exactly as in User Story 2, and every one of Feature 001's existing synchronization capabilities (staff sync, agenda push, travel pull) is available for this event exactly as it already is for any manually-linked event today.

---

### User Story 4 - Organization missing its required Planner mapping (Priority: P2)

An organization owner/admin whose organization is entitled to Planner (alone or with Bendie) attempts to create a Planner-inclusive event, but their organization has no established Portal-organization-to-Planner-organization mapping yet.

**Why this priority**: Without this guardrail, a Planner-inclusive creation attempt would either fail confusingly deep into the process or — worse — attempt to guess/auto-create a Planner organization, which Feature 002 explicitly reserves as a platform-administrator action. Getting this boundary right is a prerequisite for User Story 2/3 being safe to ship at all.

**Independent Test**: As an org owner/admin of a Planner-entitled organization with no `organization_planner_links` row, attempt to create a Planner or Both event; confirm the attempt is blocked before any Portal or Planner data is written, with guidance the user can act on, and confirm no Planner organization is created as a side effect.

**Acceptance Scenarios**:

1. **Given** an organization entitled to Planner with no existing Planner-organization mapping, **When** an org owner/admin attempts to create a Planner or Both event, **Then** the attempt is blocked before any event, product-usage, or Planner-side record is created.
2. **Given** the same blocked attempt, **When** the user sees the resulting message, **Then** it plainly states that Bendie Planner has not yet been set up for their organization and that an administrator must complete that setup before a Planner-enabled event can be created — it does not imply the current user can complete this themselves, and it offers no self-service mapping control.
3. **Given** the same organization, **When** the org owner/admin creates a Bendie event instead (if also entitled to Bendie), **Then** the attempt is not blocked by the missing Planner mapping, since it does not require one.
4. **Given** the missing mapping is later established by a platform administrator through the existing Feature 002 mechanism, **When** the org owner/admin retries creating a Planner or Both event, **Then** the attempt now succeeds.

---

### User Story 5 - Recovering from a failed or interrupted Planner provisioning attempt (Priority: P2)

An org owner/admin creates a Planner or Both event, but the Planner-side provisioning step fails, times out, or is interrupted. The Portal event itself is not lost, and the same or a different administrator can retry provisioning until it succeeds, without ever ending up with two Planner events for the one Portal event.

**Why this priority**: Portal and Bendie Planner are separate systems; a failure partway through is a certainty over time, not an edge case, and losing the Portal event (or silently duplicating the Planner event) on failure would be a serious defect, not a minor one.

**Independent Test**: Simulate a Planner-provisioning failure after the Portal event has already been created; confirm the Portal event still exists and is usable, confirm the event is shown as not yet fully set up for Planner, retry provisioning, and confirm exactly one Planner event ends up linked to it — never zero (after a successful retry) and never more than one.

**Acceptance Scenarios**:

1. **Given** a Planner or Both event creation request whose Portal-side steps (event, product usage, creator access) succeed but whose Planner-side provisioning step fails, **When** the failure occurs, **Then** the Portal event still exists, is usable, and is not deleted or rolled back as a result of the Planner-side failure, and its provisioning state is recorded as failed (not simply left absent/ambiguous).
2. **Given** the event from Scenario 1, **When** the creator or an authorized manager views it, **Then** they can see that its provisioning state is failed (distinct from pending/in-progress/not-required) and can trigger a retry; any diagnostic detail shown to them is a plain-language summary, never a raw internal error, credential, or stack trace.
3. **Given** a retry of provisioning for the event from Scenario 1, **When** the retry succeeds, **Then** the event's provisioning state becomes succeeded only once the Portal event, its correct `event_products`, the Planner event, and an active counterpart link all exist together — the event ends up with exactly one linked Planner event, and no duplicate Planner event is ever left behind from the earlier failed attempt.
4. **Given** the same retry is triggered more than once in a row (e.g. the user clicks retry twice, or a network issue causes the client to resend the same request), **When** both attempts reach the server, **Then** at most one Planner event ever ends up linked to the Portal event, and the retry acts on the same existing Portal event and provisioning identity rather than creating a second Portal event.
5. **Given** a Planner event was created during a provisioning attempt but the counterpart-link step then failed, **When** the outcome is evaluated, **Then** it is reported as failed, not succeeded — a Planner event existing without its counterpart link is never treated as a completed provisioning.

---

### Edge Cases

- An organization is entitled to neither Bendie nor Planner (or its only entitlement is inactive) → event creation is unavailable for that organization; no event, product-usage, or Planner record of any kind is created.
- An organization's active entitlement for the product being selected is revoked (`is_active` becomes `false`) in the moment between the user choosing a product and the creation request actually being processed → the request is rejected as if the entitlement had never been active; nothing is partially created.
- An organization's Planner-organization mapping is changed or removed in the moment between the user starting creation and the Planner-provisioning step running → the provisioning step uses the mapping as it exists at the moment it actually runs, not a value captured earlier in the flow.
- A user without organization owner/admin standing (and not a platform admin) attempts event creation of any product mix → denied, exactly as event creation is already denied today for that same user.
- A user attempts to request a product for an organization they do not belong to, or for an organization other than their currently selected one, by supplying a manipulated value → denied; the server independently determines the organization and its entitlements, never trusting a client-supplied value.
- A Planner-only or Both event's creator does not hold a staff-eligible role (this cannot currently occur, since the creator always receives the `admin` role on their own new event, which is staff-eligible) → documented as structurally impossible under this feature's own creator-access rule, not a case requiring separate handling.
- An event using only the Planner product is viewed in the Portal today (before any future Planner workspace exists) → it shows no Bendie navigation tabs (none are classified for a product it doesn't use) and, since no Planner workspace exists yet, no Planner-specific navigation either — this is the expected, intentional foundation state, not a defect.
- An administrator manually triggers agenda push or travel pull (Feature 001's existing manual actions) on a Planner-only event → the actions remain available exactly as Feature 001's existing rules already allow for any linked event, and complete having found nothing to synchronize (no Bendie-side agenda or travel content exists for a Planner-only event), rather than behaving as an error.
- The same creation request is somehow submitted twice concurrently (double-click, client retry) for a Planner or Both event → exactly one Portal event and, once provisioning succeeds, exactly one linked Planner event result — never two of either.
- An event is created as Bendie-only, then later the organization also becomes entitled to Planner → the existing event's product usage does not change automatically; adding Planner to an already-created event is out of scope for this feature (see Out of Scope).
- A Bendie-only event is inspected for its Planner-provisioning state → it is recorded as not required, never as pending/failed, since it was never eligible for Planner provisioning in the first place.
- The same Portal event is retried for Planner provisioning after a prior attempt already produced a Planner event but failed before the counterpart link was written → the retry must recognize and reuse that already-created Planner event (via its deterministic, retry-stable identifying code) rather than creating a second one.

## Requirements *(mandatory)*

### Functional Requirements — Product-aware creation

- **FR-001**: The system MUST determine which product(s) an organization is entitled to use, at the moment of event creation, using only entitlements whose active status is currently `true` — an entitlement record that exists but is not currently active MUST be treated as unavailable.
- **FR-002**: When an organization is entitled only to Bendie, the system MUST create the event as a Bendie-product event automatically, without requiring the user to make a product choice.
- **FR-003**: When an organization is entitled only to Planner, the system MUST create the event as a Planner-product event automatically, without requiring the user to make a product choice, and MUST NOT record the event as also using Bendie.
- **FR-004**: When an organization is entitled to both Bendie and Planner, the system MUST require the user to choose Bendie, Planner, or Both before the event is created.
- **FR-005**: When an organization is entitled to neither product (or its only entitlement is not currently active), the system MUST prevent event creation for that organization and MUST communicate why.
- **FR-006**: The product(s) selected or automatically determined at creation MUST become that event's recorded product usage; the system MUST NOT record a product the user did not select and the organization was not entitled to.

### Functional Requirements — Portal-side event record

- **FR-007**: Creating an event MUST result in a Portal event record, a record of every product it uses, and a record granting its creator access to it, as a single reliable unit — if any one of these three cannot be recorded, none of them MUST be left partially recorded.
- **FR-008**: The creator of a newly created event MUST be recorded as a member of that event with a role sufficient to manage it (equivalent to the existing `admin` event role), regardless of which product(s) the event uses.
- **FR-009**: This requirement (FR-008) MUST apply uniformly to Bendie, Planner, and Both events — access is not a Planner-specific or Bendie-specific concern.

### Functional Requirements — Planner provisioning (Planner-only and Both)

- **FR-010**: When an event's product selection includes Planner, the system MUST provision a corresponding event inside Bendie Planner, under the Bendie Planner organization the creating organization is mapped to. The provisioned Planner event's required identifying code MUST be generated by the system, never entered by the customer; it MUST be derived deterministically from the Portal event's own stable identity (not from its title, name, or any other field the customer can change) so that the same code is produced every time provisioning is attempted or retried for that same Portal event. The provisioned Planner event's setup date MUST default to the same date as the event's own start date whenever the customer does not separately supply a distinct setup date.
- **FR-011**: The system MUST NOT provision a Planner event, or attempt to, for an event whose product selection does not include Planner.
- **FR-012**: Provisioning a Planner event MUST NOT require the person creating the event to have any prior identity, login, or session in Bendie Planner.
- **FR-013**: When a Planner or Both event is created and its creator holds a staff-eligible role, the system MUST make that creator available inside the newly provisioned Planner event, using the same staff-synchronization behavior Feature 001 already applies to any staff-tier member of a linked event.
- **FR-014**: The system MUST NOT attempt Planner provisioning, staff synchronization, agenda synchronization, or travel synchronization for an event whose product selection does not include Planner.

### Functional Requirements — Portal ↔ Planner counterpart linking

- **FR-015**: The system MUST represent the relationship between a Portal event and its provisioned Planner event using the same association record Feature 001 already uses for a manually linked event — a second, parallel mapping concept MUST NOT be introduced.
- **FR-016**: A successfully provisioned Planner or Both event MUST show an active link to its corresponding Planner event, using the existing link representation, immediately usable by every one of Feature 001's existing capabilities that depend on an active link.
- **FR-017**: This feature MUST NOT change the meaning, schema, or behavior of the existing link representation for events that were linked the way Feature 001 already supports (manually, to a pre-existing Planner event) — existing linked events MUST be unaffected.

### Functional Requirements — Planner organization mapping prerequisite

- **FR-018**: The system MUST NOT create, infer, or otherwise establish a Portal-organization-to-Planner-organization mapping as a side effect of event creation, under any circumstance.
- **FR-019**: When an organization's product selection requires Planner and no Portal-organization-to-Planner-organization mapping currently exists for it, the system MUST prevent the creation attempt from proceeding **before** any Portal event, product-usage record, Planner event, or counterpart link is created — no partial record of any kind — and MUST inform the user, in plain language, that Bendie Planner has not yet been set up for their organization and that an administrator must complete that setup first; the message MUST NOT imply the current user can complete this themselves, and MUST NOT offer any self-service way to establish the mapping.
- **FR-020**: Establishing or changing a Portal-organization-to-Planner-organization mapping MUST remain exactly as restricted as Feature 002 already made it (an authorized platform administrator only) — this feature MUST NOT introduce any additional way to create or modify that mapping.

### Functional Requirements — Provisioning state, idempotency, failure, and retry

- **FR-021**: Every event MUST have a determinable Planner-provisioning state. For a Bendie-only event, that state MUST be recorded as **not required** immediately at creation — a Bendie-only event is never pending, in progress, or failed with respect to Planner provisioning.
- **FR-022**: For a Planner or Both event, the system MUST track an explicit, persisted Planner-provisioning state — distinct from, and not inferred solely from, whether an active counterpart link currently exists — covering at minimum: **pending** (not yet attempted), **in progress**, **succeeded**, and **failed**. Absence of a counterpart link alone MUST NOT be treated as sufficient information to distinguish these states from each other.
- **FR-023**: A Planner or Both event's provisioning state MUST NOT be recorded as succeeded unless all of the following exist together: the Portal event, its correct `event_products` record(s), the provisioned Planner event, and an active Portal↔Planner counterpart link. A Planner event existing without its counterpart link MUST be recorded as failed (or in progress), never as succeeded.
- **FR-024**: When Planner provisioning fails, the system MUST retain enough diagnostic detail about the failure to support an authorized administrator investigating it, while the text shown to the customer-facing user MUST remain a plain-language summary — the system MUST NOT expose secrets, service credentials, or raw internal/database error detail to the customer-facing user.
- **FR-025**: A failure, timeout, or interruption during Planner-side provisioning MUST NOT cause the already-created Portal event, its product-usage record, or its creator's access record to be deleted, rolled back, or left in a state the user cannot recover from.
- **FR-026**: The system MUST provide a way to retry Planner provisioning for an event whose Portal-side record exists but whose provisioning state is not yet succeeded.
- **FR-027**: Retrying Planner provisioning for the same event — whether because the first attempt failed, because the outcome of the first attempt was never confirmed (e.g. a network timeout), or because the same request was submitted more than once — MUST NOT result in more than one Planner event ever becoming linked to that Portal event.
- **FR-028**: A retry MUST act on the same existing Portal event and the same provisioning identity as the original attempt — it MUST NOT create a second Portal event for what is, from the user's point of view, one creation request.
- **FR-029**: The system MUST re-verify, at the moment Planner-side provisioning actually runs (not only earlier in the creation flow, and identically on every retry), that the organization's relevant product entitlement is still active and that its Planner-organization mapping still exists — a change to either between the start of the request and this point MUST be honored, not ignored.
- **FR-030**: The Planner-provisioning state introduced by FR-021–FR-029 is orchestration state only. It MUST NOT replace `event_products` as the authoritative record of which product(s) an event uses, and it MUST NOT replace the Portal↔Planner counterpart link as the authoritative record of an event's established Planner counterpart.

### Functional Requirements — Authorization and security

- **FR-031**: Only a user who is a platform administrator, or who holds an `owner`/`admin` role in the organization the event is being created for, MUST be able to create an event of any product mix — this is the same authorization rule event creation already enforces today; this feature MUST NOT loosen or bypass it.
- **FR-032**: The system MUST independently verify, on the server, every condition this feature adds to event creation (organization entitlement, product selection validity, Planner-organization mapping presence) — a client-supplied value for organization, product selection, or entitlement status MUST NEVER be trusted as authoritative.
- **FR-033**: Any credential or key required to provision a Planner event MUST never be exposed to or reachable from a user's browser session.
- **FR-034**: A user who is not authorized to create an event for a given organization MUST NOT be able to trigger Planner provisioning for that organization by any means, including bypassing the normal creation interface.

### Functional Requirements — Preservation (Features 001, 002, 003)

- **FR-035**: This feature MUST NOT change Feature 001's existing manual linking flow, staff synchronization, agenda push, or travel pull behavior for any event linked the way Feature 001 already supports.
- **FR-036**: This feature MUST NOT change the schema, RLS, or enforced invariants of `organization_products`, `event_products`, or `organization_planner_links` established by Feature 002, beyond using them exactly as designed (reading entitlements, writing event-product-usage records consistent with entitlement, reading the organization mapping).
- **FR-037**: This feature MUST continue to enforce Feature 003's existing event-creation authorization rule, workspace-access model, and product-aware navigation exactly as they already work — this feature adds new preconditions to creation; it does not relax any existing one.
- **FR-038**: This feature MUST NOT introduce, expand, or modify any Bendie Planner workspace surface, screen, or navigation entry — Planner-only and Both events remain foundation-only from the Portal user's point of view until a later feature builds that workspace.

### Functional Requirements — Lifecycle

- **FR-039**: An event's product selection MUST be treated as fixed at creation for the scope of this feature — this feature MUST NOT provide a way to add or remove a product from an event after it has been created.

### Key Entities

- **Event Product Usage** *(existing, `event_products`, Feature 002)* — now actually written at creation time for every new event, for the first time; no schema change to this entity.
- **Event Access Grant** *(existing, `event_members`, Feature 003)* — now actually written for the creator at creation time, for the first time; no schema change to this entity.
- **Planner Link** *(existing, `event_planner_links`, Feature 001)* — reused, unmodified in meaning, as the single representation of a Portal event's Planner counterpart, whether established by this feature's automatic provisioning or by Feature 001's existing manual linking.
- **Planner Event** *(external, Bendie Planner's own event record)* — now created, not merely linked to, by this feature for Planner-inclusive event creation. Its identifying code is system-generated from the Portal event's own stable identity (never customer-entered, stable across retries); its setup date defaults to the event's start date unless a distinct value is separately supplied.
- **Provisioning Outcome** *(new, orchestration-only state this feature introduces)* — the Planner-provisioning state of a given event: not required (Bendie-only), pending, in progress, succeeded, or failed, with enough diagnostic detail on failure to support administrator investigation without exposing secrets or raw internal errors to the customer-facing user. Succeeded only when the Portal event, correct `event_products`, the Planner event, and the active counterpart link all exist together. Does not replace `event_products` or the Planner Link as the authoritative record of product selection or counterpart identity, respectively.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of events created for a Bendie-only-entitled organization have a recorded Bendie product usage and a usable creator immediately after creation, with zero additional manual setup steps.
- **SC-002**: 100% of events created for a Planner-only-entitled organization (with an established Planner-organization mapping) result in exactly one corresponding Planner-side event, correctly linked, with zero Bendie product usage ever recorded for them.
- **SC-003**: 100% of events created for an organization entitled to both products are recorded as using exactly the product(s) the creator selected — never more, never fewer.
- **SC-004**: 0% of event-creation attempts for an organization with no active entitlement to the requested product(s) succeed, through any access path.
- **SC-005**: 0% of Planner-inclusive event-creation attempts for an organization with no established Planner-organization mapping result in any event, product-usage, or Planner-side record being created.
- **SC-006**: 100% of Planner-provisioning failures leave the Portal event intact and retryable; 0% result in the Portal event being lost.
- **SC-007**: 0% of retried, duplicated, or concurrently-submitted Planner-provisioning attempts for the same event ever result in more than one linked Planner event.
- **SC-008**: 100% of Feature 001's existing capabilities (linking, staff sync, agenda push, travel pull) continue to succeed at exactly the same rate as before this feature, for every event that was already linked before this feature shipped.
- **SC-009**: 0% of this feature's new event-creation behavior is reachable by a user who is not a platform administrator or an `owner`/`admin` of the target organization.

## Assumptions

- "Authorized to create an event" means exactly what it already means today (platform admin, or `owner`/`admin` role in the target organization) — this feature does not introduce a new permission tier or redefine an existing one.
- The Portal-organization-to-Planner-organization mapping, when required, is expected to already exist by the time an organization's staff attempt Planner-inclusive event creation in normal operation — this feature's job is to enforce that precondition correctly, not to make establishing the mapping easier or faster; that remains a platform-administrator action outside this feature's scope, per Feature 002.
- A Planner-provisioning retry is expected to be triggered by a Portal user (the creator or another authorized manager of that event), not by an unattended background process — this feature does not introduce scheduled or automatic retry.
- Every event, regardless of product mix, continues to use the single existing Portal `events` table and the single existing event-scoped tab-shell route structure; no new route namespace is introduced by this feature.
- The existing product-aware navigation Feature 003 already built (tabs classified `bendie`/`planner`/`shared`, filtered by active entitlement and event product usage) requires no change to correctly render a Planner-only event as having no visible Bendie tabs — it already behaves this way for any event with no Bendie product-usage record.
- Defaulting a provisioned Planner event's setup date to its start date (per the Clarifications above) is a documented simplification, not a guarantee of matching real-world operational practice — live Planner data shows real events are usually set up one day before they start. This is accepted as a reasonable MVP default because no database constraint requires otherwise and Portal does not collect a distinct setup date today; a later feature may collect one explicitly if this default proves insufficient in practice.
- The system-generated Planner event code is treated as an internal/operational identifier for Bendie Planner's own use, not a customer-facing value — nothing in the current Portal UI displays or requires a Planner event code today, and this feature does not add such a display.

## Out of Scope

- Any Bendie Planner workspace screen, module, or navigation surface (Event Access, Participants, Tasks, Agenda, Flights, Accommodation, Transfers, Blueprints, Settings, or any other Planner-side management UI).
- Any way to establish, change, or auto-provision a Portal-organization-to-Planner-organization mapping — this remains exactly the platform-administrator-only mechanism Feature 002 already established.
- Adding a product to, or removing a product from, an event after it has been created (upgrade/downgrade). This is deliberately deferred; nothing in this feature's data model prevents a later feature from adding it.
- Billing, subscriptions, pricing, or any self-service way for an organization to change its own product entitlements.
- Any change to Feature 001's existing manual linking, staff synchronization, agenda push, or travel pull behavior, schema, or semantics for events already linked before this feature ships.
- Any change to Feature 002's `organization_products`, `event_products`, or `organization_planner_links` schema, RLS, or enforced invariants, beyond using them as designed.
- Any change to Feature 003's admission, organization-isolation, workspace-access, or product-aware-navigation behavior.
- Any background job, queue, or scheduled/asynchronous processing infrastructure — provisioning in this feature is a direct, synchronous outcome of a user's creation or retry action.
- Any redesign of how an existing (pre-Feature-004) event is classified, migrated, or displayed.
