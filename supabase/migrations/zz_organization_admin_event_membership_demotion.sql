-- Client Admins Set Up Their Own Team (Feature 017) -- /code-review finding #4.
--
-- Why this migration exists:
-- zz_organization_admin_event_membership_and_role_guard.sql makes every organization owner/admin
-- an event 'admin' on every event of their organization (on event creation, on promotion, and by
-- backfill). Nothing reversed that: when Stawi demoted someone to a non-admin organization role,
-- or removed them from the organization, they stayed event 'admin' everywhere -- keeping blanket
-- management of the organization's events.
--
-- Now, when an organization_members row stops being owner/admin (role changed away from
-- owner/admin, or the row is deleted), that person's event 'admin' rows on the organization's
-- events are removed -- EXCEPT on events they created themselves (event ownership is
-- independent of organization role). Other event roles they hold (staff, speaker, ...) are left
-- untouched: only the access this automation grants is taken away.
--
-- Limitation (documented in specs/017 research): Planner-side assignments live in the separate
-- Planner project and cannot be changed from a trigger here. Their Portal access to the events'
-- Planner modules ends with the roster row; their Planner-app assignment must be disabled
-- separately.
--
-- Named so it sorts after zz_organization_admin_event_membership_and_role_guard.sql
-- (constitution v1.1.1, Principle III).

CREATE OR REPLACE FUNCTION public.remove_former_org_admin_from_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role IN ('owner', 'admin')
     AND (TG_OP = 'DELETE' OR NEW.role NOT IN ('owner', 'admin')) THEN
    DELETE FROM public.event_members em
    USING public.events e
    WHERE em.event_id = e.id
      AND e.organization_id = OLD.organization_id
      AND em.user_id = OLD.user_id
      AND em.role = 'admin'
      AND e.created_by IS DISTINCT FROM OLD.user_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_remove_former_org_admin_from_events ON public.organization_members;
CREATE TRIGGER trg_remove_former_org_admin_from_events
  AFTER UPDATE OF role OR DELETE ON public.organization_members
  FOR EACH ROW
  EXECUTE FUNCTION public.remove_former_org_admin_from_events();
