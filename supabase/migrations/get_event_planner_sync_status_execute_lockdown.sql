-- Organization & Event Access Foundation (Feature 003) -- third corrective
-- pass, R3-F5.
--
-- get_event_planner_sync_status() (added in
-- event_members_creator_fallback_removed_and_planner_metadata_locked.sql)
-- was granted EXECUTE to `authenticated` but PostgreSQL's default EXECUTE
-- grant to PUBLIC on function creation was never explicitly revoked.
-- Confirmed live via pg_proc.proacl: `anon` also held EXECUTE (Supabase's
-- default grant set for newly created functions). The function's own
-- internal portal_is_global_admin() check currently prevents any actual
-- data exposure regardless of caller, but the database privilege boundary
-- itself was broader than the least-privilege design intended.

REVOKE EXECUTE ON FUNCTION public.get_event_planner_sync_status(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_event_planner_sync_status(uuid) FROM anon;

-- `authenticated` keeps EXECUTE -- the legitimate platform-admin caller
-- reaches this function as Postgres role `authenticated` (Supabase has no
-- separate "admin" connection role); the function's own
-- portal_is_global_admin() check is the real authorization boundary for
-- which authenticated caller succeeds. `service_role` keeps EXECUTE for
-- consistency with every other function in this schema (already bypasses
-- RLS entirely; not currently a caller, but not worth special-casing out).
