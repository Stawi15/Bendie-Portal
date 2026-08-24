-- ============================================================
-- FIX: Can't create events, and draft events can vanish from
-- view for global admins.
--
-- Root cause 1 (separate client-side bug, fixed in
-- CreateEventModal.tsx): the insert never set created_by, and
-- events_insert_creator's WITH CHECK requires
-- created_by = auth.uid() -- NULL never satisfies that, so event
-- creation failed for everyone, not just admins.
--
-- Root cause 2 (this migration): events has no
-- portal_is_global_admin() bypass at all. Even with created_by
-- fixed, events_insert_creator also requires
-- is_organization_member(organization_id) OR the org's own
-- creator -- blocking a global admin creating/editing events in
-- an org they aren't personally a member of. SELECT has a public
-- showcase fallback for published/active events, but draft events
-- (the default for new ones) are only visible via
-- is_event_member(id) OR created_by = auth.uid(), so a global
-- admin's own freshly created draft event could still disappear
-- from their list depending on membership state.
--
-- Same additive pattern as 006/008/009/010: OR in
-- portal_is_global_admin(), only affects admin accounts.
-- ============================================================

CREATE POLICY "Global admins can view all events"
  ON public.events
  FOR SELECT
  USING (public.portal_is_global_admin());

CREATE POLICY "Global admins can manage all events"
  ON public.events
  FOR ALL
  USING (public.portal_is_global_admin())
  WITH CHECK (public.portal_is_global_admin());
