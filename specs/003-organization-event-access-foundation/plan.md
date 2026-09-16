# Implementation Plan: Organization & Event Access Foundation

**Branch**: `003-organization-event-access-foundation` | **Date**: 2026-09-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/003-organization-event-access-foundation/spec.md`

## Summary

Open `/portal` to any authenticated user who holds an `organization_members` row (not just `profiles.global_role = 'admin'`), while adding exactly one new, additive RLS policy (`events` SELECT for organization owner/admin metadata visibility) and one new application-level guard (explicit `event_members`-based workspace-access check in the event route tree, since the new RLS policy alone would otherwise let an org admin's `events` row fetch silently succeed without granting workspace/content access). Reuses `organization_members`, `organization_products`, `event_products`, `OrganizationContext`, and `getAccessibleOrganizations()`'s existing non-admin branch entirely as-is. `getAccessibleEvents()` gains a real non-admin implementation (currently hard-returns `[]`) that lets RLS do the per-role filtering rather than branching in application code. Product-aware navigation is added as metadata on `EVENT_SECTIONS`, filtered at render time against live `organization_products.is_active` + `event_products`. No new database tables. No event creation changes. No Planner workspace modules.

## Technical Context

**Language/Version**: TypeScript, Next.js 14.2.x (App Router) — existing, unchanged.

**Primary Dependencies**: None new. Continues using `@supabase/ssr` (middleware), the shared browser Supabase client (`src/lib/supabaseClient.ts`), and existing React contexts (`OrganizationContext`, `EventContext`).

**Storage**: Supabase Postgres, Portal's own project only (`droaamagpsojkzznywgd`). One additive RLS policy on `public.events`. No new tables, no column changes, no changes to Feature 001 (`event_planner_links`) or Feature 002 (`organization_products`, `event_products`, `organization_planner_links`) schema.

**Testing**: No automated test framework exists in this repository (confirmed unchanged from Features 001/002). Verification is manual, live-database validation per `quickstart.md`, plus the existing lint/type-check/build gate.

**Target Platform**: Existing Bendie Portal web app (Next.js App Router, browser + Node server runtime), unchanged.

**Project Type**: Web application — single Next.js project, no service/repository layer (per Constitution Principle II), unchanged.

**Performance Goals**: No new performance requirement. `getAccessibleEvents()`'s non-admin path must remain a single scoped query (no N+1 per-event authorization check), matching the existing `getAccessibleOrganizations()` pattern.

**Constraints**: Brownfield-safe — existing 16 events' URLs, navigation, and behavior must be pixel-identical after this feature ships (spec SC-005). No route churn beyond what is strictly required to separate platform-admin-only surfaces.

**Scale/Scope**: 6 organizations, 16 events, 163 `member` + 80 `attendee` + 2 `owner` `organization_members` rows, 7 `admin` + 314 `attendee` + 1 `host` + 31 `speaker` `event_members` rows (live counts at planning time).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (see below).*

| Principle | Assessment |
|---|---|
| I. Brownfield Preservation | PASS. `OrganizationContext`, `getAccessibleOrganizations()`, `organization_members`, `organization_products`, `event_products` are reused unchanged. Only one additive `events` RLS policy and one new application-level workspace guard are added — no existing policy, table, or component is redesigned. |
| II. Architecture Boundaries | PASS. No Server Actions, no service layer introduced. All changes live in existing `src/lib/**`, `src/contexts/**`, `middleware.ts`, and the existing `app/portal/events/[eventId]/*` tab-section model — no new navigational structure. |
| III. Supabase and Database Safety | PASS. The one new RLS policy goes through a new, numbered-convention migration file (`supabase/migrations/organization_admin_event_metadata_visibility.sql`, matching the descriptive-snake-case convention Features 001/002 already established — this repo's live convention has no numeric prefix for its two most recent migrations; confirmed via `list_migrations`). `src/types/database.ts` requires no change (no schema shape change, RLS-only). Live policy text was read directly via MCP before planning, not assumed from docs. |
| IV. Security | PASS. No secret is touched. Feature 001's `app/api/admin/planner-*` routes already independently re-verify `global_role === 'admin'` server-side (confirmed by inspection of all 7 `app/api/admin/**` routes) — they remain safe with no change needed. The new workspace-access guard is exactly the kind of independent, non-client-trusting check this principle requires. |
| V. UI Consistency | PASS. No new visual pattern. The no-organization/no-access and forbidden states reuse the existing empty/error-state conventions already used elsewhere in the portal (no new component library, no new tokens). |
| VI. Scope Discipline | PASS. Event creation, Planner provisioning, and Planner workspace modules are explicitly excluded and deferred to the documented Feature 004 boundary. |
| VII. Documentation Discipline | Deferred to implementation — `context/progress-tracker.md` and `context/schema-reference.md` updates are planned as implementation tasks, not part of this planning artifact. |
| VIII. Verification and Quality | PASS (planned) — `quickstart.md` defines the live verification matrix; lint/type-check/build remain required gates. |
| IX. Spec Kit + JSM Responsibilities | PASS. This plan does not compete with or replace `spec.md`; `/architect` was used (manually, since it is not an installed skill) only for discovery before `spec.md` existed. |

No violations. Complexity Tracking is not needed.

## Project Structure

### Documentation (this feature)

```text
specs/003-organization-event-access-foundation/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not created by this command)
```

### Source Code (repository root)

```text
middleware.ts                                          # MODIFIED — admission gate widened
src/lib/portalAuth.ts                                   # MODIFIED — getAccessibleEvents() non-admin branch
src/lib/eventAuth.ts                                    # NEW — canViewEventMetadata / requireEventWorkspaceAccess helpers
src/lib/eventSectionMeta.ts                              # MODIFIED — product metadata added per section
src/contexts/EventContext.tsx                            # MODIFIED — explicit workspace-access check, not just RLS-fetch-succeeded
src/app/portal/events/[eventId]/layout.tsx                # MODIFIED — renders forbidden/no-access state when workspace access denied
src/app/portal/admin/                                     # NEW namespace (route-group only, no move of existing pages unless inspection in tasks phase finds a genuine leak)
supabase/migrations/organization_admin_event_metadata_visibility.sql   # NEW — additive events RLS policy only
context/progress-tracker.md, context/schema-reference.md  # MODIFIED — doc updates
```

**Structure Decision**: No new project, no new top-level directory structure. This is additive work inside the existing single Next.js App Router project, following the same file-touch shape as Features 001/002 (a handful of modified files + one small additive migration). The one structural addition, `src/lib/eventAuth.ts`, follows the existing convention of `src/lib/portalAuth.ts`/`src/lib/plannerAdmin.ts` — a plain exported-function module, not a class or service layer.

## Complexity Tracking

*No Constitution Check violations — this section is not needed.*
