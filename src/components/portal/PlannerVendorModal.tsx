'use client';

import { useEffect, useState } from 'react';
import { FormModal } from '@/components/portal/FormModal';

// Mirrors the client-facing shape from `src/lib/plannerVendors.ts` (server-only,
// never imported into a client component) — this is just the JSON contract.
export type PlannerVendorItemClient = {
  id: number;
  category: string;
  description: string;
  quantityText: string | null;
  unit: string | null;
  isPacked: boolean;
  packedAt: string | null;
  packedByName: string | null;
  isLoaded: boolean;
  loadedAt: string | null;
  loadedByName: string | null;
  isOnSite: boolean;
  onSiteAt: string | null;
  onSiteByName: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
};

export type PlannerVendorCreateValues = {
  category: string;
  description: string;
  quantityText: string;
  unit: string;
  notes: string;
};

type PlannerVendorModalProps = {
  open: boolean;
  submitting: boolean;
  serverError: { category: string; message: string } | null;
  onClose: () => void;
  /** `keepOpen` is true for "Save & Add Another" — the caller creates the record, refreshes the list, and (only then) resets this modal's fields by remounting it with a new `key`, rather than closing it. */
  onSubmit: (values: PlannerVendorCreateValues, keepOpen: boolean) => void;
};

/**
 * Create-only form modal — manager-only surface (spec.md FR-021/FR-024).
 * Reuses `FormModal` and the existing `.input`/`.label`/`.btn-primary`
 * primitives; no new design system. There is deliberately no "edit" mode —
 * this feature never supports changing an existing item's category,
 * description, quantity, unit, or display order after creation (FR-038); the
 * only post-creation edits (notes, lifecycle toggles) are handled inline in
 * `PlannerVendorList.tsx`, not through this modal.
 */
export function PlannerVendorModal({ open, submitting, serverError, onClose, onSubmit }: PlannerVendorModalProps) {
  const [values, setValues] = useState<PlannerVendorCreateValues>({ category: '', description: '', quantityText: '', unit: '', notes: '' });
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValues({ category: '', description: '', quantityText: '', unit: '', notes: '' });
      setValidationError(null);
    }
  }, [open]);

  const handleSubmit = (e: React.SyntheticEvent, keepOpen: boolean) => {
    e.preventDefault();
    if (!values.description.trim()) {
      setValidationError('Item description is required.');
      return;
    }
    setValidationError(null);
    onSubmit(values, keepOpen);
  };

  return (
    <FormModal open={open} onClose={onClose} title="Add Vendor Item" maxWidthClassName="max-w-lg">
      <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-4">
        <div>
          <label className="label">Description</label>
          <input
            className="input"
            value={values.description}
            onChange={(e) => setValues((prev) => ({ ...prev, description: e.target.value }))}
            placeholder="e.g. Wireless lapel mic set"
            disabled={submitting}
            autoFocus
          />
        </div>
        <div>
          <label className="label">Category</label>
          <input
            className="input"
            value={values.category}
            onChange={(e) => setValues((prev) => ({ ...prev, category: e.target.value }))}
            placeholder="General"
            disabled={submitting}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Quantity</label>
            <input
              className="input"
              value={values.quantityText}
              onChange={(e) => setValues((prev) => ({ ...prev, quantityText: e.target.value }))}
              placeholder="4"
              disabled={submitting}
            />
          </div>
          <div>
            <label className="label">Unit</label>
            <input
              className="input"
              value={values.unit}
              onChange={(e) => setValues((prev) => ({ ...prev, unit: e.target.value }))}
              placeholder="units"
              disabled={submitting}
            />
          </div>
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea
            className="input"
            rows={3}
            value={values.notes}
            onChange={(e) => setValues((prev) => ({ ...prev, notes: e.target.value }))}
            disabled={submitting}
          />
        </div>

        {(validationError || serverError) && <p className="text-sm text-error">{validationError ?? serverError?.message}</p>}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={submitting}>
            Cancel
          </button>
          <button type="button" onClick={(e) => handleSubmit(e, true)} className="btn-secondary disabled:opacity-50" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save & Add Another'}
          </button>
          <button type="submit" className="btn-primary disabled:opacity-50" disabled={submitting}>
            {submitting ? 'Adding…' : 'Add Item'}
          </button>
        </div>
      </form>
    </FormModal>
  );
}
