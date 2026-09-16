# Feature Specification: Planner Event Workspace Foundation

**Feature Branch**: `005-planner-event-workspace-foundation`

**Created**: 2026-09-16

**Status**: Draft

**Input**: User description: "Establish the first real Planner workspace experience inside Bendie Portal — a Planner Overview for Planner-enabled events, product-aware Planner navigation reusing the existing EVENT_SECTIONS/EventLayout mechanism, correct Planner-only landing behavior, a new ordinary-Portal-event-member read authorization tier for safe Overview data (distinct from Feature 001's platform-admin-only bendie-planner admin surface), and a narrow reusable server-side Planner read boundary for future modules. Workspace-foundation scope only, not a full Planner-module implementation."

## Context

Feature 001 built a per-event, opt-in link between a Portal event and a Bendie Planner event (`event_planner_links`), plus admin-only member sync, agenda push, and travel pull. Feature 002 established the product model (`organization_products`, `event_products`, `organization_planner_links`). Feature 003 established Portal event-workspace admission (`event_members` + selected-organization match) and a product-aware navigation mechanism (`EVENT_SECTIONS[].product`, filtered and route-protected by `EventLayout`) — with no tab yet classified `'planner'`, since no Planner workspace existed to classify. Feature 004 made event creation product-aware and added real Planner-event provisioning, but explicitly did not build any Planner-facing screen (FR-038 of that feature): a Planner-only or Both event is Portal-workspace-usable today, but visiting it lands on the existing, unchanged `dashboard` route — which is classified `'bendie'` — and since a Planner-only event has zero active Bendie product usage, that route renders the existing "this isn't available for this event" blocked state with no visible tabs at all.

This feature closes that gap with the minimum real workspace: one read-only Planner Overview tab, backed by a new, narrow, server-mediated read path into Bendie Planner's separate Supabase project, available to any Portal user who already has ordinary workspace access to the event — not only platform administrators. It also fixes the concrete routing consequence described above so a Planner-only event has a real landing experience instead of a dead end.

A preceding architecture discovery pass (this session) corrected an earlier assumption: **Bendie Planner has no local application source available in this workspace** — a sibling repository initially believed to be Planner's client turned out to be Bendie's own attendee-facing app, sharing Portal's database. Every Planner-specific fact in this specification is instead grounded in the live Bendie Planner Supabase project's actual schema and Row Level Security policies (inspected directly during architecture discovery), plus this codebase's own existing, already-shipped Feature 001/004 integration code. Where Planner's own client behavior (screens, buttons) cannot be verified because no such source exists here, this specification does not depend on it — it only reads Planner's underlying data, server-side.

## Clarifications

### Session 2026-09-16 (resolved during architecture discovery, prior to this specification)

- **Q: May a Portal user view the Planner Overview if they have ordinary Portal event-workspace access but no corresponding Bendie Planner staff assignment for that event?** → A: Yes. Portal workspace admission (existing `event_members` model, or the platform-admin override) remains the sole gate for viewing the Overview. This feature MUST NOT create, require, or synchronize a Bendie Planner staff assignment merely to allow viewing. Reconciling the two systems' access models is explicitly deferred to a future feature. Resolves FR-009/FR-010.
- **Q: Should the Overview show who is staffing/coordinating the event on the Bendie Planner side?** → A: No. Staff/coordinator names and email addresses MUST NOT appear anywhere in this feature, regardless of the viewer's role, to avoid exposing another system's personnel data before an access-reconciliation model exists. Deferred to a future "Planner Event Access Reconciliation" feature. Resolves FR-004.
- **Q: Should the Overview display an attendee count?** → A: No. Bendie Planner's own event record has a plain, manually-entered attendee-count field with no verified relationship to its actual passenger/participant records; showing it risks presenting a misleading number as authoritative. Establishing a trustworthy attendee count is deferred to a future logistics/participants feature. Resolves FR-004.
- **Q: Should the Overview show counts from future operational modules (tasks, checklist items, vendor items)?** → A: No, even though read-only aggregate counts are technically obtainable. Introducing them here would create a dependency on modules this feature does not otherwise touch. Each count MUST be introduced by its own corresponding future feature. Resolves FR-004.
- **Q: What must happen to a Planner-only event's default landing today, and must this feature fix it?** → A: Yes, this feature MUST fix it. Today a Planner-only event has no visible tabs and its default route renders a blocked "unavailable for this event" state. After this feature, opening a Planner-only event MUST land the user on the Planner Overview, never on a blocked Bendie-classified route. Resolves FR-020–FR-024.

