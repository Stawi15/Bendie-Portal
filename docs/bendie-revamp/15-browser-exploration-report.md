# 15 — Browser Exploration Report

**Status:** DONE (pass 1), 2026-11-19, against the **TEST environment**, which holds synthetic data only. Production was never touched. A request guard aborts the run if the app contacts a production Supabase project.

## Setup

| | |
|---|---|
| Environment | Bendie test `baqivpboykobrqlxxoph` + Planner test `xwqhisiwvnhluihcpliz`. Schema-only copies of production with identical permissions (doc 40 Q1). Local `next dev` started with `.env.test.local`. |
| Data | "Studio Test Org" (both products). **Summit:** Bendie-only draft event with 26 attendees, 4 speakers, 8 speaker profiles (3 without bio), 10 sessions (one deliberate overlap). **Tester:** Bendie + Planner event created through the UI, Planner set up via Retry. |
| Roles | `stawi_admin` (platform admin), `org_admin` (organisation owner, event admin), `event_staff` (organisation member, staff on Summit only) |
| Tool | `tools/walkthrough.py` (Playwright 1.60, Chromium). Read-only: navigation and screenshots only. |
| Output | `data/walkthrough.json` (252 visits), `screenshots/<role>/*.jpg`: the full set for the Stawi admin, dashboards for the other roles, and 4 key screens at 1024, 768 and 390 px |

All 252 visits returned HTTP 200. Load times come from `next dev`, which compiles on first visit (median about 3 s), so they're **not** production performance and aren't used as a baseline.

## Access by role (browser-verified)

Upgrades doc 10 from source-confirmed to **[BV]**:

| Area | Stawi admin | Org admin | Event staff |
|---|---|---|---|
| `/portal/admin/*` (organisations, moderation) | ✓ | → `/unauthorized` | → `/unauthorized` |
| `/portal`, `/portal/events` | → product home (`/portal/bendie…`) | same | same |
| Event they belong to, Bendie tabs | ✓ all | ✓ all | ✓ all except **Attendees & Access** (no access) |
| Bendie Planner tab | ✓ | listed, then "no access" | listed, then "no access" |
| Planner tabs on a Bendie-only event | → dashboard `?product=bendie` | same | same |
| Event they don't belong to | — | — | "no access" on every tab (correct), but each logs a console error |

## Bugs found (production code; reproduced on the test copy)

> **Fixed 2026-11-20** on branch `fix/dashboard-and-planner-bugs` (from `main`, commit `992e198`, not yet merged or pushed). They were verified in the browser on the test copy. While fixing them:
> - B1 turned out wider: the dashboard's generic section counts also used `select('*')` and included `event_members`.
> - B2 was worse than recorded: the failed count made the **whole** admin organisation page show "We couldn't load this organisation".

| # | Bug | Impact | Evidence | Fix size |
|---|---|---|---|---|
| **B1** | The event dashboard counts attendees with `event_members.select('*', {head: true})`. Five `planner_*` columns on `event_members` aren't readable by signed-in users (live production grants), so the request is **refused (403) for every role, including Stawi admins**. | Since Feature 016, every dashboard shows **"At least one attendee with access" as not done** and the Attendees area as "Not started", whatever the real count. The Summit has 26 attendees and still shows 1 of 2 required. | `dashboard/page.tsx:170`; prod `has_column_privilege` false for 5 columns; screenshot `stawi_admin/summit_dashboard.jpg` | One line: `select('user_id', …)` |
| **B2** | The admin organisation page counts members with `organization_members.select('id', …)`, but that table has no `id` column, so the request fails with 400. | The member count on `/portal/admin/organisations/[id]` is broken. | `admin/organisations/[organizationId]/page.tsx:50` | One line |
| **B3** | The session list shows `agenda_sessions.facilitator_id` (first speaker only), while the full list lives in `agenda_session_speakers`. Production has **8 sessions with linked speakers but no `facilitator_id`**, so they show "No speaker". | Wrong speaker display, and two places to keep in sync | `agenda/page.tsx:259/428`; live counts | Small: derive from the join table |
| B4 | Planner provisioning stuck in `pending` has no in-app recovery (doc 40 T1). | An event stuck in setup for good | Test event "tester" | Small |
| B5 | Old `planner_provisioning_error` isn't cleared after success (doc 40 T3). | Stale data | — | Small |

Lower-noise observations:
- Visiting an event you can't access logs `406` / `PGRST116` (`.single()` on 0 rows) before the no-access screen.
- Attendees & Access calls `planner-permissions/can-administer` on Bendie-only events and gets 403. That's wasted and noisy, but harmless.
- For event staff, Gallery, Attendee Travel and People call contact lookups that return 403. The UI copes (contacts just come back empty, as designed in Feature 027), but each still logs a console error.

## Corrections to earlier docs

- **Doc 13 #10:** the Agenda is now a compact **table** (time, session, type chip, location, speaker), not about 160px cards. The October audit was out of date.
- **Doc 13 #6 confirmed:** overlapping Hall A sessions (10:15–11:15 and 11:00–12:00) show no warning.

## Responsive (390 px)

The event workspace switches to an "Event area" select, a step indicator and a sticky Previous/Next bar. Issues seen:
- The event title is truncated.
- The header packs 7 controls into two rows.
- On Agenda, the "Add session" button is cut off at the right edge.
- The bottom bar overlaps the first list row.

Screenshots are in `screenshots/responsive_w390/`.

## Not covered by this pass

- Writes: create, edit, delete, import and send were deliberately not run. The next pass should script the main journeys (J1–J8 in doc 12) against test data to get baseline timings.
- The mobile apps, real push and email delivery (edge functions aren't deployed in the test projects).
- An accessibility pass (keyboard, screen reader, contrast) with `bendie-design` review mode.
