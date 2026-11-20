# 17 — Proposed Information Architecture

**Status:** PROPOSAL, for developer review. It isn't approved and nothing here is built. Once approved, each part becomes a Spec Kit feature (030+). Inputs: docs 05, 06, 09–13, 15.

## Problems this answers (verified, from docs 13 and 15)

1. **Breadth:** 32 event sections in 11 areas, with up to 3 navigation levels (#1).
2. **Four "person" concepts** on four screens (#2).
3. **Product as a mode:** a header switcher changes what Studio shows; the event's product type is only implied by colour (#18, October audit #38).
4. **No sense of state:** you can't tell whether attendees can see something, or whether it's public (#3).
5. **Unreliable readiness:** two readiness models, and B1 means the main Required check never passes in production (#5, #10b).

## Principles

1. **Organise by the organiser's job, not by database table or product.** Bendie and Planner are attributes of an event and of each setting, not separate places to go.
2. **About 6 primary destinations per workspace.** Nothing is removed; less-used pages move one level down (Portal 2.0 §8.2).
3. **Every record opens in context.** A list plus a right-hand inspector keeps filters, selection and scroll.
4. **Always show where you are, what's visible and what you can do:** organisation, event, products, visibility and your role are always on screen.
5. **The same data and rules behind the guided and the direct path** (§8.5).

## Three workspaces (validated against the code)

| Workspace | Who | Exists today as | Change |
|---|---|---|---|
| **Organisation** | Every org member | `OrgSideNav` + `/portal/*` | Fewer, clearer items; Teams folds into People |
| **Event** | Event managers, org admins, staff | `[eventId]/layout.tsx` with horizontal areas | Becomes a left event sidebar, a canvas and a right inspector |
| **Platform** (Stawi only) | Stawi admins | Org-switcher menu → `/portal/admin/*` | Becomes its own labelled workspace (Organisations, Moderation), invisible to everyone else |

The "product configuration context" in Portal 2.0 §8.1 is **not** proposed as a separate workspace. The code shows products are per-event and per-organisation flags (`event_products`, `organization_products`), and most settings affect exactly one product (doc 09). A separate context would add a mode. Instead every page carries a **product tag** ("Attendee app", "Planner", "Both") telling you where a change shows up.

## Organisation workspace: 5 destinations + settings

| # | Destination | Contains (current routes) | Notes |
|---|---|---|---|
| 1 | **Home** | `/portal`, `/portal/bendie`, `/portal/planner` | One home, not one per product. Events needing attention come from the new readiness model (doc 23). |
| 2 | **Events** | `/portal/events`, `/portal/{bendie,planner}/events` | One list with a product filter instead of the product-switcher mode |
| 3 | **People** | `/portal/people` + `/portal/teams` (tab) | Teams becomes a tab: it only exists to group people |
| 4 | **Library** | `/portal/assets` | Grows into reusable organisation resources (speakers, contacts, FAQs). The reuse part needs approval (doc 40 Q9). |
| 5 | **Activity** | `/portal/activity-log` + header bell | One place; the bell opens it as a panel |
| — | Settings (footer) | `/portal/settings` | Footer item only; the duplicate header gear goes |

The product switcher is removed as a mode. Products become filters on Home and Events, plus badges on each event.

## Event workspace: 6 areas + utilities

```
┌──────────────┬──────────────────────────────────────────────┬───────────────┐
│ ◀ Org › Event│  Toolbar: page title · view switch · filters │  Inspector /  │
│  [Summit ▾]  │           search · bulk bar · primary action │  Copilot      │
│ Bendie·Planner├──────────────────────────────────────────────┤  (collapsible)│
│ Draft · Members│                                             │               │
│ can see edits │            Canvas (table / timeline /        │  record tabs  │
│──────────────│            board / form / builder)          │  or AI panel  │
│ ◉ Overview   │                                              │               │
│ ◎ Setup      │                                              │               │
│ ◎ Programme  │                                              │               │
│ ◎ People     │                                              │               │
│ ◎ Logistics  │                                              │               │
│ ◎ Content    │                                              │               │
│──────────────│                                              │               │
│ Activity · Planner link · Modules                           │               │
└──────────────┴──────────────────────────────────────────────┴───────────────┘
```

### Mapping: every current section has a home (parity, doc 16)

| Area | Page (proposed) | Current section(s) | Product tag |
|---|---|---|---|
| **Overview** | Readiness | `dashboard` | Both |
| | Operations snapshot | `planner-overview` | Planner |
| **Setup** | Event details | `basics` (+ status and visibility, doc 23) | Both |
| | App appearance | `hero` + `theme` (one page, live preview) | Attendee app |
| | Wording & menu | `terminology` | Attendee app |
| | Modules | `ManageModulesModal` (becomes a page) | Both |
| **Programme** | Agenda | `agenda` (attendee-facing) | Attendee app |
| | Run of show | `planner-agenda` + `planner-production` (one timeline, two layers) | Planner |
| | Speakers | `facilitators` | Attendee app |
| | Activities · Excursions | `activities`, `excursions` | Attendee app |
| **People** | Everyone | **new combined list** over `event_members` + Planner `passengers` + Planner access (doc 19 J4) | Both |
| | Attendees & access | `members` | Attendee app |
| | Participants | `planner-people` | Planner |
| | Team & access | Planner permissions (own page; today only a row action) | Planner |
| | Networking | `networking` | Attendee app |
| **Logistics** | Travel | `attendee-travel` + flights and hotels from `planner-logistics` (one per-person view; doc 19 J5) | Both |
| | Ground transport | `planner-logistics` (ground-transport tab) | Planner |
| | Tasks · Vendors · Checklist | `planner-tasks`, `planner-vendors`, `planner-checklist` | Planner |
| **Content** | News · FAQs · Info center · Expo | `news`, `faqs`, `info-center`, `expo` | Attendee app |
| | Media | `gallery`, `event-photos`, `files` | Attendee app |
| | Engagement | `games`, `notifications` | Attendee app |
| | Safety | `emergency` | Attendee app |
| **Utilities** (footer) | Activity log · Bendie Planner link · Modules | `activity-log`, `bendie-planner` | — |

Totals: the 32 current sections land in **6 areas, 31 pages and 2 footer utilities** (Activity log, Planner link). The counts:
- Overview 2, Setup 4, Programme 5, People 5, Logistics 5, Content 10.
- Hero and Theme merge into one page, and so do Planner agenda and Production.
- Two pages are new: "Everyone", and Team & access as its own page.
- Modules moves from a dialog to a page.

So the user faces 6 choices at the top level instead of 11 areas, with no page lost. Areas show only the pages the event's products and the user's permissions allow, using the same rules as `isSectionAvailable` today, applied once.

### What moves, and why

- **Hero + Theme → App appearance**, one page with a live phone preview. Users configure both together, and `EventThemePreview` already exists.
- **Planner agenda + Production → Run of show.** It's the same timeline: Production rows hang off sessions. This removes one of the three agenda lists (doc 13 #7).
- **Attendee travel + Planner flights/hotels → Travel.** One per-person view with an "attendee sees this" layer, replacing one-attendee-at-a-time entry (doc 13 #9). The data stays in its own database (doc 09).
- **People → "Everyone".** One list joined on email (and on `planner_profile_id` where linked), with columns for App access · Participant · Planner access · Travel, and one inspector per person. It's honest about the email-bridge gaps: "not linked" is shown, never guessed (doc 09: 86% of passengers have no email).
- **Emergency → Content › Safety.** It's attendee-app content, not operations.

## Always-visible context strip (event sidebar header)

| Element | Answers | Source |
|---|---|---|
| Org › Event switcher | Where am I? | `OrganizationContext`, `EventContext` |
| Product chips "Attendee app · Planner" | Which products does this event have? | `event_products` |
| Visibility line, e.g. "Draft · members see changes immediately" or "Public" | Can people see what I change? | `events.status` + doc 09 rules |
| Your role, e.g. "You: Org admin" (on hover) | Why can't I do X? | `portalAuth`, Planner capability |

## Not decided here (for doc 40 / developer)

- Whether to introduce a real **draft/publish** step for content (doc 40 Q5). This IA works either way; the visibility line just changes wording.
- Whether "Everyone" may write to both databases from one inspector, or links out to the owning page. **Proposed:** read across both, write through the owning page's existing service (no new cross-database writes in phase 1).
- Org-level **Library** reuse of speakers and contacts (Q9).
