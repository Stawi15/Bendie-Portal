'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { SectionHeader } from '@/components/portal/SectionHeader';
import toast from 'react-hot-toast';

type ThemeForm = {
  theme_primary: string;
  theme_secondary: string;
  theme_tertiary: string;
};

const DEFAULTS = { theme_primary: '#3B82F6', theme_secondary: '#1D4ED8', theme_tertiary: '#DBEAFE' };

/**
 * Feature 016 Theme Colour Picker pass — curated from this codebase's own
 * existing design tokens (`tailwind.config.js`), never invented. These are
 * the Portal's own real brand/surface colours, offered here as shortcuts —
 * event organisers remain free to pick anything.
 */
const PRESETS: { label: string; value: string }[] = [
  { label: 'Portal Blue', value: '#00629D' },
  { label: 'Bendie Brown', value: '#8C4F06' },
  { label: 'Slate', value: '#555E74' },
  { label: 'Near Black', value: '#111C2D' },
  { label: 'White', value: '#FFFFFF' },
];

/** Accepts "1E3A8A", "#1e3a8a", or already-correct "#1E3A8A" — normalizes to "#RRGGBB" uppercase. Returns null if not a valid six-digit HEX under any of those forms. */
function normalizeHex(raw: string): string | null {
  const trimmed = raw.trim().replace(/^#/, '');
  if (!/^[0-9A-Fa-f]{6}$/.test(trimmed)) return null;
  return `#${trimmed.toUpperCase()}`;
}

/** WCAG relative luminance → contrast ratio, the standard formula. Lightweight, pure, no dependency. */
function relativeLuminance(hex: string): number {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

type ColorFieldProps = {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
  recentColors: string[];
};

function ColorField({ label, hint, value, onChange, recentColors }: ColorFieldProps) {
  // Local draft so an in-progress, momentarily-invalid HEX (e.g. the user is
  // still typing) never gets silently discarded or auto-corrected mid-keystroke
  // — validation only reports a problem, it never clears what the user typed.
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const normalized = normalizeHex(draft);
  const isValid = normalized !== null;

  const commitIfValid = (next: string) => {
    setDraft(next);
    const n = normalizeHex(next);
    if (n) onChange(n);
  };

  return (
    <div className="flex flex-col gap-3 p-4 bg-surface-container-low rounded-xl border border-outline-variant">
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={isValid ? normalized : '#000000'}
          onChange={(e) => commitIfValid(e.target.value)}
          className="w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent p-0 flex-shrink-0"
          aria-label={`${label} visual picker`}
        />
        <div className="min-w-0">
          <p className="font-medium text-on-surface text-sm">{label}</p>
          <p className="text-xs text-on-surface-variant truncate">{hint}</p>
        </div>
        <div
          className="w-12 h-12 rounded-xl border border-outline-variant shadow-inner ml-auto flex-shrink-0"
          style={{ backgroundColor: isValid ? normalized : '#ccc' }}
          aria-hidden="true"
        />
      </div>

      <div>
        <label className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant/70">HEX</label>
        <input
          className={`input text-sm font-mono ${!isValid ? 'border-error' : ''}`}
          value={draft}
          onChange={(e) => commitIfValid(e.target.value)}
          placeholder="#3B82F6"
        />
        {!isValid && <p className="text-xs text-error mt-1">Enter a valid HEX colour, e.g. #3B82F6.</p>}
      </div>

      <div>
        <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant/70 mb-1.5">Recommended</p>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              title={p.label}
              onClick={() => commitIfValid(p.value)}
              className={`w-7 h-7 rounded-full border-2 transition ${isValid && normalized === p.value ? 'border-primary' : 'border-white shadow-sm'}`}
              style={{ backgroundColor: p.value }}
            />
          ))}
        </div>
      </div>

      {recentColors.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide text-on-surface-variant/70 mb-1.5">Recently Used</p>
          <div className="flex flex-wrap gap-1.5">
            {recentColors.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                onClick={() => commitIfValid(c)}
                className={`w-7 h-7 rounded-full border-2 transition ${isValid && normalized === c ? 'border-primary' : 'border-white shadow-sm'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ThemePage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [form, setForm] = useState<ThemeForm>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Session-only, never persisted (item 7 — "do not create database storage
  // just for recent colours") — cleared on refresh, purely a same-session
  // convenience across the three colour fields on this one page.
  const [recentColors, setRecentColors] = useState<string[]>([]);

  useEffect(() => {
    if (!eventId) return;
    supabase.from('events').select('theme_primary,theme_secondary,theme_tertiary').eq('id', eventId).single().then(({ data, error }) => {
      if (error) toast.error('Failed to load');
      else if (data) setForm({
        theme_primary: data.theme_primary ?? DEFAULTS.theme_primary,
        theme_secondary: data.theme_secondary ?? DEFAULTS.theme_secondary,
        theme_tertiary: data.theme_tertiary ?? DEFAULTS.theme_tertiary,
      });
      setLoading(false);
    });
  }, [eventId]);

  const set = (field: keyof ThemeForm) => (v: string) => {
    setForm((prev) => ({ ...prev, [field]: v }));
    setRecentColors((prev) => [v, ...prev.filter((c) => c !== v)].slice(0, 6));
  };

  const handleReset = () => setForm(DEFAULTS);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from('events').update({
      theme_primary: form.theme_primary || null,
      theme_secondary: form.theme_secondary || null,
      theme_tertiary: form.theme_tertiary || null,
    }).eq('id', eventId);
    if (error) toast.error(error.message);
    else toast.success('Theme colors saved');
    setSaving(false);
  };

  if (loading) return <div className="animate-pulse h-96 bg-surface-container-low rounded-[20px]" />;

  // Contrast warning (item 9) — lightweight, educational only, never blocks
  // Save. Checks exactly the two pairings the preview below actually renders
  // as white text on a coloured background (Primary/Secondary); Tertiary's
  // preview intentionally uses dark text, so it isn't part of this check.
  const primaryValid = normalizeHex(form.theme_primary);
  const secondaryValid = normalizeHex(form.theme_secondary);
  const lowContrastPairs: string[] = [];
  if (primaryValid && contrastRatio(primaryValid, '#FFFFFF') < 4.5) lowContrastPairs.push('Primary');
  if (secondaryValid && contrastRatio(secondaryValid, '#FFFFFF') < 4.5) lowContrastPairs.push('Secondary');

  return (
    <div>
      <div className="mb-6">
        <SectionHeader sectionKey="theme" />
      </div>

      <div className="bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow p-6 sm:p-8 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ColorField label="Primary Color" hint="Main brand color — buttons, highlights, CTAs" value={form.theme_primary} onChange={set('theme_primary')} recentColors={recentColors} />
          <ColorField label="Secondary Color" hint="Supporting brand color — hover states, accents" value={form.theme_secondary} onChange={set('theme_secondary')} recentColors={recentColors} />
          <ColorField label="Tertiary Color" hint="Background tints, badges, subtle fills" value={form.theme_tertiary} onChange={set('theme_tertiary')} recentColors={recentColors} />
        </div>

        {lowContrastPairs.length > 0 && (
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
            <span className="material-symbols-outlined text-amber-600 text-[20px]">warning</span>
            <div>
              <p className="text-sm font-medium text-amber-800">Low contrast</p>
              <p className="text-xs text-amber-700 mt-0.5">
                {lowContrastPairs.join(' and ')} {lowContrastPairs.length === 1 ? 'is' : 'are'} a light colour with white text on it — this may be difficult to read. You can still save as-is.
              </p>
            </div>
          </div>
        )}

        {/* Live preview — local only, never saved until the Save button below is pressed */}
        <div className="rounded-xl overflow-hidden border border-outline-variant grid grid-cols-1 lg:grid-cols-3">
          <div className="p-4 text-white text-sm font-semibold" style={{ backgroundColor: primaryValid ?? '#ccc' }}>
            Primary — Buttons, nav highlights
          </div>
          <div className="p-4 text-white text-sm font-semibold" style={{ backgroundColor: secondaryValid ?? '#ccc' }}>
            Secondary — Hover states, accents
          </div>
          <div className="p-4 text-sm font-semibold" style={{ backgroundColor: normalizeHex(form.theme_tertiary) ?? '#ccc' }}>
            Tertiary — Background tints, badges
          </div>
        </div>

        <div className="pt-2 border-t border-outline-variant flex flex-wrap items-center gap-3">
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Save Colors'}
          </button>
          <button type="button" onClick={handleReset} className="btn-secondary">
            Reset to Default
          </button>
        </div>
      </div>
    </div>
  );
}
