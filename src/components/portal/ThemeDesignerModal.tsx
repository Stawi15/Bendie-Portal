'use client';

import { useId, useRef, useState } from 'react';
import { FormModal } from '@/components/portal/FormModal';
import { EventThemePreview, type PreviewScreen } from '@/components/portal/EventThemePreview';
import { useConfirm } from '@/contexts/ConfirmContext';
import {
  BENDIE_APP_DEFAULT_THEME,
  BENDIE_THEME_PRESETS,
  QUICK_COLOURS,
  THEME_FIELDS,
  THEME_FIELD_KEYS,
  getReadabilityWarnings,
  normalizeHex,
  type EventTheme,
  type ThemeFieldKey,
} from '@/lib/eventTheme';

type ThemeDesignerModalProps = {
  /** The theme as currently saved (or the app default where nothing is saved). */
  initialTheme: EventTheme;
  eventName: string;
  onClose: () => void;
  /** Persists the theme via the page's existing save path. Resolves to an error message, or null on success. */
  onApply: (theme: EventTheme) => Promise<string | null>;
};

type ColourControlProps = {
  field: ThemeFieldKey;
  value: string;
  text: string;
  active: boolean;
  warning: string | null;
  onActivate: () => void;
  onPick: (hex: string) => void;
  onText: (raw: string) => void;
  sectionRef: (el: HTMLDivElement | null) => void;
};

