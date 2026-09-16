-- Organization & Event Access Foundation (Feature 003).
-- Lets an organization owner/admin see event METADATA (name, status, dates,
-- organization ownership, event_products) for every event in their own
-- organization, without granting event workspace/content access -- that
-- remains gated by event_members's own unchanged RLS and by an explicit
-- application-level check (src/lib/eventAuth.ts::requireEventWorkspaceAccess).
-- This is additive: it does not replace or modify events_select_member,
-- events_select_public_showcase, or any event_members/content-table policy.

CREATE POLICY "events_select_org_admin"
  ON public.events
  FOR SELECT
  USING (public.is_organization_admin(organization_id));
