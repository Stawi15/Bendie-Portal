# Migration apply order (fresh-bootstrap manifest)

## Why this file exists (R3-F1, Feature 003 third corrective pass)

This repository has **no `supabase/config.toml`, no installed Supabase CLI
convention, and no CI/script anywhere that globs this directory** (verified by
searching the full repo before writing this file). The only mechanism that has
ever actually applied a migration here is the Supabase MCP `apply_migration`
tool, called once per file, which stamps its own UTC timestamp as the
authoritative `version` in the live database's `supabase_migrations
.schema_migrations` table at the moment of the call. **Local filenames in this
directory are a human-readable historical record only — no tool in this repo
sorts and replays them.** `list_migrations` (querying the live Portal project)
is the ground truth for the order these were actually applied.

That matters because several filenames do **not** sort alphabetically in the
order they must be applied for a hypothetical fresh database to reach the
current intended state:

- `add_planner_sync_status_check.sql` (adds a `CHECK` constraint on
  `event_members.planner_sync_status`) sorts alphabetically **before**
  `bendie_planner_integration.sql` (the migration that adds the
  `planner_sync_status` column itself). A naive `ORDER BY filename` replay
  therefore fails outright — confirmed empirically against a disposable local
  Postgres 15 container: `ERROR: column "planner_sync_status" does not exist`,
  aborting the whole replay. There is no way to fix this with a *later*
  corrective migration, because the replay never reaches anything after the
  crash. Neither file may be renamed or edited (both are treated as applied,
  immutable migration history — see below), so the only safe fix is this
  document: **fresh bootstrap must use the explicit order below, never a
  directory glob sort.**
- The `event_members` role-immutability trigger function
  (`enforce_event_member_role_immutability`) went through four migrations,
  applied to the live database in this order: `event_members_role_self_
  promotion_guard.sql` (original, no service-role exemption) →
  `..._service_role_exemption_fix.sql` (wrong attempt) → `..._session_user_
  fix.sql` (wrong attempt) → `..._role_setting_fix.sql` (correct). Those four
  filenames sort alphabetically in the *opposite* order (`event_members_role_
  guard_...` < `event_members_role_self_...`), which would silently leave the
  ORIGINAL broken body in place on replay — confirmed empirically the same
  way. Unlike the case above, this one **does** self-correct via
  `zz_event_members_role_guard_final_authoritative.sql`, which is deliberately
  named to sort after every other migration filename in this repository and
  re-applies the correct, verified-live body with `CREATE OR REPLACE
  FUNCTION` regardless of what the misordered predecessors left behind —
  confirmed empirically that even a naive full-alphabetical replay of all five
  files ends with the correct body. No manifest ordering is required for this
  case specifically (it is self-healing by filename), but it is documented
  here for completeness and because the underlying files are listed below in
  their real chronological order regardless.

## Migration-history immutability

Per this repository's standing rule (`AGENTS.md`, and every prior Feature 003
corrective pass), an already-applied migration file is never renamed, edited,
or reordered after the fact, even when doing so would make sorting more
convenient. This manifest exists precisely because that rule rules out the
"just rename the file" fix.

## Required fresh-bootstrap order

Any future tooling that builds a database from this repository's committed
migrations (a from-scratch Supabase project, a disposable test database, a
`supabase db reset`-equivalent once this repo adopts one) **must apply files
in this explicit order, not `ORDER BY filename`**:

1. `000_authorization_helper_functions_baseline.sql`
2. `shared_trigger_helper_functions_baseline.sql`
3. `003_seed_data.sql`
4. `004_storage_policies.sql`
5. `005_add_event_photos_and_audit_log.sql`
6. `006_global_admin_rls_bypass.sql`
7. `007_gallery_posts_rls_bypass.sql`
8. `008_organizations_rls_bypass.sql`
9. `009_organization_members_rls_bypass.sql`
10. `010_event_scope_restrictive_admin_bypass.sql`
11. `011_events_rls_bypass.sql`
12. `012_content_tables_write_bypass.sql`
13. `013_remaining_content_tables_write_bypass.sql`
14. `014_activity_log_setup.sql`
15. **(gap — see `context/schema-reference.md` "Fresh-bootstrap reproducibility"
    section; 36 migrations applied live between `014_activity_log_setup` and
    `bendie_planner_integration`, from `015_fix_storage_allow_all_and_org_
    assets` through `allow_global_admin_update_any_profile`, have no
    committed `.sql` source at all and cannot be replayed from this repo —
    pre-existing debt, not introduced by and out of scope for Feature 003)**
16. `bendie_planner_integration.sql`
17. **(gap — `fix_attendee_travel_details_planner_key_constraint`, applied
    live 2026-09-11, has no committed source)**
18. `add_planner_sync_status_check.sql`
19. `organization_and_event_product_foundation.sql`
20. `organization_admin_event_metadata_visibility.sql`
21. `event_and_organization_creation_admin_restriction.sql`
22. `event_members_role_self_promotion_guard.sql`
23. `event_members_role_guard_service_role_exemption_fix.sql`
24. `event_members_role_guard_session_user_fix.sql`
25. `event_members_role_guard_role_setting_fix.sql`
26. `event_members_creator_fallback_removed_and_planner_metadata_locked.sql`
27. `event_members_planner_metadata_column_grant_fix.sql`
28. `zz_event_members_role_guard_final_authoritative.sql`
29. `get_event_planner_sync_status_execute_lockdown.sql`
30. `event_members_planner_metadata_update_privilege_fix.sql` **(Feature 003 F-NEW-1 — missing from
    this list until Feature 004's own implementation pass found and corrected the omission; depends
    on `event_members_creator_fallback_removed_and_planner_metadata_locked.sql`/item 26 having
    already created the four Planner columns it re-privileges)**
31. `event_creation_provisioning_foundation.sql` **(Feature 004 — depends on `events` already
    existing, i.e. items 3+)**
32. `create_event_with_products_function.sql` **(Feature 004 — depends on item 31's new columns/
    table, and on `is_organization_admin`/`portal_is_global_admin`/`organization_products`/
    `organization_planner_links`/`event_products`/`event_members` all already existing)**
33. `create_event_with_products_execute_lockdown.sql` **(Feature 004 — depends on item 32)**
34. `event_planner_provisioning_error_read.sql` **(Feature 004 — depends on item 31's new
    `planner_provisioning_error` column and `portal_is_global_admin`)**
35. `create_event_with_products_race_auth_validation_fix.sql` **(Feature 004 — post-review
    corrective pass, R3/R4/R5; `CREATE OR REPLACE` of item 32's function body only, same
    signature — depends on item 32)**

Items 1-2 are placed first deliberately (see their own file headers): they
define helper functions (`portal_is_global_admin`, `is_organization_admin`,
`is_event_host_or_organizer`, `set_updated_at`, etc.) that migrations from
`006` onward call. Both use `CREATE OR REPLACE FUNCTION`, so re-running them
against an already-provisioned database (including the live Portal project)
is a safe no-op, not a behavior change.

This list does **not** achieve full fresh-database reproducibility by itself
— see the two documented gaps above and `context/schema-reference.md` for the
complete accounting. It is scoped to making the *committed* migrations
internally order-correct, which is what R3-F1 asked for.
