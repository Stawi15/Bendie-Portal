-- ============================================================
-- FIX: People page shows correct member counts for organisations
-- the admin personally belongs to, but 0 for others (e.g. Old
-- Mutual) — same class of issue as 006/007/008.
--
-- Root cause: the People page (useOrgPeople) queries
-- organization_members directly, filtered by organization_id.
-- That table's existing RLS policy only lets a user see their own
-- membership row(s), with no allowance for global admins to see
-- everyone else's. A global admin who isn't personally a member of
-- a given organisation (e.g. was only defaulted into Old Mutual via
-- the old "fallback to oldest org" logic, without ever getting an
-- organization_members row there) sees zero members for it, while
-- organisations they do hold a personal membership row in show up
-- fine.
--
-- Adds the same portal_is_global_admin() bypass used for
-- event_members/event_photos/posts/organizations.
-- ============================================================

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Global admins can view all organization members"
  ON public.organization_members
  FOR SELECT
  USING (public.portal_is_global_admin());

CREATE POLICY "Global admins can manage all organization members"
  ON public.organization_members
  FOR ALL
  USING (public.portal_is_global_admin())
  WITH CHECK (public.portal_is_global_admin());
