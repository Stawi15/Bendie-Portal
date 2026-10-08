import type { ReactNode } from 'react';

type EmptyStateProps = {
  icon: string;
  /** What is missing, e.g. "No speakers yet". */
  title: string;
  /** One or two sentences: what this is and why/where it's used. */
  description?: ReactNode;
  /** Primary + secondary actions (only those the viewer is allowed to use). */
  actions?: ReactNode;
};

/**
 * Feature 016 density pass — the one empty-state layout for record lists:
 * what this is, why it matters, what to do next. Compact (py-10), centred,
 * inside the standard white card.
 */
export function EmptyState({ icon, title, description, actions }: EmptyStateProps) {
  return (
    <div className="text-center py-10 px-6 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow">
      <p className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-2" aria-hidden="true">
        {icon}
      </p>
      <p className="font-medium text-on-surface">{title}</p>
      {description && <p className="text-sm text-on-surface-variant mt-1 max-w-md mx-auto">{description}</p>}
      {actions && <div className="flex flex-wrap justify-center gap-2 mt-4">{actions}</div>}
    </div>
  );
}
