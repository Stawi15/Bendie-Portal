'use client';

import { useEffect, useState } from 'react';
import { FormModal } from '@/components/portal/FormModal';

export type PlannerFlightClient = {
  id: number;
  passengerId: number;
  passengerName: string;
  flightType: string | null;
  flightCode: string | null;
  region: string | null;
  flightDate: string | null;
  departureTime: string | null;
  arrivalTime: string | null;
  stops: string | null;
  notes: string | null;
  marked: boolean;
  createdAt: string;
};

export type ParticipantOption = { id: number; name: string; email?: string | null };

export type PlannerFlightFormValues = {
  passengerId: string;
  flightType: 'arrival' | 'departure';
  flightCode: string;
  region: string;
  flightDate: string;
  departureTime: string;
  arrivalTime: string;
  stops: string;
  notes: string;
};

const EMPTY_VALUES: PlannerFlightFormValues = {
  passengerId: '',
  flightType: 'arrival',
  flightCode: '',
  region: '',
  flightDate: '',
  departureTime: '',
  arrivalTime: '',
  stops: '',
  notes: '',
};

function flightToValues(f: PlannerFlightClient): PlannerFlightFormValues {
  return {
    passengerId: String(f.passengerId),
    flightType: f.flightType === 'departure' ? 'departure' : 'arrival',
    flightCode: f.flightCode ?? '',
    region: f.region ?? '',
    flightDate: f.flightDate ?? '',
    departureTime: (f.departureTime ?? '').slice(0, 5),
    arrivalTime: (f.arrivalTime ?? '').slice(0, 5),
    stops: f.stops ?? '',
    notes: f.notes ?? '',
  };
}

type PlannerFlightModalProps = {
  open: boolean;
  editing: PlannerFlightClient | null;
  participants: ParticipantOption[];
  submitting: boolean;
  serverError: { category: string; message: string } | null;
  onClose: () => void;
  onSubmit: (values: PlannerFlightFormValues, keepOpen: boolean) => void;
  /** Portal UX continuation (016) — the last-saved participant, carried into a fresh "Save & Add Another" form (context preservation: adding Jane's Departure leg right after her Arrival leg shouldn't require reselecting her). Never used in edit mode. */
  presetParticipantId?: string;
};

/**
 * Feature 012 — create/edit form. The participant `<select>` is disabled in
 * edit mode (`passengerId` is immutable after creation, spec.md) and the
 * empty-roster case links the operator to the People tab rather than
 * allowing a disconnected record (spec.md §10/§15).
 */
export function PlannerFlightModal({ open, editing, participants, submitting, serverError, onClose, onSubmit, presetParticipantId }: PlannerFlightModalProps) {
  const [values, setValues] = useState<PlannerFlightFormValues>(EMPTY_VALUES);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValues(editing ? flightToValues(editing) : { ...EMPTY_VALUES, passengerId: presetParticipantId ?? '' });
    setValidationError(null);
  }, [open, editing, presetParticipantId]);

  const handleSubmit = (e: React.SyntheticEvent, keepOpen: boolean) => {
    e.preventDefault();
    if (!editing && !values.passengerId) {
      setValidationError('Select a participant.');
      return;
    }
    if (!values.flightDate) {
      setValidationError('Flight date is required.');
      return;
    }
    setValidationError(null);
    onSubmit(values, keepOpen);
  };

  return (
    <FormModal open={open} onClose={onClose} title={editing ? 'Edit Flight' : 'Add Flight'} maxWidthClassName="max-w-lg">
      {!editing && participants.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-on-surface-variant mb-3">No participants have been added to this event yet.</p>
          <p className="text-xs text-on-surface-variant">Add a participant on the People tab first, then assign their flight here.</p>
        </div>
      ) : (
        <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-4">
          <div>
            <label className="label">Participant</label>
            <select
              className="input"
              value={values.passengerId}
              onChange={(e) => setValues((prev) => ({ ...prev, passengerId: e.target.value }))}
              disabled={submitting || !!editing}
            >
              <option value="">Select a participant…</option>
              {participants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Leg</label>
            <select className="input" value={values.flightType} onChange={(e) => setValues((prev) => ({ ...prev, flightType: e.target.value as 'arrival' | 'departure' }))} disabled={submitting}>
              <option value="arrival">Arrival (inbound)</option>
              <option value="departure">Departure (outbound)</option>
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Flight Code</label>
              <input className="input" value={values.flightCode} onChange={(e) => setValues((prev) => ({ ...prev, flightCode: e.target.value }))} placeholder="BA065" disabled={submitting} />
            </div>
            <div>
              <label className="label">Region/Route</label>
              <input className="input" value={values.region} onChange={(e) => setValues((prev) => ({ ...prev, region: e.target.value }))} disabled={submitting} />
            </div>
          </div>
          <div>
            <label className="label">Flight Date</label>
            <input type="date" className="input" value={values.flightDate} onChange={(e) => setValues((prev) => ({ ...prev, flightDate: e.target.value }))} disabled={submitting} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Departure Time</label>
              <input type="time" className="input" value={values.departureTime} onChange={(e) => setValues((prev) => ({ ...prev, departureTime: e.target.value }))} disabled={submitting} />
            </div>
            <div>
              <label className="label">Arrival Time</label>
              <input type="time" className="input" value={values.arrivalTime} onChange={(e) => setValues((prev) => ({ ...prev, arrivalTime: e.target.value }))} disabled={submitting} />
            </div>
          </div>
          <div>
            <label className="label">Stops</label>
            <input className="input" value={values.stops} onChange={(e) => setValues((prev) => ({ ...prev, stops: e.target.value }))} placeholder="Direct" disabled={submitting} />
          </div>
          <div>
            <label className="label">Notes</label>
            <textarea className="input" rows={2} value={values.notes} onChange={(e) => setValues((prev) => ({ ...prev, notes: e.target.value }))} disabled={submitting} />
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
              {submitting ? 'Saving…' : editing ? 'Save Changes' : 'Add Flight'}
            </button>
          </div>
        </form>
      )}
    </FormModal>
  );
}
