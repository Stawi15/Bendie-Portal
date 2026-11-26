'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { focusFirstIn, trapTab } from '@/components/shell/focusTrap';
import { initialRightPanelState, rightPanelReducer, type RightPanelState } from '@/lib/rightPanel';

/*
 * Feature 030 — the Studio 2.0 shell's single right-panel slot (research R6).
 * Plumbing only: pages register content with `useRegisterRightPanelContent`.
 * Nothing registers in 030, so the panel never renders and ⌘. / Ctrl+. is
 * not bound (spec FR-017).
 *
 * Feature 031 adds <RightPanel.Portal>: live children (an inspector form keeps
 * its state and contexts because it stays in the page's React tree), docked
 * beside the canvas at ≥1280px and a focus-trapped sheet below that.
 */

type Content = { title: string; render: () => React.ReactNode };

type RightPanelContextValue = {
  state: RightPanelState;
  open: (id: string) => void;
  close: () => void;
  toggle: (id?: string) => void;
  register: (id: string, content: Content) => void;
  unregister: (id: string) => void;
  contents: React.MutableRefObject<Map<string, Content>>;
  host: HTMLElement | null;
  setHost: (el: HTMLElement | null) => void;
};

const RightPanelContext = createContext<RightPanelContextValue | null>(null);

export function useRightPanel() {
  const ctx = useContext(RightPanelContext);
  if (!ctx) throw new Error('useRightPanel must be used inside RightPanelProvider');
  return { openId: ctx.state.openId, open: ctx.open, close: ctx.close, toggle: ctx.toggle };
}

/** Registers panel content for as long as the calling component is mounted. */
export function useRegisterRightPanelContent(id: string, content: Content) {
  const ctx = useContext(RightPanelContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.register(id, content);
    return () => ctx.unregister(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- register once per id; content is read at render time
  }, [id]);
}

export function RightPanelProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(rightPanelReducer, initialRightPanelState);
  const contents = useRef(new Map<string, Content>());
  const invoker = useRef<HTMLElement | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);

  const rememberInvoker = () => {
    if (document.activeElement instanceof HTMLElement) invoker.current = document.activeElement;
  };
  const open = useCallback((id: string) => {
    rememberInvoker();
    dispatch({ type: 'open', id });
  }, []);
  const close = useCallback(() => dispatch({ type: 'close' }), []);
  const toggle = useCallback((id?: string) => {
    rememberInvoker();
    dispatch({ type: 'toggle', id });
  }, []);
  const register = useCallback((id: string, content: Content) => {
    contents.current.set(id, content);
    dispatch({ type: 'register', id });
  }, []);
  const unregister = useCallback((id: string) => {
    contents.current.delete(id);
    dispatch({ type: 'unregister', id });
  }, []);

  // Focus returns to whatever opened the panel.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && state.openId === null) invoker.current?.focus();
    wasOpen.current = state.openId !== null;
  }, [state.openId]);

  // ⌘. / Ctrl+. toggles the panel, bound only while some content is registered.
  const hasContent = state.registered.length > 0;
  useEffect(() => {
    if (!hasContent) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '.' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggle();
      } else if (e.key === 'Escape' && state.openId) {
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasContent, toggle, close, state.openId]);

  const value = useMemo(
    () => ({ state, open, close, toggle, register, unregister, contents, host, setHost }),
    [state, open, close, toggle, register, unregister, host]
  );
  return <RightPanelContext.Provider value={value}>{children}</RightPanelContext.Provider>;
}

/**
 * The slot itself. Hosts <RightPanel.Portal> content (an empty `display: contents`
 * element, so portalled panels take part in the canvas row), and renders
 * registered content when that is open (030 API).
 */
