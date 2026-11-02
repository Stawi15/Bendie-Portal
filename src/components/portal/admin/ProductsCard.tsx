'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { useConfirm } from '@/contexts/ConfirmContext';
import { FormModal } from '@/components/portal/FormModal';
import { PlannerConnectionPicker } from '@/components/portal/admin/PlannerConnectionPicker';
import { ProductStateChip } from '@/components/portal/admin/ProductStateChip';
import { PauseProductDialog } from '@/components/portal/admin/PauseProductDialog';
import { AddProductToEvents } from '@/components/portal/admin/AddProductToEvents';
import { PRODUCT_KEYS, PRODUCT_LABEL, productStateOf, type PlannerChoice, type ProductKey } from '@/lib/orgProductsAdmin';

export type AdminProductRow = {
  product_key: string;
  is_active: boolean;
  enabled_at: string | null;
  enabled_by: string | null;
  status_changed_at: string | null;
  status_changed_by: string | null;
};

export type AdminPlannerLink = {
  planner_organization_id: number;
  planner_organization_name: string | null;
  planner_app_paused_at: string | null;
};

export type AdminEventItem = { id: string; name: string; starts_at: string | null; products: string[] };

const formatWhen = (iso: string) => new Date(iso).toLocaleString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

/**
 * Feature 022 (US2–US4) — the organisation's products: state, who changed it last, the Planner
 * connection, switch on (connecting Planner first when needed), pause, and adding a switched-on
 * product to existing events.
 */
export function ProductsCard({
  organization,
  products,
  link,
  events,
  names,
  onChanged,
}: {
  organization: { id: string; name: string };
  products: AdminProductRow[];
  link: AdminPlannerLink | null;
  events: AdminEventItem[];
  names: Record<string, string>;
  onChanged: () => void;
}) {
  const confirm = useConfirm();
  const [busy, setBusy] = useState<ProductKey | null>(null);
  const [pausing, setPausing] = useState<ProductKey | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [plannerChoice, setPlannerChoice] = useState<PlannerChoice | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  const switchOn = async (product: ProductKey) => {
    const state = productStateOf(products, product);
    const verb = state === 'paused' ? 'Resume' : 'Switch on';
    const ok = await confirm({
      title: `${verb} ${PRODUCT_LABEL[product]}`,
      message:
        state === 'paused'
          ? `Resume ${PRODUCT_LABEL[product]} for ${organization.name}? Everything comes back as it was${product === 'planner' && link?.planner_app_paused_at ? ', including Planner app access' : ''}.`
          : `Switch on ${PRODUCT_LABEL[product]} for ${organization.name}?`,
      confirmLabel: verb,
    });
    if (!ok) return;
    setBusy(product);
    try {
      const res = await fetch(`/api/admin/organizations/${organization.id}/products/${product}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: true, expectedActive: state === 'none' ? null : false }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) toast.error(body.error ?? `${PRODUCT_LABEL[product]} couldn’t be switched on.`);
      else toast.success(`${PRODUCT_LABEL[product]} is active`);
      // A 409 means someone else changed it — reloading shows the current state.
      onChanged();
    } catch {
      toast.error('Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  };

  const connectPlanner = async () => {
    if (!plannerChoice) {
      setConnectError('Choose a Planner organisation, or create a new one.');
      return;
    }
    setBusy('planner');
    setConnectError(null);
    try {
      const res = await fetch(`/api/admin/organizations/${organization.id}/planner-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plannerChoice),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setConnectError(body.error ?? 'Bendie Planner couldn’t be connected.');
        return;
      }
      toast.success('Connected to Bendie Planner');
      setConnectOpen(false);
      setPlannerChoice(null);
      onChanged();
    } catch {
      setConnectError('Check your connection and try again.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="bg-white border border-outline-variant rounded-[20px] panel-shadow p-5">
      <h2 className="font-semibold text-on-surface mb-3">Products</h2>
      <div className="divide-y divide-outline-variant/40">
        {PRODUCT_KEYS.map((product) => {
          const state = productStateOf(products, product);
          const row = products.find((p) => p.product_key === product);
          const changedAt = row?.status_changed_at ?? row?.enabled_at ?? null;
          const changedBy = row?.status_changed_by ?? row?.enabled_by ?? null;
          const needsConnection = product === 'planner' && !link;
          return (
            <div key={product} className="py-4 first:pt-0 last:pb-0 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-on-surface">{PRODUCT_LABEL[product]}</p>
                    <ProductStateChip state={state} />
                  </div>
                  {changedAt && (
                    <p className="text-[11px] text-on-surface-variant mt-0.5">
                      Last changed {formatWhen(changedAt)}
                      {changedBy ? ` by ${names[changedBy] ?? 'a platform admin'}` : ''}
                    </p>
                  )}
                  {product === 'planner' && (
                    <p className="text-xs text-on-surface-variant mt-1">
                      {link ? (
                        <>
                          Connected to <span className="font-medium text-on-surface">{link.planner_organization_name ?? `Planner organisation #${link.planner_organization_id}`}</span>
                          {link.planner_app_paused_at && <span className="text-error"> · Planner app access paused</span>}
                        </>
                      ) : (
                        'Not connected to a Planner organisation'
                      )}
                    </p>
                  )}
                </div>
                {state === 'active' ? (
                  <button type="button" className="btn-secondary text-xs" disabled={busy !== null} onClick={() => setPausing(product)}>
                    Pause
                  </button>
                ) : needsConnection ? (
                  <button type="button" className="btn-primary text-xs" disabled={busy !== null} onClick={() => setConnectOpen(true)}>
                    Connect Bendie Planner
                  </button>
                ) : (
                  <button type="button" className="btn-primary text-xs" disabled={busy !== null} onClick={() => switchOn(product)}>
                    {busy === product ? 'Saving…' : state === 'paused' ? 'Resume' : 'Switch on'}
                  </button>
                )}
              </div>
              {state === 'active' && <AddProductToEvents organizationId={organization.id} product={product} events={events} onChanged={onChanged} />}
            </div>
          );
        })}
      </div>

      {pausing && (
        <PauseProductDialog
          open
          organizationId={organization.id}
          product={pausing}
          onClose={() => setPausing(null)}
          onPaused={() => {
            toast.success(`${PRODUCT_LABEL[pausing]} paused`);
            setPausing(null);
            onChanged();
          }}
        />
      )}

      <FormModal
        open={connectOpen}
        onClose={() => {
          setConnectOpen(false);
          setConnectError(null);
        }}
        title="Connect Bendie Planner"
        maxWidthClassName="max-w-lg"
      >
        <div className="space-y-4">
          <PlannerConnectionPicker organizationName={organization.name} onChange={setPlannerChoice} />
          <p className="text-xs text-on-surface-variant">After connecting, switch Bendie Planner on.</p>
          {connectError && <p className="text-sm text-error" role="alert">{connectError}</p>}
          <div className="flex gap-3 pt-2 border-t border-outline-variant">
            <button type="button" className="btn-primary" disabled={busy !== null} onClick={connectPlanner}>
              {busy === 'planner' ? 'Connecting…' : 'Connect'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setConnectOpen(false)}>Cancel</button>
          </div>
        </div>
      </FormModal>
    </section>
  );
}
