'use client';

export type AttentionItem = {
  id: string;
  icon: string;
  iconClass: string;
  bgClass: string;
  title: string;
  subtitle: string;
};

type NeedsAttentionCardProps = {
  items: AttentionItem[];
  loading: boolean;
};

export function NeedsAttentionCard({ items, loading }: NeedsAttentionCardProps) {
  return (
    <div className="bg-white p-6 rounded-[20px] border border-[#E4EAF0] panel-shadow">
      <h4 className="font-headline-sm text-headline-sm mb-4">Needs Attention</h4>
      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-14 bg-surface-container-low rounded-xl animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl border border-green-100">
          <span className="material-symbols-outlined text-green-600">check_circle</span>
          <p className="text-label-sm font-label-sm text-on-surface">You&apos;re all caught up</p>
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <div key={item.id} className={`flex gap-3 p-3 rounded-xl border ${item.bgClass}`}>
              <span className={`material-symbols-outlined ${item.iconClass}`}>{item.icon}</span>
              <div className="min-w-0">
                <p className="text-label-sm font-label-sm text-on-surface">{item.title}</p>
                <p className="text-xs text-on-surface-variant">{item.subtitle}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
