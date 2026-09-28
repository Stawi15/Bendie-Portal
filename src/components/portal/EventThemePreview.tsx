'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import {
  BENDIE_APP_FIXED_COLOURS as APP,
  THEME_FIELDS,
  onPrimaryColour,
  withAlpha,
  type EventTheme,
  type ThemeFieldKey,
} from '@/lib/eventTheme';

export type PreviewScreen = 'home' | 'agenda';

type EventThemePreviewProps = {
  theme: EventTheme;
  eventName: string;
  screen?: PreviewScreen;
  /** Field whose elements are outlined in the preview. */
  activeField?: ThemeFieldKey | null;
  /** When provided, themed elements become buttons that select their field. */
  onSelectField?: (field: ThemeFieldKey) => void;
};

type TargetProps = {
  field: ThemeFieldKey;
  activeField?: ThemeFieldKey | null;
  onSelectField?: (field: ThemeFieldKey) => void;
  onHover?: (field: ThemeFieldKey | null) => void;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  /** false = highlighted when its field is active, but not clickable (e.g. a wrapper around another target). */
  clickable?: boolean;
};

/**
 * Theme-mapping indicator. A dashed amber outline is deliberately unlike any
 * real attendee-app border, so it reads as a Portal annotation ("this uses the
 * selected colour"), never as part of the component — the old solid dark ring
 * + white offset looked like a permanent double border on small pills.
 */
const HIGHLIGHT = 'outline-dashed outline-2 outline-offset-2 outline-amber-500';

/**
 * ONE phone frame for every preview screen (Home, Agenda, summary page). Laid
 * out at this fixed design size and scaled as a whole via `--phone-scale`
 * (globals.css `.phone-preview-scaler`), so switching screens or breakpoints
 * never changes the shell or its internal proportions. 256×540 ≈ 9:19.
 */
const PHONE = {
  width: 256,
  height: 540,
  radius: 36,
  border: 7,
  statusBarHeight: 26,
  navHeight: 48,
} as const;

/**
 * One icon hierarchy for the whole preview (the phone is ~0.7× a real 390pt
 * screen, so the app's 20–22pt icons land at ~14–16px). Smallest → largest:
 * status (SVG, 10px tall) < badge (13px) < header actions < bottom menu <
 * menu glyph (inside its 32px circle). Never left to intrinsic glyph sizes.
 */
const ICON = {
  action: 'text-[14px]', // app: 20pt header action icons
  nav: 'text-[15px]', // bottom menu
  menu: 'text-[16px]', // app: 22pt menu glyph in a 45pt circle
  content: 'text-[16px]', // avatars / content placeholders
} as const;

/** Material Symbols filled variant — the app's Ionicons header/nav glyphs are filled. */
const FILLED = { fontVariationSettings: "'FILL' 1" } as const;

/**
 * One themed element in the preview. Marked with the dashed indicator when its
 * field is the active one; optionally a button that selects that field
 * ("click what you want to change").
 */