### Session 2026-09-16 (continued — `/speckit.clarify`)

- **Q: The specification's session/production summary (originally: total, pending, active, and completed session counts, plus event phase) was said to come from Bendie Planner's "real-time status data" — live verification during clarification found the views that would supply the pending/active/completed breakdown (`session_status_realtime`, `session_summary_realtime`, `overall_session_summary`) have a usable row for only 1 of Bendie Planner's 13 live events, and that one row is internally inconsistent (33 total sessions, but 0+0+0 across the three status buckets — a real bug in how the underlying refresh job matches status strings). A separate, genuinely reliable materialized view, `event_summary_realtime` (refreshed every minute, one row per event via `events LEFT JOIN production_tasks`), was found to provide a total session count and a date-derived event phase (`Planning`/`Active`/`Completed`/`Unknown`) for every event, including zero-session events (verified: events with zero `production_tasks` rows return `number_of_sessions = 0` as a real row, not a missing one). Given this, should the Overview's session/production summary be narrowed to what `event_summary_realtime` actually supports, kept as originally specified despite being unusable for nearly every event, or dropped from v1 entirely?** → A: Narrow it. The Overview's session/production summary MUST be limited to a total session count and the event's current phase, sourced from `event_summary_realtime` — this is now the sole canonical source for this part of the Overview. The pending/active/completed breakdown is removed from this feature's scope entirely, not merely hidden or deferred. `session_status_realtime`, `session_summary_realtime`, and `overall_session_summary` MUST NOT be used as a Feature 005 data source, and Feature 005 MUST NOT attempt to fix those views or reconstruct an equivalent breakdown by aggregating `production_tasks` directly — their unreliability is a documented Bendie Planner-side carry-forward issue, not a Feature 005 implementation responsibility. Resolves FR-003, and updates FR-002/FR-004/FR-005/FR-006 and their dependent acceptance scenarios and success criteria accordingly.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Viewing the Planner Overview as an ordinary event member (Priority: P1)

A person who already has ordinary workspace access to a Portal event (they hold an `event_members` row for it, in their currently selected organization) opens that event's Planner Overview and sees a small set of trustworthy, safe facts about its Bendie Planner counterpart — without needing any separate Bendie Planner login, staff assignment, or administrative privilege.

**Why this priority**: This is the entire value the feature exists to deliver — a real, safe, first Planner-facing screen inside Portal, usable by the people who actually work an event day to day, not only platform administrators.

**Independent Test**: As an ordinary event member (not a platform admin, with no Bendie Planner staff assignment for this event) of a Planner-active event with a successfully provisioned and linked Planner counterpart, open the event's Planner Overview and confirm it renders the event's identity and session/production status without error and without requiring any additional setup step.

**Acceptance Scenarios**:

1. **Given** an event with an active Planner product and a successfully established, active Planner counterpart link, **When** an ordinary event member (holding an `event_members` row for it, in their currently selected organization) opens the Planner Overview, **Then** it renders without requiring platform-admin privilege and without requiring a Bendie Planner staff assignment for that person.
2. **Given** the same event, **When** the Overview loads, **Then** it shows the linked Planner event's title, location, start date, end date, and setup date, and its description when one exists.
3. **Given** the same event, **When** the Overview loads, **Then** it shows the linked Planner event's total session count and its current phase, sourced from Bendie Planner's `event_summary_realtime` data — not a pending/active/completed breakdown, which this feature does not display.
4. **Given** the same event, **When** the Overview is inspected for its full content, **Then** it contains no participant records, no attendee count, no flight or accommodation records, no transfer records, no staff/coordinator names or email addresses, no task/checklist/vendor content or counts, no blueprint content, no notification content, no agenda content, and no pending/active/completed session-status breakdown.

---

### User Story 2 - Planner-only event lands in a real workspace, not a dead end (Priority: P1)

An organization member opens a Planner-only event for the first time (or at any later time) and lands directly in a usable Planner workspace, instead of a blocked "this isn't available for this event" screen with no visible navigation.

**Why this priority**: Without this fix, User Story 1's Overview would exist but be unreachable by the most natural path (simply opening the event) for exactly the product mix this feature is meant to serve — the fix and the Overview must ship together for the feature to deliver real value.

