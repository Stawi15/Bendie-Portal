import { PortalShell } from '@/components/shell/PortalShell';

/**
 * Portal layout (server component). Feature 030: the client shell lives in
 * `PortalShell`; this layout reads the `studio_shell` layout choice on the
 * server (so a v2 user never sees the v1 layout flash) and passes it down.
 */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell>{children}</PortalShell>;
}
