'use client';

import Link from 'next/link';
import { PausedProductNotice } from '@/components/portal/PausedProductNotice';
import type { EventWorkspace } from '@/lib/useEventWorkspace';

/*
 * Feature 030 — pieces of the event workspace render shared by the current
 * layout (V1) and the Studio 2.0 shell (V2). Markup moved VERBATIM from
 * `[eventId]/layout.tsx`, so both layouts gate pages identically and the
 * current layout looks exactly as before.
 */

/** Shown while workspace access is being resolved. */
export function EventWorkspaceLoading() {
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

/** Shown when the user can see the event in a list but isn't a member. */
export function EventWorkspaceDenied() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-4">
      <span className="material-symbols-outlined text-5xl text-on-surface-variant mb-3">lock</span>
      <h1 className="font-headline-sm text-headline-sm text-on-surface mb-1">
        You don&apos;t have access to this event
      </h1>
      <p className="text-body-md font-body-md text-on-surface-variant max-w-sm">
        You can see this event in your organisation&apos;s event list, but entering it requires
        being added as an event member.
      </p>
      <Link href="/portal/events" className="btn-secondary mt-4">
        Back to Events
      </Link>
    </div>
  );
}

/** The page-content gate: loading → paused notice → unavailable → the page. */
export function EventContentGate({
  ws,
  children,
}: {
  ws: Pick<
    EventWorkspace,
    'productAuthPending' | 'activeSectionUnavailable' | 'pausedActiveProduct'
  >;
  children: React.ReactNode;
}) {
  const { productAuthPending, activeSectionUnavailable, pausedActiveProduct } = ws;
  return (
    <>
      {productAuthPending ? (
        <div className="space-y-3" aria-busy="true">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-surface-container-low rounded-xl animate-pulse" />
          ))}
        </div>
      ) : activeSectionUnavailable && pausedActiveProduct ? (
        <PausedProductNotice product={pausedActiveProduct} />
      ) : activeSectionUnavailable ? (
        <div className="flex flex-col items-center justify-center h-full text-center px-4">
          <span className="material-symbols-outlined text-5xl text-on-surface-variant mb-3">
            block
          </span>
          <h2 className="font-headline-sm text-headline-sm text-on-surface mb-1">
            This isn&apos;t available for this event
          </h2>
          <p className="text-body-md font-body-md text-on-surface-variant max-w-sm">
            This section belongs to a product that isn&apos;t currently active for this event&apos;s
            organisation.
          </p>
        </div>
      ) : (
        children
      )}
    </>
  );
}

/** Previous / Next along the canonical journey. */
export function EventStepNav({
  ws,
}: {
  ws: Pick<
    EventWorkspace,
    'previousStep' | 'nextStep' | 'productAuthPending' | 'sectionHref' | 'journeyLabel'
  >;
}) {
  const { previousStep, nextStep, productAuthPending, sectionHref, journeyLabel } = ws;
  return (
    <>
      {(previousStep || nextStep) && !productAuthPending && (
        <nav
          aria-label="Previous and next page"
          className="flex-shrink-0 flex items-center gap-3 border-t border-outline-variant pt-2.5 mt-1"
        >
          {previousStep && (
            <Link href={sectionHref(previousStep)} className="btn-secondary min-w-0 max-w-[48%]">
              <span
                className="material-symbols-outlined text-[18px] flex-shrink-0"
                aria-hidden="true"
              >
                arrow_back
              </span>
              <span className="truncate">
                <span className="hidden sm:inline">Previous: </span>
                {journeyLabel(previousStep)}
              </span>
            </Link>
          )}
          {nextStep && (
            <Link href={sectionHref(nextStep)} className="btn-primary min-w-0 max-w-[48%] ml-auto">
              <span className="truncate">
                <span className="hidden sm:inline">Next: </span>
                {journeyLabel(nextStep)}
              </span>
              <span
                className="material-symbols-outlined text-[18px] flex-shrink-0"
                aria-hidden="true"
              >
                arrow_forward
              </span>
            </Link>
          )}
        </nav>
      )}
    </>
  );
}
