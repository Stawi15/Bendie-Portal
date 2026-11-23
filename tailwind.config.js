/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
    // Providers render UI too (ConfirmContext's dialog) — unscanned, their classes were never generated.
    './src/contexts/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      screens: {
        // Feature 016: app-shell only (portal layout, OrgSideNav, TopHeader menu button).
        // Hover-capable desktops get the hover-expand sidebar rail; touch devices —
        // including ≥1024px tablets — keep the off-canvas drawer + menu button.
        // Must match the media query on `.sidebar-panel` in globals.css.
        desk: { raw: '(min-width: 1024px) and (hover: hover) and (pointer: fine)' },
        // Feature 030: Studio 2.0 shell (v2) sidebar modes (doc 22). Exactly one
        // matches at any size: full sidebar ≥1280; hover-expand rail 1024–1279 on
        // hover-capable desktops; drawer otherwise (phones, touch tablets <1280).
        // Must match `.shell-sidebar-panel` in globals.css.
        shellwide: { raw: '(min-width: 1280px)' },
        shellrail: { raw: '(min-width: 1024px) and (max-width: 1279px) and (hover: hover) and (pointer: fine)' },
        shelldrawer: { raw: '(max-width: 1023px), (max-width: 1279px) and (hover: none), (max-width: 1279px) and (pointer: coarse)' },
      },
      colors: {
        gray: {
          50: '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#9ca3af',
          500: '#6b7280',
          600: '#4b5563',
          700: '#374151',
          800: '#1f2937',
          900: '#111827',
        },
        blue: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        // Bendie Studio design tokens — see context/ui-tokens.md
        'on-surface': '#111c2d',
        'surface-container-highest': '#d9e3fb',
        background: '#f9f9ff',
        'on-secondary-fixed': '#2e1600',
        'on-background': '#111c2d',
        secondary: '#8c4f06',
        error: '#ba1a1a',
        outline: '#707882',
        'on-tertiary-fixed': '#111b2e',
        'on-primary-fixed': '#001d33',
        'surface-variant': '#d9e3fb',
        'secondary-fixed-dim': '#ffb877',
        tertiary: '#555e74',
        'on-error-container': '#93000a',
        'inverse-primary': '#99cbff',
        'primary-fixed-dim': '#99cbff',
        'on-tertiary-fixed-variant': '#3d475c',
        'surface-tint': '#00629d',
        'surface-dim': '#d0daf2',
        'error-container': '#ffdad6',
        'inverse-surface': '#273143',
        'surface-container-low': '#f0f3ff',
        'on-error': '#ffffff',
        primary: '#00629d',
        'on-secondary': '#ffffff',
        'inverse-on-surface': '#ecf0ff',
        'on-primary-fixed-variant': '#004a78',
        'primary-fixed': '#cfe5ff',
        'on-primary': '#ffffff',
        'tertiary-fixed-dim': '#bdc6e0',
        'surface-container-high': '#dfe8ff',
        'secondary-container': '#fdad61',
        'tertiary-container': '#98a2ba',
        'on-primary-container': '#003b61',
        surface: '#f9f9ff',
        'on-secondary-container': '#744000',
        'tertiary-fixed': '#d9e2fc',
        'primary-container': '#4ba8f5',
        'on-secondary-fixed-variant': '#6c3a00',
        'on-tertiary-container': '#2f384d',
        'on-surface-variant': '#404751',
        'on-tertiary': '#ffffff',
        'surface-container': '#e8eeff',
        'secondary-fixed': '#ffdcc0',
        'surface-container-lowest': '#ffffff',
        'surface-bright': '#f9f9ff',
        'outline-variant': '#bfc7d2',
        // Feature 029 — semantic status (always pair with an icon + text label;
        // never colour alone). fg/bg contrast ≥ 4.5:1 (specs/029 research R5).
        status: {
          blocking: { fg: '#ba1a1a', bg: '#ffdad6', border: '#ffb4ab' },
          warning: { fg: '#8c4f06', bg: '#ffdcc0', border: '#ffb877' },
          done: { fg: '#146c2e', bg: '#d6f5dc', border: '#9ad9a8' },
          info: { fg: '#00629d', bg: '#cfe5ff', border: '#99cbff' },
          neutral: { fg: '#404751', bg: '#e8eeff', border: '#bfc7d2' },
        },
        // Feature 029 — product accents: tags/chips only, never actions.
        product: {
          bendie: { fg: '#00629d', bg: '#e3f0fb', dot: '#00629d' },
          planner: { fg: '#c2410c', bg: '#fff1e6', dot: '#f97316' },
        },
      },
      // Feature 029 — namespaced so Tailwind's built-in rounded-sm/md/lg stay unchanged.
      borderRadius: {
        'ui-sm': '6px',
        'ui-md': '10px',
        'ui-lg': '14px',
      },
      boxShadow: {
        'elev-0': 'none',
        'elev-1': '0 1px 2px rgba(17,28,45,0.06), 0 1px 3px rgba(17,28,45,0.04)',
        'elev-2': '0 8px 24px rgba(17,28,45,0.10), 0 2px 6px rgba(17,28,45,0.06)',
        'elev-3': '0 20px 48px rgba(17,28,45,0.18), 0 4px 12px rgba(17,28,45,0.08)',
      },
      height: {
        row: '44px',
        'row-compact': '36px',
        control: '36px',
        'control-touch': '44px',
      },
      minHeight: {
        row: '44px',
        'row-compact': '36px',
        control: '36px',
        'control-touch': '44px',
      },
      transitionDuration: {
        'motion-fast': '120ms',
        'motion-base': '200ms',
        'motion-panel': '300ms',
      },
      transitionTimingFunction: {
        'motion-standard': 'cubic-bezier(0.2, 0, 0, 1)',
        'motion-panel': 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
      spacing: {
        xs: '4px',
        base: '8px',
        sm: '12px',
        md: '24px',
        gutter: '24px',
        lg: '32px',
        xl: '48px',
        'margin-desktop': '32px',
        'margin-mobile': '16px',
      },
      fontSize: {
        'label-sm': ['12px', { lineHeight: '16px', letterSpacing: '0.02em', fontWeight: '600' }],
        'label-md': ['14px', { lineHeight: '20px', letterSpacing: '0.01em', fontWeight: '600' }],
        'body-sm': ['14px', { lineHeight: '20px', fontWeight: '400' }],
        'body-md': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'body-lg': ['18px', { lineHeight: '28px', fontWeight: '400' }],
        'headline-sm': ['20px', { lineHeight: '28px', fontWeight: '600' }],
        'headline-md': ['24px', { lineHeight: '32px', fontWeight: '600' }],
        'headline-lg': ['32px', { lineHeight: '40px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-lg-mobile': ['28px', { lineHeight: '36px', fontWeight: '700' }],
        'headline-xl': ['40px', { lineHeight: '48px', letterSpacing: '-0.02em', fontWeight: '700' }],
      },
      fontFamily: {
        sans: ['var(--font-plus-jakarta-sans)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
