# Implementation Plan: Bendie Planner Vendors Management

**Branch**: `009-bendie-planner-vendors-management` | **Date**: 2026-09-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/009-bendie-planner-vendors-management/spec.md` (review PASSED — see `checklists/requirements.md`, 0 open clarifications)

## Summary

Give an authorized Vendors viewer/manager (per Feature 008's existing `can_view_vendors`/`can_manage_vendors` flags) a dedicated Planner Vendors section inside the existing event workspace, operating directly against Bendie Planner's canonical `event_vendor_items` table — no Portal storage, no sync layer. Technical approach: one new narrow, server-only data-access module (`src/lib/plannerVendors.ts`) mirroring Feature 007's `plannerTasks.ts` shape exactly; three new route handlers under `src/app/api/events/[eventId]/planner-vendors*` copying the identical, already-converged 8-step authorization sequence Features 005/007/008 all already use inline; one new event-workspace page and `EVENT_SECTIONS` entry; one small, Vendors-specific parallel addition to `EventLayout.tsx`'s existing (Tasks-specific) per-caller capability-gating pattern. Zero schema changes on either project. Supported operations: view, create, toggle packed/loaded/on-site, edit notes, delete — explicitly not editing an item's category/description/quantity/unit/sort-order after creation, per a verified, unworkaroundable live database constraint.

## Technical Context

**Language/Version**: TypeScript, Next.js 14 App Router (existing stack, unchanged)

**Primary Dependencies**: `@supabase/ssr` (cookie-bound auth client), `@supabase/supabase-js` (service-role clients — `plannerAdmin.ts` for Planner, inline `SUPABASE_SERVICE_ROLE_KEY` client for Portal, both existing patterns) — no new dependency.

**Storage**: Two existing separate Supabase Postgres projects (Portal, Bendie Planner). Zero new tables, columns, functions, or triggers on either project — this feature reads/writes the existing `event_vendor_items` table only.

**Testing**: This repository has no automated test suite (`npm run type-check` / `npm run lint` / manual browser + live-DB verification is the established convention across Features 001–008) — `quickstart.md` documents the verification plan in that same style.

**Target Platform**: Existing Next.js server (unchanged) + browser client.

**Project Type**: Web application, single existing Next.js project — no new project or directory root.

**Performance Goals**: No new goals; low-volume, manager-triggered CRUD on a per-event list, matching Feature 007's own "no explicit targets" precedent. The live composite index on `(event_id, category, sort_order)` already supports this feature's one list query efficiently.

**Constraints**: Every write independently re-verified server-side (Constitution IV); no Planner or Portal schema change (spec FR-014); no new top-level navigation surface (spec FR-004); the live `prevent_unsafe_vendor_item_edit` trigger makes five specific fields structurally unreachable via update — accepted as a permanent constraint of this feature, not a defect to route around (spec FR-038–040).

**Scale/Scope**: One new `src/lib` data-access module, three new route handlers (one with two HTTP methods, one with two, one collection-level capability GET), one new page, one new `EVENT_SECTIONS` entry, one small parallel addition to `EventLayout.tsx`, one new `src/types/plannerDatabase.ts` reference entry (documentation only, not a schema change). No changes to Features 001–008's own files beyond the `EventLayout.tsx`/`eventSectionMeta.ts` additions.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design below.*

| Principle | Check | Result |
|---|---|---|
| I. Brownfield Preservation | Reuses `plannerAdmin.ts`, `eventAuth.ts`, `plannerOverview.ts`'s provisioning vocabulary, the Portal↔Planner identity bridge, `event_planner_links`, `EVENT_SECTIONS`, and copies Feature 007's route/page/lib structure directly rather than inventing a new shape. The one new pattern (`EventLayout.tsx`'s Vendors-specific capability block) deliberately repeats Feature 007's own existing Tasks-specific block rather than generalizing it — see research.md R9 for why generalizing now would itself be the brownfield violation (an unrelated refactor bundled into this feature). | PASS |
| II. Architecture Boundaries | No Server Actions, no service/repository layer. New privileged logic lives in `app/api/events/[eventId]/planner-vendors*` route handlers (event-scoped, mirroring `app/api/events/[eventId]/planner-tasks*` exactly) plus one narrow `src/lib` module. Feature stays inside the existing event workspace as its own tab, not a new top-level route. | PASS |
| III. Supabase and Database Safety | Zero schema changes on either project — no migration file is created by this feature at all. Live grant/RLS/trigger behavior for `event_vendor_items` was verified directly against the live database twice (architecture-discovery pass and this planning pass), not assumed from documentation. `src/types/plannerDatabase.ts` gains a hand-written reference entry (Feature 007/008's own established convention for documenting an existing Planner table this codebase writes to), not a generated type. | PASS |
| IV. Security | No secret ever leaves server code. Service-role clients only in route handlers/`src/lib` server-only modules. Every route re-verifies authorization independently, copied inline per route (never a shared helper), matching Features 005/007/008's own deliberate precedent. Least-privilege: no new authorization concept is introduced — this feature only reads Feature 008's existing flags. | PASS |
| V. UI Consistency | Reuses the exact Planner Tasks/Overview page shell, loading-skeleton, and empty/error-state conventions; no new design system, no new icon set. | PASS |
| VI. Scope Discipline | Explicit Out of Scope section carried over verbatim from the reviewed spec; this plan introduces no additional scope (notably: does not generalize `EventLayout.tsx`'s capability-gating, does not prepare any Checklist abstraction). | PASS |
| VII. Documentation Discipline | `context/progress-tracker.md` update planned as a post-implementation/`/speckit.converge` step, matching this repo's own established sequencing. | PASS (deferred correctly) |
| VIII. Verification and Quality | `quickstart.md` defines loading/provisioning/error/empty/populated/Viewer/Manager states explicitly; `/review` and `npm run type-check`/`lint` remain required gates before completion. | PASS |
| IX. Spec Kit + JSM Responsibilities | This plan does not compete with or duplicate `spec.md`; the preceding `/architect`-equivalent discovery pass is treated as input, not re-derived. | PASS |

No violations — **Complexity Tracking is empty by design** (no entries required).

## Project Structure

### Documentation (this feature)

```text
specs/009-bendie-planner-vendors-management/
├── spec.md                                  # Already exists, review PASSED
├── checklists/requirements.md               # Already exists, review PASSED
├── plan.md                                  # This file
├── research.md                              # Phase 0 output (this pass)
├── data-model.md                            # Phase 1 output (this pass)
├── quickstart.md                            # Phase 1 output (this pass)
├── contracts/
│   └── planner-vendors-api.md               # Phase 1 output (this pass)
└── tasks.md                                 # Phase 2 — NOT created by this command
```

### Source code (repository root — existing Next.js App Router project, no new project)

```text
src/types/
└── plannerDatabase.ts                       # EDIT — add event_vendor_items reference entry (documentation only, no schema change)

