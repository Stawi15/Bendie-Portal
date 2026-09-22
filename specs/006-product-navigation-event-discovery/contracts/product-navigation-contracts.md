# Phase 1 Contracts: Product-Level Navigation & Product-Aware Event Discovery

No new HTTP API is introduced by this feature (confirmed during planning — every requirement is satisfiable with existing RLS-governed client reads and application-layer routing). These ten contracts describe **observable routing and data-layer behavior** instead, each traceable to the functional requirements it implements. They are the behavioral surface `/speckit-tasks` and `/speckit-implement` must satisfy, and the surface `quickstart.md` verifies.

---

## 1. Resolve available products

**Function**: `getAvailableProducts(organizationId: string): Promise<{ bendie: boolean; planner: boolean }>`

**Input**: a valid organization id the caller has already been shown to have some relationship to (this function performs no authorization of its own — RLS on `organization_products` governs what rows are visible).

**Output**: both flags `false` only when the organization has zero `is_active = true` rows for that product key; an inactive or absent row is indistinguishable in the result (FR-008).

**Traces to**: FR-005–FR-012.

---

## 2. Resolve default/current product

**Functions**: `resolveDefaultProduct(available)`, `resolveProductFallback(current, available)`

**Behavior**:
| available.bendie | available.planner | resolveDefaultProduct |
|---|---|---|
| true | false | `'bendie'` |
| false | true | `'planner'` |
| true | true | `'bendie'` |
| false | false | `null` |

`resolveProductFallback(current, available)`: returns `current` unchanged if `available[current]` is `true`; otherwise returns `resolveDefaultProduct(available)`.

**Traces to**: FR-013–FR-016, FR-018–FR-019.

---

## 3. Product-aware event discovery

**Contract**: for a given `(organizationId, product)`, the returned event set is **exactly** the organization's events whose `event_products` rows include that `product_key` — no more (no cross-product events), no less (no omission), and identical whether the caller is reading the product home's summary figures or the product's `/events` list (FR-022–FR-027, FR-029).

**Verifiable property**: `bendieEvents ∩ plannerEvents = eventsWithBothProducts`; `bendieEvents ∪ plannerEvents ⊆ allOrgEvents`; an event with zero `event_products` rows appears in neither.

**Traces to**: FR-022–FR-029, FR-057 (empty vs. no-product distinction — an empty *result set* for an active product is not the same as the product being unavailable).

---

## 4. Product switch (deliberate, while inside an event workspace)

**Function**: `resolveProductSwitchDestination(input): string` (path)

**Input**: `{ location: 'product-home' | 'product-events' | 'shared' | 'event-workspace', targetProduct, eventId?, eventSupportsTargetProduct? }`

**Behavior**:
- `product-home`/`product-events` → the equivalent page for `targetProduct` (home↔home, events↔events).
- `shared` → `targetProduct`'s home.
- `event-workspace`: if `eventSupportsTargetProduct` is `true` → that event's entry tab for `targetProduct` (`dashboard` for bendie, `planner-overview` for planner) with `?product=<targetProduct>`; otherwise → `targetProduct`'s `/events` list.

**Implementation note (2026-09-17)**: the input was simplified from a precomputed `AvailableProducts` map to a single `eventSupportsTargetProduct: boolean`, consistent with the H1 correction (research.md Q9) — the caller (`TopHeader`) obtains this one boolean via a click-time `isProductAvailableForEvent(currentEventId, organizationId, targetProduct)` call rather than holding a full per-event membership map. The observable behavior described above is unchanged.

**Traces to**: FR-052, FR-053 (clarification-derived).

---

## 5. Organization switch

**Contract**: on a change of selected organization while viewing a product page, the effective product becomes `resolveProductFallback(previousProduct, newAvailableProducts)`; if the result differs from the URL's current product, the page redirects to the equivalent route for the resolved product; the previous organization's event data is never rendered as current during or after the transition (FR-017–FR-020, FR-049).

**Extended case — organization switch from inside an event workspace**: if the organization change occurs while the user is inside an event workspace (`/portal/events/[eventId]/...`) belonging to the organization being left, the user is redirected immediately to `resolveDefaultProduct(newAvailableProducts)`'s home route for the newly selected organization — never left viewing the previous organization's event (FR-054).

**Traces to**: FR-017–FR-020, FR-049–FR-050, FR-054.

---

## 6. Event entry with product origin

**Contract**: a link into an event workspace built by a product-aware surface always carries `?product=<theOriginatingProduct>` and targets that product's entry tab directly. A link with no `?product=` (any pre-existing/legacy link) is interpreted exactly as Feature 005's existing behavior. An unrecognized `?product=` value is treated identically to absent.

**Traces to**: FR-034, FR-037, FR-040, FR-041.

---

## 7. Both-event landing

**Contract**: for an event whose `event_products` includes both keys — entry with `?product=bendie` (or no signal) lands on `dashboard`; entry with `?product=planner` lands on `planner-overview`. No other input produces a different landing tab for a Both event.

**Traces to**: FR-035–FR-037.

---

## 8. Mismatched-origin redirect

**Contract**: if the workspace-authorization gate has already passed (see contract 10) and the active tab's classified product is unavailable for this event while the *other* classified product is available, the user is redirected to that other product's entry tab; if neither is available (should not occur for a correctly-linked event, but must fail safely), the existing generic "not available for this event" state is shown instead of a redirect loop or a fabricated view.

**Traces to**: FR-038, FR-039.

---

## 9. Legacy route redirect

**Contract**: `GET /portal` and `GET /portal/events` (application routes, not HTTP APIs) always resolve to `resolveDefaultProduct(availableProducts for the current organization)`'s corresponding home/events route, or `/portal/no-product` when that resolves to `null`. No unfiltered, product-agnostic organization view is ever rendered at these paths post-implementation.

**Traces to**: FR-055, FR-056.

---

## 10. No-product state

**Contract**: `/portal/no-product` (and any product route reached by an organization with zero active entitlements) never implies either product is available, exposes no product-specific event discovery or creation entry point, and cannot be reached in a way that creates a redirect loop with `/portal/bendie*`/`/portal/planner*`. Organization-global shared pages (`OrgSideNav`'s existing links) remain reachable and unaffected.

**Traces to**: FR-011, FR-016, FR-047, FR-048.
