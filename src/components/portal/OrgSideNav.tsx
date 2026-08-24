'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';

const NAV_ITEMS = [
  { label: 'Overview', href: '/portal', icon: 'dashboard' },
  { label: 'Events', href: '/portal/events', icon: 'event' },
  { label: 'People', href: '/portal/people', icon: 'group' },
  { label: 'Assets', href: '/portal/assets', icon: 'inventory_2' },
  { label: 'Teams', href: '/portal/teams', icon: 'groups' },
  { label: 'Activity Log', href: '/portal/activity-log', icon: 'history' },
  { label: 'Settings', href: '/portal/settings', icon: 'settings' },
];

type OrgSideNavProps = {
  open: boolean;
  onClose: () => void;
};

export function OrgSideNav({ open, onClose }: OrgSideNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const { organization, loading: orgLoading } = useOrganization();

  const isActive = (href: string) => (href === '/portal' ? pathname === href : pathname.startsWith(href));

  const handleLogout = async () => {
    await logout();
    router.push('/auth/login');
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[280px] flex-shrink-0 bg-surface-container-lowest border-r border-outline-variant flex flex-col py-6 transform transition-transform duration-200 ease-in-out
          lg:static lg:translate-x-0
          ${open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        <div className="px-6 mb-8 flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/bendie.png" alt="Bendie" className="w-10 h-10 object-contain flex-shrink-0" />
          <div className="min-w-0">
            <h1 className="text-on-surface font-headline-sm text-headline-sm font-bold leading-tight truncate">
              Bendie Studio
            </h1>
            <p className="text-on-surface-variant font-label-sm text-label-sm truncate">
              {orgLoading ? 'Loading…' : (organization?.name ?? 'No organisation')}
            </p>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={`flex items-center gap-3 px-4 py-3 transition-all duration-200 ${
                  active
                    ? 'text-primary border-l-4 border-primary bg-primary/10 font-bold'
                    : 'text-on-surface-variant hover:bg-surface-container-low border-l-4 border-transparent'
                }`}
              >
                <span className="material-symbols-outlined">{item.icon}</span>
                <span className="font-label-sm text-label-sm">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto px-4 space-y-1">
          <a
            href="mailto:devteam@stawiexperiences.com"
            className="flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:bg-surface-container-low transition-colors rounded-lg"
          >
            <span className="material-symbols-outlined">help</span>
            <span className="font-label-sm text-label-sm">Help</span>
          </a>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-on-surface-variant hover:bg-surface-container-low transition-colors rounded-lg text-left"
          >
            <span className="material-symbols-outlined">logout</span>
            <span className="font-label-sm text-label-sm">Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}
