# Implementation Plan: Bendie Planner Staff & Module Permissions

**Branch**: `008-bendie-planner-staff-permissions` | **Date**: 2026-09-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/008-bendie-planner-staff-permissions/spec.md` (review PASSED — see `checklists/requirements.md`)

## Summary

Give an organization owner/admin (or Portal platform admin) a manager-facing surface, reached from the existing event Members experience, to explicitly grant/configure/disable/reactivate a person's Bendie Planner access and its seven module permissions — replacing the current silent, all-or-nothing, role-derived `plannerStaffSync.ts` sync as the *only* thing that ever writes `event_user_assignments`. Technical approach: one additive Portal column (`event_members.planner_permissions_configured_at`) as a one-way ownership marker, one new append-only Portal audit table, a narrow server-side data-access module mirroring Feature 007's `plannerTasks.ts` pattern, a new `eventAuth.ts` authorization helper distinct from event-role checks, four small API routes plus one internal removal-side-effect route, and a minimal, spec-mandated extraction of the existing role→flags mapping into a shared module so Feature 008's presets and `plannerStaffSync.ts`'s defaults can never drift apart. No Planner-side schema change.

## Technical Context

**Language/Version**: TypeScript, Next.js 14 App Router (existing stack, unchanged)

**Primary Dependencies**: `@supabase/ssr` (cookie-bound auth client), `@supabase/supabase-js` (service-role clients — `plannerAdmin.ts` for Planner, inline `SUPABASE_SERVICE_ROLE_KEY` client for Portal, both existing patterns), `crypto.randomUUID()` (client-generated idempotency key, no new dependency)

**Storage**: Two separate Supabase Postgres projects — Portal (primary) and Bendie Planner (secondary, cross-project, service-role only). One new Portal column, one new Portal table. Zero Planner-side changes.

**Testing**: This repository has no automated test suite (`npm run type-check` / `npm run lint` / manual browser + live-DB verification is the established convention across Features 001–007) — `quickstart.md` documents the verification plan in that same style, not a new testing framework.

**Target Platform**: Existing Next.js server (Vercel-style deployment, unchanged) + browser client, no new platform surface.

**Project Type**: Web application, single Next.js project (existing structure — no frontend/backend split, no new project).

**Performance Goals**: No new goals; this feature is low-volume, manager-triggered CRUD on a per-member record, not a hot path — matches Feature 007's own "no explicit targets" precedent.

**Constraints**: Every write independently re-verified server-side (Constitution IV); no fake cross-project ACID transaction (spec FR-046); no Planner schema change (Locked Decision 1); no new top-level navigation surface (spec FR-059).

**Scale/Scope**: One new Portal column, one new Portal table, one new `src/lib` data-access module, one new shared presets module, a small guard-clause change to one existing function (`plannerStaffSync.ts`), one small addition to `EventAssignmentsDropdown.tsx`, one new `eventAuth.ts` function, ~5 new route handlers, one new modal component wired into the existing Members page. No changes to Features 001–007's own files beyond the one guard clause and the removal side-effect.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design below.*

| Principle | Check | Result |
|---|---|---|
| I. Brownfield Preservation | Reuses `event_members`, `event_user_assignments`, `findOrCreatePlannerProfile`, `roleToPlannerFlags`'s flag shapes, `eventAuth.ts`, `plannerAdmin.ts`, the Members page, `EventAssignmentsDropdown.tsx`. The only "new abstraction" (the shared presets module) is extracted, not invented — required by the spec's own explicit anti-divergence requirement (FR-020), not a speculative refactor. | PASS |
| II. Architecture Boundaries | No Server Actions, no service/repository layer introduced. New privileged logic lives in `app/api/events/[eventId]/members/[memberId]/planner-permissions*` route handlers (event-scoped, mirroring Feature 007's `app/api/events/[eventId]/planner-tasks*` precedent exactly) plus one narrow `src/lib` module. Feature stays inside the existing Members page rather than a new tab/route. | PASS |
| III. Supabase and Database Safety | Both schema changes are numbered-convention migrations (`supabase/migrations/`, snake_case, header comment). RLS explicitly designed for the new audit table (admin-read-only, reusing `portal_is_global_admin()`). Live grant behavior for `event_members` was verified against the actual live migrations before deciding the new column needs no grant, not assumed. `src/types/database.ts` updates are planned explicitly (data-model.md). | PASS |
| IV. Security | No secret ever leaves server code. Service-role clients only in route handlers/`src/lib` server-only modules. Every route re-verifies authorization independently (contracts.md's shared pipeline, step 6, run on every request, not cached from a page-level check). Least-privilege: the new authorization check is *narrower* than existing event-role checks, not broader. | PASS |
| V. UI Consistency | New UI reuses `FormModal` (or an equivalent existing modal shell), the existing Members-row action-button pattern (`Resend Code`/`Make Facilitator` precedent), existing `.btn-*`/`.input`/`.label` tokens. No new design system, no new icon set. `/imprint` recommended after implementation since a "module permission grid" is a materially new, reusable pattern likely to recur once other Planner modules gain manage flags. | PASS (imprint follow-up noted) |
| VI. Scope Discipline | Explicit Out of Scope section preserved verbatim from the reviewed spec; this plan introduces no additional scope. | PASS |
| VII. Documentation Discipline | `context/progress-tracker.md` update is planned as a `/speckit.converge`/post-implementation step, not during planning (matches this repo's own established sequencing — updated after a feature ships, not before). Flagged as a task-phase item, not overlooked. | PASS (deferred correctly) |
| VIII. Verification and Quality | `quickstart.md` defines loading/error/empty states explicitly (spec FR requires no bare states); `/review` and `npm run type-check`/`lint` remain required gates before completion, unchanged. | PASS |
| IX. Spec Kit + JSM Responsibilities | This plan does not compete with or duplicate `spec.md`; `/architect` was already run and is treated as input, not re-derived. | PASS |

No violations — **Complexity Tracking is empty by design** (no entries required).

## Project Structure

### Documentation (this feature)

```text
specs/008-bendie-planner-staff-permissions/
├── spec.md                                  # Already exists, review PASSED
├── checklists/requirements.md               # Already exists, review PASSED
├── plan.md                                  # This file
├── research.md                              # Phase 0 output (this pass)
├── data-model.md                            # Phase 1 output (this pass)
├── quickstart.md                            # Phase 1 output (this pass)
├── contracts/
│   └── planner-permissions-api.md           # Phase 1 output (this pass)
└── tasks.md                                 # Phase 2 — NOT created by this command
```

### Source code (repository root — existing Next.js App Router project, no new project)

```text
supabase/migrations/
└── planner_permissions_manual_configuration_marker.sql   # NEW — event_members column + audit table (data-model.md §1-2)

