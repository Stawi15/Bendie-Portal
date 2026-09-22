'use client';

import { useMemo, useState } from 'react';
import type { PlannerTaskClient } from '@/components/portal/PlannerTaskModal';

const STATUS_VALUES: PlannerTaskClient['status'][] = ['Pending', 'In Progress', 'Completed'];
const PRIORITY_VALUES: PlannerTaskClient['priority'][] = ['Low', 'Medium', 'High'];

const STATUS_PILL_CLASSES: Record<PlannerTaskClient['status'], string> = {
  Pending: 'bg-surface-container-high text-on-surface-variant',
  'In Progress': 'bg-blue-100 text-blue-700',
  Completed: 'bg-green-100 text-green-700',
};

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
  onAdd?: () => void;
};

type SelfAssigneeDraft = { status: PlannerTaskClient['status']; remarks: string };

/**
 * Presentational task table (FR-035/FR-036) — reuses the existing Portal
 * table-row pattern (`EventsOverviewPanel`'s established shape). Management
 * controls (`canManage`) and the narrower self-assignee status/remarks
 * control are both driven exclusively by server-derived capability/task
 * data — never a client-side inference (T034/T035).
 */
export function PlannerTaskList({ tasks, canManage, callerPlannerProfileId, busyTaskId, onEdit, onDelete, onSelfAssigneeUpdate, onAdd }: PlannerTaskListProps) {
  const [statusFilter, setStatusFilter] = useState<string>('all');
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
      <div className="px-4 sm:px-lg py-4 border-b border-outline-variant flex flex-wrap gap-3 items-center">
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
        <div className="text-center py-16 px-6">
          <p className="text-on-surface-variant text-sm">
            {tasks.length === 0 ? 'No tasks yet for this event.' : 'No tasks match the current filters.'}
          </p>
          {tasks.length === 0 && canManage && (
            <>
              <p className="text-on-surface-variant/70 text-xs mt-1">Bulk CSV import isn&apos;t available for Tasks — add tasks one at a time here.</p>
              {onAdd && (
                <div className="mt-4">
                  <button className="btn-primary" onClick={onAdd}>
                    New Task
                  </button>
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
                <th className="px-4 sm:px-lg py-4 font-label-md text-label-md text-on-surface-variant">Task</th>
                <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant hidden sm:table-cell">Code</th>
                <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant">Status</th>
                <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant hidden md:table-cell">Priority</th>
                <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant hidden md:table-cell">Due</th>
                <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant">Assignee</th>
                <th className="px-4 sm:px-lg py-4 font-label-md text-label-md text-on-surface-variant text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {filtered.map((t) => {
                const isSelfAssignee = !canManage && callerPlannerProfileId !== null && t.assignedProfileId === callerPlannerProfileId;
                const isBusy = busyTaskId === t.taskId;
                return (
                  <tr key={t.taskId} className="hover:bg-surface-container-low/20 transition-colors align-top">
                    <td className="px-4 sm:px-lg py-4">
                      <p className="font-label-md text-label-md text-on-surface">{t.task}</p>
                      {t.category && <p className="text-xs text-on-surface-variant mt-0.5">{t.category}</p>}
                    </td>
                    <td className="px-6 py-4 hidden sm:table-cell text-xs text-on-surface-variant">{t.taskCode}</td>
                    <td className="px-6 py-4">
                      {isSelfAssignee ? (
                        <select
                          className="input !w-auto !py-1 text-xs"
                          value={getDraft(t).status}
                          disabled={isBusy}
                          onChange={(e) => updateDraft(t, { status: e.target.value as PlannerTaskClient['status'] })}
                        >
                          {STATUS_VALUES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${STATUS_PILL_CLASSES[t.status]}`}>
                          {t.status}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 hidden md:table-cell">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${PRIORITY_PILL_CLASSES[t.priority]}`}>
                        {t.priority}
                      </span>
                    </td>
                    <td className="px-6 py-4 hidden md:table-cell text-body-sm font-body-sm text-on-surface-variant">{formatDate(t.dueDate)}</td>
                    <td className="px-6 py-4 text-body-sm font-body-sm text-on-surface-variant">{t.assignedProfileName ?? '—'}</td>
                    <td className="px-4 sm:px-lg py-4 text-right">
                      {canManage ? (
                        <div className="flex justify-end gap-2">
                          <button className="btn-secondary text-xs py-1.5" onClick={() => onEdit(t)} disabled={isBusy}>
                            Edit
                          </button>
                          <button className="btn-danger text-xs py-1.5" onClick={() => onDelete(t)} disabled={isBusy}>
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
                            <button className="btn-secondary text-xs py-1.5" disabled={isBusy} onClick={() => discardDraft(t)}>
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
