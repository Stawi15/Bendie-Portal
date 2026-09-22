'use client';

import { useCallback, useEffect, useRef } from 'react';

/**
 * Feature 016 (Rapid-Navigation Performance & Stability pass) — the shared
 * "latest request wins" primitive. Every event-workspace child page already
 * guards its OWN local state against a stale response overwriting fresher
 * state (a `requestIdRef` counter checked before each `setState` call), and
 * that guard is left in place everywhere it already exists. What none of
 * these pages did is actually CANCEL the underlying `fetch()` when a newer
 * request supersedes it — under rapid tab-switching, every previous page's
 * in-flight requests kept running to completion regardless (the browser has
 * no way to know Portal has moved on), competing for real network/Supabase
 * capacity with whatever the user is now actually waiting to see. This is
 * the confirmed "request storm" contributor to perceived slowness under
 * rapid navigation.
 *
 * `useLatestRequest()` returns a `start()` function: call it once per load
 * attempt to get an `AbortSignal`, pass that signal to every `fetch()` in
 * that attempt, and abort automatically happens (a) when `start()` is
 * called again (superseding the previous attempt) and (b) on unmount
 * (navigating away). `isAbortError` distinguishes a deliberate
 * cancellation from a genuine failure — an aborted request must never
 * surface a toast, an error state, or any user-visible "failed to load"
 * signal, per the explicit rule that cancellation caused by normal
 * navigation is not an application error.
 *
 * Deliberately NOT a caching layer, NOT a global request registry, and NOT
 * a replacement for each page's own `requestIdRef` staleness guard (which
 * still protects state correctness even for endpoints/environments where
 * `AbortController` cancellation itself doesn't shorten the underlying
 * network work) — this only stops wasted, already-superseded traffic.
 */
export function useLatestRequest() {
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  const start = useCallback((): AbortSignal => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    return controller.signal;
  }, []);

  return start;
}

/** True for a `fetch()` rejection caused by an `AbortController` cancellation — never a genuine network/server failure. */
export function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}
