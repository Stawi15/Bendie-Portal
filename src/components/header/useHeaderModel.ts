'use client';

import { useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useEvent } from '@/contexts/EventContext';
import { useProduct } from '@/contexts/ProductContext';
import { useCreateEvent } from '@/contexts/CreateEventContext';
import { PRODUCT_PRESENTATION, NEUTRAL_PRESENTATION } from '@/lib/productPresentation';
import { useProductEntitlement } from '@/contexts/AvailableProductsContext';
import { useOrgEvents } from '@/lib/useOrgEvents';
import { useRecentActivity } from '@/lib/useRecentActivity';
import { isProductAvailableForEvent } from '@/lib/eventAuth';
import {
  resolveProductSwitchDestination,
  parseEventOriginSignal,
  resolveEventTabProduct,
  type ProductKey,
} from '@/lib/productNavigation';

export const PRODUCT_LABEL: Record<ProductKey, string> = {
  bendie: 'Bendie',
  planner: 'Bendie Planner',
};

/**
 * Feature 030 — TopHeader's state and derived data, moved VERBATIM so the same
 * controls can render in the current header (TopHeader) and in the Studio 2.0
 * shell (sidebar header + global top bar) without duplicating behaviour.
 */
export function useHeaderModel() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { profile, isGlobalAdmin, logout } = useAuth();
  const {
    organization,
    organizations,
    setCurrentOrganization,
    addOrganization,
    organizationId,
    loading: orgLoading,
  } = useOrganization();
  const { events } = useOrgEvents(organizationId, orgLoading);
  const {
    entries: activityEntries,
    loading: activityLoading,
    unreadCount,
    markAllRead,
  } = useRecentActivity(organizationId, orgLoading);
  const { product: currentProduct } = useProduct();
  // /code-review findings F3/F4: reads the ONE shared entitlement load
  // (AvailableProductsProvider) instead of independently re-fetching
  // organization_products — no second read, and the switcher correctly
  // offers nothing while that shared state is still 'loading'/'error'.
  const entitlement = useProductEntitlement();
  const availableProducts =
    entitlement.status === 'ready' ? entitlement.available : { bendie: false, planner: false };
  // Feature 022: a paused product stays in the switcher (disabled, "Paused" pill) instead of vanishing.
  const isProductPaused = (key: ProductKey) =>
    entitlement.status === 'ready' && entitlement.states[key] === 'paused';
  const switcherProducts = {
    bendie: availableProducts.bendie || isProductPaused('bendie'),
    planner: availableProducts.planner || isProductPaused('planner'),
  };
  const { currentEventId } = useEvent();
  const { canCreateEvent, openCreateEvent } = useCreateEvent();
  const [menuOpen, setMenuOpen] = useState(false);
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);
  const [productMenuOpen, setProductMenuOpen] = useState(false);
  const [createOrgOpen, setCreateOrgOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [eventSearch, setEventSearch] = useState('');
  const [eventSearchOpen, setEventSearchOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  // Feature 006: which product-switch location the current route represents.
  // 'shared' covers every non-product-scoped, non-event-workspace route
  // (People/Assets/Teams/Activity Log/Settings, and /portal itself pre-redirect).
  const switchLocation = pathname.startsWith('/portal/events/')
    ? 'event-workspace'
    : pathname.endsWith('/events')
      ? 'product-events'
      : currentProduct
        ? 'product-home'
        : 'shared';

  const handleProductSwitch = async (targetProduct: ProductKey) => {
    setProductMenuOpen(false);
    if (switchLocation === 'event-workspace' && currentEventId && organizationId) {
      // Deliberate in-event switch (FR-052/FR-053) — distinct from the
      // mismatched-origin redirect in EventLayout (FR-038/FR-039). A single
      // click-time check of the CURRENT event's membership for the TARGET
      // product only, via the existing helper EventLayout itself already
      // calls per-product in its own effect (no EventContext expansion, no
      // second product-membership data source — see research.md Q9's
      // corrected decision, post-/speckit.analyze finding H1).
      const eventSupportsTargetProduct = await isProductAvailableForEvent(
        currentEventId,
        organizationId,
        targetProduct
      );
      router.push(
        resolveProductSwitchDestination({
          location: 'event-workspace',
          targetProduct,
          eventId: currentEventId,
          eventSupportsTargetProduct,
        })
      );
      return;
    }
    router.push(resolveProductSwitchDestination({ location: switchLocation, targetProduct }));
  };

  // Breadcrumb-display product (manual-acceptance corrective fix, 2026-09-17;
  // extended for /code-review finding F5; corrected again 2026-09-17 after a
  // manual-recheck regression).
  // `ProductContext.product` is `null` on an event-workspace route by design
  // (the URL genuinely isn't under a product namespace there) — it remains
  // the sole AUTHORITY for routing/authorization, unchanged. For DISPLAY only,
  // this now uses the single structural rule in `resolveEventTabProduct`:
  // ONLY `dashboard`/`planner-overview` self-determine their product; every
  // other event tab (regardless of its EVENT_SECTIONS.product ACCESS-GATING
  // classification — most non-entry tabs are classified `'bendie'` there for
  // reasons unrelated to display) preserves the event's `?product=` origin
  // signal instead. Reading `EVENT_SECTIONS.product` directly as though it
  // meant "which product is the user currently in" was the bug: it silently
  // overwrote a correctly-preserved Planner origin the moment a
  // `'bendie'`-classified-but-not-actually-entry tab (e.g. Members) was
  // opened. "Choose product" is reserved for the case where no product is
  // resolvable at all (e.g. a shared ORGANIZATION page with no product
  // context).
  const eventOriginSignal = useMemo(() => parseEventOriginSignal(searchParams), [searchParams]);
  const activeEventTabKey =
    switchLocation === 'event-workspace' ? pathname.split('/')[4] : undefined;
  const breadcrumbProduct: ProductKey | null =
    currentProduct ?? resolveEventTabProduct(activeEventTabKey, eventOriginSignal) ?? null;
  // Feature 016 (product environment identity): derived from the SAME route-based
  // product the switcher shows — no separate theme state, no request. Null on
  // organisation-global pages (People/Teams/Settings…), which stay neutral.
  const productEnv = breadcrumbProduct ? PRODUCT_PRESENTATION[breadcrumbProduct] : null;
  // Neutral controls (search, organisation label) take the product accent only on focus.
  const controlFocus = productEnv ? productEnv.focusRing : NEUTRAL_PRESENTATION.focusRing;

  const eventMatches = eventSearch.trim()
    ? events
        .filter((e) => {
          const q = eventSearch.trim().toLowerCase();
          return e.name.toLowerCase().includes(q) || (e.location ?? '').toLowerCase().includes(q);
        })
        .slice(0, 8)
    : [];

  const goToEvent = (id: string) => {
    router.push(`/portal/events/${id}/dashboard`);
    setEventSearch('');
    setEventSearchOpen(false);
  };

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    router.push('/auth/login');
  };

  return {
    activityEntries,
    activityLoading,
    addOrganization,
    breadcrumbProduct,
    canCreateEvent,
    controlFocus,
    createOrgOpen,
    eventMatches,
    eventSearch,
    eventSearchOpen,
    goToEvent,
    handleLogout,
    handleProductSwitch,
    isGlobalAdmin,
    isProductPaused,
    markAllRead,
    menuOpen,
    mobileSearchOpen,
    notifOpen,
    openCreateEvent,
    orgMenuOpen,
    organization,
    organizations,
    productEnv,
    productMenuOpen,
    profile,
    router,
    setCreateOrgOpen,
    setCurrentOrganization,
    setEventSearch,
    setEventSearchOpen,
    setMenuOpen,
    setMobileSearchOpen,
    setNotifOpen,
    setOrgMenuOpen,
    setProductMenuOpen,
    switcherProducts,
    unreadCount,
  };
}

export type HeaderModel = ReturnType<typeof useHeaderModel>;
