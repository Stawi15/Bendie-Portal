'use client';

import Link from 'next/link';

export type AttentionItem = {
  id: string;
  icon: string;
  iconClass: string;
  bgClass: string;
  title: string;
  subtitle: string;
  /** Feature 016: direct destination when the issue has one unambiguous place to fix it. */
  href?: string;
  actionLabel?: string;
};

type NeedsAttentionCardProps = {
  items: AttentionItem[];
  loading: boolean;
  /** Shown instead of "You're all caught up" when no checks apply to this view. */
  emptyMessage?: string;
};

export function NeedsAttentionCard({ items, loading, emptyMessage }: NeedsAttentionCardProps) {
  return (
    <div className="bg-white p-5 rounded-[20px] border border-[#E4EAF0] panel-shadow">
      <h4 className="font-headline-sm text-headline-sm mb-3">Needs Attention</h4>
      {loading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-12 bg-surface-container-low rounded-xl animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        emptyMessage ? (
          <p className="text-sm text-on-surface-variant">{emptyMessage}</p>
        ) : (
          <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl border border-green-100">
            <span className="material-symbols-outlined text-green-600" aria-hidden="true">check_circle</span>
            <p className="text-label-sm font-label-sm text-on-surface">You&apos;re all caught up</p>
          </div>
        )
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const body = (
              <>
                <span className={`material-symbols-outlined text-[20px] ${item.iconClass}`} aria-hidden="true">{item.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-label-sm font-label-sm text-on-surface">{item.title}</p>
                  <p className="text-xs text-on-surface-variant">{item.subtitle}</p>
                  {item.href && item.actionLabel && (
                    <p className="text-xs font-semibold text-primary mt-1 inline-flex items-center gap-0.5">
                      {item.actionLabel}
                      <span className="material-symbols-outlined text-[14px]" aria-hidden="true">arrow_forward</span>
                    </p>
                  )}
                </div>
              </>
            );
            return (
              <li key={item.id}>
                {item.href ? (
                  <Link href={item.href} className={`flex gap-3 p-3 rounded-xl border hover:shadow-sm transition-shadow ${item.bgClass}`}>
                    {body}
                  </Link>
                ) : (
                  <div className={`flex gap-3 p-3 rounded-xl border ${item.bgClass}`}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
