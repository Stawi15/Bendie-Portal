# Phase 0 Research: Bendie Planner Staff & Module Permissions

All items below were open technical questions after the spec review. Each is resolved against the live database, the actual current codebase, or an already-locked product/architecture decision — none required a new product decision.

## R1 — Where does `planner_permissions_configured_at` live, and does it need a grant?

**Decision**: `event_members.planner_permissions_configured_at TIMESTAMPTZ NULL`, added via plain `ALTER TABLE ... ADD COLUMN` with **no** grant statement for `authenticated`/`anon`.

**Rationale**: Live-verified (`event_members_planner_metadata_column_grant_fix.sql`, `event_members_planner_metadata_update_privilege_fix.sql`) that `event_members` already uses **column-level** grants for `authenticated`/`anon` (not `SELECT *`/table-level), explicitly excluding four existing Planner-managed columns (`planner_assignment_id`, `planner_synced_at`, `planner_sync_status`, `planner_sync_error`). In PostgreSQL, column-level grants are strictly additive per column — a newly `ADD COLUMN`-ed column receives **zero** privileges for any role until an explicit `GRANT` is issued. So the new column is automatically service-role-only from the moment it's created, with no extra `REVOKE` needed, exactly matching its four siblings' access shape. The browser must never read or write this column directly via PostgREST; all access goes through the new Feature 008 API routes.

**Alternatives considered**: Granting `authenticated` a read-only column grant so the client could read it directly — rejected: it's purely server-bookkeeping (FR-022), the UI never needs to display a raw timestamp, and every existing sibling column already established the "system-managed, API-route-only" pattern.

## R2 — Backfill for existing rows

**Decision**: No backfill `UPDATE` statement. Every existing `event_members` row gets `NULL` by column default, and `NULL` is already the semantically correct value for every row that predates this feature (none of them were ever explicitly configured through a mechanism that didn't exist yet).

**Rationale**: The instruction "existing rows should not be falsely marked configured merely because they already have Planner assignments" is satisfied automatically — a populated `event_user_assignments` row today only ever reflects `plannerStaffSync.ts`'s role-derived defaults, never a deliberate manager action. Writing any backfill value other than `NULL` would be actively wrong.

## R3 — Audit table idempotency mechanism

**Decision**: Client generates a random `operationId` (`crypto.randomUUID()`) once per user-initiated mutation attempt (per Save/Enable/Disable/Reactivate click) and includes it in the request body. The audit table enforces `UNIQUE (event_id, member_user_id, operation_id)`. The audit insert is attempted with `.insert(...)`; a `23505` unique-violation on that constraint is treated as "this exact operation was already recorded" and the request returns success rather than erroring or writing a second row.

**Rationale**: This reuses the exact idempotency philosophy already established everywhere else in this codebase (`event_user_assignments`' `UNIQUE (event_id, profile_id)`, `event_agenda_items.source_portal_session_id`'s `UNIQUE (event_id, source_portal_session_id)`) — a database constraint as the single source of truth for "has this already happened," rather than a new distributed-idempotency mechanism. Scoping the uniqueness to `(event_id, member_user_id, operation_id)` rather than a bare global `operation_id` bounds the (already cryptographically negligible) collision blast radius to a single member/event pair.

**Alternatives considered**: A server-generated operation ID returned before the mutation runs (rejected — adds a round trip with no real benefit, since the client is the one initiating and retrying); no idempotency key at all, relying only on the Planner-side upsert's own idempotency (rejected — the Planner write being idempotent doesn't prevent a second, spurious audit row from being written for the same logical retry, which FR-058 explicitly forbids).

## R4 — Audit failure semantics: exact mechanism

