# Bendie Portal — UX/UI Current-State Audit

Read-only discovery pass. No code, routes, permissions, or database objects were changed to produce this document. Source of truth throughout is the current implemented codebase (Features 001–015), not older specs — where specs and code disagree, the code's behavior is what's documented here.

---

## 1. Product Overview

**Who uses it.** Bendie Portal is an internal management tool used by Bendie staff (platform admins) and client-side event organizers (org owners/admins, event hosts/organizers/admins, facilitators, staff, speakers) to configure and run events. It is not attendee-facing — attendees experience the separate Bendie mobile/web app and the separate Bendie Planner app; Portal is the back-office for both.

**Organizations and events.** Everything is scoped under an **organization** (`organizations` table). A user belongs to an organization via `organization_members` (role: owner/admin/member) or is a **platform admin** (`profiles.global_role`, cross-tenant bypass everywhere). An organization has zero or more **active products** (`organization_products`: `bendie`, `planner`) — an entitlement gate above the event level. Each **event** belongs to exactly one organization and has its own `event_products` rows layered on top of the org's entitlement (`isProductAvailableForEvent` requires both).

**Bendie events.** Content-management events for the Bendie attendee app: Agenda, Facilitators, FAQs, Networking, Gallery, Games, Expo, Excursions, News, Emergency info, Info Center, Members (attendee/staff roster + access codes), etc. — 20+ content tabs, all classified `product: 'bendie'` in the section registry.

**Planner events.** Operational/logistics events for the separate Bendie Planner system (its own Supabase project). Portal is "another management interface" over Planner's canonical data — there is no Portal-side duplicate of Planner data; every Planner tab reads/writes Planner's own tables directly via a service-role bridge. Planner modules: Overview, Tasks, Vendors, Checklist, People/Participants, Logistics (Flights/Hotels/Ground Transport), Production. Staff/Permissions administration for Planner is folded into the existing Bendie-side Members page, not a separate Planner tab.

**Both-product events.** An event can have both `bendie` and `planner` active simultaneously. The workspace then exposes both sets of tabs in one tab bar, and a `?product=` URL signal (plus an explicit product switcher in the top header) tracks which "world" the user is currently oriented in, without hard-partitioning the tabs.

**What an event manager can currently do.** Create an event (choosing Bendie/Planner/Both), wait for/retry Planner provisioning if applicable, then populate whichever product(s) are active: on the Bendie side, edit CMS-style content per tab; on the Planner side, manage people, logistics, tasks, vendors, checklist items, and production sessions for live event operations, plus grant/revoke individual staff members' Planner access and module permissions.

---

## 2. Route Map

### Organization-level (`src/app/portal/`)

