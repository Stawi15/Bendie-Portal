'use client';

import { useEffect, useRef, useState } from 'react';

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
 *   (`beforeunload`). In-app navigation isn't intercepted (no global guard yet).
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

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

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
