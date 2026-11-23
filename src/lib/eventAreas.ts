/**
 * Feature 030 — the Studio 2.0 event sidebar's areas (IA doc 17). DISPLAY ONLY:
 * never consulted by availability, routing or permissions (those stay in
 * `useEventWorkspace`). Each `EVENT_SECTIONS` entry carries one `area`.
 */
import type { EventSectionMeta } from '@/lib/eventSectionMeta';

export type EventArea =
  'overview' | 'setup' | 'programme' | 'people' | 'logistics' | 'content' | 'utility';

/** Sidebar order of the main areas. `utility` pages live in the sidebar footer. */
export const EVENT_AREA_ORDER: Exclude<EventArea, 'utility'>[] = [
  'overview',
  'setup',
  'programme',
  'people',
  'logistics',
  'content',
];

export const EVENT_AREA_LABELS: Record<EventArea, string> = {
  overview: 'Overview',
  setup: 'Setup',
  programme: 'Programme',
  people: 'People',
  logistics: 'Logistics',
  content: 'Content',
  utility: 'Utilities',
};

export const EVENT_AREA_ICONS: Record<EventArea, string> = {
  overview: 'dashboard',
  setup: 'tune',
  programme: 'calendar_month',
  people: 'groups',
  logistics: 'luggage',
  content: 'article',
  utility: 'more_horiz',
};

export type EventAreaGroup = {
  area: Exclude<EventArea, 'utility'>;
  label: string;
  icon: string;
  sections: EventSectionMeta[];
};

/** Groups already-available sections by area, in sidebar order; empty areas are dropped. */
export function groupSectionsByArea(sections: EventSectionMeta[]): {
  areas: EventAreaGroup[];
  utilities: EventSectionMeta[];
} {
  const areas = EVENT_AREA_ORDER.map((area) => ({
    area,
    label: EVENT_AREA_LABELS[area],
    icon: EVENT_AREA_ICONS[area],
    sections: sections.filter((s) => s.area === area),
  })).filter((g) => g.sections.length > 0);
  return { areas, utilities: sections.filter((s) => s.area === 'utility') };
}
