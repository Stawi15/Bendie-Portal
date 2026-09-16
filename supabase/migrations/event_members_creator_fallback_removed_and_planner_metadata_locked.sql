-- Organization & Event Access Foundation (Feature 003) -- second corrective
-- pass, R2-F1 and R2-F4.
--
-- R2-F1: events_insert_creator retained a historical-organization-creator
-- fallback (organizations.created_by = auth.uid()) alongside
-- is_organization_admin(organization_id). The first corrective pass
-- preserved this verbatim per its own T046 instructions and the resulting
-- product-policy ambiguity was deliberately left unresolved (F-R3). That
-- decision is now made: creator identity is audit/history data, not a
-- current authorization grant. Only "Global admins can manage all events"
-- (a separate, untouched permissive ALL policy using portal_is_global_admin())
-- and this tightened policy affect events INSERT -- confirmed live via
-- pg_policies before writing this migration, so platform-admin INSERT is
-- unaffected by this change.

DROP POLICY IF EXISTS "events_insert_creator" ON public.events;

CREATE POLICY "events_insert_creator"
  ON public.events
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_organization_admin(organization_id)
  );

-- R2-F4: event_members.planner_sync_status / planner_sync_error (and the
-- related planner_assignment_id / planner_synced_at) are Feature 001
-- administrative metadata. The first corrective pass (F-R5) added a
-- client-side platform-admin-only guard to the Bendie Planner page, but
-- Supabase's default table-level SELECT grant to `authenticated`/`anon`
-- (confirmed live via information_schema.role_table_grants before writing
-- this migration) meant any ordinary event member could still read these
-- columns for every member of their event via a direct client-side query,
-- bypassing that page entirely -- RLS is row-level, not column-level, and
-- event_members_select_event_member (is_event_member(event_id)) legitimately
-- grants row access to the whole roster for attendance/roster purposes.
--
-- Fix: revoke column-level SELECT on just these four columns from
-- `authenticated`/`anon` (Postgres enforces column grants independently of
-- the table-level SELECT grant covering the remaining columns -- confirmed
-- live after applying, not assumed). `service_role` is untouched (a separate
-- grant; already bypasses RLS and is unaffected by a REVOKE scoped to
-- authenticated/anon), so Feature 001's planner-sync-member route -- which
-- writes these columns via the CALLING ADMIN'S OWN authenticated session,
-- not service-role -- is unaffected: this revoke targets SELECT only, and
-- UPDATE is a separate privilege Postgres does not require SELECT for.
--
-- The Bendie Planner integration page's own read of these columns (as a
-- genuine platform admin, but still connecting as Postgres role
-- `authenticated` like everyone else -- Supabase has no separate "admin"
-- connection role) would otherwise ALSO be blocked by this revoke, since
-- column grants are role-wide, not per-row. get_event_planner_sync_status()
-- below is a SECURITY DEFINER function (executes with the function owner's
-- privileges, which are unaffected by the revoke) that re-verifies
-- portal_is_global_admin() itself before returning these columns -- the
-- approved safe projection ordinary members cannot reach, while platform
-- admins reach the same data through this function instead of a direct
-- table SELECT.

REVOKE SELECT (planner_assignment_id, planner_synced_at, planner_sync_status, planner_sync_error)
  ON public.event_members
  FROM authenticated, anon;

CREATE OR REPLACE FUNCTION public.get_event_planner_sync_status(p_event_id uuid)
RETURNS TABLE (
  user_id uuid,
  role text,
  planner_sync_status text,
  planner_sync_error text,
  planner_synced_at timestamptz,
  full_name text,
  email text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.portal_is_global_admin() THEN
    RAISE EXCEPTION 'Only platform administrators may read Bendie Planner sync status';
  END IF;

  RETURN QUERY
    SELECT em.user_id, em.role, em.planner_sync_status, em.planner_sync_error, em.planner_synced_at,
           p.full_name, p.email
    FROM public.event_members em
    LEFT JOIN public.profiles p ON p.id = em.user_id
    WHERE em.event_id = p_event_id
    ORDER BY em.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_event_planner_sync_status(uuid) TO authenticated;
