'use client';

import { useEffect, useState } from 'react';
import type { PlannerChoice } from '@/lib/orgProductsAdmin';

type PlannerOrg = { id: number; name: string; slug: string | null };

/**
 * Feature 022 — how to connect Planner: an existing Planner organisation that isn't connected to
 * any organisation yet, or a new one with the organisation's name. Emits null until a valid choice.
 */
export function PlannerConnectionPicker({
  organizationName,
  onChange,
}: {
  organizationName: string;
  onChange: (choice: PlannerChoice | null) => void;
}) {
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [orgs, setOrgs] = useState<PlannerOrg[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/planner-organizations')
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) setLoadError(body.error ?? 'Couldn’t load Planner organisations.');
        else setOrgs(body.plannerOrganizations ?? []);
      })
      .catch(() => !cancelled && setLoadError('Couldn’t load Planner organisations.'));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (mode === 'new') onChange({ mode: 'new' });
    else onChange(selected ? { mode: 'existing', plannerOrganizationId: Number(selected) } : null);
  }, [mode, selected, onChange]);

  return (
    <fieldset className="rounded-xl border border-outline-variant p-3 space-y-2">
      <legend className="px-1 text-xs font-semibold text-on-surface-variant uppercase tracking-wide">Connect to Bendie Planner</legend>
      <label className="flex items-start gap-2 text-sm text-on-surface cursor-pointer">
        <input type="radio" name="planner-connection" className="mt-1" checked={mode === 'new'} onChange={() => setMode('new')} />
        <span>
          Create a new Planner organisation
          <span className="block text-xs text-on-surface-variant">Named “{organizationName.trim() || 'the organisation’s name'}”.</span>
        </span>
      </label>
      <label className="flex items-start gap-2 text-sm text-on-surface cursor-pointer">
        <input type="radio" name="planner-connection" className="mt-1" checked={mode === 'existing'} onChange={() => setMode('existing')} />
        <span className="flex-1">
          Use an existing Planner organisation
          {mode === 'existing' && (
            <span className="block mt-2">
              {loadError ? (
                <span className="text-xs text-error">{loadError}</span>
              ) : orgs === null ? (
                <span className="block h-9 rounded-lg bg-surface-container-low animate-pulse" aria-hidden="true" />
              ) : orgs.length === 0 ? (
                <span className="text-xs text-on-surface-variant">Every Planner organisation is already connected. Create a new one instead.</span>
              ) : (
                <select className="input text-sm" value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="Planner organisation">
                  <option value="">Choose a Planner organisation…</option>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                  ))}
                </select>
              )}
            </span>
          )}
        </span>
      </label>
    </fieldset>
  );
}
