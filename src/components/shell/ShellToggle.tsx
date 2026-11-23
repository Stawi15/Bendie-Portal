'use client';

import { useShell } from '@/components/shell/ShellContext';

/** Feature 030 — account-menu item that switches between the current layout and the Studio 2.0 shell. */
export function ShellToggle({ onDone }: { onDone?: () => void }) {
  const { shell, switchShell } = useShell();
  const next = shell === 'v2' ? 'v1' : 'v2';
  return (
    <button
      type="button"
      onClick={() => {
        onDone?.();
        switchShell(next);
      }}
      className="w-full text-left px-4 py-2 text-sm text-on-surface hover:bg-surface-container-low"
    >
      {next === 'v2' ? 'Try the new layout' : 'Back to the current layout'}
    </button>
  );
}
