# Feature Specification: Bendie Planner Vendors Management

**Feature Branch**: `009-bendie-planner-vendors-management`

**Created**: 2026-09-21

**Status**: Draft

**Input**: User description: "Feature 009 gives Bendie Portal a dedicated Vendors section inside the existing Planner event workspace, operating as a second interface over Bendie Planner's own canonical vendor data (`event_vendor_items`) — no Portal-side vendor table, no sync layer. Authorized viewers see the vendor list; authorized managers can create items, advance/reverse their packed→loaded→on-site status, and delete them. Editing an existing item's core details (category, description, quantity, unit, sort order) is explicitly out of scope, per a verified live-database constraint. Follows the architecture and authorization model established by Features 001–008."

## Context

This feature was scoped by a dedicated architecture/discovery pass (2026-09-20/21, following Feature 008's convergence) that inspected the **live** Bendie Planner Supabase schema directly rather than relying on historical documentation. The following facts are treated as authoritative ground truth for this specification:

- `event_vendor_items` is the sole, canonical Bendie Planner table for vendor items: `vendor_item_id` (identity PK), `event_id` (FK → Planner `events`), `category`, `item_description`, `quantity_text`, `unit`, `sort_order`, three lifecycle flags (`is_packed`, `is_loaded`, `is_on_site`) each with a paired `*_at` timestamp and `*_by_profile_id` actor, `notes`, `created_at`/`updated_at`, `created_by_profile_id`. No Portal code anywhere references this table today — this feature is fully greenfield inside Portal.
- A live view, `event_vendor_items_v`, already exists as a plain `SELECT`/`LEFT JOIN` over this table (denormalizing actor names). It is not a second data store — any row written to the base table is immediately visible through it. This confirms the base table is genuinely the single live source of truth for whatever reads Bendie Planner's own client performs, not a store that requires syncing.
- Live RLS on `event_vendor_items` is a clean two-tier model — `SELECT` requires `can_manage_event_vendors(event_id) OR can_view_event_vendors(event_id)`; `INSERT`/`UPDATE`/`DELETE` require `can_manage_event_vendors(event_id)` — and both underlying functions resolve to platform-admin-or-Planner-org-admin **OR** an active `event_user_assignments` row with the matching `can_view_vendors`/`can_manage_vendors` flag. These are the exact same flags Feature 008 already administers; there is zero drift between what this feature reads and what Feature 008 writes.
- **Verified via direct inspection of live trigger functions** (not assumed from documentation): three behaviors are enforced by the database itself, independent of which client writes to the table:
  1. `enforce_vendor_item_stage_order` (fires on every insert/update) makes the packed → loaded → on-site progression a live, bidirectional invariant: a row can never persist with `is_on_site = true` while `is_loaded = false`, or `is_loaded = true` while `is_packed = false`. Un-checking an earlier stage automatically cascades false through every later stage in the same write, regardless of what was submitted.
  2. `prevent_unsafe_vendor_item_edit` re-stamps each stage's `*_at` timestamp and `*_by_profile_id` actor automatically whenever that stage's boolean changes, and **separately** raises a hard database error on any attempt to change `event_id`, `category`, `item_description`, `quantity_text`, `unit`, or `sort_order` unless the write is being made under a live, session-authenticated Bendie Planner identity with `can_manage_vendors` (technically: a non-null `auth.uid()` satisfying `can_manage_event_vendors`). Portal's established write pattern for every cross-database feature to date (Features 001, 004, 007, 008) uses a Planner service-role connection that carries no such session — so this class of edit is not achievable from Portal today without introducing a new authentication mechanism, which is explicitly out of scope for this feature (see Out of Scope). `notes` is **not** included in this guard and remains editable after creation.
  3. The same actor-derivation mechanism means the `*_by_profile_id` fields will be recorded as empty for any status change Portal makes, even though the paired timestamp is always recorded correctly. This is an accepted, documented limitation, not a defect — Feature 007's existing Tasks module has an equivalent, already-accepted actor-attribution gap in its own change notifications for the identical reason.
- **Not verified, and explicitly not claimed**: how Bendie Planner's own client application renders, filters, or further processes this data. Bendie Planner's client source is not available in this workspace. Every statement in this specification about what a Bendie Planner user sees is an expectation based on the verified data path (the same canonical table/view), not a verified UI behavior.

## Clarifications

### Session 2026-09-20/2026-09-21 (product decisions made during the Feature 009 architecture/discovery pass, prior to specification)

- Q: Of the remaining ungoverned Planner modules (Production, Logistics, Checklist, Vendors, Notifications), which is the strongest candidate for the next feature? → A: Vendors — the cleanest live RLS (no self-assignee carve-out, unlike Checklist), an existing `can_manage_vendors` flag, and no legacy/overlap risk (unlike Production's inconsistent RLS or Logistics' sprawling multi-table domain).
- Q: Should this feature support full CRUD or a narrower operation set? → A: Full CRUD was the initial intent, but live-schema verification of `prevent_unsafe_vendor_item_edit` proved that editing an existing item's core details cannot be done through Portal's established service-role write pattern. Resolution: create, status-lifecycle changes, and delete are in scope; editing an existing item's core details after creation is explicitly out of scope for this feature, to be revisited only if a future feature deliberately introduces a new Planner-side write mechanism.
- Q: When a manager reverses an earlier lifecycle stage (e.g. un-checks Packed on an item that is already Loaded), should the later stage's timestamp/actor be preserved as history or cleared? → A: Cleared. This also matches the live database's own enforced behavior (the reversal cascades through every later stage automatically), so no Portal application logic needs to special-case this.
- Q: Should Feature 009 also cover Checklist, given its near-identical table shape? → A: No. Checklist has independent semantics (event-day scoping, an owner-based view/edit exception not present for Vendors) and its own canonical table (`event_checklist_items`); it is reserved for a future feature (Feature 010) so it can be specified on its own terms rather than folded in merely because the tables look similar.

No `[NEEDS CLARIFICATION]` markers remain in this specification — every decision point raised during architecture discovery was resolved above before specification began.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An authorized viewer sees an event's vendor list (Priority: P1)

Someone with view access to Bendie Planner Vendors for an event opens the Portal event workspace and sees every vendor item for that event: what it is, its category, quantity, and how far along it is in the packed → loaded → on-site process — without needing to open Bendie Planner separately.

**Why this priority**: Without a way to see the canonical vendor data at all, nothing else in this feature has any value — this is the entry point the whole feature exists to provide.

**Independent Test**: As someone whose Planner assignment has `can_view_vendors` true, open the event's Vendors section and confirm every existing vendor item for that event is listed with its category, description, quantity, unit, and current lifecycle stage.

**Acceptance Scenarios**:

1. **Given** an event with existing vendor items and a caller with `can_view_vendors`, **When** they open the Vendors section, **Then** every item for that event is listed with its category, description, quantity/unit, and lifecycle stage.
2. **Given** an event with no vendor items yet, **When** an authorized viewer opens the Vendors section, **Then** a distinct empty-list state is shown, never confused with a loading or error state.
3. **Given** a caller with `can_view_vendors` but not `can_manage_vendors`, **When** they view the list, **Then** no create, status-change, or delete control is usable.
4. **Given** an item whose `packed_by_profile_id` (or the equivalent field for its current stage) is empty because it was last changed through Portal, **When** the viewer inspects that item, **Then** the interface does not claim any specific person performed that change.

---

### User Story 2 - An authorized manager adds a new vendor item (Priority: P1)

A manager who knows a piece of equipment or vendor-supplied item needs to be tracked for an event adds it to the vendor list directly from Portal, without needing Bendie Planner's own application.

**Why this priority**: This is the first genuinely new capability this feature provides — today, only Bendie Planner's own client can create these records at all.

**Independent Test**: As a manager with `can_manage_vendors`, create a new vendor item with a category, description, and quantity, and confirm it immediately appears in the list for both this viewer and any other authorized viewer of the same event, starting at the beginning of the lifecycle.

**Acceptance Scenarios**:

1. **Given** a manager with `can_manage_vendors`, **When** they submit a new item with at least a description, **Then** it is created against the resolved event with `packed`/`loaded`/`on-site` all false, and correctly attributed to the manager who created it.
2. **Given** a caller with only `can_view_vendors`, **When** they attempt to create an item through any route, including a direct API call, **Then** the attempt is denied.
3. **Given** a create submission missing a required field, **When** it is submitted, **Then** it is rejected with a clear, human-readable reason before anything is written.
4. **Given** an event with no active Bendie Planner link, **When** a create is attempted, **Then** it is rejected — an item can never be created against an unresolved or guessed Planner event.

---

### User Story 3 - An authorized manager advances or reverses an item's lifecycle status (Priority: P1)

As vendor equipment moves through the event's operational process, a manager marks each item Packed, then Loaded, then On-site — and can correct a mistake by reversing an earlier stage if needed.

**Why this priority**: This is the core, recurring operational value of the feature — turning a static list into a live tracking tool for event-day readiness.

**Independent Test**: As a manager, mark an item Packed, then Loaded, then On-site in sequence, confirming each transition persists; then reverse Loaded on the same item and confirm On-site is also cleared, matching the database's own enforced ordering.

**Acceptance Scenarios**:

1. **Given** an item with all stages false, **When** a manager marks it Packed, **Then** it persists as packed with a recorded timestamp.
2. **Given** an item that is Packed, **When** a manager marks it Loaded, **Then** it persists as both packed and loaded.
3. **Given** an item that is Packed and Loaded, **When** a manager marks it On-site, **Then** all three stages persist as true.
4. **Given** an item that is Packed, Loaded, and On-site, **When** a manager un-checks Packed, **Then** Loaded and On-site are also cleared, and this is reflected in what the manager sees immediately after the change — never silently left inconsistent with what was actually saved.
5. **Given** a manager attempts to mark an item On-site while it is not yet Loaded, **When** the request is processed, **Then** the resulting persisted state never has On-site true without Loaded also true, regardless of what was requested.
6. **Given** a status change made through Portal, **When** the item is viewed afterward, **Then** the stage's timestamp is present and accurate, but the interface never invents or guesses who performed the change if that information is not available.
7. **Given** a caller with only `can_view_vendors`, **When** they attempt any status change, including via a direct API call, **Then** the attempt is denied.

---

### User Story 4 - An authorized manager removes a vendor item (Priority: P2)

A manager removes a vendor item that was added in error or is no longer relevant to the event.

**Why this priority**: Necessary for a usable list over the life of an event, but less critical than being able to see, add, and track items in the first place.

**Independent Test**: As a manager, delete an existing vendor item and confirm it no longer appears for any viewer of that event.

**Acceptance Scenarios**:

1. **Given** a manager with `can_manage_vendors`, **When** they delete an item belonging to the resolved event, **Then** it is permanently removed and no longer returned by the list.
2. **Given** a caller with only `can_view_vendors`, **When** they attempt to delete an item, including via a direct API call, **Then** the attempt is denied.
3. **Given** a delete request naming an item that does not belong to the resolved event, **When** it is processed, **Then** it is rejected rather than silently deleting a different event's item.

---

### User Story 5 - Only authorized people can reach or change vendor data (Priority: P1)

An ordinary event member, an event host/organizer/admin without Vendors-specific Planner authority, or someone holding an unrelated Planner manage flag (e.g. `can_manage_tasks`), cannot view or change any event's vendor data through any route, including direct API calls.

**Why this priority**: This is the anti-escalation boundary Feature 008 exists to enforce; Feature 009 must not create a new way around it.

**Independent Test**: As an event member with no `can_view_vendors`/`can_manage_vendors` assignment, attempt to open the Vendors section and to call its API routes directly, and confirm both are denied.

**Acceptance Scenarios**:

1. **Given** a caller with no active Planner assignment for the event, or one with `can_view_vendors` and `can_manage_vendors` both false, **When** they attempt to view or change vendor data by any means, **Then** access is denied.
2. **Given** a caller's Portal event role (e.g. organizer, admin), **When** their Vendors access is evaluated, **Then** the outcome depends solely on their Planner `can_view_vendors`/`can_manage_vendors` assignment, never on that Portal role.
3. **Given** a caller who holds `can_manage_tasks` or `can_manage_checklist` but not `can_manage_vendors`, **When** they attempt to change vendor data, **Then** access is denied — a manage flag for one module never confers authority over another.
4. **Given** a request submitted directly to a Vendors API route without going through the Portal UI, **When** it is processed, **Then** the same authorization check is independently re-verified server-side and enforced identically to the UI path.

---

### User Story 6 - Vendors behaves consistently across event types (Priority: P2)

Vendors appears and works identically for an event with a Planner-only entitlement and one with Both (Bendie + Planner), and does not appear at all for a Bendie-only event.

**Why this priority**: Backward/forward compatibility with the existing product-navigation model is a hard requirement, not incidental — this feature must slot into the existing pattern rather than creating a special case.

**Independent Test**: Confirm the Vendors section is reachable and functionally identical from both a Planner-only event and a Both event, and confirm it is absent for a Bendie-only event.

**Acceptance Scenarios**:

1. **Given** a Planner-only event with an active Bendie Planner link, **When** an authorized viewer opens the event workspace, **Then** the Vendors section is present and functions as specified.
2. **Given** a Both event, **When** an authorized viewer opens the event workspace from either product origin, **Then** the Vendors section is present and behaves identically to the Planner-only case.
3. **Given** a Bendie-only event, **When** any user opens the event workspace, **Then** no Vendors section appears anywhere, and no direct Vendors URL for that event succeeds.

---

### Edge Cases

- A manager opens Vendors for an event with no active Bendie Planner link, or one in a pending/failed provisioning state: the section reflects that state using the exact vocabulary Features 005/006/007 already established (pending/stale/failed/unavailable/backend error) — never a new, Vendors-specific vocabulary.
- A manager attempts to reorder items via any exposed "sort order" affordance after an item has already been created: this is not supported — display order is fixed at creation time in this feature, since the same live constraint that blocks other detail-field edits also covers this field.
- Two managers change the same item's status at nearly the same moment: the later successful write wins, matching the existing concurrency precedent from Features 007/008; no merge, no corruption.
- A manager submits a status change alongside a request to set `packed_by_profile_id` or a timestamp directly: any such client-supplied actor/timestamp value is ignored — these are always derived from the database's own write-time behavior, never from client input.
- A manager attempts to edit an existing item's category, description, quantity, unit, or display order: the interface never presents a control implying this is possible, and a direct API attempt to do so is rejected with a clear, human-readable reason rather than a raw database error.
- A create or status-change request targets an event whose Bendie Planner link has since been deactivated: the request is rejected — no write is ever made against a stale or inactive Planner counterpart.
- An item is deleted by one manager while another manager is mid-way through changing its status: the status-change request fails cleanly (item no longer exists) rather than recreating or partially applying the change.
- A caller's underlying Planner identity cannot be resolved at all (no bridge exists yet): view/create/status-change/delete are all denied, consistent with never inferring capability from Portal identity alone.

## Requirements *(mandatory)*

### Functional Requirements

**Product / event gating**

- **FR-001**: The Vendors section MUST be available only for an event with an active Bendie Planner entitlement and an existing canonical Planner link (Planner-only or Both events); it MUST NOT be available for a Bendie-only event.
- **FR-002**: The Vendors section MUST reuse the existing product/entitlement/link/provisioning state vocabulary already established by Features 002–007 rather than introducing a second one.
- **FR-003**: Feature 003 event-workspace access MUST be established before any Vendors-specific check is evaluated.
- **FR-004**: Vendors MUST be reachable from within the existing Planner-classified event workspace as its own section, alongside Overview and Tasks — not as a new top-level product-navigation surface.

**Authorization**

- **FR-005**: Viewing the Vendors section and its data for an event MUST require the caller's Planner assignment for that event to have `can_view_vendors` true (or an equivalent platform-admin/Planner-org-admin standing).
- **FR-006**: Creating, changing the status of, or deleting a vendor item MUST require the caller's Planner assignment for that event to have `can_manage_vendors` true (or the equivalent admin standing); `can_view_vendors` alone MUST NOT be sufficient for any mutation.
- **FR-007**: No Portal event role (host, organizer, admin, facilitator, staff, speaker, attendee) MAY, by itself, confer or deny Vendors view or manage authority.
- **FR-008**: No Planner permission flag belonging to a different module (e.g. `can_manage_tasks`, `can_manage_checklist`) MAY confer Vendors authority.
- **FR-009**: Every read and write operation exposed by this feature MUST independently re-verify FR-005/FR-006 server-side, regardless of what the UI does or does not display.
- **FR-010**: This feature MUST NOT create, change, or otherwise administer `can_view_vendors`/`can_manage_vendors` for any person — those flags remain exclusively Feature 008's responsibility.
- **FR-011**: A change made to a person's `can_view_vendors`/`can_manage_vendors` assignment through Feature 008 MUST take effect for this feature on the very next request, without this feature maintaining any separate cached or duplicated copy of that permission state.

**Canonical data**

- **FR-012**: This feature MUST operate directly against Bendie Planner's existing `event_vendor_items` records; it MUST NOT create or maintain a Portal-side vendor table of any kind.
- **FR-013**: This feature MUST NOT introduce any synchronization, copy, or replication job between Portal and Planner for vendor data — every read and write is made directly against the canonical record at the moment it is needed.
- **FR-014**: This feature MUST NOT require or introduce any Bendie Planner schema change (no new table, column, function, or trigger).
- **FR-015**: Every Planner event a Vendors operation touches MUST be resolved server-side from the Portal event's canonical, currently-active Planner link; a Planner event identifier supplied directly by the caller MUST never be trusted or accepted.

**View**

- **FR-016**: The Vendors list MUST show, at minimum, each item's category, description, quantity, unit, and current lifecycle stage (packed/loaded/on-site), scoped strictly to the resolved event.
- **FR-017**: Opening the Vendors section MUST NOT, by itself, create, modify, or delete any vendor item.
- **FR-018**: The Vendors list MUST reflect an explicit, deliberately-selected set of fields; it MUST NOT expose the entire underlying record indiscriminately.
- **FR-019**: Raw internal identifiers (the item's database key, the Planner event's internal identifier, a raw profile identifier) MUST NOT be shown in the interface where a human-readable equivalent (a name, a label) is available or no identifier is needed at all.
- **FR-020**: A caller with `can_view_vendors` but not `can_manage_vendors` MUST see the same list as a manager, with every mutation control absent or unusable.

**Create**

- **FR-021**: A manager MUST be able to create a new vendor item for the resolved event, supplying at minimum a description, and optionally a category, quantity, and unit.
- **FR-022**: A newly created item MUST begin with every lifecycle stage (packed, loaded, on-site) false.
- **FR-023**: A newly created item's creating-actor attribution MUST be set to the correctly resolved Bendie Planner identity of the acting Portal user, wherever that identity bridge already exists.
- **FR-024**: Item creation MUST be rejected, with a clear and human-readable reason, when a required field is missing or invalid — never partially created.
- **FR-025**: Item creation MUST be rejected for an event with no active Bendie Planner link, or for an event the caller does not have workspace access to.
- **FR-026**: A caller's `sort_order`/creation-time value MUST be accepted as an initial value only; this feature provides no mechanism to change it afterward (see FR-041).

**Status lifecycle**

- **FR-027**: A manager MUST be able to mark a vendor item Packed, Loaded, or On-site.
- **FR-028**: The system MUST NOT allow a persisted state where On-site is true while Loaded is false, or Loaded is true while Packed is false — this feature's own application logic MUST NOT attempt to independently re-implement, second-guess, or bypass this ordering, since it is already enforced at the point of write regardless of what is submitted.
- **FR-029**: Reversing an earlier lifecycle stage on an item that has already progressed further MUST result in every later stage also becoming false in the same operation.
- **FR-030**: After any status-lifecycle change, the interface MUST reflect the actual, currently-persisted combination of stages and timestamps — never an assumption that the exact combination requested was the exact combination saved.
- **FR-031**: Each lifecycle stage's timestamp MUST be accurately recorded at the moment that stage becomes true, and cleared when that stage becomes false (directly or via FR-029's cascade).
- **FR-032**: The interface MUST NOT claim that a specific named person performed a status change when that attribution is not genuinely available; it MUST represent this honestly (for example, by omitting the attribution) rather than defaulting to a fabricated or misleading label.
- **FR-033**: This feature MUST NOT introduce a new authentication or identity-impersonation mechanism in order to make actor attribution for status changes appear more complete than it genuinely is.
- **FR-034**: A status-lifecycle change MUST be rejected for an item that does not belong to the resolved event, or for an event with no active Bendie Planner link.

