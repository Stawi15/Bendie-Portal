# Implementation Plan: Planner Event Workspace Foundation

**Branch**: `005-planner-event-workspace-foundation` | **Date**: 2026-09-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/005-planner-event-workspace-foundation/spec.md`
(clarified, zero unresolved product/technical questions, 30 FRs)

## Summary

Add one new, read-only event section — Planner Overview — to the existing event workspace, visible
only when an event's product usage includes an active Planner entitlement. A new server route reads a
small, fixed set of fields from Bendie Planner's separate Supabase project (event identity plus a
total-session-count-and-phase summary, sourced from the verified-reliable `event_summary_realtime`
materialized view — not the unreliable `session_status_realtime` family the original architecture pass
had assumed) through the existing canonical `event_planner_links` counterpart and the existing
`plannerAdmin.ts` service-role boundary. Authorization is layered exactly as Feature 003 already
requires (workspace admission, then product availability) plus one new, narrow rule this feature
introduces: viewing the Overview does not require a Bendie Planner staff assignment. A small,
surgical change to `EventLayout` makes a Planner-only event's default landing deterministic (it
redirects from the Bendie dashboard to the Planner Overview instead of rendering a blocked state) —
this is the only behavior change to existing navigation; Bendie-only and Both events are unaffected.
No Portal or Planner schema change is required.

## Technical Context

**Language/Version**: TypeScript, Next.js 14.2.x (App Router) — existing, unchanged.

**Primary Dependencies**: None new. Continues using `@supabase/ssr` (server route auth, matching
`src/app/api/events/create/route.ts` and `.../retry-planner-provisioning/route.ts`'s existing pattern)
and `@supabase/supabase-js` (Planner service-role client, via the existing `src/lib/plannerAdmin.ts`).

**Storage**: Two existing, separate Supabase Postgres projects — Portal's own and Bendie Planner's own.
Zero new tables, columns, or views on either side. This feature only reads: Portal's existing
`event_members`, `event_products`, `organization_products`, `event_planner_links`, `events`
(`planner_provisioning_*` columns); Bendie Planner's existing `event_summary_realtime` materialized
view (verified live during `/speckit.clarify`, refreshed on a ~1-minute `pg_cron` schedule, one row per
event including zero-session events).

**Testing**: No automated test framework exists in this repository (unchanged from Features 001–004).
Verification is manual, live-database validation per `quickstart.md`, plus the existing
lint/type-check/build gate.

**Target Platform**: Existing Bendie Portal web app (Next.js App Router, browser + Node server
runtime), unchanged.

**Project Type**: Web application — single Next.js project, no service/repository layer (Constitution
Principle II), unchanged. The new route lives in `app/api/events/[eventId]/planner-overview/route.ts`,
alongside Feature 004's existing `app/api/events/**` route group (its authorized actor is any Portal
event-workspace member, matching that group's existing shape more closely than the platform-admin-only
`app/api/admin/**` group Feature 001 uses for its own Planner routes).

**Performance Goals**: No new performance requirement. One request = one Portal authorization sequence
(2–3 small reads) plus at most one Planner-side read (a single query against `event_summary_realtime`
keyed by `planner_event_id`) — no polling, no background processing, no write of any kind.

**Constraints**: Brownfield-safe — Features 001–004 are formally closed and must not be reopened;
Bendie-only and Both events' existing navigation and default landing must be pixel-for-pixel unchanged.
Bendie Planner's own Row Level Security is known (from architecture discovery) to be inconsistent on
several tables and must not be relied upon as a security boundary — every Planner read this feature
performs must be preceded by this feature's own Portal-side authorization, independent of Planner's
policies. `event_summary_realtime` is a materialized view refreshed roughly every minute — its
identity-field columns (title/location/dates) may lag a live edit in Bendie Planner by up to that
interval; this is an accepted, documented tradeoff (see research.md, Q18), not a defect.

**Scale/Scope**: Same live baseline as Feature 004's planning snapshot — this feature adds no
bulk-data operation; each Overview view touches at most one Planner row.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design below.*

| Principle | Assessment |
|---|---|
| I. Brownfield Preservation | PASS. `event_planner_links`, `event_products`, `organization_products`, `event_members`, the Feature 003 workspace-admission model, the Feature 004 provisioning-state machine, and the existing `EVENT_SECTIONS`/`EventLayout` product-filtering mechanism are all reused as-is. The one behavior change (Planner-only default landing) is additive and reuses `EventLayout`'s own already-computed product-availability state rather than introducing a parallel mechanism (research.md Q20). |
| II. Architecture Boundaries | PASS. No Server Actions, no service/repository layer. `src/lib/plannerOverview.ts` is one narrow module of named functions (not a repository/ORM), directly analogous to `src/lib/plannerAdmin.ts`/`plannerEventProvisioning.ts`'s existing shape. |
| III. Supabase and Database Safety | PASS. No migration on either project (verified during planning — see "No new persistence" in data-model.md). `src/types/database.ts` needs no change (no new Portal table/column); a new hand-maintained type addition to `src/types/plannerDatabase.ts` for `event_summary_realtime` is planned, matching that file's existing documented convention. |
| IV. Security | PASS. Every Planner read is preceded by this feature's own three-layer authorization (workspace admission → product availability → the new ordinary-viewer read tier), re-verified inside the request itself, never trusting a client-supplied value or an earlier page's check (FR-013). Planner service-role credentials remain server-only via the existing `getPlannerAdminClient()`. Bendie Planner's own RLS is explicitly not relied upon (research.md Q4/Q5; architecture discovery's permissive-policy finding). |
| V. UI Consistency | PASS (planned). The Planner Overview page reuses `SectionHeader` and the established card/skeleton/empty-state patterns; provisioning-state messaging reuses `PlannerProvisioningBanner`'s existing copy/severity conventions rather than inventing new UI language. |
| VI. Scope Discipline | PASS. No Tasks/Agenda/Participants/Flights/Accommodation/Transfers/Event Access/Blueprints/Checklist/Vendors/Notifications capability, no attendee count, no staff roster, no product switcher, no organization-mapping management is introduced — verified explicitly in the Feature Boundary Check below. |
| VII. Documentation Discipline | Deferred to implementation, per this repository's own convention — `context/progress-tracker.md`/`context/schema-reference.md` updates are `/speckit.tasks`/`/speckit.implement` work. |
| VIII. Verification and Quality | PASS (planned) — `quickstart.md` defines the live verification matrix; lint/type-check/build remain required gates. |
| IX. Spec Kit + JSM Responsibilities | PASS. This plan is the HOW for the already-clarified spec; it does not reopen any Clarifications-section decision. |

No violations. Complexity Tracking is not needed.

### Constitution Check — re-evaluated after Phase 1 design

Unchanged from the pre-design assessment above. Phase 1 design surfaced one implementation detail
worth naming explicitly rather than silently working around: `src/lib/eventAuth.ts`'s existing
`requireEventWorkspaceAccess`/`isProductAvailableForEvent` are hardwired to the shared browser Supabase
client (`src/lib/supabaseClient.ts`), so they cannot be imported unmodified into a server route (a
server-side call through the anonymous browser client would not carry the caller's session and would
incorrectly evaluate as denied for everyone, not correctly authorize). Per Principle II ("reuse existing
helpers... before writing new ones"), the plan is to add an optional, defaulted Supabase-client
parameter to those two functions — every existing call site keeps working unchanged (the parameter
defaults to the current browser singleton) — rather than forking a second, drift-prone copy of the same
authorization logic inside the new route (research.md Q4/Q6; data-model.md's Authorization section).
This is a small, additive modification to an existing shared helper, not new architecture, and keeps
this a PASS rather than a flagged violation.

## Project Structure

### Documentation (this feature)

```text
specs/005-planner-event-workspace-foundation/
├── spec.md                              # Input (clarified, 30 FRs)
├── plan.md                              # This file
├── research.md                          # Phase 0 output
├── data-model.md                        # Phase 1 output
├── contracts/
│   └── get-planner-overview.md          # Phase 1 output
├── quickstart.md                        # Phase 1 output
└── tasks.md                             # Phase 2 output (/speckit-tasks — not created by this command)
```

### Source Code (repository root)

```text
src/lib/
  eventAuth.ts                                    # MODIFIED — add an optional, defaulted Supabase-client
                                                     # parameter to requireEventWorkspaceAccess and
                                                     # isProductAvailableForEvent so a server route can
                                                     # reuse the exact same logic with its own cookie-bound
                                                     # client; no existing call site's behavior changes
  plannerOverview.ts                               # NEW — server-only (`server-only` guard, matching
                                                     # plannerAdmin.ts's convention); one narrow function
                                                     # reading the approved event_summary_realtime columns
                                                     # for a given canonical planner_event_id
  eventSectionMeta.ts                              # MODIFIED — one new EVENT_SECTIONS entry,
                                                     # `planner-overview`, classified product: 'planner'

src/app/api/events/[eventId]/planner-overview/
  route.ts                                         # NEW — GET handler; contracts/get-planner-overview.md

src/app/portal/events/[eventId]/planner-overview/
  page.tsx                                         # NEW — the Planner Overview screen

src/app/portal/events/[eventId]/layout.tsx          # MODIFIED — one small redirect effect: when the
                                                     # active section is `dashboard`, Bendie is
                                                     # unavailable, and Planner is available, replace the
                                                     # route with `planner-overview` instead of rendering
                                                     # the blocked "unavailable for this event" state.
                                                     # Bendie-only and Both events take no new code path.

src/types/plannerDatabase.ts                        # MODIFIED (hand-maintained) — add the
                                                     # `event_summary_realtime` row shape actually used

context/progress-tracker.md, context/schema-reference.md   # MODIFIED — doc updates (implementation-time)
```

**Structure Decision**: No new project, no new top-level directory, no new route namespace. The Planner
Overview is one more sibling under the existing `app/portal/events/[eventId]/<section>` tab-section
model, and its data route is one more sibling under the existing `app/api/events/[eventId]/**` group
Feature 004 already established for ordinary (non-platform-admin-only) event-scoped server operations.
The only file outside those two new leaves is a small, additive modification to `EventLayout` (default
landing) and to `eventAuth.ts` (client-injectable helpers) — both existing, shared files this feature
extends rather than forks.

## Complexity Tracking

*No Constitution Check violations — this section is not needed.*
