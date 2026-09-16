# Contract: Create Event (product-aware)

`POST /api/events/create`

Replaces the current direct browser-client `INSERT` into `events` performed by
`CreateEventModal.tsx`. Authenticated, cookie-session route (not `app/api/admin/**` — authorized
actor is org owner/admin, not platform admin only).

## Request

```json
{
  "idempotencyKey": "c3f1e2a0-....",      // client-generated UUID, stable across retries of the SAME submission
  "organizationId": "uuid",                // the caller's currently selected organization
  "name": "string, required, non-empty",
  "location": "string | null",
  "startsAt": "date string (YYYY-MM-DD) | null",
  "endsAt": "date string (YYYY-MM-DD) | null",
  "products": ["bendie"] | ["planner"] | ["bendie","planner"]
}
```

`organizationId` and `products` are always re-derived/re-validated server-side against the database
(research.md §3 steps 2–3); they are never trusted as authoritative merely because the client sent
them (FR-026, FR-032).

## Authorization

1. Caller MUST be authenticated (existing session) → else `401`.
2. Caller MUST be a platform administrator OR hold `owner`/`admin` in `organizationId`'s
   `organization_members` → else `403`. (Identical predicate to `events_insert_creator`.)

## Preflight validation (before any write — FR-019)

3. Every value in `products` MUST have an active `organization_products` row for `organizationId` →
   else `422` with a machine-readable reason (`entitlement_inactive` / `entitlement_missing`) and a
   plain-language message.
4. If `products` includes `"planner"`: `organization_planner_links` MUST have a row for
   `organizationId` → else `409` with reason `planner_mapping_missing` and the exact FR-019 message
   ("Bendie Planner hasn't been set up for this organization yet. Please contact your administrator
   to complete the Planner setup before creating this event."). **No write of any kind occurs.**

## Success response

```json
{
  "ok": true,
  "eventId": "uuid",
  "plannerProvisioningStatus": "not_required" | "pending" | "provisioning" | "succeeded" | "failed"
}
```

- Bendie-only: `plannerProvisioningStatus` is always `"not_required"` in the response — Phase 2/3/4
  never run.
- Planner-only or Both: the response reflects the outcome of the synchronous Phase 2–4 attempt made
  during this same request (research.md §5) — `"succeeded"` if Planner provisioning completed within
  this request, `"failed"` if it did not (the Portal event still exists either way — see below).

## Partial-outcome response (Planner/Both only — NOT an error)

If Phase 1 (Portal atomic create) succeeds but Phase 2/3 (Planner provisioning) fails, the HTTP
response is still `200 ok: true` with `plannerProvisioningStatus: "failed"` — creation itself did not
fail (FR-021). The client MUST render this as "event created, Planner setup incomplete — retry," not
as a creation error.

## Idempotency

- Resubmitting the same request with the same `idempotencyKey` **and the same `organizationId`/
  `products`** (double-click, client retry after a perceived timeout) MUST return the same `eventId`
  and MUST NOT create a second Portal event (research.md §7). The response is identical in shape to
  the original success response.
- Resubmitting the same `idempotencyKey` with a **different** `organizationId` or `products` MUST be
  rejected with `409 idempotency_conflict` — it MUST NOT silently return the original, unrelated
  event (research.md §7, added during `/speckit.analyze`; a client encountering this must generate a
  new `idempotencyKey`, not retry with the same one).
- A different `idempotencyKey` is always a new, independent creation attempt.

## Error responses

| Status | Reason | When |
|---|---|---|
| `401` | `not_authenticated` | no session |
| `403` | `forbidden` | not platform admin, not org owner/admin of `organizationId` |
| `400` | `invalid_request` | malformed payload (missing name, empty `products`, unrecognized product key) |
| `422` | `entitlement_inactive` / `entitlement_missing` | requested product not actively entitled |
| `409` | `planner_mapping_missing` | Planner requested, no organization mapping |
| `409` | `idempotency_conflict` | `idempotencyKey` was already used for a request with a different `organizationId`/`products` — added during `/speckit.analyze` (research.md §7) |

No response body of any kind ever includes a raw database error, stack trace, or service-role/Planner
credential detail (FR-024, FR-027).
