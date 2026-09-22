# Feature Specification: Product-Level Navigation & Product-Aware Event Discovery

**Feature Branch**: `006-product-navigation-event-discovery`

**Created**: 2026-09-16

**Status**: Draft

**Input**: User description: "Bendie Portal now supports two distinct products — Bendie (attendee-facing event experience) and Bendie Planner (planning/operations experience). Organization-level event discovery still behaves like the original single-product Portal and gives no clear product context. Introduce explicit product-level navigation and product-aware event discovery so a user always knows whether they are currently using Bendie or Bendie Planner, without breaking any of Features 001–005's existing contracts."

## Context

Feature 002 established the product-entitlement model (`organization_products`, `event_products`). Feature 003 established organization selection and event-workspace authorization. Feature 004 made event creation product-aware (Bendie / Planner / Both) and added real Planner provisioning. Feature 005 added the first Planner-facing screen (Planner Overview) and a narrow default-landing fix for Planner-only events, but left the rest of the Portal's navigation exactly as it was before either product existed: organization-level Events/Overview show every event in the organization regardless of which product(s) it uses, and there is no user-facing way to declare "I am using Bendie" versus "I am using Bendie Planner."

This was surfaced concretely during Feature 005's own manual verification: a Bendie-only event ("Stawi Escape") and a Planner-only event ("Stawi Escape — Planner Test") appeared side by side in one undifferentiated event list, with nothing distinguishing which product each belonged to until it was opened.

A preceding architecture-discovery pass (this session, `/architect`) and a Final Architecture Decision Record resolved every genuinely open product-level design question for this feature before this specification was written. Those decisions are treated here as settled inputs, not open questions:

1. **URL strategy**: explicit product namespaces (`/portal/bendie/...`, `/portal/planner/...`) at the organization/product discovery level; the existing event-workspace route structure (`/portal/events/[eventId]/...`) is preserved unchanged and not renamed.
2. **Both-event landing**: context-dependent — determined by which product namespace the user most recently came from, with the pre-existing Feature 005 default (Bendie dashboard) preserved as the fallback whenever no such originating context exists.
3. **Default product**: Bendie-only entitlement → Bendie; Planner-only entitlement → Planner; both active → Bendie (chosen specifically to minimize behavioral change for the existing, predominantly Bendie-only customer base).
4. **Mismatched product context**: a friendly, deterministic redirect into the event's actual valid product experience — never a fake blocked/not-found state, and never a bypass of existing authorization.
5. **Persistence**: no database persistence of the selected product in this feature; the URL is authoritative at the product-discovery level, and a lightweight (mechanism decided during planning) explicit signal carries the originating product context across the transition into the existing event-workspace routes.

## Clarifications

### Session 2026-09-17

- Q: When a user is on an organization-global page (People, Assets, Teams, Activity Log, or Settings) while their current product context is Bendie or Planner, should that page stay on its existing neutral URL, or also become reachable under the product-specific URL namespace? → A: Shared pages stay at their existing neutral URL only; no product-namespaced equivalents are created.
- Q: If a user deliberately switches product via the product switcher while already inside an event's workspace, what should happen? → A: If the current event supports the target product, switch directly into that event's corresponding workspace (Bendie dashboard ⇄ Planner Overview) without leaving the event; otherwise take the user to the target product's event discovery list.
- Q: If a user switches their selected organization while inside an event's workspace belonging to the organization they're leaving, where should they land? → A: The newly selected organization's resolved product home, per the existing default/fallback rules — exactly as if they had freshly opened the Portal for that organization.
- Q: What should happen to the existing, pre-Feature-006 `/portal` and `/portal/events` organization-level routes once product-specific routes exist? → A: Redirect to the user's resolved default product context (home or events, matching the path visited), rather than continuing to render an unfiltered, product-agnostic organization view.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Knowing and choosing which product you're using (Priority: P1)

An organization member opens the Portal and can immediately tell, and explicitly choose, whether they are working in Bendie or Bendie Planner — reflecting only the products their organization actually has active.

**Why this priority**: This is the entire premise the feature exists to deliver. Without a real, truthful product switcher, none of the other stories have anywhere to originate from.

