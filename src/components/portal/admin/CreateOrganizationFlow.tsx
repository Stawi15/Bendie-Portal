'use client';

import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { FormModal } from '@/components/portal/FormModal';
import { PlannerConnectionPicker } from '@/components/portal/admin/PlannerConnectionPicker';
import { PRODUCT_KEYS, PRODUCT_LABEL, type PlannerChoice, type ProductKey } from '@/lib/orgProductsAdmin';
import type { Database } from '@/types/database';

type Organization = Database['public']['Tables']['organizations']['Row'];

const slugify = (name: string) =>
  name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

const PRODUCT_HINT: Record<ProductKey, string> = {
  bendie: 'The attendee app and its event content.',
  planner: 'Event planning: tasks, logistics, production and more.',
};

/**
 * Feature 022 — platform admins create an organisation with its products and, for Planner, its
 * Planner connection in one step (replaces the old name-only CreateOrganizationModal).
 */
export function CreateOrganizationFlow({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (organization: Organization) => void;
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [products, setProducts] = useState<ProductKey[]>(['bendie']);
  const [planner, setPlanner] = useState<PlannerChoice | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const handlePlanner = useCallback((choice: PlannerChoice | null) => setPlanner(choice), []);

  const reset = () => {
    setName('');
    setSlug('');
    setSlugTouched(false);
    setProducts(['bendie']);
    setPlanner(null);
    setError(null);
  };

  const toggleProduct = (p: ProductKey) =>
    setProducts((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));

  const handleSave = async () => {
    setError(null);
    if (!name.trim()) return setError('Organisation name is required.');
    if (products.length === 0) return setError('Choose at least one product.');
    if (products.includes('planner') && !planner) return setError('Choose how to connect Bendie Planner.');
    setSaving(true);
    try {
      const res = await fetch('/api/admin/organizations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), slug: slug.trim() || null, products, planner: products.includes('planner') ? planner : null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? 'The organisation couldn’t be created.');
        return;
      }
      toast.success('Organisation created');
      onCreated(body.organization as Organization);
      reset();
    } catch {
      setError('The organisation couldn’t be created — check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormModal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="New organisation"
      maxWidthClassName="max-w-xl"
    >
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="org-name">Organisation name *</label>
          <input
            id="org-name"
            className="input"
            value={name}
            maxLength={200}
            onChange={(e) => {
              setName(e.target.value);
              if (!slugTouched) setSlug(slugify(e.target.value));
            }}
            placeholder="Acme Corp"
          />
        </div>
        <div>
          <label className="label" htmlFor="org-slug">Slug</label>
          <input
            id="org-slug"
            className="input font-mono"
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(slugify(e.target.value));
            }}
            placeholder="acme-corp"
          />
          <p className="hint">A short code for the organisation. Optional.</p>
        </div>

        <fieldset>
          <legend className="label">Products *</legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {PRODUCT_KEYS.map((p) => (
              <label
                key={p}
                className={`flex items-start gap-2 rounded-xl border p-3 cursor-pointer transition ${
                  products.includes(p) ? 'border-primary/40 bg-primary/5' : 'border-outline-variant hover:border-primary/30'
                }`}
              >
                <input type="checkbox" className="mt-1" checked={products.includes(p)} onChange={() => toggleProduct(p)} />
                <span>
                  <span className="block text-sm font-medium text-on-surface">{PRODUCT_LABEL[p]}</span>
                  <span className="block text-xs text-on-surface-variant">{PRODUCT_HINT[p]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {products.includes('planner') && <PlannerConnectionPicker organizationName={name} onChange={handlePlanner} />}

        {error && <p className="text-sm text-error" role="alert">{error}</p>}

        <div className="flex gap-3 pt-2 border-t border-outline-variant">
          <button type="button" onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? 'Creating…' : 'Create organisation'}
          </button>
          <button
            type="button"
            onClick={() => {
              reset();
              onClose();
            }}
            className="btn-secondary"
          >
            Cancel
          </button>
        </div>
      </div>
    </FormModal>
  );
}
