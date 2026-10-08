'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { supabase } from '@/lib/supabaseClient';
import { FormModal } from '@/components/portal/FormModal';
import { ModulePicker } from '@/components/portal/ModulePicker';
import { isSectionShownByModules, markProductsConfigured, optionalModuleKeysForProducts, type ModuleProduct } from '@/lib/eventModules';
import { friendlyError } from '@/lib/userFacingError';

type ManageModulesModalProps = {
  eventId: string;
  products: ModuleProduct[];
  /** events.portal_setup_modules — null means never configured (everything currently shown). */
  current: string[] | null;
  onClose: () => void;
  onSaved: (modules: string[]) => void;
};

/**
 * Feature 016 — change which modules an existing event shows. One write on
 * Save (existing events UPDATE RLS: event host/organiser/admin or platform
 * admin), nothing while ticking. Hiding never deletes data.
 */
export function ManageModulesModal({ eventId, products, current, onClose, onSaved }: ManageModulesModalProps) {
  const available = optionalModuleKeysForProducts(products);
  // Start from exactly what the navigation shows today (never configured, or a product
  // added later with no choices yet → all of that product's modules ticked).
  const initial = available.filter((k) => isSectionShownByModules(k, current));
  const [selected, setSelected] = useState<string[]>(initial);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    // Keep choices for products this event doesn't currently use (e.g. a Planner
    // module chosen before Planner was removed) so nothing is silently lost.
    const preservedOtherProducts = (current ?? []).filter((k) => !available.includes(k));
    // Products edited here are now explicitly configured (markers), so "none selected" is honoured.
    const next = markProductsConfigured(
      Array.from(new Set([...preservedOtherProducts, ...selected.filter((k) => available.includes(k))])),
      products
    );
    // `.select('id')`: an RLS-denied UPDATE returns no error, just zero rows.
    const { data, error } = await supabase.from('events').update({ portal_setup_modules: next }).eq('id', eventId).select('id');
    setSaving(false);
    if (error) {
      toast.error(friendlyError(error));
      return;
    }
    if (!data || data.length === 0) {
      toast.error('Only the event’s hosts, organisers or admins can change its modules.');
      return;
    }
    toast.success('Modules updated');
    onSaved(next);
  };

  return (
    <FormModal open onClose={saving ? () => undefined : onClose} title="Manage modules" maxWidthClassName="max-w-3xl">
      <p className="text-sm text-on-surface-variant mb-4">
        <span className="font-medium text-on-surface">Workspace modules</span> — choose what your team manages for this event here in the Portal. It doesn&apos;t change access, and hiding a module never deletes its data.
        To hide something from attendees in the Bendie app, use <span className="font-medium">Event Setup → Basics → Attendee app menu</span>.
      </p>
      <ModulePicker products={products} selected={selected} onChange={setSelected} previouslySelected={initial} />
      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-outline-variant">
        <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save modules'}
        </button>
      </div>
    </FormModal>
  );
}
