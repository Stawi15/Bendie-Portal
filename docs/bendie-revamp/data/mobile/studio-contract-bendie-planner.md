# Studio data contract: bendie-planner

Generated 2026-11-20 from commit `0eeaac4` (branch `production`). Read-only audit of the Bendie Planner mobile app (Expo / React Native). Every claim has a `file:line` reference. `INFERRED` means it is reasoned from code, not read directly. `NOT FOUND` means a repo-wide search found nothing.

Scope searched: `app/`, `domains/`, `context/`, `platform/`, `hooks/`, `lib/`, `components/`, `supabase/functions/`. The live database was not queried; RPC and view bodies are described only by how the app calls them.

---

## A. Stack and structure

| Item | Value | Evidence |
|---|---|---|
| Framework | Expo SDK 58 (`expo ~58.0.21`), React Native 0.88.1, React 19.3 | `package.json` |
| Navigation | Expo Router `~58.0.31` (file-based; every `app/` route re-exports a `domains/*/presentation` screen) | `package.json`, `app/_layout.tsx` |
| Supabase JS | `@supabase/supabase-js ^2.118.0` | `package.json` |
| State / cache | No React Query / Redux / SQLite / MMKV. Plain `useState` + custom hooks; one Zustand store (`flightMarksStore`) for unsaved flight marks; AsyncStorage for the offline write queue (`offline_rpc_queue_v1`); SecureStore for the session and the selected event | `platform/offline-outbox/offlineRequests.ts:45`, `platform/supabase/client.ts:97-220`, `context/EventScopeContext.tsx:267-274` |
| Client creation | One client, **public anon key** + signed-in user session (`autoRefreshToken`, `persistSession`, `detectSessionInUrl: false`). No service-role key in the app | `platform/supabase/client.ts:10-11,222-229` |
| Service role | Only in the `push-dispatch` edge function, read from `Deno.env` | `supabase/functions/push-dispatch/index.ts:22-27` |
| Data-access folders | `domains/<name>/infrastructure/*Repository.ts` (singletons), plus `context/EventScopeContext.tsx`, `platform/offline-outbox/offlineRequests.ts` (generic table/RPC writer), `platform/push/pushNotifications.ts`, `platform/supabase/createChannel.ts` (realtime) | — |

**Offline outbox.** `runRpcWithOfflineQueue`, `runUpsertWithOfflineQueue`, `runUpdateWithOfflineQueue` and `enqueueGroundPassengerUpdate` take a table or RPC name as a string. If offline, the write is stored and **replayed later** when connectivity returns; non-network failures on replay are dropped silently (`platform/offline-outbox/offlineRequests.ts:485-562, 564-667`).

---

## B. Table and view access

`(v)` = view. "Caller" is where the repository method is used.

### Events and dashboard

| Table | Op | Columns / select string | Filters | Feature / caller | Evidence |
|---|---|---|---|---|---|
| `events` | select | `event_id,organization_id,event_title,location,setup_date,start_date,end_date,description,attendees` | order `start_date` (nulls last), `event_id`; RLS-scoped (admins only) | Event list for platform/org admins | `context/EventScopeContext.tsx:347-351` |
| `events` | select | `*` | `.eq('event_id')` `.single()` | Project details, project edit | `domains/events/infrastructure/EventsRepository.ts:146-151`; callers `projectdetails.tsx:50`, `projectedit.tsx:164` |
| `events` | select | `event_id` | order `start_date`,`event_id`, limit 1 | Fallback event | `EventsRepository.ts:164-170`; `projectdetails.tsx:42` |
| `events` | insert | `event_title, description, location, attendees, organization_id, lead_coordinators, support_team, setup_date, setup_time, start_date, start_time, end_date, end_time, timezone, created_at, updated_at` → returns `event_id` | — | New project | `EventsRepository.ts:184-195`; `newproject.tsx:319` |
| `events` | update | same as insert minus `organization_id`/`created_at` (+ optional `updated_at`) → returns `*` | `.eq('event_id')` `.single()` | Project edit | `EventsRepository.ts:56-71,209-218`; `projectedit.tsx:370` |
| `events` | select | `event_id,event_title,location,setup_date,start_date,end_date,attendees,description` | optional `.eq('event_id')`, order `start_date`, limit 50 | Overview tab | `domains/dashboard/infrastructure/DashboardRepository.ts:44-52` |
| `events` | select | `event_id,start_date,end_date` | `.eq('event_id')` | Home summary fallback | `DashboardRepository.ts:123` |
| `events` | select | `organization_id` | `.eq('event_id')` `.maybeSingle()` | Checklist owner picker | `domains/checklist/infrastructure/ChecklistRepository.ts:39-45`; `checklist.tsx:452` |
| `event_summary_realtime` (v) | select | `event_id,event_title,status,start_date,end_date,location,attendees` | `.eq('event_id')` limit 1, or `.in('status',['Planning','Active'])` / `.eq('status','Planning')`, order `start_date` | Home upcoming card | `DashboardRepository.ts:91-113` |
| `event_summary_realtime` (v) | select | `event_id,event_title,description,location,setup_date,start_date,end_date,attendees,number_of_sessions,status` | optional `.in('event_id')`, order `start_date` | Projects list | `EventsRepository.ts:124-144`; `project.tsx:48` |
| `event_summary_realtime` (v) | select | same, `.in('status',['Planning','Active'])` | — | `getUpcomingProjects`, **no caller (unused)** | `EventsRepository.ts:109-122` |
| `production_events_v` (v) | select | `event_id,event_title,location,start_date,end_date,number_of_sessions,status` | optional `.ilike('event_title')`, `.eq('event_id')`, limit | Production tab header | `domains/production/infrastructure/ProductionRepository.ts:46-71` |

