import type { ProductKey } from '@/lib/eventAuth';

export type { ProductKey };

/**
 * Which products an organization actively owns. Derived exclusively from
 * `organization_products.is_active` (see getAvailableProducts in eventAuth.ts)
 * — never from event existence, event_products, event_planner_links, or
 * platform-admin status (Feature 006 FR-005/FR-006).
 */
export type AvailableProducts = { bendie: boolean; planner: boolean };

/**
 * The one canonical default-product rule (Feature 006 FR-013-FR-016). Every
 * caller that needs "which product should this organization land on" reuses
 * this instead of re-deriving the bendie/planner/both/none branching itself.
 */
export function resolveDefaultProduct(available: AvailableProducts): ProductKey | null {
  if (available.bendie && available.planner) return 'bendie';
  if (available.bendie) return 'bendie';
  if (available.planner) return 'planner';
  return null;
}

/**
 * Organization-switch fallback (FR-018/FR-019): preserve the current product if
 * the newly selected organization still actively owns it, otherwise fall back
 * to the same canonical default rule.
 */
export function resolveProductFallback(
  current: ProductKey | null,
  available: AvailableProducts
): ProductKey | null {
  if (current && available[current]) return current;
  return resolveDefaultProduct(available);
}

/**
 * URL is the sole authority for product-level context (FR-002) — this is a
 * pure function of the pathname, never stored, never read from localStorage
 * or a database column.
 */
export function parseProductFromPathname(pathname: string): ProductKey | null {
  if (pathname === '/portal/bendie' || pathname.startsWith('/portal/bendie/')) return 'bendie';
  if (pathname === '/portal/planner' || pathname.startsWith('/portal/planner/')) return 'planner';
  return null;
}

/**
 * Parses the `?product=` event-origin signal (FR-034). Any value other than
 * the two valid product keys — missing, empty, or garbage — collapses to
 * `undefined`, which every consumer treats identically to "absent/legacy."
 */
export function parseEventOriginSignal(searchParams: URLSearchParams | null): ProductKey | undefined {
  const raw = searchParams?.get('product');
  if (raw === 'bendie' || raw === 'planner') return raw;
  return undefined;
}

/**
 * Corrective fix (2026-09-17, manual-recheck regression): the only two
 * event-workspace tabs that are genuine product ENTRY points, and therefore
 * self-determine the product they display/propagate.
 * `EVENT_SECTIONS.product` (src/lib/eventSectionMeta.ts) answers a DIFFERENT
 * question — "which entitlement gates this tab's visibility" (Feature 003
 * access control) — and MUST NOT be read as "which product experience is
 * the user currently operating in." Nearly every other tab (Members, Basics,
 * Activity Log, Files, ...) is classified `'bendie'` there purely for
 * access-gating reasons that predate Feature 006, yet remains reachable from
 * either product's session on a Both event — treating that classification
 * as self-determining silently overwrote a correctly-preserved Planner
 * origin the moment such a tab was opened.
 */
const ENTRY_SECTION_PRODUCT: Record<string, ProductKey> = {
  dashboard: 'bendie',
  'planner-overview': 'planner',
};

/**
 * The single, structural rule for "what product should this event-workspace
 * tab display/propagate" — reused identically by `TopHeader` (breadcrumb)
 * and `EventLayout` (tab-link/Next-button origin propagation) so the
 * decision can never drift between the two call sites. `dashboard` and
 * `planner-overview` self-determine; every other tab preserves whatever
 * origin signal is already established (or `undefined` if none exists yet —
 * never invented without evidence).
 */
export function resolveEventTabProduct(
  sectionKey: string | undefined,
  originSignal: ProductKey | undefined
): ProductKey | undefined {
  if (sectionKey && ENTRY_SECTION_PRODUCT[sectionKey]) return ENTRY_SECTION_PRODUCT[sectionKey];
  return originSignal;
}

export type ProductSwitchLocation = 'product-home' | 'product-events' | 'shared' | 'event-workspace';

export type ProductSwitchInput = {
  location: ProductSwitchLocation;
  targetProduct: ProductKey;
  eventId?: string;
  /** Only meaningful when `location === 'event-workspace'`: whether the CURRENT event supports `targetProduct`. */
  eventSupportsTargetProduct?: boolean;
};

/**
 * Pure destination resolver for the product switcher (contracts/
 * product-navigation-contracts.md contract 4). Deliberately distinct from the
 * mismatched-origin redirect in EventLayout (FR-052/FR-053 vs FR-038/FR-039) —
 * this function is only ever invoked by a user's own switcher click, never by
 * a URL-driven effect.
 */
export function resolveProductSwitchDestination(input: ProductSwitchInput): string {
  const { location, targetProduct, eventId, eventSupportsTargetProduct } = input;

  if (location === 'product-home' || location === 'shared') {
    return `/portal/${targetProduct}`;
  }

  if (location === 'product-events') {
    return `/portal/${targetProduct}/events`;
  }

  // location === 'event-workspace'
  if (eventSupportsTargetProduct && eventId) {
    const entryTab = targetProduct === 'planner' ? 'planner-overview' : 'dashboard';
    return `/portal/events/${eventId}/${entryTab}?product=${targetProduct}`;
  }

  return `/portal/${targetProduct}/events`;
}
