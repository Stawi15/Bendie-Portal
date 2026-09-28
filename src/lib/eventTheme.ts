/**
 * Event theme helpers for the Theme Designer (Feature 016, Visual Event Theme
 * Designer pass).
 *
 * Every mapping and fallback below was traced from the Bendie attendee app
 * source (Evently-App, `origin/main` @ 2fe8f1f, 2026-09-18), not assumed:
 * - `assets/styles/global/color.ts` — `applyEventThemeOverrides` and the
 *   `lightblue` default theme used whenever an event's theme column is null
 * - `context/themeColors.ts` — `getReadableTextColor` / `onPrimary`
 * - `assets/styles/screens/IndexStyles.ts` (Home), `AgendaStyles.ts`,
 *   `InfoStyles.ts`, `domains/shared/presentation/components/Navbar.tsx`
 * If the attendee app changes how it consumes these colours, update this file
 * and the preview together.
 */

export type ThemeFieldKey = 'theme_primary' | 'theme_secondary' | 'theme_tertiary';

export type EventTheme = Record<ThemeFieldKey, string>;

export const THEME_FIELD_KEYS: ThemeFieldKey[] = ['theme_primary', 'theme_secondary', 'theme_tertiary'];

export type ThemeFieldMeta = {
  key: ThemeFieldKey;
  /** Plain-language name shown to organisers. */
  name: string;
  /** The stored field's technical name, shown secondarily. */
  technicalName: string;
  /** One short sentence, strictly limited to what the attendee app actually colours with it. */
  description: string;
};

export const THEME_FIELDS: Record<ThemeFieldKey, ThemeFieldMeta> = {
  theme_primary: {
    key: 'theme_primary',
    name: 'Brand colour',
    technicalName: 'Primary',
    description: 'The menu button, selected dates and tabs, notification badges and the active item in the bottom menu.',
  },
  theme_secondary: {
    key: 'theme_secondary',
    name: 'Card & contrast colour',
    technicalName: 'Secondary',
    description: 'Cards and pills, the event title on the hero photo, and icons shown on the brand colour. Usually white.',
  },
  theme_tertiary: {
    key: 'theme_tertiary',
    name: 'Heading colour',
    technicalName: 'Tertiary',
    description: 'Activity titles on the home screen and section headings in the Info Center.',
  },
};

/** What the attendee app shows when a theme column is null (its `lightblue` theme). */
export const BENDIE_APP_DEFAULT_THEME: EventTheme = {
  theme_primary: '#00ADE4',
  theme_secondary: '#FFFFFF',
  theme_tertiary: '#002345',
};

/**
 * Fixed (non-configurable) attendee-app colours the preview needs in order to
 * render the themed elements in their real context. Mirrors `buildTheme` in
 * the app's `color.ts` — these are not Portal UI colours.
 */
export const BENDIE_APP_FIXED_COLOURS = {
  pageBackground: '#F8FBFC', // primaryBackground
  cardBackground: '#FFFFFF', // secondaryBackground (agenda cards)
  text: '#000000', // primaryText
  mutedText: 'rgba(0,0,0,0.40)', // accent2
  subtleText: '#6B7280', // accent3
  border: '#E2E8F0', // border1
  navText: '#111111',
} as const;

/** The two complete themes the attendee app itself ships (`THEMES` in color.ts). */
export const BENDIE_THEME_PRESETS: { label: string; theme: EventTheme }[] = [
  { label: 'Bendie Blue (default)', theme: BENDIE_APP_DEFAULT_THEME },
  { label: 'Bendie Green', theme: { theme_primary: '#269D0E', theme_secondary: '#FFFFFF', theme_tertiary: '#187705' } },
];

/**
 * Single-colour shortcuts: the attendee app's own theme colours plus neutral Portal tokens.
 * Brown (#8C4F06, the Portal's own `secondary` UI token) was removed after user testing — it isn't a
 * Bendie brand/attendee colour and read as an odd default. Any colour, brown included, is still
 * available through the custom picker/HEX field.
 */
export const QUICK_COLOURS: { label: string; value: string }[] = [
  { label: 'Bendie Blue', value: '#00ADE4' },
  { label: 'Bendie Navy', value: '#002345' },
  { label: 'Bendie Green', value: '#269D0E' },
  { label: 'Bendie Dark Green', value: '#187705' },
  { label: 'Portal Blue', value: '#00629D' },
  { label: 'Slate', value: '#555E74' },
  { label: 'Near Black', value: '#111C2D' },
  { label: 'White', value: '#FFFFFF' },
];

/**
 * Accepts "1E3A8A", "#1e3a8a", "#1E3A8A", or 3-digit shorthand ("#0AF") — the
 * same shapes the attendee app's own `normalizeHex` accepts. Returns "#RRGGBB"
 * uppercase, or null when the value isn't a colour.
 */
export function normalizeHex(raw: string): string | null {
  let v = raw.trim().replace(/^#/, '');
  if (/^[0-9A-Fa-f]{3}$/.test(v)) v = v.split('').map((c) => c + c).join('');
  if (!/^[0-9A-Fa-f]{6}$/.test(v)) return null;
  return `#${v.toUpperCase()}`;
}

function hexToRgb(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** WCAG relative luminance → contrast ratio (standard formula). */
function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  return (Math.max(lA, lB) + 0.05) / (Math.min(lA, lB) + 0.05);
}

/**
 * Mirrors the attendee app's `onPrimary` exactly (`getReadableTextColor(primary,
 * secondary, '#000000')`): black on a light brand colour, otherwise the
 * Secondary colour. The app only applies this in a few places (e.g. the
 * selected Agenda date); most text/icons on the brand colour use Secondary
 * directly, and the preview reproduces that difference faithfully.
 */
export function onPrimaryColour(primary: string, secondary: string): string {
  const [r, g, b] = hexToRgb(primary);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#000000' : secondary;
}

export type ThemeReadabilityWarning = { field: ThemeFieldKey; message: string };

/**
 * Plain-language readability warnings for the pairings the attendee app really
 * renders. Informational only — never blocks saving.
 */
export function getReadabilityWarnings(theme: EventTheme): ThemeReadabilityWarning[] {
  const warnings: ThemeReadabilityWarning[] = [];
  if (contrastRatio(theme.theme_secondary, theme.theme_primary) < 3) {
    warnings.push({
      field: 'theme_primary',
      message: 'The menu icon and badge numbers may be hard to see on this brand colour.',
    });
  }
  if (contrastRatio(BENDIE_APP_FIXED_COLOURS.text, theme.theme_secondary) < 4.5) {
    warnings.push({
      field: 'theme_secondary',
      message: 'Names and text on cards may be hard to read on this colour.',
    });
  }
  if (contrastRatio(theme.theme_tertiary, BENDIE_APP_FIXED_COLOURS.pageBackground) < 3) {
    warnings.push({
      field: 'theme_tertiary',
      message: 'Activity titles may be hard to read on the light page background.',
    });
  }
  return warnings;
}

/** Saved value if valid, otherwise what the attendee app would actually show (its default). */
export function effectiveTheme(saved: Partial<Record<ThemeFieldKey, string | null>>): EventTheme {
  return {
    theme_primary: normalizeHex(saved.theme_primary ?? '') ?? BENDIE_APP_DEFAULT_THEME.theme_primary,
    theme_secondary: normalizeHex(saved.theme_secondary ?? '') ?? BENDIE_APP_DEFAULT_THEME.theme_secondary,
    theme_tertiary: normalizeHex(saved.theme_tertiary ?? '') ?? BENDIE_APP_DEFAULT_THEME.theme_tertiary,
  };
}
