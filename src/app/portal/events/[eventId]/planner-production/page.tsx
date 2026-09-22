'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { SectionHeader } from '@/components/portal/SectionHeader';
import { useConfirm } from '@/contexts/ConfirmContext';
import { PlannerProductionList } from '@/components/portal/PlannerProductionList';
import {
  PlannerProductionModal,
  type PlannerProductionSessionClient,
  type PlannerProductionFormValues,
  type PlannerProductionPresetContext,
} from '@/components/portal/PlannerProductionModal';
import { CsvImportModal } from '@/components/portal/CsvImportModal';
import { getField, type ColumnSpec, type RowResult } from '@/lib/csvImport';
import { useLatestRequest, isAbortError } from '@/lib/useLatestRequest';

const PRODUCTION_STATUSES = new Set(['pending', 'ready', 'active', 'completed', 'cancelled']);

type ProductionCsvRow = {
  sessionTitle: string;
  sessionDate: string;
  dayNumber: string;
  startTime: string;
  endTime: string;
  taskType: string;
  trackName: string;
  roomName: string;
  participants: string;
  mode: string;
  micType: string;
  presentation: string;
  mainScreen: string;
  notes: string;
  stageHandNotes: string;
  guestExperience: string;
  status: string;
};

const PRODUCTION_CSV_COLUMNS: ColumnSpec[] = [
  { key: 'sessionTitle', label: 'Session Title', required: true },
  { key: 'sessionDate', label: 'Session Date (YYYY-MM-DD)', required: true },
  { key: 'dayNumber', label: 'Day Number' },
  { key: 'startTime', label: 'Start Time (HH:MM)' },
  { key: 'endTime', label: 'End Time (HH:MM)' },
  { key: 'taskType', label: 'Type' },
  { key: 'trackName', label: 'Track' },
  { key: 'roomName', label: 'Room' },
  { key: 'participants', label: 'Participants' },
  { key: 'mode', label: 'Mode' },
  { key: 'micType', label: 'Mic Type' },
  { key: 'presentation', label: 'Presentation' },
  { key: 'mainScreen', label: 'Main Screen' },
  { key: 'notes', label: 'Notes' },
  { key: 'stageHandNotes', label: 'Stage Hand Notes' },
  { key: 'guestExperience', label: 'Guest Experience' },
  { key: 'status', label: 'Status (pending/ready/active/completed/cancelled)' },
];

const PRODUCTION_CSV_SAMPLES: Record<string, string>[] = [
  {
    sessionTitle: 'Opening Keynote',
    sessionDate: '2026-08-01',
    dayNumber: '1',
    startTime: '09:00',
    endTime: '10:00',
    taskType: 'Keynote',
    trackName: 'Main',
    roomName: 'Hall A',
    participants: '',
    mode: 'In-Person',
    micType: '',
    presentation: '',
    mainScreen: '',
    notes: '',
    stageHandNotes: '',
    guestExperience: '',
    status: 'pending',
  },
];

function parseProductionCsvRow(raw: Record<string, string>, rowIndex: number): RowResult<ProductionCsvRow> {
  const errors: string[] = [];
  const sessionTitle = getField(raw, 'sessionTitle');
  if (!sessionTitle) errors.push('sessionTitle is required');
  const sessionDate = getField(raw, 'sessionDate');
  if (!sessionDate) errors.push('sessionDate is required');

  const dayNumber = getField(raw, 'dayNumber');
  if (dayNumber && Number.isNaN(Number(dayNumber))) errors.push('dayNumber must be a number');

  const startTime = getField(raw, 'startTime');
  const endTime = getField(raw, 'endTime');
  if (startTime && endTime && startTime >= endTime) errors.push('endTime must be after startTime');

  const status = getField(raw, 'status');
  if (status && !PRODUCTION_STATUSES.has(status.trim().toLowerCase())) {
    errors.push('status must be one of: pending, ready, active, completed, cancelled');
  }

  const data: ProductionCsvRow = {
    sessionTitle,
    sessionDate,
    dayNumber,
    startTime,
    endTime,
    taskType: getField(raw, 'taskType'),
    trackName: getField(raw, 'trackName'),
    roomName: getField(raw, 'roomName'),
    participants: getField(raw, 'participants'),
    mode: getField(raw, 'mode'),
    micType: getField(raw, 'micType'),
    presentation: getField(raw, 'presentation'),
    mainScreen: getField(raw, 'mainScreen'),
    notes: getField(raw, 'notes'),
    stageHandNotes: getField(raw, 'stageHandNotes'),
    guestExperience: getField(raw, 'guestExperience'),
    status,
  };
  return { rowIndex, raw, data: errors.length === 0 ? data : undefined, errors };
}

