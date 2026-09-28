'use client';

import type { SavePhase } from '@/lib/useSaveStatus';

type SaveStatusProps = {
  dirty: boolean;
  phase: SavePhase;
  onRetry: () => void;
};

/**
 * Feature 016 (reliability pass) — the one save-state indicator for settings
 * forms: Unsaved changes → Saving… → ✓ Saved, or Couldn't save + Try again.
 * Never shows "Saved" unless the server confirmed it (see useSaveStatus).
 */
export function SaveStatus({ dirty, phase, onRetry }: SaveStatusProps) {
  if (phase === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-on-surface-variant" role="status">
        <span className="material-symbols-outlined text-[18px] animate-spin" aria-hidden="true">progress_activity</span>
        Saving…
      </span>
    );
  }
  if (phase === 'error') {
    return (
      <span className="inline-flex flex-wrap items-center gap-2 text-sm text-error" role="alert">
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">error</span>
        Couldn&apos;t save your changes — they&apos;re still here.
        <button type="button" onClick={onRetry} className="font-semibold underline hover:no-underline">
          Try again
        </button>
      </span>
    );
  }
  if (dirty) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-amber-700" role="status">
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">edit</span>
        Unsaved changes
      </span>
    );
  }
  if (phase === 'saved') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-green-700" role="status">
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">check_circle</span>
        Saved
      </span>
    );
  }
  return null;
}
