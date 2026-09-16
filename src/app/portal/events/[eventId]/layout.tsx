'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useParams, useRouter } from 'next/navigation';
import { useEvent } from '@/contexts/EventContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { EVENT_STATUS_LABELS, EVENT_STATUS_PILL_CLASSES } from '@/lib/portalLabels';
import { EVENT_SECTIONS, type EventSectionMeta } from '@/lib/eventSectionMeta';
import { isProductAvailableForEvent, type ProductKey } from '@/lib/eventAuth';

export default function EventLayout({ children }: { children: React.ReactNode }) {
  const { eventId } = useParams<{ eventId: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const { currentEvent, loading, canAccessWorkspace, workspaceAccessChecked, setCurrentEvent, clearCurrentEvent } = useEvent();
  const { organizationId } = useOrganization();
  const navRef = useRef<HTMLElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  // Which products (per EVENT_SECTIONS' classification) are actually available for
  // this event -- Feature 003: navigation filtering is UX, this is the same data
  // source direct-route access below is gated on, never route names or nav state.
  const [productAvailability, setProductAvailability] = useState<Partial<Record<ProductKey, boolean>>>({});
  const [productAvailabilityChecked, setProductAvailabilityChecked] = useState(false);

  useEffect(() => {
    if (eventId) setCurrentEvent(eventId);
  }, [eventId, setCurrentEvent]);

  // Ends explicit-event-route intent when the user leaves this route
  // (Feature 003 corrective pass, R2-F3) -- lets EventContext's loadEvents()
  // resume normal auto-select behavior for non-event-scoped pages and future
  // organization switches, instead of staying permanently disabled after the
  // first event visit for the rest of the session.
  useEffect(() => {
    return () => {
      clearCurrentEvent();
    };
  }, [clearCurrentEvent]);

  useEffect(() => {
    let cancelled = false;
    setProductAvailabilityChecked(false);
    if (!currentEvent || !organizationId) return;

    const productKeys = Array.from(new Set(EVENT_SECTIONS.map((s) => s.product).filter((p): p is ProductKey => p !== 'shared')));
    Promise.all(productKeys.map((key) => isProductAvailableForEvent(currentEvent.id, organizationId, key))).then((results) => {
      if (cancelled) return;
      const next: Partial<Record<ProductKey, boolean>> = {};
      productKeys.forEach((key, i) => {
        next[key] = results[i];
      });
      setProductAvailability(next);
      setProductAvailabilityChecked(true);
    });

    return () => {
      cancelled = true;
    };
  }, [currentEvent, organizationId]);

  const isSectionAvailable = useCallback(
    (section: EventSectionMeta) => section.product === 'shared' || productAvailability[section.product] === true,
    [productAvailability]
  );

  const activeSectionKey = pathname.startsWith(`/portal/events/${eventId}/`) ? pathname.slice(`/portal/events/${eventId}/`.length).split('/')[0] : null;
  const activeSection = useMemo(() => EVENT_SECTIONS.find((s) => s.key === activeSectionKey), [activeSectionKey]);
  const visibleSections = useMemo(() => EVENT_SECTIONS.filter(isSectionAvailable), [isSectionAvailable]);

  // Feature 005 — deterministic Planner-only default landing (FR-022/023/024).
  // `dashboard` is 'bendie'-classified; a Planner-only event (no active Bendie
  // product) would otherwise render the activeSectionUnavailable blocked state
  // below for every visitor whose entry link still points at `.../dashboard`
  // (every current entry point does — see research.md Q1/Q2). Redirecting here,
  // keyed on the same product-availability state every other section already
  // uses, covers every entry point at once without touching them individually,
  // and is deterministic by construction rather than dependent on tab order:
  // - Never fires before product availability resolves (`productAvailabilityChecked`
  //   guard), so it can't redirect based on stale/incomplete data.
  // - Never loops: once navigated to `planner-overview`, `activeSectionKey` is no
  //   longer `'dashboard'`, so the condition can't match again.
  // - Never redirects a direct visit to `planner-overview` itself away — the
  //   condition only ever matches `activeSectionKey === 'dashboard'`.
  // - Never fires for a Bendie-only or Both event — `productAvailability.bendie`
  //   is `true` for both, so the condition is never satisfied.
  useEffect(() => {
    if (!productAvailabilityChecked) return;
    if (activeSectionKey === 'dashboard' && productAvailability.bendie !== true && productAvailability.planner === true) {
      router.replace(`/portal/events/${eventId}/planner-overview`);
    }
  }, [activeSectionKey, productAvailability, productAvailabilityChecked, eventId, router]);

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

  const currentTabIndex = visibleSections.findIndex((tab) => pathname === `/portal/events/${eventId}/${tab.key}`);
  const nextTab = currentTabIndex >= 0 && currentTabIndex < visibleSections.length - 1 ? visibleSections[currentTabIndex + 1] : null;

  // --- Authorization state machine (Feature 003 / F-R1 correction) ---
  // A successful `currentEvent` fetch never implies workspace access -- org
  // admins can see event metadata without event_members. Correction from an
  // independent post-implementation review: the original version of this
  // guard only rendered the forbidden state once `workspaceAccessChecked`
  // became true, but fell through to render `children` (and the product
  // pane) for every render BEFORE that -- i.e. while the check was still
  // pending, protected content mounted and could fire its own queries. Fail
  // closed instead: nothing protected renders until the check has actually
  // resolved. RLS remains defense in depth underneath this, not the primary
  // mechanism.
  const workspaceAuthPending = !workspaceAccessChecked;
  const workspaceAuthDenied = workspaceAccessChecked && !canAccessWorkspace;
  // The active tab's product-availability check is a separate async resolve;
  // 'shared' tabs have nothing to wait for.
  const productAuthPending = !!activeSection && activeSection.product !== 'shared' && !productAvailabilityChecked;
  const activeSectionUnavailable = !!activeSection && productAvailabilityChecked && !isSectionAvailable(activeSection);

  if (workspaceAuthPending) {
    return (
      <div className="flex flex-col h-full" aria-busy="true">
        <div className="h-8 w-40 bg-surface-container-low rounded-lg animate-pulse mb-4" />
        <div className="flex-1 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-surface-container-low rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (workspaceAuthDenied) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4">
        <span className="material-symbols-outlined text-5xl text-on-surface-variant mb-3">lock</span>
        <h1 className="font-headline-sm text-headline-sm text-on-surface mb-1">You don&apos;t have access to this event</h1>
        <p className="text-body-md font-body-md text-on-surface-variant max-w-sm">
          You can see this event in your organisation&apos;s event list, but entering it requires being added as an event member.
        </p>
        <Link href="/portal/events" className="btn-secondary mt-4">
          Back to Events
        </Link>
      </div>
    );
  }

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
            {visibleSections.map((tab) => {
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
        {productAuthPending ? (
          <div className="space-y-3" aria-busy="true">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-surface-container-low rounded-xl animate-pulse" />
            ))}
          </div>
        ) : activeSectionUnavailable ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant mb-3">block</span>
            <h2 className="font-headline-sm text-headline-sm text-on-surface mb-1">This isn&apos;t available for this event</h2>
            <p className="text-body-md font-body-md text-on-surface-variant max-w-sm">
              This section belongs to a product that isn&apos;t currently active for this event&apos;s organisation.
            </p>
          </div>
        ) : (
          children
        )}
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
