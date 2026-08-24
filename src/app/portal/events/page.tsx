'use client';

import { useState } from 'react';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrgEvents } from '@/lib/useOrgEvents';
import { EventsOverviewPanel } from '@/components/portal/EventsOverviewPanel';
import { CreateEventModal } from '@/components/portal/CreateEventModal';
import type { Database } from '@/types/database';

type Event = Database['public']['Tables']['events']['Row'];

export default function EventsPage() {
  const { organizationId, loading: orgLoading } = useOrganization();
  const { events, loading, statsMap, addEvent } = useOrgEvents(organizationId, orgLoading);
  const [createOpen, setCreateOpen] = useState(false);

  const handleCreated = (event: Event) => {
    addEvent(event);
    setCreateOpen(false);
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-lg">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface">Events</h1>
          <p className="text-body-md font-body-md text-on-surface-variant mt-1">
            All events across your organisation.
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="bg-primary text-white font-label-md text-label-md px-6 py-2.5 rounded-xl hover:opacity-90 active:scale-95 transition-all flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-[18px]">add</span> New Event
        </button>
      </div>

      <EventsOverviewPanel
        events={events}
        statsMap={statsMap}
        loading={loading}
        onCreateEvent={() => setCreateOpen(true)}
        showFooterLink={false}
      />

      {organizationId && (
        <CreateEventModal
          open={createOpen}
          organizationId={organizationId}
          onClose={() => setCreateOpen(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  );
}
