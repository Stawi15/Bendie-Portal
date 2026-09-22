# Phase 0 Research: Bendie Planner Tasks Management

All findings below are grounded in a fresh live query against the Planner Supabase project (`zghoaawgrmvqdlksuiam`) performed during this planning pass, and a fresh read of the current Portal code — not carried over from the architecture-discovery summary without re-verification.

## Q1 — `operational_tasks` exact live constraints

**Decision**: Trust and mirror exactly what the live database enforces:

- `task_id integer PRIMARY KEY` (serial), `event_id integer` FK → `events(event_id) ON DELETE CASCADE`, `assigned_profile_id uuid` FK → `profiles(id) ON UPDATE CASCADE ON DELETE SET NULL`, `assigned_to integer` FK → legacy `users(id)` — **never used by this feature**.
- `CHECK (lower(btrim(status)) = ANY (ARRAY['pending','in progress','completed']))`.
- `CHECK (lower(btrim(priority)) = ANY (ARRAY['low','medium','high']))`.
- No archive/soft-delete/version column exists anywhere on this table.
- Three additional live columns exist and are deliberately NOT read or written by this feature, consistent with spec.md's Key Entities description of Planner Task (title/category/status/priority/due date/remarks/assignee/task code/audit fields only): `responsible_party` (legacy free-text staff label, `character varying`, nullable — superseded by `assigned_profile_id`), `source_ref` (text, nullable — import/origin tracking), `metadata` (`jsonb`, `NOT NULL DEFAULT '{}'` — no INSERT hazard since it is defaulted). Recorded here so their absence from `PlannerTask`/`shapePlannerTask` reads as a deliberate exclusion, not an oversight.
- **CORRECTION (`/speckit.analyze`, fresh `pg_get_functiondef` re-verification) — trigger order and a genuine casing discrepancy**: two BEFORE triggers fire on both INSERT and UPDATE, in alphabetical-by-trigger-name order — `trg_normalize_operational_task_fields` (canonicalizes `status`/`priority` casing to Title Case and derives the redundant `pending`/`active`/`completed` booleans FROM `status`) fires FIRST; `trg_operational_tasks_status` (`enforce_operational_task_status()`) fires SECOND and **re-derives `status` FROM those booleans using its own, independent casing** — its `'Pending'`/`'Completed'` branches match Title Case, but its in-progress branch writes `NEW.status := 'In progress'` (lowercase "p"), not `'In Progress'`. Net effect: whenever a task's status resolves to the in-progress state, the value **actually stored and returned is `'In progress'`, not `'In Progress'`** — the live CHECK constraint accepts this fine (case-insensitive), but naive exact-string comparison elsewhere (resubmitting an unchanged status value, or a UI lookup table keyed on the literal `'In Progress'`) would silently fail. **Implementation consequence**: `shapePlannerTask` must canonicalize `status`'s casing on the way out (map the trimmed-lowercased value back to the canonical `'Pending'|'In Progress'|'Completed'` tuple) rather than pass the raw stored string through, and `validateTaskStatus`/`validateTaskPriority` must compare case-insensitively (trim + lowercase) rather than by exact string equality — mirroring how the live CHECK constraint itself already treats these values. A fourth trigger, `trg_notify_operational_task_status_change` (`SECURITY DEFINER`), inserts `event_notifications` rows automatically on status change — a pre-existing Planner-side side effect this feature neither builds nor needs to suppress (Notifications remains explicitly out of scope). Re-verified this session: because the Portal server always writes via the service-role client, `auth.uid()` inside this trigger is always `NULL`, so every notification it inserts attributes the change to the generic label `"A team member"` rather than the real actor, and notifies every active, notification-enabled staff assignment for the event with no self-exclusion — confirmed event-scoped (no cross-event leakage), not a defect, and already covered by spec.md's Out of Scope statement.
- **Confirmed via fresh query (`/speckit.analyze`)**: no foreign key anywhere in the Planner schema references `operational_tasks` (zero inbound FKs) — a hard `DELETE` (FR-026) has no cascade/dependent-row hazard. `operational_tasks.event_id` has `ON DELETE CASCADE` toward `events`; `assigned_profile_id` has `ON DELETE SET NULL` toward `profiles` — both pre-existing, both consistent with this feature's design.
- **Confirmed via fresh query (`/speckit.analyze`)**: `operational_tasks.event_id` has no `NOT NULL` constraint at the database level (nullable). The database provides no backstop against an accidental omission — `createTask` must assert a resolved, non-empty `plannerEventId` before inserting, since this is enforced only in application code, never by a schema constraint.

