# Tasks: Planner Access Alignment

- [X] T001 Verify Planner's live rule, triggers, `set_member_type` and data counts (read-only MCP). Results are in [plan.md](plan.md).
- [X] T002 [P] Create `src/lib/plannerAccessRulesCore.ts` (`moduleAccess`) and `src/lib/plannerAccessRulesCore.test.ts` (8 tests) (FR-001–003).
- [X] T003 Create `src/lib/plannerAccessRules.ts` (`loadPlannerAccessFacts`, server-only; throws on read errors) (FR-001).
- [X] T004 Route `resolve{Task,Vendor,Checklist,People,Logistics,Production}Capability` through `moduleAccess`, and update the Logistics/Production doc comments (FR-001–003, superseded 012/014 decision).
- [X] T005 `src/lib/plannerPermissionPresets.ts`: add `can_manage_production` / `can_manage_logistics` to the flags, `PLANNER_MODULES`, `VIEWER_FLAGS` (false), `MANAGER_FLAGS` (true) and `deriveAccessRole` (FR-004, FR-005).
- [X] T006 `src/lib/plannerPermissions.ts`: select the new columns; resolve blank → effective on every read (`resolveRawAssignment`); include them in audit snapshots (FR-005, FR-006).
- [X] T007 Contractor message: `contractorEndDateMessage` in `plannerPermissions.ts`, used by the Enable route (409 `contractor_needs_end_date`) and by `plannerStaffSync.ts` (FR-007).
- [X] T008 `src/types/plannerDatabase.ts`: add the new assignment columns and `profiles.member_type`.
- [X] T009 Checks: `tsc`, lint, `npm test` (68), the placeholder-env build, and the live equivalence check (1,850 decisions, 0 mismatches).
- [X] T010 Docs: `context/schema-reference.md`, `context/progress-tracker.md`, `context/architecture.md`.
- [ ] T011 Browser pass (developer). Open a Planner event's Team access, then a person's Planner permissions. Production and Logistics show Manage; Viewer leaves both off. As an org admin who isn't assigned, the Planner modules open with full access.
- [ ] T012 Run `/review`, then converge.

## Review (2026-11-19)

`/review`: no issues in 026 itself. T012 is done except converge, which runs after the browser pass (T011).
