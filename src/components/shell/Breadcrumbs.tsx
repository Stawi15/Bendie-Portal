'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useOrganization } from '@/contexts/OrganizationContext';
import { getPortalPageLabel } from '@/lib/portalBreadcrumb';
import { EVENT_AREA_LABELS } from '@/lib/eventAreas';
import type { EventWorkspace } from '@/lib/useEventWorkspace';

/** Feature 030 — org › event › area › page (event routes) or org › page (organisation routes). */
type Crumb = { label: string; href?: string };

function Trail({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-on-surface-variant">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={i} className="flex items-center gap-1 min-w-0">
              {c.href && !last ? (
                <Link
                  href={c.href}
                  className="truncate max-w-[16rem] rounded-ui-sm hover:text-on-surface hover:underline"
                >
                  {c.label}
                </Link>
              ) : (
                <span
                  className={`truncate max-w-[16rem] ${last ? 'text-on-surface font-medium' : ''}`}
                  aria-current={last ? 'page' : undefined}
                >
                  {c.label}
                </span>
              )}
              {!last && (
                <span className="material-symbols-outlined text-[14px]" aria-hidden="true">
                  chevron_right
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function OrgBreadcrumbs() {
  const pathname = usePathname();
  const { organization } = useOrganization();
  const crumbs: Crumb[] = [{ label: organization?.name ?? 'Organisation', href: '/portal' }];
  if (pathname !== '/portal') crumbs.push({ label: getPortalPageLabel(pathname) });
  return <Trail crumbs={crumbs} />;
}

export function EventBreadcrumbs({
  ws,
}: {
  ws: Pick<
    EventWorkspace,
    'activeSection' | 'currentEvent' | 'eventId' | 'groupedVisibleSections' | 'sectionHref'
  >;
}) {
  const { organization } = useOrganization();
  const { activeSection, currentEvent, eventId, sectionHref } = ws;
  const event = currentEvent?.id === eventId ? currentEvent : null;
  const crumbs: Crumb[] = [
    { label: organization?.name ?? 'Organisation', href: '/portal/events' },
    { label: event?.name ?? 'Event', href: `/portal/events/${eventId}/dashboard` },
  ];
  if (activeSection) {
    const areaLabel = EVENT_AREA_LABELS[activeSection.area];
    // Utilities and Overview aren't areas you browse; skip an area that shares the page's name.
    if (activeSection.area !== 'utility' && activeSection.area !== 'overview' && areaLabel !== activeSection.label)
      crumbs.push({ label: areaLabel });
    crumbs.push({ label: activeSection.label, href: sectionHref(activeSection) });
  }
  return <Trail crumbs={crumbs} />;
}
