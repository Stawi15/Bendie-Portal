# API Contract: Bendie Planner Vendors

All routes copy the same authorization sequence inline (matching Feature 007/008's own established precedent of never sharing this sequence via a helper, "so no future edit to one route can silently alter another's authorization behavior"):

1. Authenticate (`authClient.auth.getUser()`) → `401 not_authenticated`.
2. Resolve the caller's selected organization (platform-admin bypass, else membership-derived fallback) → `403 forbidden` if none resolvable.
3. `requireEventWorkspaceAccess(eventId, userId, organizationId, authClient)` → `404 event_not_found` on failure (never `403`, matching the existing convention of not confirming an event's existence to a non-member).
4. `isProductAvailableForEvent(eventId, organizationId, 'planner', authClient)` → `403 product_unavailable`.
5. `resolveProvisioningPhase(event)` → if not `'needs-link-check'`, return `{ ok: true, status: <phase> }` immediately (the exact existing `pending`/`stale`/`failed`/`unavailable` vocabulary — never a new one).
6. Resolve the active `event_planner_links` row via the Portal service-role client → `{ ok: true, status: 'unavailable' }` if none, `{ ok: true, status: 'backend_error' }` on a genuine lookup error.
7. `resolveCallerPlannerIdentity(authClient, userId)` → if null: the collection/item routes return `403 planner_identity_unavailable`; the dedicated capability route instead returns `200 { ok: true, capability: { hasPlannerIdentity: false } }` (never an error — this is the one deliberate shape difference between the two, matching Feature 007's own `planner-tasks/capability/route.ts` precedent exactly).
8. `resolveVendorCapability(plannerEventId, plannerProfileId)` (this feature's own function, structurally identical to `plannerTasks.ts`'s `resolveTaskCapability`, reading `can_view_vendors`/`can_manage_vendors` instead) → a genuine read failure returns `{ ok: true, status: 'backend_error' }` (never collapsed into `canView: false` — Feature 007's own `/speckit.analyze` H2 correction, reused verbatim here). On the collection/item routes, `canView: false` returns `403 vendor_access_denied`; the dedicated capability route returns the resolved capability regardless of its value.

## `GET /api/events/[eventId]/planner-vendors`

Steps 1–8 above. On success:

**Response — 200**:
```json
{
  "ok": true,
  "capability": { "hasPlannerIdentity": true, "canView": true, "canManage": false },
  "items": [
    {
      "id": 12,
      "category": "Audio",
      "description": "Wireless lapel mic set",
      "quantityText": "4",
      "unit": "units",
      "isPacked": true,
      "packedAt": "2026-09-18T09:00:00Z",
      "packedByName": null,
      "isLoaded": false,
      "loadedAt": null,
      "loadedByName": null,
      "isOnSite": false,
      "onSiteAt": null,
      "onSiteByName": null,
      "notes": "Confirm spare batteries",
      "createdAt": "2026-09-15T12:00:00Z",
      "updatedAt": "2026-09-18T09:00:00Z",
      "createdByName": "Jordan Ade"
    }
  ]
}
```
Ordered by `category`, then `sort_order` (matching the live `idx_event_vendor_items_event_sort` index — research.md R5). Empty `items` array is a normal, valid response (empty-list state), not an error.

**Errors**: `401 not_authenticated`, `403 forbidden` / `product_unavailable` / `planner_identity_unavailable` / `vendor_access_denied`, `404 event_not_found`, plus the `{ ok:true, status:'pending'|'stale'|'failed'|'unavailable'|'backend_error' }` non-error shapes from steps 5/6/8.

## `GET /api/events/[eventId]/planner-vendors/capability`

Steps 1–8 above, except step 7's identity-miss and step 8 both return `200` with the capability payload rather than a `403` — this route exists solely for `EventLayout.tsx`'s tab-visibility check (research.md R9) and must never itself gate on the answer it returns, mirroring `planner-tasks/capability/route.ts` exactly.

**Response — 200**:
```json
{ "ok": true, "capability": { "hasPlannerIdentity": true, "canView": true, "canManage": true } }
```
or `{ "ok": true, "capability": { "hasPlannerIdentity": false } }`, or `{ "ok": true, "status": "pending" | "stale" | "failed" | "unavailable" | "backend_error" }`.

## `POST /api/events/[eventId]/planner-vendors`

Steps 1–8; additionally requires `capability.canManage === true` → `403 vendor_manage_denied`.

**Request**:
```json
{ "category": "Audio", "description": "Wireless lapel mic set", "quantityText": "4", "unit": "units", "notes": "Confirm spare batteries" }
```
`description` is the only required field (`400 invalid_request` if missing/blank). `category`/`quantityText`/`unit`/`notes` are optional passthroughs. `sortOrder` MAY be accepted as an optional creation-time integer; any other field (including `event_id`, any `is_packed`/`*_at`/`*_by_profile_id`, or `created_by_profile_id`) is rejected with `400 invalid_request` if present — creation always starts from the database's own all-false lifecycle defaults (FR-022) and server-derived attribution (FR-023).

**Server processing**: resolve the canonical `event_id` (Planner) server-side (never from the client); insert with `created_by_profile_id = plannerProfileId` (the caller's own resolved identity); `is_packed`/`is_loaded`/`is_on_site` are never included in the INSERT payload — the table's own defaults (`false`) apply.

**Success — 201**: `{ "ok": true, "item": VendorItem }` (the freshly inserted, freshly re-selected row, in the same shape as the GET list).

**Errors**: `400 invalid_request`, `403 vendor_manage_denied` (+ the standard step 1–8 errors), `404 event_not_found`, `500 planner_write_failed`.

## `PATCH /api/events/[eventId]/planner-vendors/[itemId]`

Steps 1–8; additionally requires `capability.canManage === true` → `403 vendor_manage_denied`. Additionally resolves the target item and verifies `item.event_id === plannerEventId` (the resolved canonical event) → `404 vendor_item_not_found` if it does not belong to this event (never leaking cross-event existence — matching Feature 007's `[taskId]/route.ts` precedent exactly).

**Request** (any non-empty subset):
```json
{ "isPacked": true }
```
or `{ "isLoaded": false }`, `{ "isOnSite": true }`, `{ "notes": "Updated after site walkthrough" }`, or any combination. Any field not in `{ isPacked, isLoaded, isOnSite, notes }` is rejected with `400 invalid_request` — this is the explicit, positive allowlist that keeps `category`/`item_description`/`quantity_text`/`unit`/`sort_order`/`event_id` structurally unreachable through this route (FR-038/FR-039), not merely omitted from documentation. A body containing none of these four keys (including `{}`) is also rejected with `400 invalid_request` ("at least one field is required") rather than silently issuing a no-op write — "non-empty" above is an enforced contract, not merely descriptive text. An omitted key leaves that column untouched; an explicitly-submitted `false` (for the three booleans) or `null` (for `notes`) is a real, distinct value from omission — see data-model.md's `VendorItemPatch` for the exact `typeof x === 'boolean'` / `'notes' in body` distinguishing technique.

**Server processing**: maps the requested keys to their column names (`isPacked → is_packed`, etc.) and issues a single `UPDATE ... WHERE vendor_item_id = ? AND event_id = ? RETURNING <the full column list>`. The live database trigger (data-model.md §2.1) may adjust the persisted combination beyond what was requested (e.g. cascading a reversal) — the response always reflects the row exactly as the database returned it from this same `UPDATE`'s `RETURNING` clause, never the client's originally requested combination (FR-030).

**Success — 200**: `{ "ok": true, "item": VendorItem }` — the authoritative, persisted-after-trigger state.

**Errors**: `400 invalid_request`, `403 vendor_manage_denied`, `404 vendor_item_not_found` (+ standard step 1–8 errors), `500 planner_write_failed`.

## `DELETE /api/events/[eventId]/planner-vendors/[itemId]`

Steps 1–8; additionally requires `capability.canManage === true` → `403 vendor_manage_denied`. Same cross-event item-scope check as `PATCH` above.

**Success — 200**: `{ "ok": true }`.

**Errors**: `404 vendor_item_not_found` (item does not exist, already deleted, or belongs to a different event — research.md R8; a repeated `DELETE` on the same `itemId` after the first succeeds returns this, not a repeated `200`), `403 vendor_manage_denied` (+ standard step 1–8 errors), `500 planner_write_failed`.

## Response-safety note (SR-012)

Every route's catch-all error handler logs the genuine Planner error server-side and returns only `{ "error": "planner_write_failed", "message": "Could not save — try again." }` (or the equivalent read-path `backend_error` status) — never a raw Postgres/PostgREST error body, matching every existing Feature 005/007/008 route's own `normalizePlannerTaskError`-equivalent handling.
