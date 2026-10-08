'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useEvent } from '@/contexts/EventContext';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { EVENT_SECTIONS } from '@/lib/eventSectionMeta';
import { isSectionShownByModules } from '@/lib/eventModules';
import { SectionIconBadge } from '@/components/portal/SectionIconBadge';
import { SectionHeader } from '@/components/portal/SectionHeader';
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
  facilitators: { kind: 'count', table: 'facilitators', noun: 'speakers', scored: true },
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
  { key: 'programme', label: 'Programme', desc: 'Speakers, agenda, activities and excursions', icon: 'calendar_month', sectionKeys: ['facilitators', 'agenda', 'activities', 'excursions'] },
  { key: 'attendees', label: 'Attendees', desc: 'Attendees & access, attendee travel and networking', icon: 'groups', sectionKeys: ['members', 'attendee-travel', 'networking'] },
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

// Planner readiness counts are computed server-side by /planner-readiness (Feature 016 main-tab pass).
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

export default function DashboardPage() {
  const { currentEvent, loading } = useEvent();
  const params = useParams();
  const eventId = params.eventId as string;
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [countsLoading, setCountsLoading] = useState(true);
  // Feature 016 (reliability pass): the one REQUIRED data check — attendees with access.
  const [attendeeCount, setAttendeeCount] = useState(0);
  const [plannerCounts, setPlannerCounts] = useState<PlannerCounts>(EMPTY_PLANNER_COUNTS);
  const [plannerCountsLoading, setPlannerCountsLoading] = useState(true);
  const plannerApplicable = isPlannerApplicable(currentEvent);

  useEffect(() => {
    if (!eventId) return;
    // Feature 016 (main-tab performance pass): cancel these ~20 head counts when the
    // user leaves the Dashboard, instead of letting them run on after navigation.
    const controller = new AbortController();
    setCountsLoading(true);
    Promise.all([
      Promise.all(
        COUNTED_TABLES.map((table) => {
          const query = supabase.from(table).select('*', { count: 'exact', head: true });
          return (GLOBAL_CAPABLE_TABLES.has(table)
            ? query.or(`event_id.eq.${eventId},event_id.is.null`)
            : query.eq('event_id', eventId)
          ).abortSignal(controller.signal);
        })
      ),
      // Head-only count, in parallel with the existing counts (no extra round-trip latency).
      supabase.from('event_members').select('*', { count: 'exact', head: true }).eq('event_id', eventId).eq('role', 'attendee').abortSignal(controller.signal),
    ])
      .then(([results, attendees]) => {
        if (controller.signal.aborted) return; // superseded — never an error, never a state write
        const next: Record<string, number> = {};
        COUNTED_TABLES.forEach((table, i) => {
          next[table] = results[i].count ?? 0;
        });
        setCounts(next);
        setAttendeeCount(attendees.count ?? 0);
        setCountsLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        console.error('Dashboard: counts failed', err);
        setCountsLoading(false);
      });
    return () => controller.abort();
  }, [eventId]);

  // Feature 016 (main-tab performance pass): ONE counts-only request. This used to be
  // eight Planner collection requests, each re-running the full Portal + Planner
  // authorization chain and never cancelled — leaving the Dashboard left them holding
  // the browser's same-origin connections, so the next tab's navigation queued behind
  // them. /planner-readiness runs the chain once, counts server-side, and returns
  // null ("Not available") for any module the user can't view — same as before.
  useEffect(() => {
    if (!eventId || !plannerApplicable) {
      setPlannerCountsLoading(false);
      return;
    }
    const controller = new AbortController();
    setPlannerCountsLoading(true);
    fetch(`/api/events/${eventId}/planner-readiness`, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { counts?: PlannerCounts } | null) => {
        if (controller.signal.aborted) return;
        setPlannerCounts(data?.counts ?? EMPTY_PLANNER_COUNTS);
        setPlannerCountsLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return; // navigation, not failure
        console.error('Dashboard: planner readiness failed', err);
        setPlannerCounts(EMPTY_PLANNER_COUNTS);
        setPlannerCountsLoading(false);
      });
    return () => controller.abort();
  }, [eventId, plannerApplicable]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" role="status" aria-label="Loading" />
      </div>
    );
  }

  // Feature 016 — progress, recommendations and area cards only consider the
  // modules this event actually uses (events.portal_setup_modules; NULL = all,
  // unchanged behaviour for older events). Display only — nothing is deleted.
  const selectedModules = currentEvent?.portal_setup_modules ?? null;
  const shown = (key: string) => isSectionShownByModules(key, selectedModules);
  const shownSections = DASHBOARD_SECTIONS.filter((s) => shown(s.key));

  const scoredSections = shownSections.filter((s) => {
    const check = SECTION_CHECKS[s.key];
    return check.kind === 'field' || (check.kind === 'count' && check.scored);
  });
  // Feature 016 (reliability pass) — readiness semantics. The old "X of N sections
  // complete / NN%" counted any section with one record (or two filled fields) as
  // "complete" and never counted attendees at all. Now:
  //  - REQUIRED: only what the attendee experience genuinely depends on — the event's
  //    name and dates, and at least one attendee with access (nobody can use the app
  //    otherwise). Both are verifiable, so these are the only items shown as done (✓).
  //  - RECOMMENDED: Hero & Branding (the app's home screen), Agenda and Emergency (always
  //    in the attendee app menu), plus any modules chosen for this event.
  //  - OPTIONAL: every other visible section.
  // Recommended/optional show "Has content" / "Not started" — never "complete".
  const hasContent = (key: string) => {
    const check = SECTION_CHECKS[key];
    if (!check) return false;
    if (check.kind === 'field') return !!currentEvent && check.test(currentEvent);
    if (check.kind === 'count') return (counts[check.table] ?? 0) > 0;
    return false;
  };
  const requiredItems = [
    { key: 'basics', label: 'Event name and dates', why: 'Shown on the event and in the attendee app.', done: !!currentEvent?.name && !!currentEvent?.starts_at },
    { key: 'members', label: 'At least one attendee with access', why: 'Nobody can use the event app until they have access.', done: attendeeCount > 0 },
  ];
  const ALWAYS_RECOMMENDED = ['hero', 'agenda', 'emergency'];
  const requiredKeys = new Set(requiredItems.map((r) => r.key));
  const recommendedSections = scoredSections.filter(
    (s) => !requiredKeys.has(s.key) && (ALWAYS_RECOMMENDED.includes(s.key) || (selectedModules ?? []).includes(s.key))
  );
  const optionalSections = scoredSections.filter((s) => !requiredKeys.has(s.key) && !recommendedSections.includes(s));
  const requiredDone = requiredItems.filter((r) => r.done).length;
  const recommendedWithContent = recommendedSections.filter((s) => hasContent(s.key)).length;
  const optionalWithContent = optionalSections.filter((s) => hasContent(s.key)).length;

  // "Recommended next": an unmet REQUIRED item first, then a recommended section with no
  // content yet — never an optional one (no pressure to fill every module).
  const firstRequired = requiredItems.find((r) => !r.done);
  const nextBendieSection = currentEvent
    ? firstRequired
      ? { key: firstRequired.key, label: firstRequired.label, desc: firstRequired.why }
      : recommendedSections.find((s) => !hasContent(s.key))
    : undefined;

  // Same principle for Planner, in the dependency order the current
  // implementation actually has (People is a hard prerequisite for
  // Flights/Hotels/Ground Transport; the rest have no real ordering
  // constraint, so Tasks/Vendors/Checklist/Production are just listed in
  // their own tab order).
  const plannerRecommendation =
    plannerApplicable && !plannerCountsLoading
      ? plannerCounts.peopleTotal === 0 && shown('planner-people')
        ? { label: 'Add participants', desc: 'Flights, hotels and ground transport all need a participant to attach to first.', href: 'planner-people' }
        : shown('planner-logistics') && plannerCounts.peopleTotal !== null && plannerCounts.flightsCovered !== null && plannerCounts.flightsCovered < plannerCounts.peopleTotal
          ? { label: 'Add flight details', desc: `${plannerCounts.peopleTotal - plannerCounts.flightsCovered} of ${plannerCounts.peopleTotal} participants have no flight on file.`, href: 'planner-logistics' }
          : shown('planner-logistics') && plannerCounts.peopleTotal !== null && plannerCounts.hotelsCovered !== null && plannerCounts.hotelsCovered < plannerCounts.peopleTotal
            ? { label: 'Add accommodation', desc: `${plannerCounts.peopleTotal - plannerCounts.hotelsCovered} of ${plannerCounts.peopleTotal} participants have no hotel booking on file.`, href: 'planner-logistics' }
            : shown('planner-logistics') && plannerCounts.peopleTotal !== null && plannerCounts.groundTransportAssigned !== null && plannerCounts.groundTransportAssigned < plannerCounts.peopleTotal
              ? { label: 'Assign ground transport', desc: `${plannerCounts.peopleTotal - plannerCounts.groundTransportAssigned} of ${plannerCounts.peopleTotal} participants aren't on a vehicle yet.`, href: 'planner-logistics' }
              : shown('planner-tasks') && plannerCounts.tasksOutstanding !== null && plannerCounts.tasksOutstanding > 0
                ? { label: 'Review outstanding tasks', desc: `${plannerCounts.tasksOutstanding} task${plannerCounts.tasksOutstanding === 1 ? '' : 's'} not yet completed.`, href: 'planner-tasks' }
                : shown('planner-checklist') && plannerCounts.checklistUnsourced !== null && plannerCounts.checklistUnsourced > 0
                  ? { label: 'Source checklist items', desc: `${plannerCounts.checklistUnsourced} item${plannerCounts.checklistUnsourced === 1 ? '' : 's'} not yet sourced.`, href: 'planner-checklist' }
                  : shown('planner-vendors') && plannerCounts.vendorsNotOnSite !== null && plannerCounts.vendorsNotOnSite > 0
                    ? { label: 'Finish vendor logistics', desc: `${plannerCounts.vendorsNotOnSite} vendor item${plannerCounts.vendorsNotOnSite === 1 ? '' : 's'} not yet on-site.`, href: 'planner-vendors' }
                    : shown('planner-production') && plannerCounts.productionTotal === 0
                      ? { label: 'Build the production schedule', desc: 'No production sessions have been added yet.', href: 'planner-production' }
                      : null
      : null;

  // §14 — one compact status per Bendie setup area, reusing the exact same
  // per-section `SECTION_CHECKS` truth this page has always used (no new
  // completion rule invented) — just aggregated up to the area level instead
  // of rendered as one card per section.
  const bendieAreaStatuses = BENDIE_DASHBOARD_AREAS.map((area) => {
    const areaSections = area.sectionKeys
      .map((key) => shownSections.find((s) => s.key === key))
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
    return { area, completed, total: scoredInArea.length, targetKey, empty: areaSections.length === 0 };
  }).filter((a) => !a.empty);

  // Same treatment for the single "Bendie Planner" area card — reuses the
  // exact same `plannerCounts`/`plannerRecommendation` this page already
  // computed for the Recommended-Next callout, just condensed to one status
  // line instead of 8 separate cards (§16).
  const plannerModuleFlags = plannerApplicable
    ? [
        plannerCounts.peopleTotal,
        ...(shown('planner-logistics') ? [plannerCounts.flightsCovered, plannerCounts.hotelsCovered, plannerCounts.groundTransportAssigned] : []),
        ...(shown('planner-tasks') ? [plannerCounts.tasksTotal] : []),
        ...(shown('planner-vendors') ? [plannerCounts.vendorsTotal] : []),
        ...(shown('planner-checklist') ? [plannerCounts.checklistTotal] : []),
        ...(shown('planner-production') ? [plannerCounts.productionTotal] : []),
      ]
    : [];
  const plannerModulesStarted = plannerModuleFlags.filter((n) => (n ?? 0) > 0).length;
  const plannerModulesKnown = plannerModuleFlags.filter((n) => n !== null).length;

  return (
    <div>
      {/* Feature 016 density pass — the event name is already the workspace title above;
          this page now uses the standard section header instead of repeating it. */}
      <div className="mb-4">
        <SectionHeader sectionKey="dashboard" />
      </div>

      {currentEvent && <PlannerProvisioningBanner event={currentEvent} />}

      <section className="bg-white border border-[#E4EAF0] rounded-[20px] p-4 mb-4" aria-labelledby="readiness-title">
        <p id="readiness-title" className="font-semibold text-on-surface">Event readiness</p>
        <p className="text-sm text-on-surface-variant mt-0.5">
          Required items are needed before attendees can use the event. Recommended and optional items can be added whenever you&apos;re ready.
        </p>

        <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-on-surface">
              Required <span className="font-medium normal-case text-on-surface-variant">· {countsLoading ? '…' : `${requiredDone} of ${requiredItems.length} done`}</span>
            </p>
            <ul className="mt-2 space-y-2">
              {requiredItems.map((r) => (
                <li key={r.key}>
                  <Link href={`/portal/events/${eventId}/${r.key}`} className="flex items-start gap-2 group">
                    <span className={`material-symbols-outlined text-[20px] ${countsLoading ? 'text-outline-variant' : r.done ? 'text-green-600' : 'text-amber-600'}`} aria-hidden="true">
                      {r.done ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                    <span className="text-sm">
                      <span className="font-medium text-on-surface group-hover:text-primary">{r.label}</span>
                      <span className="sr-only">{r.done ? ' — done' : ' — to do'}</span>
                      {!r.done && !countsLoading && <span className="block text-xs text-on-surface-variant">{r.why}</span>}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-on-surface">
              Recommended <span className="font-medium normal-case text-on-surface-variant">· {countsLoading ? '…' : `${recommendedWithContent} of ${recommendedSections.length} have content`}</span>
            </p>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {recommendedSections.map((s) => {
                const filled = hasContent(s.key);
                return (
                  <li key={s.key}>
                    <Link
                      href={`/portal/events/${eventId}/${s.key}`}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${filled ? 'border-[#E4EAF0] text-on-surface' : 'border-amber-200 bg-amber-50 text-amber-900'}`}
                    >
                      {s.label}
                      <span className="text-on-surface-variant">· {countsLoading ? '…' : filled ? 'Has content' : 'Not started'}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <p className="text-[11px] text-on-surface-variant mt-2">Attendees see these in the app{selectedModules ? ', or you chose them for this event' : ''}.</p>
          </div>

          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-on-surface">
              Optional <span className="font-medium normal-case text-on-surface-variant">· {countsLoading ? '…' : `${optionalWithContent} of ${optionalSections.length} have content`}</span>
            </p>
            <details className="mt-2 group">
              <summary className="cursor-pointer text-xs font-medium text-primary">Show optional sections</summary>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {optionalSections.map((s) => (
                  <li key={s.key}>
                    <Link href={`/portal/events/${eventId}/${s.key}`} className="inline-flex items-center gap-1 rounded-full border border-[#E4EAF0] px-2.5 py-1 text-xs text-on-surface">
                      {s.label}
                      <span className="text-on-surface-variant">· {countsLoading ? '…' : hasContent(s.key) ? 'Has content' : 'Not started'}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
            <p className="text-[11px] text-on-surface-variant mt-2">Skip anything your event doesn&apos;t need.</p>
          </div>
        </div>
      </section>

      {(nextBendieSection || plannerRecommendation) && (
        <div className="bg-primary/5 border border-primary/15 rounded-[20px] p-4 mb-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-primary">Recommended next</p>
          {nextBendieSection && (
            <Link
              href={`/portal/events/${eventId}/${nextBendieSection.key}`}
              className="flex items-center justify-between gap-3 group"
            >
              <div>
                <p className="font-semibold text-on-surface group-hover:text-primary transition-colors">{nextBendieSection.label}</p>
                <p className="text-sm text-on-surface-variant">{nextBendieSection.desc}</p>
              </div>
              <span className="material-symbols-outlined text-primary">arrow_forward</span>
            </Link>
          )}
          {plannerRecommendation && (
            <Link
              href={`/portal/events/${eventId}/${plannerRecommendation.href}?product=planner`}
              className="flex items-center justify-between gap-3 group"
            >
              <div>
                <p className="font-semibold text-on-surface group-hover:text-primary transition-colors">
                  {plannerRecommendation.label} <span className="text-orange-600 text-xs font-bold uppercase tracking-wide ml-1">Bendie Planner</span>
                </p>
                <p className="text-sm text-on-surface-variant">{plannerRecommendation.desc}</p>
              </div>
              <span className="material-symbols-outlined text-primary">arrow_forward</span>
            </Link>
          )}
        </div>
      )}

      {/* §13/§14 — high-level setup-area cards replace the old one-card-per-section grid (was 22+ cards; now 5, or 6 with Bendie Planner). Each card's target is the first incomplete section in that area (or its first section once complete), reusing the exact same per-section completion truth as the progress bar above. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {bendieAreaStatuses.map(({ area, completed, total, targetKey }) => (
          <Link
            key={area.key}
            href={`/portal/events/${eventId}/${targetKey}`}
            className="flex items-start gap-3 p-4 bg-white border border-[#E4EAF0] rounded-2xl hover:border-primary/40 hover:shadow-md transition-all group"
          >
            <SectionIconBadge icon={area.icon} bg="bg-primary/10" fg="text-primary" size={36} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-on-surface group-hover:text-primary transition-colors">{area.label}</p>
              <p className="text-sm text-on-surface-variant mt-0.5">{area.desc}</p>
              <span
                className={`inline-block mt-2 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                  countsLoading
                    ? 'bg-surface-container-low text-on-surface-variant/60'
                    : total === 0
                      ? 'bg-surface-container-low text-on-surface-variant'
                      : completed >= total
                        ? 'bg-green-100 text-green-700'
                        : 'bg-surface-container-low text-on-surface-variant'
                }`}
              >
                {countsLoading ? '…' : total === 0 ? 'No setup needed' : completed === 0 ? 'Not started' : `${completed} of ${total} have content`}
              </span>
            </div>
          </Link>
        ))}

        {plannerApplicable && (
          <Link
            href={`/portal/events/${eventId}/${plannerRecommendation?.href ?? 'planner-overview'}?product=planner`}
            className="flex items-start gap-3 p-4 bg-white border border-[#E4EAF0] rounded-2xl hover:border-orange-300 hover:shadow-md transition-all group"
          >
            <SectionIconBadge icon="insights" bg="bg-orange-50" fg="text-orange-600" size={36} />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-on-surface group-hover:text-orange-700 transition-colors">
                Bendie Planner <span className="text-orange-600 text-[10px] font-bold uppercase tracking-wider ml-1 align-middle">Planner</span>
              </p>
              <p className="text-sm text-on-surface-variant mt-0.5">People, logistics and production</p>
              <span
                className={`inline-block mt-2 text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                  plannerCountsLoading
                    ? 'bg-surface-container-low text-on-surface-variant/60'
                    : plannerModulesKnown === 0
                      ? 'bg-surface-container-low text-on-surface-variant'
                      : plannerModulesStarted === 0
                        ? 'bg-surface-container-low text-on-surface-variant'
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
        <div className="mt-4 bg-white border border-[#E4EAF0] rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-sm font-bold text-on-surface">Planner Readiness</h2>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-orange-50 text-orange-600">Bendie Planner</span>
          </div>
          <div className="divide-y divide-outline-variant/40">
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
                className="flex items-center justify-between gap-3 py-2 text-sm hover:bg-surface-container-low -mx-2 px-2 rounded-lg transition-colors group"
              >
                <span className="text-on-surface group-hover:text-orange-700 transition-colors">{row.label}</span>
                <span className="text-on-surface-variant">{row.value}</span>
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
