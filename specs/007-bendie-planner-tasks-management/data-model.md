# Phase 1 Data Model: Bendie Planner Tasks Management

No migration on either database. This document records reuse of existing persisted entities plus the derived, non-persisted concepts this feature introduces in application code only.

## Persisted entities (reused, unmodified)

### `operational_tasks` (Planner project, existing table)

| Column | Type | Notes |
|---|---|---|
| `task_id` | integer, PK, serial | Never client-supplied |
| `event_id` | integer, FK → `events.event_id` | Server-derived from the resolved `event_planner_links` mapping; never client-supplied |
| `task_code` | text | Server-derived via `next_event_task_code()` (research.md Q2); never client-supplied |
| `task` | text | Title — required, non-empty (FR-020) |
| `category` | text, nullable | Optional |
| `status` | text | `CHECK` restricted to `'pending' \| 'in progress' \| 'completed'` (case-insensitive at the constraint, canonicalized to Title Case by trigger) |
| `priority` | text | `CHECK` restricted to `'low' \| 'medium' \| 'high'` |
| `due_date` | date, nullable | Optional |
| `remarks` | text, nullable | Optional; the one field a self-assignee may always edit alongside `status` |
| `assigned_profile_id` | uuid, nullable, FK → `profiles.id` ON DELETE SET NULL | Must reference a profile with an active `event_user_assignments` row for this event (Q6/Q7) when set |
| `assigned_to` | integer, FK → legacy `users.id` | **Never read or written by this feature** — legacy column, out of scope |
| `created_by_profile_id` | uuid, nullable | Server-derived from the caller's `planner_profile_id`; never client-supplied |
| `pending` / `active` / `completed` | boolean | Trigger-derived from `status`; never set directly by this feature |
| `created_at` / `updated_at` | timestamptz | Existing defaults/triggers, unmodified |
| `responsible_party` | character varying, nullable | **Not read or written by this feature** — legacy free-text label superseded by `assigned_profile_id` (added `/speckit.analyze`, fresh column re-verification) |
| `source_ref` | text, nullable | **Not read or written by this feature** — import/origin tracking (added `/speckit.analyze`) |
| `metadata` | jsonb, `NOT NULL DEFAULT '{}'` | **Not read or written by this feature** — defaulted, so omitting it on `INSERT` is safe (added `/speckit.analyze`) |

**Validation rules enforced by this feature in `plannerTasks.ts` before every write** (in addition to, never instead of, the live CHECK constraints): `task` non-empty after trim; `status` ∈ the exact three live values (compared case-insensitively — see the casing correction below); `priority` ∈ the exact three live values (case-insensitively); `assigned_profile_id`, if present, must resolve to a profile with an active `event_user_assignments` row for the resolved Planner event (else `400 invalid_assignee`).

**CORRECTION (`/speckit.analyze`, fresh trigger-body re-verification)**: `status`'s Title-Case canonicalization is not reliable for the in-progress state. Two BEFORE triggers fire in sequence — `normalize_operational_task_fields()` canonicalizes to Title Case first, but `enforce_operational_task_status()` fires second and re-derives `status` from the boolean flags using its own casing, writing `'In progress'` (lowercase "p") rather than `'In Progress'` for that one state. `shapePlannerTask` MUST canonicalize `status`'s casing back to the exact `PlannerTask` union on read (never pass the raw stored string through), and `validateTaskStatus` MUST compare case-insensitively — see research.md Q1 for the full trigger trace.

### `event_user_assignments` (Planner project, existing table, already typed in `plannerDatabase.ts`)

Reused read-only for capability resolution (research.md Q4) and assignable-staff listing (Q6): `profile_id`, `event_id`, `is_active`, `can_view_tasks`, `can_manage_tasks`.

### `profiles` (Planner project, existing table, already typed)

Reused read-only: `id`, `full_name`, `is_platform_admin` — for capability resolution and assignee display names.

### `profiles` (Portal project, existing table, Feature 001)

Reused read-only: `planner_profile_id` — the sole identity bridge from a Portal-authenticated caller to their Planner `profiles.id`.

### `event_planner_links` (Portal project, existing table, Feature 001/005)

Reused read-only, unchanged from `planner-overview/route.ts`'s own usage: canonical `(portal event_id) → (planner event_id)` mapping, `.eq('is_active', true)` required.

### `events`, `organization_members`, `event_products` (Portal project, existing tables)

Reused read-only, unchanged: workspace-access resolution (Feature 003), organization-fallback resolution, and `isProductAvailableForEvent(..., 'planner', ...)` (Feature 006) — identical to `planner-overview/route.ts`'s existing sequence.

### `event_task_counters` (Planner project, existing table)

Reused exclusively through the existing `next_event_task_code()` function (research.md Q2) — never read or written directly by this feature.

## Derived, non-persisted concepts (application-code only, no new table/column)

### `TaskCapability`

```ts
type TaskCapability =
  | { hasPlannerIdentity: false }
  | { hasPlannerIdentity: true; canView: boolean; canManage: boolean };
```

Computed per-request (research.md Q4), never cached server-side across requests, never persisted.

### `AssignableStaffMember`

```ts
type AssignableStaffMember = { profileId: string; name: string };
```

Computed per-request from `event_user_assignments` + `profiles` (research.md Q6).

### `PlannerTask` (API/UI shape)

```ts
type PlannerTask = {
  taskId: number;
  taskCode: string;
  task: string;
  category: string | null;
  status: 'Pending' | 'In Progress' | 'Completed';
  priority: 'Low' | 'Medium' | 'High';
  dueDate: string | null;
  remarks: string | null;
  assignedProfileId: string | null;
  assignedProfileName: string | null;
  createdAt: string;
  updatedAt: string;
};
```

An explicit allowlist projection of `operational_tasks` (+ joined assignee name) — never the raw row, never `select('*')`.

## State transitions

`status` has no server-enforced transition graph beyond the three-value CHECK constraint — any authorized caller may set any of the three values in any order (matches the live constraint; the existing mobile app itself imposes no transition graph either). `assigned_profile_id` may move from null → a valid profile, from one valid profile to another (manager/reassignment only), or back to null (unassign, manager only) — never validated against a transition graph, only against "is this profile a valid assignable staff member for this event right now" at the moment of the write.

## Entity relationship summary

```
Portal.profiles (caller) --planner_profile_id--> Planner.profiles (assignee/creator candidate)
Portal.events --event_planner_links--> Planner.events --operational_tasks (event_id)
Planner.event_user_assignments (event_id, profile_id) --derives--> TaskCapability, AssignableStaffMember
Planner.event_task_counters --next_event_task_code()--> operational_tasks.task_code
```
