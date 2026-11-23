'use client';

import { ManageModulesModal } from '@/components/portal/ManageModulesModal';
import { ShellCanvas, ShellSidebar } from '@/components/shell/AppShell';
import { EventBreadcrumbs } from '@/components/shell/Breadcrumbs';
import { EventSidebar, EventSidebarMinimal } from '@/components/shell/EventSidebar';
import {
  EventContentGate,
  EventStepNav,
  EventWorkspaceDenied,
  EventWorkspaceLoading,
} from '@/components/shell/EventWorkspaceParts';
import type { EventWorkspace } from '@/lib/useEventWorkspace';

/**
 * Feature 030 — the event workspace in the Studio 2.0 shell ("v2"). Renders
 * from the same `useEventWorkspace()` value as v1 and reuses the same content
 * gate, access screens and Previous/Next, so pages are gated identically.
 */
export function EventWorkspaceV2({
  ws,
  children,
}: {
  ws: EventWorkspace;
  children: React.ReactNode;
}) {
  const {
    currentEvent,
    eventId,
    manageModulesOpen,
    moduleProducts,
    patchCurrentEvent,
    setManageModulesOpen,
    workspaceAuthDenied,
    workspaceAuthPending,
  } = ws;

  if (workspaceAuthPending || workspaceAuthDenied) {
    return (
      <>
        <ShellSidebar label="Event">
          <EventSidebarMinimal />
        </ShellSidebar>
        <ShellCanvas>
          {workspaceAuthPending ? <EventWorkspaceLoading /> : <EventWorkspaceDenied />}
        </ShellCanvas>
      </>
    );
  }

  const event = currentEvent?.id === eventId ? currentEvent : null;
  return (
    <>
      {manageModulesOpen && currentEvent && (
        <ManageModulesModal
          eventId={currentEvent.id}
          products={moduleProducts}
          current={currentEvent.portal_setup_modules ?? null}
          onClose={() => setManageModulesOpen(false)}
          onSaved={(modules) => {
            // Same in-memory patch as v1: the sidebar updates immediately, nothing refetches.
            patchCurrentEvent(currentEvent.id, { portal_setup_modules: modules });
            setManageModulesOpen(false);
          }}
        />
      )}
      <ShellSidebar label="Event">
        <EventSidebar ws={ws} />
      </ShellSidebar>
      <ShellCanvas breadcrumbs={<EventBreadcrumbs ws={ws} />} footer={<EventStepNav ws={ws} />}>
        <h1 className="sr-only">{event?.name ?? 'Event'}</h1>
        <EventContentGate ws={ws}>{children}</EventContentGate>
      </ShellCanvas>
    </>
  );
}
