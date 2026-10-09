'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { SectionHeader } from '@/components/portal/SectionHeader';
import { useConfirm } from '@/contexts/ConfirmContext';
import { PlannerAgendaList } from '@/components/portal/PlannerAgendaList';
import { PlannerAgendaModal, type PlannerAgendaItemClient, type PlannerAgendaFormValues } from '@/components/portal/PlannerAgendaModal';
import { CsvImportModal } from '@/components/portal/CsvImportModal';
import { getField, type ColumnSpec, type RowResult } from '@/lib/csvImport';
import { useLatestRequest, isAbortError } from '@/lib/useLatestRequest';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

type AgendaCsvRow = {
  date: string;
  start_time: string;
  end_time: string;
  title: string;
  subtitle: string;
  speakers: string;
  mc: string;
  room: string;
  track: string;
  type: string;
  day_label: string;
  day_number: string;
  description: string;
  notes: string;
};

const AGENDA_CSV_COLUMNS: ColumnSpec[] = [
  { key: 'date', label: 'Date (YYYY-MM-DD)', required: true },
  { key: 'start_time', label: 'Start Time (HH:MM)' },
  { key: 'end_time', label: 'End Time (HH:MM)' },
  { key: 'title', label: 'Title', required: true },
  { key: 'subtitle', label: 'Subtitle' },
  { key: 'speakers', label: 'Speakers' },
  { key: 'mc', label: 'MC' },
  { key: 'room', label: 'Room' },
  { key: 'track', label: 'Track' },
  { key: 'type', label: 'Type (e.g. session, break, meal)' },
  { key: 'day_label', label: 'Day Label' },
  { key: 'day_number', label: 'Day Number' },
  { key: 'description', label: 'Description' },
  { key: 'notes', label: 'Notes' },
];

const AGENDA_CSV_SAMPLES: Record<string, string>[] = [
  { date: '2026-11-03', start_time: '08:00', end_time: '09:00', title: 'Arrival & registration', subtitle: '', speakers: '', mc: 'Jane Smith', room: 'Foyer', track: '', type: 'arrival', day_label: 'Day 1', day_number: '1', description: '', notes: '' },
  { date: '2026-11-03', start_time: '09:00', end_time: '10:00', title: 'Opening keynote', subtitle: 'Why this year matters', speakers: 'David Otieno', mc: '', room: 'Hall A', track: 'Main', type: 'session', day_label: 'Day 1', day_number: '1', description: '', notes: '' },
];

/** Mirrors the server's validation (src/lib/plannerAgenda.ts) so bad rows are flagged before import. */
function parseAgendaCsvRow(raw: Record<string, string>, rowIndex: number): RowResult<AgendaCsvRow> {
  const errors: string[] = [];
  const data = Object.fromEntries(AGENDA_CSV_COLUMNS.map((c) => [c.key, getField(raw, c.key)])) as AgendaCsvRow;
  if (!data.title) errors.push('title is required');
  if (!data.date) errors.push('date is required');
  else if (!DATE_RE.test(data.date) || Number.isNaN(Date.parse(data.date))) errors.push('date must be YYYY-MM-DD');
  if (data.start_time && !TIME_RE.test(data.start_time)) errors.push('start_time must be HH:MM');
  if (data.end_time && !TIME_RE.test(data.end_time)) errors.push('end_time must be HH:MM');
  if (data.start_time && data.end_time && data.end_time <= data.start_time) errors.push('end_time must be after start_time');
  if (data.day_number && !(Number.isInteger(Number(data.day_number)) && Number(data.day_number) >= 1)) errors.push('day_number must be a whole number of 1 or more');
  return { rowIndex, raw, data: errors.length === 0 ? data : undefined, errors };
}

type AgendaCapability = { hasPlannerIdentity: false } | { hasPlannerIdentity: true; canView: boolean; canManage: boolean };
type ConfigStatus = 'pending' | 'stale' | 'failed' | 'unavailable' | 'backend_error';

type PageState =
  | { kind: 'loading' }
  | { kind: 'denied' }
  | { kind: 'configuring'; status: ConfigStatus }
  | { kind: 'loaded'; canManage: boolean; items: PlannerAgendaItemClient[] };

const orNull = (v: string) => (v.trim() ? v.trim() : null);

/** The organiser's time zone, so the server works out day numbers from the event's local start date. */
const browserTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
};

function bodyFromValues(v: PlannerAgendaFormValues) {
  return {
    title: v.title.trim(),
    date: v.date,
    startTime: v.startTime || null,
    endTime: v.endTime || null,
    dayNumber: v.dayNumber ? Number(v.dayNumber) : null,
    dayLabel: orNull(v.dayLabel),
    subtitle: orNull(v.subtitle),
    speakers: orNull(v.speakers),
    mc: orNull(v.mc),
    roomName: orNull(v.roomName),
    trackName: orNull(v.trackName),
    itemType: orNull(v.itemType),
    description: orNull(v.description),
    notes: orNull(v.notes),
    timeZone: browserTimeZone(),
  };
}

/**
 * Feature 018 — Planner Agenda. The Planner event's programme
 * (`event_agenda_items`), authored here for any Planner event — the only way to
 * build it from the Portal for Planner-only events. Same state machine as the
 * Production page; items pushed from a Bendie Agenda are read-only.
 */
