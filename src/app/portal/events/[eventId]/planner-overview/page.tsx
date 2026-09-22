'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { SectionHeader } from '@/components/portal/SectionHeader';

/**
 * Feature 005 — Planner Overview. Read-only. Fetches
 * GET /api/events/[eventId]/planner-overview and renders exactly one of the
 * contract's defined states (contracts/get-planner-overview.md). Never displays
 * raw diagnostics, never adds a manual repair/retry control (that remains the
 * separate, platform-admin-only "Bendie Planner" tab from Feature 001), and never
 * misrepresents a legitimate zero-session read as an error.
 */

type EventIdentity = {
  title: string;
  description?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  setupDate?: string;
};

type SessionSummary = {
  totalSessions: number;
  eventPhase: string;
};

type OverviewStatus = 'ready' | 'pending' | 'stale' | 'failed' | 'unavailable' | 'backend_error';

type OverviewState =
  | { kind: 'loading' }
  | { kind: 'denied' }
  | { kind: 'loaded'; status: OverviewStatus; event?: EventIdentity; sessionSummary?: SessionSummary };

function formatDate(value?: string) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function PlannerOverviewPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const [state, setState] = useState<OverviewState>({ kind: 'loading' });
  // Portal UX continuation (016) — Team & Access discoverability (section 11).
  // Reuses the existing can-administer endpoint the Members page's own
  // "Bendie Planner Access" button gating already calls; no new permissions
  // model, no new "who has access" aggregate query (that would require an
  // N+1 fetch across every org member and isn't attempted here).
  const [canAdminister, setCanAdminister] = useState<boolean | null>(null);

  // Review finding F4 — request-generation guard, the same class of fix
  // EventContext.tsx already applies for the identical ABA/stale-response hazard:
  // if a slower request for a previous eventId resolves after a newer request (for
  // a different eventId, or a subsequent reload of the same page) has already
  // started, its result must never overwrite what the newer request already
  // committed or will commit. Bumped once at the start of every `load()` call and
  // once more on unmount, so a response arriving after either event can never win.
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setState({ kind: 'loading' });
    try {
      const res = await fetch(`/api/events/${eventId}/planner-overview`);
      if (requestIdRef.current !== requestId) return; // superseded — discard
      if (!res.ok) {
        setState({ kind: 'denied' });
        return;
      }
      const data = await res.json();
      if (requestIdRef.current !== requestId) return; // superseded — discard
      setState({ kind: 'loaded', status: data.status, event: data.event, sessionSummary: data.sessionSummary });
    } catch (err) {
      if (requestIdRef.current !== requestId) return; // superseded — discard
      console.error('Failed to load Planner Overview', err);
      setState({ kind: 'loaded', status: 'backend_error' });
    }
  }, [eventId]);

  useEffect(() => {
    load();
    return () => {
      // Unmounting (navigating away from this event's Overview entirely) —
      // invalidate any still-in-flight request so it can never call setState on a
      // gone component.
      requestIdRef.current += 1;
    };
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/events/${eventId}/planner-permissions/can-administer`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setCanAdminister(data?.ok ? data.canAdminister === true : false);
      })
      .catch(() => {
        if (!cancelled) setCanAdminister(false);
      });
    return () => {
      cancelled = true;
    };
  }, [eventId]);

  if (state.kind === 'loading') {
    return (
      <div>
        <SectionHeader sectionKey="planner-overview" />
        <div className="mt-6 space-y-3" aria-busy="true">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-surface-container-low rounded-[20px] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (state.kind === 'denied') {
    return (
      <div>
        <SectionHeader sectionKey="planner-overview" />
        <div className="mt-6 flex flex-col items-center justify-center text-center px-4 py-12">
          <span className="material-symbols-outlined text-5xl text-on-surface-variant mb-3">lock</span>
          <h2 className="font-headline-sm text-headline-sm text-on-surface mb-1">Couldn&apos;t load the Planner Overview</h2>
          <p className="text-body-md font-body-md text-on-surface-variant max-w-sm">
            You may not have access to this, or you may need to sign in again.
          </p>
        </div>
      </div>
    );
  }

  const { status, event, sessionSummary } = state;

  // Non-ready states reuse PlannerProvisioningBanner's established copy/severity
  // conventions (research.md Q19) rather than inventing new UI language.
  const nonReadyState = (() => {
    switch (status) {
      case 'pending':
        return { icon: 'hourglass_top', message: 'Setting up Bendie Planner for this event…' };
      case 'stale':
        return {
          icon: 'support_agent',
          message: 'Bendie Planner setup is taking longer than expected. Please contact your administrator or support for assistance.',
        };
      case 'failed':
        return { icon: 'error', message: 'Bendie Planner setup didn’t complete. Please contact your administrator or support for assistance.' };
      case 'unavailable':
        return { icon: 'link_off', message: 'Bendie Planner hasn’t been fully set up for this event yet.' };
      case 'backend_error':
        return { icon: 'cloud_off', message: 'Couldn’t load Bendie Planner data right now — try again in a moment.' };
      default:
        return null;
    }
  })();

  if (nonReadyState) {
    // 'unavailable' and 'backend_error' are visually distinct from 'failed'/'stale'
    // (FR-017; spec.md User Story 5) — a neutral surface-container card rather than
    // the amber provisioning-warning treatment, since neither implies provisioning
    // is actively broken (unavailable may simply mean "not linked yet"; backend_error
    // is a transient read failure, not a provisioning outcome at all).
    const isProvisioningState = status === 'pending' || status === 'stale' || status === 'failed';
    return (
      <div>
        <SectionHeader sectionKey="planner-overview" />
        <div
          className={`mt-6 flex items-center gap-3 rounded-2xl p-4 ${
            isProvisioningState ? 'bg-amber-50 border border-amber-200' : 'bg-surface-container-low'
          }`}
        >
          <span className={`material-symbols-outlined ${isProvisioningState ? 'text-amber-600' : 'text-on-surface-variant'}`}>
            {nonReadyState.icon}
          </span>
          <p className={`text-sm ${isProvisioningState ? 'text-amber-800' : 'text-on-surface-variant'}`}>{nonReadyState.message}</p>
        </div>
      </div>
    );
  }

  // status === 'ready'
  return (
    <div>
      <SectionHeader sectionKey="planner-overview" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow p-6 sm:p-8">
          <h2 className="font-headline-sm text-headline-sm text-on-surface mb-3 break-words">{event?.title}</h2>
          {event?.description && (
            <p className="text-body-md font-body-md text-on-surface-variant mb-4 break-words">{event.description}</p>
          )}
          <dl className="space-y-2">
            {event?.location && (
              <div className="flex justify-between gap-4">
                <dt className="text-body-sm font-body-sm text-on-surface-variant">Location</dt>
                <dd className="text-body-sm font-body-sm text-on-surface text-right break-words">{event.location}</dd>
              </div>
            )}
            {event?.startDate && (
              <div className="flex justify-between gap-4">
                <dt className="text-body-sm font-body-sm text-on-surface-variant">Start date</dt>
                <dd className="text-body-sm font-body-sm text-on-surface text-right">{formatDate(event.startDate)}</dd>
              </div>
            )}
            {event?.endDate && (
              <div className="flex justify-between gap-4">
                <dt className="text-body-sm font-body-sm text-on-surface-variant">End date</dt>
                <dd className="text-body-sm font-body-sm text-on-surface text-right">{formatDate(event.endDate)}</dd>
              </div>
            )}
            {event?.setupDate && (
              <div className="flex justify-between gap-4">
                <dt className="text-body-sm font-body-sm text-on-surface-variant">Setup date</dt>
                <dd className="text-body-sm font-body-sm text-on-surface text-right">{formatDate(event.setupDate)}</dd>
              </div>
            )}
          </dl>
        </div>

        <div className="bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow p-6 sm:p-8">
          <h2 className="font-headline-sm text-headline-sm text-on-surface mb-3">Session summary</h2>
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-headline-lg font-headline-lg text-on-surface">{sessionSummary?.totalSessions ?? 0}</span>
            <span className="text-body-sm font-body-sm text-on-surface-variant">
              session{sessionSummary?.totalSessions === 1 ? '' : 's'}
            </span>
          </div>
          <p className="text-body-sm font-body-sm text-on-surface-variant">Event phase: {sessionSummary?.eventPhase}</p>
        </div>

        <div className="bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow p-6 sm:p-8 sm:col-span-2">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="font-headline-sm text-headline-sm text-on-surface mb-1">Team & Access</h2>
              <p className="text-body-sm font-body-sm text-on-surface-variant max-w-md">
                Bendie Planner access — who can view or manage each module — is granted per person from the event&apos;s Attendees &amp; Access page.
              </p>
            </div>
            {canAdminister && (
              <Link href={`/portal/events/${eventId}/members`} className="btn-secondary flex-shrink-0">
                Manage Team & Access
              </Link>
            )}
          </div>
          {canAdminister === false && (
            <p className="text-xs text-on-surface-variant/70 mt-2">
              Granting or changing Planner access requires organisation admin authority — ask your organisation owner/admin if you need a change.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
