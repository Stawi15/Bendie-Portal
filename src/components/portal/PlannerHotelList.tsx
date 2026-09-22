'use client';

import type { PlannerHotelBookingClient } from '@/components/portal/PlannerHotelModal';

type PlannerHotelListProps = {
  bookings: PlannerHotelBookingClient[];
  canManage: boolean;
  busyId: number | null;
  onEdit: (booking: PlannerHotelBookingClient) => void;
  onDelete: (booking: PlannerHotelBookingClient) => void;
  onAdd?: () => void;
  onImportCsv?: () => void;
};

/** Presentational Hotels table. Multiple bookings per passenger are expected (spec.md), not deduplicated. */
export function PlannerHotelList({ bookings, canManage, busyId, onEdit, onDelete, onAdd, onImportCsv }: PlannerHotelListProps) {
  if (bookings.length === 0) {
    return (
      <div className="bg-white rounded-[20px] border border-[#E4EAF0] panel-shadow text-center py-16 px-6">
        <p className="text-on-surface-variant text-sm">No hotel bookings added to this event yet.</p>
        {canManage && (onAdd || onImportCsv) && (
          <>
            <p className="text-on-surface-variant/70 text-xs mt-1">Add bookings one at a time, or import several using the CSV template.</p>
            <div className="flex items-center justify-center gap-2 mt-4">
              {onImportCsv && (
                <button className="btn-secondary" onClick={onImportCsv}>
                  Import CSV
                </button>
              )}
              {onAdd && (
                <button className="btn-primary" onClick={onAdd}>
                  Add Hotel Booking
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
            <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant">Accommodation</th>
            <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant hidden sm:table-cell">Hotel / Room</th>
            <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant hidden md:table-cell">Check-in / out</th>
            <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant hidden md:table-cell">Nights</th>
            {canManage && <th className="px-4 sm:px-lg py-4 font-label-md text-label-md text-on-surface-variant text-right">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/30">
          {bookings.map((b) => {
            const isBusy = busyId === b.id;
            return (
              <tr key={b.id} className="hover:bg-surface-container-low/20 transition-colors align-top">
                <td className="px-4 sm:px-lg py-4 font-label-md text-label-md text-on-surface">{b.passengerName}</td>
                <td className="px-6 py-4 text-body-sm font-body-sm text-on-surface-variant">{b.accommodationRequired ? 'Required' : 'Not required'}</td>
                <td className="px-6 py-4 hidden sm:table-cell text-body-sm font-body-sm text-on-surface-variant">
                  {b.accommodationRequired ? [b.hotelName, b.roomNumber ? `Room ${b.roomNumber}` : null].filter(Boolean).join(' · ') || 'Pending' : '—'}
                </td>
                <td className="px-6 py-4 hidden md:table-cell text-body-sm font-body-sm text-on-surface-variant">
                  {[b.checkInDate, b.checkOutDate].filter(Boolean).join(' → ') || '—'}
                </td>
                <td className="px-6 py-4 hidden md:table-cell text-body-sm font-body-sm text-on-surface-variant">{b.nightsCount ?? '—'}</td>
                {canManage && (
                  <td className="px-4 sm:px-lg py-4 text-right space-x-2 whitespace-nowrap">
                    <button className="btn-secondary text-xs py-1.5" onClick={() => onEdit(b)} disabled={isBusy}>
                      Edit
                    </button>
                    <button className="btn-danger text-xs py-1.5" onClick={() => onDelete(b)} disabled={isBusy}>
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