export default function PlannerAgendaPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const confirm = useConfirm();
  const [state, setState] = useState<PageState>({ kind: 'loading' });
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<PlannerAgendaItemClient | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [lastDate, setLastDate] = useState<string | undefined>(undefined);

  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const startRequest = useLatestRequest();

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    const signal = startRequest();
    setState((s) => (s.kind === 'loaded' ? s : { kind: 'loading' }));
    try {
      const res = await fetch(`/api/events/${eventId}/planner-agenda`, { signal });
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
      const capability = data.capability as AgendaCapability;
      if (!capability?.hasPlannerIdentity || !capability.canView) {
        setState({ kind: 'denied' });
        return;
      }
      setState({ kind: 'loaded', canManage: capability.canManage, items: data.items ?? [] });
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      if (isAbortError(err)) return;
      console.error('Failed to load Planner Agenda', err);
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
    setLastDate(undefined);
    setModalError(null);
    setModalOpen(true);
  };
  const openEdit = (item: PlannerAgendaItemClient) => {
    setEditing(item);
    setModalError(null);
    setModalOpen(true);
  };
  const closeModal = () => {
    if (submitting) return;
    setModalOpen(false);
    setModalError(null);
  };

  const handleSubmit = async (values: PlannerAgendaFormValues, keepOpen: boolean) => {
    setSubmitting(true);
    setModalError(null);
    try {
      const res = await fetch(editing ? `/api/events/${eventId}/planner-agenda/${editing.id}` : `/api/events/${eventId}/planner-agenda`, {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyFromValues(values)),
      });
      const data = await res.json().catch(() => ({}));
      if (!mountedRef.current) return;
      if (!res.ok) {
        setModalError(data.message ?? 'Could not save — try again.');
        return;
      }
      toast.success(editing ? 'Agenda item updated' : 'Agenda item added');
      if (!editing && keepOpen) {
        setLastDate(values.date);
        setResetKey((k) => k + 1);
      } else {
        setModalOpen(false);
      }
      await load();
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('Planner Agenda: save failed', err);
      setModalError('Could not save — try again.');
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const importRow = async (row: AgendaCsvRow) => {
    const res = await fetch(`/api/events/${eventId}/planner-agenda`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: row.title,
        date: row.date,
        startTime: row.start_time || null,
        endTime: row.end_time || null,
        dayNumber: row.day_number ? Number(row.day_number) : null,
        dayLabel: orNull(row.day_label),
        subtitle: orNull(row.subtitle),
        speakers: orNull(row.speakers),
        mc: orNull(row.mc),
        roomName: orNull(row.room),
        trackName: orNull(row.track),
        itemType: orNull(row.type),
        description: orNull(row.description),
        notes: orNull(row.notes),
        timeZone: browserTimeZone(),
      }),
    });
    if (res.ok) return {};
    const data = await res.json().catch(() => ({}));
    return { error: data.message ?? 'Could not save this row.' };
  };

  const handleDelete = async (item: PlannerAgendaItemClient) => {
    const ok = await confirm({ message: `Delete "${item.title}" from the agenda? This cannot be undone.`, confirmLabel: 'Delete', destructive: true });
    if (!ok) return;
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/events/${eventId}/planner-agenda/${item.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!mountedRef.current) return;
      if (!res.ok) {
        toast.error(data.message ?? 'Could not delete this item.');
        return;
      }
      toast.success('Agenda item deleted');
      await load();
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('Planner Agenda: delete failed', err);
      toast.error('Could not delete this item.');
    } finally {
      if (mountedRef.current) setBusyId(null);
    }
  };

  if (state.kind === 'loading') {
    return (
      <div>
        <SectionHeader sectionKey="planner-agenda" />
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
        <SectionHeader sectionKey="planner-agenda" />
        <div className="mt-6 flex flex-col items-center justify-center text-center px-4 py-12">
          <span className="material-symbols-outlined text-5xl text-on-surface-variant mb-3">lock</span>
          <h2 className="font-headline-sm text-headline-sm text-on-surface mb-1">Couldn&apos;t load the agenda</h2>
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
      backend_error: { icon: 'cloud_off', message: 'Couldn’t load the agenda right now — try again in a moment.' },
    };
    const { icon, message, warn } = copy[state.status] ?? copy.backend_error;
    return (
      <div>
        <SectionHeader sectionKey="planner-agenda" />
        <div className={`mt-6 flex items-center gap-3 rounded-2xl p-4 ${warn ? 'bg-amber-50 border border-amber-200' : 'bg-surface-container-low'}`}>
          <span className={`material-symbols-outlined ${warn ? 'text-amber-600' : 'text-on-surface-variant'}`}>{icon}</span>
          <p className={`text-sm ${warn ? 'text-amber-800' : 'text-on-surface-variant'}`}>{message}</p>
        </div>
      </div>
    );
  }

  const { canManage, items } = state;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <SectionHeader sectionKey="planner-agenda" />
        {canManage && items.length > 0 && (
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setCsvOpen(true)}>
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">upload_file</span> Import spreadsheet
            </button>
            <button className="btn-primary" onClick={openCreate}>
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">add</span> Add item
            </button>
          </div>
        )}
      </div>

      <div className="mt-6">
        <PlannerAgendaList items={items} canManage={canManage} busyId={busyId} onEdit={openEdit} onDelete={handleDelete} onAdd={openCreate} onImportCsv={() => setCsvOpen(true)} />
      </div>

      <PlannerAgendaModal
        open={modalOpen}
        editing={editing}
        submitting={submitting}
        error={modalError}
        resetKey={resetKey}
        lastDate={lastDate}
        onClose={closeModal}
        onSubmit={handleSubmit}
      />

      {canManage && (
        <CsvImportModal<AgendaCsvRow>
          open={csvOpen}
          onClose={() => setCsvOpen(false)}
          onImported={load}
          title="Import Agenda"
          templateFilename="planner-agenda-template.csv"
          columns={AGENDA_CSV_COLUMNS}
          sampleRows={AGENDA_CSV_SAMPLES}
          parseRow={parseAgendaCsvRow}
          importRow={importRow}
        />
      )}
    </div>
  );
}
