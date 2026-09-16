# Phase 0 Research: Bendie Planner Integration

This document resolves every open technical question carried forward from the architecture
validation, and reconciles the historical baseline (`docs/implementation-plans/bendie-planner-integration-baseline.md`)
against the now-approved spec (`spec.md`) and the ratified constitution. Each baseline decision is
classified **PRESERVE**, **PRESERVE WITH CORRECTION**, **REMOVE**, **DEFER**, or **REPLACE**.

## Live-Schema Checks Required Before Implementation

These are technical facts, not product questions — none are `[NEEDS CLARIFICATION]` in spec.md,
but none should be assumed true without a fresh check once implementation starts (both the
`supabase` and `supabase-planner` MCP connections were disconnected for the remainder of this
session after initial verification):

1. **`is_event_member()` / `portal_is_global_admin()` current definitions** — confirmed to exist
   as real functions this session (read directly from `supabase/migrations/006`–`013`), but their
   exact current behavior should be re-confirmed live immediately before writing the new
   migration, in case anything changed between sessions.
2. **Planner `profiles` on-signup trigger behavior** — whether creating a Planner `auth` user via
   `auth.admin.createUser()` automatically seeds a matching `profiles` row (mirroring Portal's own
   apparent convention), or whether the row must be inserted explicitly. This directly changes the
   member-sync identity-creation code path (Data Model, `Planner Participant Reference`).
3. **Planner `event_agenda_items.item_type` constraint** — whether it's free text or
   enum/CHECK-constrained, and if constrained, its exact allowed values versus Portal's
   `block_type` enum (`session`/`activity`/`meal`/`transfer`/`freetime`/`ceremony`/`break`).
4. **`supabase/migrations/` numbering convention — RESOLVED live, corrects an earlier assumption.**
   The local repo's `supabase/migrations/` folder only contains 12 numbered files (`003`–`014`),
   but the live database's actual applied-migration history (`list_migrations`) shows over 40
   migrations, including four more numbered ones already used (`015_fix_storage_allow_all_and_org_assets`
   through `018_fix_avatars_storage_policies`) and, from that point on, every migration since
   (roughly 25 of them, most recently `allow_global_admin_update_any_profile`) uses **no numeric
   prefix at all** — just a plain descriptive `snake_case` name, with Postgres/Supabase assigning
   the actual version as a timestamp automatically (visible in `list_migrations`' `version` field,
   independent of the file's `name`). **Correction**: this feature's migration file must **not** be
   named `015_bendie_planner_integration.sql` (that number is already taken live and the numbered
   convention was abandoned after `018` anyway) — it must be created as a plain
   `bendie_planner_integration.sql`, applied via the `apply_migration` MCP tool, matching the
   convention every migration since `2026-08-12` actually uses. **Separately flagged, not fixed
   here**: the local repo's `supabase/migrations/` folder is significantly behind the live
   database's real migration history (dozens of applied migrations have no corresponding local
   file) — this predates this feature, is unrelated to it, and reconciling it is a separate,
   explicitly-scoped task, not something to silently absorb into this one.
5. **Planner `events`/`event_user_assignments`/`passengers`/`all_flights_combined_table`/
   `hotel_bookings` current column shapes** — sampled directly via live SQL introspection this
   session (see Data Model for the shapes captured), but schema drift between sessions should be
   assumed possible on a project this repository doesn't own or control.

None of the above block writing this plan — each has a documented fallback/decision below — but
each MUST be re-verified as the first step of implementation, per Constitution Principle III.

## Baseline Reconciliation

