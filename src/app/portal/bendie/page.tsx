'use client';

import { OrganizationHome } from '@/components/portal/OrganizationHome';
import { useProductGuard } from '@/lib/useProductGuard';
import { useProductEntitlement } from '@/contexts/AvailableProductsContext';
import { PausedProductNotice } from '@/components/portal/PausedProductNotice';
import { PortalLoadingSkeleton, PortalEntitlementError } from '@/components/portal/PortalLoadingSkeleton';

export default function BendieHomePage() {
  useProductGuard('bendie');
  const entitlement = useProductEntitlement();

  // /code-review finding F3: never render product content until entitlement
  // has genuinely resolved to "this organization owns Bendie" — a pending or
  // failed read renders the same neutral states EventLayout's
  // workspaceAuthPending already establishes, never the product home.
  if (entitlement.status === 'loading') return <PortalLoadingSkeleton />;
  if (entitlement.status === 'error') return <PortalEntitlementError />;
  if (entitlement.states.bendie === 'paused') return <PausedProductNotice product="bendie" />;
  if (!entitlement.available.bendie) return <PortalLoadingSkeleton />; // useProductGuard is redirecting

  return <OrganizationHome product="bendie" />;
}
