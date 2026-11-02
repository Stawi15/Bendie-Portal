# Data Model: Organisation Products Management (Feature 022)

There are two databases. The Portal changes go in one Portal migration, `supabase/migrations/organization_products_admin.sql`. The Planner changes are SQL the developer runs in the Planner project, `specs/022-org-products-admin/planner-sql/enforce_planner_organization_active.sql`.

## Portal (shared Bendie project)

### `organization_products` (changed)

| Column | Type | Rules |
|---|---|---|
| `status_changed_at` | `timestamptz NULL` | **New.** Set by a BEFORE UPDATE trigger when `is_active` changes |
| `status_changed_by` | `uuid NULL` → `profiles(id) ON DELETE SET NULL` | **New.** `auth.uid()` at that moment |

- **Product state as shown in the UI:** `'active'` (row present and `is_active`), `'paused'` (row present and not active), or `'none'` (no row).
- **Pause/resume:** an UPDATE of `is_active` only. Rows are never deleted (the FK from `event_products` already prevents it).
- **Audit:** an AFTER INSERT/UPDATE trigger, `log_organization_product_change()`, writes to `organization_audit_log` (row_id = `product_key`).

### `organization_planner_links` (changed)

| Column | Type | Rules |
|---|---|---|
| `planner_app_paused_at` | `timestamptz NULL` | **New.** Mirrors Planner `organizations.is_active = false`, for display |
| `planner_app_paused_by` | `uuid NULL` → `profiles(id) ON DELETE SET NULL` | **New** |

- **Audit:** an AFTER INSERT/UPDATE trigger, `log_organization_product_change()` (row_id = `planner_organization_id`).
- **Constraints:** the existing PK `(organization_id)` and UNIQUE `(planner_organization_id)` enforce one-to-one.

### `organization_audit_log` (unchanged schema)

These new kinds of entry appear in it:

| `table_name` | `action` | Written by |
|---|---|---|
| `organization_products` | INSERT / UPDATE | trigger |
| `organization_planner_links` | INSERT / UPDATE | trigger (a Planner app pause/resume is the UPDATE of `planner_app_paused_at`) |
| `event_products` | INSERT | route, explicit insert, diff `{ event_id, event_name, product_key }` |

`organization_audit_log.action` has a CHECK constraint allowing only INSERT / UPDATE / DELETE (verified during implementation), so no custom action values are used.

### `admin_create_organization(...)` (new function, /speckit-analyze U1)

`SECURITY INVOKER`, platform admin only. In **one transaction** it inserts `organizations`, the `organization_products` rows and, for Planner, the `organization_planner_links` row. It returns the new organisation id. This means a failed create can never leave an organisation with Planner on but no connection.

### Unchanged tables used

`organizations` (name, slug), `organization_members` (member count), `events` (event count; `planner_provisioning_status`), `event_products`, `event_planner_links`.

## Planner (developer-run SQL)

### `organizations` (schema unchanged)
`is_active` becomes **enforced**: when false, only Planner platform admins can open the organisation's events and their data.

### New helper functions
- `is_org_active(p_org_id bigint) returns boolean`: `coalesce((select is_active from organizations where organization_id = p_org_id), true)`.
- `is_event_org_active(p_event_id bigint) returns boolean`: `is_org_active` of the event's `organization_id`.

### Changed functions and policies
See research.md R2 for the full list. Every change only adds the active-organisation condition to a non-platform-admin path.

## State transitions: an organisation's product

```text
none ──switch on (Planner: needs connection)──▶ active
active ──pause [Planner: optionally pause app access]──▶ paused
paused ──resume (Planner: resumes app access too)──▶ active
active/paused ──X──▶ none   (not allowed: used products are never removed)
```