**Independent Test**: As a member of an organization with both products actively entitled, open the Portal, confirm the current product context is visibly identifiable, and confirm switching between Bendie and Bendie Planner is possible and reflects the organization's real entitlement — never offering a product the organization does not own, never hiding one it does.

**Acceptance Scenarios**:

1. **Given** an organization with only Bendie actively entitled, **When** a member opens the Portal, **Then** they land in the Bendie product context and are not offered Bendie Planner as a destination.
2. **Given** an organization with only Bendie Planner actively entitled, **When** a member opens the Portal, **Then** they land in the Bendie Planner product context and are not offered Bendie as a destination.
3. **Given** an organization with both products actively entitled, **When** a member opens the Portal, **Then** they land in the Bendie product context by default and can deliberately switch to Bendie Planner.
4. **Given** an organization whose entitlement to a product is present but inactive, **When** the switcher is inspected, **Then** that product is not offered, identically to an organization that never had the entitlement at all.
5. **Given** an organization with no active product entitlement at all, **When** a member opens the Portal, **Then** they see a safe, explicit no-product state — never a Portal that silently pretends either product is available.
6. **Given** a platform administrator viewing any organization, **When** the switcher is inspected, **Then** it reflects that organization's real active entitlements, never inflated by the administrator's own cross-tenant access.

---

### User Story 2 - Each product only shows its own events (Priority: P1)

A user working within a chosen product context sees only the events that actually use that product — a Bendie user never mistakes a Planner-only event for a Bendie event, and vice versa; an event using both products appears correctly in each.

**Why this priority**: This is the concrete problem the feature was commissioned to fix, and it is the primary source of user confusion today.

**Independent Test**: As a member of an organization holding a Bendie-only event, a Planner-only event, and (once available) a Both event, view event discovery from each product context in turn and confirm each event appears only where its own product usage says it should.

**Acceptance Scenarios**:

1. **Given** a Bendie-only event, **When** it is viewed from the Bendie product context, **Then** it appears; **When** viewed from the Planner product context, **Then** it does not appear.
2. **Given** a Planner-only event, **When** it is viewed from the Planner product context, **Then** it appears; **When** viewed from the Bendie product context, **Then** it does not appear.
3. **Given** an event using both products, **When** it is viewed from either product context, **Then** it appears in both.
4. **Given** any product context, **When** its event count, summary statistics, or empty-state message are inspected, **Then** every one of them is derived from that same product-filtered event set, never from the organization's full unfiltered event list.
5. **Given** a product context is still loading its event data, **When** the page is inspected during that loading window, **Then** no event belonging to the other product is ever visibly rendered, even momentarily.

---

### User Story 3 - Opening an event lands you in the right workspace for how you got there (Priority: P1)

A user who opens an event from within a product context lands in that event's corresponding workspace — the Bendie dashboard from the Bendie context, Planner Overview from the Planner context — including for an event that uses both products.

**Why this priority**: Without this, product-aware discovery would show the right list but then defeat itself the moment the user actually clicks into an event.

**Independent Test**: As an authorized event member, open a Both event from the Bendie product context and confirm it opens the Bendie dashboard; open the same event from the Planner product context and confirm it opens Planner Overview instead.

**Acceptance Scenarios**:

