-- Organization & Event Access Foundation (Feature 003) -- second corrective
-- pass, R2-F4 follow-up.
--
-- Live-tested after the previous migration: an ordinary event member could
-- STILL read planner_sync_status directly (confirmed via a real customer
-- JWT: SELECT returned the value, no error). Root cause found by inspecting
-- pg_class.relacl directly: `authenticated`/`anon` each still held the
-- table-level SELECT ('r') privilege bit, and in PostgreSQL a table-level
-- SELECT grant subsumes any per-column REVOKE -- a role holding table-level
-- SELECT can read every column regardless of column-level REVOKEs; those
-- only matter for a role that does NOT hold the table-level grant. The
-- previous migration's `REVOKE SELECT (col1, col2, ...) ON event_members
-- FROM authenticated, anon` was therefore a no-op in practice, exactly the
-- failure mode this task's own instructions warned against assuming away.
--
-- Correct fix: revoke the table-level SELECT grant entirely, then grant
-- SELECT back only on the columns ordinary customers are meant to see. This
-- is the only PostgreSQL mechanism that actually enforces column-level
-- restriction. service_role is untouched (separate grant, RLS-bypassing,
-- unaffected either way). get_event_planner_sync_status() (SECURITY
-- DEFINER, added in the previous migration) is unaffected -- it executes
-- with its owner's privileges, not the caller's.

REVOKE SELECT ON public.event_members FROM authenticated, anon;

GRANT SELECT (
  event_id, user_id, organization_id, role,
  onboarding_status, onboarding_completed_at, invited_by, created_at
) ON public.event_members TO authenticated, anon;