### Access and people

| Table | Op | Columns | Filters | Feature | Evidence |
|---|---|---|---|---|---|
| `user_event_assignments_v` (v) | select | `assignment_id,event_id,access_role,can_view_overview,can_view_production,can_view_logistics,can_view_tasks,can_view_notifications,can_manage_tasks,can_view_checklist,can_manage_checklist,can_view_vendors,can_manage_vendors,can_manage_production,can_manage_logistics,is_active,event_title,location,setup_date,start_date,end_date,description,attendees` | `.eq('profile_id', auth user)`, order `start_date`,`event_id`; client keeps `is_active` rows | Which events a user can open + module switches | `context/EventScopeContext.tsx:303-308,331-333` |
| `event_user_assignments` | select | `assignment_id,event_id,profile_id,access_role,can_view_overview,can_view_production,can_view_logistics,can_view_tasks,can_view_notifications,can_manage_tasks,can_view_checklist,can_manage_checklist,can_view_vendors,can_manage_vendors,can_manage_production,can_manage_logistics,access_ends_on,assignment_source,is_active` | `.eq('event_id')` | Event Access screen | `domains/team/infrastructure/TeamRepository.ts:56-69`; `admin-assignments.tsx:242` |
| `event_user_assignments` | **upsert** (outbox) | `event_id, profile_id, access_role, can_view_overview, can_view_production, can_view_logistics, can_view_tasks, can_view_notifications, can_manage_tasks, can_view_checklist, can_manage_checklist, can_view_vendors, can_manage_vendors, can_manage_production, can_manage_logistics, is_active, access_ends_on, assignment_source='manual'` | `onConflict: 'event_id,profile_id'` | Event Access save | `domains/team/presentation/admin-assignments.tsx:543-570` |
| `event_user_assignments` | select | `profile_id` | `.eq('event_id')`, `.eq('is_active', true)` | Checklist owner picker | `ChecklistRepository.ts:31-37`; `checklist.tsx:451` |
| `org_member_access` | select | `*` | `.eq('profile_id')` `.maybeSingle()` | "All organization events" | `TeamRepository.ts:83-93` |
| `org_member_access` | upsert | `profile_id, organization_id`, 12 switch columns (`can_view_*`/`can_manage_*`) | `onConflict: 'profile_id'` | same | `TeamRepository.ts:95-100,121-136`; `admin-assignments.tsx:522` |
| `org_member_access` | delete | — | `.eq('profile_id')` | same | `TeamRepository.ts:102-107`; `admin-assignments.tsx:531` |
| `profiles` | select | `id, first_name, full_name, email, role, gender, avatar_url, organization_id, is_org_admin, created_at, updated_at` | `.eq('id', self)` `.maybeSingle()` | Own profile (auth gate) | `domains/profile/infrastructure/ProfileRepository.ts:41-49`; `context/AuthContext.tsx:254` |
| `profiles` | upsert | `id, first_name, full_name, email, role, gender, avatar_url, updated_at` | `onConflict: 'id'` | Setup, profile edit | `ProfileRepository.ts:51-65`; `setup.tsx:245`, `profileedit.tsx:330` |
| `profiles` | upsert | `id, email, updated_at, full_name?` | `onConflict: 'id'` | After sign-up | `domains/identity/infrastructure/AuthRepository.ts:92-99`; `AuthContext.tsx:220` |
| `profiles` | select | `id,first_name,full_name,email,role,is_platform_admin,organization_id,is_org_admin,member_type` | order `full_name`,`first_name`; RLS-scoped | Event Access person picker | `TeamRepository.ts:42-54`; `admin-assignments.tsx:241` |
| `profiles` | select | `id, first_name, full_name, email` | `.in('id')`, or `.eq('organization_id')+.eq('is_org_admin',true)`, or `.or('id.in.(…),and(organization_id.eq.…,is_org_admin.eq.true)')` | Checklist owner picker | `ChecklistRepository.ts:47-67`; `checklist.tsx:466-470` |
| `task_assignee_options_v` (v) | select | `assigned_profile_id, assignee_name` | order `assignee_name` | Tasks person filter | `domains/tasks/infrastructure/TasksRepository.ts:88-93`; `TasksContent.tsx:415` |

### Agenda, production

| Table | Op | Columns | Filters | Feature | Evidence |
|---|---|---|---|---|---|
| `event_agenda_items` | select | `agenda_item_id, event_id, day_number, day_label, agenda_date, start_at, end_at, start_time, end_time, item_title, subtitle, description, speakers, mc, track_name, room_name, item_type, sort_order, is_parallel` | `.eq('event_id')`, order `day_number`, `agenda_date`, `sort_order`, `start_at` | Overview agenda (read-only) | `domains/agenda/infrastructure/AgendaRepository.ts:13-24` |
| `production_sessions_v` (v) | select | `production_id, event_id, session_date, day_number, task_type, track_name, room_name, is_parallel, start_at, end_at, start_time, end_time, session_title, participants, mode, mic_type, presentation, main_screen, notes, stage_hand_notes, guest_experience, display_status, sort_key, start_at_utc, end_at_utc` | `.in('event_id')`, order `session_date`, `sort_key`, `start_at` | Production run of show | `ProductionRepository.ts:7-33,99-113` |
| `production_tasks` | select | `production_id, slides_bucket_name, slides_file_path, slides_file_name` | `.in('event_id')`, `.not('slides_file_path','is',null)` | Slides | `ProductionRepository.ts:85-97` |
| `production_tasks` | update | `slides_bucket_name='SessionSlides', slides_file_path, slides_file_name` (attach) / all three `null` (detach) | `.eq('production_id')` | Slide upload/remove | `ProductionRepository.ts:141-148,159-163`; `production.tsx:1541,1577` |
| `production_tasks` | select head count | `production_id` (count exact) | `.eq('slides_file_path')` | Before deleting a slide file | `ProductionRepository.ts:176-179` |
| `production_tasks` | select | `event_id` | `.in('event_id')` | Overview session count | `DashboardRepository.ts:68-71` |
| `production_tasks` | select | `*` (uses `task_status` / `status`, `start_at`…) | `.eq('event_id')` | Home summary fallback (only if RPC fails) | `DashboardRepository.ts:124`; `useDashboardSummary.ts:95-117` |