**Delete**

- **FR-035**: A manager MUST be able to permanently remove a vendor item belonging to the resolved event.
- **FR-036**: A delete request MUST be rejected, without effect, if the named item does not belong to the resolved event.
- **FR-037**: This feature MUST NOT introduce a soft-delete, archive, or recovery mechanism beyond what the canonical table already provides (none).

**Explicit non-editability of core details**

- **FR-038**: This feature MUST NOT provide any way, through the UI or its API, to change an existing vendor item's category, description, quantity, unit, or initial display order after creation.
- **FR-039**: A direct API attempt to change any field named in FR-038 MUST be rejected with a clear, human-readable reason; it MUST NOT surface a raw database error message to the caller.
- **FR-040**: This feature MUST NOT introduce a new Planner-side authorization mechanism, a privileged bypass function, or any form of session impersonation in order to make the edits described in FR-038 possible.
- **FR-041**: An item's free-text notes field MAY be treated as editable after creation, since it is not subject to the same constraint as the fields in FR-038 — see Assumptions for how this specification resolves that distinction.

**Members / workspace integration**

- **FR-042**: The Vendors section MUST be presented using the same visual and interaction conventions already established by the Planner Overview and Planner Tasks sections, rather than introducing a new pattern.
- **FR-043**: The Vendors section MUST NOT require any change to the event workspace's existing top-level navigation model.
- **FR-044**: The Vendors section's visibility as a workspace tab MUST be independently re-derived server-side and MUST NOT rely on any client-side-only visibility check for its security guarantee (FR-009 restated in the navigation context).