**Independent Test**: As an authorized event member, open a Planner-only event (no active Bendie product usage) directly by its event URL with no further path segment, and confirm the resulting page is the Planner Overview (or another valid, available section) — never a blocked/unavailable state and never a Bendie-classified page.

**Acceptance Scenarios**:

1. **Given** a Planner-only event (an active `planner` product, no active `bendie` product) that an authorized event member opens for the first time, **When** the event's base URL is visited with no section specified, **Then** the person lands on the Planner Overview, not the Bendie dashboard route and not a blocked/unavailable state.
2. **Given** the same event, **When** its navigation is inspected, **Then** no Bendie-classified tab is visible, and no fake or placeholder Bendie workspace is shown in its place.
3. **Given** the same event, **When** the person navigates directly to the Planner Overview's URL (bookmark, shared link, browser refresh), **Then** it loads exactly as it would from in-app navigation, without being blocked as an unavailable route.
4. **Given** a Both event (active `bendie` and `planner` products), **When** it is opened with no section specified, **Then** existing behavior for the Bendie-classified default section is preserved — this feature does not change what a Both or Bendie-only event lands on.

---

### User Story 3 - Bendie-only events are completely unaffected (Priority: P2)

An organization member working with a Bendie-only event sees no trace of this feature: no new tab, no new route, identical navigation and landing behavior to before this feature shipped.

**Why this priority**: A regression here would violate this codebase's brownfield-preservation principle and would be a serious defect even though it affects no new functionality — it must be explicitly verified, not assumed safe by omission.

**Independent Test**: As an authorized event member of a pre-existing Bendie-only event, open it and confirm its tab bar, default landing section, and every existing route behave identically to their documented pre-Feature-005 state; attempt to visit the Planner Overview URL directly and confirm it is blocked the same way any other unavailable-product route already is.

**Acceptance Scenarios**:

1. **Given** a Bendie-only event, **When** an authorized event member opens it, **Then** the tab bar and default landing section are unchanged from existing behavior, and no Planner Overview tab appears.
2. **Given** the same event, **When** the Planner Overview's URL is visited directly, **Then** it is blocked by the same existing product-availability mechanism that already blocks any other unavailable-product route, showing the same established "not available for this event" state.

---

### User Story 4 - Both event: Bendie and Planner sections coexist without a mode switch (Priority: P2)

An organization member working with an event that uses both products moves freely between its existing Bendie sections and the new Planner Overview using the same single navigation bar, with no separate "switch product" control to learn.

**Why this priority**: This validates that the existing product-aware navigation mechanism genuinely generalizes to a second product without new UI, which is the architectural premise the whole feature rests on.

**Independent Test**: As an authorized event member of a Both event, confirm both Bendie tabs and the Planner Overview tab appear together in one navigation bar, and confirm moving between them requires nothing beyond clicking a tab.

**Acceptance Scenarios**:

1. **Given** a Both event, **When** an authorized event member views its navigation, **Then** both its available Bendie tabs and the Planner Overview tab appear together in the same tab bar.
2. **Given** the same event, **When** the person moves from a Bendie tab to the Planner Overview tab (or back), **Then** no separate product-switching control, mode toggle, or confirmation step is presented — it behaves like moving between any two existing tabs.

---

### User Story 5 - Planner Overview handles an incomplete or not-yet-successful Planner counterpart truthfully (Priority: P3)

An organization member opens the Planner Overview for a Planner-active event whose Bendie Planner counterpart is not yet fully set up — because provisioning is still in progress, previously failed, has been failing long enough to look stuck, or (in a state that should not normally occur but must not crash the page) has no active link at all — and sees an honest, non-alarming explanation instead of an error page or fabricated data.

**Why this priority**: This state is a normal, expected consequence of Feature 004's existing asynchronous provisioning design, not a rare edge case — the Overview must handle it correctly from day one, but it depends on User Story 1 and 2 already working for the success path.

**Independent Test**: For a Planner-active event whose provisioning state is, in turn, `pending`, `provisioning`, `failed`, and stale, and separately for one with no active counterpart link at all, open the Planner Overview each time and confirm each renders the correct honest state with no raw error text and no fabricated Planner data.

**Acceptance Scenarios**:

