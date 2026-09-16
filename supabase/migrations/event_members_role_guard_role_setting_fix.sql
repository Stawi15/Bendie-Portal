-- Organization & Event Access Foundation (Feature 003) -- corrective pass,
-- third and final attempt at the service-role exemption. Debug probing
-- established that PostgREST connects every request (anon/authenticated/
-- service_role alike) as the Postgres role `authenticator`, then sets the
-- effective role per-request via the `role` GUC (SET LOCAL ROLE) -- NOT via
-- current_user (which SECURITY DEFINER overrides to the function owner) and
-- NOT via session_user (which is always `authenticator` under this
-- connection-pooling setup, never the per-request role). The GUC
-- `current_setting('role', true)` is the one signal that reliably reflects
-- the actual caller across all three cases; confirmed live via a debug probe
-- function (removed by this same migration) before landing this version.

CREATE OR REPLACE FUNCTION public.enforce_event_member_role_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF current_setting('role', true) = 'service_role' THEN
      RETURN NEW;
    END IF;
    IF NOT (public.portal_is_global_admin() OR public.is_event_host_or_organizer(OLD.event_id)) THEN
      RAISE EXCEPTION 'Only an event host/organizer/admin or a platform admin may change an event member''s role';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP FUNCTION IF EXISTS public.debug_jwt_probe();