**Decision**: The permission mutation (Planner write + `planner_permissions_configured_at` update) and the audit insert are two separate, sequential steps in the same request handler, in that order. If the audit insert throws, the handler still returns `{ ok: true, ... }` with the mutation's real resulting state, plus an internal flag `auditPending: true` that is logged server-side (`console.error`) but not surfaced to the client as an error. Reconciliation is: **the next successful mutation for that same member automatically self-heals** the audit trail, because every subsequent write reads the *current* Planner state as its "before" value — there is no separate reconciliation job to build, because a missed audit row does not corrupt any later audit row's correctness (each audit row is independently before/after-complete). A permanently missing single audit row for one historical change is an accepted, documented gap (FR-057/FR-058 only require no *duplicate* misleading rows, not a guarantee of zero gaps).

**Rationale**: This is the smallest reliable design consistent with FR-049/FR-056: the audit log is explicitly non-authoritative for current state, so a gap in it never causes an incorrect permission decision — only an incomplete history entry, which is exactly the residual risk the spec already accepts by choosing "Option B" (success stands, audit reconciliation pending) over "Option A" (roll back / re-verify). Building an active retry/reconciliation queue for a lightweight, no-UI-yet audit log would be disproportionate machinery for what the spec calls out as explicitly a foundation, not a full audit subsystem.

## R5 — Authorization helper: where does it live, and how is the event's organization resolved?

**Decision**: Add one new function to `src/lib/eventAuth.ts` — `canAdministerPlannerPermissions(eventId, userId, client)` — following the exact existing signature convention of `requireEventWorkspaceAccess`/`isProductActiveForEvent` (optional `client` param, defaults to the shared browser client, so the same function works client-side for UI gating and server-side for authoritative enforcement). It resolves the event's `organization_id` from `events` (never trusts a client-supplied or "currently selected" organization id) and returns `true` only for platform admin (`profiles.global_role = 'admin'`) or an `organization_members` row for that exact `organization_id` with `role IN ('owner','admin')`.

**Rationale**: `eventAuth.ts` is already the established, single home for this class of check (Constitution II: "reuse existing helpers... before writing new ones"). The existing `members/page.tsx` `canManage` state checks `is_event_host_or_organizer()` — an **event**-role check — which Decision 2 explicitly says is *not* sufficient authority here, so it cannot be reused or extended; a genuinely new, narrower check is required, and it belongs next to its siblings rather than being invented ad hoc inside a route file.