| Route | Purpose | Access | User action |
|---|---|---|---|
| `/portal` | Redirect-only; resolves default product and forwards to `/portal/bendie`, `/portal/planner`, or `/portal/no-product`. Renders no content of its own. | Any authenticated org member | None (transit) |
| `/portal/bendie` | Bendie product home (`OrganizationHome`) | Requires active `bendie` org entitlement | View org-level Bendie summary/entry point |
| `/portal/planner` | Planner product home (`OrganizationHome`) | Requires active `planner` org entitlement | View org-level Planner summary/entry point |
| `/portal/bendie/events` | Bendie event discovery/list | Active `bendie` entitlement | Browse/create Bendie events |
| `/portal/planner/events` | Planner event discovery/list | Active `planner` entitlement | Browse/create Planner events |
| `/portal/events` | Legacy redirect-only route to `/portal/{product}/events` or `/portal/no-product` | Any | None (transit) |
| `/portal/people` | Organization-wide member roster: add/remove, promote/demote platform-admin flag, CSV import (creates real accounts) | Org member (mutations gated further) | Manage org membership |
| `/portal/teams` | Create/delete teams, manage membership (consumed later for bulk-assigning a team to an event) | Org member | Manage teams |
| `/portal/assets` | Shared media library (`organization_assets`) consumed by event Hero & Branding | Org member | Upload/delete/copy-URL shared assets |
| `/portal/activity-log` | Org-level audit log — Teams/Assets changes only (per-event content changes live on the event's own Activity Log tab) | Org member | Review org-level audit trail |
| `/portal/settings` | Read-only display of org name/slug | Org member | View only (no edit form present) |
| `/portal/no-product` | Terminal state: org has zero active products | Org member | Dead end by design; shared org pages remain reachable via side nav |
| `/portal/no-access` | Terminal state: authenticated user with no org membership | Anyone | Logout only |

Organization **creation** and **switching** have no dedicated route — both happen client-side from `TopHeader`'s org switcher dropdown (`CreateOrganizationModal`, platform-admin only for creation).

### Event workspace (`src/app/portal/events/[eventId]/`)

Wrapped by `layout.tsx` (`EventLayout`). Bendie-only content tabs (`product: 'bendie'`): `dashboard`, `basics`, `hero`, `theme`, `terminology`, `facilitators`, `agenda`, `attendee-travel`, `activities`, `excursions`, `expo`, `news`, `networking`, `faqs`, `info-center`, `emergency`, `gallery`, `event-photos`, `files`, `games`, `members`, `notifications`, `activity-log`. Planner tabs (`product: 'planner'`): `planner-overview`, `planner-tasks`, `planner-vendors`, `planner-checklist`, `planner-people`, `planner-logistics`, `planner-production`. One shared tab: `bendie-planner` (platform-admin-only linking/sync control panel).

Purpose/access/action for the Planner tabs is detailed fully in §7 (Event Workspace Map) and §8 (Module-by-Module).

**Members (`/members`)** deserves a callout here: gated by Bendie event-role `canManage` (host/organizer/admin), it is also the entry point for Planner Staff/Permissions — a "Bendie Planner Access" per-row action opens `PlannerPermissionsModal`, visible only to users who separately pass `canAdministerPlannerPermissions` (platform admin, or org owner/admin of the event's own organization — never any event role). Creating brand-new Portal accounts from this page (Import CSV / Add Member) is further restricted to platform admins only; everyone with `canManage` can still add existing org/team members.

**`bendie-planner`** is a platform-admin-only integration panel: browse/link/unlink the event to a Bendie Planner event record, view per-staff Planner sync status, manually push agenda data to Planner / pull travel data from Planner.

### API routes relevant to events/organizations

- Event lifecycle: `POST /api/events/create`, `POST /api/events/[eventId]/retry-planner-provisioning`, `GET /api/events/[eventId]/planner-overview`.
- Per-module CRUD (one family per Planner module, all under `/api/events/[eventId]/planner-*`): `planner-tasks`, `planner-vendors`, `planner-checklist` — each with `capability`, a collection route, and `[itemId]`. `planner-people` additionally has `link` and `search`. `planner-logistics` has `flights`, `hotels`, and a three-level `ground-transport/{movements,vehicles,assignments/{assign,move}}` set. `planner-production` mirrors Tasks/Vendors/Checklist.
- Permission administration: `GET /api/events/[eventId]/planner-permissions/can-administer`; `GET/PUT` and `/enable`, `/disable`, `/deactivate-on-removal` under `/api/events/[eventId]/members/[memberId]/planner-permissions`.
- Admin-only integration: `create-user`, `bulk-create-users`, `planner-events`, `planner-link`, `planner-sync-member`, `planner-push-agenda`, `planner-pull-travel` — all under `/api/admin/`.
- **No `/api/orgs/*` exists** — organization CRUD is direct client-side Supabase table access under RLS, not routed through a server API.

---

## 3. Event Creation Journey

There is no dedicated creation page — event creation is a **modal** (`CreateEventModal.tsx`), opened from the events list (`EventsOverviewPanel`'s empty-state "Create Event" button, or a "Create" link in `TopHeader`, which lands on `/portal/events`, the redirector — not the modal directly).

**Fields, in display order:**
1. **Product** — button group (`Bendie`/`Planner`/`Both`), shown **only if the org has both products active**. If only one is active it's auto-selected and hidden. If neither is active, the whole form is replaced by a no-entitlement message. If both are active, **nothing is pre-selected** — the user must explicitly choose.
2. **Event name** — text, required (client-side toast block if blank).
3. **Location** — text, optional.
4. **Start date** — `type="date"`, optional.
5. **End date** — `type="date"`, optional.
6. Static hint: "New events start as Draft — you can publish once it's ready."

**Validation**: minimal client-side (name required); all real authorization/entitlement/idempotency validation happens server-side inside one Postgres RPC (`create_event_with_products`, SECURITY DEFINER) — deliberately the sole check, replacing an earlier redundant client-visible-RLS preflight that produced false negatives.

**Provisioning**: if the chosen product includes Planner, the server synchronously attempts Planner-side provisioning in the same request. The HTTP response is **always `200 {ok:true, eventId, plannerProvisioningStatus}`** even if Planner provisioning failed — a partial-outcome contract (the Portal event row always exists; only the Planner counterpart may have failed).

**Failure/retry state**: a failed Planner provisioning shows a warning toast ("Event created, but Bendie Planner setup didn't complete — you can retry it from the event") rather than a hard error. Retry happens later via a banner (`PlannerProvisioningBanner`, shown on the Dashboard tab) with a manual "Retry" button — **only visible when status is `failed`**; a stuck `pending` row has no retry affordance (the backend's claim mechanism only reclaims from `pending`/`failed`, so a genuinely stuck pending row is a dead end requiring backend intervention).

**Successful redirect**: none, technically — the modal doesn't navigate anywhere itself; it just closes and the new event becomes a normal clickable row in the events list. The user must click into it themselves.

---

## 4. Bendie-Only Journey

Portal home → `/portal/bendie` → `/portal/bendie/events` → click an event row → lands on `.../dashboard?product=bendie` → tab bar shows only the ~20 Bendie content tabs (`planner-*` tabs are absent since `isProductAvailableForEvent(..., 'planner', ...)` is false) → manager edits each content tab independently (Agenda, Facilitators, FAQs, etc.), each with its own CRUD list/modal pattern (outside this audit's Planner focus).

---

## 5. Planner-Only Journey

Portal home → `/portal/planner` → `/portal/planner/events` → click an event row → lands on `.../planner-overview?product=planner` (the Planner entry tab; Bendie tabs like `dashboard` are unavailable and hidden) → user sees Planner Overview's status card (identity + session summary, or a provisioning/error state per §4-of-route-map's provisioning table) → navigates via the tab bar to Tasks/Vendors/Checklist/People/Logistics/Production, each independently capability-gated (only visible once that module's own `GET .../capability` call resolves to `{hasPlannerIdentity:true, canView:true}`).

**Provisioning branch**: if `planner_provisioning_status` is `pending`/`stale`/`failed` at the time the event is opened, Planner Overview and every Planner tab defer to their own state block (hourglass/support_agent/error icon + explanatory copy) rather than a generic "unavailable" message — the user cannot proceed into any Planner module until provisioning completes or a platform admin intervenes via `bendie-planner`/retry.

**Dead end to flag**: a caller who has an active Planner product on the event but no resolved Planner identity (`hasPlannerIdentity:false`) sees every Planner tab simply absent from the tab bar with no explanatory copy anywhere in the workspace pointing them to "ask your admin to grant Bendie Planner access via Members" — that context only exists on the Members page itself, which they may have no reason to visit.

---

## 6. Both-Product Journey

Same organization, same event, both product entitlements active. Landing tab depends on entry signal:
- Default (no `?product=` signal, or `?product=bendie`): lands on `dashboard` (legacy default preserved).
- Explicit `?product=planner` signal on a Both event whose active tab is `dashboard`: redirected to `planner-overview?product=planner`.
- **Mismatched-origin safety net**: if the active tab's classified product is unavailable for this event but the *other* product IS available, the user is redirected to that other product's entry tab rather than shown a fake "unavailable" block (this also covers the symmetric Bendie-only case, not just Planner-only).

The **product switcher** in `TopHeader` only renders a dropdown when both products are active; switching recomputes the destination context-sensitively (shared page / product home / product-events list / in-event-workspace) and, for the in-event case, re-verifies `isProductAvailableForEvent` fresh on each click rather than trusting cached state. The `?product=` signal is carried forward onto every in-workspace tab link so it survives navigation, and is the same signal `TopHeader`'s breadcrumb label reads (a previously-fixed bug: the breadcrumb used to mis-derive its label from `EVENT_SECTIONS.product`, which is an access-gating classification, not a "which product are you in" display signal — almost every non-entry Bendie tab is classified `'bendie'` for legacy reasons even though it's reachable from a Planner-origin session on a Both event).

---

## 7. Event Workspace / Navigation Map

**Tab bar mechanics**: horizontally-scrollable row with overflow chevrons and auto-scroll-to-active-tab; a floating "Next: {label}" button advances to the next *visible* tab (a de facto linear-progression affordance, though nothing enforces an order). Visibility for the six Planner-module tabs requires that module's own capability state to be `ready` + `canView:true`; every other tab requires `section.product === 'shared'` or the org/event product-availability check to pass.

**Direct URL access / refresh**: an explicit `workspaceAuthPending`/`workspaceAuthDenied` state machine renders before any protected content mounts (fixing a prior bug where protected queries fired during the pending window). A denied user sees a lock-screen ("You don't have access to this event") rather than partial content — event-card visibility and workspace content access are deliberately different permission levels.

**Per-Planner-module capability fetch**: repeated six times, once per module, each explicitly documented as "independent, not a generalization" — same shape every time (loading → ready/provisioning/error, each state gating tab visibility and whether the page's own more-specific state handling takes over).

### Planner tabs — purpose/access/actions table

| Tab | Route | Product | Capability gate | Primary purpose | Major actions |
|---|---|---|---|---|---|
| Planner Overview | `planner-overview` | planner (entry) | `hasPlannerIdentity` only (read-only page) | Event identity + session summary landing page | View only |
| Tasks | `planner-tasks` | planner | `can_view_tasks` / `can_manage_tasks` | Operational to-do tracking, assignable to staff | Create/edit/delete tasks (manager); self-assignee inline status+remarks update |
| Vendors | `planner-vendors` | planner | `can_view_vendors` / `can_manage_vendors` | Equipment/vendor-item packing lifecycle tracking | Create item, toggle Packed/Loaded/On-site, edit notes, delete |
| Checklist | `planner-checklist` | planner | `can_view_checklist` / `can_manage_checklist` | Owner-assigned prep checklist, event-day-scoped | Create item, toggle Sourced/On-site, edit notes, delete (Viewer sees only their own owned items) |
| People | `planner-people` | planner | `can_view_people` / `can_manage_people`\* | Event participant roster (the linking hub for Logistics) | Add new / search-and-link existing global participant, edit, remove from event |
| Logistics | `planner-logistics` (3 sub-tabs) | planner | `can_view_logistics` / `can_manage_logistics` | Flights, Hotels, Ground Transport | See below |
| Production | `planner-production` | planner | `can_view_production` / `can_manage_production` | Run-of-show session schedule | Create/edit/delete sessions |
| *(Staff/Permissions)* | *(on `members`, not a Planner tab)* | shared | `canAdministerPlannerPermissions` (Portal-side org-admin authority, independent of the above flags) | Grant/revoke a specific staff member's Planner access + per-module View/Manage flags | Enable/disable access, apply Viewer/Manager preset or custom per-module flags |

\*People/Logistics/Production's actual capability composition in code is `canAdministerPlannerPermissions`-bypass OR the Planner-side flag — a materially different (newer) pattern than Tasks/Vendors/Checklist, which require a resolved Planner identity with the explicit flag in all cases, with no Portal-admin bypass. This inconsistency is invisible to the end user but matters for anyone reasoning about "why can this admin manage Vendors but not without a Planner identity, while they can manage People without one."

**Nested tabs**: only Logistics has internal sub-navigation — Flights / Hotels / Ground Transport, implemented as local component state (not separate routes/URLs), so refreshing the page or sharing a link always lands on the Flights sub-tab regardless of which sub-tab was open.

**Tab ordering**: fixed array order in `eventSectionMeta.ts` — Planner tabs always appear after all Bendie tabs, with `planner-overview` first among them (the de facto Planner "home").

---

## 8. Planner Module-by-Module Interaction Map

**Shared conventions across all six list-style modules** (stated once): identical 4-state page machine (loading skeleton → denied lock-screen → configuring [pending/stale/failed/unavailable/backend_error, fixed copy each] → loaded); capability gating hides manager-only buttons entirely rather than disabling them (no disabled-with-tooltip pattern anywhere); every mutation triggers a full authoritative refetch rather than optimistic local update; all creation is via a centered `FormModal`, never inline-in-list or a separate page; delete always goes through the shared `useConfirm()` dialog.

### Tasks
- **Enter**: tab click → loading skeleton → header "New Task" (manager-only) + filterable table (status/priority/assignee `<select>`s).
- **First view**: "No tasks yet for this event." if genuinely empty; a filter-specific empty message if filters exclude everything.
- **Primary action**: "New Task" button → modal.
- **Secondary actions**: manager gets Edit/Delete; the task's own assignee (non-manager) gets an inline status `<select>` + remarks text input with a local draft/Save/Cancel gate (does not autosave on change — a documented fix for a prior premature-PATCH bug).
- **Create mechanism**: modal (`max-w-lg`).
- **CSV import**: **none** — the only module without it.
- **After save**: modal closes, full list refetch.
- **Edit**: same modal, adds a Status select not present on create (new tasks are always server-forced to "Pending").
- **Delete**: confirm dialog, 404-safe (toasts "no longer exists" + refetches rather than erroring).
- **Viewer state**: Actions cell renders nothing for a non-manager, non-self-assignee row.

### Vendors
- **Enter/first view**: header "Import CSV" + "Add Vendor Item" (manager-only) + table. Empty: "No vendor items yet for this event."
- **Primary action**: "Add Vendor Item."
- **Secondary actions**: three independent lifecycle checkboxes (Packed/Loaded/On-site, each with an honest timestamp+actor line, never fabricated), toggled instantly with no confirm/draft step; a per-row Notes field with its own local draft/Save/Cancel; Delete (manager only).
- **Create mechanism**: modal — **explicitly create-only**; category/description/quantity/unit/sort-order can never be edited after creation (only Notes and the three toggles remain editable, and those live inline in the list, not in a modal).
- **CSV import**: yes — columns Category, Description\*, Quantity, Unit, Notes, Sort Order.
- **Delete**: confirm dialog, 404-safe.
- **Viewer state**: no Actions column at all; lifecycle checkboxes render but disabled; Notes shown as plain text.

### Checklist
- Structurally near-identical to Vendors. Two lifecycle stages instead of three (Sourced/On-site, no cascade between them). Create-only, same immutability rule as Vendors. Adds Owner (select, "Assign to me" default), Day Number, Event Day Date to the create form. **Viewer scoping is server-side, not just UI**: a Viewer's list response contains only their own owned items, not the full roster filtered client-side.
- **CSV import**: yes — includes an `ownerName` column, fuzzy-matched against eligible owners; unmatched/blank silently defaults to the importing manager server-side (never blocks the row).

### People / Participants
- **Enter/first view**: header "Import CSV" + "Add Participant" + table (Name/Contact/Passport/Dietary/Actions). Empty: "No participants added to this event yet."
- **Primary action / creation mechanism**: the one module with a genuinely different creation UX — a two-tab modal: **"New person"** (full 7-field create form) vs. **"Search existing"** (a live debounced search against the *global* passenger database across all events, not just this event's roster; clicking a result links immediately with no extra confirm step — the only true search-picker interaction found anywhere in the Planner modules).
- **Secondary actions**: Edit (full field-set, unlike Vendors/Checklist — genuinely editable after creation), Remove (unlinks from this event only; never deletes the global passenger record).
- **CSV import**: yes — mirrors the manual UI's own new/link split (searches by email for an exact global match before creating).
- **Cross-module role**: this module is the mandatory linking hub — a person must exist here before being selectable anywhere in Logistics.

### Logistics (Flights / Hotels / Ground Transport)
One page, three local-state sub-tabs (not separate routes — refresh always lands on Flights). A single load fetches Flights + Hotels + Ground Transport + the People roster together (the People fetch degrades silently to an empty roster on failure rather than blocking the whole page).

- **Flights**: table, one row per passenger-leg (arrival/departure always separate rows). Create/edit modal: Participant (select over the People roster, **disabled/immutable in edit mode**; if roster is empty the form is replaced by a hard block pointing to the People tab), Leg, Flight Code, Region, Flight Date (required), Departure/Arrival Time, Stops, Notes. A "Confirmed" checkbox toggles instantly, no draft step. CSV import: yes (participant matched by email-or-exact-name; duplicate-leg detection against already-loaded data).
- **Hotels**: table, multiple bookings per passenger expected (not deduplicated). Same participant-immutability rule. "Accommodation required" checkbox conditionally reveals/hides Hotel Name/Country/Room/Rooming/Check-in-out/Nights/Special-Pattern fields; Nights auto-computes from dates unless the user has manually typed into it first. CSV import: yes, same participant-matching convention, plus `accommodationRequired=false` field-clearing mirrored exactly.
- **Ground Transport**: nested-card layout (Movement cards containing Vehicle cards containing an Assignment list) rather than a flat table — explicitly chosen to make the three-tier structure legible. **No CSV import at all.** Multi-step flow to get one passenger onto a vehicle: (1) Add Movement (name/route/date/pickup-time/notes) → (2) inside that movement, Add Vehicle (type/number/capacity/status/route/date/pickup/end-time/notes — no driver field exists) → (3) on that vehicle, Assign (single participant select from the same People roster) → occupancy count updates live, turns error-colored at/over capacity. Reassignment is a separate "Move" modal (destination limited to other vehicles in the *same* movement). Unassign is a confirm-gated removal. A "Boarded" tag renders on an assigned passenger but **no control anywhere toggles it** — display-only in this surface.

### Production
- **Enter/first view**: header "Import CSV" + "Add Session" + table (Session/Date-Time/Type/Track-Room/Status pill/Actions), pre-sorted by date+sort-order server-side. Empty: "No production sessions added to this event yet."
- **Create mechanism**: modal, **the widest of all Planner modals** (`max-w-2xl`) and by far the largest field set (~17 fields — see §9).
- **Status handling**: default "Auto (time-based)" submits as `null`, letting a Planner-side view compute a live `displayStatus`; a manual override is available but not the default.
- **Known gap surfaced in the UI itself**: an edit-mode-only line reads "Slides on file: {filename} (upload management not yet available in Portal)" — a file-upload capability the UI acknowledges but doesn't provide.
- **CSV import**: yes, 17 columns; `isParallel`/`parentProductionId` are excluded from CSV (manual-form-only).

### Staff / Permissions (on the Members page, not a Planner tab)
- **Entry**: a "Bendie Planner Access" text-link per member row on the existing Members page, visible only to callers who pass the separate `canAdministerPlannerPermissions` check.
- **First view**: modal titled "Bendie Planner Access — {name}"; loading/error states distinguish "not yet provisioned" from "backend error" explicitly (a documented fix so a transient failure is never mistaken for "not set up").
- **Primary interaction**: a single Enable/Disable toggle (a real create/destroy of the person's Planner staff record — Enable seeds defaults based on their Bendie event role).
- **Permission editing**: Viewer/Manager preset pills (instantly overwrite the whole draft) plus a non-clickable "Custom" indicator that highlights automatically when the draft doesn't match either preset; a per-module checklist covering **Overview, Production, Logistics, Tasks, Notifications, Checklist, Vendors** — note this 7-item list does not 1:1 match the six Planner page routes: **People and the People-linkage side of Logistics have no row here at all**, and Overview/Notifications have View-only flags with no Manage concept, while Production/Logistics *do* have their own manager/viewer split inside their own pages. This is a real model mismatch worth flagging for the redesign: an admin cannot see or grant "People" access from this screen at all, yet the People module itself is capability-gated identically to the others.
- **No CSV, no delete** — pure per-member toggle surface, structurally unlike the six list modules.

---

## 9. Form Inventory

Field order, requirement, and input type for every major Planner create/edit form.

**Tasks** (`PlannerTaskModal`, max-w-lg)
1. Task — text, required
2. Category — text, optional
3. Priority — select (Low/Medium/High, default Medium)
4. Due date — date, optional
5. *(edit-only)* Status — select (Pending/In Progress/Completed)
6. Assignee — select (roster + "Unassigned")
7. Remarks — textarea, optional

**Vendors** (`PlannerVendorModal`, max-w-lg, create-only)
1. Description — text, required, autoFocus
2. Category — text, optional
3. Quantity — text (free text, not numeric input)
4. Unit — text, optional
5. Notes — textarea, optional

**Checklist** (`PlannerChecklistModal`, max-w-lg, create-only)
1. Item Name — text, required, autoFocus
2. Category — text, optional
3. Quantity — text (free text)
4. Specification — text, optional
5. Day Number — number, optional
6. Event Day Date — date, optional
7. Owner — select, default "Assign to me"
8. Notes — textarea, optional

**People** (`PlannerPeopleModal` — "New person" tab, max-w-lg; identical field set used for Edit)
1. Full Name — text, required, autoFocus
2. Title — text, optional
3. Gender — text (free text, no options), optional
4. Email — email, optional
5. Phone — text, optional
6. Passport — text, optional
7. Dietary Requirements — textarea, optional

**Flights** (`PlannerFlightModal`, max-w-lg)
1. Participant — select over People roster, **required on create, immutable/disabled on edit**
2. Leg — select (Arrival/Departure, default Arrival)
3. Flight Code — text, optional
4. Region/Route — text, optional
5. Flight Date — date, required
6. Departure Time — time, optional
7. Arrival Time — time, optional
8. Stops — text, optional
9. Notes — textarea, optional

**Hotels** (`PlannerHotelModal`, max-w-lg)
1. Participant — select, required on create, immutable on edit
2. Accommodation required — checkbox, default checked
3. *(conditional on #2)* Hotel Name — text; Country — text
4. *(conditional on #2)* Room Number — number; Rooming Label — text
5. Check-in — date; Check-out — date
6. Nights — number (auto-computed from dates unless manually edited first)
7. Special Stay Pattern — text, optional
8. Notes — textarea, optional

**Ground Transport — Movement** (`PlannerMovementModal`, max-w-lg)
1. Movement Name — text, required, autoFocus
2. Route — text, required
3. Date — date, required
4. Pickup Time — time, optional
5. Notes — textarea, optional

**Ground Transport — Vehicle** (`PlannerVehicleModal`, max-w-lg)
1. Vehicle Type — text, required
2. Vehicle No. — number, required
3. Max Capacity — number, required
4. Status — text (free text, e.g. "Active"), optional
5. Route — text, required
6. Date — date, required
7. Pickup Time — time, optional
8. End Time — time, optional
9. Notes — textarea, optional
*(No driver field exists at all.)*

**Ground Transport — Passenger Assignment** (`PlannerAssignPassengerModal`, max-w-md)
1. Participant — select over People roster (assign mode), required
*(Move mode instead shows a single "Destination vehicle" select over other vehicles in the same movement.)*

**Production** (`PlannerProductionModal`, **max-w-2xl — the only non-`lg`-width Planner modal**)
1. Session Title — text, required, autoFocus
2. Date / Start Time / End Time — 3-column row (date required)
3. Day Number / Type / Sort Order — 3-column row
4. Track / Room — 2-column row
5. "Runs in parallel" checkbox + "No parallel parent" select (lists every other session)
6. Participants — free-text string, not a picker
7. Mode / Mic Type — 2-column row
8. Presentation / Main Screen — 2-column row
9. Notes — textarea
10. Stage Hand Notes / Guest Experience — 2-column row of textareas
11. Status — select, default "Auto (time-based)"
12. *(edit-only, display text)* "Slides on file: …" — no actual upload control

**Longest forms**: Production (~17 fields, the only modal wider than `max-w-lg`) and the Ground Transport 3-modal sequence (Movement → Vehicle → Assignment, ~14 fields total spread across three separate save actions) stand out as the heaviest data-entry surfaces.

---

## 10. User Effort Observations (per module, observational only)

- **Vendors/Checklist**: ~5-8 fields, one modal, but **create-only** — any typo in a protected field (description, category, quantity, etc.) requires deleting and recreating the whole record rather than correcting it in place.
- **People**: 7 fields for a new person, or a search-and-click for an existing one — the lightest module per-record, but every downstream module (Flights/Hotels/Ground Transport) still requires reselecting that same person from a dropdown rather than any bulk "add flight+hotel+vehicle for this person" composite action.
- **Flights/Hotels**: participant selection is repeated per record with no memory of "the last person I was working on" — adding a return flight for the same person just added requires reopening the modal and reselecting them from the full roster dropdown again.
- **Ground Transport**: the heaviest cross-modal workflow — a single passenger's journey onto a vehicle requires up to three separate save actions across three separate modals (Movement, then Vehicle, then Assignment) even though a manager doing initial setup will typically want to create several vehicles under one movement, and assign several passengers per vehicle, in one sitting; there is no "add another" affordance in any of these modals — each closes fully after save.
- **Production**: the single densest form (~17 fields in one modal) for what is often a repetitive record type (many similar sessions across several days) — no duplicate/"save and start a similar one" shortcut exists.
- **No module offers a "Save and add another" option anywhere** — every creation modal closes fully after a successful save, even though Vendors/Checklist/Flights/Production are exactly the kind of module where an operator plausibly wants to add many similar records in one sitting.
- **Information already known elsewhere is not reused automatically**: e.g., a participant's name/email (already in People) must be reselected via dropdown in Flights, again in Hotels, again in Ground Transport's Assign modal — there is no "this person's flights/hotels/transport" composite view or entry point from the People tab itself.

---

## 11. CSV Experience (Feature 015, current implementation)

| Module | Import CSV location | Add/Create location | Template | CSV discoverable? |
|---|---|---|---|---|
| Tasks | **absent** | header, primary button | — | N/A — no CSV exists for this module at all |
| Vendors | header, `btn-secondary`, left of "Add Vendor Item" | header, `btn-primary` | Category/Description*/Quantity/Unit/Notes/Sort Order | Present but same visual weight as a secondary action; easy to overlook next to the primary Add button |
| Checklist | same pattern | same pattern | + Day Number/Event Day Date/Owner Name/Sort Order | Same as Vendors |
| People | same pattern | same pattern | Full Name*/Title/Passport/Dietary/Gender/Email/Phone | Same |
| Logistics (Flights, Hotels) | same pattern, **only on the Flights and Hotels sub-tabs** | same pattern | Per-domain field sets incl. participant matching guidance in column labels | Same, plus a user who only visits the Ground Transport sub-tab would never see any CSV affordance and might assume the whole module lacks it |
| Ground Transport | **absent** | header, primary button (label swaps to "Add Movement") | — | N/A — no CSV exists for this module |
| Production | header, same pattern | same pattern | 17 columns incl. explicit format hints (`YYYY-MM-DD`, `HH:MM`, 5-value status enum) | Same as Vendors |

**Flow** (identical everywhere it exists): click "Import CSV" → modal opens to a "pick" step (expected-format table with 1-2 sample rows + a "Download as CSV File" link + a file input) → selecting a file moves to "preview" (per-row Valid/Invalid status, count summary, "Choose a Different File" vs. "Import N Rows") → confirming moves to "result" (green success banner "Imported X of Y rows," a table of any skipped/failed rows with reasons, "Done"). The user never leaves the module/page — everything happens in an overlay modal.

**Discoverability assessment**: the button exists consistently as a `btn-secondary` immediately to the left of the primary "Add" button wherever it exists, which is a reasonably standard position — but its total *absence* on two of the eight module surfaces (Tasks, Ground Transport) with no explanatory copy anywhere ("CSV import isn't available for this module") could read to a user as a bug or an oversight rather than a deliberate scope boundary, especially since every visually similar sibling module has it.

---

## 12. Cross-Module Dependencies

- **People → Flights/Hotels/Ground Transport**: a participant must exist in the People roster (via new-create or search-link) before being selectable in any of the three Logistics surfaces. Flights/Hotels hard-block their create form entirely with a "go to People first" message when the roster is empty; Ground Transport's Assign modal shows the equivalent message inline.
- **Staff/Permissions → module access**: a staff member's ability to see/use any of the six Planner-module tabs depends on `event_user_assignments` flags administered exclusively via the Members page's "Bendie Planner Access" modal — but that modal's permission matrix (Overview/Production/Logistics/Tasks/Notifications/Checklist/Vendors) does not include a "People" row, so People-module access apparently can't be explicitly granted/denied through this UI at all (worth verifying against the underlying flag set before any redesign assumes parity).
- **Ground Transport internal chain**: Movement → Vehicle → Passenger Assignment is a strict three-tier dependency; a vehicle cannot exist without a movement, an assignment cannot exist without a vehicle. Reassignment ("Move") is scoped to vehicles within the *same* movement only — there's no cross-movement move.
- **Production → Planner read model**: Production sessions are written to a base table but consumed (including live status computation) through a Planner-side view — the Portal's own status field is often left as "Auto" precisely to defer to that view's time-based logic rather than compete with it.
- **Provisioning → everything Planner**: no Planner module is usable at all until `planner_provisioning_status` reaches `succeeded` and a canonical Planner-event link is resolved; every module's capability fetch degrades to a "configuring" state until that's true.
- **Implied populate-order** (not enforced anywhere in the UI, but the dependency chain above implies one): Staff/Permissions (grant yourself/your team access) → People (build the roster) → Flights/Hotels/Ground Transport (consume that roster) → Tasks/Vendors/Checklist/Production (largely independent of People, but benefit from Staff/Permissions being set up first for assignee/owner pickers).

---

## 13. Shared UI Components

| Component/pattern | File | Used by | Consistency |
|---|---|---|---|
| `FormModal` | `src/components/portal/FormModal.tsx` | Every Planner create/edit modal, plus most Bendie-side ones | Fully consistent — single shared shell, only `maxWidthClassName` varies (`max-w-lg` default, `max-w-md`/`max-w-2xl`/`max-w-3xl` overrides) |
| `useConfirm()` / `ConfirmProvider` | `src/contexts/ConfirmContext.tsx` | Every delete/destructive action across all modules | Fully consistent — one dialog, `destructive` flag swaps Confirm button to `btn-danger` |
| `CsvImportModal<T>` | `src/components/portal/CsvImportModal.tsx` | Vendors, Checklist, People, Logistics (Flights+Hotels), Production, plus several Bendie-side pages (Agenda, Facilitators, FAQs, Members, Networking) and org-level People | Fully consistent generic component — zero per-module forking of the modal itself, only `columns`/`sampleRows`/`parseRow`/`importRow` configuration differs |
| `SectionHeader` | `src/components/portal/SectionHeader.tsx` | Every event-workspace tab page | Consistent — icon badge + title + description sourced from `eventSectionMeta.ts` |
| Button classes (`.btn-primary`, `.btn-secondary`, `.btn-danger`) | `src/globals.css` (`@layer components`) | Universally | Fully consistent, defined once |
| `.input` / `.label` / `.hint` classes | `src/globals.css` | Every form field across every module | Fully consistent |
| Table card wrapper (`bg-white rounded-[20px] border border-[#E4EAF0] panel-shadow overflow-x-auto`) | Repeated inline in every `Planner*List.tsx` | Tasks, Vendors, Checklist, People, Flights, Hotels, Production lists | Consistent pattern but **not extracted into a shared component** — the exact class string is duplicated verbatim in each list file rather than centralized |
| Ground Transport nested-card layout | `PlannerGroundTransportList.tsx` | Only Ground Transport | One-off — the only module using a card-tree instead of the standard table pattern (a deliberate exception for its 3-tier data, not an inconsistency) |
| Toast notifications | `react-hot-toast`, wired globally in `portal/layout.tsx` | Universally | Consistent |
| `OrgSideNav` / `TopHeader` | `src/components/portal/` | Every `/portal/*` route | Consistent single instance, not per-page |

---

## 14. Visual/Design System

- **Framework**: Tailwind CSS (utility-first), no CSS-in-JS. Global stylesheet at `src/globals.css` defines a small set of reusable component classes (`@layer components`: `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.input`, `.label`, `.hint`) plus a `.panel-shadow` utility and a custom thin scrollbar class.
- **Design tokens**: Material Design 3-style semantic color names defined directly in `tailwind.config.js`'s `theme.extend.colors` (e.g. `primary: '#00629d'`, `on-surface`, `on-surface-variant`, `surface-container-low/high/highest`, `outline-variant`, `error`, `error-container`, plus a full set of `-fixed`/`-fixed-dim`/`-fixed-variant` tonal variants). Comment in the config points to `context/ui-tokens.md` as the source of truth these were generated from. Also retains generic Tailwind `gray`/`blue` palettes for anything not yet migrated to the semantic tokens.
- **Typography**: a custom `fontSize` scale layered on top of Tailwind's defaults — `label-sm`/`label-md`, `body-sm`/`body-md`/`body-lg`, `headline-sm`/`headline-md`/`headline-lg`/`headline-lg-mobile`/`headline-xl`, each a `[size, {lineHeight, letterSpacing?, fontWeight}]` tuple (e.g. `headline-md` = 24px/32px line-height/600 weight). Font family is `Plus Jakarta Sans` via a CSS variable, falling back to system sans. A `headline-lg-mobile` variant exists but its actual usage/breakpoint-swap wasn't confirmed to be wired into any component in this pass — worth checking directly.
- **Spacing**: custom scale (`xs:4px, base:8px, sm:12px, md:24px, gutter:24px, lg:32px, xl:48px, margin-desktop:32px, margin-mobile:16px`) layered alongside Tailwind's default spacing scale (both are usable simultaneously, which could create inconsistency risk — e.g. `p-4` (16px, Tailwind default) vs. `p-gutter` (24px, custom) both appear in the codebase for what may be conceptually the same "page padding" role).
- **Radius**: modals/cards consistently use `rounded-[20px]` (an arbitrary value, not a named token); form inputs/buttons use `rounded-xl` (Tailwind's 12px default).
- **Shadows**: one custom shadow, `.panel-shadow` (`0px 4px 20px rgba(22,32,51,0.04)`), used on every modal and card.
- **Buttons**: three variants only — primary (solid `primary` blue), secondary (white/bordered), danger (solid `error` red) — no tertiary/ghost/link-button variant defined as a reusable class (plain `<a>` styling is handled globally via `a { @apply text-primary hover:opacity-80; }` instead).
- **Modals**: centered overlay pattern (`fixed inset-0 bg-black/40 flex items-center justify-center`), width controlled per-instance via `maxWidthClassName` — `max-w-lg` is by far the most common, with `max-w-md` (Assign), `max-w-2xl` (Production), and `max-w-3xl` (`FormModal`'s own default, used by some Bendie-side forms) as the only deviations found.
- **Tables**: no dedicated table component — each `Planner*List.tsx` hand-rolls the same `bg-white rounded-[20px] border ... overflow-x-auto` wrapper + `<table className="w-full text-left">` structure independently.
- **No dark mode**: `html { color-scheme: light; }` is explicitly hard-coded — no dark-mode token set or media-query handling exists anywhere in the design tokens.

---

## 15. Responsive Behavior

- **Breakpoints**: default Tailwind breakpoints only (`sm:640px, md:768px, lg:1024px, xl:1280px, 2xl:1536px`) — no customization in `tailwind.config.js`.
- **Page container**: the root `<main>` element (`portal/layout.tsx`) uses `p-4 sm:p-gutter` (16px padding below the `sm` breakpoint, 24px above) with **no max-width constraint** — content spans the full available width next to the sidebar on any screen size, including very large desktop monitors. There's no proportional centering/max-width for lists or forms outside of modals (which do have their own max-width caps).
- **Forms**: every multi-column form grid found (`grid grid-cols-2 gap-3`, `grid grid-cols-3 gap-3` — e.g. Production's Date/Start/End row, Vendors' Quantity/Unit row, Hotels' Room/Rooming row) uses a **fixed column count with no responsive breakpoint prefix** (no `sm:grid-cols-1 grid-cols-2`-style collapse). On a narrow viewport these will render as cramped fixed-width columns rather than stacking to one column — this is a concrete, verifiable code-level issue, most pronounced on Production's 3-column Date/Start/End row.
- **Tables**: every list wraps its `<table className="w-full text-left">` in an `overflow-x-auto` card. Because the table itself has no `min-w-*` forcing a specific width, narrow tables (Tasks, Vendors) may reflow acceptably, but wider ones (Flights: 6 columns; Hotels: 6 columns; Production: 6 columns including a title+badge cell) are likely to trigger horizontal scroll on phone-width viewports rather than a card/stacked mobile layout — a real "wide table" responsiveness concern to verify visually.
- **Modals**: `max-h-[90vh] overflow-y-auto` is applied uniformly, so tall forms (Production's ~17 fields) scroll internally rather than overflowing the viewport — this part is handled reasonably. Width, however, is a fixed `max-w-*` class with no mobile-specific override (e.g., Production's `max-w-2xl` will still try to render at that width and get clamped only by the modal's own `w-full` + outer `p-4` padding — likely acceptable but not verified visually).
- **Navigation**: `TopHeader.tsx` has explicit mobile-only elements (`lg:hidden` hamburger-style trigger, `sm:hidden`/`md:hidden` variants of the org-switcher and product-switcher), confirming *some* deliberate mobile adaptation exists at the navigation-chrome level, even though the content grids/tables described above don't appear to have equivalent adaptation.
- **Overall assessment (code-level only, not visually verified)**: navigation chrome (sidebar/header) appears to have real mobile consideration; the content layer (forms and tables inside Planner modules) appears to rely on horizontal scroll and fixed-width grids rather than reflow, which is the most likely source of real cramped-mobile/wide-table complaints once actually viewed on a phone-width screen.

---

## 16. Information Architecture

```
PORTAL (org-scoped)
│
├── Organization shell (OrgSideNav + TopHeader, present on every /portal/* route)
│   ├── Overview (redirects into whichever product(s) are active)
│   ├── Events (redirects into /portal/{product}/events)
│   ├── People (org membership)
│   ├── Teams
│   ├── Assets (shared media library)
│   ├── Activity Log (org-level: Teams/Assets only)
│   └── Settings (read-only org name/slug)
│
├── Bendie (product)
│   └── Events → Event Workspace
│       ├── Dashboard (entry tab; hosts the Planner-provisioning retry banner)
│       ├── Basics / Hero & Branding / Theme Colors / Terminology
│       ├── Facilitators / Agenda / Attendee Travel
│       ├── Activities / Excursions / Expo Directory
│       ├── News Feed / Networking / FAQs / Info Center / Emergency
│       ├── Gallery / Event Photos / Files / Games
│       ├── Members  ←── also hosts "Bendie Planner Access" (Staff/Permissions)
│       ├── Notifications / Activity Log
│       └── (shared) Bendie Planner — platform-admin linking/sync panel
│
└── Bendie Planner (product)
    └── Events → Event Workspace
        ├── Planner Overview (entry tab; read-only status/summary)
        ├── Tasks
        ├── Vendors
        ├── Checklist
        ├── People / Participants  ←── linking hub for Logistics
        ├── Logistics
        │   ├── Flights
        │   ├── Hotels
        │   └── Ground Transport
        │       ├── Movements
        │       │   └── Vehicles
        │       │       └── Passenger Assignments
        └── Production
```

A "Both" event overlays the Bendie and Planner workspace trees onto one tab bar for the same event, switchable via the product switcher / `?product=` signal, rather than presenting two separate workspaces.

---

## 17. Friction Inventory (observational — not solved here)

**Navigation friction**
- The tab bar can grow to 20+ tabs on a Both event, requiring horizontal scroll with only chevron affordances to discover what's off-screen.
- Staff/Permissions administration lives on the Bendie-side Members page, not any Planner tab — a Planner-only-event manager has no reason to ever visit Members and may not discover this exists.
- A user with no resolved Planner identity sees Planner tabs silently vanish from the tab bar with zero explanatory copy anywhere in the workspace.

**Data-entry friction**
- Vendors and Checklist are create-only forever — any mistake in a "core" field requires delete + recreate rather than correction.
- Ground Transport requires three separate save actions across three separate modals (Movement → Vehicle → Assignment) before a single passenger is actually on a vehicle.
- Production's create modal has ~17 fields in one dense, wider-than-usual form.

**Repetitive work**
- No module offers "Save and add another" — every modal fully closes after one save, even for record types operators plausibly want to add many of in one sitting (Vendors, Checklist, Flights, Production sessions).
- The same participant must be reselected from a full roster dropdown independently in Flights, Hotels, and Ground Transport's Assign modal for every single record — no "this person's logistics" composite entry point exists.

**Information hierarchy**
- The Staff/Permissions module-flag matrix (7 rows: Overview/Production/Logistics/Tasks/Notifications/Checklist/Vendors) does not 1:1 match the six actual Planner page routes — People has no corresponding row, and some rows with a "Manage" flag in the matrix don't have an equivalent standalone page (Notifications), which could confuse an admin trying to reason about what a flag actually controls.

**Discoverability**
- CSV import is completely absent (not just hidden) from two of eight module surfaces (Tasks, Ground Transport) with no explanatory text — indistinguishable from a bug to an end user who's used it elsewhere.
- The "Bendie Planner Access" entry point is a modest text link buried in a per-row Actions cell on a page (Members) that isn't itself a Planner tab.

**Cross-module workflow**
- The implied populate-order (Staff/Permissions → People → Logistics/Tasks/Vendors/Checklist/Production) is never stated anywhere in the UI — a new event manager must infer it from hard-block error messages encountered along the way (e.g., Flights' "add a participant on the People tab first").

**Form complexity**
- Production's form and the Ground Transport modal chain are clear outliers in field count/step count relative to every other module.
- Multi-column form grids (2 or 3 columns) have no responsive collapse, which will compound as a readability issue on mobile specifically for the already-longest forms.

**CSV discoverability**
- Same button position/weight everywhere it exists, which is good for consistency, but its total absence elsewhere (see above) isn't signposted.

**Empty-state guidance**
- Most empty states are a single generic line ("No X yet") with no cross-module pointer; Flights/Hotels' empty-roster case is the one exception that explicitly names the fix ("Add a participant on the People tab first") — a good pattern that isn't applied consistently elsewhere (e.g., an empty Ground Transport Assign picker doesn't name People by tab name the same way).

**Responsive concerns**
- Fixed-column-count grids with no breakpoint variants in forms.
- Wide tables (Flights/Hotels/Production, 6 columns) rely on horizontal scroll rather than any mobile-specific reflow/card view.
- No page-level max-width means very wide, sparse layouts are possible on large monitors for content that isn't itself inside a modal.

---

## 18. Screenshot Checklist

Prioritized for materially affecting redesign decisions — skip anything not listed, it likely won't add information beyond what's already documented above.

**Event creation & landing**
1. Create Event modal — both products active (product picker visible)
2. Create Event modal — only one product active (picker hidden)
3. Events list — empty state (with "Create Event" button)
4. Events list — populated, showing status pills/progress bars
5. Dashboard tab — with the Planner-provisioning-failed retry banner visible
6. Planner Overview — ready state (populated identity + session summary)
7. Planner Overview — a provisioning/pending or error state (whichever is easiest to reproduce)

**Workspace navigation**
8. Event workspace tab bar — a Both-product event with the full tab list (to see actual scroll/overflow behavior)
9. Event workspace tab bar — Planner-only event (shorter tab list)
10. Product switcher dropdown open (Both-product event)
11. Mobile-width view of the tab bar and TopHeader (to check the `lg:hidden`/`sm:hidden` responsive elements in practice)

**Per-module: empty / populated / modal / CSV / viewer, for each of the six modules**
12. Tasks — populated table with the filter row, and one row showing the self-assignee inline edit controls
13. Tasks — New Task modal open
14. Vendors — populated table showing the three lifecycle checkboxes + timestamp/actor lines
15. Vendors — Add Vendor Item modal open
16. Vendors — Import CSV modal, preview step (valid + invalid rows both visible)
17. Checklist — populated table (Manager view) vs. (if reproducible) a Viewer's scoped-down view
18. Checklist — Add Checklist Item modal open
19. People — populated table
20. People — Add Participant modal, "New person" tab
21. People — Add Participant modal, "Search existing" tab with live results showing
22. Logistics — Flights sub-tab, populated table
23. Logistics — Add Flight modal open
24. Logistics — Hotels sub-tab, populated table (a row with accommodation required=false, to see how "not required" renders)
25. Logistics — Add Hotel Booking modal, both with and without "Accommodation required" checked (to see the conditional fields)
26. Logistics — Ground Transport sub-tab, nested Movement→Vehicle→Assignment card view populated
27. Logistics — the Assign/Move passenger modal open
28. Production — populated table showing status pills and a parallel-session badge
29. Production — Add/Edit Production Session modal open (the widest, densest form — important to see at full size)
30. Members page — a row with "Bendie Planner Access" link visible
31. PlannerPermissionsModal — open, showing the preset pills + per-module checklist

**Cross-cutting / mobile**
32. Any one populated Planner table (Flights or Production recommended) at mobile viewport width, to directly observe whether it horizontal-scrolls or becomes unreadable
33. Any one multi-column create modal (Production recommended) at mobile viewport width, to observe the fixed grid-column cramping described in §15
34. A single-record delete confirmation dialog (any module) — to confirm the shared `useConfirm` visual treatment
35. An empty-state screen for a module you haven't already captured above (pick whichever is fastest) — to confirm the plain single-line copy pattern

---

Compiled from a full read-only pass over Features 001–015's current implementation. No files, routes, permissions, or database objects were modified to produce this document.
