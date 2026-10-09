# Bendie Portal — Current-State Product, UX, UI & Workflow Audit

**Date:** 2026-10-01 · **Branch audited:** `developement` @ `39479c8` ("Fix confirm dialog rendering behind modals") · **Type:** discovery only — nothing in the application was changed to produce this document.

This is the new baseline description of what the Bendie Portal looks like and how it works **today**. It is written for a product/UX reviewer who has not followed development. It describes; it does not recommend. Observations are collected at the end (§30) and are deliberately not recommendations.

## How to read the evidence labels

Every major statement carries one of these tags:

| Tag | Meaning |
|---|---|
| **[SC]** SOURCE-CONFIRMED | Read directly in the current source code. |
| **[BV]** BROWSER-VERIFIED | Seen in a running browser. **No screen in this audit is browser-verified** — see §31. |
| **[DOC]** DOCUMENTED BUT NOT VERIFIED | Stated in Feature 016 spec/plan/tasks or older context docs, not re-proven in code or a browser. |
| **[INF]** INFERRED | Reasoned from source (e.g. layout height, a navigation path traced through several files), not directly observed. |

Where the code and older documentation disagree, **the code wins** and the disagreement is recorded (§30.9 and inline).

**Sources read:** `AGENTS.md`; Feature 016 `spec.md` (passes 1–23 + final error pass), `tasks.md` (T01–T423), `plan.md` headings; `context/portal-ux-current-state-audit.md` (the pre-016 audit, now largely stale); all 50 `page.tsx` files; both portal layouts; `OrgSideNav`, `TopHeader`, all 60 shared components; the 7 contexts; all `src/lib` helpers relevant to navigation, permissions, modules, theme, CSV, saving and errors; `middleware.ts`; `globals.css`; `tailwind.config.js`; the 47 API route files (authorization patterns).

---

## Table of contents

1. Product model
2. Person / user model
3. Global application shell
4. Organisation-level experience
5. Organisation dashboard (Overview)
6. Event workspace shell
7. Current main event areas
8. Bendie event module audit
9. Planner module audit
10. Agenda deep dive
11. Theme Designer deep dive
12. Event creation
13. Manage modules
14. Data-entry patterns (matrix)
15. Import experience
16. Saving & drafts
17. Validation & error UX
18. Empty states & first-time UX
19. Terminology dictionary
20. Visual design system
21. Information density
22. Navigation model (tree)
23. Cross-product workflows
24. Permissions
25. Performance & loading
26. Responsive behaviour
27. UX maturity classification
28. Known deferred items
29. Screen-by-screen inventory
30. Observed UX characteristics (observations only)
31. Screenshots / visual evidence
32. Accuracy notes
33. Summary

---

## 1. Product model

### 1.1 The three products

| Name | What it is today | Where it lives |
|---|---|---|
| **Bendie Portal** (branded in-app as **"Bendie Studio"**) | The web back-office. Organisers manage organisations, people, events, attendee-app content and Planner operations here. Not attendee-facing. | This repository (Next.js 14 App Router, Supabase). [SC] |
| **Bendie** | The attendee app (separate "Evently-App" codebase). Shows the agenda, speakers, news, gallery, networking, travel, emergency info etc. to attendees. The Portal is a CMS for it. | Separate app; shares the Portal's Supabase project (`events`, `event_members`, `agenda_sessions`, …). [SC][DOC] |
| **Bendie Planner** | The operational/logistics product (participants, flights, hotels, ground transport, tasks, vendors, checklist, production run-of-show). Has its **own Supabase project and database**. | Separate app + separate DB. The Portal reads/writes Planner data server-side through `/api/events/[eventId]/planner-*` routes using a service-role bridge. [SC] |

Branding note: the sidebar header, the browser tab title (`metadata.title`) and the login page say **"Bendie Studio"**; the product switcher says **"Bendie"** and **"Bendie Planner"**; the unauthenticated root page `/` still says **"Event Content Portal"** [SC]. "Bendie Portal" does not appear as a visible label anywhere [SC].

### 1.2 Relationship

```
                    ┌────────────────────────────── Bendie Portal ("Bendie Studio") ──────────────────────────────┐
                    │                                                                                               │
 Organisation ──────┤  Bendie side (Portal Supabase DB)              Planner side (Planner Supabase DB, via API)     │
  (org products:    │  event content, event_members, theme…          passengers, flights, hotels, vehicles, tasks…  │
   bendie/planner)  │                     │                                         │                               │
                    └─────────────────────┼─────────────────────────────────────────┼───────────────────────────────┘
                                          ▼                                         ▼
                                Bendie attendee app                        Bendie Planner app
```

- **Portal → Bendie:** direct. Every Bendie module page writes Portal-DB tables with the browser Supabase client under RLS; the attendee app reads the same tables. There is no publish step — saving is live (apart from `events.status`, which is a manual label, §6.3). [SC]
- **Portal → Planner:** indirect. Planner pages call Portal API routes, which run an authorization chain then read/write the Planner database with a service-role client. The Portal never stores a copy of Planner data. [SC]

### 1.3 Event product types

An event's products are rows in `event_products` (`bendie`, `planner`), layered on the organisation's entitlement in `organization_products`. `isProductAvailableForEvent()` requires **both** the org entitlement and the event row. [SC]

| Event type | What exists | Navigation the user sees |
|---|---|---|
| **Bendie** | Portal event row only (`planner_provisioning_status = not_required`). | Bendie areas + Operations' shared "Bendie Planner" tab. [SC] |
| **Planner** | Portal event row + a provisioned Planner event linked in `event_planner_links`. | Overview (Planner Overview), Participants, Planning, Logistics, Production, and the shared Operations → Bendie Planner tab (placed last). Bendie tabs are hidden. [SC] |
| **Both** | Both of the above, one Portal event. | All areas, Bendie first, then a small "PLANNER" divider, then Planner areas. [SC] |

**What is shared for Both events** [SC]: one `events` row (name, dates, location, status, modules), one workspace URL, one header/title, one Dashboard. The Planner counterpart is provisioned from the **same** create request (name/dates/location entered once).
**What stays product-specific** [SC]: attendee content (Bendie tables) vs operational data (Planner DB); attendees (`event_members`) vs participants (`passengers`); Bendie attendee travel (`attendee_travel_details`) vs Planner flights/hotels; Bendie Agenda vs Planner Production; event roles vs Planner permissions.

### 1.4 Entitlement effects [SC]

- **Org has neither product** → `/portal` redirects to `/portal/no-product` ("No product set up yet"); creation dialog shows a no-entitlement message.
- **Org has one product** → product switcher is a static label; the create dialog skips the Products step and auto-selects it.
- **Org has both** → two-segment switcher in the header; create dialog shows a Products step (Bendie / Bendie Planner / Both), nothing preselected unless a product hint is passed.
- Entitlement is re-checked client-side when the create dialog opens (UX only); the `create_event_with_products` RPC is authoritative.
- Direct-URL access to a tab whose product is not active on the event shows "This isn't available for this event", or redirects to the other product's entry tab if that one is active (§6.5).

---

## 2. Person / user model

The implementation keeps **six separate person concepts**. They are not merged anywhere. [SC]

| Concept (user-facing name) | Table(s) | Database | Scope | What it grants |
|---|---|---|---|---|
| **Account / profile** | `profiles` (`global_role`: `admin` = platform admin, else e.g. `attendee`) | Portal | Global | Login identity. `global_role='admin'` = platform admin everywhere. |
| **Organisation People** | `organization_members` (`role`: owner / admin / member ["Employee"] / attendee / facilitator ["External Facilitator"] / staff) | Portal | Organisation | Portal admission (middleware requires ≥1 membership unless platform admin); org owner/admin = org management + event creation + Planner-permission administration. |
| **Teams** | `teams`, `team_members` | Portal | Organisation | Nothing. A reusable grouping used only as a source in "Add Attendees → From team". |
| **Attendees & Access** (route `members`) | `event_members` (`role`: host, organizer ["Organiser"], admin, facilitator, staff, attendee, speaker; `onboarding_status`) | Portal | Event | Event workspace access (any row), Bendie eligibility (any row can be issued an access code), and — for host/organizer/admin — event management rights. |
| **Participants** (route `planner-people`) | `passengers` (global person record) + `event_passengers` (link) | **Planner** | Global record, event link | Something to attach flights / hotels / ground-transport assignments to. Grants **no** access to anything. |
| **Planner Team & Access** | Planner `profiles` + `event_user_assignments` (7 view flags, 3 manage flags) | **Planner** | Event | Ability to see/use Planner modules (§24). |

Plus: **Speakers** (`facilitators`) — an event-scoped directory row that may or may not be linked to an account (`user_id`, `claim_status`). [SC]

**Relationships confirmed** [SC]:
- `organization_members.user_id → profiles.id`; `team_members` → `teams` (org-scoped) and → `profiles`.
- `event_members (event_id, user_id)` → `profiles`; carries `organization_id`. No FK to `organization_members` (an event member is normally also an org member, but the People-page CSV and Add-People flows create both).
- `passengers`/`event_passengers` have **no FK** to `profiles` or `event_members`. The only linkage is **exact, lowercased email matching**, used in three places: Feature 001 travel pull, the Participants CSV importer, and "Add Participant → From Bendie Attendees / From organisation". A "Bendie Attendee" badge appears on a Participant row only on an exact email match. [SC]
- `event_user_assignments` is created only through the Planner-permissions routes (enable / PATCH) or Feature 001's role-based staff sync. Becoming a Participant never creates one. [SC]

**Practical examples** [INF from source]:

| Person | Organisation People | Attendees & Access (`event_members`) | Participant | Planner Team & Access |
|---|---|---|---|---|
| Attendee using Bendie | usually yes (Add-People creates/links the account to the org) | yes, role `attendee`, access code sent | optional | no |
| VIP whose travel is managed but who does not use Bendie | not required | not required | **yes** ("Add new participant" or CSV) | no |
| Production staff using Planner | yes | yes (role e.g. `staff`) — today the only place to grant Planner access is a row action on this list (§9.2) | optional | **yes** (Viewer/Manager/Custom) |
| Event manager using both | yes, typically org admin | yes, role host/organizer/admin | optional | yes; org owners/admins also get Portal-side admin override on People/Logistics/Production |
| Organisation person not on an event | yes | no | no | no — they see the event in lists but entering it shows "You don't have access to this event" (unless org admin, §24) |

---

## 3. Global application shell

Rendered by `src/app/portal/layout.tsx` for every `/portal/*` route. Providers: Organization → Product → AvailableProducts → Event → Confirm → CreateEvent. [SC]

```
┌──────┬──────────────────────────────────────────────────────────────────────────────┐
│ 72px │ HEADER (sticky, min 72px): [☰ touch only] [🏢 Org ▾] | [● Bendie][Bendie Planner] │
│ rail │                 [🔍 Search experiences…] [🔔] [⚙] | [avatar ▾] [+ New Event]   │
│ (ex- ├──────────────────────────────────────────────────────────────────────────────┤
│ pands│ MAIN (p-4 / sm:p-6, scrolls)                                                  │
│ to   │   page content                                                                │
│ 280) │                                                                               │
└──────┴──────────────────────────────────────────────────────────────────────────────┘
```

### 3.1 Sidebar (`OrgSideNav`) [SC]
- **Header:** Bendie logo (`/bendie.png`), "Bendie Studio", and the current organisation name underneath.
- **Items (7):** Overview (`/portal`), Events (`/portal/events`), People, Assets, Teams, Activity Log, Settings. Footer: **Help** (a `mailto:` link to the dev-team address) and **Logout**.
- **Collapsed state:** on hover-capable desktops (`desk` = ≥1024px **and** `hover:hover` **and** `pointer:fine`) the layout reserves a 72px icon rail.
- **Hover expansion:** a pure-CSS panel widens to 280px **over** the content (no reflow) after a 120ms hover delay; collapses after 250ms; also expands on keyboard focus (`:has(:focus-visible)`). Labels fade in. No tooltips. No pinned/expanded preference.
- **Touch devices and <1024px:** off-canvas 280px drawer opened by the header ☰ button; closes on route change or backdrop tap.
- **Active item:** rounded tile with `primary/10` tint + primary icon/text + `aria-current="page"`. Always Bendie blue (never orange). "Overview" is active on `/portal`, `/portal/bendie`, `/portal/planner`; "Events" is active on the three event lists **and inside any event workspace**; others are exact-match.

### 3.2 Header (`TopHeader`) [SC]

