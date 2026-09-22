'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { SectionHeader } from '@/components/portal/SectionHeader';
import { useConfirm } from '@/contexts/ConfirmContext';
import { PlannerChecklistList } from '@/components/portal/PlannerChecklistList';
import { CsvImportModal } from '@/components/portal/CsvImportModal';
import { getField, type ColumnSpec, type RowResult } from '@/lib/csvImport';
import {
  PlannerChecklistModal,
  type PlannerChecklistItemClient,
  type EligibleOwnerClient,
  type PlannerChecklistCreateValues,
  type PlannerChecklistPresetContext,
} from '@/components/portal/PlannerChecklistModal';

type ChecklistCsvRow = {
  category: string;
  itemName: string;
  quantityText: string;
  specification: string;
  notes: string;
  dayNumber: string;
  eventDayDate: string;
  ownerProfileId: string | null;
  sortOrder: string;
};

const CHECKLIST_CSV_COLUMNS: ColumnSpec[] = [
  { key: 'category', label: 'Category' },
  { key: 'itemName', label: 'Item Name', required: true },
  { key: 'quantityText', label: 'Quantity' },
  { key: 'specification', label: 'Specification' },
  { key: 'notes', label: 'Notes' },
  { key: 'dayNumber', label: 'Day Number' },
  { key: 'eventDayDate', label: 'Event Day Date (YYYY-MM-DD)' },
  { key: 'ownerName', label: 'Owner Name (optional — blank defaults to you)' },
  { key: 'sortOrder', label: 'Sort Order' },
];

const CHECKLIST_CSV_SAMPLES: Record<string, string>[] = [
  { category: 'General', itemName: 'Extension cords', quantityText: '10', specification: 'Heavy-duty, 10m', notes: '', dayNumber: '1', eventDayDate: '', ownerName: 'Alex Kim', sortOrder: '' },
  { category: 'Signage', itemName: 'Welcome banner', quantityText: '1', specification: '', notes: '', dayNumber: '', eventDayDate: '', ownerName: '', sortOrder: '' },
];

/**
 * Feature 010 — Bendie Planner Checklist. Fetches
 * GET /api/events/[eventId]/planner-checklist (list + capability + eligible
 * owners) and renders exactly one of the states below. Identical state
 * machine to `planner-vendors/page.tsx`.
 */

type ChecklistCapability = { hasPlannerIdentity: false } | { hasPlannerIdentity: true; canView: boolean; canManage: boolean };

type ConfigStatus = 'pending' | 'stale' | 'failed' | 'unavailable' | 'backend_error';

type PageState =
  | { kind: 'loading' }
  | { kind: 'denied' }
  | { kind: 'configuring'; status: ConfigStatus }
  | {
      kind: 'loaded';
      capability: Extract<ChecklistCapability, { hasPlannerIdentity: true }>;
      items: PlannerChecklistItemClient[];
      eligibleOwners: EligibleOwnerClient[];
    };

