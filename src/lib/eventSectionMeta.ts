export type EventSectionMeta = {
  key: string;
  label: string;
  desc: string;
  icon: string;
  badgeBg: string;
  badgeFg: string;
  /**
   * Which product this tab belongs to (Feature 003). 'shared' tabs are not
   * gated by product entitlement/usage at all. Feature 005 added the first
   * 'planner'-classified tab (`planner-overview`); future Planner modules
   * will add more under the same classification.
   */
  product: 'bendie' | 'planner' | 'shared';
  /**
   * Portal UX pass (016) — a display-only grouping label for the event
   * workspace's tab bar (grouped nav instead of one flat 20+-tab strip).
   * Purely cosmetic: never consulted by any authorization/availability
   * check, never changes a route, never affects `isSectionAvailable`.
   */
  group: string;
};

/**
 * Single source of truth for every event tab: label, description, and the
 * icon-badge styling used consistently across the tab bar, the Dashboard's
 * section cards, and each page's own header.
 */
export const EVENT_SECTIONS: EventSectionMeta[] = [
  { key: 'dashboard', label: 'Dashboard', desc: 'Event status overview and setup progress', icon: 'dashboard', badgeBg: 'bg-gray-100', badgeFg: 'text-gray-600', product: 'bendie', group: 'Overview' },
  { key: 'basics', label: 'Basics', desc: 'Name, dates, location, status', icon: 'checklist', badgeBg: 'bg-orange-100', badgeFg: 'text-orange-600', product: 'bendie', group: 'Event Setup' },
  { key: 'hero', label: 'Hero & Branding', desc: 'Hero image, title, banner', icon: 'image', badgeBg: 'bg-green-100', badgeFg: 'text-green-600', product: 'bendie', group: 'Event Setup' },
  { key: 'theme', label: 'Theme Colors', desc: 'Primary, secondary, tertiary colors', icon: 'palette', badgeBg: 'bg-pink-100', badgeFg: 'text-pink-600', product: 'bendie', group: 'Event Setup' },
  { key: 'terminology', label: 'Terminology', desc: 'Labels, icons, feature toggles', icon: 'sell', badgeBg: 'bg-amber-100', badgeFg: 'text-amber-600', product: 'bendie', group: 'Event Setup' },
  { key: 'facilitators', label: 'Facilitators', desc: 'Speakers and facilitator profiles', icon: 'mic', badgeBg: 'bg-purple-100', badgeFg: 'text-purple-600', product: 'bendie', group: 'Programme' },
  { key: 'agenda', label: 'Agenda', desc: 'Session schedule and timetable', icon: 'calendar_month', badgeBg: 'bg-blue-100', badgeFg: 'text-blue-600', product: 'bendie', group: 'Programme' },
  { key: 'activities', label: 'Activities', desc: 'Activities and experiences', icon: 'bolt', badgeBg: 'bg-teal-100', badgeFg: 'text-teal-600', product: 'bendie', group: 'Programme' },
  { key: 'excursions', label: 'Excursions', desc: 'Local recommendations by category', icon: 'landscape', badgeBg: 'bg-emerald-100', badgeFg: 'text-emerald-700', product: 'bendie', group: 'Programme' },
  { key: 'members', label: 'Attendees & Access', desc: 'People who are part of this Bendie event and their event access', icon: 'groups', badgeBg: 'bg-sky-100', badgeFg: 'text-sky-600', product: 'bendie', group: 'Attendees' },
  { key: 'attendee-travel', label: 'Attendee Travel', desc: 'Flight and transfer details per attendee', icon: 'flight', badgeBg: 'bg-zinc-100', badgeFg: 'text-zinc-700', product: 'bendie', group: 'Attendees' },
  { key: 'networking', label: 'Networking', desc: 'Networking preferences & options', icon: 'link', badgeBg: 'bg-indigo-100', badgeFg: 'text-indigo-600', product: 'bendie', group: 'Attendees' },
  { key: 'news', label: 'News Feed', desc: 'Announcements and articles', icon: 'newspaper', badgeBg: 'bg-stone-100', badgeFg: 'text-stone-700', product: 'bendie', group: 'Content' },
  { key: 'faqs', label: 'FAQs', desc: 'Frequently asked questions', icon: 'help', badgeBg: 'bg-rose-100', badgeFg: 'text-rose-600', product: 'bendie', group: 'Content' },
  { key: 'info-center', label: 'Info Center', desc: 'Support contacts and info', icon: 'info', badgeBg: 'bg-cyan-100', badgeFg: 'text-cyan-600', product: 'bendie', group: 'Content' },
  { key: 'expo', label: 'Expo Directory', desc: 'Exhibitors and sponsors', icon: 'storefront', badgeBg: 'bg-yellow-100', badgeFg: 'text-yellow-700', product: 'bendie', group: 'Content' },
  { key: 'gallery', label: 'Gallery', desc: 'Attendee photo gallery', icon: 'photo_library', badgeBg: 'bg-violet-100', badgeFg: 'text-violet-600', product: 'bendie', group: 'Media' },
  { key: 'event-photos', label: 'Event Photos', desc: 'Organizer-curated event photos', icon: 'add_photo_alternate', badgeBg: 'bg-lime-100', badgeFg: 'text-lime-700', product: 'bendie', group: 'Media' },
  { key: 'files', label: 'Files', desc: 'Documents for attendees to download', icon: 'attach_file', badgeBg: 'bg-neutral-100', badgeFg: 'text-neutral-700', product: 'bendie', group: 'Media' },
  { key: 'emergency', label: 'Emergency', desc: 'Emergency contacts and procedures', icon: 'emergency', badgeBg: 'bg-red-100', badgeFg: 'text-red-600', product: 'bendie', group: 'Operations' },
  { key: 'games', label: 'Games', desc: 'Quiz games and trivia', icon: 'sports_esports', badgeBg: 'bg-fuchsia-100', badgeFg: 'text-fuchsia-600', product: 'bendie', group: 'Operations' },
  { key: 'notifications', label: 'Notifications', desc: 'Send or schedule push notifications', icon: 'notifications', badgeBg: 'bg-red-50', badgeFg: 'text-red-500', product: 'bendie', group: 'Operations' },
  { key: 'activity-log', label: 'Activity Log', desc: 'Audit trail of all changes', icon: 'history', badgeBg: 'bg-slate-100', badgeFg: 'text-slate-600', product: 'bendie', group: 'Operations' },
  { key: 'bendie-planner', label: 'Bendie Planner', desc: 'Link this event to Bendie Planner and sync members, agenda & travel', icon: 'sync_alt', badgeBg: 'bg-orange-100', badgeFg: 'text-orange-600', product: 'shared', group: 'Operations' },
  { key: 'planner-overview', label: 'Planner Overview', desc: 'Event identity and live session status from Bendie Planner', icon: 'insights', badgeBg: 'bg-orange-50', badgeFg: 'text-orange-600', product: 'planner', group: 'Overview' },
  { key: 'planner-people', label: 'Participants', desc: 'People tracked for travel and logistics. Participants do not automatically receive Planner access.', icon: 'groups', badgeBg: 'bg-orange-50', badgeFg: 'text-orange-600', product: 'planner', group: 'Participants' },
  { key: 'planner-tasks', label: 'Tasks', desc: 'Operational tasks synced from Bendie Planner', icon: 'task_alt', badgeBg: 'bg-orange-50', badgeFg: 'text-orange-600', product: 'planner', group: 'Planning' },
  { key: 'planner-vendors', label: 'Vendors', desc: 'Vendor items and equipment tracked in Bendie Planner', icon: 'local_shipping', badgeBg: 'bg-orange-50', badgeFg: 'text-orange-600', product: 'planner', group: 'Planning' },
  { key: 'planner-checklist', label: 'Checklist', desc: 'Sourcing and on-site checklist tracked in Bendie Planner', icon: 'checklist', badgeBg: 'bg-orange-50', badgeFg: 'text-orange-600', product: 'planner', group: 'Planning' },
  { key: 'planner-logistics', label: 'Logistics', desc: 'Flights and hotel bookings tracked in Bendie Planner', icon: 'luggage', badgeBg: 'bg-orange-50', badgeFg: 'text-orange-600', product: 'planner', group: 'Logistics' },
  { key: 'planner-production', label: 'Production', desc: 'Run-of-show production schedule tracked in Bendie Planner', icon: 'theaters', badgeBg: 'bg-orange-50', badgeFg: 'text-orange-600', product: 'planner', group: 'Production' },
];

export function getSectionMeta(key: string): EventSectionMeta | undefined {
  return EVENT_SECTIONS.find((s) => s.key === key);
}