**Rationale**: The Portal server must submit exactly what the live CHECK constraints and triggers expect — no invented enum values, no direct boolean manipulation, and no assumption of an archive mechanism that doesn't exist (confirms spec.md's delete decision, FR-026).

**Alternatives considered**: None — this is a direct transcription of verified live constraints, not a design choice.

## Q2 — Task-code generation strategy

**Decision**: Call the existing Planner Postgres function `next_event_task_code(p_event_id integer) RETURNS text` via the service-role client's RPC interface (`plannerAdmin.rpc('next_event_task_code', { p_event_id: plannerEventId })`) as the **first** step of task creation, before the `INSERT`. This function atomically does `INSERT ... ON CONFLICT (event_id) DO UPDATE SET last_value = last_value + 1 ... RETURNING last_value` against `event_task_counters`, then formats `{event_code}-{padded 4-digit number}` — already race-safe by construction (a single atomic upsert, not a read-then-write).

**Rationale**: The spec (FR-039) and the planning brief both require using the existing race-safe mechanism rather than `MAX()+1` or a second counter. This function requires no `auth.uid()` (confirmed by reading its body — it performs no authentication check at all), so it is safely callable via the service-role client, unlike the task-writing RPCs (see Q3).

**Failure-between-code-generation-and-insert handling**: If the subsequent `INSERT` into `operational_tasks` fails after a task code was already generated, the counter has still incremented — this produces a **gap** in the sequence (a skipped number), never a duplicate. Gaps are an accepted, pre-existing characteristic of this counter (the same risk exists for the live Planner mobile app's own use of this exact function) — Feature 007 does not attempt cross-operation rollback of the counter, matching the brief's explicit guidance not to invent unsafe compensating logic.

**Alternatives considered**: `MAX(task_code)`-per-event derivation — rejected (race-prone, explicitly forbidden). A new Portal-side counter — rejected (would create a second, competing code-generation system for the exact same field).

## Q3 — Why the existing task-writing RPCs cannot be reused

**Decision**: Do not call `create_operational_task`, `update_my_task`, `update_operational_task_status`, or `admin_complete_operational_task` from the Portal server. Perform direct `operational_tasks` table operations via the service-role client instead, with the Portal server independently re-implementing the equivalent permission check before each write.

**Rationale**: Reading each function's actual body (not just its name) confirms `create_operational_task` and both `update_my_task` overloads explicitly `RAISE EXCEPTION 'Authentication required'` when `auth.uid() IS NULL`, and `update_my_task`/`get_my_editable_task` key their entire `WHERE` clause on `ot.assigned_profile_id = auth.uid()`. The service-role connection used for cross-database calls has no Planner-side JWT and therefore no `auth.uid()` — calling these functions via service-role would either fail outright (`auth.uid() IS NULL` branch) or, worse, silently match zero rows in a way that looks like "task not found" rather than a real permission decision. This is not a limitation to work around by impersonating a session; it is confirmation that these RPCs were built for the existing Planner-authenticated mobile client, not for a service-role-mediated bridge — exactly the class of finding the planning brief asked to surface rather than paper over.

**Additionally documented, deliberately not carried into the Portal surface** (each already recorded in spec.md's Clarifications, reconfirmed here against the actual function bodies):
- `update_my_task` (both overloads) lets a self-assignee change `task`, `category`, `priority`, `due_date`, and `remarks`; one overload also lets them change `assigned_profile_id` (reassign). Feature 007's Portal-side self-assignee capability is deliberately limited to `status` and `remarks` only (spec FR-022–FR-024).
- `get_task_assignable_profiles()` returns every Planner profile with a non-empty name, organization/event-agnostic. Feature 007 does not call it; assignable staff are derived from `event_user_assignments` scoped to the specific event (Q6).
- `resolve_profile_for_task()` performs fuzzy name/email matching with a **random-profile fallback** when nothing matches (built for legacy CSV bulk-import via `seed_operational_tasks_from_mock`). Feature 007 never calls this function under any circumstance.

**Alternatives considered**: Minting a synthetic Planner session/JWT for the acting user to legitimately call these RPCs under real RLS — rejected as substantially more complex and outside this feature's scope for no safety benefit, given the service-role-plus-mirrored-check pattern is already the established, approved architecture (Constitution IV) used by every other cross-database write in this codebase (`plannerEventProvisioning.ts`, `plannerStaffSync.ts`).

## Q4 — `event_user_assignments` capability resolution

**Decision**: `event_user_assignments` is already fully typed in `src/types/plannerDatabase.ts` (added in Feature 001) with exactly the columns needed: `profile_id`, `event_id`, `is_active`, `can_view_tasks`, `can_manage_tasks`. Task capability for a given Portal caller resolves as:

1. Read the caller's `profiles.planner_profile_id` from **Portal's** own `profiles` table (via the request's cookie-bound `authClient` — this is a Portal table, no service-role needed for this step).
2. If null → `{ hasPlannerIdentity: false, canView: false, canManage: false }` (FR-013).
3. Else, via the Planner service-role client, read `event_user_assignments` where `event_id = <resolved Planner event id>` and `profile_id = <planner_profile_id>` and `is_active = true`, via `.maybeSingle()`. **A genuine query error here MUST throw** (never fall through to step 4) — the caller must map a thrown error to a distinct `500`/`backend_error`-style response, exactly as `getPlannerOverviewSummary`/`listEventTasks` already do; only a legitimate zero-row `maybeSingle()` result reaches step 4.
4. If no row → `{ hasPlannerIdentity: true, canView: false, canManage: false }` (FR-014).
5. Else → `{ hasPlannerIdentity: true, canView: row.can_view_tasks || row.can_manage_tasks, canManage: row.can_manage_tasks }`.
6. **CORRECTION (`/speckit.analyze`, fresh `pg_get_functiondef` re-verification of `is_platform_admin()`)**: also check the caller's Planner `profiles.is_platform_admin` **OR** `lower(coalesce(profiles.role,'')) IN ('admin','super_admin','superadmin')` — the live RLS's `is_platform_admin()` function checks BOTH the boolean column and this role-string fallback (`SELECT EXISTS (... WHERE p.id = auth.uid() AND (p.is_platform_admin = true OR lower(coalesce(p.role,'')) IN ('admin','super_admin','superadmin')))`); checking the boolean alone, as originally drafted here, would be a narrower definition of "Planner platform-admin" than the live database's own, and would under-grant access to a profile that qualifies only via the `role` string. If true, treat as `canView: true, canManage: true` regardless of the assignment row.

**Rationale**: This is a direct, one-query-per-side mirror of the live RLS policy's own logic (`is_platform_admin() OR assigned_profile_id = auth.uid() OR (event_user_assignments ... can_manage_tasks)`) — the self-assignee branch is handled separately, per-task, at **write** time only (Q7), never folded into this general **read**-capability resolution: a caller can have zero general capability yet still legitimately *update the status/remarks of* the one task assigned to them (FR-022/FR-023), but this never implies they may *list/view* tasks in general — a caller who fails this function's `canView`/`canManage` test is denied the module entirely per FR-014/FR-018, full stop, with no self-assignee read exception (see the contract-level correction in `contracts/planner-tasks-api.md`, which had incorrectly introduced exactly such an exception).

**Alternatives considered**: Deriving capability from Portal-side `event_members.role` alone — rejected: Portal roles and Planner's own `access_role`/`can_*` flags are separate, already-established models (Feature 001 syncs Portal role → initial Planner flags at staff-sync time, but the Planner assignment is the live source of truth thereafter — an admin could change it directly in Planner without a corresponding Portal role change). Reusing Portal's `event_members.role` would silently diverge from Planner's actual permission state.

## Q5 — Authorization pipeline architecture

**Decision**: One sequence, reused identically by every Feature 007 route, following Feature 005's exact established shape with two new steps appended:

```
1. authenticate (authClient.auth.getUser())
2. resolve selected organization (same membership-derived fallback as planner-overview route.ts)
3. requireEventWorkspaceAccess (Feature 003, unchanged)
4. isProductAvailableForEvent(eventId, orgId, 'planner') (Feature 006, unchanged)
5. resolveProvisioningPhase + canonical event_planner_links resolution (Feature 005, unchanged, reused as-is)
6. NEW: resolve caller's Planner identity + event_user_assignments capability (Q4)
7. NEW: authorize the specific requested operation against that capability (Q7)
8. perform the Planner service-role operation
9. shape an explicit, safe response
```

No step is skipped or reordered for any route; steps 1–5 are copy-identical to the existing, already-reviewed `planner-overview/route.ts` logic (extracted inline per-route, matching that file's own convention of not factoring this sequence into a shared helper — see Q5 alternatives).

**Rationale**: Directly satisfies the brief's requested pipeline shape; reusing the *exact* sequence Feature 005 already established (rather than writing a parallel version) is the safest way to avoid subtly diverging authorization behavior between the two Planner-reading routes.

**Alternatives considered**: Factoring steps 1–5 into one shared helper function used by both the Feature 005 and Feature 007 routes — considered, but rejected for this pass: `planner-overview/route.ts` is converged, reviewed, production code; refactoring it to extract a shared helper is exactly the kind of "casually refactor converged infrastructure" the brief and Constitution I warn against for a feature that doesn't require it. Feature 007's route repeats the same ~30 lines inline, consistent with the existing precedent, rather than risking a behavior change in Feature 005 for stylistic consolidation. (A future feature that adds a *third* Planner route may reasonably revisit this.)

## Q6 — Assignable staff query

**Decision**: `listAssignableStaff(plannerEventId)` in `plannerTasks.ts` queries `event_user_assignments` filtered to `event_id = plannerEventId AND is_active = true`, embedding `profiles(id, full_name)` via the existing FK (PostgREST auto-detects `event_user_assignments.profile_id → profiles.id`), returning only `{ profileId, name }` pairs — never a raw Planner profile row, never anything beyond name+id. Eligibility for being *assignable* is simply "has any active assignment for this event" — `can_view_tasks`/`can_manage_tasks` are not additionally required to be assignable (a view-only staff member can still be a legitimate task owner even if they can't manage other tasks), matching how the live schema itself imposes no such extra restriction on `assigned_profile_id`.

**Rationale**: Directly implements spec FR-029; explicitly does not call `get_task_assignable_profiles()` (Q3) since that helper is event-agnostic.

**Alternatives considered**: Filtering assignable staff to `can_manage_tasks = true` only — rejected: nothing in the spec or live schema restricts *being assigned* to managers only; over-restricting here would make ordinary view-only staff unable to be assigned tasks at all, which is not what FR-029 asks for.

## Q7 — Field-level write authorization (per operation)

**Decision**: `plannerTasks.ts` exposes operation-specific functions, each enforcing its own field set and permission requirement — no single generic "update" function that trusts a caller-supplied field list:

| Operation | Required capability | Allowed fields |
|---|---|---|
| `createTask` | `canManage` (or platform-admin) | `task`, `category?`, `priority`, `due_date?`, `remarks?`, `assigned_profile_id?` — `event_id` and `created_by_profile_id` are always server-derived, never accepted from the client; `status` is always `'Pending'`, not accepted from the client |
| `updateTaskAsManager` | `canManage` (or platform-admin) | `task`, `category`, `priority`, `due_date`, `remarks`, `assigned_profile_id`, `status` |
| `updateTaskAsSelfAssignee` | Not `canManage`, but IS the task's current `assigned_profile_id` | `status`, `remarks` only — enforced by construction: the `UPDATE`'s `WHERE` clause includes `AND assigned_profile_id = :callerPlannerProfileId`, atomically re-verifying assignee status at write time (closes any check-then-act race) |
| `deleteTask` | `canManage` (or platform-admin) | n/a (whole row) |
| `reassignTask` | `canManage` (or platform-admin) | `assigned_profile_id` only, after validating the target profile has an active assignment for this event (Q6) |

The route handler determines which function to call based on the resolved capability (Q4) plus, for updates, whether the caller is the task's own assignee (a per-task check made at request time, not cached). A caller with neither `canManage` nor self-assignee status is rejected before any function is invoked.

**Rationale**: Directly implements spec FR-019–FR-028; keeping these as distinct, narrowly-scoped functions (rather than one function branching internally on a role parameter) makes it structurally impossible for a future change to one path to accidentally widen another's allowed fields.

**Alternatives considered**: A single `updateTask(fields, capability)` function with an internal allowlist computed from `capability` — rejected: harder to audit at a glance, and the atomic self-assignee `WHERE`-clause safety net (the single most important security property here) is easiest to guarantee correct as its own dedicated function.

## Q8 — Navigation visibility architecture

**Decision**: Extend `EventLayout.tsx`'s existing per-mount effect (the one that already computes `productAvailability` via `Promise.all([isProductAvailableForEvent(...) for each EVENT_SECTIONS product key])`) with one additional, conditional fetch: when `productAvailability.planner === true`, call a new lightweight endpoint, `GET /api/events/[eventId]/planner-tasks/capability`, storing the result in a new small piece of state, e.g. `plannerTaskCapability: { canView: boolean; canManage: boolean } | null`. `isSectionAvailable` gains one targeted special case: for the `planner-tasks` section key specifically, availability is `plannerTaskCapability?.canView === true` (not the generic per-product boolean map every other section uses). Every other section's gating logic is completely unchanged.

**Rationale**: `EVENT_SECTIONS`' existing `product` field only expresses "does this org/event have the product active" — insufficient for Tasks, which additionally requires a *per-caller* Planner capability check (Planner Overview needed no such check — Feature 005 FR explicitly required "no Planner `event_user_assignments` required" for Overview, so this really is new to Feature 007, not an existing pattern being ignored). A dedicated small endpoint (rather than bundling capability into the full task-list response) means the tab-visibility check never fetches the task list itself, and a client navigation component never talks to Planner directly (Constitution IV) — it calls a Portal server route exactly like `isProductAvailableForEvent` already does today via the browser client against Portal's own tables, except this one crosses into Planner data server-side.

**Alternatives considered**: Adding a generic `requiredCapability` field to `EventSectionMeta` now, anticipating Checklist/Vendors will need the identical shape later — rejected as premature: Feature 007 is scoped to Tasks only, and one targeted special case is simpler to review than a new generic gating field with only one real consumer; a future feature adding a second capability-gated tab is the right time to generalize this, not before.

## Q9 — UI scope and primitives

**Decision**: Reuse the Portal's existing table/list patterns (the same shape as `EventsOverviewPanel`'s row-table, and `FormModal`/`.btn-primary`/`.input`/`.label` for create/edit) rather than introducing any new list or form primitive. A single page (`planner-tasks/page.tsx`) renders: a filter bar (status/priority/assignee, per FR-036), a task table (title, code, status, priority, category, due date, assignee, per FR-035), and — only for `canManage` callers — a create button and per-row edit/delete controls; a self-assignee-only caller sees a narrower inline control on their own rows (status change + remarks) with no edit/delete affordance elsewhere; a view-only caller sees the table with zero mutation affordances anywhere.

**Rationale**: Matches Constitution V (reuse existing UI conventions) and the brief's explicit "do not introduce a new design system" instruction.

## Q10 — Error/state model and HTTP status mapping

**Decision**: Two tiers, matching the established Feature 005 convention:

- **Hard denials** (caller should never have reached this at all) → non-200 status, generic body: `401 not_authenticated`, `404 event_not_found` (workspace access failure — matches Feature 005's existing "don't distinguish missing from unauthorized" convention), `403 product_unavailable`, `403 planner_identity_unavailable` (FR-013), `403 task_access_denied` (FR-014/FR-018), `403 task_manage_denied` (a manage-only operation attempted without capability).
- **Configuration/data states** (caller legitimately reached the module; here's why data isn't ready) → `200 {ok:true, status:...}`, reusing `resolveProvisioningPhase`'s exact existing vocabulary (`pending`/`stale`/`failed`/`unavailable`/`backend_error`) for the counterpart-link half, unchanged from Feature 005.
- **Request-level validation failures** → `400` with a specific code: `invalid_request` (missing title), `invalid_status`, `invalid_priority`, `invalid_assignee` (not in the event's active assignment list).
- **Not-found for a specific resource** → `404 task_not_found` (used identically whether the task genuinely doesn't exist or belongs to a different event — never reveals cross-event existence, matching this codebase's established cross-tenant-hiding convention).
- **Write failure** → `500 {error:'planner_write_failed', message:'Could not save — try again.'}`, matching `/api/events/create`'s existing convention for a genuine backend failure on a write (as opposed to Feature 005's read-only `200 backend_error`, which describes a *page state* rather than a failed *action*).

**Rationale**: Directly implements spec FR-045–FR-050 and keeps a clean line between "you're not supposed to be here" (repeatable, cacheable-as-denied) and "you're here, but the current state/action needs description" (must never be mistaken for one another, per Feature 006's own hard-won F1 lesson about conflating error with absence).

## Q11 — Concurrency

**Decision**: No optimistic-locking column, no client-trusted optimistic state. Every mutation's response is the authoritative row; the page's data layer refetches (or reconciles from the mutation's own response body, which returns the full updated row) rather than merging a client-held draft. A `PATCH`/`DELETE` targeting a task that no longer exists, or no longer belongs to the resolved event, returns `404 task_not_found` uniformly — the client treats this identically whether the task was deleted by someone else or never existed, refetching the list afterward.

**Rationale**: Matches spec FR-043/FR-044 exactly; consistent with this codebase's established generation-ref stale-response pattern for *reads* (Feature 006), while writes remain simple synchronous request/response with no client-side optimism to protect against staleness.

## Q12 — Controlled test fixtures

**Decision**: Reuse the existing controlled fixture — "Bendie Planner Sample" organization, "Stawi Escape — Planner Test" (Planner-only) and "Stawi Escape — Both Test" (Both) events, both with real, live `event_planner_links`. Test tasks created during implementation verification will be tagged identifiably (e.g. a `remarks` or `category` value like `"Feature 007 verification"`) so they can be found and removed afterward without touching any other row in the shared, actively-used `operational_tasks` table (500+ real rows belonging to real, unrelated events). No new organization/event fixture is required for Feature 007.

**Rationale**: Matches the brief's explicit instruction not to mutate unrelated production data merely to test Tasks, and reuses rather than duplicates the existing Feature 005/006 fixture investment.