export default function PlannerChecklistPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const confirm = useConfirm();
  const [state, setState] = useState<PageState>({ kind: 'loading' });
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<{ category: string; message: string } | null>(null);
  const [busyItemId, setBusyItemId] = useState<number | null>(null);
  const [modalResetKey, setModalResetKey] = useState(0);
  const [lastChecklistContext, setLastChecklistContext] = useState<PlannerChecklistPresetContext | undefined>(undefined);
  const [csvModalOpen, setCsvModalOpen] = useState(false);

  const requestIdRef = useRef(0);
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
      const res = await fetch(`/api/events/${eventId}/planner-checklist`);
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
      setState({ kind: 'loaded', capability: data.capability, items: data.items ?? [], eligibleOwners: data.eligibleOwners ?? [] });
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      console.error('Failed to load Planner Checklist', err);
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
    setModalError(null);
    setLastChecklistContext(undefined);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalOpen(false);
    setModalError(null);
  };

  const handleCreate = async (values: PlannerChecklistCreateValues, keepOpen: boolean) => {
    setSubmitting(true);
    setModalError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/planner-checklist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemName: values.itemName,
          category: values.category || null,
          quantityText: values.quantityText || null,
          specification: values.specification || null,
          notes: values.notes || null,
          dayNumber: values.dayNumber ? Number(values.dayNumber) : null,
          eventDayDate: values.eventDayDate || null,
          ownerProfileId: values.ownerProfileId || null,
        }),
      });
      const data = await res.json();
      if (!mountedRef.current) return;
      if (!res.ok) {
        setModalError({ category: data.error ?? 'planner_write_failed', message: data.message ?? 'Could not save — try again.' });
        return;
      }
      toast.success('Checklist item added');
      if (keepOpen) {
        setModalResetKey((k) => k + 1);
        setLastChecklistContext({ category: values.category, dayNumber: values.dayNumber, eventDayDate: values.eventDayDate, ownerProfileId: values.ownerProfileId });
      } else {
        setModalOpen(false);
      }
      await load();
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('Planner Checklist: create failed', err);
      setModalError({ category: 'planner_write_failed', message: 'Could not save — try again.' });
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  // Owner-name resolution needs the current event's eligible-owner roster, only available once loaded.
  const eligibleOwnersForCsv: EligibleOwnerClient[] = state.kind === 'loaded' ? state.eligibleOwners : [];

  const parseChecklistCsvRow = (raw: Record<string, string>, rowIndex: number): RowResult<ChecklistCsvRow> => {
    const errors: string[] = [];
    const itemName = getField(raw, 'itemName');
    if (!itemName) errors.push('itemName is required');
    const dayNumber = getField(raw, 'dayNumber');
    if (dayNumber && Number.isNaN(Number(dayNumber))) errors.push('dayNumber must be a number');
    const sortOrder = getField(raw, 'sortOrder');
    if (sortOrder && Number.isNaN(Number(sortOrder))) errors.push('sortOrder must be a number');

    const ownerName = getField(raw, 'ownerName');
    let ownerProfileId: string | null = null;
    if (ownerName) {
      const matches = eligibleOwnersForCsv.filter((o) => o.name.trim().toLowerCase() === ownerName.trim().toLowerCase());
      // Zero or multiple matches: leave null — the server defaults to the importing manager, matching the manual form's own rule. Never blocks the row.
      if (matches.length === 1) ownerProfileId = matches[0].profileId;
    }

    const data: ChecklistCsvRow = {
      category: getField(raw, 'category'),
      itemName,
      quantityText: getField(raw, 'quantityText'),
      specification: getField(raw, 'specification'),
      notes: getField(raw, 'notes'),
      dayNumber,
      eventDayDate: getField(raw, 'eventDayDate'),
      ownerProfileId,
      sortOrder,
    };
    return { rowIndex, raw, data: errors.length === 0 ? data : undefined, errors };
  };

  const importChecklistRow = async (row: ChecklistCsvRow) => {
    const res = await fetch(`/api/events/${eventId}/planner-checklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemName: row.itemName,
        category: row.category || null,
        quantityText: row.quantityText || null,
        specification: row.specification || null,
        notes: row.notes || null,
        dayNumber: row.dayNumber ? Number(row.dayNumber) : null,
        eventDayDate: row.eventDayDate || null,
        ownerProfileId: row.ownerProfileId,
        sortOrder: row.sortOrder ? Number(row.sortOrder) : undefined,
      }),
    });
    if (res.ok) return {};
    const data = await res.json().catch(() => ({}));
    return { error: data.message ?? 'Could not save this row.' };
  };

  const handleToggleStage = async (item: PlannerChecklistItemClient, stage: 'isSourced' | 'isOnSite', next: boolean) => {
    setBusyItemId(item.id);
    try {
      const res = await fetch(`/api/events/${eventId}/planner-checklist/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [stage]: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!mountedRef.current) return;
      if (!res.ok) {
        if (res.status === 404) {
          toast('This item no longer exists.');
          await load();
          return;
        }
        toast.error(data.message ?? 'Could not save changes.');
        return;
      }
      // Authoritative refresh — never assume the requested state equals what
      // the database actually persisted.
      await load();
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('Planner Checklist: status toggle failed', err);
      toast.error('Could not save changes.');
    } finally {
      if (mountedRef.current) setBusyItemId(null);
    }
  };

  const handleSaveNotes = async (item: PlannerChecklistItemClient, notes: string): Promise<boolean> => {
    setBusyItemId(item.id);
    try {
      const res = await fetch(`/api/events/${eventId}/planner-checklist/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!mountedRef.current) return false;
      if (!res.ok) {
        if (res.status === 404) {
          toast('This item no longer exists.');
          await load();
          return false;
        }
        toast.error(data.message ?? 'Could not save notes.');
        return false;
      }
      await load();
      return true;
    } catch (err) {
      if (!mountedRef.current) return false;
      console.error('Planner Checklist: notes save failed', err);
      toast.error('Could not save notes.');
      return false;
    } finally {
      if (mountedRef.current) setBusyItemId(null);
    }
  };

  const handleDelete = async (item: PlannerChecklistItemClient) => {
    const ok = await confirm({ message: `Delete "${item.itemName}"? This cannot be undone.`, confirmLabel: 'Delete', destructive: true });
    if (!ok) return;

    setBusyItemId(item.id);
    try {
      const res = await fetch(`/api/events/${eventId}/planner-checklist/${item.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!mountedRef.current) return;
      if (!res.ok) {
        if (res.status === 404) {
          toast('Item no longer exists.');
          await load();
          return;
        }
        toast.error(data.message ?? 'Could not delete item.');
        return;
      }
      toast.success('Checklist item deleted');
      await load();
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('Planner Checklist: delete failed', err);
      toast.error('Could not delete item.');
    } finally {
      if (mountedRef.current) setBusyItemId(null);
    }
  };

  if (state.kind === 'loading') {
    return (
      <div>
        <SectionHeader sectionKey="planner-checklist" />
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
        <SectionHeader sectionKey="planner-checklist" />
        <div className="mt-6 flex flex-col items-center justify-center text-center px-4 py-12">
          <span className="material-symbols-outlined text-5xl text-on-surface-variant mb-3">lock</span>
          <h2 className="font-headline-sm text-headline-sm text-on-surface mb-1">Couldn&apos;t load Checklist</h2>
          <p className="text-body-md font-body-md text-on-surface-variant max-w-sm">
            You may not have access to this, or you may need to sign in again.
          </p>
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
      backend_error: { icon: 'cloud_off', message: 'Couldn’t load Checklist right now — try again in a moment.' },
    };
    const { icon, message, warn } = copy[state.status];
    return (
      <div>
        <SectionHeader sectionKey="planner-checklist" />
        <div className={`mt-6 flex items-center gap-3 rounded-2xl p-4 ${warn ? 'bg-amber-50 border border-amber-200' : 'bg-surface-container-low'}`}>
          <span className={`material-symbols-outlined ${warn ? 'text-amber-600' : 'text-on-surface-variant'}`}>{icon}</span>
          <p className={`text-sm ${warn ? 'text-amber-800' : 'text-on-surface-variant'}`}>{message}</p>
        </div>
      </div>
    );
  }

  const { capability, items, eligibleOwners } = state;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeader sectionKey="planner-checklist" />
        {capability.canManage && (
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setCsvModalOpen(true)}>
              Import CSV
            </button>
            <button className="btn-primary" onClick={openCreate}>
              Add Checklist Item
            </button>
          </div>
        )}
      </div>

      <div className="mt-6">
        <PlannerChecklistList
          items={items}
          canManage={capability.canManage}
          busyItemId={busyItemId}
          onToggleStage={handleToggleStage}
          onSaveNotes={handleSaveNotes}
          onDelete={handleDelete}
          onAdd={openCreate}
          onImportCsv={() => setCsvModalOpen(true)}
        />
      </div>

      <PlannerChecklistModal
        key={modalResetKey}
        open={modalOpen}
        eligibleOwners={eligibleOwners}
        submitting={submitting}
        serverError={modalError}
        onClose={closeModal}
        onSubmit={handleCreate}
        presetContext={lastChecklistContext}
      />
      <CsvImportModal<ChecklistCsvRow>
        open={csvModalOpen}
        onClose={() => setCsvModalOpen(false)}
        onImported={load}
        title="Import Checklist Items"
        templateFilename="checklist-template.csv"
        columns={CHECKLIST_CSV_COLUMNS}
        sampleRows={CHECKLIST_CSV_SAMPLES}
        parseRow={parseChecklistCsvRow}
        importRow={importChecklistRow}
      />
    </div>
  );
}
