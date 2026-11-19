# 06 — Feature Inventory

**Status:** VERIFIED from source and the live schema (2026-11-19). None of it is browser-verified. Generated from `data/features.json`.

**55 features**: 49 built in the Portal and 6 that exist in the data or apps with no Portal UI. Detailed per-screen behaviour (forms, fields, states) is in [context/bendie-portal-current-state-audit.md](../../context/bendie-portal-current-state-audit.md) §8–§18, which this file does not repeat.

## Platform and account

| Feature | Where | What it does | Data | Import | Consumed by | Depends on | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| **Sign in, sign up, forgot and reset password** `auth` | /auth/* | Supabase email/password auth. Sign-up creates an organisation and owner membership. | `profiles`, `organizations`, `organization_members` |  | Studio only |  | fully-implemented | Root `/` still says "Event Content Portal". |
| **Portal admission gate** `access-gate` | src/middleware.ts | Lets in Stawi admins and anyone with ≥1 organisation membership. Others go to /portal/no-access; /portal/admin/* is Stawi-only. | `profiles`, `organization_members` |  | Studio only |  | fully-implemented | 60s cookie cache. RLS is the real guard. |
| **Edit own profile** `profile-edit` | EditProfileModal | Edits the signed-in person’s profile fields. | `profiles` |  | Bendie Events app |  | fully-implemented |  |
| **Organisations admin (products, Planner connection, impact)** `org-admin` | /portal/admin/organisations[/:id] | Create organisations. Turn Bendie/Planner products on, pause or resume them per organisation and per event. Connect an organisation to a Planner organisation, with an impact preview. | `organizations`, `organization_products`, `event_products`, `organization_planner_links` |  | Bendie Events app, Bendie Planner app |  | fully-implemented |  |
| **Content moderation** `moderation` | /portal/admin/moderation | Review Report/Block items from the attendee app. Hide/unhide posts and comments, delete messages, remove a person from events (Planner access off too), dismiss, or mark reviewed. | `content_reports`, `posts`, `post_comments`, `messages`, `event_members` |  | Bendie Events app |  | fully-implemented |  |

## Organisation workspace

| Feature | Where | What it does | Data | Import | Consumed by | Depends on | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| **Organisation overview / home** `org-overview` | /portal → /portal/{bendie/planner} | Product-resolved home: metrics, events overview table, needs-attention, next milestone, quick actions, recent activity. | `events`, `facilitators`, `agenda_sessions`, `emergency_contacts`, `faqs`, `event_content_audit_log` |  | Studio only |  | fully-implemented | Uses an 8-check "Setup progress %" that differs from the event Dashboard (see doc 11 and 23). |
| **Events list and discovery** `org-events` | /portal/events → /portal/{bendie/planner}/events | Org-wide event list with lifecycle labels and progress, per product. | `events`, `event_products` |  | Studio only |  | fully-implemented |  |
| **Create event (with products)** `event-create` | CreateEventModal → /api/events/create | Multi-step dialog: products (Bendie / Planner / both), name, dates, timezone, location, modules. Calls the `create_event_with_products` RPC, then provisions the Planner event when Planner is chosen. | `events`, `event_products`, `event_creation_requests`, `event_planner_links` |  | Bendie Events app, Bendie Planner app | product-entitlement | fully-implemented |  |
| **Organisation people** `org-people` | /portal/people | Directory of organisation members and roles. Add a person, search existing people, CSV import, make/revoke admin. Shows contacts through Bendie RPCs. | `organization_members`, `profiles`, `event_members` | yes | Bendie Events app |  | fully-implemented | "Make Admin" grants platform-wide admin (October audit §30.6). |
| **Teams** `teams` | /portal/teams | Named groups of organisation people, used as a source in "Add attendees → From team". | `teams`, `team_members` |  | Studio only |  | fully-implemented | Grants nothing on its own. |
| **Asset library** `org-assets` | /portal/assets | Upload and reuse organisation files and images (org-assets bucket). Picked from content forms via AssetPickerModal. | `organization_assets` |  | Bendie Events app |  | fully-implemented |  |
| **Organisation activity log** `org-activity` | /portal/activity-log | Trigger-written audit trail for organisation-level changes. Also the header bell. | `organization_audit_log`, `profiles` |  | Studio only |  | fully-implemented |  |
| **Organisation settings** `org-settings` | /portal/settings | Read-only organisation fields. | `organizations` |  | Studio only |  | placeholder | Two read-only fields; reached from both the sidebar and the header. |
| **Product entitlement and switcher** `product-entitlement` | TopHeader / ProductContext | Per-organisation products (`organization_products`) and per-event products (`event_products`) decide which areas and tabs exist. A paused product shows a notice. | `organization_products`, `event_products` |  | Bendie Events app, Bendie Planner app |  | fully-implemented |  |

## Event workspace: Bendie and shared

| Feature | Where | What it does | Data | Import | Consumed by | Depends on | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| **Event dashboard and readiness** `event-dashboard` | [eventId]/dashboard | Required / Recommended / Optional checklist, "Recommended next", area cards. For Planner events, Planner readiness counts and the next Planner step. | `events`, `event_members`, `(Planner via /api/events/:id/planner-readiness)` |  | Studio only | event-basics, event-attendees | fully-implemented | Required = name+dates and ≥1 member with role exactly `attendee`. |
| **Manage modules** `manage-modules` | ManageModulesModal (event header) | Choose which content modules this event uses (`portal_setup_modules`). Decides Recommended vs Optional on the Dashboard. | `events` |  | Studio only |  | fully-implemented |  |
| **Basics** `event-basics` | [eventId]/basics | Name, description, dates (venue time), timezone, location, status label, event type, attendee limit. | `events` |  | Bendie Events app, Bendie Planner app (timezone once, at creation) |  | fully-implemented | `status` is a manual label; there is no publish step. |
| **Hero & branding** `hero` | [eventId]/hero | Hero image, title, description and profile banner for the attendee app home. | `events` |  | Bendie Events app | org-assets | fully-implemented |  |
| **Theme colours / Theme designer** `theme` | [eventId]/theme | Primary, secondary and tertiary colours with a live app preview (ThemeDesignerModal, EventThemePreview). | `events` |  | Bendie Events app |  | fully-implemented |  |
| **Terminology and menu** `terminology` | [eventId]/terminology | Speaker labels (singular/plural), category and theme labels and icon, feedback form link, disabled menu items. | `events` |  | Bendie Events app |  | fully-implemented |  |
| **Speakers (facilitators)** `speakers` | [eventId]/facilitators | Speaker and presenter profiles. Can be linked to an account by email (claim). Adding from attendees is supported. | `facilitators` | yes | Bendie Events app |  | fully-implemented | Live data: 58 of 136 have no bio and 51 no photo. |
| **Agenda and breakout rooms** `agenda` | [eventId]/agenda | Sessions by day: block type, audience, location, accent colour, speakers (with speaker types). Breakout rooms in three modes, with capacity and assignments (people list download/upload). Org admins may edit. | `agenda_sessions`, `agenda_session_speakers`, `agenda_breakout_rooms`, `agenda_breakout_room_items`, `agenda_breakout_assignments` | yes | Bendie Events app | speakers, event-basics (timezone) | fully-implemented | 1,267-line page. ~160px cards. Push to Planner is manual. |
| **Activities** `activities` | [eventId]/activities | Experiences with images, rating, location, featured flag. Duplicate is supported. | `activities`, `activity_images` | yes | Bendie Events app | org-assets | fully-implemented |  |
| **Excursions (local recommendations)** `excursions` | [eventId]/excursions | Categorised local recommendations. Categories can be global (event_id null). | `excursions`, `excursion_categories` | yes | Bendie Events app |  | fully-implemented | The header action creates a category; an excursion needs a category first. |
| **Attendees & access** `event-attendees` | [eventId]/members | Event members and roles. Add from org, team, all org people or new (CSV). Access codes are auto-issued and emailed, with resend. Add to speakers. Planner Team & Access row action. | `event_members`, `event_user_access_codes`, `profiles`, `teams` | yes | Bendie Events app | org-people | fully-implemented | 521 attendees; 385 members are still `pending` onboarding, a status nothing in the Portal writes. |
| **Attendee travel** `attendee-travel` | [eventId]/attendee-travel | Per-attendee flight, ground-transfer and other details shown in the app. Pull from Planner (Stawi admins). | `attendee_travel_details` |  | Bendie Events app | event-attendees | fully-implemented | One attendee at a time; free-text dates and times. Only 4 rows live. |
| **Networking questionnaire and matchmaking** `networking` | [eventId]/networking | Interest questions (single/multi select, short/long text), options, required flags, networking mode (full / attendees-only / off). Flags select questions with no options. | `event_interest_options`, `events` | yes | Bendie Events app |  | fully-implemented | Organisers type `question_key`/`option_key` by hand. |
| **News feed** `news` | [eventId]/news | Articles and announcements with themes, image, featured flag, registration link and read time. Can be global. | `news_items` | yes | Bendie Events app |  | fully-implemented |  |
| **FAQs** `faqs` | [eventId]/faqs | Questions grouped by section. | `faqs` | yes | Bendie Events app |  | fully-implemented |  |
| **Info center and support contacts** `info-center` | [eventId]/info-center | Info bullets and support contacts. One contact can be shown on the app’s access screen ("Contact organizer"). | `info_content`, `support_contacts` |  | Bendie Events app |  | fully-implemented |  |
| **Expo directory** `expo` | [eventId]/expo | Exhibitors and sponsors: summary, chips, offering, contacts, CTA. Can be global. | `expo_spaces` | yes | Bendie Events app |  | fully-implemented |  |
| **Gallery moderation** `gallery` | [eventId]/gallery | Attendee photo posts, likes and comments. Hide or delete through the server route so blocks don’t hide content from moderators. | `posts`, `post_likes`, `post_comments` |  | Bendie Events app |  | fully-implemented |  |
| **Event photos** `event-photos` | [eventId]/event-photos | Organiser-curated photos (separate from the gallery). | `event_photos` |  | Bendie Events app | org-assets | fully-implemented |  |
| **Files** `files` | [eventId]/files | Documents for attendees to download, stored in the `event-files` storage bucket. | `storage: event-files` |  | Bendie Events app |  | fully-implemented |  |
| **Emergency contacts and images** `emergency` | [eventId]/emergency | Typed emergency contacts (with location, description, image) and emergency images. | `emergency_contacts`, `emergency_images` |  | Bendie Events app |  | fully-implemented |  |
| **Games / quizzes** `games` | [eventId]/games | Quiz games with questions. Points and leaderboard are app-side (`game_points`). | `games`, `game_questions` |  | Bendie Events app |  | fully-implemented | Answer options are typed as raw JSON. |
| **Push notifications** `push-notifications` | [eventId]/notifications | Send now or schedule push messages to event attendees (send-notification-push edge function). | `event_push_notifications` |  | Bendie Events app |  | fully-implemented | High-impact external communication. 10 sent live. |
| **Event activity log** `event-activity` | [eventId]/activity-log | Trigger-written audit of content changes (INSERT/UPDATE/DELETE with diff). | `event_content_audit_log` |  | Studio only |  | fully-implemented |  |
| **Planner event provisioning** `planner-provisioning` | /api/events/create, retry-planner-provisioning | Creates the linked Planner event (name, dates, location, timezone) and tracks status: not_required, pending, provisioning, succeeded or failed. Retry is available. | `events (planner_provisioning_*)`, `event_planner_links`, `(Planner) events` |  | Bendie Planner app |  | fully-implemented |  |
| **Bendie Planner link and sync** `planner-sync` | [eventId]/bendie-planner | Link or unlink a Planner event. Staff-tier member sync (automatic). Push agenda to Planner (manual). Pull flights/hotels into attendee travel (manual). | `event_planner_links`, `event_members (planner_*)`, `agenda_sessions (planner_*)`, `attendee_travel_details (source_planner_key)` |  | Bendie Planner app, Bendie Events app |  | fully-implemented | Identity is bridged by email, but 353 of 409 Planner passengers have no email. |

## Event workspace: Planner

| Feature | Where | What it does | Data | Import | Consumed by | Depends on | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| **Planner team & access (permissions)** `planner-team-access` | members row action → PlannerTeamAccessPanel/PlannerPermissionsModal | Turn on, change or turn off a person’s Planner access with view/manage flags (Viewer / Manager / Custom). Every change is audited. | `event_members`, `planner_permission_audit_log`, `(Planner) event_user_assignments` | yes | Bendie Planner app | event-attendees, planner-provisioning | fully-implemented | Has no screen of its own. |
| **Planner overview** `planner-overview` | [eventId]/planner-overview | Planner event identity and live session status. | `(Planner) events`, `(Planner) session_status_realtime`, `(Planner) session_summary_realtime` |  | Bendie Planner app |  | fully-implemented |  |
| **Participants** `planner-people` | [eventId]/planner-people | People tracked for travel and logistics: add new, from Bendie attendees or from the organisation; link, search, CSV. Grants no access. | `(Planner) passengers`, `(Planner) event_passengers` | yes | Bendie Planner app |  | fully-implemented |  |
| **Tasks** `planner-tasks` | [eventId]/planner-tasks | Operational to-dos with assignees, status, priority and due date. Batch status changes. | `(Planner) operational_tasks`, `(Planner) operational_task_assignees` | yes | Bendie Planner app |  | fully-implemented | Task notes are not built (memory.md). |
| **Vendors** `planner-vendors` | [eventId]/planner-vendors | Supplier equipment items with packed / loaded / on-site stages. | `(Planner) event_vendor_items` | yes | Bendie Planner app |  | fully-implemented |  |
| **Checklist** `planner-checklist` | [eventId]/planner-checklist | Items to source and check on site, by category and day. | `(Planner) event_checklist_items` | yes | Bendie Planner app |  | fully-implemented |  |
| **Logistics: flights, hotels, ground transport** `planner-logistics` | [eventId]/planner-logistics | Flights, hotel bookings, movements, vehicles, and passenger-to-vehicle assignment and moves. | `(Planner) all_flights_combined_table`, `(Planner) hotel_bookings`, `(Planner) transport_movements`, `(Planner) vehicles`, `(Planner) passenger_vehicle_assignments` | yes | Bendie Planner app | planner-people | fully-implemented | 1,211-line page with a third navigation level (sub-tabs). |
| **Planner agenda (programme)** `planner-agenda` | [eventId]/planner-agenda | The programme the Planner team sees: days, tracks, rooms, speakers and MCs, parallel items. | `(Planner) event_agenda_items` | yes | Bendie Planner app |  | fully-implemented |  |
| **Production / run-of-show** `planner-production` | [eventId]/planner-production | Per-session production rows: times with shift, mode, mic, presentation, main screen, stage-hand notes, guest experience, slides. | `(Planner) production_tasks` | yes | Bendie Planner app |  | fully-implemented | Slides and blueprints authoring are not built (memory.md). |

## In the data or apps, not in the Portal

| Feature | Where | What it does | Data | Import | Consumed by | Depends on | Status | Notes |
|---|---|---|---|---|---|---|---|---|
| **Chats, messages, connections, session ratings, feedback, game points** `app-social` | — | Attendee runtime data. Out of scope by design (project-overview.md); moderation only. | `chats`, `messages`, `connections`, `session_ratings`, `feedback`, `game_points` |  | Bendie Events app |  | not-in-portal |  |
| **App release config (minimum app version)** `app-release-config` | — | Read by the mobile apps. No admin screen (memory.md: Events #5 unbuilt). | `app_release_config` |  | Bendie Events app |  | not-in-portal |  |
| **Automated engagement reminders** `engagement-notifications` | — | Queued by `enqueue_engagement_notifications`. No labels or controls in the Portal (Events #11 unbuilt). | `engagement_notification_log` |  | Bendie Events app |  | not-in-portal |  |
| **Planner blueprints (venue plans)** `planner-blueprints` | — | Versioned files per Planner event. No Portal UI. | `event_blueprints` |  | Bendie Planner app |  | not-in-portal |  |
| **Planner in-app notifications** `planner-notifications` | — | Planner-side notification feed and push (push-dispatch edge function). | `event_notifications`, `event_notification_reads`, `notification_preferences` |  | Bendie Planner app |  | not-in-portal |  |
| **Marketing meeting requests** `meeting-requests` | — | Public lead-capture form (submit-meeting-request edge function). Out of scope. | `meeting_requests` |  | Bendie Events app |  | not-in-portal |  |

## Who uses each feature

The `users` field in `features.json` gives the role. The full matrix is in [10-user-roles-and-permissions.md](10-user-roles-and-permissions.md).

## Cross-cutting capabilities

- **Import:** one shared dialog (`CsvImportModal`, with `csvImport.ts` and `spreadsheetImport.ts`) handles CSV, pasted rows and .xlsx, with column matching. It powers 18 features (17 importer screens).
- **Export:** none apart from import templates and the breakout people list. There is no attendee, speaker or travel export.
- **Audit:** database triggers write `event_content_audit_log`, `organization_audit_log` and `planner_permission_audit_log`.
- **Publishing:** none. Saves go live in the attendee app immediately. `events.status` is a label (doc 09).
- **AI:** none in the codebase.
- **Search:** header search covers events only.