| # | Baseline decision | Classification | Notes |
|---|---|---|---|
| 1 | Foundation migration: new `event_planner_links` table, admin-only `FOR ALL` RLS policy | **PRESERVE** | Architecture validation confirmed this matches the correct existing precedent (migrations 006-009/012/013's simple pattern, not 010's dual pattern) — no non-admin reader exists for this table. |
| 2 | Tracking columns on `profiles`, `event_members`, `agenda_sessions` | **PRESERVE** | Unchanged — still the right minimal-column approach, consistent with how `current_event_id` was added directly to `profiles` previously. |
| 3 | Tracking columns on `attendee_travel_details` (`source_planner_key`, `synced_from_planner_at`) | **PRESERVE WITH CORRECTION** | Baseline added the columns but never specified an *enforcement* mechanism for read-only-ness. Spec FR-024 now makes this a hard MUST. See Data Model — corrected to add a database-level enforcement (RLS/trigger), not just a UI-level disabled state. |
| 4 | Bundle the `pointCurrentEventAt` bug fix into this feature's Phase 0 | **PRESERVE** | Still the correct call — same hook points this feature must touch anyway (`handleAddAllOrgMembers`/`handleAssignTeam`). |
| 5 | Member sync: role-mapping table, shipped as "full sync including attendees, with an easy toggle" | **PRESERVE WITH CORRECTION** (the toggle framing is **REPLACED**) | Spec FR-009 makes attendee-exclusion a hard MUST, not a configurable default. The corrected design excludes `attendee` at the earliest possible point (the four provisioning-hook call sites never invoke sync for that role at all) rather than passing it through and filtering inside the sync route. |
| 6 | Auto-create a Planner account when no email match exists | **PRESERVE** | Spec FR-011 confirms this exactly. |
| 7 | Agenda push: embedded PostgREST select (`agenda_sessions.select('*, agenda_session_speakers(...facilitators(...)))`) | **REPLACE** | Architecture validation found no precedent for this shape anywhere in the codebase — `agenda/page.tsx` always does two separate queries joined in JS. Replaced with that same two-query pattern for the push route, eliminating an untested assumption. |
| 8 | Agenda push: date/day-number derivation, "match whatever timezone convention `agenda/page.tsx` uses" | **PRESERVE WITH CORRECTION** | `agenda/page.tsx` actually has two different conventions in play — a UTC-sliced grouping key (`dateKeyOf`) and a browser-locale display format. Corrected to explicitly use the `dateKeyOf`-equivalent UTC-slice convention for `day_number`/`agenda_date` derivation, since that's the only deterministic one. |
| 9 | Agenda push: `item_type` passthrough of `block_type` | **PRESERVE, pending live verification** | Kept as the simplest option; live-check item #3 above must resolve before this ships as-is. |
| 10 | Agenda push: no delete-sync | **PRESERVE** | Spec FR-017 confirms this as a hard MUST, matching the baseline's existing choice exactly. |
| 11 | Travel pull: flight + hotel only, ground-transfer deferred | **PRESERVE** | Spec FR-027 confirms. |
| 12 | Travel pull: `origin`/`destination` left null rather than text-parsed | **PRESERVE** | No change — still the right call, avoids a fragile parser against free-text Planner data. |
| 13 | Travel pull: upsert on `(event_id, source_planner_key)` for dedupe | **PRESERVE** | Matches spec FR-026 exactly. |
| 14 | Sync-status buttons centralized on one new tab rather than scattered on `agenda`/`attendee-travel` pages | **PRESERVE, rationale corrected** | The recommendation itself was right; its stated justification ("avoids clutter") was factually wrong (`agenda/page.tsx` has only 2 header buttons, `attendee-travel/page.tsx` has none at the page level) per architecture validation. Corrected rationale: this is a distinct cross-system control surface, not agenda/travel content editing — it belongs in its own place for separation of concerns, independent of how busy either page's header is. |
| 15 | Flat, unscoped Planner-events picker (no org-link table) | **PRESERVE** | Was a recommendation in the baseline; spec.md decision #4 now makes it a settled MVP requirement, not just a suggestion — reconfirmed unchanged. |
| 16 | `plannerDatabase.ts` hand-maintained types file | **PRESERVE** | No change. |
| 17 | Shared `plannerAdmin.ts` service-role client helper | **PRESERVE WITH CORRECTION** | Same helper, now explicitly required to import `server-only` at the top (package confirmed absent from `package.json` this session — added as part of this feature, see Security Design in plan.md). |
| 18 | Docs to update: `progress-tracker.md` (always), `schema-reference.md`/`architecture.md`/`project-overview.md` (scope-dependent) | **PRESERVE, with an explicit non-goal added** | Unchanged list. Explicitly NOT resolving the `schema-reference.md` / `updatedmobilefeatures.md` duplication discovered during architecture validation — flagged again here, deliberately left alone per Constitution Principle VII ("resolving an existing duplication is a separate, explicit task"). |
| 19 | Ground-transfer pull, breakout-room agenda sub-items | **DEFER** | Unchanged — both explicitly out of scope per spec.md. |
| 20 | Organization-level Planner linking model | **PRESERVE the decision not to build it, WITH CORRECTION to how firmly** | Baseline framed this as "maybe later, revisit if the picker becomes unusable." Spec decision #4 is stronger: "do NOT introduce an organization-linking model into the MVP." Corrected: no speculative `organization_id`/org-link placeholder of any kind goes into the new migration or types — not even an unused nullable column — to avoid scaffolding for a model that's explicitly not approved. |