1. **Given** a Bendie-only event opened from the Bendie product context, **When** it opens, **Then** the Bendie workspace/dashboard is shown.
2. **Given** a Planner-only event opened from the Planner product context, **When** it opens, **Then** Planner Overview is shown.
3. **Given** a Both event opened from the Bendie product context, **When** it opens, **Then** the Bendie workspace/dashboard is shown.
4. **Given** the same Both event opened from the Planner product context, **When** it opens, **Then** Planner Overview is shown.
5. **Given** the same Both event reached by a direct URL with no originating product context at all, **When** it opens, **Then** it lands on the Bendie dashboard, exactly as it did before this feature (Feature 005's existing default, preserved).

---

### User Story 4 - An event is never presented as the wrong product, but you're never faked out either (Priority: P2)

A user who reaches an event that does not use their current product context (for example, clicking a stale link to a Planner-only event while in the Bendie context) is taken to that event's actual, valid product experience — never shown it as though it were the product they came from, and never shown a fake "not found" purely because of the mismatch. A user who genuinely lacks access is still denied, exactly as today.

**Why this priority**: This is what makes the strict per-product filtering in Story 2 safe to rely on elsewhere in the product without creating confusing dead ends for events a user legitimately has access to but reached from the "wrong side."

**Independent Test**: As an authorized event member, reach a Planner-only event's URL while the Bendie product context is active and confirm you land in that event's Planner experience rather than a blocked or mismatched state; separately, attempt the same reach as a user with no workspace access to that event and confirm the existing denial still applies unchanged.

**Acceptance Scenarios**:

1. **Given** an authorized event member in the Bendie product context, **When** they reach a Planner-only event, **Then** they are taken into that event's Planner experience, not shown a blocked state.
2. **Given** an authorized event member in the Planner product context, **When** they reach a Bendie-only event, **Then** they are taken into that event's Bendie experience, not shown a blocked state.
3. **Given** a user who does not hold the existing event-workspace access this codebase already requires, **When** they attempt either of the above, **Then** they are denied exactly as they would be today, regardless of product context or any redirect rule.

---

### User Story 5 - Old links and bookmarks keep working (Priority: P2)

A user who has an existing bookmark or shared link to `/portal/events/[eventId]/...` from before this feature shipped continues to reach exactly the same place they always did.

**Why this priority**: Product-aware navigation must not become a breaking change for every link anyone has ever saved or shared.

**Independent Test**: Using a saved event URL with no product-context signal attached, confirm the resulting landing behavior is identical to this codebase's pre-Feature-006 behavior for that event's product mix.

**Acceptance Scenarios**:

1. **Given** a legacy/bookmarked URL to a Bendie-only event with no product-context signal, **When** it is opened, **Then** it behaves exactly as before this feature.
2. **Given** the same for a Planner-only event, **When** it is opened, **Then** it behaves exactly as before this feature (Planner Overview, per Feature 005).
3. **Given** the same for a Both event, **When** it is opened, **Then** it lands on the Bendie dashboard, exactly as before this feature.

---

### User Story 6 - Switching organization doesn't strand you in an impossible product (Priority: P2)

A user who switches their selected organization while using one product either keeps using that same product (if the new organization supports it), is deterministically moved to the other one it does support, or is shown the no-product state — never left in, or bounced between, a product the new organization doesn't have.

**Why this priority**: Organization switching already exists (Feature 003); this feature must not let it interact badly with the new, independent product axis.

**Independent Test**: While in the Planner product context for Organization A, switch to Organization B, which lacks Planner but has Bendie active, and confirm a deterministic, single fallback to Bendie occurs with no stale Organization-A event data shown and no redirect loop.

**Acceptance Scenarios**:

1. **Given** the current product remains actively available in the newly selected organization, **When** the switch completes, **Then** the same product context is preserved.
2. **Given** the current product is Planner and the newly selected organization has only Bendie active, **When** the switch completes, **Then** the user lands in Bendie.
3. **Given** the current product is Bendie and the newly selected organization has only Planner active, **When** the switch completes, **Then** the user lands in Planner.
4. **Given** the newly selected organization has no active product entitlement, **When** the switch completes, **Then** the no-product state is shown.
5. **Given** any of the above, **When** the transition is inspected, **Then** no event from the previously selected organization or product is ever displayed, and no redirect loop occurs.

---

### Edge Cases

- An organization member creates a new event from within the Bendie product context: the creation flow's product selection defaults to Bendie but the member remains free to choose Planner or Both if the organization is entitled to them (Feature 004's existing selection rules are unchanged).
- The same, opened from the Planner product context: defaults to Planner, same freedom to choose otherwise preserved.
- An organization member without an explicit `event_members` row for an event they can otherwise see in product-aware discovery attempts to open it: denied, exactly as Feature 003 already requires — product context changes nothing about this.
- A cross-tenant user attempts to reach an event belonging to an organization/product context they have no relationship to: denied.
- A platform administrator opens any product context for any organization: the switcher still reflects that organization's real entitlement; the administrator's own access override is a separate, unrelated mechanism from what the switcher displays.
- An organization's Bendie (or Planner) entitlement is deactivated while a user is actively viewing that product's discovery experience: the next data read reflects the new state — the tab/route becomes unavailable, consistent with how this codebase already re-derives product availability on every load rather than caching a decision.
- A user rapidly switches product, then organization, then product again in quick succession: only the most recent selection's data is ever applied to the visible view; any slower, now-superseded request is discarded rather than allowed to overwrite newer state.
- A direct URL to `/portal/bendie/events` (or `/portal/planner/events`) is opened for an organization that does not actually have that product actively entitled: treated the same as attempting to switch into an unavailable product — never silently rendered as if it were available.
- A genuine backend/read failure occurs while resolving product availability or product-filtered events: presented as a distinct, safe failure state, never silently collapsed into "no events"/"no product" as though that were a legitimate, successful read.
- A browser back/forward navigation crosses between two different previously-visited product contexts: the resulting view matches the product context named in that history entry, not whichever was selected most recently elsewhere.
- A user opens People, Assets, Teams, Activity Log, or Settings while in the Bendie or Planner product context: the page renders at its existing neutral URL and does not acquire a product-namespaced address.
- A user inside a Both event's Bendie workspace deliberately switches to Planner via the product switcher: they land on that same event's Planner Overview, never on the Planner event discovery list.
- A user inside a Bendie-only event's workspace deliberately switches to Planner via the product switcher, and the organization is also Planner-entitled: they land on the Planner product's event discovery list, not on a Planner view of the Bendie-only event.
- A user switches organization while inside an event workspace belonging to the organization being left: they land on the newly selected organization's resolved product home, and the previous organization's event is no longer displayed.
- A user opens a bookmarked `/portal` or `/portal/events` URL: they are redirected into their resolved default product context rather than seeing an unfiltered, product-agnostic organization view.
- An organization actively owns Planner but currently has zero Planner events: Planner remains available in the switcher and its event list shows a normal empty state, distinct from the no-product state.
- A platform administrator manually types a product route for an organization that does not actively own that product: they see the same no-product-state truth an ordinary member of that organization would see, not a fabricated entitlement.