1. **Given** a Planner-active event whose Planner-provisioning state is `pending` or `provisioning` and not yet stale, **When** the Planner Overview is opened, **Then** it shows a setup-in-progress state consistent with this codebase's existing provisioning-status messaging, not an error and not fabricated event data.
2. **Given** the same kind of event but where that state has persisted long enough to be considered stale (per this codebase's existing staleness rule), **When** the Overview is opened, **Then** it shows the existing truthful "taking longer than expected, contact support" state rather than implying a retry will help.
3. **Given** a Planner-active event whose Planner-provisioning state is `failed`, **When** the Overview is opened, **Then** it shows the existing failure/retry affordance already established for this state, without exposing any raw diagnostic detail.
4. **Given** a Planner-active event with no active `event_planner_links` row at all (a state that should not normally occur once provisioning succeeds, but must be handled defensively), **When** the Overview is opened, **Then** it shows a safe "not yet set up" state rather than an error or a crash.
5. **Given** a Planner-active event whose counterpart link is active and whose provisioning succeeded, but whose linked Planner event genuinely has zero sessions (a newly provisioned event with nothing scheduled yet in Bendie Planner, verified to return a real total-session-count-of-zero row rather than no row at all), **When** the Overview is opened, **Then** it shows the zero total session count as a normal, legitimate state — never as an error and never implying provisioning failed.
6. **Given** the same successfully linked event, **When** the live read from Bendie Planner's database itself fails or times out (a genuine backend/connectivity failure, distinct from Scenario 5's legitimate zero-session data), **Then** the Overview shows a generic, safe "couldn't load right now" state, not a raw error, and never presents fabricated or stale data as if it were current.

---

### Edge Cases

- An unauthenticated visitor, or an authenticated user with no `event_members` row for the event, attempts to view the Planner Overview or call its underlying data endpoint directly → denied, exactly as any other event-workspace content is already denied today.
- A user has `event_members` access to the event, but through an organization other than their currently selected one → denied, exactly as Feature 003's existing workspace-access rule already requires.
- A user attempts to reach the Planner Overview for an event belonging to a different organization/tenant than any they belong to → denied.
- An event has no active `planner` entry in its product usage (Bendie-only, or a `planner` product usage record exists but its organization-level entitlement is inactive) → the Planner Overview is unavailable, exactly like any other unavailable-product route.
- A client request supplies (or attempts to supply) a specific Bendie Planner event identifier directly → ignored; the identifier actually used is always the one resolved server-side from the event's own active counterpart link, never a client-supplied value.
- A platform administrator opens the Planner Overview for any event → allowed, exactly as the platform-admin override already works for every other workspace-access and product-availability check in this codebase.
- The Planner Overview is opened for an event that is both Planner-active and has an active counterpart link, but the underlying Bendie Planner project is temporarily unreachable → treated as the backend-failure state (User Story 5, Scenario 6), not as "not yet set up" and not as "no sessions."
- A browser refresh, or a direct/bookmarked link, is used to reach the Planner Overview instead of in-app navigation → behaves identically to reaching it via a tab click, subject to the same authorization checks every time.
- An event's product usage or its organization's Planner entitlement changes (product removed, entitlement deactivated) between two page loads of the same event → the more recent state governs; a previously visible Planner Overview tab or route becomes unavailable immediately on the next check, consistent with how this codebase already re-derives product availability on every load rather than caching an access decision.
- A Both event's Bendie sections and Planner Overview are each opened directly by URL in sequence → each is independently authorized on its own terms; access to one implies nothing about access to the other beyond the shared workspace-admission check both already require.

## Requirements *(mandatory)*

### Functional Requirements — Planner Overview scope and content

