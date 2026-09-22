'use client';

import { OrganizationEventsList } from '@/components/portal/OrganizationEventsList';
import { useProductGuard } from '@/lib/useProductGuard';
import { useProductEntitlement } from '@/contexts/AvailableProductsContext';
import { PortalLoadingSkeleton, PortalEntitlementError } from '@/components/portal/PortalLoadingSkeleton';

export default function PlannerEventsPage() {
  useProductGuard('planner');
  const entitlement = useProductEntitlement();

  if (entitlement.status === 'loading') return <PortalLoadingSkeleton />;
  if (entitlement.status === 'error') return <PortalEntitlementError />;
  if (!entitlement.available.planner) return <PortalLoadingSkeleton />;

  return <OrganizationEventsList product="planner" />;
}