function Target({
  field,
  activeField,
  onSelectField,
  onHover,
  className = '',
  style,
  children,
  clickable = true,
}: TargetProps) {
  const highlighted = activeField === field;
  const classes = `${className} ${highlighted ? HIGHLIGHT : ''}`;
  if (!onSelectField || !clickable) {
    // <span>, not <div>: non-clickable targets can sit inside a clickable one (e.g. the badge in the header pill).
    return (
      <span className={classes} style={style}>
        {children}
      </span>
    );
  }
  const meta = THEME_FIELDS[field];
  return (
    <button
      type="button"
      className={`${classes} cursor-pointer transition hover:brightness-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
      style={style}
      onClick={() => onSelectField(field)}
      onMouseEnter={() => onHover?.(field)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(field)}
      onBlur={() => onHover?.(null)}
      aria-label={`${meta.name} (${meta.technicalName}) — edit this colour`}
    >
      {children}
    </button>
  );
}

/**
 * Status bar with small inline-SVG glyphs of matching weight (Material Symbols'
 * signal/wifi/battery glyphs fill their whole box and read heavier than the
 * time at any size). Secondary detail: time 10px, icons 10px tall.
 */
function StatusBar() {
  return (
    <div
      className="flex items-center justify-between px-5 flex-shrink-0"
      style={{ height: PHONE.statusBarHeight, color: APP.text }}
      aria-hidden="true"
    >
      <span className="text-[10px] font-semibold tracking-tight leading-none">9:41</span>
      <span className="flex items-center gap-1">
        <svg width="14" height="10" viewBox="0 0 15 10" fill="currentColor">
          <rect x="0" y="7" width="2.5" height="3" rx="0.6" />
          <rect x="4" y="5" width="2.5" height="5" rx="0.6" />
          <rect x="8" y="2.5" width="2.5" height="7.5" rx="0.6" />
          <rect x="12" y="0" width="2.5" height="10" rx="0.6" />
        </svg>
        <svg
          width="13"
          height="10"
          viewBox="0 0 13 10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        >
          <path d="M1 3.6a8 8 0 0 1 11 0" />
          <path d="M3.1 6a5 5 0 0 1 6.8 0" />
          <circle cx="6.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
        </svg>
        <svg width="20" height="10" viewBox="0 0 20 10" fill="currentColor">
          <rect
            x="0.5"
            y="0.5"
            width="17"
            height="9"
            rx="2.5"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.45"
          />
          <rect x="2" y="2" width="11" height="6" rx="1.3" />
          <rect x="18.6" y="3.3" width="1.4" height="3.4" rx="0.7" fillOpacity="0.45" />
        </svg>
      </span>
    </div>
  );
}

/**
 * Lightweight, local-only picture of the Bendie attendee app, driven purely by
 * theme props — no data fetching. Layout and colour assignments mirror the
 * attendee app's Home (`IndexStyles.ts`), Agenda (`AgendaStyles.ts`) and bottom
 * menu (`Navbar.tsx`); see `src/lib/eventTheme.ts` for the traced mapping.
 * Content is synthetic apart from the event name.
 */
export function EventThemePreview({
  theme,
  eventName,
  screen = 'home',
  activeField = null,
  onSelectField,
}: EventThemePreviewProps) {
  const [hovered, setHovered] = useState<ThemeFieldKey | null>(null);
  const primary = theme.theme_primary;
  const secondary = theme.theme_secondary;
  const tertiary = theme.theme_tertiary;
  const t = { activeField, onSelectField, onHover: setHovered };
  const caption = hovered ?? activeField;

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Uniform scaling only: the scaler reserves the scaled footprint; the frame inside keeps its design size. */}
      <div
        className="phone-preview-scaler relative flex-shrink-0"
        style={{
          width: `calc(${PHONE.width}px * var(--phone-scale))`,
          height: `calc(${PHONE.height}px * var(--phone-scale))`,
        }}
      >
        <div
          role="group"
          aria-label="Preview of the attendee app with this theme"
          className="absolute left-0 top-0 border-inverse-surface shadow-lg overflow-hidden flex flex-col"
          style={{
            width: PHONE.width,
            height: PHONE.height,
            borderRadius: PHONE.radius,
            borderWidth: PHONE.border,
            backgroundColor: APP.pageBackground,
            transform: 'scale(var(--phone-scale))',
            transformOrigin: 'top left',
          }}
        >
          <StatusBar />

          <div className="flex-1 min-h-0 overflow-hidden px-3.5 pt-1.5">
            {screen === 'home' ? (
              <>
                {/* Header, as in the app's Home (IndexStyles): menu button (Primary, icon in Secondary)
                  · welcome/name · compact action pill (Secondary) holding notifications + settings,
                  with the unread badge (Primary) anchored to the bell. */}
                <div className="flex items-center gap-2 mb-4">
                  <Target
                    {...t}
                    field="theme_primary"
                    className="w-8 h-8 rounded-full flex items-center justify-center shadow-sm flex-shrink-0"
                    style={{ backgroundColor: primary }}
                  >
                    <span
                      className={`material-symbols-outlined ${ICON.menu}`}
                      style={{ color: secondary }}
                      aria-hidden="true"
                    >
                      menu
                    </span>
                  </Target>
                  <div className="flex-1 min-w-0 text-center">
                    <p className="text-[9px] leading-tight" style={{ color: APP.mutedText }}>
                      Welcome Back!
                    </p>
                    <p
                      className="text-[11px] font-bold leading-tight truncate"
                      style={{ color: APP.text }}
                    >
                      Alex Morgan
                    </p>
                  </div>
                  <Target
                    {...t}
                    field="theme_secondary"
                    className="flex items-center gap-1 rounded-full px-1.5 py-1 shadow-sm flex-shrink-0"
                    style={{ backgroundColor: secondary }}
                  >
                    <span className="relative w-6 h-6 flex items-center justify-center">
                      <span
                        className={`material-symbols-outlined ${ICON.action}`}
                        style={{ color: APP.text, ...FILLED }}
                        aria-hidden="true"
                      >
                        notifications
                      </span>
                      <Target
                        {...t}
                        field="theme_primary"
                        clickable={false}
                        className="absolute top-0 right-0 min-w-[13px] h-[13px] rounded-full flex items-center justify-center px-[3px]"
                        style={{ backgroundColor: primary }}
                      >
                        <span
                          className="text-[7px] font-bold leading-none"
                          style={{ color: secondary }}
                        >
                          3
                        </span>
                      </Target>
                    </span>
                    <span className="w-6 h-6 flex items-center justify-center">
                      <span
                        className={`material-symbols-outlined ${ICON.action}`}
                        style={{ color: APP.text, ...FILLED }}
                        aria-hidden="true"
                      >
                        settings
                      </span>
                    </span>
                  </Target>
                </div>

                {/* Hero card: event title in Secondary over the hero photo */}
                <div className="relative h-[118px] rounded-xl overflow-hidden mb-3 bg-gradient-to-br from-tertiary to-inverse-surface">
                  <span
                    className="material-symbols-outlined absolute top-2 right-2 text-[40px] text-white/15"
                    aria-hidden="true"
                  >
                    landscape
                  </span>
                  <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/50 to-transparent">
                    <Target {...t} field="theme_secondary" className="block text-left rounded-sm">
                      <span
                        className="block text-[12px] font-bold leading-snug line-clamp-2"
                        style={{ color: secondary }}
                      >
                        {eventName}
                      </span>
                    </Target>
                    <p className="text-[9px] leading-snug text-white/90">Welcome to your event</p>
                  </div>
                </div>

                {/* Speakers/Presenters tabs, exactly as the app's conference-event Home shows them (no
                  heading above — the tabs are the heading). Presenters is a real, separate
                  facilitators.role_type, not a synonym. Track in Secondary, active tab tinted Primary. */}
                <Target
                  {...t}
                  field="theme_secondary"
                  clickable={false}
                  className="mx-auto w-[82%] flex rounded-full p-0.5 mb-2 border"
                  style={{ backgroundColor: secondary, borderColor: APP.border }}
                >
                  <Target
                    {...t}
                    field="theme_primary"
                    className="flex-1 rounded-full py-1 text-[9px] font-bold"
                    style={{ backgroundColor: withAlpha(primary, 0.15), color: APP.text }}
                  >
                    Speakers (2)
                  </Target>
                  <span
                    className="flex-1 py-1 text-[9px] text-center"
                    style={{ color: APP.mutedText }}
                  >
                    Presenters (1)
                  </span>
                </Target>

                <Target
                  {...t}
                  field="theme_secondary"
                  className="w-full flex items-center gap-2 rounded-xl p-2 mb-3 shadow-sm text-left"
                  style={{ backgroundColor: secondary }}
                >
                  <span className="w-8 h-8 rounded-full bg-surface-container-high flex items-center justify-center flex-shrink-0">
                    <span
                      className={`material-symbols-outlined ${ICON.content} text-on-surface-variant`}
                      aria-hidden="true"
                    >
                      person
                    </span>
                  </span>
                  <span className="min-w-0">
                    <span
                      className="block text-[10px] font-bold truncate"
                      style={{ color: APP.text }}
                    >
                      Jordan Lee
                    </span>
                    <span className="block text-[9px] truncate" style={{ color: APP.subtleText }}>
                      Opening Keynote
                    </span>
                  </span>
                </Target>

                {/* Activities: titles in Tertiary */}
                <p className="text-[11px] font-bold mb-1.5" style={{ color: APP.text }}>
                  Activities
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {['Networking Session', 'Team Challenge'].map((title) => (
                    <div key={title}>
                      <div className="h-14 rounded-lg bg-surface-container-high mb-1" />
                      <Target
                        {...t}
                        field="theme_tertiary"
                        className="block text-left rounded-sm w-full"
                      >
                        <span
                          className="block text-[10px] font-bold truncate"
                          style={{ color: tertiary }}
                        >
                          {title}
                        </span>
                      </Target>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                {/* Agenda header (AgendaStyles): menu button (Primary) · "Agenda" title with the
                  "Today's Schedule" subtitle in Primary. In the app the subtitle is plain Text,
                  not a control, so it's plain text here too. Same header row size as Home. */}
                <div className="flex items-center gap-3 mb-4">
                  <Target
                    {...t}
                    field="theme_primary"
                    className="w-8 h-8 rounded-full flex items-center justify-center shadow-sm flex-shrink-0"
                    style={{ backgroundColor: primary }}
                  >
                    <span
                      className={`material-symbols-outlined ${ICON.menu}`}
                      style={{ color: secondary }}
                      aria-hidden="true"
                    >
                      menu
                    </span>
                  </Target>
                  <div className="min-w-0">
                    <p className="text-[14px] font-bold leading-[18px]" style={{ color: APP.text }}>
                      Agenda
                    </p>
                    <Target {...t} field="theme_primary" className="block text-left mt-0.5">
                      <span
                        className="block text-[10px] font-medium leading-[13px]"
                        style={{ color: primary }}
                      >
                        Today&apos;s Schedule
                      </span>
                    </Target>
                  </div>
                </div>

                {/* Date chips: equal thirds, one height; selected chip in Primary with the app's automatic readable text colour */}
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {['Mon 12', 'Tue 13', 'Wed 14'].map((d, i) =>
                    i === 0 ? (
                      <Target
                        key={d}
                        {...t}
                        field="theme_primary"
                        className="h-8 rounded-lg flex items-center justify-center text-[10px] font-semibold shadow-sm"
                        style={{
                          backgroundColor: primary,
                          color: onPrimaryColour(primary, secondary),
                        }}
                      >
                        {d}
                      </Target>
                    ) : (
                      <span
                        key={d}
                        className="h-8 rounded-lg flex items-center justify-center text-[10px] border"
                        style={{
                          backgroundColor: APP.cardBackground,
                          borderColor: APP.border,
                          color: APP.text,
                        }}
                      >
                        {d}
                      </span>
                    )
                  )}
                </div>

                <div className="space-y-2">
                  {[
                    { title: 'Opening Keynote', time: '09:00 – 10:00', audience: 'All attendees' },
                    {
                      title: 'Networking Session',
                      time: '10:30 – 11:30',
                      audience: 'All attendees',
                    },
                    { title: 'Leadership Workshop', time: '12:00 – 13:00', audience: 'Managers' },
                  ].map((session) => (
                    <div
                      key={session.title}
                      className="flex rounded-xl overflow-hidden border"
                      style={{ backgroundColor: APP.cardBackground, borderColor: APP.border }}
                    >
                      {/* Accent bar colour is per-session in the app (agenda_sessions.accent_color), not part of the theme */}
                      <span
                        className="w-[3px] flex-shrink-0 bg-outline-variant"
                        aria-hidden="true"
                      />
                      <div className="flex-1 min-w-0 px-2.5 py-2">
                        <p
                          className="text-[11px] font-bold leading-[14px] truncate"
                          style={{ color: APP.text }}
                        >
                          {session.title}
                        </p>
                        <p
                          className="text-[9px] leading-[12px] mt-0.5"
                          style={{ color: APP.subtleText }}
                        >
                          {session.time}
                        </p>
                        {/* Audience pill: tint + text only, no border — as in the app */}
                        <Target
                          {...t}
                          field="theme_primary"
                          className="mt-1.5 inline-flex items-center h-4 px-2 rounded-full"
                          style={{ backgroundColor: withAlpha(primary, 0.1) }}
                        >
                          <span
                            className="text-[8px] font-semibold leading-none"
                            style={{ color: primary }}
                          >
                            {session.audience}
                          </span>
                        </Target>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Bottom menu — shared by every screen, fixed height; only the active slot changes.
            Five equal slots; active item icon + label in Primary on a white bubble (Navbar.tsx). */}
          <div
            className="mx-2 mb-2 flex-shrink-0 rounded-full bg-white/80 border border-white shadow-md grid grid-cols-5 items-center px-1"
            style={{ height: PHONE.navHeight }}
          >
            {[
              { key: 'home', label: 'Home', icon: 'home' },
              { key: 'agenda', label: 'Agenda', icon: 'calendar_month' },
              { key: 'gallery', label: 'Gallery', icon: 'photo_library' },
              { key: 'faq', label: 'FAQ', icon: 'help' },
              { key: 'info', label: 'Info', icon: 'info' },
            ].map((item) =>
              item.key === screen ? (
                <Target
                  key={item.key}
                  {...t}
                  field="theme_primary"
                  className="justify-self-center w-10 h-10 flex flex-col items-center justify-center rounded-full bg-white shadow"
                >
                  <span
                    className={`material-symbols-outlined ${ICON.nav}`}
                    style={{ color: primary, ...FILLED }}
                    aria-hidden="true"
                  >
                    {item.icon}
                  </span>
                  <span className="text-[8px] leading-tight font-bold" style={{ color: primary }}>
                    {item.label}
                  </span>
                </Target>
              ) : (
                <span
                  key={item.key}
                  className="h-10 flex flex-col items-center justify-center"
                  aria-hidden="true"
                >
                  <span
                    className={`material-symbols-outlined ${ICON.nav}`}
                    style={{ color: APP.navText }}
                  >
                    {item.icon}
                  </span>
                  <span className="text-[8px] leading-tight" style={{ color: APP.navText }}>
                    {item.label}
                  </span>
                </span>
              )
            )}
          </div>
        </div>
      </div>

      {onSelectField && (
        <p className="text-xs text-on-surface-variant text-center min-h-[1rem]" aria-hidden="true">
          {caption ? (
            <>
              <span className="font-semibold text-on-surface">{THEME_FIELDS[caption].name}</span> (
              {THEME_FIELDS[caption].technicalName})
              {hovered ? ' — click to edit' : ' — dashed outline (preview only)'}
            </>
          ) : (
            'Tip: click anything in the preview to edit its colour.'
          )}
        </p>
      )}
    </div>
  );
}
