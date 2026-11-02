'use client';

import type { ProductKey } from '@/lib/eventAuth';

const LABEL: Record<ProductKey, string> = { bendie: 'Bendie', planner: 'Bendie Planner' };

export const pausedProductMessage = (product: ProductKey) =>
  `${LABEL[product]} is paused for your organisation. Contact Stawi to resume it.`;

/**
 * Feature 022 (US5) — shown wherever a paused product would otherwise silently disappear
 * or redirect (product home/events pages, event tabs). Tertiary notice style (ui-registry).
 * Presentation only: entitlement checks are unchanged.
 */
export function PausedProductNotice({ product }: { product: ProductKey }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4 py-10">
      <div className="max-w-md rounded-xl border border-tertiary-container bg-tertiary-fixed/40 p-5" role="status">
        <span className="material-symbols-outlined text-4xl text-on-tertiary-fixed-variant mb-2" aria-hidden="true">pause_circle</span>
        <h2 className="font-headline-sm text-headline-sm text-on-surface mb-1">{LABEL[product]} is paused</h2>
        <p className="text-body-md font-body-md text-on-tertiary-fixed-variant">{pausedProductMessage(product)}</p>
      </div>
    </div>
  );
}
