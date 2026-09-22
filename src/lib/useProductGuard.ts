'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProductEntitlement } from '@/contexts/AvailableProductsContext';
import { resolveProductFallback, type ProductKey } from '@/lib/productNavigation';

/**
 * Feature 006 (FR-017-FR-020, FR-049), corrected 2026-09-17 (/code-review
 * findings F1/F3/F4): reacts to the ONE shared `AvailableProductsProvider`
 * entitlement state instead of independently fetching it — no second
 * `organization_products` read, and no redirect while that shared state is
 * `'loading'` or `'error'` (a failed lookup must never be treated as "no
 * entitlement" and must never trigger a destructive redirect). Only once the
 * shared state reaches `'ready'` and `desiredProduct` turns out to be
 * unavailable does this replace the current route with the resolved
 * fallback — same path shape (home stays home, events stays events) or
 * `/portal/no-product` if nothing resolves.
 */
export function useProductGuard(desiredProduct: ProductKey) {
  const router = useRouter();
  const entitlement = useProductEntitlement();

  useEffect(() => {
    if (entitlement.status !== 'ready') return;
    if (entitlement.available[desiredProduct]) return;

    const resolved = resolveProductFallback(desiredProduct, entitlement.available);
    const suffix = typeof window !== 'undefined' && window.location.pathname.endsWith('/events') ? '/events' : '';
    router.replace(resolved ? `/portal/${resolved}${suffix}` : '/portal/no-product');
  }, [entitlement, desiredProduct, router]);
}
