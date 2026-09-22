# Feature 014 Tasks: Bendie Planner Production Management

Lightweight checklist per the rapid-implementation workflow. ~38 tasks.

## Data-access layer

- [x] T01 Create `src/lib/plannerProduction.ts` (`'server-only'`), types: `ProductionSession`, `ProductionCapability`, `ProductionSessionCreateInput`, `ProductionSessionPatch`, error classes.
- [x] T02 `resolveCallerPlannerIdentity` (duplicated, established convention).
- [x] T03 `resolveProductionCapability(plannerEventId, plannerProfileId)` — platform-admin bypass; else `canView = can_view_production` on an active assignment; `canManage` always `false` here.
- [x] T04 `SESSION_VIEW_COLUMNS` + `listSessions(plannerEventId)` — reads `production_sessions_v` (not the base table) for `displayStatus`; sorted by `session_date` then `COALESCE(sort_order, 999999)`.
- [x] T05 `SESSION_BASE_COLUMNS` + `getSession(plannerEventId, productionId)` — reads `production_tasks` (the base table, for the raw editable columns); item-scope check.
- [x] T06 `createSession(plannerEventId, input)` — requires `sessionTitle`/`sessionDate`; computes `start_at`/`end_at` from date+times, mirrors into `base_start_at`/`base_end_at`/`base_start_time`/`base_end_time` (defaulting the `NOT NULL` base time columns to `00:00:00` when no times given, and correctly leaving the `_at` timestamp pair `null` rather than a fake equal pair — see the corrective fix below).
- [x] T07 `updateSession(plannerEventId, productionId, patch)` — re-mirrors `base_*` on any timing edit; never touches `assigned_to`/`location_override`.
- [x] T08 `deleteSession(plannerEventId, productionId)` — pre-checks for any session referencing this one via `parent_production_id`; clean validation error.
- [x] T09 `normalizePlannerProductionError`.
- [x] T09a **Corrective fix, found during live verification**: two `CHECK` constraints not caught by the original FK/PK-only discovery query — `start_at < end_at` (and the `base_*` equivalent) and a 5-value `status` enum (`pending`/`ready`/`active`/`completed`/`cancelled`). Fixed by (a) never synthesizing a fake equal `00:00:00`/`00:00:00` timestamp pair when no times are given — leaving `start_at`/`end_at`/`base_start_at`/`base_end_at` genuinely `null` instead, which the `CHECK` explicitly permits, and (b) validating `status` against the real enum server-side (`validateStatus`) instead of treating it as free text, with the UI's status control changed from a "Custom…" free-text box to a fixed 5-option select.

## API routes

- [x] T10 `src/app/api/events/[eventId]/planner-production/capability/route.ts` — capability-only, `canAdministerPlannerPermissions`-first sequence.
- [x] T11 `.../planner-production/route.ts` `GET` — list (from the view) + capability.
- [x] T12 `.../planner-production/route.ts` `POST` — manage-only create; allowlist covering all USER-MANAGED fields.
- [x] T13 `.../planner-production/[productionId]/route.ts` — item pre-fetch (404 cross-event/missing), `PATCH` allowlist (empty-body rejected), `DELETE`.
- [x] T14 Wire `normalizePlannerProductionError` into all three route files' catch blocks.

## Navigation/capability integration

- [x] T15 `eventSectionMeta.ts` — add `planner-production` (`product: 'planner'`, standalone tab, not nested under Logistics).
- [x] T16 `EventLayout.tsx` — sixth independent capability block (`PlannerProductionCapabilityState`), parallel addition, no changes to any prior block.

## UI

- [x] T17 `src/app/portal/events/[eventId]/planner-production/page.tsx` — state machine identical to every prior module's page.
- [x] T18 `PlannerProductionList.tsx` — schedule table, time/title/type/track/room columns, `displayStatus` badge, Edit/Delete for Manage-capable users.
- [x] T19 `PlannerProductionModal.tsx` — full USER-MANAGED field set; "parallel to" `<select>` sourced from the same event's other sessions; `status` select (Auto/Pending/Ready/Active/Completed/Cancelled — corrected from an initial free-text design once the live enum constraint was found).
- [x] T20 Slide metadata displayed read-only (filename if present) — no upload control anywhere (spec.md Exclusions).
- [x] T21 Confirmed no `assigned_to`/`location_override`/`advance_production_session` control exists anywhere in the UI (verified by inspection).

## Quality gate

- [x] T22 `npm run type-check` clean.
- [x] T23 `npm run lint` clean.
- [ ] T24 Production build not run — dev server live throughout, identical accepted precedent to Features 008–013.

## Live verification (synthetic fixtures only)

- [x] T25 Manage-capable caller: created a session with both start/end times, edited it, deleted it (and separately a parent/child pair, see T30).
- [x] T26 View-only caller (`can_view_production=true`, non-admin): saw the schedule (including the created session), denied create/edit/delete, each independently returning `403 production_manage_denied`.
- [x] T27 No-access caller: capability returned `{hasPlannerIdentity:false}`; list denied `403 planner_identity_unavailable`.
- [x] T28 Canonical base-table verification: every mutation response is a direct `production_tasks` re-read; final cleanup confirmed zero test rows remained.
- [x] T29 **`production_sessions_v` verification (critical)**: confirmed directly — a session dated 2026-08-01 10:00–11:00 (in the past relative to the live system clock) correctly showed `displayStatus: "Completed"` through the view immediately after creation, and an edited title was immediately visible through the view too. This is a genuine, unplanned proof of the automatic time-based detection actually working end-to-end through the real read path, not just a conceptual check against the CASE expression.
- [x] T30 Delete correctly blocked while the session was another session's `parent_production_id`, returning a clean message; unblocked and succeeded once the child was removed.
- [x] T31 Cross-event mutation rejected: `404 production_session_not_found` (genuine item-scope check, workspace access independently held on both events).
- [x] T32 Invalid input rejected: missing title, missing date, end time before start time, and an out-of-enum `status` value all correctly returned `400 invalid_request` with clean messages — the last two found and fixed during this same verification pass (see T09a).
- [x] T33 Planner-only event ("Stawi Escape — Planner Test") tested at the API/data level: capability and list both succeeded with full access, correctly showing its 3 pre-existing real sessions with automatically-computed `Pending` status (all dated in the future).
- [x] T34 People/Logistics/Tasks spot-checked immediately after the Production mutations above — all still correctly functional and unaffected (Tasks correctly showed its own independent `{hasPlannerIdentity:false}` for this identity, exactly as before Feature 014 existed).
- [x] T35 Fixture cleanup: all 4 disposable auth users (3 Portal, 1 Planner) deleted via the Auth Admin API; all supporting rows (`organization_members`, `event_members`, `event_user_assignments`, Planner `profiles`) deleted; every test `production_tasks` row confirmed removed via the API itself, with a final row-count query confirming zero remain. The two long-lived retained fixtures re-confirmed present and untouched.

## Documentation

- [x] T36 Updated `context/planner-backend-coverage-audit.md` with the "Current Bendie Planner Application Usage Verification" (§13) section (Logistics/Production/Blueprints, distinguishing LIVE SCHEMA VERIFIED / CURRENT PLANNER SOURCE VERIFIED / INFERRED), and marked §12's Ground Transport/Production uncertainty items resolved.

## Close-out

- [x] T37 Checkboxes above reflect exactly what was genuinely verified this pass; T24 (production build) is the one item left honestly unchecked and deferred, per established precedent.
- [x] T38 This is the stop point — Feature 015 not started, no feature converged.
