'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProductEntitlement } from '@/contexts/AvailableProductsContext';
import { resolveDefaultProduct } from '@/lib/productNavigation';
import { PortalLoadingSkeleton, PortalEntitlementError } from '@/components/portal/PortalLoadingSkeleton';

/**
 * Feature 006 (FR-055): the legacy, pre-Feature-006 organization-wide events
 * list now resolves to the user's default product's event list
 * (/portal/bendie/events or /portal/planner/events), or /portal/no-product
 * when the organization has no active entitlement. This route only ever
 * matches the exact `/portal/events` path segment — it does not intercept
 * `/portal/events/[eventId]/...`, which remains the real event-workspace
 * route tree, untouched by this redirect.
 *
 * Corrected 2026-09-17 (/code-review finding F1, extended for consistency):
 * consumes the shared entitlement context instead of an independent fetch,
 * and never redirects on a failed lookup.
 */
export default function PortalEventsRootPage() {
  const router = useRouter();
  const entitlement = useProductEntitlement();

  useEffect(() => {
    if (entitlement.status !== 'ready') return;
    const resolved = resolveDefaultProduct(entitlement.available);
    router.replace(resolved ? `/portal/${resolved}/events` : '/portal/no-product');
  }, [entitlement, router]);

  if (entitlement.status === 'error') return <PortalEntitlementError />;
  return <PortalLoadingSkeleton />;
}
