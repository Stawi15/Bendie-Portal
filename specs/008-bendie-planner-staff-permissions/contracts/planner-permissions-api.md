# API Contracts: Bendie Planner Staff & Module Permissions

All routes are Next.js Route Handlers under `src/app/api/events/[eventId]/members/[memberId]/planner-permissions*`, following the exact `@supabase/ssr` cookie-bound-then-service-role pattern established by `planner-tasks/route.ts` (Feature 007). `eventId` is always the **Portal** event id (uuid); `memberId` is always the **Portal** `user_id` (uuid) of the event member whose Planner access is being administered — never a Planner id of any kind. Planner's own integer event id and profile id are resolved server-side (`event_planner_links`, `profiles.planner_profile_id`) and never accepted from the client.

Every route runs the same shared authorization pipeline before touching any Planner-permission data. This is intentionally a **superset** of Feature 007's pipeline, adding the Feature 008 administration-authority check as an additional layer on top, never a replacement for it (FR-003 requires the Feature 003 floor to be established before this feature's own check runs):

1. Authenticate (`401 not_authenticated`).
2. Resolve the caller's selected organization / platform-admin status (identical to `planner-tasks/route.ts`).
3. `requireEventWorkspaceAccess` — the caller must hold an explicit `event_members` row for **this** event, belonging to their currently selected organization (`404 event_not_found` on failure, matching every existing Planner route's convention of not distinguishing "forbidden" from "doesn't exist").
4. `isProductAvailableForEvent(eventId, organizationId, 'planner')` (`403 product_unavailable`).
5. `resolveProvisioningPhase` + canonical `event_planner_links` resolution, reused verbatim from Feature 005/007 (`200 { ok: true, status: <phase> }` for any non-ready phase).
6. **New**: `canAdministerPlannerPermissions(eventId, callerId, authClient)` (`src/lib/eventAuth.ts`, research.md R5) — platform admin, or organization owner/admin of the event's organization. `403 permission_admin_denied` on failure. This check is independent of, and never satisfied by, the caller's own `event_members.role` or any `can_manage_*` flag.
7. Resolve the **target** member: an `event_members` row for `memberId` on this event (`404 member_not_found` if absent — a `memberId` that is not currently a member of this event is always rejected, never silently treated as "not yet enabled").

Note the deliberate consequence of step 3 applying to the **caller**: an organization owner/admin who is not also an `event_members` participant of this specific event is denied (`event_not_found`) before step 6 is ever reached, exactly mirroring Feature 007's own precedent that Feature 003 workspace access is a floor beneath every Planner-touching feature, not something Feature 008 relaxes. See plan.md "Security considerations" for this being called out explicitly as an intentional scope boundary.

## Shared status/error vocabulary

| Status | Body shape | Meaning |
|---|---|---|
| 401 | `{ error: 'not_authenticated' }` | No valid session |
| 404 | `{ error: 'event_not_found' }` | Caller lacks Feature 003 workspace access to this event |
| 403 | `{ error: 'product_unavailable' }` | Event has no active Planner entitlement/product |
| 200 | `{ ok: true, status: 'pending' \| 'stale' \| 'failed' \| 'unavailable' }` | Provisioning/link not ready — reused verbatim from Features 005/007 |
| 200 | `{ ok: true, status: 'backend_error' }` | Genuine backend failure, never conflated with the provisioning statuses above (Feature 006 F1 defect class) |
| 403 | `{ error: 'permission_admin_denied' }` | Caller is not a platform admin or organization owner/admin of this event's organization |
| 404 | `{ error: 'member_not_found' }` | `memberId` is not a current `event_members` row for this event |
| 400 | `{ error: 'invalid_request', message }` | Malformed body / unknown field submitted where an allowlisted field was expected |
| 409 | `{ error: 'not_enabled' }` | `PATCH` (save) or `disable` attempted while the member has no active Planner assignment |
| 500 | `{ error: 'planner_write_failed', message: 'Could not save — try again.' }` | Genuine write failure (Planner or Portal) |

## `GET /api/events/[eventId]/planner-permissions/can-administer`

**Added during `/speckit.analyze` (research.md R11)** — resolves the previously-open "button visibility" implementation choice. Event-scoped, no `memberId` — answers whether the *current viewer* may administer *anyone's* Planner permissions for this event, for gating the Members-page entry point without probing an arbitrary row. Runs only pipeline steps 1–6 (no target-member resolution).

**Success — 200**: `{ ok: true, canAdminister: boolean }`.

Shares the same 401/404/403(`product_unavailable`)/200(`status`) results as every other route's steps 1–5; never returns `permission_admin_denied` itself — a `false` value for `canAdminister` **is** the answer, not a denial.

## `GET /api/events/[eventId]/members/[memberId]/planner-permissions`

Read the target member's current Planner access/permission state. **Corrected 2026-09-21 (`/review` finding, LOW)** — the original wording here overclaimed that this route is unconditionally "the only read authorization boundary... any non-admin request receives 403." In fact this route follows the exact same shared pipeline as every other Feature 008 route (see "Every route runs the same shared authorization pipeline" above): steps 1–5 (auth, org resolution, workspace access, product availability, provisioning/link resolution) run first, and step 5's early return (`200 { ok: true, status: <phase> }`) fires *before* step 6's `canAdministerPlannerPermissions` check whenever the event's Planner provisioning isn't fully ready. That early-return path carries only provisioning-phase information — never `modules`, `preset`, `isEnabled`, or any other permission data — and provisioning status is already treated as workspace-level information elsewhere in this codebase (Features 005/007), not permission-administration-level information. **Once step 5 passes** (the event is fully provisioned and linked), SR-001/FR-005 do apply in full: an ordinary event member requesting another member's state, or their own, without administration authority receives `403 permission_admin_denied`, identically to a write. The existing Members list is unaffected by this route and continues to show ordinary member information under its own, existing authorization model.

**Success — 200**:
```json
{
  "ok": true,
  "state": {
    "isEnabled": false,
    "hasBeenConfigured": false,
    "preset": "viewer",
    "modules": [
      { "key": "overview", "label": "Overview", "view": true, "manage": null },
      { "key": "production", "label": "Production", "view": true, "manage": null },
      { "key": "logistics", "label": "Logistics", "view": true, "manage": null },
      { "key": "tasks", "label": "Tasks", "view": true, "manage": false },
      { "key": "notifications", "label": "Notifications", "view": true, "manage": null },
      { "key": "checklist", "label": "Checklist", "view": true, "manage": false },
      { "key": "vendors", "label": "Vendors", "view": true, "manage": false }
    ]
  }
}
```
When `isEnabled` is `false` and no assignment has ever existed, `modules` reflects what *would* be applied on enable (the FR-016 role-derived preview for the member's current Portal role) purely for display — no Planner write occurs from a `GET`. `accessRole` and any Planner/`profiles` identifiers are never included in the response (FR-014, SR-006).

## `POST /api/events/[eventId]/members/[memberId]/planner-permissions/enable`

Turns Bendie Planner access on for this member. Internally branches (research.md R9) without the client needing to know or choose which case applies:

- No assignment exists, or one exists but `event_members.planner_permissions_configured_at` is `NULL` → **first-enable branch**: resolve/create the Planner identity (`findOrCreatePlannerProfile`, unmodified), upsert the assignment with `is_active: true` and the FR-016 role-derived flags (`VIEWER_FLAGS`/`MANAGER_FLAGS` per the member's current Portal role). This is also the exact path taken for a re-added member per FR-041a — any stale flags on a surviving-but-unconfigured assignment are intentionally overwritten with fresh defaults.
- An assignment exists, `planner_permissions_configured_at` is set, and `is_active` is currently `false` → **reactivate branch**: set `is_active: true` only; flags are left completely untouched (FR-037).
- An assignment already exists and `is_active` is already `true` → no-op, returns the current state unchanged (idempotent).

**Request**: `{ "operationId": "uuid" }` (client-generated, research.md R3). No other field is accepted.

**Success — 200**: `{ ok: true, state: PlannerPermissionState }` (same shape as `GET`).

**Errors**: `403 permission_admin_denied`, `404 member_not_found`, `500 planner_write_failed` (surfaced to the manager as a plain "Couldn't set up Bendie Planner access — try again," never raw Planner/Auth error text, per FR-033). A retry with the same `operationId` after a failure is safe — the underlying upsert is idempotent regardless (research.md R3 governs only the *audit* row, not the Planner write itself, which was already idempotent via its existing unique constraint).

Writes an `access_enabled` audit row only on the first-enable branch (an idempotent reactivate-to-already-active or a true reactivation is `access_reactivated`, not `access_enabled` — see the `disable`/reactivate audit note below).

## `PATCH /api/events/[eventId]/members/[memberId]/planner-permissions`

Saves explicit module permissions. Requires the member's assignment to currently be `isEnabled: true` (`409 not_enabled` otherwise — a manager must `enable` first).

**Request**:
```json
{
  "operationId": "uuid",
  "preset": "viewer" | "manager" | "custom",
  "modules": {
    "overview": { "view": true },
    "production": { "view": true },
    "logistics": { "view": true },
    "tasks": { "view": true, "manage": false },
    "notifications": { "view": true },
    "checklist": { "view": true, "manage": false },
    "vendors": { "view": true, "manage": false }
  }
}
```
`preset` is an optional client convenience hint (ignored server-side beyond logging — see below); the **authoritative** input is `modules`. `access_role` is never an accepted field (SR-008) — always derived server-side (`deriveAccessRole`).

**Server processing** (authoritative, independent of any client-side preset selection):
1. Reject any module key not in the fixed 7-module set, and reject a `manage` field submitted for Overview/Production/Logistics/Notifications (`400 invalid_request`) — these modules structurally have no manage capability (FR-013).
2. Normalize every submitted module through `normalizeManageImpliesView` (research.md R6): `manage: true` forces `view: true`; the combination `view: false` + `manage: true` is never persisted (FR-023–FR-025).
3. Derive `access_role` from the normalized flags (`deriveAccessRole`).
4. **No-op determination** (`/review` finding, LOW, corrected 2026-09-21): if the normalized flags are byte-for-byte identical to the assignment's current persisted flags **and** `planner_permissions_configured_at` is already non-`NULL` (no ownership transition is required), skip steps 4b/5/6 below entirely and return the current state unchanged (idempotent no-op — matches `disable`'s existing no-op convention). A first-ever explicit Save that happens to match the current role-derived defaults is **never** treated as a no-op even if the flags don't change, because `planner_permissions_configured_at` is still `NULL` at that point — step 5 must still run.
4b. Otherwise, upsert the assignment with the normalized flags + derived `access_role`.
5. If `event_members.planner_permissions_configured_at` is `NULL`, set it to `now()`.
6. Write a `permissions_changed` audit row (before = prior state, after = normalized resulting state).

**Success — 200**: `{ ok: true, state: PlannerPermissionState }` — `state.preset` is always freshly re-derived from the persisted flags (never echoes back the client's submitted `preset` hint), so a client that submitted `preset: "manager"` alongside a hand-edited flag no longer matching Manager sees `"preset": "custom"` in the response, per FR-020.

**Errors**: `400 invalid_request`, `403 permission_admin_denied`, `404 member_not_found`, `409 not_enabled`, `500 planner_write_failed`.

## `POST /api/events/[eventId]/members/[memberId]/planner-permissions/disable`

Sets `is_active: false`. Requires `isEnabled: true` (`409 not_enabled` if already disabled — idempotent no-op instead is also acceptable and preferred for retry-safety; the route returns `200` with the current already-disabled state rather than erroring on a repeat call).

**Request**: `{ "operationId": "uuid" }`.

**Success — 200**: `{ ok: true, state: PlannerPermissionState }` (`isEnabled: false`, all flags unchanged from before the call).

If `event_members.planner_permissions_configured_at` is currently `NULL`, this route sets it to `now()` in the same request, exactly as `PATCH` already does (research.md R9's correction) — a person disabled before ever being explicitly Saved must still be protected from automatic-sync reactivation (FR-036a/FR-045), and the `plannerStaffSync.ts` guard's only signal is this marker.

Writes an `access_disabled` audit row. **This is the same route used by the Members-page manager-initiated disable action; the member-removal path (research.md R10) does not call this route** — it performs its own narrower, unauthenticated-by-the-normal-pipeline (system-initiated) `is_active` update, because by the time it runs the caller is authorizing a *member removal*, not a permissions action, and the target `event_members` row may already be gone (see the member-removal contract below).

## `POST /api/events/[eventId]/members/[memberId]/planner-permissions/deactivate-on-removal` (internal, member-removal side effect only)

Not part of the manager-facing permissions UI. Called fire-and-forget from `EventAssignmentsDropdown.tsx` at the exact moment a member is unassigned from an event (research.md R10), in the same non-blocking style as Feature 001's existing `syncToPlanner()` call. `userId` here may or may not still have an `event_members` row by the time this executes — the route does not depend on it existing.

**Authorization**: identical actor-authority requirement as removing the member in the first place (unchanged by this feature, per the explicit instruction not to alter member-removal authorization) — enforced by requiring the caller to independently pass the same `canAdministerPlannerPermissions`-equivalent-or-broader check used for removal today; this route does **not** introduce a new, separate authorization concept for who may remove members.

**Request**: `{ "eventId": "uuid", "userId": "uuid" }` (both already known to the caller; no lookup into the possibly-already-deleted `event_members` row is required or performed).

**Behavior**: resolve the target's `profiles.planner_profile_id` and the event's canonical `event_planner_links` row (both independent of `event_members`); if either is missing, respond `{ ok: true, status: 'unavailable' }` (nothing to deactivate). Otherwise issue a narrow `UPDATE event_user_assignments SET is_active = false WHERE event_id = ? AND profile_id = ?` (never an upsert — never creates a row). Always writes an `access_disabled` audit row with `after_state.deactivationConfirmed` set to whether that `UPDATE` actually affected a row.

**Success — 200**: `{ ok: true, deactivationConfirmed: boolean }`. Never blocks or reverses the Portal-side member removal regardless of outcome (FR-041).
