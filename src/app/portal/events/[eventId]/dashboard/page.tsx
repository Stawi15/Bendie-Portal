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
  'planner-tasks': { kind: 'none' },
  'planner-vendors': { kind: 'none' },
  'planner-checklist': { kind: 'none' },
  'planner-people': { kind: 'none' },
  'planner-logistics': { kind: 'none' },
  'planner-production': { kind: 'none' },
  files: { kind: 'none' },
  notifications: { kind: 'count', table: 'event_push_notifications', noun: 'notifications', scored: false },
  'activity-log': { kind: 'none' },
};

const DASHBOARD_SECTIONS = EVENT_SECTIONS.filter((s) => s.key !== 'dashboard');

/**
 * Navigation pass (016 continuation 3) — §13: replace the 25+-card flat grid
 * with ~5-8 high-level "setup area" cards. Deliberately a SEPARATE grouping
 * from `EVENT_SECTIONS.group` (which drives the workspace tab bar's pills,
 * §8) rather than reusing it: the tab bar wants 7 granular Bendie groups
 * (Content and Media kept apart, matching their own distinct tabs), while
 * the Dashboard's brief explicitly asks for Content+Media merged into one
 * card here. Two different UI surfaces with two genuinely different
 * groupings — kept as two small, explicit definitions rather than forcing
 * one to serve both, matching this file's own established
 * duplicate-rather-than-wrongly-generalize convention.
 */
const BENDIE_DASHBOARD_AREAS: { key: string; label: string; desc: string; icon: string; sectionKeys: string[] }[] = [
  { key: 'event-setup', label: 'Event Setup', desc: 'Basics, branding and event terminology', icon: 'tune', sectionKeys: ['basics', 'hero', 'theme', 'terminology'] },
  { key: 'programme', label: 'Programme', desc: 'Facilitators, agenda, activities and excursions', icon: 'calendar_month', sectionKeys: ['facilitators', 'agenda', 'activities', 'excursions'] },
  { key: 'attendees', label: 'Attendees', desc: 'Members, attendee travel and networking', icon: 'groups', sectionKeys: ['members', 'attendee-travel', 'networking'] },
  {
    key: 'content-media',
    label: 'Content & Media',
    desc: 'News, FAQs, info center, expo, gallery, photos and files',
    icon: 'perm_media',
    sectionKeys: ['news', 'faqs', 'info-center', 'expo', 'gallery', 'event-photos', 'files'],
  },
  { key: 'operations', label: 'Operations', desc: 'Emergency info, games, notifications and activity log', icon: 'settings_suggest', sectionKeys: ['emergency', 'games', 'notifications', 'activity-log'] },
];

const COUNTED_TABLES = Array.from(
  new Set(Object.values(SECTION_CHECKS).flatMap((c) => (c.kind === 'count' ? [c.table] : [])))
);

/** Tables with a nullable event_id where NULL means "shown on every event" — count global rows too, not just event-scoped ones. */
const GLOBAL_CAPABLE_TABLES = new Set(['excursions', 'expo_spaces', 'news_items']);

/**
 * Portal UX pass (016) — "Setup is a journey, management is a workspace":
 * the Dashboard composes the existing per-module Planner GET endpoints
 * (same ones each Planner page already calls) purely to surface meaningful
 * setup status instead of forcing the manager to open every tab to find out
 * what's left. No new API routes, no new backend logic — every count below
 * is derived client-side from data these endpoints already return.
 *
 * `planner_provisioning_status` is not a formal "is Planner active" flag
 * (that lives in `event_products`, which this row doesn't carry), but a
 * non-null, non-`not_required` value only ever occurs for an event that
 * chose Planner or Both at creation — a safe, existing-data-only signal for
 * "should we attempt the Planner summary fetch at all." A false negative
 * here only hides this optional summary card; every Planner tab remains
 * directly reachable regardless.
 */
function isPlannerApplicable(event: Event | null): boolean {
  return !!event?.planner_provisioning_status && event.planner_provisioning_status !== 'not_required';
}

type MinimalPassengerRef = { passengerId: number };
type MinimalTask = { status: string };
type MinimalVendorItem = { isOnSite: boolean };
type MinimalChecklistItem = { isSourced: boolean };
type MinimalAssignment = { passengerId: number };
type MinimalVehicle = { assignments?: MinimalAssignment[] };
type MinimalMovement = { vehicles?: MinimalVehicle[] };

