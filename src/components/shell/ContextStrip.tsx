'use client';

import { useOrganization } from '@/contexts/OrganizationContext';
import { useWorkspaceRole } from '@/lib/useWorkspaceRole';
import { visibilityLines } from '@/lib/workspaceContext';
import type { EventWorkspace } from '@/lib/useEventWorkspace';

/*
 * Feature 030 — "where am I" for the event sidebar header (spec US2):
 * organisation › event, the products this event has (text chips, never colour
 * alone), who can see it in the attendee app, and the user's role. Read only.
 * Uses state the workspace already loaded, plus the cached role read.
 */

const PRODUCT_CHIPS = [
  {
    key: 'bendie',
    label: 'Attendee app',
    className: 'bg-product-bendie-bg text-product-bendie-fg',
    dot: 'bg-product-bendie-dot',
  },
  {
    key: 'planner',
    label: 'Planner',
    className: 'bg-product-planner-bg text-product-planner-fg',
    dot: 'bg-product-planner-dot',
  },
] as const;

export function ContextStrip({
  ws,
}: {
  ws: Pick<
    EventWorkspace,
    'currentEvent' | 'eventId' | 'loading' | 'productAvailability' | 'productAvailabilityChecked'
  >;
}) {
  const { organization } = useOrganization();
  const { currentEvent, eventId, loading, productAvailability, productAvailabilityChecked } = ws;
  const event = currentEvent?.id === eventId ? currentEvent : null;
  const role = useWorkspaceRole(organization?.id, eventId);
  const orgName = organization?.name ?? 'Organisation';
  const eventName = loading && !event ? 'Loading…' : (event?.name ?? 'Event');
  const hasPlanner = productAvailability.planner === true;

  return (
    <section aria-label="Event context" className="space-y-2 text-xs">
      <p className="text-on-surface-variant truncate" title={`${orgName} › ${eventName}`}>
        <span className="sr-only">Organisation: </span>
        {orgName} <span aria-hidden="true">›</span>
      </p>
      <p
        className="text-base font-semibold text-on-surface leading-snug line-clamp-2"
        title={eventName}
      >
        <span className="sr-only">Event: </span>
        {eventName}
      </p>
      {productAvailabilityChecked && (
        <ul aria-label="Products on this event" className="flex flex-wrap gap-1.5">
          {PRODUCT_CHIPS.filter((c) => productAvailability[c.key] === true).map((c) => (
            <li
              key={c.key}
              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium ${c.className}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} aria-hidden="true" />
              {c.label}
            </li>
          ))}
        </ul>
      )}
      {event && (
        <div className="text-on-surface-variant space-y-0.5">
          {visibilityLines(event.status, hasPlanner).map((line, i) => (
            <p key={i} className={i > 0 ? 'text-[11px] opacity-90' : undefined}>
              {line}
            </p>
          ))}
        </div>
      )}
      <p className="text-on-surface-variant">
        <span className="font-medium text-on-surface">Your role:</span>{' '}
        {role.loading ? (
          <span className="inline-block h-3 w-20 align-middle rounded bg-surface-container-low animate-pulse" />
        ) : (
          role.label
        )}
      </p>
    </section>
  );
}
