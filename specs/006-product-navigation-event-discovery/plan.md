# Implementation Plan: Product-Level Navigation & Product-Aware Event Discovery

**Branch**: `006-product-navigation-event-discovery` | **Date**: 2026-09-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/006-product-navigation-event-discovery/spec.md` (59 FRs, 8 SCs, 6 user stories, 27 acceptance scenarios, 17 edge cases, 0 open `[NEEDS CLARIFICATION]` markers, clarification session 2026-09-17)

## Summary

Add an explicit product axis (Bendie / Bendie Planner) to the Portal's organization-level navigation, orthogonal to organization selection, without touching the existing event-workspace route structure or any of Features 001–005's contracts. Four new routes (`/portal/bendie`, `/portal/bendie/events`, `/portal/planner`, `/portal/planner/events`) reuse the existing Overview/Events UI, parameterized by product, with event retrieval filtered at the query layer via `event_products` (never `event_planner_links`). A URL-derived `ProductContext` provider exposes the current product to components without ever competing with the URL. A product switcher is added to the existing `TopHeader` dropdown pattern. Entering an event from product discovery carries an explicit `?product=` query-parameter origin signal; `EventLayout`'s existing Planner-only landing effect is generalized into a bidirectional mismatched-product redirect. Legacy `/portal` and `/portal/events` become thin redirects to the resolved default product. No schema change, no new HTTP API, no new privileged route — pure application-layer brownfield extension.

## Technical Context

**Language/Version**: TypeScript, Next.js 14 (App Router)

**Primary Dependencies**: Next.js 14, React 18, `@supabase/supabase-js`, `@supabase/ssr`, Tailwind CSS (existing stack — no new dependency introduced)

**Storage**: Supabase Postgres — Portal project (existing tables reused: `events`, `event_products`, `organization_products`, `organization_members`, `event_members`); Bendie Planner project untouched by this feature. N/A for new storage.

**Testing**: This repository has no automated test runner (consistent with Features 001–005); verification is via `npm run lint`, `tsc --noEmit`, `npm run build`, and the manual `quickstart.md` scenario matrix.

**Target Platform**: Web browser via Next.js server (existing deployment target, unchanged)

**Project Type**: Single Next.js web application (existing structure, no new project/package)

**Performance Goals**: No new performance target beyond existing baseline; product-aware event retrieval must not add more than one additional query round-trip per page versus today's unfiltered `useOrgEvents` call (see research.md Q6).

**Constraints**: Brownfield-only (Constitution I/II) — no Server Actions, no service/repository layer, no new privileged (`service-role`) route; no database migration (Constitution III, confirmed below); no new design system or component (Constitution V).

**Scale/Scope**: 4 new page routes, 1 new redirect route (no-product state), 2 legacy routes converted to redirects, ~6 new/modified library modules, 1 new context provider, modifications to `TopHeader`, `EventLayout`, `EventsOverviewPanel`, `CreateEventModal`, `useOrgEvents`.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — see "Post-Design Re-Check" below.*

| Principle | Check | Result |
|---|---|---|
| I. Brownfield Preservation | Reuses `useOrgEvents`, `EventsOverviewPanel`, `MetricCard`, `OrgPeoplePanel`, `TopHeader`'s dropdown pattern, `EventLayout`'s existing redirect-effect pattern, `EVENTS_SELECT_COLUMNS`. No parallel architecture. Existing `/portal` and `/portal/events` behavior is superseded only via an explicit, spec-approved redirect (FR-055), not silently. | PASS |
| II. Architecture Boundaries | No Server Actions, no service/repository layer introduced. All new data access is a page/hook calling the shared browser Supabase client directly, matching the existing pattern. No new `app/api/admin/**` route. Event-workspace routes (`app/portal/events/[eventId]/**`) are not restructured. | PASS |
| III. Supabase and Database Safety | No migration. All filtering uses existing tables/columns (`event_products`, `organization_products`) and an existing PostgREST embedded-resource filter capability — confirmed no new grant is required (`event_products` is already selectable by any authenticated member per Feature 002's RLS, reused unchanged, see research.md Q6). | PASS |
| IV. Security | No new privileged operation; every entitlement/product-membership read reuses `eventAuth.ts`'s existing RLS-governed helpers or a narrow addition alongside them. Product navigation never becomes an authorization mechanism (FR-004, FR-058) — workspace/event authorization in `EventLayout` and `requireEventWorkspaceAccess` is untouched and still evaluated first. | PASS |
| V. UI Consistency | Product switcher reuses `TopHeader`'s existing organization-switcher dropdown markup/pattern. No new design system, no new icon set, no hardcoded colors — existing tokens/classes reused throughout. | PASS |
| VI. Scope Discipline | No Planner operational module, no dashboard redesign, no shared-page duplication. Both-event test fixture creation is explicitly deferred to runtime verification, not planning/implementation. | PASS |
| VII. Documentation Discipline | Plan schedules `context/progress-tracker.md` (and `context/schema-reference.md` if any query-layer convention is added) updates after implementation, per existing convention. | PASS (scheduled) |
| VIII. Verification and Quality | `quickstart.md` defines the full matrix; lint/typecheck/build gates required before completion; `/review` and `/speckit.converge` remain the post-implementation gates per AGENTS.md workflow. | PASS |
| IX. Spec Kit + JSM Responsibilities | This `plan.md` is the sole authoritative HOW; no competing plan document created. | PASS |

No violations requiring the Complexity Tracking table.

## Project Structure

### Documentation (this feature)

```text
specs/006-product-navigation-event-discovery/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── product-navigation-contracts.md   # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not created here)
```

### Source Code (repository root)

This is the existing single Next.js application (`src/app/**`, `src/lib/**`, `src/components/**`, `src/contexts/**`) — no new project or package. Concrete touch points:

```text
src/
├── app/
│   └── portal/
│       ├── page.tsx                      # MODIFY → thin redirect (FR-055)
│       ├── events/
│       │   └── page.tsx                  # MODIFY → thin redirect (FR-055)
│       ├── bendie/
│       │   ├── page.tsx                  # NEW — Bendie product home
│       │   └── events/page.tsx           # NEW — Bendie product event list
│       ├── planner/
│       │   ├── page.tsx                  # NEW — Planner product home
│       │   └── events/page.tsx           # NEW — Planner product event list
│       ├── no-product/
│       │   └── page.tsx                  # NEW — safe no-product state (parallels existing no-access)
│       ├── layout.tsx                    # MODIFY — mount ProductProvider
│       └── events/[eventId]/
│           └── layout.tsx                # MODIFY — generalize mismatched-product redirect, read ?product= origin, redirect on org-switch-while-mounted (FR-054)
├── components/portal/
│   ├── TopHeader.tsx                     # MODIFY — add product switcher
│   ├── EventsOverviewPanel.tsx           # MODIFY — product-aware entry link + optional empty-state copy
│   └── CreateEventModal.tsx              # MODIFY — accept initialProduct prop (default only, FR-042/044)
├── contexts/
│   └── ProductContext.tsx                # NEW — URL-derived product context (no persistence)
└── lib/
    ├── eventAuth.ts                      # MODIFY — add getAvailableProducts()
    ├── productNavigation.ts              # NEW — resolveDefaultProduct, resolveProductFallback, switch-destination resolver
    ├── useOrgEvents.ts                   # MODIFY — optional product filter param + generation-ref stale-response guard
    └── eventColumns.ts                   # MODIFY — add EVENTS_SELECT_COLUMNS_WITH_PRODUCT_FILTER template-literal constant
```

**Structure Decision**: Single Next.js application, extended in place. Every new file lands inside the existing `src/app/portal/**`, `src/lib/**`, `src/components/portal/**`, `src/contexts/**` directories per Constitution II — no new top-level directory, no new package.

## Post-Design Re-Check

Re-evaluated after Phase 1 (data-model.md, contracts/, quickstart.md): no new violation surfaced. In particular:
- The product-aware event query (research.md Q6) uses an existing PostgREST inner-join embed filter against `event_products`, which already carries member-readable RLS (Feature 002) — no RLS or grant change needed.
- The generation-ref addition to `useOrgEvents` (research.md Q12) is a bug-fix-shaped, narrowly-scoped change to an existing shared hook, not a new abstraction.
- No contract in `contracts/product-navigation-contracts.md` required a new HTTP endpoint; all ten are routing/data-layer contracts, consistent with "do not invent an API merely to populate contracts."

Constitution Check: **PASS**, unchanged from pre-design gate above.

## Complexity Tracking

*No entries — Constitution Check has no violations to justify.*
