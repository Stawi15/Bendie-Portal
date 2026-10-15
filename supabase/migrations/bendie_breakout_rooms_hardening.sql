-- Bendie Breakout Rooms (Feature 021) -- advisor follow-up to bendie_breakout_rooms_and_assignments.sql
-- (applied 2026-10-14). Named to sort after it (constitution Principle III).
--
-- Why this migration exists (Supabase advisors, 2026-10-14):
--   * Security: the five new trigger functions were EXECUTE-able by anon/authenticated through the
--     REST RPC endpoint. Postgres refuses to run a trigger function outside a trigger, so this was
--     not exploitable, but they should not be exposed. EXECUTE is only checked when a trigger is
--     created, so revoking it does not affect the triggers.
--   * Performance: agenda_breakout_assignments_select called auth.uid() once per row; wrapped in a
--     sub-select so it is evaluated once per query.
--   * Performance: covering indexes for three foreign keys. The composite (room_id, session_id)
--     index replaces the single-column room_id index.
-- No behaviour change.

REVOKE ALL ON FUNCTION public.agenda_breakout_rooms_before_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agenda_breakout_rooms_after_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agenda_breakout_room_items_before_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agenda_breakout_room_items_after_write() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.agenda_breakout_assignments_before_write() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS agenda_breakout_assignments_select ON public.agenda_breakout_assignments;
CREATE POLICY agenda_breakout_assignments_select ON public.agenda_breakout_assignments
  FOR SELECT TO authenticated
  USING (
    user_id = (select auth.uid())
    OR public.is_event_host_or_organizer(event_id)
    OR public.is_event_org_admin(event_id)
    OR public.portal_is_global_admin()
  );

CREATE INDEX IF NOT EXISTS agenda_breakout_assignments_room_session_idx
  ON public.agenda_breakout_assignments (room_id, session_id);
DROP INDEX IF EXISTS public.agenda_breakout_assignments_room_idx;
CREATE INDEX IF NOT EXISTS agenda_breakout_assignments_assigned_by_idx
  ON public.agenda_breakout_assignments (assigned_by);
CREATE INDEX IF NOT EXISTS agenda_breakout_rooms_facilitator_idx
  ON public.agenda_breakout_rooms (facilitator_id);
