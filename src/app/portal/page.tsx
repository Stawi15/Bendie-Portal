'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useProductEntitlement } from '@/contexts/AvailableProductsContext';
import { resolveDefaultProduct } from '@/lib/productNavigation';
import { PortalLoadingSkeleton, PortalEntitlementError } from '@/components/portal/PortalLoadingSkeleton';

/**
 * Feature 006 (FR-055/FR-056): the legacy, pre-Feature-006 organization
 * Overview now resolves to the user's default product home
 * (/portal/bendie or /portal/planner), or /portal/no-product when the
 * organization has no active entitlement. The actual Overview content moved
 * to OrganizationHome, reused by both product routes.
 *
 * Corrected 2026-09-17 (/code-review finding F1, extended for consistency):
 * consumes the shared entitlement context instead of an independent fetch,
 * and never redirects on a failed lookup — a read error is not "no
 * entitlement" and must not be treated as one.
 */
export default function PortalRootPage() {
  const router = useRouter();
  const entitlement = useProductEntitlement();

  useEffect(() => {
    if (entitlement.status !== 'ready') return;
    const resolved = resolveDefaultProduct(entitlement.available);
    router.replace(resolved ? `/portal/${resolved}` : '/portal/no-product');
  }, [entitlement, router]);

  if (entitlement.status === 'error') return <PortalEntitlementError />;
  return <PortalLoadingSkeleton />;
}
