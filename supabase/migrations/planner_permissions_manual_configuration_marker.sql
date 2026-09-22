-- Feature 008 (Bendie Planner Staff & Module Permissions) foundation.
--
-- 1. event_members.planner_permissions_configured_at
--
-- NULL = this member's Bendie Planner permissions have never been explicitly
-- configured by an authorized manager -- role-derived automatic sync
-- (plannerStaffSync.ts) may still apply. Non-NULL = an authorized manager has
-- explicitly configured (Saved) or explicitly Disabled this person's access
-- (FR-021, FR-035, FR-036a) -- automatic sync MUST NOT overwrite
-- can_view_*/can_manage_*/access_role or silently reactivate is_active for
-- this member from that point on (see plannerStaffSync.ts's guard clause).
--
-- No grant statement is added deliberately: event_members already uses
-- column-level grants for authenticated/anon (see
-- event_members_planner_metadata_column_grant_fix.sql and
-- event_members_planner_metadata_update_privilege_fix.sql), which exclude
-- four sibling Planner-managed columns (planner_assignment_id,
-- planner_synced_at, planner_sync_status, planner_sync_error). A new column
-- receives zero privileges for any role until explicitly granted, so this
-- column is automatically service-role-only from creation, matching its
-- siblings exactly -- no REVOKE is needed, and none is added here.
--
-- No backfill: every existing row's correct value is NULL -- no row in this
-- table has ever been explicitly configured through a mechanism that did not
-- exist before this migration (Feature 008 research.md R2).

ALTER TABLE public.event_members
  ADD COLUMN planner_permissions_configured_at timestamptz NULL;

-- 2. planner_permission_audit_log
--
-- Lightweight, append-only, Portal-side audit trail for Planner
-- access/permission administration (Feature 008 Locked Decision 4). NOT the
-- source of truth for current permissions -- Planner's own
-- event_user_assignments remains authoritative for that at all times. No
-- audit-history UI ships with this feature; the SELECT policy below exists
-- only so a platform admin can inspect the log directly without a
-- service-role key.
--
-- member_user_id references profiles, not event_members, so a later
-- event-member removal (an existing, unmodified hard DELETE of event_members
-- -- see EventAssignmentsDropdown.tsx) never cascades away that person's
-- audit history (Feature 008 FR-041a).

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

-- No INSERT/UPDATE/DELETE policy is granted to any client role -- every write
-- goes through Feature 008's own API routes via the Portal service-role
-- client, and the log is append-only by the absence of any client write path
-- (not merely by application-level convention).
CREATE POLICY "Global admins can view planner permission audit log"
  ON public.planner_permission_audit_log FOR SELECT
  USING (public.portal_is_global_admin());
