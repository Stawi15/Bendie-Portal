import { describe, expect, it } from 'vitest';
import { readShellCookie, resolveShell, shellCookieString, SHELL_COOKIE } from './shellLayout';

describe('resolveShell', () => {
  it('defaults to v1', () => {
    expect(resolveShell(undefined)).toBe('v1');
    expect(resolveShell(null, null)).toBe('v1');
    expect(resolveShell('garbage', 'nope')).toBe('v1');
  });
  it('uses the cookie when there is no valid query override', () => {
    expect(resolveShell('v2')).toBe('v2');
    expect(resolveShell('v2', 'v3')).toBe('v2');
  });
  it('lets a valid query override win', () => {
    expect(resolveShell('v2', 'v1')).toBe('v1');
    expect(resolveShell('v1', 'v2')).toBe('v2');
    expect(resolveShell(undefined, 'v2')).toBe('v2');
  });
});

describe('shell cookie', () => {
  it('is scoped to /portal for a year with SameSite=Lax', () => {
    const c = shellCookieString('v2');
    expect(c.startsWith(`${SHELL_COOKIE}=v2;`)).toBe(true);
    expect(c).toContain('Path=/portal');
    expect(c).toContain('Max-Age=31536000');
    expect(c).toContain('SameSite=Lax');
  });
  it('reads the value back from a cookie header', () => {
    expect(readShellCookie(`a=1; ${SHELL_COOKIE}=v2; b=2`)).toBe('v2');
    expect(readShellCookie(`${SHELL_COOKIE}=bad`)).toBeNull();
    expect(readShellCookie('a=1')).toBeNull();
    expect(readShellCookie('')).toBeNull();
  });
});