## Requirements *(mandatory)*

### Functional Requirements — Product context and its authority

- **FR-001**: The system MUST provide two distinct product-level navigation contexts, Bendie and Bendie Planner, at the organization-scoped discovery level, each addressable by its own explicit URL namespace.
- **FR-002**: The active product-level URL namespace MUST be the sole authoritative source of the user's current product context on product-level pages; no other client-side state (a React context value, cached profile data, browser storage) may report a current product that disagrees with it.
- **FR-003**: Every existing event-workspace route (`/portal/events/[eventId]/...`) MUST remain reachable and behave correctly; this feature MUST NOT rename, relocate, or duplicate that route structure.
- **FR-004**: Product-level navigation MUST NOT itself grant, imply, or substitute for any data-access authorization; every existing authorization check (event-workspace access, product entitlement, organization isolation) MUST be independently and identically enforced regardless of the user's current product context.

### Functional Requirements — Product switcher and entitlement

- **FR-005**: Product availability for the currently selected organization MUST be derived strictly from that organization's active (`is_active = true`) `organization_products` rows.
- **FR-006**: `event_planner_links`'s existence or state MUST NOT be used to determine, or influence the determination of, product availability.
- **FR-007**: The mere existence of one or more events using a given product MUST NOT, by itself, be used to determine product availability.
- **FR-008**: An inactive product entitlement MUST be treated identically to the complete absence of that entitlement — it MUST NOT be offered as available.
- **FR-009**: When an organization has exactly one active product, the switcher MUST reflect only that product, not offer a second, unavailable one.
- **FR-010**: When an organization has both products actively entitled, the user MUST be able to deliberately switch between them.
- **FR-011**: When an organization has no active product entitlement, the system MUST present an explicit, safe no-product state instead of defaulting into either product namespace.
- **FR-012**: The switcher's displayed availability for a given organization MUST reflect that organization's real active entitlements even when the viewer holds a platform-administrator override — the override MUST NOT cause the switcher to claim ownership of a product the organization does not actually have.

### Functional Requirements — Default product and organization switching