**Feature compatibility**

- **FR-045**: This feature MUST NOT change how Feature 007 (Planner Tasks) or Feature 005 (Planner Overview) read or present their own data.
- **FR-046**: This feature MUST NOT change Feature 006's product-navigation resolution logic; it MUST integrate as an additional Planner-classified section within that existing model.
- **FR-047**: This feature MUST NOT change how Feature 008 stores, derives, or exposes `can_view_vendors`/`can_manage_vendors`.

### Security Requirements

- **SR-001**: A caller whose Planner assignment lacks `can_view_vendors` MUST be denied both read and write access to that event's vendor data.
- **SR-002**: A caller whose Planner assignment has `can_view_vendors` but not `can_manage_vendors` MUST be denied every mutation (create, status change, delete).
- **SR-003**: No Portal event role MAY substitute for the FR-005/FR-006 checks (restates FR-007 as a security boundary).
- **SR-004**: No manage flag belonging to a different Planner module MAY substitute for `can_manage_vendors` (restates FR-008).
- **SR-005**: All Vendors operations MUST be scoped to a single resolved event; a request naming or implying a different event's data MUST be rejected.
- **SR-006**: A client MUST NOT be able to submit an arbitrary Planner event identifier; the canonical event MUST always be resolved server-side via the existing `event_planner_links` mechanism.
- **SR-007**: A client MUST NOT be able to submit an arbitrary Planner profile identifier for item attribution; the acting user's Planner identity MUST always be resolved server-side via the existing identity bridge.
- **SR-008**: A client MUST NOT be able to submit a lifecycle timestamp or a `*_by_profile_id` value directly; these are always derived from server-side/database write-time behavior, never accepted as client input.
- **SR-009**: Every mutation exposed by this feature MUST independently re-verify SR-001/SR-002 authorization on the server immediately before acting, regardless of any prior client-side or page-level check.
- **SR-010**: Bendie Planner service-role credentials MUST never be reachable from the browser at any point in this feature's flows.
- **SR-011**: A stale or replayed mutation request MUST be evaluated against current server-side state at the time it is processed, not against any client-cached state; last-write-wins is the accepted concurrency behavior.
- **SR-012**: API responses from this feature's routes MUST NOT include raw Planner database error text, stack traces, or any field outside an explicit, documented, safe allowlist.
- **SR-013**: This feature MUST NOT introduce any mechanism (a minted token, a session-claim override, or otherwise) that allows a Portal-originated request to present itself to Bendie Planner as a specific authenticated Planner user.
- **SR-014**: Direct-URL access to the Vendors section or its API routes MUST enforce exactly the same authorization outcome as the tab-visibility check; visibility hiding MUST NOT be treated as a security control on its own.

