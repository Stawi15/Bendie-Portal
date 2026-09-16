'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useEvent } from '@/contexts/EventContext';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { EVENT_SECTIONS } from '@/lib/eventSectionMeta';
import { SectionIconBadge } from '@/components/portal/SectionIconBadge';
import { PlannerProvisioningBanner } from '@/components/portal/PlannerProvisioningBanner';
import type { EventRow } from '@/lib/eventColumns';

type Event = EventRow;

type SectionCheck =
  | { kind: 'field'; test: (event: Event) => boolean }
  | { kind: 'count'; table: string; noun: string; scored: boolean }
  | { kind: 'none' };

/** How each section's completion is determined, keyed by EVENT_SECTIONS key. Dashboard itself is excluded. */
const SECTION_CHECKS: Record<string, SectionCheck> = {
  basics: { kind: 'field', test: (e) => Boolean(e.description && e.location) },
  hero: { kind: 'field', test: (e) => Boolean(e.hero_title && e.hero_image_url) },
  theme: { kind: 'field', test: (e) => Boolean(e.theme_primary) },
  terminology: { kind: 'field', test: (e) => Boolean(e.facilitator_label_singular || e.theme_label) },
  facilitators: { kind: 'count', table: 'facilitators', noun: 'facilitators', scored: true },
  agenda: { kind: 'count', table: 'agenda_sessions', noun: 'sessions', scored: true },
  'attendee-travel': { kind: 'count', table: 'attendee_travel_details', noun: 'travel entries', scored: false },
  activities: { kind: 'count', table: 'activities', noun: 'activities', scored: true },
  excursions: { kind: 'count', table: 'excursions', noun: 'excursions', scored: true },
  expo: { kind: 'count', table: 'expo_spaces', noun: 'exhibitors', scored: true },
  news: { kind: 'count', table: 'news_items', noun: 'articles', scored: true },
  networking: { kind: 'count', table: 'event_interest_options', noun: 'question rows', scored: true },
  faqs: { kind: 'count', table: 'faqs', noun: 'FAQs', scored: true },
  'info-center': { kind: 'count', table: 'support_contacts', noun: 'contacts', scored: true },
  emergency: { kind: 'count', table: 'emergency_contacts', noun: 'contacts', scored: true },
  gallery: { kind: 'count', table: 'posts', noun: 'photos', scored: false },
  'event-photos': { kind: 'count', table: 'event_photos', noun: 'photos', scored: false },
  games: { kind: 'count', table: 'games', noun: 'games', scored: true },
  members: { kind: 'count', table: 'event_members', noun: 'members', scored: false },
  'bendie-planner': { kind: 'none' },
  'planner-overview': { kind: 'none' },
  files: { kind: 'none' },
  notifications: { kind: 'count', table: 'event_push_notifications', noun: 'notifications', scored: false },
  'activity-log': { kind: 'none' },
};

const DASHBOARD_SECTIONS = EVENT_SECTIONS.filter((s) => s.key !== 'dashboard');

const COUNTED_TABLES = Array.from(
  new Set(Object.values(SECTION_CHECKS).flatMap((c) => (c.kind === 'count' ? [c.table] : [])))
);

/** Tables with a nullable event_id where NULL means "shown on every event" — count global rows too, not just event-scoped ones. */
const GLOBAL_CAPABLE_TABLES = new Set(['excursions', 'expo_spaces', 'news_items']);

