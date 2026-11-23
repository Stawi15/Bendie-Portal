'use client';

import Link from 'next/link';
import {
  deriveEventLifecycle,
  EVENT_LIFECYCLE_LABELS,
  EVENT_LIFECYCLE_PILL_CLASSES,
} from '@/lib/eventLifecycle';
import { EVENT_GROUP_DESCRIPTIONS, OVERVIEW_GROUP } from '@/lib/eventSectionMeta';
import { PRODUCT_PRESENTATION } from '@/lib/productPresentation';
import { ManageModulesModal } from '@/components/portal/ManageModulesModal';
import {
  EventContentGate,
  EventStepNav,
  EventWorkspaceDenied,
  EventWorkspaceLoading,
} from '@/components/shell/EventWorkspaceParts';
import type { EventWorkspace } from '@/lib/useEventWorkspace';

/**
 * Feature 030 — the CURRENT event layout ("v1"), moved verbatim from
 * `[eventId]/layout.tsx`. Renders from `useEventWorkspace()`; must keep looking
 * and behaving exactly as before Feature 030 (spec FR-004).
 */
export function EventWorkspaceV1({
  ws,
  children,
}: {
  ws: EventWorkspace;
  children: React.ReactNode;
}) {
  const {
    activeSectionKey,
    areaProductFor,
    canScrollGroupLeft,
    canScrollGroupRight,
    currentEvent,
    currentGroup,
    currentGroupKey,
    groupHref,
    groupNavRef,
    groupStepIndex,
    groupSteps,
    groupedVisibleSections,
    isSteppedGroup,
    loading,
    manageModulesOpen,
    moduleProducts,
    navSettled,
    patchCurrentEvent,
    router,
    scrollGroups,
    sectionHref,
    setManageModulesOpen,
    workspaceAuthDenied,
    workspaceAuthPending,
  } = ws;

  if (workspaceAuthPending) {
    return <EventWorkspaceLoading />;
  }

  if (workspaceAuthDenied) {
    return <EventWorkspaceDenied />;
  }

  return (
    <div className="flex flex-col h-full">
      {manageModulesOpen && currentEvent && (
        <ManageModulesModal
          eventId={currentEvent.id}
          products={moduleProducts}
          current={currentEvent.portal_setup_modules ?? null}
          onClose={() => setManageModulesOpen(false)}
          onSaved={(modules) => {
            // In-memory patch only — the tab bar updates immediately, nothing refetches or remounts.
            patchCurrentEvent(currentEvent.id, { portal_setup_modules: modules });
            setManageModulesOpen(false);
          }}
        />
      )}
      {/* Static header — a sibling of the scroll area below, never inside it, so nothing can ever scroll behind or through it. */}
      <div className="flex-shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pb-2">
          <div className="min-w-0">
            <Link
              href="/portal/events"
              className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-primary mb-0.5 w-fit"
            >
              <span className="material-symbols-outlined text-sm">arrow_back</span> All Events
            </Link>
            <h1 className="font-headline-lg text-headline-lg text-on-surface truncate">
              {loading ? 'Loading…' : (currentEvent?.name ?? 'Event')}
            </h1>
          </div>
          {currentEvent && (
            <div className="flex items-center gap-2 flex-shrink-0">
              {moduleProducts.length > 0 && (
                <button
                  type="button"
                  onClick={() => setManageModulesOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant px-3 py-1 text-xs font-medium text-on-surface-variant hover:border-primary hover:text-primary transition-colors"
                >
                  <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                    tune
                  </span>
                  Manage modules
                </button>
              )}
              <span
                className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  EVENT_LIFECYCLE_PILL_CLASSES[deriveEventLifecycle(currentEvent)]
                }`}
              >
                {EVENT_LIFECYCLE_LABELS[deriveEventLifecycle(currentEvent)]}
              </span>
            </div>
          )}
        </div>
        {!navSettled ? (
          // Stable placeholder while Planner sub-module capabilities are
          // still resolving — never a partially-computed, flicker-prone tab
          // bar (see the `plannerCapabilitiesSettled` doc comment above).
          <div className="flex items-center gap-1.5 pb-2" aria-busy="true">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-6 w-20 bg-surface-container-low rounded-full animate-pulse"
              />
            ))}
          </div>
        ) : (
          <>
            {groupedVisibleSections.length > 1 && (
              <>
                {/* LEVEL 1 — Event areas: non-linear "jump anywhere" navigation, deliberately flat
                (plain text + underline, no pills, no numbers) so it doesn't read as a sequence. */}
                <div className="md:hidden pb-2">
                  <label
                    htmlFor="event-area-select"
                    className="block text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant mb-1"
                  >
                    Event area
                  </label>
                  <div className="relative">
                    <select
                      id="event-area-select"
                      className="input text-sm appearance-none pr-9"
                      value={currentGroupKey ?? ''}
                      onChange={(e) => {
                        const target = groupedVisibleSections.find(
                          (g) => g.group === e.target.value
                        );
                        if (target) router.push(groupHref(target.sections));
                      }}
                    >
                      {groupedVisibleSections.map(({ group, sections }) => (
                        <option key={group} value={group}>
                          {sections[0].product === 'planner' ? `${group} (Planner)` : group}
                        </option>
                      ))}
                    </select>
                    <span
                      className="material-symbols-outlined pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant"
                      aria-hidden="true"
                    >
                      expand_more
                    </span>
                  </div>
                </div>
                <div className="relative hidden md:flex items-center gap-1 border-b border-outline-variant">
                  {canScrollGroupLeft && (
                    <button
                      type="button"
                      onClick={() => scrollGroups(-200)}
                      className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors"
                      aria-label="Scroll event areas left"
                    >
                      <span className="material-symbols-outlined text-[18px]">chevron_left</span>
                    </button>
                  )}
                  <nav aria-label="Event areas" className="flex-1 min-w-0">
                    {/* Feature 016 (main-tab pass): overflow-x-auto forces overflow-y to auto too (CSS spec); the links' former
                    -mb-px made content 1px taller than this box, producing a 1px vertical overflow + 6px scrollbar.
                    Cause removed below; overflow-y-hidden guards it. Horizontal scrolling is unchanged. */}
                    <div
                      ref={groupNavRef}
                      className="flex items-center gap-5 overflow-x-auto overflow-y-hidden custom-scrollbar"
                    >
                      {groupedVisibleSections.map(({ group, sections }, index) => {
                        const isPlannerGroup = sections[0].product === 'planner';
                        // Subtle Bendie → Planner divider, once, only on a Both event (§11).
                        const previousWasBendie =
                          index > 0 &&
                          groupedVisibleSections[index - 1].sections[0].product !== 'planner';
                        const isActive = group === currentGroupKey;
                        return (
                          <span key={group} className="flex items-center gap-5 flex-shrink-0">
                            {isPlannerGroup && previousWasBendie && (
                              <span
                                className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider opacity-70 ${PRODUCT_PRESENTATION.planner.accentText}`}
                                aria-hidden="true"
                              >
                                <span className="w-px h-4 bg-outline-variant" />
                                Planner
                              </span>
                            )}
                            <Link
                              href={groupHref(sections)}
                              data-active={isActive}
                              aria-current={isActive ? 'true' : undefined}
                              className={`flex-shrink-0 py-2 border-b-2 text-sm whitespace-nowrap transition-colors ${
                                isActive
                                  ? `${PRODUCT_PRESENTATION[areaProductFor(sections)].areaActive} font-semibold`
                                  : 'border-transparent text-on-surface-variant hover:text-on-surface'
                              }`}
                            >
                              {group}
                            </Link>
                          </span>
                        );
                      })}
                    </div>
                  </nav>
                  {canScrollGroupRight && (
                    <button
                      type="button"
                      onClick={() => scrollGroups(200)}
                      className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors"
                      aria-label="Scroll event areas right"
                    >
                      <span className="material-symbols-outlined text-[18px]">chevron_right</span>
                    </button>
                  )}
                </div>
              </>
            )}

            {/* LEVEL 2 — the current area's own pages. Multi-page areas get a numbered,
            connected stepper ("Step 2 of 3"); single-page areas just get context.
            Numbers mark position only — no checkmarks, since the layout has no real
            completion data (visited ≠ complete). */}
            {currentGroup && (
              <section
                aria-label={`${currentGroup.group} area`}
                className="pt-2.5 pb-2.5 border-b border-outline-variant"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <h2
                    className={`text-xs font-bold uppercase tracking-wider ${PRODUCT_PRESENTATION[areaProductFor(currentGroup.sections)].areaHeading}`}
                  >
                    {currentGroup.group}
                  </h2>
                  {EVENT_GROUP_DESCRIPTIONS[currentGroup.group] && (
                    <p className="text-xs text-on-surface-variant">
                      {EVENT_GROUP_DESCRIPTIONS[currentGroup.group]}
                    </p>
                  )}
                  {isSteppedGroup && (
                    <span className="sm:ml-auto text-xs font-semibold text-on-surface">
                      Step {groupStepIndex + 1} of {groupSteps.length}
                    </span>
                  )}
                </div>
                {isSteppedGroup ? (
                  <nav aria-label={`${currentGroup.group} pages`} className="mt-2">
                    <ol className="flex flex-wrap items-center gap-y-2">
                      {groupSteps.map((step, i) => {
                        const state =
                          i < groupStepIndex
                            ? 'previous'
                            : i === groupStepIndex
                              ? 'current'
                              : 'upcoming';
                        // Product accent on the active/previous step only; numbering, connectors and hierarchy unchanged.
                        const stepAccent = PRODUCT_PRESENTATION[areaProductFor(groupSteps)];
                        return (
                          <li key={step.key} className="flex items-center">
                            <Link
                              href={sectionHref(step)}
                              data-active={state === 'current'}
                              aria-current={state === 'current' ? 'page' : undefined}
                              aria-label={`Step ${i + 1} of ${groupSteps.length}: ${step.label}${state === 'current' ? ' (current page)' : ''}`}
                              className={`group flex items-center gap-2 rounded-full py-1 pl-1 pr-3 transition-colors ${
                                state === 'current'
                                  ? stepAccent.stepCurrentSurface
                                  : 'hover:bg-surface-container-low'
                              }`}
                            >
                              <span
                                className={`w-6 h-6 flex-shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
                                  state === 'current'
                                    ? stepAccent.stepCurrent
                                    : state === 'previous'
                                      ? `border-2 ${stepAccent.stepPrevious}`
                                      : 'border-2 border-outline-variant text-on-surface-variant'
                                }`}
                                aria-hidden="true"
                              >
                                {i + 1}
                              </span>
                              <span
                                className={`text-sm whitespace-nowrap ${
                                  state === 'current'
                                    ? 'font-bold text-on-surface'
                                    : 'hidden sm:inline text-on-surface-variant group-hover:text-on-surface'
                                }`}
                              >
                                {step.label}
                              </span>
                            </Link>
                            {i < groupSteps.length - 1 && (
                              <span
                                className="w-4 sm:w-6 h-px bg-outline-variant mx-1"
                                aria-hidden="true"
                              />
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </nav>
                ) : currentGroup.group === OVERVIEW_GROUP && groupSteps.length > 1 ? (
                  // Both events: the Overview hub holds Dashboard + Planner Overview — plain links, not numbered steps.
                  <nav aria-label="Overview pages" className="mt-1.5 flex gap-4">
                    {groupSteps.map((step) => {
                      const active = step.key === activeSectionKey;
                      return (
                        <Link
                          key={step.key}
                          href={sectionHref(step)}
                          data-active={active}
                          aria-current={active ? 'page' : undefined}
                          className={`text-sm py-1 border-b-2 ${active ? 'border-primary text-primary font-semibold' : 'border-transparent text-on-surface-variant hover:text-on-surface'}`}
                        >
                          {step.label}
                        </Link>
                      );
                    })}
                  </nav>
                ) : null}
              </section>
            )}
          </>
        )}
      </div>

      {/* The only thing that scrolls — sized to fill the rest of the event shell (see Portal App Shell in ui-registry.md). */}
      <div className="flex-1 min-h-0 min-w-0 overflow-y-auto custom-scrollbar pt-4">
        <EventContentGate ws={ws}>{children}</EventContentGate>
      </div>

      {/* LEVEL 4 — Previous / Next along the canonical journey. An in-flow footer
          (not a floating button): it never covers table actions or pagination,
          modals (z-50 overlays) sit above it, and it's hidden on the Dashboard,
          which has its own "Recommended next" (§17). */}
      <EventStepNav ws={ws} />
    </div>
  );
}
