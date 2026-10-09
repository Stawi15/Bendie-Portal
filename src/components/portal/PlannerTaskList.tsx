'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PlannerTaskClient } from '@/components/portal/PlannerTaskModal';

const STATUS_VALUES: PlannerTaskClient['status'][] = ['Pending', 'In Progress', 'Completed'];
const PRIORITY_VALUES: PlannerTaskClient['priority'][] = ['Low', 'Medium', 'High'];

// Feature 019 (FR-003): Pending red, In Progress orange/mustard, Completed green — on the read-only
// pill and on the status picker itself, so a long list can be scanned at a glance while updating.
const STATUS_PILL_CLASSES: Record<PlannerTaskClient['status'], string> = {
  Pending: 'bg-red-100 text-red-700',
  'In Progress': 'bg-amber-100 text-amber-800',
  Completed: 'bg-green-100 text-green-700',
};

const STATUS_SELECT_CLASSES: Record<PlannerTaskClient['status'], string> = {
  Pending: '!bg-red-50 !border-red-300 text-red-700 font-semibold',
  'In Progress': '!bg-amber-50 !border-amber-400 text-amber-800 font-semibold',
  Completed: '!bg-green-50 !border-green-300 text-green-700 font-semibold',
};

const STATUS_OPTION_CLASSES: Record<PlannerTaskClient['status'], string> = {
  Pending: 'text-red-700',
  'In Progress': 'text-amber-800',
  Completed: 'text-green-700',
};

const statusOptions = () =>
  STATUS_VALUES.map((s) => (
    <option key={s} value={s} className={STATUS_OPTION_CLASSES[s]}>
      {s}
    </option>
  ));

const PRIORITY_PILL_CLASSES: Record<PlannerTaskClient['priority'], string> = {
  Low: 'bg-surface-container-high text-on-surface-variant',
  Medium: 'bg-amber-100 text-amber-700',
  High: 'bg-red-100 text-red-700',
};

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

type PlannerTaskListProps = {
  tasks: PlannerTaskClient[];
  canManage: boolean;
  callerPlannerProfileId: string | null;
  busyTaskId: number | null;
  onEdit: (task: PlannerTaskClient) => void;
  onDelete: (task: PlannerTaskClient) => void;
  /** Resolves to whether the save actually succeeded — see the draft-clearing note below. */
  onSelfAssigneeUpdate: (task: PlannerTaskClient, patch: { status?: string; remarks?: string }) => Promise<boolean>;
  /**
   * Feature 019 (FR-004/FR-005) — manager status changes are held as unsaved edits and sent together
   * by "Save changes". Resolves to an error message per task id that failed (absent = saved), so
   * saved rows clear and failed rows stay marked.
   */
  onSaveStatuses?: (changes: { task: PlannerTaskClient; status: PlannerTaskClient['status'] }[]) => Promise<Record<number, string>>;
  onAdd?: () => void;
  /** Feature 016: empty-state import action (same handler as the page header). */
  onImport?: () => void;
};

type SelfAssigneeDraft = { status: PlannerTaskClient['status']; remarks: string };

/**
 * Presentational task table (FR-035/FR-036) — reuses the existing Portal
 * table-row pattern (`EventsOverviewPanel`'s established shape). Management
 * controls (`canManage`) and the narrower self-assignee status/remarks
 * control are both driven exclusively by server-derived capability/task
 * data — never a client-side inference (T034/T035).
 */
