# EventApp structure brief — pages and the tables they query

## Context

This isn't an implementation plan — the org-admin portal idea was set aside. Instead, this is a reference map of every page in the app, which domain owns it, and exactly which database tables/views/RPCs its repository layer queries, compiled by grepping every domain's `infrastructure/*.ts` repository file directly (not from memory). Use this to know what to seed when populating data.

The app is Expo Router (file-based routing) + a domain-driven `domains/<name>/{presentation,infrastructure,...}` structure. Every route under `app/` is a one-line re-export of a screen in some domain's `presentation/` folder; the real data access lives in that domain's `infrastructure/<Name>Repository.ts`.

## Domain → pages → tables/views/RPCs

**identity** — auth & onboarding, no event scope

- Pages: `signin`, `signup`, `forgot-password`, `reset-password`, `verify-otp`, `setup`, `onboarding`, `awaiting-organization`, `SettingsScreen`
- Data: Supabase Auth (`auth.users`, not queried directly) for sign-in/up/OTP/reset; `profiles` (upsert on setup, delete on account deletion); RPC `delete_user`

**profile** — the signed-in user's own profile

- Pages: `profile`, `profileedit`
- Data: `profiles` (select/upsert); Storage bucket `avatars`

**events** — event/project CRUD + blueprints

- Pages: `project`, `projectedit`, `newproject`, `project-switch`, `projectcard`, `projectdetails`, `prints`
- Data: `events`, `event_summary_realtime` (view), `event_blueprints`; Storage bucket `EventBlueprint`
- Note: `organizations` table exists (`organization_id, name, slug, is_active`) but is not queried by any screen — RLS currently restricts it to platform admins only, so nothing in the app reads/writes it today.

**dashboard** — home tab + overview/agenda tab

- Pages: `index` (home), `overview` (overview, with agenda embedded as a component)
- Data: `events`, `production_tasks`, `event_summary_realtime` (view), `vehicles`; RPC `get_home_dashboard_summary`

**agenda** — no route of its own; its component is embedded inside dashboard's `overview` page

- Data: `event_agenda_items`

**production**

- Page: `production` (tab)
- Data: `production_events_v` (view), `production_sessions_v` (view), `production_tasks`; RPCs `get_production_status_counts`, `advance_production_session`

**tasks**

- Pages: `tasks` (tab), `mytasks`, `newtask`, `taskedit`, `taskpage`
- Data: `operational_tasks` (the core tasks table), `production_tasks` (only for a due-today count, unrelated to the Production domain's use), `task_assignee_options_v` (view); RPCs `get_operational_tasks_for_mobile`, `get_operational_task_summary`, `get_task_assignable_profiles`, `create_operational_task`, `get_my_editable_task`, `update_my_task`, `admin_complete_operational_task`

**checklist**

- Page: `checklist`
- Data: `event_checklist_items_v` (view, read), `event_checklist_items` (write/delete), `event_user_assignments`, `events`, `profiles` (for listing org admins)

**logistics**

- Pages: `logistics` (tab), `logisticspage`, `flight-passengers`, `flight-attendance`, `ground-passengers`, `ground-attendance`, `accommodation`
- Data: `all_flights_combined_table`, `flights_feed_v`, `flights_status_counts_v`, `flights_cards_v` (views), `ground_routes_feed_v`, `ground_routes_status_counts_v`, `ground_routes_v` (views), `passenger_vehicle_assignments`, `vehicle_boardings`, `vehicles`, `hotel_bookings`; RPCs `get_ground_passenger_picker`, `unassign_passenger_from_vehicle`, `assign_or_board_passenger`, `move_passenger_to_vehicle`, `get_ground_attendance`

**vendors**

- Page: `vendors`
- Data: `event_vendor_items_v` (view), `event_vendor_items`

**notifications**

- Page: `notifications`
- Data: `event_notifications`; RPCs `get_event_notifications`, `get_my_notification_preferences`
- Push token registration (not a page — background/platform code): RPC `register_device_push_token`

**team** — passenger/staff directory + admin assignment management

- Pages: `team`, `team-profile`, `admin-assignments`
- Data: `profiles`, `event_user_assignments`; RPCs `search_passengers`, `get_passenger_profile`, `set_org_admin_role`

**support** — static content only

- Pages: `FAQ`, `about`, `privacy-policy`, `terms-and-conditions`
- Data: none — hardcoded content, no table queries

**shared** — not a page; cross-cutting UI (tab bar, layout hooks) used by other domains, no data of its own

**platform/** — cross-cutting infrastructure, not a domain

- Offline outbox: replays queued RPC calls (`unassign_passenger_from_vehicle`, `assign_or_board_passenger`, `move_passenger_to_vehicle`) once connectivity returns
- Push: RPC `register_device_push_token`

## Storage buckets (Supabase Storage, separate from Postgres tables)

- `avatars` — public bucket, profile pictures
- `EventBlueprint` — private bucket, event blueprint/map files (linked via `event_blueprints` table)
- `SessionSlides` — private bucket, referenced by the Production domain's presentation viewer

## Tables that exist but aren't used by any current screen

- `organizations` — exists, minimal columns, locked to platform-admin-only RLS, unused in the UI today
- Several legacy tables (`users`, `event_passengers`, and others noted in `scripts/migrations/20260902_enable_rls_operational_tasks_and_legacy_tables.sql`) are confirmed dead — zero screens reference them
