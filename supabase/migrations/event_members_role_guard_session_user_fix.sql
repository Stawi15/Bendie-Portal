-- Organization & Event Access Foundation (Feature 003) -- corrective pass,
-- second follow-up. The previous fix checked `current_user = 'service_role'`,
-- but this trigger function is SECURITY DEFINER -- inside a SECURITY DEFINER
-- function, current_user reflects the FUNCTION OWNER for the duration of the
-- call, not the actual connecting role, so that check was never true for any
-- caller (confirmed live: a service-role write was still blocked after the
-- first exemption attempt). `session_user` is the one that does not change
-- under SECURITY DEFINER -- it reflects who actually opened the connection
-- (service_role vs authenticated), which is what this check needs.

CREATE OR REPLACE FUNCTION public.enforce_event_member_role_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF session_user = 'service_role' THEN
      RETURN NEW;
    END IF;
    IF NOT (public.portal_is_global_admin() OR public.is_event_host_or_organizer(OLD.event_id)) THEN
      RAISE EXCEPTION 'Only an event host/organizer/admin or a platform admin may change an event member''s role';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
