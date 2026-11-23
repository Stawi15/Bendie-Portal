'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HeaderOrgSwitcher, HeaderProductSwitcher } from '@/components/header/HeaderParts';
import { useShellHeaderModel } from '@/components/shell/AppShell';
import { HELP_HREF, isOrgNavActive } from '@/lib/orgNav';

/*
 * Feature 030 — Studio 2.0 organisation sidebar (IA doc 17): Home, Events,
 * People (+ Teams), Library, Activity; Settings and Help in the footer. The
 * organisation and product switchers (same components and behaviour as the
 * current header) sit in its header. Same routes and active rules as v1.
 */

type Item = { label: string; href: string; icon: string; children?: Item[] };

const ITEMS: Item[] = [
  { label: 'Home', href: '/portal', icon: 'home' },
  { label: 'Events', href: '/portal/events', icon: 'event' },
  {
    label: 'People',
    href: '/portal/people',
    icon: 'group',
    children: [{ label: 'Teams', href: '/portal/teams', icon: 'groups' }],
  },
  { label: 'Library', href: '/portal/assets', icon: 'inventory_2' },
  { label: 'Activity', href: '/portal/activity-log', icon: 'history' },
];

const FOOTER: Item[] = [{ label: 'Settings', href: '/portal/settings', icon: 'settings' }];

export const SHELL_ITEM =
  'relative flex items-center gap-3 h-control-touch shellwide:h-row-compact shellrail:h-row-compact px-3 rounded-ui-md whitespace-nowrap text-sm transition-colors duration-motion-fast';
export const SHELL_ITEM_IDLE =
  'text-on-surface-variant hover:bg-on-surface/[0.05] hover:text-on-surface';
export const SHELL_ITEM_ACTIVE = 'bg-primary/10 text-primary font-semibold';

function NavLink({ item, active, nested }: { item: Item; active: boolean; nested?: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      title={item.label}
      className={`${SHELL_ITEM} ${nested ? 'shell-expanded-only pl-11' : ''} ${active ? SHELL_ITEM_ACTIVE : SHELL_ITEM_IDLE}`}
    >
      {!nested && (
        <span className="material-symbols-outlined text-[20px] flex-shrink-0" aria-hidden="true">
          {item.icon}
        </span>
      )}
      <span className="shell-label truncate">{item.label}</span>
    </Link>
  );
}

export function OrgSidebar() {
  const pathname = usePathname();
  const m = useShellHeaderModel();
  return (
    <>
      {/* The header's vertical separator (a direct child) has no meaning in a stacked sidebar. */}
      <div className="shell-expanded-only flex-shrink-0 p-3 space-y-2 border-b border-outline-variant [&>*]:max-w-full [&>.w-px]:!hidden">
        <HeaderOrgSwitcher m={m} />
        <HeaderProductSwitcher m={m} />
      </div>
      <nav
        aria-label="Organisation"
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar p-3 space-y-0.5"
      >
        {ITEMS.map((item) => (
          <div key={item.href} className="space-y-0.5">
            <NavLink item={item} active={isOrgNavActive(pathname, item.href)} />
            {item.children?.map((child) => (
              <NavLink
                key={child.href}
                item={child}
                nested
                active={isOrgNavActive(pathname, child.href)}
              />
            ))}
          </div>
        ))}
      </nav>
      <div className="flex-shrink-0 p-3 space-y-0.5 border-t border-outline-variant">
        {FOOTER.map((item) => (
          <NavLink key={item.href} item={item} active={isOrgNavActive(pathname, item.href)} />
        ))}
        <a href={HELP_HREF} title="Help" className={`${SHELL_ITEM} ${SHELL_ITEM_IDLE}`}>
          <span className="material-symbols-outlined text-[20px] flex-shrink-0" aria-hidden="true">
            help
          </span>
          <span className="shell-label truncate">Help</span>
        </a>
      </div>
    </>
  );
}
