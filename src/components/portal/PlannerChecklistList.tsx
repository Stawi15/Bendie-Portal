'use client';

import { useState } from 'react';
import type { PlannerChecklistItemClient } from '@/components/portal/PlannerChecklistModal';

function formatDateTime(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Honest attribution — never fabricates a name (spec Rule 5). Renders nothing when the stage isn't marked. */
function StageCell({ isSet, at, byName, onChange, disabled }: { isSet: boolean; at: string | null; byName: string | null; onChange: (next: boolean) => void; disabled: boolean }) {
  const when = formatDateTime(at);
  return (
    <div className="flex flex-col gap-0.5">
      <label className="flex items-center gap-1.5 text-xs text-on-surface-variant">
        <input type="checkbox" className="w-4 h-4 accent-primary rounded" checked={isSet} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        {isSet ? 'Yes' : 'No'}
      </label>
      {isSet && when && <span className="text-[10px] text-on-surface-variant/70">{when}{byName ? ` · ${byName}` : ''}</span>}
    </div>
  );
}

type PlannerChecklistListProps = {
  items: PlannerChecklistItemClient[];
  canManage: boolean;
  busyItemId: number | null;
  onToggleStage: (item: PlannerChecklistItemClient, stage: 'isSourced' | 'isOnSite', next: boolean) => void;
  onSaveNotes: (item: PlannerChecklistItemClient, notes: string) => Promise<boolean>;
  onDelete: (item: PlannerChecklistItemClient) => void;
  onAdd?: () => void;
  onImportCsv?: () => void;
};

/**
 * Presentational checklist table, mirroring `PlannerVendorList.tsx`'s
 * established shape. `isSourced`/`isOnSite` are independent toggles with no
 * cascade between them (spec Rule 2 — verified, no ordering trigger exists
 * for this table) — deliberately no cascade UI logic here, unlike Vendors'
 * three-stage lifecycle. Category/item name/quantity/specification/sort
 * order/owner/day number/event-day date have no edit affordance anywhere in
 * this component (spec Rule 3/4) — only Sourced, On-site, notes, and delete
 * are ever mutable here. `items` passed in are already scoped correctly
 * server-side (full list for a Manager, owned-only for a Viewer — spec Rule 1).
 */
export function PlannerChecklistList({ items, canManage, busyItemId, onToggleStage, onSaveNotes, onDelete, onAdd, onImportCsv }: PlannerChecklistListProps) {
  const [notesDrafts, setNotesDrafts] = useState<Record<number, string>>({});

  const getNotesDraft = (item: PlannerChecklistItemClient) => notesDrafts[item.id] ?? item.notes ?? '';
  const isNotesDirty = (item: PlannerChecklistItemClient) => getNotesDraft(item) !== (item.notes ?? '');
  const setNotesDraft = (item: PlannerChecklistItemClient, value: string) => setNotesDrafts((prev) => ({ ...prev, [item.id]: value }));
  const discardNotesDraft = (item: PlannerChecklistItemClient) =>
    setNotesDrafts((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-[20px] border border-[#E4EAF0] panel-shadow text-center py-16 px-6">
        <p className="text-on-surface-variant text-sm">No checklist items yet for this event.</p>
        {canManage && (onAdd || onImportCsv) && (
          <>
            <p className="text-on-surface-variant/70 text-xs mt-1">Add items one at a time, or import several using the CSV template.</p>
            <div className="flex items-center justify-center gap-2 mt-4">
              {onImportCsv && (
                <button className="btn-secondary" onClick={onImportCsv}>
                  Import CSV
                </button>
              )}
              {onAdd && (
                <button className="btn-primary" onClick={onAdd}>
                  Add Checklist Item
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
            <th className="px-4 sm:px-lg py-4 font-label-md text-label-md text-on-surface-variant">Item</th>
            <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant hidden sm:table-cell">Quantity / Spec</th>
            <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant hidden md:table-cell">Day</th>
            <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant hidden md:table-cell">Owner</th>
            <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant">Sourced</th>
            <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant">On-site</th>
            <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant hidden lg:table-cell">Notes</th>
            {canManage && <th className="px-4 sm:px-lg py-4 font-label-md text-label-md text-on-surface-variant text-right">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/30">
          {items.map((item) => {
            const isBusy = busyItemId === item.id;
            return (
              <tr key={item.id} className="hover:bg-surface-container-low/20 transition-colors align-top">
                <td className="px-4 sm:px-lg py-4">
                  <p className="font-label-md text-label-md text-on-surface">{item.itemName}</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">{item.category}</p>
                </td>
                <td className="px-6 py-4 hidden sm:table-cell text-body-sm font-body-sm text-on-surface-variant">
                  {[item.quantityText, item.specification].filter(Boolean).join(' · ') || '—'}
                </td>
                <td className="px-6 py-4 hidden md:table-cell text-body-sm font-body-sm text-on-surface-variant">
                  {item.dayNumber ? `Day ${item.dayNumber}` : item.eventDayDate ? item.eventDayDate : '—'}
                </td>
                <td className="px-6 py-4 hidden md:table-cell text-body-sm font-body-sm text-on-surface-variant">{item.ownerName ?? '—'}</td>
                <td className="px-6 py-4">
                  <StageCell isSet={item.isSourced} at={item.sourcedAt} byName={item.sourcedByName} disabled={!canManage || isBusy} onChange={(next) => onToggleStage(item, 'isSourced', next)} />
                </td>
                <td className="px-6 py-4">
                  <StageCell isSet={item.isOnSite} at={item.onSiteAt} byName={item.onSiteByName} disabled={!canManage || isBusy} onChange={(next) => onToggleStage(item, 'isOnSite', next)} />
                </td>
                <td className="px-6 py-4 hidden lg:table-cell min-w-[180px]">
                  {canManage ? (
                    <div className="flex flex-col gap-1.5">
                      <textarea
                        className="input !py-1 text-xs"
                        rows={2}
                        value={getNotesDraft(item)}
                        disabled={isBusy}
                        onChange={(e) => setNotesDraft(item, e.target.value)}
                      />
                      {isNotesDirty(item) && (
                        <div className="flex gap-1.5">
                          <button
                            className="btn-primary text-xs py-1"
                            disabled={isBusy}
                            onClick={async () => {
                              const succeeded = await onSaveNotes(item, getNotesDraft(item));
                              if (succeeded) discardNotesDraft(item);
                            }}
                          >
                            Save
                          </button>
                          <button className="btn-secondary text-xs py-1" disabled={isBusy} onClick={() => discardNotesDraft(item)}>
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-body-sm font-body-sm text-on-surface-variant">{item.notes || '—'}</span>
                  )}
                </td>
                {canManage && (
                  <td className="px-4 sm:px-lg py-4 text-right">
                    <button className="btn-danger text-xs py-1.5" onClick={() => onDelete(item)} disabled={isBusy}>
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
