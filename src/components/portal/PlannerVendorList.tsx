'use client';

import { useState } from 'react';
import type { PlannerVendorItemClient } from '@/components/portal/PlannerVendorModal';

function formatDateTime(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Honest attribution — never fabricates a name (spec.md FR-032). Renders nothing at all when the stage isn't marked. */
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

type PlannerVendorListProps = {
  items: PlannerVendorItemClient[];
  canManage: boolean;
  busyItemId: number | null;
  onToggleStage: (item: PlannerVendorItemClient, stage: 'isPacked' | 'isLoaded' | 'isOnSite', next: boolean) => void;
  onSaveNotes: (item: PlannerVendorItemClient, notes: string) => Promise<boolean>;
  onDelete: (item: PlannerVendorItemClient) => void;
  /** Portal UX pass (016) — empty-state CTAs, manager-only, same actions already in the page header. */
  onAdd?: () => void;
  onImportCsv?: () => void;
};

/**
 * Presentational vendor-item table, mirroring `PlannerTaskList.tsx`'s
 * established shape. Management controls (`canManage`) are driven exclusively
 * by server-derived capability — never a client-side inference. Category/
 * description/quantity/unit/sort-order have no edit affordance anywhere in
 * this component (spec.md FR-038) — only lifecycle toggles, notes, and
 * delete are ever mutable here.
 */
export function PlannerVendorList({ items, canManage, busyItemId, onToggleStage, onSaveNotes, onDelete, onAdd, onImportCsv }: PlannerVendorListProps) {
  const [notesDrafts, setNotesDrafts] = useState<Record<number, string>>({});

  const getNotesDraft = (item: PlannerVendorItemClient) => notesDrafts[item.id] ?? item.notes ?? '';
  const isNotesDirty = (item: PlannerVendorItemClient) => getNotesDraft(item) !== (item.notes ?? '');
  const setNotesDraft = (item: PlannerVendorItemClient, value: string) => setNotesDrafts((prev) => ({ ...prev, [item.id]: value }));
  const discardNotesDraft = (item: PlannerVendorItemClient) =>
    setNotesDrafts((prev) => {
      const next = { ...prev };
      delete next[item.id];
      return next;
    });

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-[20px] border border-[#E4EAF0] panel-shadow text-center py-16 px-6">
        <p className="text-on-surface-variant text-sm">No vendor items yet for this event.</p>
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
                  Add Vendor Item
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
            <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant hidden sm:table-cell">Quantity</th>
            <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant">Packed</th>
            <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant">Loaded</th>
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
                  <p className="font-label-md text-label-md text-on-surface">{item.description}</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">{item.category}</p>
                </td>
                <td className="px-6 py-4 hidden sm:table-cell text-body-sm font-body-sm text-on-surface-variant">
                  {[item.quantityText, item.unit].filter(Boolean).join(' ') || '—'}
                </td>
                <td className="px-6 py-4">
                  <StageCell isSet={item.isPacked} at={item.packedAt} byName={item.packedByName} disabled={!canManage || isBusy} onChange={(next) => onToggleStage(item, 'isPacked', next)} />
                </td>
                <td className="px-6 py-4">
                  <StageCell isSet={item.isLoaded} at={item.loadedAt} byName={item.loadedByName} disabled={!canManage || isBusy} onChange={(next) => onToggleStage(item, 'isLoaded', next)} />
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