- **FR-001**: The system MUST provide a read-only Planner Overview for an event whose product usage includes an active Planner entitlement and which has a corresponding Bendie Planner event.
- **FR-002**: The Planner Overview MUST show, when available from the linked Bendie Planner event: title, location, start date, end date, setup date, and description (when a description exists).
- **FR-003**: The Planner Overview MUST show a session/production summary for the linked Bendie Planner event: a total session count and the event's current phase, sourced from Bendie Planner's `event_summary_realtime` data — the source verified during clarification to reliably provide one row for every event, including zero-session events. The system MUST NOT display a pending/active/completed session-status breakdown. Bendie Planner's `session_status_realtime`, `session_summary_realtime`, and `overall_session_summary` data MUST NOT be used as a source for this feature, and this feature MUST NOT attempt to repair those views or reconstruct an equivalent breakdown by aggregating Bendie Planner's underlying task data directly merely to preserve a pending/active/completed display — their unreliability (verified during clarification: a usable row for only one live event, internally inconsistent even there) is a documented Bendie Planner-side carry-forward issue, not a Feature 005 implementation responsibility.
- **FR-004**: The Planner Overview MUST NOT display, under any circumstance in this feature: raw participant/passenger records, an attendee count, flight records, accommodation/hotel records, transfer/vehicle records, Bendie Planner staff or coordinator names or email addresses, task content or task counts, checklist content or counts, vendor content or counts, blueprint content, notification content, agenda content, or a pending/active/completed session-status breakdown.
- **FR-005**: When the linked Bendie Planner event's total session count is genuinely zero, the system MUST present this as a normal, legitimate state (a real zero value, not an absent or unavailable one), not as an error, a warning, or an indication that provisioning failed.
- **FR-006**: When the system cannot obtain the session/production summary from Bendie Planner due to a backend or connectivity failure, it MUST present a generic, safe "couldn't load right now" state — distinct from the legitimate zero-session state in FR-005 — and MUST NOT display fabricated, cached-as-current, or partially-failed data as though it were a successful read.

### Functional Requirements — Authorization boundary

- **FR-007**: Viewing the Planner Overview MUST require, at minimum, the same Portal event-workspace access this codebase already requires for any other event content: an explicit `event_members` row for the event within the caller's currently selected organization, or the existing platform-administrator override. This feature MUST NOT weaken, bypass, or duplicate that check with different semantics.
- **FR-008**: In addition to FR-007, viewing the Planner Overview MUST require that the event's product usage includes an active Planner entitlement, determined the same way this codebase already determines product availability for any other product-classified section (an active organization-level entitlement AND a matching event-level product-usage record) — an organization-level entitlement alone, or the mere existence of a Bendie Planner counterpart link, MUST NOT be treated as sufficient.
- **FR-009**: The system MUST NOT require a Bendie Planner staff assignment (or any other Bendie-Planner-side identity or permission record) as a condition of viewing the Planner Overview — a Portal user satisfying FR-007 and FR-008 MUST be able to view it regardless of whether a corresponding Bendie Planner staff assignment exists for them.
- **FR-010**: The system MUST NOT create, modify, or synchronize any Bendie Planner staff assignment as a side effect of a user viewing the Planner Overview.
- **FR-011**: This feature's Planner Overview authorization tier is distinct from, and MUST NOT weaken, replace, or be merged with, the existing platform-administrator-only authorization already governing this codebase's Bendie Planner administrative surface (linking/unlinking, member sync administration, agenda push, travel pull) — a person authorized to view the Planner Overview under this feature gains no administrative or write capability over Bendie Planner data as a result.

### Functional Requirements — Data resolution and server-side boundary

- **FR-012**: The system MUST resolve which Bendie Planner event corresponds to a Portal event exclusively through the existing, canonical active counterpart-link record this codebase already maintains — it MUST NOT accept, trust, or act on a Bendie-Planner-event identifier supplied by the calling client.
- **FR-013**: Every Planner Overview data request MUST perform its own authorization check (workspace access, then Planner product availability) before any Bendie Planner data is read — independent of, and not inferred from, any check already performed by a calling page or an earlier request.
- **FR-014**: Reading Bendie Planner data for the Planner Overview MUST happen only on the server; the system MUST NOT expose Bendie Planner service-role credentials, an unrestricted Bendie Planner query capability, or raw access to any Bendie Planner table to the browser.
- **FR-015**: The set of Bendie Planner data the Planner Overview reads MUST be limited to an explicit, named, fixed set of fields sufficient for FR-002/FR-003 — the system MUST NOT provide a general-purpose or passthrough query capability against Bendie Planner's database.
- **FR-016**: Bendie Planner's own Row Level Security or access policies MUST NOT be relied upon as the security boundary for what this feature exposes through Portal — this feature's own server-side authorization (FR-007, FR-008, FR-013) is the sole boundary, independent of how permissively or restrictively any given Bendie Planner table's own policies are configured.

### Functional Requirements — Provisioning-state handling

