-- Client Admins Set Up Their Own Team (Feature 017) -- creator-role fix found in client testing
-- (2026-10-09: Ann, an Xperia organization admin, created a Planner event and ended up as an
-- 'attendee' on it, so she got no Planner access).
--
-- Why this migration exists:
-- enforce_event_member_self_insert_role (BEFORE INSERT on event_members; it existed only in the
-- live database, never in a committed migration -- this file is now its version-controlled copy)
-- forces role 'attendee' whenever someone inserts THEMSELVES and is not already a host/organizer/
-- admin of the event or a platform admin. create_event_with_products inserts the creator exactly
-- that way (auth.uid() is still the caller inside the SECURITY DEFINER RPC), so every non-platform
-- organization owner/admin who created an event became an attendee on their own event.
-- zz_organization_admin_event_membership_and_role_guard.sql deliberately excludes the creator from
-- its auto-add, so nothing corrected it.
--
-- Fix: owners/admins of the event's own organization are also exempt -- they are allowed to manage
-- every event of their organization anyway (Feature 017, FR-021). Ordinary self-joins (e.g. an
-- attendee joining with an access code) are still forced to 'attendee' as before.
--
-- One-time repair: creators who are owners/admins of the event's organization and hold a role
-- other than host/organizer/admin on their own event are raised to 'admin' (2026-10-09: one row,
-- Ann on "Mastercard Foundation- Scholars Program", already corrected by hand -- so this is
-- expected to change 0 rows; kept for reproducibility).
--
-- Named to sort after the other zz_organization_admin_event_membership_* files
-- (constitution v1.1.1, Principle III).

CREATE OR REPLACE FUNCTION public.enforce_event_member_self_insert_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  if current_setting('role', true) = 'service_role' then
    return new;
  end if;
  if new.user_id = auth.uid()
     and not public.is_event_host_or_organizer(new.event_id, auth.uid())
     and not public.portal_is_global_admin()
     and not public.is_organization_admin(new.organization_id, auth.uid()) then
    new.role := 'attendee';
  end if;
  return new;
end;
$$;

-- One-time repair, run as service_role so the event_members role guard's documented
-- service-role exemption applies.
SET LOCAL ROLE service_role;

UPDATE public.event_members em
SET role = 'admin'
FROM public.events e
JOIN public.organization_members om
  ON om.organization_id = e.organization_id
 AND om.user_id = e.created_by
 AND om.role IN ('owner', 'admin')
WHERE em.event_id = e.id
  AND em.user_id = e.created_by
  AND em.role NOT IN ('host', 'organizer', 'admin');

RESET ROLE;