### Key Entities

- **Vendor Item** (`event_vendor_items`, existing, Planner-owned, now writable by this feature): the per-event vendor/equipment record — category, description, quantity, unit, three lifecycle flags with paired timestamp/actor fields, notes, and creation attribution. Remains the sole authoritative source of vendor data; this feature never duplicates it.
- **Planner Event Assignment** (`event_user_assignments`, existing, Feature 008-owned): the source of `can_view_vendors`/`can_manage_vendors` for the caller. This feature only ever reads it.
- **Event Planner Link** (`event_planner_links`, existing, Feature 004-owned): the canonical mapping this feature uses, unmodified, to resolve a Portal event to its Planner counterpart.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of authorized viewers can see an event's complete, current vendor list, matching the canonical Planner data, without needing to open Bendie Planner separately.
- **SC-002**: 100% of tested access attempts by a caller without the required `can_view_vendors`/`can_manage_vendors` flag — including via direct API calls — are denied, regardless of that caller's Portal event role.
- **SC-003**: 100% of tested lifecycle-status changes result in a persisted state consistent with the packed → loaded → on-site ordering, with zero instances of a later stage persisting true while an earlier one is false.
- **SC-004**: 100% of tested attempts to edit an existing item's category, description, quantity, unit, or display order are cleanly rejected with a human-readable message, with zero raw database errors surfaced to any caller.
- **SC-005**: 100% of vendor items created through Portal are correctly attributed to their creating manager and are visible through Bendie Planner's own existing data path with no additional synchronization step or delay.
- **SC-006**: 0% of tested attempts to submit a client-supplied Planner event identifier, actor identifier, or timestamp are honored by the server.
- **SC-007**: 100% of tested scenarios across Planner-only and Both events produce identical Vendors behavior; 100% of tested Bendie-only events show no Vendors section and no successful direct Vendors route access.