- **FR-013**: A Bendie-only-entitled organization MUST default new sessions to the Bendie product context.
- **FR-014**: A Planner-only-entitled organization MUST default new sessions to the Planner product context.
- **FR-015**: A Both-entitled organization MUST default new sessions to the Bendie product context.
- **FR-016**: An organization with no active product entitlement MUST default new sessions to the no-product state.
- **FR-017**: When the selected organization changes, the system MUST re-derive product availability for the newly selected organization rather than assuming the previous organization's availability still applies.
- **FR-018**: If the currently selected product remains actively available in the newly selected organization, it MUST be preserved across the organization switch.
- **FR-019**: If the currently selected product is not available in the newly selected organization, the system MUST deterministically fall back to whichever single product the new organization does actively have (or to the no-product state if it has neither), rather than leaving the user in an unavailable product context.
- **FR-020**: An organization or product transition MUST NOT be capable of entering a repeating redirect cycle.
- **FR-021**: This feature MUST NOT introduce any new database persistence of the user's selected product as part of satisfying FR-017–FR-020.

### Functional Requirements — Product-aware event discovery

- **FR-022**: Within the Bendie product context, event discovery MUST include every event whose product usage (`event_products`) currently includes an active Bendie entry, and MUST exclude every event whose product usage does not.
- **FR-023**: Within the Planner product context, event discovery MUST include every event whose product usage currently includes an active Planner entry, and MUST exclude every event whose product usage does not.
- **FR-024**: `event_products` MUST be the sole source of truth for whether an event belongs to a given product's discovery experience.
- **FR-025**: `event_planner_links`'s existence or state MUST NOT be used to determine, or influence the determination of, whether an event belongs to Bendie Planner's discovery experience.
- **FR-026**: Product-based event filtering MUST occur as part of the data-retrieval step itself, not as a post-fetch client-side hide/show applied over an unfiltered result set.
- **FR-027**: Every event count, summary statistic, dashboard figure, and empty-state message shown within a product context MUST be derived from that same product-filtered event set.
- **FR-028**: No event belonging to a product other than the one currently selected may be visibly rendered, even momentarily, while the correct product context's data is still loading.
- **FR-029**: Every event-column read this feature performs MUST continue to use an explicit, safe column list; this feature MUST NOT introduce or reintroduce a wildcard (`select('*')`) read against `events`.

### Functional Requirements — Bendie and Planner product experience

- **FR-030**: The Bendie product experience MUST NOT alter the behavior of any existing Bendie event-workspace section.
- **FR-031**: The Planner product experience's event-workspace entry point remains exactly the existing Feature 005 Planner Overview; this feature MUST NOT add any further Planner operational module or section.
- **FR-032**: The Bendie product home MUST NOT display information derived from a Planner-only event.
- **FR-033**: The Planner product home MUST NOT display information derived from a Bendie-only event.

### Functional Requirements — Event entry, Both-event landing, mismatches, legacy compatibility

- **FR-034**: Entering an event from a product-aware discovery surface MUST preserve which product context the user came from through the transition into that event's existing workspace route, in a way that survives a full page reload, participates correctly in browser back/forward navigation, and can be shared/deep-linked — without requiring any new database persistence of product selection.
- **FR-035**: For an event whose product usage includes both Bendie and Planner, arriving from the Bendie product context MUST land the user on that event's Bendie workspace/dashboard.
- **FR-036**: For the same kind of event, arriving from the Planner product context MUST land the user on Planner Overview.
- **FR-037**: For the same kind of event reached with no originating-product signal present at all (a direct URL, an old bookmark, a shared link predating this feature), the system MUST preserve exactly Feature 005's existing default: landing on the Bendie dashboard.
- **FR-038**: If an otherwise-authorized user reaches an event that does not use the product context they most recently came from, the system MUST redirect them into that event's actual valid product experience rather than presenting it as belonging to the mismatched context, and rather than showing a not-found/blocked state purely because of the mismatch.
- **FR-039**: The redirect described in FR-038 MUST NOT be applied, and access MUST be denied exactly as it is today, whenever the user does not independently satisfy this codebase's existing event-workspace authorization requirement.
- **FR-040**: Every `/portal/events/[eventId]/...` URL that worked before this feature MUST continue to work afterward, including when reached with no product-context signal at all.
- **FR-041**: This feature MUST NOT require any existing saved or bookmarked event link to be reissued or rewritten in order to keep working.

