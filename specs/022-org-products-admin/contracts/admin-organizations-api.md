# Contract: Platform-admin organisation API (Feature 022)

These routes live under `src/app/api/admin/organizations/**` and `src/app/api/admin/planner-organizations`.

**How every route works:**
1. Authenticates from the session cookie.
2. Requires `profiles.global_role = 'admin'`; otherwise it returns `401` (not signed in) or `403`.
3. Makes Portal writes with the **caller's session**, so audit records the person.
4. Uses service keys only for the Planner project and the provisioning-status columns.

Error bodies look like `{ "error": "<plain-language message>" }`. Status codes: `400` validation, `404` unknown organisation or event, `409` stale state or conflict, `502` Planner unreachable.

## `GET /api/admin/planner-organizations`
Planner organisations available to connect: not linked to any Portal organisation, and not organisation 1 (Stawi).
`200 { "plannerOrganizations": [{ "id": 7, "name": "…", "slug": "…" }] }`

## `POST /api/admin/organizations`
Creates an organisation with products and, if Planner is chosen, a Planner connection.

```json
{ "name": "Acme", "slug": "acme", "products": ["bendie", "planner"],
  "planner": { "mode": "existing", "plannerOrganizationId": 7 } | { "mode": "new" } }
```

- `products` must not be empty. Allowed values: `bendie`, `planner`.
- `planner` is required if and only if `products` includes `planner`.
- **Steps:**
  1. If `mode = "new"`, create the Planner organisation.
  2. Call the Portal function `admin_create_organization`. It inserts the organisation, its product rows and the Planner link **in one transaction (all or nothing)**, with the caller's session.
  3. If step 2 fails after step 1, delete the Planner organisation created in step 1.
- **Responses:**
  - `201 { "organization": { "id", "name", "slug" } }`
  - `409` slug taken, or Planner organisation already connected

## `POST /api/admin/organizations/[organizationId]/planner-connection`
Connects Planner for an organisation that has none.
Body: `{ "mode": "existing", "plannerOrganizationId": 7 } | { "mode": "new" }`
- `409` if the organisation is already connected, or the Planner organisation is already used.
- `200 { "plannerOrganization": { "id", "name" } }`

## `GET /api/admin/organizations/[organizationId]/impact?product=bendie|planner`
`200 { "events": 12, "plannerPeople": 9 | null, "plannerAppPaused": false, "plannerEnforcementLive": true }`

`plannerEnforcementLive` is true only when the Planner SQL (`is_org_active`) is installed. The UI offers "Also pause Planner app access" only when it's true.
`plannerPeople` is set only for `product=planner`.

## `PATCH /api/admin/organizations/[organizationId]/products/[product]`
Switches a product on or off.

```json
{ "active": false, "expectedActive": true, "pausePlannerAppAccess": true }
```

- **`active: true`:**
  - For `planner`, requires an existing Planner connection, otherwise `400` "Connect a Planner organisation first".
  - Creates the row if it's `none`, otherwise sets `is_active = true`.
  - For Planner, if app access was paused, it resumes it (Planner `organizations.is_active = true`, clears `planner_app_paused_*`) and logs RESUME.
- **`active: false`:**
  - Sets `is_active = false`.
  - If `pausePlannerAppAccess` and the product is `planner`: sets Planner `organizations.is_active = false`, stamps `planner_app_paused_*` (recorded in history by the links trigger).
- **`pausePlannerAppAccess: true` while Planner enforcement isn't installed:** `409` "Planner app access can't be paused yet — the Planner update hasn't been installed". Nothing changes.
- **Stale check:** the update only applies `WHERE is_active = expectedActive` (or the row is absent when `expectedActive` is null). A stale request gets `409`.
- `200 { "product": "planner", "state": "paused", "plannerAppPaused": true }`

## `POST /api/admin/organizations/[organizationId]/events/[eventId]/products`
Body: `{ "product": "bendie" | "planner" }`

- **Checks:**
  - the event belongs to the organisation (`404` otherwise)
  - the product is active for the organisation (`400` otherwise)
  - the event doesn't already have it (`409`)
- **Bendie:** inserts `event_products`.
- **Planner:** inserts `event_products`, sets `events.planner_provisioning_status = 'pending'` (service key), then calls `provisionPlannerEvent`.
- **Logging:** writes an `event_products` ADD entry to `organization_audit_log`.
- **Response:** `200 { "product": "planner", "plannerProvisioning": "succeeded" | "failed" | "provisioning_in_progress", "reason"?: "…" }`. A failure can be retried through the existing `/api/events/[eventId]/retry-planner-provisioning`.
