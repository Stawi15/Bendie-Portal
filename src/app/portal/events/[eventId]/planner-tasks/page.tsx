'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { SectionHeader } from '@/components/portal/SectionHeader';
import { useConfirm } from '@/contexts/ConfirmContext';
import { PlannerTaskList } from '@/components/portal/PlannerTaskList';
import {
  PlannerTaskModal,
  type PlannerTaskClient,
  type AssignableStaffMemberClient,
  type PlannerTaskFormValues,
} from '@/components/portal/PlannerTaskModal';

/**
 * Feature 007 — Bendie Planner Tasks. Fetches the bundled
 * GET /api/events/[eventId]/planner-tasks (list + capability + assignable
 * staff) and renders exactly one of the states below. Follows the exact
 * request-generation-guard pattern `planner-overview/page.tsx` already
 * established (Feature 005) — never a new state-management library.
 */

type TaskCapability = { hasPlannerIdentity: false } | { hasPlannerIdentity: true; canView: boolean; canManage: boolean };

type ConfigStatus = 'pending' | 'stale' | 'failed' | 'unavailable' | 'backend_error';

type PageState =
  | { kind: 'loading' }
  | { kind: 'denied' }
  | { kind: 'configuring'; status: ConfigStatus }
  | {
      kind: 'loaded';
      capability: Extract<TaskCapability, { hasPlannerIdentity: true }>;
      callerProfileId: string;
      tasks: PlannerTaskClient[];
      assignableStaff: AssignableStaffMemberClient[];
    };