### Tasks

No direct table access to `operational_tasks`, `operational_task_assignees` or `operational_task_notes`; all through RPCs (section C).

### Checklist, vendors

| Table | Op | Columns | Filters | Feature | Evidence |
|---|---|---|---|---|---|
| `event_checklist_items_v` (v) | select | `checklist_item_id, event_id, category, item_name, quantity_text, specification, sort_order, owner_profile_id, owner_name, is_sourced, sourced_at, sourced_by_profile_id, sourced_by_name, is_on_site, on_site_at, on_site_by_profile_id, on_site_by_name, notes, created_at, updated_at, day_number, event_day_date` | `.eq('event_id')`, order `category`, `sort_order`, `checklist_item_id` | Checklist | `ChecklistRepository.ts:3-24` |
| `event_checklist_items` | upsert (outbox) | `event_id, category, item_name, quantity_text, specification, owner_profile_id, day_number, event_day_date` (+ `checklist_item_id` on edit) | `onConflict: 'checklist_item_id'` | Add/edit item | `domains/checklist/presentation/checklist.tsx:554-572` |
| `event_checklist_items` | update (outbox) | `{is_sourced}` / `{is_on_site}` / `{notes}` | `.eq('checklist_item_id')` | Tick boxes, notes | `checklist.tsx:663-667,700-704,758-762` |
| `event_checklist_items` | delete | — | `.eq('checklist_item_id')` | Delete item | `ChecklistRepository.ts:69-71`; `checklist.tsx:605` |
| `event_vendor_items_v` (v) | select | `vendor_item_id, event_id, category, item_description, quantity_text, unit, sort_order, is_packed, packed_at, packed_by_profile_id, packed_by_name, is_loaded, loaded_at, loaded_by_profile_id, loaded_by_name, is_on_site, on_site_at, on_site_by_profile_id, on_site_by_name, notes, created_at, updated_at` | `.eq('event_id')`, order `category`, `sort_order`, `vendor_item_id` | Vendors | `domains/vendors/infrastructure/VendorsRepository.ts:3-31` |
| `event_vendor_items` | upsert (outbox) | `event_id, category, item_description, quantity_text, unit` (+ `vendor_item_id` on edit) | `onConflict: 'vendor_item_id'` | Add/edit item | `domains/vendors/presentation/vendors.tsx:344-360` |
| `event_vendor_items` | update (outbox) | `{is_packed}` / `{is_loaded}` / `{is_on_site}` / `{notes}` | `.eq('vendor_item_id')` | Stage toggles, notes | `vendors.tsx:479-483,550-554` |
| `event_vendor_items` | delete | — | `.eq('vendor_item_id')` | Delete item | `VendorsRepository.ts:33-42` |

The `*_at` / `*_by_profile_id` / `*_by_name` stage columns are **not** sent by the app (only set optimistically on screen, `vendors.tsx:443-476`, `checklist.tsx:657-662`); INFERRED: a database trigger fills them.

### Logistics

| Table | Op | Columns | Filters | Feature | Evidence |
|---|---|---|---|---|---|
| `flights_cards_v` (v) | select | `*`; app reads `record_id`/`id`, `flight_code`/`flight`, `flight_date`, `depart_time`, `arrive_time`, `depart_at`, `arrive_at`, `status_bucket`, `total_passengers` | optional `.eq('event_id')`, `.eq('status_bucket', 'Today'|'Upcoming'|'Completed')`, order `sort_rank`/`flight_date`,`depart_time` | Logistics tab (flights) | `domains/logistics/infrastructure/LogisticsRepository.ts:170-197`; `useLogisticsRoutes.ts:165-187` |
| `ground_routes_v` (v) | select | `*`; app reads `vehicle_id`/`id`, `vehicle_type`, `vehicle_no`, `boarded_passengers`, `max_capacity`, `assigned_count` (→ `current_pax` → `num_pax` → `total_passengers`), `zone`/`route_zone`, `route`, `date`, `pickup_time`, `end_time`, `pickup_at`, `end_at`, `notes` (shown as pickup), `note_type` (shown as drop-off), `status_bucket` | optional `.eq('event_id')`, `.eq('status_bucket')`, order `sort_rank`/`date`,`pickup_time` | Logistics tab (ground) | `LogisticsRepository.ts:199-226`; `useLogisticsRoutes.ts:148-229,253` |
| `flights_status_counts_v` / `ground_status_counts_v` (v) | select | `today_count,upcoming_count,completed_count` | optional `.eq('event_id')` `.maybeSingle()` | Tab counts | `LogisticsRepository.ts:151-167` |
| `passenger_vehicle_assignments` | select | `vehicle_id` | `.eq('boarded',true)`, `.eq('is_active',true)`, `.in('vehicle_id')` | Boarded counts | `LogisticsRepository.ts:235-240`; `useLogisticsRoutes.ts` |
| `vehicle_boardings` (legacy) | select | `vehicle_id` | `.eq('boarded',true)`, `.in('vehicle_id')` | **Fallback only** if the query above errors | `LogisticsRepository.ts:246-250` |
| `vehicles` | select | `vehicle_id, route, date, pickup_time, vehicle_no, max_capacity` | `.eq('vehicle_id')`, optional `.eq('event_id')` `.maybeSingle()` | Vehicle passengers screen | `LogisticsRepository.ts:260-277`; `ground-passengers.tsx:219` |
| `vehicles` | select | `*` (uses `date`, `status`) | `.eq('event_id')` | Home summary fallback | `DashboardRepository.ts:125`; `useDashboardSummary.ts:125-132` |
| `all_flights_combined_table` | select | `record_id, fullname, marked` | `.eq('flight')`, `.gte('date_time', day 00:00)`, `.lt('date_time', next day 00:00)`, optional `.eq('event_id')`, order `fullname` | Flight passengers / attendance | `LogisticsRepository.ts:24-52` |
| `all_flights_combined_table` | update | `{marked}` | `.eq('record_id')` | Fallback if `set_flight_passenger_marks` fails | `LogisticsRepository.ts:55-64`; `flight-passengers.tsx:266` |
| `hotel_bookings` | select | `booking_id,event_id,passenger_id,country,room_number,rooming_label,accommodation_required,check_in_date,check_out_date,nights_count,special_stay_pattern,notes,passengers(full_name,gender)` (embedded `passengers`) | `.eq('event_id')`, order `check_in_date`, `room_number`, `passenger_id` | Accommodation | `LogisticsRepository.ts:350-366`; `accommodation.tsx:278` |
| `flights_feed_v`, `flights_status_counts_v` (no filter), `ground_routes_feed_v`, `ground_routes_status_counts_v` (v) | select | see file | — | `useFlightLogistics` / `useGroundLogistics`: **exported but no screen imports them (dead)** | `LogisticsRepository.ts:67-148`; only importer `domains/logistics/index.ts` |

