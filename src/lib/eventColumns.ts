import type { Database } from '@/types/database';

/**
 * Explicit `events` column list for client-side reads, matching EXACTLY the
 * column-level SELECT grant `supabase/migrations/event_creation_provisioning_
 * foundation.sql` gave `authenticated`/`anon` (every pre-existing column plus
 * the four safe-to-read provisioning columns, deliberately excluding
 * `planner_provisioning_error` — diagnostic-only, platform-admin-gated via
 * `get_event_planner_provisioning_error`).
 *
 * That migration replaced `events`' default full table-level grant with a
 * column-level one. Postgres denies a `SELECT *` in its entirety the moment
 * the requesting role lacks SELECT on even one column of the table — it does
 * not silently omit the ungranted column — so any client `.select('*')`
 * against `events` fails outright for ordinary users with
 * `permission denied for table events`, even though every column IT actually
 * needs is granted. Every client-side `events` read must use this constant
 * (or a narrower explicit list) instead of `'*'`.
 */
export const EVENTS_SELECT_COLUMNS =
  'id, organization_id, name, slug, description, location, status, attendee_limit, starts_at, ends_at, created_by, created_at, updated_at, image_url, hero_title, hero_description, hero_image_url, category_label, theme_label, theme_icon, facilitator_label_singular, facilitator_label_plural, gallery_external_url, event_type, networking_mode, interests_enabled, feedback_form_url, theme_primary, theme_secondary, theme_tertiary, profile_banner_image_url, in_house, gallery_background, disabled_menu_items, planner_provisioning_status, planner_provisioning_attempts, planner_provisioning_last_attempted_at, planner_provisioning_succeeded_at' as const;

/**
 * The `events` row shape actually returned by `EVENTS_SELECT_COLUMNS` —
 * the full generated `Row` type minus `planner_provisioning_error`, which
 * is never selected client-side (see above). Use this in place of
 * `Database['public']['Tables']['events']['Row']` wherever local state holds
 * the result of a client-side `events` read.
 */
export type EventRow = Omit<Database['public']['Tables']['events']['Row'], 'planner_provisioning_error'>;
