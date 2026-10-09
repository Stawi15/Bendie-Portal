type MetricCardProps = {
  icon: string;
  accent: 'primary' | 'secondary';
  value: string | number;
  label: string;
  trendIcon: string;
  trendText: string;
  loading?: boolean;
};

/**
 * Feature 016 density pass — same information (icon, number, label, supporting
 * status), compact layout: icon beside the number instead of stacked above it,
 * p-4 instead of p-6, no decorative oversized background glyph.
 */
export function MetricCard({ icon, accent, value, label, trendIcon, trendText, loading }: MetricCardProps) {
  const iconWrapClass = accent === 'primary' ? 'bg-primary/10 text-primary' : 'bg-secondary/10 text-secondary';
  const trendClass = accent === 'primary' ? 'text-primary' : 'text-secondary';

  return (
    <div className="bg-white px-4 py-3.5 rounded-[20px] border border-[#E4EAF0] panel-shadow">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${iconWrapClass}`}>
          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">{icon}</span>
        </div>
        <div className="min-w-0">
          <p className="text-headline-md font-headline-md leading-none">{loading ? '—' : value}</p>
          <p className="text-label-sm font-label-sm text-on-surface-variant mt-1 truncate">{label}</p>
        </div>
      </div>
      <div className={`mt-2.5 flex items-center gap-1 font-semibold ${trendClass}`}>
        <span className="material-symbols-outlined text-sm" aria-hidden="true">{trendIcon}</span>
        <span className="text-xs truncate">{loading ? '…' : trendText}</span>
      </div>
    </div>
  );
}
