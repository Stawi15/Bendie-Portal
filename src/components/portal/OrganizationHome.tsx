'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/lib/supabaseClient';
import { useOrgEvents } from '@/lib/useOrgEvents';
import { useOrgPeople } from '@/lib/useOrgPeople';
import { isOrgAdmin } from '@/lib/portalAuth';
import { formatAuditAction } from '@/lib/portalLabels';
import { deriveEventLifecycle } from '@/lib/eventLifecycle';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import { MetricCard } from '@/components/portal/MetricCard';
import { EventsOverviewPanel } from '@/components/portal/EventsOverviewPanel';
import { OrgPeoplePanel } from '@/components/portal/OrgPeoplePanel';
import { NextMilestoneCard } from '@/components/portal/NextMilestoneCard';
import { NeedsAttentionCard, type AttentionItem } from '@/components/portal/NeedsAttentionCard';
import { RecentActivityCard, type ActivityEntry } from '@/components/portal/RecentActivityCard';
import { QuickActionsCard } from '@/components/portal/QuickActionsCard';
import { CreateEventModal } from '@/components/portal/CreateEventModal';
import { AddPersonModal } from '@/components/portal/AddPersonModal';
import type { EventRow } from '@/lib/eventColumns';
import type { ProductKey } from '@/lib/productNavigation';

type Event = EventRow;

const ACTIVITY_DOT_CLASSES = ['bg-primary', 'bg-secondary', 'bg-surface-container-high'];

/**
 * Product-filtered organization home (Feature 006), reused by
 * /portal/bendie and /portal/planner. Extracted from the pre-Feature-006
 * /portal/page.tsx — logic unchanged except every event-derived figure now
 * flows from `product`-filtered `useOrgEvents` instead of the whole
 * organization's unfiltered event set (FR-032/FR-033/FR-056).
 */
