-- =====================================================================================
-- PLANNER project — run in zghoaawgrmvqdlksuiam
-- Feature 022 — REVERT of enforce_planner_organization_active.sql (analysis U2)
-- =====================================================================================
-- WHY: one-paste rollback if the organisation-active enforcement breaks Planner access.
-- Restores the exact original definitions that the enforce script saved, before patching, into
-- public.planner_access_backup_022 (functions via pg_get_functiondef, policy expressions
-- from pg_policies), then removes the two helpers and the backup table.
-- Before reverting, set every organisation active again if you want paused clients back
-- immediately (the Portal's "Planner app access paused" marker is cleared by resuming in the Portal).
-- =====================================================================================

BEGIN;

DO $revert$
DECLARE
  r record;
  v_table text;
  v_policy text;
BEGIN
  IF to_regclass('public.planner_access_backup_022') IS NULL THEN
    RAISE EXCEPTION '022 revert: backup table not found — was the enforce script ever run?';
  END IF;

  FOR r IN SELECT * FROM public.planner_access_backup_022 WHERE kind = 'function' LOOP
    EXECUTE r.definition;
  END LOOP;

  FOR r IN SELECT * FROM public.planner_access_backup_022 WHERE kind = 'policy' LOOP
    v_table := split_part(r.signature, '|', 1);
    v_policy := split_part(r.signature, '|', 2);
    IF r.using_expr IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON %s USING (%s)', v_policy, v_table, r.using_expr);
    END IF;
    IF r.check_expr IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON %s WITH CHECK (%s)', v_policy, v_table, r.check_expr);
    END IF;
  END LOOP;
END
$revert$;

-- Nothing may still reference the helpers before they are dropped.
DO $check$
DECLARE v_left int;
BEGIN
  SELECT count(*) INTO v_left
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.proname NOT IN ('is_org_active', 'is_event_org_active')
    AND position('/*022*/' IN pg_get_functiondef(p.oid)) > 0;
  IF v_left <> 0 THEN
    RAISE EXCEPTION '022 revert: % functions still carry the 022 condition', v_left;
  END IF;
END
$check$;

DROP FUNCTION IF EXISTS public.is_event_org_active(bigint);
DROP FUNCTION IF EXISTS public.is_org_active(bigint);
DROP TABLE public.planner_access_backup_022;

COMMIT;
