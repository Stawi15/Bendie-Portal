'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useEvent } from '@/contexts/EventContext';
import { useProduct } from '@/contexts/ProductContext';
import { useProductEntitlement } from '@/contexts/AvailableProductsContext';
import { useOrgEvents } from '@/lib/useOrgEvents';
import { useRecentActivity } from '@/lib/useRecentActivity';
import { isProductAvailableForEvent } from '@/lib/eventAuth';
import { resolveProductSwitchDestination, parseEventOriginSignal, resolveEventTabProduct, type ProductKey } from '@/lib/productNavigation';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import { Avatar } from '@/components/portal/Avatar';
import { CreateOrganizationModal } from '@/components/portal/CreateOrganizationModal';

const PRODUCT_LABEL: Record<ProductKey, string> = { bendie: 'Bendie', planner: 'Bendie Planner' };

type TopHeaderProps = {
  onOpenNav: () => void;
};

export function TopHeader({ onOpenNav }: TopHeaderProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { profile, isGlobalAdmin, logout } = useAuth();
  const { organization, organizations, setCurrentOrganization, addOrganization, organizationId, loading: orgLoading } = useOrganization();
  const { events } = useOrgEvents(organizationId, orgLoading);
  const { entries: activityEntries, loading: activityLoading, unreadCount, markAllRead } = useRecentActivity(organizationId, orgLoading);
  const { product: currentProduct } = useProduct();
  // /code-review findings F3/F4: reads the ONE shared entitlement load
  // (AvailableProductsProvider) instead of independently re-fetching
  // organization_products — no second read, and the switcher correctly
  // offers nothing while that shared state is still 'loading'/'error'.
  const entitlement = useProductEntitlement();
  const availableProducts = entitlement.status === 'ready' ? entitlement.available : { bendie: false, planner: false };
  const { currentEventId } = useEvent();
  const [menuOpen, setMenuOpen] = useState(false);
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);
  const [productMenuOpen, setProductMenuOpen] = useState(false);
  const [createOrgOpen, setCreateOrgOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [eventSearch, setEventSearch] = useState('');
  const [eventSearchOpen, setEventSearchOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  // Feature 006: which product-switch location the current route represents.
  // 'shared' covers every non-product-scoped, non-event-workspace route
  // (People/Assets/Teams/Activity Log/Settings, and /portal itself pre-redirect).
  const switchLocation = pathname.startsWith('/portal/events/')
    ? 'event-workspace'
    : pathname.endsWith('/events')
      ? 'product-events'
      : currentProduct
        ? 'product-home'
        : 'shared';

  const handleProductSwitch = async (targetProduct: ProductKey) => {
    setProductMenuOpen(false);
    if (switchLocation === 'event-workspace' && currentEventId && organizationId) {
      // Deliberate in-event switch (FR-052/FR-053) — distinct from the
      // mismatched-origin redirect in EventLayout (FR-038/FR-039). A single
      // click-time check of the CURRENT event's membership for the TARGET
      // product only, via the existing helper EventLayout itself already
      // calls per-product in its own effect (no EventContext expansion, no
      // second product-membership data source — see research.md Q9's
      // corrected decision, post-/speckit.analyze finding H1).
      const eventSupportsTargetProduct = await isProductAvailableForEvent(currentEventId, organizationId, targetProduct);
      router.push(
        resolveProductSwitchDestination({
          location: 'event-workspace',
          targetProduct,
          eventId: currentEventId,
          eventSupportsTargetProduct,
        })
      );
      return;
    }
    router.push(resolveProductSwitchDestination({ location: switchLocation, targetProduct }));
  };

  // Breadcrumb-display product (manual-acceptance corrective fix, 2026-09-17;
  // extended for /code-review finding F5; corrected again 2026-09-17 after a
  // manual-recheck regression).
  // `ProductContext.product` is `null` on an event-workspace route by design
  // (the URL genuinely isn't under a product namespace there) — it remains
  // the sole AUTHORITY for routing/authorization, unchanged. For DISPLAY only,
  // this now uses the single structural rule in `resolveEventTabProduct`:
  // ONLY `dashboard`/`planner-overview` self-determine their product; every
  // other event tab (regardless of its EVENT_SECTIONS.product ACCESS-GATING
  // classification — most non-entry tabs are classified `'bendie'` there for
  // reasons unrelated to display) preserves the event's `?product=` origin
  // signal instead. Reading `EVENT_SECTIONS.product` directly as though it
  // meant "which product is the user currently in" was the bug: it silently
  // overwrote a correctly-preserved Planner origin the moment a
  // `'bendie'`-classified-but-not-actually-entry tab (e.g. Members) was
  // opened. "Choose product" is reserved for the case where no product is
  // resolvable at all (e.g. a shared ORGANIZATION page with no product
  // context).
  const eventOriginSignal = useMemo(() => parseEventOriginSignal(searchParams), [searchParams]);
  const activeEventTabKey = switchLocation === 'event-workspace' ? pathname.split('/')[4] : undefined;
  const breadcrumbProduct: ProductKey | null =
    currentProduct ?? resolveEventTabProduct(activeEventTabKey, eventOriginSignal) ?? null;

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

        {/*
          Navigation pass (016 continuation 4) — approved header redesign.
          Replaces the "Organisations > Org > Product > Page" breadcrumb
          entirely: no arrows, no repeated product name, no event name (that
          stays owned by EventLayout, §5 of the earlier pass). Two context
          controls instead — an organisation selector and a product
          segmented control — each collapsing to a plain, non-interactive
          label when there is genuinely nothing to switch to, rather than
          presenting a dropdown/segmented control with only one real choice.
        */}
        {/*
          Corrective fix (Feature 016 continuation, org-selector width): the
          prior `max-w-[360px]`-only fix was insufficient — a `max-width`
          alone still lets the flex algorithm shrink the button (and, via it,
          the `truncate` text span) below that ceiling whenever it's forced
          to reconcile with its siblings' combined width, since nothing here
          previously guaranteed a FLOOR. An explicit `min-width` (a
          comfortable ~240px, room for most real organisation names) plus a
          higher `max-width` (~400px) gives the control a genuine
          shrink-resistant band instead of just a cap, and the text span is
          now an explicit `flex-1 min-w-0` flex child so it grows to fill
          that band and only truncates once content genuinely exceeds it —
          the textbook-correct pairing `truncate` needs inside a flex row
          (a `truncate` span with no `min-w-0` can silently fail to shrink
          predictably in exactly this kind of nested-flex layout).
        */}
        <div className="relative flex-shrink-0 min-w-0">
          {organizations.length > 1 ? (
            <button
              onClick={() => setOrgMenuOpen((v) => !v)}
              className="flex items-center gap-2 pl-3 pr-2 py-2 rounded-xl border border-outline-variant bg-white hover:bg-surface-container-low transition-colors w-full min-w-[240px] max-w-[400px]"
              aria-label="Switch organisation"
            >
              <span className="material-symbols-outlined text-[18px] text-on-surface-variant flex-shrink-0">corporate_fare</span>
              <span className="font-label-md text-label-md text-on-surface truncate flex-1 min-w-0 text-left">{organization?.name ?? '—'}</span>
              <span className="material-symbols-outlined text-[18px] text-on-surface-variant flex-shrink-0">expand_more</span>
            </button>
          ) : (
            <div className="flex items-center gap-2 pl-3 pr-3 py-2 rounded-xl bg-surface-container-low min-w-[240px] max-w-[400px]" title="Your organisation">
              <span className="material-symbols-outlined text-[18px] text-on-surface-variant flex-shrink-0">corporate_fare</span>
              <span className="font-label-md text-label-md text-on-surface truncate flex-1 min-w-0">{organization?.name ?? '—'}</span>
            </div>
          )}
          {orgMenuOpen && organizations.length > 1 && (
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
                {isGlobalAdmin && (
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
                )}
              </div>
            </>
          )}
        </div>

        {/* Only a global admin can see this control at all (isGlobalAdmin),
            matching what's already server-side-enforced by the
            organizations_insert_creator RLS policy (platform-admin-only) —
            live-verified this pass, see plan.md's org-security-audit section. */}
        {isGlobalAdmin && organizations.length <= 1 && (
          <button
            onClick={() => setCreateOrgOpen(true)}
            className="hidden sm:flex items-center gap-1 flex-shrink-0 text-sm text-primary font-medium hover:opacity-80 transition-opacity"
          >
            <span className="material-symbols-outlined text-[18px]">add</span> New Organisation
          </button>
        )}

        {(availableProducts.bendie || availableProducts.planner) && (
          <>
            <span className="h-6 w-px bg-outline-variant flex-shrink-0 hidden sm:block" aria-hidden="true" />
            {availableProducts.bendie && availableProducts.planner ? (
              <div className="hidden sm:flex items-center bg-surface-container-low rounded-xl p-1 flex-shrink-0">
                {(['bendie', 'planner'] as const).map((key) => (
                  <button
                    key={key}
                    onClick={() => handleProductSwitch(key)}
                    className={`px-3 py-1.5 rounded-lg text-label-sm font-label-sm transition-colors whitespace-nowrap ${
                      key === breadcrumbProduct ? 'bg-white text-primary panel-shadow font-bold' : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    {PRODUCT_LABEL[key]}
                  </button>
                ))}
              </div>
            ) : (
              <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0 text-label-sm font-label-sm text-on-surface-variant">
                <span className="material-symbols-outlined text-[16px]">
                  {availableProducts.bendie ? 'celebration' : 'event_note'}
                </span>
                {availableProducts.bendie ? PRODUCT_LABEL.bendie : PRODUCT_LABEL.planner}
              </div>
            )}

            {/* Narrow-screen fallback (§22) — a compact icon-triggered dropdown, never breadcrumb arrows, and only rendered at all when there's a real choice to make. */}
            {availableProducts.bendie && availableProducts.planner && (
              <div className="relative sm:hidden">
                <button
                  onClick={() => setProductMenuOpen((v) => !v)}
                  className="flex-shrink-0 p-2 rounded-full text-on-surface-variant hover:bg-surface-container-low"
                  aria-label="Switch product"
                >
                  <span className="material-symbols-outlined">apps</span>
                </button>
                {productMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setProductMenuOpen(false)} />
                    <div className="absolute left-0 mt-2 w-56 max-w-[85vw] bg-white rounded-xl panel-shadow border border-outline-variant py-2 z-20">
                      <p className="px-4 py-1 text-xs text-on-surface-variant uppercase tracking-wider">Switch product</p>
                      {(['bendie', 'planner'] as const).map((key) => (
                        <button
                          key={key}
                          onClick={() => handleProductSwitch(key)}
                          className={`w-full text-left px-4 py-2 text-sm hover:bg-surface-container-low transition-colors flex items-center justify-between gap-2 ${
                            key === breadcrumbProduct ? 'text-primary font-bold' : 'text-on-surface'
                          }`}
                        >
                          <span className="truncate">{PRODUCT_LABEL[key]}</span>
                          {key === breadcrumbProduct && (
                            <span className="material-symbols-outlined text-base flex-shrink-0">check</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}

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
