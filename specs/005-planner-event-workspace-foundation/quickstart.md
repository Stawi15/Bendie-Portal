# Quickstart / Verification Plan: Planner Event Workspace Foundation

Manual, live-database verification (no automated test framework exists in this repository — unchanged
convention from Features 001–004). Use temporary test organizations/events/users; clean up fully
afterward, matching every prior feature's documented practice. Reference `contracts/get-planner-overview.md`
and `data-model.md` for exact response shapes instead of duplicating them here.

## Prerequisites

- A Portal organization with an active `bendie` entitlement and a Portal organization with an active
  `planner` entitlement plus an `organization_planner_links` mapping (reuse Feature 004's existing
  test setup pattern).
- At least one event of each mix: Bendie-only, Planner-only, Both — with the Planner-inclusive ones
  successfully provisioned (`planner_provisioning_status = 'succeeded'`, an active `event_planner_links`
  row).
- One real Bendie Planner event with zero `production_tasks` rows and one with at least one, to exercise
  both `event_summary_realtime` shapes.

## A. Bendie-only event

1. Open the event from the events list. **Expect**: lands on the Bendie dashboard, unchanged.
2. Inspect the tab bar. **Expect**: no Planner Overview tab.
3. Navigate directly to `.../planner-overview`. **Expect**: blocked by the existing product-availability
   mechanism, same "not available for this event" state every other unavailable-product route already
   shows.

## B. Planner-only event

1. Open the event from the events list (which still links to `.../dashboard`, unchanged — see
   research.md Q1/Q2). **Expect**: `EventLayout` redirects to `.../planner-overview`; the Bendie
   dashboard's blocked state is never shown.
2. Inspect the tab bar. **Expect**: only Planner Overview (and any `shared`-classified tabs) — no Bendie
   tabs.
3. As an authorized ordinary event member (holds `event_members`, no Bendie Planner
   `event_user_assignments` row for this event at all), open the Planner Overview directly.
   **Expect**: `200 { ok: true, status: 'ready', ... }`, page renders event identity + session summary.

## C. Both event

1. Open the event. **Expect**: lands on the Bendie dashboard (unchanged default).
2. Inspect the tab bar. **Expect**: existing Bendie tabs and Planner Overview appear together in one bar;
   no separate product-switcher control anywhere.
3. Click into Planner Overview, then back to a Bendie tab. **Expect**: behaves like moving between any
   two ordinary tabs — no confirmation, no mode toggle.

## D. Ordinary Portal event member WITHOUT a Planner assignment

Covered in B.3 above — explicitly confirm no `event_user_assignments` row is created or required as a
side effect of this view (query Bendie Planner's `event_user_assignments` before and after; row count
for this profile/event unchanged).

## E. Authentication and admission edge cases

1. **No session at all.** Call `GET /api/events/{eventId}/planner-overview` with no authenticated
   Portal session (no cookies, or an expired/invalid session). **Expect**: `401 { error:
   'not_authenticated' }`; confirm via logs/network inspection that no Planner service-role query is
   attempted (the route must reject before reaching the workspace-admission check, let alone the
   Planner read); confirm the response contains no raw diagnostic and does not reveal whether the
   `eventId` exists, whether it has an active Planner product, or whether a canonical Planner
   counterpart exists for it (contracts/get-planner-overview.md).
2. **Authenticated, genuinely no resolvable organization (case B).** As an authenticated user with
   **zero** `organization_members` rows at all, mirroring Feature 003's `/portal/no-access` case.
   **Expect**: `403 { error: 'forbidden' }`, per existing Feature 003 semantics — this correction does
   not change that semantics, only adds explicit coverage of it; confirm no Planner query is attempted
   and no counterpart/cross-tenant information is leaked in the response.
