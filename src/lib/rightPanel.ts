/**
 * Feature 030 — state for the Studio 2.0 shell's single right-panel slot
 * (research R6). Pure reducer; the provider lives in
 * `src/components/shell/RightPanel.tsx`. In 030 nothing registers content, so
 * the panel can never open and nothing is visible (spec FR-017).
 */

export type RightPanelState = {
  /** Ids of content that pages have registered for the panel. */
  registered: string[];
  /** The open content id, or null when closed. */
  openId: string | null;
};

export type RightPanelAction =
  | { type: 'register'; id: string }
  | { type: 'unregister'; id: string }
  | { type: 'open'; id: string }
  | { type: 'close' }
  | { type: 'toggle'; id?: string };

export const initialRightPanelState: RightPanelState = { registered: [], openId: null };

export function rightPanelReducer(
  state: RightPanelState,
  action: RightPanelAction
): RightPanelState {
  switch (action.type) {
    case 'register':
      return state.registered.includes(action.id)
        ? state
        : { ...state, registered: [...state.registered, action.id] };
    case 'unregister': {
      const registered = state.registered.filter((id) => id !== action.id);
      return { registered, openId: state.openId === action.id ? null : state.openId };
    }
    case 'open':
      // Only registered content can open — an unknown id is ignored.
      return state.registered.includes(action.id) ? { ...state, openId: action.id } : state;
    case 'close':
      return state.openId === null ? state : { ...state, openId: null };
    case 'toggle': {
      if (state.openId !== null) return { ...state, openId: null };
      const id = action.id ?? state.registered[state.registered.length - 1];
      return id && state.registered.includes(id) ? { ...state, openId: id } : state;
    }
  }
}
