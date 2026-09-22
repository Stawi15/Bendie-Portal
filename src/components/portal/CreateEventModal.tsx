'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { isProductActiveForOrg } from '@/lib/eventAuth';
import { EVENTS_SELECT_COLUMNS, type EventRow } from '@/lib/eventColumns';
import type { ProductKey } from '@/lib/productNavigation';
import toast from 'react-hot-toast';

type Event = EventRow;
type ProductChoice = 'bendie' | 'planner' | 'both';

type CreateEventModalProps = {
  open: boolean;
  organizationId: string;
  onClose: () => void;
  onCreated: (event: Event) => void;
  /**
   * Feature 006 (FR-042/FR-044): the product context the modal was opened
   * from. Only ever changes the INITIAL selection when the organization is
   * entitled to both products — the user remains free to change it before
   * submitting, and Feature 004's server-side validation stays authoritative
   * regardless of what this prop suggests.
   */
  initialProduct?: ProductKey;
};

const EMPTY_FORM = { name: '', location: '', starts_at: '', ends_at: '' };

export function CreateEventModal({ open, organizationId, onClose, onCreated, initialProduct }: CreateEventModalProps) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);

  // Feature 004: entitlement-driven product selection. Checked fresh every
  // time the modal opens for this organization — never cached across a
  // session, since an entitlement can change between visits. The server
  // (create_event_with_products, and the route calling it) remains the
  // authoritative check regardless of what this state shows; this is UX
  // only (research.md §17).
  const [bendieActive, setBendieActive] = useState<boolean | null>(null);
  const [plannerActive, setPlannerActive] = useState<boolean | null>(null);
  const [productChoice, setProductChoice] = useState<ProductChoice | null>(null);

  useEffect(() => {
    if (!open || !organizationId) return;
    setForm(EMPTY_FORM);
    // A fresh idempotency key per modal-open, not regenerated on a
    // resubmit-after-error within the same open (research.md §7) — a
    // resubmission of the SAME logical request must reuse it so the
    // server-side idempotency check can recognize a retry rather than a
    // new request.
    setIdempotencyKey(crypto.randomUUID());
    setBendieActive(null);
    setPlannerActive(null);
    setProductChoice(null);

    let cancelled = false;
    Promise.all([isProductActiveForOrg(organizationId, 'bendie'), isProductActiveForOrg(organizationId, 'planner')]).then(
      ([bendie, planner]) => {
        if (cancelled) return;
        setBendieActive(bendie);
        setPlannerActive(planner);
        if (bendie && !planner) setProductChoice('bendie');
        else if (!bendie && planner) setProductChoice('planner');
        else if (bendie && planner && initialProduct) setProductChoice(initialProduct);
        // Both active, no initialProduct hint: no auto-selection — the user
        // must choose (FR-004). Neither active: productChoice stays null,
        // creation stays disabled.
      }
    );

    return () => {
      cancelled = true;
    };
  }, [open, organizationId, initialProduct]);

  // A client-side "does the Planner mapping exist" preflight used to live
  // here (FR-019, research.md §17), reading `organization_planner_links`
  // directly. Removed (review finding, 2026-09-16, same root cause as the
  // server-side fix alongside it): that table's only RLS policy is
  // `portal_is_global_admin()`, so the read silently came back empty — not
  // an error — for every ordinary org owner/admin, incorrectly disabling
  // Submit for exactly the callers this modal exists to serve, even when a
  // valid mapping existed. There is no reliable client-side signal to
  // replace it with (a `false` reading is indistinguishable from "you're not
  // a platform admin," not from "no mapping"), and per this codebase's
  // established security model ordinary users must not gain broader SELECT
  // visibility into that table just to make this one hint work. The server
  // (`POST /api/events/create` → `create_event_with_products`) is already
  // fully authoritative for this check and already surfaces
  // `planner_mapping_missing`'s exact friendly message through the ordinary
  // `handleSave` error-toast path below if the mapping genuinely doesn't
  // exist — this only removes a redundant, unreliable pre-emptive block.

  if (!open) return null;

  const setField = (field: keyof typeof EMPTY_FORM) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleClose = () => {
    setForm(EMPTY_FORM);
    onClose();
  };

  const noEntitlement = bendieActive === false && plannerActive === false;
  const canSubmit = !!productChoice && !noEntitlement;

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Event name is required');
      return;
    }
    if (!canSubmit || !productChoice || !idempotencyKey) return;

    const products = productChoice === 'both' ? ['bendie', 'planner'] : [productChoice];

    setSaving(true);
    const res = await fetch('/api/events/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey,
        organizationId,
        name: form.name.trim(),
        location: form.location.trim() || null,
        startsAt: form.starts_at || null,
        endsAt: form.ends_at || null,
        products,
      }),
    });
    const result = await res.json().catch(() => ({}));
    setSaving(false);

    if (!res.ok || !result.ok) {
      toast.error(result.message || result.error || 'Failed to create event');
      return;
    }

    if (result.plannerProvisioningStatus === 'failed') {
      toast.error('Event created, but Bendie Planner setup didn’t complete — you can retry it from the event.');
    } else {
      toast.success('Event created');
    }

    const { data: event } = await supabase.from('events').select(EVENTS_SELECT_COLUMNS).eq('id', result.eventId).single();
    if (event) onCreated(event);
    setForm(EMPTY_FORM);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-[20px] panel-shadow p-6 w-full max-w-md">
        <h2 className="font-headline-sm text-headline-sm text-on-surface mb-4">New Event</h2>

        {noEntitlement ? (
          <p className="hint">
            Your organisation doesn’t currently have an active Bendie or Bendie Planner entitlement — contact your
            administrator to create events here.
          </p>
        ) : (
          <div className="space-y-4">
            {bendieActive && plannerActive && (
              <div>
                <label className="label">Product</label>
                <div className="flex gap-2 mt-1">
                  {(['bendie', 'planner', 'both'] as const).map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      onClick={() => setProductChoice(choice)}
                      className={`px-3 py-1.5 rounded-lg text-label-sm font-label-sm border ${
                        productChoice === choice ? 'border-primary bg-primary/10 text-primary' : 'border-outline-variant text-on-surface-variant'
                      }`}
                    >
                      {choice === 'bendie' ? 'Bendie' : choice === 'planner' ? 'Bendie Planner' : 'Both'}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="label">Event name</label>
              <input className="input" value={form.name} onChange={setField('name')} placeholder="e.g. Stawi Escape" />
            </div>
            <div>
              <label className="label">Location</label>
              <input className="input" value={form.location} onChange={setField('location')} placeholder="e.g. Naivasha" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Start date</label>
                <input className="input" type="date" value={form.starts_at} onChange={setField('starts_at')} />
              </div>
              <div>
                <label className="label">End date</label>
                <input className="input" type="date" value={form.ends_at} onChange={setField('ends_at')} />
              </div>
            </div>
            <p className="hint">New events start as Draft — you can publish once it&apos;s ready.</p>
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button className="btn-secondary" onClick={handleClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave} disabled={saving || !canSubmit}>
            {saving ? 'Creating…' : 'Create Event'}
          </button>
        </div>
      </div>
    </div>
  );
}