src/types/
└── database.ts                              # EDIT — add planner_permissions_configured_at + planner_permission_audit_log types

src/lib/
├── eventAuth.ts                             # EDIT — add canAdministerPlannerPermissions() (research.md R5)
├── plannerPermissionPresets.ts              # NEW — shared PLANNER_MODULES/VIEWER_FLAGS/MANAGER_FLAGS/derive* helpers (research.md R6)
├── plannerPermissions.ts                    # NEW — server-only data-access module (read/enable/save/disable + audit coordination), mirrors plannerTasks.ts's shape
└── plannerStaffSync.ts                      # EDIT — one guard clause (research.md R7); STAFF_ROLES/FULL_ACCESS_ROLES untouched; roleToPlannerFlags() imports VIEWER_FLAGS/MANAGER_FLAGS instead of inlining them

src/app/api/events/[eventId]/planner-permissions/
└── can-administer/route.ts                  # NEW — GET, viewer-authority check for button visibility (research.md R11)

src/app/api/events/[eventId]/members/[memberId]/planner-permissions/
├── route.ts                                 # NEW — GET (read), PATCH (save)
├── enable/route.ts                          # NEW — POST
└── disable/route.ts                         # NEW — POST (also sets planner_permissions_configured_at if unset — research.md R9 correction)