export function RightPanelSlot() {
  const ctx = useContext(RightPanelContext);
  const content = ctx?.state.openId ? ctx.contents.current.get(ctx.state.openId) : undefined;
  if (!ctx) return null;
  const hostEl = <div ref={ctx.setHost} className="contents" />;
  if (!content) return hostEl;
  return (
    <>
    {hostEl}
    <aside
      data-shell-chrome
      aria-label={content.title}
      className="hidden shellwide:flex flex-col w-[360px] flex-shrink-0 border-l border-outline-variant bg-surface-container-lowest"
    >
      <div className="flex items-center justify-between h-row px-4 border-b border-outline-variant">
        <h2 className="text-sm font-semibold text-on-surface truncate">{content.title}</h2>
        <button
          type="button"
          onClick={ctx.close}
          aria-label="Close panel"
          className="h-control aspect-square flex items-center justify-center rounded-ui-sm text-on-surface-variant hover:bg-surface-container-low"
        >
          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
            close
          </span>
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4">{content.render()}</div>
    </aside>
    </>
  );
}

const WIDE_QUERY = '(min-width: 1280px)';

function useIsWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(WIDE_QUERY);
    const update = () => setWide(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return wide;
}

/**
 * Feature 031 — a panel with LIVE children (e.g. an inspector) rendered into the
 * shell's right-panel slot. ≥1280px: docked beside the canvas (the list stays
 * visible). Below: a sheet over the page — role="dialog", aria-modal, focus moves
 * in and is kept inside, Escape / close button / scrim close it. Focus returns to
 * whatever was focused when it opened. `onClose` is where callers put their
 * unsaved-changes check.
 */
function Portal({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const ctx = useContext(RightPanelContext);
  const wide = useIsWide();
  const ref = useRef<HTMLElement>(null);
  const titleId = useId();
  const invoker = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // On open: remember the invoker and move focus into the panel. On close: give focus back.
  useEffect(() => {
    if (!open) return;
    if (document.activeElement instanceof HTMLElement && !ref.current?.contains(document.activeElement)) {
      invoker.current = document.activeElement;
    }
    const t = window.setTimeout(() => focusFirstIn(ref.current), 0);
    return () => {
      window.clearTimeout(t);
      const back = invoker.current;
      if (back && document.contains(back)) back.focus();
    };
  }, [open]);

  // Escape closes (through the caller's onClose) wherever focus is, unless a dialog above it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (document.querySelector('[role="alertdialog"], [data-confirm-dialog]')) return;
      onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!ctx?.host || !open) return null;
  const sheet = !wide;
  return createPortal(
    <>
      {sheet && <div className="fixed inset-0 z-40 bg-black/40" onClick={() => onCloseRef.current()} aria-hidden="true" />}
      <aside
        ref={ref}
        data-shell-chrome
        role={sheet ? 'dialog' : 'complementary'}
        aria-modal={sheet ? true : undefined}
        aria-labelledby={titleId}
        onKeyDown={(e) => sheet && trapTab(e, ref.current)}
        className={
          sheet
            ? 'fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] flex flex-col bg-surface-container-lowest shadow-elev-3 motion-safe:animate-[shell-sheet-in_300ms_cubic-bezier(0.32,0.72,0,1)]'
            : 'flex flex-col w-[400px] flex-shrink-0 border-l border-outline-variant bg-surface-container-lowest'
        }
      >
        <div className="flex items-center justify-between gap-2 h-row px-4 border-b border-outline-variant flex-shrink-0">
          <h2 id={titleId} className="text-sm font-semibold text-on-surface truncate">
            {title}
          </h2>
          <button
            type="button"
            onClick={() => onCloseRef.current()}
            aria-label="Close"
            className="h-control aspect-square flex items-center justify-center rounded-ui-sm text-on-surface-variant hover:bg-surface-container-low"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
              close
            </span>
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4">{children}</div>
        {footer && <div className="flex-shrink-0 border-t border-outline-variant px-4 py-3">{footer}</div>}
      </aside>
    </>,
    ctx.host
  );
}

export const RightPanel = { Portal };
