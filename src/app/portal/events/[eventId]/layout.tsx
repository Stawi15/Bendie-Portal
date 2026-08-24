'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useParams } from 'next/navigation';
import { useEvent } from '@/contexts/EventContext';
import { EVENT_STATUS_LABELS, EVENT_STATUS_PILL_CLASSES } from '@/lib/portalLabels';
import { EVENT_SECTIONS } from '@/lib/eventSectionMeta';

export default function EventLayout({ children }: { children: React.ReactNode }) {
  const { eventId } = useParams<{ eventId: string }>();
  const pathname = usePathname();
  const { currentEvent, loading, setCurrentEvent } = useEvent();
  const navRef = useRef<HTMLElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    if (eventId) setCurrentEvent(eventId);
  }, [eventId, setCurrentEvent]);

  const updateScrollState = useCallback(() => {
    const el = navRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  // Re-check on mount/resize, and whenever the tab count could change the
  // overflow — 21 tabs today, more likely later as further sections ship.
  useEffect(() => {
    updateScrollState();
    const el = navRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollState);
    window.addEventListener('resize', updateScrollState);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [updateScrollState]);

  // Keep the active tab visible when navigating directly to one that's
  // scrolled out of view (e.g. deep-linking to a tab near the end).
  useEffect(() => {
    navRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  }, [pathname]);

  const scrollTabs = (amount: number) => navRef.current?.scrollBy({ left: amount, behavior: 'smooth' });

  const currentTabIndex = EVENT_SECTIONS.findIndex((tab) => pathname === `/portal/events/${eventId}/${tab.key}`);
  const nextTab = currentTabIndex >= 0 && currentTabIndex < EVENT_SECTIONS.length - 1 ? EVENT_SECTIONS[currentTabIndex + 1] : null;

  return (
    <div className="flex flex-col h-full">
      {/* Static header — a sibling of the scroll area below, never inside it, so nothing can ever scroll behind or through it. */}
      <div className="flex-shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
          <div className="min-w-0">
            <Link
              href="/portal/events"
              className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-primary mb-1 w-fit"
            >
              <span className="material-symbols-outlined text-sm">arrow_back</span> All Events
            </Link>
            <h1 className="font-headline-lg text-headline-lg text-on-surface truncate">
              {loading ? 'Loading…' : (currentEvent?.name ?? 'Event')}
            </h1>
          </div>
          {currentEvent && (
            <span
              className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex-shrink-0 ${
                EVENT_STATUS_PILL_CLASSES[currentEvent.status] ?? 'bg-surface-container-high text-on-surface-variant'
              }`}
            >
              {EVENT_STATUS_LABELS[currentEvent.status] ?? currentEvent.status}
            </span>
          )}
        </div>
        <div className="relative flex items-center gap-1 border-b border-outline-variant">
          {canScrollLeft && (
            <button
              type="button"
              onClick={() => scrollTabs(-240)}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors"
              aria-label="Scroll tabs left"
            >
              <span className="material-symbols-outlined text-[20px]">chevron_left</span>
            </button>
          )}
          <nav ref={navRef} className="flex gap-6 overflow-x-auto custom-scrollbar flex-1 min-w-0">
            {EVENT_SECTIONS.map((tab) => {
              const href = `/portal/events/${eventId}/${tab.key}`;
              const active = pathname === href;
              return (
                <Link
                  key={tab.key}
                  href={href}
                  data-active={active}
                  className={`flex-shrink-0 pb-3 pt-1 text-label-sm font-label-sm border-b-2 transition-colors whitespace-nowrap ${
                    active
                      ? 'border-primary text-primary font-bold'
                      : 'border-transparent text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
          {canScrollRight && (
            <button
              type="button"
              onClick={() => scrollTabs(240)}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors"
              aria-label="Scroll tabs right"
            >
              <span className="material-symbols-outlined text-[20px]">chevron_right</span>
            </button>
          )}
        </div>
      </div>

      {/* The only thing that scrolls — sized to fill the rest of the event shell (see Portal App Shell in ui-registry.md). */}
      <div className="flex-1 min-h-0 min-w-0 overflow-y-auto custom-scrollbar pt-lg">
        {children}
      </div>

      {nextTab && (
        <div className="fixed bottom-6 right-6 z-30">
          <Link
            href={`/portal/events/${eventId}/${nextTab.key}`}
            className="btn-primary shadow-lg flex items-center gap-2"
          >
            Next: {nextTab.label} <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </Link>
        </div>
      )}
    </div>
  );
}
