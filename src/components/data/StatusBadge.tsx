/**
 * Feature 031 — status badge with explicit variants (doc 21: "explicit variants,
 * not flags"). Always an icon AND a text label: status is never colour alone
 * (constitution V). Uses the Feature 029 `status-*` tokens.
 */

type BadgeProps = { children: React.ReactNode; icon?: string; title?: string; className?: string };

function Badge({ tone, defaultIcon }: { tone: string; defaultIcon: string }) {
  return function StatusBadgeVariant({ children, icon, title, className = '' }: BadgeProps) {
    return (
      <span
        title={title}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap ${tone} ${className}`}
      >
        <span className="material-symbols-outlined text-[14px] leading-none" aria-hidden="true">
          {icon ?? defaultIcon}
        </span>
        {children}
      </span>
    );
  };
}

export const StatusBadge = {
  Done: Badge({
    tone: 'bg-status-done-bg text-status-done-fg border-status-done-border',
    defaultIcon: 'check_circle',
  }),
  Neutral: Badge({
    tone: 'bg-status-neutral-bg text-status-neutral-fg border-status-neutral-border',
    defaultIcon: 'radio_button_unchecked',
  }),
  Info: Badge({
    tone: 'bg-status-info-bg text-status-info-fg border-status-info-border',
    defaultIcon: 'info',
  }),
  Warning: Badge({
    tone: 'bg-status-warning-bg text-status-warning-fg border-status-warning-border',
    defaultIcon: 'warning',
  }),
  Blocking: Badge({
    tone: 'bg-status-blocking-bg text-status-blocking-fg border-status-blocking-border',
    defaultIcon: 'error',
  }),
};
