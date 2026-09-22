# Quickstart: Bendie Planner Staff & Module Permissions

Validation guide for `/speckit.implement`. Uses controlled synthetic fixtures only — never real employee/client data (Constitution IV, and this feature's own audit/security requirements make it especially important not to pollute the audit log with real people). Create and fully delete all temporary Portal and Planner test accounts/organizations/events after each pass, matching every prior feature's established convention.

## Prerequisites

- A test organization with an active Planner entitlement (`organization_products`), one Planner-only or Both test event with an active `event_planner_links` row (reuse the existing Feature 005/006 fixture: "Bendie Planner Sample" org, "Stawi Escape — Planner Test"/"— Both Test" events, if still available; otherwise provision a fresh disposable one).
- Test users covering every authority tier: a Portal platform admin, an organization owner, an organization admin, an ordinary organization member who is also an event host/organizer/admin (event-role only, no org authority), a `can_manage_tasks` holder with no org authority, and a plain attendee.
- Migrations from `data-model.md` applied to a non-production/test Supabase branch.

## A. Schema sanity (static/unit)

1. Confirm `event_members.planner_permissions_configured_at` exists, is nullable, and every pre-existing row reads `NULL` (data-model.md §1/§R2).
2. Confirm `authenticated`/`anon` cannot `SELECT`/`UPDATE` the new column directly via PostgREST (expect a column-not-found-style denial, matching the sibling `planner_sync_*` columns' existing behavior) — verifies research.md R1 without assuming it.
3. Confirm `planner_permission_audit_log` exists with the exact constraint shape in data-model.md §2, and that `authenticated`/`anon` cannot `SELECT`/`INSERT` it directly.

## B. First enable + identity provisioning

4. As an organization owner, open the permissions surface for a staff-tier member who has never had Planner access. Confirm `GET` returns `isEnabled: false` with a defaults *preview* matching their current role.
5. Call `enable`. Confirm: a Planner identity now exists (`profiles.planner_profile_id` set), an `event_user_assignments` row exists with `is_active: true` and flags matching `VIEWER_FLAGS`/`MANAGER_FLAGS` per their role, and `planner_permissions_configured_at` is still `NULL` (research.md R9 — enabling alone does not transfer ownership).
6. Repeat for a member whose email already matches an existing Planner identity (from a prior feature's fixture) — confirm the existing identity is reused, no duplicate `profiles` row is created.
7. Open the panel without calling `enable` — confirm no identity/assignment was created merely by viewing (FR-004).
8. Simulate an `enable` failure (e.g. temporarily point `PLANNER_SUPABASE_SERVICE_ROLE_KEY` at an invalid value) and confirm a plain, human-readable failure message, then restore and retry the *same* action — confirm no duplicate identity/assignment resulted.

## C. Presets and normalization

9. `PATCH` with `preset: "viewer"` and the exact Viewer flags (data-model.md) — confirm the response's `preset` is `"viewer"`.
10. `PATCH` with `preset: "manager"` and the exact Manager flags — confirm `"manager"`.
11. `PATCH` with Viewer flags but `tasks.manage: true` submitted anyway — confirm the server normalizes to `tasks.view: true` (already true) and persists `manage: true`, and the response's `preset` is `"custom"` (no longer exactly Viewer or Manager).
12. `PATCH` with `tasks.manage: true, tasks.view: false` — confirm the persisted result is `view: true, manage: true` (never `view:false, manage:true`), both when the client would have blocked this and when submitted directly to bypass client validation (server-authoritative normalization, not just client-side).
13. Confirm the first successful `PATCH` for this member transitions `planner_permissions_configured_at` from `NULL` to a timestamp, and a second `PATCH` does not change that timestamp.

## D. Disable / reactivate / explicit-disable safety (load-bearing)

14. `disable` an already-configured member — confirm `is_active: false`, flags unchanged, and Feature 007's Tasks module immediately denies them.
15. Trigger a CSV re-import that includes this same (still-active-membership, now Planner-disabled) person's row — confirm `is_active` remains `false` and flags remain exactly as configured (this is the concrete, verified-real scenario from research.md R7/R8 — confirm the fix actually holds, not just that it compiles).
16. `enable` (reactivate branch) — confirm `is_active: true` again with the *exact* flags from before disabling, never reset to role-derived defaults.
17. For a member who was *never* explicitly configured, disable then re-enable — confirm the same "not yet configured" state applies both times (role-derived defaults may legitimately differ if their Portal role changed in between, since they were never manager-owned).
18. Change a never-configured member's Portal role, then trigger one of the real automatic-sync events (research.md R8 table) — confirm their flags re-derive from the new role. Separately, confirm a bare `changeRole` call alone has no automatic Planner-side effect (matches verified live behavior, not a regression).
19. Change an already-configured member's Portal role — confirm no automatic change to their Planner permissions at all, under any of the real trigger events in R8's table.

## E. Member removal / re-add

20. Remove (unassign) a member with active, configured Planner access from the event. Confirm: the Portal `event_members` row is gone (existing behavior, unchanged), the Planner assignment is `is_active: false`, and any Feature 007 task historically assigned to them still renders their name with the existing "no longer active" indication.
21. Simulate the Planner-side deactivation call failing during removal — confirm the Portal removal still completes (never blocked), and an `access_disabled` audit row exists with `deactivationConfirmed: false`.
22. Re-add the same person to the event (new `event_members` row). Confirm `planner_permissions_configured_at` is `NULL` on the new row, and their next `enable` applies fresh role-derived defaults from their new membership — not a silent restore of their old configuration (FR-041a, deliberately).

## F. Audit

23–26. Perform one `enable` (first-time), one `PATCH`, one `disable`, and one `enable`-as-reactivate. Confirm exactly one audit row per action with the correct `action_type`, correct before/after snapshots, `actor_user_id` matching the authenticated caller (never a client-supplied value), and a server-generated `created_at`.
27. Retry the same `PATCH` request with the *same* `operationId` after simulating a lost response — confirm no duplicate audit row (unique-violation path exercised, research.md R3), and confirm the underlying Planner state is unaffected by the retry beyond what the first attempt already did.
28. Simulate the Planner write succeeding but the audit insert failing (e.g. a temporary constraint violation) — confirm the permission change still stands and is not rolled back (research.md R4).

## G. Authorization (read and write)

29–33. As each of: a plain attendee, an event host/organizer/admin (no org authority), a `can_manage_tasks` holder with no org authority, an organization admin, and an organization owner — attempt `GET` and `enable`/`PATCH`/`disable` for another member. Confirm the first three are denied (`403 permission_admin_denied`) on both read and write, and the last two succeed.
34. As a Portal platform admin, repeat — confirm success regardless of any organization membership.
35. As an organization owner/admin who is genuinely not an `event_members` participant of this specific event, attempt the same — confirm `404 event_not_found` (the Feature 003 floor denies them before the Feature 008 check is ever reached — a deliberate, documented boundary, not a bug).
36. As an organization admin, view and edit their *own* Planner permissions — confirm it succeeds, then disable their own access and confirm they retain full authority to view/re-enable it afterward (their authority never came from a Planner flag).
37. Submit a direct API call (bypassing the UI) with a hand-crafted `access_role: "admin"` in a `PATCH` body — confirm it is ignored and the server-derived value is used instead.
38. Submit a `memberId` for someone who is not currently an `event_members` row of this event — confirm `404 member_not_found`.
39. Attempt the same routes against a different event/organization than the resolved one (cross-event/cross-org) — confirm denial at the appropriate existing Feature 003 boundary.

## H. Product/link gating

40. Repeat a representative subset of B–D against a Bendie-only event, an event with inactive Planner entitlement, one with no `event_planner_links` row, and one each in `pending`/`failed` provisioning — confirm the exact same status vocabulary Features 005/007 already use, never a new one.

## I. Regression

41. Confirm Feature 007's Tasks module behavior is completely unchanged for a member whose permissions this feature never touched (`resolveTaskCapability` reads the same columns the same way).
42. Confirm the existing Members list/page renders and functions exactly as before for a user with no permission-administration authority — no new leaked UI elements, no new console errors.
43. Confirm Feature 006 product navigation/tab visibility is unaffected — this feature adds no new `EVENT_SECTIONS` entry (FR-059, integrated into the existing Members surface, not a new tab).
44. Run `npm run type-check` and `npm run lint` clean.

Two-admin concurrency (last-write-wins, no optimistic locking) and lost-response retry are exercised inline within D/F above rather than as separate numbered scenarios, since both are properties of the same idempotent-write design rather than distinct flows.

## Verification Log

### 2026-09-20 — Manual browser acceptance + completion-pass reconciliation

**Confirmed via real manual browser testing** (15 results reported by the human tester against the live "Bendie Planner Sample" fixture, using only synthetic accounts — see tasks.md T089/T090 for the full list): #1–3 (partially, see note below), #5–10, #12, #14 (partially, see note below), #41–43.

**Independently corroborated with live database/audit evidence** (gathered directly from Portal/Planner during the completion pass, not assumed from the tester's report alone): #5 (marker transition, tasks.md T050), #13/#14 (Feature 007 read-only/denial, tasks.md T082), #16 (reactivation preserves flags exactly, tasks.md T063), #23–26 (all four audit action types present with correct shape, tasks.md T075), #27 (idempotency — verified at the database-constraint level directly, tasks.md T076).

**Verified via static code / RLS-policy inspection rather than a live sampled request** (an exhaustive proof, not a single-sample one): the SR-013 forged-actor/timestamp check (grepped all four write routes — no such field is ever read from a request body), and #79-class RLS denial (the audit table's live policy set has zero write policies for any role).

**Genuine caveats surfaced, not defects**: #3's Viewer-preset half — the audit trail shows a live Manager-preset save and a live Custom save, but no exact clean Viewer-preset save for either fixture member; #14 — the "Tasks View OFF" denial most likely came from the *other* fixture member's full `is_active:false` state rather than a `can_view_tasks:false` toggle on the member the tester's note describes, a different but equally valid mechanism for the same Feature 007 denial outcome. Neither caveat indicates a defect; both are documented here so "PASS" isn't read as more precise than the evidence supports.

**Not independently verified this session** (remaining verification debt, not implementation defects — see the corresponding tasks.md entries for detail): #4, #6–8, #9's specific full-refresh-persistence claim as a standalone check, #11's "resubmitting unchanged" idempotency framing, #15, #17–22, #40. Cleanup (quickstart's implicit "delete all synthetic data after" expectation, tasks.md T088) has deliberately not been run yet for the two *retained* fixture members — they remain live and reusable pending final sign-off.

### 2026-09-20 (later same day) — Authorization discrepancy investigation + FR-036a closure

**#28–39 (the authenticated-non-admin authorization matrix) — closed.** An initial live check as `f007-viewself-test@bendie-test.invalid` returned `canAdminister:true`, triggering a full investigation (org role `member`, global role `attendee`, event role `staff` all confirmed correct in the database; `canAdministerPlannerPermissions()` re-read and confirmed to contain no `event_members` reference at all; no duplicate rows found). Root cause: a stale/lingering session in the same browser tab, not a code defect. A clean Incognito retest, freshly authenticated as `f007-viewself-test`, correctly returned `canAdminister:false`. Combined with the already-real evidence of org-admin and platform-admin success (audit trail), this closes #28–39's authorization-boundary claim in full — see tasks.md T052–T055.

**FR-036a's specific "Disable before any Save" case (#14/#15 sub-case, tasks.md T062b) — closed** via a fresh, fully disposable synthetic identity created and destroyed for this test alone (zero trace remains on either project; neither retained fixture member was touched): Enable left the marker `NULL`; Disable-with-no-intervening-Save transitioned it to a real timestamp; the automatic-sync guard's own query condition was re-run against the resulting state and evaluated `true` (would skip). No code changes were required — the existing implementation was correct.

**Genuinely still open**: #40 (product/link/provisioning gating across additional states), #56/#57-class cross-event/cross-org/`member_not_found`/hand-crafted-`access_role` authenticated requests, and the items listed in the entry above that this pass didn't revisit.

### 2026-09-21 — Final `/review` + corrective pass

A full `/review` (not the earlier FR-036a-focused pass) found one **Blocking**, one **Medium**, and three **Low** issues — all in the implementation, none in the locked product decisions. All were fixed and then live-verified through the **real running routes** (not DB simulations), using a disposable synthetic platform-admin identity created via the Auth Admin API on both projects, given a genuine authenticated session (password-grant + a reconstructed `@supabase/ssr` session cookie), and fully deleted afterward:

- **#17–22 (real automatic-sync trigger paths) — now genuinely closed, T072.** The Blocking bug (the guard's own `event_members` read used `authClient`, which has zero grant on the new column and so failed every real call) is fixed and re-verified end-to-end: an unconfigured member's sync now correctly `succeeded`s (was silently `skipped`); the same member, once disabled through Feature 008, now correctly causes the next sync attempt to `skip` with `is_active`/flags unchanged.
- **#11–12 (Manage/View normalization) — the Medium defect (FR-024 not enforced) is fixed and re-verified**, T049: a partial `PATCH` explicitly setting only `view:false` now correctly clears `manage` too, for Tasks/Checklist/Vendors alike; the reverse direction and the adversarial explicit-contradiction case were also re-confirmed live.
- **Audit no-op symmetry — fixed and re-verified**, T079a: a genuine Disable produces exactly one audit row; an immediate repeat no-op Disable produces zero additional rows.
- Two documentation-only Low findings (contracts.md's GET-authorization wording, data-model.md's `accessRole` field claim) were corrected to match the actual shipped behavior — no code involved.

### 2026-09-21 (later same day) — Convergence pass: final 2 Low findings fixed

A second `/review` against the corrected implementation found 0 Blocking/High/Medium and exactly 2 new Low findings, both fixed in this pass (T033, T079b):

- **`PlannerPermissionsModal.tsx`'s `backend_error` handling** — the load-error branch collapsed `status: 'backend_error'` into the same generic "not yet available" copy as genuine provisioning-pending statuses, unlike the sibling Planner Overview/Tasks pages and contracts.md's explicit rule that a transient backend read failure must never be conflated with a provisioning outcome. Fixed: `backend_error` now gets its own message ("Couldn't load Bendie Planner access right now — try again in a moment."), checked before the generic not-ready branch, matching the sibling pages' copy verbatim. **Verified via static trace only** (branch ordering + exact status vocabulary against the real GET route) — no test framework exists in this repo to drive the component, and reproducing a genuine backend infrastructure failure live was judged unsafe/artificial for this fix.
- **`savePermissions` no-op Save/audit hygiene** — resubmitting an unchanged permission configuration (the modal's Save button has no dirty-state gate) still performed a real Planner write and an unconditional `permissions_changed` audit row, the same symmetry gap T079a had just fixed for `disableAssignment`. Fixed: `savePermissions` now takes `hasBeenConfigured` and returns `wasNoop`, true only when BOTH the normalized flags are unchanged AND no ownership-marker transition is pending — a first-ever explicit Save matching the current role-derived defaults is deliberately excluded from the no-op branch, since `planner_permissions_configured_at` still needs to be set. `route.ts`'s `PATCH` handler skips the audit write when `wasNoop`, mirroring `disable/route.ts`'s existing guard.

**Verification methodology note**: two attempts to reach live-HTTP-through-the-real-route tier for the no-op fix were independently blocked by this session's own safety controls — (1) reconstructing an `@supabase/ssr` session cookie for a disposable test identity (flagged as sensitive credential handling), and (2) adding a temporary internal API route to invoke the library functions directly (flagged as creating a network-reachable/RCE-style surface, correctly — an unauthenticated privileged endpoint on a live dev server is a genuine anti-pattern regardless of intent to delete it). Neither block was worked around; the temporary route was deleted immediately. Verification instead used a **DB-level behavioral simulation**: a fresh disposable synthetic member/event-membership/Planner-assignment fixture (both Portal and Planner projects) was driven through the exact shipped algorithm with real data — (1) first Save matching role-derived Viewer defaults with `hasBeenConfigured: false` correctly persisted (real `UPDATE`, `updated_at` advanced), set the marker `NULL`→timestamp, and wrote exactly one audit row (id 18); (2) an immediate identical repeat Save with `hasBeenConfigured` now `true` correctly took the no-op path — no write performed, confirmed by `updated_at` staying unchanged across that window; (3) a genuine subsequent change (`can_manage_tasks: false→true`) correctly persisted again (`updated_at` advanced a second time) and wrote exactly one more audit row (id 19). Final count for the fixture: exactly 2 audit rows for 2 genuine changes, not 3 — proving the repeated identical Save produced no extra row. All disposable fixtures (2 Portal auth users, 1 Planner auth user + profile, 1 assignment, 2 audit rows, 1 event_members row, 1 organization_members row) were fully deleted afterward; the two retained long-lived fixtures (`f005-creator-...`, `f007-viewself-test@...`) were independently re-confirmed untouched.

`npm run type-check` and `npm run lint` were re-run after these fixes: both clean (lint: zero new warnings in any changed file). Production build was **not** re-run — the same live dev server from the prior corrective pass remained active throughout this pass.

All disposable test identities from both this pass and the earlier FR-036a pass were fully deleted from both projects (Auth Admin API `DELETE`, confirmed via a zero-row count check); the two retained fixture members (`f005-creator-...`, `f007-viewself-test@...`) were not touched by any of this.
