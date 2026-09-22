# Specification Quality Checklist: Bendie Planner Staff & Module Permissions

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-20
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- All four locked product decisions supplied by the product owner (manual-configuration marker, permission-administration authority, UI presets, lightweight audit recording) are represented directly in the Clarifications section and traced into FR-005–FR-010, FR-019–FR-022, and FR-052–FR-058.
- Zero [NEEDS CLARIFICATION] markers were needed — every open decision point the Feature 008 architecture pass flagged (§43 of that report) was explicitly resolved in this request before specification began.
- Live Planner schema facts (column set, RLS policies) were independently re-verified against the live database during the architecture pass immediately preceding this specification, not assumed from prior session memory.

### 2026-09-20 — Independent spec review pass (before /speckit.plan)

A dedicated review re-verified the spec against the live Planner database and the actual Portal codebase (not just re-reading the spec text) and found four defects, all fixed in place:

1. Two broken internal cross-references (FR-022, FR-035 cited a nonexistent "FR-063–FR-069" audit range; the real Audit section is FR-052–FR-058) — corrected.
2. FR-020 defined Viewer/Manager as UI conveniences without stating their exact flag composition — added the precise, all-seven-module definition for both presets directly to FR-020.
3. User Story 6's Independent Test and Acceptance Scenario 1 asserted that changing a member's Portal event role re-triggers automatic Planner sync "exactly as today" — verified false: `changeRole` in `members/page.tsx` never calls the Planner sync path; automatic sync only fires from add/re-add/CSV/event-creator paths. Corrected the scenario wording and added a third acceptance scenario making the true behavior (role edits alone have no automatic effect) explicit.
4. Member removal was found to be an existing, unmodified hard `DELETE` of the `event_members` row (verified in `EventAssignmentsDropdown.tsx`), which destroys `planner_permissions_configured_at` even though the Planner-side assignment survives deactivated — an unaddressed gap for the remove-then-re-add lifecycle. Resolved deterministically (no new product decision needed) by adding FR-041a, which makes the reset-on-re-add behavior explicit and intentional rather than an unspecified side effect, consistent with this application's existing hard-delete removal semantics.

Also independently confirmed via live Planner introspection: `access_role` is not referenced by any live RLS policy or SQL function, so treating it as a cosmetic, server-derived value (FR-026–FR-028) is safe. Also confirmed via code that CSV re-import (`importMemberRow`) calls Planner sync even for an already-existing member (duplicate-insert case), which is concrete, real-world evidence — not just a defensive hypothetical — for why FR-043–FR-045 (never overwrite a configured or deliberately-disabled assignment) are required as stated.

No remaining findings require a new product decision. Spec is considered ready for `/speckit.plan`.

### 2026-09-20 — /speckit.analyze pre-implementation consistency pass (before /speckit.implement)

Cross-checked spec.md/plan.md/research.md/data-model.md/contracts.md/tasks.md against each other and against the live codebase. One genuine, high-value gap found and fixed; one open implementation choice resolved:

1. **Disable-before-Save gap (the most significant finding of this pass)**: research.md R9 (Enable-vs-Save split) tied `planner_permissions_configured_at` to Save alone. Tracing "Enable → Disable, without ever Saving" against the planned `plannerStaffSync.ts` guard (research.md R7, which keys only off that marker) showed that a person disabled before ever being explicitly configured would still read as unconfigured — so the very next automatic-sync trigger (a CSV re-import — a confirmed-real path, not hypothetical) would pass the guard and silently reactivate them, violating FR-045's unconditional "must not reactivate a deliberately deactivated assignment." Fixed by adding **FR-036a**: Disable now also sets the marker if unset, exactly as Save already does. This required zero change to the guard clause itself — only the `disable` route. research.md R9, plan.md, data-model.md §5, contracts.md, and tasks.md (T059, T062) were all updated to match. Does not weaken FR-041a — member removal still deletes the whole `event_members` row (and this marker) regardless of whether it was set by Save or Disable.
2. **Button-visibility open choice resolved**: plan.md previously left open whether Members-page button-visibility gating reuses the real per-member `GET` or a dedicated endpoint, with a tentative (and, on reflection, weaker) lean toward reusing `GET`. Resolved in favor of a dedicated `GET .../planner-permissions/can-administer` endpoint (research.md R11), matching Feature 007's own `capability` route precedent, avoiding an awkward arbitrary-`memberId` probe, and avoiding an O(rows) risk. plan.md, contracts.md, and tasks.md (new T029a, updated T035) were updated to match.

No other blocking/high inconsistencies were found across the five API contracts, the audit schema/idempotency/reconciliation design, the cross-database partial-failure matrix, or the FR/SR/SC/acceptance-scenario/edge-case/quickstart traceability (recomputed independently, not trusted from the prior self-report). Full findings in this session's `/speckit.analyze` output. Ready for `/speckit.implement`.
