-- Organization & Event Access Foundation (Feature 003) -- third corrective
-- pass, R3-F3.
--
-- The event_members role-immutability trigger function went through four
-- migrations, applied to the live database in this true chronological
-- order: event_members_role_self_promotion_guard.sql (original, no
-- service-role exemption) -> event_members_role_guard_service_role_exemption_fix.sql
-- (wrong: current_user, overridden by SECURITY DEFINER) ->
-- event_members_role_guard_session_user_fix.sql (wrong: session_user, always
-- `authenticator` under this project's PostgREST connection pooling) ->
-- event_members_role_guard_role_setting_fix.sql (correct:
-- current_setting('role', true)). Each CREATE OR REPLACE FUNCTION call was
-- applied in that order against the live database, so the live database has
-- always held the correct final body since that fourth migration.
--
-- However, those four filenames sort ALPHABETICALLY in the opposite order to
-- how they were authored and live-applied: the three "..._guard_..._fix.sql"
-- files all sort BEFORE "event_members_role_self_promotion_guard.sql"
-- ('guard' < 'self'). A fresh database built by replaying committed
-- migration files in filename order would apply the three fixes first and
-- then overwrite them with the ORIGINAL, broken (no service-role exemption)
-- function body last -- reproducing exactly the bug those three migrations
-- existed to fix, with no error to signal it.
--
-- Per this repository's migration-immutability rule, none of those four
-- files may be edited, renamed, or reordered. This migration is deliberately
-- named to sort alphabetically AFTER all four of them (and after every other
-- existing migration filename in this repository), so that on a fresh
-- database built by naive filename-order replay, THIS file's
-- CREATE OR REPLACE FUNCTION runs last and is therefore authoritative
-- regardless of what the misordered predecessors left behind. Verified
-- against the confirmed-correct live definition before writing this file.

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

-- The trigger itself (CREATE TRIGGER, not CREATE OR REPLACE) is only ever
-- created once by event_members_role_self_promotion_guard.sql and always
-- points at the function by name, so it automatically picks up whichever
-- CREATE OR REPLACE of enforce_event_member_role_immutability() applied
-- last -- no separate trigger re-creation is needed here.
