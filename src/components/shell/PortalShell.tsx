'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Toaster } from 'react-hot-toast';
import { EventProvider } from '@/contexts/EventContext';
import { OrganizationProvider } from '@/contexts/OrganizationContext';
import { ProductProvider } from '@/contexts/ProductContext';
import { AvailableProductsProvider } from '@/contexts/AvailableProductsContext';
import { ConfirmProvider } from '@/contexts/ConfirmContext';
import { CreateEventProvider } from '@/contexts/CreateEventContext';
import { DirtyGuardProvider } from '@/components/form/DirtyGuard';
import { OrgSideNav } from '@/components/portal/OrgSideNav';
import { TopHeader } from '@/components/portal/TopHeader';
import { AppShell, ShellCanvas, ShellSidebar } from '@/components/shell/AppShell';
import { OrgBreadcrumbs } from '@/components/shell/Breadcrumbs';
import { OrgSidebar } from '@/components/shell/OrgSidebar';
import { ShellProvider, ShellQueryOverride } from '@/components/shell/ShellContext';
import type { Shell } from '@/lib/shellLayout';

/** Same toast settings in both layouts. */
const TOASTER = (
  <Toaster
    position="top-right"
    reverseOrder={false}
    gutter={8}
    toastOptions={{
      duration: 4000,
      style: {
        background: '#fff',
        color: '#000',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        borderRadius: '0.5rem',
      },
      success: {
        duration: 3000,
      },
      error: {
        duration: 5000,
      },
    }}
  />
);

/** Event workspace routes get their sidebar from the event layout (it owns useEventWorkspace). */
const EVENT_ROUTE = /^\/portal\/events\/[^/]+/;

/**
 * Feature 030 — the portal's client shell, moved VERBATIM from
 * `src/app/portal/layout.tsx` (providers, OrgSideNav, TopHeader, main, Toaster)
 * so the layout can be a server component that reads the `studio_shell` cookie.
 */
export function PortalShell({
  initialShell,
  children,
}: {
  initialShell: Shell;
  children: React.ReactNode;
}) {
  const [navOpen, setNavOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile drawer whenever the route changes
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  return (
    <OrganizationProvider>
      <ProductProvider>
        <AvailableProductsProvider>
          <EventProvider>
            <ConfirmProvider>
              {/* Feature 016: one canonical event-creation flow for every "New Event" entry point. */}
              {/* Feature 031: unsaved-changes guard (inert unless a form is dirty). */}
              <DirtyGuardProvider>
              <CreateEventProvider>
                <ShellProvider shell={initialShell}>
                  <Suspense fallback={null}>
                    <ShellQueryOverride />
                  </Suspense>
                  {initialShell === 'v2' ? (
                    <>
                      <AppShell>
                        {EVENT_ROUTE.test(pathname) ? (
                          children
                        ) : (
                          <>
                            <ShellSidebar label="Organisation">
                              <OrgSidebar />
                            </ShellSidebar>
                            <ShellCanvas breadcrumbs={<OrgBreadcrumbs />}>{children}</ShellCanvas>
                          </>
                        )}
                      </AppShell>
                      {TOASTER}
                    </>
                  ) : (
                    <div className="h-screen overflow-hidden bg-background desk:flex">
                      <OrgSideNav open={navOpen} onClose={() => setNavOpen(false)} />

                      <div className="flex flex-col h-full min-w-0 desk:flex-1">
                        {/* TopHeader reads useSearchParams() (breadcrumb origin-signal fallback,
                      /code-review finding F5) — Next.js requires a Suspense boundary around
                      any such usage so it doesn't force every otherwise-static portal page
                      into full dynamic rendering during `next build`. */}
                        <Suspense fallback={null}>
                          <TopHeader onOpenNav={() => setNavOpen(true)} />
                        </Suspense>
                        <main className="flex-1 min-w-0 overflow-y-auto custom-scrollbar p-4 sm:p-gutter">
                          {children}
                        </main>
                      </div>

                      {TOASTER}
                    </div>
                  )}
                </ShellProvider>
              </CreateEventProvider>
              </DirtyGuardProvider>
            </ConfirmProvider>
          </EventProvider>
        </AvailableProductsProvider>
      </ProductProvider>
    </OrganizationProvider>
  );
}
