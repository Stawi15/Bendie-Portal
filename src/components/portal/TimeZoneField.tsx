'use client';

import { useMemo } from 'react';
import { listTimeZones, utcOffsetLabel } from '@/lib/eventTimeZone';

type TimeZoneFieldProps = {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  disabled?: boolean;
};

/**
 * Feature 024 — searchable IANA time zone picker (create form and basics page).
 * Uses the Portal's existing `input list=` + `<datalist>` pattern (see
 * info-center), so typing "kig" offers `Africa/Kigali`. Validation (only listed
 * names) is the caller's job, via `isListedTimeZone`.
 */
export function TimeZoneField({ id, label, value, onChange, error, hint, disabled }: TimeZoneFieldProps) {
  // Offsets computed once per mount, not on every keystroke (~420 zones).
  const options = useMemo(() => listTimeZones().map((zone) => ({ zone, offset: utcOffsetLabel(zone) })), []);
  const offset = value ? utcOffsetLabel(value) : '';
  const describedBy = [error ? `${id}-error` : '', hint ? `${id}-hint` : ''].filter(Boolean).join(' ') || undefined;

  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          className={`input ${offset ? 'pr-24' : ''} ${error ? 'border-error' : ''}`}
          list={`${id}-options`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search a city, e.g. Nairobi"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          aria-invalid={!!error}
          aria-describedby={describedBy}
        />
        {offset && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-on-surface-variant pointer-events-none">{offset}</span>}
      </div>
      <datalist id={`${id}-options`}>
        {options.map(({ zone, offset: zoneOffset }) => (
          <option key={zone} value={zone} label={zoneOffset} />
        ))}
      </datalist>
      {error && (
        <p id={`${id}-error`} className="text-xs text-error mt-1">
          {error}
        </p>
      )}
      {hint && !error && (
        <p id={`${id}-hint`} className="hint mt-1">
          {hint}
        </p>
      )}
    </div>
  );
}
