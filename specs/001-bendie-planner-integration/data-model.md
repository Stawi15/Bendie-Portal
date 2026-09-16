# Phase 1 Data Model: Bendie Planner Integration

All Portal-side changes land in one new migration in `supabase/migrations/`, created as
`bendie_planner_integration.sql` and applied via the `apply_migration` MCP tool (no numeric
prefix — live-verified in `research.md` item 4 that every migration since `2026-08-12` uses a
plain descriptive name with an auto-assigned timestamp version, not the older `NNN_` convention
the local repo's 12 oldest files still show). Planner's own
schema is not modified by this feature; Planner-side shapes below are recorded as read/write
targets only, sampled via live introspection earlier this session and to be re-verified before
implementation per `research.md`.

## Entity: Planner Link (new Portal table `event_planner_links`)

Represents the one-to-one, opt-in association between a Portal event and a Planner event. Gates
every other synchronization action (spec FR-007).

| Column | Type | Notes |
|---|---|---|
| `event_id` | `uuid`, PK, FK → `events.id` `ON DELETE CASCADE` | One row per Portal event that has ever been linked. |
| `planner_event_id` | `integer`, `NOT NULL` | No plain `UNIQUE` constraint on this column alone — see the corrected uniqueness design immediately below. |
| `planner_event_title` | `text`, nullable | Cached display label captured at link time, so the control tab can show the Planner event's identity without a live cross-project read on every page load (spec FR-005). |
| `is_active` | `boolean`, `NOT NULL`, default `true` | Unlink is a soft-deactivate (`is_active = false`), not a row delete — preserves history and satisfies the "unlinking doesn't delete anything already synced" assumption in spec.md. |
| `linked_by` | `uuid`, FK → `profiles.id` `ON DELETE SET NULL` | Attribution. |
| `created_at`, `updated_at` | `timestamptz`, `NOT NULL`, default `now()` | Standard. |

**Uniqueness design (corrected — `/speckit.analyze` finding)**: spec FR-004 says a Planner event
must not be **actively** linked to more than one Portal event at a time — the word "actively" is
load-bearing. A plain `UNIQUE(planner_event_id)` constraint would enforce a *stricter* rule than
the spec asks for: since `event_id` is the primary key, unlinking Portal Event A (`is_active =
false`, row kept for audit) leaves A's row still holding `planner_event_id = 101`. A later attempt
by Portal Event B to link to that same now-unlinked Planner event 101 would need to insert a
*second* row also carrying `planner_event_id = 101` — which a plain `UNIQUE` constraint rejects
outright, even though 101 is no longer actively linked to anything. That would silently make an
unlinked Planner event permanently unreusable by any other Portal event, contradicting FR-004's own
"actively" qualifier and spec.md's explicit assumption that unlinking only "stops further
synchronization," not that it burns the Planner event for future use. Corrected constraint:

```sql
CREATE UNIQUE INDEX event_planner_links_active_planner_event_uidx
  ON public.event_planner_links (planner_event_id)
  WHERE is_active = true;
```

This partial unique index enforces "at most one **active** row per `planner_event_id`" exactly as
FR-004 states, while permitting any number of historical inactive rows (from any Portal events,
including the same one relinking and unlinking repeatedly) to share the same `planner_event_id`
value over time.

**Validation rules**: This partial uniqueness is a hard DB constraint, not just an
application-level check (spec FR-004, SC-006) — the link route (see `contracts/planner-integration.md`)
must catch the resulting constraint-violation error and translate it into the FR-004 rejection
response, not just rely on its own pre-check (defense in depth, same principle applied everywhere
else in this plan). Re-linking a Portal event that already has a row here is an `UPDATE` of the
existing row (replacing `planner_event_id`/`planner_event_title`, setting `is_active = true`), not
a second `INSERT` — `event_id` is the primary key, so this never conflicts with the event's own
prior history, only with a *different* Portal event's currently-active row.

**State transitions**: `(no row)` → *link action* → `is_active = true` → *unlink action* →
`is_active = false` → *link action again* → `is_active = true` (same or different
`planner_event_id`). There is no `(no row)` state once a Portal event has been linked at least
once — unlink always leaves a row behind (`is_active = false`), matching the "keep for audit"
behavior already established in the baseline and consistent with this app's general preference for
soft state over deletion (e.g. `event_members`, audit logs).

**RLS**: Admin-only `FOR ALL` policy using `portal_is_global_admin()`, matching the simple pattern
from migrations `006`-`009`/`012`/`013` — **not** the dual restrictive-policy pattern from `010`,
because no non-admin reader of this table exists anywhere in the system (confirmed: the entire
`/portal` app is gated to global admins by middleware already, per `architecture.md`).

## Entity: Planner Participant Reference (columns added to existing `event_members`, plus one column on `profiles`)

Represents that a staff-tier Portal event member has been made available in the linked Planner
event, and the outcome of that attempt (spec FR-008, FR-013).

`event_members` gains:

| Column | Type | Notes |
|---|---|---|
| `planner_assignment_id` | `bigint`, nullable | The Planner-side `event_user_assignments.assignment_id` once synced. `NULL` = never synced (event unlinked, role ineligible, or not yet attempted). |
| `planner_synced_at` | `timestamptz`, nullable | Last successful sync time. |
| `planner_sync_status` | `text`, nullable, `CHECK (planner_sync_status IS NULL OR planner_sync_status IN ('succeeded','failed','skipped'))` | The observable status spec FR-013 requires administrators be able to see. `NULL` = no attempt made (e.g. event not linked, or role is `attendee`). **The CHECK constraint was documented here from the start but not actually applied in the original migration — found during code review after T033 and closed via a corrective migration, `supabase/migrations/add_planner_sync_status_check.sql` (live-verified: all existing rows were `NULL`, safe to add; a negative test in a rolled-back transaction confirmed an invalid value is now rejected).** |
| `planner_sync_error` | `text`, nullable | Human-readable reason, populated only when `planner_sync_status = 'failed'`. |

`profiles` gains:

| Column | Type | Notes |
|---|---|---|
| `planner_profile_id` | `uuid`, nullable | Cached mapping to the matched-or-created Planner `profiles.id`, keyed by email match (spec FR-010). Set once per person, reused across every event they're synced for — avoids re-resolving identity on every sync attempt. |

**Validation rules**: `planner_sync_status`/`planner_sync_error`/`planner_assignment_id`/
`planner_synced_at` are only ever written for `event_members` rows whose `role` is one of
`host`/`organizer`/`admin`/`facilitator`/`staff`/`speaker` — an `attendee` row's sync columns stay
permanently `NULL` (spec FR-009; see `research.md`'s role-mapping decision for why exclusion
happens at the call site, not inside the sync route).

**RLS**: No new policy needed — these are additional nullable columns on an existing table whose
RLS already covers reads/writes appropriately for the admin-only portal.

## Entity: Synchronized Agenda Item (columns added to existing `agenda_sessions`)

Represents a piece of Portal agenda content that has been pushed to the linked Planner event,
tracked so a repeat push updates rather than duplicates it (spec FR-016).

| Column | Type | Notes |
|---|---|---|
| `planner_agenda_item_id` | `bigint`, nullable | The Planner-side `event_agenda_items.agenda_item_id` once pushed. Presence of a value is what makes a repeat push an `UPDATE` instead of an `INSERT` on the Planner side. |
| `planner_synced_at` | `timestamptz`, nullable | Last successful push time. |

**Validation rules**: No delete-sync (spec FR-017) — removing a `planner_agenda_item_id` value
from a Portal row (e.g. because the session itself was deleted) never triggers a corresponding
delete on the Planner side; a stale Planner-side row is accepted as a known, documented limitation
(see `plan.md`'s baseline reconciliation, item 10).

**RLS**: No new policy needed — same reasoning as above.

## Entity: Imported Travel Record (columns added to existing `attendee_travel_details`, plus a new enforcement rule)

Represents a flight or hotel/accommodation entry pulled from Planner, distinguished from a
manually created Portal row, read-only in Portal, and re-pull-safe (spec FR-023–026).

| Column | Type | Notes |
|---|---|---|
| `source_planner_key` | `text`, nullable | A stable string built at pull time (e.g. `flight:<planner passenger id>:<planner record id>`, `hotel:<planner passenger id>:<planner booking id>`). `NULL` for every manually created Portal row — this is precisely the "distinct ownership" marker spec.md's Travel Ownership decision requires. |
| `synced_from_planner_at` | `timestamptz`, nullable | Last successful pull time for this record. |

```sql
ALTER TABLE public.attendee_travel_details
  ADD CONSTRAINT attendee_travel_details_event_planner_key_key
  UNIQUE (event_id, source_planner_key);
```

**Corrected live during T033 verification** — this was originally a *partial* unique index
(`WHERE source_planner_key IS NOT NULL`), matching the reasoning that manual rows
(`source_planner_key IS NULL`) shouldn't be constrained. That reasoning was right, but the partial
index broke the actual upsert: PostgREST's `.upsert(rows, { onConflict: 'event_id,source_planner_key' })`
generates a plain `ON CONFLICT (event_id, source_planner_key)`, which Postgres cannot match against
a *partial* index unless the same `WHERE` predicate is repeated in the `ON CONFLICT` clause itself
— something the standard upsert call has no way to express. Every real pull failed with `"there is
no unique or exclusion constraint matching the ON CONFLICT specification"` until this was found and
fixed. The plain constraint above achieves the identical practical effect with none of the problem:
Postgres never treats two `NULL`s as conflicting in a unique index, so manual rows were never
actually at risk of colliding under either design — the partial predicate was unnecessary, not
just incompatible with upsert. (Note: `event_planner_links`'s partial index for the active-link-only
uniqueness, added during `/speckit.analyze`, does **not** have this problem — nothing upserts
against it via an explicit `onConflict` target; its conflict is only ever caught reactively via the
`23505` error code, so a partial predicate there is fine.)

**Read-only enforcement (new — corrects a gap the baseline left unaddressed):**

Two restrictive policies, not one — an earlier draft of this design only restricted `UPDATE`, which
left `INSERT` unrestricted: a client with a valid session could otherwise forge a new row with a
non-null `source_planner_key` directly (i.e. impersonate a Planner-sourced record without ever
going through a real pull). Both policies are needed to close that gap; neither extends to `SELECT`
or `DELETE`, which must remain governed only by the existing permissive policies — Planner-sourced
rows must stay fully **readable** (spec FR-023 requires they be visibly distinguishable, not
hidden) and deliberately remain **deletable** by an admin (spec says nothing forbids removing a
stale Planner-sourced row; a later pull simply recreates it), so a `FOR ALL` restrictive policy
would be wrong here — it would also silently suppress `SELECT`, breaking FR-023.

**`/speckit.analyze` verdict on DELETE (confirmed, not assumed)**: spec.md's "read-only" language
was checked specifically for whether it also covers deletion. Every normative instance — FR-024
("MUST NOT be **editable**"), FR-025 (contrasts with manual rows staying "fully **editable**"),
the edge case ("any attempt to **edit** it directly... is prevented"), and User Story 4's
acceptance scenario 4 ("any attempt to **edit** it directly... is prevented") — consistently and
exclusively uses edit-specific language across four separate places in the approved spec, never
"delete," "remove," or "immutable." That repetition is read as a deliberate scope choice, not a
gap: "read-only" in the Key Entities section is descriptive prose summarizing FR-023/024, not an
independent normative requirement (Key Entities descriptions elsewhere in `spec.md` are similarly
descriptive, not phrased as MUST statements). This design's choice to leave `DELETE` governed only
by `attendee_travel_details`'s existing permissive policies was therefore already correct as
originally drafted — confirmed here, not changed.

```sql
CREATE POLICY "attendee_travel_details_planner_sourced_immutable_update"
  ON public.attendee_travel_details
  AS RESTRICTIVE
  FOR UPDATE
  USING (source_planner_key IS NULL)
  WITH CHECK (source_planner_key IS NULL);

CREATE POLICY "attendee_travel_details_planner_sourced_immutable_insert"
  ON public.attendee_travel_details
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (source_planner_key IS NULL);
```

Both `USING` and `WITH CHECK` are given explicitly on the `UPDATE` policy — Postgres would default
`WITH CHECK` to the same expression as `USING` if omitted, but this repository's own precedent
(migration `010`'s restrictive policies) always states both explicitly, so this design matches that
convention rather than relying on the implicit default. `INSERT` policies support only `WITH CHECK`
(there is no pre-existing row for `USING` to filter).

A `RESTRICTIVE` policy is ANDed against every existing `PERMISSIVE` policy on the same command —
so even though `attendee_travel_details` already permits the row's own attendee, or the event's
host/organizer/admin, to `UPDATE`/`INSERT`, these two additional restrictive policies make that
operation fail whenever the row's `source_planner_key` is not null (for `UPDATE`, checked against
both the existing row and the proposed new row; for `INSERT`, checked against the proposed new
row), regardless of who the caller is. This is the same `RESTRICTIVE`-policy mechanism already used
elsewhere in this schema (migration `010`), not a new pattern — and `attendee_travel_details` has
no pre-existing restrictive policy of its own to interact with (it was not one of the tables
migration `010` touched), so these two new policies are the only restrictive policies on this table.

**Hard implementation constraint, not just a design note**: the travel-pull route MUST perform its
Portal-side writes (both the first `INSERT` and every subsequent re-pull `UPDATE`) using the
**Portal's own service-role client** — which bypasses RLS entirely, exactly like every other
`app/api/admin/*` route — never the caller's authenticated cookie-based client. If the write step
used the authenticated client instead, these same restrictive policies would block the pull route's
own writes, since a Planner-sourced row's `source_planner_key` is never null. This isn't a
theoretical edge case: getting this one detail wrong at implementation time would make the entire
travel-pull feature silently fail every insert/update it attempts. Flagged again in `plan.md`'s
Remaining Technical Risks for visibility.

**Validation rules**: Ground-transfer data is never written by this feature (spec FR-027) — no
`type = 'ground_transfer'` row will ever carry a `source_planner_key` under this feature's scope,
though the column design does not prevent a future feature from adding that support later.

## Non-Entity: No organization-linking model

Per the corrected classification in `research.md` (item 20), no `organization_id`,
`planner_organization_id`, or any other organization-scoping column or table is introduced
anywhere in this migration — not even as an unused placeholder — per spec decision #4's explicit
"do NOT introduce."

## Planner-Side Read/Write Targets (external — schema now includes two approved, minimal additions)

These tables live in Bendie Planner's own Supabase project, applied via the `supabase-planner` MCP's
`apply_migration` tool (Planner's own tracked migration history, confirmed live via `list_migrations`
— not something this Portal repo invented). Planner's schema is otherwise not modified by this
feature; the two additions below were explicitly approved as a post-review hardening follow-up
(2026-09-14) to close Finding 2 and Finding 4, and are recorded here for traceability since this
repository owns no Planner migration files of its own.

- `events` (`event_id integer`, `event_title`, `location`, `start_date`, `end_date`,
  `organization_id bigint`) — read-only target for the event-discovery picker.
- `profiles` (`id uuid`, `email`, `full_name`, `organization_id bigint`) — read/write target for
  identity resolution and creation.
- `event_user_assignments` (`assignment_id bigint`, `event_id bigint`, `profile_id uuid`,
  `access_role text`, `can_view_*`/`can_manage_* boolean` flags) — write target for member sync.
  **Correction (2026-09-14): this table already carries a live `UNIQUE (event_id, profile_id)`
  constraint** (`event_user_assignments_event_profile_unique`), confirmed via live introspection
  (`pg_constraint`) immediately before this change. This contradicts `plan.md`'s earlier
  "no unique constraint on Planner's side (live-verified)" note from the original T033 pass — that
  earlier finding is now known to be stale (the constraint was either added independently on
  Planner's side afterward, or the original check was mistaken; live state is authoritative either
  way). **No Planner-side schema change was needed or applied for this table** — a live
  duplicate-check (`GROUP BY event_id, profile_id HAVING count(*) > 1`) confirmed zero existing
  duplicates, and `planner-sync-member/route.ts` now performs a single
  `.upsert(row, { onConflict: 'event_id,profile_id' })` against this existing constraint instead of
  a manual check-then-insert-or-update, making the operation atomic under concurrency (see
  Finding 2 resolution below).
- `event_agenda_items` (`agenda_item_id bigint`, `event_id integer`, `day_number`, `day_label`,
  `agenda_date`, `start_at`/`end_at`, `item_title`, `speakers text` (plain text, not relational),
  `item_type`) — write target for agenda push. **New column (2026-09-14, approved):
  `source_portal_session_id uuid NULL`** — the durable cross-system identity linking a Planner
  agenda item back to the originating Portal `agenda_sessions.id`. Guarded by a plain
  `UNIQUE (event_id, source_portal_session_id)` constraint
  (`event_agenda_items_event_source_portal_session_key`) — **plain, not partial**, deliberately
  matching the lesson already recorded above for `attendee_travel_details`: a partial index cannot
  be targeted by PostgREST's `.upsert(..., { onConflict })` without repeating its `WHERE` predicate,
  and Postgres never treats two `NULL`s as conflicting under a plain constraint, so existing
  Planner-native rows (`source_portal_session_id IS NULL`) are unaffected either way. Live-verified
  before applying: zero existing rows had `source_document = 'bendie-portal'` (all earlier test data
  from the T033/review passes had already been cleaned up), so no backfill was needed — every
  existing row's new column is simply `NULL`, correctly meaning "not Portal-originated."
  `planner-push-agenda/route.ts` now upserts on `(event_id, source_portal_session_id)` for every
  push, replacing the old "trust `agenda_sessions.planner_agenda_item_id`" branch — this is what
  makes a retry after a lost INSERT response rediscover and update the already-created Planner row
  instead of inserting a duplicate (see Finding 4 resolution below).
- `passengers`, `all_flights_combined_table`, `hotel_bookings` — read-only targets for travel pull,
  all keyed to Planner's own `passenger_id`, with no link to `profiles` on Planner's side (matching
  is done entirely on the Portal side by email).

### Finding 2 resolution — assignment concurrency (2026-09-14)

Previously an accepted residual risk (see `plan.md`'s Remaining Technical Risks history). Resolved
by discovering the constraint already exists live and switching the write path to a single
database-backed upsert against it. Two concurrent sync requests for the same `(event_id,
profile_id)` now serialize through Postgres's own conflict resolution — the second request's
`ON CONFLICT DO UPDATE` waits for and then merges onto the first's row, never producing a second
row. Live-verified via a genuine concurrency test (see final report).

### Finding 4 resolution — agenda lost-response idempotency (2026-09-14)

Previously an accepted residual risk. Resolved by adding `source_portal_session_id` and switching
the push route to always upsert on `(event_id, source_portal_session_id)` rather than branching on
whether Portal's own `planner_agenda_item_id` is already populated. This means the source-of-truth
for "does this Planner row already exist" is now a Planner-side, durable, cross-system key — not a
value that can itself be lost in transit. A simulated lost-response state (a Planner row already
present with the correct source key, but Portal's `planner_agenda_item_id` artificially cleared) was
live-tested to confirm the next push recovers the existing row rather than duplicating it (see final
report).
