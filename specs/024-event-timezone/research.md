# Research: Event Time Zone (Feature 024)

Checked against branch `024-event-timezone`, stacked on `023-smart-spreadsheet-import` at `7a71fd2`. Live-database facts come from the two backend briefs in `docs/` and are **unverified this session**: the Supabase connectors weren't authenticated. See R9.

## R1. Where the time zone is written on create
- **Decision**: `POST /api/events/create` writes `events.timezone` as the caller, in the same post-RPC update that already writes `portal_setup_modules`, **before** Planner provisioning runs.
- **Rationale**: this follows an existing pattern (Feature 016), and the brief says `timezone` is granted `update` to `authenticated`. There's no RPC or migration change. Provisioning reads the event afterwards, so it sees the zone.
- **Alternative rejected**: a new RPC parameter on `create_event_with_products`, which would need a migration and touches a locked-down `SECURITY DEFINER` function.

## R2. Venue-time conversion (FR-006, FR-007)
- **Decision**: add a new pure module `src/lib/eventTimeZone.ts` (works in the browser and Node, `Intl` only):
  - `listTimeZones()`: `Intl.supportedValuesOf('timeZone')` plus `UTC`, falling back to a built-in list;
  - `detectTimeZone()`;
  - `isListedTimeZone()`;
  - `utcOffsetLabel(tz)`, e.g. `UTC+03:00`;
  - `zonedLocalToUtcIso(local, tz)`;
  - `utcIsoToZonedLocal(iso, tz)`, for `datetime-local` values;
  - `zonedDateOf(iso, tz)`, returning `YYYY-MM-DD`.
- **Conversion method**: compute the zone's offset for the target instant with `Intl.DateTimeFormat(...).formatToParts`, iterating twice so it's correct across daylight-saving changes.
- **Rationale**: the project has no date library, and adding one for this is unnecessary.
- **Create form**: it keeps `type="date"`. The route converts `YYYY-MM-DD` to the start of that day in the zone, so the authoritative conversion happens on the server.

## R3. Picker UI
- **Decision**: reuse the existing `input` + `list=` + `<datalist>` pattern (`info-center/page.tsx`). Options are `Area/City`, with the UTC offset as the option label. On blur and save, the value must be a listed name (FR-003).
- **Rationale**: it's native, searchable, and needs no new component.

## R4. Planner provisioning (FR-009, FR-010)
- **Decision**: `provisionPlannerEvent` reads `timezone` along with the other event columns.
  - When the zone is set, `start_date` and `end_date` are the local dates in that zone (`zonedDateOf`), replacing `iso.slice(0, 10)`. That bug would shift dates once venue time is stored. Without a zone, `slice` behaviour is kept.
  - The Planner insert includes `timezone`. If the insert fails and a timezone was sent, it retries once without it, so Planner uses its default `Africa/Nairobi`. The fallback is logged with `console.warn`.
- **Spec note**: FR-010 "surfaced like other provisioning notes": provisioning has no notes channel, so a log line is the available surface. The spec is narrowed accordingly.

## R5. Planner agenda day numbers (FR-012)
- **Decision**: `readPortalEventStartDate(eventId, fallbackTz)` also selects `timezone` and uses it when set. The page keeps sending the browser zone as the fallback. No client change.

## R6. Basics page (FR-004–FR-008, FR-011)
- **Decision**:
  - Load `timezone` through `EVENTS_SELECT_COLUMNS` (adding it there and to `types/database.ts`).
  - Show the picker beside the dates, with the "reminders are off" notice when it's empty.
  - Convert the displayed and saved `datetime-local` values with the event's zone (or the browser's when there's none).
  - Changing the zone re-renders the same stored instants in the new zone (FR-008). The form keeps the original ISO values until the user edits a date.
  - For Planner events, show a hint that the zone isn't synced.
- **Detecting Planner**: reuse whatever the event layout already uses to know an event's products (see T-list).

## R7. Feedback link copy (FR-013)
- **Decision**: change the hint text on `terminology/page.tsx` only.

## R8. Errors (FR-014)
- **Decision**: a Postgres check violation mentioning `events_timezone_valid` (code `23514`) maps to "That time zone isn't recognised. Choose another from the list."
  - **On basics**: shown as a toast; the form keeps its values.
  - **On create**: the event is still created; the route returns `timeZoneSaved: false`, and the modal warns the user to set it on the basics page.

## R9. Live verification gate (constitution III)
Adding `timezone` to `EVENTS_SELECT_COLUMNS` makes **every** client `events` read fail if `authenticated` lacks the column grant. That's the 2026-09-16 outage pattern. So before merging, run this on Bendie project `droaamagpsojkzznywgd`:

```sql
select column_name, is_nullable, data_type from information_schema.columns
 where table_schema='public' and table_name='events' and column_name='timezone';
select privilege_type from information_schema.column_privileges
 where table_schema='public' and table_name='events' and column_name='timezone' and grantee='authenticated';
select pg_get_constraintdef(oid) from pg_constraint where conname='events_timezone_valid';
```

**Expected**: one `text` column, nullable; privileges `SELECT`, `INSERT`, `UPDATE`; and a check that the value is a known zone name.

Then on Planner (`zghoaawgrmvqdlksuiam`):

```sql
select column_default, is_nullable from information_schema.columns where table_schema='public' and table_name='events' and column_name='timezone';
```
