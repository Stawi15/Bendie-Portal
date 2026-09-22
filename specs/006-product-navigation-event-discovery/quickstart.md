# Quickstart Verification: Product-Level Navigation & Product-Aware Event Discovery

This is a validation/run guide, not a test suite — it lists the concrete scenarios that must be exercised (via lint/typecheck/build plus manual/API-level verification during implementation and runtime verification) before this feature is declared complete. It does not claim any of these have been executed during planning — planning only establishes what must be checked and how.

## Prerequisites

- The preserved Feature 005 fixture: organization **Bendie Planner Sample** (Bendie + Planner both actively entitled), event **Stawi Escape** (Bendie-only), event **Stawi Escape — Planner Test** (Planner-only, Planner Overview verified, `totalSessions = 3`).
- One controlled **Both**-product event, created during implementation/runtime verification (not during planning), inside the same organization, e.g. "Stawi Escape — Both Test."
- An organization with **only Bendie** active, an organization with **only Planner** active, and an organization with **zero** active products — created or reused as available during runtime verification.
- Lint/typecheck/build commands already established in this repository.

## A. Organization entitlement states

| # | Setup | Expected |
|---|---|---|
| A1 | Org: Bendie-only active | Switcher offers only Bendie; `/portal` → `/portal/bendie` |
| A2 | Org: Planner-only active | Switcher offers only Planner; `/portal` → `/portal/planner` |
| A3 | Org: both active | Switcher offers both; `/portal` → `/portal/bendie` (default) |
| A4 | Org: zero active | No switcher shown; `/portal` → `/portal/no-product` |
| A5 | Org: Bendie entitlement present but `is_active=false` | Treated identically to A2/A4 as applicable — never offered |
| A6 | Org: Planner entitlement present but `is_active=false` | Treated identically to A1/A4 as applicable — never offered |

## B. Event product states × discovery

| # | Setup | Expected |
|---|---|---|
| B1 | Bendie-only event, viewed in Bendie context | Appears in list/counts |
| B2 | Bendie-only event, viewed in Planner context | Does not appear |
| B3 | Planner-only event, viewed in Planner context | Appears in list/counts |
| B4 | Planner-only event, viewed in Bendie context | Does not appear |
| B5 | Both event, viewed in either context | Appears in both |
| B6 | Any product context during initial load | No other-product event flashes before the filtered result renders |
| B7 | Active product with zero matching events | Product remains available; list shows a normal empty state (contract 3 / FR-057) — distinct from A4 |

## C. Switching

| # | Setup | Expected |
|---|---|---|
| C1 | On Bendie product page, switch to Planner | Navigates to the Planner equivalent (home↔home, events↔events) |
| C2 | On Planner product page, switch to Bendie | Symmetric to C1 |
| C3 | Switch organization, current product still active in new org | Product preserved |
| C4 | Switch organization, current product not active, other is | Falls back to the other, per `resolveDefaultProduct` |
| C5 | Switch organization to a zero-product org | Lands on `/portal/no-product` |
| C6 | Inside Both event's Bendie workspace, switch to Planner via switcher | Stays in same event, lands on its `planner-overview` |
| C7 | Inside Bendie-only event's workspace, switch to Planner via switcher | Leaves event, lands on Planner's `/events` list |
| C8 | Switch organization while inside an event workspace | Lands on new org's resolved product home; old event never shown as current |

## D. Event entry / landing

| # | Setup | Expected |
|---|---|---|
| D1 | Bendie-only event opened from Bendie context | Lands on `dashboard` |
| D2 | Planner-only event opened from Planner context | Lands on `planner-overview` |
| D3 | Both event opened from Bendie context (`?product=bendie`) | Lands on `dashboard` |
| D4 | Both event opened from Planner context (`?product=planner`) | Lands on `planner-overview` |
| D5 | Both event opened via a legacy URL (no `?product=`) | Lands on `dashboard` (Feature 005 fallback preserved) |
| D6 | Bendie-only event URL carrying `?product=planner` (stale/mismatched link), authorized user | Redirects to `dashboard` (the only valid experience), never a blocked screen |
| D7 | Planner-only event URL carrying `?product=bendie`, authorized user | Redirects to `planner-overview` |
| D8 | Same as D6/D7, but the user lacks `event_members` access | Denied exactly as today — no redirect bypasses this |
| D9 | Legacy bookmarked `/portal/events/[id]/dashboard` (Bendie-only event, no query) | Unchanged from pre-Feature-006 behavior |
| D10 | Legacy bookmarked `/portal/events/[id]/planner-overview` (Planner-only event, no query) | Unchanged from pre-Feature-006 behavior |

## E. Authorization

| # | Setup | Expected |
|---|---|---|
| E1 | Authorized event member | Full access, unaffected by product context |
| E2 | Org member without `event_members` row | Denied at the existing workspace gate, before any product logic runs |
| E3 | Cross-tenant user (no relationship to the org) | Denied |
| E4 | Platform admin, org with no active Planner entitlement, manual `/portal/planner` visit | Sees the real no-product/entitlement-absent truth for that org, not a fabricated Planner experience (FR-059) |

## F. Creation

| # | Setup | Expected |
|---|---|---|
| F1 | Create opened from `/portal/bendie*` | Initial product selection defaults to Bendie; user can still change it if entitled to more |
| F2 | Create opened from `/portal/planner*` | Initial selection defaults to Planner |
| F3 | Org entitled to both, create opened from either context | Both remains selectable; submission still validated by Feature 004's existing server-side rules |
| F4 | Entitlement changes between modal open and submit | Feature 004's existing authoritative server check still governs the outcome — unaffected by this feature |

## G. Races and legacy routes

| # | Setup | Expected |
|---|---|---|
| G1 | Rapid Bendie → Planner → Bendie product switch | Only Bendie's data is ever shown as current at rest; no Planner flash after settling on Bendie |
| G2 | Rapid organization switch during an in-flight event fetch | The stale organization's events never overwrite the new organization's state |
| G3 | Browser back/forward across two different product contexts | Each history entry renders its own product's content |
| G4 | Visit legacy `/portal` | Redirects per contract 9 |
| G5 | Visit legacy `/portal/events` | Redirects per contract 9 |

## H. Browser-level confirmation (do not claim complete during planning)

To be performed only during actual runtime/manual verification, with real authenticated sessions, exactly as Features 004/005 required:
- Visual product identity is unambiguous at a glance on every product page.
- The product switcher never offers a product the viewed organization doesn't actively own.
- Event-list separation is visually confirmed (Bendie list vs. Planner list vs. Both fixture appearing in both).
- Refresh and back/forward parity for at least one scenario in section D.

## Quality gates

- `npm run lint` — must pass with zero new warnings/errors introduced by this feature's files.
- `tsc --noEmit` (or the repository's existing type-check command) — must pass.
- `npm run build` — must succeed.
- No `events.select('*')` introduced anywhere touched by this feature (grep confirmation).
- No new `app/api/**` route added (confirmed: none required by any of the ten contracts).
- No migration file added under `supabase/migrations/`.
