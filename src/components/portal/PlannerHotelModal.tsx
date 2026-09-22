'use client';

import { useEffect, useState } from 'react';
import { FormModal } from '@/components/portal/FormModal';
import type { ParticipantOption } from '@/components/portal/PlannerFlightModal';

export type PlannerHotelBookingClient = {
  id: number;
  passengerId: number;
  passengerName: string;
  country: string | null;
  hotelName: string | null;
  roomNumber: number | null;
  roomingLabel: string | null;
  accommodationRequired: boolean;
  checkInDate: string | null;
  checkOutDate: string | null;
  nightsCount: number | null;
  specialStayPattern: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PlannerHotelFormValues = {
  passengerId: string;
  country: string;
  hotelName: string;
  roomNumber: string;
  roomingLabel: string;
  accommodationRequired: boolean;
  checkInDate: string;
  checkOutDate: string;
  nightsCount: string;
  specialStayPattern: string;
  notes: string;
};

const EMPTY_VALUES: PlannerHotelFormValues = {
  passengerId: '',
  country: '',
  hotelName: '',
  roomNumber: '',
  roomingLabel: '',
  accommodationRequired: true,
  checkInDate: '',
  checkOutDate: '',
  nightsCount: '',
  specialStayPattern: '',
  notes: '',
};

function bookingToValues(b: PlannerHotelBookingClient): PlannerHotelFormValues {
  return {
    passengerId: String(b.passengerId),
    country: b.country ?? '',
    hotelName: b.hotelName ?? '',
    roomNumber: b.roomNumber !== null ? String(b.roomNumber) : '',
    roomingLabel: b.roomingLabel ?? '',
    accommodationRequired: b.accommodationRequired,
    checkInDate: b.checkInDate ?? '',
    checkOutDate: b.checkOutDate ?? '',
    nightsCount: b.nightsCount !== null ? String(b.nightsCount) : '',
    specialStayPattern: b.specialStayPattern ?? '',
    notes: b.notes ?? '',
  };
}

function computeNights(checkIn: string, checkOut: string): number | null {
  if (!checkIn || !checkOut) return null;
  const diff = (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / (1000 * 60 * 60 * 24);
  return Number.isFinite(diff) && diff >= 0 ? Math.round(diff) : null;
}

type PlannerHotelModalProps = {
  open: boolean;
  editing: PlannerHotelBookingClient | null;
  participants: ParticipantOption[];
  submitting: boolean;
  serverError: { category: string; message: string } | null;
  onClose: () => void;
  onSubmit: (values: PlannerHotelFormValues, keepOpen: boolean) => void;
  /** Portal UX continuation (016) — the last-saved participant, carried into a fresh "Save & Add Another" form. Never used in edit mode. */
  presetParticipantId?: string;
};

/**
 * Feature 012 — create/edit form. `nightsCount` is pre-filled as a
 * client-side convenience from the two dates whenever the operator hasn't
 * already typed a value themselves — never silently overwritten once set
 * (spec.md Verified Business Rule 6: never server-recomputed, and here never
 * force-overwritten client-side either).
 */
export function PlannerHotelModal({ open, editing, participants, submitting, serverError, onClose, onSubmit, presetParticipantId }: PlannerHotelModalProps) {
  const [values, setValues] = useState<PlannerHotelFormValues>(EMPTY_VALUES);
  const [nightsTouched, setNightsTouched] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setValues(editing ? bookingToValues(editing) : { ...EMPTY_VALUES, passengerId: presetParticipantId ?? '' });
    setNightsTouched(!!editing);
    setValidationError(null);
  }, [open, editing, presetParticipantId]);

  const handleDateChange = (field: 'checkInDate' | 'checkOutDate', value: string) => {
    setValues((prev) => {
      const next = { ...prev, [field]: value };
      if (!nightsTouched) {
        const nights = computeNights(next.checkInDate, next.checkOutDate);
        if (nights !== null) next.nightsCount = String(nights);
      }
      return next;
    });
  };

  const handleSubmit = (e: React.SyntheticEvent, keepOpen: boolean) => {
    e.preventDefault();
    if (!editing && !values.passengerId) {
      setValidationError('Select a participant.');
      return;
    }
    setValidationError(null);
    onSubmit(values, keepOpen);
  };

  return (
    <FormModal open={open} onClose={onClose} title={editing ? 'Edit Hotel Booking' : 'Add Hotel Booking'} maxWidthClassName="max-w-lg">
      {!editing && participants.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-on-surface-variant mb-3">No participants have been added to this event yet.</p>
          <p className="text-xs text-on-surface-variant">Add a participant on the People tab first, then assign their accommodation here.</p>
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
          <label className="flex items-center gap-2 text-sm text-on-surface">
            <input
              type="checkbox"
              className="w-4 h-4 accent-primary rounded"
              checked={values.accommodationRequired}
              onChange={(e) => setValues((prev) => ({ ...prev, accommodationRequired: e.target.checked }))}
              disabled={submitting}
            />
            Accommodation required
          </label>

          {values.accommodationRequired && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Hotel Name</label>
                  <input className="input" value={values.hotelName} onChange={(e) => setValues((prev) => ({ ...prev, hotelName: e.target.value }))} disabled={submitting} />
                </div>
                <div>
                  <label className="label">Country</label>
                  <input className="input" value={values.country} onChange={(e) => setValues((prev) => ({ ...prev, country: e.target.value }))} disabled={submitting} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Room Number</label>
                  <input
                    type="number"
                    className="input"
                    value={values.roomNumber}
                    onChange={(e) => setValues((prev) => ({ ...prev, roomNumber: e.target.value }))}
                    disabled={submitting}
                  />
                </div>
                <div>
                  <label className="label">Rooming Label</label>
                  <input
                    className="input"
                    value={values.roomingLabel}
                    onChange={(e) => setValues((prev) => ({ ...prev, roomingLabel: e.target.value }))}
                    placeholder="Planning group / pairing label"
                    disabled={submitting}
                  />
                </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Check-in</label>
              <input type="date" className="input" value={values.checkInDate} onChange={(e) => handleDateChange('checkInDate', e.target.value)} disabled={submitting} />
            </div>
            <div>
              <label className="label">Check-out</label>
              <input type="date" className="input" value={values.checkOutDate} onChange={(e) => handleDateChange('checkOutDate', e.target.value)} disabled={submitting} />
            </div>
          </div>
          <div>
            <label className="label">Nights</label>
            <input
              type="number"
              className="input"
              value={values.nightsCount}
              onChange={(e) => {
                setNightsTouched(true);
                setValues((prev) => ({ ...prev, nightsCount: e.target.value }));
              }}
              disabled={submitting}
            />
          </div>
          <div>
            <label className="label">Special Stay Pattern</label>
            <input
              className="input"
              value={values.specialStayPattern}
              onChange={(e) => setValues((prev) => ({ ...prev, specialStayPattern: e.target.value }))}
              placeholder="e.g. Early check-in"
              disabled={submitting}
            />
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
              {submitting ? 'Saving…' : editing ? 'Save Changes' : 'Add Booking'}
            </button>
          </div>
        </form>
      )}
    </FormModal>
  );
}