export default function PlannerTasksPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const confirm = useConfirm();
  const [state, setState] = useState<PageState>({ kind: 'loading' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<PlannerTaskClient | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<{ category: string; message: string } | null>(null);
  const [modalResetKey, setModalResetKey] = useState(0);
  const [lastTaskCategory, setLastTaskCategory] = useState<string | undefined>(undefined);
  const [busyTaskId, setBusyTaskId] = useState<number | null>(null);

  // Same ABA/stale-response guard as `planner-overview/page.tsx` — a response
  // for a superseded request (previous eventId, or an earlier reload of this
  // same page) can never overwrite what a newer request already committed.
  // Scoped to `load()`'s OWN GET-response ordering only.
  const requestIdRef = useRef(0);

  // Manual-acceptance corrective fix — a SEPARATE guard for "is this page
  // instance still mounted", used by the mutation handlers below to decide
  // whether it's safe to call setState after their request settles. This
  // must NOT reuse `requestIdRef`: every mutation handler below calls
  // `load()` on success, which bumps `requestIdRef` as part of its own
  // unrelated bookkeeping — comparing a mutation handler's captured
  // `requestId` against `requestIdRef.current` AFTER calling `load()` was
  // therefore always false, silently skipping `setSubmitting(false)` /
  // `setBusyTaskId(null)` on every successful save/delete and leaving the
  // Tasks UI stuck (Save/Cancel permanently disabled, `closeModal`'s own
  // `if (submitting) return` refusing to close) until a full page refresh.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setState({ kind: 'loading' });
    try {
      const res = await fetch(`/api/events/${eventId}/planner-tasks`);
      if (requestIdRef.current !== requestId) return;
      if (!res.ok) {
        setState({ kind: 'denied' });
        return;
      }
      const data = await res.json();
      if (requestIdRef.current !== requestId) return;
      if (data.status) {
        setState({ kind: 'configuring', status: data.status });
        return;
      }
      setState({
        kind: 'loaded',
        capability: data.capability,
        callerProfileId: data.callerProfileId,
        tasks: data.tasks ?? [],
        assignableStaff: data.assignableStaff ?? [],
      });
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      console.error('Failed to load Planner Tasks', err);
      setState({ kind: 'configuring', status: 'backend_error' });
    }
  }, [eventId]);

  useEffect(() => {
    load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]);

  const openCreate = () => {
    setEditingTask(null);
    setLastTaskCategory(undefined);
    setModalError(null);
    setModalOpen(true);
  };

  const openEdit = (task: PlannerTaskClient) => {
    setEditingTask(task);
    setModalError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalOpen(false);
    setEditingTask(null);
    setModalError(null);
  };

  const handleSubmit = async (values: PlannerTaskFormValues, keepOpen: boolean) => {
    setSubmitting(true);
    setModalError(null);
    try {
      const payload: Record<string, unknown> = {
        task: values.task,
        category: values.category || null,
        priority: values.priority,
        dueDate: values.dueDate || null,
        remarks: values.remarks || null,
        assignedProfileId: values.assignedProfileId || null,
      };
      // Reconciliation finding: status is manager-editable (FR-022) but must
      // never be sent on create — the server always creates as 'Pending' and
      // does not accept a client-selected value at creation time (FR-020).
      if (editingTask) {
        payload.status = values.status;
      }
      const res = await fetch(
        editingTask ? `/api/events/${eventId}/planner-tasks/${editingTask.taskId}` : `/api/events/${eventId}/planner-tasks`,
        {
          method: editingTask ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!mountedRef.current) return; // navigated away entirely mid-request
      if (!res.ok) {
        setModalError({ category: data.error ?? 'planner_write_failed', message: data.message ?? 'Could not save — try again.' });
        return;
      }
      toast.success(editingTask ? 'Task updated' : 'Task created');
      if (!editingTask && keepOpen) {
        setModalResetKey((k) => k + 1);
        setLastTaskCategory(values.category || undefined);
      } else {
        setModalOpen(false);
        setEditingTask(null);
      }
      await load(); // authoritative refetch — never trust the mutation response as final client state (FR-043)
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('Planner Tasks: save failed', err);
      setModalError({ category: 'planner_write_failed', message: 'Could not save — try again.' });
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const handleDelete = async (task: PlannerTaskClient) => {
    const ok = await confirm({ message: `Delete "${task.task}"? This cannot be undone.`, confirmLabel: 'Delete', destructive: true });
    if (!ok) return;

    setBusyTaskId(task.taskId);
    try {
      const res = await fetch(`/api/events/${eventId}/planner-tasks/${task.taskId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!mountedRef.current) return;
      if (!res.ok) {
        // A 404 here means someone else already deleted it -- refetch rather
        // than crashing on stale local state (edge case: concurrent delete).
        if (res.status === 404) {
          toast('Task no longer exists.');
          await load();
          return;
        }
        toast.error(data.message ?? 'Could not delete task.');
        return;
      }
      toast.success('Task deleted');
      await load();
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('Planner Tasks: delete failed', err);
      toast.error('Could not delete task.');
    } finally {
      if (mountedRef.current) setBusyTaskId(null);
    }
  };

  // Returns whether the save succeeded, so PlannerTaskList only clears its
  // local draft for this row once the server has actually confirmed the
  // change (manual-acceptance corrective fix) — never on an assumed/optimistic
  // success, and never before the request settles.
  const handleSelfAssigneeUpdate = async (task: PlannerTaskClient, patch: { status?: string; remarks?: string }): Promise<boolean> => {
    setBusyTaskId(task.taskId);
    try {
      const res = await fetch(`/api/events/${eventId}/planner-tasks/${task.taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json().catch(() => ({}));
      if (!mountedRef.current) return false;
      if (!res.ok) {
        if (res.status === 404) {
          toast('This task is no longer assigned to you, or no longer exists.');
          await load();
          return false;
        }
        toast.error(data.message ?? 'Could not save changes.');
        return false;
      }
      await load();
      return true;
    } catch (err) {
      if (!mountedRef.current) return false;
      console.error('Planner Tasks: self-assignee update failed', err);
      toast.error('Could not save changes.');
      return false;
    } finally {
      if (mountedRef.current) setBusyTaskId(null);
    }
  };

  if (state.kind === 'loading') {
    return (
      <div>
        <SectionHeader sectionKey="planner-tasks" />
        <div className="mt-6 space-y-3" aria-busy="true">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-surface-container-low rounded-[20px] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (state.kind === 'denied') {
    return (
      <div>
        <SectionHeader sectionKey="planner-tasks" />
        <div className="mt-6 flex flex-col items-center justify-center text-center px-4 py-12">
          <span className="material-symbols-outlined text-5xl text-on-surface-variant mb-3">lock</span>
          <h2 className="font-headline-sm text-headline-sm text-on-surface mb-1">Couldn&apos;t load Tasks</h2>
          <p className="text-body-md font-body-md text-on-surface-variant max-w-sm">
            You may not have access to this, or you may need to sign in again.
          </p>
        </div>
      </div>
    );
  }

  if (state.kind === 'configuring') {
    // Distinct from an empty task list (FR-046) and never presented as a
    // generic error (FR-048) -- reuses Planner Overview's established copy
    // conventions for the same underlying status vocabulary (research.md).
    const copy: Record<ConfigStatus, { icon: string; message: string; warn?: boolean }> = {
      pending: { icon: 'hourglass_top', message: 'Setting up Bendie Planner for this event…' },
      stale: { icon: 'support_agent', message: 'Bendie Planner setup is taking longer than expected. Please contact your administrator or support for assistance.', warn: true },
      failed: { icon: 'error', message: 'Bendie Planner setup didn’t complete. Please contact your administrator or support for assistance.', warn: true },
      unavailable: { icon: 'link_off', message: 'Bendie Planner hasn’t been fully set up for this event yet.' },
      backend_error: { icon: 'cloud_off', message: 'Couldn’t load Tasks right now — try again in a moment.' },
    };
    const { icon, message, warn } = copy[state.status];
    return (
      <div>
        <SectionHeader sectionKey="planner-tasks" />
        <div className={`mt-6 flex items-center gap-3 rounded-2xl p-4 ${warn ? 'bg-amber-50 border border-amber-200' : 'bg-surface-container-low'}`}>
          <span className={`material-symbols-outlined ${warn ? 'text-amber-600' : 'text-on-surface-variant'}`}>{icon}</span>
          <p className={`text-sm ${warn ? 'text-amber-800' : 'text-on-surface-variant'}`}>{message}</p>
        </div>
      </div>
    );
  }

  const { capability, callerProfileId, tasks, assignableStaff } = state;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeader sectionKey="planner-tasks" />
        {capability.canManage && (
          <button className="btn-primary" onClick={openCreate}>
            New Task
          </button>
        )}
      </div>

      <div className="mt-6">
        <PlannerTaskList
          tasks={tasks}
          canManage={capability.canManage}
          callerPlannerProfileId={callerProfileId}
          busyTaskId={busyTaskId}
          onEdit={openEdit}
          onDelete={handleDelete}
          onSelfAssigneeUpdate={handleSelfAssigneeUpdate}
          onAdd={openCreate}
        />
      </div>

      <PlannerTaskModal
        key={modalResetKey}
        open={modalOpen}
        task={editingTask}
        assignableStaff={assignableStaff}
        submitting={submitting}
        serverError={modalError}
        onClose={closeModal}
        onSubmit={handleSubmit}
        presetCategory={lastTaskCategory}
      />
    </div>
  );
}