**Alternatives considered**: A Planner-side check (e.g. asking Planner's `is_org_admin_for_event`) — rejected outright: that function checks Planner's own, entirely separate `profiles.is_org_admin`/`profiles.organization_id`, which has no relationship to Portal's `organization_members`; conflating the two would silently redefine who administers Portal-issued Planner permissions based on unrelated Planner-side state.

## R6 — Preset/default flag mapping: single source of truth

**Decision**: Extract the two flag-sets currently inlined in `plannerStaffSync.ts`'s `roleToPlannerFlags()` into a new small shared module, `src/lib/plannerPermissionPresets.ts`, exporting `PLANNER_MODULES` (the 7-module/10-flag table), `VIEWER_FLAGS`, `MANAGER_FLAGS`, `derivePresetLabel(flags)`, `deriveAccessRole(flags)`, and `normalizeManageImpliesView(flags)`. `plannerStaffSync.ts`'s `roleToPlannerFlags()` is refactored (behavior-identical) to import `VIEWER_FLAGS`/`MANAGER_FLAGS` from this module instead of inlining its own object literals; `FULL_ACCESS_ROLES` (the Portal-role-to-boolean decision) stays in `plannerStaffSync.ts`, since that's a different concern (role classification, not flag shape).

**Rationale**: FR-020 requires Viewer/Manager to be byte-for-byte identical to `roleToPlannerFlags()`'s two existing outputs; the review explicitly warned against two divergent mapping implementations. A shared module is a minimal, behavior-preserving extraction (Constitution I: reuse before inventing; not a speculative refactor — it's required by the spec's own explicit non-divergence requirement).

**Alternatives considered**: Duplicating the two flag objects into the new Feature 008 module and trusting code review to keep them in sync — rejected as exactly the drift risk the review flagged.

## R7 — `plannerStaffSync.ts` change: exact shape

**Decision**: One added guard clause, immediately after the existing `member` (role) read, before `roleToPlannerFlags(member.role)` is called:

```
if (member.planner_permissions_configured_at) {
  return { ok: true, status: 'skipped', reason: 'Planner permissions are manager-configured; automatic sync does not apply' };
}
```

(Exact bookkeeping call to `markResult` still applies per existing conventions — see data-model.md.) No other line in the function changes. The existing `.select('role')` on `event_members` becomes `.select('role,planner_permissions_configured_at')`.

**Rationale**: Since a configured member (by construction — see R9) already has both a Planner identity and an active-or-deliberately-inactive assignment created by Feature 008's own first-enable flow, there is nothing left for automatic sync to safely do for them: it cannot touch flags (FR-043), cannot touch `access_role` (FR-043), and cannot touch `is_active` (FR-045, closing the verified CSV-re-import reactivation risk). A full skip is therefore both minimal and sufficient — not a partial skip that still tries to "ensure identity/row existence," which would be unnecessary complexity for a case that structurally cannot occur (a configured member without an assignment is not reachable through any planned code path).

**Verified callers unaffected in shape, only in outcome for configured members**: `handleAddMember`, `importMemberRow` (including its verified duplicate-insert-still-syncs case), `handleAddAllOrgMembers`, `handleAssignTeam` (all in `members/page.tsx`), Feature 004's event-creator auto-provision, and the manual re-sync admin route (`/api/admin/planner-sync-member`) — all six calls funnel through this one shared function, so the single guard clause protects every trigger uniformly with no per-call-site changes needed.

## R8 — Real automatic-sync trigger matrix (supersedes any assumption of a role-change trigger)

| Trigger | Location | Calls `syncStaffMemberToPlanner`? |
|---|---|---|
| Add single member | `members/page.tsx` → `handleAddMember` | Yes |
| CSV import row (incl. duplicate-insert no-op) | `members/page.tsx` → `importMemberRow` | Yes |
| "Add All Organisation Members" | `members/page.tsx` → `handleAddAllOrgMembers` | Yes |
| "Assign a Team" | `members/page.tsx` → `handleAssignTeam` | Yes |
| Event creation (Planner/Both, staff-tier creator) | Feature 004 event-creation flow | Yes |
| Manual admin re-sync | `/api/admin/planner-sync-member` route | Yes (on demand) |
| In-place role edit | `members/page.tsx` → `changeRole` | **No** — confirmed live, `changeRole` only does `event_members.update({role})`, no Planner call at all |

## R9 — First-enable vs. "manager-owned" are two distinct moments

**Decision**: FR-034 ("enable") is a distinct action from FR-035/FR-036a ("save" or "disable"), not one combined action:

1. **Enable** (toggle on): resolves/creates identity, upserts the assignment with `is_active: true` and the FR-016 role-derived defaults (via `VIEWER_FLAGS`/`MANAGER_FLAGS` from R6, selected by the member's current Portal role). Does **not** set `planner_permissions_configured_at`.
2. **Save** (Viewer/Manager/Custom + module checkboxes, explicit Save click — even if left at the shown defaults) **or Disable**: writes the resulting flags (Save) or flips `is_active` (Disable), and — in either case — sets `planner_permissions_configured_at` from `NULL` to `now()` if it was `NULL`.

**Rationale**: This is not a new product decision — it falls directly out of reading FR-021/FR-034/FR-035/FR-036a together as already written: FR-021 ties the marker specifically to "the first successful explicit permission **configuration**," and FR-035/FR-036a are the requirements that mention setting it. Enable alone deliberately still does not set it (the manager hasn't reviewed/chosen anything yet — see the original reasoning below), preserving FR-041a's re-add semantics: a re-added person's marker is `NULL`, so their next **Enable** goes through the defaults branch (correctly discarding whatever stale flags a prior, deactivated assignment happened to still hold), and only becomes manager-owned again once a manager explicitly saves or disables.

**Correction found during `/speckit.analyze` (Disable-before-Save gap)**: the original version of this decision tied marker-setting to Save alone. Tracing the "Enable → Disable, without ever Saving" path against the `plannerStaffSync.ts` guard (R7) surfaced a real gap: the guard's only signal is this marker, so a person disabled before ever being explicitly configured would have `planner_permissions_configured_at` still `NULL` — meaning the very next automatic-sync-triggering event (e.g. a CSV re-import — confirmed real per R8) would pass straight through the guard and silently flip `is_active` back to `true`, directly violating FR-045 ("automatic sync MUST NOT reactivate a deliberately deactivated assignment," an unconditional MUST with no "only if configured" qualifier). Extending marker-setting to Disable as well as Save closes this with **zero change to the guard clause itself** (R7's single `if (member.planner_permissions_configured_at)` check is already sufficient once Disable also sets it) — the fix lives entirely in the `disable` route, not in `plannerStaffSync.ts`. This does not weaken FR-041a: member removal still deletes the entire `event_members` row (and this marker) regardless of whether it was set by a Save or a Disable, so the re-add reset behavior is unaffected.

## R11 — Button-visibility endpoint (resolved during `/speckit.analyze`)

**Decision**: A new, dedicated, event-scoped route, `GET /api/events/[eventId]/planner-permissions/can-administer`, returning only `{ ok: true, canAdminister: boolean }`. It runs pipeline steps 1–6 (auth, org resolution, workspace access, product availability, provisioning/link resolution, `canAdministerPlannerPermissions`) and stops — it never resolves a target member (no step 7), since the question it answers ("can the current viewer administer *anyone's* Planner permissions for this event") is about the viewer, not about any specific row.

**Rationale**: This was left as an open implementation choice in plan.md/tasks.md pending this analysis pass, with a tentative lean toward reusing the real per-member `GET`. On closer inspection that tentative lean was wrong: reusing the per-member `GET` requires picking an arbitrary `memberId` just to probe the viewer's own authority (awkward when the list is empty, and semantically abusing a per-entity resource endpoint to answer a per-viewer question), does strictly more work than needed (target-member resolution, Planner state read) for a boolean the button only needs once per page load, and risks silently becoming an O(rows) cost if ever mis-called per-row instead of once. A dedicated lightweight endpoint mirrors Feature 007's own established precedent exactly (`planner-tasks/capability/route.ts` exists for the identical reason: cheap, per-page-load, tab/button-visibility gating, deliberately separate from the full resource fetch) and duplicates zero business logic (it is a thin wrapper calling the same `canAdministerPlannerPermissions` the other four routes already call). This is the clearly superior choice on least-privilege, request-count, and Feature 007-consistency grounds, and required no product decision to resolve.

## R10 — Member-removal sequencing (given the verified hard-delete)

**Decision**: The existing browser-side hard `DELETE` of `event_members` in `EventAssignmentsDropdown.tsx` is **not changed or blocked**. A new, narrow server route is added and called fire-and-forget, in the same non-blocking style as the existing `syncToPlanner()` call, at the same moment the delete is triggered. The route performs a single, narrow `UPDATE event_user_assignments SET is_active = false WHERE event_id = ? AND profile_id = ?` (never a full upsert — never recreates a nonexistent row, never touches flags) and then writes an `access_disabled` audit row whose `after_state` includes whether the Planner update actually affected a row (`deactivationConfirmed: boolean`).

**Rationale**: Resolving the Planner identity/event for this call does not depend on the `event_members` row still existing — `profiles.planner_profile_id` lives on `profiles`, and the canonical Planner event comes from `event_planner_links` (keyed by Portal `event_id`, not by membership) — so there is no ordering race between the Portal delete and this call; both can fire independently. FR-041's "retain enough information to retry or reconcile" is satisfied by the audit row itself (`deactivationConfirmed: false` is the durable, queryable signal) rather than a second, bespoke reconciliation table — consistent with R4's "smallest reliable design" principle.