2a. **Authenticated, null or stale saved selection but a valid membership exists (case A — review
   finding F1).** As an authenticated user who holds at least one `organization_members` row, but whose
   `profiles.current_organization_id` is either `null` (never selected one) or **stale** (set to an
   organization the caller is no longer a member of — e.g. removed from that organization after last
   selecting it). **Expect**: the route falls back to the caller's first accessible membership — the
   same `accessible.find(o => o.id === saved) ?? accessible[0]` resolution `OrganizationContext` already
   uses client-side — and admission proceeds normally to the workspace-admission check (step 3), **not**
   `403`. This is the scenario the original implementation got wrong (it only ever fell back on `null`,
   never on stale), and confirms the fix: a stale selection must never be silently treated as "no
   organization" when a valid fallback membership actually exists.
3. **Organization membership but no `event_members`.** Call the endpoint (or navigate to the tab) as a
   user who holds `organization_members` for the event's organization but no `event_members` row for
   the event itself. **Expect**: `404 { error: 'event_not_found' }`, per existing Feature 003
   semantics — organization membership alone is insufficient.

## F. Wrong selected organization

As a multi-organization user who holds `event_members` for the event but under a *different* currently
selected organization. **Expect**: denied, same as any other workspace-access check under Feature 003.

## G. Cross-tenant event id

Supply an `eventId` belonging to an organization the caller has no relationship to at all. **Expect**:
`404 { error: 'event_not_found' }`.

## H. Platform admin

As a platform admin with no `event_members`/`organization_members` row anywhere. **Expect**: existing
override behavior preserved — Overview loads for any event, Planner-only landing redirect applies
identically.

## I. Planner product removed/disabled mid-session

With the Overview already open, deactivate the organization's `planner` entitlement (or remove the
event's `event_products` `planner` row) directly in the database, then reload/re-request.
**Expect**: `403 { error: 'product_unavailable' }`; the tab disappears from the nav on next check;
direct navigation is blocked the same as any other newly-unavailable product route.

## J. Missing/inactive canonical link

For a Planner-active event with no active `event_planner_links` row (e.g. temporarily flip
`is_active = false` on a test row). **Expect**: `200 { ok: true, status: 'unavailable' }`; confirm via
logs/network inspection that no Planner query was attempted at all (data-model.md precedence step 3).

## K. Provisioning states

For a Planner-active test event, exercise each `planner_provisioning_status` value in turn (setting it
directly for test purposes, restoring afterward):

- `pending`, `planner_provisioning_last_attempted_at` recent → `status: 'pending'`.
- `pending`, `planner_provisioning_last_attempted_at` older than
  `PLANNER_PROVISIONING_STALE_AFTER_MS` (5 minutes) → `status: 'stale'`.
