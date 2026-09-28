import type { ProductKey } from '@/lib/productNavigation';

/**
 * Feature 016 (product environment identity, refined in the visual-polish pass)
 * — the ONE place Portal product-context styling lives. This is the Portal's own
 * Bendie vs Bendie Planner environment, not the attendee-app Theme Designer.
 *
 * Colours by ROLE, not "blue/orange everywhere":
 * - Bendie = the Portal `primary` token (#00629D).
 * - Planner = the Tailwind orange scale the Portal already used for Planner
 *   (500 for accents, 700 for text ≈ 5.2:1 on white). No separate Planner
 *   brand token exists in the design system.
 * Both products use the SAME recipe (same alpha steps, same thickness), so the
 * warm environment never reads louder than the cool one.
 *
 * Product colour appears in exactly three cue families: (1) the selected
 * product segment, (2) the header environment (thin strip + faint tint +
 * border), (3) the active navigation accent (event area / current step). Every
 * other control — search, organisation selector, utilities, New Event, action
 * buttons — uses the NEUTRAL tokens below and only takes the accent on focus.
 * Class strings are complete literals so Tailwind's scanner keeps them.
 */
export type ProductPresentation = {
  // (2) header environment
  /** Thin strip along the top of the global header. */
  bar: string;
  /** Header background — a barely-there tint. */
  headerTint: string;
  /** Header bottom border. */
  headerBorder: string;
  // (1) selected product segment
  /** Selected segment: elevated white + accent text + accent ring (geometry identical for both products). */
  switcherSelected: string;
  /** Dot on the selected segment — a shape cue, not colour alone. */
  dot: string;
  // (3) navigation accent
  /** Accent text (small labels, mobile selection). */
  accentText: string;
  /** Active event-area link. */
  areaActive: string;
  /** Current-area heading above the steps. */
  areaHeading: string;
  /** Current step number in the area stepper. */
  stepCurrent: string;
  /** Soft surface behind the current step. */
  stepCurrentSurface: string;
  /** Previous-step outline. */
  stepPrevious: string;
  // focus (neutral controls take the product accent only while focused)
  focusRing: string;
};

export const PRODUCT_PRESENTATION: Record<ProductKey, ProductPresentation> = {
  bendie: {
    bar: 'bg-primary/60',
    headerTint: 'bg-primary/[0.035]',
    headerBorder: 'border-primary/20',
    switcherSelected: 'bg-white text-primary ring-1 ring-primary/35 shadow-sm',
    dot: 'bg-primary',
    accentText: 'text-primary',
    areaActive: 'border-primary text-primary',
    areaHeading: 'text-primary',
    stepCurrent: 'bg-primary text-white',
    stepCurrentSurface: 'bg-primary/10',
    stepPrevious: 'border-primary/50 text-primary',
    focusRing: 'focus:ring-2 focus:ring-primary/25 focus:border-primary/50',
  },
  planner: {
    bar: 'bg-orange-500/60',
    headerTint: 'bg-orange-500/[0.035]',
    headerBorder: 'border-orange-500/20',
    switcherSelected: 'bg-white text-orange-700 ring-1 ring-orange-500/35 shadow-sm',
    dot: 'bg-orange-500',
    accentText: 'text-orange-700',
    areaActive: 'border-orange-500 text-orange-700',
    areaHeading: 'text-orange-700',
    stepCurrent: 'bg-orange-700 text-white',
    stepCurrentSurface: 'bg-orange-500/10',
    stepPrevious: 'border-orange-500/50 text-orange-700',
    focusRing: 'focus:ring-2 focus:ring-orange-500/25 focus:border-orange-500/50',
  },
};

/**
 * Product-NEUTRAL surfaces, identical in both environments. Idle appearance
 * never changes with the product; only focus takes the product accent.
 */
export const NEUTRAL_PRESENTATION = {
  /** Header controls: organisation selector, search field, switcher track. */
  controlSurface: 'bg-white/90 border border-outline-variant/80',
  /** Unselected switcher segment — clearly clickable, never "disabled". */
  switcherUnselected: 'text-on-surface-variant hover:text-on-surface hover:bg-white/70',
  /** Default focus when no product context applies (organisation-global pages). */
  focusRing: 'focus:ring-2 focus:ring-primary/20 focus:border-primary/40',
} as const;