### Notifications, blueprints

| Table | Op | Columns | Filters | Feature | Evidence |
|---|---|---|---|---|---|
| `event_notifications` | update | `{is_read: true}` | `.eq('notification_id')` | Dismiss one | `domains/notifications/infrastructure/NotificationsRepository.ts:31-36` |
| `event_blueprints` | select | `blueprint_id, event_id, title, bucket_name, file_path, file_name, file_type, mime_type, is_active, version_no, created_at` | `.eq('event_id')`, `.eq('is_active',true)`, order `version_no` desc, `created_at` desc | Prints | `EventsRepository.ts:233-255`; `prints.tsx:192` |
| `event_blueprints` | insert | `event_id, title, bucket_name, file_path, file_name, file_type, mime_type, is_active, version_no` (version = max+1, client-side) | — | Upload print | `EventsRepository.ts:87-97,277-279`; `prints.tsx:321,365-375` |

Not accessed directly anywhere: `organizations`, `operational_tasks`, `passengers` (only embedded via `hotel_bookings`), `event_passengers`, `transport_movements`, `notification_preferences`, `device_push_tokens`.

---

## C. RPCs, storage, edge functions, realtime

### RPCs (app)

| RPC | Args | Feature | Evidence |
|---|---|---|---|
| `is_platform_admin` | — | Admin check | `context/EventScopeContext.tsx:302` |
| `get_home_dashboard_summary` | `p_event_id` | Home stats | `DashboardRepository.ts:117-119` |
| `get_production_status_counts` | `p_event_id` (nullable) `.single()` | Production counts | `ProductionRepository.ts:73-83` |
| `apply_session_time_change` | `p_production_id, p_minutes, p_mode:'relative'` (never queued offline) | Shift session times | `ProductionRepository.ts:199-209` |
| `advance_production_session` | `p_production_id` | End session early | `ProductionRepository.ts:211-219` |
| `get_operational_tasks_for_mobile_v2` | `p_status, p_priority, p_assignee_profile_id, p_event_id` | Task list, due-today count. Reads keys `id, title, category, assignee, dueDate, projectName, priority, status, assignee_count, completed_part_count, note_count, task_id` | `TasksRepository.ts:49-86`; `TasksContent.tsx:446` |
| `get_operational_task_summary` | `p_assignee_profile_id, p_event_id` | Task counts | `TasksRepository.ts:58-63` |
| `get_event_task_assignable_profiles` | `p_event_id` | New task assignee picker | `TasksRepository.ts:95-97`; `newtask.tsx:269` |
| `create_operational_task_v2` | `p_event_id, p_task, p_category, p_assigned_profile_id, p_assign_everyone, p_priority, p_due_date, p_remarks (always null), p_created_by_profile_id, p_assignee_profile_ids` | New task | `TasksRepository.ts:15-28,99-101`; `newtask.tsx:381-391` |
| `get_my_editable_task` | `p_task_code` | Task edit load | `TasksRepository.ts:103-105`; `taskedit.tsx:164` |
| `update_my_task` (6-arg) | `p_task_code, p_task, p_category, p_priority, p_due_date, p_remarks` | Task edit save | `TasksRepository.ts:30-37,107-109`; `taskedit.tsx:239-249` |
| `update_operational_task_status` (outbox) | `p_task_code, p_assigned_profile_id, p_new_status` | My Tasks status | `domains/tasks/presentation/mytasks.tsx:287-294` |
| `admin_complete_operational_task` | `p_task_code` | Admin mark complete | `TasksRepository.ts:111-113`; `TasksContent.tsx:529` |
| `get_task_details` | `p_task_code` | Task details | `TasksRepository.ts:117-119`; `taskdetails.tsx:179` |
| `get_task_notes` / `add_task_note` / `update_task_note` / `delete_task_note` | `p_task_code` / `p_task_code, p_body` / `p_note_id, p_body` / `p_note_id` | Task notes | `TasksRepository.ts:121-135` |
| `search_passengers` | `p_search, p_limit, p_offset, p_event_id?` | Team tab | `TeamRepository.ts:14-27`; `team.tsx:70` |
| `get_passenger_profile` | `p_passport, p_event_id?` | Team profile | `TeamRepository.ts:29-40`; `team-profile.tsx:257` |
| `set_member_type` | `target_profile_id, new_type` | Staff/contractor | `TeamRepository.ts:72-80`; `admin-assignments.tsx:366` |
| `set_org_admin_role` | `target_profile_id, make_admin` | Org admin toggle | `TeamRepository.ts:109-118`; `admin-assignments.tsx:441` |
| `set_flight_passenger_marks` (outbox) | `p_updates: [{record_id, marked}]` | Flight marks | `flight-passengers.tsx:211-220` |
| `get_ground_passenger_picker` | `p_event_id, p_vehicle_id` | Vehicle picker | `LogisticsRepository.ts:279-290` |
| `assign_or_board_passenger` | `p_event_id, p_vehicle_id, p_passenger_id, p_boarded` (returns `action`/`status`/`result`, may be `needs_move`) | Boarding | `LogisticsRepository.ts:306-319`; `offlineRequests.ts:438-452` |
| `unassign_passenger_from_vehicle` | `p_event_id, p_vehicle_id, p_passenger_id` | Boarding | `LogisticsRepository.ts:292-304`; `offlineRequests.ts:426-430` |
| `move_passenger_to_vehicle` | `p_event_id, p_new_vehicle_id, p_passenger_id, p_boarded` | Boarding | `LogisticsRepository.ts:321-334`; `offlineRequests.ts:454-459` |
| `get_ground_attendance` | `p_vehicle_id, p_event_id` | Vehicle attendance | `LogisticsRepository.ts:336-347` |
| `get_event_notifications` | `p_event_id, p_limit:100` | Notification feed (reads `notification_id, event_id, title, message, module, notification_type, source_id, metadata, is_read, created_at`) | `NotificationsRepository.ts:14-25`; `useEventNotifications.ts:8-50` |
| `mark_event_notifications_as_read` (outbox) | `p_event_id` | Mark all read | `useEventNotifications.ts:118,148` |
| `get_my_notification_preferences` | — | Preferences | `NotificationsRepository.ts:48-56` |
| `set_my_notification_preferences` (outbox) | `p_allow_task_notifications, p_allow_production_notifications, p_allow_checklist_notifications, p_allow_vendor_notifications, p_allow_logistics_notifications, p_mute_start_local, p_mute_end_local, p_timezone` | Preferences | `useNotificationPreferences.ts:103-112` |
| `set_my_timezone` | `p_timezone` (on start and app foreground) | Quiet hours | `NotificationsRepository.ts:40-46`; `app/_layout.tsx:500-510` |
| `register_device_push_token` | `p_token, p_platform, p_app_version` | Push | `platform/push/pushNotifications.ts:161-165` |
| `delete_user` | — | Account deletion | `AuthRepository.ts:115-117`; `AuthContext.tsx:845` |

