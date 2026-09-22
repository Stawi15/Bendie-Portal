# Evently-App: Event Content Portal — Field Reference

**Purpose:** This document catalogs every field in the Supabase schema that is (a) scoped to a
specific event via `event_id` (or otherwise configured per-event) and (b) is meant to be populated
by an organizer/admin — either by hand-editing the database or through the **Event Content
Portal** (a separate website used to feed data into this backend: create/edit events, manage
teams and org assets, and configure per-event content).

Compiled from the live Supabase schema, cross-referenced against actual usage in `domains/`,
`platform/`, and `app/`.

---

## Changelog

Dated entries, newest first. Each entry lists exactly what changed in the backend and what it
means for the portal. Superseded guidance in the numbered sections below is updated in place;
this section is the running "what's new since you last synced the portal" log.

### 2026-09-17 — Feature 006 implemented: product-level navigation (Bendie / Bendie Planner) and product-aware event discovery

No schema change. Feature 006 adds an application-layer product axis on top of the existing
`organization_products`/`event_products` tables (both unchanged, read-only from this feature's
perspective) — see `specs/006-product-navigation-event-discovery/` for the full spec/plan/tasks.
New portal routes: `/portal/bendie`, `/portal/bendie/events`, `/portal/planner`,
`/portal/planner/events`, `/portal/no-product`; `/portal` and `/portal/events` now redirect to the
resolved default product. Event discovery on these routes filters at the query layer via an
`event_products!inner(product_key)` embed — `event_planner_links` is never consulted for this.

**New controlled test fixture** (organization "Bendie Planner Sample",
`08bc8b7d-4579-4f32-aeb1-58b55e927ae1`), created via the real, unmodified Feature 004
`create_event_with_products` RPC + `retry-planner-provisioning` flow, not a raw insert:

- Event **"Stawi Escape — Both Test"** (`337d0358-1e17-4239-87f0-a2ee6fc39ba0`) —
  `event_products = ['bendie', 'planner']`, `planner_provisioning_status = 'succeeded'`,
  `event_planner_links` → Planner `planner_event_id = 53`, `is_active = true`. Draft status,
  2026-11-10 → 2026-11-12. Created by the same temporary non-platform-admin org-admin account used
  for Feature 005's fixture (`d39d5af5-a6aa-451e-a65f-9a95160468f5`), auto-synced as Planner staff
  (`event_members.role = 'admin'`) via the existing, unmodified staff-sync path.

The two pre-existing Feature 004/005 fixture events in this organization — "Stawi Escape"
(Bendie-only) and "Stawi Escape — Planner Test" (Planner-only) — are unmodified.

### 2026-09-16 — Feature 004 post-convergence corrective fix: Planner-inclusive event creation was RLS-blind to its own mapping table for non-platform-admin org owners/admins

**Severity: high, brownfield, discovered while preparing a Feature 005 manual-test fixture — not a Feature
005 defect.** `organization_planner_links` has always had exactly one RLS policy,
`portal_is_global_admin()`-only (by design — ordinary users must not see arbitrary Planner-organization
mapping records). Three places in Feature 004's creation/provisioning flow read this table through the
caller's own RLS-governed session instead of a privileged client, so every one of them silently saw "no
row" (not an error) for any org owner/admin who is not also a platform admin — even when a valid mapping
genuinely existed — misreporting a real mapping as missing:

1. `src/app/api/events/create/route.ts` — a "fast, common-case" preflight check duplicating the RPC's own
   authoritative mapping validation. **Removed entirely**, not patched: `create_event_with_products`
   (`SECURITY DEFINER`) already re-validates the mapping before any write, so the FR-019/contracts/
   create-event.md "no write of any kind occurs" guarantee was never actually dependent on this route-level
   check — and the route's own RPC-error mapping already returns the identical `409 planner_mapping_missing`
   body when the RPC raises it, so the client-visible contract is unchanged. This also eliminates the only
   place in this flow where the same class of bug could return via a future edit, rather than leaving a
   second, parallel authorization check to keep in sync.
2. `src/lib/plannerEventProvisioning.ts`'s Phase 2 TOCTOU re-verification (kept — it protects against real
   revocation between the RPC's commit and provisioning actually running, so it is not redundant like #1)
   — fixed by switching the mapping read from `authClient` to the already-available `portalAdmin` service-
   role client, matching this same function's own established pattern for `event_planner_links` immediately
   below it. Also added the missing query-error-vs-absence distinction (previously any query failure here
   was silently treated as "no mapping" too — the same class of mistake Feature 005 corrected as its own F3
   finding).
3. `src/lib/plannerStaffSync.ts`'s `event_planner_links` read (this table has the identical
   `portal_is_global_admin()`-only policy) — same fix, switched to `portalAdmin`. This function is shared
   between Feature 001's platform-admin-only manual sync route (unaffected either way, since that caller
   always was a platform admin) and Feature 004's auto-sync-the-creator step (affected — the creator's own
   session is not always a platform admin).
4. `src/components/portal/CreateEventModal.tsx`'s advisory client-side "does the mapping exist" hint —
   removed, not fixed. There is no reliable client-side signal to replace it with (a `false` reading is
   indistinguishable from "you're not a platform admin," not from "no mapping"), and per the established
   security model ordinary users must not gain broader SELECT visibility into `organization_planner_links`
   just to make a UI hint accurate. The server is already fully authoritative and already surfaces the
   exact same friendly message through the existing error-toast path on submit.

**No RLS/policy change, no migration** — the restrictive policy was correct and intentional; the bug was
application code using the wrong client tier to read it. Live-verified end-to-end with a real, freshly
created, non-platform-admin org-admin session against the real `POST /api/events/create` route (not
service-role): before the fix, `409 planner_mapping_missing` even though a valid mapping existed, zero
provisioning attempted; after the fix, the same session's request succeeds, provisions a real Planner event
under the mapped Planner organization, creates exactly one active canonical `event_planner_links` row, and
successfully auto-syncs the creator as Planner staff (previously silently skipped by the same bug in
`plannerStaffSync.ts`). Also re-confirmed the FR-019 zero-write guarantee holds using an isolated
organization with a genuinely missing mapping (`0` events, `0` `event_creation_requests` rows after the
`409`), and that platform-admin creation, cross-tenant denial, and ordinary-member denial are all unaffected
(none of those paths were touched by this fix).

### 2026-09-16 — Event-discovery outage fixed: client `.select('*')` on `events` is incompatible with its column-level grant

**Severity: high, brownfield, pre-dates Feature 005 entirely.** Confirmed live, with a real authenticated
session, that ordinary users saw **zero events anywhere in the Portal** — every organization's dashboard
and Events list rendered "No events in this view yet," and the event workspace (`EventContext`) could not
load any event, even by direct URL. Root cause: `event_creation_provisioning_foundation.sql` (Feature 004)
correctly and deliberately replaced `events`' default table-level grant with a column-level one, excluding
`planner_provisioning_error` (diagnostic-only) from `authenticated`/`anon` SELECT — but Postgres denies a
`SELECT *` **in its entirety** the instant the requesting role lacks SELECT on even one column of the
table; it does not silently omit the ungranted column. Four call sites still did `.select('*')` against
`events` (`src/lib/useOrgEvents.ts`, `src/contexts/EventContext.tsx` ×3, `src/components/portal/
CreateEventModal.tsx`, `src/app/portal/events/[eventId]/basics/page.tsx`), so every one of them received a
genuine `permission denied for table events` PostgREST error on every request — which each call site's own
error handling then silently swallowed into an empty result (`console.error` + `setEvents([])` /
`setCurrentEvent(null)`), producing an empty-looking UI with no visible error at all. Live-reproduced with
a real authenticated (non-service-role) session before and after the fix: before, `403 permission denied`
for every organization; after, correct row counts for every organization (Cyberguard 1, Old Mutual 6,
Bendie Planner Sample 6, "Default Organization" 0 — genuinely empty, not a symptom). RLS itself was never
the problem — confirmed via `pg_policies` and live testing that every `events` SELECT policy (global admin,
org owner/admin, event member/creator, and the `active`/`published` public-showcase policy) was already
correct and unaffected.

**Fix (no RLS/migration change — the grant itself was correct and intentional):** added
`src/lib/eventColumns.ts`, exporting `EVENTS_SELECT_COLUMNS` (the exact granted column list, as a `const`
string literal so postgrest-js can still statically type the response) and `EventRow` (the matching
`Omit<..., 'planner_provisioning_error'>` type). Replaced every `.select('*')` against `events` with this
constant, and updated every downstream consumer's local `Event` type alias (`src/app/portal/page.tsx`,
`src/app/portal/events/page.tsx`, `src/app/portal/events/[eventId]/dashboard/page.tsx`, `src/components/
portal/EventsOverviewPanel.tsx`, `NextMilestoneCard.tsx`, `PlannerProvisioningBanner.tsx`,
`src/lib/eventStats.ts`) from the full generated `Row` type to `EventRow`, since none of them ever actually
used `planner_provisioning_error`. **Any future client-side `events` read must use `EVENTS_SELECT_COLUMNS`
(or a narrower explicit list) — never `.select('*')` — or it will silently break the same way again.**

### 2026-09-16 — Feature 005 final corrective re-review: `organization_members` has no default row order

