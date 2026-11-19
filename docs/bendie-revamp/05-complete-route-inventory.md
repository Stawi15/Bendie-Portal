# 05 — Complete Route Inventory

**Status:** VERIFIED from source (2026-11-19). Not browser-verified, because there's no test account yet (see [15](15-browser-exploration-report.md)). Generated from `data/routes.json`, so regenerate that file rather than hand-editing this one.

**Totals:** 54 pages (`page.tsx`), 64 API route files, 3 layouts (`app/layout.tsx`, `app/portal/layout.tsx`, `app/portal/events/[eventId]/layout.tsx`), 1 middleware (`src/middleware.ts`).

## How a route is reached

- **Sidebar** (`OrgSideNav`): Overview, Events, People, Assets, Teams, Activity Log, Settings, plus Help (mailto) and Logout.
- **Header** (`TopHeader`): org switcher menu (for Stawi admins it also holds New Organisation, Organisations and Moderation), product switcher (Bendie / Bendie Planner), "Search experiences…" (searches events only), bell (org activity, linking to `/portal/activity-log`), settings icon (`/portal/settings`), avatar menu (profile, Logout), "+ New Event" (opens `CreateEventModal`, not a route).
- **Event workspace** (`[eventId]/layout.tsx`): grouped area row → section stepper → Previous/Next, all driven by `EVENT_SECTIONS` and filtered by `isSectionAvailable` (product entitlement + Planner capability).
- **Direct URL only:** `/portal/no-access`, `/portal/no-product`, `/unauthorized` (middleware/redirect targets), `/auth/reset-password` (email link).

## Scope & permission legend

| Scope | Gate |
|---|---|
| public | none (middleware sends signed-in Stawi admins from `/auth/*` to `/portal`) |
| organization | signed in **and** (Stawi admin **or** ≥1 `organization_members` row), checked in middleware with a 60s cookie cache; then RLS |
| event | as organization, plus event access (`event_members` row, org owner/admin, or Stawi admin), resolved in `EventContext`; tabs then filtered by product + Planner capability |
| platform-admin | `portal_is_global_admin()`, checked in middleware and again in the page and its API |

## Public & auth

| Route | Label · group · product | Purpose | DB tables / RPCs | API deps | Status | File |
|---|---|---|---|---|---|---|
| `/` | — | — | — | — | Fully implemented — unverified in browser | [app/page.tsx](../../src/app/page.tsx) |
| `/auth/forgot-password` | — | — | — | — | Fully implemented — unverified in browser | [forgot-password/page.tsx](../../src/app/auth/forgot-password/page.tsx) |
| `/auth/login` | — | — | — | — | Fully implemented — unverified in browser | [login/page.tsx](../../src/app/auth/login/page.tsx) |
| `/auth/reset-password` | — | — | — | — | Fully implemented — unverified in browser | [reset-password/page.tsx](../../src/app/auth/reset-password/page.tsx) |
| `/auth/signup` | — | — | organizations, organization_members | — | Fully implemented — unverified in browser | [signup/page.tsx](../../src/app/auth/signup/page.tsx) |
| `/unauthorized` | — | — | — | — | Fully implemented — unverified in browser | [unauthorized/page.tsx](../../src/app/unauthorized/page.tsx) |

## Organisation workspace

