'use client';

import type { PlannerAgendaItemClient } from '@/components/portal/PlannerAgendaModal';

type Props = {
  items: PlannerAgendaItemClient[];
  canManage: boolean;
  busyId: number | null;
  onEdit: (item: PlannerAgendaItemClient) => void;
  onDelete: (item: PlannerAgendaItemClient) => void;
  onAdd?: () => void;
  onImportCsv?: () => void;
};

function formatDay(date: string | null): string {
  if (!date) return 'No date';
  const d = new Date(`${date}T00:00:00`);
  return Number.isNaN(d.getTime()) ? date : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Feature 018 — Planner agenda grouped by date (the API already orders by date,
 * start time, sort order). Items pushed from a Bendie Agenda are read-only.
 */
export function PlannerAgendaList({ items, canManage, busyId, onEdit, onDelete, onAdd, onImportCsv }: Props) {
  if (items.length === 0) {
    return (
      <div className="bg-white rounded-[20px] border border-[#E4EAF0] panel-shadow text-center py-10 px-6">
        <p className="text-on-surface text-sm font-medium">No agenda items yet.</p>
        <p className="text-on-surface-variant text-xs mt-1">
          The agenda is the event programme your team sees in Bendie Planner — sessions, breaks, meals and who is speaking.
        </p>
        {canManage && (onAdd || onImportCsv) && (
          <div className="flex items-center justify-center gap-2 mt-4">
            {onImportCsv && (
              <button className="btn-secondary" onClick={onImportCsv}>
                Import spreadsheet
              </button>
            )}
            {onAdd && (
              <button className="btn-primary" onClick={onAdd}>
                Add item
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  const groups: { date: string | null; label: string | null; items: PlannerAgendaItemClient[] }[] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last && last.date === item.date) last.items.push(item);
    else groups.push({ date: item.date, label: item.dayLabel, items: [item] });
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <section key={g.date ?? 'none'} className="bg-white rounded-[20px] border border-[#E4EAF0] panel-shadow overflow-hidden">
          <header className="px-4 sm:px-lg py-2.5 bg-surface-container-low/50 border-b border-outline-variant/40">
            <h3 className="font-label-md text-label-md text-on-surface">
              {formatDay(g.date)}
              {g.label && <span className="text-on-surface-variant font-normal"> · {g.label}</span>}
            </h3>
          </header>
          <ul className="divide-y divide-outline-variant/30">
            {g.items.map((item) => {
              const isBusy = busyId === item.id;
              const people = [item.speakers, item.mc ? `MC: ${item.mc}` : null].filter(Boolean).join(' · ');
              return (
                <li key={item.id} className="flex items-start gap-3 px-4 sm:px-lg py-2.5">
                  <span className="w-24 flex-shrink-0 text-body-sm font-body-sm text-on-surface-variant tabular-nums pt-0.5">
                    {item.startTime ? `${item.startTime}${item.endTime ? `–${item.endTime}` : ''}` : 'Any time'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-label-md text-label-md text-on-surface">
                      {item.title}
                      {item.itemType && (
                        <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 align-middle">{item.itemType}</span>
                      )}
                    </p>
                    {item.subtitle && <p className="text-xs text-on-surface-variant mt-0.5">{item.subtitle}</p>}
                    {(people || item.roomName || item.trackName) && (
                      <p className="text-xs text-on-surface-variant mt-0.5">
                        {[people, [item.trackName, item.roomName].filter(Boolean).join(' · ')].filter(Boolean).join(' — ')}
                      </p>
                    )}
                    {item.readOnly && <p className="text-xs text-on-surface-variant/80 mt-0.5 italic">From the Bendie Agenda — edit it there.</p>}
                  </div>
                  {canManage && !item.readOnly && (
                    <div className="flex-shrink-0 space-x-1 whitespace-nowrap">
                      <button className="row-action" onClick={() => onEdit(item)} disabled={isBusy} aria-label={`Edit ${item.title}`}>
                        Edit
                      </button>
                      <button className="row-action-danger" onClick={() => onDelete(item)} disabled={isBusy} aria-label={`Delete ${item.title}`}>
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
