/**
 * Feature 030 — which layout ("shell") the portal renders, chosen per browser.
 *
 * `v1` is today's layout and the default; `v2` is the Studio 2.0 shell. The
 * choice lives in a first-party cookie (read on the server so there's no layout
 * flash; research R3) and can be overridden with `?shell=v1|v2`. The cookie
 * holds only `v1`/`v2` — nothing about the user.
 */

export const SHELL_COOKIE = 'studio_shell';

export type Shell = 'v1' | 'v2';

export function isShell(value: unknown): value is Shell {
  return value === 'v1' || value === 'v2';
}

/** The query override wins when valid; then the cookie; anything else is `v1`. */
export function resolveShell(
  cookieValue: string | null | undefined,
  queryValue?: string | null
): Shell {
  if (isShell(queryValue)) return queryValue;
  if (isShell(cookieValue)) return cookieValue;
  return 'v1';
}

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** `document.cookie` assignment for the choice: path /portal, 1 year, SameSite=Lax. */
export function shellCookieString(shell: Shell): string {
  return `${SHELL_COOKIE}=${shell}; Path=/portal; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
}

/** Reads the current choice from a `document.cookie` string (client side). */
export function readShellCookie(cookieHeader: string | null | undefined): Shell | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SHELL_COOKIE) {
      const value = rest.join('=');
      return isShell(value) ? value : null;
    }
  }
  return null;
}
