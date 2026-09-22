'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Toaster } from 'react-hot-toast';
import { EventProvider } from '@/contexts/EventContext';
import { OrganizationProvider } from '@/contexts/OrganizationContext';
import { ProductProvider } from '@/contexts/ProductContext';
import { AvailableProductsProvider } from '@/contexts/AvailableProductsContext';
import { ConfirmProvider } from '@/contexts/ConfirmContext';
import { OrgSideNav } from '@/components/portal/OrgSideNav';
import { TopHeader } from '@/components/portal/TopHeader';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
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
              <div className="h-screen overflow-hidden bg-background lg:flex">
                <OrgSideNav open={navOpen} onClose={() => setNavOpen(false)} />

                <div className="flex flex-col h-full min-w-0 lg:flex-1">
                  {/* TopHeader reads useSearchParams() (breadcrumb origin-signal fallback,
                      /code-review finding F5) — Next.js requires a Suspense boundary around
                      any such usage so it doesn't force every otherwise-static portal page
                      into full dynamic rendering during `next build`. */}
                  <Suspense fallback={null}>
                    <TopHeader onOpenNav={() => setNavOpen(true)} />
                  </Suspense>
                  <main className="flex-1 min-w-0 overflow-y-auto custom-scrollbar p-4 sm:p-gutter">{children}</main>
                </div>

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
              </div>
            </ConfirmProvider>
          </EventProvider>
        </AvailableProductsProvider>
      </ProductProvider>
    </OrganizationProvider>
  );
}