- **FR-017**: The Planner Overview MUST reflect the event's existing Planner-provisioning state (as already established by this codebase) faithfully: a `pending` or `provisioning` state (not yet stale) MUST show a setup-in-progress state; a stale `pending`/`provisioning` state MUST show the existing "taking longer than expected" state; a `failed` state MUST show the existing failure/retry affordance; and an event with no active counterpart link at all MUST show a safe "not yet set up" state.
- **FR-018**: This feature MUST reuse the existing Planner-provisioning state machine, its stored states, and its staleness rule exactly as already established — it MUST NOT introduce a second, competing notion of Planner-setup state.
- **FR-019**: The Planner Overview MUST NOT expose raw Planner-provisioning diagnostic detail to a non-platform-administrator viewer, consistent with this codebase's existing rule that such detail is administrator-only.

### Functional Requirements — Routing, landing, and navigation

- **FR-020**: The system MUST provide the Planner Overview as an event-scoped section within this codebase's existing single event-workspace route structure — this feature MUST NOT introduce a second, parallel workspace route hierarchy for Planner content.
- **FR-021**: The Planner Overview section MUST be classified, within this codebase's existing product-aware section metadata, as belonging to the Planner product — it MUST be hidden from, and its direct route MUST be blocked for, any event whose product usage does not currently include an active Planner entitlement, using the exact same mechanism already governing every other product-classified section.
- **FR-022**: The event shell's default landing section MUST be deterministic per product mix: a Bendie-only event MUST continue to default to the existing Bendie dashboard section; a Both event MUST continue to default to the existing Bendie dashboard section (this feature does not change the default for either); a Planner-only event (an active Planner entitlement, no active Bendie entitlement) MUST default to the Planner Overview instead of the Bendie dashboard.
- **FR-023**: The mechanism that selects an event's default landing section MUST be capable of producing a section other than the Bendie dashboard when no Bendie-classified section is available for the event, rather than assuming a single fixed section is always correct regardless of which product(s) the event uses — but for this feature, its actual output MUST be exactly the deterministic matrix in FR-022, not an incidental consequence of tab ordering or array position that could vary as more sections are added later.
- **FR-024**: This feature MUST NOT change the default landing section for a Bendie-only event or for a Both event — existing behavior for both is preserved exactly, per FR-022.
- **FR-025**: For a Both event, the Planner Overview section MUST appear within the same single navigation presentation as the event's available Bendie sections — this feature MUST NOT introduce a separate product-switching control, mode toggle, or secondary navigation surface.
- **FR-026**: This feature MUST introduce no navigation entry, visible or hidden, for any Bendie Planner capability other than the Planner Overview — no placeholder, disabled, or "coming soon" entry for a future Planner module MUST be added by this feature.

### Functional Requirements — Preservation of existing features

- **FR-027**: This feature MUST NOT alter Feature 001's existing administrative Bendie Planner surface, its authorization (platform-administrator-only), or its linking, member-synchronization, agenda-push, or travel-pull behavior.
- **FR-028**: This feature MUST NOT alter Feature 002's `organization_products`, `event_products`, or `organization_planner_links` schema, semantics, or authorization.
- **FR-029**: This feature MUST NOT alter Feature 003's event-workspace admission rule, its selected-organization isolation, or its existing product-aware navigation/route-protection mechanism — this feature is additive to that mechanism (a new classified section and a new selection rule for the default section), not a replacement of it.
- **FR-030**: This feature MUST NOT alter Feature 004's product-aware event creation, Planner-provisioning orchestration, counterpart-linking behavior, idempotency, retry mechanism, or stale-provisioning determination.

### Key Entities

