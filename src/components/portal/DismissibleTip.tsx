'use client';

import { useEffect, useState, type ReactNode } from 'react';

type DismissibleTipProps = {
  /** Stable id — dismissal is remembered per browser under this key. */
  id: string;
  title: string;
  children: ReactNode;
  /** Label for the small link that re-opens a dismissed tip. */
  showAgainLabel?: string;
  icon?: string;
};

const storageKey = (id: string) => `bendie.portal.tip.${id}`;

/**
 * Feature 016 (reliability pass) — instructional guidance the user can close.
 * ONLY for optional help (explanations, tips). Never use it for validation
 * errors, security warnings, destructive-action warnings or required notices —
 * those must stay visible.
 *
 * Remembered in localStorage (per browser; no request, no table — it's purely
 * instructional). A dismissed tip collapses to a small "Show help" link, so the
 * information is never permanently lost.
 */
export function DismissibleTip({ id, title, children, showAgainLabel = 'Show help', icon = 'lightbulb' }: DismissibleTipProps) {
  // Render expanded on the server/first paint; apply the stored choice after mount.
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(storageKey(id)) === '1');
    } catch {
      // Storage unavailable — the tip simply stays visible.
    }
  }, [id]);

  const update = (next: boolean) => {
    setDismissed(next);
    try {
      if (next) localStorage.setItem(storageKey(id), '1');
      else localStorage.removeItem(storageKey(id));
    } catch {
      // Ignore — dismissal still applies for this view.
    }
  };

  if (dismissed) {
    return (
      <button type="button" onClick={() => update(false)} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
        <span className="material-symbols-outlined text-[16px]" aria-hidden="true">help</span>
        {showAgainLabel}
      </button>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/5 p-3" role="note">
      <span className="material-symbols-outlined text-primary text-[20px] flex-shrink-0" aria-hidden="true">{icon}</span>
      <div className="flex-1 min-w-0 text-sm text-on-surface">
        <p className="font-semibold">{title}</p>
        <div className="mt-0.5 text-on-surface-variant">{children}</div>
      </div>
      <button type="button" onClick={() => update(true)} className="flex-shrink-0 text-xs font-semibold text-primary hover:underline">
        Got it
      </button>
    </div>
  );
}
