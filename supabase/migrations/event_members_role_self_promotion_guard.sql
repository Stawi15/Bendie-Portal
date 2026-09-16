-- Organization & Event Access Foundation (Feature 003) -- corrective pass,
-- independent post-implementation review finding F-R2.
--
-- event_members_update_self_or_host's WITH CHECK is `(user_id = auth.uid())
-- OR is_event_host_or_organizer(event_id)` -- unconditional for a caller
-- updating their own row. This was always true (pre-existing, not introduced
-- by Feature 003) but was harmless while only platform admins ever reached
-- the Members page. Feature 003 widened /portal admission to ordinary
-- organization/event members, making this a live self-role-escalation path:
-- any event member could UPDATE their own `role` to 'admin'/'host' via a
-- direct API call, bypassing the (now also-corrected) UI guard entirely.
--
-- RLS's row-level policy cannot express "this column only, unless you're a
-- manager" on its own, so this is enforced with a BEFORE UPDATE trigger,
-- layered underneath the existing RLS as defense in depth -- the standard
-- Postgres pattern for column-level write restriction. Legitimate self-service
-- updates (onboarding_status, onboarding_completed_at, etc.) are preserved;
-- only a change to `role` is gated, and only for updates the RLS policy's
-- self-clause would otherwise allow (a host/organizer/admin/platform-admin
-- changing someone else's role is untouched).

CREATE OR REPLACE FUNCTION public.enforce_event_member_role_immutability()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF NOT (public.portal_is_global_admin() OR public.is_event_host_or_organizer(OLD.event_id)) THEN
      RAISE EXCEPTION 'Only an event host/organizer/admin or a platform admin may change an event member''s role';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER event_members_role_immutability
  BEFORE UPDATE ON public.event_members
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_event_member_role_immutability();
