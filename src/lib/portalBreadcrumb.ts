const STATIC_LABELS: Record<string, string> = {
  '/portal': 'Overview',
  '/portal/events': 'Events',
  '/portal/people': 'People',
  '/portal/assets': 'Assets',
  '/portal/teams': 'Teams',
  '/portal/settings': 'Settings',
};

/**
 * Resolves a page label for the top-header breadcrumb from the current pathname.
 * Falls back to a title-cased version of the last path segment for routes
 * (like a specific event) that don't have a static label.
 */
export function getPortalPageLabel(pathname: string): string {
  if (STATIC_LABELS[pathname]) return STATIC_LABELS[pathname];

  const segments = pathname.split('/').filter(Boolean);
  if (segments[0] === 'portal' && segments[1] === 'events' && segments[2]) {
    return 'Event';
  }

  const last = segments[segments.length - 1] ?? 'Overview';
  return last
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
