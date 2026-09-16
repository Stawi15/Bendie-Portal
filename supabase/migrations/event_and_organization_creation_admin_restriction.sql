-- Organization & Event Access Foundation (Feature 003) -- /speckit.analyze
-- corrections F3/F4.
--
-- Brownfield discovery found two existing INSERT policies more permissive
-- than intended, both previously harmless only because middleware blocked
-- every non-platform-admin from reaching /portal at all:
--
--   events_insert_creator allowed ANY organization member (not just
--   owner/admin) to create an event.
--
--   organizations_insert_creator allowed ANY authenticated user (no
--   organization membership at all) to create a new organization.
--
-- Feature 003 widens Portal admission to customer organization members, so
-- leaving these unchanged would silently hand both capabilities to every
-- customer -- a real privilege expansion the feature specification never
-- requested (FR-035). This migration restores each policy to its effective
-- pre-Feature-003 scope: event creation to organization owner/admin, and
-- organization creation to platform admin only. It does not touch
-- events_select_*, event_members, or any other policy.

DROP POLICY IF EXISTS "events_insert_creator" ON public.events;

CREATE POLICY "events_insert_creator"
  ON public.events
  FOR INSERT
  WITH CHECK (
    created_by = auth.uid()
    AND (
      public.is_organization_admin(organization_id)
      OR EXISTS (
        SELECT 1 FROM public.organizations o
        WHERE o.id = events.organization_id AND o.created_by = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "organizations_insert_creator" ON public.organizations;

CREATE POLICY "organizations_insert_creator"
  ON public.organizations
  FOR INSERT
  WITH CHECK (public.portal_is_global_admin());
