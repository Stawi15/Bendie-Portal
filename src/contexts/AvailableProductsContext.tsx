'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAvailableProducts, type AvailableProductsState } from '@/lib/useAvailableProducts';

const AvailableProductsContext = createContext<AvailableProductsState | undefined>(undefined);

/**
 * Feature 006 corrective fix (/code-review findings F3/F4): the ONE place
 * `organization_products` entitlement is fetched for the selected
 * organization. Mounted once in `portal/layout.tsx`, so `TopHeader`,
 * `useProductGuard`, and every product page's own render-gating logic all
 * read the same in-flight/ready/error state instead of each independently
 * re-querying the same rows.
 *
 * This is a data-loading concern only — entirely separate from
 * `ProductContext` (the URL-derived, authoritative SELECTED product) and
 * never used as an authorization mechanism itself; it answers "what does
 * this organization own," not "is this request allowed."
 */
export function AvailableProductsProvider({ children }: { children: ReactNode }) {
  const { organizationId, loading: orgLoading } = useOrganization();
  const state = useAvailableProducts(organizationId, orgLoading);

  return <AvailableProductsContext.Provider value={state}>{children}</AvailableProductsContext.Provider>;
}

export function useProductEntitlement(): AvailableProductsState {
  const context = useContext(AvailableProductsContext);
  if (!context) {
    throw new Error('useProductEntitlement must be used within AvailableProductsProvider');
  }
  return context;
}