| Route | Label · group · product | Purpose | DB tables / RPCs | API deps | Status | File |
|---|---|---|---|---|---|---|
| `/portal` | — | — | — | — | Fully implemented (redirect) | [portal/page.tsx](../../src/app/portal/page.tsx) |
| `/portal/activity-log` | — | — | organization_audit_log, profiles | — | Fully implemented — unverified in browser | [activity-log/page.tsx](../../src/app/portal/activity-log/page.tsx) |
| `/portal/assets` | — | — | organization_assets | — | Fully implemented — unverified in browser | [assets/page.tsx](../../src/app/portal/assets/page.tsx) |
| `/portal/bendie` | — | — | agenda_sessions, emergency_contacts, event_content_audit_log, facilitators | — | Fully implemented — unverified in browser | [bendie/page.tsx](../../src/app/portal/bendie/page.tsx) |
| `/portal/bendie/events` | — | — | — | — | Fully implemented — unverified in browser | [events/page.tsx](../../src/app/portal/bendie/events/page.tsx) |
| `/portal/events` | — | — | — | — | Fully implemented (redirect) | [events/page.tsx](../../src/app/portal/events/page.tsx) |
| `/portal/no-access` | — | — | — | — | Fully implemented — unverified in browser | [no-access/page.tsx](../../src/app/portal/no-access/page.tsx) |
| `/portal/no-product` | — | — | — | — | Fully implemented — unverified in browser | [no-product/page.tsx](../../src/app/portal/no-product/page.tsx) |
| `/portal/people` | — | — | event_members, organization_members, profiles | `/api/admin/bulk-create-users`<br>`/api/admin/create-user`<br>`/api/organizations/[param]/people`<br>`/api/organizations/[param]/people/[param]`<br>`/api/organizations/[param]/people/search` | Fully implemented — unverified in browser | [people/page.tsx](../../src/app/portal/people/page.tsx) |
| `/portal/planner` | — | — | agenda_sessions, emergency_contacts, event_content_audit_log, facilitators | — | Fully implemented — unverified in browser | [planner/page.tsx](../../src/app/portal/planner/page.tsx) |
| `/portal/planner/events` | — | — | — | — | Fully implemented — unverified in browser | [events/page.tsx](../../src/app/portal/planner/events/page.tsx) |
| `/portal/settings` | — | — | — | — | Fully implemented — unverified in browser | [settings/page.tsx](../../src/app/portal/settings/page.tsx) |
| `/portal/teams` | — | — | organization_members, team_members, teams, is_organization_admin() | — | Fully implemented — unverified in browser | [teams/page.tsx](../../src/app/portal/teams/page.tsx) |

## Platform admin (Stawi)

| Route | Label · group · product | Purpose | DB tables / RPCs | API deps | Status | File |
|---|---|---|---|---|---|---|
| `/portal/admin/moderation` | — | — | — | `/api/admin/moderation`<br>`/api/admin/moderation/[param]` | Fully implemented — unverified in browser | [moderation/page.tsx](../../src/app/portal/admin/moderation/page.tsx) |
| `/portal/admin/organisations` | — | — | events, organization_members, organization_planner_links, organization_products, organizations | `/api/admin/organizations` | Fully implemented — unverified in browser | [organisations/page.tsx](../../src/app/portal/admin/organisations/page.tsx) |
| `/portal/admin/organisations/[organizationId]` | — | — | event_products, events, organization_audit_log, organization_members, organization_planner_links, organization_products, organizations, profiles | `/api/admin/organizations/[param]/planner-connection`<br>`/api/admin/organizations/[param]/products/[param]` | Fully implemented — unverified in browser | [[organizationId]/page.tsx](../../src/app/portal/admin/organisations/[organizationId]/page.tsx) |

## Event workspace

