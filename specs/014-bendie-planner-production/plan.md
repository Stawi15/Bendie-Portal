# Feature 014 Plan: Bendie Planner Production Management

## Canonical Data

- `production_tasks`, in the Planner Supabase project. No schema change. No Portal-side copy. Portal writes the base table directly; `production_sessions_v` is read-verified post-mutation (plan §"Current-App Compatibility" below), never written to.
- `updated_at` is trigger-maintained (`set_timestamp_production_tasks`) — Portal never sets it manually, unlike every prior Logistics-family module.
- Item-scope security: every mutation resolves the target by `(plannerEventId, productionId)`, mirroring every prior module's "404 covers both missing and wrong-event" shape.

## Data-Access Layer — new `src/lib/plannerProduction.ts`

Own file, own permission domain (`can_view_production`, distinct from `can_view_logistics`) — not folded into `plannerLogistics.ts`.

- `ProductionSession` type (all USER-MANAGED/SYSTEM-MANAGED/ATTACHMENT-METADATA fields per spec.md, plus `displayStatus` read from the view for list purposes — see below), `ProductionSessionCreateInput`, `ProductionSessionPatch`.
- `ProductionCapability`/`ResolvedProductionCapability` — same shape as every prior module.
- `resolveCallerPlannerIdentity` — duplicated (established convention).
- `resolveProductionCapability(plannerEventId, plannerProfileId)` — platform-admin bypass; else `canView = can_view_production` on an active assignment; `canManage` always `false` (Portal-layer-only elevation via `canAdministerPlannerPermissions`, applied at the route layer, identical composition to People/Logistics/Ground Transport).
- `listSessions(plannerEventId)` — reads `production_sessions_v` directly (not the base table) for **list/display** purposes specifically, because `display_status` is the view's computed column and re-deriving that CASE expression in application code would risk drifting from the live app's own logic. Sorted by `session_date` then `COALESCE(sort_order, 999999)`, matching the view's own `sort_key`.
- `getSession(plannerEventId, productionId)` — reads the **base table** (`production_tasks`), not the view, because mutations need the raw editable columns (`start_at`/`end_at`/`base_*`) the view never exposes. Item-scope check.
- `createSession(plannerEventId, input)` — computes `start_at`/`end_at` from `sessionDate` + `startTime`/`endTime` when both times are given, and mirrors the same values into `base_start_at`/`base_end_at`/`base_start_time`/`base_end_time` (spec.md's mechanical finding — required for the view's automatic status detection to function). `base_start_time`/`base_end_time` are the only `NOT NULL` timing columns at the DB level; if no times are given at all, both default to `00:00:00` so the insert never fails on that constraint (documented, not silently papered over).
- `updateSession(plannerEventId, productionId, patch)` — re-mirrors `base_*` to any edited `start_at`/`end_at`/`start_time`/`end_time` (still pre-live-day; Feature 014 never implements live advancement, so there's no "baseline vs. actual" distinction to preserve here).
- `deleteSession(plannerEventId, productionId)` — pre-checks for any session referencing this one via `parent_production_id`; clean validation error, not a raw FK violation (matches `NO ACTION`'s real behavior).
- `normalizePlannerProductionError`.

## Authorization — Route-Layer Composition (identical structure to People/Logistics/Ground Transport)

Same 8-step sequence: Portal auth → selected org → `requireEventWorkspaceAccess` → `isProductAvailableForEvent('planner')` → provisioning/`event_planner_links` → `canAdministerPlannerPermissions` (full bypass) → else Planner identity + `resolveProductionCapability`. Copied inline per route file (established convention).

## API Routes

- `GET /api/events/[eventId]/planner-production/capability` — capability-only.
- `GET/POST /api/events/[eventId]/planner-production` — list (from the view) + capability; manage-only create.
- `PATCH/DELETE /api/events/[eventId]/planner-production/[productionId]` — manage-only edit/delete.

## UI Structure

New standalone tab (not nested under Logistics — Production is its own established roadmap domain, distinct from Flights/Hotels/Ground-Transport's shared "Logistics" grouping).

- `src/app/portal/events/[eventId]/planner-production/page.tsx` — state machine identical to every prior module's page.
- `PlannerProductionList.tsx` — schedule table grouped by date, showing time, title, type/track/room, `displayStatus` badge, Edit/Delete for Manage-capable users.
- `PlannerProductionModal.tsx` — create/edit form covering all USER-MANAGED fields; a "parallel to" `<select>` sourced from the same event's other sessions (excluding itself in edit mode); a `status` control offering "Auto (time-based)" / "Mark Completed" / free-text override.

## Brownfield Files Reused

`plannerAdmin.ts`, `eventAuth.ts` (`requireEventWorkspaceAccess`, `isProductAvailableForEvent`, `canAdministerPlannerPermissions`), `plannerOverview.ts` (`resolveProvisioningPhase`), `eventSectionMeta.ts`, the event workspace layout's independent-capability-block pattern (a sixth parallel block).

## Current-App Compatibility (verification strategy, not implementation)

Because the current Planner application reads `production_sessions_v`, not `production_tasks` directly, live verification for this feature explicitly re-queries the **view** (not just the base table) after every mutation to confirm the change is actually visible through the same read path the real application uses — this is the acceptance chain the user's instructions require, and is treated as a first-class verification step, not an afterthought.

## Security Considerations

- `production_tasks`' own live RLS ("any active assignment can write") is more permissive than Portal's chosen View/Manage gates — Portal's server-side check is strictly narrower, safe as always (service-role bypasses RLS regardless).
- `assigned_to`'s FK to the legacy `users` table is never populated — attempting to use it would silently reference an abandoned identity system with no bridge to Portal's own staff model.
- Slide metadata is displayed read-only; no Storage credentials or signed-URL generation logic is introduced this pass (upload deferred, per spec.md Exclusions).
