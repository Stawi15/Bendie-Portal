-- Feature 004 (Event Product Selection & Planner Provisioning) -- Phase 1.
--
-- Adds the persisted Planner-provisioning state machine to events, the
-- creation-request idempotency ledger, and corrects events' column
-- privileges for SELECT, INSERT, and UPDATE together (per the
-- /speckit.analyze correction -- the first draft of this migration
-- restricted only SELECT and missed that authenticated/anon also hold a
-- table-level INSERT/UPDATE grant on events, combined with
-- events_update_host_organizer's existing RLS already letting an event's
-- own host/organizer/admin -- exactly the role this feature's own
-- create_event_with_products grants the creator -- UPDATE their event row.
-- Unfixed, an ordinary customer could have directly forged
-- planner_provisioning_status = 'succeeded' via a raw PostgREST call
-- without ever actually provisioning anything).
--
-- Live-verified immediately before writing this migration: events' relacl
-- carries a full table-level grant (arwdDxtm) to authenticated and anon
-- (Supabase's default shape), and the only client-side UPDATE calls against
-- events anywhere in this repository are basics/page.tsx, hero/page.tsx,
-- terminology/page.tsx, and theme/page.tsx -- every field each of them
-- writes is in the re-granted column list below; none is affected by this
-- migration.

ALTER TABLE public.events
  ADD COLUMN planner_provisioning_status text NOT NULL DEFAULT 'not_required'
    CHECK (planner_provisioning_status IN ('not_required','pending','provisioning','succeeded','failed')),
  ADD COLUMN planner_provisioning_error text,
  ADD COLUMN planner_provisioning_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN planner_provisioning_last_attempted_at timestamptz,
  ADD COLUMN planner_provisioning_succeeded_at timestamptz;

CREATE TABLE public.event_creation_requests (
  idempotency_key uuid PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  products text[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- No RLS policy grants any privilege here to authenticated/anon -- only
-- create_event_with_products, running as its SECURITY DEFINER owner,
-- touches this table. organization_id/products are stored (not just the
-- key) so a later reuse of the same key with a DIFFERENT payload can be
-- detected and rejected rather than silently returning an unrelated event
-- (the /speckit.analyze idempotency-conflict correction).
ALTER TABLE public.event_creation_requests ENABLE ROW LEVEL SECURITY;

-- SELECT: revoke the table-level grant entirely, re-grant only on every
-- pre-existing column plus the four new provisioning columns that are
-- safe for customers to read (status/attempts/timestamps) -- excluding
-- planner_provisioning_error, which is diagnostic-only (see
-- event_planner_provisioning_error_read.sql for the platform-admin-gated
-- read path).
REVOKE SELECT ON public.events FROM authenticated, anon;

GRANT SELECT (
  id, organization_id, name, slug, description, location, status, attendee_limit, starts_at,
  ends_at, created_by, created_at, updated_at, image_url, hero_title, hero_description,
  hero_image_url, category_label, theme_label, theme_icon, facilitator_label_singular,
  facilitator_label_plural, gallery_external_url, event_type, networking_mode, interests_enabled,
  feedback_form_url, theme_primary, theme_secondary, theme_tertiary, profile_banner_image_url,
  in_house, gallery_background, disabled_menu_items,
  planner_provisioning_status, planner_provisioning_attempts,
  planner_provisioning_last_attempted_at, planner_provisioning_succeeded_at
) ON public.events TO authenticated, anon;

-- INSERT/UPDATE: same correction, applied to both privilege types this
-- time. Re-granted only on the 33 pre-existing columns -- none of the five
-- new provisioning columns appear in either list, so a direct client
-- write can never set any of them to anything other than their DEFAULT
-- (a plain INSERT omitting an unauthorized column succeeds using its
-- default/NULL; only explicitly naming that column in the target list is
-- blocked). Only create_event_with_products (as its SECURITY DEFINER
-- owner) and service-role-driven provisioning routes can ever write a
-- non-default value to any of the five provisioning columns.
REVOKE INSERT, UPDATE ON public.events FROM authenticated, anon;

GRANT INSERT (
  id, organization_id, name, slug, description, location, status, attendee_limit, starts_at,
  ends_at, created_by, created_at, updated_at, image_url, hero_title, hero_description,
  hero_image_url, category_label, theme_label, theme_icon, facilitator_label_singular,
  facilitator_label_plural, gallery_external_url, event_type, networking_mode, interests_enabled,
  feedback_form_url, theme_primary, theme_secondary, theme_tertiary, profile_banner_image_url,
  in_house, gallery_background, disabled_menu_items
) ON public.events TO authenticated, anon;

GRANT UPDATE (
  organization_id, name, slug, description, location, status, attendee_limit, starts_at,
  ends_at, updated_at, image_url, hero_title, hero_description, hero_image_url, category_label,
  theme_label, theme_icon, facilitator_label_singular, facilitator_label_plural,
  gallery_external_url, event_type, networking_mode, interests_enabled, feedback_form_url,
  theme_primary, theme_secondary, theme_tertiary, profile_banner_image_url, in_house,
  gallery_background, disabled_menu_items
) ON public.events TO authenticated, anon;