**Edge function RPCs (service role):** `get_push_delivery_targets`, `deactivate_device_push_tokens` (`supabase/functions/push-dispatch/index.ts:129,208`).

### Storage

| Bucket | Ops | Path | Evidence |
|---|---|---|---|
| `avatars` (public) | upload, remove, `getPublicUrl`, list (on account deletion) | `<user_id>/<timestamp>.<ext>`; `profiles.avatar_url` holds the path **or** a full `http(s)` URL (used as-is) | `ProfileRepository.ts:67-117`; `AuthRepository.ts:103-113` |
| `EventBlueprint` (private) | `listBuckets` (debug), upload (`upsert:false`), `createSignedUrl` (3600 s), remove (rollback only) | `events/<event_id>/<timestamp>_<file name>`; images only (`mediaTypes: ['images']`). Bucket name taken from existing row's `bucket_name`, else `EventBlueprint` | `EventsRepository.ts:257-283`; `prints.tsx:46,286,304-320,389` |
| `SessionSlides` (private) | upload PDF (`upsert:false`), `createSignedUrl` (3600 s), remove when no other session references the file | `events/<event_id>/<production_id>-<timestamp>-<safe name>.pdf`; signed URL uses the row's `slides_bucket_name` | `ProductionRepository.ts:5,118-194` |

### Edge functions and other HTTP

- App calls **no** edge function (`functions.invoke`: NOT FOUND).
- `push-dispatch` is invoked by a database webhook on `event_notifications`; it requires header `x-webhook-secret`, sends to `https://exp.host/--/api/v2/push/send` with data `{eventId, notificationId, module, type, sourceId}` (`supabase/functions/push-dispatch/index.ts:150-170`).
- Direct HTTP from the app: `GET <SUPABASE_URL>/auth/v1/settings` reachability check (`platform/supabase/client.ts:259-265`). Analytics go to Amplitude, crashes to Sentry (not Supabase).

### Realtime (`postgres_changes`, schema `public`, event `*` for all)

