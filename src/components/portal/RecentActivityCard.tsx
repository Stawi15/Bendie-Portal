'use client';

export type ActivityEntry = {
  id: string;
  actorName: string;
  description: string;
  timestamp: string;
  dotClass: string;
};

type RecentActivityCardProps = {
  entries: ActivityEntry[];
  loading: boolean;
};

export function RecentActivityCard({ entries, loading }: RecentActivityCardProps) {
  return (
    <div className="bg-white p-6 rounded-[20px] border border-[#E4EAF0] panel-shadow">
      <div className="flex justify-between items-center mb-6">
        <h4 className="font-headline-sm text-headline-sm">Recent Activity</h4>
        <span className="material-symbols-outlined text-on-surface-variant">history</span>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-10 bg-surface-container-low rounded-xl animate-pulse" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-on-surface-variant text-center py-4">No activity recorded yet.</p>
      ) : (
        <div className="space-y-6 relative before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-surface-container-high">
          {entries.map((entry) => (
            <div key={entry.id} className="relative flex gap-4">
              <div className={`w-6 h-6 rounded-full border-4 border-white z-10 ${entry.dotClass}`} />
              <div className="min-w-0">
                <p className="text-label-sm font-label-sm text-on-surface">
                  <span className="font-bold">{entry.actorName}</span> {entry.description}
                </p>
                <p className="text-xs text-on-surface-variant mt-0.5">{entry.timestamp}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