src/lib/
└── plannerVendors.ts                        # NEW — server-only data-access module (list/create/patch/delete + capability resolution), mirrors plannerTasks.ts's shape

src/app/api/events/[eventId]/planner-vendors/
├── route.ts                                 # NEW — GET (list + capability), POST (create)
├── capability/route.ts                      # NEW — GET, dedicated lightweight capability check (EventLayout tab-visibility)
└── [itemId]/route.ts                        # NEW — PATCH (lifecycle toggle / notes edit), DELETE

src/lib/
└── eventSectionMeta.ts                      # EDIT — add the `planner-vendors` EVENT_SECTIONS entry (product: 'planner')

src/app/portal/events/[eventId]/planner-vendors/
└── page.tsx                                 # NEW — the Vendors list/create/lifecycle UI

src/components/portal/
├── PlannerVendorList.tsx                    # NEW — read/interactive list, mirrors PlannerTaskList.tsx's shape
└── PlannerVendorModal.tsx                   # NEW — create form (+ notes edit), mirrors PlannerTaskModal.tsx's shape minus the fields this feature doesn't support editing

src/app/portal/events/[eventId]/
└── layout.tsx                               # EDIT — add a second, Vendors-specific parallel capability-gating block (research.md R9), alongside the existing Tasks-specific one; no change to the Tasks block itself
```

**Structure Decision**: Single existing Next.js project, no new project or directory root. Every new file lands inside an existing, already-established directory (`src/lib`, `src/app/api/events/[eventId]/...`, `src/app/portal/events/[eventId]/...`, `src/components/portal`), following Feature 007's exact precedent for a new Planner-touching module.

## Design Decisions (full detail in research.md / data-model.md / contracts/)

### No schema change (research.md, data-model.md §1/§5)

Zero migrations. `event_vendor_items` is read/written exactly as its live schema already is. The only "new" artifact touching schema knowledge is a hand-written documentation entry in `src/types/plannerDatabase.ts`, matching Feature 007/008's own existing convention for documenting a table this codebase writes to.

### Data access module (research.md R4/R5)

`src/lib/plannerVendors.ts` — narrow, `server-only`, explicit-column functions: `resolveVendorCapability`, `listVendorItems`, `getVendorItem`, `createVendorItem`, `updateVendorItem`, `deleteVendorItem`, `normalizePlannerVendorError`. Reads the base table directly (never the `event_vendor_items_v` view) with three separate named-FK `profiles` embeds (one per `*_by_profile_id` column) plus a fourth for `created_by_profile_id`. Ordered `event_id, category, sort_order`, matching the live composite index. Simpler than `plannerTasks.ts` in several respects verified during research: no status-string canonicalization (three independent booleans, not one enum), no race-safe code-generation RPC (no human-readable code column exists on this table), no self-assignee patch variant (Vendors' live RLS has no owner-based carve-out, unlike Checklist).

### Authorization (research.md R2/R3/R10)

`resolveVendorCapability(plannerEventId, plannerProfileId)` — structurally identical to `resolveTaskCapability`: platform-admin/Planner-org-admin bypass, else an active `event_user_assignments` row's `can_view_vendors`/`can_manage_vendors`. Every route copies the identical 8-step sequence (research.md R10) inline, matching Features 005/007/008's own deliberate non-shared-helper precedent. Identity resolution (`resolveCallerPlannerIdentity`) is required before capability can be evaluated at all — confirmed necessary for every operation including plain viewing (research.md R2), not just creation attribution.

### Status lifecycle (research.md R6, data-model.md §2/§4)

One `PATCH` accepting any non-empty subset of `{ isPacked, isLoaded, isOnSite, notes }`. The live `trg_enforce_vendor_item_stage_order` trigger is the sole authority for ordering/cascade — `plannerVendors.ts` never encodes the packed→loaded→on-site rule itself; it submits the requested column changes and returns exactly what the database persisted via the same `UPDATE ... RETURNING` call, never a second read and never the client's originally-requested combination.

### The `notes` exception (research.md R1)

Resolved via fresh live-schema verification during this planning pass, not carried over as an assumption: `notes` is outside `prevent_unsafe_vendor_item_edit`'s guard list and is included in the `VendorItemPatch` allowlist alongside the three lifecycle booleans — the one field on this table editable after creation through this feature, everything else in `category`/`item_description`/`quantity_text`/`unit`/`sort_order` is not, permanently, per spec FR-038–040.

### Actor attribution (data-model.md §3 `VendorItem`)

`packedByName`/`loadedByName`/`onSiteByName` will be `null` for every Portal-originated stage change (the live trigger derives `*_by_profile_id` from `auth.uid()`, which Portal's service-role connection never has). `createdByName` is unaffected (the trigger doesn't touch `created_by_profile_id`) and is always correctly populated for Portal-created items. The UI must render a `null` attribution honestly (omit it), never substitute a fabricated or generic name — no client-side or server-side workaround is introduced for this (spec FR-032/FR-033; explicitly no JWT impersonation, no session-claim override, no Planner-side authorization change).

### `EventLayout.tsx` capability gating (research.md R9)

A second, Vendors-specific parallel block — its own `plannerVendorCapability` state, its own capability-fetch effect (gated on `productAvailability.planner === true`, same as the existing Tasks block), its own `isSectionAvailable`/`activeSectionUnavailable` branches keyed on `section.key === 'planner-vendors'`. Deliberately NOT a generalization of the existing Tasks-specific block into a shared abstraction — flagged as a reasonable future cleanup once a third module (Checklist) exists, not appropriate to bundle into this feature per Constitution I/VI.

### Item-scope security (contracts.md)

Every item-specific route (`PATCH`/`DELETE .../[itemId]`) resolves the target row and independently verifies `item.event_id === plannerEventId` (the resolved canonical event) before acting, returning `404 vendor_item_not_found` on a mismatch — never leaking cross-event existence, matching Feature 007's `[taskId]/route.ts` precedent exactly.

### Idempotency / concurrency (research.md R7/R8)

No idempotency mechanism for create (matches Feature 007's `createTask`, the more directly analogous precedent — Feature 008's audit-backed `operationId` pattern doesn't apply since this feature has no audit table to dedupe against, and adding one would be new, unrequested infrastructure). Status/notes mutation and delete always use the freshly-read/returned persisted row as authoritative. Delete-of-already-deleted returns a plain `404` (matches Feature 007's `deleteTask`/`PlannerTaskNotFoundError`, not Feature 008's disable-no-op-success shape, since this is a genuine irreversible removal, not an idempotent state toggle).

### Concurrency (general)

Last-write-wins, refetch-after-mutation (every route returns the fresh persisted `VendorItem`), no optimistic locking — identical to Features 007/008's own settled position.

## Feature 007/008 Compatibility

No file under Feature 007's ownership (`src/lib/plannerTasks.ts`, its three route files) or Feature 008's ownership (`src/lib/plannerPermissions.ts`, `plannerPermissionPresets.ts`, its five route files) is edited by this feature. Both remain exclusively read-only dependencies (Feature 008's `can_view_vendors`/`can_manage_vendors` flags) or untouched precedent (Feature 007's structural shape). `EventLayout.tsx` and `eventSectionMeta.ts` are edited, but strictly additively — the existing Tasks-specific block and every existing `EVENT_SECTIONS` entry are unchanged.

## Feature 006 Compatibility

No new `EVENT_SECTIONS.product` value, no new tab-bar concept, no change to `resolveEventTabProduct`/`parseEventOriginSignal`/`resolveDefaultProduct` or the `?product=` origin model — the Vendors tab is classified `product: 'planner'` (an existing value) and inherits the origin-propagation behavior every other Planner-classified tab already gets for free.

## Members/Workspace Regression Considerations

No file under the Members page's ownership is touched by this feature at all — Vendors is reached purely via the event workspace tab bar (`EventLayout.tsx`'s `visibleSections`), not via any Members-page entry point (unlike Feature 008, which added a per-row Members action; Vendors has no per-member concept, so no Members-page change is needed or planned).

## Security Considerations

- Every route independently re-verifies capability server-side (never trusts a page-level or tab-visibility check) — contracts.md's shared 8-step sequence, run before any read or write.
- Client-supplied `event_id`, any `*_at`/`*_by_profile_id` value, and any of the five permanently-unsupported detail fields are never accepted by any route (contracts.md's request shapes are strict allowlists; unknown fields are rejected, not silently ignored).
- Item-scope cross-event verification (above) closes the one item-specific-route risk this feature's shape introduces that Feature 007's task routes already independently solved for their own `[taskId]` route — copied, not reinvented.
- No new authentication mechanism, session-claim override, or Planner-identity impersonation is introduced anywhere in this feature, even though doing so would technically unblock detail-field editing and correct actor-attribution — both are explicitly rejected paths (spec FR-033/FR-040, Out of Scope).

## Unresolved Technical Questions

None. The one open item carried into this planning pass (`notes` editability) was resolved via fresh live-schema verification in research.md R1.

## Unresolved Product Questions

None. Both rounds of product decisions during the architecture/discovery pass, plus this plan's own resolution of the `notes` question, cover every open point.

## Is `/speckit.tasks` safe next?

Yes. `research.md`'s findings are all resolved (no outstanding `NEEDS CLARIFICATION`), `data-model.md`/`contracts/`/`quickstart.md` are complete and internally consistent with the spec, and the Constitution Check above passes without exception.
