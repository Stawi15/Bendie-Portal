'use client';

import type { PlannerFlightClient } from '@/components/portal/PlannerFlightModal';

type PlannerFlightListProps = {
  flights: PlannerFlightClient[];
  canManage: boolean;
  busyId: number | null;
  onEdit: (flight: PlannerFlightClient) => void;
  onDelete: (flight: PlannerFlightClient) => void;
  onToggleMarked: (flight: PlannerFlightClient, next: boolean) => void;
  onAdd?: () => void;
  onImportCsv?: () => void;
};

function formatLegLabel(flightType: string | null): string {
  if (!flightType) return '—';
  const lower = flightType.toLowerCase();
  if (lower === 'arrival' || lower === 'inbound') return 'Arrival';
  if (lower === 'departure') return 'Departure';
  return flightType;
}

/** Presentational Flights table. One row per passenger-leg (spec.md — arrival/departure are separate rows, never merged). */
export function PlannerFlightList({ flights, canManage, busyId, onEdit, onDelete, onToggleMarked, onAdd, onImportCsv }: PlannerFlightListProps) {
  if (flights.length === 0) {
    return (
      <div className="bg-white rounded-[20px] border border-[#E4EAF0] panel-shadow text-center py-16 px-6">
        <p className="text-on-surface-variant text-sm">No flights added to this event yet.</p>
        {canManage && (onAdd || onImportCsv) && (
          <>
            <p className="text-on-surface-variant/70 text-xs mt-1">Add flights one at a time, or import several using the CSV template.</p>
            <div className="flex items-center justify-center gap-2 mt-4">
              {onImportCsv && (
                <button className="btn-secondary" onClick={onImportCsv}>
                  Import CSV
                </button>
              )}
              {onAdd && (
                <button className="btn-primary" onClick={onAdd}>
                  Add Flight
                </button>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[20px] border border-[#E4EAF0] panel-shadow overflow-x-auto">
      <table className="w-full text-left">
        <thead className="bg-surface-container-low/50">
          <tr>
            <th className="px-4 sm:px-lg py-4 font-label-md text-label-md text-on-surface-variant">Participant</th>
            <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant">Leg</th>
            <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant hidden sm:table-cell">Flight</th>
            <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant hidden md:table-cell">Date</th>
            <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant hidden md:table-cell">Depart / Arrive</th>
            <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant">Confirmed</th>
            {canManage && <th className="px-4 sm:px-lg py-4 font-label-md text-label-md text-on-surface-variant text-right">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/30">
          {flights.map((f) => {
            const isBusy = busyId === f.id;
            return (
              <tr key={f.id} className="hover:bg-surface-container-low/20 transition-colors align-top">
                <td className="px-4 sm:px-lg py-4 font-label-md text-label-md text-on-surface">{f.passengerName}</td>
                <td className="px-6 py-4 text-body-sm font-body-sm text-on-surface-variant">{formatLegLabel(f.flightType)}</td>
                <td className="px-6 py-4 hidden sm:table-cell text-body-sm font-body-sm text-on-surface-variant">{[f.flightCode, f.region].filter(Boolean).join(' · ') || '—'}</td>
                <td className="px-6 py-4 hidden md:table-cell text-body-sm font-body-sm text-on-surface-variant">{f.flightDate ?? '—'}</td>
                <td className="px-6 py-4 hidden md:table-cell text-body-sm font-body-sm text-on-surface-variant">
                  {[f.departureTime?.slice(0, 5), f.arrivalTime?.slice(0, 5)].filter(Boolean).join(' → ') || '—'}
                </td>
                <td className="px-6 py-4">
                  <input type="checkbox" className="w-4 h-4 accent-primary rounded" checked={f.marked} disabled={!canManage || isBusy} onChange={(e) => onToggleMarked(f, e.target.checked)} />
                </td>
                {canManage && (
                  <td className="px-4 sm:px-lg py-4 text-right space-x-2 whitespace-nowrap">
                    <button className="btn-secondary text-xs py-1.5" onClick={() => onEdit(f)} disabled={isBusy}>
                      Edit
                    </button>
                    <button className="btn-danger text-xs py-1.5" onClick={() => onDelete(f)} disabled={isBusy}>
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
