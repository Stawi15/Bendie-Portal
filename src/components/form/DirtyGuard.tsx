'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@/contexts/ConfirmContext';

/*
 * Feature 031 — unsaved-changes guard (research R5). While any registered form
 * is dirty:
 *  - in-app link clicks are intercepted (capture phase, before Next's Link) and
 *    only followed after "Discard changes?" is confirmed;
 *  - reload / tab close shows the browser's own leave-page warning;
 *  - code-driven navigation asks through `useNavigationGuard().confirmLeave()`
 *    (event search, Logout, the inspector's own close / switch / Add).
 * Back/Forward within a page is handled by that page's URL state (it moves its
 * own open record only after confirmLeave), so typed values survive "Keep
 * editing". Inert when nothing is dirty, so it can wrap every portal page.
 */

type GuardCtx = {
  setDirty: (key: string, dirty: boolean) => void;
  confirmLeave: () => Promise<boolean>;
  isDirty: () => boolean;
};

const DirtyGuardContext = createContext<GuardCtx | null>(null);

export const DISCARD_PROMPT = {
  title: 'Discard changes?',
  message: 'You have unsaved changes. If you leave now, they’ll be lost.',
  confirmLabel: 'Discard',
  cancelLabel: 'Keep editing',
  destructive: true,
} as const;

export function DirtyGuardProvider({ children }: { children: React.ReactNode }) {
  const confirm = useConfirm();
  const router = useRouter();
  const dirtyKeys = useRef(new Set<string>());
  const [anyDirty, setAnyDirty] = useState(false);
  const asking = useRef<Promise<boolean> | null>(null);

  const setDirty = useCallback((key: string, dirty: boolean) => {
    if (dirty) dirtyKeys.current.add(key);
    else dirtyKeys.current.delete(key);
    setAnyDirty(dirtyKeys.current.size > 0);
  }, []);

  const isDirty = useCallback(() => dirtyKeys.current.size > 0, []);

  const confirmLeave = useCallback(async () => {
    if (dirtyKeys.current.size === 0) return true;
    // One prompt at a time (e.g. Escape and a click together).
    if (!asking.current)
      asking.current = confirm({ ...DISCARD_PROMPT }).finally(() => (asking.current = null));
    const ok = await asking.current;
    if (ok) {
      dirtyKeys.current.clear();
      setAnyDirty(false);
    }
    return ok;
  }, [confirm]);

  useEffect(() => {
    if (!anyDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const onClick = (e: MouseEvent) => {
      if (dirtyKeys.current.size === 0 || e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // new tab/window: nothing is lost
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return; // leaving the site: the browser's own warning covers it
      if (url.href === window.location.href) return;
      e.preventDefault();
      e.stopPropagation();
      void confirmLeave().then((ok) => {
        if (ok) router.push(url.pathname + url.search + url.hash);
      });
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [anyDirty, confirmLeave, router]);

  const value = useMemo(
    () => ({ setDirty, confirmLeave, isDirty }),
    [setDirty, confirmLeave, isDirty]
  );
  return <DirtyGuardContext.Provider value={value}>{children}</DirtyGuardContext.Provider>;
}

/** Registers this form's dirty state with the guard for as long as it's mounted. */
export function useDirtyGuard(isDirty: boolean) {
  const ctx = useContext(DirtyGuardContext);
  const key = useId();
  useEffect(() => {
    ctx?.setDirty(key, isDirty);
  }, [ctx, key, isDirty]);
  useEffect(() => () => ctx?.setDirty(key, false), [ctx, key]);
}

/** For code-driven navigation: `if (await confirmLeave()) router.push(...)`. Resolves true when nothing is dirty. */
export function useNavigationGuard() {
  const ctx = useContext(DirtyGuardContext);
  return useMemo(
    () => ({
      confirmLeave: ctx?.confirmLeave ?? (async () => true),
      isDirty: ctx?.isDirty ?? (() => false),
    }),
    [ctx]
  );
}
