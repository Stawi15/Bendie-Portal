# API Contracts: Bendie Planner Tasks Management

All routes are Next.js Route Handlers under `src/app/api/events/[eventId]/planner-tasks*`, following the exact `@supabase/ssr` cookie-bound-then-service-role pattern established by `planner-overview/route.ts`. `eventId` is always the **Portal** event id (uuid); Planner's own integer event id is resolved server-side via `event_planner_links` and never accepted from a client.

Every route runs the full authorization pipeline (research.md Q5) before touching Planner data. Steps 1–5 (auth, org resolution, workspace access, product availability, provisioning/link resolution) are identical across all five routes below and are not repeated per-route except to note their result codes.

## Shared status/error vocabulary

| Status | Body shape | Meaning |
|---|---|---|
| 401 | `{ error: 'not_authenticated' }` | No valid session |
| 404 | `{ error: 'event_not_found' }` | Workspace access failed (Feature 003) — indistinguishable from truly nonexistent, matching existing convention |
| 403 | `{ error: 'product_unavailable' }` | `event_products` does not include `planner` for this event |
| 200 | `{ ok: true, status: 'pending' \| 'stale' \| 'failed' \| 'unavailable' }` | **PROVISIONING/CONFIGURATION state, not an error.** The Planner counterpart is not yet ready — reuses `resolveProvisioningPhase` verbatim (Feature 005). Carries no `capability`/`task` data by design. A recognized, expected response a consumer should render as "not ready yet," never as a failure. |
| 200 | `{ ok: true, status: 'backend_error' }` | **GENUINE BACKEND FAILURE, not provisioning.** The Planner/Portal read itself failed (missing config, a Supabase query error, an unexpected exception) — distinct in kind from the four provisioning statuses above, even though it shares the same `200`/`status` envelope for historical consistency with `resolveProvisioningPhase`'s vocabulary. **Consumers MUST NOT treat `backend_error` as a fifth provisioning phase, and MUST NOT collapse the four provisioning statuses into `backend_error` (or any other error state) either** — `/code-review` M2 found and corrected exactly this conflation in `EventLayout.tsx`'s capability-tab-visibility consumer; see `tasks.md`'s Correction Log for the incident. |
| 403 | `{ error: 'planner_identity_unavailable' }` | Caller has no `planner_profile_id` (FR-013) |
| 403 | `{ error: 'task_access_denied' }` | Caller has a Planner identity but no `can_view_tasks`/`can_manage_tasks`/platform-admin for this event (FR-014/FR-018) |
| 403 | `{ error: 'task_manage_denied' }` | A manage-only operation attempted by a non-manager, non-self-assignee caller |
| 400 | `{ error: 'invalid_request', message }` | Missing/empty required field |
| 400 | `{ error: 'invalid_status', message }` | `status` not one of the three live enum values |
| 400 | `{ error: 'invalid_priority', message }` | `priority` not one of the three live enum values |
| 400 | `{ error: 'invalid_assignee', message }` | `assigned_profile_id` not an active assignment for this event |
| 404 | `{ error: 'task_not_found' }` | Task id doesn't exist, or belongs to a different event — never distinguished |
| 500 | `{ error: 'planner_write_failed', message: 'Could not save — try again.' }` | Genuine backend write failure |

## `GET /api/events/[eventId]/planner-tasks`

Bundled list endpoint — list + capability + assignable staff in one response (research.md Q5 Technical Context "fewer coherent requests").

**Success — 200**:
```json
{
  "ok": true,
  "capability": { "hasPlannerIdentity": true, "canView": true, "canManage": false },
  "callerProfileId": "uuid",
  "tasks": [ /* PlannerTask[] per data-model.md, ordered by due_date asc nulls last, then created_at asc */ ],
  "assignableStaff": [ /* AssignableStaffMember[] — only populated when capability.canManage is true; [] otherwise */ ]
}
```
**Implementation addition (during `/speckit.implement`)**: `callerProfileId` — the caller's own resolved Planner `profiles.id` — is echoed back so the client can identify which task (if any) is assigned to them, for the self-assignee status/remarks control (FR-022/FR-023). Safe to expose: it is the caller's own identifier, never another user's.

If `capability.canView` is `false`, responds `403 task_access_denied` — never a `200` with an empty or partial task list, so the client can distinguish "no tasks yet" from "not permitted to view tasks" (FR-014).

**CORRECTION (`/speckit.analyze`)**: an earlier draft of this contract described a "self-assignee-sees-own-task" bypass — a caller with `canView: false` who is nonetheless the `assigned_profile_id` on a task would still receive that task. **This has been removed.** It contradicted FR-014/FR-018's unqualified rule ("MUST NOT be able to access the Tasks module" / "MUST NOT receive a degraded or partial Tasks view"), and — freshly re-verified against the live database this session — has no grounding in Planner's own native RLS: `operational_tasks`'s SELECT policy (`operational_tasks_select_assigned_or_admin`) is `is_platform_admin() OR (event_user_assignments ... can_view_tasks OR can_manage_tasks)` with **no** `assigned_profile_id = auth.uid()` branch at all (that branch exists only on the separate write policy). A caller who fails `capability.canView` is denied this endpoint entirely, with no exception for being a task's assignee. This does not weaken User Story 2: the self-assignee status/remarks capability (FR-022/FR-023, `PATCH`) presupposes the caller already cleared this read gate via `can_view_tasks=true` (the ordinary case for an assigned staff member) — it relaxes the *write* gate only, never this *read* gate.

