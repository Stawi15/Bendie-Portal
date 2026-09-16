# Data Model: Planner Event Workspace Foundation

No migration, on either Portal's or Bendie Planner's Supabase project, is introduced or required by
this feature (verified during planning — see plan.md's Constitution Check and research.md). This
document catalogs the existing entities the feature reads, the one existing pair of helper functions it
extends, and the shape of the new read-only projection it produces. Nothing here is new persisted
state.

## Existing Portal entities (read-only for this feature)

### `events` (Portal, `public.events`)

Already read by `EventContext`/`EventLayout` in full. This feature additionally reads, specifically for
provisioning-state precedence:

| Column | Type | Used for |
|---|---|---|
| `id` | `uuid` | Resolving the canonical `event_planner_links` row |
| `organization_id` | `uuid` | Confirmed via the existing `requireEventWorkspaceAccess` check (Q4/Q6) |
| `planner_provisioning_status` | `'not_required'\|'pending'\|'provisioning'\|'succeeded'\|'failed'` | Provisioning-state precedence (see below) |
| `planner_provisioning_last_attempted_at` | `timestamptz \| null` | Input to `isPlannerProvisioningStale()`, unchanged |
| `created_at` | `timestamptz` | Same, as the staleness fallback anchor |

### `event_members` (Portal)

Read only via the existing `requireEventWorkspaceAccess` helper (Q4/Q6) — no direct query added by this
feature.

### `organization_members` (Portal)

Read only transitively via `requireEventWorkspaceAccess`'s existing platform-admin check — unchanged.

### `organization_products` / `event_products` (Portal, Feature 002)

Read only via the existing `isProductActiveForOrg`/`isProductAvailableForEvent` helpers (Q5/Q6) — no
direct query added by this feature. `event_products` remains the sole truth for "does this event use
Planner," never `event_planner_links` existence and never `organization_products` alone (FR-008).

### `organization_planner_links` (Portal, Feature 002)

Not read by this feature at all. Organization-to-Planner-organization mapping is a creation/provisioning
concern (Feature 004); this feature only ever resolves an event-level counterpart (below).

### `event_planner_links` (Portal, Feature 001)

| Column | Type | Used for |
|---|---|---|
| `event_id` | `uuid` (PK, FK → `events.id`) | Lookup key |
| `planner_event_id` | `integer` | The canonical cross-project identifier this feature resolves and passes to the Planner read — **never** accepted from the client (FR-012) |
| `is_active` | `boolean` | Only an active (`true`) row counts as a usable counterpart |

Query: `SELECT planner_event_id, is_active FROM event_planner_links WHERE event_id = :eventId AND
is_active = true` (research.md Q7) — reused verbatim from Feature 001/004's existing pattern, no new
query shape.

## Existing Bendie Planner entities (read-only for this feature, separate Supabase project)

### `events` (Bendie Planner, `public.events`)

Not queried directly by this feature (research.md Q12/Q18) — its columns are read instead through
`event_summary_realtime`, which already reflects them.

### `event_summary_realtime` (Bendie Planner, materialized view)

Live-verified during `/speckit.clarify` and re-confirmed during planning. Definition (as inspected):

```sql
SELECT e.event_id, e.event_title, e.description, e.location, e.setup_date, e.start_date, e.end_date,
       e.attendees,
       COALESCE(count(p.production_id), 0) AS number_of_sessions,
       CASE
         WHEN CURRENT_DATE < e.start_date THEN 'Planning'
         WHEN CURRENT_DATE >= e.start_date AND CURRENT_DATE <= e.end_date THEN 'Active'
         WHEN CURRENT_DATE > e.end_date THEN 'Completed'
         ELSE 'Unknown'
       END AS status
FROM events e LEFT JOIN production_tasks p ON p.event_id = e.event_id
GROUP BY e.event_id, e.event_title, e.description, e.location, e.setup_date, e.start_date, e.end_date, e.attendees;
```

Refreshed on a ~1-minute `pg_cron` schedule (`REFRESH MATERIALIZED VIEW CONCURRENTLY`). One row exists
per Planner event, including events with zero `production_tasks` rows (`LEFT JOIN` + `COUNT` never
produces a missing row or a null count).

**Columns this feature selects** (explicit list — FR-015):

| Column | Type | Nullable | Maps to |
|---|---|---|---|
| `event_title` | `text` | No | Overview `event.title` |
| `description` | `text` | Yes | Overview `event.description` (omitted from the response when null) |
| `location` | `text` | Yes | Overview `event.location` (omitted when null) |
| `setup_date` | `date` | Yes | Overview `event.setupDate` (omitted when null) |
| `start_date` | `date` | Yes | Overview `event.startDate` (omitted when null) |
| `end_date` | `date` | Yes | Overview `event.endDate` (omitted when null) |
| `number_of_sessions` | `bigint` | No (COALESCE'd) | Overview `sessionSummary.totalSessions` |
| `status` | `text` | No | Overview `sessionSummary.eventPhase` |

**Columns present in the same row but never selected or returned**: `event_id` (the Planner integer id
— never echoed back to the client; the client only ever knows the Portal `uuid`), `attendees`
(explicitly excluded, FR-004).

**Explicitly not used**: `session_status_realtime`, `session_summary_realtime`, `overall_session_summary`
— disproven as reliable during `/speckit.clarify` (populated for only one live event; internally
inconsistent even there). Not read, not repaired, not depended upon by this feature in any way.

## Identity relationship

Unchanged from Feature 001: Portal and Bendie Planner are separate Supabase projects with separate
`auth.users` realms. This feature performs no identity resolution of its own — it does not touch
`profiles.planner_profile_id` or `event_user_assignments` at all (FR-009/FR-010). The only
cross-project reference this feature uses is the event-level one below.

## Canonical counterpart relationship

```
Portal events.id (uuid)
        │
        │  1:1 (at most one active row, enforced by event_planner_links'
        │  own PK + Feature 001's partial-unique-index invariant)
        ▼
event_planner_links.planner_event_id (integer)
        │
        │  resolved server-side only; never client-supplied (FR-012)
        ▼
Bendie Planner event_summary_realtime.event_id (integer)
```

**Portal's event id is a `uuid`. Bendie Planner's event id is an `integer`.** These are never the same
value and are never compared to each other directly — the only bridge between them is the
`planner_event_id` column already stored on `event_planner_links` by Feature 001/004's existing
provisioning/linking code. This feature adds no new bridging mechanism.

## Provisioning-state / link-state precedence (read-only; no repair)

Evaluated in this order, server-side, before any Planner read is attempted:

1. If `event_products` does not include an active `planner` row for this event → the caller never
   reaches this logic at all; Layer 2 authorization (FR-008) already denies the request.
2. Else, read `events.planner_provisioning_status` for this event.
   - `not_required` — an integrity anomaly for a Planner-active event (this status is Bendie-only's
     default and should be structurally unreachable here); treated identically to "no active link"
     below. Never repaired, never queried further.
   - `pending` or `provisioning`, not stale (`isPlannerProvisioningStale()` returns `false`) → response
     `status: 'pending'`. No Planner read is attempted (there is nothing reliable to read yet).
   - `pending` or `provisioning`, stale (`isPlannerProvisioningStale()` returns `true`) → response
     `status: 'stale'`. No Planner read attempted.
   - `failed` → response `status: 'failed'`. No Planner read attempted.
   - `succeeded` → proceed to step 3.
3. Read `event_planner_links` for an active row.
   - No active row found (including the `succeeded`-but-missing-link integrity anomaly the source
     prompt calls out) → response `status: 'unavailable'`. No Planner read attempted.
   - An active row is found → proceed to step 4.
4. Query `event_summary_realtime` for that `planner_event_id`.
   - Query throws or times out → response `status: 'backend_error'` (research.md Q11/Q16 — logged
     server-side with full detail, never returned to the client).
   - No matching row (dangling/externally-deleted Planner event) → response `status: 'unavailable'`.
   - A row is returned → response `status: 'ready'` with the shaped `event`/`sessionSummary` fields
     (Q13), regardless of whether `number_of_sessions` is zero (research.md Q15).

This precedence is the single authoritative implementation of `spec.md`'s FR-017 and the source
prompt's "Provisioning State Precedence" section. It introduces no new stored state — every branch above
is computed fresh from existing columns/tables on every request.

## Response projection (not persisted)

```
PlannerOverviewResponse =
  | { ok: true, status: 'ready', event: EventIdentity, sessionSummary: SessionSummary }
  | { ok: true, status: 'pending' | 'stale' | 'failed' | 'unavailable' | 'backend_error' }

EventIdentity = {
  title: string,
  description?: string,
  location?: string,
  startDate?: string,   // date, ISO 8601
  endDate?: string,     // date, ISO 8601
  setupDate?: string,   // date, ISO 8601
}

SessionSummary = {
  totalSessions: number,
  eventPhase: 'Planning' | 'Active' | 'Completed' | 'Unknown',
}
```

Optional identity fields are omitted from the response (not sent as `null`) when the underlying Planner
column is null, per spec.md's edge-case guidance to treat a missing optional field as "unavailable," not
a fabricated value.
