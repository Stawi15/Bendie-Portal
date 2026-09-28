/**
 * Feature 016 — event setup modules (guided event creation + "Manage modules").
 *
 * A MODULE is an optional EVENT_SECTIONS tab an organiser can choose to work on.
 * This is a display preference only, stored in `events.portal_setup_modules`:
 * it never grants or removes access (product entitlement, event membership,
 * RLS and Planner permissions stay authoritative) and hiding a module never
 * deletes its data.
 *
 * Pure data + pure functions — safe to import from client components and from
 * the /api/events/create route alike.
 */

export type ModuleProduct = 'bendie' | 'planner';

export type ModuleCategory = 'Attendee experience' | 'Information & content' | 'Photos & media' | 'Travel & logistics' | 'Event operations';

export const MODULE_CATEGORIES: ModuleCategory[] = [
  'Attendee experience',
  'Information & content',
  'Photos & media',
  'Travel & logistics',
  'Event operations',
];

export type EventModule = {
  /** EVENT_SECTIONS key — the module IS the existing tab, never a new concept. */
  key: string;
  label: string;
  /** One short, plain-language sentence based on what the section actually manages. */
  description: string;
  product: ModuleProduct;
  category: ModuleCategory;
  /**
   * Always part of the event: shown ticked and locked in the picker, always in
   * navigation. Only used where the product genuinely depends on it —
   * Agenda/Emergency are always in the attendee app's menu, Attendees & Access
   * is how people get into a Bendie event, and Planner logistics/operations
   * all hang off Participants.
   */
  alwaysIncluded?: boolean;
};

export const EVENT_MODULES: EventModule[] = [
  // Attendee experience (Bendie)
  { key: 'members', label: 'Attendees & access', description: 'Who is in the event and how they get access to the app.', product: 'bendie', category: 'Attendee experience', alwaysIncluded: true },
  { key: 'agenda', label: 'Agenda', description: 'Build the event programme and sessions.', product: 'bendie', category: 'Attendee experience', alwaysIncluded: true },
  { key: 'facilitators', label: 'Speakers', description: 'Add the speakers and presenters attendees can browse.', product: 'bendie', category: 'Attendee experience' },
  { key: 'activities', label: 'Activities', description: 'Experiences and activities attendees can take part in.', product: 'bendie', category: 'Attendee experience' },
  { key: 'excursions', label: 'Excursions', description: 'Local recommendations — places to eat, visit or explore.', product: 'bendie', category: 'Attendee experience' },
  { key: 'networking', label: 'Networking', description: 'Interest questions that help attendees find each other.', product: 'bendie', category: 'Attendee experience' },
  { key: 'games', label: 'Games', description: 'Quizzes and trivia for attendees.', product: 'bendie', category: 'Attendee experience' },
  // Information & content (Bendie)
  { key: 'news', label: 'News feed', description: 'Announcements and articles in the app.', product: 'bendie', category: 'Information & content' },
  { key: 'faqs', label: 'FAQs', description: 'Answers to common attendee questions.', product: 'bendie', category: 'Information & content' },
  { key: 'info-center', label: 'Info center', description: 'Support contacts and key event information.', product: 'bendie', category: 'Information & content' },
  { key: 'expo', label: 'Expo directory', description: 'The exhibitors and sponsors at your event.', product: 'bendie', category: 'Information & content' },
  { key: 'emergency', label: 'Emergency', description: 'Emergency contacts and procedures — always in the app menu.', product: 'bendie', category: 'Information & content', alwaysIncluded: true },
  { key: 'notifications', label: 'Notifications', description: 'Send or schedule push notifications to attendees.', product: 'bendie', category: 'Information & content' },
  // Photos & media (Bendie)
  { key: 'gallery', label: 'Gallery', description: 'Moderate photos attendees post.', product: 'bendie', category: 'Photos & media' },
  { key: 'event-photos', label: 'Event photos', description: 'Your own curated photos of the event.', product: 'bendie', category: 'Photos & media' },
  { key: 'files', label: 'Files', description: 'Documents attendees can download.', product: 'bendie', category: 'Photos & media' },
  // Travel & logistics
  { key: 'attendee-travel', label: 'Attendee travel', description: 'Flight and transfer details each attendee sees in the app.', product: 'bendie', category: 'Travel & logistics' },
  { key: 'planner-people', label: 'Participants', description: 'The people you manage travel and logistics for.', product: 'planner', category: 'Travel & logistics', alwaysIncluded: true },
  { key: 'planner-logistics', label: 'Flights, hotels & transport', description: 'Participant flights, accommodation and ground transport.', product: 'planner', category: 'Travel & logistics' },
  // Event operations (Planner)
  { key: 'planner-production', label: 'Production', description: 'Run-of-show: what needs to happen in each session.', product: 'planner', category: 'Event operations' },
  { key: 'planner-tasks', label: 'Tasks', description: 'To-dos assigned to your event team.', product: 'planner', category: 'Event operations' },
  { key: 'planner-checklist', label: 'Checklist', description: 'Items to source and check off before and on site.', product: 'planner', category: 'Event operations' },
  { key: 'planner-vendors', label: 'Vendors', description: 'Suppliers, equipment and what they are providing.', product: 'planner', category: 'Event operations' },
];

