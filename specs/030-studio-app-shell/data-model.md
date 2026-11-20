# Data Model: 030 (display metadata only; no database change)

## Area mapping (`EVENT_SECTIONS[].area`), all 32 sections

| Area (order) | Label | Sections (existing keys, in sidebar order) |
|---|---|---|
| 1 overview | Overview | `dashboard`, `planner-overview` |
| 2 setup | Setup | `basics`, `hero`, `theme`, `terminology` |
| 3 programme | Programme | `facilitators`, `agenda`, `activities`, `excursions`, `planner-agenda`, `planner-production` |
| 4 people | People | `members`, `planner-people`, `networking` |
| 5 logistics | Logistics | `attendee-travel`, `planner-logistics`, `planner-tasks`, `planner-vendors`, `planner-checklist` |
| 6 content | Content | `news`, `faqs`, `info-center`, `expo`, `gallery`, `event-photos`, `files`, `games`, `notifications`, `emergency` |
| — utility (footer) | — | `activity-log`, `bendie-planner` (+ "Manage modules" action) |

Count: 2 + 4 + 6 + 3 + 5 + 10 + 2 = **32**. A test asserts that every key in `EVENT_SECTIONS` has exactly one area. Section labels stay as in `EVENT_SECTIONS` (no renames in this feature).

## Organisation destinations (v2)

| Order | Label | Route(s) | Notes |
|---|---|---|---|
| 1 | Home | `/portal` (→ product home) | Active on `/portal`, `/portal/bendie`, `/portal/planner` |
| 2 | Events | `/portal/events` (→ product list) | Active on list routes and `/portal/events/*` |
| 3 | People | `/portal/people`; Teams `/portal/teams` as a 2nd-level item | |
| 4 | Library | `/portal/assets` | Label "Library", route unchanged |
| 5 | Activity | `/portal/activity-log` | The bell opens the same |
| footer | Settings, Help, Logout | `/portal/settings`, mailto, logout | |
| Stawi only | Organisations, Moderation | `/portal/admin/organisations`, `/portal/admin/moderation` | Via the org switcher menu, as today |

## Layout choice

| Field | Values | Where |
|---|---|---|
| `studio_shell` cookie | `v1` (default) \| `v2` | Browser; path `/portal`; 1 year; SameSite=Lax |
| `?shell=` | `v1` \| `v2` | Overrides and re-writes the cookie |

## Context strip

| Field | Source |
|---|---|
| Organisation name | `OrganizationContext` |
| Event name | `EventContext.currentEvent` |
| Products | `useEventWorkspace().productAvailability` (bendie/planner true) → chips "Attendee app", "Planner" (text + `product-*` tokens) |
| Visibility sentence | `visibilitySentence(status, hasPlanner)` (research R5) |
| Role | `roleLabel({isGlobalAdmin, orgRole, eventRole})` (research R4) |
