'use client';

type FormModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidthClassName?: string;
};

/**
 * Standard shell for every add/edit form in the portal. Always a centered
 * modal — never an inline panel above a list — so editing an item deep in a
 * long list doesn't yank the page back to the top with no visual connection
 * to what was clicked.
 */
export function FormModal({ open, onClose, title, children, maxWidthClassName = 'max-w-3xl' }: FormModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className={`bg-white rounded-[20px] panel-shadow p-6 w-full ${maxWidthClassName} max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <h2 className="font-headline-sm text-headline-sm text-on-surface">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 p-1.5 -m-1.5 rounded-full text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors"
            aria-label="Close"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
