# Implementation Plan: Event Product Selection & Planner Provisioning

**Branch**: `004-event-product-selection-planner-provisioning` | **Date**: 2026-09-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/004-event-product-selection-planner-provisioning/spec.md`
(clarified, zero unresolved product decisions, 39 FRs)

## Summary

Move event creation from a direct browser-client `INSERT` (today's only path, which creates an
`events` row and nothing else — no `event_products`, no `event_members`) behind a new server route
backed by a `SECURITY DEFINER` RPC, `create_event_with_products`, that atomically creates the Portal
event, its product-usage records, and the creator's workspace access together, for every product mix.
For a product selection that includes Planner, the same request (or, if it fails, a later
customer-triggered retry) synchronously provisions a real Planner-side event via Planner's
service-role client, using a deterministically-generated, retry-stable `event_code` as the
cross-database idempotency anchor, and records the counterpart via the existing (unmodified)
`event_planner_links` table. An explicit, persisted provisioning-state machine on `events` itself
(five new columns) makes "not yet provisioned / in progress / succeeded / failed" unambiguous, replacing
nothing that `event_products`/`event_planner_links` already own. Two of Feature 001's existing routes
(`planner-push-agenda`, `planner-pull-travel`) gain one small precondition each — the event must use
Bendie — since a Planner-only event can now legitimately hold an active link without ever needing
Bendie-side synchronization. No Planner workspace is built. No Planner-organization
mapping/provisioning capability is added. No product upgrade/downgrade is added.

## Technical Context

**Language/Version**: TypeScript, Next.js 14.2.x (App Router) — existing, unchanged.

**Primary Dependencies**: None new. Continues using `@supabase/ssr` (server route auth), `@supabase/
supabase-js` (service-role clients, existing pattern from every `app/api/admin/**` route and
`src/lib/plannerAdmin.ts`), and the existing browser Supabase client for reads.

**Storage**: Two existing, separate Supabase Postgres projects — Portal's own and Bendie Planner's own
(`src/lib/plannerAdmin.ts::getPlannerAdminClient()`). One new Portal table
(`event_creation_requests`), five new columns on Portal's existing `events` table, two new Portal
functions, one Portal column-privilege correction. Zero Planner-side schema changes (confirmed live —
`event_code`'s existing `text`/`UNIQUE` shape needs no addition).

**Testing**: No automated test framework exists in this repository (unchanged from Features
001–003). Verification is manual, live-database validation per `quickstart.md`, plus the existing
lint/type-check/build gate.

**Target Platform**: Existing Bendie Portal web app (Next.js App Router, browser + Node server
runtime), unchanged.

**Project Type**: Web application — single Next.js project, no service/repository layer (Constitution
Principle II), unchanged. New privileged logic lives in a new `app/api/events/**` route group (not
`app/api/admin/**`, since its authorized actor is org owner/admin, not platform-admin-only) plus one
new Postgres function pair.

**Performance Goals**: No new performance requirement. Provisioning is synchronous and bounded — one
Portal transaction (Phase 1) plus at most two Planner-side round trips (lookup, then insert-or-reuse)
plus one Portal write (the link) — no polling, no background processing.

**Constraints**: Brownfield-safe — every event created before this feature ships, and every route
Feature 001 already exposes, must continue to behave identically for the cases they already cover.
Cross-database work cannot be a single transaction (separate Supabase projects); idempotency, not
atomicity, is the correctness mechanism for the Planner-side phase (research.md §5, §7, §8).

**Scale/Scope**: Same live baseline as Feature 003's planning snapshot (7 organizations, 16 events at
last count) — this feature adds no bulk-data operation; each creation/retry touches at most one event
row's worth of state on each side.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design below.*

| Principle | Assessment |
|---|---|
| I. Brownfield Preservation | PASS. `event_planner_links`, `organization_products`, `event_products`, `event_members`, `events_insert_creator`'s authorization predicate, and Feature 001's existing sync routes are all reused as-is or extended with the smallest necessary addition (research.md §4, §11). The provisioning-state column shape directly reuses the established `event_members.planner_sync_status`/`agenda_sessions.planner_agenda_item_id` precedent (data-model.md, "Rationale — why `events`") rather than inventing a new generic pattern. |
| II. Architecture Boundaries | PASS. No Server Actions, no service/repository layer. The new route lives in `app/api/events/**`, following the existing `app/api/admin/**` file-per-route convention exactly, just outside that specific namespace because its authorized actor differs (org owner/admin, not platform-admin-only) — documented explicitly in research.md §2, not silently reusing a misleading namespace. |
| III. Supabase and Database Safety | PASS (re-checked post-design). Every new object goes through a descriptively-named migration recorded in `supabase/migrations/` and positioned in `MIGRATION_ORDER.md`'s documented order (research.md §19). Live grant state was checked directly (`pg_class.relacl`) before finalizing the `events` column-privacy design — and a first-draft assumption was caught and corrected as a direct result (data-model.md's "Column privilege change" section), exactly the discipline this principle requires. `src/types/database.ts` will need the five new `events` columns added by hand at implementation time (flagged for `/speckit.tasks`, not resolved here). |
| IV. Security | PASS. Every privileged operation (the creation RPC, the retry endpoint, the two Planner-side service-role calls) independently re-verifies authorization and entitlement immediately before acting (research.md §3, §15), never trusting a value already checked by an earlier layer or supplied by the client. Service-role credentials (Portal's and Planner's) are used only inside server-only route/RPC code, exactly matching every existing `app/api/admin/**` route's pattern — no new credential-handling pattern is introduced. |
| V. UI Consistency | PASS (planned). The product selector, blocking message, and retry affordance reuse `CreateEventModal`'s existing modal/form/button conventions and the portal's existing empty/error-state patterns (research.md §17) — no new visual pattern. |
| VI. Scope Discipline | PASS. Planner workspace, Planner-organization mapping/provisioning, product upgrade/downgrade, and billing are all explicitly excluded (spec's Out of Scope, reaffirmed throughout this plan) and not silently drawn in by any design choice here. |
| VII. Documentation Discipline | Deferred to implementation, per this repository's own convention — `context/progress-tracker.md` and `context/schema-reference.md` updates are `/speckit.tasks`/`/speckit.implement` work, not a planning artifact. |
| VIII. Verification and Quality | PASS (planned) — `quickstart.md` defines the live verification matrix; lint/type-check/build remain required gates. |
| IX. Spec Kit + JSM Responsibilities | PASS. This plan does not compete with or restate `spec.md`'s WHAT; it is the HOW, and does not reopen any of the four locked product decisions. |

No violations. Complexity Tracking is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/004-event-product-selection-planner-provisioning/
├── spec.md               # Input (clarified, 39 FRs)
├── plan.md                # This file
├── research.md            # Phase 0 output
├── data-model.md          # Phase 1 output
├── contracts/
│   ├── create-event.md    # Phase 1 output
│   └── retry-planner-provisioning.md   # Phase 1 output
├── quickstart.md          # Phase 1 output
└── tasks.md               # Phase 2 output (/speckit-tasks — not created by this command)
```

### Source Code (repository root)

```text
supabase/migrations/
  event_creation_provisioning_foundation.sql        # NEW — events columns, event_creation_requests table,
                                                       # create_event_with_products(), column-privilege fix
  event_planner_provisioning_error_read.sql          # NEW — get_event_planner_provisioning_error()
  planner_sync_routes_require_bendie_product.sql     # NEW — none (this one is code-only; listed here to
                                                       # flag explicitly that NO migration corresponds to
                                                       # the planner-push-agenda/planner-pull-travel guard
                                                       # additions, since they touch no schema)

src/app/api/events/
  create/route.ts                                    # NEW — contracts/create-event.md
  [eventId]/retry-planner-provisioning/route.ts       # NEW — contracts/retry-planner-provisioning.md

src/app/api/admin/planner-push-agenda/route.ts        # MODIFIED — +event_products 'bendie' guard
src/app/api/admin/planner-pull-travel/route.ts         # MODIFIED — +event_products 'bendie' guard

src/components/portal/CreateEventModal.tsx             # MODIFIED — entitlement-driven product selector,
                                                         # missing-mapping block, provisioning-outcome state,
                                                         # calls the new route instead of a direct INSERT
src/app/portal/events/page.tsx                          # MODIFIED (small) — pass entitlement data through;
                                                         # existing canCreateEvent gate untouched
src/lib/eventAuth.ts                                    # MODIFIED — reused, not replaced: isProductActiveForOrg
                                                         # already exists and is reused by the new route/RPC's
                                                         # own preflight, not duplicated

src/types/database.ts                                   # MODIFIED (hand-maintained) — five new events columns,
                                                          # event_creation_requests table shape

context/progress-tracker.md, context/schema-reference.md   # MODIFIED — doc updates (implementation-time)
```

**Structure Decision**: No new project, no new top-level directory. Additive work inside the existing
single Next.js App Router project, following the same file-touch shape as every prior feature (a
handful of modified files, one small new route group, a small additive migration set). The one
structural addition — `app/api/events/**` — follows the existing `app/api/admin/**` convention's own
shape (plain route handlers, no framework abstraction), placed outside that specific directory only
because its authorization predicate genuinely differs, not as a new architectural layer.

## Complexity Tracking

*No Constitution Check violations — this section is not needed.*
