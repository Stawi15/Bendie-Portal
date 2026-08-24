type MetricCardProps = {
  icon: string;
  accent: 'primary' | 'secondary';
  value: string | number;
  label: string;
  trendIcon: string;
  trendText: string;
  loading?: boolean;
};

export function MetricCard({ icon, accent, value, label, trendIcon, trendText, loading }: MetricCardProps) {
  const iconWrapClass = accent === 'primary' ? 'bg-primary/10 text-primary' : 'bg-secondary/10 text-secondary';
  const bgIconClass = accent === 'primary' ? 'text-primary' : 'text-secondary';
  const trendClass = accent === 'primary' ? 'text-primary' : 'text-secondary';

  return (
    <div className="bg-white p-6 rounded-[20px] border border-[#E4EAF0] panel-shadow relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
        <span className={`material-symbols-outlined text-5xl ${bgIconClass}`}>{icon}</span>
      </div>
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-4 ${iconWrapClass}`}>
        <span className="material-symbols-outlined">{icon}</span>
      </div>
      <h3 className="text-headline-md font-headline-md mb-1">{loading ? '—' : value}</h3>
      <p className="text-label-sm font-label-sm text-on-surface-variant">{label}</p>
      <div className={`mt-4 flex items-center gap-1 font-semibold ${trendClass}`}>
        <span className="material-symbols-outlined text-sm">{trendIcon}</span>
        <span className="text-xs">{loading ? '…' : trendText}</span>
      </div>
    </div>
  );
}
