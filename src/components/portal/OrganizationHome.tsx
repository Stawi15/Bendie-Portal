'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { supabase } from '@/lib/supabaseClient';
import { useOrgEvents } from '@/lib/useOrgEvents';
import { useOrgPeople } from '@/lib/useOrgPeople';
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
import { useCreateEvent } from '@/contexts/CreateEventContext';
import { AddPersonModal } from '@/components/portal/AddPersonModal';
import type { ProductKey } from '@/lib/productNavigation';


const ACTIVITY_DOT_CLASSES = ['bg-primary', 'bg-secondary', 'bg-surface-container-high'];

/**
 * Product-filtered organization home (Feature 006), reused by
 * /portal/bendie and /portal/planner. Extracted from the pre-Feature-006
 * /portal/page.tsx — logic unchanged except every event-derived figure now
 * flows from `product`-filtered `useOrgEvents` instead of the whole
 * organization's unfiltered event set (FR-032/FR-033/FR-056).
 */
export function OrganizationHome({ product }: { product: ProductKey }) {
  const { profile } = useAuth();
  const { organizationId, organization, loading: orgLoading, error: orgError } = useOrganization();
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

  // Feature 016 (create-path pass): the canonical creation flow + permission check live in CreateEventProvider.
  const { canCreateEvent, openCreateEvent, subscribeEventCreated } = useCreateEvent();
  useEffect(() => subscribeEventCreated(addEvent), [subscribeEventCreated, addEvent]);
  const [addPersonOpen, setAddPersonOpen] = useState(false);

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

  // Needs attention: emergency contact gaps + speaker gaps. Both checks read Bendie
  // content tables, so (Feature 016 density pass) they only run on the Bendie overview —
  // on the Planner overview they flagged Planner-only events that have no emergency
  // screen at all. Each item now links to the one page that fixes it.
  useEffect(() => {
    if (eventsLoading) return;
    const allEventIds = events.map((e) => e.id);
    if (allEventIds.length === 0 || product !== 'bendie') {
      setAttentionItems([]);
      setAttentionLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      setAttentionLoading(true);
      const items: AttentionItem[] = [];
      const eventName = (id: string) => events.find((e) => e.id === id)?.name ?? 'An event';
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
            subtitle: `${event.name} has no emergency contacts yet`,
            href: `/portal/events/${event.id}/emergency?product=bendie`,
            actionLabel: 'Add emergency contacts',
          });
        }
      }

      // Same single request as before; it now returns the event ids (not just a head count)
      // so each gap can point at the agenda that has it.
      const { data: gapRows, count: gapCount } = await supabase
        .from('agenda_sessions')
        .select('event_id', { count: 'exact' })
        .in('event_id', allEventIds)
        .is('facilitator_id', null);

      if ((gapCount ?? 0) > 0) {
        const perEvent = new Map<string, number>();
        for (const row of (gapRows as { event_id: string | null }[]) ?? []) {
          if (row.event_id) perEvent.set(row.event_id, (perEvent.get(row.event_id) ?? 0) + 1);
        }
        const ranked = Array.from(perEvent.entries()).sort((a, b) => b[1] - a[1]);
        for (const [eventId, n] of ranked.slice(0, 3)) {
          items.push({
            id: `speaker-gaps-${eventId}`,
            icon: 'mic_off',
            iconClass: 'text-secondary',
            bgClass: 'bg-secondary/5 border-secondary/10',
            title: 'Speaker gaps',
            subtitle: `${eventName(eventId)}: ${n} agenda session${n === 1 ? '' : 's'} with no speaker`,
            href: `/portal/events/${eventId}/agenda?product=bendie`,
            actionLabel: 'Review agenda',
          });
        }
        if (ranked.length > 3) {
          const rest = ranked.slice(3).reduce((sum, [, n]) => sum + n, 0);
          items.push({
            id: 'speaker-gaps-more',
            icon: 'mic_off',
            iconClass: 'text-secondary',
            bgClass: 'bg-secondary/5 border-secondary/10',
            title: 'More speaker gaps',
            subtitle: `${rest} more session${rest === 1 ? '' : 's'} across ${ranked.length - 3} other event${ranked.length - 3 === 1 ? '' : 's'}`,
          });
        }
      }

      if (cancelled) return;
      setAttentionItems(items);
      setAttentionLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [events, eventsLoading, product]);

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
      <section className="mb-md flex flex-col md:flex-row justify-between items-start md:items-end gap-3">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 bg-white rounded-lg flex items-center justify-center border border-outline-variant panel-shadow">
              <span className="material-symbols-outlined text-primary text-[20px]" aria-hidden="true">auto_awesome_motion</span>
            </div>
            <h2 className="font-headline-lg text-headline-lg text-on-surface">
              Good {timeOfDay}, {greetingName}.
            </h2>
          </div>
          {/* Navigation pass (016 continuation 4) — §18: the active product is
              now always visually obvious from the header's segmented switcher,
              so this sentence no longer needs to repeat it in words. */}
          <p className="text-body-md font-body-md text-on-surface-variant">
            Here&apos;s what&apos;s happening in <span className="text-on-surface font-semibold">{organization?.name ?? 'your organisation'}</span>.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
            <span className="flex items-center gap-1.5 text-label-sm font-label-sm text-outline">
              <span className="material-symbols-outlined text-[18px]">calendar_today</span> {events.length} events
            </span>
            <span className="flex items-center gap-1.5 text-label-sm font-label-sm text-outline">
              <span className="material-symbols-outlined text-[18px]">group</span> {peopleTotal ?? '—'} people
            </span>
            <span className="flex items-center gap-1.5 text-label-sm font-label-sm text-outline">
              <span className="material-symbols-outlined text-[18px]">badge</span> {elevatedCount ?? '—'} organisation
              admins
            </span>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-md">
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
            onCreateEvent={canCreateEvent ? () => openCreateEvent(product) : undefined}
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
          <NeedsAttentionCard
            items={attentionItems}
            loading={attentionLoading}
            emptyMessage={product === 'planner' ? "Planner readiness is tracked per event — open an event’s Dashboard to see what each one still needs." : undefined}
          />
          <RecentActivityCard entries={activityEntries} loading={activityLoading} />
          <QuickActionsCard
            onCreateEvent={canCreateEvent ? () => openCreateEvent(product) : undefined}
            onAddPerson={() => setAddPersonOpen(true)}
          />
        </div>
      </div>

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
