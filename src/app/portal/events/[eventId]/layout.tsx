'use client';

import { useEventWorkspace } from '@/lib/useEventWorkspace';
import { EventWorkspaceV1 } from '@/components/shell/EventWorkspaceV1';

/**
 * Event workspace layout. Feature 030 split it into logic (`useEventWorkspace`,
 * the single source of availability/redirect decisions) and rendering
 * (`EventWorkspaceV1` = the current layout; the Studio 2.0 shell is added in
 * EventWorkspaceV2 behind the `studio_shell` choice).
 */
export default function EventLayout({ children }: { children: React.ReactNode }) {
  const ws = useEventWorkspace();
  return <EventWorkspaceV1 ws={ws}>{children}</EventWorkspaceV1>;
}
