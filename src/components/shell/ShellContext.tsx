'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { isShell, readShellCookie, shellCookieString, type Shell } from '@/lib/shellLayout';

/*
 * Feature 030 — the portal's current layout choice and the v2 drawer state.
 * The choice comes from the server (cookie read in `app/portal/layout.tsx`), so
 * there is no client-side flash; switching writes the cookie and refreshes.
 */

type ShellContextValue = {
  shell: Shell;
  /** Writes the choice and re-renders the portal in it. Harmless if cookies are blocked. */
  switchShell: (next: Shell) => void;
  navOpen: boolean;
  openNav: () => void;
  closeNav: () => void;
  menuButtonRef: React.RefObject<HTMLButtonElement | null>;
};

const ShellContext = createContext<ShellContextValue>({
  shell: 'v1',
  switchShell: () => {},
  navOpen: false,
  openNav: () => {},
  closeNav: () => {},
  menuButtonRef: { current: null },
});

export function useShell() {
  return useContext(ShellContext);
}

function writeShellCookie(shell: Shell): boolean {
  try {
    document.cookie = shellCookieString(shell);
    return readShellCookie(document.cookie) === shell;
  } catch {
    return false;
  }
}

export function ShellProvider({ shell, children }: { shell: Shell; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);

  // Close the drawer on every route change (as v1's layout does).
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  const switchShell = useCallback(
    (next: Shell) => {
      if (!writeShellCookie(next)) return; // cookies blocked: stay as we are
      // Drop a `?shell=` override from the URL so it can't switch us straight back.
      const url = new URL(window.location.href);
      if (url.searchParams.has('shell')) {
        url.searchParams.delete('shell');
        router.replace(url.pathname + url.search + url.hash);
      }
      router.refresh();
    },
    [router]
  );

  const value = useMemo(
    () => ({
      shell,
      switchShell,
      navOpen,
      openNav: () => setNavOpen(true),
      closeNav: () => setNavOpen(false),
      menuButtonRef,
    }),
    [shell, switchShell, navOpen]
  );
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

/**
 * `?shell=v1|v2` override (research R3). Writes the cookie and refreshes ONLY
 * when the requested value differs from the cookie, and only if the write
 * actually stuck, so it can never loop (analysis U1). Render inside Suspense.
 */
export function ShellQueryOverride() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const requested = searchParams.get('shell');
  useEffect(() => {
    if (!isShell(requested)) return;
    let current: Shell | null = null;
    try {
      current = readShellCookie(document.cookie);
    } catch {
      return;
    }
    if (current === requested) return;
    if (writeShellCookie(requested)) router.refresh();
  }, [requested, router]);
  return null;
}
