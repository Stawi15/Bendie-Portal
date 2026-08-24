-- ============================================================
-- FIX: Facilitators/Activities/Agenda/Emergency Contacts/FAQs/
-- Games/Info Center all reject every INSERT/UPDATE/DELETE with
-- "new row violates row-level security policy" -- for everyone,
-- not just admins.
--
-- Root cause: unlike event_photos/event_members/organizations/
-- events (which each have an explicit PERMISSIVE FOR ALL grant),
-- these seven tables only ever had RESTRICTIVE event-scope
-- policies plus PERMISSIVE *SELECT* policies. Restrictive
-- policies can only narrow access, never grant it -- with zero
-- permissive write policies, Postgres denies all writes by
-- default regardless of the restrictive policy's own condition.
-- The earlier fix (adding OR portal_is_global_admin() to the
-- restrictive policies) only ever affected read visibility for
-- non-member events; it could never have fixed writes, because
-- writes had no permissive grant to begin with.
--
-- Fix: add the same "Global admins can manage all X" FOR ALL
-- permissive policy already used for event_photos/event_members/
-- organizations/events/posts. This is scoped to
-- profiles.global_role = 'admin' -- it does not touch whatever
-- (if anything) the Evently-App mobile side relies on for
-- attendee/host writes, since that's a separate, non-admin
-- concern outside this portal's scope.
-- ============================================================

CREATE POLICY "Global admins can manage all facilitators"
  ON public.facilitators
  FOR ALL
  USING (public.portal_is_global_admin())
  WITH CHECK (public.portal_is_global_admin());

CREATE POLICY "Global admins can manage all activities"
  ON public.activities
  FOR ALL
  USING (public.portal_is_global_admin())
  WITH CHECK (public.portal_is_global_admin());

CREATE POLICY "Global admins can manage all agenda sessions"
  ON public.agenda_sessions
  FOR ALL
  USING (public.portal_is_global_admin())
  WITH CHECK (public.portal_is_global_admin());

CREATE POLICY "Global admins can manage all emergency contacts"
  ON public.emergency_contacts
  FOR ALL
  USING (public.portal_is_global_admin())
  WITH CHECK (public.portal_is_global_admin());

CREATE POLICY "Global admins can manage all faqs"
  ON public.faqs
  FOR ALL
  USING (public.portal_is_global_admin())
  WITH CHECK (public.portal_is_global_admin());

CREATE POLICY "Global admins can manage all games"
  ON public.games
  FOR ALL
  USING (public.portal_is_global_admin())
  WITH CHECK (public.portal_is_global_admin());

CREATE POLICY "Global admins can manage all support contacts"
  ON public.support_contacts
  FOR ALL
  USING (public.portal_is_global_admin())
  WITH CHECK (public.portal_is_global_admin());
