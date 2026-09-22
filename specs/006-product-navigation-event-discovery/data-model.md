# Phase 1 Data Model: Product-Level Navigation & Product-Aware Event Discovery

Feature 006 introduces **no new database table, column, or migration**. This document records (a) the existing entities it reuses unchanged, (b) the one existing table whose role is explicitly *excluded* by the specification, and (c) the derived, non-persisted concepts the implementation introduces purely in application memory (React state, URL, or a function's return value).

## Reused Existing Entities (unchanged)

| Entity | Table | Role in Feature 006 |
|---|---|---|
| Organization | `organizations` | Unchanged; identity only. |
| Organization membership | `organization_members` | Unchanged; still the sole basis for `getAccessibleOrganizations()`. |
| **Organization product entitlement** | `organization_products` (`organization_id`, `product_key: 'bendie'\|'planner'`, `is_active`, `enabled_at`, `enabled_by`) | **Sole source of truth** for which products a switcher may offer (FR-005–FR-012). Read via the new `getAvailableProducts()` (research.md Q2) and the existing `isProductActiveForOrg()`. Never written by this feature. |
| Event | `events` | Unchanged row shape; `EVENTS_SELECT_COLUMNS`/`EventRow` (Feature 004) remain the only client-side read path — extended with the new `EVENTS_SELECT_COLUMNS_WITH_PRODUCT_FILTER` template-literal variant (research.md Q6), never a wildcard select. |
| **Event product membership** | `event_products` (`event_id`, `product_key: 'bendie'\|'planner'`, `organization_id`, `enabled_at`, `enabled_by`) | **Sole source of truth** for which product-discovery surface(s) an event appears in (FR-022–FR-025). Read-only; used both as a query-layer inner-join filter (research.md Q6) and via the existing `isProductAvailableForEvent()`. Never written by this feature. |
| Event workspace membership | `event_members` | Unchanged; `requireEventWorkspaceAccess()` remains the sole workspace-authorization gate, evaluated before any product-based routing decision (FR-058). |

## Explicitly Excluded From Product-Membership Determination

| Entity | Table | Why excluded |
|---|---|---|
| Planner counterpart link | `event_planner_links` | Feature 001/004 infrastructure recording whether/how an event is mirrored into the Bendie Planner project. **Never** consulted to decide product availability or product-discovery membership (FR-006, FR-025) — doing so was the exact carry-forward defect this feature exists to correct (see Feature 005's convergence notes). Used only by Feature 005's Planner Overview to resolve the canonical counterpart for a Planner-classified event a user has already been correctly routed to. |
| Organization Planner mapping | `organization_planner_links` | Feature 001/004 infrastructure for provisioning; irrelevant to product navigation/discovery and untouched by this feature. |

## Derived, Non-Persisted Concepts

These exist only as a pure function's return value, a piece of React state derived every render, or a URL — none is a database row, and none survives past the current page load except via the URL itself.

### `ProductKey`
```ts
type ProductKey = 'bendie' | 'planner';
```
Already defined in `eventAuth.ts`; reused, not redefined.

### `AvailableProducts`
```ts
type AvailableProducts = { bendie: boolean; planner: boolean };
```
Returned by `getAvailableProducts(organizationId)` (research.md Q2). Freshly computed on every call — never cached beyond the lifetime of the React state that holds the last result, and re-derived on every `organizationId` change (FR-017).

### `ProductContext` (React-context value)
```ts
type ProductContextValue = { product: ProductKey | null };
```
Derived purely from `usePathname()` (research.md Q1). Has no setter — there is nothing to set; the only way to change it is to navigate. Never reads or writes `profiles`, `localStorage`, or any other persisted store (FR-002, FR-021 of the architecture decision record).

### `ResolvedProduct`
The return value of `resolveDefaultProduct(available)` and `resolveProductFallback(current, available)` (research.md Q3) — a plain `ProductKey | null`, computed on demand, never stored.

### `EventOriginSignal`
The parsed, validated value of the `?product=` query-string parameter read via `useSearchParams()` in `EventLayout.tsx` (research.md Q5) — one of `'bendie' | 'planner' | undefined` (any other raw string value collapses to `undefined`, i.e. treated identically to absent/legacy). Exists only as long as the URL carries it; never written to any storage.

### `EventProductMembership`
The per-event `{ bendie: boolean; planner: boolean }` shape already computed today by `EventLayout.tsx`'s existing `productAvailability` state (built from `isProductAvailableForEvent()` calls) — reused unchanged as the input to both the deliberate-switch resolver and the generalized mismatched-origin redirect (research.md Q9). Not a new concept; documented here only to make explicit that Feature 006 introduces no second, competing computation of it.

## State Transitions

None. Every concept above is either an immutable database read (existing tables, read-only) or a value re-derived from scratch on each relevant render/navigation — there is no lifecycle, no stored state machine, and therefore nothing to migrate or reconcile across sessions. This is a deliberate consequence of the architecture decision to keep product context entirely URL-authoritative with zero persistence (FR-014 of the architecture decision record; Assumptions section of spec.md).
