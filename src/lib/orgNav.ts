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