No schema change — an operational query fact worth recording so a future feature doesn't repeat the
mistake. `organization_members` carries no natural/guaranteed row order — Postgres/PostgREST make no
promise about "the first row returned" absent an explicit `.order(...)`, and two structurally different
queries against the same table (a plain `select('organization_id')` vs. an embedded-resource join,
`select('organizations(...)')`) are not guaranteed to agree on what that first row is, even against
identical underlying data, since they may use different scan/query plans. This was live-confirmed to
happen to agree today for a real 6-membership user, but "happens to agree" is not the same claim as
"guaranteed to agree." Both of Feature 005's org-fallback queries (`src/app/api/events/[eventId]/planner-
overview/route.ts` and `src/lib/portalAuth.ts`'s `getAccessibleOrganizations()`) now carry the identical
`.order('organization_id', { ascending: true })` — a pure, product-meaningless tie-break — to make
`accessibleOrgIds[0]`/`accessible[0]` provably the same organization in both places. **Any future feature
that reads `organization_members` and relies on "the first row" for anything must add its own explicit,
matching order — do not assume agreement between two differently-shaped queries against this table.**

### 2026-09-16 — Feature 005 post-implementation review corrections (F1–F5): no schema change, one navigation-classification correction

`/code-review` found 5 defects in Feature 005's shipped code; all fixed, no migration on either project.
The one fact worth recording here (the others are route/page-internal bugfixes with no schema or
cross-feature documentation impact — see `specs/005-planner-event-workspace-foundation/tasks.md`'s
"Post-implementation review-correction pass" note for the full list):

**F2 — `bendie-planner` tab was misclassified `product: 'bendie'` since Feature 003** (a genuine
brownfield gap, not a documentation error): this predates Planner-only events even being possible, and
silently made Feature 001's admin surface (link management + staff sync) unreachable for a Planner-only
event, even though the **Final Feature 001 operation matrix** immediately below already documented staff
sync and linking as product-mix-agnostic. Corrected in `src/lib/eventSectionMeta.ts` to
`product: 'shared'` — nav visibility is no longer gated by product mix at all, matching what the matrix
below already said was true operationally. The two genuinely Bendie-specific actions on that page (Agenda
push, Travel pull) remain gated exactly as the matrix already documents; only page-level nav visibility
changed.

**Corrected page-visibility vs. operation-authorization matrix** — page visibility (does the tab appear
in nav / is the route reachable at all) and operation-level authorization (can this specific action
succeed) are not the same thing and must be read as two separate columns:

| Surface | Bendie-only | Planner-only | Both | Gate |
|---|---|---|---|---|
| `bendie-planner` tab visible in nav | Yes | Yes (was **No** before this fix — F2) | Yes | None — `product: 'shared'`, always listed once event-workspace access is granted |
| `bendie-planner` page content reachable | platform admin only | platform admin only | platform admin only | `isGlobalAdmin` client gate + all 5 `planner-*` routes independently re-check platform-admin server-side (unchanged by F2) |
| Link / unlink a Planner counterpart | Yes | Yes | Yes | None beyond platform-admin (operation-level, unaffected by product mix) |
| Staff sync (`planner-sync-member`) | No (no counterpart to sync to) | Yes | Yes | Ungated — not product-specific (unchanged, see matrix below) |
| Agenda push (`planner-push-agenda`) | No | No | Yes | Requires active `'bendie'` in `event_products` (unchanged) |
| Travel pull (`planner-pull-travel`) | No | No | Yes | Requires active `'bendie'` in `event_products` (unchanged) |

Live-verified against the real Portal database: all 16 currently-existing events are Bendie-only (zero
Planner-only or Both events exist in production yet), so only the Bendie-only row above is confirmed
against real data; Planner-only/Both rows are confirmed by code-path tracing (the `'shared'` filter
`EventLayout` already applies to every other shared-classified section, and the page's own live
`event_products` query), not a live rendered session — the same limitation already documented for the
rest of this feature's unexercised live-session paths.

### 2026-09-16 — Planner Event Workspace Foundation (Feature 005): no schema change, one Portal-side type addition, one live-verified Bendie Planner RLS fact

**No Portal migration and no Bendie Planner migration** — this feature is a read-only consumer of
existing tables/views on both projects.

**Portal-side type addition (not a schema change)**: `src/types/plannerDatabase.ts` gained a hand-maintained
`event_summary_realtime` entry (Bendie Planner's own materialized view, unaffected by this feature) —
`event_title`, `description`, `location`, `setup_date`, `start_date`, `end_date`, `number_of_sessions`,
`status` only; `event_id` and `attendees` (also present on the live row) are deliberately omitted from
the type so they can never be selected by this feature's query.

**Bendie Planner fact, live-verified this session (not previously documented here since this repository
had no prior reason to read this table's RLS)**: `event_planner_links` (Portal-side, Feature 001) has
exactly one RLS policy — `FOR ALL USING (portal_is_global_admin())`. An ordinary (non-platform-admin)
caller's own authenticated session can never read this table, even for an event they hold `event_members`
on. Feature 005's new read route resolves this table via the Portal service-role client for that one
lookup — the same pattern `plannerEventProvisioning.ts` (Feature 004) already uses for writing to it.
Any future feature reading `event_planner_links` on behalf of an ordinary (non-admin) caller needs the
same treatment; a plain `authClient.from('event_planner_links')...` call will silently return no row for
such a caller, not an RLS error.

**`src/lib/eventAuth.ts` change**: `requireEventWorkspaceAccess`, `isProductActiveForOrg`, and
`isProductAvailableForEvent` each gained an optional, defaulted fourth/third parameter,
`client: SupabaseClient = supabase` (plain `SupabaseClient`, not `SupabaseClient<Database>` — this
codebase's `supabase` singleton is itself constructed without that generic). Every existing call site is
unaffected; a new caller (Feature 005's `GET /api/events/[eventId]/planner-overview`) passes its own
cookie-bound server client instead of relying on the shared browser singleton.

**Bendie Planner's known-unreliable session-status data (documented, not fixed)**: `session_status_realtime`,
`session_summary_realtime`, and `overall_session_summary` were found, during this feature's
`/speckit.clarify` pass, to have a usable row for only 1 of Bendie Planner's 13 live events at the time,
and to be internally inconsistent even for that one event (a bug in how their underlying refresh job
matches status strings). Feature 005 does not read, repair, or depend on these in any way — its session
summary is sourced entirely from the separate, verified-reliable `event_summary_realtime` materialized
view instead (one correct row per event, including zero-session events, refreshed roughly every minute
by `pg_cron`).

## Fresh-bootstrap reproducibility (added 2026-09-15, Feature 003 third corrective pass)

**Can a brand-new database reach the current live schema/security state using only committed
`supabase/migrations/` files? No.** Two separate, largely unrelated gaps, discovered during a full
dependency audit (every `CREATE TABLE`/`CREATE FUNCTION` vs. every reference, across all 26
committed files, cross-checked against the live project's full `list_migrations` history):

1. **Ordering** (Feature-003-relevant, now fixed) — two pairs of committed files do not sort
   alphabetically in their true dependency order. See `supabase/migrations/MIGRATION_ORDER.md` for
   the full explanation and the required fresh-bootstrap order; that document is the authoritative
   apply order, not directory/filename sort. In short: `add_planner_sync_status_check.sql` must run
   after `bendie_planner_integration.sql` (a hard crash otherwise, empirically confirmed); the
   `event_members` role-guard chain is self-healing regardless of order (also empirically
   confirmed) via `zz_event_members_role_guard_final_authoritative.sql`.
2. **Missing history** (pre-existing, predates Feature 001, NOT fixed by this pass — out of scope
   per `AGENTS.md`'s "document and flag, don't fix unless blocking") — **36 migrations applied to
   the live database have no committed `.sql` source anywhere in this repository**: everything
   applied between `014_activity_log_setup.sql` and `bendie_planner_integration.sql`
   (`015_fix_storage_allow_all_and_org_assets` through `allow_global_admin_update_any_profile` —
   teams, storage-policy fixes, leaderboard/points, chat/messaging, notifications, facilitator
   linking, excursion categories, news items, networking, and more), plus one Feature-001-era fix
   (`fix_attendee_travel_details_planner_key_constraint`) and two temporary debug migrations from
   this pass's own predecessor session. Of ~58 functions live in the `public` schema, only 14 have
   committed source. Additionally, migrations `003_seed_data.sql` through `009_organization_members_
   rls_bypass.sql` have local `.sql` files but **no corresponding entry at all** in the live
   project's `supabase_migrations.schema_migrations` history table (the live history only begins at
   `010_event_scope_restrictive_admin_bypass.sql`'s timestamp) — meaning even "applied migration
   history" doesn't fully cover the earliest schema.
   **Practical implication**: a genuine `supabase db reset`-from-scratch is not achievable today
   regardless of migration-ordering correctness — this repository has no `supabase/config.toml`
   either, so no local Supabase CLI workflow is currently configured at all. Reproducing the full
   schema would require either recovering the missing 36 migrations' original SQL (not available;
   would require reconstructing from live `pg_dump`-style introspection, itself a significant,
   security-sensitive undertaking this pass declined to do without being asked, per R3-F2's own
   "do not reconstruct security-sensitive functions from guesses" instruction generalized to the
   wider gap) or accepting a `pg_dump`-based schema baseline as the actual fresh-bootstrap starting
   point instead of a from-scratch migration replay. Neither was in scope for this pass.

### 2026-09-16 — Event Product Selection & Planner Provisioning (Feature 004)

All four migrations below are applied and live-verified (`pg_class.relacl`, `information_schema.
column_privileges`, `pg_proc.proacl`/`proconfig` all directly inspected post-migration, not assumed
correct from the SQL alone) — see `specs/004-event-product-selection-planner-provisioning/tasks.md`'s
"Implementation status" note for the full live-verification account, including end-to-end proof of
the Bendie-only, Planner-only, and Both creation paths against real (and fully cleaned-up) test data.

**New columns on `public.events`** (`event_creation_provisioning_foundation.sql`): `planner_
provisioning_status text NOT NULL DEFAULT 'not_required'` (`CHECK IN ('not_required','pending',
'provisioning','succeeded','failed')`), `planner_provisioning_error text` (diagnostic only — not
customer-`SELECT`-able), `planner_provisioning_attempts integer NOT NULL DEFAULT 0`, `planner_
provisioning_last_attempted_at timestamptz`, `planner_provisioning_succeeded_at timestamptz`. Populated
by the new `create_event_with_products` RPC at creation and by the Planner-provisioning orchestration
thereafter — never customer-writable (see privilege correction below).

**New table**: `public.event_creation_requests (idempotency_key uuid PRIMARY KEY, event_id uuid NOT
NULL REFERENCES events(id) ON DELETE CASCADE, organization_id uuid NOT NULL, products text[] NOT NULL,
created_at timestamptz NOT NULL DEFAULT now())` — a pure idempotency ledger; no RLS grant to
`authenticated`/`anon` at all, only touched by `create_event_with_products` as its `SECURITY DEFINER`
owner.

**New functions**: `create_event_with_products(...)` (atomic Portal-side event/`event_products`/
`event_members`/provisioning-state creation, `SECURITY DEFINER`, `PUBLIC`/`anon` `EXECUTE` revoked,
`authenticated` retained — mirrors `get_event_planner_sync_status()`'s exact grant shape) and
`get_event_planner_provisioning_error(p_event_id)` (platform-admin-gated raw-diagnostic read, same
shape as `get_event_planner_sync_status()`).

**`events` column-privilege correction** (found live during `/speckit.analyze`, before any migration
was written for it): `events` carries Supabase's default full table-level grant to `authenticated`/
`anon`, and `events_update_host_organizer`'s existing RLS already lets an event's own host/organizer/
`admin` — exactly the role this feature grants the creator — `UPDATE` their row. Left unaddressed, an
ordinary customer could have directly forged `planner_provisioning_status = 'succeeded'` (or the
attempt/timestamp columns) via raw PostgREST. Fixed with the same proven pattern as `event_members`'s
Feature 003 F-NEW-1 correction: revoke the table-level `SELECT`/`INSERT`/`UPDATE` grants entirely,
re-grant all three only on the 33 pre-existing columns (verified against every real client-side
`.update()` call on `events` in the repository — `basics`, `hero`, `terminology`, `theme` pages — none
broken) plus, for `SELECT` only, four of the five new provisioning columns (`planner_provisioning_
error` excluded from all three privilege types).

**`event_planner_links` semantic broadening**: this existing Feature 001 table now legitimately
represents the Portal↔Planner counterpart for Planner-only events, not only Both events — no schema or
RLS change to it, and no second mapping table introduced. Consequence: `planner-push-agenda` and
`planner-pull-travel` (`src/app/api/admin/planner-push-agenda`/`planner-pull-travel`) each gained one
precondition (`event_products` must include `'bendie'`) since an active link no longer proves Both-
product configuration; `planner-sync-member` (staff/counterpart access, not product-specific) is
unchanged.

**Final Feature 001 operation matrix** (resolved via direct code audit, not assumed):

| Capability | Bendie | Planner-only | Both |
|---|---|---|---|
| Planner counterpart (`event_planner_links`) | No | Yes | Yes |
| Staff sync (`planner-sync-member`) | No | Yes (ungated — access is not product-specific) | Yes |
| Agenda push (`planner-push-agenda`) | No | No (new `'bendie'`-in-`event_products` guard) | Yes (unaffected) |
| Travel pull (`planner-pull-travel`) | No | No (same new guard) | Yes (unaffected) |

**No schema change to `event_products`, `organization_products`, or `organization_planner_links`** —
Feature 004 only reads/writes them exactly as their own Feature 002 design already permits.

### 2026-09-15 — Organization & Event Access Foundation (Feature 003), F-NEW-1 correction: Planner metadata UPDATE/INSERT privilege closed

The final narrow verification's one new finding, closed. No schema change.

`event_members_planner_metadata_update_privilege_fix.sql` — the R2-F4/R3-F5 Planner-metadata
hardening closed SELECT (table-level revoke + safe-column re-grant) and RPC EXECUTE, but left
`authenticated`/`anon` holding table-level UPDATE and INSERT covering all columns, including the
four Planner-managed ones. Fixed with the identical mechanism: table-level INSERT/UPDATE revoked,
re-granted only on the existing safe column set (`event_id, user_id, organization_id, role,
onboarding_status, onboarding_completed_at, invited_by, created_at`). **Privilege-semantics note
worth remembering, same family as the earlier SELECT lesson**: `GRANT INSERT, UPDATE (col_list) ON
t TO role` — multiple privilege keywords sharing one trailing column list — applies that column
list only to the *last-listed* privilege; verify with `pg_class.relacl` after any multi-privilege
column-scoped GRANT, don't assume a shared column list applies to every keyword in the list. Use
separate single-privilege `GRANT` statements when scoping more than one privilege type to the same
column set.

`src/app/api/admin/planner-sync-member/route.ts`'s two `event_members` UPDATE calls now use the
Portal service-role client (`SUPABASE_SERVICE_ROLE_KEY`) instead of the caller's authenticated
session, matching its sibling route `planner-pull-travel/route.ts`'s existing pattern — the route's
own `portal_is_global_admin()` check (via the authenticated client) still gates the whole request;
only the two Planner-column writes moved.

### 2026-09-15 — Organization & Event Access Foundation (Feature 003), third corrective pass: migration reproducibility, helper-function version control, RPC EXECUTE lockdown

A third independent review's six findings, database-focused. No table/column schema change. See
`context/progress-tracker.md`'s "Third corrective pass" entry for the full account; summarized
here for schema-reference purposes:

1. **`public.set_updated_at()` brought under version control** (`shared_trigger_helper_functions_baseline.sql`)
   — a Feature-002 migration (`organization_and_event_product_foundation.sql`) creates a trigger
   calling this function, but it had no committed `CREATE FUNCTION` anywhere (live-only, predating
   this repository's migration history). Applied as a byte-identical `CREATE OR REPLACE` (verified
   against live `pg_get_functiondef()`), so this is a version-control fix, not a behavior change.
2. **`public.get_event_planner_sync_status(uuid)` EXECUTE privilege explicitly locked down**
   (`get_event_planner_sync_status_execute_lockdown.sql`) — Postgres's default `PUBLIC` EXECUTE
   grant (which implicitly includes `anon`) was never explicitly revoked when the function was
   created. `authenticated` and `service_role` retain EXECUTE; the function's own internal
   `portal_is_global_admin()` check remains the actual authorization boundary for which
   `authenticated` caller succeeds. Verified via `pg_proc.proacl` directly, not assumption.
3. **Migration fresh-bootstrap ordering documented, not silently assumed alphabetical** — see the
   new "Fresh-bootstrap reproducibility" section below and `supabase/migrations/MIGRATION_ORDER.md`.

### 2026-09-15 — Organization & Event Access Foundation (Feature 003), second corrective pass: creator-fallback removed, Planner metadata column-privileged

Two further RLS/privilege changes, in response to a second independent review. No schema change
(no column added/removed).

1. **`events_insert_creator` tightened again** (`event_members_creator_fallback_removed_and_planner_metadata_locked.sql`)
   — the historical-organization-creator fallback (`organizations.created_by = auth.uid()`) is
   removed entirely; the policy is now `created_by = auth.uid() AND is_organization_admin(organization_id)`
   only. Resolves a formerly-deferred decision (Feature 002's carried-forward M1/M2-adjacent debt,
   tracked in this feature as F-R3): creator identity is audit/history data, never a current
   authorization grant. Live-verified: a user who created an organization and was later fully
   removed from its `organization_members` can no longer create events for it.
2. **`event_members` Planner sync metadata locked to column-level privilege**
   (`event_members_planner_metadata_column_grant_fix.sql`, after a first attempt in the same-day
   predecessor migration was live-tested and found ineffective — see below) — `planner_sync_status`,
   `planner_sync_error`, `planner_assignment_id`, `planner_synced_at` are no longer selectable by
   `authenticated`/`anon` at all; a new `SECURITY DEFINER` function, `get_event_planner_sync_status(p_event_id)`,
   re-checks `portal_is_global_admin()` and is the only path back to these columns for a real
   platform admin. **Documented pitfall, confirmed live in this repository, worth remembering**: a
   column-level `REVOKE SELECT (col) ... FROM role` has **no effect** while that role still holds
   the table-level `SELECT` grant (Postgres's table-level grant subsumes column REVOKEs) — the
   table-level `SELECT` must itself be revoked and re-granted only on the safe columns for column
   restriction to actually work. Verify via `pg_class.relacl`, not assumption, before trusting a
   column-privilege fix on this schema again.

### 2026-09-15 — Organization & Event Access Foundation (Feature 003): two RLS changes, no schema change

No new table, no column change. Two new, additive RLS policies (both applied via new migration
files; no existing Feature 001/002 migration was modified):

1. **`events_select_org_admin`** (`organization_admin_event_metadata_visibility.sql`) —
   `FOR SELECT USING (is_organization_admin(organization_id))`. Lets an organization `owner`/`admin`
   see event *metadata* (id, name, status, dates, `event_products`) for every event in their own
   organization, without an `event_members` row. Reuses the existing `is_organization_admin()`
   helper verbatim — no new helper function. Deliberately narrow: it is additive to `events` only,
   never to `event_members` or any content table, so it cannot by itself grant workspace/content
   access — that boundary is enforced separately at the application layer
   (`src/lib/eventAuth.ts::requireEventWorkspaceAccess`), live-verified against the exact "org admin
   sees metadata but is denied content" scenario.
2. **`events_insert_creator` / `organizations_insert_creator` tightened**
   (`event_and_organization_creation_admin_restriction.sql`) — a security-compatibility fix, not a
   product change. Both policies were found, during this feature's `/speckit.analyze` pass, to be
   more permissive than intended: `events_insert_creator`'s `WITH CHECK` allowed *any*
   `is_organization_member()` (not just owner/admin) to create an event, and
   `organizations_insert_creator`'s `WITH CHECK` allowed *any* authenticated user (no organization
   membership required at all) to create a new organization. Both were harmless only because
   `middleware.ts` previously admitted only `profiles.global_role = 'admin'` into `/portal` at all;
   this feature widens that admission to customer organization members (see below), which would
   otherwise have silently handed both capabilities to every customer. `events_insert_creator` now
   requires `is_organization_admin(organization_id)` (the existing org-creator fallback clause is
   unchanged); `organizations_insert_creator` now requires `portal_is_global_admin()` — organization
   creation is platform-admin-only, restoring its effective pre-feature scope, not removing a
   capability any customer previously had reachable access to.

**Portal admission** (`middleware.ts`) widened: platform admins unchanged; a customer is now
admitted to `/portal` if they hold ≥1 live `organization_members` row (previously, only
`global_role = 'admin'` was admitted at all — every non-admin, including real organization
customers, was blocked outright). A customer with zero memberships is routed to a new
`/portal/no-access` page rather than `/unauthorized`. Admission uses a new, similarly 60s-cached
cookie (`portal_org_membership_cache`) purely as a UX optimization, exactly like the existing
`portal_role_cache` — never as authorization evidence for any specific organization/event/product;
every resource-level read remains fully RLS-governed.

**No table's row-level security was broadened for content access.** `event_members` and every
content table's existing policies are byte-for-byte unchanged.

### 2026-09-16 — Organization Product Entitlements & Event Product Foundation (Feature 002)

Foundational, schema-only feature — no UI, no API routes, no change to the current Bendie
experience. Introduces the data layer needed to represent a multi-product Portal (Bendie / Bendie
Planner / both) before any product-aware navigation or provisioning is built.

**`organization_members` was NOT created by this feature — it already existed live**
(composite `(organization_id, user_id)` PK, a `role` `CHECK` constraint covering
`owner`/`admin`/`member`/`attendee`/`facilitator`/`staff`, and the `is_organization_member()`/
`is_organization_admin()` RLS helper functions, already used across 9 existing files). This
feature only reads it, through its own pre-existing helpers, for the new RLS policies below.

**New tables:**

1. **`organization_products`** — "what products has this organization been granted?" Composite PK
   `(organization_id, product_key)`; `product_key text CHECK IN ('bendie','planner')`;
   `is_active boolean default true`; `enabled_at`, `enabled_by uuid FK → profiles.id`. RLS:
   platform-admin-only write (`portal_is_global_admin()`), plus a `SELECT`-only policy for a
   member of that organization (`is_organization_member(organization_id)`) — no self-service
   write path exists for any organization role.
2. **`event_products`** — "what products does this event use?" Composite PK
   `(event_id, product_key)`, plus a denormalized `organization_id uuid NOT NULL` and a composite
   `FOREIGN KEY (organization_id, product_key) REFERENCES organization_products (organization_id,
   product_key)` — a real, unbypassable database constraint making it impossible for an event to
   use a product its own organization isn't entitled to. `organization_id` is kept honest against
   the event's real `events.organization_id` by a `BEFORE INSERT/UPDATE` trigger
   (`enforce_event_product_org_consistency()`), directly modeled on the existing
   `event_members.enforce_event_member_integrity()` trigger. Same RLS shape as
   `organization_products`.
3. **`organization_planner_links`** — "which existing Bendie Planner organization does this Portal
   organization correspond to?" `organization_id uuid PRIMARY KEY` (at most one mapping per Portal
   organization) and `planner_organization_id bigint NOT NULL UNIQUE` (tenant isolation — the same
   Planner organization can never be mapped from two different Portal organizations). Plain
   `bigint`, no FK — cross-project, matching `event_planner_links.planner_event_id`'s existing
   precedent exactly. RLS: platform-admin-only for both read and write (no member-read policy on
   this one table — it exposes a Planner-internal identifier with no approved non-admin reader).

**Backfill** (derived from real existing data only, never a blanket grant): every organization
with ≥1 existing event received a `bendie` entitlement; every organization with ≥1 event carrying
an *active* `event_planner_links` row additionally received a `planner` entitlement; every
existing event received matching `event_products` rows. Two-phase and order-dependent within one
migration (organization entitlements before event product rows, since the composite FK requires
the former to exist first).

**`event_planner_links` (feature 001) is completely untouched** — same schema, same semantics,
same rows. An event using both products does not, by itself, create or imply a link — that remains
feature 001's separate, manual mechanism.

**Documentation note, flagged not resolved (unchanged from the 2026-09-11 entry):** this changelog
entry also duplicates into `context/updatedmobilefeatures.md` — not resolved here either.

### 2026-09-11 — Bendie Planner integration: new table + tracking columns, cross-project (no FK)

**New portal-managed table:**

1. **`event_planner_links`** — one row per Portal event that has ever been linked to a Bendie
   Planner event (a separate Expo app + separate Supabase project — `planner_event_id` is a plain
   `integer`, **not** a foreign key, since it can't reference another project's database).
   `event_id uuid PK/FK → events.id`, `planner_event_id integer NOT NULL`, `planner_event_title
   text`, `is_active boolean default true`, `linked_by uuid FK → profiles.id`, `created_at`,
   `updated_at`. Uniqueness is a **partial unique index** on `planner_event_id` `WHERE is_active =
   true` (not a plain `UNIQUE` constraint) — unlinking is a soft `is_active = false` update, and an
   inactive row must not permanently block a different Portal event from linking to that same
   Planner event later. RLS: admin-only `FOR ALL`, same simple pattern as migrations `006`-`009`/
   `012`/`013` — no non-admin reader exists for this table (unlike `agenda_sessions`/`facilitators`/
   etc., which need the dual `is_event_member()` pattern because the mobile app's attendees also
   read them).

**New tracking columns (all nullable, all cross-project references with no FK):**

2. **`profiles.planner_profile_id`** (`uuid`) — the Bendie Planner project's own `profiles.id` for
   this person, once resolved/created by an email-based identity bridge (the two projects have
   entirely separate `auth.users` realms).
3. **`event_members.planner_assignment_id`/`planner_synced_at`/`planner_sync_status`/
   `planner_sync_error`** — tracks whether a staff-tier member (host/organizer/admin/facilitator/
   staff/speaker — **never** ordinary attendees) has been made available in the linked Planner
   event, and the outcome (`succeeded`/`failed`/`skipped`) surfaced to admins on the new
   "Bendie Planner" tab.
4. **`agenda_sessions.planner_agenda_item_id`/`planner_synced_at`** — tracks whether a session has
   been pushed to Planner's `event_agenda_items`, so a repeat push updates the same row instead of
   duplicating it. Push is one-directional and manual (Portal → Planner) — Planner content is
   never deleted just because the Portal-side session was removed.
5. **`attendee_travel_details.source_planner_key`/`synced_from_planner_at`** — marks a row as
   pulled from Planner (flight/hotel data only; ground transfer deferred) rather than entered
   manually. `source_planner_key` participates in a **plain** `UNIQUE (event_id,
   source_planner_key)` constraint (corrected during T033 — not a partial index) so a repeat pull
   upserts instead of duplicating: Postgres allows multiple `NULL`s under a plain unique
   constraint, so manual rows (`source_planner_key IS NULL`) remain valid without needing a partial
   predicate, and unlike a partial index, a plain constraint can be targeted directly by
   PostgREST's `onConflict: 'event_id,source_planner_key'`. Two new **restrictive** RLS policies
   block any client-side `INSERT`/`UPDATE` of a row with `source_planner_key IS NOT NULL` —
   `SELECT` and `DELETE` are deliberately left governed by the table's existing policies only.

**Documentation note, flagged not resolved:** this changelog entry duplicates into
`context/updatedmobilefeatures.md`, which appears to carry the same content as this file — that
duplication predates this feature and was flagged during this feature's architecture validation;
resolving it is a separate task, not something this entry attempts to fix.

### 2026-08-18 — Full RLS audit: enablement confirmed everywhere, 4 write-access gaps fixed

Ran a complete sweep of every table in the schema (not just tables touched this session), per an
explicit "make sure the backend is secured" request.

**Confirmed, no change needed:** all 49 tables in `public` have RLS enabled — no exceptions. The
one table that looked alarming at a glance, `meeting_requests` (RLS enabled, zero policies), is
correct as-is: it's written to exclusively by the `submit-meeting-request` edge function using the
service-role key (which bypasses RLS by design), and having zero client-facing policies correctly
means no one can read or write it directly through the API. Also re-hardened
`link_all_existing_facilitators()` (the admin backfill utility) after finding it was callable by
`anon` — see the entry below.

**Fixed — 4 tables where a portal session authenticated as a specific event's host/organizer
(not a global admin) could not write at all**, even though every sibling/parent content table
allows it. Each now has the missing event-scoped write policy, matching its parent table's
existing convention:

| Table                    | Section | Now writable by                                                                           |
| ------------------------ | ------- | ----------------------------------------------------------------------------------------- |
| `activity_images`        | §3      | any event member (matches `activities`)                                                   |
| `emergency_images`       | §7      | any event member (matches `emergency_contacts`)                                           |
| `event_interest_options` | §9      | event host/organizer (matches the structural tier of `excursion_categories`/`news_items`) |
| `game_questions`         | §10     | any event member (matches `games`)                                                        |

**Tightened — 1 table open to any authenticated user across any event.**
`agenda_session_speakers` (§4) previously had a single blanket policy (`USING true, WITH CHECK
true`) letting any signed-in user reassign speakers on any session in any event, unrelated to
their own. Confirmed no app code writes to this table (read-only in `domains/agenda`) before
tightening it to event host/organizer-only, matching its role as a portal-only "Agenda editor"
field per §4's own description.

**Flagging, not changed — confirm with your team:** `organization_assets`, `team_members`, and
`teams` (§11) are writable **only** by `portal_is_global_admin()` — no event- or
organization-scoped alternative exists for any of the three. Unlike the 4 tables above, this
looked like it could be intentional (organization/team management is a higher-trust tier than
per-event content, and §11 already describes this layer as "already portal-managed" with no
caveat), so it was left as-is rather than guessed at. **If your portal ever needs to manage teams
or org assets from a plain event-organizer session (not global-admin), tell us — that needs the
same kind of fix as the 4 tables above.**

### 2026-08-18 — Facilitator CSV import confirmed as the only portal input path

**No schema change — operational note, flagging a likely gap:** confirmed with the team that the
portal populates `facilitators` (§2) exclusively via CSV upload, not a web form. This means
`role_type` and `linkedin_url` — both added 2026-08-14 and fully supported by the app — are only
actually settable by an organizer if the CSV template includes columns for them. **Action needed:
verify the CSV parser/template has been updated since 2026-08-14, or these two fields remain
unreachable from the portal despite being fully built app-side.**

### 2026-08-18 — Leaderboard feedback rule, games event-scoping fix, Files upload model confirmed

**Behavior change, no schema change (except the `game_points.action_type` allow-list, widened):**

1. **Leaderboard "Scanning the QR code at the exhibitor booth" replaced with "Giving feedback about
   the event"** (§10, updated) — no QR-scan feature exists anywhere in the schema, so this was
   swapped for a real, awardable action instead. Awarded when the user taps "Give Feedback"
   (`app/feedback.tsx`), not on completing the form (which is an external WebView the app can't
   observe). Deduped to award-once-per-event — verified directly against the database, not just
   assumed from the constraint definition.
2. **`getGames()` now filters by `event_id`** (§10, updated) — previously flagged repeatedly across
   this doc's history and never actually fixed. A game created for one event no longer leaks into
   every other event's Interactives hub. Strict filter, not the null-means-global convention used
   elsewhere, since `games.event_id` defaults to a real event id on insert.
3. **Files bucket upload model confirmed, not a gap** (§12, updated) — `event-files` is
   intentionally portal-upload-only; attendees only ever read/download in-app. The RLS already
   enforced this; the doc previously implied an app-side TODO that doesn't actually exist. No
   in-app upload UI is needed.

**Discovered in passing, not fixed — flagging only:** a fully-built but completely unused
`feedback` table + `submitFeedback`/`useFeedback` hook exist in `domains/support/` with no screen
calling them — an apparent abandoned earlier attempt at an in-app feedback form, superseded by the
external WebView. See §10 for detail.

### 2026-08-14 — News Feed page connected to a real backend

**New portal-editable table:**

1. **`news_items`** (§3c, new section) — the News Feed page (Featured News + More Stories +
   article detail) was 100% hardcoded until today. Key design points, all explained in full in
   §3c: `is_featured` supports **any number** of featured articles, not just one; `body` is a
   single textarea field with paragraphs separated by a blank line, not an array; `published_at`
   replaces hand-written "2 min ago"/date strings — both are now computed client-side from one
   timestamp; writes are organizer-only (news is official content, unlike excursions/faqs).
2. **"Register Now" is an external link (`registration_url`), not an in-app form** — see §3c for
   the full reasoning. This was an open design question this session; the short version: real
   registration for this org happens via QR code or the portal itself, not self-service in-app, so
   the button just opens whatever URL the portal sets per article (or stays disabled if blank).
3. **The News Feed's Filter button now works** — previously had no `onPress` handler at all. It's
   now a theme multi-select filter, sourced from the same `themes` field used on the article detail
   page's "Summit Themes" list.

**Sample/test data:** the 4 previously-hardcoded articles were seeded as real global rows so the
page looks the same as before; 2 of them (Coca-Cola Africa Summit, Microsoft AI Tour) are marked
`is_featured = true` to demonstrate the multi-featured behavior concretely rather than just in
theory.

### 2026-08-14 — Expo Directory verified end-to-end; per-event data scoping confirmed

**No schema change — verification + data fix + sample data:**

1. **Expo list card + detail page confirmed already wired** (§3b) — image/name/summary/chips on
   the list, and image/`intro`/"Call Booth"/`offering`/Team Lead contact block on the detail page,
   all already read real `expo_spaces` columns. No code changes were needed.
2. **Data fix:** all 3 seed orgs had identical `is_exhibitor`/`is_sponsor` flags (both `true`),
   which made the Exhibitors/Sponsors tabs look broken — switching tabs showed the same 3 orgs
   either way. Corrected to a realistic mix (see §3b) so the tabs now visibly differ.
3. **Event-scoping confirmed** (§0, updated) for `agenda_sessions`/`excursions`/`expo_spaces`
   together, per explicit request — verified by adding event-specific sample data to "Stawi Escape"
   (an exhibitor, "Stawi Experiences Booth") and confirming it's invisible to every other event
   while the 3 global orgs remain visible everywhere.

### 2026-08-14 — Excursions tabs are now portal-managed, open-ended categories

**New portal-editable table:**

1. **`excursion_categories`** (§3a, rewritten) — new table backing the Excursions page's tabs
   (previously a hardcoded 3-item `Restaurants`/`Malls`/`Wildlife` array in
   `domains/excursions/presentation/screens/excursions.tsx`, and a matching 3-value CHECK
   constraint on `excursions.mode`). The portal can now add, rename, reorder, or remove tabs
   directly — the app derives the tab row entirely from this table, with no fixed limit on how
   many categories exist. Each category can have an icon (Ionicons name or emoji, same convention
   as `events.theme_icon`).

**Changed field:**

2. **`excursions.mode` → `excursions.category_id`** — the old 3-value CHECK-constrained `mode`
   column was dropped and replaced with a real foreign key into `excursion_categories`. All 9
   existing rows were migrated with zero data loss (verified by re-querying every row's new
   category after the migration). **If your portal code still writes `mode`, it needs to switch to
   writing `category_id`** (pointing at the appropriate `excursion_categories.id`) instead.

**Verified, no change:** the Excursions search box was checked end-to-end — it's a live
filter-as-you-type over title/description within the active tab, not a separate submit button, and
was already working correctly; no fix was needed there.

### 2026-08-14 — Facilitator LinkedIn links wired up

**New portal-editable field:**

1. **`facilitators.linkedin_url`** (§2, new row) — new `text` column. The app (`facilitator.tsx`'s
   "Open LinkedIn" button, and `attendeesprofile.tsx` when viewing a facilitator) already reads
   `raw.linkedin_url` with a fallback to the linked profile's own `linkedin_url` — the column
   simply never existed until today. Lets the portal give a facilitator their own LinkedIn link
   before that person has ever signed in (same "headless" pattern as the rest of this table — see
   `claim_status`/`user_id` above).
2. Also fixed: `get_homepage_data_v2` (the same hardcoded-column-list RPC as the `role_type` fix
   below) now returns both `facilitators.linkedin_url` and the joined `profiles.linkedin_url`.

**Not new portal content, flagging only:** `profiles.linkedin_url` also went live today, but it's
attendee self-service (edited via the in-app Edit Profile screen), not organizer/portal content —
intentionally not added as a portal-editable field here. It existed as an unapplied migration file
since 2026-08-10 with a full editing UI already built around it (`editprofile.tsx`,
`networking.repository.ts`) that had been silently degrading via a missing-column fallback the
whole time — applying it was a bug fix, not new scope.

### 2026-08-14 — Speakers vs. Presenters now backed by a real field

**New portal-editable field:**

1. **`facilitators.role_type`** (§2, new row) — new `text`, CHECK `('speaker','presenter')`,
   default `'speaker'`. The homepage's Speakers/Presenters tabs (`app/(tabs)/index.tsx`) always
   existed as UI, but had no real backing field — it fuzzy-matched the literal substring
   `"presenter"` against `facilitator_group`/`job_title`/etc., none of which any real event's data
   has ever actually contained (`facilitator_group` is used for panel/track labels like `"Panel 2"`,
   `"Keynote Speakers"` instead). **The Presenters tab has therefore been empty for every real event
   until today.** The homepage now reads this field directly instead of guessing. Every existing
   facilitator defaulted to `'speaker'` (zero behavior change for existing data — the Presenters tab
   stays empty until the portal actually assigns someone as a presenter).
2. Also updated: the `get_homepage_data_v2` RPC (`SECURITY DEFINER`, same one that feeds the whole
   homepage) hardcodes its own facilitators column list rather than `select *` — `role_type` had to
   be added there explicitly too, same class of gap as the `agenda_sessions_summary` view fix below.

**Sample/test data added (not a schema change):** one facilitator ("Grace Muthoni", Product Demo
Lead) added to the live "Stawi Escape" event with `role_type='presenter'`, alongside its 5 existing
speakers, for in-app testing of the new tabs.

### 2026-08-13 — Breakout rooms wired up (was previously non-functional for every live event)

**New portal-editable field:**

1. **`agenda_sessions.breakout_rooms`** (§4, new row) — new `jsonb` column. Lets a session offer
   multiple parallel breakout rooms that an attendee picks between in-app (`app/agendadetails`'s
   "Choose room" picker). This UI has existed for a while, but **no real column ever backed it for
   a live event** — it only ever worked against local demo-account dummy data. Discovered and fixed
   while building sample breakout data for the "Stawi Escape" event.

**Bug fix, not new content — flag if you rely on portal read-side data from `agenda_sessions_summary`:**

2. The `agenda_sessions_summary` view (the primary read path for the Agenda tab and homepage) was
   missing `event_id`, `block_type`, and `attendee_count` entirely — a fix for this was already
   written in `supabase/homepage_performance.sql` but had never actually been applied. Because the
   app's own queries request those columns, every real-event agenda fetch was silently erroring and
   falling back to a slower multi-query path — which is also why `breakout_rooms` (once added)
   would not have reached the app without this fix. Both gaps are now closed via
   `supabase/migrations/20260813124447_add_breakout_rooms_to_agenda_sessions.sql` and
   `.../20260813124734_add_attendee_count_to_agenda_sessions_summary_view.sql`. No portal action
   needed — this was purely a backend reliability fix — but it means `event_type`'s teambuilding
   agenda-grouping behavior (documented in §1e) may not have been fully reliable before today either;
   worth a spot-check if you saw odd agenda grouping previously.

**Sample/test data added (not a schema change):** one breakout-enabled session ("Breakout: Choose
Your Track", 3 rooms) added to the live "Stawi Escape" event, plus a sample flight + ground-transfer
row in `attendee_travel_details` (§4a) for `edwin@stawiexperiences.com`, for in-app testing.

### 2026-08-13 — Homepage facilitator display + flexible theme icon

**Behavior change, no schema change (except `theme_icon`'s accepted values, widened):**

1. **Homepage Speakers/Presenters split now skipped for teambuilding events** (§1e,
   `event_type` row updated) — `app/(tabs)/index.tsx` used to always show two tabs
   ("Speakers"/"Presenters", split by keyword-matching `facilitators.group`/`speaker_type`/etc.
   against "presenter"). For `event_type = 'teambuilding'` it now shows one flat "Facilitators"
   list instead — teambuilding events are almost always facilitator-only. Conference/hybrid events
   keep the two-tab split unchanged. **No portal action needed** — this reads the existing
   `event_type` field, just add "affects the homepage facilitator tabs, not only the agenda" to
   your mental model of what that field controls.
2. **`events.theme_icon` now accepts an emoji, not just an Ionicons glyph name** (§1b, row
   updated) — previously any value that wasn't a real Ionicons icon name silently failed to render
   next to the theme pill on the homepage. `app/(tabs)/index.tsx` now checks
   `Ionicons.glyphMap` first; if the value isn't a recognized glyph name it's rendered as plain
   text instead, so a single emoji character works exactly as well as `"flash"` or `"people"` did
   before. **Portal action:** the icon picker no longer needs to restrict input to a fixed Ionicons
   list — a free-text/emoji-picker field is fine now, existing Ionicons-name values keep working
   unchanged.

**Data change (not a schema change):** the live `Watuhub Teambuilding` event
(`old-mutual-teambuilding-2026`) was converted from `event_type='conference'` to the "Teambuilding
— in-house" preset from §1f: `event_type='teambuilding'`, `networking_mode='attendees_only'`,
`interests_enabled=false`.

### 2026-08-13 — Per-event audience presets & configurable menu items

**New portal-editable field:**

1. **`events.disabled_menu_items`** (§1e) — new `text[]` column, default `'{}'`. Lets an
   organizer hide up to 8 optional menu items per event (Excursions, Expo, News, Interactives,
   Event Photos, Files, Feedback, Info Center) without a code change. A CHECK constraint
   (`events_disabled_menu_items_known_keys`) restricts values to that fixed set — the portal
   should render this as checkboxes against the list, not freeform text entry.

**No schema change — new portal guidance only:**

2. **Audience presets** (§1f, new section) — documents how to combine the existing `event_type` /
   `networking_mode` / `interests_enabled` fields to express "internal" (people already know each
   other — skip networking + the interests questionnaire) vs "external" (full networking) vs
   "teambuilding, in-house" vs "teambuilding, outbound/multi-location". A 4th `events.audience`
   column was considered and deliberately rejected, to avoid a second source of truth the app
   would also have to read — the portal should offer this as a labeled preset picker over the
   existing three fields instead.

**Known limitation flagged, not fixed:** `app/navbar.tsx` (the bottom 5-tab bar — Home / Agenda /
Gallery / FAQ / Info) is hardcoded and does not read any event field. Gallery and Help/FAQs were
deliberately left out of `disabled_menu_items`'s allowed values because hiding them from the
drawer menu while the tab bar still links there would be an inconsistent state. If you want those
two hideable as well, `navbar.tsx` needs to become data-driven first — flag to the team if wanted.

### 2026-08-13 — Backend restructure + Phase 8 backend connections

**Path references throughout this doc were stale and have been corrected.** The codebase went
through a structural restructure since this doc was last compiled: `services/*.ts` and
`hooks/*.ts` mostly became re-export shims, with the real logic now under
`domains/<domain>/infrastructure/supabase/*.repository.ts` and
`domains/<domain>/application/hooks/*.ts`; `lib/*.ts` and `shared/*.ts` merged into `platform/*.ts`.
If you're reading old notes that mention `services/gameService.ts` or `lib/currentEvent.ts`, the
same logic now lives at `domains/games/infrastructure/supabase/game.repository.ts` and
`platform/currentEvent.ts` respectively.

**New portal-editable content types** (did not exist in the schema before today):

1. **Excursions** (§3a) — local activity recommendations (restaurants/malls/wildlife). New
   `excursions` table. Currently seeded with 9 generic Nairobi-area entries as global content
   (`event_id null`) — the portal can override per-event or edit the global set.
2. **Expo Directory / Exhibitor spaces** (§3b) — new `expo_spaces` table. **Data model note:**
   this is one row per organization with `is_exhibitor`/`is_sponsor` boolean flags, not separate
   exhibitor/sponsor rows — an org can be marked as either, both, or neither.
3. **Attendee Travel Details** (§4a) — new `attendee_travel_details` table. **This is
   organizer-populated, not attendee self-service** — there's no in-app UI for an attendee to
   enter their own flight/transfer info, only a read-only display. The portal needs a per-attendee
   editor for this (event picker + attendee picker, then flight/ground-transfer rows).

**New system-generated content** (attendee actions the app now tracks — read-only /
moderation-only for the portal, not something organizers "populate"):

4. **Session Ratings** (`session_ratings` table) — attendees can now rate agenda sessions 1–5
   stars; previously this UI existed but silently discarded the rating on app restart (no real
   table existed). Own-row RLS today (a rating is private feedback, not shown to other
   attendees) — if you want an aggregate "average rating per session" view in the portal, that
   needs a new `SECURITY DEFINER` RPC (matching the `get_leaderboard` pattern in §10), since the
   current RLS won't let a portal admin session read other users' individual rows directly
   unless the admin bypass is added the same way it was for `attendee_travel_details` — **flag
   this if you want it, it wasn't added by default.**
5. **Leaderboard points** (`game_points` table + RPCs) — see §10, fully rewritten section.

**Storage:** a 4th bucket now exists — `event-files` (§12, updated).

**Verified, no schema change:** `events.event_type` (§1e) — confirmed still exactly
`conference` (default) / `teambuilding` / `hybrid`, with a live CHECK constraint enforcing those
three values, and confirmed to genuinely change app structure (agenda grouping by `block_type`
instead of time, profile/facilitator screens branching their layout) across 6 screens.

**Also reconciled (no schema change, git-only):** 9 migrations that were already live in
production but missing from `supabase/migrations/` were pulled from
`supabase_migrations.schema_migrations` and committed — this is the `teams`, `organization_assets`,
`organization_audit_log`, `event_content_audit_log`, and `portal_is_global_admin()` admin-bypass
layer your portal already uses. Nothing here changed; git now just accurately reflects what was
already running.

---

## 0. How event-scoping works (read this first)

- Every content table has an `event_id uuid` column, FK to `events.id` (some, like
  `excursions`/`expo_spaces`, allow `event_id null` to mean "global, shown for every event").
- The client resolves "which event am I looking at" via `profiles.current_event_id`
  (`platform/currentEvent.ts` → `getCurrentEventId()`), which is set when a user joins an event
  (access code or slug walk-in).
- Almost every `domains/*/infrastructure/supabase/*.repository.ts` read function takes an
  optional `eventId` and falls back to `getCurrentEventId()`, then does `.eq('event_id', eventId)`
  (or, for tables that support global rows, `.or('event_id.is.null,event_id.eq.<id>')`).
- **Confirmed 2026-08-14 for `agenda_sessions` (§4), `excursions` (§3a), and `expo_spaces`
  (§3b) specifically** — each event genuinely gets its own data, not shared/static content:
  `agenda_sessions.event_id` is required (every session belongs to exactly one event, no global
  concept); `excursions`/`expo_spaces` merge each event's own scoped rows with the global
  (`event_id null`) fallback set, verified end-to-end by adding an event-specific breakout session
  and an event-specific exhibitor to "Stawi Escape" and confirming they appear only there, not on
  other events.
- **Implication for the portal:** every editor screen needs an event-picker at the top (the portal
  operator manages one or more events, scoped by `organization_id` via `organization_members` /
  `event_members` with role `host`/`organizer`/`admin`), and every write must stamp the correct
  `event_id` — except for tables where you deliberately want a global/shared row (`event_id null`),
  which the portal should expose as an explicit "apply to all events" toggle rather than a default.

---

## 1. `events` — Identity, Hero, Theme & Feature Config

**This is the single highest-value table for the portal.** One row = one event's entire
presentation layer. Confirmed live in `domains/events/application/hooks/useActiveEvent.ts`,
`app/(tabs)/index.tsx`, `assets/styles/global/color.ts`.

### 1a. Identity & lifecycle (core, likely portal-editable with guardrails)

| Field                   | Type                                                               | Notes                                                                                                                                      |
| ----------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`                    | uuid PK                                                            | system-generated, never edited                                                                                                             |
| `organization_id`       | uuid FK → organizations                                            | set at event creation, not editable after                                                                                                  |
| `name`                  | text, required                                                     | event's canonical name                                                                                                                     |
| `slug`                  | text, unique                                                       | used in QR/deep-link join flow (`evently://join?event_slug=...`) and walk-in join (`join_event_by_slug`). **Must stay URL-safe & unique.** |
| `description`           | text                                                               | fallback for `hero_description`                                                                                                            |
| `location`              | text                                                               | shown in showcase list (`EVENT_SHOWCASE_COLUMNS`)                                                                                          |
| `status`                | text enum: `draft`, `published`, `active`, `completed`, `archived` | drives which events show up in "ongoing"/"upcoming" showcase queries                                                                       |
| `attendee_limit`        | integer, nullable                                                  | capacity                                                                                                                                   |
| `starts_at` / `ends_at` | timestamptz                                                        | drives ongoing/upcoming classification (`platform/eventClassification.ts`)                                                                 |
| `image_url`             | text                                                               | fallback hero image; also shown in event showcase cards                                                                                    |
| `created_by`            | uuid FK → profiles                                                 | system, not editable                                                                                                                       |

### 1b. Hero / homepage presentation (portal-editable — directly drives `app/(tabs)/index.tsx`)

| Field                      | Type                                                                 | Fallback behavior if null                                                                                                                                                                                                                                                                    |
| -------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hero_title`               | text                                                                 | falls back to `name`                                                                                                                                                                                                                                                                         |
| `hero_description`         | text                                                                 | falls back to `description`                                                                                                                                                                                                                                                                  |
| `hero_image_url`           | text (image)                                                         | falls back to `image_url`, then a bundled default image                                                                                                                                                                                                                                      |
| `category_label`           | text                                                                 | pill shown over hero image; defaults to `"Event"`                                                                                                                                                                                                                                            |
| `theme_label`              | text                                                                 | right-side hero pill (e.g. "Energy"); **pill is hidden entirely if null**                                                                                                                                                                                                                    |
| `theme_icon`               | text — Ionicons icon name **or a single emoji** (widened 2026-08-13) | shown next to `theme_label`; defaults to `"flash"`. The app checks `Ionicons.glyphMap` first and falls back to rendering the value as plain text if it isn't a recognized icon name — the portal no longer needs to restrict this field to a fixed icon list, a free-text/emoji picker works |
| `profile_banner_image_url` | text (image)                                                         | banner shown behind user profile screens                                                                                                                                                                                                                                                     |
| `gallery_background`       | text (image)                                                         | defensive/secondary hero fallback                                                                                                                                                                                                                                                            |

### 1c. Theme colors (portal-editable — color pickers, live preview recommended)

| Field             | Type             | Notes                                                                                                                                                                                                                                                                           |
| ----------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `theme_primary`   | text (hex color) | base color; secondary shades (`primaryLight`, `primaryDark`, `onPrimary`, chat bubble tints) are **derived client-side** in `platform/themeColors.ts` / `assets/styles/global/color.ts` — do not add extra DB columns for these, just expose primary/secondary/tertiary pickers |
| `theme_secondary` | text (hex color) | used for text-on-primary contrast + button text                                                                                                                                                                                                                                 |
| `theme_tertiary`  | text (hex color) | tertiary accent                                                                                                                                                                                                                                                                 |

### 1d. Terminology / labels (portal-editable — plain text inputs)

| Field                        | Type | Notes                                                              |
| ---------------------------- | ---- | ------------------------------------------------------------------ |
| `facilitator_label_singular` | text | e.g. "Speaker", "Coach", "Facilitator"; defaults to "Speaker"      |
| `facilitator_label_plural`   | text | e.g. "Speakers", "Coaches"; used for section titles & empty states |

### 1e. Feature toggles (portal-editable — dropdowns/switches, changes app behavior)

**Verified 2026-08-13** directly against the live `events` table (CHECK constraints + code
grep) — this section was cross-checked, not assumed.

| Field                  | Type                                                                                                                                                | Values / effect                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `event_type`           | text, CHECK enum `('conference','teambuilding','hybrid')`, default `'conference'`                                                                   | `conference` groups the agenda by time; `teambuilding` groups by `agenda_sessions.block_type` instead, **and (2026-08-13) also collapses the homepage's Speakers/Presenters tabs into a single "Facilitators" list**; `hybrid` exists in the constraint but no code branch currently treats it differently from `conference` — confirm with the team before relying on `hybrid` doing anything distinct today. Confirmed live in `app/(tabs)/index.tsx`, `domains/agenda/presentation/screens/{agenda-tab,agendadetails,agenda-attendees}.tsx`, `domains/facilitators/presentation/screens/facilitator.tsx`, `domains/profile/presentation/screens/{profile,attendeesprofile}.tsx` — all branch on `event?.event_type === "teambuilding"`. |
| `networking_mode`      | text, CHECK enum `('full','attendees_only','disabled')`, default `'full'`                                                                           | `full` = matches + connections + attendees tabs; `attendees_only` = attendees list only, no match bar/connect button, menu relabeled "Attendees"; `disabled` = networking menu entry hidden entirely                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `interests_enabled`    | boolean, default `true`                                                                                                                             | if `false`, post-signup interests questionnaire (`domains/networking/presentation/screens/interests.tsx`) is skipped and setup routes straight to `/(tabs)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `in_house`             | boolean, default `false`                                                                                                                            | flips copy in the interests form ("Department / Business Unit" vs "Organization Name")                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `gallery_external_url` | text (url)                                                                                                                                          | if null, the "Event Photos" external CTA button is hidden                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `feedback_form_url`    | text (url)                                                                                                                                          | external feedback form link (e.g. Typeform/Google Form) surfaced on the feedback screen                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `disabled_menu_items`  | text[], default `'{}'`, CHECK subset of `{'excursions','expo','news','interactives','event_photos','files','feedback','info'}` (**NEW 2026-08-13**) | organizer checklist to hide optional menu items per event. `Home`/`Agenda`/`Chats`/`Notifications`/`Settings`/`Emergency Points` are always on and not in this list (core/safety). `Networking` is controlled by `networking_mode` above instead, not this array. `Gallery`/`Help-FAQs` are excluded because `app/navbar.tsx`'s bottom tab bar is hardcoded and not event-aware yet — see Changelog. Consumed by `app/menu.tsx`'s `MENU_ITEMS.filter`.                                                                                                                                                                                                                                                                                     |

**Portal UX recommendation:** split the Event editor into tabs matching 1a–1e above: **Basics**,
**Hero & Branding**, **Theme Colors** (with live preview swatch), **Terminology**, **Feature
Toggles**.

---

## 1f. Audience presets — combining `event_type` / `networking_mode` / `interests_enabled` — NEW 2026-08-13

There is no single "internal/external" field, deliberately (see Changelog above) — the app only
ever reads `event_type`, `networking_mode`, and `interests_enabled` (all in §1e). Instead, the
portal's event editor should offer a labeled **preset picker** that sets those three fields
together, plus a "Custom" option for anything that doesn't fit one of the presets below:

| Preset                  | `event_type`                   | `networking_mode`              | `interests_enabled` | When to use                                                                                                                                                                                                           |
| ----------------------- | ------------------------------ | ------------------------------ | ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| External / conference   | `conference`                   | `full`                         | `true`              | Typical external conference — attendees are largely strangers; full matchmaking + interests questionnaire.                                                                                                            |
| Internal                | `conference` or `teambuilding` | `attendees_only` or `disabled` | `false`             | Attendees already know each other. Use `attendees_only` to keep a simple attendee directory (menu item relabeled "Attendees", no match-score/connect UI); use `disabled` to remove the Networking menu item entirely. |
| Teambuilding — in-house | `teambuilding`                 | `attendees_only`               | `false`             | Single-location team offsite. This exact combination is already live for the demo event in `supabase/migrations/20260601_seed_demo_teambuilding_event.sql`.                                                           |
| Teambuilding — outbound | `teambuilding`                 | `full`                         | `true`              | Same company but multiple locations/teams that don't already know each other — needs full networking despite being structurally a teambuilding event.                                                                 |

`event_type` (agenda structure) and the networking-scope fields (whether attendees are strangers)
are **independent axes** — don't let the portal UI assume "teambuilding" implies "internal"; the
outbound row above is exactly why these are two separate decisions, not one.

---

## 2. `facilitators` — Speakers/Coaches directory

Event-scoped (`event_id`). Portal-editable directory; independent of `profiles` — a facilitator
row can exist **before** the person has an account (see `claim_status`).

**Portal input mechanism (confirmed 2026-08-18): CSV import only** — the portal populates this
table exclusively via a CSV upload, not a per-field web form. **Practical consequence: `role_type`
and `linkedin_url` (both added 2026-08-14, below) are only actually usable by an organizer if the
CSV template/parser has been updated to include columns for them.** If the CSV format predates
2026-08-14, those two fields are currently unreachable from the portal even though the app fully
supports them — check the CSV column list before assuming this gap is closed.

| Field               | Type                                                                            | Notes                                                                                                                                                                                       |
| ------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `full_name`         | text                                                                            | portal-editable                                                                                                                                                                             |
| `email`             | text                                                                            | used to match/"claim" the row when that person later signs up                                                                                                                               |
| `job_title`         | text                                                                            | portal-editable                                                                                                                                                                             |
| `organization`      | text                                                                            | portal-editable                                                                                                                                                                             |
| `avatar_url`        | text (image)                                                                    | portal-editable, needs an upload flow (no dedicated storage bucket exists yet — see §12)                                                                                                    |
| `bio`               | text                                                                            | portal-editable                                                                                                                                                                             |
| `facilitator_group` | text                                                                            | grouping/category label (panel/track name, e.g. `"Panel 2"`, `"Keynote Speakers"`) — not the same thing as `role_type` below                                                                |
| `role_type`         | text, CHECK `('speaker','presenter')`, default `'speaker'` — **NEW 2026-08-14** | drives the homepage's Speakers vs. Presenters tabs (`app/(tabs)/index.tsx`). Not derived from `facilitator_group`/`job_title` — set it explicitly                                           |
| `linkedin_url`      | text, nullable — **NEW 2026-08-14**                                             | powers the "Open LinkedIn" button on the facilitator detail screen; falls back to the linked profile's own LinkedIn if this is blank and the person has since signed in and claimed the row |
| `expertise`         | text                                                                            | free text                                                                                                                                                                                   |
| `display_order`     | integer                                                                         | drives sort order in facilitator lists                                                                                                                                                      |
| `claim_status`      | enum: `unclaimed`, `claimed`                                                    | system-managed: flips to `claimed` when a matching `profiles.email` links via `user_id`                                                                                                     |
| `claimed_at`        | timestamptz                                                                     | system-managed                                                                                                                                                                              |
| `user_id`           | uuid FK → profiles, nullable                                                    | system-managed (set on claim)                                                                                                                                                               |

Related: `agenda_session_speakers` (join table: `session_id`, `facilitator_id`, `speaker_type`
enum `speaker`/`panelist`/`moderator`/`facilitator`/`host`, `display_order`) — lets one session
have multiple speakers with roles. This is effectively part of the **Agenda** editor (assign
existing facilitators to a session with a role + order), not a separate content type.

`facilitator_favorites` (user_id, facilitator_id) is user-generated (attendees favoriting a
facilitator) — **not portal content**, exclude from the admin portal.

---

## 3. `activities` + `activity_images` — Activities/Excursions catalog

Event-scoped (`event_id` on `activities`).

**`activities`**

| Field           | Type           | Notes                                              |
| --------------- | -------------- | -------------------------------------------------- |
| `title`         | text, required |                                                    |
| `slug`          | text, unique   | used for detail-page routing (`getActivityBySlug`) |
| `description`   | text           |                                                    |
| `rating`        | numeric 0–5    |                                                    |
| `location`      | text           |                                                    |
| `is_featured`   | boolean        | drives homepage "featured activities"              |
| `display_order` | integer        |                                                    |

**`activity_images`** (one activity → many images)

| Field           | Type                    | Notes                                       |
| --------------- | ----------------------- | ------------------------------------------- |
| `activity_id`   | uuid FK                 |                                             |
| `image_url`     | text                    | needs upload flow                           |
| `image_type`    | enum: `hero`, `gallery` | one hero image + a gallery set per activity |
| `alt_text`      | text                    | accessibility                               |
| `display_order` | integer                 |                                             |

---

## 3a. `excursions` + `excursion_categories` — Local recommendations — NEW 2026-08-13, categories redesigned 2026-08-14

Was 100% hardcoded in the app (`EXCURSION_PLACES` static array) until 2026-08-13; now real,
portal-editable tables. `event_id` is **nullable and null means globally visible to every event**
on both tables — today's 9 seed excursions and 3 seed categories are all global. The portal should
default new rows to "global" but allow scoping to a single event.

**`excursion_categories`** — the tabs shown on the Excursions page (originally a hardcoded
Restaurants/Malls/Wildlife array in the app; now fully portal-managed, and the tab list is
open-ended — add a 4th, 5th, etc. any time by inserting a row here, no app release needed).

| Field           | Type                                  | Notes                                                                                                                                |
| --------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `event_id`      | uuid FK, nullable                     | null = tab shown for every event                                                                                                     |
| `key`           | text, required, unique per `event_id` | stable slug, not shown in the UI directly                                                                                            |
| `label`         | text, required                        | the tab's visible text, e.g. `"Restaurants"`                                                                                         |
| `icon`          | text, nullable                        | Ionicons glyph name **or a single emoji** (same widened convention as `events.theme_icon`, §1e) — shown next to the tab label if set |
| `display_order` | integer, default 0                    | left-to-right tab order                                                                                                              |

RLS: readable same as `excursions` below; **writes are organizer/host/admin-only** (tighter than
`excursions` itself — see the row below) since this defines the page's structure, not a single
piece of content.

**`excursions`**

| Field           | Type                                                                   | Notes                                                                                                                                                                                             |
| --------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event_id`      | uuid FK, nullable                                                      | null = shown for every event; set = shown only for that event (in addition to the global rows)                                                                                                    |
| `category_id`   | uuid FK → `excursion_categories.id`, required — **changed 2026-08-14** | which tab this entry appears under. Was a `mode` text CHECK-constrained to 3 fixed values; that column has been dropped and replaced with this FK so new categories don't require a schema change |
| `title`         | text, required                                                         |                                                                                                                                                                                                   |
| `description`   | text                                                                   |                                                                                                                                                                                                   |
| `image_url`     | text                                                                   | no dedicated upload flow yet — currently populated with Unsplash stock photo URLs, not real venue photos; needs an upload flow same as §12                                                        |
| `display_order` | integer, default 0                                                     | sort order within its category                                                                                                                                                                    |

RLS: readable by event members (or anyone, for global rows) + `portal_is_global_admin()`; writes
restricted to `is_event_member(event_id)` (any event member can currently write scoped rows — this
matches the convention used by `faqs`/`support_contacts`/etc., not organizer-only. Note this is
looser than `excursion_categories`' write policy above — deliberately, individual excursions are
lower-stakes than the tab structure itself; flag if you want excursions tightened to match).

The app's own "Filter" button and card tap were non-functional and have been removed (no filter
modal or detail page exists) — if the portal adds richer per-place detail content later, the app
UI would need a detail view added back to actually show it. The search box (title/description,
scoped to the active tab) is live-filter-as-you-type, not a submit button — confirmed working as
of 2026-08-14.

---

## 3b. `expo_spaces` — Exhibitor / Sponsor directory — NEW 2026-08-13

Was 100% hardcoded (`EXPO_SPACES` static array, with 3 real orgs duplicated as fake "sponsor"
variants) until today. **Data model: one row per organization**, not one row per
category-membership — an org can be an exhibitor, a sponsor, both, or (later) neither.

| Field                                              | Type                     | Notes                                                                                                                                                                |
| -------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event_id`                                         | uuid FK, nullable        | null = global (shown for every event), same convention as §3a                                                                                                        |
| `name`                                             | text, required           | organization name                                                                                                                                                    |
| `summary`                                          | text                     | one-line summary shown on the list card                                                                                                                              |
| `image_url`                                        | text                     | needs upload flow (see §12)                                                                                                                                          |
| `chips`                                            | text[]                   | short tag list (e.g. `["POS devices", "Loans", "Support"]`) shown on the card                                                                                        |
| `intro`                                            | text                     | detail-page intro paragraph                                                                                                                                          |
| `offering`                                         | text                     | detail-page "What we are offering" body                                                                                                                              |
| `contact_name` / `contact_email` / `contact_phone` | text                     | detail-page "Contacts & Inquiries" block; `contact_phone` also powers a real "Call Booth" button (`tel:` link)                                                       |
| `cta_description`                                  | text                     | currently unused in the UI (the "Open Full Product List" CTA it described was removed as non-functional) — safe to leave blank, or repurpose if you rebuild that CTA |
| `is_exhibitor`                                     | boolean, default `true`  | shows the row under the Exhibitors tab                                                                                                                               |
| `is_sponsor`                                       | boolean, default `false` | shows the row under the Sponsors tab                                                                                                                                 |
| `display_order`                                    | integer, default 0       |                                                                                                                                                                      |

RLS: same event-scoped + admin-bypass shape as §3a.

**Verified 2026-08-14, no schema change:** the full list card (image/name/summary/chips) and detail
page (image, `intro`, "Call Booth" button from `contact_phone`, `offering`, and the Team
Lead/`contact_name`+`contact_email`+`contact_phone` contact block) were confirmed already wired
end-to-end in `domains/expo-directory/presentation/screens/expo.tsx` — no code changes were needed.
**Important data caveat for the portal:** if every org has the same `is_exhibitor`/`is_sponsor`
combination, the two tabs will show identical content and look "broken" even though the filtering
logic is correct — this exact thing had happened to all 3 seed orgs (all marked as both) and has
been corrected to a realistic mix. Make sure the portal's org editor actually varies these two
flags across real exhibitors.

---

## 3c. `news_items` — News Feed page — NEW 2026-08-14

Was 100% hardcoded (a `NEWS_ITEMS` static array) until today; now a real, portal-editable table.
`event_id` is nullable, same global-vs-scoped convention as §3a/§3b.

| Field               | Type                         | Notes                                                                                                                                                                                                                                                           |
| ------------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event_id`          | uuid FK, nullable            | null = global (shown for every event)                                                                                                                                                                                                                           |
| `title`             | text, required               |                                                                                                                                                                                                                                                                 |
| `summary`           | text                         | short preview shown on both the Featured and More Stories cards                                                                                                                                                                                                 |
| `body`              | text                         | the full article. **Paragraphs are separated by a blank line (`\n\n`)** in this one field — the app splits on that to render each paragraph as its own block. Don't model this as an array; a single textarea in the portal is exactly the right input for this |
| `themes`            | text[]                       | shown as a bulleted "Summit Themes" list on the article detail page, and also drives the News Feed's now-functional Filter button (multi-select by theme)                                                                                                       |
| `image_url`         | text                         | needs upload flow (see §12)                                                                                                                                                                                                                                     |
| `is_featured`       | boolean, default `false`     | **any number of items can be featured at once** — this is not a "pick exactly one" field. The Featured News section on the list page renders every `is_featured = true` row                                                                                     |
| `registration_url`  | text, nullable               | powers the article detail page's "Register Now" button — see the design note below                                                                                                                                                                              |
| `read_time_minutes` | integer, nullable            | shown as "N min read"; if left blank the app estimates it from `body`'s word count (~200 wpm), so it's safe to leave empty                                                                                                                                      |
| `published_at`      | timestamptz, default `now()` | drives both the relative "X min/hr/day ago" label (list page) and the formatted date (detail page) — computed client-side from this one timestamp, so don't also ask the portal for a separate "time ago" string                                                |
| `display_order`     | integer, default 0           | list is actually sorted by `published_at desc`, not this column — kept for consistency with other content tables but not currently read                                                                                                                         |

RLS: **organizer/host/admin-only writes** (tighter than §3a/§3b's excursions/expo-spaces, which
allow any event member) — news articles are official announcements/promotional content, not
something any attendee should be able to post. Reads follow the same event-scoped + admin-bypass
shape as everywhere else.

**"Register Now" button — design decision:** real attendee registration for this organization
happens externally (a QR code scan at check-in, or bulk registration through the portal itself) —
not a self-service in-app form, and the portal owner confirmed this explicitly. A news article may
also be promoting a _different_ event entirely (e.g. an external summit), so there's no single
"the current event" registration flow that would even make sense here. `registration_url` is
therefore just an external link, set per article — same convention as `events.feedback_form_url`
/ `events.gallery_external_url`. The button is disabled/dimmed when this is blank (same visual
treatment as the Email/LinkedIn contact buttons elsewhere in the app) rather than doing nothing
silently. If you later want true in-app self-registration, that's a materially different feature
(likely reusing `event_user_access_codes`/`issue_event_access_code`, not this field) — flag it if
you want it scoped.

**Filter button, now functional:** previously had no `onPress` handler at all. Now opens a
bottom-sheet listing every distinct value across all visible articles' `themes`, multi-select,
filtering the list to articles matching at least one selected theme.

---

## 4. `agenda_sessions` + speakers — Event schedule

Event-scoped (`event_id`).

| Field                   | Type                                                                                            | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `title`                 | text, required                                                                                  |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `description`           | text                                                                                            |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `starts_at` / `ends_at` | timestamptz, required                                                                           |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `location`              | text                                                                                            |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `audience`              | enum, default `everyone`                                                                        | agenda filter ("Everyone" vs "For You" in `domains/agenda/presentation/screens/agenda-tab.tsx`)                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `accent_color`          | text (hex)                                                                                      | per-session color chip                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `block_type`            | text enum, nullable: `session`, `activity`, `meal`, `transfer`, `freetime`, `ceremony`, `break` | only meaningful when `events.event_type = 'teambuilding'` — drives grouping instead of strict time blocks                                                                                                                                                                                                                                                                                                                                                                                                            |
| `breakout_rooms`        | jsonb, nullable — **NEW 2026-08-13**                                                            | array of `{id, name, description?, facilitator_name?, agenda: [{id, title, description, starts_at, ends_at, location}]}`. When present and non-empty, the session shows a "Choose room" picker in-app; the attendee picks exactly one room and sees that room's own mini-agenda. Leave `null`/omit for sessions with no breakout rooms. Note: which room an attendee _picked_ is still only tracked client-side in memory, not persisted — don't expect to read attendee room selections back from the database yet. |
| `display_order`         | integer                                                                                         |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `facilitator_id`        | uuid FK, legacy single-speaker column                                                           | superseded by `agenda_session_speakers` join table for multi-speaker sessions, but still read as a fallback                                                                                                                                                                                                                                                                                                                                                                                                          |

`session_attendees` (session_id, user_id, match_percent, action_type) is attendee RSVP/interest
data — **user-generated, not portal content.**

`session_ratings` (session_id, user_id, rating 1–5) — **NEW 2026-08-13**, also user-generated
(an attendee's personal rating of a session; own-row RLS today, not visible to other attendees or
to the portal by default) — **not portal content**, see the Changelog entry above if you want an
aggregate-ratings admin view added.

---

## 4a. `attendee_travel_details` — Per-attendee flight/transfer info — NEW 2026-08-13

**Organizer-populated, not attendee self-service.** The app only ever _reads_ this table
(`getMyAgendaTravelDetails`, shown read-only in the Agenda tab's "Travel Details" panel) — there
is no in-app form for an attendee to enter their own itinerary. Someone (the portal) needs to
input each attendee's travel plans, most likely sourced from an external registration form.

| Field                    | Type                                                    | Notes                                                                                                         |
| ------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `user_id`                | uuid FK → profiles, required                            | which attendee this row belongs to — the portal needs an attendee picker, not just an event picker            |
| `event_id`               | uuid FK, nullable                                       | which event this travel plan is for                                                                           |
| `type`                   | text, CHECK enum `('flight','ground_transfer','other')` |                                                                                                               |
| `title`                  | text                                                    | e.g. flight number or vehicle name; shown as the row's headline                                               |
| `boarding_time`          | text                                                    | free text, not a real timestamp (matches how the app already formats it)                                      |
| `route`                  | text                                                    | e.g. `"NBO -> JFK"` — or use `origin`/`destination` separately and the app will join them if `route` is blank |
| `origin` / `destination` | text                                                    | alternate to a pre-joined `route` string                                                                      |
| `travel_time`            | text                                                    | free text (e.g. "8h 20m" or a time range)                                                                     |
| `pickup_vehicle`         | text                                                    | for `ground_transfer` rows                                                                                    |
| `pickup_location`        | text                                                    |                                                                                                               |
| `date`                   | text                                                    | free text, not a real date column (matches existing app formatting)                                           |

RLS: readable/writable by the row's own attendee (`auth.uid() = user_id`, in case self-service is
ever added later) **and** by the event's host/organizer or a global admin (added 2026-08-13
specifically so the portal can write these) — see the Changelog entry above for why this second
policy set had to be added after the fact.

---

## 5. `faqs` — FAQ page content

Event-scoped (`event_id`). Simple CRUD list.

| Field           | Type           | Notes                                                                        |
| --------------- | -------------- | ---------------------------------------------------------------------------- |
| `section`       | text, required | groups questions (e.g. "What To Wear", "Safety") — list is sorted by section |
| `question`      | text, required |                                                                              |
| `answer`        | text, required |                                                                              |
| `display_order` | integer        |                                                                              |

---

## 6. `support_contacts` — Info Center coordinators

Event-scoped (`event_id`).

| Field           | Type           | Notes                                                      |
| --------------- | -------------- | ---------------------------------------------------------- |
| `name`          | text, required |                                                            |
| `email`         | text           |                                                            |
| `phone`         | text           |                                                            |
| `avatar_url`    | text           | needs upload flow                                          |
| `contact_group` | text           | grouping label, sorted first by group then `display_order` |
| `display_order` | integer        |                                                            |

---

## 7. `emergency_contacts` + `emergency_images` — Emergency/safety page

Event-scoped (`event_id` on both).

**`emergency_contacts`**

| Field           | Type                    | Notes                         |
| --------------- | ----------------------- | ----------------------------- |
| `name`          | text, required          |                               |
| `phone`         | text, required          | tappable call button          |
| `type`          | enum, default `general` | e.g. medical/security/general |
| `image_url`     | text                    | needs upload flow             |
| `location`      | text                    |                               |
| `description`   | text                    |                               |
| `display_order` | integer                 |                               |

**`emergency_images`**

| Field           | Type           | Notes |
| --------------- | -------------- | ----- |
| `image_url`     | text, required |       |
| `caption`       | text           |       |
| `display_order` | integer        |       |

---

## 8. `event_photos` — Photo gallery

Event-scoped (`event_id`). Currently populated by attendees uploading in-app (`uploadEventPhoto`
in `domains/gallery/infrastructure/supabase/event-photos.repository.ts`, stamped with the
uploader's `current_event_id`), but the portal should also let an organizer seed/feature photos
and moderate/delete them.

| Field           | Type               | Notes |
| --------------- | ------------------ | ----- |
| `image_url`     | text, required     |       |
| `caption`       | text               |       |
| `uploaded_by`   | uuid FK → profiles |       |
| `is_featured`   | boolean            |       |
| `display_order` | integer            |       |

---

## 9. `event_interest_options` — Networking questionnaire builder

Event-scoped (`event_id`). **This is the most structurally interesting table for the portal** —
it lets an organizer fully redefine the onboarding networking questionnaire per event
(`domains/networking/presentation/screens/interests.tsx` dynamically reads this to replace
default role/objective/sector options and question labels).

| Field            | Type                                                                                     | Notes                                                                                                                                                                                                                                     |
| ---------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `question_key`   | text, required                                                                           | e.g. `role`, `objectives`, `sectors`, `project_stages`, `location`, `availability`, `investor_ticket_size`, `investor_risk` — also supports custom keys like `transformation_priorities`, `board_exec_discussion` for non-PPP event types |
| `question_label` | text                                                                                     | overrides the default question prompt text                                                                                                                                                                                                |
| `question_type`  | enum: `single_select`, `multi_select`, `short_text`, `long_text`, default `multi_select` |                                                                                                                                                                                                                                           |
| `option_key`     | text                                                                                     |                                                                                                                                                                                                                                           |
| `option_label`   | text                                                                                     | shown as the chip/radio label                                                                                                                                                                                                             |
| `display_order`  | integer                                                                                  |                                                                                                                                                                                                                                           |
| `is_required`    | boolean                                                                                  |                                                                                                                                                                                                                                           |

**Portal recommendation:** build this as a proper form-builder UI (question groups → options),
since today it's rows with no visual grouping — a raw CRUD table would be painful to hand-edit.

`networking_preferences` (the attendee's own answers, persisted via
`domains/networking/infrastructure/supabase/matchmaking.repository.ts`) is **user-generated, not
portal content.**

---

## 10. `games` + `game_questions` — Icebreaker/trivia content, and the Leaderboard

**Rewritten 2026-08-13, `getGames()` event-scoping fixed 2026-08-18** — the leaderboard now runs on
real data; read this section fresh even if you've seen an older version.

`games.event_id` exists in the schema, and **as of 2026-08-18
`domains/games/infrastructure/supabase/game.repository.ts`'s `getGames()` now filters by it** —
previously a game created for one event leaked into every other event's Interactives hub. This is
a strict filter (`.eq('event_id', ...)`), not the null-means-global convention used by
excursions/expo/news, since `games.event_id` defaults to `get_default_event_id()` on insert rather
than being left null for shared content. **Portal action:** always stamp a real `event_id` when
creating a game — there's no "global game" concept here.

**`games`**

| Field              | Type                     | Notes                             |
| ------------------ | ------------------------ | --------------------------------- |
| `title`            | text, required           |                                   |
| `description`      | text                     |                                   |
| `type`             | enum: `jeopardy`, `kmky` | drives which game screen it opens |
| `image_url`        | text                     | needs upload flow                 |
| `background_color` | text (hex)               |                                   |
| `is_active`        | boolean                  |                                   |

**`game_questions`**

| Field            | Type           | Notes                      |
| ---------------- | -------------- | -------------------------- |
| `game_id`        | uuid FK        |                            |
| `category`       | text           | Jeopardy category grouping |
| `question`       | text, required |                            |
| `correct_answer` | text           |                            |
| `answer_options` | jsonb          | multiple-choice options    |
| `points`         | integer        |                            |
| `display_order`  | integer        |                            |

`game_results` (score, answers per user) is **user-generated, not portal content** — and is
currently unused: Jeopardy and KMKY are local pass-the-phone party games with no per-user
identity, so nothing ever calls `saveGameResult`. Left that way deliberately (see below).

### The Leaderboard is now real — `game_points` table (NEW 2026-08-13)

The leaderboard tab used to always show empty (nothing ever wrote to `game_results`, and even if
it had, RLS would have hidden every row but the caller's own). It's been rebuilt to actually award
points, matching exactly what the app's own "How to play" info-modal text already promised
(flat 1 point per action):

| Action                                                                                                                    | Awarded automatically when...                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| New connection in Networking                                                                                              | a `connections` row's `status` becomes `accepted` (both users get a point)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Every new chat per person                                                                                                 | a `chat_participants` row is inserted (i.e. a new chat is created)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Sharing a post on the Gallery                                                                                             | a `posts` row is inserted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Reacting to a post on the Gallery                                                                                         | a `post_likes` row is inserted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Rating a session                                                                                                          | a `session_ratings` row is inserted                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Joining a breakout room                                                                                                   | client calls the `award_game_point` RPC directly (no real table event exists for this one yet — see §4a's sibling gap, breakout room selection is still in-memory client state, not a real table)                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Giving feedback about the event (**NEW 2026-08-18**, replaces the old "Scanning the QR code at the exhibitor booth" rule) | client calls `award_game_point` when the user taps "Give Feedback" (`app/feedback.tsx`) — **not** on actually completing the form. The form itself is an external WebView (`events.feedback_form_url`, e.g. Typeform/Google Form), so the app has no way to observe real submission; tapping through is the closest observable proxy. Deduped to award-once-per-event: the point is keyed to the event id itself as `related_id`, not a per-tap id, so pressing the button repeatedly (or giving feedback multiple times) never awards more than 1 point per event — confirmed by directly testing the dedup constraint. |

**Not implemented** — one rule in the app's own copy still has no backing feature anywhere in the
schema: "Voting in a poll within a session" (no polls table/feature exists at all). This would be
a net-new feature, not a connection fix — flag to product if you want it built. (The previous
second gap, "Scanning the QR code at the exhibitor booth," was replaced with the feedback rule
above rather than built as literally described — no QR-scan tracking exists, and product decided
feedback was the better real signal to reward.)

**Also discovered while wiring this, not part of the fix — flagging only:** a completely separate,
never-used `feedback` table (`favorite_moments`, `app_experience`, `improvements`, `suggestions`,
`user_id`, `event_id`) plus a `submitFeedback`/`useFeedback` hook already exist in
`domains/support/`, but **no screen anywhere calls them** — the real feedback flow is the external
WebView above. This looks like an earlier, abandoned in-app feedback form attempt. Left as-is
(out of scope here) — worth a decision on whether to delete it or actually build the in-app form
it implies.

**For the portal:** `game_points` itself is user/system-generated, not portal content. But two
read-only RPCs exist that a portal "Leaderboard" admin view could call directly:

- `get_leaderboard(p_event_id uuid, p_limit int)` → ranked `{user_id, full_name, username,
total_points}` rows for an event.
- `get_my_game_points(p_event_id uuid)` → a single caller's total (not useful for the portal
  directly, since it's `auth.uid()`-scoped to whoever calls it).

Both are `authenticated`-only (not `anon`-callable) and were explicitly hardened after Supabase's
security advisor flagged the first version as anonymously callable.

---

## 11. Event administration & access (organization/membership layer)

Not "content" in the branding sense, but this is how the portal itself is gated and how
organizers manage who's in an event — needed for the portal's own auth model. **This is also the
layer your existing portal already manages** (teams, org assets, audit logs) — see the Changelog
entry above; nothing here is new, it was just missing from git until 2026-08-13.

| Table                                                | Key fields                                                                                                                                    | Notes                                                                                                                                                                                                       |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `organizations`                                      | `name`, `slug`                                                                                                                                | top-level tenant; portal likely scopes "which orgs can I manage" via `organization_members.role`                                                                                                            |
| `organization_members`                               | `organization_id`, `user_id`, `role` (`owner`/`admin`/`member`/`attendee`/`facilitator`/`staff`)                                              | org-level roles                                                                                                                                                                                             |
| `event_members`                                      | `event_id`, `user_id`, `organization_id`, `role` (`host`/`organizer`/`admin`/`attendee`/`facilitator`/`staff`/`speaker`), `onboarding_status` | **portal access control**: only `host`/`organizer`/`admin` should reach the editor (already the pattern used in `domains/admin/presentation/screens/admin-event-codes.tsx`'s `canManageCurrentEvent` check) |
| `event_user_access_codes`                            | `code_hash`, `code_last4`, `expires_at`, `used_at`, `is_active`, `attempt_count`                                                              | issued per-user via RPC `issue_event_access_code`; an "Admin Event Codes" screen already exists — reuse/extend rather than rebuild                                                                          |
| `teams` / `team_members`                             | `organization_id`, `name`; `team_id`+`user_id`                                                                                                | groups org members for faster event assignment — already portal-managed                                                                                                                                     |
| `organization_assets`                                | `organization_id`, `name`, `url`, `storage_path`                                                                                              | the org-level asset library backing the `org-assets` storage bucket — already portal-managed                                                                                                                |
| `organization_audit_log` / `event_content_audit_log` | `organization_id`/`event_id`, `table_name`, `action`, `diff`, `actor_user_id`                                                                 | automatic change history via triggers on most of the tables in this doc — read-only, already portal-managed                                                                                                 |

`portal_is_global_admin()` is the SQL function gating admin-bypass RLS across nearly every table
in this document — if your portal authenticates as a "global admin" role, it rides this bypass
everywhere; if it authenticates as a specific event's host/organizer instead, it goes through the
narrower `is_event_member`/`is_event_host_or_organizer`-scoped policies per table.

---

## 12. Image/storage considerations (a real gap the portal must solve)

**4 storage buckets are wired up today** (was 3 as of the last compile):

- `avatars` (profile photos) — owner-only write, public read
- `post-images` (social feed) — event-member write, public read
- `chat-media` (chat attachments) — participant-only
- `event-files` (**NEW 2026-08-13**) — shared downloadable documents (agendas, sponsor decks).
  **Write access is restricted to event hosts/organizers/admins, not every attendee** — path shape
  is `{organization_id}/{event_id}/{filename}` (no per-user segment, unlike the other buckets,
  since these are shared documents not personal uploads). **Confirmed 2026-08-18: this is the
  intended design, not a gap** — files are meant to be uploaded through the portal for attendees
  to view/download in-app, not uploaded by attendees themselves. The RLS above already enforces
  exactly that (organizer-write, member-read). `domains/files/presentation/screens/files.tsx`
  already reads and lists from this bucket end-to-end — the whole attendee-facing flow is complete.
  **No in-app upload UI is needed or planned** — the portal is the only intended upload path for
  this bucket, so build that upload flow there, not here.

There is still **no existing upload path** for:

- `events.hero_image_url`, `image_url`, `gallery_background`, `profile_banner_image_url`
- `facilitators.avatar_url`
- `activity_images.image_url`
- `support_contacts.avatar_url`
- `emergency_contacts.image_url` / `emergency_images.image_url`
- `games.image_url`
- `excursions.image_url` / `expo_spaces.image_url` (**new gaps, added today**)

Today these columns can only be populated by pasting an already-hosted URL (which is exactly how
today's excursions/expo_spaces seed data works — Unsplash stock URLs, not real photos). The portal
needs its own image upload flow — reuse `platform/storage/storageService.ts`'s `uploadFile()` +
`buildEventScopedPath(organizationId, eventId, segments)` helper (already built for exactly this)
against one or more new buckets (e.g. `event-assets`), rather than inventing a new upload
mechanism. The `org-assets` bucket (§11) already does something similar at the org level and is a
good reference implementation.

---

## 13. Explicitly OUT of scope for this portal

These are event-scoped or event-adjacent but are **user-generated or system-generated runtime
data**, not organizer content, and should not appear in a content-management portal (only in a
moderation/analytics view if you build one later):

- `posts`, `post_likes`, `post_comments` — attendee social feed
- `messages`, `chats`, `chat_participants`, `message_reads` — attendee chat
- `connections` — attendee networking connections
- `notifications` — system-generated
- `feedback` — attendee submissions (organizer might want a **read-only** results view, but not "populate")
- `session_attendees`, `facilitator_favorites` — attendee RSVP/favorite state
- `session_ratings` — attendee's own session ratings (**new 2026-08-13**)
- `game_results`, `game_points` — attendee scores / automatic leaderboard points (**game_points new 2026-08-13**; read-only `get_leaderboard` RPC available if you want an admin view, see §10)
- `networking_preferences` — attendee's own questionnaire answers
- `user_settings`, `user_push_tokens` — per-user app prefs
- `meeting_requests` — a public, unauthenticated lead-capture form (not tied to a specific event via FK; `desired_event_date` is just a date field) — separate marketing concern, not part of the per-event portal
- `organization_audit_log`, `event_content_audit_log` — system-generated change history (read-only view is fine, not "populate")

---

## 14. Suggested portal information architecture

Mapped directly to the sections above, in the order an organizer would plausibly want to work:

1. **Event Basics** — §1a
2. **Hero & Branding** — §1b (with image upload, §12)
3. **Theme Colors** — §1c (color pickers + live preview)
4. **Terminology & Feature Toggles** — §1d, §1e, §1f
5. **Facilitators / Speakers** — §2
6. **Agenda** — §4 (session CRUD + assign facilitators/speaker-type via §2's join table)
7. **Attendee Travel Details** — §4a (**new** — needs an event + attendee picker, not just event)
8. **Activities** — §3
9. **Excursions** — §3a (**new**)
10. **Expo Directory** — §3b (**new**)
11. **News Feed** — §3c (**new**) — article CRUD, multi-featured toggle, theme tagging
12. **Networking Questionnaire Builder** — §9
13. **FAQs** — §5
14. **Info Center Contacts** — §6
15. **Emergency Contacts & Images** — §7
16. **Photo Gallery** (moderation + featured picks) — §8
17. **Games** — §10 (⚠️ fix event-scoping gap first) — plus an optional read-only Leaderboard admin view via `get_leaderboard`
18. **Members & Access Codes** — §11 (extend existing admin-event-codes screen)

---

## 15. Ready-to-use portal build brief

> Build/extend the "Event Content Portal" (web admin panel) for the Evently-App Supabase backend,
> scoped by `event_id`, gated to users whose `event_members.role` for the selected event is
> `host`, `organizer`, or `admin` (or `portal_is_global_admin()` for cross-org access — see §11).
>
> Include an event switcher at the top (list events from `event_members` for the signed-in user),
> then editor sections for: Event Basics, Hero & Branding (with image upload to a new
> `event-assets`-style storage bucket via `platform/storage/storageService.ts`'s `uploadFile` /
> `buildEventScopedPath`), Theme Colors (hex pickers with live preview using
> `platform/themeColors.ts`'s `buildDerivedThemePalette`), Terminology & Feature Toggles,
> Facilitators (CRUD + claim-status display, read-only), Agenda (session CRUD + multi-speaker
> assignment via `agenda_session_speakers`), **Attendee Travel Details** (event + attendee picker,
> then flight/ground-transfer row CRUD), Activities (+ hero/gallery images), **Excursions**
> (category management via `excursion_categories` — add/rename/reorder tabs — plus
> title/description/image CRUD per excursion, global-vs-event-scoped toggle on both), **Expo
> Directory** (org CRUD with
> is_exhibitor/is_sponsor flags, not separate rows), **News Feed** (article CRUD with a rich-text
> `body` field — one textarea, paragraphs separated by a blank line, not a paragraph array — a
> multi-select `is_featured` toggle since more than one article can be featured at once, `themes`
> tag input, and a `registration_url` field per article rather than a self-service registration
> form), a Networking Questionnaire Builder for
> `event_interest_options` (grouped by `question_key`, drag-to-reorder), FAQs, Info Center
> Contacts, Emergency Contacts & Images, Photo Gallery moderation, and Games/Game Questions (add
> `event_id` filtering to `domains/games/infrastructure/supabase/game.repository.ts`'s `getGames()`
> as part of this work — it's still unscoped). Every write must stamp the row's `event_id` to the
> currently selected event (except explicitly-global rows like default excursions/expo spaces).
> Exclude all user/system-generated tables listed in §13 — this portal manages
> configuration/content only, not live attendee data.

---

_Originally compiled 2026-07-17. Updated 2026-08-18 — see Changelog above for what changed. Keep
this document in sync going forward by using the `document-portal-changes` skill after any
migration that adds/changes portal-relevant schema._
