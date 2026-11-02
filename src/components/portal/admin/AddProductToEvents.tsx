'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { useConfirm } from '@/contexts/ConfirmContext';
import { PRODUCT_LABEL, type ProductKey } from '@/lib/orgProductsAdmin';

type EventItem = { id: string; name: string; starts_at: string | null; products: string[] };

/**
 * Feature 022 (US3) — after a product is switched on, add it to the organisation's existing events.
 * A failed Planner set-up shows its reason with a Retry (existing retry route).
 */
export function AddProductToEvents({
  organizationId,
  product,
  events,
  onChanged,
}: {
  organizationId: string;
  product: ProductKey;
  events: EventItem[];
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const [failures, setFailures] = useState<Record<string, string>>({});
  const missing = events.filter((e) => !e.products.includes(product));
  const label = PRODUCT_LABEL[product];

  const add = async (event: EventItem) => {
    const ok = await confirm({
      title: `Add ${label}`,
      message: `Add ${label} to “${event.name}”?${product === 'planner' ? ' Its Planner side will be set up now.' : ''}`,
      confirmLabel: `Add ${label}`,
    });
    if (!ok) return;
    setBusy(event.id);
    try {
      const res = await fetch(`/api/admin/organizations/${organizationId}/events/${event.id}/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(body.error ?? `${label} couldn’t be added.`);
      } else if (body.plannerProvisioning === 'failed') {
        setFailures((prev) => ({ ...prev, [event.id]: body.reason ?? 'Planner set-up failed.' }));
        toast.error(`${label} was added, but its Planner set-up failed.`);
      } else {
        toast.success(`${label} added to “${event.name}”`);
      }
      onChanged();
    } catch {
      toast.error(`${label} couldn’t be added — check your connection and try again.`);
    } finally {
      setBusy(null);
    }
  };

  const retry = async (event: EventItem) => {
    setBusy(event.id);
    try {
      const res = await fetch(`/api/events/${event.id}/retry-planner-provisioning`, { method: 'POST' });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.plannerProvisioningStatus !== 'failed') {
        setFailures((prev) => {
          const next = { ...prev };
          delete next[event.id];
          return next;
        });
        toast.success('Planner set-up retried');
      } else {
        toast.error(body.message ?? 'Planner set-up failed again.');
      }
      onChanged();
    } catch {
      toast.error('Planner set-up couldn’t be retried — check your connection and try again.');
    } finally {
      setBusy(null);
    }
  };

  const failedEvents = events.filter((e) => failures[e.id]);

  if (missing.length === 0 && failedEvents.length === 0) {
    return <p className="text-xs text-on-surface-variant italic">Every event of this organisation already uses {label}.</p>;
  }

  return (
    <div>
      <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1">Existing events without {label}</p>
      <ul className="divide-y divide-outline-variant/40">
        {[...failedEvents, ...missing.filter((e) => !failures[e.id])].map((e) => (
          <li key={e.id} className="flex items-center gap-2 py-1.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-on-surface truncate">{e.name}</p>
              {failures[e.id] ? (
                <p className="text-[11px] text-error">{failures[e.id]}</p>
              ) : (
                e.starts_at && <p className="text-[11px] text-on-surface-variant">{new Date(e.starts_at).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' })}</p>
              )}
            </div>
            {failures[e.id] ? (
              <button type="button" className="btn-secondary text-xs py-1" disabled={busy === e.id} onClick={() => retry(e)}>
                Retry Planner set-up
              </button>
            ) : (
              <button type="button" className="btn-secondary text-xs py-1" disabled={busy === e.id} onClick={() => add(e)}>
                {busy === e.id ? 'Adding…' : `Add ${label}`}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