| Table | Filter | Screen | Evidence |
|---|---|---|---|
| `event_notifications` | `event_id=eq.<id>` (shared channel) | Home badge, notifications | `useEventNotifications.ts:174-183` |
| `event_agenda_items` | `event_id=eq.<id>` | Overview agenda | `domains/agenda/application/useEventAgenda.ts:67-73` |
| `event_checklist_items` | `event_id=eq.<id>` | Checklist | `domains/checklist/application/useEventChecklist.ts:81-87` |
| `event_vendor_items` | `event_id=eq.<id>` | Vendors | `domains/vendors/application/useEventVendors.ts:74-80` |
| `operational_task_notes` | `task_id=eq.<id>` | Task details | `domains/tasks/application/useTaskNotes.ts:100-111` |
| `production_tasks` | `event_id=eq.<id>` or `event_id=in.(…)` or none | Dashboard, production counts/events/sessions, slides | `useDashboardSummary.ts:213`, `useProductionCounts.ts:61`, `useProductionEvents.ts:122`, `useEventSessions.ts:187`, `useSessionSlides.ts:86` |
| `events` | none | Home upcoming | `domains/dashboard/application/useUpcomingEvents.ts:158-163` |
| `all_flights_combined_table` | none | Logistics tab | `logisticspage.tsx:192-193` |
| `vehicles`, `passenger_vehicle_assignments`, `vehicle_boardings` | none | Logistics tab | `logisticspage.tsx:194-198` |
| `passenger_vehicle_assignments`, `vehicles` | `vehicle_id=eq.<id>` | Vehicle passengers | `ground-passengers.tsx:303-322` |
| `passenger_vehicle_assignments` | `vehicle_id=eq.<id>` | Vehicle attendance | `ground-attendance.tsx:147-153` |

No realtime on `operational_tasks`, `hotel_bookings`, `event_user_assignments`, `profiles`, `event_blueprints`.

---

## D. Behaviour the web redesign depends on

1. **Event status.** `events.status` is **NOT FOUND** in any query. The app only uses the derived `event_summary_realtime.status` / `production_events_v.status` values `Planning` / `Active` / `Completed` (`DashboardRepository.ts:18-26,106-110`; `EventsRepository.ts:33,113`). The selected event is shown whatever its status (`DashboardRepository.ts:100-104`). The lists that decide which events a user can open (`user_event_assignments_v`, `events`) do not filter by status, so a Studio `draft`/`archived` event that a user is assigned to **is visible in Planner** (INFERRED from `EventScopeContext.tsx:303-351`).
2. **Menu and modules.** `disabled_menu_items`, `facilitator_label_*`, `category_label`, `theme_label`, `theme_icon`, `portal_setup_modules`: all NOT FOUND. The 5 tabs are fixed in `domains/shared/components/CustomTabBar.tsx:21-35`; modules are hidden only by `event_user_assignments` switches (`EventScopeContext.tsx:604-612`).
3. **Products.** `event_products`, `organization_products`: NOT FOUND. Pausing a product has no effect on Planner.
4. **Theme and branding.** No `events` branding column is read (`theme_*`, `hero_*`, `profile_banner_image_url`, `image_url`, `gallery_background`: NOT FOUND). `events` columns that drive UI: `event_title, description, location, attendees, setup/start/end_date, setup/start/end_time, lead_coordinators, support_team, timezone, organization_id` (`EventsRepository.ts:3-21`, `EventScopeContext.tsx:349`). Colours come from the app's own constants.
5. **Agenda speakers, breakouts, time.**
   - Speakers: free text `event_agenda_items.speakers` and `.mc` only. `agenda_sessions`, `agenda_session_speakers`, `facilitator_id`, `breakout_rooms`, `agenda_breakout_*`: NOT FOUND (`AgendaRepository.ts:17`).
   - Breakouts: consecutive items (by `sort_order`) with identical `start_time` form a slot; a slot is a breakout when any item has `is_parallel = true` or the slot has more than one distinct `track_name` (`domains/agenda/application/agendaFormatting.ts:189-203`). Card label is `room_name`, else `track_name` (`agendaFormatting.ts:175`). Production groups by `room_name` (`production_sessions_v`).
   - Time: all event times are venue wall-clock in `events.timezone` (IANA, picker defaults to device zone then `Africa/Nairobi`, `newproject.tsx:111`, `projectedit.tsx:169`). Where the view supplies a zoned moment the app prefers it and shows it on the viewer's clock: `production_sessions_v.start_at_utc/end_at_utc` (`production.tsx:1173`), `flights_cards_v.depart_at/arrive_at`, `ground_routes_v.pickup_at/end_at` (`useLogisticsRoutes.ts:118,187,229`). Agenda uses `start_time` text for grouping. Helper: `domains/shared/time/eventTime.ts:1-10`.
6. **Access and auth.** No access-code flow (`verify_event_access_code`, `match_event_access_code`, `exchange-event-code-for-session`, `join_event_by_slug`: NOT FOUND). Email + password, email OTP / magic link, sign-up with `full_name`/`first_name` metadata (`AuthRepository.ts:42-90`). Auth gate phases: signed-out → needs-setup (profile incomplete) → needs-organization (`profiles.organization_id` null) → project selection → ready (`app/_layout.tsx:127-234`). Events a user can open = active rows of `user_event_assignments_v` for `profile_id = self`; platform admins (`is_platform_admin()` RPC) and org admins (`profiles.is_org_admin` + `organization_id`) additionally get every RLS-visible `events` row with all switches on (`EventScopeContext.tsx:296-386`).
7. **Profiles and contacts.** Read directly from `profiles`:
   - Own row: `id, first_name, full_name, email, role, gender, avatar_url, organization_id, is_org_admin, created_at, updated_at` (`ProfileRepository.ts:45`).
   - **Other people's rows**: `email`, `role`, `is_platform_admin`, `is_org_admin`, `organization_id`, `member_type`, `first_name`, `full_name` (Event Access, `TeamRepository.ts:45`); `id, first_name, full_name, email` (checklist owner picker, `ChecklistRepository.ts:50,57,65`).
   - `phone`, `global_role`: NOT FOUND. `get_profile_contact`, `get_event_member_contacts`, `can_view_profile_contact`: NOT FOUND.
   - Names also arrive via views/RPCs: `owner_name`, `*_by_name` (checklist/vendor views), `assignee_name`, `get_task_details`, `get_task_notes`, `get_event_task_assignable_profiles`.
   - The auth gate needs the **own** row's `first_name, full_name, email, role, gender` to be non-empty (`domains/profile/application/profileRules.ts:3-13`).