## Assumptions

- `event_vendor_items`'s `notes` field, verified to be outside the scope of the live edit-blocking trigger that covers category/description/quantity/unit/sort-order, is treated as editable after creation in this feature — a small, low-risk, additive capability beyond the fields explicitly discussed during architecture discovery, included because it is safely supported by the live schema today and adds no new risk or complexity. If this is not wanted, it can be removed from scope during planning without affecting any other requirement.
- The exact visual placement and interaction design of the Vendors section (list layout, creation form presentation, status controls) is a planning-level decision, so long as FR-042–FR-044 hold and it matches the established Planner Tasks/Overview conventions.
- "Manager" and "Viewer" in this specification refer purely to the presence of `can_manage_vendors`/`can_view_vendors` on the caller's Planner assignment for the specific event in question — not to any Portal-side role label.
- The live Planner schema facts recorded in Context reflect the current production Planner database as of 2026-09-21 and are treated as authoritative ground truth for this specification, consistent with how Feature 008's specification treated its own live-schema findings.
- Editing an existing item's core details (category, description, quantity, unit, sort order) remaining unsupported is treated as an acceptable, permanent-for-this-feature limitation, not a temporary gap this feature must work around; a future feature may revisit it only if it deliberately introduces a new, reviewed Planner-side write mechanism.

