# Prompt: extract a mobile app's data contract (for Bendie Studio 2.0)

**How to use:** open a coding agent (Claude Code or similar) **inside the mobile app's repository**: the Bendie Events app, then separately the Bendie Planner app. Paste everything between the two `=====` lines. Set `APP_NAME` to `bendie-events` or `bendie-planner`. Bring back the two files it creates and put them in `docs/bendie-revamp/data/mobile/` in the Bendie-Portal repo.

=====

You are auditing this mobile app's codebase to document **exactly how it reads and writes its Supabase backend**. Another team is redesigning the web back office (Bendie Studio) that writes the same database, and must not break this app. APP_NAME = `<bendie-events | bendie-planner>`.

## Rules

1. **Read-only.** Do not modify, format, install, build, commit or push anything. Do not run the app against any real backend.
2. **No secrets in your output.** If you see keys, tokens, passwords, connection strings or JWTs (in code, `.env*`, `app.json`/`app.config.*`, `eas.json`, CI files), record only *that* one exists and *where* (file path), never the value. Write `[REDACTED]`.
3. **No personal data.** Don't copy real names, emails or phone numbers from fixtures or seed files.
4. **Evidence for everything:** every claim gets a `file:line` reference. If you're inferring rather than reading it directly, label it `INFERRED`. If you can't find something, say `NOT FOUND`, and don't guess.
5. Be exhaustive about data access. Be brief about everything else.

## What to find

### A. Stack and structure
Framework and versions (Expo/React Native, Supabase JS version), navigation library, state/caching libraries (React Query, Zustand, Redux, MMKV, AsyncStorage, SQLite…), how the Supabase client is created (anon key vs anything else), and the folders that hold data access.

### B. Every Supabase table access
For **each** `.from('<table>')` (and any wrapper around it):
- table name
- operation (select / insert / update / upsert / delete)
- **columns selected** (the literal select string, including embedded relations such as `agenda_session_speakers(...)`)
- filters (`.eq`, `.in`, `.or`, `.is`, ordering, `.single()`/`.maybeSingle()`)
- columns written
- the screen or feature it serves
- file:line

### C. RPCs, storage, edge functions, realtime
- every `.rpc('<name>', args)`, with args shape and file:line
- every storage bucket used (`avatars`, `post-images`, `chat-media`, `event-files`, `EventBlueprint`, `SessionSlides`, …), with operations and path format
- every edge function called, and any direct HTTP call to Supabase or other backends
- every realtime channel or subscription: table, event, filter

### D. Behaviour the web redesign depends on (answer each explicitly, with evidence)
1. **Event status:** does the app filter or behave differently by `events.status` (`draft`, `published`, `active`, `completed`, `archived`)? Where and how?
2. **Menu and modules:** how are `events.disabled_menu_items` and the terminology fields (`facilitator_label_singular/plural`, `category_label`, `theme_label`, `theme_icon`) used? Is `events.portal_setup_modules` read at all?
3. **Products:** does the app read `event_products` or `organization_products`, or react to a product being paused?
4. **Theme and branding:** which `events` columns drive the UI (`theme_primary/secondary/tertiary`, `hero_*`, `profile_banner_image_url`, `image_url`, `gallery_background`…)?
5. **Agenda speakers:** does a session's speaker come from `agenda_sessions.facilitator_id`, from `agenda_session_speakers`, or both? How are breakouts read (`agenda_sessions.breakout_rooms` JSON vs `agenda_breakout_*` tables)? How are times shown (which time zone; is `events.timezone` used)?
6. **Access and auth:** the access-code flow (`verify_event_access_code`, `match_event_access_code`, `exchange-event-code-for-session`, `join_event_by_slug`…), and what decides which events a user can open.
7. **Profiles and contacts:** which `profiles` columns are read directly (especially `email`, `phone`, `global_role`, `role`), and which go through RPCs (`get_profile_contact`, `get_event_member_contacts`, `can_view_profile_contact`…)? This matters for the planned column lock-down.
8. **Travel:** how `attendee_travel_details` (Events) or flights/hotels/transport tables (Planner) are read; whether text time columns (`departuretime`, `arrivaltime`) or typed ones (`depart_time`, `arrive_time`, `date_time`) are used.
9. **Caching and freshness:** after the back office changes data, when does the app show it? (On focus, pull-to-refresh, realtime, cache TTL, offline store?)
10. **App version gate:** is `app_release_config` read? How?
11. **Push and notifications:** token registration, which tables are read (`notifications`, `event_notifications`, `event_push_notifications`), and deep-link targets.
12. **Planner app only:** how module permissions are decided (`event_user_assignments` flags, `org_member_access`, `has_event_module`, `is_platform_admin`, `is_org_admin`, `member_type`); whether any of these tables are used: `capetown`, `johburg_one`, `johburg_two`, `slt_vip`, `shuttles`, `transport_logistics`, `users`, `vehicle_passengers`, `staging_production_csv`.
13. **Columns the app depends on that look optional:** any column where a null or missing value would crash or hide something.

### E. Writes that could collide with the web back office
Anything the app writes that the web back office also edits (e.g. `event_members.onboarding_status`, `networking_preferences`, `profiles`, `session_attendees`, Planner task status, checklist/vendor stage flags, vehicle boarding), with field-level detail.

## Output: create exactly two files at the repository root

1. `studio-contract-<APP_NAME>.md`: a human-readable report with sections A–E, each claim with file:line, plus a short "Risks for the web redesign" list (what would break this app if changed).
2. `studio-contract-<APP_NAME>.json`, in this shape:
```json
{
  "app": "<APP_NAME>",
  "generated": "YYYY-MM-DD",
  "git_commit": "<current HEAD short sha>",
  "stack": {"framework": "", "supabase_js": "", "cache": []},
  "tables": [
    {"name": "", "op": "select|insert|update|upsert|delete", "columns": [], "embedded": [], "filters": [], "feature": "", "evidence": ["path:line"]}
  ],
  "rpcs": [{"name": "", "args": [], "feature": "", "evidence": []}],
  "storage": [{"bucket": "", "ops": [], "path_pattern": "", "evidence": []}],
  "edge_functions": [{"name": "", "evidence": []}],
  "realtime": [{"table": "", "events": [], "filter": "", "evidence": []}],
  "behaviours": {"event_status": "", "disabled_menu_items": "", "products": "", "agenda_speakers": "", "breakouts": "", "timezone": "", "profiles_columns_read": [], "caching": "", "app_release_config": "", "planner_permissions": "", "legacy_tables_used": []},
  "fragile_columns": [{"table": "", "column": "", "why": "", "evidence": []}],
  "secrets_found": [{"kind": "", "location": "path"}],
  "not_found": []
}
```
Validate that the JSON parses before finishing. Then print a 10-line summary of the most important findings.

=====

## What happens with the results

`docs/bendie-revamp` uses them to:
1. Answer doc 40 Q2 and replace the [U] (unknown) marks in doc 09.
2. Add a "mobile reads" column to `data/entities.json`, so any redesign change touching those columns is flagged.
3. Build contract tests in the test environment (doc 37) that fail if Studio stops writing a column the apps read.
4. Decide whether content drafts (doc 40 Q5) and the `profiles` lock-down (Feature 027 C1) are safe.
