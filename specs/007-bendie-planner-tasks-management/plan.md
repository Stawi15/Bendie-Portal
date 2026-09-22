# Implementation Plan: Bendie Planner Tasks Management

**Branch**: `007-bendie-planner-tasks-management` | **Date**: 2026-09-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/007-bendie-planner-tasks-management/spec.md` (60 FRs, 8 SCs, 5 user stories, 20 acceptance scenarios, 12 edge cases, 0 open `[NEEDS CLARIFICATION]` markers)

## Summary

Add the first writable Bendie Planner module — Tasks Management — operating against the live Planner `operational_tasks` table. A new narrow server module (`src/lib/plannerTasks.ts`) and four route handlers under `/api/events/[eventId]/planner-tasks*` follow the exact authorization sequence Feature 005's Planner Overview route already established (authenticate → resolve selected organization → Feature 003 workspace access → Planner product availability → provisioning/link resolution), extended with a new step: resolve the caller's Planner identity (`profiles.planner_profile_id`) and their active `event_user_assignments` capability (`can_view_tasks`/`can_manage_tasks`), which the Portal server must independently re-derive on every request because the Planner service-role client bypasses Planner's own RLS. A new event-workspace tab (`/portal/events/[eventId]/planner-tasks`, `EVENT_SECTIONS` entry classified `product: 'planner'`) is gated by a small, additive extension to `EventLayout.tsx`'s existing per-mount product-availability check — not a new generic framework. No migration, no new HTTP API pattern beyond this codebase's existing conventions, and zero changes to Features 001–006's contracts.

## Technical Context

**Language/Version**: TypeScript, Next.js 14 (App Router)

**Primary Dependencies**: Next.js 14, React 18, `@supabase/supabase-js`, `@supabase/ssr` (existing stack, no new dependency)

**Storage**: Portal Supabase (read-only from this feature: `events`, `event_planner_links`, `profiles.planner_profile_id`, `organization_members`); Planner Supabase project `zghoaawgrmvqdlksuiam` (read/write: `operational_tasks`, `event_task_counters` via existing function; read-only: `event_user_assignments`, `profiles`)

**Testing**: No automated test framework in this repository (Features 001–006 precedent); verification is via live-schema/query tracing, `tsc --noEmit`/`npm run lint`/`npm run build`, and the manual `quickstart.md` matrix.

**Target Platform**: Web browser via the existing Next.js server (unchanged)

**Project Type**: Single Next.js application, extended in place

**Performance Goals**: No new target beyond existing baseline; the task list query is a single request (list + embedded assignee name + capability + assignable-staff, batched per plan) per page load, matching the "fewer coherent requests" instruction.

**Constraints**: Brownfield-only (Constitution I/II) — no Server Actions, no service/repository layer beyond the same narrow-module pattern already established by `plannerOverview.ts`; no Portal or Planner migration; the Portal server must never trust the Planner service-role client's bypass of RLS as a substitute for its own independent permission check (Constitution IV).

**Scale/Scope**: 1 new library module, 4 new route handlers (list+capability+assignable-staff bundled GET, POST, PATCH, DELETE) plus 1 small dedicated capability GET for tab-visibility, 1 new page, 1 new `EVENT_SECTIONS` entry, small additive changes to `EventLayout.tsx` and `src/types/plannerDatabase.ts`.

## Fresh Brownfield & Live-Schema Verification (performed this session, not reused from prior reports)

- Re-read `AGENTS.md`, `spec.md`, `src/lib/plannerAdmin.ts`, `src/lib/plannerOverview.ts`, `src/app/api/events/[eventId]/planner-overview/route.ts`, `src/types/plannerDatabase.ts` in full.
- Re-queried the live Planner project (`zghoaawgrmvqdlksuiam`) directly for `operational_tasks`'s exact columns, constraints, triggers, and every task-related function's real body (not summarized) — see research.md Q1–Q4 for the exact findings and their implementation implications, including three concrete discovered discrepancies between the live database's own permissiveness and the spec's deliberately narrower Portal-side rules.
- Confirmed `event_user_assignments` is already fully typed in `plannerDatabase.ts` (added during Feature 001) — no type-file gap there; only `operational_tasks` needs adding.
- Confirmed no Portal or Planner migration is required — `operational_tasks`, `event_task_counters`, `event_user_assignments`, and `profiles.planner_profile_id` (Portal-side) already fully support the specified scope.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — see "Post-Design Re-Check" below.*

| Principle | Check | Result |
|---|---|---|
| I. Brownfield Preservation | Reuses `requireEventWorkspaceAccess`, `isProductAvailableForEvent`, `getPlannerAdminClient`, the exact Feature 005 authorization-sequence shape, `EVENT_SECTIONS`/`resolveEventTabProduct` unchanged. No parallel architecture. | PASS |
| II. Architecture Boundaries | No Server Actions, no service/repository layer — `plannerTasks.ts` is a narrow data-access module matching `plannerOverview.ts`'s established shape exactly, called from route handlers. New tab fits the existing `app/portal/events/[eventId]/<section>` model. | PASS |
| III. Supabase and Database Safety | No migration on either project (confirmed via fresh live query). `src/types/plannerDatabase.ts` updated by hand for the new `operational_tasks` reference, per existing convention. RLS considered explicitly: Planner's own RLS is bypassed by the service-role client, so the Portal server independently mirrors its permission semantics (documented at every relevant point). | PASS |
| IV. Security | No new privileged Portal route beyond the existing `app/api/events/[eventId]/**` pattern; the Planner service-role client stays server-only; every mutation re-verifies permission server-side immediately before acting; no client-supplied `event_id`/`task_code`/`created_by_profile_id` is ever trusted. | PASS |
| V. UI Consistency | Reuses existing Portal table/card/modal/loading-skeleton patterns (see research.md Q9); no new design system. | PASS |
| VI. Scope Discipline | Excludes production schedule, agenda, logistics, participants, checklist, vendors, blueprints, notifications, multi-event views, task dependencies — matches spec.md's Out of Scope exactly. | PASS |
| VII. Documentation Discipline | `context/progress-tracker.md` and `context/schema-reference.md` updates scheduled post-implementation, per existing convention. | PASS (scheduled) |
| VIII. Verification and Quality | `quickstart.md` defines the full matrix; lint/typecheck/build gates required; `/review` and `/speckit.converge` remain the post-implementation gates. | PASS |
| IX. Spec Kit + JSM Responsibilities | This `plan.md` is the sole authoritative HOW; no competing plan created. | PASS |

No violations requiring the Complexity Tracking table.

## Project Structure

### Documentation (this feature)

```text
specs/007-bendie-planner-tasks-management/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── planner-tasks-api.md
└── tasks.md              # /speckit-tasks output — not created here
```

### Source Code (repository root)

```text
src/
├── app/
│   ├── api/events/[eventId]/planner-tasks/
│   │   ├── route.ts                    # NEW — GET (list+capability+assignable-staff), POST (create)
│   │   ├── capability/route.ts         # NEW — GET (lightweight capability-only, for tab visibility)
│   │   └── [taskId]/route.ts           # NEW — PATCH (update), DELETE
│   └── portal/events/[eventId]/
│       ├── planner-tasks/page.tsx      # NEW — Tasks page
│       └── layout.tsx                  # MODIFY — extend product-availability effect with task-capability fetch, gate the new tab
├── components/portal/
│   └── (new, small) PlannerTaskModal.tsx, PlannerTaskList.tsx — reuse existing table/modal primitives, no new design system
├── lib/
│   ├── plannerTasks.ts                 # NEW — narrow Planner task data-access module
│   └── eventSectionMeta.ts             # MODIFY — add one EVENT_SECTIONS entry, product: 'planner'
└── types/
    └── plannerDatabase.ts              # MODIFY — add `operational_tasks` Row/Insert reference
```

**Structure Decision**: Single Next.js application, extended in place, following the exact file-organization precedent Feature 005 established for the first Planner-reading module and Feature 004 established for a mutating cross-database route.

## Post-Design Re-Check

Re-evaluated after Phase 1 (data-model.md, contracts/, quickstart.md): no new violation. In particular:
- The task-capability tab-visibility fetch is a small, additive extension of `EventLayout.tsx`'s existing per-mount product-availability effect, not a new state-management system.
- `plannerTasks.ts` stays a narrow, explicit-column module (no generic repository), matching `plannerOverview.ts`'s established shape.
- All ten contracts in `contracts/planner-tasks-api.md` map to existing Next.js route-handler conventions; no new API pattern was invented.

Constitution Check: **PASS**, unchanged from the pre-design gate above.

## Complexity Tracking

*No entries — Constitution Check has no violations to justify.*
