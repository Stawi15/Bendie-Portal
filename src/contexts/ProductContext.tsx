'use client';

import { createContext, useContext, ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { parseProductFromPathname, type ProductKey } from '@/lib/productNavigation';

export interface ProductContextType {
  /** Sole authority: derived from the URL on every render. Never stored, never set. */
  product: ProductKey | null;
}

const ProductContext = createContext<ProductContextType | undefined>(undefined);

/**
 * URL-derived product context (Feature 006 FR-002). Deliberately has no
 * setter and no internal state — `product` is recomputed from `usePathname()`
 * every render, so it can never disagree with the URL. Never persists to a
 * database column or localStorage, and is never treated as an authorization
 * mechanism (see EventLayout/eventAuth for the actual authorization gates).
 */
export function ProductProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const product = parseProductFromPathname(pathname);

  return <ProductContext.Provider value={{ product }}>{children}</ProductContext.Provider>;
}

export function useProduct(): ProductContextType {
  const context = useContext(ProductContext);
  if (!context) {
    throw new Error('useProduct must be used within ProductProvider');
  }
  return context;
}
