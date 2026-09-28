'use client';

import { useEffect } from 'react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrgEvents } from '@/lib/useOrgEvents';
import { EventsOverviewPanel } from '@/components/portal/EventsOverviewPanel';
import { useCreateEvent } from '@/contexts/CreateEventContext';
import type { ProductKey } from '@/lib/productNavigation';


const PRODUCT_LABEL: Record<ProductKey, string> = { bendie: 'Bendie', planner: 'Bendie Planner' };

/**
 * Product-filtered event discovery list (Feature 006), reused by
 * /portal/bendie/events and /portal/planner/events. Extracted from the
 * pre-Feature-006 /portal/events/page.tsx — logic unchanged except `events`
 * now comes from `product`-filtered `useOrgEvents` (FR-022/FR-023/FR-056).
 */
export function OrganizationEventsList({ product }: { product: ProductKey }) {
  const { organizationId, loading: orgLoading } = useOrganization();
  const { events, loading, statsMap, addEvent } = useOrgEvents(organizationId, orgLoading, product);
  // Feature 016 (create-path pass): one canonical creation flow + permission check
  // (CreateEventProvider); this page just offers the contextual "+ New Event".
  const { canCreateEvent, openCreateEvent, subscribeEventCreated } = useCreateEvent();
  useEffect(() => subscribeEventCreated(addEvent), [subscribeEventCreated, addEvent]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-lg">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface">{PRODUCT_LABEL[product]} Events</h1>
          <p className="text-body-md font-body-md text-on-surface-variant mt-1">
            Every {PRODUCT_LABEL[product]} event in your organisation.
          </p>
        </div>
        {canCreateEvent && (
          <button
            onClick={() => openCreateEvent(product)}
            className="bg-primary text-white font-label-md text-label-md px-6 py-2.5 rounded-xl hover:opacity-90 active:scale-95 transition-all flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">add</span> New Event
          </button>
        )}
      </div>

      <EventsOverviewPanel
        events={events}
        statsMap={statsMap}
        loading={loading}
        onCreateEvent={canCreateEvent ? () => openCreateEvent(product) : undefined}
        showFooterLink={false}
        product={product}
      />

    </div>
  );
}