| Route | Label · group · product | Purpose | DB tables / RPCs | API deps | Status | File |
|---|---|---|---|---|---|---|
| `/portal/events/[eventId]/activities` | Activities · Programme · bendie | Experiences and activities attendees can take part in | activities, activity_images, organization_assets | — | Fully implemented — unverified in browser | [activities/page.tsx](../../src/app/portal/events/[eventId]/activities/page.tsx) |
| `/portal/events/[eventId]/activity-log` | Activity Log · Operations · bendie | Audit trail of all changes | event_content_audit_log, profiles | — | Fully implemented — unverified in browser | [activity-log/page.tsx](../../src/app/portal/events/[eventId]/activity-log/page.tsx) |
| `/portal/events/[eventId]/agenda` | Agenda · Programme · bendie | Session schedule and timetable | agenda_breakout_assignments, agenda_breakout_room_items, agenda_breakout_rooms, agenda_session_speakers, agenda_sessions, event_members, facilitators, is_event_host_or_organizer(), is_event_org_admin(), save_breakout_rooms() | — | Fully implemented — unverified in browser | [agenda/page.tsx](../../src/app/portal/events/[eventId]/agenda/page.tsx) |
| `/portal/events/[eventId]/attendee-travel` | Attendee Travel · Attendees · bendie | Flight and transfer details each attendee sees in the app | attendee_travel_details, event_members | `/api/admin/planner-pull-travel` | Fully implemented — unverified in browser | [attendee-travel/page.tsx](../../src/app/portal/events/[eventId]/attendee-travel/page.tsx) |
| `/portal/events/[eventId]/basics` | Basics · Event Setup · bendie | Name, dates, location, status | events | — | Fully implemented — unverified in browser | [basics/page.tsx](../../src/app/portal/events/[eventId]/basics/page.tsx) |
| `/portal/events/[eventId]/bendie-planner` | Bendie Planner · Operations · shared | Link this event to Bendie Planner and sync members, agenda & travel | event_planner_links, event_products, get_event_planner_sync_status() | `/api/admin/planner-events`<br>`/api/admin/planner-link`<br>`/api/admin/planner-pull-travel`<br>`/api/admin/planner-push-agenda` | Fully implemented — unverified in browser | [bendie-planner/page.tsx](../../src/app/portal/events/[eventId]/bendie-planner/page.tsx) |
| `/portal/events/[eventId]/dashboard` | Dashboard · Overview · bendie | What’s ready, what’s missing, and what to do next | event_members | `/api/events/[param]/planner-readiness`<br>`/api/events/[param]/retry-planner-provisioning` | Fully implemented — unverified in browser | [dashboard/page.tsx](../../src/app/portal/events/[eventId]/dashboard/page.tsx) |
| `/portal/events/[eventId]/emergency` | Emergency · Operations · bendie | Emergency contacts and procedures | emergency_contacts, emergency_images | — | Fully implemented — unverified in browser | [emergency/page.tsx](../../src/app/portal/events/[eventId]/emergency/page.tsx) |
| `/portal/events/[eventId]/event-photos` | Event Photos · Media · bendie | Organizer-curated event photos | event_photos, organization_assets | — | Fully implemented — unverified in browser | [event-photos/page.tsx](../../src/app/portal/events/[eventId]/event-photos/page.tsx) |
| `/portal/events/[eventId]/excursions` | Excursions · Programme · bendie | Local recommendations for attendees — places to eat, visit or explore | excursion_categories, excursions, organization_assets | — | Fully implemented — unverified in browser | [excursions/page.tsx](../../src/app/portal/events/[eventId]/excursions/page.tsx) |
| `/portal/events/[eventId]/expo` | Expo Directory · Content · bendie | The exhibitors and sponsors attendees can browse at your event | expo_spaces, organization_assets | — | Fully implemented — unverified in browser | [expo/page.tsx](../../src/app/portal/events/[eventId]/expo/page.tsx) |
| `/portal/events/[eventId]/facilitators` | Speakers · Programme · bendie | Speaker and presenter profiles | facilitators | — | Fully implemented — unverified in browser | [facilitators/page.tsx](../../src/app/portal/events/[eventId]/facilitators/page.tsx) |
| `/portal/events/[eventId]/faqs` | FAQs · Content · bendie | Frequently asked questions | faqs | — | Fully implemented — unverified in browser | [faqs/page.tsx](../../src/app/portal/events/[eventId]/faqs/page.tsx) |
| `/portal/events/[eventId]/files` | Files · Media · bendie | Documents for attendees to download | — | — | Fully implemented — unverified in browser | [files/page.tsx](../../src/app/portal/events/[eventId]/files/page.tsx) |
| `/portal/events/[eventId]/gallery` | Gallery · Media · bendie | Attendee photo gallery | — | `/api/events/[param]/gallery`<br>`/api/events/[param]/gallery/[param]` | Fully implemented — unverified in browser | [gallery/page.tsx](../../src/app/portal/events/[eventId]/gallery/page.tsx) |
| `/portal/events/[eventId]/games` | Games · Operations · bendie | Quiz games and trivia | game_questions, games | — | Fully implemented — unverified in browser | [games/page.tsx](../../src/app/portal/events/[eventId]/games/page.tsx) |
| `/portal/events/[eventId]/hero` | Hero & Branding · Event Setup · bendie | Hero image, title, banner | events, organization_assets | — | Fully implemented — unverified in browser | [hero/page.tsx](../../src/app/portal/events/[eventId]/hero/page.tsx) |
| `/portal/events/[eventId]/info-center` | Info Center · Content · bendie | Support contacts and info | info_content, support_contacts | — | Fully implemented — unverified in browser | [info-center/page.tsx](../../src/app/portal/events/[eventId]/info-center/page.tsx) |
| `/portal/events/[eventId]/members` | Attendees & Access · Attendees · bendie | People who can use the Bendie attendee app for this event, and how they get access | event_members, facilitators, profiles, teams, is_event_host_or_organizer(), issue_event_access_code() | `/api/events/[param]/members/[param]/planner-permissions`<br>`/api/events/[param]/members/[param]/planner-permissions/deactivate-on-removal`<br>`/api/events/[param]/members/[param]/planner-permissions/disable`<br>`/api/events/[param]/members/[param]/planner-permissions/enable`<br>`/api/organizations/[param]/people/[param]` | Fully implemented — unverified in browser | [members/page.tsx](../../src/app/portal/events/[eventId]/members/page.tsx) |
| `/portal/events/[eventId]/networking` | Networking · Attendees · bendie | Interest questions that help attendees find people to meet | event_interest_options | — | Fully implemented — unverified in browser | [networking/page.tsx](../../src/app/portal/events/[eventId]/networking/page.tsx) |
| `/portal/events/[eventId]/news` | News Feed · Content · bendie | Announcements and articles | news_items, organization_assets | — | Fully implemented — unverified in browser | [news/page.tsx](../../src/app/portal/events/[eventId]/news/page.tsx) |
| `/portal/events/[eventId]/notifications` | Notifications · Operations · bendie | Send or schedule push notifications | event_push_notifications | — | Fully implemented — unverified in browser | [notifications/page.tsx](../../src/app/portal/events/[eventId]/notifications/page.tsx) |
| `/portal/events/[eventId]/planner-agenda` | Agenda · Production · planner | The event programme your team sees in Bendie Planner: sessions, breaks, speakers and MCs | — | `/api/events/[param]/planner-agenda`<br>`/api/events/[param]/planner-agenda/[param]` | Fully implemented — unverified in browser | [planner-agenda/page.tsx](../../src/app/portal/events/[eventId]/planner-agenda/page.tsx) |
| `/portal/events/[eventId]/planner-checklist` | Checklist · Planning · planner | Items to source and check off before the event and on site | — | `/api/events/[param]/planner-checklist`<br>`/api/events/[param]/planner-checklist/[param]` | Fully implemented — unverified in browser | [planner-checklist/page.tsx](../../src/app/portal/events/[eventId]/planner-checklist/page.tsx) |
| `/portal/events/[eventId]/planner-logistics` | Logistics · Logistics · planner | Participant flights, hotel stays and ground transport (vehicles and movements) | — | `/api/events/[param]/planner-logistics/flights`<br>`/api/events/[param]/planner-logistics/flights/[param]`<br>`/api/events/[param]/planner-logistics/ground-transport/assignments/[param]`<br>`/api/events/[param]/planner-logistics/ground-transport/assignments/assign`<br>`/api/events/[param]/planner-logistics/ground-transport/assignments/move`<br>`/api/events/[param]/planner-logistics/ground-transport/movements`<br>`/api/events/[param]/planner-logistics/ground-transport/movements/[param]`<br>`/api/events/[param]/planner-logistics/ground-transport/vehicles`<br>`/api/events/[param]/planner-logistics/ground-transport/vehicles/[param]`<br>`/api/events/[param]/planner-logistics/hotels`<br>`/api/events/[param]/planner-logistics/hotels/[param]`<br>`/api/events/[param]/planner-logistics/overview` | Fully implemented — unverified in browser | [planner-logistics/page.tsx](../../src/app/portal/events/[eventId]/planner-logistics/page.tsx) |
| `/portal/events/[eventId]/planner-overview` | Planner Overview · Overview · planner | Event identity and live session status from Bendie Planner | event_members | `/api/events/[param]/planner-overview`<br>`/api/events/[param]/planner-permissions/can-administer` | Fully implemented — unverified in browser | [planner-overview/page.tsx](../../src/app/portal/events/[eventId]/planner-overview/page.tsx) |
| `/portal/events/[eventId]/planner-people` | Participants · Participants · planner | People tracked for travel and logistics. Participants do not automatically receive Planner access. | event_members, organization_members | `/api/events/[param]`<br>`/api/events/[param]/planner-people`<br>`/api/events/[param]/planner-people/[param]`<br>`/api/events/[param]/planner-people/link`<br>`/api/events/[param]/planner-people/search` | Fully implemented — unverified in browser | [planner-people/page.tsx](../../src/app/portal/events/[eventId]/planner-people/page.tsx) |
| `/portal/events/[eventId]/planner-production` | Production · Production · planner | Run-of-show: what needs to happen, and when, in each session | — | `/api/events/[param]/planner-production`<br>`/api/events/[param]/planner-production/[param]` | Fully implemented — unverified in browser | [planner-production/page.tsx](../../src/app/portal/events/[eventId]/planner-production/page.tsx) |
| `/portal/events/[eventId]/planner-tasks` | Tasks · Planning · planner | To-dos for your event team, tracked in Bendie Planner | — | `/api/events/[param]/planner-tasks`<br>`/api/events/[param]/planner-tasks/[param]` | Fully implemented — unverified in browser | [planner-tasks/page.tsx](../../src/app/portal/events/[eventId]/planner-tasks/page.tsx) |
| `/portal/events/[eventId]/planner-vendors` | Vendors · Planning · planner | Suppliers, the equipment they provide, and whether it has arrived on site | — | `/api/events/[param]/planner-vendors`<br>`/api/events/[param]/planner-vendors/[param]` | Fully implemented — unverified in browser | [planner-vendors/page.tsx](../../src/app/portal/events/[eventId]/planner-vendors/page.tsx) |
| `/portal/events/[eventId]/terminology` | Terminology · Event Setup · bendie | Speaker labels, event category and theme, and the feedback link | events | — | Fully implemented — unverified in browser | [terminology/page.tsx](../../src/app/portal/events/[eventId]/terminology/page.tsx) |
| `/portal/events/[eventId]/theme` | Theme Colours · Event Setup · bendie | Brand, card and heading colours of the attendee app | events | — | Fully implemented — unverified in browser | [theme/page.tsx](../../src/app/portal/events/[eventId]/theme/page.tsx) |

