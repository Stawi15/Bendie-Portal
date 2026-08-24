-- ============================================================
-- Same fix as 012, for the remaining tables found by a full
-- sweep of every portal-managed table for missing permissive
-- write policies: activity_images, emergency_images,
-- event_interest_options (Networking), game_questions.
-- ============================================================

CREATE POLICY "Global admins can manage all activity images"
  ON public.activity_images
  FOR ALL
  USING (public.portal_is_global_admin())
  WITH CHECK (public.portal_is_global_admin());

CREATE POLICY "Global admins can manage all emergency images"
  ON public.emergency_images
  FOR ALL
  USING (public.portal_is_global_admin())
  WITH CHECK (public.portal_is_global_admin());

CREATE POLICY "Global admins can manage all event interest options"
  ON public.event_interest_options
  FOR ALL
  USING (public.portal_is_global_admin())
  WITH CHECK (public.portal_is_global_admin());

CREATE POLICY "Global admins can manage all game questions"
  ON public.game_questions
  FOR ALL
  USING (public.portal_is_global_admin())
  WITH CHECK (public.portal_is_global_admin());
