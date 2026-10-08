'use client';

import { useEffect, useId, useRef, useState } from 'react';

export type RowAction = {
  label: string;
  icon: string;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

type RowActionsMenuProps = {
  actions: RowAction[];
  /** Accessible name of the trigger, e.g. "Actions for Opening Keynote". */
  label: string;
};

/**
 * Feature 016 density pass — compact "⋯" overflow menu for secondary row
 * actions (Edit / Delete …), so record rows don't each carry several
 * permanent buttons. Keyboard: Enter/Space/ArrowDown opens and focuses the
 * first item, ArrowUp/ArrowDown move, Escape closes and returns focus.
 *
 * Positioned absolutely, so only use it where no ancestor clips overflow
 * (tables inside `overflow-x-auto` cards should keep inline `.btn-icon`s).
 */
export function RowActionsMenu({ actions, label }: RowActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    return () => document.removeEventListener('mousedown', onPointer);
  }, [open]);

  const focusItem = (index: number) => {
    const enabled = actions.map((a, i) => (a.disabled ? -1 : i)).filter((i) => i >= 0);
    if (enabled.length === 0) return;
    const target = enabled[(index + enabled.length) % enabled.length];
    itemRefs.current[target]?.focus();
  };

  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  return (
    <div ref={rootRef} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        className="btn-icon"
        aria-label={label}
        title="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            requestAnimationFrame(() => focusItem(0));
          }
        }}
      >
        <span className="material-symbols-outlined text-[20px]" aria-hidden="true">more_horiz</span>
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className="absolute right-0 top-full mt-1 z-30 min-w-[160px] bg-white rounded-xl panel-shadow border border-outline-variant py-1"
          onKeyDown={(e) => {
            const current = itemRefs.current.findIndex((el) => el === document.activeElement);
            if (e.key === 'Escape') {
              e.preventDefault();
              close();
            } else if (e.key === 'ArrowDown') {
              e.preventDefault();
              focusItem(current + 1);
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              focusItem(current - 1);
            } else if (e.key === 'Tab') {
              close(false);
            }
          }}
        >
          {actions.map((action, i) => (
            <button
              key={action.label}
              ref={(el) => {
                itemRefs.current[i] = el;
              }}
              type="button"
              role="menuitem"
              disabled={action.disabled}
              onClick={() => {
                close(false);
                action.onSelect();
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors disabled:opacity-40 focus:outline-none focus-visible:bg-surface-container-low ${
                action.destructive ? 'text-error hover:bg-error/5' : 'text-on-surface hover:bg-surface-container-low'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">{action.icon}</span>
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
