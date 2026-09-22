'use client';

import { useEffect, useState } from 'react';
import { FormModal } from '@/components/portal/FormModal';

export type PlannerVehicleClient = {
  id: number;
  movementId: number;
  date: string;
  route: string;
  pickupTime: string | null;
  endTime: string | null;
  vehicleType: string;
  vehicleNo: number;
  maxCapacity: number;
  status: string | null;
  notes: string | null;
  occupancy: number;
  assignments: unknown[];
};

export type PlannerVehicleFormValues = {
  vehicleType: string;
  vehicleNo: string;
  maxCapacity: string;
  date: string;
  route: string;
  pickupTime: string;
  endTime: string;
  status: string;
  notes: string;
};

const EMPTY_VALUES: PlannerVehicleFormValues = { vehicleType: '', vehicleNo: '', maxCapacity: '', date: '', route: '', pickupTime: '', endTime: '', status: '', notes: '' };

function vehicleToValues(v: PlannerVehicleClient): PlannerVehicleFormValues {
  return {
    vehicleType: v.vehicleType,
    vehicleNo: String(v.vehicleNo),
    maxCapacity: String(v.maxCapacity),
    date: v.date,
    route: v.route,
    pickupTime: (v.pickupTime ?? '').slice(0, 5),
    endTime: (v.endTime ?? '').slice(0, 5),
    status: v.status ?? '',
    notes: v.notes ?? '',
  };
}

type PlannerVehicleModalProps = {
  open: boolean;
  editing: PlannerVehicleClient | null;
  submitting: boolean;
  serverError: { category: string; message: string } | null;
  onClose: () => void;
  onSubmit: (values: PlannerVehicleFormValues) => void;
};

/** Feature 013 — create/edit a Vehicle under a Movement. No driver field anywhere — no canonical driver model exists (spec.md Exclusions). */
export function PlannerVehicleModal({ open, editing, submitting, serverError, onClose, onSubmit }: PlannerVehicleModalProps) {
  const [values, setValues] = useState<PlannerVehicleFormValues>(EMPTY_VALUES);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValues(editing ? vehicleToValues(editing) : EMPTY_VALUES);
    setValidationError(null);
  }, [open, editing]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.vehicleType.trim() || !values.vehicleNo || !values.maxCapacity || !values.date || !values.route.trim()) {
      setValidationError('Vehicle type, number, max capacity, date, and route are required.');
      return;
    }
    setValidationError(null);
    onSubmit(values);
  };

  return (
    <FormModal open={open} onClose={onClose} title={editing ? 'Edit Vehicle' : 'Add Vehicle'} maxWidthClassName="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Vehicle Type</label>
            <input className="input" value={values.vehicleType} onChange={(e) => setValues((prev) => ({ ...prev, vehicleType: e.target.value }))} placeholder="Van / Sedan / Bus" disabled={submitting} autoFocus />
          </div>
          <div>
            <label className="label">Vehicle No.</label>
            <input type="number" className="input" value={values.vehicleNo} onChange={(e) => setValues((prev) => ({ ...prev, vehicleNo: e.target.value }))} disabled={submitting} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Max Capacity</label>
            <input type="number" className="input" value={values.maxCapacity} onChange={(e) => setValues((prev) => ({ ...prev, maxCapacity: e.target.value }))} disabled={submitting} />
          </div>
          <div>
            <label className="label">Status</label>
            <input className="input" value={values.status} onChange={(e) => setValues((prev) => ({ ...prev, status: e.target.value }))} placeholder="Active" disabled={submitting} />
          </div>
        </div>
        <div>
          <label className="label">Route</label>
          <input className="input" value={values.route} onChange={(e) => setValues((prev) => ({ ...prev, route: e.target.value }))} disabled={submitting} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" value={values.date} onChange={(e) => setValues((prev) => ({ ...prev, date: e.target.value }))} disabled={submitting} />
          </div>
          <div>
            <label className="label">Pickup Time</label>
            <input type="time" className="input" value={values.pickupTime} onChange={(e) => setValues((prev) => ({ ...prev, pickupTime: e.target.value }))} disabled={submitting} />
          </div>
          <div>
            <label className="label">End Time</label>
            <input type="time" className="input" value={values.endTime} onChange={(e) => setValues((prev) => ({ ...prev, endTime: e.target.value }))} disabled={submitting} />
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
            {submitting ? 'Saving…' : editing ? 'Save Changes' : 'Add Vehicle'}
          </button>
        </div>
      </form>
    </FormModal>
  );
}
