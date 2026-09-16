# Quickstart Validation: Event Product Selection & Planner Provisioning

No automated test framework exists in this repository (unchanged from Features 001/002/003). This is
a live, manual verification matrix against the real Portal and Planner databases, per this
repository's established convention — not an automated test file. Run after implementation, before
declaring the feature complete, per Constitution Principle VIII.

## Prerequisites

- A temporary test organization with `organization_members` rows for at least: a platform admin
  (existing), an org `owner`/`admin` identity, and an ordinary `member` identity.
- Three entitlement configurations to exercise in turn (toggle `organization_products.is_active` on
  the test organization as needed, restoring afterward): Bendie-only, Planner-only, Both.
- A real `organization_planner_links` mapping to a genuine Planner organization for the mapping-present
  scenarios; the mapping temporarily removed (not deleted from a real org — use the test organization)
  for the mapping-missing scenarios.
- Clean up all temporary test data (organizations, memberships, events, Planner-side rows) at the end,
  re-confirming baseline live counts unchanged, matching every prior feature's own closing step.

## A. Product matrix

| # | Setup | Action | Expected |
|---|---|---|---|
| A1 | Bendie-only org | org owner/admin creates event | Event created; `event_products = {bendie}`; `planner_provisioning_status = not_required`; creator can open the workspace immediately |
| A2 | Planner-only org, mapping present | org owner/admin creates event | Event created; `event_products = {planner}` only; a real Planner event exists; `event_planner_links` active; `planner_provisioning_status = succeeded` |
| A3 | Both org | choose Bendie | Behaves exactly as A1 |
| A4 | Both org | choose Planner | Behaves exactly as A2 |
| A5 | Both org | choose Both | `event_products = {bendie, planner}`; Planner event + link exist; Feature 001's agenda push/travel pull/staff sync all available exactly as before this feature for this event |
| A6 | Org with an inactive-only entitlement | attempt selecting that product | Rejected client-side and server-side |
| A7 | Org with no active entitlement at all | open creation | Creation unavailable, explanatory message, no product selector shown |

## B. Missing Planner mapping

| # | Setup | Action | Expected |
|---|---|---|---|
| B1 | Planner-only org, mapping absent | attempt creation | Blocked before submission; server independently rejects even via a direct API call bypassing the UI; zero rows written anywhere (`events`, `event_products`, `event_members`, Planner `events`, `event_planner_links`) |
| B2 | Same org, also Bendie-entitled | create Bendie event | Not blocked — mapping is irrelevant to a Bendie-only request |
| B3 | Mapping established afterward (platform admin, existing Feature 002 mechanism) | retry the same organization's Planner creation | Succeeds |

## C. Authorization

| # | Actor | Expected |
|---|---|---|
| C1 | Platform admin | can create any product mix for any organization |
| C2 | Org owner/admin | can create for their own organization only |
| C3 | Ordinary org member | denied (server-side, not just UI-hidden) |
| C4 | Former creator, no longer a member | denied, matching `events_insert_creator`'s existing rule |
| C5 | User of a different organization, manipulated `organizationId` | denied; server-derived organization membership overrides any client-supplied value |

## D. Atomicity

| # | Scenario | Expected |
|---|---|---|
| D1 | Normal Bendie creation | `events` + `event_products` + `event_members` rows all exist together, immediately |
| D2 | Simulated failure partway through `create_event_with_products` (e.g. a deliberately-invalid product key) | Nothing is committed — no orphaned `events` row without its `event_products`/`event_members` |

## E. Idempotency and concurrency

| # | Scenario | Expected |
|---|---|---|
| E1 | Same `idempotencyKey` submitted twice in a row | Exactly one Portal event exists; second response matches the first |
| E2 | Two near-simultaneous requests, same `idempotencyKey` | Exactly one Portal event; no raw `23505` surfaced to either caller — a losing concurrent call recovers and returns the winner's event via `create_event_with_products`' own `BEGIN…EXCEPTION WHEN unique_violation` race-recovery block (post-review corrective pass, R3 — see research.md §21 and K1 below) |
| E3 | Retry after a simulated Planner-response loss | Existing Planner event (by deterministic `event_code`) is recovered, not duplicated |
| E4 | Two near-simultaneous retry requests for the same event | Exactly one actually calls Planner; the other receives `provisioning_in_progress` |

## F. Failure and recovery