export function PlannerTaskList({ tasks, canManage, callerPlannerProfileId, busyTaskId, onEdit, onDelete, onSelfAssigneeUpdate, onSaveStatuses, onAdd, onImport }: PlannerTaskListProps) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  // Feature 019 — unsaved manager status edits, keyed by task id. Nothing is
  // sent until "Save changes"; `tasks` (server data) stays authoritative and an
  // entry disappears once the server value matches it.
  const [pendingStatus, setPendingStatus] = useState<Record<number, PlannerTaskClient['status']>>({});
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [savingStatuses, setSavingStatuses] = useState(false);
  useEffect(() => {
    setPendingStatus((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const t of tasks) {
        if (next[t.taskId] === t.status) {
          delete next[t.taskId];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [tasks]);
  const pendingCount = Object.keys(pendingStatus).length;

  // FR-006: closing or reloading the tab with unsaved status edits asks first.
  useEffect(() => {
    if (pendingCount === 0) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pendingCount]);

  const setPending = (t: PlannerTaskClient, status: PlannerTaskClient['status']) => {
    setPendingStatus((prev) => {
      const next = { ...prev };
      if (status === t.status) delete next[t.taskId];
      else next[t.taskId] = status;
      return next;
    });
    setRowErrors((prev) => {
      if (!(t.taskId in prev)) return prev;
      const next = { ...prev };
      delete next[t.taskId];
      return next;
    });
  };

  const saveStatuses = async () => {
    if (!onSaveStatuses || pendingCount === 0) return;
    const changes = tasks.filter((t) => pendingStatus[t.taskId] !== undefined).map((t) => ({ task: t, status: pendingStatus[t.taskId] }));
    setSavingStatuses(true);
    try {
      const errors = await onSaveStatuses(changes);
      setRowErrors(errors);
      // Saved rows clear here; failed rows keep their unsaved value for a retry.
      setPendingStatus((prev) => {
        const next: Record<number, PlannerTaskClient['status']> = {};
        for (const [id, status] of Object.entries(prev)) if (Number(id) in errors) next[Number(id)] = status;
        return next;
      });
    } finally {
      setSavingStatuses(false);
    }
  };

  const discardStatuses = () => {
    setPendingStatus({});
    setRowErrors({});
  };
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  // Manual-acceptance corrective fix — self-assignee status/remarks edits are
  // held here as a local draft until the user presses Save; onChange never
  // mutates the backend directly (the defect: the status <select> used to
  // call the PATCH handler straight from its own onChange). Keyed by taskId;
  // an entry is only created once the user actually edits that row, and is
  // cleared once the server confirms the save succeeded (never optimistically,
  // never before the request settles).
  const [drafts, setDrafts] = useState<Record<number, SelfAssigneeDraft>>({});

  const getDraft = (t: PlannerTaskClient): SelfAssigneeDraft => drafts[t.taskId] ?? { status: t.status, remarks: t.remarks ?? '' };
  const isDirty = (t: PlannerTaskClient): boolean => {
    const d = getDraft(t);
    return d.status !== t.status || d.remarks !== (t.remarks ?? '');
  };
  const updateDraft = (t: PlannerTaskClient, patch: Partial<SelfAssigneeDraft>) =>
    setDrafts((prev) => ({ ...prev, [t.taskId]: { ...getDraft(t), ...patch } }));
  const discardDraft = (t: PlannerTaskClient) =>
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[t.taskId];
      return next;
    });

  const assigneeOptions = useMemo(() => {
    const seen = new Map<string, string>();
    tasks.forEach((t) => {
      if (t.assignedProfileId) seen.set(t.assignedProfileId, t.assignedProfileName ?? 'Unnamed staff member');
    });
    return Array.from(seen.entries());
  }, [tasks]);

  const filtered = tasks.filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
    if (assigneeFilter !== 'all' && t.assignedProfileId !== assigneeFilter) return false;
    return true;
  });

  return (
    <div className="bg-white rounded-[20px] border border-[#E4EAF0] panel-shadow flex flex-col">
      {canManage && onSaveStatuses && pendingCount > 0 && (
        <div
          className="sticky top-0 z-10 px-4 sm:px-lg py-2.5 border-b border-amber-200 bg-amber-50 rounded-t-[20px] flex flex-wrap items-center justify-between gap-2"
          role="status"
        >
          <p className="text-sm text-amber-900">
            <span className="font-semibold">{pendingCount}</span> unsaved status change{pendingCount === 1 ? '' : 's'}
            {Object.keys(rowErrors).length > 0 && <span className="text-red-700"> · {Object.keys(rowErrors).length} could not be saved</span>}
          </p>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={discardStatuses} disabled={savingStatuses}>
              Discard
            </button>
            <button className="btn-primary" onClick={saveStatuses} disabled={savingStatuses}>
              {savingStatuses ? 'Saving…' : `Save ${pendingCount} change${pendingCount === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      )}
      <div className="px-4 sm:px-lg py-2.5 border-b border-outline-variant flex flex-wrap gap-3 items-center">
        <select className="input !w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          {STATUS_VALUES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select className="input !w-auto" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
          <option value="all">All priorities</option>
          {PRIORITY_VALUES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select className="input !w-auto" value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)}>
          <option value="all">All assignees</option>
          {assigneeOptions.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-10 px-6">
          <p className="text-on-surface-variant text-sm">
            {tasks.length === 0 ? 'No tasks yet for this event.' : 'No tasks match the current filters.'}
          </p>
          {tasks.length === 0 && canManage && (
            <>
              <p className="text-on-surface-variant/70 text-xs mt-1">Add one manually, paste from a spreadsheet, or import a CSV.</p>
              {onAdd && (
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  <button className="btn-primary" onClick={onAdd}>
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">add</span> Add task
                  </button>
                  {onImport && (
                    <button className="btn-secondary" onClick={onImport}>
                      <span className="material-symbols-outlined text-[18px]" aria-hidden="true">upload_file</span> Import spreadsheet
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-container-low/50">
              <tr>
                <th className="px-4 sm:px-lg py-2.5 font-label-md text-label-md text-on-surface-variant">Task</th>
                <th className="px-4 py-2.5 font-label-md text-label-md text-on-surface-variant hidden sm:table-cell">Code</th>
                <th className="px-4 py-2.5 font-label-md text-label-md text-on-surface-variant">Status</th>
                <th className="px-4 py-2.5 font-label-md text-label-md text-on-surface-variant hidden md:table-cell">Priority</th>
                <th className="px-4 py-2.5 font-label-md text-label-md text-on-surface-variant hidden md:table-cell">Due</th>
                <th className="px-4 py-2.5 font-label-md text-label-md text-on-surface-variant">Assignee</th>
                <th className="px-4 sm:px-lg py-2.5 font-label-md text-label-md text-on-surface-variant text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {filtered.map((t) => {
                const isSelfAssignee = !canManage && callerPlannerProfileId !== null && t.assignedProfileId === callerPlannerProfileId;
                const isBusy = busyTaskId === t.taskId;
                return (
                  <tr key={t.taskId} className="hover:bg-surface-container-low/20 transition-colors align-top">
                    <td className="px-4 sm:px-lg py-2.5">
                      <p className="font-label-md text-label-md text-on-surface">{t.task}</p>
                      {t.category && <p className="text-xs text-on-surface-variant mt-0.5">{t.category}</p>}
                    </td>
                    <td className="px-4 py-2.5 hidden sm:table-cell text-xs text-on-surface-variant">{t.taskCode}</td>
                    <td className="px-4 py-2.5">
                      {isSelfAssignee ? (
                        <select
                          className={`input !w-auto !py-1 text-xs ${STATUS_SELECT_CLASSES[getDraft(t).status]}`}
                          value={getDraft(t).status}
                          disabled={isBusy}
                          onChange={(e) => updateDraft(t, { status: e.target.value as PlannerTaskClient['status'] })}
                          aria-label={`Status of ${t.task}`}
                        >
                          {statusOptions()}
                        </select>
                      ) : canManage && onSaveStatuses ? (
                        <div>
                          <select
                            className={`input !w-auto !py-1 text-xs ${STATUS_SELECT_CLASSES[pendingStatus[t.taskId] ?? t.status]} ${
                              pendingStatus[t.taskId] !== undefined ? 'ring-2 ring-offset-1 ring-primary/40' : ''
                            }`}
                            value={pendingStatus[t.taskId] ?? t.status}
                            disabled={isBusy || savingStatuses}
                            onChange={(e) => setPending(t, e.target.value as PlannerTaskClient['status'])}
                            aria-label={`Status of ${t.task}`}
                          >
                            {statusOptions()}
                          </select>
                          {pendingStatus[t.taskId] !== undefined && !rowErrors[t.taskId] && <p className="text-[11px] text-on-surface-variant mt-1">Unsaved</p>}
                          {rowErrors[t.taskId] && <p className="text-[11px] text-error mt-1">{rowErrors[t.taskId]}</p>}
                        </div>
                      ) : (
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${STATUS_PILL_CLASSES[t.status]}`}>
                          {t.status}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 hidden md:table-cell">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${PRIORITY_PILL_CLASSES[t.priority]}`}>
                        {t.priority}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 hidden md:table-cell text-body-sm font-body-sm text-on-surface-variant">{formatDate(t.dueDate)}</td>
                    <td className="px-4 py-2.5 text-body-sm font-body-sm text-on-surface-variant">{t.assignedProfileName ?? '—'}</td>
                    <td className="px-4 sm:px-lg py-2.5 text-right">
                      {canManage ? (
                        <div className="flex justify-end gap-2">
                          <button className="row-action" onClick={() => onEdit(t)} disabled={isBusy}>
                            Edit
                          </button>
                          <button className="row-action-danger" onClick={() => onDelete(t)} disabled={isBusy}>
                            Delete
                          </button>
                        </div>
                      ) : isSelfAssignee ? (
                        <div className="flex justify-end gap-2 items-center">
                          <input
                            className="input !w-32 !py-1 text-xs"
                            placeholder="Remarks"
                            value={getDraft(t).remarks}
                            onChange={(e) => updateDraft(t, { remarks: e.target.value })}
                            disabled={isBusy}
                          />
                          {isDirty(t) && (
                            <button className="row-action" disabled={isBusy} onClick={() => discardDraft(t)}>
                              Cancel
                            </button>
                          )}
                          <button
                            className="btn-primary text-xs py-1.5"
                            disabled={isBusy || !isDirty(t)}
                            onClick={async () => {
                              const draft = getDraft(t);
                              const succeeded = await onSelfAssigneeUpdate(t, { status: draft.status, remarks: draft.remarks });
                              if (succeeded) discardDraft(t);
                            }}
                          >
                            Save
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
