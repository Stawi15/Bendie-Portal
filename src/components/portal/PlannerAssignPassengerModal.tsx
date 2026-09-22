'use client';

import { useEffect, useState } from 'react';
import { FormModal } from '@/components/portal/FormModal';
import type { ParticipantOption } from '@/components/portal/PlannerFlightModal';

export type VehicleOption = { id: number; label: string };

/** Portal UX continuation (016) — assign mode now accepts multiple participants in one action. The server/data layer still calls the existing canonical `assign_or_board_passenger` RPC once per passenger (never a bulk RPC, never bypassed) — see `handleAssignSubmit` in the page, which reports partial failure honestly rather than claiming atomicity. */
type AssignModeProps = { mode: 'assign'; vehicleLabel: string; participants: ParticipantOption[]; onSubmit: (passengerIds: number[]) => void };
type MoveModeProps = { mode: 'move'; passengerName: string; destinationVehicles: VehicleOption[]; onSubmit: (toVehicleId: number) => void };

type PlannerAssignPassengerModalProps = {
  open: boolean;
  submitting: boolean;
  serverError: { category: string; message: string } | null;
  /** Assign mode only — set after a partial multi-assign failure so the failed names stay visible instead of a generic error. */
  partialFailures?: string[];
  onClose: () => void;
} & (AssignModeProps | MoveModeProps);

/**
 * Feature 013 — assigns one or more current-event participants to a vehicle
 * (`mode: 'assign'`, multi-select), or moves an already-assigned passenger to
 * a different vehicle within the same movement (`mode: 'move'`, always a
 * single destination — moving one passenger to several vehicles at once
 * isn't a meaningful operation). No Flight-leg picker in this rapid pass —
 * the optional `passenger_record_id` link is deferred (spec.md treats it as
 * optional enrichment, not required for the module to work).
 */
export function PlannerAssignPassengerModal(props: PlannerAssignPassengerModalProps) {
  const { open, submitting, serverError, onClose, partialFailures } = props;
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [singleSelectedId, setSingleSelectedId] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelectedIds(new Set());
    setSingleSelectedId('');
    setValidationError(null);
  }, [open]);

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (props.mode === 'assign') {
      if (selectedIds.size === 0) {
        setValidationError('Select at least one participant.');
        return;
      }
      setValidationError(null);
      props.onSubmit(Array.from(selectedIds));
    } else {
      if (!singleSelectedId) {
        setValidationError('Select a destination vehicle.');
        return;
      }
      setValidationError(null);
      props.onSubmit(Number(singleSelectedId));
    }
  };

  const title = props.mode === 'assign' ? `Assign to ${props.vehicleLabel}` : `Move ${props.passengerName}`;
  const emptyMessage = props.mode === 'assign' ? 'No participants have been added to this event yet.' : 'No other vehicles available in this movement.';

  return (
    <FormModal open={open} onClose={onClose} title={title} maxWidthClassName="max-w-md">
      {props.mode === 'assign' ? (
        props.participants.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-on-surface-variant">{emptyMessage}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Participants ({selectedIds.size} selected)</label>
              <div className="max-h-64 overflow-y-auto border border-outline-variant/50 rounded-xl divide-y divide-outline-variant/30">
                {props.participants.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 px-3 py-2 text-sm text-on-surface cursor-pointer hover:bg-surface-container-low">
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-primary rounded"
                      checked={selectedIds.has(p.id)}
                      onChange={() => toggleSelected(p.id)}
                      disabled={submitting}
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>

            {partialFailures && partialFailures.length > 0 && (
              <p className="text-sm text-error">Could not assign: {partialFailures.join(', ')}. The rest were assigned successfully — unselect them and retry the ones above.</p>
            )}
            {(validationError || serverError) && <p className="text-sm text-error">{validationError ?? serverError?.message}</p>}

            <div className="flex items-center justify-end gap-2 pt-2">
              <button type="button" onClick={onClose} className="btn-secondary" disabled={submitting}>
                Cancel
              </button>
              <button type="submit" className="btn-primary disabled:opacity-50" disabled={submitting}>
                {submitting ? 'Assigning…' : selectedIds.size > 1 ? `Assign ${selectedIds.size} Participants` : 'Assign'}
              </button>
            </div>
          </form>
        )
      ) : props.destinationVehicles.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-on-surface-variant">{emptyMessage}</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Destination Vehicle</label>
            <select className="input" value={singleSelectedId} onChange={(e) => setSingleSelectedId(e.target.value)} disabled={submitting} autoFocus>
              <option value="">Select a vehicle…</option>
              {props.destinationVehicles.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {(validationError || serverError) && <p className="text-sm text-error">{validationError ?? serverError?.message}</p>}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary" disabled={submitting}>
              Cancel
            </button>
            <button type="submit" className="btn-primary disabled:opacity-50" disabled={submitting}>
              {submitting ? 'Saving…' : 'Move'}
            </button>
          </div>
        </form>
      )}
    </FormModal>
  );
}
