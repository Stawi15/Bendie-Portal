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

  // Feature 006: /portal and /portal/events now redirect to the resolved
  // product's home/events route, so "Overview"/"Events" must still highlight
  // when a /portal/bendie* or /portal/planner* route is active.
  //
  // Navigation pass (016 continuation 3) — confirmed bug fix: "Events" never
  // highlighted while actually inside an event workspace
  // (/portal/events/{id}/...), because the old check only matched the three
  // exact discovery-list routes and never fell through to a prefix check.
  // Fixed by explicitly matching the event-workspace prefix here. Every
  // other item now uses an EXACT match rather than `startsWith` — none of
  // People/Assets/Teams/Activity Log/Settings has any nested child route
  // today, so a broad prefix match could only ever produce a false positive,
  // never a legitimate parent/child relationship worth preserving.
  const isActive = (href: string) => {
    if (href === '/portal') {
      return (
        pathname === '/portal' ||
        pathname === '/portal/bendie' ||
        pathname === '/portal/planner'
      );
    }
    if (href === '/portal/events') {
      return (
        pathname === '/portal/events' ||
        pathname === '/portal/bendie/events' ||
        pathname === '/portal/planner/events' ||
        pathname.startsWith('/portal/events/')
      );
    }
    return pathname === href;
  };

  const handleLogout = async () => {
    await logout();
    router.push('/auth/login');
  };

  // Feature 016 (visual-polish pass): rounded tile/row instead of a square slab with a
  // 4px left bar. One active treatment (soft tint + accent icon/text) that reads as a
  // centred tile when collapsed and a rounded row when expanded. Geometry is unchanged:
  // nav px-3 + item px-3 keeps every icon on the rail's 36px centre line.
  // The sidebar is GLOBAL navigation, so it stays product-neutral (Portal primary),
  // never orange in Planner.
  const itemClass =
    'relative flex items-center gap-3 px-3 py-3 rounded-xl whitespace-nowrap transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary';
  const itemIdle = 'text-on-surface-variant hover:bg-on-surface/[0.05] hover:text-on-surface';

  // Feature 016 hover-expand sidebar. On hover-capable desktops (`desk`) the
  // <aside> is a fixed 72px rail in the layout; `.sidebar-panel` inside it
  // widens over the content on hover / keyboard focus (pure CSS, see
  // globals.css), so nothing here re-renders and the page never reflows.
  // Icon positions are fixed (brand px-4 + 40px logo; nav px-3 + border-l-4 +
  // pl-2 + 24px icon) so every icon sits on the rail's 36px centre line in
  // both states — only labels fade in. Below `desk` (phones, touch tablets)
  // it's the unchanged off-canvas drawer.
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 desk:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[280px] flex-shrink-0 transform transition-transform duration-200 ease-in-out
          desk:relative desk:z-40 desk:w-[72px] desk:translate-x-0 desk:transition-none
          ${open ? 'translate-x-0' : '-translate-x-full desk:translate-x-0'}`}
      >
        <div className="sidebar-panel h-full w-full bg-surface-container-lowest border-r border-outline-variant flex flex-col py-6">
          <div className="px-4 mb-8 flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/bendie.png" alt="Bendie" className="w-10 h-10 object-contain flex-shrink-0" />
            <div className="sidebar-label min-w-0 flex-1">
              <h1 className="text-on-surface font-headline-sm text-headline-sm font-bold leading-tight truncate">
                Bendie Studio
              </h1>
              <p className="text-on-surface-variant font-label-sm text-label-sm truncate" title={organization?.name ?? undefined}>
                {orgLoading ? 'Loading…' : (organization?.name ?? 'No organisation')}
              </p>
            </div>
          </div>

          <nav className="flex-1 px-3 space-y-1 overflow-y-auto overflow-x-hidden" aria-label="Portal">
            {NAV_ITEMS.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  aria-label={item.label}
                  aria-current={active ? 'page' : undefined}
                  className={`${itemClass} ${active ? 'bg-primary/10 text-primary font-semibold' : itemIdle}`}
                >
                  <span className="material-symbols-outlined flex-shrink-0" aria-hidden="true">{item.icon}</span>
                  <span className="sidebar-label font-label-sm text-label-sm">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto px-3 space-y-1">
            <a
              href="mailto:devteam@stawiexperiences.com"
              aria-label="Help"
              className={`${itemClass} ${itemIdle}`}
            >
              <span className="material-symbols-outlined flex-shrink-0" aria-hidden="true">help</span>
              <span className="sidebar-label font-label-sm text-label-sm">Help</span>
            </a>
            <button
              onClick={handleLogout}
              aria-label="Logout"
              className={`${itemClass} w-full text-left ${itemIdle}`}
            >
              <span className="material-symbols-outlined flex-shrink-0" aria-hidden="true">logout</span>
              <span className="sidebar-label font-label-sm text-label-sm">Logout</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