- **Planner Overview** *(new, read projection only — not a stored entity)*: a bounded, read-only view combining selected identity fields of a Portal event's linked Bendie Planner event and that Planner event's total session count and current phase (from `event_summary_realtime`). Has no independent persistence; it is derived fresh from the existing Planner Link (Feature 001) and the linked Bendie Planner event's own live data on every view.
- **Planner Link** *(existing, `event_planner_links`, Feature 001)* — reused unmodified as the sole source of which Bendie Planner event a Portal event corresponds to.
- **Provisioning Outcome** *(existing, Feature 004)* — reused unmodified as the sole source of whether a Planner-active event's counterpart is ready, in progress, stale, or failed.
- **Event Product Usage** *(existing, `event_products`, Feature 002)* — reused unmodified as the sole source of whether an event currently uses Planner.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of authorized ordinary event members (holding workspace access but no Bendie-Planner-side staff assignment) can successfully view the Planner Overview for a Planner-active, successfully-linked event, with zero additional setup action required of them.
- **SC-002**: 100% of Planner-only events, when opened with no section specified, land the user on a valid, currently-available section — 0% land on a blocked "unavailable for this event" state.
- **SC-003**: 0% of Planner Overview responses, across all tested viewer types, contain any participant record, attendee count, flight/accommodation/transfer record, staff/coordinator name or email, task/checklist/vendor content or count, blueprint content, notification content, or agenda content.
- **SC-004**: 0% of unauthorized access attempts (no workspace access, wrong selected organization, cross-tenant, missing Planner product) succeed in retrieving any Planner Overview data.
- **SC-005**: 100% of pre-existing Bendie-only and Both events retain identical navigation, default landing, and route-availability behavior after this feature ships, with no observable regression.
- **SC-006**: 100% of the defined Planner-provisioning states (pending, provisioning, stale, failed, missing link, succeeded-with-zero-data, succeeded-with-data, backend failure) render their correct, truthful state when tested — 0% render a raw error, a crash, or fabricated data.
- **SC-007**: 0% of any Planner Overview request or response, inspected at the network level, ever contains a Bendie Planner service-role credential or a raw Bendie Planner diagnostic/internal error message.

## Assumptions

- `event_summary_realtime` (verified live during clarification: a minute-refreshed materialized view with one row per Bendie Planner event, including zero-session events) remains available and is the correct source for FR-003's total session count and event phase; the exact query used to read it is a planning-level detail, not a specification-level one.
- Bendie Planner's `session_status_realtime`/`session_summary_realtime`/`overall_session_summary` data is known, as of clarification, to be populated for only one live event and to be internally inconsistent even there. This is treated as a Bendie Planner-side data-quality carry-forward risk, documented here rather than fixed — this feature does not read from, repair, or depend on those tables in any way.
- No Portal database schema change and no Bendie Planner database schema change are required to deliver this feature — it is a read-only consumer of data both systems already maintain.
- The existing Planner-provisioning state machine, staleness rule, and their associated user-facing states/copy (established by Feature 004) are reused as-is; this feature adds no new provisioning states.
- Every event has at least one active product (an existing Feature 002/004 invariant); a state where neither Bendie nor Planner is available for an otherwise-workspace-accessible event is not expected to occur and is not separately handled by this feature beyond not crashing.
- Reconciling Portal's `event_members` model with Bendie Planner's own staff-assignment/capability model (beyond the read-only Overview access this feature grants) is out of scope and deferred to a future feature.
- Establishing a trustworthy attendee count, and any Bendie Planner staff/coordinator roster display, are deferred to future features and are deliberately absent from this feature's Overview.
- Bendie Planner's own Row Level Security policies are not assumed to be a reliable secondary security boundary; this feature's own server-side authorization is treated as the only enforced boundary for what it exposes, and this feature does not attempt to correct Bendie Planner's own policies.

## Out of Scope

- Any Bendie Planner Tasks, Agenda (beyond the Overview's session/production status numbers, which are not agenda content), Participants, Flights, Accommodation, Transfers, Event Access/assignment management, Blueprints, Checklist, Vendors, or Notifications screen, content, or management capability.
- Displaying an attendee count, staff/coordinator identity, or any operational-module count (tasks, checklist, vendors) in the Planner Overview.
- Synchronizing, creating, or reconciling Bendie Planner staff assignments (`event_user_assignments`) with Portal's `event_members` — deferred to a future "Planner Event Access Reconciliation" feature.
- Establishing, changing, or auto-provisioning a Portal-organization-to-Bendie-Planner-organization mapping.
- Adding or removing a product from an existing event (product-selection changes remain out of scope, as under Feature 004).
- Billing, subscriptions, or product-entitlement self-service management.
- Any change to Feature 001's administrative Bendie Planner surface or its authorization.
- Any change to Feature 004's event-creation or Planner-provisioning behavior, beyond consuming its existing, unchanged provisioning-state output.
- A dedicated Bendie/Planner product-switcher UI component — the existing shared navigation already serves this purpose.
- A generalized, reusable Bendie-Planner query/repository abstraction — this feature introduces only the narrow, named read functions it itself needs.
