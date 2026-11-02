-- =====================================================================================
-- PLANNER project — run in zghoaawgrmvqdlksuiam (NOT the Bendie project droaamagpsojkzznywgd)
-- Feature 022 — Organisation products management, research R2 (Option A)
-- =====================================================================================
-- WHY: Planner's organizations.is_active switch exists but no access check reads it, so the
-- Portal's "Also pause Planner app access" would do nothing. This makes every non-platform-admin
-- access path also require the event's Planner organisation to be active. Pausing/resuming
-- Planner app access is then one switch (organizations.is_active) with nothing to restore.
--
-- BEFORE: org admins and assigned staff reach an organisation's events whatever is_active says.
-- AFTER:  when organizations.is_active = false, that organisation's admins and every person
--         assigned to its events (including Stawi staff) lose access; Planner platform admins
--         (is_platform_admin()) are untouched. Active organisations behave exactly as before.
--
-- HOW: the live definitions are backed up into public.planner_access_backup_022 first, then each
-- object is re-created from its live definition with ONLY one added condition, inserted at an
-- anchor that must occur exactly once (checked read-only on 2026-10-16; the script stops and
-- rolls back if an anchor has changed). Re-running is safe: patched objects carry /*022*/ and
-- are skipped; the backup keeps the first (original) definition.
-- REVERT: revert_enforce_planner_organization_active.sql (restores the backed-up originals).
--
-- Gated:
--   helpers  is_org_admin (→ is_admin_for_org, is_org_admin_for_event, is_admin_for_event,
--            can_view_event), is_assigned_to_event, is_event_admin, has_event_module
--            (→ can_manage_event_tasks, can_edit_production_event), can_view/manage_event_checklist,
--            can_view/manage_event_vendors, can_manage_operational_task, can_view_operational_task
--   policies events_select_assigned_or_admin, event_notifications_insert_admin_or_task_managers,
--            event_notifications_update_read_state
--   RPCs     reads return nothing: get_event_notifications, mark_event_notifications_as_read,
--            get_event_task_assignable_profiles, get_home_dashboard_summary;
--            writes raise "This organisation's Planner access is paused.": create_operational_task_v2,
--            set_operational_task_part_status, update_my_task (both versions);
--            fan-out skips paused events: notify_event_audience, notify_task_audience,
--            get_push_delivery_targets
-- Not changed: is_platform_admin / is_super_admin, can_see_profile (profile visibility only),
--            expire_ended_assignments / sync_org_member_access (maintenance, not access).
--
-- Storage (analysis U3), checked 2026-10-16 — all event-scoped buckets are gated through helpers:
--   EventBlueprint  write: is_admin_for_event → gated; read: can_view_event → gated
--   SessionSlides   read/upload/delete: has_event_module('manage_production') → gated;
--                   "readable by event members": production_tasks subquery, whose RLS is
--                   has_event_module('production') → gated
--   avatars         not event-scoped (own folder / public read) → unchanged
-- =====================================================================================

BEGIN;

-- 1. Backup of the original definitions (service role only) --------------------------------
CREATE TABLE IF NOT EXISTS public.planner_access_backup_022 (
  kind text NOT NULL CHECK (kind IN ('function', 'policy')),
  signature text NOT NULL,          -- regprocedure text, or "schema.table|policy"
  definition text,                  -- pg_get_functiondef for functions
  using_expr text,                  -- policies
  check_expr text,                  -- policies
  saved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, signature)
);
ALTER TABLE public.planner_access_backup_022 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.planner_access_backup_022 FROM anon, authenticated;