## Dependencies

- **Feature 001** — the Portal↔Planner identity bridge, reused unmodified to resolve the acting Portal user's Planner profile for view/create/status-change/delete authorization and creation attribution.
- **Feature 003** — event-workspace access as the access floor beneath this feature's own authorization check.
- **Feature 004** — `event_planner_links`, the sole mechanism for resolving an event's canonical Planner counterpart.
- **Feature 005** — the established provisioning-state vocabulary this feature reuses rather than duplicating.
- **Feature 006** — product-context gating and the event-workspace section model this feature's Vendors tab integrates into.
- **Feature 007** — the direct structural precedent for this feature's route/page/data-access architecture; left entirely unmodified.
- **Feature 008** — the sole, authoritative source of `can_view_vendors`/`can_manage_vendors`; this feature has a hard read-only dependency on it and must never duplicate or bypass it.

## In Scope

- Viewing an event's vendor list, scoped to the resolved Planner event, gated on `can_view_vendors`.
- Creating a new vendor item, gated on `can_manage_vendors`.
- Advancing or reversing an item's packed/loaded/on-site lifecycle status, gated on `can_manage_vendors`, honoring the database's own enforced ordering and cascade behavior.
- Editing an existing item's notes, gated on `can_manage_vendors` (see Assumptions).
- Deleting a vendor item, gated on `can_manage_vendors`.
- Integration into the existing Planner-classified event workspace as its own section, for both Planner-only and Both events.
- Server-side, independently-re-verified authorization on every read and write, matching Features 007/008's established pattern exactly.

## Out of Scope

- Editing an existing vendor item's category, description, quantity, unit, or display order after creation, for the verified live-database reasons described in Context.
- Any Bendie Planner schema change of any kind (new table, column, function, or trigger).
- Any Portal-side vendor storage, cache, or synchronization job.
- Any new authentication, session-impersonation, or Planner-identity-minting mechanism.
- Checklist, Production, Logistics, Notifications, or Agenda management of any kind (Checklist is explicitly reserved for a future feature against its own canonical table).
- Administration of `can_view_vendors`/`can_manage_vendors` themselves (remains exclusively Feature 008's responsibility).
- Any historical/audit-trail system for vendor changes beyond the timestamp/actor fields already present on the canonical table.
- Any new top-level product-navigation surface or broad navigation redesign.
- Any broad Portal visual/design-system redesign (deferred until after Feature 010).
- Any change to Bendie event (non-Planner) functionality.