## Key Technical Decisions

**Role mapping for member sync** (replaces the baseline's attendee-inclusive table):

| Portal `event_members.role` | Synced to Planner? | Planner `access_role` | Planner `can_view_*` | Planner `can_manage_*` |
|---|---|---|---|---|
| `host`, `organizer`, `admin` | Yes | `'admin'` | all `true` | all `true` |
| `facilitator`, `staff`, `speaker` | Yes | `'member'` | all `true` | all `false` |
| `attendee` | **No — never reaches the sync code path** | n/a | n/a | n/a |

**Decision**: Exclude `attendee` at the call site (the four provisioning hooks simply never invoke
the sync trigger for that role), not inside the sync route via a conditional skip.
**Rationale**: Matches spec FR-009's "MUST NOT... under any circumstance" phrasing most directly —
an attendee-role provisioning action never even produces a network call to the sync route, which is
a stronger guarantee than a route that receives the request and then decides to no-op.
**Alternative considered**: filter inside the route (baseline's original approach) — rejected only
because the call-site exclusion is strictly stronger and equally simple to implement; not a
meaningful complexity increase.

**Identity bridging**: email-match (case-insensitive) against Planner's `profiles.email`, falling
back to `auth.admin.createUser()` + profile creation when no match exists. **Preserved from
baseline unchanged** — spec FR-010/FR-011 confirm this exactly.

**Read-only enforcement for Planner-sourced travel rows**:
**Decision**: Enforce at the database layer (an RLS policy or trigger on `attendee_travel_details`
that rejects an `UPDATE` from the `authenticated` role when `source_planner_key IS NOT NULL`), not
only a disabled/read-only treatment in the Portal UI.
**Rationale**: Spec FR-024 is a MUST-level requirement, and the constitution's Security principle
requires defense-in-depth — the same reasoning already applied throughout this codebase (RLS is
the real authorization boundary, the UI is a convenience) applies identically here. A UI-only lock
would not survive a direct PostgREST call with a stolen or scripted session.
**Alternative considered**: UI-level disabled state only — rejected as insufficient on its own,
though it is still included for a good in-product error message; the database-level rule is the
actual guarantee. Application-route-level check only — rejected for the same reason; included in
addition to, not instead of, the RLS rule.

**Agenda date/day derivation**: use the same UTC-date-slice grouping key `agenda/page.tsx` already
computes for its own sidebar day tabs (its `dateKeyOf`-equivalent logic), not the browser-locale
display formatting the same page uses only for on-screen labels. **Corrects** the baseline's vaguer
"match whatever convention the page uses" instruction by naming the specific one that's
deterministic and therefore safe to reuse for grouping.

**Agenda speaker retrieval**: two separate queries (`agenda_session_speakers`, then `facilitators`)
joined in the route handler, matching `agenda/page.tsx`'s actual established pattern exactly.
**Replaces** the baseline's untested embedded-select assumption.

**Cross-project client**: one shared `getPlannerAdminClient()` helper, `server-only`-guarded (see
Complexity Tracking in plan.md for why this is the one justified shared abstraction in an otherwise
duplicate-per-route codebase).
