'use client';

import { useEffect, useState } from 'react';
import { FormModal } from '@/components/portal/FormModal';

export type PlannerChecklistItemClient = {
  id: number;
  category: string;
  itemName: string;
  quantityText: string | null;
  specification: string | null;
  dayNumber: number | null;
  eventDayDate: string | null;
  ownerProfileId: string | null;
  ownerName: string | null;
  isSourced: boolean;
  sourcedAt: string | null;
  sourcedByName: string | null;
  isOnSite: boolean;
  onSiteAt: string | null;
  onSiteByName: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  createdByName: string | null;
};

export type EligibleOwnerClient = { profileId: string; name: string };

export type PlannerChecklistCreateValues = {
  category: string;
  itemName: string;
  quantityText: string;
  specification: string;
  notes: string;
  dayNumber: string;
  eventDayDate: string;
  ownerProfileId: string;
};

/** Portal UX continuation (016) — grouping/context fields worth carrying into a fresh "Save & Add Another" form; the item itself (name/quantity/spec/notes) always resets. */
export type PlannerChecklistPresetContext = Pick<PlannerChecklistCreateValues, 'category' | 'dayNumber' | 'eventDayDate' | 'ownerProfileId'>;

type PlannerChecklistModalProps = {
  open: boolean;
  eligibleOwners: EligibleOwnerClient[];
  submitting: boolean;
  serverError: { category: string; message: string } | null;
  onClose: () => void;
  onSubmit: (values: PlannerChecklistCreateValues, keepOpen: boolean) => void;
  presetContext?: PlannerChecklistPresetContext;
};

const EMPTY_CHECKLIST_VALUES: PlannerChecklistCreateValues = {
  category: '',
  itemName: '',
  quantityText: '',
  specification: '',
  notes: '',
  dayNumber: '',
  eventDayDate: '',
  ownerProfileId: '',
};

/**
 * Create-only form modal — manager-only surface (spec.md Acceptance Criteria 1).
 * No "edit" mode: category/item name/quantity/specification/sort order/owner/
 * day number/event-day date are all immutable after creation (spec Rule 3/4);
 * the only post-creation edits (notes, Sourced/On-site) are handled inline in
 * `PlannerChecklistList.tsx`.
 */
export function PlannerChecklistModal({ open, eligibleOwners, submitting, serverError, onClose, onSubmit, presetContext }: PlannerChecklistModalProps) {
  const [values, setValues] = useState<PlannerChecklistCreateValues>(EMPTY_CHECKLIST_VALUES);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValues({ ...EMPTY_CHECKLIST_VALUES, ...presetContext });
      setValidationError(null);
    }
  }, [open, presetContext]);

  const handleSubmit = (e: React.SyntheticEvent, keepOpen: boolean) => {
    e.preventDefault();
    if (!values.itemName.trim()) {
      setValidationError('Item name is required.');
      return;
    }
    setValidationError(null);
    onSubmit(values, keepOpen);
  };

  return (
    <FormModal open={open} onClose={onClose} title="Add Checklist Item" maxWidthClassName="max-w-lg">
      <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-4">
        <div>
          <label className="label">Item Name</label>
          <input
            className="input"
            value={values.itemName}
            onChange={(e) => setValues((prev) => ({ ...prev, itemName: e.target.value }))}
            placeholder="e.g. Extension cords"
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
              placeholder="10"
              disabled={submitting}
            />
          </div>
          <div>
            <label className="label">Specification</label>
            <input
              className="input"
              value={values.specification}
              onChange={(e) => setValues((prev) => ({ ...prev, specification: e.target.value }))}
              placeholder="e.g. 10m, heavy-duty"
              disabled={submitting}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Day Number</label>
            <input
              type="number"
              className="input"
              value={values.dayNumber}
              onChange={(e) => setValues((prev) => ({ ...prev, dayNumber: e.target.value }))}
              placeholder="1"
              disabled={submitting}
            />
          </div>
          <div>
            <label className="label">Event Day Date</label>
            <input
              type="date"
              className="input"
              value={values.eventDayDate}
              onChange={(e) => setValues((prev) => ({ ...prev, eventDayDate: e.target.value }))}
              disabled={submitting}
            />
          </div>
        </div>
        <div>
          <label className="label">Owner</label>
          <select className="input" value={values.ownerProfileId} onChange={(e) => setValues((prev) => ({ ...prev, ownerProfileId: e.target.value }))} disabled={submitting}>
            <option value="">Assign to me</option>
            {eligibleOwners.map((o) => (
              <option key={o.profileId} value={o.profileId}>
                {o.name}
              </option>
            ))}
          </select>
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

        <div className="flex items-center justify-end gap-2 pt-2 flex-wrap">
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
