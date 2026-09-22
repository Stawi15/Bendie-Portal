'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrgEvents } from '@/lib/useOrgEvents';
import { isOrgAdmin } from '@/lib/portalAuth';
import { EventsOverviewPanel } from '@/components/portal/EventsOverviewPanel';
import { CreateEventModal } from '@/components/portal/CreateEventModal';
import type { EventRow } from '@/lib/eventColumns';
import type { ProductKey } from '@/lib/productNavigation';

type Event = EventRow;

const PRODUCT_LABEL: Record<ProductKey, string> = { bendie: 'Bendie', planner: 'Bendie Planner' };

/**
 * Product-filtered event discovery list (Feature 006), reused by
 * /portal/bendie/events and /portal/planner/events. Extracted from the
 * pre-Feature-006 /portal/events/page.tsx — logic unchanged except `events`
 * now comes from `product`-filtered `useOrgEvents` (FR-022/FR-023/FR-056).
 */
export function OrganizationEventsList({ product }: { product: ProductKey }) {
  const { isGlobalAdmin } = useAuth();
  const { organizationId, loading: orgLoading } = useOrganization();
  const { events, loading, statsMap, addEvent } = useOrgEvents(organizationId, orgLoading, product);
  const [createOpen, setCreateOpen] = useState(false);
  // Event creation is restricted to platform admins and organization owner/admin
  // (Feature 003 / /speckit.analyze finding F3) -- events_insert_creator RLS
  // enforces this authoritatively; this only controls whether the trigger is shown.
  const [canCreateEvent, setCanCreateEvent] = useState(false);

  useEffect(() => {
    if (isGlobalAdmin) {
      setCanCreateEvent(true);
      return;
    }
    if (!organizationId) {
      setCanCreateEvent(false);
      return;
    }
    let cancelled = false;
    isOrgAdmin(organizationId).then((allowed) => {
      if (!cancelled) setCanCreateEvent(allowed);
    });
    return () => {
      cancelled = true;
    };
  }, [isGlobalAdmin, organizationId]);

  const handleCreated = (event: Event) => {
    addEvent(event);
    setCreateOpen(false);
  };

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
            onClick={() => setCreateOpen(true)}
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
        onCreateEvent={canCreateEvent ? () => setCreateOpen(true) : undefined}
        showFooterLink={false}
        product={product}
      />

      {organizationId && canCreateEvent && (
        <CreateEventModal
          open={createOpen}
          organizationId={organizationId}
          onClose={() => setCreateOpen(false)}
          onCreated={handleCreated}
          initialProduct={product}
        />
      )}
    </div>
  );
}
