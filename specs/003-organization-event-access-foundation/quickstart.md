# Quickstart: Organization & Event Access Foundation — Manual Verification Guide

No automated test framework exists in this repository (unchanged from Features 001/002). This guide is the authoritative live-verification checklist for `/speckit-implement`/`/speckit-analyze` to execute against the real Portal Supabase project, using real temporary test data that is fully cleaned up afterward. See [data-model.md](./data-model.md) for the full security matrix and route inventory referenced below.

## Prerequisites

- The migration in [data-model.md](./data-model.md) (`organization_admin_event_metadata_visibility.sql`) applied via `apply_migration`.
- Test fixtures (create, verify, then delete):
  - Org X with an `owner`/`admin` test user (no `event_members` anywhere), an ordinary `member` test user, and two events E1 (test user has `event_members` on E1) and E2 (no one but the org admin can see E1/E2's metadata; nobody has `event_members` on E2).
  - Org Y with one test user who is `admin` in Org X and `member` in Org Y.
  - One event with an inactive `bendie` `organization_products` row but an existing `bendie` `event_products` row (temporarily flip `is_active` on a copied/test org, never on real production data).
  - One platform admin test user with zero `organization_members`/`event_members` rows (should already exist/be creatable via the existing admin-user pattern).

## Identity/State Matrix (A–K)

Run each as a real authenticated session (password-grant token, per this session's established Playwright/direct-PostgREST verification pattern) against the actual running app:

| ID | Identity | Expect: enter Portal | Expect: event list | Expect: workspace entry |
|---|---|---|---|---|
| A | Unauthenticated | Redirect to login | — | — |
| B | Authenticated, 0 orgs | Admitted, no-access state | Empty | Denied |
| C | Customer, 1 org | Admitted, auto-selected | Per role (see E–H) | Per role |
| D | Customer, 2+ orgs | Admitted, switcher works | Scoped to selected org | Per role |
| E | Ordinary member, has `event_members` on E1 | Admitted | Sees E1 only | Allowed on E1 |
| F | Ordinary member, no `event_members` | Admitted | Sees nothing | Denied on E1/E2 |
| G | Org admin, no `event_members` | Admitted | Sees E1 + E2 metadata | **Denied** on both |
| H | Org admin, has `event_members` on E1 | Admitted | Sees E1 + E2 metadata | Allowed on E1, denied on E2 |
| I | Admin in Org X, member in Org Y | Admitted | Org-X view when X selected; Org-Y (member) view when Y selected | Per selected org's role |
| J | Platform admin, 0 `organization_members` | Admitted (bypass) | Sees all orgs/events | Allowed everywhere |
| K | Platform admin, 0 `event_members` | Admitted (bypass) | — | Allowed on any event |

Row G is the single most important case in this feature: confirm directly, via the browser's network tab and a manual URL edit to `/portal/events/<E2-id>/dashboard`, that a real forbidden/no-access state renders — not the tab shell, not a silent empty page.

## Product-State Matrix (L–Q)

| ID | State | Expect |
|---|---|---|
| L | Active Bendie entitlement + Bendie event | Bendie tabs render (unchanged from today) |
| M | Inactive Bendie entitlement + existing `bendie` `event_products` row | Bendie tabs do NOT render as available; `event_products` row still present in DB after the check |
| N | Active Planner entitlement + event with `planner` in `event_products` (test data only — none exist in production) | Planner product context is computed as available; no Planner tab/screen renders (none implemented) |
| O | Inactive Planner entitlement + `planner` `event_products` row | Planner not available |
| P | Both active + both in `event_products` | Both contexts computed available; only Bendie tabs actually render |
| Q | `event_products` contains a product not active at org level | Not available |

## Direct-Access Attack Checks (R–V)

| ID | Attack | Expect |
|---|---|---|
| R | Manipulated `organization_id` in a client request | Server re-derives from `organization_members`; request denied/ignored |
| S | Manipulated `event_id` in a client request/URL | `requireEventWorkspaceAccess` denies independently of any client claim |
| T | Stale `current_organization_id` (membership since removed) | Falls back to a valid org or the no-access state (existing `OrganizationContext` revalidation — confirm still true post-change) |
| U | Direct workspace URL, no `event_members` | Denied server-side (same check as G) |
| V | Customer hits `app/api/admin/**` or reserved `/portal/admin/*` | Denied (existing independent admin check / reserved namespace) |

## Regression Checks (W–Z)

| ID | Check | Expect |
|---|---|---|
| W | All 16 existing events, viewed as their org's platform admin or a real assigned member | Identical navigation/URLs to pre-Feature-003 behavior |
| X | Feature 001: `bendie-planner` tab, link/unlink, member sync, agenda push, travel pull, all 5 `app/api/admin/planner-*` routes | Unchanged behavior; routes still reject non-global-admin callers |
| Y | Feature 002: `organization_members`/`organization_products`/`event_products`/`organization_planner_links` RLS and row counts | Unchanged from Feature 002's converged state |
| Z | `npm run lint`, type-check, `npm run build` | Clean, or only pre-existing unrelated warnings |

## Cleanup

Delete every test org/user/event/membership row created above; re-run the live row-count queries from research.md's "Scale/Scope" section and confirm they match pre-verification baselines (6 orgs, 16 events, etc.) before considering verification complete.
