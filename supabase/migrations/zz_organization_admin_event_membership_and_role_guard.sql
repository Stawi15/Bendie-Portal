-- Client Admins Set Up Their Own Team (Feature 017) -- spec FR-021..FR-025,
-- research R7..R9.
--
-- Why this migration exists:
--
-- 1. Organization role protection (FR-024/FR-025). organization_members_insert_self
--    let any organization owner/admin insert a row for ANY user with ANY role,
--    and organization_members_update_owner_admin let them set any role -- so a
--    client admin could mint more owners/admins. Only Stawi (platform admins,
--    via the unchanged "Global admins can manage all organization members"
--    policy, or the service role) may create, promote to, demote from or edit
--    owner/admin memberships. Client owners/admins keep managing non-admin roles.
--    The old policy's org-creator self-bootstrap clause is dropped: organizations
--    INSERT is platform-admin-only, which the platform-admin ALL policy covers.
--
-- 2. Organization admins on every organization event (FR-021..FR-023). Event
--    workspace access and 123 event-gated RLS policies key off event_members
--    (Feature 003 deliberately does not let org role alone grant event access).
--    Rather than rewrite those, every organization owner/admin is kept on every
--    event of their organization with event role 'admin':
--      - when an event is created (trigger on events),
--      - when someone becomes an organization owner/admin (trigger on
--        organization_members), raising lower event roles to 'admin',
--      - once now for all existing data (backfill).
--    Planner access is NOT switched on by any of this.
--
-- Named zz_ so a fresh filename-order replay applies it after the files that
-- created the replaced policies (constitution v1.1.1, Principle III).

-- ---------------------------------------------------------------------------
-- 1. organization_members policies
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "organization_members_insert_self" ON public.organization_members;

CREATE POLICY "organization_members_insert_org_admin"
  ON public.organization_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_organization_admin(organization_id)
    AND role NOT IN ('owner', 'admin')
  );

DROP POLICY IF EXISTS "organization_members_update_owner_admin" ON public.organization_members;

-- USING blocks touching an existing owner/admin row (no demotion or edit);
-- WITH CHECK blocks producing one (no promotion).
CREATE POLICY "organization_members_update_org_admin"
  ON public.organization_members
  FOR UPDATE
  TO authenticated
  USING (
    public.is_organization_admin(organization_id)
    AND role NOT IN ('owner', 'admin')
  )
  WITH CHECK (
    public.is_organization_admin(organization_id)
    AND role NOT IN ('owner', 'admin')
  );

-- ---------------------------------------------------------------------------
-- 2. New event -> every org owner/admin becomes an event admin
-- ---------------------------------------------------------------------------

-- The creator is excluded: create_event_with_products inserts the creator as
-- 'admin' itself AFTER the events insert and re-raises any unique violation
-- other than its idempotency key, so pre-inserting the creator here would
-- make event creation fail. IS DISTINCT FROM (not <>) so a NULL created_by
-- still adds every admin instead of silently matching nothing.
CREATE OR REPLACE FUNCTION public.add_org_admins_to_new_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.event_members (event_id, user_id, organization_id, role)
  SELECT NEW.id, om.user_id, NEW.organization_id, 'admin'
  FROM public.organization_members om
  WHERE om.organization_id = NEW.organization_id
    AND om.role IN ('owner', 'admin')
    AND om.user_id IS DISTINCT FROM NEW.created_by
  ON CONFLICT (event_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_add_org_admins_to_new_event ON public.events;
CREATE TRIGGER trg_add_org_admins_to_new_event
  AFTER INSERT ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.add_org_admins_to_new_event();

-- ---------------------------------------------------------------------------
-- 3. New org owner/admin -> event admin on every event of that organization
-- ---------------------------------------------------------------------------

-- After section 1 only platform admins or the service role can make someone
-- an owner/admin, and both pass enforce_event_member_role_immutability, so
-- raising an existing lower event role to 'admin' is allowed here.
CREATE OR REPLACE FUNCTION public.add_new_org_admin_to_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IN ('owner', 'admin')
     AND (TG_OP = 'INSERT' OR OLD.role NOT IN ('owner', 'admin')) THEN
    INSERT INTO public.event_members (event_id, user_id, organization_id, role)
    SELECT e.id, NEW.user_id, e.organization_id, 'admin'
    FROM public.events e
    WHERE e.organization_id = NEW.organization_id
    ON CONFLICT (event_id, user_id) DO UPDATE
      SET role = 'admin'
      WHERE public.event_members.role NOT IN ('host', 'organizer', 'admin');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_add_new_org_admin_to_events ON public.organization_members;
CREATE TRIGGER trg_add_new_org_admin_to_events
  AFTER INSERT OR UPDATE OF role ON public.organization_members
  FOR EACH ROW
  EXECUTE FUNCTION public.add_new_org_admin_to_events();

-- ---------------------------------------------------------------------------
-- 4. One-time backfill
-- ---------------------------------------------------------------------------

-- Run as service_role so enforce_event_member_role_immutability's documented
-- service-role exemption applies to the role raises. Measured 2026-10-09:
-- 24 rows added (Bendie Planner Sample 21, Xperia Agency 3), 1 raised
-- (Xperia Agency), World Bank Group already complete.
SET LOCAL ROLE service_role;

INSERT INTO public.event_members (event_id, user_id, organization_id, role)
SELECT e.id, om.user_id, e.organization_id, 'admin'
FROM public.organization_members om
JOIN public.events e ON e.organization_id = om.organization_id
WHERE om.role IN ('owner', 'admin')
ON CONFLICT (event_id, user_id) DO UPDATE
  SET role = 'admin'
  WHERE public.event_members.role NOT IN ('host', 'organizer', 'admin');

RESET ROLE;
