/**
 * Feature 031 — focus helpers shared by the v2 drawer (ShellSidebar, Feature 030)
 * and the inspector sheet (RightPanel.Portal). Extracted from AppShell unchanged.
 */

export const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Moves focus to the first focusable element inside `container`. */
export function focusFirstIn(container: HTMLElement | null) {
  container?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
}

/** Keeps Tab / Shift+Tab inside `container` (wraps at either end). Call from onKeyDown. */
export function trapTab(e: React.KeyboardEvent | KeyboardEvent, container: HTMLElement | null) {
  if (e.key !== 'Tab' || !container) return;
  const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement
  );
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
}