export default function DashboardPage() {
  const { currentEvent, loading } = useEvent();
  const params = useParams();
  const eventId = params.eventId as string;
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [countsLoading, setCountsLoading] = useState(true);

  useEffect(() => {
    if (!eventId) return;
    setCountsLoading(true);
    Promise.all(
      COUNTED_TABLES.map((table) => {
        const query = supabase.from(table).select('*', { count: 'exact', head: true });
        return GLOBAL_CAPABLE_TABLES.has(table)
          ? query.or(`event_id.eq.${eventId},event_id.is.null`)
          : query.eq('event_id', eventId);
      })
    ).then((results) => {
      const next: Record<string, number> = {};
      COUNTED_TABLES.forEach((table, i) => {
        next[table] = results[i].count ?? 0;
      });
      setCounts(next);
      setCountsLoading(false);
    });
  }, [eventId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  const scoredSections = DASHBOARD_SECTIONS.filter((s) => {
    const check = SECTION_CHECKS[s.key];
    return check.kind === 'field' || (check.kind === 'count' && check.scored);
  });
  const completedCount = currentEvent
    ? scoredSections.filter((s) => {
        const check = SECTION_CHECKS[s.key];
        if (check.kind === 'field') return check.test(currentEvent);
        if (check.kind === 'count') return (counts[check.table] ?? 0) > 0;
        return false;
      }).length
    : 0;
  const progressPct = scoredSections.length > 0 ? Math.round((completedCount / scoredSections.length) * 100) : 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">
          {currentEvent?.name ?? 'Event Dashboard'}
        </h1>
        <p className="text-gray-500 mt-1">Select a section to edit event content</p>
      </div>

      {currentEvent && <PlannerProvisioningBanner event={currentEvent} />}

      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-6">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <p className="font-semibold text-gray-900">Setup Progress</p>
            <p className="text-sm text-gray-500 mt-0.5">
              {countsLoading ? 'Calculating…' : `${completedCount} of ${scoredSections.length} sections complete`}
            </p>
          </div>
          <div
            className={`flex items-center justify-center flex-shrink-0 w-16 h-16 rounded-full font-bold text-xl ${
              countsLoading
                ? 'bg-gray-100 text-gray-400'
                : progressPct >= 80
                  ? 'bg-green-100 text-green-700'
                  : progressPct >= 40
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-red-100 text-red-700'
            }`}
          >
            {countsLoading ? '…' : `${progressPct}%`}
          </div>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              progressPct >= 80 ? 'bg-green-600' : progressPct >= 40 ? 'bg-amber-500' : 'bg-red-500'
            }`}
            style={{ width: countsLoading ? '0%' : `${progressPct}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {DASHBOARD_SECTIONS.map((section) => {
          const check = SECTION_CHECKS[section.key];
          let badge: { text: string; className: string } | null = null;

          if (currentEvent && check.kind === 'field') {
            const done = check.test(currentEvent);
            badge = done
              ? { text: '✓ Complete', className: 'bg-green-100 text-green-700' }
              : { text: 'Not started', className: 'bg-gray-100 text-gray-500' };
          } else if (check.kind === 'count') {
            const count = counts[check.table] ?? 0;
            if (countsLoading) {
              badge = { text: '…', className: 'bg-gray-100 text-gray-400' };
            } else if (check.scored) {
              badge = count > 0
                ? { text: `✓ ${count} ${check.noun}`, className: 'bg-green-100 text-green-700' }
                : { text: 'Not started', className: 'bg-gray-100 text-gray-500' };
            } else {
              badge = count > 0
                ? { text: `${count} ${check.noun}`, className: 'bg-blue-50 text-blue-700' }
                : { text: `No ${check.noun} yet`, className: 'bg-gray-100 text-gray-500' };
            }
          }

          return (
            <Link
              key={section.key}
              href={`/portal/events/${eventId}/${section.key}`}
              className="flex items-start gap-4 p-5 bg-white border border-gray-200 rounded-2xl hover:border-blue-400 hover:shadow-md transition-all group"
            >
              <SectionIconBadge icon={section.icon} bg={section.badgeBg} fg={section.badgeFg} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">
                  {section.label}
                </p>
                <p className="text-sm text-gray-500 mt-0.5">{section.desc}</p>
                {badge && (
                  <span className={`inline-block mt-2 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${badge.className}`}>
                    {badge.text}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
