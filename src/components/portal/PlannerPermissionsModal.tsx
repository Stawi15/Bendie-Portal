'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { FormModal } from '@/components/portal/FormModal';
import { PLANNER_MODULES, VIEWER_FLAGS, MANAGER_FLAGS, derivePresetLabel, type PlannerPermissionFlags } from '@/lib/plannerPermissionPresets';

type ModuleState = { key: string; label: string; view: boolean; manage: boolean | null };
type PermissionState = { isEnabled: boolean; hasBeenConfigured: boolean; preset: 'viewer' | 'manager' | 'custom'; modules: ModuleState[] };

type Props = {
  open: boolean;
  eventId: string;
  userId: string;
  displayName: string;
  onClose: () => void;
};

/**
 * Feature 008 — the manager-facing Bendie Planner permissions surface.
 * Reached from a per-row action on the existing Members page (never a new
 * top-level tab, per spec.md FR-059). Never displays a raw ID, Planner event
 * ID, or database term (FR-014) — props are limited to the Portal
 * `eventId`/`userId`/display name, matching `EditProfileModal`'s existing
 * convention.
 */
export function PlannerPermissionsModal({ open, eventId, userId, displayName, onClose }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<PermissionState | null>(null);
  const [draftModules, setDraftModules] = useState<ModuleState[] | null>(null);
  const [enabling, setEnabling] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/members/${userId}/planner-permissions`);
      const body = await res.json();
      if (!res.ok || body.error) {
        setError(body.message || "Couldn't load Bendie Planner access for this person.");
        setState(null);
      } else if (body.status === 'backend_error') {
        // Corrective fix (2026-09-21, /review finding, LOW): a transient read
        // failure is not a provisioning outcome (contracts.md) and must never
        // be conflated with the "not yet available" states below — matches
        // planner-overview/page.tsx and planner-tasks/page.tsx's existing
        // `backend_error` copy convention ("try again in a moment").
        setError("Couldn't load Bendie Planner access right now — try again in a moment.");
        setState(null);
      } else if (body.status && body.status !== 'ready') {
        setError('Bendie Planner is not yet available for this event.');
        setState(null);
      } else {
        setState(body.state);
        setDraftModules(body.state.modules);
      }
    } catch {
      setError("Couldn't load Bendie Planner access right now — try again in a moment.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, eventId, userId]);

  const handleEnable = async () => {
    setEnabling(true);
    try {
      const res = await fetch(`/api/events/${eventId}/members/${userId}/planner-permissions/enable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationId: crypto.randomUUID() }),
      });
      const body = await res.json();
      if (!res.ok || body.error) {
        toast.error(body.message || "Couldn't set up Bendie Planner access — try again.");
      } else {
        setState(body.state);
        setDraftModules(body.state.modules);
        toast.success('Bendie Planner access enabled');
      }
    } catch {
      toast.error("Couldn't set up Bendie Planner access — try again.");
    } finally {
      setEnabling(false);
    }
  };

  const handleDisable = async () => {
    setDisabling(true);
    try {
      const res = await fetch(`/api/events/${eventId}/members/${userId}/planner-permissions/disable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationId: crypto.randomUUID() }),
      });
      const body = await res.json();
      if (!res.ok || body.error) {
        toast.error(body.message || 'Could not save — try again.');
      } else {
        setState(body.state);
        setDraftModules(body.state.modules);
        toast.success('Bendie Planner access disabled');
      }
    } catch {
      toast.error('Could not save — try again.');
    } finally {
      setDisabling(false);
    }
  };

  const applyPreset = (preset: 'viewer' | 'manager') => {
    const flags = preset === 'viewer' ? VIEWER_FLAGS : MANAGER_FLAGS;
    setDraftModules(
      PLANNER_MODULES.map((m) => ({
        key: m.key,
        label: m.label,
        view: flags[m.view],
        manage: m.manage ? flags[m.manage] : null,
      }))
    );
  };

  const toggleView = (key: string, view: boolean) => {
    setDraftModules(
      (prev) =>
        prev?.map((m) => {
          if (m.key !== key) return m;
          // Client-side Manage→View mirroring (UX convenience only — the
          // server re-normalizes unconditionally, spec.md FR-023–FR-025).
          const manage = view ? m.manage : m.manage === null ? null : false;
          return { ...m, view, manage };
        }) ?? null
    );
  };

  const toggleManage = (key: string, manage: boolean) => {
    setDraftModules((prev) => prev?.map((m) => (m.key === key ? { ...m, manage, view: manage ? true : m.view } : m)) ?? null);
  };

  const draftPreset: 'viewer' | 'manager' | 'custom' | null = draftModules
    ? derivePresetLabel(
        draftModules.reduce((acc, m) => {
          const flags = acc as PlannerPermissionFlags & Record<string, boolean>;
          const moduleDef = PLANNER_MODULES.find((pm) => pm.key === m.key)!;
          flags[moduleDef.view] = m.view;
          if (moduleDef.manage) flags[moduleDef.manage] = m.manage ?? false;
          return acc;
        }, {} as PlannerPermissionFlags)
      )
    : null;

  const handleSave = async () => {
    if (!draftModules) return;
    setSaving(true);
    try {
      const modules: Record<string, { view?: boolean; manage?: boolean }> = {};
      for (const m of draftModules) {
        modules[m.key] = m.manage === null ? { view: m.view } : { view: m.view, manage: m.manage };
      }
      const res = await fetch(`/api/events/${eventId}/members/${userId}/planner-permissions`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationId: crypto.randomUUID(), preset: draftPreset, modules }),
      });
      const body = await res.json();
      if (!res.ok || body.error) {
        toast.error(body.message || 'Could not save — try again.');
      } else {
        setState(body.state);
        setDraftModules(body.state.modules);
        toast.success('Permissions saved');
      }
    } catch {
      toast.error('Could not save — try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (state) setDraftModules(state.modules);
  };

  return (
    <FormModal open={open} onClose={onClose} title={`Bendie Planner Access — ${displayName}`} maxWidthClassName="max-w-lg">
      {loading ? (
        <p className="text-sm text-on-surface-variant py-8 text-center">Loading…</p>
      ) : error ? (
        <p className="text-sm text-error py-8 text-center">{error}</p>
      ) : !state ? null : (
        <div className="space-y-5">
          <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-outline-variant">
            <span className="font-medium text-on-surface">Enable Bendie Planner access</span>
            <button
              type="button"
              onClick={state.isEnabled ? handleDisable : handleEnable}
              disabled={enabling || disabling}
              className={`btn-${state.isEnabled ? 'secondary' : 'primary'} disabled:opacity-50`}
            >
              {enabling ? 'Enabling…' : disabling ? 'Disabling…' : state.isEnabled ? 'Disable' : 'Enable'}
            </button>
          </label>

          {state.isEnabled && draftModules && (
            <>
              <div className="flex items-center gap-2">
                {(['viewer', 'manager'] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => applyPreset(p)}
                    className={`px-3 py-1.5 rounded-full text-sm font-semibold border transition ${
                      draftPreset === p ? 'border-primary bg-primary/5 text-primary' : 'border-outline-variant text-on-surface-variant hover:border-primary/30'
                    }`}
                  >
                    {p === 'viewer' ? 'Viewer' : 'Manager'}
                  </button>
                ))}
                <span
                  className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${
                    draftPreset === 'custom' ? 'border-primary bg-primary/5 text-primary' : 'border-outline-variant text-on-surface-variant/60'
                  }`}
                >
                  Custom
                </span>
              </div>

              <div className="divide-y divide-outline-variant/40 border border-outline-variant rounded-xl overflow-hidden">
                {draftModules.map((m) => (
                  <div key={m.key} className="flex items-center justify-between gap-4 px-4 py-2.5">
                    <span className="text-sm text-on-surface">{m.label}</span>
                    <div className="flex items-center gap-4">
                      <label className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                        <input type="checkbox" className="w-4 h-4 accent-primary rounded" checked={m.view} onChange={(e) => toggleView(m.key, e.target.checked)} />
                        View
                      </label>
                      {m.manage !== null && (
                        <label className="flex items-center gap-1.5 text-xs text-on-surface-variant">
                          <input type="checkbox" className="w-4 h-4 accent-primary rounded" checked={m.manage} onChange={(e) => toggleManage(m.key, e.target.checked)} />
                          Manage
                        </label>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button type="button" onClick={handleCancel} className="btn-secondary" disabled={saving}>
                  Cancel
                </button>
                <button type="button" onClick={handleSave} className="btn-primary disabled:opacity-50" disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </FormModal>
  );
}
