'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@/contexts/ConfirmContext';

export type SavePhase = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Feature 016 (reliability pass) — truthful save state for single-record
 * settings forms that load once and save with an explicit button (Basics,
 * Hero & Branding, Terminology).
 *
 * - `dirty` compares the form to the last snapshot the SERVER confirmed (the
 *   loaded values, then each successful save) — never to local assumptions.
 * - `saved` only ever follows a successful request; a failed request goes to
 *   `error` and keeps the user's input untouched.
 * - While dirty, closing/refreshing the tab asks for confirmation
 *   (`beforeunload`), and (Feature 016 organizer-experience pass) clicking any
 *   in-app link — sidebar, event areas, steps, Previous/Next — asks
 *   "Leave without saving?" first. Nothing is intercepted while the form is clean.
 */
export function useSaveStatus<T>(form: T, ready: boolean) {
  const current = JSON.stringify(form);
  const [baseline, setBaseline] = useState<string | null>(null);
  const [phase, setPhase] = useState<SavePhase>('idle');
  const pending = useRef<string | null>(null);

  // First fully-loaded form becomes the saved baseline.
  useEffect(() => {
    if (ready && baseline === null) setBaseline(current);
  }, [ready, baseline, current]);

  const dirty = baseline !== null && current !== baseline;
  const router = useRouter();
  const confirm = useConfirm();

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    // In-app links: capture-phase, so it runs before Next's <Link> handler.
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      confirm({
        title: 'Leave without saving?',
        message: 'You have unsaved changes on this page. If you leave now, they will be lost.',
        confirmLabel: 'Leave page',
        cancelLabel: 'Stay',
        destructive: true,
      }).then((leave) => {
        if (leave) router.push(`${url.pathname}${url.search}${url.hash}`);
      });
    };
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', warn);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty, confirm, router]);

  return {
    dirty,
    phase,
    /** Call right before the save request; remembers exactly what is being saved. */
    start: () => {
      pending.current = current;
      setPhase('saving');
    },
    /** Call only after the server confirmed the save. */
    succeed: () => {
      if (pending.current !== null) setBaseline(pending.current);
      pending.current = null;
      setPhase('saved');
    },
    fail: () => {
      pending.current = null;
      setPhase('error');
    },
  };
}