## API routes

SR = uses a service-role client (Bendie or Planner). Every route re-checks the caller on the server; "auth helpers" are the checks found in the file.

| Route | Methods | SR | Auth helpers | File |
|---|---|---|---|---|
| `/api/admin/bulk-create-users` | POST | yes | readCallerProfile, auth.getUser | [route.ts](../../src/app/api/admin/bulk-create-users/route.ts) |
| `/api/admin/create-user` | POST | yes | readCallerProfile, auth.getUser | [route.ts](../../src/app/api/admin/create-user/route.ts) |
| `/api/admin/moderation` | GET |  | requirePlatformAdmin | [route.ts](../../src/app/api/admin/moderation/route.ts) |
| `/api/admin/moderation/[reportId]` | GET, POST |  | requirePlatformAdmin | [route.ts](../../src/app/api/admin/moderation/[reportId]/route.ts) |
| `/api/admin/organizations` | POST |  | requirePlatformAdmin | [route.ts](../../src/app/api/admin/organizations/route.ts) |
| `/api/admin/organizations/[organizationId]/events/[eventId]/products` | POST |  | requirePlatformAdmin | [route.ts](../../src/app/api/admin/organizations/[organizationId]/events/[eventId]/products/route.ts) |
| `/api/admin/organizations/[organizationId]/impact` | GET |  | requirePlatformAdmin | [route.ts](../../src/app/api/admin/organizations/[organizationId]/impact/route.ts) |
| `/api/admin/organizations/[organizationId]/planner-connection` | POST |  | requirePlatformAdmin | [route.ts](../../src/app/api/admin/organizations/[organizationId]/planner-connection/route.ts) |
| `/api/admin/organizations/[organizationId]/products/[product]` | PATCH |  | requirePlatformAdmin | [route.ts](../../src/app/api/admin/organizations/[organizationId]/products/[product]/route.ts) |
| `/api/admin/planner-events` | GET | yes | readCallerProfile, auth.getUser | [route.ts](../../src/app/api/admin/planner-events/route.ts) |
| `/api/admin/planner-link` | POST |  | readCallerProfile, auth.getUser | [route.ts](../../src/app/api/admin/planner-link/route.ts) |
| `/api/admin/planner-organizations` | GET |  | requirePlatformAdmin | [route.ts](../../src/app/api/admin/planner-organizations/route.ts) |
| `/api/admin/planner-pull-travel` | POST | yes | readCallerProfile, auth.getUser | [route.ts](../../src/app/api/admin/planner-pull-travel/route.ts) |
| `/api/admin/planner-push-agenda` | POST | yes | readCallerProfile, auth.getUser | [route.ts](../../src/app/api/admin/planner-push-agenda/route.ts) |
| `/api/admin/planner-sync-member` | POST | yes | readCallerProfile, auth.getUser, portal_is_global_admin | [route.ts](../../src/app/api/admin/planner-sync-member/route.ts) |
| `/api/events/[eventId]/gallery` | GET |  | via shared helper | [route.ts](../../src/app/api/events/[eventId]/gallery/route.ts) |
| `/api/events/[eventId]/gallery/[postId]` | PATCH, DELETE |  | via shared helper | [route.ts](../../src/app/api/events/[eventId]/gallery/[postId]/route.ts) |
| `/api/events/[eventId]/members` | POST | yes | canAdministerPlannerPermissions, auth.getUser | [route.ts](../../src/app/api/events/[eventId]/members/route.ts) |
| `/api/events/[eventId]/members/[memberId]/planner-permissions` | GET, PATCH | yes | canAdministerPlannerPermissions, readCallerProfile, auth.getUser | [route.ts](../../src/app/api/events/[eventId]/members/[memberId]/planner-permissions/route.ts) |
| `/api/events/[eventId]/members/[memberId]/planner-permissions/deactivate-on-removal` | POST | yes | readCallerProfile, canAdministerPlannerPermissions, portal_is_global_admin, auth.getUser | [route.ts](../../src/app/api/events/[eventId]/members/[memberId]/planner-permissions/deactivate-on-removal/route.ts) |
| `/api/events/[eventId]/members/[memberId]/planner-permissions/disable` | POST | yes | canAdministerPlannerPermissions, readCallerProfile, auth.getUser | [route.ts](../../src/app/api/events/[eventId]/members/[memberId]/planner-permissions/disable/route.ts) |
| `/api/events/[eventId]/members/[memberId]/planner-permissions/enable` | POST | yes | canAdministerPlannerPermissions, readCallerProfile, auth.getUser | [route.ts](../../src/app/api/events/[eventId]/members/[memberId]/planner-permissions/enable/route.ts) |
| `/api/events/[eventId]/planner-agenda` | GET, POST |  | resolvePlannerEventAccess | [route.ts](../../src/app/api/events/[eventId]/planner-agenda/route.ts) |
| `/api/events/[eventId]/planner-agenda/[itemId]` | PATCH, DELETE |  | resolvePlannerEventAccess | [route.ts](../../src/app/api/events/[eventId]/planner-agenda/[itemId]/route.ts) |
| `/api/events/[eventId]/planner-capabilities` | GET | yes | resolvePlannerEventAccess | [route.ts](../../src/app/api/events/[eventId]/planner-capabilities/route.ts) |
| `/api/events/[eventId]/planner-checklist` | GET, POST, DELETE | yes | readCallerProfile, auth.getUser, resolveCallerPlannerIdentity | [route.ts](../../src/app/api/events/[eventId]/planner-checklist/route.ts) |
| `/api/events/[eventId]/planner-checklist/[itemId]` | PATCH, DELETE | yes | resolveCallerPlannerIdentity, readCallerProfile, auth.getUser | [route.ts](../../src/app/api/events/[eventId]/planner-checklist/[itemId]/route.ts) |
| `/api/events/[eventId]/planner-checklist/capability` | GET | yes | resolveCallerPlannerIdentity, readCallerProfile, auth.getUser | [route.ts](../../src/app/api/events/[eventId]/planner-checklist/capability/route.ts) |
| `/api/events/[eventId]/planner-logistics/capability` | GET | yes | canAdministerPlannerPermissions, resolveCallerPlannerIdentity, readCallerProfile, auth.getUser | [route.ts](../../src/app/api/events/[eventId]/planner-logistics/capability/route.ts) |
| `/api/events/[eventId]/planner-logistics/flights` | GET, POST | yes | canAdministerPlannerPermissions, readCallerProfile, auth.getUser, resolveCallerPlannerIdentity | [route.ts](../../src/app/api/events/[eventId]/planner-logistics/flights/route.ts) |
| `/api/events/[eventId]/planner-logistics/flights/[recordId]` | PATCH, DELETE | yes | canAdministerPlannerPermissions, resolveCallerPlannerIdentity, readCallerProfile, auth.getUser | [route.ts](../../src/app/api/events/[eventId]/planner-logistics/flights/[recordId]/route.ts) |
| `/api/events/[eventId]/planner-logistics/ground-transport/assignments/[assignmentId]` | DELETE | yes | canAdministerPlannerPermissions, resolveCallerPlannerIdentity, readCallerProfile, auth.getUser | [route.ts](../../src/app/api/events/[eventId]/planner-logistics/ground-transport/assignments/[assignmentId]/route.ts) |
| `/api/events/[eventId]/planner-logistics/ground-transport/assignments/assign` | POST | yes | canAdministerPlannerPermissions, resolveCallerPlannerIdentity, readCallerProfile, auth.getUser | [route.ts](../../src/app/api/events/[eventId]/planner-logistics/ground-transport/assignments/assign/route.ts) |
| `/api/events/[eventId]/planner-logistics/ground-transport/assignments/move` | POST | yes | canAdministerPlannerPermissions, resolveCallerPlannerIdentity, readCallerProfile, auth.getUser | [route.ts](../../src/app/api/events/[eventId]/planner-logistics/ground-transport/assignments/move/route.ts) |
| `/api/events/[eventId]/planner-logistics/ground-transport/movements` | GET, POST | yes | canAdministerPlannerPermissions, readCallerProfile, auth.getUser, resolveCallerPlannerIdentity | [route.ts](../../src/app/api/events/[eventId]/planner-logistics/ground-transport/movements/route.ts) |
| `/api/events/[eventId]/planner-logistics/ground-transport/movements/[movementId]` | PATCH, DELETE | yes | canAdministerPlannerPermissions, resolveCallerPlannerIdentity, readCallerProfile, auth.getUser | [route.ts](../../src/app/api/events/[eventId]/planner-logistics/ground-transport/movements/[movementId]/route.ts) |
| `/api/events/[eventId]/planner-logistics/ground-transport/vehicles` | POST | yes | canAdministerPlannerPermissions, resolveCallerPlannerIdentity, readCallerProfile, auth.getUser | [route.ts](../../src/app/api/events/[eventId]/planner-logistics/ground-transport/vehicles/route.ts) |
| `/api/events/[eventId]/planner-logistics/ground-transport/vehicles/[vehicleId]` | PATCH, DELETE | yes | canAdministerPlannerPermissions, resolveCallerPlannerIdentity, readCallerProfile, auth.getUser | [route.ts](../../src/app/api/events/[eventId]/planner-logistics/ground-transport/vehicles/[vehicleId]/route.ts) |
| `/api/events/[eventId]/planner-logistics/hotels` | GET, POST | yes | canAdministerPlannerPermissions, readCallerProfile, auth.getUser, resolveCallerPlannerIdentity | [route.ts](../../src/app/api/events/[eventId]/planner-logistics/hotels/route.ts) |
| `/api/events/[eventId]/planner-logistics/hotels/[bookingId]` | PATCH, DELETE | yes | canAdministerPlannerPermissions, resolveCallerPlannerIdentity, readCallerProfile, auth.getUser | [route.ts](../../src/app/api/events/[eventId]/planner-logistics/hotels/[bookingId]/route.ts) |
| `/api/events/[eventId]/planner-logistics/overview` | GET |  | resolvePlannerEventAccess | [route.ts](../../src/app/api/events/[eventId]/planner-logistics/overview/route.ts) |
| `/api/events/[eventId]/planner-overview` | GET | yes | readCallerProfile, auth.getUser | [route.ts](../../src/app/api/events/[eventId]/planner-overview/route.ts) |
| `/api/events/[eventId]/planner-people` | GET, POST | yes | canAdministerPlannerPermissions, readCallerProfile, auth.getUser, resolveCallerPlannerIdentity | [route.ts](../../src/app/api/events/[eventId]/planner-people/route.ts) |
| `/api/events/[eventId]/planner-people/[passengerId]` | PATCH, DELETE | yes | canAdministerPlannerPermissions, resolveCallerPlannerIdentity, readCallerProfile, auth.getUser | [route.ts](../../src/app/api/events/[eventId]/planner-people/[passengerId]/route.ts) |
| `/api/events/[eventId]/planner-people/capability` | GET | yes | canAdministerPlannerPermissions, resolveCallerPlannerIdentity, readCallerProfile, auth.getUser | [route.ts](../../src/app/api/events/[eventId]/planner-people/capability/route.ts) |
| `/api/events/[eventId]/planner-people/link` | POST | yes | canAdministerPlannerPermissions, resolveCallerPlannerIdentity, readCallerProfile, auth.getUser | [route.ts](../../src/app/api/events/[eventId]/planner-people/link/route.ts) |
| `/api/events/[eventId]/planner-people/search` | GET | yes | canAdministerPlannerPermissions, resolveCallerPlannerIdentity, readCallerProfile, auth.getUser | [route.ts](../../src/app/api/events/[eventId]/planner-people/search/route.ts) |
| `/api/events/[eventId]/planner-permissions/can-administer` | GET | yes | canAdministerPlannerPermissions, readCallerProfile, auth.getUser | [route.ts](../../src/app/api/events/[eventId]/planner-permissions/can-administer/route.ts) |
| `/api/events/[eventId]/planner-production` | GET, POST | yes | canAdministerPlannerPermissions, readCallerProfile, auth.getUser, resolveCallerPlannerIdentity | [route.ts](../../src/app/api/events/[eventId]/planner-production/route.ts) |
| `/api/events/[eventId]/planner-production/[productionId]` | PATCH, DELETE | yes | canAdministerPlannerPermissions, resolveCallerPlannerIdentity, readCallerProfile, auth.getUser | [route.ts](../../src/app/api/events/[eventId]/planner-production/[productionId]/route.ts) |
| `/api/events/[eventId]/planner-production/capability` | GET | yes | canAdministerPlannerPermissions, resolveCallerPlannerIdentity, readCallerProfile, auth.getUser | [route.ts](../../src/app/api/events/[eventId]/planner-production/capability/route.ts) |
| `/api/events/[eventId]/planner-readiness` | GET |  | resolvePlannerEventAccess | [route.ts](../../src/app/api/events/[eventId]/planner-readiness/route.ts) |
| `/api/events/[eventId]/planner-tasks` | GET, POST | yes | readCallerProfile, auth.getUser | [route.ts](../../src/app/api/events/[eventId]/planner-tasks/route.ts) |
| `/api/events/[eventId]/planner-tasks/[taskId]` | PATCH, DELETE | yes | resolveCallerPlannerIdentity, readCallerProfile, auth.getUser | [route.ts](../../src/app/api/events/[eventId]/planner-tasks/[taskId]/route.ts) |
| `/api/events/[eventId]/planner-tasks/capability` | GET | yes | resolveCallerPlannerIdentity, readCallerProfile, auth.getUser | [route.ts](../../src/app/api/events/[eventId]/planner-tasks/capability/route.ts) |
| `/api/events/[eventId]/planner-vendors` | GET, POST, DELETE | yes | readCallerProfile, auth.getUser, resolveCallerPlannerIdentity | [route.ts](../../src/app/api/events/[eventId]/planner-vendors/route.ts) |
| `/api/events/[eventId]/planner-vendors/[itemId]` | PATCH, DELETE | yes | resolveCallerPlannerIdentity, readCallerProfile, auth.getUser | [route.ts](../../src/app/api/events/[eventId]/planner-vendors/[itemId]/route.ts) |
| `/api/events/[eventId]/planner-vendors/capability` | GET | yes | resolveCallerPlannerIdentity, readCallerProfile, auth.getUser | [route.ts](../../src/app/api/events/[eventId]/planner-vendors/capability/route.ts) |
| `/api/events/[eventId]/retry-planner-provisioning` | POST | yes | readCallerProfile, auth.getUser | [route.ts](../../src/app/api/events/[eventId]/retry-planner-provisioning/route.ts) |
| `/api/events/create` | POST | yes | portal_is_global_admin, auth.getUser | [route.ts](../../src/app/api/events/create/route.ts) |
| `/api/organizations/[organizationId]/people` | POST | yes | readCallerProfile, auth.getUser | [route.ts](../../src/app/api/organizations/[organizationId]/people/route.ts) |
| `/api/organizations/[organizationId]/people/[userId]` | PATCH | yes | auth.getUser | [route.ts](../../src/app/api/organizations/[organizationId]/people/[userId]/route.ts) |
| `/api/organizations/[organizationId]/people/contacts` | GET | yes | readCallerProfile, is_organization_admin, auth.getUser | [route.ts](../../src/app/api/organizations/[organizationId]/people/contacts/route.ts) |
| `/api/organizations/[organizationId]/people/search` | GET | yes | readCallerProfile, auth.getUser | [route.ts](../../src/app/api/organizations/[organizationId]/people/search/route.ts) |

## Classification summary

| Class | Routes |
|---|---|
| Fully implemented | All event, org and admin pages listed above (source-confirmed; none browser-verified) |
| Implemented but inaccessible / near-hidden | `/portal/bendie`, `/portal/planner`, `/portal/bendie/events`, `/portal/planner/events` are reached only through `/portal` and `/portal/events` redirects (product-resolved homes). `bendie-planner` tab is listed for everyone but usable only by Stawi admins. |
| Placeholder / thin | `/portal/settings` (two read-only fields, per the October audit §4.7). `ComingSoonPanel` component exists. |
| Redirect-only | `/portal`, `/portal/events` |
| Deprecated | none found |
| Broken | none confirmed (needs browser pass) |
| Unverified | every route: no browser session was possible |

## Missing from older docs

`context/project-overview.md` lists 21 event tabs and says admins only. Source now has **32 event sections** (24 Bendie or shared, 8 Planner) and admits **any organisation member**. Missing from it: `files`, `notifications`, all 8 `planner-*` pages, `/portal/admin/*`, `/portal/bendie*`, `/portal/planner*`, `/portal/no-access`, `/portal/no-product`.
