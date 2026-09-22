# Quickstart Verification Matrix: Bendie Planner Tasks Management

This is a manual/runtime verification guide, not an automated test suite (no test framework exists in this repository, per Features 001–006 precedent). Each row names a scenario, the fixture/state to use, and the expected observable outcome. Reuses the existing controlled fixtures — "Bendie Planner Sample" organization, "Stawi Escape — Planner Test" (Planner-only), "Stawi Escape — Both Test" (Both) — per research.md Q12; no new fixture required.

| # | Scenario | Fixture/State | Expected Outcome |
|---|---|---|---|
| 1 | Planner-only manager | Staff with `can_manage_tasks=true` on "Stawi Escape — Planner Test" | Tasks tab visible; full CRUD available; create/edit/delete succeed |
| 2 | Both-event manager | Same manager on "Stawi Escape — Both Test", entered from Planner context | Tasks tab visible under Planner context; product-context preserved (research.md Q8, Feature 006 `resolveEventTabProduct`) |
| 3 | View-only staff | Staff with `can_view_tasks=true`, `can_manage_tasks=false` | Tasks tab visible; task list renders; no create/edit/delete affordances anywhere |
| 4 | Self-assignee limited mutation | Staff assigned to exactly one task, no general capability | Sees only their assigned task(s) in the list; can change `status`/`remarks` on it; cannot edit other fields or other tasks |
| 5 | Ordinary member, no Planner identity | `profiles.planner_profile_id IS NULL` | Tasks tab hidden entirely (capability endpoint returns `hasPlannerIdentity: false`); direct route access returns `403 planner_identity_unavailable` |
| 6 | Bendie-only event | "Stawi Escape" (original Bendie-only fixture) | Tasks tab never appears (product unavailable); direct route returns `403 product_unavailable` |
| 7 | Invalid/cross-event task ID | `PATCH`/`DELETE` a `taskId` belonging to a different event | `404 task_not_found`, no data leaked about the other event |
| 8 | Invalid/cross-event assignee | `assignedProfileId` from a different event's staff list | `400 invalid_assignee` |
| 9 | Inactive event assignment | Staff whose `event_user_assignments.is_active = false` | Treated as no capability at all — `403 task_access_denied` or hidden tab, same as scenario 5's identity-present-but-denied branch |
| 10 | Zero tasks | Newly-verified event with no `operational_tasks` rows yet | `200` with `tasks: []`, distinct from a `403` denial |
| 11 | Planner backend failure | Simulate a Planner query error (e.g. transient network) | `500 planner_write_failed` on write attempts; read paths surface `backend_error`/`200 status` per the existing provisioning-phase vocabulary, never silently treated as zero tasks |
| 12 | Create | Manager submits a new task with all fields | `201`, task appears in list on refetch with a real `task_code` from `next_event_task_code` |
| 13 | Manager edit | Manager changes `task`, `priority`, `assignedProfileId` in one request | `200`, all fields updated, response `task` reflects new state |
| 14 | Self-assignee status update | Self-assignee changes `status` only | `200`, `status` updated, notification trigger fires Planner-side (out of this feature's control, not suppressed) |
| 15 | Self-assignee remarks update | Self-assignee changes `remarks` only | `200` |
| 16 | Forbidden self-assignee structural edit | Self-assignee attempts to change `task` or `priority` | `403 task_manage_denied` |
| 17 | Delete behavior | Manager deletes a task | `200 {ok:true}`, row gone from Planner DB (hard delete, confirmed via live query), no archive/soft-delete row remains |
| 18 | Exact status validation | Submit `status: "archived"` | `400 invalid_status` |
| 19 | Exact priority validation | Submit `priority: "urgent"` | `400 invalid_priority` |
| 20 | Task-code generation | Create two tasks in sequence for the same event | Sequential, non-colliding `task_code` values (e.g. `STWI-0001`, `STWI-0002`) |
| 21 | Repeated/concurrent creation task codes | Two near-simultaneous `POST` requests for the same event | No duplicate `task_code` (atomic upsert in `next_event_task_code`, research.md Q2) |
| 22 | Post-mutation authoritative refetch | Any successful mutation | Client reconciles from the mutation response / refetches list; no client-side optimistic merge left stale |
| 23 | Product-context preservation | Navigate Members → Tasks → back, with `?product=planner` origin | Breadcrumb/tab links preserve `planner` throughout (Feature 006 `resolveEventTabProduct`, unaffected by the new tab since it's classified `product:'planner'`, not an entry section) |
| 24 | Direct route authorization | Unauthenticated or non-member hits `/portal/events/[eventId]/planner-tasks` directly | Redirected/denied per Feature 003's existing workspace-access gate, before any Planner-specific check runs |
| 25 | Regression of Planner Overview | Load `/portal/events/[eventId]/planner-overview` after Tasks ships | Unchanged behavior — Overview route/module untouched |
| 26 | Regression of Features 001–006 | Full click-through of org switching, product switching, event creation, member management | No behavior change; `typecheck`/`lint`/`build` all clean |
