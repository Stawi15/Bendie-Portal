'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { SectionHeader } from '@/components/portal/SectionHeader';
import { useConfirm } from '@/contexts/ConfirmContext';
import { PlannerVendorList } from '@/components/portal/PlannerVendorList';
import { PlannerVendorModal, type PlannerVendorItemClient, type PlannerVendorCreateValues } from '@/components/portal/PlannerVendorModal';
import { CsvImportModal } from '@/components/portal/CsvImportModal';
import { getField, type ColumnSpec, type RowResult } from '@/lib/csvImport';

type VendorCsvRow = { category: string; description: string; quantityText: string; unit: string; notes: string; sortOrder: string };

const VENDOR_CSV_COLUMNS: ColumnSpec[] = [
  { key: 'category', label: 'Category' },
  { key: 'description', label: 'Description', required: true },
  { key: 'quantityText', label: 'Quantity' },
  { key: 'unit', label: 'Unit' },
  { key: 'notes', label: 'Notes' },
  { key: 'sortOrder', label: 'Sort Order' },
];

const VENDOR_CSV_SAMPLES: Record<string, string>[] = [
  { category: 'General', description: 'Extension cords', quantityText: '10', unit: 'pcs', notes: 'Heavy-duty, 10m', sortOrder: '' },
];

function parseVendorCsvRow(raw: Record<string, string>, rowIndex: number): RowResult<VendorCsvRow> {
  const errors: string[] = [];
  const description = getField(raw, 'description');
  if (!description) errors.push('description is required');
  const sortOrder = getField(raw, 'sortOrder');
  if (sortOrder && Number.isNaN(Number(sortOrder))) errors.push('sortOrder must be a number');

  const data: VendorCsvRow = {
    category: getField(raw, 'category'),
    description,
    quantityText: getField(raw, 'quantityText'),
    unit: getField(raw, 'unit'),
    notes: getField(raw, 'notes'),
    sortOrder,
  };
  return { rowIndex, raw, data: errors.length === 0 ? data : undefined, errors };
}

/**
 * Feature 009 — Bendie Planner Vendors. Fetches
 * GET /api/events/[eventId]/planner-vendors (list + capability) and renders
 * exactly one of the states below. Follows the exact request-generation-guard
 * pattern `planner-tasks/page.tsx`/`planner-overview/page.tsx` already
 * established — never a new state-management library.
 */

type VendorCapability = { hasPlannerIdentity: false } | { hasPlannerIdentity: true; canView: boolean; canManage: boolean };

type ConfigStatus = 'pending' | 'stale' | 'failed' | 'unavailable' | 'backend_error';

type PageState =
  | { kind: 'loading' }
  | { kind: 'denied' }
  | { kind: 'configuring'; status: ConfigStatus }
  | { kind: 'loaded'; capability: Extract<VendorCapability, { hasPlannerIdentity: true }>; items: PlannerVendorItemClient[] };