function ColourControl({ field, value, text, active, warning, onActivate, onPick, onText, sectionRef }: ColourControlProps) {
  const meta = THEME_FIELDS[field];
  const id = useId();
  const textValid = normalizeHex(text) !== null;

  return (
    <div
      ref={sectionRef}
      tabIndex={-1}
      onFocusCapture={onActivate}
      onPointerDown={onActivate}
      className={`rounded-2xl border-2 p-4 transition-colors focus:outline-none ${active ? 'border-primary bg-surface-container-low' : 'border-outline-variant bg-white'}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 id={`${id}-title`} className="font-semibold text-on-surface text-sm">
          {meta.name} <span className="font-normal text-on-surface-variant">· {meta.technicalName}</span>
        </h3>
        {active && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary flex-shrink-0">
            <span className="material-symbols-outlined text-[14px]" aria-hidden="true">visibility</span>
            Outlined in preview
          </span>
        )}
      </div>
      <p className="text-xs text-on-surface-variant mb-3">{meta.description}</p>

      {/* The whole control is the native colour input's hit area — clicking the swatch,
          the HEX or "Choose colour" all open the browser's colour picker. */}
      <div className="relative rounded-xl border border-outline-variant bg-white hover:border-primary hover:shadow-sm focus-within:ring-2 focus-within:ring-primary transition">
        <div className="flex items-center gap-3 p-2.5" aria-hidden="true">
          <span className="w-12 h-12 rounded-lg border border-outline-variant shadow-inner flex-shrink-0" style={{ backgroundColor: value }} />
          <span className="font-mono text-sm text-on-surface">{value}</span>
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-primary-fixed px-3 py-1.5 text-sm font-semibold text-on-primary-fixed-variant">
            <span className="material-symbols-outlined text-[18px]">palette</span>
            Choose colour
          </span>
        </div>
        <input
          type="color"
          value={value.toLowerCase()}
          onChange={(e) => onPick(e.target.value)}
          aria-label={`Choose ${meta.name.toLowerCase()} (${meta.technicalName}), currently ${value}`}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>

      <div className="mt-3">
        <p className="text-[11px] font-semibold text-on-surface-variant mb-1.5">Quick colours</p>
        <div className="flex flex-wrap gap-1.5">
          {QUICK_COLOURS.map((c) => {
            const selected = value === c.value;
            return (
              <button
                key={c.value}
                type="button"
                title={`${c.label} ${c.value}`}
                aria-label={`${c.label} ${c.value}`}
                aria-pressed={selected}
                onClick={() => onPick(c.value)}
                className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition ${selected ? 'border-on-surface' : 'border-white shadow-sm ring-1 ring-outline-variant hover:scale-110'}`}
                style={{ backgroundColor: c.value }}
              >
                {selected && (
                  <span className="material-symbols-outlined text-[16px] rounded-full bg-white/90 text-on-surface" aria-hidden="true">check</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3">
        <label htmlFor={`${id}-hex`} className="text-[11px] font-semibold text-on-surface-variant">
          Exact colour code (HEX) — optional, for brand guidelines
        </label>
        <input
          id={`${id}-hex`}
          className={`input text-sm font-mono mt-1 ${!textValid ? 'border-error' : ''}`}
          value={text}
          onChange={(e) => onText(e.target.value)}
          placeholder="#0057B8"
          spellCheck={false}
          autoComplete="off"
          aria-invalid={!textValid}
          aria-describedby={!textValid ? `${id}-hex-error` : undefined}
        />
        {!textValid && (
          <p id={`${id}-hex-error`} className="text-xs text-error mt-1">
            That isn&apos;t a colour code. Use # followed by 6 characters (0–9, A–F), e.g. #0057B8. The preview keeps showing {value} until it&apos;s fixed.
          </p>
        )}
      </div>

      {warning && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5" role="status">
          <span className="material-symbols-outlined text-amber-600 text-[18px]" aria-hidden="true">warning</span>
          <p className="text-xs text-amber-800">
            <span className="font-semibold">Hard to read.</span> {warning} You can still apply it.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Feature 016 — Visual Event Theme Designer. All editing happens in local
 * draft state (no network while choosing colours); only Apply calls `onApply`,
 * which uses the page's existing `events` update. Mount it fresh per open so
 * Cancel naturally discards the draft.
 */
export function ThemeDesignerModal({ initialTheme, eventName, onClose, onApply }: ThemeDesignerModalProps) {
  const confirm = useConfirm();
  // `draft` holds only valid colours (drives the preview); `texts` holds what the
  // user typed in each HEX box, which may be temporarily invalid.
  const [draft, setDraft] = useState<EventTheme>(initialTheme);
  const [texts, setTexts] = useState<EventTheme>(initialTheme);
  const [activeField, setActiveField] = useState<ThemeFieldKey>('theme_primary');
  const [screen, setScreen] = useState<PreviewScreen>('home');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const sectionRefs = useRef<Partial<Record<ThemeFieldKey, HTMLDivElement | null>>>({});

  const invalidFields = THEME_FIELD_KEYS.filter((k) => normalizeHex(texts[k]) === null);
  const dirty = THEME_FIELD_KEYS.some((k) => draft[k] !== initialTheme[k] || texts[k] !== initialTheme[k]);
  const warnings = getReadabilityWarnings(draft);

  const pick = (field: ThemeFieldKey, hex: string) => {
    const n = normalizeHex(hex);
    if (!n) return;
    setDraft((d) => ({ ...d, [field]: n }));
    setTexts((t) => ({ ...t, [field]: n }));
    setActiveField(field);
  };

  const typeHex = (field: ThemeFieldKey, raw: string) => {
    setTexts((t) => ({ ...t, [field]: raw }));
    const n = normalizeHex(raw);
    if (n) setDraft((d) => ({ ...d, [field]: n }));
  };

  const replaceAll = (theme: EventTheme) => {
    setDraft(theme);
    setTexts(theme);
  };

  const selectFromPreview = (field: ThemeFieldKey) => {
    setActiveField(field);
    const el = sectionRefs.current[field];
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    el?.focus({ preventScroll: true });
  };

  const requestClose = async () => {
    if (saving) return;
    if (dirty) {
      const discard = await confirm({
        title: 'Discard theme changes?',
        message: "Your colour changes haven't been applied. Your event will keep its current theme.",
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        destructive: true,
      });
      if (!discard) return;
    }
    onClose();
  };

  const handleApply = async () => {
    if (saving || invalidFields.length > 0) return;
    setSaving(true);
    setSaveError(null);
    const error = await onApply(draft);
    setSaving(false);
    if (error) setSaveError(error);
    else onClose();
  };

  const matchesTheme = (theme: EventTheme) => THEME_FIELD_KEYS.every((k) => draft[k] === theme[k] && texts[k] === theme[k]);

  return (
    <FormModal open onClose={requestClose} title="Customize event theme" maxWidthClassName="max-w-6xl">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6">
        {/* Preview first on small screens so people see what they're changing */}
        <section aria-label="Live preview" className="order-first lg:order-last lg:sticky lg:top-0 self-start flex flex-col items-center gap-3">
          <div className="inline-flex rounded-full border border-outline-variant p-0.5" role="group" aria-label="Preview screen">
            {(['home', 'agenda'] as PreviewScreen[]).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={screen === s}
                onClick={() => setScreen(s)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${screen === s ? 'bg-primary text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-low'}`}
              >
                {s === 'home' ? 'Home screen' : 'Agenda screen'}
              </button>
            ))}
          </div>
          <EventThemePreview theme={draft} eventName={eventName} screen={screen} activeField={activeField} onSelectField={selectFromPreview} />
        </section>

        <div className="space-y-4 min-w-0">
          <p className="text-sm text-on-surface-variant">
            Pick a colour and watch the preview. Nothing changes for attendees until you press <span className="font-semibold text-on-surface">Apply theme</span>.
          </p>

          <div>
            <p className="text-[11px] font-semibold text-on-surface-variant mb-1.5">Start from a Bendie theme</p>
            <div className="flex flex-wrap gap-2">
              {BENDIE_THEME_PRESETS.map((p) => {
                const selected = matchesTheme(p.theme);
                return (
                  <button
                    key={p.label}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => replaceAll(p.theme)}
                    className={`inline-flex items-center gap-2 rounded-full border-2 px-3 py-1.5 text-sm transition ${selected ? 'border-on-surface font-semibold' : 'border-outline-variant hover:border-primary'}`}
                  >
                    <span className="flex -space-x-1" aria-hidden="true">
                      {THEME_FIELD_KEYS.map((k) => (
                        <span key={k} className="w-4 h-4 rounded-full border border-white ring-1 ring-outline-variant" style={{ backgroundColor: p.theme[k] }} />
                      ))}
                    </span>
                    {p.label}
                    {selected && <span className="material-symbols-outlined text-[16px]" aria-hidden="true">check</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {THEME_FIELD_KEYS.map((k) => (
            <ColourControl
              key={k}
              field={k}
              value={draft[k]}
              text={texts[k]}
              active={activeField === k}
              warning={warnings.find((w) => w.field === k)?.message ?? null}
              onActivate={() => setActiveField(k)}
              onPick={(hex) => pick(k, hex)}
              onText={(raw) => typeHex(k, raw)}
              sectionRef={(el) => {
                sectionRefs.current[k] = el;
              }}
            />
          ))}
        </div>
      </div>

      <div className="sticky -bottom-6 -mx-6 -mb-6 mt-6 px-6 py-4 bg-white border-t border-outline-variant rounded-b-[20px]">
        {saveError && (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-error bg-error-container p-2.5" role="alert">
            <span className="material-symbols-outlined text-error text-[18px]" aria-hidden="true">error</span>
            <p className="text-xs text-on-error-container">
              <span className="font-semibold">Theme not saved.</span> {saveError} Your choices are still here — try again.
            </p>
          </div>
        )}
        {invalidFields.length > 0 && (
          <p className="mb-3 text-xs text-error">
            Fix the colour code for {invalidFields.map((k) => THEME_FIELDS[k].name.toLowerCase()).join(' and ')} before applying.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => replaceAll(BENDIE_APP_DEFAULT_THEME)} disabled={saving || matchesTheme(BENDIE_APP_DEFAULT_THEME)} className="btn-secondary">
            Reset to Bendie default
          </button>
          <button type="button" onClick={() => replaceAll(initialTheme)} disabled={saving || !dirty} className="btn-secondary">
            Undo changes
          </button>
          <div className="flex gap-2 ml-auto">
            <button type="button" onClick={requestClose} disabled={saving} className="btn-secondary">
              Cancel
            </button>
            <button type="button" onClick={handleApply} disabled={saving || !dirty || invalidFields.length > 0} className="btn-primary">
              {saving ? 'Applying…' : 'Apply theme'}
            </button>
          </div>
        </div>
      </div>
    </FormModal>
  );
}
