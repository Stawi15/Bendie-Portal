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
  /** Feature 020 — when set, the form is pre-filled from this item and saves changes to it (no "Save & Add Another"). */
  editing?: PlannerChecklistItemClient | null;
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

function valuesFromItem(item: PlannerChecklistItemClient): PlannerChecklistCreateValues {
  return {
    category: item.category ?? '',
    itemName: item.itemName ?? '',
    quantityText: item.quantityText ?? '',
    specification: item.specification ?? '',
    notes: item.notes ?? '',
    dayNumber: item.dayNumber != null ? String(item.dayNumber) : '',
    eventDayDate: item.eventDayDate ?? '',
    ownerProfileId: item.ownerProfileId ?? '',
  };
}

/**
 * Add / edit form modal — manager-only surface (spec.md Acceptance Criteria 1).
 * Feature 020 adds edit mode (`editing`), reversing Feature 010 Rule 3: managers can
 * change every field below. Sourced/On-site stay inline in `PlannerChecklistList.tsx`.
 * An owner is never cleared once set (Rule 4).
 */
export function PlannerChecklistModal({ open, eligibleOwners, submitting, serverError, onClose, onSubmit, presetContext, editing = null }: PlannerChecklistModalProps) {
  const [values, setValues] = useState<PlannerChecklistCreateValues>(EMPTY_CHECKLIST_VALUES);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValues(editing ? valuesFromItem(editing) : { ...EMPTY_CHECKLIST_VALUES, ...presetContext });
      setValidationError(null);
    }
  }, [open, presetContext, editing]);

  // The current owner may no longer be active staff on the event — keep them selectable so saving doesn't change ownership.
  const currentOwnerId = editing?.ownerProfileId ?? null;
  const currentOwnerMissing = Boolean(currentOwnerId) && !eligibleOwners.some((o) => o.profileId === currentOwnerId);

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
    <FormModal open={open} onClose={onClose} title={editing ? 'Edit Checklist Item' : 'Add Checklist Item'} maxWidthClassName="max-w-lg">
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
            {!currentOwnerId && <option value="">{editing ? 'Unassigned' : 'Assign to me'}</option>}
            {currentOwnerMissing && currentOwnerId && <option value={currentOwnerId}>{editing?.ownerName ?? 'Current owner'}</option>}
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
          {!editing && (
            <button type="button" onClick={(e) => handleSubmit(e, true)} className="btn-secondary disabled:opacity-50" disabled={submitting}>
              {submitting ? 'Saving…' : 'Save & Add Another'}
            </button>
          )}
          <button type="submit" className="btn-primary disabled:opacity-50" disabled={submitting}>
            {editing ? (submitting ? 'Saving…' : 'Save changes') : submitting ? 'Adding…' : 'Add Item'}
          </button>
        </div>
      </form>
    </FormModal>
  );
}