| Control | Behaviour | Scope |
|---|---|---|
| ☰ menu | Only below `desk`. Opens the sidebar drawer. | Global |
| **Organisation selector** | Neutral pill (`corporate_fare` icon + name, 240–400px wide). A dropdown only if the user has >1 organisation; otherwise a static label. Dropdown includes "New Organisation" for platform admins only (platform admins with one org get a separate "+ New Organisation" text button, hidden below `sm`). Switching org inside an event workspace navigates to the new org's product home. | Organisation |
| **Product switcher** | Two segments "Bendie" / "Bendie Planner" only if the org has both; otherwise a static icon+label. Selected segment: white, accent text, ring, coloured dot (`aria-pressed`). Below `sm`: an `apps` icon dropdown. In an event, switching re-checks whether the event has the target product and routes accordingly. | Product |
| **Product environment** | When a product context resolves from the URL: a 2px accent strip at top, a 3.5% tint, and accent bottom border (blue for Bendie, orange for Planner). Org-global pages (People, Teams, Assets, Settings, Activity Log) are neutral. | Product |
| **Search** ("Search experiences…") | ≥`md`: inline field; below: icon → popover. Searches **events only** (name/location, client-side over the org's loaded events, max 8 results). Enter/click goes to `/portal/events/{id}/dashboard`. | Organisation |
| **🔔 bell** (aria-label "Recent activity") | Dropdown of the latest org activity (`useRecentActivity`, limit 10), unread dot, "View all activity" → `/portal/activity-log`. **Not** push notifications. | Organisation |
| **⚙ settings** | Link to `/portal/settings`. No aria-label. | Organisation |
| **Avatar ▾** | Menu shows the email and **Logout** only. No profile/account page exists. | Global |
| **+ New Event** | Only for platform admins or owner/admin of the current org. Opens the guided create dialog directly (current product passed as a changeable hint). Icon-only below `sm`. Always Portal-blue regardless of product. | Organisation |

### 3.3 Scope summary [SC]
- **Global:** sidebar, Help, Logout, avatar menu.
- **Organisation-scoped:** org selector, search (org's events), bell, New Event, Settings, all sidebar destinations' data.
- **Product-scoped:** product switcher, header environment colour, Overview/Events routes (`/portal/bendie*`, `/portal/planner*`).
- **Event-scoped:** everything inside the event workspace (§6).

---

## 4. Organisation-level experience

Routes: `/portal` (redirect), `/portal/bendie`, `/portal/planner` (Overview), `/portal/events` (redirect), `/portal/bendie/events`, `/portal/planner/events`, `/portal/people`, `/portal/assets`, `/portal/teams`, `/portal/activity-log`, `/portal/settings`, `/portal/no-product`, `/portal/no-access`. All [SC], all SOURCE-TRACED — NOT VISUALLY VERIFIED.

### 4.1 Overview / Dashboard — see §5.

### 4.2 Events (`/portal/{bendie|planner}/events`)
- **Purpose:** list every event of the current product in this organisation. **Primary user:** org admins/event managers.
- **Layout:** page title "Bendie Events" / "Bendie Planner Events" + subtitle "Every … event in your organisation." + "+ New Event" (if permitted), then the shared **Events Overview** table card (§5.3) without its footer link.
- **Data:** `events` filtered by `event_products.product_key` (inner join), ordered by `starts_at` desc; per-row people count and a progress % from `eventStats` (§5.4).
- **Filters:** tabs All / Draft / Upcoming / Live (derived lifecycle). **No text search** on the page (header search covers events). No sorting, no pagination.
- **Create:** opens the guided create dialog. **Edit/delete:** none here (status is edited on Basics; there is no event delete anywhere in the UI [SC]).
- **Empty:** "No Bendie events in this view yet." + "Create Event" (if permitted). **Loading:** 3 skeleton rows. **Error:** fetch errors are logged; the list shows empty.
- **Responsive:** Location hidden <`sm`, People hidden <`md`; table scrolls horizontally.
- `/portal/events` itself only redirects to the default product's list.

### 4.3 People (`/portal/people`) — "Organisation People"
- **Layout:** title "People", subtitle "N people, M organisation admins"; header buttons **Import CSV** (secondary) and **Add Person** (primary); a search box (name/email); then a table card titled "Organisation People" (which has its own "+ Add Person" text button — a second add control).
- **Columns:** Person (avatar, name, email, ✏️ edit) · Org Role (pill, hidden <`sm`) · Events (dropdown "N events ▾", hidden <`md`) · **Portal Access** ("Make Admin" / "Revoke Admin" text button; "(you)" for self) · Last Active · remove icon.
- **Add Person modal** (`max-w-md`, custom shell): tabs **Search Existing** (search accounts by email, "Add" adds as org role `member`) and **Create New User** (name, email, org role; calls `/api/admin/create-user` — **platform-admin only** server-side; no email is sent).
- **Edit:** ✏️ opens "Edit Profile" (avatar URL, name, email, phone, job title, bio).
- **Events dropdown:** per-event Add (inline role picker + "Send Bendie access code" checkbox + Confirm) / Remove. Uses the shared `addPersonToEvent` service.
- **Remove:** confirm "Remove from organisation?" → deletes the `organization_members` row **and all their `event_members` rows in this org**.
- **"Make Admin"** sets `profiles.global_role = 'admin'` — i.e. **platform admin**, not org admin. The column is labelled "Portal Access". [SC] (RLS decides whether it succeeds.)
- **Import:** "Import People" (columns: Full Name, Email*, Org Role, Event Slugs) — creates missing accounts via `/api/admin/bulk-create-users` (platform-admin only) and adds events with a hard-coded event role `attendee` (direct insert, not the shared provisioning service). [SC]
- **Empty:** "No one in this organisation yet." **Loading:** skeleton. **Pagination:** none — all members load at once (§28).

### 4.4 Assets (`/portal/assets`)
- Shared image library for the organisation. Title + description "Upload images here, then pick them from the Hero & Branding tab on any event." One action: **Upload Assets** (multi-file, `image/*` only).
- Grid of cards (2/3/4 columns): thumbnail, file name, size, "Copy URL", "Delete" (confirm warns that Hero fields using it will break).
- No search, folders, rename, alt text, or permission gating in the UI (RLS governs). Empty: icon + "No assets yet" + explanation (no button in the empty state; the header button is the action).
- Consumed by the **Asset Picker** in Hero & Branding, Activities, Excursions, Event Photos (via `ImageField`/`AssetPickerModal`). [SC]

### 4.5 Teams (`/portal/teams`)
- Title + description pointing to "Attendees & Access page (Add People → From team)". Note the button there is now labelled "Add Attendees" (§19).
- Org owner/admin (or platform admin): **Create Team** (modal: name*, description), card **Delete** icon, card **Manage Members** button (modal: current members with Remove, then "Add People" search over org members with Add).
- Non-admins: read-only cards + hint "Creating, editing, or deleting a team requires organisation owner or admin access." They cannot open the member list (Manage Members is hidden). [SC]
- Cards: name, 2-line description, member count. Empty: icon, "No teams yet", explanation, Create Team (admins).

### 4.6 Activity Log (`/portal/activity-log`)
- "Who did what, and when — organisation-level changes (Teams and Assets)." Refresh button; filters "All Areas" (friendly table names) and "All Actions / Added / Updated / Removed"; "N entries".
- Rows: avatar, "**Actor** action-sentence", optional headline, "Area · date". Click to expand a human "Changes" list (old → new). Platform admins additionally get a nested "Technical details" raw JSON disclosure.
- Paginated 30/page with Previous/Next. Empty: "No activity logged yet".

### 4.7 Settings (`/portal/settings`)
- Subtitle "Manage portal access and organisation details." Content: one card "Organisation" showing **Name** and **Slug** read-only. Nothing is editable. [SC]

### 4.8 Edge states
- `/portal/no-access`: "No organisation yet … Ask an administrator to add you" + Log out (middleware sends members with zero org memberships here).
- `/portal/no-product`: "No product set up yet" (no switcher, no events). Sidebar pages remain reachable.
- `/unauthorized` (legacy): "This portal is restricted to global administrators only." — stale copy; nothing in current routing sends users there [INF].
- `/` (root, outside `/portal`): legacy "Event Content Portal" welcome screen with `blue-600` styling [SC].

---

## 5. Organisation dashboard (Overview)

Route `/portal/bendie` or `/portal/planner` (both render `OrganizationHome` with a `product` filter). `/portal` redirects to the default product (Bendie if entitled, else Planner). [SC] SOURCE-TRACED — NOT VISUALLY VERIFIED.

### 5.1 Structure (top to bottom)

```
[✦ icon] Good {morning|afternoon|evening}, {first name}.
Here's what's happening in {Org name}.
📅 N events   👥 N people   🪪 N organisation users

┌ Organisation People ┐┌ Active Events ┐┌ Upcoming Events ┐┌ Shared Speakers ┐   (4 metric cards; 1/2/4 cols)

┌──────────── 8/12 ────────────┐ ┌──── 4/12 ─────┐
│ Events Overview (table)      │ │ Next Milestone │
│  tabs All/Draft/Upcoming/Live│ │ Needs Attention│
│  View all events             │ │ Recent Activity│
├──────────────────────────────┤ │ Quick Actions  │
│ Organisation People (top 5)  │ └────────────────┘
└──────────────────────────────┘
```

### 5.2 Every data point and its source [SC]

| Element | Source | Clickable? |
|---|---|---|
| Greeting name | first word of `profiles.full_name` (or email) | No |
| Organisation name | `OrganizationContext` | No |
| "N events" | count of this product's events (`useOrgEvents`) | No |
| "N people" | `organization_members` count (all roles) | No |
| "N organisation users" | `organization_members` with role owner/admin | No |
| **Organisation People** card | same as "N people"; trend text "Across your organisation" | No |
| **Active Events** card | events whose derived lifecycle = `active` ("Live"); trend "N live right now" | No |
| **Upcoming Events** card | lifecycle = `upcoming`; trend "Next event in N days" / "None scheduled" | No |
| **Shared Speakers** card | value = number of **distinct** speakers (by `user_id` or email) across this product's events; trend = how many appear in more than one event | No |
| Events Overview | §5.3 | Event name cell links into the event |
| Organisation People (preview) | latest 5 `organization_members` | "+ Add Person" opens the Add Person modal. The **Events** column shows "—" and the **Portal Access** column is empty in this preview (those actions are only wired on the People page) |
| Next Milestone | earliest `upcoming` event: name, "Days left", "Setup Progress" % (§5.4), date range, location | "Manage Event" → event entry tab |
| Needs Attention | §5.5 | **No** — informational only |
| Recent Activity | latest 5 `event_content_audit_log` rows across this product's events, phrased "Actor added the agenda" (older formatter `formatAuditAction`, not the newer `activityPresentation` used on Activity Log pages) | No |
| Quick Actions | "Create Event" (if permitted), "Add Person" (modal), "Assign People" (→ `/portal/people`) | Yes |

Note: Speakers, Needs Attention (emergency contacts, agenda speaker gaps) and Recent Activity are all derived from **Bendie tables**, including on `/portal/planner`. [SC]

### 5.3 Events Overview table [SC]
Columns: Event (event-type icon, name, start date) · Location (≥sm) · People (≥md; `event_members` count) · Progress (bar + %) · Status (lifecycle pill). Tabs All / Draft / Upcoming / Live; "All" also includes completed/archived. Footer "View all events" → `/portal/events` (redirect). Rows link to `…/dashboard?product=bendie` or `…/planner-overview?product=planner`. No search, sort or pagination.

### 5.4 How "progress" is calculated at organisation level [SC]
`eventStats.getEventStatsMap`: 8 equal checks (12.5% each) — `description`, `location`, `hero_image_url`, `theme_primary` are set; and at least one row exists in `facilitators`, `agenda_sessions`, `emergency_contacts`, `faqs`. Rounded to a whole %.
- This is **not** the model used by the event Dashboard, which removed percentages in favour of Required / Recommended / Optional readiness (§8.1). Planner data and module selection never contribute here.
- Counting selects every matching row client-side; PostgREST's default 1,000-row cap can silently undercount in large organisations (deferred, §28).

### 5.5 How "Needs Attention" is derived [SC]
Computed client-side on page load:
1. For each event of this product that is not completed/archived and has **no** `emergency_contacts` row → "Emergency contacts missing — {event}: no emergency contacts configured" (max 3).
2. One aggregate item if any `agenda_sessions` across the product's events has `facilitator_id IS NULL` → "Speaker Gaps — N agenda sessions with no speaker assigned".
Nothing to show → green "You're all caught up". Items do not link to the event.

### 5.6 Lifecycle labels (`deriveEventLifecycle`) [SC]
`events.status` is manual (draft / published / active / completed / archived), edited on Basics. Display derives: draft, archived, completed as stored; `active` → **Live**, or **Completed** once `ends_at` has passed; `published` → **Upcoming** (future start), **Live** (within dates), **Completed** (past end), or **Published** (no dates). Used identically by Events lists, Overview counts and the workspace status pill.

---

## 6. Event workspace shell

`src/app/portal/events/[eventId]/layout.tsx` (`EventLayout`). SOURCE-TRACED — NOT VISUALLY VERIFIED.

### 6.1 Hierarchy

```
GLOBAL SHELL (sidebar + header)
 └─ EVENT        "← All Events" · event name (h1) · [⚙ Manage modules] [STATUS]
     └─ EVENT AREA     Level 1 — flat underline links:
     │                 Overview  Event Setup  Programme  Attendees  Content  Media  Operations | PLANNER  Participants  Planning  Logistics  Production
     └─ CHILD MODULE   Level 2 — AREA NAME · one-line description · "Step 2 of 4"
     │                 (1)──(2)──(3)──(4) numbered stepper with labels
     └─ RECORD / EDIT  page content: SectionHeader, lists/tables, modals (the only scrolling region)
     └─ Level 4 — [← Previous: …]                                   [Next: … →]
```

### 6.2 Event header block [SC]
- **"← All Events"** → `/portal/events`, which redirects to the default product's list (not necessarily the product the user was in [INF]).
- **Event name** as `headline-lg` h1, truncating; "Loading…" while loading.
- **Manage modules** pill (`tune` icon) — shown on every tab once the event's products resolve; opens §13. Not hidden from users who cannot save (the save then reports a permission message).
- **Status pill** — derived lifecycle. Not clickable.
- There is **no product-type badge** (Bendie / Planner / Both) in the event header. Product identity comes from the header environment colour, the switcher, and the presence of the "PLANNER" divider. [SC]

### 6.3 Level 1 — Event Areas [SC]
- Built from `EVENT_SECTIONS` → filtered by product availability, per-module Planner capability and module selection → grouped by `group` in first-appearance order, with **Overview forced first** and any area made only of "shared" pages (Operations on a Planner-only event) forced last.
- ≥`md`: a horizontal row of plain text links; active link has a 2px underline and bold text in the product accent (Bendie blue / Planner orange; mixed areas follow the current context). Overflow → chevron buttons + horizontal scroll; vertical overflow suppressed. Active link auto-scrolls into view on navigation.
- On a Both event, a thin divider and a small orange "PLANNER" label sit before the first Planner area.
- <`md`: replaced by an "EVENT AREA" `<select>`; Planner areas are suffixed "(Planner)".
- Each area link targets that area's first visible page. Only rendered when there are ≥2 areas.

### 6.4 Level 2 — Current area [SC]
- Uppercase accent heading + description (`EVENT_GROUP_DESCRIPTIONS`).
- Areas with ≥2 visible pages: "Step X of N" plus a numbered stepper (circles joined by short lines). Current = filled accent circle + bold label on a tinted pill; previous = outlined accent; upcoming = grey outline. Below `sm` only the current label is shown (others are numbers only). **No checkmarks, no completion state.**
- Single-page areas (Participants, Logistics, Production): heading + description only.
- Overview on a Both event: plain links "Dashboard · Planner Overview".

### 6.5 Loading, access and redirects [SC]
1. Workspace access unresolved → skeleton (title bar + 3 rows).
2. Access denied → lock screen "You don't have access to this event … requires being added as an event member" + "Back to Events".
3. Planner capabilities still resolving (one `/planner-capabilities` request) → the area row shows 3 pill skeletons; the nav never renders partially.
4. Active tab still pending → 3 skeleton rows in the content area. Route-level `loading.tsx` shows a content-only skeleton inside the persistent layout.
5. Tab unavailable → "This isn't available for this event — This section belongs to a product that isn't currently active for this event's organisation."
6. Redirects: Both event + `?product=planner` on Dashboard → Planner Overview; a tab whose product is inactive while the other product is active → the other product's entry tab; entry tabs missing `?product=` get it backfilled.

### 6.6 Level 4 — Previous / Next [SC]
- In-flow footer under the scroll region. Previous = secondary button "← Previous: {label}"; Next = primary button "Next: {label} →". Crossing an area boundary adds the area: "Next: Content — News Feed". "Previous:/Next:" words hidden <`sm`; each button ≤48% width, truncating.
- Sequence = every visible page of every non-Overview area in nav order (product-, permission- and module-aware). Hidden on the Dashboard (which has "Recommended next"). From Planner Overview, Next = first Planner page.

### 6.7 Scrolling [SC]
Event header and both nav levels are fixed; only the content region scrolls; the Previous/Next footer stays pinned beneath it.

---

## 7. Current main event areas

Derived from `EVENT_SECTIONS` — **31 sections** in 11 areas. [SC]

| # | Area | Product | Child modules (route key) | Default child | Description shown | Stepper |
|---|---|---|---|---|---|---|
| 1 | **Overview** | mixed | Dashboard (`dashboard`, Bendie) · Planner Overview (`planner-overview`, Planner) | hub of current product | "Your event at a glance." | plain links |
| 2 | **Event Setup** | Bendie | Basics · Hero & Branding (`hero`) · Theme Colors (`theme`) · Terminology | Basics | "The basics, branding and wording of your event app." | 4 steps |
| 3 | **Programme** | Bendie | Speakers (`facilitators`) · Agenda · Activities · Excursions | Speakers | "What happens at your event — sessions, speakers and experiences." | ≤4 |
| 4 | **Attendees** | Bendie | Attendees & Access (`members`) · Attendee Travel · Networking | Attendees & Access | "Who is coming, how they get in, and their travel and networking." | ≤3 |
| 5 | **Content** | Bendie | News Feed (`news`) · FAQs · Info Center · Expo Directory (`expo`) | News Feed | "Information attendees read in the app." | ≤4 |
| 6 | **Media** | Bendie | Gallery · Event Photos · Files | Gallery | "Photos and files for attendees." | ≤3 |
| 7 | **Operations** | Bendie + shared | Emergency · Games · Notifications · Activity Log · Bendie Planner (`bendie-planner`, shared) | Emergency | "Safety, engagement and admin tools for running the event." | ≤5 |
| 8 | **Participants** | Planner | Participants (`planner-people`) | — | "The people you manage travel and logistics for." | single |
| 9 | **Planning** | Planner | Tasks · Vendors · Checklist | Tasks | "Tasks, suppliers and sourcing for your event team." | ≤3 |
| 10 | **Logistics** | Planner | Logistics (`planner-logistics`; internal Flights / Hotels / Ground Transport sub-tabs via `?view=`) | — | "Flights, hotels and ground transport." | single |
| 11 | **Production** | Planner | Production (`planner-production`) | — | "Run-of-show for each session." | single |

Visibility rules [SC]:
- Bendie sections require Bendie on the event. `bendie-planner` is "shared": always in the nav, but its page is platform-admin-only (others see a lock screen).
- Each Planner page requires its own capability `canView`; Planner Overview requires Planner on the event.
- Module selection (§13) hides unchosen optional modules; the page you are on always stays visible.
- **Order on a Both event:** Overview · Event Setup · Programme · Attendees · Content · Media · Operations · PLANNER · Participants · Planning · Logistics · Production. (Operations contains Bendie pages, so it stays with the Bendie areas.) **Planner-only:** Overview · Participants · Planning · Logistics · Production · Operations (Bendie Planner only).
- No completion behaviour in the nav; readiness exists only on the Dashboard (§8.1).

Discrepancy with older docs: the pre-016 audit (`context/portal-ux-current-state-audit.md`) describes a flat 20+ tab strip, a floating "Next: {label}" button and Planner tabs appended to one row. All three are gone. [SC]

---

## 8. Bendie event module audit

All 24 Bendie-side modules below are SOURCE-TRACED — NOT VISUALLY VERIFIED. Common facts, stated once [SC]:
- Every page except Dashboard and Agenda starts with `SectionHeader` (coloured 44px icon badge + `headline-md` title + one-line description, often replaced by a live count like "12 speakers for this event").
- Data is read/written directly with the browser Supabase client under RLS. There is no page-level permission gate on most Bendie content pages; RLS decides whether writes succeed (exceptions: Attendees & Access, Bendie Planner).
- Create/edit is a centered `FormModal` (default `max-w-3xl`, `max-h-[90vh]`, scrolls internally; **clicking the backdrop closes it without confirmation**). Delete goes through the shared confirm dialog.
- After any save/delete the page refetches its list (no optimistic updates, except Tasks inline status §9.4).
- Loading = grey pulsing blocks; load failure = toast "Failed to load …" (the page then shows its empty state).
- "Apply to all events" (News, Expo, Excursions/categories) writes `event_id = NULL`: such rows show on **every** event and display a "Global" tag. [SC]

### 8.1 Dashboard (`dashboard`) — Overview area

- **Purpose:** event readiness hub for Bendie, plus a Planner summary when applicable.
- **Layout (top→bottom):** a second, larger page title (the event name again, `text-3xl`) + subtitle "Select a section to edit event content"; Planner provisioning banner (amber, only while pending/failed; Retry button only when failed); **Event readiness** card with three columns; blue **Recommended next** callout; grid of 5–6 **area cards**; **Planner Readiness** list (Planner/Both only).
- **Event readiness:**
  - *Required* (✓ only here): "Event name and dates" (name + `starts_at`) and "At least one attendee with access" (≥1 `event_members` row with role **`attendee`** specifically). "N of 2 done".
  - *Recommended*: Hero & Branding, Agenda, Emergency, plus every module chosen for the event — pills "Label · Has content / Not started". "N of M have content".
  - *Optional*: every other visible scored section, inside a collapsed `<details>` "Show optional sections".
- **"Has content" rules (`SECTION_CHECKS`):** Basics = description **and** location; Hero = hero title **and** hero image; Theme = primary colour set; Terminology = singular speaker label **or** theme label; count-based sections = ≥1 row (News/Expo/Excursions also count global rows). Not scored: Attendee Travel, Gallery, Event Photos, Attendees & Access (scored separately as Required), Notifications, Files, Activity Log, Bendie Planner, all Planner tabs.
- **Recommended next:** first unmet Required item, else first Recommended section without content (never Optional); plus one Planner recommendation in dependency order: add participants → flights → hotels → ground transport → outstanding tasks → unsourced checklist → vendors not on-site → empty production. Links carry `?product=planner`.
- **Area cards:** Event Setup, Programme, Attendees ("Members, attendee travel and networking"), Content & Media (merged), Operations; status pill "Not started" / "N of M have content" / "No setup needed"; each links to the first section without content. Plus a "Bendie Planner" card ("People, logistics and production", "N of M modules started").
- **Planner Readiness:** rows Participants · Flights ("N configured") · Hotels · Ground Transport ("N unassigned"/"All assigned") · Tasks ("N outstanding") · Checklist ("N unsourced") · Vendors ("N not on-site") · Production ("N sessions"); "Not available" when the user can't view a module. Source: one `/planner-readiness` request (server-side counts). "View Planner details →".
- **Density:** medium. **Styling:** uses raw Tailwind `gray-*`/`blue-*` utilities rather than the Portal tokens used elsewhere; loading is a blue spinner.
- **Bendie app relationship:** none directly — summarises other modules.

### 8.2 Event Setup

**Basics (`basics`)** — single-record form in one white card (4-column grid on `lg`). Fields: Event Name *, Slug, **Status** (Draft / Published / **Active** / Completed / Archived), Event Type (Conference / Team Building / Hybrid), Attendee Limit, Description, Location, Start/End Date & Time (`datetime-local`), Networking Mode (Full / Attendees Only / Disabled), "Interests Enabled", "In-House Event", then **Hide Menu Items** checkboxes (Excursions, Expo Directory, News Feed, Interactives (Games), Event Photos, Files, Feedback, Info Center — writes `disabled_menu_items`, which hides items in the **attendee app**). Save: "Save Changes" + `SaveStatus` (Unsaved changes → Saving… → ✓ Saved / Couldn't save + Try again); `beforeunload` warning while dirty; no in-app navigation guard. No field-level validation (name not checked client-side). Controls attendee-app event identity, dates, menu, networking. Cancels its load on leave.

**Hero & Branding (`hero`)** — single form: Hero Title, Hero Description, four `ImageField`s (Hero Image, Event Card Image, Profile Banner Image, Gallery Background Image — each URL text + upload/browse via Asset Picker), External Gallery URL. Same Save + `SaveStatus` pattern. Controls the attendee app's home hero and image surfaces.

**Theme Colors (`theme`)** — summary page + Theme Designer modal. See §11.

**Terminology (`terminology`)** — single form in three sections: *Speaker Labels* (Singular, Plural), *Event Classification* (Category Label, Theme Label, Theme Icon emoji), *External Links* (Feedback Form URL). Same Save + `SaveStatus`. The section description in navigation reads "Labels, icons, feature toggles" although the page contains no feature toggles [SC]. Controls attendee-app labels for speakers and the feedback link.

### 8.3 Programme

**Speakers (`facilitators`)**
- Layout: header (count) + **Import CSV** + **Add Speaker**; search box (name/email/title/org/group/expertise) shown once speakers exist; **compact single-line rows** (~56–60px: avatar, name, "title · organisation", group; raw `claim_status` pill e.g. "claimed"/"unclaimed" ≥sm; Edit; Delete).
- Create/Edit modal (2 columns ≥sm): Full Name * (field-level error), Email (field-level format error), Job Title, Organisation, Speaker Group, Role Type (Speaker / Presenter — "Drives the Speakers vs. Presenters tabs in-app"), LinkedIn URL, Expertise, Bio, Avatar URL (text; preview avatar). Buttons "Add Speaker"/"Update" + Cancel. **No Save & Add Another, no Duplicate, no reordering UI** (order = `display_order` at insert).
- Empty state (the richest Bendie one): icon, "No speakers have been added yet", explanation, **Add Speaker** + **Import or paste**.
- CSV: "Import Speakers" (Full Name*, Email, Job Title, Organization, Speaker Group, Role Type, LinkedIn URL, Expertise, Bio, Avatar URL); accepts legacy `facilitator_group`.
- Also fed by Attendees & Access "Add to Speakers". Controls the attendee app's Speakers/Presenters tabs. Cancels its load on leave.

**Agenda (`agenda`)** — see §10.

**Activities (`activities`)**
- Header count + Import CSV + Add Activity. **No search.** Two-column card grid on `lg`: title, "Featured" badge, location, "Rating: x/5"; actions Feature/Unfeature, Edit, **Duplicate** (copy icon), Delete; clicking a card edits.
- Modal: Title *, Description, Location, Rating (0–5, step 0.5), Display Order (number), Featured; **Hero Image** (ImageField + alt text); **Gallery Images** list (add, reorder ↑↓, remove, alt text). Buttons Add Activity / **Save & Add Another** (keeps Location) / Cancel.
- Duplicate opens a prefilled unsaved form ("Title (Copy)"), images not copied — the **only** Duplicate in the Portal.
- Empty: "No activities yet." + "Add one manually, paste from a spreadsheet, or import a CSV." (no buttons in the empty state).
- CSV: Title*, Description, Location, Rating, Featured (images excluded). Image save failures surface raw error text in toasts.

**Excursions (`excursions`)**
- Master–detail: left "Categories" list (cards with icon, label, "Global" tag, Edit/Delete links); right panel "Select a category to manage its excursions" until one is chosen, then "{Category} — N excursions" + Add Excursion + list (thumbnail, title, Global tag, description, Edit/Delete).
- Header primary action is **New Category**; Add Excursion only appears after selecting a category.
- Category modal (`max-w-md`): Label *, Icon (emoji or Ionicons name), Apply to all events. Deleting a category with excursions deletes them too (confirm states the count).
- Excursion modal (`max-w-lg`): Title *, Description, Image (ImageField/Asset Picker), Apply to all events; **Save & Add Another**.
- CSV: Category* (label, created if new), Title*, Description, Image URL.

### 8.4 Attendees

**Attendees & Access (`members`)**
- Access gate: page-level check `is_event_host_or_organizer` (or platform admin); others see "You don't have access to this page — Managing attendees and access requires the host, organizer, or admin role".
- Header: count "N people on this event" + **Add Attendees ▾** menu: From organisation · From team · *Invite new attendee* · *Import CSV* (these two only for platform admins) · divider · Add all organisation people. Non-platform-admins see a hint that creating accounts is a platform-administration function. A second hint: "People who are part of this Bendie event and their access."
- Role chips with counts (toggle filter) + search + "All Roles" select.
- Table (min-width 720px, horizontal scroll): **Person** (avatar, name, email, ✏️ Edit Profile) · **Event Role** (coloured pill `<select>`, changes save immediately) · **Bendie Access** (static "Eligible" for every row) · **Onboarding** (raw `onboarding_status` value, ⓘ tooltip; no write path exists) · **Actions**: "Add to Speakers" (or "Already a speaker"), "Resend Code" (confirm → new code + email), "Team & Access" (only if the user can administer Planner and the event has Planner), "Remove" (confirm). Footer "Showing X of Y".
- Add flows (`FormModal` max-w-lg, multi-step): select people → **Event Role + Product Access** config (Event Role select; Product Access: Bendie checkbox "Send access code"; Planner None/Viewer/Manager pills or an explanatory note if the user can't administer Planner) → per-person results list. From team adds a preview step with deselection; Add all shows total / already-in / will-add counts.
- CSV "Import Attendees" (template file still named `event-team-template.csv`): Email*, Full Name, Event Role, Bendie Access (yes/no, default no), Planner Access (none/viewer/manager).
- Empty: "No one on this event yet." (no actions in the empty state).
- Controls who can use the Bendie app (access codes) and event-role-based management rights. Cancels its load on leave.

**Attendee Travel (`attendee-travel`)**
- Optional blue guidance banner (Both events only): "Using Bendie Planner for this event? Set up participant travel in Planner first, then pull…" → **Set up in Bendie Planner** (→ Logistics / Flights, starts a guided round trip) and **Pull from Bendie Planner**. After returning: "Travel setup in Planner complete?" variant. The pull endpoint (`/api/admin/planner-pull-travel`) is **platform-admin only**, so for other users the button returns a "Forbidden" toast [SC].
- Master–detail: left "Attendees" list with search (all `event_members`, any role); right "Select an attendee to manage their travel details" → "{Name} — N entries" + **Add Entry** + entry cards (type icon, "Flight/Ground Transfer/Other", "From Planner" badge for pulled rows, route, "Departs date · time", "Journey time: …", pickup info; Edit hidden for pulled rows; Delete).
- Modal: Type, Title, Date (free text), **Departure time** (free text, hint "Attendees see this as 'Boarding Time'"), Route, Origin, Destination, **Journey time**, Pickup Vehicle, Pickup Location.
- **No CSV, no paste, no Save & Add Another, no bulk.** One person at a time.

**Networking (`networking`)**
- Header desc "Define the interest questions shown to attendees during onboarding" + Import CSV + **Add Question**; search.
- Two-column grid of question cards: label, "Required" tag, **technical key** in `<code>`, type label; actions Make required/optional, + Option (select types), Delete. Options render as pills "Label (key) ×" (× deletes without confirmation); inline Option Key/Label add row.
- Question modal: Question Key * (monospace), Question Type (Multi-select/Single select/Short text/Long text), Question Label *, Required. **No edit of an existing question's text/type.**
- Networking on/off itself lives on Basics ("Networking Mode", "Interests Enabled").

### 8.5 Content

**News Feed (`news`)** — header count + Import CSV + Add Article; **no search**; full-width rows (64px thumbnail, title, Featured/Global tags, summary, date, up to 3 theme chips; Feature/Unfeature, Edit, Delete). Modal: Title *, Summary, Body (plain long text), Image, Themes, Registration URL, Read Time, Published At, Featured, Apply to all events; **Save & Add Another** (keeps Themes). Empty text mentions manual/paste/CSV. CSV with 9 columns.

**FAQs (`faqs`)** — header "N questions across M sections" + Import CSV + Add FAQ; search; grouped by section heading with "+ Add to section"; each FAQ is an accordion (question; expand → answer + Edit/Delete). Modal: Section *, Display Order, Question *, Answer *. Empty "No FAQs yet. Add the first one."

**Info Center (`info-center`)** — two parts: **Welcome Message** card (bullet list editor with reorder/remove/"+ Add bullet"; tag "Global default"/"Event-specific"; "Save for this event"/"Update"; "Revert to global default"); and **Support contacts** list + "Add Contact" (Full Name *, Email, Phone, Group, Display Order, Avatar URL). No CSV.

**Expo Directory (`expo`)** — header "N organisations in the directory" + Import CSV + **Add Organisation** (modal titled **"New Organisation"**); search; rows (thumbnail, name, Global/Exhibitor/Sponsor tags, summary, chips). Modal: Name *, Summary, Image, Chips, Intro, What We're Offering, Contact Name/Email/Phone, Exhibitor, Sponsor, Apply to all events; **Save & Add Another** (keeps Exhibitor/Sponsor). Distinct from Planner Vendors.

### 8.6 Media

**Gallery (`gallery`)** — moderation of photos **posted by attendees** (`posts`). Header "N photos posted by attendees · N hidden". Grid (2/3/4 cols) of photo cards with Hide/Unhide and Delete; a separate "Hidden (N)" section. No add/upload, no CSV. Empty: "No photos posted by attendees yet."

**Event Photos (`event-photos`)** — organiser-curated photos. Add Photo modal (`max-w-lg`): image (upload goes to the organisation Asset library) *, Caption, Display Order. Grid of cards. No CSV.

**Files (`files`)** — documents in a storage bucket. **Upload File** (re-uploading the same name replaces it); list with Open, Copy link, Delete. No metadata fields, no CSV.

### 8.7 Operations

**Emergency (`emergency`)** — segmented tabs "Contacts (N)" / "Safety Images (N)": **Contacts** (two-column cards; modal Name *, Phone *, Type, Location, Description, Image URL) and **Safety Images** ("Add Safety Image" modal: Image URL *, Caption; grid). Always-recommended on the Dashboard; "always included" in module selection. No CSV.

**Games (`games`)** — master–detail: left list of games (+ New Game modal: Title *, Type, Description, Image URL, Background Color); right: questions of the selected game (+ question modal: Question *, Category, Points, Correct Answer, **Answer Options as raw JSON** e.g. `{"a":"Option A"}`). No CSV.

**Notifications (`notifications`)** — Refresh + "New Notification" (modal: Title *, Message *, When: **Send Now / Schedule** + datetime). List with status pills (Scheduled, Sending…, Sent, Failed, Canceled), counts, error text; "Cancel" for scheduled items. No edit, no audience targeting, no CSV. (These are attendee push notifications — distinct from the header bell.)

**Activity Log (`activity-log`)** — event-scoped version of §4.6 (`event_content_audit_log`), "Who did what, and when, for this event", same filters, expandable changes, 30/page, platform-admin-only technical details.

**Bendie Planner (`bendie-planner`, shared)** — platform-admin-only integration panel (others: lock screen "Managing the Bendie Planner integration is a platform administration function"). Link status card (Find Planner Event → browse/search modal → Link; Unlink), then three cards: **Members** (Portal → Planner, automatic for staff-tier roles; per-person sync status), **Agenda** ("Push to Planner", manual), **Travel** ("Pull from Planner", manual, flights & hotels).

---

## 9. Planner module audit

All Planner pages are SOURCE-TRACED — NOT VISUALLY VERIFIED. Shared conventions [SC]:
- **Data source:** Planner database, through `/api/events/[eventId]/planner-*` routes. Each route re-runs the full authorization chain (auth → profile → org → workspace access → event → Planner availability → provisioning phase → active `event_planner_links` → capability) on every request.
- **Page state machine:** loading skeleton → *denied* ("Couldn't load X — You may not have access…") → *configuring* (Planner still provisioning / not linked / backend error — amber or grey info strip with fixed copy) → loaded.
- **Capability gating:** manager-only buttons are **hidden**, never disabled. Viewers see read-only rows.
- **Shell:** `SectionHeader` (orange-50 badge) + header actions; content in a white table card (`rounded-[20px]`, horizontal scroll). Row actions are full **buttons** (`btn-secondary` "Edit", red `btn-danger` "Remove/Delete") — heavier than Bendie's text-link actions.
- **Modals:** `FormModal` `max-w-lg` (Production `max-w-2xl`, Assign `max-w-md`), grids collapse to 1 column below `sm`, **Save & Add Another** on every create modal (never on edit).
- **Loads cancel on leave** (`useLatestRequest`) on every Planner page.

### 9.1 Planner Overview (`planner-overview`)
- Read-only. Three cards: **Event identity** (title, description, location, start/end/setup dates from the Planner event), **Session summary** (big number of sessions + "Event phase: {raw value}"), **Team & Access** (explains that Planner access is granted per person from the Attendees & Access page; "Manage Team & Access" button only if the user can administer Planner; otherwise a note to ask an org owner/admin).
- Non-ready states: "Setting up Bendie Planner for this event…", "taking longer than expected…", "didn't complete…", "hasn't been fully set up…", "Couldn't load…".
- **Planner-only events:** the "Manage Team & Access" link points to `/members`, a Bendie-classified tab; on an event without Bendie, the layout's mismatch rule redirects that URL back to Planner Overview, so Team & Access is effectively **unreachable** on Planner-only events [INF — traced through `planner-overview/page.tsx` → `EventLayout` redirect effect; not run in a browser]. The same applies to the "Manage them under Team & Access" link on Participants.

### 9.2 Team & Access (no tab of its own)
- Lives as a per-row **"Team & Access"** action on Bendie's Attendees & Access table (visible only to platform admins / org owner-admins, and only when the event has Planner). Opens `PlannerPermissionsModal` "Bendie Planner Access — {name}": Enable/Disable access toggle; preset pills **Viewer / Manager** plus an automatic **Custom** indicator; per-module checklist for 7 modules (Overview, Production, Logistics, Tasks, Notifications, Checklist, Vendors) — View for all, Manage only for Tasks/Checklist/Vendors.
- Initial grant can also be set in Add Attendees (None/Viewer/Manager) or the Attendees CSV.
- There is **no roster** anywhere showing who currently has Planner access (deferred, §28).

### 9.3 Participants (`planner-people`)
- Header + **Add Participant ▾** (only when participants exist; in the empty state the same menu moves into the empty card): From Bendie Attendees (Bendie/Both events only) · From organisation · Add new participant · Import CSV.
- Link under the header: "Need someone to work inside Planner? Manage them under Team & Access →".
- Optional "You're setting up travel before continuing in Bendie. [Return to Attendee Travel]" banner (guided journey only).
- Table: **Name** (title + name, gender, "Bendie Attendee" badge on exact email match) · Contact (≥sm) · **Logistics** (Flights / Hotel / Transport status lines + links "Add Flight", "Add Hotel", "Transport" that deep-link into Logistics with the participant preselected) · Passport (≥md) · Dietary (≥lg) · Actions (Edit, Remove).
- Add/edit modal: tabs **New person** (Full Name *, Title, Gender, Email, Phone, Passport, Dietary) / **Search existing** (global passenger search, one-click link). Save & Add Another on New person.
- "From Bendie Attendees / From organisation": multi-select picker, already-linked people marked, per-person result, exact-email match-or-create.
- Remove = unlink from this event only (global record kept).
- CSV "Import Participants": Full Name*, Title, Passport, Dietary Requirements, Gender, Email, Phone (email match → link, else create).
- The Logistics column issues 3 separate requests (flights, hotels, movements).

### 9.4 Tasks (`planner-tasks`)
- Header (managers): Import CSV + **New Task**. Filter row: Status, Priority, Assignee selects.
- Table: Task · Code (≥sm) · **Status** (managers: inline `<select>` that saves immediately, optimistic with rollback; the task's own assignee: status select + remarks with Save/Cancel; others: pill) · Priority (≥md) · Due (≥md) · Assignee · Actions (Edit, Delete).
- Modal "New Task"/"Edit Task": Task *, Category, Priority, Due date, (edit only) Status, Assignee (assignable Planner staff), Remarks. Save & Add Another keeps Category.
- Empty: "No tasks yet for this event." + "Add one manually, paste from a spreadsheet, or import a CSV." (+ a "New Task" button — header button also visible). Filtered-empty message separate.
- CSV: Task*, Category, Priority, Due Date, Assignee (email or exact full name; ambiguous/no match blocks the row), Remarks — posted through the same create route.

### 9.5 Vendors (`planner-vendors`)
- Header (managers): Import CSV + **Add Vendor Item**. Table: Item (category/description) · Quantity (≥sm) · **Packed / Loaded / On-site** checkboxes (instant save; timestamp + actor shown) · Notes (≥lg; inline textarea with Save/Cancel) · Delete.
- Modal "Add Vendor Item" (create-only): Description *, Category, Quantity (free text), Unit, Notes. **Items cannot be edited after creation** except notes and stages. Save & Add Another.
- Empty state shows Add + Import CSV buttons **while the header shows them too** (both visible at zero items) [SC].
- CSV: Category, Description*, Quantity, Unit, Notes, Sort Order.

### 9.6 Checklist (`planner-checklist`)
- Same pattern as Vendors with stages **Sourced / On-site**; columns Item · Quantity/Spec · Day · Owner · Sourced · On-site · Notes · Delete.
- Modal "Add Checklist Item" (create-only): Item Name *, Category, Quantity, Specification, Day Number, Event Day Date, Owner ("Assign to me" default), Notes. Save & Add Another keeps category/day/date/owner.
- Viewers only receive items they own (server-side scoping).
- CSV: Category, Item Name*, Quantity, Specification, Notes, Day Number, Event Day Date, Owner Name (blank → you), Sort Order.

### 9.7 Logistics (`planner-logistics`)
- Header (managers): **Import CSV** (only on Flights/Hotels sub-tabs) + a context button: **Add Flight** / **Add Hotel Booking** / **Add Movement**.
- Optional guided-journey banner ("Return to Attendee Travel"; "No participants yet? Add one from Bendie Attendees first").
- **Summary strip** (when participants exist; 2/4 cards): Participants (N) · Flights ("N configured · M need attention") · Accommodation ("N booked · M need attention") · Ground Transport ("N assigned · M unassigned"); each card switches sub-tab.
- **Sub-tabs** Flights / Hotels / Ground Transport (underline, Portal-blue even in Planner context), stored in `?view=`.
- **Flights table:** Participant · Leg · Flight (≥sm) · Date (≥md) · Depart/Arrive (≥md) · **Confirmed** checkbox (instant) · Edit/Delete. Modal: Participant (fixed on edit; blocked with a "add a participant first" message if none), Leg, Flight Code, Region, Flight Date *, Departure/Arrival Time, Stops, Notes. Save & Add Another keeps the participant.
- **Hotels table:** Participant · Accommodation (Required/Not required) · Hotel/Room (≥sm) · Check-in/out (≥md) · Nights (≥md). Modal: Participant, "Accommodation required" (reveals hotel fields), Hotel Name, Country, Room Number, Rooming Label, Check-in/out, Nights (auto from dates), Special Stay Pattern, Notes.
- **Ground Transport:** nested cards — Movement (name, route, date, pickup) → Vehicles (type #no, occupancy/capacity, status) → assigned passengers (Move, Unassign). Creating a Movement auto-opens Add Vehicle ("Movement created — add a vehicle"); creating a Vehicle auto-opens Assign ("Vehicle added — assign passengers"). Assign modal is **multi-select** (one request per passenger, partial failures named). Move limited to vehicles in the same movement. **No CSV/paste.**
- Initial load = one `/planner-logistics/overview` request; mutations use per-resource routes.

### 9.8 Production (`planner-production`)
- Header (managers): Import CSV + **Add Session**. Table: Session (title, "Parallel" badge) · Date/Time (≥sm) · Type (≥md) · Track/Room (≥md) · Status pill · Edit/Delete.
- Modal "Add/Edit Production Session" (`max-w-2xl`), five sections: **Session Details**, **Programme & Location**, **Production Requirements**, **Additional Details**, **Advanced** (collapsed on create; auto-open on edit when it has values). ~17 fields incl. parallel-parent select, status default "Auto (time-based)". Save & Add Another keeps date/day/track/room. Slide upload is not available: on edit, "Slides on file: {name} (upload management not yet available in Portal)" [SC].
- CSV: 17 columns (Session Title*, Session Date*, …, Status).
- Relationship to Bendie Agenda: none automatic. The platform-admin "Push to Planner" (Bendie Planner tab) pushes Bendie Agenda into Planner's agenda items, not into Production [SC/INF].

### 9.9 Relationship summary

| Module | Needs Participants? | Permission flag (view / manage) | Bendie link |
|---|---|---|---|
| Participants | — | any active assignment / Portal admin override or Planner admin | "From Bendie Attendees" (email match) |
| Tasks | no (assignees = Planner staff) | `can_view_tasks` / `can_manage_tasks` | none |
| Vendors | no | `can_view_vendors` / `can_manage_vendors` | none (Expo is separate) |
| Checklist | no (owners = staff) | `can_view_checklist` / `can_manage_checklist` | none |
| Logistics | **yes** | `can_view_logistics` / Portal admin override or Planner admin only | Pull travel → Bendie Attendee Travel (platform admin) |
| Production | no | `can_view_production` / Portal admin override or Planner admin only | none |

---

## 10. Agenda deep dive (`agenda`)

SOURCE-TRACED — NOT VISUALLY VERIFIED. Current implementation only.

### 10.1 Page layout
- Unlike almost every other module, Agenda **does not use `SectionHeader`**: it renders its own `headline-md` "Agenda" title with a grey count pill ("12 sessions"), and no description line. [SC]
- Header actions: **Import CSV** (secondary) and **Add Session** (primary).
- Body (when sessions exist): two columns on `lg` — a 220px **Dates** card on the left, sessions on the right. Below `lg`, the Dates card stacks on top and its buttons become a horizontally scrolling row.

```
Agenda (12 sessions)                              [Import CSV] [+ Add Session]
┌ Dates ─────────┐  [Search by title, location, speaker...]
│ Mon, 01 Sep  5 │  ┌▌SESSION  2 ROOMS ───────────────────────── ✏️ 🗑 ┐
│ Tue, 02 Sep  4 │  │▌Opening Keynote                                   │
│ Wed, 03 Sep  3 │  │▌🕘 Time            📍 Location        👤 Speaker   │
└────────────────┘  │▌Mon, 01 Sep        Main Hall          Jane Smith  │
                    │▌09:00 → 10:00                                     │
                    └───────────────────────────────────────────────────┘
```

### 10.2 Date selector and date handling [SC]
- Dates are derived from sessions (grouped by the **UTC** date of `starts_at`), sorted ascending; each button shows "Mon, 01 Sep" (en-ZA) and a count badge. The first date is selected by default; the selection is local state (not in the URL).
- Counts reflect the current search. There is no "All dates" option and no empty days.
- Times display in the browser's locale. The edit form fills `datetime-local` inputs from `toISOString()` (UTC) while saving interprets the input as **local** time [SC]; in a non-UTC timezone this can shift times on edit-and-save [INF — not reproduced]. The same conversion exists on Basics.

### 10.3 Search [SC]
One text box above the session list: matches title, description, location and the **primary** speaker's name (not secondary speakers). Applies across all dates (date counts update).

### 10.4 Session cards [SC]
- White card, `rounded-[20px]`, `p-5`, 4px left border in the session's accent colour (custom `accent_color`, else a per-type default: session blue, activity green, meal orange, transfer/break slate, freetime purple, ceremony teal).
- Top row: **type badge** (uppercase, coloured by type) + optional "N rooms" badge (breakout rooms) · title (`text-lg` bold) · Edit ✏️ and Delete 🗑 icons.
- Meta grid (3 columns ≥sm, stacked below): **Time** (date label + "09:00 → 10:00"), **Location** ("—" if empty), **Speaker** (avatar + name of `facilitator_id`, i.e. the first assigned speaker only, or "No speaker").
- Clicking anywhere on the card opens Edit.
- Height ≈ 150–165px on desktop, ≈ 260px+ on phones where the meta grid stacks [INF from padding/typography]. With the event header, both nav levels, the page header and the search box above, a 1080p viewport shows roughly **3–4 sessions** before scrolling; a phone shows about 1–2 [INF].
- Audience is not shown on the card; description is not shown.

### 10.5 Add / edit flow [SC]
- Modal "New Session" / "Edit Session" (`FormModal` default `max-w-3xl`):
  1. Session Title *, Start *, End * (`datetime-local`), Block Type (7 options), Audience (free text, default "everyone"), Location, Accent Color (HEX text + small native colour input), Description.
  2. **Speakers panel:** list of assigned speakers with role select (Speaker / Panelist / Moderator / **Facilitator** / Host), ↑↓ reorder, remove; add row = Speaker select (from this event's Speakers) + Role + "Add". The first speaker becomes `facilitator_id`.
  3. **Breakout Rooms panel:** "Add Room" → Room Name *, **Facilitator Name**, Description, and a **Mini-Agenda** of time blocks (title, location, start, end, description; reorder/remove).
  4. Buttons "Add Session"/"Update" + Cancel.
- Validation: toasts only ("Title is required", "Start and end time are required", room/time-block names). End-after-start is not checked in the form (it is checked in CSV).
- **Not supported:** Save & Add Another, Duplicate, drag reorder, inline edit, bulk actions, a day/timeline view. `display_order` is assigned at insert; the list sorts by start time.
- Delete: confirm "Delete "{title}"?".
- Speaker-link failures after the session saves surface raw error text in toasts.

### 10.6 CSV / paste [SC]
"Import Agenda Sessions" via the shared modal (file or paste): Title*, Start*, End* (YYYY-MM-DD HH:mm, flexible parsing), Location, Block Type, Audience, Speaker(s) (name or email, `;`-separated — must already exist on Speakers, else the row is blocked), Accent Color, Description. Breakout rooms cannot be imported.

### 10.7 States [SC]
- Loading: 3 tall skeleton blocks. Load error: toast "Failed to load agenda" (then empty).
- Empty: calendar icon + "No sessions yet. Add the first agenda item." — no buttons inside the empty state (header has them), no mention of CSV/paste.
- Search with no matches: "No sessions match your search."
- No request cancellation on leave.

### 10.8 Agenda → attendee app [SC/DOC]
`agenda_sessions` + `agenda_session_speakers` are read directly by the Bendie app's Agenda screen (date chips, "Today's Schedule", audience pills — mirrored in the Theme Designer preview). Agenda is "always included" in module selection and "Recommended" on the Dashboard. Org Overview "Speaker Gaps" counts sessions without `facilitator_id`. Platform admins can push Agenda to Planner from the Bendie Planner tab.

---

## 11. Theme Designer deep dive (`theme`)

SOURCE-TRACED — NOT VISUALLY VERIFIED. Data: `events.theme_primary / theme_secondary / theme_tertiary` (HEX text, nullable). [SC]

### 11.1 Theme Colors summary page
One white card: on the left a **phone preview** (Home screen) of the current theme; on the right "Event theme", "Make your event match your brand. This is roughly how the attendee app will look.", a "Using the standard Bendie theme" chip when nothing is saved, then three rows — round swatch · **Brand colour** · Primary / **Card & contrast colour** · Secondary / **Heading colour** · Tertiary — each with HEX ("(default)" when unsaved) and a one-line description of where the app uses it. One button: **Create event theme** (nothing saved) or **Customize theme**.

### 11.2 Designer modal ("Customize event theme", `max-w-6xl`)
```
┌ Customize event theme ─────────────────────────────────────────────── ✕ ┐
│ Pick a colour and watch the preview. Nothing changes until Apply theme.   │ [Home screen|Agenda screen]
│ Start from a Bendie theme: (●●● Bendie Blue (default)) (●●● Bendie Green)  │   ┌──────────┐
│ ┌ Brand colour · Primary          👁 Outlined in preview ┐               │   │ phone    │
│ │ description                                              │               │   │ preview  │
│ │ [■ #00ADE4                         (🎨 Choose colour)]   │               │   │ 256×540  │
│ │ Quick colours ○○○○○○○○                                   │               │   └──────────┘
│ │ Exact colour code (HEX) — optional  [#00ADE4]            │               │ caption
│ │ ⚠ Hard to read… You can still apply it.                  │               │
│ └──────────────────────────────────────────────────────────┘ (×3 fields) │
│ [Reset to Bendie default] [Undo changes]            [Cancel] [Apply theme]│ (sticky footer)
└───────────────────────────────────────────────────────────────────────────┘
```
- **Phone preview** (`EventThemePreview`): fixed 256×540 frame (≈9:19, radius 36), uniformly scaled (×0.86 / ×0.74 on short or narrow viewports). Status bar, header (round menu button, notifications+settings pill with badge), hero, "Speakers (2) / Presenters (1)" tabs, activity cards, bottom menu (Home, Agenda, Gallery, FAQ, Info). **Agenda screen**: title, "Today's Schedule", three date chips, session cards with audience pills.
- **Semantics** (traced from the attendee app): Primary = menu button, selected dates/tabs, badges, active bottom-menu item, primary buttons; Secondary = cards/pills, hero title, icons drawn on Primary (default white); Tertiary = activity titles on Home and Info Center headings.
- **Picking colours:** the whole swatch row is the native colour input's hit area; 8 quick colours (Bendie Blue, Navy, Green, Dark Green, Portal Blue, Slate, Near Black, White; selected shows a check); HEX field accepts `0057B8`, `#0057b8`, `#0AF`; invalid HEX shows an inline error, keeps the last valid colour in the preview and disables Apply.
- **Highlighting:** the active field's card has a primary border + "Outlined in preview"; its elements in the phone get a **dashed amber outline**. Preview elements are clickable (select that field, scroll to it); hover shows a caption "Brand colour (Primary) — click to edit".
- **Warnings** (non-blocking, amber): Secondary on Primary < 3:1, black text on Secondary < 4.5:1, Tertiary on page background < 3:1.
- **Saving:** local draft only; no network while choosing. **Apply theme** → one `events` update; on success toast "Theme applied" and close; on failure an inline red "Theme not saved…" message keeps the modal and draft. **Cancel/✕/backdrop** with changes → confirm "Discard theme changes?" (Keep editing / Discard). Reset and Undo never save.
- **Layout:** preview first (stacked) below `lg`; two columns (controls + 320px sticky preview) on `lg`.
- A confirm dialog rendering bug (dialog behind the modal) was fixed in the latest commit (T423). [SC]

---

## 12. Event creation

SOURCE-TRACED — NOT VISUALLY VERIFIED. One dialog (`CreateEventModal`) mounted once by `CreateEventProvider`. [SC]

**Entry points:** header **+ New Event**; Events page "+ New Event"; Events-table empty state "Create Event"; Overview "Quick Actions → Create Event". All open the same dialog for the **current organisation**, with the current product as an initial, changeable hint. Hidden for users who are not platform admin or org owner/admin.

**Steps** (custom `max-w-3xl` dialog; header "New event" + question title + numbered step indicator with ✓ for completed steps):

| Step | Title | Content |
|---|---|---|
| 1 Event basics | "What event would you like to build today?" | Event name (field-level error if blank), Start date, End date (field-level error if before start; `min` set), Location. Date-only inputs. |
| 2 Products *(only if org has both)* | "Which Bendie products does it need?" | Three radio cards: **Bendie** ("The attendee experience…"), **Bendie Planner** ("Event operations…"), **Both** ("…linked as one event"). Must choose to continue. |
| 3 Modules | "What do you need for this event?" | `ModulePicker` (§13) filtered to the chosen product(s); nothing optional preselected; "Select all", "Clear optional", "N of M optional modules selected"; **Skip for now** (= no preference → all modules shown). |
| 4 Get ready | "Get ready to build your event" | Module-aware preparation checklist (e.g. "Attendee list (names and emails)", "Agenda / programme", "Flight details", "Brand colours, logo and a hero image"; "Event dates and venue" ticks when filled), "You don't need everything now", and a summary card (name, dates · location, Products, Modules, "New events start as Draft"). **Create event**. |

- **Back/Continue** change local state only. **Close/✕** keeps a local draft ("Save & exit" when dirty); footer status "Draft saved on this device — not created yet".
- **Draft:** `localStorage` key per user + organisation, 30-day expiry. On reopen with a draft: "Continue setting up "{name}"? Last saved on this device: … It hasn't been created yet." → **Continue setup** / **Discard draft**. Not cross-device.
- **Submit:** `POST /api/events/create` → `create_event_with_products` RPC (authorization, entitlement, Planner-mapping and idempotency checks) → optional module save → if Planner: synchronous Planner provisioning.
- **Outcomes:** success toast "Event created"; Planner failure still creates the event ("Event created, but Bendie Planner setup didn't complete — you can retry it from the event"); module-save failure toast; read-back retried 3×. Then the user lands on `/portal/events/{id}/dashboard` (Planner-only events are redirected to Planner Overview).
- **Failure/retry:** the Dashboard shows the provisioning banner; **Retry** appears only when status is `failed`; stale pending shows "contact support". Errors from the route show as a toast with the server message (e.g. "Bendie Planner hasn't been set up for this organization yet…").
- **Both linking:** automatic, same request.
- **Deferred:** server-side/cross-device drafts; mirroring module choice to the app's menu.

---

## 13. Manage modules

SOURCE-TRACED — NOT VISUALLY VERIFIED. [SC]
- **Opens** from the "Manage modules" pill in the event header (every tab). `FormModal` `max-w-3xl` "Manage modules": "Choose what appears in this event's navigation. This only changes what you see while setting up — it doesn't change access, and hiding a module never deletes its data."
- **Catalogue** (`eventModules.ts`, 23 modules in 5 categories):
  - *Attendee experience*: Attendees & access 🔒, Agenda 🔒, Speakers, Activities, Excursions, Networking, Games
  - *Information & content*: News feed, FAQs, Info center, Expo directory, Emergency 🔒, Notifications
  - *Photos & media*: Gallery, Event photos, Files
  - *Travel & logistics*: Attendee travel, Participants 🔒 (Planner), Flights, hotels & transport (Planner)
  - *Event operations* (Planner): Production, Tasks, Checklist, Vendors
  - 🔒 = "Always included" (ticked, disabled). Not modules (always shown): Dashboard, Basics, Hero, Theme, Terminology, Activity Log, Bendie Planner, Planner Overview.
- **Product restrictions:** only modules of the event's active products are listed; on Both events each card shows a small "Bendie"/"Planner" label.
- **Entitlement/permission:** the button is shown to anyone in the workspace; saving uses the events UPDATE RLS (event host/organiser/admin, platform admin). An RLS-denied save shows "Only the event's hosts, organisers or admins can change its modules."
- **Data:** hiding never deletes; the amber note "Nothing is deleted — turn it back on anytime and its existing data will be there" appears when unticking a previously-on module. Re-enabling restores visibility of the same data.
- **Save:** one write of `events.portal_setup_modules` (with `configured:bendie/planner` markers); success toast "Modules updated"; the nav updates in place (in-memory patch, no refetch). A hidden page you are currently on stays in the nav until you leave it.
- **Completion implications:** Dashboard Recommended includes chosen modules; Optional and area cards only count shown modules; Planner Readiness hides rows for unshown Planner modules.
- **Separate concept:** Basics → "Hide Menu Items" hides items in the **attendee app**; Manage modules hides tabs in the **Portal**. They are not linked.
- **Not available:** ordering of modules, per-user preferences.

---

## 14. Data-entry patterns

### 14.1 Patterns in use [SC]

| Pattern | Where |
|---|---|
| **Modal form** (`FormModal`) | Default for every list module (Bendie and Planner); also Edit Profile, Manage modules, Theme Designer, Planner permissions. |
| **Custom modal shells** (not `FormModal`) | Create Event, Add Person (org), Create Team, Team Members, CSV import, Confirm dialog. |
| **Full-page single-record form** with explicit Save | Basics, Hero & Branding, Terminology; Info Center welcome message. |
| **Multi-step modal wizard** | Create Event (4 steps); Add Attendees (select → configure → results); From team (pick → preview → configure → results); Add all org people. |
| **Master–detail (two-pane)** | Excursions (categories → excursions), Attendee Travel (attendee → entries), Games (game → questions). |
| **Inline edit, immediate save** | Attendees & Access role select; Tasks manager status select (optimistic + rollback); Vendors/Checklist stage checkboxes; Flights "Confirmed"; Activities/News Feature toggle; Gallery Hide/Unhide; Networking Make required/optional. |
| **Inline edit with draft Save/Cancel** | Vendors/Checklist Notes; Tasks self-assignee status + remarks. |
| **Inline add row** | Networking options; Agenda speakers/breakout rooms inside the session modal; Activity gallery images; Info Center bullets. |
| **Add menu ("+ Add ▾")** | Attendees & Access ("Add Attendees"), Participants ("Add Participant"). |
| **Source picker / reuse** | From organisation, From team, Add all org people, From Bendie Attendees, Search existing participant, Asset Picker. |
| **CSV import + paste** | 17 configurations (§15). |
| **Save & Add Another** | Activities, Excursions (excursion form), News, Expo, Participants (new person), Tasks, Vendors, Checklist, Flights, Hotels, Production. |
| **Duplicate** | Activities only. |
| **Multi-select bulk action** | Ground Transport "Assign" (several participants to one vehicle); add-people pickers. No general row-selection bulk actions anywhere. |
| **Auto-chained modals** | Ground Transport: Movement → Add Vehicle → Assign. |
| **Upload** | Assets (multi image), Files (documents), ImageField uploads to Assets. |
| **Send / schedule** | Notifications; Resend access code. |

### 14.2 Module matrix [SC]

✓ = present · — = absent · (n) = note

| Module | Manual add | Edit | Delete | CSV | Paste | Save & Add Another | Duplicate | Bulk | Inline actions |
|---|---|---|---|---|---|---|---|---|---|
| Org People | ✓ (search / create*) | ✓ profile | ✓ remove from org | ✓* | ✓* | — | — | — | Events dropdown, Make/Revoke Admin |
| Teams | ✓ (admins) | members only (no rename) | ✓ | — | — | — | — | — | add/remove members |
| Assets | upload | — | ✓ | — | — | — | — | multi-upload | copy URL |
| Basics / Hero / Terminology | form | ✓ | — | — | — | — | — | — | — |
| Theme | designer | ✓ | — (Reset) | — | — | — | — | — | — |
| Speakers | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | — |
| Agenda | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | — |
| Activities | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | Feature toggle |
| Excursions | ✓ (+ categories) | ✓ | ✓ | ✓ | ✓ | ✓ (excursions) | — | — | — |
| Attendees & Access | ✓ menu | profile + role | ✓ | ✓* | ✓* | — | — | Add all / From team | role select, Resend Code, Add to Speakers, Team & Access |
| Attendee Travel | ✓ | ✓ (not pulled rows) | ✓ | — | — | — | — | — | — |
| Networking | ✓ | partial (required flag) | ✓ | ✓ | ✓ | — | — | — | inline option add, required toggle |
| News Feed | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | Feature toggle |
| FAQs | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — | "+ Add to section" |
| Info Center | ✓ contacts | ✓ | ✓ | — | — | — | — | — | bullet editor |
| Expo | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — |
| Gallery | — | — | ✓ | — | — | — | — | — | Hide/Unhide |
| Event Photos | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| Files | upload | — | ✓ | — | — | — | — | multi-upload | Open, Copy link |
| Emergency | ✓ | ✓ contacts | ✓ | — | — | — | — | — | — |
| Games | ✓ | ✓ | ✓ | — | — | — | — | — | — |
| Notifications | ✓ send/schedule | — | cancel | — | — | — | — | — | Cancel scheduled |
| Participants | ✓ menu | ✓ | ✓ unlink | ✓ | ✓ | ✓ | — | multi-select from attendees/org | Logistics deep links |
| Tasks | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | status select, self-assignee draft |
| Vendors | ✓ | — (create-only) | ✓ | ✓ | ✓ | ✓ | — | — | stage checkboxes, notes draft |
| Checklist | ✓ | — (create-only) | ✓ | ✓ | ✓ | ✓ | — | — | stage checkboxes, notes draft |
| Flights | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | Confirmed checkbox |
| Hotels | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — |
| Ground Transport | ✓ (3 levels) | ✓ | ✓ | — | — | — | — | multi-assign | Move, Unassign |
| Production | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | — |

\* account-creating imports/invites call platform-admin-only API routes.

---

## 15. Import experience

### 15.1 Architecture [SC]
- **Parsing:** `src/lib/csvImport.ts` — `parseCsvFile` (PapaParse, header row, `skipEmptyLines`) and `parseCsvText` (same, delimiter auto-detect for tab-separated paste). Both produce the same `ParsedCsv`; helpers `getField`, `parseFlexibleBoolean`, `parseFlexibleDate`, `buildCsvTemplate`/`downloadCsvTemplate`, `validateHeaders`, `runWithConcurrency`.
- **UI:** one generic `CsvImportModal<T>` (custom `max-w-3xl` shell). Each module passes `title`, `templateFilename`, `columns` (`ColumnSpec` with `required`), `sampleRows`, `parseRow`, `importRow`, optional `beforeImport` (Excursions category resolution, Org People account creation).
- **Flow:** *Pick* — "IMPORT FROM SPREADSHEET" lead, dismissible tip "What's a CSV file?", source toggle **Upload CSV file / Paste from spreadsheet**, expected-columns table with Required/Optional labels and 2 sample rows, header guidance, "Download example spreadsheet (CSV)". → *Preview* — "Ready to import: N" / "Needs attention: M", a per-row table with spreadsheet row numbers ("Row 5 — Jane Smith"), human-readable issues, note about blank lines shifting numbers; header-mismatch detail. → *Import* — progress, **5 concurrent** row writes. → *Result* — "Import complete" / "Import partly complete" / "Nothing was imported", per-row reasons, guidance to re-import only failed rows (not the whole file, to avoid duplicates).
- **Partial failure:** per-row; no transaction, no rollback; no duplicate detection except Flights (duplicate leg check against loaded data) and email-matching modules.

### 15.2 Modules with import [SC]
Org: **People** ("Import People").
Bendie: **Speakers**, **Agenda**, **Activities**, **Excursions**, **Attendees & Access** ("Import Attendees", platform admin only), **Networking**, **News**, **FAQs**, **Expo**.
Planner: **Participants**, **Tasks**, **Vendors**, **Checklist**, **Flights**, **Hotels**, **Production**.
= **17 import configurations** (16 event-level + 1 org-level). Every one supports paste.

### 15.3 Modules without import [SC]
Teams, Assets, Basics, Hero, Theme, Terminology, Attendee Travel, Info Center, Gallery, Event Photos, Files, Emergency, Games, Notifications, Ground Transport, Planner permissions. Excluded fields: Activity images, Agenda breakout rooms, Production `isParallel`/parent, "Apply to all events" (never via CSV).

### 15.4 User-facing terminology [SC]
Buttons say **"Import CSV"** everywhere (Attendees menu item "Import CSV"; Speakers empty state "Import or paste"). Modal titles say "Import {Things}". Inside the modal: "Import from spreadsheet", "Upload CSV file", "Paste from spreadsheet", "Download example spreadsheet (CSV)". Empty states say "paste from a spreadsheet, or import a CSV". Multi-sheet Excel is not supported.

---

## 16. Saving & drafts

| Pattern | Where | Notes [SC] |
|---|---|---|
| **Explicit Save in a modal** | All list modules | Modal stays open with input on failure; closes + refetch on success. Button shows "Saving…". |
| **Explicit Save on a page + `SaveStatus`** | Basics, Hero & Branding, Terminology | "Unsaved changes" (amber) → "Saving…" → "✓ Saved" / "Couldn't save your changes — they're still here. Try again". `beforeunload` prompt while dirty. **No in-app navigation guard**: clicking a tab/area discards unsaved edits silently. |
| **Explicit Save without status** | Info Center welcome, Theme Designer (Apply), Manage modules | Toast feedback. Theme has inline failure. |
| **Immediate save on change** | role select, status select, checkboxes, feature/hide toggles, required toggle | Toast on success/failure; Tasks status is the only **optimistic** update (with rollback). |
| **Save & Add Another** | 11 forms (§14) | Keeps selected context fields (location, themes, exhibitor/sponsor, participant, category/day/date/owner, date/day/track/room). |
| **Navigation draft** | Create Event | Survives Back/Next within the dialog. |
| **Durable draft** | Create Event only | `localStorage` per user+org, 30 days, explicit Continue/Discard. No other form has drafts. |
| **Discard confirmation** | Theme Designer only | All other modals close on ✕, Cancel or **backdrop click** without warning. |
| **Autosave** | none | — |

---

## 17. Validation & error UX

- **Required fields:** marked with "*" in labels; enforced mostly by **toasts** on submit ("Title is required").
- **Field-level validation** (message under the field, `aria-invalid`): Create Event (name, end date), Speakers (name, email format), Theme HEX fields. Everywhere else: toasts. [SC]
- **Shared helpers:** `friendlyError()` / `knownErrorMessage()` map Postgres/Supabase/network errors to plain language (duplicate, permission, missing field, foreign key, invalid format, too long, expired session, offline) with a neutral fallback; `authErrorMessage` for auth pages. Used across ~79 call sites. [SC]
- **Remaining raw messages** [SC]: Activities image sub-saves, Agenda speaker-link sub-saves, Files upload, Gallery delete, Resend Code, Excursions category insert, Org People event-removal follow-up — these interpolate `error.message`. Planner routes return their own `message` text which is shown as-is.
- **Duplicate errors:** friendly "This has already been added…"; Excursions category has its own message; Add Person "already in this organisation".
- **Permission errors:** friendly toast; page-level lock screens on Attendees & Access, Bendie Planner tab, workspace denial, Planner "Couldn't load…"; Manage modules has a specific message.
- **Load errors:** toast "Failed to load …" then the empty state (Bendie); Planner pages show a dedicated error/denied panel.
- **Import errors:** per-row in preview and result (§15).
- **Consistency:** two validation styles coexist (field-level vs toast), three error-display styles (toast, inline panel, lock screen).

---

## 18. Empty states & first-time UX

| Page | Explanation | Primary action in empty state | Import action | Next-step / prerequisite guidance |
|---|---|---|---|---|
| Events list | — ("No … events in this view yet.") | Create Event | — | — |
| Overview widgets | short lines | — | — | — |
| Org People | "No one in this organisation yet." | — (header) | — | — |
| Teams | ✓ | Create Team | — | points to Attendees & Access |
| Assets | ✓ | — (header) | — | Hero & Branding |
| Speakers | ✓ (richest) | Add Speaker | "Import or paste" | where attendees see it |
| Agenda | short | — | — | — |
| Activities / News / Expo | "Add one manually, paste…, or import a CSV." | — | (text only) | — |
| Excursions | italic hint per panel | — | (text) | "Select a category" |
| Attendees & Access | "No one on this event yet." | — | — | — |
| Attendee Travel | "Select an attendee…" | — | — | Both-event Planner banner |
| Networking / FAQs / Info Center / Emergency / Games / Notifications / Event Photos / Files / Gallery | one line | — | — | — |
| Participants | ✓ | Add Participant ▾ (moves into the empty card) | in menu | Logistics depends on it |
| Tasks | ✓ | New Task | text | — |
| Vendors / Checklist / Flights / Hotels / Production | ✓ | Add + Import CSV (also in header) | ✓ | Flights/Hotels: "add a participant first" when roster empty |
| Ground Transport | ✓ | Add Movement | — | — |
| Bendie Planner (admin) | "Link this event…" | Find Planner Event | — | — |

**Guidance mechanisms** [SC]: `DismissibleTip` (localStorage; used once — "What's a CSV file?" in the import modal); Dashboard "Event readiness" + "Recommended next"; Create Event preparation checklist; area descriptions in Level 2 nav; section descriptions in every header; hint text under fields; Both-event travel banner; Teams/Attendees cross-reference copy. **No** help icon system, tooltips beyond `title` attributes, onboarding tour or tutorial. Help in the sidebar is a mailto link.

---

## 19. Current terminology

### 19.1 User-facing dictionary [SC]

| Term (as shown) | Meaning today | Internal / DB name |
|---|---|---|
| Bendie Studio | Portal product name (sidebar, title, login) | — |
| Bendie | Attendee app product | `bendie` |
| Bendie Planner | Operations product | `planner` |
| Organisation People | Organisation members | `organization_members` (page title just "People") |
| Teams | Org groupings | `teams`, `team_members` |
| Attendees & Access | Event members (any role) | `event_members`, route `members` |
| Add Attendees | Add-people menu | — |
| Event Role | host/Organiser/admin/facilitator/staff/attendee/speaker | `event_members.role` |
| Bendie Access: Eligible | Every event member | (no column) |
| Onboarding | App profile set-up status | `onboarding_status` |
| Participants | Planner travel/logistics people | `passengers`/`event_passengers`, route `planner-people` |
| Team & Access (Planner) | Planner permissions | `event_user_assignments`, "Bendie Planner Access — {name}" modal |
| Viewer / Manager / Custom | Planner permission presets | flags |
| Speakers | Speaker/presenter directory | `facilitators`, route `facilitators` |
| Presenter | Role type of a speaker | `role_type` |
| Agenda, Session, Block Type | Programme | `agenda_sessions` |
| Activities, Excursions, Networking, News Feed, FAQs, Info Center, Expo Directory, Gallery, Event Photos, Files, Emergency, Games, Notifications, Activity Log | module names | various |
| Event Setup, Programme, Attendees, Content, Media, Operations, Participants, Planning, Logistics, Production | area names | `EventSectionMeta.group` |
| Tasks, Vendors ("Vendor Item"), Checklist, Flights, Hotels ("Hotel Booking"), Ground Transport (Movement, Vehicle), Production ("Session") | Planner modules | Planner tables |
| Modules / Manage modules | Portal nav selection | `portal_setup_modules` |
| Hide Menu Items | Attendee-app menu | `disabled_menu_items` |
| Departure time | Flight departure (attendees see "Boarding Time") | `boarding_time` |
| Journey time | Free-text time/duration | `travel_time` |
| Draft / Published / Upcoming / Live / Completed / Archived | lifecycle display | `events.status` + dates |

### 19.2 Retained internal/compatibility names [SC]
Route `facilitators`, `members`, `planner-people`; table `facilitators`, columns `facilitator_*`; CSV still accepts `facilitator_group`, `facilitator`, `speaker` headers; template file `event-team-template.csv`.

### 19.3 Inconsistencies found [SC]
- **"Members"** still visible: Dashboard Attendees area card "Members, attendee travel and networking"; Org "Add Person → Create New User" hint "…or the event's **Members** tab"; Bendie Planner tab card "Members"; Team modal "Members (N)" and team cards "N members" (legitimate for teams).
- **"Add People"** referenced on Teams page ("Add People → From team") while the button reads **"Add Attendees"**.
- **"Facilitator"** still visible by design in three distinct meanings: event role "Facilitator", org role "External Facilitator", agenda speaker type "Facilitator", breakout "Facilitator Name"; plus the "Add to Speakers" tooltip "(their event role becomes Facilitator)".
- **"Organisation"** used for Expo exhibitors ("Add Organisation", "N organisations in the directory") — collides with the tenant concept.
- **Spelling mix:** "Theme **Colors**" (tab) vs "colour" (page/modal); "Organisation" (UI) vs "Organization" (Speakers CSV column); "Organiser" (role label) vs "organizer" (lock-screen copy); "Info **Center**".
- **Status label mismatch:** Basics dropdown "**Active**" vs pill "**Live**".
- **"Planner Overview"** vs the Planner area label "Overview".
- **"Portal Access"** column on People toggles **platform admin**; "organisation users" in the Overview summary counts owner/admin members.
- **"People"** used as the sidebar label/page title for Organisation People; Planner People is "Participants" consistently in UI now.
- **"Boarding"** survives only as the hint explaining the attendee-app label (intentional).
- **Terminology section** description "Labels, icons, feature toggles" — no toggles on the page.
- **Settings** subtitle "Manage portal access and organisation details" — page is read-only and has no access settings.
- **/unauthorized** "restricted to global administrators only" and **/** "Event Content Portal" — legacy screens.

---

## 20. Visual design system

All [SC] from `tailwind.config.js`, `globals.css`, `productPresentation.ts` and components.

- **Framework:** Tailwind 3, Material-3-style colour tokens, Material Symbols Outlined icons (Google Fonts), font **Plus Jakarta Sans**. Light mode only (`color-scheme: light`).
- **Colour tokens:** `primary #00629D` (Bendie/Portal blue), `secondary #8C4F06` (brown, used for some accents, e.g. "Team & Access" link, Shared Speakers card), `tertiary #555E74`, `background/surface #F9F9FF`, `surface-container-low #F0F3FF` (skeletons, chips, tab tracks), `on-surface #111C2D`, `on-surface-variant #404751`, `outline-variant #BFC7D2`, `error #BA1A1A`. Card border is a hard-coded `#E4EAF0`. Planner accent = Tailwind **orange** 500/700 (no token). Raw Tailwind palette colours (gray, blue, green, amber, purple, yellow…) are also used, notably on the event Dashboard and status pills.
- **Type scale:** `headline-xl 40`, `headline-lg 32` (page/event titles), `headline-md 24` (section headers), `headline-sm 20` (card titles, modal titles), `body-lg/md/sm 18/16/14`, `label-md 14/600`, `label-sm 12/600`. Small caps-style labels use `text-xs/11px uppercase tracking-wide`.
- **Hierarchy on an event page:** event name (32px) → area heading (12px uppercase) + stepper → section title (24px) + description (14px) → card titles.
- **Spacing:** custom `xs 4 · base 8 · sm 12 · md 24 · gutter 24 · lg 32 · xl 48` alongside Tailwind's default scale; both are used.
- **Radius:** cards/modals `rounded-[20px]`; inputs/buttons/chips `rounded-xl` (12px); pills `rounded-full`; some cards `rounded-2xl`.
- **Shadow:** one soft `.panel-shadow` (0 4px 20px 4% navy); expanded sidebar has its own shadow.
- **Cards:** white, 1px `#E4EAF0` border, 20px radius, panel shadow, padding 16–32px.
- **Tables:** hand-built per list (no shared component): white card, `surface-container-low/50` header row, `label-md` headers, `divide-y` rows, `px-6 py-4` cells, columns hidden progressively by breakpoint, horizontal scroll.
- **Forms:** `.input` (full width, 12px radius, outline-variant border, primary focus ring), `.label` (12px variant colour), `.hint` (12px muted).
- **Buttons:** `.btn-primary` (solid primary, `px-6 py-2.5`, press-scale), `.btn-secondary` (white bordered), `.btn-danger` (solid red). Plus many ad-hoc text-link buttons (`text-xs text-primary … hover:bg-primary/5`).
- **Modals:** dark 40% backdrop, white 20px card, title `headline-sm` + ✕; widths `max-w-md`…`max-w-6xl`; confirm dialog `max-w-sm`, `z-[100]`.
- **Badges/pills:** lifecycle pills (10px bold uppercase, rounded-full); block-type badges (10px uppercase, rounded); role pill-selects; "Global", "Featured", "Exhibitor", "Sponsor", "Parallel", "From Planner", "Bendie Attendee", "Always included" tags.
- **Empty states:** centred in a card: faded 48px icon, one or two lines, sometimes buttons.
- **Icon badges:** `SectionIconBadge` — 44px rounded square with per-section pastel bg/fg (orange-50/orange-600 for all Planner sections).
- **Dividers:** `border-outline-variant` lines (nav, card sections, modal footers).
- **Product accents:** header strip/tint/border, switcher selection, active area underline/heading, stepper current/previous — Bendie `primary`, Planner orange. Everything else (buttons, New Event, Logistics sub-tabs, Dashboard callouts) stays Portal blue.
- **Sidebar:** white panel, right border, rounded active tile `primary/10`, neutral hover.
- **Reusable primitives:** `FormModal`, `ConfirmProvider`, `SectionHeader`, `SectionIconBadge`, `CsvImportModal`, `SaveStatus`, `DismissibleTip`, `ImageField`, `AssetPickerModal`, `Avatar`, `MetricCard`, `ModulePicker`, `EventAccessConfigFields`, `AddPeopleMenu`/`AddParticipantMenu`, `EventThemePreview`. Not extracted: table, empty state, page header with actions, tabs/segmented control, filter bar, badge.

---

## 21. Information density

Approximate "first screen" counts assume a 1440×900 desktop, the event header + two nav levels (~190px), and the section header (~90px) [INF].

| Page | Density | Structure | Visible before scrolling (approx.) |
|---|---|---|---|
| Org Overview | Medium | 4 metric cards + table + side cards | greeting, 4 metrics, ~3 event rows, Next Milestone |
| Events list | Medium | 5-column table, 80px rows | ~7 events |
| Org People | Medium | 6-column table, 80px rows | ~6 people |
| Event Dashboard | Medium–low | readiness card, callout, area cards | readiness + Recommended next + first row of area cards |
| Basics / Hero / Terminology | Medium | form grid in one card | most of the form |
| Theme | Low | preview + 3 rows | everything |
| **Speakers** | **High** | compact 1-line rows (~60px) | ~8–9 speakers |
| **Agenda** | **Low** | tall cards (~160px) for 4 data points | ~3–4 sessions of one date |
| **Activities** | Medium | 2-column cards (~80px) | ~10 activities |
| **Excursions** | Medium | categories + rows (~88px) | categories + ~5 excursions |
| **Attendees & Access** | High | 5-column table, ~56px rows, chips + filters above | ~7 people |
| Attendee Travel | Low–medium | two panes, one person at a time | 1 person's entries |
| Networking | Medium | 2-column question cards | ~4 questions |
| **News** | Medium | rows with 64px thumbnail (~96px) | ~5 articles |
| FAQs | High | collapsed accordion rows (~56px) | ~8 questions |
| **Expo** | Medium | rows with 56px thumbnail (~90px) | ~5 entries |
| Gallery / Event Photos | Low–medium | image grid (4 cols) | ~8 photos |
| **Participants** | Medium | table rows ~110px (3-line Logistics column) | ~4 participants |
| **Tasks** | High | 7-column table + filters | ~8 tasks |
| **Vendors** | High | stage checkboxes + timestamps | ~6 items |
| **Checklist** | High | 8-column table | ~6 items |
| **Flights** | High | 7-column table | ~7 legs (below a 4-card summary strip) |
| **Hotels** | High | 6-column table | ~7 bookings |
| **Ground Transport** | Medium | nested cards | ~1–2 movements |
| **Production** | Medium–high | 6-column table | ~7 sessions |

---

## 22. Current navigation model

Generated from `OrgSideNav.NAV_ITEMS`, `src/app` routes and `EVENT_SECTIONS`. [SC]

```
AUTH (/auth/*)
├── /auth/login              Sign in ("Welcome back / Sign in to continue")
├── /auth/signup
├── /auth/forgot-password
└── /auth/reset-password     link + code modes

PORTAL (/portal/*)  — requires login + ≥1 organisation membership (or platform admin)
├── Overview          /portal → /portal/bendie | /portal/planner        [product entitlement]
├── Events            /portal/events → /portal/bendie/events | /portal/planner/events
│                     (+ New Event: platform admin or org owner/admin)
├── People            /portal/people                                   [mutations: RLS; account creation: platform admin]
├── Assets            /portal/assets
├── Teams             /portal/teams                                    [manage: org owner/admin]
├── Activity Log      /portal/activity-log                             [technical details: platform admin]
├── Settings          /portal/settings                                 (read-only)
├── Help (mailto) · Logout
└── edge: /portal/no-product · /portal/no-access · /unauthorized (legacy) · / (legacy)

EVENT  /portal/events/{eventId}/…   [workspace access: event member, org owner/admin, platform admin]
├── Overview
│   ├── Dashboard                 dashboard                  Bendie
│   └── Planner Overview          planner-overview           Planner
├── Event Setup                                             Bendie
│   ├── 1 Basics                  basics
│   ├── 2 Hero & Branding         hero
│   ├── 3 Theme Colors            theme
│   └── 4 Terminology             terminology
├── Programme                                               Bendie
│   ├── 1 Speakers                facilitators               (module)
│   ├── 2 Agenda                  agenda                     (always included)
│   ├── 3 Activities              activities                 (module)
│   └── 4 Excursions              excursions                 (module)
├── Attendees                                               Bendie
│   ├── 1 Attendees & Access      members                    (always included; page: host/organizer/admin)
│   ├── 2 Attendee Travel         attendee-travel            (module)
│   └── 3 Networking              networking                 (module)
├── Content                                                 Bendie
│   ├── 1 News Feed               news                       (module)
│   ├── 2 FAQs                    faqs                       (module)
│   ├── 3 Info Center             info-center                (module)
│   └── 4 Expo Directory          expo                       (module)
├── Media                                                   Bendie
│   ├── 1 Gallery                 gallery                    (module)
│   ├── 2 Event Photos            event-photos               (module)
│   └── 3 Files                   files                      (module)
├── Operations                                              Bendie + shared
│   ├── 1 Emergency               emergency                  (always included)
│   ├── 2 Games                   games                      (module)
│   ├── 3 Notifications           notifications              (module)
│   ├── 4 Activity Log            activity-log
│   └── 5 Bendie Planner          bendie-planner             shared; page: platform admin
│ ── PLANNER ──
├── Participants                  planner-people             Planner; can_view (any assignment) — always included
├── Planning                                                Planner
│   ├── 1 Tasks                   planner-tasks              can_view_tasks (module)
│   ├── 2 Vendors                 planner-vendors            can_view_vendors (module)
│   └── 3 Checklist               planner-checklist          can_view_checklist (module)
├── Logistics                     planner-logistics          can_view_logistics (module)
│   └── ?view=flights | hotels | ground-transport
└── Production                    planner-production         can_view_production (module)

Planner Team & Access → no route; a row action on Attendees & Access (org owner/admin, platform admin)
```

---

## 23. Cross-product workflows

| Workflow | Mechanism | Data relationship [SC] |
|---|---|---|
| Organisation Person → Attendee | Attendees & Access → Add Attendees → From organisation / From team / Add all; or People page Events dropdown | **Linked**: creates `event_members` for the same `profiles` id |
| Team → Attendees | Add Attendees → From team (preview, deselect) | **Copied once**: team membership is a source list; no ongoing link |
| Attendee → Participant | Participants → Add Participant → From Bendie Attendees | **Matched by exact email**: links an existing global `passengers` record or creates one; then `event_passengers`. No ongoing sync. |
| Organisation Person → Participant | Add Participant → From organisation | same exact-email match-or-create |
| Planner travel → Bendie travel | "Pull from Bendie Planner" (Attendee Travel banner, Bendie Planner tab) | **Pulled** (one-way, manual, platform-admin only): Planner flights/hotels → `attendee_travel_details` rows tagged "From Planner" (read-only in Portal), matched by email to event members |
| Bendie → Planner travel | — | **Not supported** |
| Bendie Agenda → Planner | "Push to Planner" (Bendie Planner tab, platform admin) | **Pushed** one-way, manual |
| Event members → Planner staff | Feature 001 staff sync for staff-tier roles (Bendie Planner tab shows status); Add Attendees Planner access; Team & Access modal | **Linked** via Planner `profiles`/`event_user_assignments` |
| Both provisioning | Create Event with "Both" | **Shared** event identity; Planner event created and linked in the same request |
| Planner permissions | Team & Access modal | **Separate** Planner DB data, administered from the Portal |
| Bendie attendee access | Resend Code / Add-flow "Send access code" | **Separate**: access codes per `event_members` row; status not readable by managers |
| Expo ↔ Vendors, Agenda ↔ Production, Attendee Travel ↔ Flights/Hotels | — | **Separate** models (except the manual pull) |

Guided journey [SC]: Attendee Travel (Both) → "Set up in Bendie Planner" → Logistics/Flights (and Participants if needed) with a "Return to Attendee Travel" banner (sessionStorage flag) → back → one-time "Travel setup in Planner complete? Pull…" prompt.

---

## 24. Permissions

| Level | How it is determined | What it unlocks in the UI [SC] |
|---|---|---|
| **Platform admin** | `profiles.global_role = 'admin'` | Everything in every org; org switcher across all orgs; New Organisation; create accounts (Invite new attendee, Import Attendees, People "Create New User"/CSV); Bendie Planner tab; travel pull / agenda push; Activity Log technical details; Make/Revoke Admin on People (RLS-dependent). |
| **Org owner / admin** | `organization_members.role` | New Event; Teams management; Planner permission administration (Team & Access, Planner access in Add flows); Portal-side manage override on Participants/Logistics/Production; workspace access to the org's events. |
| **Org member** (any other role) | membership row | Portal admission; sees org lists, Overview, Teams read-only, Assets, People list; entering an event requires an event membership. |
| **Event role** host / organizer / admin | `event_members.role` | Attendees & Access page; events UPDATE (Basics, modules) via RLS; event_members update/delete. |
| Event role facilitator / staff / attendee / speaker | `event_members` | Workspace access; Bendie content pages render (RLS decides writes); Attendees & Access locked. |
| **Bendie eligibility** | any `event_members` row | Access code can be issued ("Eligible"). |
| **Planner Viewer** | assignment with all view flags | Sees all Planner tabs; read-only rows. |
| **Planner Manager** | all view + manage flags | Manage Tasks, Vendors, Checklist. **Does not** grant manage on Participants, Logistics or Production — those need Planner platform admin or Portal org admin/platform admin. |
| **Planner Custom** | any other combination | Per-module View (7 modules) / Manage (3 modules). |

Notes [SC]:
- Hidden-not-disabled is the norm for unauthorised actions (Planner managers' buttons, New Event, Teams controls, Team & Access action).
- Exceptions where the UI shows something the server will refuse: Manage modules button; "Pull from Bendie Planner" on Attendee Travel (platform-admin endpoint); Org People "Create New User" tab and Import CSV for non-platform-admins; the Bendie Planner tab is listed in nav for everyone but locked.
- The Planner permission matrix has no "Participants" row; Participant view = "has any active assignment".
- No authorization was changed or tested for this audit.

---

## 25. Performance & loading

Current architecture after passes 9, 10, 13, 22, 23 (all [SC] unless noted):
- **`/planner-capabilities`**: one request returns all six Planner module capabilities (was six). EventLayout fetches it once per event id; the nav waits for it (skeleton) to avoid flicker.
- **`/planner-readiness`**: Dashboard Planner counts in one counts-only request (was eight collection requests); cancelled on leave.
- **`/planner-logistics/overview`**: Logistics initial load in one request (was four).
- **`plannerModuleAccess.ts`**: shared server-side access chain used by the two aggregates; per-module routes keep their own copies.
- **`useLatestRequest` / AbortController**: Members, Participants, Logistics, Production, Tasks, Vendors, Checklist, Planner Overview, Speakers, News, Gallery, Emergency, Basics (direct AbortController), Dashboard counts. Aborts never toast or write state.
- **Stable EventLayout**: availability/capability effect keyed on the event **id**, so Manage modules or same-event patches do not blank the nav or re-authorize.
- **Token refresh**: AuthContext keeps the same user object and profile across `TOKEN_REFRESHED`, preventing org/event reload cascades; profile fetched once per page load (duplicate `getSession` removed).
- **`knownUser`** passed into org/event resolution (fewer `getUser` round-trips); `isProductAvailableForEvent` runs its two reads in parallel.
- **Main-tab switching:** stable in **manual testing** after pass 23 (recorded per the brief; [DOC] — not re-tested in this audit).
- **Middleware** caches role and org-membership checks in 60-second cookies.

Remaining known performance debt [SC/DOC]:
- Every Planner route re-runs the ~10-round-trip authorization chain per request (accepted security trade-off).
- Participants' Logistics column uses 3 separate requests (flights, hotels, movements) instead of the overview endpoint.
- ~21 Planner item-mutation routes still read `profiles` twice.
- Events-list stats select all rows to count (1,000-row cap risk); People page loads all members (no pagination).
- Most Bendie list pages (Agenda, Activities, Excursions, Expo, FAQs, Networking, Info Center, Files, Games, Notifications, Event Photos, Attendee Travel, Hero, Theme, Terminology) do not cancel on leave.
- No measured timings exist (no browser/APM in the dev environment).

---

## 26. Responsive behaviour

Breakpoints: Tailwind defaults (`sm 640`, `md 768`, `lg 1024`, `xl 1280`) plus custom `desk` = ≥1024px with fine pointer + hover. [SC] Intent only — NOT VISUALLY VERIFIED.

| Element | Behaviour |
|---|---|
| Sidebar | `desk`: 72px rail, hover/focus overlay to 280px. Touch & <1024px: hidden; ☰ opens a 280px drawer with backdrop. |
| Header | Wraps (`flex-wrap`); search becomes an icon popover <`md`; product switcher becomes an icon menu <`sm`; New Event icon-only <`sm`; org pill keeps a 240px minimum width (can force wrapping on phones [INF]). |
| Event areas | ≥`md`: horizontal scrolling link row with chevrons. <`md`: "Event area" select. |
| Stepper | Wraps; non-current labels hidden <`sm`. |
| Previous/Next | Words "Previous:/Next:" hidden <`sm`; each button max 48% width, truncating. |
| Tables | All in `overflow-x-auto` cards; columns hidden progressively (`sm`/`md`/`lg`). Attendees & Access forces `min-w-[720px]` (always scrolls on phones). No table→card transformation anywhere. |
| Cards/grids | 1→2→3/4 column grids (metrics, teams, assets, gallery, area cards, activities on `lg`). |
| Master–detail | Excursions, Attendee Travel, Games, Agenda dates stack vertically below `lg`. |
| Modals | `p-4` gutter, full width up to their max, `max-h-[90vh]` internal scroll; form grids 1 column below `sm`. |
| Theme Designer | Preview stacks first below `lg`; phone frame scales ×0.86/×0.74 on narrow/short screens. |
| Agenda | Dates card becomes a horizontal chip row below `lg`; session meta stacks below `sm`. |
| Planner pages | Logistics summary 2×2 below `sm`; Ground Transport nested cards stack. |

Horizontal scroll regions: event areas row, every table, Agenda date chips (<`lg`), Events Overview table, header (wrap rather than scroll).

---

## 27. UX maturity classification

| Classification | Features (evidence-based) |
|---|---|
| **MATURE** | Event workspace navigation hierarchy (areas, stepper, Previous/Next, product-aware); global header & product identity; hover sidebar; Theme Designer; CSV/paste import framework; Create Event wizard + local draft; lifecycle derivation; Planner page state machine (provisioning/denied/error); Activity Log presentation; password reset flow [DOC for email delivery]. |
| **FUNCTIONAL BUT UX CAN BE REFINED** | Speakers, Activities, News, Expo, FAQs, Excursions, Networking, Tasks, Vendors, Checklist, Flights, Hotels, Production, Participants, Attendees & Access, Org Overview, Events list, Basics/Hero/Terminology, Emergency, Notifications, Gallery, Event Photos, Files, Assets. |
| **TRANSITIONAL** | Event Dashboard (new readiness model alongside legacy styling and a duplicate title); org-level progress % (old 8-check model); Team & Access living inside the Bendie Attendees page; Planner Team & Access on Planner-only events; terminology migration (Members/Facilitator remnants); Bendie Planner integration tab (admin tool exposed in event nav); Agenda (no SectionHeader, no productivity features that sibling modules have). |
| **PARTIALLY IMPLEMENTED** | Save & Add Another (11 of ~20 create forms); Duplicate (Activities only); field-level validation (3 forms); request cancellation (about half the pages); empty-state actions (some modules); unsaved-change protection (`beforeunload` on 3 pages, Theme confirm only); Ground Transport composite flow (chained modals); Participant logistics hub (column only); Organisation Settings (read-only). |
| **DEFERRED** | See §28. |

---

## 28. Known deferred items (verified against code)

| Item | Status in code |
|---|---|
| AI-assisted document import | Not implemented [SC — no AI/LLM code] |
| Multi-sheet Excel (XLSX) import | Not implemented; only PapaParse installed [SC] |
| People pagination | Not implemented; all members load [SC] |
| Event-list count correctness (1,000-row cap) | Not fixed; `batchCountByEventId` selects rows [SC] |
| Duplicate `profiles` reads in ~21 mutation routes | Not fixed [DOC T403/T411] |
| Remaining low-impact request cancellation | Not done on ~15 Bendie pages [SC] |
| Password recovery | Implemented (link + code modes, invalid/expired states) [SC]; email journey not browser-tested [DOC] |
| Durable drafts | Create Event only, same browser/device [SC]; cross-device and other forms deferred |
| Global unsaved-changes guard | Not implemented [SC] |
| Preview Event | Not implemented (no route/button) [SC] |
| Advanced module ordering | Not implemented [SC] |
| Module choice → attendee app menu | Not linked [SC] |
| Bulk row actions (Tasks status, Checklist complete, Attendees resend) | Not implemented [SC] |
| Duplicate beyond Activities | Not implemented [SC] |
| Column alias matching in CSV | Not implemented [SC] |
| Post-save "next action" suggestions | Not implemented [SC] |
| Dashboard "finish setting up" assistant | Partially covered by readiness/Recommended next [SC] |
| Dedicated Review & Readiness page | Not implemented [SC] |
| Table→card mobile layouts | Not implemented [SC] |
| Live Planner-access roster / batch status | Not implemented ("Eligible" static column) [SC] |
| Read-only team membership view for non-admins | Not implemented [SC] |
| Production slide upload | Not available [SC] |
| Org Settings editing | Not implemented [SC] |
| Browser/visual verification of Feature 016 | Not performed in any pass [DOC] |

---

## 29. Screen-by-screen inventory

All rows: CURRENT STATE = SOURCE-TRACED — NOT VISUALLY VERIFIED.

| Screen | Route | Product | Purpose | Layout type | Primary action | Density | Key components |
|---|---|---|---|---|---|---|---|
| Login | /auth/login | — | Sign in | centred form | Sign in | Low | logo, form |
| Forgot / Reset password | /auth/forgot-password, /auth/reset-password | — | Recovery | centred form | Send / Update | Low | mode states |
| Signup | /auth/signup | — | Account creation | centred form | Sign up | Low | — |
| Org Overview | /portal/{product} | Bendie/Planner | Org summary | dashboard grid | (New Event) | Medium | MetricCard, EventsOverviewPanel, NeedsAttention, RecentActivity, QuickActions |
| Events | /portal/{product}/events | Bendie/Planner | List events | table | + New Event | Medium | EventsOverviewPanel |
| People | /portal/people | Org | Org members | table | Add Person | Medium | OrgPeoplePanel, AddPersonModal, CsvImportModal |
| Assets | /portal/assets | Org | Image library | card grid | Upload Assets | Low–Med | — |
| Teams | /portal/teams | Org | Groups | card grid | Create Team | Low | CreateTeamModal, TeamMembersModal |
| Activity Log (org) | /portal/activity-log | Org | Audit | expandable list | — | Medium | activityPresentation |
| Settings | /portal/settings | Org | Org details | read-only card | — | Low | — |
| No product / No access | /portal/no-product, /portal/no-access | — | Edge | centred message | Log out | Low | — |
| Create Event | (dialog) | — | Create | 4-step wizard | Create event | Medium | CreateEventModal, ModulePicker |
| Manage modules | (dialog) | Event | Nav selection | checklist modal | Save modules | Medium | ModulePicker |
| Event Dashboard | …/dashboard | Bendie (+Planner) | Readiness hub | cards | Recommended next | Medium | SECTION_CHECKS, PlannerProvisioningBanner |
| Basics | …/basics | Bendie | Event details | form | Save Changes | Medium | SaveStatus |
| Hero & Branding | …/hero | Bendie | Images/title | form | Save Changes | Medium | ImageField, AssetPicker, SaveStatus |
| Theme Colors | …/theme | Bendie | Theme | summary + modal | Create/Customize theme | Low | EventThemePreview, ThemeDesignerModal |
| Terminology | …/terminology | Bendie | Labels | form | Save Changes | Low | SaveStatus |
| Speakers | …/facilitators | Bendie | Speaker directory | compact list | Add Speaker | High | FormModal, CsvImportModal |
| Agenda | …/agenda | Bendie | Sessions | date rail + cards | Add Session | Low | FormModal, CsvImportModal |
| Activities | …/activities | Bendie | Experiences | 2-col cards | Add Activity | Medium | ImageField, Duplicate |
| Excursions | …/excursions | Bendie | Local recommendations | master–detail | New Category | Medium | — |
| Attendees & Access | …/members | Bendie | Event people & access | table | Add Attendees ▾ | High | AddPeopleMenu, EventAccessConfigFields, PlannerPermissionsModal |
| Attendee Travel | …/attendee-travel | Bendie | Per-attendee travel | master–detail | Add Entry | Low–Med | travel banner |
| Networking | …/networking | Bendie | Interest questions | 2-col cards | Add Question | Medium | — |
| News Feed | …/news | Bendie | Articles | list | Add Article | Medium | — |
| FAQs | …/faqs | Bendie | Q&A | grouped accordion | Add FAQ | High | — |
| Info Center | …/info-center | Bendie | Welcome + contacts | form + list | Add Contact | Medium | — |
| Expo Directory | …/expo | Bendie | Exhibitors/sponsors | list | Add Organisation | Medium | — |
| Gallery | …/gallery | Bendie | Moderate attendee photos | image grid | — | Low–Med | — |
| Event Photos | …/event-photos | Bendie | Curated photos | image grid | Add Photo | Low–Med | ImageField |
| Files | …/files | Bendie | Documents | list | Upload File | Medium | — |
| Emergency | …/emergency | Bendie | Contacts + safety images | tabs + cards | Add Contact | Medium | — |
| Games | …/games | Bendie | Quizzes | master–detail | New Game | Medium | — |
| Notifications | …/notifications | Bendie | Push messages | list | New Notification | Medium | — |
| Activity Log (event) | …/activity-log | Bendie | Audit | expandable list | — | Medium | — |
| Bendie Planner | …/bendie-planner | Shared (admin) | Link/sync | cards | Find Planner Event | Medium | — |
| Planner Overview | …/planner-overview | Planner | Planner hub | 3 cards | (Manage Team & Access) | Low | — |
| Participants | …/planner-people | Planner | Logistics people | table | Add Participant ▾ | Medium | AddParticipantMenu, PlannerPeopleModal |
| Tasks | …/planner-tasks | Planner | To-dos | filtered table | New Task | High | PlannerTaskList |
| Vendors | …/planner-vendors | Planner | Supplier items | table | Add Vendor Item | High | PlannerVendorList |
| Checklist | …/planner-checklist | Planner | Sourcing | table | Add Checklist Item | High | PlannerChecklistList |
| Logistics: Flights | …/planner-logistics?view=flights | Planner | Flight legs | summary + table | Add Flight | High | PlannerFlightList |
| Logistics: Hotels | …?view=hotels | Planner | Bookings | summary + table | Add Hotel Booking | High | PlannerHotelList |
| Logistics: Ground Transport | …?view=ground-transport | Planner | Movements/vehicles | nested cards | Add Movement | Medium | PlannerGroundTransportList |
| Production | …/planner-production | Planner | Run-of-show | table | Add Session | Med–High | PlannerProductionModal |
| Team & Access | (modal from Attendees & Access) | Planner | Permissions | modal | Enable / presets | Medium | PlannerPermissionsModal |

---

## 30. Observed UX characteristics

Observations only. None of these is a recommendation.

### 30.1 Navigation & structure
1. The event name appears twice on the Dashboard: once as the workspace h1 (32px) and again as the Dashboard's own page title (30px), followed by "Select a section to edit event content". [SC]
2. Product type (Bendie / Planner / Both) is not stated anywhere on the event itself; it has to be inferred from the header colour and the nav. [SC]
3. "← All Events" returns to the default product's list, which may differ from the product the user entered from. [INF]
4. On Planner-only events the two links to Planner Team & Access (Planner Overview card, Participants header link) point to a Bendie-only tab and are redirected back to Planner Overview. [INF]
5. The Bendie Planner integration tab is listed in every event's Operations area but only platform admins can use it. [SC]
6. Header search is labelled "Search experiences…" and only searches events. [SC]
7. The bell icon shows organisation activity, while "Notifications" inside an event means attendee push messages. [SC]
8. Settings is reachable from both the sidebar and a header icon, and contains two read-only fields. [SC]
9. Inside Logistics there is a third navigation level (sub-tabs) below the area row and stepper; it uses Portal blue while the area row uses Planner orange. [SC]

### 30.2 Pages and density
10. Agenda uses ~160px cards to show four data points (type, title, time, location, first speaker); 3–4 sessions are visible per screen, and the date label repeats on every card although a date is already selected. [INF/SC]
11. Speakers, FAQs, Tasks, Vendors, Checklist and Flights are compact and show many records per screen; News, Expo and Activities sit in between. Similar "directory" content therefore has noticeably different densities. [INF]
12. Attendee Travel shows one attendee at a time; there is no overview of who has or lacks travel details. [SC]
13. Participants rows are three lines tall because of the Logistics column. [SC]
14. The Org Overview's People preview shows an empty "Portal Access" column and "—" in Events. [SC]

### 30.3 Actions and CRUD consistency
15. Create/edit capabilities vary between similar modules: Save & Add Another exists on 11 forms but not on Speakers, Agenda, FAQs, Networking, Info Center, Emergency, Games, Event Photos or Attendee Travel; Duplicate exists only on Activities. [SC]
16. Vendors and Checklist items cannot be edited after creation (only notes and stage toggles). [SC]
17. Row actions differ by product: Bendie uses small text links ("Edit", "Delete"), Planner uses bordered and solid red buttons ("Edit", "Remove"). [SC]
18. Primary add-button wording varies: "Add Speaker", "Add Session", "New Task", "New Game", "New Notification", "New Category", "Add Vendor Item", "Add Organisation". [SC]
19. Several pages show two add controls at once: Vendors/Checklist/Flights/Hotels/Production empty states repeat the header's Add + Import CSV; People has a header "Add Person" and a panel "+ Add Person". [SC]
20. Excursions' header primary action creates a category; adding an excursion requires selecting a category first. [SC]
21. Networking exposes technical keys (`question_key`, `option_key`) that the organiser must type; options are deleted with "×" without confirmation; questions cannot be edited after creation. Games requires answer options as raw JSON. [SC]
22. Attendees & Access has up to four text actions per row (Add to Speakers, Resend Code, Team & Access, Remove). [SC]

### 30.4 Data entry and safety
23. Most modals close on backdrop click without asking, discarding typed data; only the Theme Designer confirms. [SC]
24. Tab/area clicks discard unsaved edits on Basics, Hero and Terminology without warning (browser-close is guarded). [SC]
25. Validation appears in two styles: inline field messages (3 forms) and toasts (everywhere else). [SC]
26. Date/time entry varies: free text on Attendee Travel ("e.g. 12 Sep 2026", "e.g. 14:30"), `date` inputs in Create Event, `datetime-local` on Basics/Agenda — and Agenda/Basics convert between UTC and local time asymmetrically. [SC/INF]
27. A few error toasts still show raw backend text (image, speaker-link, file upload, access code). [SC]

### 30.5 Progress, readiness, guidance
28. Two progress models coexist: the event Dashboard (Required/Recommended/Optional, no %) and the org Overview/Events list ("Progress" bar and "Setup Progress %" from an 8-check heuristic that ignores modules and Planner). [SC]
29. "At least one attendee with access" counts only members whose role is exactly `attendee`. [SC]
30. "Needs Attention" items are not clickable and only cover emergency contacts and agenda speakers (Bendie data), including on the Planner Overview. [SC]
31. Guidance is concentrated on Speakers (rich empty state), the Create Event wizard and the Dashboard; most other empty states are one line without actions. Only one dismissible tip exists. [SC]
32. The Stepper shows position but no completion; completion appears only on the Dashboard. [SC]

### 30.6 People & access model
33. Four people concepts that look similar to a user (Organisation People, Attendees & Access, Participants, Planner Team & Access) live on four different surfaces with different add flows, and Planner Team & Access has no screen of its own. [SC]
34. "Bendie Access" shows "Eligible" for everyone; "Onboarding" shows a status that nothing in the Portal writes. [SC]
35. The People page "Portal Access → Make Admin" control grants platform-wide admin, while the summary line counts "organisation admins". [SC]
36. Several capabilities are offered in the UI but rejected server-side for non-platform-admins (Create New User tab, People CSV, Attendee Travel "Pull from Bendie Planner"). [SC]

### 30.7 Visual system
37. The event Dashboard, login, `/` and `/unauthorized` use raw Tailwind gray/blue styling, while the rest of the Portal uses the Material-style tokens. [SC]
38. New Event, Logistics sub-tabs, Dashboard callouts and all action buttons stay Portal blue in Planner context; only the header strip, switcher, area underline and stepper turn orange. [SC]
39. Configuration pages (Basics, Terminology) and operational pages (Tasks, Logistics) share the same card/table treatment. [SC]
40. No shared table, empty-state, filter-bar or tab component exists; each page builds its own, producing small variations (header row colour, padding, radius `rounded-2xl` vs `rounded-[20px]`). [SC]

### 30.8 Terminology
41. Spelling alternates between British and American forms (Colour/Color, Organisation/Organization, Organiser/organizer, Center). [SC]
42. Leftover "Members", "Add People" and "Event Team" references remain in copy and filenames (§19.3). [SC]
43. "Organisation" is also used for Expo exhibitors. [SC]

### 30.9 Stale documentation found
- `context/portal-ux-current-state-audit.md` (pre-016): flat tab bar, floating Next, no Save & Add Another, no CSV on Tasks, local-state Logistics sub-tabs, Members page naming, "Create" link to `/portal/events`, Settings read-only (still true), People tab label — **mostly superseded**.
- Feature 016 spec pass 1 language ("group pills", "Recommended next above the section grid", "8-card readiness grid") — superseded by passes 3, 18, 19.
- Feature 016 pass 15 sidebar (arrow toggle, localStorage) — superseded by pass 16 hover rail.
- Feature 016 pass 21 glass surfaces — removed in the pass-21 correction.
- `ModulePicker`/create copy "change this anytime from the event Dashboard" — the control is in the event header on every tab.
- Teams page "Add People → From team" — button now reads "Add Attendees".
- Org "Create New User" hint "event's Members tab".
- Terminology section description "feature toggles".
- `/unauthorized` "restricted to global administrators only".
- Older docs describing the Org Overview's greeting with the product name — removed in pass 4.

---

## 31. Screenshots / visual evidence

**No screenshots were captured.** The environment has no browser-automation or screenshot tool (`ToolSearch` for browser/screenshot/playwright returned only `WebFetch`, which cannot reach `localhost`), and there is no authenticated session. Consistent with every Feature 016 pass, **every screen in this document is SOURCE-TRACED — NOT VISUALLY VERIFIED.** No screenshots or images were invented.

Suggested capture order for a human reviewer (from the brief): Organisation Dashboard · Events · People · Teams · Event Overview (Dashboard) · Basics · Hero & Branding · Theme Colors (+ designer) · Speakers · Agenda · Attendees & Access · Attendee Travel · News · Expo · Gallery · Operations (Emergency) · Participants · Team & Access modal · Tasks · Vendors · Checklist · Logistics/Flights · Logistics/Hotels · Ground Transport · Production · Manage Modules · New Event (all 4 steps + draft prompt). Capture each at 1440px and 390px wide, on a Bendie-only, a Planner-only and a Both event, and once as a non-admin event member.

---

## 32. Accuracy notes

- **BROWSER-VERIFIED:** 0 screens.
- **SOURCE-CONFIRMED:** all route, component, label, field, permission-gate and data-source statements unless tagged otherwise.
- **INFERRED:** pixel heights/records-per-viewport (§10.4, §21); timezone shift on Agenda/Basics edit (§10.2); Planner-only Team & Access redirect (§9.1); "All Events" product destination; header wrapping on phones.
- **DOCUMENTED BUT NOT VERIFIED:** manual-testing result that main-tab switching is stable; attendee-app field mappings in the Theme Designer (traced by pass 14 against the Evently-App repo, not re-read here); password-reset email delivery; RLS behaviour of specific writes (e.g. "Make Admin").
- Code-vs-doc conflicts were resolved in favour of the code and listed in §30.9.

---

## 33. Summary

| # | Item | Result |
|---|---|---|
| 1 | Routes audited | 50 page routes (31 event tabs, 13 portal org/edge routes, 6 auth/legacy) + 47 API route files (authorization patterns) |
| 2 | Organisation-level screens | 7 sidebar destinations (Overview, Events, People, Assets, Teams, Activity Log, Settings) + 2 edge states |
| 3 | Bendie event modules | 24 (incl. Dashboard and the shared Bendie Planner tab) |
| 4 | Planner modules | 7 tabs (Planner Overview, Participants, Tasks, Vendors, Checklist, Logistics [3 sub-views], Production) + Team & Access modal |
| 5 | Navigation tree | Confirmed from `EVENT_SECTIONS` + `OrgSideNav` (§22) |
| 6 | Person model | Six separate concepts confirmed (§2) |
| 7 | Event creation | 4-step wizard (3 when one product), local draft, Feature 004 provisioning (§12) |
| 8 | Import | 17 CSV configurations, all with paste; shared modal; concurrency 5; no XLSX/AI |
| 9 | Saving/drafts | Explicit saves; SaveStatus on 3 pages; Create-Event-only durable draft; no global unsaved guard |
| 10 | Theme Designer | Mature: preview, presets, HEX, warnings, Apply-only save, discard confirm |
| 11 | Agenda | Date rail + tall cards; modal with speakers/breakout rooms; CSV; no Save & Add Another/Duplicate/SectionHeader |
| 12 | Dashboard | Readiness (Required/Recommended/Optional), Recommended next, area cards, Planner Readiness; org level still uses % |
| 13 | Permissions | Platform admin / org owner-admin / event roles / Planner flags (§24) |
| 14 | Performance | Aggregate Planner endpoints, cancellation on ~14 pages, stable layout and auth identity |
| 15 | Browser-verified | 0 |
| 16 | Source-traced only | All 50 routes + modals |
| 17 | Stale documentation | 10 items (§30.9) |
| 18 | Terminology inconsistencies | ~13 (§19.3) |
| 19 | UX characteristics | 43 observations (§30) |
| 20 | Deferred features | 24 items verified (§28) |

**NO IMPLEMENTATION CHANGES WERE MADE. NO UI, API, DATABASE OR RLS CHANGES WERE MADE. FEATURE 016 WAS NOT CONVERGED.**