- `provisioning`, recent → `status: 'pending'`; stale → `status: 'stale'` (same treatment, per
  `isPlannerProvisioningStale()`'s existing logic).
- `failed` → `status: 'failed'`.
- `succeeded` with an active link and a real `event_summary_realtime` row → `status: 'ready'`.

In every non-`succeeded` case, confirm (via logs/network inspection) that no Planner query was
attempted.

## L. Integrity-mismatch states (fail closed, no repair)

- `planner_provisioning_status = 'succeeded'` but no active `event_planner_links` row →
  `status: 'unavailable'`.
- `planner_provisioning_status = 'not_required'` on an event whose `event_products` includes an active
  `planner` row (constructed test-only state; should not occur via any real code path) →
  `status: 'unavailable'`.
- An active `event_planner_links` row whose `planner_event_id` does not exist in Bendie Planner's
  `events` table at all (simulate by pointing a test link at a non-existent id) → `status: 'unavailable'`.
- **`planner_provisioning_status = 'failed'` while an active `event_planner_links` row also exists**
  (construct this test-only combination directly — it should not occur via any real code path, since
  `provisionPlannerEvent` only ever finalizes to `'succeeded'` once the link is written). **Expect**:
  `status: 'failed'` per the precedence table in data-model.md (provisioning status is evaluated
  *before* link presence) — the existence of an active link must never be treated as sufficient
  authority to load Planner Overview data once status says `failed`. Confirm no Planner query is
  attempted.
- **`planner_provisioning_status = 'provisioning'` while an active `event_planner_links` row also
  exists** (same construction). **Expect**: `status: 'pending'` (or `'stale'`, per
  `isPlannerProvisioningStale()`), for the same reason — status precedes link presence. Confirm no
  Planner query is attempted.

Confirm none of these attempts to write, repair, or reconcile anything on either side — in particular,
confirm that reaching any of these five states never mutates `planner_provisioning_status` or
`event_planner_links` as a side effect of the read.

## M. Zero-session event

Point a test event's active link at the real zero-`production_tasks` Planner event identified in
Prerequisites. **Expect**: `status: 'ready'`, `sessionSummary.totalSessions: 0`, a real (not
placeholder/omitted) `eventPhase` value. Confirm the UI renders this as a normal state, not a warning or
error.

## N. Planner backend unavailable

Simulate a Planner-side failure (e.g. temporarily point `PLANNER_SUPABASE_URL`/the service-role key at
an invalid value for a controlled test, or induce a query timeout) for a `succeeded`+linked event.
**Expect**: `status: 'backend_error'`; confirm the server log captured the real error while the response
body contains no diagnostic detail; confirm the UI shows a generic "couldn't load right now" state, not
the zero-session state from M.

## O. Client tries to supply/guess a Planner event id

Attempt to call the endpoint with a `plannerEventId` (or similar) query parameter or body field set to a
different Planner event's id. **Expect**: ignored entirely — the response still reflects the event
resolved server-side via `event_planner_links`, never the supplied value.

## P. Direct URL / browser refresh

For each of B, C, and I, reach the same state via a hard browser refresh and via a freshly pasted URL
(not just in-app navigation). **Expect**: identical authorization/product/landing behavior every time —
no behavior is reachable only through in-app navigation.

## Q. Security

- Inspect the network response body for every state above — confirm no service-role key, no raw
  Supabase/Postgres error, no Planner integer id, and no field outside `EventIdentity`/`SessionSummary`
  (data-model.md) ever appears.
- Confirm `src/lib/plannerOverview.ts` is never imported from a `'use client'` file (grep the diff), and
  that `getPlannerAdminClient()` is only ever constructed inside server route code.

## R. Feature 001 regression

- The existing `bendie-planner` admin tab and its 5 `planner-*` routes remain platform-admin-only and
  behave exactly as before (link/unlink, sync, push, pull) — this feature does not touch them.
- Confirm the new Planner Overview route and the admin tab are independently reachable/deniable — an
  ordinary event member who can view the Overview still cannot reach `bendie-planner`'s admin actions.

## S. Feature 002 regression

`organization_products`/`event_products`/`organization_planner_links` row counts, schema, and RLS
unchanged before/after this feature's verification pass.

## T. Feature 003 regression

- `requireEventWorkspaceAccess`/`isProductAvailableForEvent` behavior unchanged for every existing
  caller (their new optional client parameter defaults to the prior behavior — confirm at least one
  pre-existing client-side call site still works unmodified).
- Bendie-only and Both events' default landing and tab bar unchanged pixel-for-pixel from their
  pre-Feature-005 state.

## U. Feature 004 regression

- Event creation, retry-provisioning, idempotency, and stale-provisioning messaging all continue to work
  exactly as before — this feature only reads the columns/tables Feature 004 already writes.

## V. Quality

- `npm run lint`, `npm run type-check`, and `npm run build` (or this repository's current equivalent
  commands) all clean, no new warnings.
- Confirm `src/types/plannerDatabase.ts`'s new `event_summary_realtime` entry matches the live columns
  exactly (data-model.md).

## Cleanup

Delete every temporary test organization/event/user/link/row created for this pass, on both Portal's and
Bendie Planner's projects. Restore any `planner_provisioning_status`/`event_planner_links.is_active`
value that was directly manipulated for scenario K/L testing.
