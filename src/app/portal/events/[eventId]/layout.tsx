'use client';

import { useEventWorkspace } from '@/lib/useEventWorkspace';
import { EventWorkspaceV1 } from '@/components/shell/EventWorkspaceV1';
import { EventWorkspaceV2 } from '@/components/shell/EventWorkspaceV2';
import { useShell } from '@/components/shell/ShellContext';

/**
 * Event workspace layout. Feature 030 split it into logic (`useEventWorkspace`,
 * the single source of availability/redirect decisions) and rendering:
 * `EventWorkspaceV1` = the current layout; `EventWorkspaceV2` = the Studio 2.0
 * shell, chosen by the per-browser `studio_shell` setting.
 */
export default function EventLayout({ children }: { children: React.ReactNode }) {
  const ws = useEventWorkspace();
  const { shell } = useShell();
  return shell === 'v2' ? (
    <EventWorkspaceV2 ws={ws}>{children}</EventWorkspaceV2>
  ) : (
    <EventWorkspaceV1 ws={ws}>{children}</EventWorkspaceV1>
  );
}