type PlannerCounts = {
  peopleTotal: number | null;
  flightsCovered: number | null;
  hotelsCovered: number | null;
  groundTransportAssigned: number | null;
  tasksTotal: number | null;
  tasksOutstanding: number | null;
  checklistTotal: number | null;
  checklistUnsourced: number | null;
  vendorsTotal: number | null;
  vendorsNotOnSite: number | null;
  productionTotal: number | null;
};

const EMPTY_PLANNER_COUNTS: PlannerCounts = {
  peopleTotal: null,
  flightsCovered: null,
  hotelsCovered: null,
  groundTransportAssigned: null,
  tasksTotal: null,
  tasksOutstanding: null,
  checklistTotal: null,
  checklistUnsourced: null,
  vendorsTotal: null,
  vendorsNotOnSite: null,
  productionTotal: null,
};

/** Reads one array field off a Planner GET response, honestly returning `null` (never `[]`) if the field is missing — distinguishes "this module returned zero records" from "this module's data isn't available to us right now" (denied, still provisioning, or the fetch failed). */
function extractArray<T>(settled: PromiseSettledResult<unknown>, field: string): T[] | null {
  if (settled.status !== 'fulfilled') return null;
  const body = settled.value as Record<string, unknown> | null;
  const value = body?.[field];
  return Array.isArray(value) ? (value as T[]) : null;
}

