'use client';

import Link from 'next/link';
import type { EventRow } from '@/lib/eventColumns';
import type { EventStats } from '@/lib/eventStats';
import type { ProductKey } from '@/lib/productNavigation';

type Event = EventRow;

type NextMilestoneCardProps = {
  event: Event | null;
  stats: EventStats | undefined;
  loading: boolean;
  /** Feature 006: carries the product-origin signal, same as EventsOverviewPanel's entry link. */
  product?: ProductKey;
};

export function NextMilestoneCard({ event, stats, loading, product }: NextMilestoneCardProps) {
  if (loading) {
    return <div className="h-64 bg-white rounded-[20px] border border-[#E4EAF0] panel-shadow animate-pulse" />;
  }

  if (!event) {
    return (
      <div className="bg-white p-6 rounded-[20px] border border-[#E4EAF0] panel-shadow text-center">
        <p className="text-on-surface-variant text-sm">No upcoming events scheduled.</p>
      </div>
    );
  }

  const daysLeft = event.starts_at
    ? Math.max(0, Math.ceil((new Date(event.starts_at).getTime() - Date.now()) / 86_400_000))
    : null;
  const progress = stats?.progress ?? 0;

  const dateRange =
    event.starts_at && event.ends_at
      ? `${new Date(event.starts_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' })} - ${new Date(
          event.ends_at
        ).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}`
      : event.starts_at
        ? new Date(event.starts_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })
        : 'Date TBC';

  return (
    <div className="bg-white rounded-[20px] border border-[#E4EAF0] panel-shadow overflow-hidden">
      <div className="h-32 bg-primary relative">
        <div className="absolute inset-0 p-6 flex flex-col justify-end text-white">
          <span className="px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm text-[10px] font-bold uppercase tracking-wider self-start mb-2">
            Next Milestone
          </span>
          <h5 className="font-headline-sm text-headline-sm leading-tight truncate">{event.name}</h5>
        </div>
      </div>
      <div className="p-6">
        <div className="flex items-center gap-4 mb-6">
          <div className="text-center">
            <p className="text-headline-md font-headline-md text-primary leading-none">{daysLeft ?? '—'}</p>
            <p className="text-[10px] font-bold uppercase text-on-surface-variant tracking-wider">Days left</p>
          </div>
          <div className="flex-1">
            <div className="flex justify-between items-center mb-1.5">
              <p className="text-label-sm font-label-sm text-on-surface-variant">Setup Progress</p>
              <p className="text-label-sm font-label-sm text-on-surface">{progress}%</p>
            </div>
            <div className="h-2 bg-surface-container-low rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
        <div className="space-y-3 pt-4 border-t border-outline-variant/30">
          <div className="flex items-center gap-3 text-on-surface-variant">
            <span className="material-symbols-outlined text-[18px]">calendar_month</span>
            <span className="text-body-sm font-body-sm">{dateRange}</span>
          </div>
          <div className="flex items-center gap-3 text-on-surface-variant">
            <span className="material-symbols-outlined text-[18px]">location_on</span>
            <span className="text-body-sm font-body-sm">{event.location ?? 'Location TBC'}</span>
          </div>
        </div>
        <Link
          href={
            product
              ? `/portal/events/${event.id}/${product === 'planner' ? 'planner-overview' : 'dashboard'}?product=${product}`
              : `/portal/events/${event.id}/dashboard`
          }
          className="block text-center w-full mt-6 py-3 border border-outline-variant rounded-xl font-label-md text-label-md hover:bg-surface-container-low transition-colors"
        >
          Manage Event
        </Link>
      </div>
    </div>
  );
}
