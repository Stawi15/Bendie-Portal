-- ============================================================
-- Bendie Planner integration (foundation).
-- Adds the per-event opt-in link to Bendie Planner's separate
-- Supabase project, plus tracking columns so the three sync
-- flows (members push, agenda push, travel pull) can upsert
-- instead of duplicating on repeat runs. Planner uses bigint/
-- serial IDs and a wholly separate auth.users realm -- these
-- columns store Planner-side identifiers as plain values with
-- NO foreign key to Planner (cross-database, can't FK). All
-- nullable: no Planner counterpart yet is the normal case, not
-- an error state.
--
-- Uniqueness on event_planner_links.planner_event_id is
-- enforced only for ACTIVE rows (partial unique index), not a
-- plain UNIQUE constraint -- an unlinked (is_active = false)
-- row must not permanently block a different Portal event from
-- linking to the same Planner event later (spec FR-004's
-- "actively linked" wording).
--
-- attendee_travel_details gets two RESTRICTIVE policies (not a
-- single FOR ALL policy) so Planner-sourced rows
-- (source_planner_key IS NOT NULL) can never be client-inserted
-- or client-updated, while SELECT and DELETE remain governed
-- only by the table's existing permissive policies -- a FOR ALL
-- policy would have wrongly hidden these rows from SELECT too.
-- ============================================================

CREATE TABLE public.event_planner_links (
  event_id uuid PRIMARY KEY REFERENCES public.events(id) ON DELETE CASCADE,
  planner_event_id integer NOT NULL,
  planner_event_title text,
  is_active boolean NOT NULL DEFAULT true,
  linked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX event_planner_links_active_planner_event_uidx
  ON public.event_planner_links (planner_event_id)
  WHERE is_active = true;

ALTER TABLE public.event_planner_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Global admins can manage all event planner links"
  ON public.event_planner_links
  FOR ALL
  USING (public.portal_is_global_admin())
  WITH CHECK (public.portal_is_global_admin());

ALTER TABLE public.profiles
  ADD COLUMN planner_profile_id uuid;

ALTER TABLE public.event_members
  ADD COLUMN planner_assignment_id bigint,
  ADD COLUMN planner_synced_at timestamptz,
  ADD COLUMN planner_sync_status text,
  ADD COLUMN planner_sync_error text;

ALTER TABLE public.agenda_sessions
  ADD COLUMN planner_agenda_item_id bigint,
  ADD COLUMN planner_synced_at timestamptz;

ALTER TABLE public.attendee_travel_details
  ADD COLUMN source_planner_key text,
  ADD COLUMN synced_from_planner_at timestamptz;

-- Plain (not partial) unique constraint -- PostgREST's upsert targets this
-- via a plain ON CONFLICT (event_id, source_planner_key), which cannot
-- match a partial index without repeating its WHERE predicate. A plain
-- constraint achieves the same practical effect anyway: Postgres never
-- treats two NULLs as conflicting, so manually created rows
-- (source_planner_key IS NULL) were never at risk of colliding either way.
-- (Found and corrected live during T033 verification.)
ALTER TABLE public.attendee_travel_details
  ADD CONSTRAINT attendee_travel_details_event_planner_key_key
  UNIQUE (event_id, source_planner_key);

CREATE POLICY "attendee_travel_details_planner_sourced_immutable_update"
  ON public.attendee_travel_details
  AS RESTRICTIVE
  FOR UPDATE
  USING (source_planner_key IS NULL)
  WITH CHECK (source_planner_key IS NULL);

CREATE POLICY "attendee_travel_details_planner_sourced_immutable_insert"
  ON public.attendee_travel_details
  AS RESTRICTIVE
  FOR INSERT
  WITH CHECK (source_planner_key IS NULL);