export default function DashboardPage() {
  const { currentEvent, loading } = useEvent();
  const params = useParams();
  const eventId = params.eventId as string;
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [countsLoading, setCountsLoading] = useState(true);
  const [plannerCounts, setPlannerCounts] = useState<PlannerCounts>(EMPTY_PLANNER_COUNTS);
  const [plannerCountsLoading, setPlannerCountsLoading] = useState(true);
  const plannerApplicable = isPlannerApplicable(currentEvent);

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

  // Portal UX pass (016) — compose the existing per-module GET endpoints
  // (identical calls each Planner tab already makes) to build a Planner
  // readiness summary. Every module resolves independently: one module
  // being unavailable (e.g. denied capability) degrades only that module's
  // count to "not available," never the whole card.
  useEffect(() => {
    if (!eventId || !plannerApplicable) {
      setPlannerCountsLoading(false);
      return;
    }
    setPlannerCountsLoading(true);
    const base = `/api/events/${eventId}`;
    Promise.allSettled([
      fetch(`${base}/planner-people`).then((r) => r.json()),
      fetch(`${base}/planner-tasks`).then((r) => r.json()),
      fetch(`${base}/planner-vendors`).then((r) => r.json()),
      fetch(`${base}/planner-checklist`).then((r) => r.json()),
      fetch(`${base}/planner-logistics/flights`).then((r) => r.json()),
      fetch(`${base}/planner-logistics/hotels`).then((r) => r.json()),
      fetch(`${base}/planner-logistics/ground-transport/movements`).then((r) => r.json()),
      fetch(`${base}/planner-production`).then((r) => r.json()),
    ]).then(([peopleR, tasksR, vendorsR, checklistR, flightsR, hotelsR, movementsR, productionR]) => {
      const people = extractArray<MinimalPassengerRef>(peopleR, 'participants');
      const tasks = extractArray<MinimalTask>(tasksR, 'tasks');
      const vendors = extractArray<MinimalVendorItem>(vendorsR, 'items');
      const checklist = extractArray<MinimalChecklistItem>(checklistR, 'items');
      const flights = extractArray<MinimalPassengerRef>(flightsR, 'flights');
      const hotels = extractArray<MinimalPassengerRef>(hotelsR, 'bookings');
      const movements = extractArray<MinimalMovement>(movementsR, 'movements');
      const production = extractArray<unknown>(productionR, 'sessions');

      setPlannerCounts({
        peopleTotal: people ? people.length : null,
        flightsCovered: flights ? new Set(flights.map((f) => f.passengerId)).size : null,
        hotelsCovered: hotels ? new Set(hotels.map((h) => h.passengerId)).size : null,
        groundTransportAssigned: movements
          ? new Set(movements.flatMap((m) => (m.vehicles ?? []).flatMap((v) => (v.assignments ?? []).map((a) => a.passengerId)))).size
          : null,
        tasksTotal: tasks ? tasks.length : null,
        tasksOutstanding: tasks ? tasks.filter((t) => t.status !== 'Completed').length : null,
        checklistTotal: checklist ? checklist.length : null,
        checklistUnsourced: checklist ? checklist.filter((c) => !c.isSourced).length : null,
        vendorsTotal: vendors ? vendors.length : null,
        vendorsNotOnSite: vendors ? vendors.filter((v) => !v.isOnSite).length : null,
        productionTotal: production ? production.length : null,
      });
      setPlannerCountsLoading(false);
    });
  }, [eventId, plannerApplicable]);

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

  // Deterministic "what's next" — the first incomplete scored Bendie
  // section, in EVENT_SECTIONS' own declared order (Event Setup →
  // Programme → Attendees → Content → Media → Operations). No cleverness,
  // no ranking heuristic — just the first gap a manager would hit if they
  // worked through the sections top to bottom.
  const nextBendieSection = currentEvent
    ? scoredSections.find((s) => {
        const check = SECTION_CHECKS[s.key];
        if (check.kind === 'field') return !check.test(currentEvent);
        if (check.kind === 'count') return (counts[check.table] ?? 0) === 0;
        return false;
      })
    : undefined;

  // Same principle for Planner, in the dependency order the current
  // implementation actually has (People is a hard prerequisite for
  // Flights/Hotels/Ground Transport; the rest have no real ordering
  // constraint, so Tasks/Vendors/Checklist/Production are just listed in
  // their own tab order).
  const plannerRecommendation =
    plannerApplicable && !plannerCountsLoading
      ? plannerCounts.peopleTotal === 0
        ? { label: 'Add participants', desc: 'Flights, hotels and ground transport all need a participant to attach to first.', href: 'planner-people' }
        : plannerCounts.peopleTotal !== null && plannerCounts.flightsCovered !== null && plannerCounts.flightsCovered < plannerCounts.peopleTotal
          ? { label: 'Add flight details', desc: `${plannerCounts.peopleTotal - plannerCounts.flightsCovered} of ${plannerCounts.peopleTotal} participants have no flight on file.`, href: 'planner-logistics' }
          : plannerCounts.peopleTotal !== null && plannerCounts.hotelsCovered !== null && plannerCounts.hotelsCovered < plannerCounts.peopleTotal
            ? { label: 'Add accommodation', desc: `${plannerCounts.peopleTotal - plannerCounts.hotelsCovered} of ${plannerCounts.peopleTotal} participants have no hotel booking on file.`, href: 'planner-logistics' }
            : plannerCounts.peopleTotal !== null && plannerCounts.groundTransportAssigned !== null && plannerCounts.groundTransportAssigned < plannerCounts.peopleTotal
              ? { label: 'Assign ground transport', desc: `${plannerCounts.peopleTotal - plannerCounts.groundTransportAssigned} of ${plannerCounts.peopleTotal} participants aren't on a vehicle yet.`, href: 'planner-logistics' }
              : plannerCounts.tasksOutstanding !== null && plannerCounts.tasksOutstanding > 0
                ? { label: 'Review outstanding tasks', desc: `${plannerCounts.tasksOutstanding} task${plannerCounts.tasksOutstanding === 1 ? '' : 's'} not yet completed.`, href: 'planner-tasks' }
                : plannerCounts.checklistUnsourced !== null && plannerCounts.checklistUnsourced > 0
                  ? { label: 'Source checklist items', desc: `${plannerCounts.checklistUnsourced} item${plannerCounts.checklistUnsourced === 1 ? '' : 's'} not yet sourced.`, href: 'planner-checklist' }
                  : plannerCounts.vendorsNotOnSite !== null && plannerCounts.vendorsNotOnSite > 0
                    ? { label: 'Finish vendor logistics', desc: `${plannerCounts.vendorsNotOnSite} vendor item${plannerCounts.vendorsNotOnSite === 1 ? '' : 's'} not yet on-site.`, href: 'planner-vendors' }
                    : plannerCounts.productionTotal === 0
                      ? { label: 'Build the production schedule', desc: 'No production sessions have been added yet.', href: 'planner-production' }
                      : null
      : null;

  // §14 — one compact status per Bendie setup area, reusing the exact same
  // per-section `SECTION_CHECKS` truth this page has always used (no new
  // completion rule invented) — just aggregated up to the area level instead
  // of rendered as one card per section.
  const bendieAreaStatuses = BENDIE_DASHBOARD_AREAS.map((area) => {
    const areaSections = area.sectionKeys
      .map((key) => DASHBOARD_SECTIONS.find((s) => s.key === key))
      .filter((s): s is (typeof DASHBOARD_SECTIONS)[number] => !!s);
    const scoredInArea = areaSections.filter((s) => {
      const check = SECTION_CHECKS[s.key];
      return check.kind === 'field' || (check.kind === 'count' && check.scored);
    });
    const isComplete = (s: (typeof DASHBOARD_SECTIONS)[number]) => {
      const check = SECTION_CHECKS[s.key];
      if (check.kind === 'field') return !!currentEvent && check.test(currentEvent);
      if (check.kind === 'count') return (counts[check.table] ?? 0) > 0;
      return false;
    };
    const completed = scoredInArea.filter(isComplete).length;
    const firstIncomplete = scoredInArea.find((s) => !isComplete(s));
    const targetKey = (firstIncomplete ?? scoredInArea[0] ?? areaSections[0])?.key ?? area.sectionKeys[0];
    return { area, completed, total: scoredInArea.length, targetKey };
  });

  // Same treatment for the single "Bendie Planner" area card — reuses the
  // exact same `plannerCounts`/`plannerRecommendation` this page already
  // computed for the Recommended-Next callout, just condensed to one status
  // line instead of 8 separate cards (§16).
  const plannerModuleFlags = plannerApplicable
    ? [
        plannerCounts.peopleTotal,
        plannerCounts.flightsCovered,
        plannerCounts.hotelsCovered,
        plannerCounts.groundTransportAssigned,
        plannerCounts.tasksTotal,
        plannerCounts.vendorsTotal,
        plannerCounts.checklistTotal,
        plannerCounts.productionTotal,
      ]
    : [];
  const plannerModulesStarted = plannerModuleFlags.filter((n) => (n ?? 0) > 0).length;
  const plannerModulesKnown = plannerModuleFlags.filter((n) => n !== null).length;

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

      {(nextBendieSection || plannerRecommendation) && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 mb-6 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-blue-700">Recommended next</p>
          {nextBendieSection && (
            <Link
              href={`/portal/events/${eventId}/${nextBendieSection.key}`}
              className="flex items-center justify-between gap-3 group"
            >
              <div>
                <p className="font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">{nextBendieSection.label}</p>
                <p className="text-sm text-gray-500">{nextBendieSection.desc}</p>
              </div>
              <span className="material-symbols-outlined text-blue-600">arrow_forward</span>
            </Link>
          )}
          {plannerRecommendation && (
            <Link
              href={`/portal/events/${eventId}/${plannerRecommendation.href}?product=planner`}
              className="flex items-center justify-between gap-3 group"
            >
              <div>
                <p className="font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">
                  {plannerRecommendation.label} <span className="text-orange-600 text-xs font-bold uppercase tracking-wide ml-1">Bendie Planner</span>
                </p>
                <p className="text-sm text-gray-500">{plannerRecommendation.desc}</p>
              </div>
              <span className="material-symbols-outlined text-blue-600">arrow_forward</span>
            </Link>
          )}
        </div>
      )}

      {/* §13/§14 — high-level setup-area cards replace the old one-card-per-section grid (was 22+ cards; now 5, or 6 with Bendie Planner). Each card's target is the first incomplete section in that area (or its first section once complete), reusing the exact same per-section completion truth as the progress bar above. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {bendieAreaStatuses.map(({ area, completed, total, targetKey }) => (
          <Link
            key={area.key}
            href={`/portal/events/${eventId}/${targetKey}`}
            className="flex items-start gap-4 p-5 bg-white border border-gray-200 rounded-2xl hover:border-blue-400 hover:shadow-md transition-all group"
          >
            <SectionIconBadge icon={area.icon} bg="bg-blue-50" fg="text-blue-600" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">{area.label}</p>
              <p className="text-sm text-gray-500 mt-0.5">{area.desc}</p>
              <span
                className={`inline-block mt-2 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                  countsLoading
                    ? 'bg-gray-100 text-gray-400'
                    : total === 0
                      ? 'bg-gray-100 text-gray-500'
                      : completed >= total
                        ? 'bg-green-100 text-green-700'
                        : 'bg-amber-100 text-amber-700'
                }`}
              >
                {countsLoading ? '…' : total === 0 ? 'No setup needed' : `${completed} of ${total} complete`}
              </span>
            </div>
          </Link>
        ))}

        {plannerApplicable && (
          <Link
            href={`/portal/events/${eventId}/${plannerRecommendation?.href ?? 'planner-overview'}?product=planner`}
            className="flex items-start gap-4 p-5 bg-white border border-gray-200 rounded-2xl hover:border-orange-300 hover:shadow-md transition-all group"
          >
            <SectionIconBadge icon="insights" bg="bg-orange-50" fg="text-orange-600" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900 group-hover:text-orange-700 transition-colors">
                Bendie Planner <span className="text-orange-600 text-[10px] font-bold uppercase tracking-wider ml-1 align-middle">Planner</span>
              </p>
              <p className="text-sm text-gray-500 mt-0.5">People, logistics and production</p>
              <span
                className={`inline-block mt-2 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                  plannerCountsLoading
                    ? 'bg-gray-100 text-gray-400'
                    : plannerModulesKnown === 0
                      ? 'bg-gray-100 text-gray-500'
                      : plannerModulesStarted === 0
                        ? 'bg-gray-100 text-gray-500'
                        : plannerModulesStarted >= plannerModulesKnown
                          ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700'
                }`}
              >
                {plannerCountsLoading
                  ? '…'
                  : plannerModulesKnown === 0
                    ? 'Not available'
                    : plannerModulesStarted === 0
                      ? 'Not started'
                      : `${plannerModulesStarted} of ${plannerModulesKnown} modules started`}
              </span>
            </div>
          </Link>
        )}
      </div>

      {/* §16 — condensed Planner Readiness: a compact list, not a second full card grid. Same underlying `plannerCounts`/links as before, just presented as scannable rows with a single "View Planner details" entry point instead of 8 separate cards. */}
      {plannerApplicable && (
        <div className="mt-6 bg-white border border-gray-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-bold text-gray-900">Planner Readiness</h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-orange-50 text-orange-600">Bendie Planner</span>
          </div>
          <div className="divide-y divide-gray-100">
            {[
              { href: 'planner-people', label: 'Participants', value: plannerCountsLoading ? '…' : plannerCounts.peopleTotal === null ? 'Not available' : `${plannerCounts.peopleTotal}` },
              {
                href: 'planner-logistics',
                view: 'flights',
                label: 'Flights',
                value:
                  plannerCountsLoading
                    ? '…'
                    : plannerCounts.flightsCovered === null || plannerCounts.peopleTotal === null
                      ? 'Not available'
                      : `${plannerCounts.flightsCovered} configured`,
              },
              {
                href: 'planner-logistics',
                view: 'hotels',
                label: 'Hotels',
                value:
                  plannerCountsLoading
                    ? '…'
                    : plannerCounts.hotelsCovered === null || plannerCounts.peopleTotal === null
                      ? 'Not available'
                      : `${plannerCounts.hotelsCovered} configured`,
              },
              {
                href: 'planner-logistics',
                view: 'ground-transport',
                label: 'Ground Transport',
                value:
                  plannerCountsLoading
                    ? '…'
                    : plannerCounts.groundTransportAssigned === null || plannerCounts.peopleTotal === null
                      ? 'Not available'
                      : plannerCounts.peopleTotal - plannerCounts.groundTransportAssigned > 0
                        ? `${plannerCounts.peopleTotal - plannerCounts.groundTransportAssigned} unassigned`
                        : 'All assigned',
              },
              {
                href: 'planner-tasks',
                label: 'Tasks',
                value: plannerCountsLoading ? '…' : plannerCounts.tasksOutstanding === null ? 'Not available' : `${plannerCounts.tasksOutstanding} outstanding`,
              },
              {
                href: 'planner-checklist',
                label: 'Checklist',
                value: plannerCountsLoading ? '…' : plannerCounts.checklistUnsourced === null ? 'Not available' : `${plannerCounts.checklistUnsourced} unsourced`,
              },
              {
                href: 'planner-vendors',
                label: 'Vendors',
                value: plannerCountsLoading ? '…' : plannerCounts.vendorsNotOnSite === null ? 'Not available' : `${plannerCounts.vendorsNotOnSite} not on-site`,
              },
              {
                href: 'planner-production',
                label: 'Production',
                value: plannerCountsLoading ? '…' : plannerCounts.productionTotal === null ? 'Not available' : `${plannerCounts.productionTotal} sessions`,
              },
            ].map((row) => (
              <Link
                key={row.label}
                href={`/portal/events/${eventId}/${row.href}?product=planner${'view' in row ? `&view=${row.view}` : ''}`}
                className="flex items-center justify-between gap-3 py-2 text-sm hover:bg-gray-50 -mx-2 px-2 rounded-lg transition-colors group"
              >
                <span className="text-gray-700 group-hover:text-orange-700 transition-colors">{row.label}</span>
                <span className="text-gray-500">{row.value}</span>
              </Link>
            ))}
          </div>
          <Link
            href={`/portal/events/${eventId}/planner-overview?product=planner`}
            className="inline-flex items-center gap-1 mt-3 text-sm font-semibold text-orange-600 hover:opacity-80 transition-opacity"
          >
            View Planner details <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </Link>
        </div>
      )}
    </div>
  );
}
