import { PRODUCT_STATE_LABEL } from '@/lib/orgProductsAdmin';
import type { ProductState } from '@/types/database';

const STYLE: Record<ProductState, string> = {
  active: 'bg-primary/10 text-primary',
  paused: 'bg-tertiary-fixed text-on-tertiary-fixed-variant',
  none: 'bg-surface-container-low text-on-surface-variant',
};

/** Feature 022 — Active / Paused / Not included chip for an organisation's product. */
export function ProductStateChip({ state }: { state: ProductState }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${STYLE[state]}`}>
      {state === 'paused' && <span className="material-symbols-outlined text-[13px]" aria-hidden="true">pause_circle</span>}
      {PRODUCT_STATE_LABEL[state]}
    </span>
  );
}
