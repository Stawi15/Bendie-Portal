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
};

/**
 * Single source of truth for every event tab: label, description, and the
 * icon-badge styling used consistently across the tab bar, the Dashboard's
 * section cards, and each page's own header.
 */
export const EVENT_SECTIONS: EventSectionMeta[] = [
  { key: 'dashboard', label: 'Dashboard', desc: 'Event status overview and setup progress', icon: 'dashboard', badgeBg: 'bg-gray-100', badgeFg: 'text-gray-600', product: 'bendie' },
  { key: 'basics', label: 'Basics', desc: 'Name, dates, location, status', icon: 'checklist', badgeBg: 'bg-orange-100', badgeFg: 'text-orange-600', product: 'bendie' },
  { key: 'hero', label: 'Hero & Branding', desc: 'Hero image, title, banner', icon: 'image', badgeBg: 'bg-green-100', badgeFg: 'text-green-600', product: 'bendie' },
  { key: 'theme', label: 'Theme Colors', desc: 'Primary, secondary, tertiary colors', icon: 'palette', badgeBg: 'bg-pink-100', badgeFg: 'text-pink-600', product: 'bendie' },
  { key: 'terminology', label: 'Terminology', desc: 'Labels, icons, feature toggles', icon: 'sell', badgeBg: 'bg-amber-100', badgeFg: 'text-amber-600', product: 'bendie' },
  { key: 'facilitators', label: 'Facilitators', desc: 'Speakers and facilitator profiles', icon: 'mic', badgeBg: 'bg-purple-100', badgeFg: 'text-purple-600', product: 'bendie' },
  { key: 'agenda', label: 'Agenda', desc: 'Session schedule and timetable', icon: 'calendar_month', badgeBg: 'bg-blue-100', badgeFg: 'text-blue-600', product: 'bendie' },
  { key: 'attendee-travel', label: 'Attendee Travel', desc: 'Flight and transfer details per attendee', icon: 'flight', badgeBg: 'bg-zinc-100', badgeFg: 'text-zinc-700', product: 'bendie' },
  { key: 'activities', label: 'Activities', desc: 'Activities and experiences', icon: 'bolt', badgeBg: 'bg-teal-100', badgeFg: 'text-teal-600', product: 'bendie' },
  { key: 'excursions', label: 'Excursions', desc: 'Local recommendations by category', icon: 'landscape', badgeBg: 'bg-emerald-100', badgeFg: 'text-emerald-700', product: 'bendie' },
  { key: 'expo', label: 'Expo Directory', desc: 'Exhibitors and sponsors', icon: 'storefront', badgeBg: 'bg-yellow-100', badgeFg: 'text-yellow-700', product: 'bendie' },
  { key: 'news', label: 'News Feed', desc: 'Announcements and articles', icon: 'newspaper', badgeBg: 'bg-stone-100', badgeFg: 'text-stone-700', product: 'bendie' },
  { key: 'networking', label: 'Networking', desc: 'Networking preferences & options', icon: 'link', badgeBg: 'bg-indigo-100', badgeFg: 'text-indigo-600', product: 'bendie' },
  { key: 'faqs', label: 'FAQs', desc: 'Frequently asked questions', icon: 'help', badgeBg: 'bg-rose-100', badgeFg: 'text-rose-600', product: 'bendie' },
  { key: 'info-center', label: 'Info Center', desc: 'Support contacts and info', icon: 'info', badgeBg: 'bg-cyan-100', badgeFg: 'text-cyan-600', product: 'bendie' },
  { key: 'emergency', label: 'Emergency', desc: 'Emergency contacts and procedures', icon: 'emergency', badgeBg: 'bg-red-100', badgeFg: 'text-red-600', product: 'bendie' },
  { key: 'gallery', label: 'Gallery', desc: 'Attendee photo gallery', icon: 'photo_library', badgeBg: 'bg-violet-100', badgeFg: 'text-violet-600', product: 'bendie' },
  { key: 'event-photos', label: 'Event Photos', desc: 'Organizer-curated event photos', icon: 'add_photo_alternate', badgeBg: 'bg-lime-100', badgeFg: 'text-lime-700', product: 'bendie' },
  { key: 'files', label: 'Files', desc: 'Documents for attendees to download', icon: 'attach_file', badgeBg: 'bg-neutral-100', badgeFg: 'text-neutral-700', product: 'bendie' },
  { key: 'games', label: 'Games', desc: 'Quiz games and trivia', icon: 'sports_esports', badgeBg: 'bg-fuchsia-100', badgeFg: 'text-fuchsia-600', product: 'bendie' },
  { key: 'members', label: 'Members', desc: 'Event members and access codes', icon: 'groups', badgeBg: 'bg-sky-100', badgeFg: 'text-sky-600', product: 'bendie' },
  { key: 'bendie-planner', label: 'Bendie Planner', desc: 'Link this event to Bendie Planner and sync members, agenda & travel', icon: 'sync_alt', badgeBg: 'bg-orange-100', badgeFg: 'text-orange-600', product: 'shared' },
  { key: 'planner-overview', label: 'Planner Overview', desc: 'Event identity and live session status from Bendie Planner', icon: 'insights', badgeBg: 'bg-orange-50', badgeFg: 'text-orange-600', product: 'planner' },
  { key: 'notifications', label: 'Notifications', desc: 'Send or schedule push notifications', icon: 'notifications', badgeBg: 'bg-red-50', badgeFg: 'text-red-500', product: 'bendie' },
  { key: 'activity-log', label: 'Activity Log', desc: 'Audit trail of all changes', icon: 'history', badgeBg: 'bg-slate-100', badgeFg: 'text-slate-600', product: 'bendie' },
];

export function getSectionMeta(key: string): EventSectionMeta | undefined {
  return EVENT_SECTIONS.find((s) => s.key === key);
}
