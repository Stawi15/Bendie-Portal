-- Corrective migration (found during code review after T033).
-- data-model.md documented event_members.planner_sync_status as
-- constrained to succeeded/failed/skipped, but the original migration
-- never actually enforced it at the database layer -- the column was left
-- as plain text with nothing preventing an arbitrary string being stored
-- by some future write path. Live-checked before applying: all 346
-- existing rows are NULL (no test/real data would violate this), so the
-- constraint is safe to add now.

ALTER TABLE public.event_members
  ADD CONSTRAINT event_members_planner_sync_status_check
  CHECK (planner_sync_status IS NULL OR planner_sync_status IN ('succeeded', 'failed', 'skipped'));