export default function PlannerVendorsPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const confirm = useConfirm();
  const [state, setState] = useState<PageState>({ kind: 'loading' });
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<{ category: string; message: string } | null>(null);
  // Portal UX pass (016) — "Save & Add Another" remounts the modal (fresh
  // internal field state) without closing it, by changing its `key` after a
  // successful keep-open submit. No new component state machinery needed.
  const [modalResetKey, setModalResetKey] = useState(0);
  const [busyItemId, setBusyItemId] = useState<number | null>(null);
  const [csvModalOpen, setCsvModalOpen] = useState(false);

  // Same ABA/stale-response guard as `planner-tasks/page.tsx` — a response for
  // a superseded request (previous eventId, or an earlier reload of this same
  // page) can never overwrite what a newer request already committed.
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
      const res = await fetch(`/api/events/${eventId}/planner-vendors`);
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
      setState({ kind: 'loaded', capability: data.capability, items: data.items ?? [] });
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      console.error('Failed to load Planner Vendors', err);
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
    setModalOpen(true);
  };

  const closeModal = () => {
    if (submitting) return;
    setModalOpen(false);
    setModalError(null);
  };

  const importVendorRow = async (row: VendorCsvRow) => {
    const res = await fetch(`/api/events/${eventId}/planner-vendors`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: row.description,
        category: row.category || null,
        quantityText: row.quantityText || null,
        unit: row.unit || null,
        notes: row.notes || null,
        sortOrder: row.sortOrder ? Number(row.sortOrder) : undefined,
      }),
    });
    if (res.ok) return {};
    const data = await res.json().catch(() => ({}));
    return { error: data.message ?? 'Could not save this row.' };
  };

  const handleCreate = async (values: PlannerVendorCreateValues, keepOpen: boolean) => {
    setSubmitting(true);
    setModalError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/planner-vendors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: values.description,
          category: values.category || null,
          quantityText: values.quantityText || null,
          unit: values.unit || null,
          notes: values.notes || null,
        }),
      });
      const data = await res.json();
      if (!mountedRef.current) return;
      if (!res.ok) {
        setModalError({ category: data.error ?? 'planner_write_failed', message: data.message ?? 'Could not save — try again.' });
        return;
      }
      toast.success('Vendor item added');
      if (keepOpen) {
        setModalResetKey((k) => k + 1); // remounts the modal with empty fields, still open
      } else {
        setModalOpen(false);
      }
      await load(); // authoritative refetch — never trust the mutation response as final client state
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('Planner Vendors: create failed', err);
      setModalError({ category: 'planner_write_failed', message: 'Could not save — try again.' });
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const handleToggleStage = async (item: PlannerVendorItemClient, stage: 'isPacked' | 'isLoaded' | 'isOnSite', next: boolean) => {
    setBusyItemId(item.id);
    try {
      const res = await fetch(`/api/events/${eventId}/planner-vendors/${item.id}`, {
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
      // Authoritative refresh — the live database trigger may have cascaded
      // this change beyond what was requested (spec.md FR-029/FR-030); never
      // assume the requested state equals what was actually persisted.
      await load();
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('Planner Vendors: status toggle failed', err);
      toast.error('Could not save changes.');
    } finally {
      if (mountedRef.current) setBusyItemId(null);
    }
  };

  const handleSaveNotes = async (item: PlannerVendorItemClient, notes: string): Promise<boolean> => {
    setBusyItemId(item.id);
    try {
      const res = await fetch(`/api/events/${eventId}/planner-vendors/${item.id}`, {
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
      console.error('Planner Vendors: notes save failed', err);
      toast.error('Could not save notes.');
      return false;
    } finally {
      if (mountedRef.current) setBusyItemId(null);
    }
  };

  const handleDelete = async (item: PlannerVendorItemClient) => {
    const ok = await confirm({ message: `Delete "${item.description}"? This cannot be undone.`, confirmLabel: 'Delete', destructive: true });
    if (!ok) return;

    setBusyItemId(item.id);
    try {
      const res = await fetch(`/api/events/${eventId}/planner-vendors/${item.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!mountedRef.current) return;
      if (!res.ok) {
        // A 404 here means someone else already deleted it — refetch rather
        // than crashing on stale local state (concurrent-delete edge case).
        if (res.status === 404) {
          toast('Item no longer exists.');
          await load();
          return;
        }
        toast.error(data.message ?? 'Could not delete item.');
        return;
      }
      toast.success('Vendor item deleted');
      await load();
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('Planner Vendors: delete failed', err);
      toast.error('Could not delete item.');
    } finally {
      if (mountedRef.current) setBusyItemId(null);
    }
  };

  if (state.kind === 'loading') {
    return (
      <div>
        <SectionHeader sectionKey="planner-vendors" />
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
        <SectionHeader sectionKey="planner-vendors" />
        <div className="mt-6 flex flex-col items-center justify-center text-center px-4 py-12">
          <span className="material-symbols-outlined text-5xl text-on-surface-variant mb-3">lock</span>
          <h2 className="font-headline-sm text-headline-sm text-on-surface mb-1">Couldn&apos;t load Vendors</h2>
          <p className="text-body-md font-body-md text-on-surface-variant max-w-sm">
            You may not have access to this, or you may need to sign in again.
          </p>
        </div>
      </div>
    );
  }

  if (state.kind === 'configuring') {
    // Reuses the exact existing Features 005/007 provisioning-state copy
    // conventions for the same underlying status vocabulary — never a new one.
    const copy: Record<ConfigStatus, { icon: string; message: string; warn?: boolean }> = {
      pending: { icon: 'hourglass_top', message: 'Setting up Bendie Planner for this event…' },
      stale: { icon: 'support_agent', message: 'Bendie Planner setup is taking longer than expected. Please contact your administrator or support for assistance.', warn: true },
      failed: { icon: 'error', message: 'Bendie Planner setup didn’t complete. Please contact your administrator or support for assistance.', warn: true },
      unavailable: { icon: 'link_off', message: 'Bendie Planner hasn’t been fully set up for this event yet.' },
      backend_error: { icon: 'cloud_off', message: 'Couldn’t load Vendors right now — try again in a moment.' },
    };
    const { icon, message, warn } = copy[state.status];
    return (
      <div>
        <SectionHeader sectionKey="planner-vendors" />
        <div className={`mt-6 flex items-center gap-3 rounded-2xl p-4 ${warn ? 'bg-amber-50 border border-amber-200' : 'bg-surface-container-low'}`}>
          <span className={`material-symbols-outlined ${warn ? 'text-amber-600' : 'text-on-surface-variant'}`}>{icon}</span>
          <p className={`text-sm ${warn ? 'text-amber-800' : 'text-on-surface-variant'}`}>{message}</p>
        </div>
      </div>
    );
  }

  const { capability, items } = state;

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <SectionHeader sectionKey="planner-vendors" />
        {capability.canManage && (
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => setCsvModalOpen(true)}>
              Import CSV
            </button>
            <button className="btn-primary" onClick={openCreate}>
              Add Vendor Item
            </button>
          </div>
        )}
      </div>

      <div className="mt-6">
        <PlannerVendorList
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

      <PlannerVendorModal key={modalResetKey} open={modalOpen} submitting={submitting} serverError={modalError} onClose={closeModal} onSubmit={handleCreate} />
      <CsvImportModal<VendorCsvRow>
        open={csvModalOpen}
        onClose={() => setCsvModalOpen(false)}
        onImported={load}
        title="Import Vendor Items"
        templateFilename="vendors-template.csv"
        columns={VENDOR_CSV_COLUMNS}
        sampleRows={VENDOR_CSV_SAMPLES}
        parseRow={parseVendorCsvRow}
        importRow={importVendorRow}
      />
    </div>
  );
}