8. **Travel.** Flights: list from `flights_cards_v` (`flight_date`, `depart_time`, `arrive_time`, `depart_at`, `arrive_at`); passengers from `all_flights_combined_table` filtered on typed `date_time` (`LogisticsRepository.ts:24-52`). The **Team profile screen still reads `departuretime*` / `arrivaltime*` keys** from the `get_passenger_profile` result (falling back to `departure_time`, `depart_time`, `arrival_time`, `arrive_time`, …) (`domains/team/presentation/team-profile.tsx:27-31,135-189`). Which base column the RPC maps them from is NOT FOUND (RPC body not in repo). Hotels: `hotel_bookings` + embedded `passengers(full_name,gender)`; roommates are derived client-side from the same `room_number` within an event. Transport: `vehicles`, `passenger_vehicle_assignments`, RPCs; `transport_movements` not referenced client-side.
9. **Caching and freshness.** No cache layer and no TTL; every screen fetches on mount. Back-office changes show up:
   - **Realtime** for the tables listed in C (agenda, checklist, vendors, production, flights, vehicles, notifications, task notes, events).
   - **Polling**: production counts every 5 s (`useProductionCounts.ts:85-87`), notifications every 15 s (`useEventNotifications.ts:201-203`), production events + sessions every 60 s (`production.tsx:1086-1089`).
   - **On focus**: Home (profile + notifications, `home.tsx:572`), projects screens, logistics tab, vehicle screens, task details.
   - **Pull to refresh** on most lists.
   - **Not live**: the task list (mount + after own writes only; `TasksContent.tsx:553-566`), accommodation, the event list/permissions (`EventScopeContext` reloads on sign-in or explicit refetch, not on assignment changes).
   - The offline outbox can deliver an app write **hours later** (section E).
10. **App version gate.** `app_release_config`: NOT FOUND. Updates come from the stores and `expo-updates`; the app only reports `p_app_version` with its push token (`pushNotifications.ts:164`).
11. **Push and notifications.** Token via `register_device_push_token` (`pushNotifications.ts:161`). Feed: RPC `get_event_notifications` + direct `event_notifications` update/realtime. `notifications`, `event_push_notifications`: NOT FOUND. Deep links from push data `{eventId, module, type, sourceId, notificationId}` (`app/_layout.tsx:371-478`):
    - `tasks`: numeric `sourceId` → Production tab; otherwise `/taskdetails?taskCode=` (notes focus for `task_note_added`).
    - `production` / `session_time_shifted` → Production tab.
    - `checklist` → `/checklist`; `vendors` → `/vendors`.
    - `logistics`: numeric → `/ground-passengers?vehicleId=`; `"<flight>|<YYYY-MM-DD>"` → `/flight-passengers`; else Logistics tab (`trips` treated as logistics).
    - Anything else → `/notifications`. Also selects `eventId` first.
12. **Planner permissions and legacy tables.** Module access = the assignment row's switches only; `can_view_notifications` is also implied by tasks/production/logistics (`EventScopeContext.tsx:604-612`). `is_platform_admin` (RPC) and `profiles.is_org_admin` grant all switches on every visible event (`EventScopeContext.tsx:335-386`). `member_type` is read/written only on the Event Access screen (`TeamRepository.ts:45,72-80`). `org_member_access` read/written there too. `has_event_module` is only mentioned in a comment; the database enforces it. Legacy tables:
    - **Used**: `vehicle_boardings` (fallback read `LogisticsRepository.ts:246` + realtime `logisticspage.tsx:197`, `useGroundLogistics.ts:236`).
    - **NOT FOUND**: `capetown`, `johburg_one`, `johburg_two`, `slt_vip`, `shuttles`, `transport_logistics`, `users`, `vehicle_passengers`, `staging_production_csv`.
13. **Columns that look optional but matter.** See the `fragile_columns` list in the JSON; highlights:
    - `profiles.first_name/full_name/email/role/gender` empty → user is sent back to Setup.
    - `profiles.organization_id` null → user stuck on "awaiting organization" (`app/_layout.tsx:174`).
    - `event_user_assignments.is_active` false → event disappears; any `can_view_*` false → module hidden.
    - `status_bucket` must be exactly `Today` / `Upcoming` / `Completed`, or the row is in no tab (`LogisticsRepository.ts:6-10`).
    - `event_summary_realtime.status` must be `Planning` / `Active` for Home / upcoming lists.
    - `production_tasks.slides_bucket_name` + `slides_file_path` both needed for "View presentation".
    - `event_agenda_items.start_time` equality defines breakout slots; `room_name` spelling defines production rooms.
    - `hotel_bookings.passenger_id` FK to `passengers` is required by the embedded select.
    - `get_operational_tasks_for_mobile_v2` output keys (`id`, `title`, `dueDate`, `projectName`, `assignee`, …) are aliases the app depends on.

---

## E. Writes that could collide with the web back office

