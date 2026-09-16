-- Organization & Event Access Foundation (Feature 003) -- F-NEW-1 corrective
-- pass (final narrow verification's one new MEDIUM finding, post-third-review).
--
-- Root cause: event_members_planner_metadata_column_grant_fix.sql (R2-F4
-- follow-up) revoked the table-level SELECT grant on event_members and
-- re-granted it only on the customer-safe column set, closing the read side
-- of Planner-metadata exposure. It did not apply the same fix to UPDATE (or
-- INSERT) -- `authenticated`/`anon` still held table-level UPDATE and INSERT
-- covering every column, including the four Planner-managed ones
-- (planner_sync_status, planner_sync_error, planner_synced_at,
-- planner_assignment_id). Confirmed live via information_schema.column_
-- privileges before writing this migration, not assumed.
--
-- Combined with event_members_update_self_or_host's WITH CHECK
-- (user_id = auth.uid() OR is_event_host_or_organizer(event_id)), any
-- ordinary event member could directly UPDATE their own row's Planner
-- integration columns via a raw PostgREST call -- e.g. forging
-- planner_sync_status = 'succeeded' -- bypassing the platform-admin-only
-- /api/admin/planner-sync-member route entirely. These columns are
-- system-managed Bendie Planner integration state (Feature 001), never
-- customer-editable.
--
-- INSERT is fixed by the same statement, not left half-closed:
-- event_members_insert_self_or_host's WITH CHECK also permits an ordinary
-- member to self-insert their own event_members row
-- (user_id = auth.uid() AND is_organization_member(organization_id)), and
-- the same table-level INSERT grant would otherwise let that same forgery
-- happen at row-creation time instead of via a later UPDATE -- an
-- equivalent instance of the identical vulnerability (table-level grant
-- subsuming column-level control), not a separate concern. All four
-- Planner columns are nullable with no default (bendie_planner_integration.sql),
-- and every legitimate application INSERT already omits them (confirmed by
-- grepping every `.from('event_members').insert(...)` call in src/), so
-- this does not change any working behavior.
--
-- Mirrors the exact, already-proven mechanism used for the equivalent SELECT
-- gap: a column-level REVOKE alone is insufficient while the table-level
-- grant remains (a table-level grant subsumes column-level REVOKEs in
-- PostgreSQL, root-caused via pg_class.relacl during that earlier fix) --
-- the table-level grant itself must be revoked and re-granted only on the
-- customer-safe columns. service_role is untouched throughout (separate
-- grant, RLS-bypassing).
--
-- The legitimate Feature 001 write path (/api/admin/planner-sync-member)
-- is moved in the same corrective pass from the caller's own authenticated
-- session to the existing Portal service-role client -- the identical
-- established pattern already used by its sibling route,
-- /api/admin/planner-pull-travel, for the equivalent "system-managed field,
-- ordinary client privileges must not reach it" problem on
-- attendee_travel_details. No new RPC was introduced: the route already
-- verifies portal_is_global_admin() via the authenticated client before any
-- privileged action, so switching only the four-column write to
-- service_role changes no authorization behavior, adds no new privilege
-- surface, and reuses (rather than duplicates) an existing, already-reviewed
-- mechanism.
--
-- A SECOND, DISTINCT privilege-semantics pitfall was found live while
-- verifying THIS migration itself (not assumed correct on first write, per
-- this feature's own repeated instruction to verify actual PostgreSQL
-- privilege semantics): `GRANT INSERT, UPDATE (column_list) ON t TO role`
-- -- multiple privilege keywords sharing one trailing column list -- only
-- applies that column list to the LAST-listed privilege (UPDATE here);
-- INSERT was silently granted at the unrestricted table level. Confirmed via
-- pg_class.relacl immediately after applying the first version of this
-- migration: `anon`/`authenticated` still held table-level INSERT ('a')
-- covering all four Planner columns, while UPDATE was correctly
-- column-restricted. The fix is two separate single-privilege GRANT
-- statements below, each with its own column list -- the same shape already
-- used successfully by event_members_planner_metadata_column_grant_fix.sql's
-- single-privilege SELECT grant, generalized here to two privilege types
-- instead of combined into one ambiguous statement.

REVOKE INSERT, UPDATE ON public.event_members FROM authenticated, anon;

GRANT INSERT (
  event_id, user_id, organization_id, role,
  onboarding_status, onboarding_completed_at, invited_by, created_at
) ON public.event_members TO authenticated, anon;

GRANT UPDATE (
  event_id, user_id, organization_id, role,
  onboarding_status, onboarding_completed_at, invited_by, created_at
) ON public.event_members TO authenticated, anon;
