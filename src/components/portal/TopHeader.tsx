'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useOrgEvents } from '@/lib/useOrgEvents';
import { useRecentActivity } from '@/lib/useRecentActivity';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import { getPortalPageLabel } from '@/lib/portalBreadcrumb';
import { Avatar } from '@/components/portal/Avatar';
import { CreateOrganizationModal } from '@/components/portal/CreateOrganizationModal';

type TopHeaderProps = {
  onOpenNav: () => void;
};

export function TopHeader({ onOpenNav }: TopHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { profile, logout } = useAuth();
  const { organization, organizations, setCurrentOrganization, addOrganization, organizationId, loading: orgLoading } = useOrganization();
  const { events } = useOrgEvents(organizationId, orgLoading);
  const { entries: activityEntries, loading: activityLoading, unreadCount, markAllRead } = useRecentActivity(organizationId, orgLoading);
  const [menuOpen, setMenuOpen] = useState(false);
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);
  const [createOrgOpen, setCreateOrgOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [eventSearch, setEventSearch] = useState('');
  const [eventSearchOpen, setEventSearchOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const pageLabel = getPortalPageLabel(pathname);

  const eventMatches = eventSearch.trim()
    ? events
        .filter((e) => {
          const q = eventSearch.trim().toLowerCase();
          return e.name.toLowerCase().includes(q) || (e.location ?? '').toLowerCase().includes(q);
        })
        .slice(0, 8)
    : [];

  const goToEvent = (id: string) => {
    router.push(`/portal/events/${id}/dashboard`);
    setEventSearch('');
    setEventSearchOpen(false);
  };

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    router.push('/auth/login');
  };

  return (
    <header className="sticky top-0 min-h-[72px] bg-surface flex flex-wrap justify-between items-center gap-y-2 px-4 sm:px-gutter py-2 z-30 border-b border-outline-variant">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenNav}
          className="lg:hidden -ml-1 flex-shrink-0 p-2 rounded-full text-on-surface-variant hover:bg-surface-container-low"
          aria-label="Open navigation menu"
        >
          <span className="material-symbols-outlined">menu</span>
        </button>
        <div className="relative sm:hidden">
          <button
            onClick={() => setOrgMenuOpen((v) => !v)}
            className="flex-shrink-0 p-2 rounded-full text-on-surface-variant hover:bg-surface-container-low"
            aria-label="Switch organisation"
          >
            <span className="material-symbols-outlined">corporate_fare</span>
          </button>
          {orgMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setOrgMenuOpen(false)} />
              <div className="absolute left-0 mt-2 w-64 max-w-[85vw] bg-white rounded-xl panel-shadow border border-outline-variant py-2 z-20 max-h-80 overflow-y-auto">
                <p className="px-4 py-1 text-xs text-on-surface-variant uppercase tracking-wider">Switch organisation</p>
                {organizations.map((org) => (
                  <button
                    key={org.id}
                    onClick={() => {
                      setCurrentOrganization(org.id);
                      setOrgMenuOpen(false);
                    }}
                    className={`w-full text-left px-4 py-2 text-sm hover:bg-surface-container-low transition-colors flex items-center justify-between gap-2 ${
                      org.id === organization?.id ? 'text-primary font-bold' : 'text-on-surface'
                    }`}
                  >
                    <span className="truncate">{org.name}</span>
                    {org.id === organization?.id && (
                      <span className="material-symbols-outlined text-base flex-shrink-0">check</span>
                    )}
                  </button>
                ))}
                <div className="border-t border-outline-variant mt-2 pt-2">
                  <button
                    onClick={() => {
                      setOrgMenuOpen(false);
                      setCreateOrgOpen(true);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-primary font-medium hover:bg-primary/5 transition-colors flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-base">add</span> New Organisation
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
        <div className="hidden sm:flex items-center gap-2 text-on-surface-variant min-w-0">
          <span className="font-label-md text-label-md truncate">Organisations</span>
          <span className="material-symbols-outlined text-sm">chevron_right</span>
          <div className="relative">
            <button
              onClick={() => setOrgMenuOpen((v) => !v)}
              className="flex items-center gap-1 font-label-md text-label-md truncate hover:text-on-surface transition-colors"
            >
              <span className="truncate">{organization?.name ?? '—'}</span>
              <span className="material-symbols-outlined text-sm">expand_more</span>
            </button>
            {orgMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setOrgMenuOpen(false)} />
                <div className="absolute left-0 mt-2 w-64 bg-white rounded-xl panel-shadow border border-outline-variant py-2 z-20 max-h-80 overflow-y-auto">
                  <p className="px-4 py-1 text-xs text-on-surface-variant uppercase tracking-wider">Switch organisation</p>
                  {organizations.map((org) => (
                    <button
                      key={org.id}
                      onClick={() => {
                        setCurrentOrganization(org.id);
                        setOrgMenuOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-surface-container-low transition-colors flex items-center justify-between gap-2 ${
                        org.id === organization?.id ? 'text-primary font-bold' : 'text-on-surface'
                      }`}
                    >
                      <span className="truncate">{org.name}</span>
                      {org.id === organization?.id && (
                        <span className="material-symbols-outlined text-base flex-shrink-0">check</span>
                      )}
                    </button>
                  ))}
                  <div className="border-t border-outline-variant mt-2 pt-2">
                    <button
                      onClick={() => {
                        setOrgMenuOpen(false);
                        setCreateOrgOpen(true);
                      }}
                      className="w-full text-left px-4 py-2 text-sm text-primary font-medium hover:bg-primary/5 transition-colors flex items-center gap-2"
                    >
                      <span className="material-symbols-outlined text-base">add</span> New Organisation
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
          <span className="material-symbols-outlined text-sm">chevron_right</span>
          <span className="font-label-md text-label-md text-primary font-bold truncate">{pageLabel}</span>
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-6">
        <div className="relative w-40 sm:w-64 hidden md:block">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-outline">
            search
          </span>
          <input
            className="w-full pl-10 pr-4 py-2 bg-surface-container-low border-none rounded-full text-label-md font-label-md focus:ring-2 focus:ring-primary/20"
            placeholder="Search experiences..."
            type="text"
            value={eventSearch}
            onChange={(e) => {
              setEventSearch(e.target.value);
              setEventSearchOpen(true);
            }}
            onFocus={() => setEventSearchOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && eventMatches.length > 0) goToEvent(eventMatches[0].id);
              if (e.key === 'Escape') setEventSearchOpen(false);
            }}
          />
          {eventSearchOpen && eventSearch.trim() && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setEventSearchOpen(false)} />
              <div className="absolute left-0 mt-2 w-full min-w-[280px] bg-white rounded-xl panel-shadow border border-outline-variant py-2 z-20 max-h-80 overflow-y-auto">
                {eventMatches.length === 0 ? (
                  <p className="px-4 py-2 text-sm text-on-surface-variant">No events match &quot;{eventSearch.trim()}&quot;.</p>
                ) : (
                  eventMatches.map((event) => (
                    <button
                      key={event.id}
                      onClick={() => goToEvent(event.id)}
                      className="w-full text-left px-4 py-2 hover:bg-surface-container-low transition-colors"
                    >
                      <p className="text-sm font-medium text-on-surface truncate">{event.name}</p>
                      {event.location && <p className="text-xs text-on-surface-variant truncate">{event.location}</p>}
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-1 sm:gap-3">
          <div className="relative md:hidden">
            <button
              onClick={() => setMobileSearchOpen((v) => !v)}
              className="w-10 h-10 flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low rounded-full transition-colors"
              aria-label="Search experiences"
            >
              <span className="material-symbols-outlined">search</span>
            </button>
            {mobileSearchOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMobileSearchOpen(false)} />
                <div className="absolute right-0 mt-2 w-72 max-w-[90vw] bg-white rounded-xl panel-shadow border border-outline-variant p-3 z-20">
                  <input
                    autoFocus
                    className="w-full px-3 py-2 bg-surface-container-low border-none rounded-full text-label-md font-label-md focus:ring-2 focus:ring-primary/20"
                    placeholder="Search experiences..."
                    type="text"
                    value={eventSearch}
                    onChange={(e) => setEventSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && eventMatches.length > 0) goToEvent(eventMatches[0].id);
                      if (e.key === 'Escape') setMobileSearchOpen(false);
                    }}
                  />
                  {eventSearch.trim() && (
                    <div className="mt-2 max-h-64 overflow-y-auto">
                      {eventMatches.length === 0 ? (
                        <p className="px-2 py-2 text-sm text-on-surface-variant">No events match &quot;{eventSearch.trim()}&quot;.</p>
                      ) : (
                        eventMatches.map((event) => (
                          <button
                            key={event.id}
                            onClick={() => { goToEvent(event.id); setMobileSearchOpen(false); }}
                            className="w-full text-left px-2 py-2 rounded-lg hover:bg-surface-container-low transition-colors"
                          >
                            <p className="text-sm font-medium text-on-surface truncate">{event.name}</p>
                            {event.location && <p className="text-xs text-on-surface-variant truncate">{event.location}</p>}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          <div className="relative">
            <button
              onClick={() => {
                const next = !notifOpen;
                setNotifOpen(next);
                if (next) markAllRead();
              }}
              className="relative w-10 h-10 flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low rounded-full transition-colors"
              aria-label="Recent activity"
            >
              <span className="material-symbols-outlined">notifications</span>
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-error rounded-full border-2 border-surface" />
              )}
            </button>
            {notifOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setNotifOpen(false)} />
                <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white rounded-xl panel-shadow border border-outline-variant py-2 z-20 max-h-96 overflow-y-auto">
                  <p className="px-4 py-1 text-xs text-on-surface-variant uppercase tracking-wider">Recent Activity</p>
                  {activityLoading ? (
                    <div className="px-4 py-6 space-y-2">
                      {[1, 2, 3].map((i) => <div key={i} className="h-8 bg-surface-container-low rounded-lg animate-pulse" />)}
                    </div>
                  ) : activityEntries.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-on-surface-variant text-center">No recent activity in this organisation yet.</p>
                  ) : (
                    activityEntries.map((entry) => (
                      <div key={entry.id} className="px-4 py-2 hover:bg-surface-container-low transition-colors">
                        <p className="text-sm text-on-surface">
                          <span className="font-medium">{entry.actorName ?? 'Someone'}</span> {entry.message}
                        </p>
                        <p className="text-xs text-on-surface-variant/70 mt-0.5">{formatRelativeTime(entry.createdAt)}</p>
                      </div>
                    ))
                  )}
                  <div className="border-t border-outline-variant mt-2 pt-2">
                    <Link
                      href="/portal/activity-log"
                      onClick={() => setNotifOpen(false)}
                      className="block px-4 py-2 text-sm text-primary font-medium hover:bg-primary/5 transition-colors"
                    >
                      View all activity
                    </Link>
                  </div>
                </div>
              </>
            )}
          </div>
          <Link
            href="/portal/settings"
            className="w-10 h-10 flex items-center justify-center text-on-surface-variant hover:bg-surface-container-low rounded-full transition-colors"
          >
            <span className="material-symbols-outlined">settings</span>
          </Link>
          <div className="h-10 w-[1.5px] bg-outline-variant mx-1 hidden sm:block" />
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 pl-2 pr-1 py-1 hover:bg-surface-container-low rounded-full transition-colors"
            >
              <Avatar name={profile?.full_name} email={profile?.email} avatarUrl={profile?.avatar_url} size={32} />
              <span className="material-symbols-outlined text-on-surface-variant">expand_more</span>
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl panel-shadow border border-outline-variant py-2 z-20">
                  <p className="px-4 py-1 text-xs text-on-surface-variant truncate">{profile?.email}</p>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2 text-sm text-on-surface hover:bg-surface-container-low"
                  >
                    Logout
                  </button>
                </div>
              </>
            )}
          </div>
          <Link
            href="/portal/events"
            className="bg-primary text-white font-label-md text-label-md px-4 sm:px-6 py-2.5 rounded-xl hover:opacity-90 active:scale-95 transition-all whitespace-nowrap"
          >
            Create
          </Link>
        </div>
      </div>

      <CreateOrganizationModal
        open={createOrgOpen}
        onClose={() => setCreateOrgOpen(false)}
        onCreated={(org) => {
          addOrganization(org);
          setCreateOrgOpen(false);
        }}
      />
    </header>
  );
}
