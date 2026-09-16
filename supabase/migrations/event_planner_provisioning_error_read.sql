-- Feature 004 -- platform-admin-gated read path for the diagnostic
-- planner_provisioning_error column, mirroring get_event_planner_sync_status()'s
-- exact shape (SECURITY DEFINER, internal portal_is_global_admin() check,
-- PUBLIC/anon EXECUTE revoked). event_creation_provisioning_foundation.sql
-- already excludes planner_provisioning_error from every customer-facing
-- SELECT grant; this function is the only path back to it, for a real
-- platform admin diagnosing a failed provisioning attempt.

CREATE OR REPLACE FUNCTION public.get_event_planner_provisioning_error(p_event_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.portal_is_global_admin() THEN
    RAISE EXCEPTION 'Only platform administrators may read Planner provisioning diagnostics';
  END IF;

  RETURN (SELECT planner_provisioning_error FROM public.events WHERE id = p_event_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_event_planner_provisioning_error(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_event_planner_provisioning_error(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_event_planner_provisioning_error(uuid) TO authenticated;