/**
 * Feature 014 — Bendie Planner Production. Fetches
 * GET /api/events/[eventId]/planner-production (list from
 * production_sessions_v + capability) and renders exactly one of the states
 * below. Identical state machine to every prior module's page.
 */

type ProductionCapability = { hasPlannerIdentity: false } | { hasPlannerIdentity: true; canView: boolean; canManage: boolean };
type ConfigStatus = 'pending' | 'stale' | 'failed' | 'unavailable' | 'backend_error';

type PageState =
  | { kind: 'loading' }
  | { kind: 'denied' }
  | { kind: 'configuring'; status: ConfigStatus }
  | { kind: 'loaded'; capability: Extract<ProductionCapability, { hasPlannerIdentity: true }>; sessions: PlannerProductionSessionClient[] };

export default function PlannerProductionPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const confirm = useConfirm();
  const [state, setState] = useState<PageState>({ kind: 'loading' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PlannerProductionSessionClient | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<{ category: string; message: string } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [modalResetKey, setModalResetKey] = useState(0);
  const [lastProductionContext, setLastProductionContext] = useState<PlannerProductionPresetContext | undefined>(undefined);

  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  // Rapid-navigation performance pass — see src/lib/useLatestRequest.ts.
  const startRequest = useLatestRequest();

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const signal = startRequest();
    setState({ kind: 'loading' });
    try {
      const res = await fetch(`/api/events/${eventId}/planner-production`, { signal });
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
      setState({ kind: 'loaded', capability: data.capability, sessions: data.sessions ?? [] });
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      if (isAbortError(err)) return;
      console.error('Failed to load Planner Production', err);
      setState({ kind: 'configuring', status: 'backend_error' });
    }
  }, [eventId, startRequest]);

  useEffect(() => {
    load();
    return () => {
      requestIdRef.current += 1;
    };
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setLastProductionContext(undefined);
    setModalError(null);
    setModalOpen(true);
  };
  const openEdit = (session: PlannerProductionSessionClient) => {
    setEditing(session);
    setModalError(null);
    setModalOpen(true);
  };
  const closeModal = () => {
    if (submitting) return;
    setModalOpen(false);
    setModalError(null);
  };

  const handleSubmit = async (values: PlannerProductionFormValues, keepOpen: boolean) => {
    setSubmitting(true);
    setModalError(null);
    const status = values.status === 'auto' ? null : values.status;
    const body = {
      sessionTitle: values.sessionTitle,
      sessionDate: values.sessionDate,
      dayNumber: values.dayNumber ? Number(values.dayNumber) : null,
      startTime: values.startTime || null,
      endTime: values.endTime || null,
      taskType: values.taskType || null,
      trackName: values.trackName || null,
      roomName: values.roomName || null,
      isParallel: values.isParallel,
      parentProductionId: values.parentProductionId ? Number(values.parentProductionId) : null,
      sortOrder: values.sortOrder ? Number(values.sortOrder) : null,
      participants: values.participants || null,
      mode: values.mode || null,
      micType: values.micType || null,
      presentation: values.presentation || null,
      mainScreen: values.mainScreen || null,
      notes: values.notes || null,
      stageHandNotes: values.stageHandNotes || null,
      guestExperience: values.guestExperience || null,
      status,
    };
    try {
      const res = editing
        ? await fetch(`/api/events/${eventId}/planner-production/${editing.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await fetch(`/api/events/${eventId}/planner-production`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
      const data = await res.json();
      if (!mountedRef.current) return;
      if (!res.ok) {
        setModalError({ category: data.error ?? 'planner_write_failed', message: data.message ?? 'Could not save — try again.' });
        return;
      }
      toast.success(editing ? 'Session updated' : 'Session added');
      if (!editing && keepOpen) {
        setModalResetKey((k) => k + 1);
        setLastProductionContext({ sessionDate: values.sessionDate, dayNumber: values.dayNumber, trackName: values.trackName, roomName: values.roomName });
      } else {
        setModalOpen(false);
      }
      await load();
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('Planner Production: save failed', err);
      setModalError({ category: 'planner_write_failed', message: 'Could not save — try again.' });
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const importProductionRow = async (row: ProductionCsvRow) => {
    const res = await fetch(`/api/events/${eventId}/planner-production`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionTitle: row.sessionTitle,
        sessionDate: row.sessionDate,
        dayNumber: row.dayNumber ? Number(row.dayNumber) : null,
        startTime: row.startTime || null,
        endTime: row.endTime || null,
        taskType: row.taskType || null,
        trackName: row.trackName || null,
        roomName: row.roomName || null,
        isParallel: false,
        parentProductionId: null,
        participants: row.participants || null,
        mode: row.mode || null,
        micType: row.micType || null,
        presentation: row.presentation || null,
        mainScreen: row.mainScreen || null,
        notes: row.notes || null,
        stageHandNotes: row.stageHandNotes || null,
        guestExperience: row.guestExperience || null,
        status: row.status || null,
      }),
    });
    if (res.ok) return {};
    const data = await res.json().catch(() => ({}));
    return { error: data.message ?? 'Could not save this row.' };
  };

  const handleDelete = async (session: PlannerProductionSessionClient) => {
    const ok = await confirm({ message: `Delete "${session.sessionTitle}"? This cannot be undone.`, confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    setBusyId(session.id);
    try {
      const res = await fetch(`/api/events/${eventId}/planner-production/${session.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!mountedRef.current) return;
      if (!res.ok) {
        toast.error(data.message ?? 'Could not delete session.');
        return;
      }
      toast.success('Session deleted');
      await load();
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('Planner Production: delete failed', err);
      toast.error('Could not delete session.');
    } finally {
      if (mountedRef.current) setBusyId(null);
    }
  };

  if (state.kind === 'loading') {
    return (
      <div>
        <SectionHeader sectionKey="planner-production" />
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
        <SectionHeader sectionKey="planner-production" />
        <div className="mt-6 flex flex-col items-center justify-center text-center px-4 py-12">
          <span className="material-symbols-outlined text-5xl text-on-surface-variant mb-3">lock</span>
          <h2 className="font-headline-sm text-headline-sm text-on-surface mb-1">Couldn&apos;t load Production</h2>
          <p className="text-body-md font-body-md text-on-surface-variant max-w-sm">You may not have access to this, or you may need to sign in again.</p>
        </div>
      </div>
    );
  }

  if (state.kind === 'configuring') {
    const copy: Record<ConfigStatus, { icon: string; message: string; warn?: boolean }> = {
      pending: { icon: 'hourglass_top', message: 'Setting up Bendie Planner for this event…' },
      stale: { icon: 'support_agent', message: 'Bendie Planner setup is taking longer than expected. Please contact your administrator or support for assistance.', warn: true },
      failed: { icon: 'error', message: 'Bendie Planner setup didn’t complete. Please contact your administrator or support for assistance.', warn: true },
      unavailable: { icon: 'link_off', message: 'Bendie Planner hasn’t been fully set up for this event yet.' },
      backend_error: { icon: 'cloud_off', message: 'Couldn’t load Production right now — try again in a moment.' },
    };
    const { icon, message, warn } = copy[state.status];
    return (
      <div>
        <SectionHeader sectionKey="planner-production" />
        <div className={`mt-6 flex items-center gap-3 rounded-2xl p-4 ${warn ? 'bg-amber-50 border border-amber-200' : 'bg-surface-container-low'}`}>
          <span className={`material-symbols-outlined ${warn ? 'text-amber-600' : 'text-on-surface-variant'}`}>{icon}</span>
          <p className={`text-sm ${warn ? 'text-amber-800' : 'text-on-surface-variant'}`}>{message}</p>
        </div>
      </div>
    );
  }

  const { capability, sessions } = state;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeader sectionKey="planner-production" />
        {capability.canManage && (
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setCsvModalOpen(true)}>
              Import CSV
            </button>
            <button className="btn-primary" onClick={openCreate}>
              Add Session
            </button>
          </div>
        )}
      </div>

      <div className="mt-6">
        <PlannerProductionList
          sessions={sessions}
          canManage={capability.canManage}
          busyId={busyId}
          onEdit={openEdit}
          onDelete={handleDelete}
          onAdd={openCreate}
          onImportCsv={() => setCsvModalOpen(true)}
        />
      </div>

      <PlannerProductionModal
        key={modalResetKey}
        open={modalOpen}
        editing={editing}
        parallelOptions={sessions.map((s) => ({ id: s.id, label: s.sessionTitle ?? `Session #${s.id}` }))}
        submitting={submitting}
        serverError={modalError}
        onClose={closeModal}
        onSubmit={handleSubmit}
        presetContext={lastProductionContext}
      />
      <CsvImportModal<ProductionCsvRow>
        open={csvModalOpen}
        onClose={() => setCsvModalOpen(false)}
        onImported={load}
        title="Import Production Sessions"
        templateFilename="production-template.csv"
        columns={PRODUCTION_CSV_COLUMNS}
        sampleRows={PRODUCTION_CSV_SAMPLES}
        parseRow={parseProductionCsvRow}
        importRow={importProductionRow}
      />
    </div>
  );
}