-- 2. The switch helpers ----------------------------------------------------------------------
-- Unknown ids count as active: a missing organisation can't own events (fail-open only there).
CREATE OR REPLACE FUNCTION public.is_org_active(p_org_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce((SELECT o.is_active FROM public.organizations o WHERE o.organization_id = p_org_id), true);
$$;

CREATE OR REPLACE FUNCTION public.is_event_org_active(p_event_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce((
    SELECT o.is_active
    FROM public.events e
    JOIN public.organizations o ON o.organization_id = e.organization_id
    WHERE e.event_id = p_event_id
  ), true);
$$;

REVOKE ALL ON FUNCTION public.is_org_active(bigint) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_event_org_active(bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_org_active(bigint) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_event_org_active(bigint) TO authenticated, service_role;

-- 3. Patch helper (session-only) -------------------------------------------------------------
-- mode 'after' / 'before': plain text anchor, must occur exactly once.
-- mode 'guard': insert right after the body's (only) BEGIN of a plpgsql function.
CREATE OR REPLACE FUNCTION pg_temp.patch_022(p_sig text, p_mode text, p_anchor text, p_insert text)
RETURNS void
LANGUAGE plpgsql
AS $patch$
DECLARE
  v_def text := pg_get_functiondef(p_sig::regprocedure);
  v_new text;
  v_count int;
BEGIN
  IF position('/*022*/' IN v_def) > 0 THEN
    RAISE NOTICE '022: % already patched, skipped', p_sig;
    RETURN;
  END IF;

  INSERT INTO public.planner_access_backup_022 (kind, signature, definition)
  VALUES ('function', p_sig, v_def)
  ON CONFLICT (kind, signature) DO NOTHING;

  IF p_mode = 'guard' THEN
    SELECT count(*) INTO v_count FROM regexp_matches(v_def, '\mBEGIN\M', 'g');
    IF v_count <> 1 OR position('BEGIN' IN v_def) < position('$function$' IN v_def) THEN
      RAISE EXCEPTION '022: % — expected exactly one BEGIN in the body, found %', p_sig, v_count;
    END IF;
    v_new := regexp_replace(v_def, '\mBEGIN\M', 'BEGIN ' || p_insert || ' /*022*/');
  ELSE
    v_count := (length(v_def) - length(replace(v_def, p_anchor, ''))) / length(p_anchor);
    IF v_count <> 1 THEN
      RAISE EXCEPTION '022: % — anchor "%" found % times (expected 1); definition changed since 2026-10-16', p_sig, p_anchor, v_count;
    END IF;
    v_new := replace(v_def, p_anchor,
      CASE p_mode WHEN 'after' THEN p_anchor || ' ' || p_insert || ' /*022*/'
                  ELSE p_insert || ' /*022*/ ' || p_anchor END);
  END IF;

  EXECUTE v_new;
END;
$patch$;

-- 4. Access helpers --------------------------------------------------------------------------
SELECT pg_temp.patch_022('public.is_org_admin(bigint)', 'after', 'AND p.is_org_admin = true',
  'AND public.is_org_active(target_org_id)');
SELECT pg_temp.patch_022('public.is_assigned_to_event(bigint)', 'after', 'AND eua.is_active = true',
  'AND public.is_event_org_active(target_event_id)');
SELECT pg_temp.patch_022('public.is_event_admin(bigint)', 'after', '= ''admin''',
  'AND public.is_event_org_active(p_event_id)');
SELECT pg_temp.patch_022('public.has_event_module(bigint,text)', 'after', 'AND eua.is_active = true',
  'AND public.is_event_org_active(p_event_id)');
SELECT pg_temp.patch_022('public.can_view_event_checklist(bigint)', 'after', 'AND eua.is_active = true',
  'AND public.is_event_org_active(target_event_id)');
SELECT pg_temp.patch_022('public.can_manage_event_checklist(bigint)', 'after', 'AND eua.is_active = true',
  'AND public.is_event_org_active(target_event_id)');
SELECT pg_temp.patch_022('public.can_view_event_vendors(bigint)', 'after', 'AND eua.is_active = true',
  'AND public.is_event_org_active(target_event_id)');
SELECT pg_temp.patch_022('public.can_manage_event_vendors(bigint)', 'after', 'AND eua.is_active = true',
  'AND public.is_event_org_active(target_event_id)');
SELECT pg_temp.patch_022('public.can_manage_operational_task(integer)', 'after', 'AND eua.is_active = true',
  'AND public.is_event_org_active(ot.event_id::bigint)');
SELECT pg_temp.patch_022('public.can_view_operational_task(integer)', 'after', 'AND a.profile_id = auth.uid()',
  'AND public.is_event_org_active(ot.event_id::bigint)');

-- 5. RPCs ------------------------------------------------------------------------------------
-- Reads: return nothing for a paused organisation (platform admins unaffected).
SELECT pg_temp.patch_022('public.get_event_notifications(bigint,integer)', 'guard', NULL,
  'IF NOT public.is_platform_admin() AND NOT public.is_event_org_active(p_event_id) THEN RETURN; END IF;');
SELECT pg_temp.patch_022('public.mark_event_notifications_as_read(bigint)', 'guard', NULL,
  'IF NOT public.is_platform_admin() AND NOT public.is_event_org_active(p_event_id) THEN RETURN 0; END IF;');
SELECT pg_temp.patch_022('public.get_event_task_assignable_profiles(integer)', 'guard', NULL,
  'IF NOT public.is_platform_admin() AND NOT public.is_event_org_active(p_event_id::bigint) THEN RETURN; END IF;');
SELECT pg_temp.patch_022('public.get_home_dashboard_summary(bigint)', 'guard', NULL,
  'IF NOT public.is_platform_admin() AND NOT public.is_event_org_active(p_event_id) THEN RETURN; END IF;');

-- Writes: refuse with a clear message.
SELECT pg_temp.patch_022('public.create_operational_task_v2(integer,text,text,uuid,boolean,text,date,text,uuid,uuid[])', 'guard', NULL,
  'IF NOT public.is_platform_admin() AND NOT public.is_event_org_active(p_event_id::bigint) THEN RAISE EXCEPTION ''This organisation''''s Planner access is paused.''; END IF;');
SELECT pg_temp.patch_022('public.set_operational_task_part_status(integer,uuid,text)', 'guard', NULL,
  'IF NOT public.is_platform_admin() AND NOT public.is_event_org_active((SELECT ot.event_id FROM public.operational_tasks ot WHERE ot.task_id = p_task_id)::bigint) THEN RAISE EXCEPTION ''This organisation''''s Planner access is paused.''; END IF;');
SELECT pg_temp.patch_022('public.update_my_task(text,text,text,uuid,text,date,text)', 'guard', NULL,
  'IF NOT public.is_platform_admin() AND NOT public.is_event_org_active((SELECT ot.event_id FROM public.operational_tasks ot WHERE ot.task_code = p_task_code LIMIT 1)::bigint) THEN RAISE EXCEPTION ''This organisation''''s Planner access is paused.''; END IF;');
SELECT pg_temp.patch_022('public.update_my_task(text,text,text,text,date,text)', 'guard', NULL,
  'IF NOT public.is_platform_admin() AND NOT public.is_event_org_active((SELECT ot.event_id FROM public.operational_tasks ot WHERE ot.task_code = p_task_code LIMIT 1)::bigint) THEN RAISE EXCEPTION ''This organisation''''s Planner access is paused.''; END IF;');

-- Fan-out: no notifications or pushes for a paused organisation's events.
SELECT pg_temp.patch_022('public.notify_event_audience(bigint,text,uuid,text,text,text,text,text,text,jsonb,uuid)', 'guard', NULL,
  'IF NOT public.is_event_org_active(p_event_id) THEN RETURN 0; END IF;');
SELECT pg_temp.patch_022('public.notify_task_audience(integer,text,uuid,text,text,text,jsonb,uuid)', 'guard', NULL,
  'IF NOT public.is_event_org_active((SELECT ot.event_id FROM public.operational_tasks ot WHERE ot.task_id = p_task_id)::bigint) THEN RETURN 0; END IF;');
SELECT pg_temp.patch_022('public.get_push_delivery_targets(bigint)', 'before', 'AND NOT public.is_in_mute_hours(',
  'AND public.is_event_org_active(r.event_id)');

-- 6. Policies (only the assignment check gains the condition) --------------------------------
INSERT INTO public.planner_access_backup_022 (kind, signature, using_expr, check_expr)
SELECT 'policy', schemaname || '.' || tablename || '|' || policyname, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname IN ('events_select_assigned_or_admin', 'event_notifications_insert_admin_or_task_managers', 'event_notifications_update_read_state')
ON CONFLICT (kind, signature) DO NOTHING;

ALTER POLICY events_select_assigned_or_admin ON public.events
  USING (is_platform_admin() OR (EXISTS (
    SELECT 1 FROM event_user_assignments eua
    WHERE eua.event_id = events.event_id AND eua.profile_id = auth.uid() AND eua.is_active = true
      AND public.is_event_org_active(events.event_id::bigint))));

ALTER POLICY event_notifications_insert_admin_or_task_managers ON public.event_notifications
  WITH CHECK (is_admin_for_event(event_id) OR (EXISTS (
    SELECT 1 FROM event_user_assignments eua
    WHERE eua.event_id = event_notifications.event_id AND eua.profile_id = auth.uid() AND eua.is_active = true
      AND (eua.can_manage_tasks = true OR eua.can_view_notifications = true)
      AND public.is_event_org_active(event_notifications.event_id))));

ALTER POLICY event_notifications_update_read_state ON public.event_notifications
  USING (((recipient_profile_id = auth.uid()) OR (recipient_profile_id IS NULL)) AND (EXISTS (
    SELECT 1 FROM event_user_assignments eua
    WHERE eua.event_id = event_notifications.event_id AND eua.profile_id = auth.uid() AND eua.is_active = true
      AND public.is_event_org_active(event_notifications.event_id))));

-- 7. Check: 21 functions + 3 policies backed up, every function patched -----------------------
DO $check$
DECLARE v_functions int; v_policies int; v_unpatched int;
BEGIN
  SELECT count(*) FILTER (WHERE kind = 'function'), count(*) FILTER (WHERE kind = 'policy')
    INTO v_functions, v_policies FROM public.planner_access_backup_022;
  SELECT count(*) INTO v_unpatched FROM public.planner_access_backup_022
   WHERE kind = 'function' AND position('/*022*/' IN pg_get_functiondef(signature::regprocedure)) = 0;
  IF v_functions <> 21 OR v_policies <> 3 OR v_unpatched <> 0 THEN
    RAISE EXCEPTION '022 check failed: % functions, % policies backed up, % unpatched', v_functions, v_policies, v_unpatched;
  END IF;
END
$check$;

COMMIT;

-- Afterwards (read-only): every organisation should still be active unless paused on purpose.
-- SELECT organization_id, name, is_active FROM public.organizations ORDER BY organization_id;