### Functional Requirements — Event creation

- **FR-042**: Opening the event-creation flow from within a specific product context MAY pre-select that product as the initial choice, but MUST leave every other product combination the organization is actually entitled to (per Feature 004's existing rules) fully selectable.
- **FR-043**: This feature MUST NOT alter Feature 004's event-creation authorization, entitlement validation, Planner-provisioning orchestration, idempotency, mapping-resolution, or failure-handling behavior in any way.
- **FR-044**: The product context the creation flow was opened from MUST NOT be submitted as the event's product selection without the user's own opportunity to change it — the pre-selection is a default, never a value the user is prevented from altering before submitting.

### Functional Requirements — Shared organization surfaces, no-product state, races

- **FR-045**: The organization-level People, Assets, Teams, Activity Log, and Settings surfaces remain organization-global; this feature does not filter or duplicate them per product.
- **FR-046**: The organization-level Overview/Events experience becomes product-aware exactly as described in FR-022–FR-029; no other existing organization-level surface's data scope changes as a result of this feature.
- **FR-047**: The no-product state MUST NOT imply either product is available, MUST NOT expose product-specific event discovery, and MUST NOT be capable of entering a redirect loop between the two product namespaces.
- **FR-048**: A user in the no-product state MUST still be able to reach organization-global surfaces their existing authorization already permits.
- **FR-049**: Rapid or interrupted organization and/or product switching MUST never result in event data from a superseded organization or product selection being displayed as though it were current; a data request that resolves after a newer selection has already superseded it MUST be discarded rather than applied.
- **FR-050**: Any new authorization or product-availability check this feature introduces MUST independently re-verify its answer from a live data read, and MUST distinguish a genuine query/read failure from a legitimate "not available" result — a failure MUST NOT be treated the same as a successful negative read.

### Functional Requirements — Clarification-derived (product home semantics, in-event switching, org-switch landing, legacy routes)

- **FR-051**: Organization-global surfaces (People, Assets, Teams, Activity Log, Settings) MUST remain reachable only at their existing neutral URLs; this feature MUST NOT create product-namespaced duplicates of them.
- **FR-052**: Deliberately switching product context while inside an event's workspace, where that event's product usage includes the target product, MUST transition directly into that event's corresponding workspace (Bendie workspace/dashboard or Planner Overview) without leaving the event.
- **FR-053**: Deliberately switching product context while inside an event's workspace, where that event's product usage does not include the target product, MUST take the user to the target product's event discovery list instead of attempting to force the current event into that product.
- **FR-054**: Switching the selected organization while inside an event workspace belonging to the organization being left MUST land the user on the newly selected organization's resolved product home (per FR-013–FR-019's default/fallback rules), and MUST NOT continue to display the previous organization's event.
- **FR-055**: The existing `/portal` and `/portal/events` organization-level routes MUST redirect to the user's resolved default product context (home or events, matching the path visited) rather than continuing to render an unfiltered, product-agnostic organization view.
- **FR-056**: A product root route (e.g., `/portal/bendie`) MUST render that product's filtered home/overview experience, distinct from that product's full filtered event list rendered at its events route (e.g., `/portal/bendie/events`); these are two distinct pages, never the same content at two URLs.
- **FR-057**: An organization that actively owns a product but currently has zero events using that product MUST be treated as a normal empty state — the product remains available and its home/event-list renders an empty-state message — and MUST NOT be presented as, or conflated with, the no-product state defined for an organization lacking any active product entitlement.
- **FR-058**: Event-workspace navigation MUST resolve in this order: authentication, then organization accessibility, then event-workspace authorization, then product membership, then product-origin routing preference; a later step MUST NOT be evaluated before, or override the outcome of, an earlier step that already denies access.
- **FR-059**: A platform administrator who manually navigates to a product route for an organization lacking that product's active entitlement MUST see the same real no-product-state truth an ordinary member would see for that organization; the administrator's cross-tenant authorization override MUST NOT cause a product route to render as though the organization owned an entitlement it does not have.

