-- Organization & Event Access Foundation (Feature 003) -- corrective pass
-- follow-up. The event_members_role_immutability trigger added in
-- event_members_role_self_promotion_guard.sql checks portal_is_global_admin()
-- and is_event_host_or_organizer(), both of which resolve via auth.uid() --
-- which is NULL for a service-role connection (no end-user JWT). Triggers
-- fire regardless of a Postgres role's BYPASSRLS attribute (unlike RLS
-- policies, which service_role already bypasses entirely), so without this
-- exemption the trigger incorrectly blocks legitimate service-role writes to
-- event_members.role from trusted server-side code (app/api/admin/** routes,
-- and any future one that legitimately needs to set a role programmatically).
--
-- Confirmed live during corrective-pass verification: a service-role write
-- was blocked by the un-exempted trigger, and a debug probe confirmed the
-- reliable signal is the Postgres session role itself -- PostgREST connects
-- service-role requests as the literal `service_role` Postgres role
-- (current_user = 'service_role'), unlike request.jwt.claim.role, which is
-- not set as a GUC in this project's PostgREST configuration.

CREATE OR REPLACE FUNCTION public.enforce_event_member_role_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF current_user = 'service_role' THEN
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
