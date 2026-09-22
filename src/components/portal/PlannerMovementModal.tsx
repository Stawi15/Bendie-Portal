'use client';

import { useEffect, useState } from 'react';
import { FormModal } from '@/components/portal/FormModal';

export type PlannerMovementClient = {
  id: number;
  movementName: string;
  route: string;
  movementDate: string;
  pickupTime: string | null;
  notes: string | null;
  createdAt: string;
  vehicles: unknown[];
};

export type PlannerMovementFormValues = { movementName: string; route: string; movementDate: string; pickupTime: string; notes: string };

const EMPTY_VALUES: PlannerMovementFormValues = { movementName: '', route: '', movementDate: '', pickupTime: '', notes: '' };

function movementToValues(m: PlannerMovementClient): PlannerMovementFormValues {
  return { movementName: m.movementName, route: m.route, movementDate: m.movementDate, pickupTime: (m.pickupTime ?? '').slice(0, 5), notes: m.notes ?? '' };
}

type PlannerMovementModalProps = {
  open: boolean;
  editing: PlannerMovementClient | null;
  submitting: boolean;
  serverError: { category: string; message: string } | null;
  onClose: () => void;
  onSubmit: (values: PlannerMovementFormValues) => void;
};

/** Feature 013 — create/edit a Transport Movement (the route/date/time grouping a Vehicle belongs to). */
export function PlannerMovementModal({ open, editing, submitting, serverError, onClose, onSubmit }: PlannerMovementModalProps) {
  const [values, setValues] = useState<PlannerMovementFormValues>(EMPTY_VALUES);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValues(editing ? movementToValues(editing) : EMPTY_VALUES);
    setValidationError(null);
  }, [open, editing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.movementName.trim() || !values.route.trim() || !values.movementDate) {
      setValidationError('Movement name, route, and date are required.');
      return;
    }
    setValidationError(null);
    onSubmit(values);
  };

  return (
    <FormModal open={open} onClose={onClose} title={editing ? 'Edit Transport Movement' : 'Add Transport Movement'} maxWidthClassName="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Movement Name</label>
          <input
            className="input"
            value={values.movementName}
            onChange={(e) => setValues((prev) => ({ ...prev, movementName: e.target.value }))}
            placeholder="e.g. Airport Pickup — Day 1 Morning"
            disabled={submitting}
            autoFocus
          />
        </div>
        <div>
          <label className="label">Route</label>
          <input className="input" value={values.route} onChange={(e) => setValues((prev) => ({ ...prev, route: e.target.value }))} placeholder="Airport → Hotel" disabled={submitting} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={values.movementDate} onChange={(e) => setValues((prev) => ({ ...prev, movementDate: e.target.value }))} disabled={submitting} />
          </div>
          <div>
            <label className="label">Pickup Time</label>
            <input type="time" className="input" value={values.pickupTime} onChange={(e) => setValues((prev) => ({ ...prev, pickupTime: e.target.value }))} disabled={submitting} />
          </div>
        </div>
        <div>
          <label className="label">Notes</label>
          <textarea className="input" rows={2} value={values.notes} onChange={(e) => setValues((prev) => ({ ...prev, notes: e.target.value }))} disabled={submitting} />
        </div>

        {(validationError || serverError) && <p className="text-sm text-error">{validationError ?? serverError?.message}</p>}

        <div className="flex items-center justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={submitting}>
            Cancel
          </button>
          <button type="submit" className="btn-primary disabled:opacity-50" disabled={submitting}>
            {submitting ? 'Saving…' : editing ? 'Save Changes' : 'Add Movement'}
          </button>
        </div>
      </form>
    </FormModal>
  );
}
