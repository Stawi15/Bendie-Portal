-- ============================================================
-- FIX: Organisation switcher only ever shows one organisation
-- (the admin's own membership row), regardless of the client
-- asking for all organisations.
--
-- Root cause: same class of issue as 006/007. `organizations` has
-- a membership-scoped SELECT policy (visible only via
-- organization_members), so a global admin who is only personally
-- a member of one organisation gets exactly that one back — RLS
-- filters silently, no error, matching what was reported ("only
-- showing Old Mutual organisation data").
--
-- This adds the same portal_is_global_admin() bypass used for
-- event_members/event_photos/posts, additive alongside the
-- existing membership-scoped policy.
-- ============================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Global admins can view all organizations"
  ON public.organizations
  FOR SELECT
  USING (public.portal_is_global_admin());

CREATE POLICY "Global admins can manage all organizations"
  ON public.organizations
  FOR ALL
  USING (public.portal_is_global_admin())
  WITH CHECK (public.portal_is_global_admin());
