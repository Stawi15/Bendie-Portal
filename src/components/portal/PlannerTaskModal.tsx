'use client';

import { useEffect, useState } from 'react';
import { FormModal } from '@/components/portal/FormModal';

// Mirrors the client-facing shapes from `src/lib/plannerTasks.ts` (server-only,
// never imported into a client component) — these are just the JSON contract.
export type PlannerTaskClient = {
  taskId: number;
  taskCode: string;
  task: string;
  category: string | null;
  status: 'Pending' | 'In Progress' | 'Completed';
  priority: 'Low' | 'Medium' | 'High';
  dueDate: string | null;
  remarks: string | null;
  assignedProfileId: string | null;
  assignedProfileName: string | null;
};

export type AssignableStaffMemberClient = { profileId: string; name: string };

export type PlannerTaskFormValues = {
  task: string;
  category: string;
  priority: 'Low' | 'Medium' | 'High';
  status: 'Pending' | 'In Progress' | 'Completed';
  dueDate: string;
  remarks: string;
  assignedProfileId: string;
};

type PlannerTaskModalProps = {
  open: boolean;
  task: PlannerTaskClient | null;
  assignableStaff: AssignableStaffMemberClient[];
  submitting: boolean;
  serverError: { category: string; message: string } | null;
  onClose: () => void;
  onSubmit: (values: PlannerTaskFormValues, keepOpen: boolean) => void;
  /** Portal UX continuation (016) — only `category` carries over into a fresh "Save & Add Another" form; assignee/priority/due date/remarks always reset (a batch of similar tasks is far more often "same category, different everything else" than "same assignee"). Never used in edit mode. */
  presetCategory?: string;
};

const PRIORITIES: PlannerTaskFormValues['priority'][] = ['Low', 'Medium', 'High'];
const STATUSES: PlannerTaskFormValues['status'][] = ['Pending', 'In Progress', 'Completed'];

/**
 * Create/edit form modal — manager-only surface (FR-019/FR-021/FR-025). Reuses
 * `FormModal` and the existing `.input`/`.label`/`.btn-primary` primitives; no
 * new design system. Renders field-level validation feedback distinctly from
 * a generic write-failure banner (T037).
 *
 * Manual-acceptance reconciliation finding: a manager had NO UI path to
 * change a task's status at all — `PlannerTaskList`'s interactive status
 * control is gated to self-assignees only (`isSelfAssignee = !canManage &&
 * ...`), and this modal never rendered a status field, even though the
 * server (`updateTaskAsManager`/FR-022) has always accepted one. Added the
 * Status field below, EDIT-ONLY (never rendered on create — FR-020: a new
 * task MUST always be created as 'Pending', not client-selectable).
 */
export function PlannerTaskModal({ open, task, assignableStaff, submitting, serverError, onClose, onSubmit, presetCategory }: PlannerTaskModalProps) {
  const [values, setValues] = useState<PlannerTaskFormValues>({
    task: '',
    category: '',
    priority: 'Medium',
    status: 'Pending',
    dueDate: '',
    remarks: '',
    assignedProfileId: '',
  });

  useEffect(() => {
    if (!open) return;
    setValues({
      task: task?.task ?? '',
      category: task?.category ?? presetCategory ?? '',
      priority: task?.priority ?? 'Medium',
      status: task?.status ?? 'Pending',
      dueDate: task?.dueDate ?? '',
      remarks: task?.remarks ?? '',
      assignedProfileId: task?.assignedProfileId ?? '',
    });
  }, [open, task, presetCategory]);

  if (!open) return null;

  // A task's current assignee may no longer be in the active `assignableStaff`
  // list (FR-032) — still offered as an option here so an edit that doesn't
  // touch assignment doesn't silently clear it, labeled distinctly.
  const assigneeOptions = [...assignableStaff];
  if (task?.assignedProfileId && !assignableStaff.some((s) => s.profileId === task.assignedProfileId)) {
    assigneeOptions.push({ profileId: task.assignedProfileId, name: `${task.assignedProfileName ?? 'Unknown staff member'} (no longer active)` });
  }

  const fieldError = (field: string) => (serverError && serverError.category === field ? serverError.message : null);
  const generalError = serverError && serverError.category === 'planner_write_failed' ? serverError.message : null;

  return (
    <FormModal open={open} onClose={onClose} title={task ? 'Edit Task' : 'New Task'} maxWidthClassName="max-w-lg">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit(values, false);
        }}
        className="space-y-3"
      >
        {generalError && <p className="text-sm text-red-600">{generalError}</p>}

        <div>
          <label className="label">Task *</label>
          <input
            className="input"
            value={values.task}
            onChange={(e) => setValues((v) => ({ ...v, task: e.target.value }))}
            placeholder="What needs to be done?"
          />
          {fieldError('invalid_request') && <p className="text-xs text-red-600 mt-1">{fieldError('invalid_request')}</p>}
        </div>

        <div>
          <label className="label">Category</label>
          <input
            className="input"
            value={values.category}
            onChange={(e) => setValues((v) => ({ ...v, category: e.target.value }))}
            placeholder="Optional"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Priority</label>
            <select
              className="input"
              value={values.priority}
              onChange={(e) => setValues((v) => ({ ...v, priority: e.target.value as PlannerTaskFormValues['priority'] }))}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            {fieldError('invalid_priority') && <p className="text-xs text-red-600 mt-1">{fieldError('invalid_priority')}</p>}
          </div>
          <div>
            <label className="label">Due date</label>
            <input
              type="date"
              className="input"
              value={values.dueDate}
              onChange={(e) => setValues((v) => ({ ...v, dueDate: e.target.value }))}
            />
          </div>
        </div>

        {/* Edit-only — never rendered on create (FR-020: a new task is always 'Pending', not client-selectable). */}
        {task && (
          <div>
            <label className="label">Status</label>
            <select
              className="input"
              value={values.status}
              onChange={(e) => setValues((v) => ({ ...v, status: e.target.value as PlannerTaskFormValues['status'] }))}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {fieldError('invalid_status') && <p className="text-xs text-red-600 mt-1">{fieldError('invalid_status')}</p>}
          </div>
        )}

        <div>
          <label className="label">Assignee</label>
          <select
            className="input"
            value={values.assignedProfileId}
            onChange={(e) => setValues((v) => ({ ...v, assignedProfileId: e.target.value }))}
          >
            <option value="">Unassigned</option>
            {assigneeOptions.map((s) => (
              <option key={s.profileId} value={s.profileId}>
                {s.name}
              </option>
            ))}
          </select>
          {fieldError('invalid_assignee') && <p className="text-xs text-red-600 mt-1">{fieldError('invalid_assignee')}</p>}
        </div>

        <div>
          <label className="label">Remarks</label>
          <textarea
            className="input"
            rows={3}
            value={values.remarks}
            onChange={(e) => setValues((v) => ({ ...v, remarks: e.target.value }))}
            placeholder="Optional"
          />
        </div>

        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-outline-variant flex-wrap">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          {!task && (
            <button type="button" className="btn-secondary" onClick={() => onSubmit(values, true)} disabled={submitting}>
              {submitting ? 'Saving…' : 'Save & Add Another'}
            </button>
          )}
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'Saving…' : task ? 'Save Changes' : 'Create Task'}
          </button>
        </div>
      </form>
    </FormModal>
  );
}
