# Data Model: Bendie Planner Staff & Module Permissions

## 1. Portal schema change (additive, one column)

```sql
-- Migration: planner_permissions_manual_configuration_marker.sql
--
-- Feature 008 foundation. NULL = this member's Bendie Planner permissions have
-- never been explicitly configured by an authorized manager (role-derived
-- automatic sync, plannerStaffSync.ts, may still apply). Non-NULL = an
-- authorized manager has explicitly configured them; automatic sync MUST NOT
-- overwrite can_view_*/can_manage_*/access_role or reactivate is_active for
-- this member from that point on (see plannerStaffSync.ts's new guard clause).
--
-- No grant statement is added deliberately: event_members already uses
-- column-level grants for authenticated/anon (see
-- event_members_planner_metadata_column_grant_fix.sql /
-- _update_privilege_fix.sql), which exclude four sibling Planner-managed
-- columns (planner_assignment_id, planner_synced_at, planner_sync_status,
-- planner_sync_error). A new column receives zero privileges for any role
-- until explicitly granted, so this column is automatically service-role-only
-- from creation, matching its siblings exactly -- no REVOKE needed.
--
-- No backfill: every existing row's correct value is NULL (see research.md R2)
-- -- no row in this table has ever been explicitly configured through a
-- mechanism that didn't exist before this migration.

ALTER TABLE public.event_members
  ADD COLUMN planner_permissions_configured_at timestamptz NULL;
```

**Rollback**: `ALTER TABLE public.event_members DROP COLUMN planner_permissions_configured_at;` — safe; no other object depends on it structurally (no FK, no trigger, no generated column).

**`src/types/database.ts` change**: add `planner_permissions_configured_at: string | null` to the `event_members` row type, alongside its four existing Planner-sync sibling fields.

## 2. Portal schema change (additive, one new table): audit log

```sql
-- Migration: planner_permission_audit_log.sql (same file or a second file
-- immediately after the column migration above)

CREATE TABLE public.planner_permission_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  member_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action_type text NOT NULL CHECK (action_type IN (
    'access_enabled', 'permissions_changed', 'access_disabled', 'access_reactivated'
  )),
  before_state jsonb,
  after_state jsonb NOT NULL,
  operation_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, member_user_id, operation_id)
);

ALTER TABLE public.planner_permission_audit_log ENABLE ROW LEVEL SECURITY;

-- No audit-history UI ships with this feature; this policy exists only so a
-- platform admin can inspect the log directly (e.g. via the Supabase
-- dashboard or a future feature) without a service-role key. No policy is
-- granted for INSERT/UPDATE/DELETE to any client role -- every write goes
-- through the Feature 008 API routes' service-role client only, and the log
-- is append-only by construction (no route ever issues UPDATE/DELETE against
-- it).
CREATE POLICY "Global admins can view planner permission audit log"
  ON public.planner_permission_audit_log FOR SELECT
  USING (public.portal_is_global_admin());
```

Note: `member_user_id` references `profiles`, not `event_members` — deliberately, so a later event-member removal (hard delete, per FR-041a) never cascades away that person's audit history. `event_id` cascades on event deletion, matching this codebase's existing convention for event-scoped tables (e.g. `event_products.event_id`).

`before_state`/`after_state` shape (a plain JSON snapshot of the module-permission surface, never a raw Planner row):

```json
{
  "isActive": true,
  "accessRole": "member",
  "flags": {
    "canViewOverview": true, "canViewProduction": true, "canViewLogistics": true,
    "canViewTasks": true, "canManageTasks": false,
    "canViewNotifications": true,
    "canViewChecklist": true, "canManageChecklist": false,
    "canViewVendors": true, "canManageVendors": false
  }
}
```

`before_state` is `null` only for `access_enabled` (no prior assignment state existed). For `access_disabled` written from the member-removal path (research.md R10), `after_state` additionally carries `{"deactivationConfirmed": boolean}`.

**`src/types/database.ts` change**: add the `planner_permission_audit_log` table type (read-only from the application's perspective; writes happen only via the service-role client in `src/lib/plannerPermissions.ts`).

## 3. No Planner-side schema change

Confirmed not needed and not permitted (Decision 1). `event_user_assignments` is used exactly as-is: `is_active`, `access_role`, and the 10 existing flags. No new column, no new table, no RLS change on the Planner project.

## 4. Entities

### PlannerPermissionState (derived, not a table — the shape returned by every Feature 008 API route)

| Field | Type | Source |
|---|---|---|
| `isEnabled` | boolean | `event_user_assignments.is_active` (false if no row exists) |
| `hasBeenConfigured` | boolean | `event_members.planner_permissions_configured_at IS NOT NULL` |
| `preset` | `'viewer' \| 'manager' \| 'custom'` | derived (`derivePresetLabel`, research.md R6) from the current flags |
| `modules` | array of `{ key, label, view: boolean, manage: boolean \| null }` | one entry per `PLANNER_MODULES` row; `manage` is `null` (not `false`) for Overview/Production/Logistics/Notifications so the client never renders a Manage control for them (FR-012) |

**Corrected 2026-09-21 (`/review` finding, LOW)**: `accessRole` is deliberately **not** part of the shipped `PlannerPermissionState` (`shapeState()` in `plannerPermissions.ts` returns only the four fields above) — an earlier draft of this table incorrectly listed it. `access_role` is still derived server-side (`deriveAccessRole`) and still never client-editable (FR-026–FR-028); it's simply never surfaced to the client at all, since nothing in the UI needs it — `preset`/`modules` alone fully describe the state a manager needs to see. This matches contracts.md's own response examples, which already correctly state "`accessRole`... never included in the response."

### PlannerPermissionChangeRecord (`planner_permission_audit_log`)

As above — append-only, never authoritative for current state (FR-056).

### EventMember (existing, `event_members`, +1 field)

Adds `planner_permissions_configured_at`. No other change.

## 5. State transitions (assignment lifecycle)

```
[no assignment row]
   --(Enable)-->            is_active=true,  flags=role-derived defaults, configured_at=NULL
   --(Save, any preset/custom)--> flags=as saved, access_role=derived, configured_at=now() [if was NULL]
   --(Disable)-->            is_active=false, flags unchanged, configured_at=now() [if was NULL — research.md R9 correction, closes the FR-045 gap for a member disabled before ever being explicitly Saved]
   --(Reactivate)-->         is_active=true,  flags unchanged (exactly as before disable), configured_at unchanged
   --(Member removed)-->     is_active=false (best-effort), Portal event_members row deleted (configured_at destroyed with it)
   --(Re-added, then Enable)--> flags=role-derived defaults (fresh; configured_at was reset to NULL by removal, per FR-041a), configured_at=NULL again
```

Automatic sync (`plannerStaffSync.ts`) only ever touches the row when `event_members.planner_permissions_configured_at IS NULL` for that member — i.e., anywhere in the top branch of this diagram before a Save has ever occurred. Once a Save has occurred, only the four explicit Feature 008 actions (Save again, Disable, Reactivate, member removal) may change the row.
