'use client';

import { MODULE_CATEGORIES, modulesForProducts, optionalModuleKeysForProducts, type ModuleProduct } from '@/lib/eventModules';

type ModulePickerProps = {
  products: ModuleProduct[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Keys that were on before (Manage modules) — unticking one of these shows the "nothing is deleted" note. */
  previouslySelected?: string[];
};

/**
 * Feature 016 — grouped, product-aware module checklist. Purely local state:
 * ticking boxes never touches the network; the caller persists on its own
 * explicit boundary (Create Event / Save).
 */
export function ModulePicker({ products, selected, onChange, previouslySelected }: ModulePickerProps) {
  const modules = modulesForProducts(products);
  const optionalKeys = optionalModuleKeysForProducts(products);
  const selectedSet = new Set(selected);
  const toggle = (key: string) => onChange(selectedSet.has(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  const hidingExisting = (previouslySelected ?? []).some((k) => optionalKeys.includes(k) && !selectedSet.has(k));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-secondary text-sm py-1.5" onClick={() => onChange(Array.from(new Set([...selected, ...optionalKeys])))}>
          Select all
        </button>
        <button type="button" className="btn-secondary text-sm py-1.5" onClick={() => onChange(selected.filter((k) => !optionalKeys.includes(k)))}>
          Clear optional
        </button>
        <span className="text-xs text-on-surface-variant">
          {optionalKeys.filter((k) => selectedSet.has(k)).length} of {optionalKeys.length} optional modules selected
        </span>
      </div>

      {MODULE_CATEGORIES.map((category) => {
        const inCategory = modules.filter((m) => m.category === category);
        if (inCategory.length === 0) return null;
        return (
          <fieldset key={category}>
            <legend className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant mb-2">{category}</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {inCategory.map((m) => {
                const checked = m.alwaysIncluded || selectedSet.has(m.key);
                return (
                  <label
                    key={m.key}
                    className={`flex items-start gap-3 rounded-xl border p-3 transition ${
                      m.alwaysIncluded
                        ? 'border-outline-variant bg-surface-container-low cursor-default'
                        : checked
                          ? 'border-primary bg-primary/5 cursor-pointer'
                          : 'border-outline-variant hover:border-primary/60 cursor-pointer'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-primary flex-shrink-0"
                      checked={checked}
                      disabled={m.alwaysIncluded}
                      onChange={() => toggle(m.key)}
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-sm font-semibold text-on-surface">
                        {m.label}
                        {m.alwaysIncluded && (
                          <span className="text-[10px] font-medium rounded-full bg-surface-container-high px-2 py-0.5 text-on-surface-variant">Always included</span>
                        )}
                        {products.length > 1 && (
                          <span className="text-[10px] font-medium text-on-surface-variant">{m.product === 'planner' ? 'Planner' : 'Bendie'}</span>
                        )}
                      </span>
                      <span className="block text-xs text-on-surface-variant mt-0.5">{m.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      {hidingExisting && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3" role="status">
          <span className="material-symbols-outlined text-amber-600 text-[18px]" aria-hidden="true">info</span>
          <p className="text-xs text-amber-800">
            Hiding a module only removes it from this event&apos;s navigation. <span className="font-semibold">Nothing is deleted</span> — turn it back on anytime and its existing data will be there.
          </p>
        </div>
      )}
    </div>
  );
}
