import { cookies } from 'next/headers';
import { PortalShell } from '@/components/shell/PortalShell';
import { resolveShell, SHELL_COOKIE } from '@/lib/shellLayout';

/**
 * Portal layout (server component). Feature 030: the client shell lives in
 * `PortalShell`; this layout reads the `studio_shell` layout choice on the
 * server (so a v2 user never sees the v1 layout flash) and passes it down.
 * Reading cookies makes /portal/* render per request (research R3, analysis U2).
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const initialShell = resolveShell(cookieStore.get(SHELL_COOKIE)?.value);
  return <PortalShell initialShell={initialShell}>{children}</PortalShell>;
}
