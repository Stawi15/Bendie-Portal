-- ============================================================
-- FIX: Global admins can't see Gallery or Members for events
-- they aren't personally added to in event_members
--
-- Root cause: ARCHITECTURE.md §2.3 says global admins should see
-- ALL events with "no event_members scoping", but the RLS policies
-- on event_photos (005_add_event_photos_and_audit_log.sql) and
-- event_members only grant access via event_members membership.
-- A global admin who never joined a given event as a member gets
-- zero rows back (RLS filters silently, no error) — the gallery
-- and members pages just render empty.
--
-- This migration adds a helper function + additive policies that
-- let profiles.global_role = 'admin' bypass the per-event
-- membership check, without touching existing policies (Postgres
-- OR's multiple permissive policies together).
-- ============================================================

-- Cleanup: an earlier version of this migration created a zero-arg
-- `public.is_global_admin()` overload that collided with a pre-existing
-- function of the same name elsewhere in this schema (different
-- signature, e.g. takes a uuid param), making calls to the bare name
-- ambiguous. Drop that specific zero-arg overload if it exists before
-- (re)creating our own uniquely-named function below.
DROP FUNCTION IF EXISTS public.is_global_admin();

-- Named to avoid any collision with existing helper functions in this
-- shared schema. SECURITY DEFINER so it can read profiles regardless
-- of the caller's own RLS visibility, and to avoid recursive RLS issues.
CREATE OR REPLACE FUNCTION public.portal_is_global_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND global_role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.portal_is_global_admin() TO authenticated;

-- ── event_members ────────────────────────────────────────────
ALTER TABLE public.event_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Global admins can view all event members"
  ON public.event_members
  FOR SELECT
  USING (public.portal_is_global_admin());

CREATE POLICY "Global admins can manage all event members"
  ON public.event_members
  FOR ALL
  USING (public.portal_is_global_admin())
  WITH CHECK (public.portal_is_global_admin());

-- ── event_photos (Gallery) ──────────────────────────────────
CREATE POLICY "Global admins can view all event photos"
  ON public.event_photos
  FOR SELECT
  USING (public.portal_is_global_admin());

CREATE POLICY "Global admins can manage all event photos"
  ON public.event_photos
  FOR ALL
  USING (public.portal_is_global_admin())
  WITH CHECK (public.portal_is_global_admin());
