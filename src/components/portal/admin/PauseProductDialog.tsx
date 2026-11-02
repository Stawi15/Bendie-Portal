'use client';

import { useEffect, useState } from 'react';
import { FormModal } from '@/components/portal/FormModal';
import { PRODUCT_LABEL, type ProductKey } from '@/lib/orgProductsAdmin';

type Impact = { events: number; plannerPeople: number | null; plannerAppPaused: boolean; plannerEnforcementLive: boolean };

/**
 * Feature 022 (US4) — confirm pausing a product, showing what it affects first. For Planner it
 * offers "Also pause Planner app access", but only once Planner enforces it (analysis I1).
 */
export function PauseProductDialog({
  open,
  organizationId,
  product,
  onClose,
  onPaused,
}: {
  open: boolean;
  organizationId: string;
  product: ProductKey;
  onClose: () => void;
  onPaused: () => void;
}) {
  const [impact, setImpact] = useState<Impact | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pauseApp, setPauseApp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setImpact(null);
    setLoadError(null);
    setPauseApp(false);
    setError(null);
    fetch(`/api/admin/organizations/${organizationId}/impact?product=${product}`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) setLoadError(body.error ?? 'Couldn’t work out what this affects.');
        else setImpact(body);
      })
      .catch(() => !cancelled && setLoadError('Couldn’t work out what this affects.'));
    return () => {
      cancelled = true;
    };
  }, [open, organizationId, product]);

  const confirmPause = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/organizations/${organizationId}/products/${product}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: false, expectedActive: true, pausePlannerAppAccess: product === 'planner' && pauseApp }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? 'The product couldn’t be paused.');
        return;
      }
      onPaused();
    } catch {
      setError('The product couldn’t be paused — check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const label = PRODUCT_LABEL[product];

  return (
    <FormModal open={open} onClose={onClose} title={`Pause ${label}`} maxWidthClassName="max-w-lg" confirmDiscard={false}>
      {loadError ? (
        <p className="text-sm text-error">{loadError}</p>
      ) : !impact ? (
        <div className="animate-pulse space-y-2" aria-hidden="true">
          <div className="h-4 bg-surface-container-low rounded w-3/4" />
          <div className="h-4 bg-surface-container-low rounded w-1/2" />
        </div>
      ) : (
        <div className="space-y-3 text-sm text-on-surface">
          <p>
            <span className="font-semibold">{impact.events}</span> event{impact.events !== 1 ? 's' : ''} use {label}
            {product === 'planner' && impact.plannerPeople !== null && (
              <>
                {' · '}
                <span className="font-semibold">{impact.plannerPeople}</span> {impact.plannerPeople === 1 ? 'person has' : 'people have'} Planner access
              </>
            )}
            .
          </p>
          <p className="text-on-surface-variant">
            {product === 'bendie'
              ? 'Bendie will be hidden in the Portal for this organisation. Live events keep working in the attendee app. Nothing is deleted, and resuming brings everything back.'
              : 'Bendie Planner will be hidden in the Portal for this organisation. Nothing is deleted, and resuming brings everything back.'}
          </p>
          {product === 'planner' &&
            (impact.plannerEnforcementLive ? (
              <label className="flex items-start gap-2 rounded-xl border border-outline-variant p-3 cursor-pointer">
                <input type="checkbox" className="mt-1" checked={pauseApp} onChange={(e) => setPauseApp(e.target.checked)} />
                <span>
                  <span className="block font-medium">Also pause Planner app access</span>
                  <span className="block text-xs text-on-surface-variant">
                    The organisation’s people, and Stawi staff assigned to its events, can’t open its events in the Planner app. Only Stawi platform admins keep access.
                  </span>
                </span>
              </label>
            ) : (
              <p className="text-xs text-on-surface-variant rounded-xl bg-surface-container-low p-3">
                Pausing Planner app access becomes available once the Planner update is installed.
              </p>
            ))}
          {error && <p className="text-sm text-error" role="alert">{error}</p>}
          <div className="flex gap-3 pt-2 border-t border-outline-variant">
            <button type="button" className="btn-danger" disabled={saving} onClick={confirmPause}>
              {saving ? 'Pausing…' : `Pause ${label}`}
            </button>
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          </div>
        </div>
      )}
    </FormModal>
  );
}
