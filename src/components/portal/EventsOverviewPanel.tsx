'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { EventRow } from '@/lib/eventColumns';
import type { EventStats } from '@/lib/eventStats';
import { deriveEventLifecycle, EVENT_LIFECYCLE_LABELS, EVENT_LIFECYCLE_PILL_CLASSES } from '@/lib/eventLifecycle';
import type { ProductKey } from '@/lib/productNavigation';

type Event = EventRow;

type Tab = 'all' | 'draft' | 'upcoming' | 'live';
const TABS: { key: Tab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'live', label: 'Live' },
];

const TYPE_ICONS: Record<string, string> = {
  conference: 'business_center',
  teambuilding: 'landscape',
  hybrid: 'hub',
};

// Navigation pass (016 continuation 4) — now the single canonical
// `deriveEventLifecycle` helper, replacing this file's own compound
// `status === 'published' && starts_at > now` logic (which was duplicated,
// identically, in OrganizationHome.tsx — see eventLifecycle.ts for why).
function matchesTab(event: Event, tab: Tab): boolean {
  if (tab === 'all') return true;
  const lifecycle = deriveEventLifecycle(event);
  if (tab === 'draft') return lifecycle === 'draft';
  if (tab === 'live') return lifecycle === 'active';
  if (tab === 'upcoming') return lifecycle === 'upcoming';
  return true;
}

type EventsOverviewPanelProps = {
  events: Event[];
  statsMap: Record<string, EventStats>;
  loading: boolean;
  /** Omit (or pass undefined) when the caller isn't permitted to create an event -- hides the empty-state button. */
  onCreateEvent?: () => void;
  title?: string;
  /** Max rows to show; omit to show every event matching the active tab. */
  limit?: number;
  showFooterLink?: boolean;
  /**
   * Feature 006: when supplied, every row's entry link carries the explicit
   * `?product=` origin signal and targets that product's entry tab
   * (`planner-overview` for planner, `dashboard` for bendie) instead of the
   * legacy hardcoded `.../dashboard`. Omitted call sites keep today's exact
   * behavior (FR-040/FR-041).
   */
  product?: ProductKey;
};

const PRODUCT_LABEL: Record<ProductKey, string> = { bendie: 'Bendie', planner: 'Bendie Planner' };

export function EventsOverviewPanel({
  events,
  statsMap,
  loading,
  onCreateEvent,
  title = 'Events Overview',
  limit,
  showFooterLink = true,
  product,
}: EventsOverviewPanelProps) {
  const [tab, setTab] = useState<Tab>('all');
  const tabFiltered = events.filter((e) => matchesTab(e, tab));
  const filtered = limit ? tabFiltered.slice(0, limit) : tabFiltered;

  return (
    <div className="bg-white rounded-[20px] border border-[#E4EAF0] panel-shadow flex flex-col">
      <div className="px-4 sm:px-lg py-6 border-b border-outline-variant flex flex-wrap gap-3 justify-between items-center">
        <h4 className="font-headline-sm text-headline-sm">{title}</h4>
        <div className="flex bg-surface-container-low p-1 rounded-xl">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-1.5 text-label-sm font-label-sm rounded-lg transition-colors ${
                tab === t.key ? 'bg-white text-primary panel-shadow' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="p-6 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-surface-container-low rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 px-6">
          <p className="text-on-surface-variant text-sm mb-4">
            {product
              ? `No ${PRODUCT_LABEL[product]} events in this view yet.`
              : 'No events in this view yet.'}
          </p>
          {onCreateEvent && (
            <button onClick={onCreateEvent} className="btn-primary">
              Create Event
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-surface-container-low/50">
              <tr>
                <th className="px-4 sm:px-lg py-4 font-label-md text-label-md text-on-surface-variant">Event</th>
                <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant hidden sm:table-cell">
                  Location
                </th>
                <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant hidden md:table-cell">
                  People
                </th>
                <th className="px-6 py-4 font-label-md text-label-md text-on-surface-variant">Progress</th>
                <th className="px-4 sm:px-lg py-4 font-label-md text-label-md text-on-surface-variant text-right">
                  Status
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/30">
              {filtered.map((event) => {
                const stats = statsMap[event.id];
                const icon = TYPE_ICONS[event.event_type] ?? 'event';
                return (
                  <tr key={event.id} className="hover:bg-surface-container-low/20 transition-colors">
                    <td className="px-4 sm:px-lg py-5">
                      <Link
                        href={
                          product
                            ? `/portal/events/${event.id}/${product === 'planner' ? 'planner-overview' : 'dashboard'}?product=${product}`
                            : `/portal/events/${event.id}/dashboard`
                        }
                        className="flex items-center gap-3"
                      >
                        <div className="w-10 h-10 rounded-lg bg-primary-container/20 flex items-center justify-center flex-shrink-0">
                          <span className="material-symbols-outlined text-primary">{icon}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="font-label-md text-label-md text-on-surface truncate">{event.name}</p>
                          <p className="text-xs text-on-surface-variant">
                            {event.starts_at
                              ? new Date(event.starts_at).toLocaleDateString('en-ZA', {
                                  day: 'numeric',
                                  month: 'short',
                                  year: 'numeric',
                                })
                              : 'No date set'}
                          </p>
                        </div>
                      </Link>
                    </td>
                    <td className="px-6 py-5 hidden sm:table-cell">
                      <span className="flex items-center gap-1 text-body-sm font-body-sm text-on-surface-variant">
                        <span className="material-symbols-outlined text-sm">location_on</span>
                        {event.location ?? '—'}
                      </span>
                    </td>
                    <td className="px-6 py-5 hidden md:table-cell">
                      <span className="flex items-center gap-1 text-body-sm font-body-sm text-on-surface-variant">
                        <span className="material-symbols-outlined text-sm">group</span>
                        {stats?.peopleCount ?? 0}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3 min-w-[100px]">
                        <div className="flex-1 h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
                          <div className="h-full bg-primary" style={{ width: `${stats?.progress ?? 0}%` }} />
                        </div>
                        <span className="text-xs font-semibold text-on-surface">{stats?.progress ?? 0}%</span>
                      </div>
                    </td>
                    <td className="px-4 sm:px-lg py-5 text-right">
                      {(() => {
                        const lifecycle = deriveEventLifecycle(event);
                        return (
                          <span className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${EVENT_LIFECYCLE_PILL_CLASSES[lifecycle]}`}>
                            {EVENT_LIFECYCLE_LABELS[lifecycle]}
                          </span>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showFooterLink && (
        <div className="px-lg py-4 border-t border-outline-variant flex justify-center">
          <Link href="/portal/events" className="text-primary font-label-md text-label-md hover:underline">
            View all events
          </Link>
        </div>
      )}
    </div>
  );
}
