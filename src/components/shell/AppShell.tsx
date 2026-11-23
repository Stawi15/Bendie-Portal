'use client';

import { createContext, useContext, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useHeaderModel, type HeaderModel } from '@/components/header/useHeaderModel';
import { HeaderActions, HeaderCreateOrganization } from '@/components/header/HeaderParts';
import { useShell } from '@/components/shell/ShellContext';
import { RightPanelProvider, RightPanelSlot } from '@/components/shell/RightPanel';

/*
 * Feature 030 — the Studio 2.0 shell frame ("v2"). Layout:
 *
 *   ┌ global top bar (menu · Studio · search · activity · settings · account · New event) ┐
 *   │ ShellSidebar │ ShellCanvas (breadcrumbs · toolbar · page · footer) │ right panel     │
 *
 * The top bar is the same on organisation and event routes. Organisation routes
 * get their sidebar from PortalShell; event routes from the event layout
 * (EventWorkspaceV2), which is the only place `useEventWorkspace()` lives.
 * `data-shell-chrome` scopes the K1 focus fix (globals.css) to this chrome.
 */

const HeaderModelContext = createContext<HeaderModel | null>(null);

/** The header model shared by the top bar and the organisation sidebar (one set of reads). */
export function useShellHeaderModel(): HeaderModel {
  const m = useContext(HeaderModelContext);
  if (!m) throw new Error('useShellHeaderModel must be used inside AppShell');
  return m;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const m = useHeaderModel();
  const { navOpen, openNav, menuButtonRef } = useShell();
  return (
    <HeaderModelContext.Provider value={m}>
      <RightPanelProvider>
        <div data-shell="v2" className="h-screen overflow-hidden bg-background flex flex-col">
          <a
            href="#shell-main"
            className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:px-3 focus:py-2 focus:rounded-ui-md focus:bg-surface-container-lowest focus:shadow-elev-2 focus:text-primary"
          >
            Skip to content
          </a>
          <header
            data-shell-chrome
            className="flex-shrink-0 h-16 flex items-center gap-3 px-3 sm:px-4 bg-surface-container-lowest border-b border-outline-variant relative z-30"
          >
            <button
              ref={menuButtonRef}
              type="button"
              onClick={openNav}
              aria-label="Open navigation menu"
              aria-expanded={navOpen}
              aria-controls="shell-sidebar"
              className="hidden shelldrawer:inline-flex w-control-touch h-control-touch -ml-1 flex-shrink-0 items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low"
            >
              <span className="material-symbols-outlined" aria-hidden="true">
                menu
              </span>
            </button>
            <Link href="/portal" className="flex items-center gap-2 flex-shrink-0 rounded-ui-sm">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/bendie.png" alt="" className="w-8 h-8 object-contain" />
              <span className="hidden sm:inline text-on-surface font-bold">Bendie Studio</span>
            </Link>
            <div className="flex-1 min-w-0" />
            <HeaderActions m={m} />
          </header>
          <div className="flex-1 min-h-0 flex relative">{children}</div>
          <HeaderCreateOrganization m={m} />
        </div>
      </RightPanelProvider>
    </HeaderModelContext.Provider>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The sidebar column: full width ≥1280, hover-expand rail 1024–1279 on
 * hover-capable desktops, drawer otherwise (research R6): role="dialog" while
 * open, focus moves in and is kept inside, Escape or the scrim closes it, and
 * focus returns to the menu button.
 */
export function ShellSidebar({ label, children }: { label: string; children: React.ReactNode }) {
  const { navOpen, closeNav, menuButtonRef } = useShell();
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!navOpen) return;
    ref.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const menuButton = menuButtonRef.current;
    // Leaving drawer mode (rotating / resizing to a wider layout) closes it.
    const mq = window.matchMedia(
      '(min-width: 1280px), (min-width: 1024px) and (hover: hover) and (pointer: fine)'
    );
    const onChange = () => mq.matches && closeNav();
    mq.addEventListener('change', onChange);
    // Escape closes the drawer wherever focus is.
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeNav();
    document.addEventListener('keydown', onKey);
    return () => {
      mq.removeEventListener('change', onChange);
      document.removeEventListener('keydown', onKey);
      menuButton?.focus();
    };
  }, [navOpen, closeNav, menuButtonRef]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!navOpen) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      closeNav();
      return;
    }
    if (e.key !== 'Tab' || !ref.current) return;
    const items = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <>
      {navOpen && (
        <div
          className="hidden shelldrawer:block fixed inset-0 z-40 bg-black/40"
          onClick={closeNav}
          aria-hidden="true"
        />
      )}
      <aside
        ref={ref}
        id="shell-sidebar"
        data-shell-chrome
        aria-label={label}
        role={navOpen ? 'dialog' : undefined}
        aria-modal={navOpen ? true : undefined}
        onKeyDown={onKeyDown}
        className={`flex-shrink-0
          shelldrawer:fixed shelldrawer:inset-y-0 shelldrawer:left-0 shelldrawer:z-50 shelldrawer:w-[280px] shelldrawer:duration-motion-base shelldrawer:ease-motion-standard
          ${
            // Visibility switches on at once when opening (so focus can move in) and only
            // after the slide when closing; hidden links are never reachable by Tab.
            navOpen
              ? 'shelldrawer:translate-x-0 shelldrawer:transition-transform'
              : 'shelldrawer:-translate-x-full shelldrawer:invisible shelldrawer:transition-[transform,visibility]'
          }
          shellrail:relative shellrail:z-20 shellrail:w-[72px]
          shellwide:relative shellwide:w-[264px]`}
      >
        <div className="shell-sidebar-panel h-full w-full overflow-hidden bg-surface-container-lowest border-r border-outline-variant flex flex-col">
          {children}
        </div>
      </aside>
    </>
  );
}

/** The canvas: breadcrumbs, optional toolbar, the page (the only scroller), optional footer, right panel. */
export function ShellCanvas({
  breadcrumbs,
  toolbar,
  footer,
  children,
}: {
  breadcrumbs?: React.ReactNode;
  toolbar?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <>
      <main
        id="shell-main"
        tabIndex={-1}
        className="flex-1 min-w-0 flex flex-col focus:outline-none"
      >
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 sm:p-gutter">
          {breadcrumbs}
          {toolbar && <div className="mb-4">{toolbar}</div>}
          {children}
        </div>
        {footer && <div className="flex-shrink-0 px-4 sm:px-gutter pb-3">{footer}</div>}
      </main>
      <RightPanelSlot />
    </>
  );
}