### Key Entities

- **Product Context** *(new, not a stored entity)*: the user's currently selected product (`bendie` or `planner`) for organization-level discovery purposes. Carried by the URL namespace on product-level pages; carried by an explicit, lightweight navigation signal (mechanism decided during planning) when transitioning into an existing event-workspace route. Never persisted to the database.
- **Organization Product Entitlement** *(existing, `organization_products`, Feature 002)* — reused unmodified as the sole source of which products an organization may enter.
- **Event Product Usage** *(existing, `event_products`, Feature 002)* — reused unmodified as the sole source of which product(s)' discovery experience an event belongs to.
- **Event Workspace Access** *(existing, `event_members` + selected-organization match, Feature 003)* — reused unmodified as the sole authorization gate for actually opening an event, independent of product context.
- **Planner Counterpart Link** *(existing, `event_planner_links`, Feature 001/004)* — reused unmodified; explicitly excluded from any role in determining product availability or product membership.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of organization members can identify, from the Portal's own UI, which product (Bendie or Bendie Planner) they are currently using, without needing to inspect any individual event.
- **SC-002**: 0% of events whose product usage does not include the currently selected product appear in that product's event discovery, counts, or summaries — across every tested organization/event combination.
- **SC-003**: 100% of Both events land in the product-appropriate workspace when entered from an identifiable product context, and land on the pre-existing Bendie-dashboard default when entered with no such context.
- **SC-004**: 100% of pre-existing `/portal/events/[eventId]/...` links continue to resolve to their pre-Feature-006 behavior when opened with no product-context signal attached.
- **SC-005**: 0% of product-mismatch encounters (an authorized user reaching an event that doesn't use their current product) result in a blocked/not-found state; 100% instead redirect into that event's valid product experience.
- **SC-006**: 0% of unauthorized access attempts (missing workspace access, wrong organization, cross-tenant, inactive entitlement) succeed in reaching event data, regardless of product context or redirect behavior.
- **SC-007**: 0% of organization or product switches result in a visibly stale event, a redirect loop, or a durable persistence write.
- **SC-008**: 100% of tested product-switcher displays match the selected organization's real active `organization_products` state, including for platform-administrator viewers.

## Assumptions

- The Feature 005 manual test fixture (organization "Bendie Planner Sample," with Bendie-only event "Stawi Escape" and Planner-only event "Stawi Escape — Planner Test," both product entitlements active) remains available and unmodified for this feature's own verification; a controlled Both event will be added later, during implementation/runtime verification, not during specification or planning.
- No Portal or Bendie Planner database schema change is required to deliver this feature — it is additive routing and query-filtering over data both systems already maintain.
- The exact technical mechanism for carrying originating product context into an existing event-workspace route (e.g., a query parameter or an equivalent explicit signal) is a planning-level decision, not a specification-level one; this specification only requires the observable properties in FR-034.
- Classification of the organization-level People, Assets, Teams, Activity Log, and Settings surfaces as organization-global (not product-specific) reflects the smallest coherent product shell for this feature; none of Feature 006's requirements depend on changing that classification, and revisiting it is left to a future feature if a real product-specific need for one of them emerges.
- "Bendie Planner" is the customer-facing label for the `planner` product key throughout this feature's UI; no change to the underlying `product_key` values themselves is implied.

## Out of Scope

- Any Bendie Planner operational module beyond the existing Feature 005 Planner Overview (Tasks, Participants, Staff, Flights, Accommodation, Transfers, Vendors, Checklist, Blueprints, Notifications, full agenda management).
- Billing, product purchasing, or any self-service product-entitlement management.
- Any automatic or self-service organization-to-Bendie-Planner-organization mapping/provisioning.
- Database persistence of the user's selected product (no `profiles.current_product` or equivalent column).
- Any redesign of existing Bendie event-workspace modules.
- Any redesign of shared organization administration (People, Assets, Teams, Activity Log, Settings).
- Mass migration or renaming of existing event-workspace URLs.
- Deletion or modification of the existing Feature 005 manual test fixture.
- Creating the controlled Both test event (deferred to implementation/runtime verification).