## `GET /api/events/[eventId]/planner-tasks/capability`

Lightweight, dedicated endpoint for tab-visibility (research.md Q8) — never fetches tasks.

**Success — 200**:
```json
{ "ok": true, "capability": { "hasPlannerIdentity": true, "canView": true, "canManage": false } }
```
Never 403s on its own account for `task_access_denied` — this endpoint's entire purpose is to let the caller find out their capability, including a `canView: false` result, so `EventLayout.tsx` can decide the tab is hidden. It still returns the standard 401/404/403(`product_unavailable`)/200(`status`) results from the shared pipeline steps 1–5.

**CORRECTION (`/speckit.analyze`)**: a genuine backend failure while resolving capability (the `event_user_assignments`/`profiles` query itself erroring — network/DB failure, not a legitimate zero-row result) MUST be surfaced as `500 { error: 'planner_write_failed' }`'s read-path counterpart, `200 { ok: true, status: 'backend_error' }` (reusing the existing provisioning-phase vocabulary), and MUST NOT be silently collapsed into `{ canView: false, canManage: false }`. Collapsing a query failure into a legitimate-looking denial would reproduce Feature 006's F1 defect class (an entitlement-read error indistinguishable from genuine zero-entitlement) in a new location — `resolveTaskCapability` (research.md Q4 step 3) throws on a genuine query error specifically so this route can distinguish the two.

## `POST /api/events/[eventId]/planner-tasks`

Requires `capability.canManage === true` (or platform-admin) — else `403 task_manage_denied`.

**Request**:
```json
{
  "task": "string, required, non-empty",
  "category": "string | null, optional",
  "priority": "'low' | 'medium' | 'high', required",
  "dueDate": "YYYY-MM-DD | null, optional",
  "remarks": "string | null, optional",
  "assignedProfileId": "uuid | null, optional"
}
```
`status` is never accepted — server always creates as `'Pending'`. `event_id`, `task_code`, `created_by_profile_id` are always server-derived (data-model.md).

**Success — 201**: `{ ok: true, task: PlannerTask }`

**Errors**: `400 invalid_request` (empty `task`), `400 invalid_priority`, `400 invalid_assignee`, `403 task_manage_denied`, `500 planner_write_failed`.

## `PATCH /api/events/[eventId]/planner-tasks/[taskId]`

Branches server-side (research.md Q7) based on the resolved capability and whether the caller is the task's current assignee:

- **Manager** (`canManage` or platform-admin): may submit any of `task`, `category`, `priority`, `dueDate`, `remarks`, `assignedProfileId`, `status`.
- **Self-assignee** (caller's `planner_profile_id === task.assigned_profile_id`, not a manager): may submit only `status` and/or `remarks`; any other field present in the request body → `403 task_manage_denied`. The underlying `UPDATE` additionally carries `WHERE assigned_profile_id = :callerPlannerProfileId` as a atomic defense-in-depth check.
- **Neither** → `403 task_manage_denied`.

**CORRECTION (`/code-review` M1)** — manager `assignedProfileId` handling, precisely:
- **Omitted** from the request body → assignment is left untouched; no validation is performed.
- **Present and equal to the task's current persisted `assigned_profile_id`** (exact equality, including both `null`) → always allowed, even if that assignee's `event_user_assignments` row is now inactive or the assignee is otherwise unresolvable. A historical/inactive assignee may remain on an existing task (FR-032) and an unrelated edit (priority, due date, title, category, remarks, status) must never be blocked by it.
- **Present and `null`, where the current persisted value is non-`null`** (an explicit clear/unassign) → always allowed, no validation needed.
- **Present and different from the current persisted value** (a genuine reassignment) → validated against the event's CURRENT active, event-scoped assignable staff exactly as before; an inactive, cross-event, unresolved, or arbitrary profile is rejected with `400 invalid_assignee`. An inactive/historical assignee is never exempt from this validation for a NEW assignment — only for keeping the exact value already persisted.

**Request**: any subset of the fields listed above for the caller's role.

**Success — 200**: `{ ok: true, task: PlannerTask }` (the full authoritative row post-update).

**Errors**: `400 invalid_status`, `400 invalid_priority`, `400 invalid_assignee`, `404 task_not_found` (task id not found/not in this event, or — for the self-assignee path — the atomic `WHERE` matched zero rows because assignment changed concurrently), `403 task_manage_denied`, `500 planner_write_failed`.

## `DELETE /api/events/[eventId]/planner-tasks/[taskId]`

Requires `capability.canManage === true` (or platform-admin) — else `403 task_manage_denied`. Hard delete, no archive (FR-026).

**Success — 200**: `{ ok: true }`

**Errors**: `404 task_not_found`, `403 task_manage_denied`, `500 planner_write_failed`.
