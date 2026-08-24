-- ============================================================
-- FIX: Gallery page now reads attendee photo posts from `posts`
-- (the real source of attendee-uploaded event photos) instead of
-- the unused `event_photos` table. `posts`/`post_likes` were never
-- in portal scope before, so global admins have no RLS visibility
-- into them for events they aren't personally a member of — same
-- class of issue fixed for event_members/event_photos in
-- 006_global_admin_rls_bypass.sql. Reuses portal_is_global_admin().
-- ============================================================

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

-- ── posts (Gallery) ──────────────────────────────────────────
CREATE POLICY "Global admins can view all posts"
  ON public.posts
  FOR SELECT
  USING (public.portal_is_global_admin());

CREATE POLICY "Global admins can manage all posts"
  ON public.posts
  FOR ALL
  USING (public.portal_is_global_admin())
  WITH CHECK (public.portal_is_global_admin());

-- ── post_likes (like counts + cascading delete on moderation) ──
CREATE POLICY "Global admins can view all post likes"
  ON public.post_likes
  FOR SELECT
  USING (public.portal_is_global_admin());

CREATE POLICY "Global admins can manage all post likes"
  ON public.post_likes
  FOR ALL
  USING (public.portal_is_global_admin())
  WITH CHECK (public.portal_is_global_admin());

-- ── post_comments (cascading delete on moderation) ──────────────
CREATE POLICY "Global admins can view all post comments"
  ON public.post_comments
  FOR SELECT
  USING (public.portal_is_global_admin());

CREATE POLICY "Global admins can manage all post comments"
  ON public.post_comments
  FOR ALL
  USING (public.portal_is_global_admin())
  WITH CHECK (public.portal_is_global_admin());
