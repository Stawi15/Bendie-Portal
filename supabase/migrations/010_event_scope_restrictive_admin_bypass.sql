-- ============================================================
-- FIX: Global admins silently blocked from event content for
-- any event they are not personally an event_members row for,
-- despite the portal_is_global_admin() bypass policies added in
-- 006/007/008/009.
--
-- Root cause: these tables each carry a RESTRICTIVE policy
-- (event_id IS NULL) OR is_event_member(event_id) per command.
-- RESTRICTIVE policies AND against every PERMISSIVE policy for
-- the same command, so no permissive admin-bypass policy can
-- override them -- confirmed live via pg_policies.permissive.
-- This was silently breaking Facilitators, Agenda, FAQs,
-- Emergency Contacts, Games, Info Center, Activities, and
-- Gallery (posts) for any event the admin hadn't personally
-- joined.
--
-- Fix: OR portal_is_global_admin() into each restrictive
-- policy's condition. Purely additive -- only expands
-- visibility for profiles.global_role = 'admin' accounts;
-- attendee-facing behavior is unchanged.
-- ============================================================

-- ── activities ──────────────────────────────────────────
ALTER POLICY "activities_event_scope_select_restrictive" ON public.activities
  USING ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin());
ALTER POLICY "activities_event_scope_insert_restrictive" ON public.activities
  WITH CHECK ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin());
ALTER POLICY "activities_event_scope_update_restrictive" ON public.activities
  USING ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin())
  WITH CHECK ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin());
ALTER POLICY "activities_event_scope_delete_restrictive" ON public.activities
  USING ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin());

-- ── agenda_sessions ─────────────────────────────────────
ALTER POLICY "agenda_sessions_event_scope_select_restrictive" ON public.agenda_sessions
  USING ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin());
ALTER POLICY "agenda_sessions_event_scope_insert_restrictive" ON public.agenda_sessions
  WITH CHECK ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin());
ALTER POLICY "agenda_sessions_event_scope_update_restrictive" ON public.agenda_sessions
  USING ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin())
  WITH CHECK ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin());
ALTER POLICY "agenda_sessions_event_scope_delete_restrictive" ON public.agenda_sessions
  USING ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin());

-- ── emergency_contacts ──────────────────────────────────
ALTER POLICY "emergency_contacts_event_scope_select_restrictive" ON public.emergency_contacts
  USING ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin());
ALTER POLICY "emergency_contacts_event_scope_insert_restrictive" ON public.emergency_contacts
  WITH CHECK ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin());
ALTER POLICY "emergency_contacts_event_scope_update_restrictive" ON public.emergency_contacts
  USING ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin())
  WITH CHECK ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin());
ALTER POLICY "emergency_contacts_event_scope_delete_restrictive" ON public.emergency_contacts
  USING ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin());

-- ── event_photos ────────────────────────────────────────
ALTER POLICY "event_photos_event_scope_select_restrictive" ON public.event_photos
  USING ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin());
ALTER POLICY "event_photos_event_scope_insert_restrictive" ON public.event_photos
  WITH CHECK ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin());
ALTER POLICY "event_photos_event_scope_update_restrictive" ON public.event_photos
  USING ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin())
  WITH CHECK ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin());
ALTER POLICY "event_photos_event_scope_delete_restrictive" ON public.event_photos
  USING ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin());

-- ── facilitators ────────────────────────────────────────
ALTER POLICY "facilitators_event_scope_select_restrictive" ON public.facilitators
  USING ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin());
ALTER POLICY "facilitators_event_scope_insert_restrictive" ON public.facilitators
  WITH CHECK ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin());
ALTER POLICY "facilitators_event_scope_update_restrictive" ON public.facilitators
  USING ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin())
  WITH CHECK ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin());
ALTER POLICY "facilitators_event_scope_delete_restrictive" ON public.facilitators
  USING ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin());

-- ── faqs ────────────────────────────────────────────────
ALTER POLICY "faqs_event_scope_select_restrictive" ON public.faqs
  USING ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin());
ALTER POLICY "faqs_event_scope_insert_restrictive" ON public.faqs
  WITH CHECK ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin());
ALTER POLICY "faqs_event_scope_update_restrictive" ON public.faqs
  USING ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin())
  WITH CHECK ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin());
ALTER POLICY "faqs_event_scope_delete_restrictive" ON public.faqs
  USING ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin());

-- ── games ───────────────────────────────────────────────
ALTER POLICY "games_event_scope_select_restrictive" ON public.games
  USING ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin());
ALTER POLICY "games_event_scope_insert_restrictive" ON public.games
  WITH CHECK ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin());
ALTER POLICY "games_event_scope_update_restrictive" ON public.games
  USING ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin())
  WITH CHECK ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin());
ALTER POLICY "games_event_scope_delete_restrictive" ON public.games
  USING ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin());

-- ── support_contacts ────────────────────────────────────
ALTER POLICY "support_contacts_event_scope_select_restrictive" ON public.support_contacts
  USING ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin());
ALTER POLICY "support_contacts_event_scope_insert_restrictive" ON public.support_contacts
  WITH CHECK ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin());
ALTER POLICY "support_contacts_event_scope_update_restrictive" ON public.support_contacts
  USING ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin())
  WITH CHECK ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin());
ALTER POLICY "support_contacts_event_scope_delete_restrictive" ON public.support_contacts
  USING ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin());

-- ── posts (Gallery) ─────────────────────────────────────
ALTER POLICY "posts_event_scope_select_restrictive" ON public.posts
  USING ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin());
ALTER POLICY "posts_event_scope_insert_restrictive" ON public.posts
  WITH CHECK ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin());
ALTER POLICY "posts_event_scope_update_restrictive" ON public.posts
  USING ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin())
  WITH CHECK ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin());
ALTER POLICY "posts_event_scope_delete_restrictive" ON public.posts
  USING ((event_id IS NULL) OR is_event_member(event_id) OR portal_is_global_admin());

-- ── posts: also add the missing admin bypass from migration 007,
-- which was written but never applied (confirmed live: no
-- "Global admins can ..." policy exists on posts/post_likes/
-- post_comments yet).
CREATE POLICY "Global admins can view all posts"
  ON public.posts
  FOR SELECT
  USING (public.portal_is_global_admin());

CREATE POLICY "Global admins can manage all posts"
  ON public.posts
  FOR ALL
  USING (public.portal_is_global_admin())
  WITH CHECK (public.portal_is_global_admin());

CREATE POLICY "Global admins can view all post likes"
  ON public.post_likes
  FOR SELECT
  USING (public.portal_is_global_admin());

CREATE POLICY "Global admins can manage all post likes"
  ON public.post_likes
  FOR ALL
  USING (public.portal_is_global_admin())
  WITH CHECK (public.portal_is_global_admin());

CREATE POLICY "Global admins can view all post comments"
  ON public.post_comments
  FOR SELECT
  USING (public.portal_is_global_admin());

CREATE POLICY "Global admins can manage all post comments"
  ON public.post_comments
  FOR ALL
  USING (public.portal_is_global_admin())
  WITH CHECK (public.portal_is_global_admin());