src/app/api/events/[eventId]/members/[memberId]/planner-permissions/
└── deactivate-on-removal/route.ts           # NEW — POST, internal removal side-effect (contracts.md)

src/components/portal/
├── EventAssignmentsDropdown.tsx             # EDIT — fire-and-forget call to deactivate-on-removal on unassign (research.md R10)
└── PlannerPermissionsModal.tsx              # NEW — the manager-facing surface (UI Integration Design below)

src/app/portal/events/[eventId]/members/
└── page.tsx                                 # EDIT — new per-row action button opening PlannerPermissionsModal, gated by the new can-administer/route.ts check (does not touch existing canManage/is_event_host_or_organizer logic)
```

**Structure Decision**: Single existing Next.js project, no new project or directory root. Every new file lands inside an existing, already-established directory (`src/lib`, `src/app/api/events/[eventId]/...`, `src/components/portal`) following the exact precedent Feature 007 set for a Planner-touching module — no new top-level structure is introduced anywhere.

## Design Decisions (full detail in research.md / data-model.md / contracts/)

### Portal migration (research.md R1–R2, data-model.md §1–§2)

One migration file, two additive DDL blocks: the `event_members` column (no grant — inherits the existing column-level-grant precedent's default-deny for a brand-new column) and the `planner_permission_audit_log` table (RLS enabled, one platform-admin-only `SELECT` policy, no client write policy of any kind). No Planner migration. No backfill.

### Audit design (research.md R3–R4, data-model.md §2)

Append-only, `UNIQUE (event_id, member_user_id, operation_id)` for idempotent-retry dedupe (client-generated `operationId` per submit). Audit-insert failure after a successful permission mutation never rolls back the mutation and is not actively reconciled by a background job — the next successful mutation for that member is itself the self-healing mechanism, and a single missing historical row is an accepted, documented residual gap (never a duplicate or misleading one).

### Authorization helper (research.md R5)

`canAdministerPlannerPermissions(eventId, userId, client)` in `eventAuth.ts`, resolving the event's organization server-side and checking platform-admin or `organization_members.role IN ('owner','admin')` for that exact organization — never the caller's `event_members.role`, never any `can_manage_*` flag, never Planner's own `access_role`/`is_org_admin`. Reused identically client-side (UI gating, non-authoritative) and server-side (authoritative, re-verified on every route).

### Preset/defaults single source of truth (research.md R6)

New `src/lib/plannerPermissionPresets.ts` holds `PLANNER_MODULES`, `VIEWER_FLAGS`, `MANAGER_FLAGS`, `derivePresetLabel`, `deriveAccessRole`, `normalizeManageImpliesView`. `plannerStaffSync.ts`'s `roleToPlannerFlags()` is refactored (behavior-identical) to consume `VIEWER_FLAGS`/`MANAGER_FLAGS` from here instead of inlining them, closing the two-divergent-mappings risk the spec review flagged.

### `plannerStaffSync.ts` change (research.md R7–R8)

One guard clause: if the target member's `planner_permissions_configured_at` is set, `syncStaffMemberToPlanner` returns `status: 'skipped'` immediately, before computing flags or touching `event_user_assignments` at all. Covers every real trigger (add, CSV import including its verified duplicate-insert-still-syncs case, add-all-org-members, assign-team, Feature 004 event-creator auto-provision, manual admin re-sync) uniformly, since all six funnel through this one function. `changeRole` is confirmed to call none of this and needs no change.

### First-enable vs. reactivate vs. "manager-owned" (research.md R9)

"Enable" is a distinct action from "Save"/"Disable"; only Save (any preset or custom, even resubmitting the shown defaults unchanged) **or Disable** sets `planner_permissions_configured_at`. "Enable" internally branches into first-enable (apply role-derived defaults; also the path taken on a post-removal re-add, deliberately discarding stale flags per FR-041a) vs. reactivate (restore exactly what was there before disabling) based purely on server-read state — the client never chooses which branch applies.

**Correction from `/speckit.analyze`**: the marker is now also set by Disable, not only Save (spec.md FR-036a, research.md R9). Tracing "Enable → Disable without ever Saving" against the `plannerStaffSync.ts` guard surfaced a real gap: with the marker tied to Save alone, a person disabled before ever being explicitly configured would still read as `NULL`, so the very next automatic-sync trigger (e.g. a CSV re-import — a confirmed-real path per research.md R8) would pass the guard and silently reactivate them, violating FR-045's unconditional "must not reactivate a deliberately deactivated assignment." The fix requires zero change to the guard clause itself (`plannerStaffSync.ts`) — only the `disable` route also sets the marker, exactly mirroring what `PATCH`/save already does.

### Member removal / re-add (research.md R10, contracts.md)

The existing hard-delete `EventAssignmentsDropdown.tsx` removal path is unchanged and unblocked; a new fire-and-forget internal route performs a narrow, non-upserting `is_active=false` update keyed on `profiles.planner_profile_id` + `event_planner_links` (neither of which depends on the `event_members` row surviving), and always records an `access_disabled` audit row carrying whether the deactivation was confirmed — this row *is* the "enough information to retry or reconcile" FR-041 requires, with no second bespoke reconciliation table.

### View/Manage normalization and `access_role` derivation (research.md R6, contracts.md `PATCH`)

Both are server-authoritative and applied unconditionally on every write, regardless of what the client submitted or whether client-side validation already enforced the same rule — normalization, never rejection, for the Manage-implies-View rule; pure derivation, never client input, for `access_role`.

### Concurrency

Last-write-wins, refetch-after-mutation (every route returns the fresh `PlannerPermissionState`), no optimistic locking — identical to Feature 007's own settled position, not a new precedent.

### Types (data-model.md §4)

A `PlannerPermissionState` domain type (never a raw `event_user_assignments` row) is the only shape returned to the client; `PLANNER_MODULES`'s module keys are a literal union, not `string`, so an unsupported module key is a compile error before it can become a runtime one.

## UI Integration Design

**Entry point**: one new small action button in the existing Members-table row Actions cell (`members/page.tsx`, alongside "Make Facilitator"/"Resend Code"), labeled "Bendie Planner Access," rendered **only** when (a) the event has active Planner entitlement (reusing the same product-check the page can already derive from `currentEvent`) and (b) a new, narrow client-side call to `canAdministerPlannerPermissions` (via a lightweight `GET` or a dedicated tiny endpoint, mirroring the page's existing `is_event_host_or_organizer` RPC-on-mount pattern) confirms the *viewer* has administration authority — never merely because they pass the page's existing, event-role-based `canManage`, which is insufficient per Decision 2.

**Modal**: `PlannerPermissionsModal.tsx`, built on the existing `FormModal` shell (Constitution V). Contents, top to bottom:
1. A header naming the person (name/email — from data already on the row, no extra fetch).
2. An "Enable Bendie Planner access" toggle. Off → nothing else renders. On (freshly enabled or already enabled) → the rest below.
3. Viewer / Manager / Custom as a segmented control or radio group — selecting Viewer/Manager immediately updates the checkboxes below (client-side only, until Save); the control shows "Custom" (unselected among Viewer/Manager) whenever the current checkbox state doesn't exactly match either, including on initial load of an already-custom-configured person.
4. The seven-module list, each showing a View checkbox and, only for Tasks/Checklist/Vendors, a Manage checkbox — Overview/Production/Logistics/Notifications render View only, with no disabled/greyed Manage placeholder (FR-012). Client-side, checking Manage auto-checks View and locks it (matching FR-023/024); this is a UX convenience only — the server re-validates unconditionally.
5. Explicit "Save"/"Cancel" buttons — Cancel discards any in-modal changes and closes without calling `PATCH`; toggling Enable/Disable are their own immediate, separately-confirmed actions (each shows its own loading/success/error toast, matching the page's existing per-row async-action pattern e.g. `resendingCode`/`makingFacilitator` state), not bundled into the Save button.
6. Loading state while `GET` resolves; a distinct error state (not a blank modal) if the read fails; a disabled Save button with an inline spinner while a `PATCH` is in flight, matching existing modal conventions elsewhere in the portal.

No raw IDs, Planner event IDs, `planner_profile_id`, or assignment IDs ever appear in any of the above (FR-014) — the modal's props are limited to the Portal `eventId`/member `userId`/display name, exactly as `EditProfileModal` already works.

## Feature 007 Compatibility

No file under Feature 007's ownership (`src/lib/plannerTasks.ts`, its three route files) is edited. `resolveTaskCapability` continues reading `can_view_tasks`/`can_manage_tasks` per-request with no knowledge of who last wrote them — verified true both today and after this feature ships, since Feature 008 only ever writes through the same `event_user_assignments` columns Feature 007 already reads, never adding new ones.

## Feature 006 Compatibility

No new `EVENT_SECTIONS` entry, no new tab, no change to `resolveEventTabProduct` or the `?product=` origin model — the permissions surface lives inside the existing Members tab (already classified, unchanged) rather than being its own navigable section.

## Members Page Regression Considerations

The existing `canManage` (`is_event_host_or_organizer`)-gated CSV import/Add Member/role-change/resend-code/make-facilitator flows are untouched by this plan; the new button/modal is strictly additive to the Actions cell and gated by its own, separate, narrower authorization signal. `importMemberRow`'s existing duplicate-insert-still-calls-sync behavior is deliberately left as-is (the `plannerStaffSync.ts` guard clause makes it safe, rather than the CSV path itself needing a fix) — no behavior change to CSV import beyond that safety fix's downstream effect.

## Security Considerations

- Every route independently re-verifies `canAdministerPlannerPermissions` server-side (never trusts a page-level check) — contracts.md step 6, run before any read or write.
- Client-supplied `access_role`, Planner profile/event/assignment IDs, audit actor, and audit timestamps are never accepted by any route (contracts.md's request shapes are strict allowlists; unknown fields are rejected, not silently ignored, for the `PATCH` body's `modules` map).
- **Deliberate, worth flagging explicitly**: an organization owner/admin who is not also an `event_members` participant of a *specific* event is denied administration of that event's Planner permissions (Feature 003's workspace-access floor applies before Feature 008's own check, per the spec's own FR-003). This mirrors Feature 007's identical precedent and is not a gap introduced by this plan, but it is a real, user-visible boundary: an org owner who wants to administer a given event's Planner permissions must first be (or become) a member of that event. Called out here for awareness, not because it needs to change.
- The audit table's admin-only `SELECT` policy is the only client-facing access to it; no `authenticated`/`anon` policy of any kind exists for `INSERT`/`UPDATE`/`DELETE`, so forging or tampering with audit history is not possible through PostgREST regardless of the acting user's authority level.

## Unresolved Technical Questions

None. The one open item from the original planning pass — whether button-visibility gating reuses the real `GET .../planner-permissions` route or a dedicated endpoint — was resolved during `/speckit.analyze` (research.md R11): a dedicated `GET /api/events/[eventId]/planner-permissions/can-administer` endpoint, matching Feature 007's `capability` route precedent exactly. The original tentative lean toward reusing the real `GET` is superseded — it did not correctly account for the awkwardness of probing an arbitrary `memberId` to answer a per-viewer (not per-member) question, or the risk of the check becoming O(rows) instead of O(1) per page load.

## Unresolved Product Questions

None. All four locked decisions, the spec review's fixes (including FR-041a), and `/speckit.analyze`'s one correction (FR-036a, the Disable-before-Save marker gap) were all resolved without requiring new product input.

## Is `/speckit.tasks` safe next?

Superseded — `/speckit.tasks` has already run against this plan (see `tasks.md`); `/speckit.analyze` has now also run and applied the corrections above. `/speckit.implement` is the next command (see `tasks.md`'s corresponding updates for T029a, T059, T035).
