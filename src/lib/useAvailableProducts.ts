'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { getProductStates, type ProductKey } from '@/lib/eventAuth';
import type { ProductState } from '@/types/database';
import type { AvailableProducts } from '@/lib/productNavigation';

/**
 * Discriminated result shape (Feature 006 corrective fix, /code-review
 * finding F1): `'error'` is a distinct state from `'ready'` with zero active
 * products — a caller must never treat a failed lookup as a legitimate
 * negative entitlement answer (FR-050). Callers only make an
 * entitlement-based decision (render product content, redirect, etc.) in the
 * `'ready'` state; `'loading'` and `'error'` both mean "do not act yet."
 */
export type AvailableProductsState =
  | { status: 'loading' }
  | { status: 'ready'; available: AvailableProducts; states: Record<ProductKey, ProductState> }
  | { status: 'error' };

/**
 * The single coordinated entitlement loader for a selected organization.
 * Intended to be called exactly ONCE per organization context — see
 * `AvailableProductsContext.tsx`, which wraps this in a provider so
 * `TopHeader`, `useProductGuard`, and every product page consume one shared
 * result instead of each independently re-fetching the same
 * `organization_products` rows (/code-review findings F3/F4).
 *
 * Generation-ref guarded so a stale organization's result — success or
 * error — can never overwrite a newer organization's state.
 */
export function useAvailableProducts(organizationId: string | null, orgLoading: boolean): AvailableProductsState {
  const [state, setState] = useState<AvailableProductsState>({ status: 'loading' });
  const generationRef = useRef(0);

  const refetch = useCallback(async () => {
    if (!organizationId) {
      setState({ status: 'loading' });
      return;
    }
    const generation = ++generationRef.current;
    setState({ status: 'loading' });
    try {
      // Feature 022: one read of all rows gives both the entitlement (`available`,
      // unchanged meaning: is_active = true) and the presentation states (paused/none).
      const states = await getProductStates(organizationId);
      if (generationRef.current !== generation) return;
      const available = { bendie: states.bendie === 'active', planner: states.planner === 'active' };
      setState({ status: 'ready', available, states });
    } catch (err) {
      if (generationRef.current !== generation) return;
      console.error('useAvailableProducts: entitlement lookup failed', err);
      setState({ status: 'error' });
    }
  }, [organizationId]);

  useEffect(() => {
    if (orgLoading) return;
    refetch();
  }, [orgLoading, refetch]);

  return state;
}
