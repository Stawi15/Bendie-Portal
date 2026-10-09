'use client';

import { useCallback, useEffect, useId, useRef } from 'react';
import { useConfirm } from '@/contexts/ConfirmContext';

type FormModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidthClassName?: string;
  /**
   * Feature 016 (density & organizer-experience pass): when the user has typed or
   * changed anything inside the modal, closing via the backdrop, ✕ or Escape asks
   * before discarding it. A page's own "Cancel" button still closes directly (an
   * explicit discard). Pass `false` when the caller already runs its own discard
   * confirmation (Theme Designer) so the user is never asked twice.
   */
  confirmDiscard?: boolean;
};

/**
 * Standard shell for every add/edit form in the portal. Always a centered
 * modal — never an inline panel above a list — so editing an item deep in a
 * long list doesn't yank the page back to the top with no visual connection
 * to what was clicked.
 *
 * Dirty detection is deliberately generic (any `input`/`change` event inside the
 * dialog since it opened), so every existing form gets protection without
 * per-page wiring and without any network work.
 */
export function FormModal({ open, onClose, title, children, maxWidthClassName = 'max-w-3xl', confirmDiscard = true }: FormModalProps) {
  const confirm = useConfirm();
  const titleId = useId();
  const dirtyRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // A fresh open starts clean.
  useEffect(() => {
    if (open) dirtyRef.current = false;
  }, [open]);

  const requestClose = useCallback(async () => {
    if (confirmDiscard && dirtyRef.current) {
      const discard = await confirm({
        title: 'Discard your changes?',
        message: 'You have entered information in this form that hasn’t been saved.',
        confirmLabel: 'Discard',
        cancelLabel: 'Keep editing',
        destructive: true,
      });
      if (!discard) return;
    }
    onClose();
  }, [confirmDiscard, confirm, onClose]);

  // Escape closes (through the same unsaved-changes check). Nested pop-ups inside the
  // form (menus, the confirm dialog) handle their own Escape first.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (dialogRef.current && !dialogRef.current.contains(document.activeElement) && document.activeElement !== document.body) return;
      e.preventDefault();
      requestClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, requestClose]);

  if (!open) return null;

  // Search/filter boxes inside a modal (marked data-ignore-dirty) aren't unsaved work.
  const markDirty = (e: React.SyntheticEvent) => {
    if ((e.target as HTMLElement).closest?.('[data-ignore-dirty]')) return;
    dirtyRef.current = true;
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-3 sm:p-4" onClick={requestClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`bg-white rounded-[20px] panel-shadow p-5 w-full ${maxWidthClassName} max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
        onInput={markDirty}
        onChange={markDirty}
      >
        <div className="flex items-start justify-between gap-4 mb-3">
          <h2 id={titleId} className="font-headline-sm text-headline-sm text-on-surface">
            {title}
          </h2>
          <button
            type="button"
            onClick={requestClose}
            className="flex-shrink-0 p-1.5 -m-1.5 rounded-full text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors"
            aria-label="Close"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">close</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
