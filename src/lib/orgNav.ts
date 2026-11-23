/**
 * Organisation navigation shared by the current sidebar (OrgSideNav, v1) and
 * the Studio 2.0 OrgSidebar (Feature 030). Moved verbatim from OrgSideNav.
 */

export const HELP_HREF = 'mailto:devteam@stawiexperiences.com';

// Feature 006: /portal and /portal/events now redirect to the resolved
// product's home/events route, so "Overview"/"Events" must still highlight
// when a /portal/bendie* or /portal/planner* route is active.
//
// Navigation pass (016 continuation 3) — confirmed bug fix: "Events" never
// highlighted while actually inside an event workspace
// (/portal/events/{id}/...), because the old check only matched the three
// exact discovery-list routes and never fell through to a prefix check.
// Fixed by explicitly matching the event-workspace prefix here. Every
// other item now uses an EXACT match rather than `startsWith` — none of
// People/Assets/Teams/Activity Log/Settings has any nested child route
// today, so a broad prefix match could only ever produce a false positive,
// never a legitimate parent/child relationship worth preserving.
export function isOrgNavActive(pathname: string, href: string): boolean {
  if (href === '/portal') {
    return (
      pathname === '/portal' || pathname === '/portal/bendie' || pathname === '/portal/planner'
    );
  }
  if (href === '/portal/events') {
    return (
      pathname === '/portal/events' ||
      pathname === '/portal/bendie/events' ||
      pathname === '/portal/planner/events' ||
      pathname.startsWith('/portal/events/')
    );
  }
  return pathname === href;
}

export type OrgCrumb = { label: string; href?: string };

/**
 * Feature 030 — the Studio 2.0 organisation breadcrumb (after the organisation
 * crumb), worded like the v2 sidebar (Home, Events, People › Teams, Library,
 * Activity). Never shows a raw id: id segments get a generic label.
 * Returns [] on Home (the organisation crumb alone is enough).
 */
export function orgBreadcrumbTrail(pathname: string): OrgCrumb[] {
  const path = pathname.replace(/\/+$/, '') || '/portal';
  if (path === '/portal' || path === '/portal/bendie' || path === '/portal/planner') return [];
  if (
    path === '/portal/events' ||
    path === '/portal/bendie/events' ||
    path === '/portal/planner/events'
  )
    return [{ label: 'Events' }];
  const fixed: Record<string, OrgCrumb[]> = {
    '/portal/people': [{ label: 'People' }],
    '/portal/teams': [{ label: 'People', href: '/portal/people' }, { label: 'Teams' }],
    '/portal/assets': [{ label: 'Library' }],
    '/portal/activity-log': [{ label: 'Activity' }],
    '/portal/settings': [{ label: 'Settings' }],
    '/portal/no-access': [{ label: 'No organisation' }],
    '/portal/no-product': [{ label: 'No product' }],
    '/portal/admin/organisations': [{ label: 'Organisations' }],
    '/portal/admin/moderation': [{ label: 'Moderation' }],
  };
  if (fixed[path]) return fixed[path];
  if (/^\/portal\/admin\/organisations\/[^/]+$/.test(path)) {
    return [
      { label: 'Organisations', href: '/portal/admin/organisations' },
      { label: 'Organisation details' },
    ];
  }
  // Unknown route: title-case the last segment that isn't an id.
  const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^\d+$/i;
  const last = path
    .split('/')
    .filter((s) => s && s !== 'portal' && !ID.test(s))
    .pop();
  if (!last) return [];
  return [
    {
      label: last
        .split('-')
        .map((w, i) => (i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
        .join(' '),
    },
  ];
}
