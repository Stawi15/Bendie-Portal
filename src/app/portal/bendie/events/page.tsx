'use client';

import { OrganizationEventsList } from '@/components/portal/OrganizationEventsList';
import { useProductGuard } from '@/lib/useProductGuard';
import { useProductEntitlement } from '@/contexts/AvailableProductsContext';
import { PausedProductNotice } from '@/components/portal/PausedProductNotice';
import { PortalLoadingSkeleton, PortalEntitlementError } from '@/components/portal/PortalLoadingSkeleton';

export default function BendieEventsPage() {
  useProductGuard('bendie');
  const entitlement = useProductEntitlement();

  if (entitlement.status === 'loading') return <PortalLoadingSkeleton />;
  if (entitlement.status === 'error') return <PortalEntitlementError />;
  if (entitlement.states.bendie === 'paused') return <PausedProductNotice product="bendie" />;
  if (!entitlement.available.bendie) return <PortalLoadingSkeleton />;

  return <OrganizationEventsList product="bendie" />;
}
