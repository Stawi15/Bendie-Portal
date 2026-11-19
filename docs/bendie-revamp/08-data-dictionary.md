# 08 — Data Dictionary

**Status:** VERIFIED (live schemas, 2026-11-19).

The dictionary has three layers. This file doesn't copy them:

| Layer | File | Covers |
|---|---|---|
| Machine-readable | [data/entities.json](data/entities.json) | Every table in both databases: scope, category, approximate rows, foreign keys, policy count, Studio screen; all enums; key RPCs; edge functions; buckets |
| Bendie field level | [context/schema-reference.md](../../context/schema-reference.md) | Every Bendie column, RLS policy and behaviour, with a dated changelog |
| Planner field level | below | The 19 Planner tables Studio reads or writes |

## Business terms → tables

People ask the Copilot in business words, and these are the words organisers use, so this is the table the future Qwen context engine needs most (doc 26).

| Organiser says | Table(s) | DB | Notes |
|---|---|---|---|
| Event | `events` | Bendie; mirrored in Planner `events` | One Studio event, up to two products |
| Attendee / guest / delegate | `event_members` (role `attendee`) + `profiles` | Bendie | Gets an access code |
| Participant / passenger / traveller | `passengers` + `event_passengers` | Planner | **Not** an attendee. Joined to attendees by email only. |
| Speaker / presenter / facilitator / coach | `facilitators` | Bendie | The label is configurable (`events.facilitator_label_*`) |
| Session / talk / agenda item | `agenda_sessions` | Bendie | The Planner programme is `event_agenda_items` |
| Run of show / production / cue sheet | `production_tasks` | Planner | Per-session AV, mic, screen and stage notes |
| Breakout / room | `agenda_breakout_rooms` (+ items, assignments) | Bendie | |
| Flight / arrival / departure | `all_flights_combined_table`; attendee-facing copy in `attendee_travel_details` | Planner → Bendie | |
| Hotel / rooming | `hotel_bookings` | Planner | |
| Transfer / shuttle / vehicle | `transport_movements`, `vehicles`, `passenger_vehicle_assignments` | Planner | |
| Task / to-do | `operational_tasks` | Planner | |
| Vendor / supplier / kit | `event_vendor_items` | Planner | |
| Checklist / sourcing | `event_checklist_items` | Planner | |
| Sponsor / exhibitor | `expo_spaces` (`is_sponsor`, `is_exhibitor`) | Bendie | |
| Networking questions / interests | `event_interest_options` | Bendie | Answers are in `networking_preferences` |
| Push / announcement | `event_push_notifications`; articles in `news_items` | Bendie | |
| Team (organisation) | `teams` | Bendie | Not Planner "team access" |
| Planner team / staff access | Planner `event_user_assignments` | Planner | |

## Planner field reference (tables Studio uses)

`!` = NOT NULL.

| Table | Columns |
|---|---|
| `events` | event_id!, event_title!, event_code!, organization_id!, location, setup_date, start_date, end_date, setup_time, start_time, end_time, timezone!, attendees, description, lead_coordinators, support_team |
| `event_user_assignments` | assignment_id!, event_id!, profile_id!, access_role!, can_view_{overview,production,logistics,tasks,notifications,checklist,vendors}!, can_manage_{tasks,checklist,vendors}!, can_manage_{production,logistics}, is_active!, access_ends_on, assignment_source! |
| `passengers` | passenger_id!, full_name!, title, passport, dietary_requirements, gender, email, phone |
| `event_passengers` | event_passenger_id!, event_id!, passenger_id! |
| `all_flights_combined_table` | record_id!, event_id!, passenger_id, fullname, title, passport, dietary_requirements, region, flight, flight_type, departuretime, arrivaltime (text), depart_time, arrive_time (time), date_time, stops, notes, marked, source_table |
| `hotel_bookings` | booking_id!, event_id!, passenger_id!, hotel_name, country, room_number, rooming_label, accommodation_required!, check_in_date, check_out_date, nights_count, special_stay_pattern, notes |
| `transport_movements` | movement_id!, event_id!, movement_name!, route!, movement_date!, pickup_time, notes |
| `vehicles` | vehicle_id!, event_id!, movement_id!, date!, route!, vehicle_type!, vehicle_no!, max_capacity!, pickup_time, end_time, current_pax, num_pax, names, status, notes, note_type |
| `passenger_vehicle_assignments` | assignment_id!, event_id!, movement_id!, vehicle_id!, passenger_id, passenger_record_id, is_active!, boarded!, assigned_at!, boarded_at, ended_at, moved_from_vehicle_id, notes |
| `operational_tasks` | task_id!, event_id, task!, category, responsible_party, due_date, status, priority, remarks, pending, active, completed, assigned_profile_id, task_code, source_ref, metadata!, created_by_profile_id |
| `event_vendor_items` | vendor_item_id!, event_id!, category!, item_description!, quantity_text, unit, sort_order!, is_packed!/packed_at/by, is_loaded!/loaded_at/by, is_on_site!/on_site_at/by, notes |
| `event_checklist_items` | checklist_item_id!, event_id!, category!, item_name!, quantity_text, specification, sort_order!, owner_profile_id, is_sourced!/at/by, is_on_site!/at/by, day_number, event_day_date, notes |
| `event_agenda_items` | agenda_item_id!, event_id!, item_title!, sort_order!, is_parallel!, day_number, day_label, agenda_date, start_at, end_at, start_time, end_time, subtitle, description, speakers (text), mc, track_name, room_name, item_type, source_document, notes, source_portal_session_id |
| `production_tasks` | production_id!, event_id, session_title, session_date, day_number, start_at/end_at, base_start_at/base_end_at, start_time/end_time, base_start_time!/base_end_time!, shift_minutes!, participants, mode, mic_type, presentation, main_screen, notes, stage_hand_notes, guest_experience, status, task_type, track_name, room_name, sort_order, is_parallel!, parent_production_id, location_override, slides_* |
| `event_blueprints` | blueprint_id!, event_id!, title!, bucket_name!, file_path!, file_name!, version_no!, is_active!, mime_type, file_size_bytes, notes |
| `org_member_access` | profile_id!, organization_id!, the same view/manage flags as assignments |
| `profiles` | id!, full_name, first_name, email, role (job title), gender, organization_id, is_platform_admin!, is_org_admin!, member_type! |

## Supported operations per entity

These are the operations Studio exposes today, which are the only ones an AI tool may call (doc 27). The verbs are inferred from the HTTP methods in `data/routes.json` and from browser-side `.insert`/`.update`/`.delete` calls.

- **Planner:** list, create, update, delete for tasks, vendors, checklist, participants, flights, hotels, movements, vehicles, production and the programme. Also assign and move for ground transport, link and search for participants, delete-all for vendors and checklist.
- **Bendie content:** create, read, update, delete and reorder on every content table, plus bulk import on the 17 importers.
- **Special:** `save_breakout_rooms`, `choose_breakout_room`, `issue_event_access_code` (resend), push agenda, pull travel, sync a member to Planner, change Planner permissions, moderation actions.
