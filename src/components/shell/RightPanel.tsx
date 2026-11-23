'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { initialRightPanelState, rightPanelReducer, type RightPanelState } from '@/lib/rightPanel';

/*
 * Feature 030 — the Studio 2.0 shell's single right-panel slot (research R6).
 * Plumbing only: pages register content with `useRegisterRightPanelContent`.
 * Nothing registers in 030, so the panel never renders and ⌘. / Ctrl+. is
 * not bound (spec FR-017).
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
    () => ({ state, open, close, toggle, register, unregister, contents }),
    [state, open, close, toggle, register, unregister]
  );
  return <RightPanelContext.Provider value={value}>{children}</RightPanelContext.Provider>;
}

/** The slot itself. Renders nothing unless registered content is open. */
export function RightPanelSlot() {
  const ctx = useContext(RightPanelContext);
  const content = ctx?.state.openId ? ctx.contents.current.get(ctx.state.openId) : undefined;
  if (!ctx || !content) return null;
  return (
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
  );
}