export function OrganizationHome({ product }: { product: ProductKey }) {
  const { profile, isGlobalAdmin } = useAuth();
  const { organizationId, organization, loading: orgLoading, error: orgError } = useOrganization();
  // Event creation is restricted to platform admins and organization owner/admin
  // (Feature 003 / /speckit.analyze finding F3) -- events_insert_creator RLS
  // enforces this authoritatively; this only controls whether triggers are shown.
  const [canCreateEvent, setCanCreateEvent] = useState(false);
  const { events, loading: eventsLoading, statsMap, addEvent } = useOrgEvents(organizationId, orgLoading, product);
  const {
    people: peoplePreview,
    total: peopleTotal,
    elevatedCount,
    loading: peopleLoading,
    refetch: refetchPeople,
  } = useOrgPeople(organizationId, orgLoading, { limit: 5 });

  const [speakerTotal, setSpeakerTotal] = useState<number | null>(null);
  const [sharedSpeakerCount, setSharedSpeakerCount] = useState<number | null>(null);
  const [speakersLoading, setSpeakersLoading] = useState(true);

  const [attentionItems, setAttentionItems] = useState<AttentionItem[]>([]);
  const [attentionLoading, setAttentionLoading] = useState(true);

  const [activityEntries, setActivityEntries] = useState<ActivityEntry[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);

  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [addPersonOpen, setAddPersonOpen] = useState(false);

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

  // Shared speakers across this product's events (organization-global metrics
  // that are genuinely unrelated to product filtering, like peopleTotal above,
  // remain global; this one is event-derived, so it correctly follows `events`).
  useEffect(() => {
    if (eventsLoading) return;
    const eventIds = events.map((e) => e.id);
    if (eventIds.length === 0) {
      setSpeakerTotal(0);
      setSharedSpeakerCount(0);
      setSpeakersLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      setSpeakersLoading(true);
      const { data, error } = await supabase
        .from('facilitators')
        .select('user_id, email, event_id')
        .in('event_id', eventIds);

      if (cancelled) return;
      if (error || !data) {
        console.error(error);
        setSpeakerTotal(0);
        setSharedSpeakerCount(0);
        setSpeakersLoading(false);
        return;
      }

      const groups: Record<string, Set<string>> = {};
      for (const row of data as { user_id: string | null; email: string | null; event_id: string | null }[]) {
        const key = row.user_id ?? row.email;
        if (!key || !row.event_id) continue;
        if (!groups[key]) groups[key] = new Set();
        groups[key].add(row.event_id);
      }
      const groupValues = Object.values(groups);
      setSpeakerTotal(groupValues.length);
      setSharedSpeakerCount(groupValues.filter((s) => s.size > 1).length);
      setSpeakersLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [events, eventsLoading]);

  // Needs attention: emergency contact gaps + speaker gaps, scoped to this product's events.
  useEffect(() => {
    if (eventsLoading) return;
    const allEventIds = events.map((e) => e.id);
    if (allEventIds.length === 0) {
      setAttentionItems([]);
      setAttentionLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      setAttentionLoading(true);
      const items: AttentionItem[] = [];
      // Navigation pass (016 continuation 4) — uses the same canonical
      // lifecycle as everywhere else now, so an event whose dates show it's
      // already over (even if its raw `status` was never manually updated)
      // is correctly excluded from an "is this still worth checking" scan.
      const activeEvents = events.filter((e) => {
        const lifecycle = deriveEventLifecycle(e);
        return lifecycle !== 'completed' && lifecycle !== 'archived';
      });
      const activeEventIds = activeEvents.map((e) => e.id);

      if (activeEventIds.length > 0) {
        const { data: contactRows } = await supabase
          .from('emergency_contacts')
          .select('event_id')
          .in('event_id', activeEventIds);
        const eventsWithContacts = new Set(
          ((contactRows as { event_id: string | null }[]) ?? []).map((r) => r.event_id)
        );
        const missing = activeEvents.filter((e) => !eventsWithContacts.has(e.id));
        for (const event of missing.slice(0, 3)) {
          items.push({
            id: `emergency-${event.id}`,
            icon: 'warning',
            iconClass: 'text-red-500',
            bgClass: 'bg-red-50 border-red-100',
            title: 'Emergency contacts missing',
            subtitle: `${event.name}: no emergency contacts configured`,
          });
        }
      }

      const { count: gapCount } = await supabase
        .from('agenda_sessions')
        .select('id', { count: 'exact', head: true })
        .in('event_id', allEventIds)
        .is('facilitator_id', null);

      if ((gapCount ?? 0) > 0) {
        items.push({
          id: 'speaker-gaps',
          icon: 'mic_off',
          iconClass: 'text-secondary',
          bgClass: 'bg-secondary/5 border-secondary/10',
          title: 'Speaker Gaps',
          subtitle: `${gapCount} agenda session${gapCount === 1 ? '' : 's'} with no facilitator assigned`,
        });
      }

      if (cancelled) return;
      setAttentionItems(items);
      setAttentionLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [events, eventsLoading]);

  // Recent activity across this product's events.
  useEffect(() => {
    if (eventsLoading) return;
    const eventIds = events.map((e) => e.id);
    if (eventIds.length === 0) {
      setActivityEntries([]);
      setActivityLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      setActivityLoading(true);
      const { data, error } = await supabase
        .from('event_content_audit_log')
        .select('id, table_name, action, created_at, profiles:actor_user_id(full_name, email)')
        .in('event_id', eventIds)
        .order('created_at', { ascending: false })
        .limit(5);

      if (cancelled) return;
      if (error) {
        // Audit log table may not exist yet in every environment — fail quiet.
        if (error.code !== 'PGRST116' && error.code !== 'PGRST205') console.error(error);
        setActivityEntries([]);
        setActivityLoading(false);
        return;
      }

      type LogRow = {
        id: string;
        table_name: string;
        action: 'INSERT' | 'UPDATE' | 'DELETE';
        created_at: string;
        profiles: { full_name: string | null; email: string | null } | null;
      };

      setActivityEntries(
        ((data as unknown as LogRow[]) ?? []).map((row, i) => ({
          id: row.id,
          actorName: row.profiles?.full_name ?? row.profiles?.email ?? 'Someone',
          description: formatAuditAction(row.table_name, row.action),
          timestamp: formatRelativeTime(row.created_at),
          dotClass: ACTIVITY_DOT_CLASSES[i % ACTIVITY_DOT_CLASSES.length],
        }))
      );
      setActivityLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [events, eventsLoading]);

  // Navigation pass (016 continuation 4) — same canonical `deriveEventLifecycle`
  // helper `EventsOverviewPanel`'s tabs now use, replacing this file's own
  // previously-duplicated compound status+date logic (see eventLifecycle.ts).
  const activeCount = events.filter((e) => deriveEventLifecycle(e) === 'active').length;
  const upcomingEvents = events.filter((e) => deriveEventLifecycle(e) === 'upcoming');
  const nextEvent =
    [...upcomingEvents].sort((a, b) => new Date(a.starts_at!).getTime() - new Date(b.starts_at!).getTime())[0] ??
    null;
  const nextEventDays = nextEvent?.starts_at
    ? Math.max(0, Math.ceil((new Date(nextEvent.starts_at).getTime() - Date.now()) / 86_400_000))
    : null;

  const greetingName = (profile?.full_name ?? profile?.email ?? '').split(' ')[0] || 'there';
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';

  const handleEventCreated = (event: Event) => {
    addEvent(event);
    setCreateEventOpen(false);
  };

  const handlePersonAdded = () => {
    refetchPeople();
  };

  if (!orgLoading && !organizationId) {
    return (
      <div className="bg-white p-8 rounded-[20px] border border-[#E4EAF0] panel-shadow text-center">
        <p className="text-on-surface font-semibold mb-1">No organisation found</p>
        <p className="text-on-surface-variant text-sm">{orgError ?? 'Contact an administrator to get set up.'}</p>
      </div>
    );
  }

  return (
    <div>
      <section className="mb-lg flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center border border-outline-variant panel-shadow">
              <span className="material-symbols-outlined text-primary">auto_awesome_motion</span>
            </div>
            <h2 className="font-headline-lg text-headline-lg text-on-surface">
              Good {timeOfDay}, {greetingName}.
            </h2>
          </div>
          {/* Navigation pass (016 continuation 4) — §18: the active product is
              now always visually obvious from the header's segmented switcher,
              so this sentence no longer needs to repeat it in words. */}
          <p className="text-body-lg font-body-lg text-on-surface-variant">
            Here&apos;s what&apos;s happening in <span className="text-on-surface font-semibold">{organization?.name ?? 'your organisation'}</span>.
          </p>
          <div className="flex flex-wrap gap-4 mt-3">
            <span className="flex items-center gap-1.5 text-label-sm font-label-sm text-outline">
              <span className="material-symbols-outlined text-[18px]">calendar_today</span> {events.length} events
            </span>
            <span className="flex items-center gap-1.5 text-label-sm font-label-sm text-outline">
              <span className="material-symbols-outlined text-[18px]">group</span> {peopleTotal ?? '—'} people
            </span>
            <span className="flex items-center gap-1.5 text-label-sm font-label-sm text-outline">
              <span className="material-symbols-outlined text-[18px]">badge</span> {elevatedCount ?? '—'} organisation
              users
            </span>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-md mb-lg">
        <MetricCard
          icon="groups"
          accent="primary"
          value={peopleTotal ?? 0}
          label="Organisation People"
          trendIcon="trending_up"
          trendText="Across your organisation"
          loading={peopleLoading}
        />
        <MetricCard
          icon="event_available"
          accent="secondary"
          value={activeCount}
          label="Active Events"
          trendIcon="event"
          trendText={`${activeCount} live right now`}
          loading={eventsLoading}
        />
        <MetricCard
          icon="upcoming"
          accent="primary"
          value={upcomingEvents.length}
          label="Upcoming Events"
          trendIcon="timer"
          trendText={nextEventDays !== null ? `Next event in ${nextEventDays} days` : 'None scheduled'}
          loading={eventsLoading}
        />
        <MetricCard
          icon="record_voice_over"
          accent="secondary"
          value={speakerTotal ?? 0}
          label="Shared Speakers"
          trendIcon="share"
          trendText={`${sharedSpeakerCount ?? 0} assigned to multiple events`}
          loading={speakersLoading}
        />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-md">
        <div className="lg:col-span-8 space-y-md">
          <EventsOverviewPanel
            events={events}
            statsMap={statsMap}
            loading={eventsLoading}
            onCreateEvent={canCreateEvent ? () => setCreateEventOpen(true) : undefined}
            product={product}
          />
          <OrgPeoplePanel people={peoplePreview} loading={peopleLoading} onAddPerson={() => setAddPersonOpen(true)} />
        </div>

        <div className="lg:col-span-4 space-y-md">
          <NextMilestoneCard
            event={nextEvent}
            stats={nextEvent ? statsMap[nextEvent.id] : undefined}
            loading={eventsLoading}
            product={product}
          />
          <NeedsAttentionCard items={attentionItems} loading={attentionLoading} />
          <RecentActivityCard entries={activityEntries} loading={activityLoading} />
          <QuickActionsCard
            onCreateEvent={canCreateEvent ? () => setCreateEventOpen(true) : undefined}
            onAddPerson={() => setAddPersonOpen(true)}
          />
        </div>
      </div>

      {organizationId && canCreateEvent && (
        <CreateEventModal
          open={createEventOpen}
          organizationId={organizationId}
          onClose={() => setCreateEventOpen(false)}
          onCreated={handleEventCreated}
          initialProduct={product}
        />
      )}
      {organizationId && (
        <AddPersonModal
          open={addPersonOpen}
          organizationId={organizationId}
          onClose={() => setAddPersonOpen(false)}
          onAdded={handlePersonAdded}
        />
      )}
    </div>
  );
}
