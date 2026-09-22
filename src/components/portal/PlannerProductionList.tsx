'use client';

import type { PlannerProductionSessionClient } from '@/components/portal/PlannerProductionModal';

type PlannerProductionListProps = {
  sessions: PlannerProductionSessionClient[];
  canManage: boolean;
  busyId: number | null;
  onEdit: (session: PlannerProductionSessionClient) => void;
  onDelete: (session: PlannerProductionSessionClient) => void;
  onAdd?: () => void;
  onImportCsv?: () => void;
};

function statusBadgeClass(status: string | null): string {
  const lower = (status ?? '').toLowerCase();
  if (lower === 'active') return 'bg-emerald-50 text-emerald-700';
  if (lower === 'completed') return 'bg-slate-100 text-slate-600';
  return 'bg-amber-50 text-amber-700';
}

/** Presentational Production schedule table, grouped visually by date (sessions arrive pre-sorted by date then sort order from the server). */
export function PlannerProductionList({ sessions, canManage, busyId, onEdit, onDelete, onAdd, onImportCsv }: PlannerProductionListProps) {
  if (sessions.length === 0) {
    return (
      <div className="bg-white rounded-[20px] border border-[#E4EAF0] panel-shadow text-center py-16 px-6">
        <p className="text-on-surface-variant text-sm">No production sessions added to this event yet.</p>
        {canManage && (onAdd || onImportCsv) && (
          <>
            <p className="text-on-surface-variant/70 text-xs mt-1">Add sessions one at a time, or import several using the CSV template.</p>
            <div className="flex items-center justify-center gap-2 mt-4">
              {onImportCsv && (
                <button className="btn-secondary" onClick={onImportCsv}>
                  Import CSV
                </button>
              )}
              {onAdd && (
                <button className="btn-primary" onClick={onAdd}>
                  Add Session
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
            <th className="px-4 sm:px-lg py-4 font-label-md text-label-md text-on-surface-variant">Session</th>
            <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant hidden sm:table-cell">Date / Time</th>
            <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant hidden md:table-cell">Type</th>
            <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant hidden md:table-cell">Track / Room</th>
            <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant">Status</th>
            {canManage && <th className="px-4 sm:px-lg py-4 font-label-md text-label-md text-on-surface-variant text-right">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/30">
          {sessions.map((s) => {
            const isBusy = busyId === s.id;
            return (
              <tr key={s.id} className="hover:bg-surface-container-low/20 transition-colors align-top">
                <td className="px-4 sm:px-lg py-4">
                  <p className="font-label-md text-label-md text-on-surface">
                    {s.sessionTitle}
                    {s.isParallel && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700 align-middle">Parallel</span>}
                  </p>
                  {s.dayNumber !== null && <p className="text-xs text-on-surface-variant mt-0.5">Day {s.dayNumber}</p>}
                </td>
                <td className="px-6 py-4 hidden sm:table-cell text-body-sm font-body-sm text-on-surface-variant">
                  {s.sessionDate}
                  {s.startTime && <span> · {s.startTime.slice(0, 5)}</span>}
                  {s.endTime && <span>–{s.endTime.slice(0, 5)}</span>}
                </td>
                <td className="px-6 py-4 hidden md:table-cell text-body-sm font-body-sm text-on-surface-variant">{s.taskType ?? '—'}</td>
                <td className="px-6 py-4 hidden md:table-cell text-body-sm font-body-sm text-on-surface-variant">
                  {[s.trackName, s.roomName].filter(Boolean).join(' · ') || '—'}
                </td>
                <td className="px-6 py-4">
                  <span className={`text-xs px-2 py-1 rounded-full ${statusBadgeClass(s.displayStatus)}`}>{s.displayStatus ?? '—'}</span>
                </td>
                {canManage && (
                  <td className="px-4 sm:px-lg py-4 text-right space-x-2 whitespace-nowrap">
                    <button className="btn-secondary text-xs py-1.5" onClick={() => onEdit(s)} disabled={isBusy}>
                      Edit
                    </button>
                    <button className="btn-danger text-xs py-1.5" onClick={() => onDelete(s)} disabled={isBusy}>
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