| Table / RPC | Fields the app writes | Collision notes | Evidence |
|---|---|---|---|
| `events` | insert and full update of `event_title, description, location, attendees, lead_coordinators, support_team, setup/start/end_date, setup/start/end_time, timezone` (+`organization_id` on insert) | Edit sends **all** these fields, so a Planner save overwrites any Studio change to them made since the screen loaded. Planner-created events carry **no** Studio columns (status, slug, theme…): those get defaults/null. A new NOT NULL column without default on `events` would break Planner event creation. | `EventsRepository.ts:184-229` |
| `event_user_assignments` | upsert of the **whole row** (all 14 switches, `access_role`, `is_active`, `access_ends_on`, `assignment_source='manual'`) on `(event_id, profile_id)`; can be **queued offline** | Last write wins on every switch. A Planner save converts an `org_default` row to `manual`. A queued save replays later and can undo a Studio change. | `admin-assignments.tsx:543-570` |
| `org_member_access` | upsert all switches / delete by `profile_id` | Same last-write-wins. | `TeamRepository.ts:95-107` |
| `profiles` | upsert of own `first_name, full_name, email, role, gender, avatar_url, updated_at`; sign-up upsert of `id, email, full_name` | If Studio edits these for a user, the next Planner profile save overwrites them. | `ProfileRepository.ts:51-65`; `AuthRepository.ts:92-99` |
| `set_member_type`, `set_org_admin_role` | member type, org admin flag | Same people Studio may manage. | `TeamRepository.ts:72-118` |
| `event_checklist_items` | create/edit (`category, item_name, quantity_text, specification, owner_profile_id, day_number, event_day_date`), `is_sourced`, `is_on_site`, `notes`, delete; all except delete can be **queued offline** | Field-level updates, but notes are whole-text replace (last write wins). | `checklist.tsx:554-762` |
| `event_vendor_items` | create/edit (`category, item_description, quantity_text, unit`), `is_packed`, `is_loaded`, `is_on_site`, `notes`, delete; **queued offline** | Same. The app un-ticks later stages on screen when an earlier one is un-ticked but only sends the one flag (INFERRED: trigger cascades). | `vendors.tsx:344-554` |
| Tasks (RPCs) | create, edit (`task, category, priority, due_date, remarks`), per-assignee status (**queued offline**), admin complete, notes | `update_my_task` sends `remarks` as loaded, so a Studio remarks edit during a Planner edit is overwritten. | `taskedit.tsx:239-249`; `mytasks.tsx:287` |
| `production_tasks` | `slides_*` columns; times via `apply_session_time_change` / `advance_production_session` (not queued) | Studio edits of session times collide with live "+/- min" shifts. | `ProductionRepository.ts:118-219` |
| `all_flights_combined_table.marked` | via `set_flight_passenger_marks` (**queued offline**) or direct update | Batch replay may land long after. | `flight-passengers.tsx:211-266` |
| Vehicle boarding | `assign_or_board_passenger`, `unassign_…`, `move_…` (**queued offline** as `ground-passenger-update`) | Replay can re-board / un-board after Studio changes. | `ground-passengers.tsx:506-576`; `offlineRequests.ts:422-464` |
| `event_blueprints` + `EventBlueprint` | insert with `version_no = max(existing)+1` computed client-side | Concurrent Studio upload could produce duplicate version numbers. | `prints.tsx:321` |
| `event_notifications.is_read`, notification preferences, timezone, push token | user's own | Low risk. | `NotificationsRepository.ts:31-46` |

---

## Risks for the web redesign

1. **Locking `profiles` columns breaks sign-in.** The app reads its own `email, role, gender, first_name, full_name` directly; if a column becomes unreadable the select errors and, if empty, the user is sent to Setup. Other people's `email` (and `role`, `is_platform_admin`, `is_org_admin`, `member_type`) are read directly on Event Access and the checklist owner picker; a column revoke makes those whole queries fail. Ship replacement RPCs and a Planner release before any `profiles` lock-down.
2. **`select('*')` on `events`, `org_member_access`, `flights_cards_v`, `ground_routes_v`, `production_tasks`, `vehicles`** fails if any column of those becomes unreadable to `authenticated`.
3. **Planner ignores every Studio-only event field** (status, menu, products, terminology, theme). Draft or archived events stay visible to assigned users; pausing a product does nothing.
4. **Planner creates and fully overwrites `events` rows** with its own field set. Studio must accept events with null Studio columns and avoid adding NOT NULL columns without defaults.
5. **Offline outbox replays writes later** (assignments, checklist, vendors, task status, flight marks, boarding). Studio cannot assume its last edit is final.
6. **Assignment upserts send the whole row**, so a Planner save resets every switch to what that screen showed and turns `org_default` into `manual`.
7. **Time semantics**: all stored times are venue-local in `events.timezone`; changing that convention, or the `*_at` / `*_utc` view columns, shifts every time shown.
8. **Agenda and production layout depends on exact values**: identical `start_time` for breakouts, `is_parallel`, consistent `track_name` / `room_name` spelling.
9. **View contracts**: renaming or removing columns in `user_event_assignments_v`, `event_summary_realtime`, `production_sessions_v`, `event_checklist_items_v`, `event_vendor_items_v`, `flights_cards_v`, `ground_routes_v`, or the `status_bucket` / `status` values, breaks screens. Older installed builds keep the old expectations, so changes must be additive.
10. **RPC signatures and output keys** (section C) are part of the contract, including `get_operational_tasks_for_mobile_v2`'s aliased keys and `get_passenger_profile`'s `departuretime*` / `arrivaltime*` keys.
11. **Notification payloads**: deep links depend on `module` and `source_id` formats (task code, numeric `production_id` / `vehicle_id`, `"<flight>|<YYYY-MM-DD>"`).
12. **Legacy `vehicle_boardings`** is still read as a fallback and subscribed to; dropping it is safe only while `passenger_vehicle_assignments` keeps working (INFERRED).

## Secrets found (values not copied)

| Kind | Location |
|---|---|
| Supabase URL + anon key, Amplitude API key, Sentry auth token | `.env` (untracked) |
| Placeholder names only | `.env.example` |
| Firebase Android API key | `google-services.json` (tracked) |
| Sentry DSN | `app/_layout.tsx:49` |
| Service-role key, webhook secret, Expo access token (read from env, no values in repo) | `supabase/functions/push-dispatch/index.ts:22-27` |
| None | `eas.json`, `app.json`, `.github/workflows/domain-boundaries.yml` |
