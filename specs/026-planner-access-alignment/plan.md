# Implementation Plan: Planner Access Alignment

**Branch**: `026-planner-access-alignment` (stacked on 025) | **Date**: 2026-11-17 | **Spec**: [spec.md](spec.md)

## Summary

There's now one copy of Planner's access rule in the Portal:
- **`src/lib/plannerAccessRulesCore.ts`** (pure, unit-tested): `moduleAccess(facts, module)`.
- **`src/lib/plannerAccessRules.ts`** (server-only): `loadPlannerAccessFacts`, which reads the profile flags, the event's organization and whether it's active, and the active assignment.

All six module resolvers (`plannerTasks`, `Vendors`, `Checklist`, `People`, `Logistics`, `Production`) now return `moduleAccess(...)`. The presets and permissions library gain `can_manage_production` and `can_manage_logistics`: explicit on write, resolved on read. Contractor refusals get a clear message.

## Live facts (verified 2026-11-17, Planner `zghoaawgrmvqdlksuiam`, read-only)

- **The rule:** `has_event_module` = `is_platform_admin()` (flag) OR `is_org_admin_for_event` OR an active assignment AND `is_event_org_active`, with the per-module switch (`manage_*` = view AND coalesce(manage, view)).
- **Contractor trigger:** `check_assignment_rules` raises "Contractor access needs an end date." It also turns an edited `org_default` row into `manual`.
- **`set_member_type`:** requires `auth.uid()`, so it can't be called with the service role. This is why member-type editing is out of scope.
- **Data:** 160 active assignments. Production manage is NULL on 150 and Logistics manage on 87. There's 1 contractor and 0 `org_member_access` / `org_default` rows.
- **Equivalence test:** 185 pairs (every active assignment, every org admin × their organization's events, and 2 platform admins × 3 events) × 10 decisions = 1,850 checks, with 0 mismatches between `moduleAccess` and Planner's `has_event_module`. Planner's answers came from impersonating each profile in a rolled-back session.

## Constitution Check

| Principle | Result | Notes |
|---|---|---|
| I. Brownfield | PASS | Same resolver signatures and return shapes. The routes' Portal-admin override is unchanged. Behaviour changes are deliberate (spec) and documented. |
| II. Architecture | PASS | Server-only, service-role Planner reads stay in `src/lib`. No new routes. |
| III. DB safety | PASS | No migration. Live schema and functions verified. `types/plannerDatabase.ts` is updated by hand. |
| IV. Security | PASS | Closes a privilege gap: job-title admin is gone, and Viewers can no longer edit. Least privilege is explicit on write. |
| V. UI | PASS | The editor is generic over `PLANNER_MODULES`; no new UI patterns. |
| VI. Scope | PASS | Contractor and org-wide administration stays in Planner, which the live `set_member_type` design requires. |
| VII. Docs | PASS | `schema-reference.md`, `progress-tracker.md`, `architecture.md`. |
| VIII. Verification | PASS | 8 new unit tests, the live equivalence check, type-check, lint, build. |

## Superseded decisions

Feature 012/014's "Logistics/Production `canManage` is always false except for Portal admins" is superseded. Planner now has real manage switches, and the Portal follows them.
