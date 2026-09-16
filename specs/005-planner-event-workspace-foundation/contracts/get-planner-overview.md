# Contract: `GET /api/events/[eventId]/planner-overview`

Read-only. Never accepts a body. Never accepts or trusts a client-supplied Planner event id (FR-012) —
`eventId` in the path is always the Portal `uuid`.

## Request

```
GET /api/events/{eventId}/planner-overview
Cookie: <existing Portal session cookies>
```

No query parameters, no request body.

## Authorization sequence (every step re-verified server-side, every request — FR-013)

1. **Authenticate.** No session → `401 { error: 'not_authenticated' }`.
2. **Resolve the caller's currently selected organization**, mirroring `OrganizationContext`'s own
   resolution exactly (review finding F1): `profiles.current_organization_id` is used only when it is
   still one of the caller's current `organization_members` rows; otherwise the route falls back to the
   caller's first accessible membership, the same as `accessible.find(o => o.id === saved) ?? accessible[0]`
   client-side. This means a `null` or **stale** (no longer a valid membership) saved selection is not
   itself denied — case A below. Only a caller with **zero** organization memberships at all reaches
   case B and is denied. The fallback is derived strictly from the caller's own memberships, never from
   which organization happens to own the requested event.
   - **Case A — fallback resolves successfully:** at least one accessible membership exists, so
     `selectedOrganizationId` is set (either the still-valid saved selection, or the membership-derived
     fallback) and the sequence continues to step 3. This is not an error condition. The fallback's
     "first accessible membership" is **provably deterministic, not incidental**: both this route's
     `organization_members` query and `getAccessibleOrganizations()`'s (`src/lib/portalAuth.ts`)
     structurally different embedded-join query carry the identical explicit
     `.order('organization_id', { ascending: true })` — a pure tie-break with no product meaning (not
     join date, not name, not entitlement) — so index `[0]` is guaranteed to be the same organization on
     both the client and this route, rather than merely happening to agree under today's query plans
     (re-review finding, closed).
   - **Case B — no resolvable organization:** the caller has no organization memberships at all →
     `403 { error: 'forbidden' }`.
3. **Portal workspace admission** — `requireEventWorkspaceAccess(eventId, userId, selectedOrganizationId)`
   (research.md Q4/Q6, called with this route's own server-scoped client). Denied, or the event does
   not exist → `404 { error: 'event_not_found' }` (matching `retry-planner-provisioning/route.ts`'s
   existing convention of not distinguishing "doesn't exist" from "you can't see it" at this layer).
4. **Planner product availability** — `isProductAvailableForEvent(eventId, selectedOrganizationId,
   'planner')` (research.md Q5/Q6). Not available → `403 { error: 'product_unavailable' }`.
5. A caller who reaches this point needs **no** Bendie Planner `event_user_assignments` row of any kind
   (FR-009) — none is checked, none is created (FR-010).

Steps 3 and 4 are independent and both required — passing one never implies the other (mirrors
`EventLayout`'s own two-part `workspaceAuthDenied`/`activeSectionUnavailable` split).

## Provisioning/link-state resolution (no HTTP error — see data-model.md's precedence table)

Once authorized, the route always returns `200 { ok: true, ... }` — every subsequent state is a
successful, expected outcome of a valid request, not a rejected one (research.md Q11).

| `status` | Meaning | Planner queried? |
|---|---|---|
| `ready` | Active link, provisioning succeeded, `event_summary_realtime` row found | Yes |
| `pending` | `planner_provisioning_status` is `pending`/`provisioning`, not yet stale | No |
| `stale` | Same, but stale per `isPlannerProvisioningStale()` | No |
| `failed` | `planner_provisioning_status = 'failed'` | No |
| `unavailable` | No active `event_planner_links` row, `not_required` despite an active Planner product, or a dangling/missing Planner-side row | Only in the dangling-row case |
| `backend_error` | The Planner read itself threw or timed out | Attempted, failed |

### `ready` response

```json
{
  "ok": true,
  "status": "ready",
  "event": {
    "title": "CIPLA SYNERGY",
    "description": "Annual leadership offsite",
    "location": "Zanzibar",
    "startDate": "2026-04-21",
    "endDate": "2026-04-22",
    "setupDate": "2026-04-20"
  },
  "sessionSummary": {
    "totalSessions": 33,
    "eventPhase": "Completed"
  }
}
```

`description`/`location`/`startDate`/`endDate`/`setupDate` are each omitted (not `null`) when the
underlying Planner column is null. `totalSessions: 0` is a valid, expected value (research.md Q15) and
renders identically to any other number — it is never treated as an error.

### `pending` / `stale` / `failed` / `unavailable` response

```json
{ "ok": true, "status": "pending" }
```

No `message` field is defined by this contract — the Planner Overview page reuses
`PlannerProvisioningBanner`'s existing copy for each status client-side (research.md Q19), so the
server does not duplicate that text. A future revision may add one if a page consuming this endpoint
outside that banner's context needs its own copy; not needed for this feature.

### `backend_error` response

```json
{ "ok": true, "status": "backend_error" }
```

The underlying Planner error (message, code, stack) is logged server-side only (`console.error`,
matching every existing Planner-touching route's convention) and is never included in the response body,
regardless of the caller's role (FR-006, FR-014) — this endpoint does not have a platform-admin
diagnostic variant; that remains Feature 001's separate `bendie-planner` admin surface.

## Forbidden/not-found responses

| Status | Body | When |
|---|---|---|
| 401 | `{ "error": "not_authenticated" }` | No session |
| 403 | `{ "error": "forbidden" }` | Caller has no organization memberships at all (case B above — a null or stale saved selection alone is not this case; see step 2) |
| 404 | `{ "error": "event_not_found" }` | Event doesn't exist, or the caller fails workspace admission |
| 403 | `{ "error": "product_unavailable" }` | Event's product usage does not currently include an active Planner entitlement |

None of these ever reveal whether an event exists to a caller who isn't authorized to see it beyond
what Feature 003's existing metadata-visibility rules already allow — this route adds no new
information-disclosure surface.

## Safe-error requirements (apply to every branch above)

- Never include a Bendie Planner service-role credential, connection string, or API key.
- Never include a raw Postgres/Supabase/PostgREST error message, code, or stack trace.
- Never echo the Planner integer event id, or any other Planner-internal identifier, back to the client.
- Never include any field outside `EventIdentity`/`SessionSummary` as defined in data-model.md — no
  participant, flight, accommodation, transfer, staff, task, checklist, vendor, blueprint, notification,
  agenda, or attendee-count data, under any status value.