| # | Scenario | Expected |
|---|---|---|
| F1 | Planner-side call fails (e.g. temporarily point `PLANNER_SUPABASE_URL` at an invalid host in a disposable test config, or use a deliberately invalid `organization_planner_links` mapping) | Portal event still exists and is usable; `planner_provisioning_status = failed`; retry action available |
| F2 | Retry after F1's fix | `planner_provisioning_status = succeeded`; exactly one Planner event linked |
| F3 | Entitlement disabled between creation and retry | Retry rejected with `entitlement_inactive`, not silently allowed |
| F4 | Mapping removed between creation and retry | Retry rejected with `planner_mapping_missing` |

## G. Security / privacy

| # | Scenario | Expected |
|---|---|---|
| G1 | Ordinary customer direct `SELECT planner_provisioning_error FROM events` | Denied (`42501`) |
| G2 | Ordinary customer `SELECT *` on their event | Every other column visible; `planner_provisioning_error` absent/denied |
| G3 | Platform admin via `get_event_planner_provisioning_error(eventId)` | Returns the raw value |
| G4 | Ordinary customer calling `create_event_with_products` directly (bypassing the API route) with a forged `organizationId` | Denied by the function's own internal check |
| G5 | `event_members` Planner-column protections (Feature 003 F-NEW-1) | Re-confirm unweakened — ordinary member still cannot SELECT/INSERT/UPDATE the four Planner columns |
| G6 | Role-escalation guard (`event_members_role_immutability`) | Re-confirm unweakened — this feature's `INSERT` of `role='admin'` for the creator does not touch the `UPDATE`-only trigger's scope |

## H. Feature 001 regression

| # | Scenario | Expected |
|---|---|---|
| H1 | Agenda push on a Both event | Works exactly as before this feature |
| H2 | Travel pull on a Both event | Works exactly as before this feature |
| H3 | Agenda push attempted on a Planner-only event (via direct API call) | Rejected — "This event does not use Bendie" — not a silent no-op, not a crash |
| H4 | Travel pull attempted on a Planner-only event | Same rejection |
| H5 | Staff sync on a Planner-only event's staff-tier creator | Succeeds — creator appears in `event_user_assignments` |
| H6 | A pre-existing (pre-Feature-004) linked event | All Feature 001 capabilities unaffected |

## I. Feature 002/003 regression

| # | Scenario | Expected |
|---|---|---|
| I1 | `organization_products`/`event_products` FK/trigger invariants | Unaffected — still reject an unentitled product |
| I2 | `organization_planner_links` still platform-admin-only to write | Unaffected |
| I3 | Feature 003's product-aware navigation on a Planner-only event | Renders zero Bendie tabs, exactly as the existing mechanism already does for any event with no `'bendie'` `event_products` row |
| I4 | Feature 003's workspace-access model | Unaffected for every event type |

## J. Quality gates

- `npm run lint`, `npm run type-check`, `npm run build` — all clean, no new warnings in touched files.

## K. Post-review corrective pass (R1–R5)

| # | Scenario | Expected |
|---|---|---|
| K1 | Concurrent same-key/same-payload race, mechanism-level reproduction (`BEGIN…EXCEPTION` block invoked directly with a pre-committed conflicting `event_creation_requests` row) | Loser's own event/products/members rows are rolled back in full (never left orphaned); loser returns the winner's `event_id`; exactly one `event_creation_requests` row survives for the key |
| K2 | Concurrent same-key/different-payload race | Loser raises `idempotency_conflict`, never returns or creates a second event |
| K3 | Authorized caller creates with key K, then loses their organization role, then replays key K | Denied (`forbidden`), not the previously-created event's data |
| K4 | Same caller (role restored) replays key K | Returns the original event, unchanged |
| K5 | `p_products = ['bendie','bendie']` (direct RPC call, bypassing the UI which never sends duplicates) | Clean `invalid_request`, never a raw `event_products_pkey` `23505` |
| K6 | `p_products = ['planner','bendie']` vs `['bendie','planner']` for logically the same Both selection | Both canonicalize identically; a same-key replay with the reversed order is recognized as the same request, not `idempotency_conflict` |
| K7 | `PlannerProvisioningBanner` on a `pending`/`provisioning` event less than `PLANNER_PROVISIONING_STALE_AFTER_MS` old | Normal "Setting up Bendie Planner…" message; no Retry button |
| K8 | Same banner on a `pending`/`provisioning` event older than the threshold | "Taking longer than expected — contact your administrator or support" message; still no Retry button |

## Cleanup

Remove all temporary test organizations/users/events/Planner-side rows created above; restore any
toggled `organization_products.is_active` values; re-confirm baseline live event/organization counts
match their pre-test values.
