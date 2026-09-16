# Implementation Plan: Organization Product Entitlements & Event Product Foundation

**Branch**: `002-event-product-model-organization-mapping` | **Date**: 2026-09-15 | **Revised**: 2026-09-16 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-event-product-model-organization-mapping/spec.md`

**Context**: Revision of this feature's original plan. Further product discovery established that
an event's product usage cannot be evaluated without knowing what its *organization* is entitled
to use, and that the "who belongs to which organization, with what role" layer the revision
initially assumed needed building **already exists live** in this codebase
(`organization_members`, with real RLS and real usage across 9 files) — see `research.md` item 0.
This plan is revised accordingly; the directory/branch name is unchanged per the explicit
instruction not to cause unnecessary Spec Kit/git disruption, even though the feature's working
title changed.

## Summary

Add two genuinely new, purely additive Portal-side tables — `organization_products` (what
product(s) an organization is entitled to use) and a revised `event_products` (what product(s) an
event actually uses, now with a real, unbypassable database constraint tying it back to its
organization's entitlement) — plus a revised `organization_planner_links` (unchanged purpose, now
tenant-isolated via a uniqueness constraint). `organization_members` is reused entirely as-is; this
feature reads through its existing RLS helpers but creates, alters, and migrates nothing about it.
No UI, no API routes, no Planner-side schema change, no billing, and no change to feature 001.

## Technical Context

**Language/Version**: TypeScript, Next.js 14.2.x (App Router) — existing, unchanged. No new
application code paths (no routes, no pages).

**Primary Dependencies**: None new.

**Storage**: Supabase Postgres, Portal's own project only. `organization_planner_links.planner_organization_id`
remains a plain, non-FK `bigint`, matching `event_planner_links.planner_event_id`'s established
pattern — now additionally `UNIQUE` (revised, see `research.md` item 5). No Planner-side schema
change.

**Testing**: No automated test framework exists in this repository. Verification is manual,
live-database validation per `quickstart.md`, plus the existing lint/type-check/build gate.

**Target Platform**: N/A — no UI or runtime surface of its own.

**Project Type**: Schema/foundation addition inside the existing single Next.js + Supabase project.

**Performance Goals**: None newly introduced.

**Constraints**: Must not alter `event_planner_links`'s or `organization_members`'s schema or
semantics; must be purely additive; the backfill must derive entitlement only from real existing
data, never grant blanket entitlements, and must respect a strict two-phase order (organization
entitlements before event product usage) because of the new composite foreign key.

**Scale/Scope**: Three new/revised tables, one migration, no application code beyond hand-maintained
type updates.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — see bottom of this section.*

| Principle | Check | Result |
|---|---|---|
| I. Brownfield Preservation | `organization_members` is discovered to already exist and is reused, not duplicated — the single most important brownfield-preservation finding of this revision. The new `event_products` org-consistency trigger directly mirrors `event_members`'s own existing `enforce_event_member_integrity()` pattern rather than inventing a new one. | PASS |
| II. Architecture Boundaries | No Server Actions, no service layer, no API routes in this feature. | PASS |
| III. Supabase and Database Safety | One additive migration; RLS explicitly designed per table, extending (not replacing) direct existing precedents; `database.ts` updated by hand; every live-schema assumption (including the pivotal `organization_members` discovery, the `enforce_event_member_integrity()` trigger pattern, and `is_organization_member()`/`is_organization_admin()`'s exact definitions) was verified against the live database before writing this plan. | PASS |
| IV. Security | No service-role client needed (no routes exist yet); all four affected tables governed by RLS; write access to the two new/revised entitlement-bearing tables stays platform-admin-only, with a new member-scoped read-only policy added deliberately, not by accident, and justified by spec FR-026. Self-service membership, self-promotion, and self-granted entitlements are all explicitly blocked. | PASS |
| V. UI Consistency | N/A — no UI in this feature. | PASS (trivially) |
| VI. Scope Discipline | Spec's Out of Scope list carried forward verbatim; no billing, no UI, no `organization_members` redesign, no invitations. | PASS |
| VII. Documentation Discipline | `context/progress-tracker.md` and `context/schema-reference.md` updated (Documentation Plan below); `context/schema-reference.md`'s existing entry for `organization_members` (if any) is not duplicated — only genuinely new tables get new entries. | PASS |
| VIII. Verification and Quality | Existing lint/type-check/build gate; manual live-database verification plan in `quickstart.md`, revised to cover the entitlement-invariant enforcement specifically. | PASS |
| IX. Spec Kit + JSM Responsibilities | Unaffected. | PASS |

**Post-Phase-1 re-check**: No new violations. The one meaningful addition beyond the original
plan — a `BEFORE INSERT/UPDATE` trigger on `event_products` — is not a new pattern but a direct,
justified reuse of `event_members`'s own existing trigger design (see Complexity Tracking, which
records this as *not* requiring justification precisely because a live precedent already exists).

## Project Structure

### Documentation (this feature)

```text
specs/002-event-product-model-organization-mapping/
├── plan.md              # This file (revised)
├── research.md          # Phase 0 output (revised)
├── data-model.md        # Phase 1 output (revised)
├── quickstart.md         # Phase 1 output (revised)
└── tasks.md              # Phase 2 output (/speckit-tasks — not created by this command)
```

No `contracts/` directory — unchanged reasoning from the original plan (no API/UI surface).

### Source Code (repository root)

```text
supabase/migrations/
└── organization_and_event_product_foundation.sql   # NEW — plain descriptive name, no
    numeric prefix, applied via apply_migration (this repo's live convention)

src/types/
└── database.ts   # MODIFIED — adds organization_products, event_products, and
    organization_planner_links table types (organization_members' existing type entry
    is untouched)

context/
├── schema-reference.md    # MODIFIED — changelog entry for the three new/revised tables
└── progress-tracker.md    # MODIFIED — new dated entry once implemented
```

No changes anywhere under `src/app/`, `src/lib/`, or `src/components/`.

**Structure Decision**: Unchanged from the original plan — extends the existing project with no
new top-level directories.

## Documentation Plan

Per Constitution Principle VII:

- **Always**: `context/progress-tracker.md` — new dated entry once implemented, explicitly noting
  the `organization_members`-already-exists discovery so a future session doesn't re-propose it.
- **Because schema changes**: `context/schema-reference.md` — a new changelog entry covering
  `organization_products`, the revised `event_products` (including its new `organization_id` column
  and consistency trigger), and the revised `organization_planner_links` (its new uniqueness
  constraint) — following the existing entry format.

## Verification Plan

Full runnable detail lives in `quickstart.md`; summarized here for traceability:

1. Re-verify the live facts this revision depends on immediately before applying the migration:
   `organization_members`'s exact shape/RLS/helpers, `event_members`'s
   `enforce_event_member_integrity()` trigger definition, and `event_planner_links.is_active`
   semantics.
2. Migration applies cleanly, in the correct two-phase order; RLS enabled and correctly scoped on
   all three new/revised tables.
3. Backfill produces the exact organization-level and event-level entitlement/usage rows implied by
   real existing data — verified by direct count comparison, not sampled — and grants Planner to
   *no* organization lacking a real active link.
4. Re-running the full backfill a second time produces no additional rows.
5. The entitlement invariant is genuinely unbypassable: attempting to insert an `event_products` row
   whose organization has no matching `organization_products` entitlement fails at the constraint
   level, not merely at an application check.
6. Attempting to insert a second `organization_planner_links` row for the same
   `planner_organization_id` from a different organization fails (tenant isolation).
7. Deleting a test event/organization cascades correctly.
8. A genuine non-admin client cannot write to any of the three tables; a genuine member of a test
   organization *can* read (not write) that organization's `organization_products`/`event_products`
   rows, and cannot read another organization's.
9. Feature 001's existing manual linking, member sync, agenda push, and travel pull all still
   function against a real linked test event after migration.
10. `lint`, `type-check`, and `build` all pass.

## Complexity Tracking

| Addition | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| `event_products.organization_id` (denormalized) + `enforce_event_product_org_consistency()` trigger | The composite FK enforcing "an event cannot use an unentitled product" (spec FR-008) requires `organization_id` to be physically present on `event_products` — a plain FK to `events.id` alone cannot express a cross-table entitlement check. | An application-layer check alone was rejected because the spec explicitly requires this to be unbypassable by any client, not merely checked by a well-behaved caller — and this repository already has a live, exactly-analogous precedent (`event_members`'s own `enforce_event_member_integrity()`), so this is applying an established pattern a second time, not inventing a new one. |