const MODULE_BY_KEY = new Map(EVENT_MODULES.map((m) => [m.key, m]));
const OPTIONAL_KEYS = new Set(EVENT_MODULES.filter((m) => !m.alwaysIncluded).map((m) => m.key));

export function modulesForProducts(products: ModuleProduct[]): EventModule[] {
  return EVENT_MODULES.filter((m) => products.includes(m.product));
}

export function optionalModuleKeysForProducts(products: ModuleProduct[]): string[] {
  return modulesForProducts(products).filter((m) => !m.alwaysIncluded).map((m) => m.key);
}

/**
 * Per-product "modules were chosen for this product" marker, stored in the same
 * array (no schema change). Needed because the preference is one flat list: without
 * it, a product added LATER (e.g. Planner linked to a Bendie-only event) would have
 * every optional module hidden. With it:
 *   marker present → follow the saved choices for that product (even "none");
 *   marker absent  → that product was never configured → show all its modules.
 * Lists saved before markers existed fall back to "does it contain any key of that product".
 */
const PRODUCT_MARKERS: Record<ModuleProduct, string> = { bendie: 'configured:bendie', planner: 'configured:planner' };
const MARKER_VALUES = new Set(Object.values(PRODUCT_MARKERS));

/** Adds the "configured" marker for each product whose modules were just chosen. */
export function markProductsConfigured(keys: string[], products: ModuleProduct[]): string[] {
  return Array.from(new Set([...keys, ...products.map((p) => PRODUCT_MARKERS[p])]));
}

/** Keeps only real optional module keys and product markers (drops unknown input and always-included ones). Used on the server too. */
export function sanitizeModuleKeys(keys: unknown): string[] {
  if (!Array.isArray(keys)) return [];
  return Array.from(new Set(keys.filter((k): k is string => typeof k === 'string' && (OPTIONAL_KEYS.has(k) || MARKER_VALUES.has(k)))));
}

/**
 * Should this event section appear in the event's navigation / setup views?
 * Display only — access is decided elsewhere (isSectionAvailable, RLS, routes).
 * - `selected === null` → never configured (every pre-Feature-016 event): show everything, as before.
 * - Sections that aren't optional modules (Dashboard, Basics, Theme, Activity Log, …) are always shown.
 * - Per product: a product with no marker and no chosen keys counts as "not configured" → shown.
 */
export function isSectionShownByModules(sectionKey: string, selected: string[] | null | undefined): boolean {
  if (selected == null) return true;
  if (!OPTIONAL_KEYS.has(sectionKey)) return true;
  const product = MODULE_BY_KEY.get(sectionKey)!.product;
  const productConfigured =
    selected.includes(PRODUCT_MARKERS[product]) || selected.some((k) => MODULE_BY_KEY.get(k)?.product === product && OPTIONAL_KEYS.has(k));
  // A product whose modules were never chosen (e.g. added after creation) shows everything.
  if (!productConfigured) return true;
  return selected.includes(sectionKey);
}

export function getModule(key: string): EventModule | undefined {
  return MODULE_BY_KEY.get(key);
}
