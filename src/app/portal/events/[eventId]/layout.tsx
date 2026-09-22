'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEvent } from '@/contexts/EventContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { deriveEventLifecycle, EVENT_LIFECYCLE_LABELS, EVENT_LIFECYCLE_PILL_CLASSES } from '@/lib/eventLifecycle';
import { EVENT_SECTIONS, type EventSectionMeta } from '@/lib/eventSectionMeta';
import { isProductAvailableForEvent, getAvailableProducts, type ProductKey } from '@/lib/eventAuth';
import { parseEventOriginSignal, resolveEventTabProduct, resolveDefaultProduct } from '@/lib/productNavigation';

// Mirrors `TaskCapability` from `src/lib/plannerTasks.ts` — redeclared locally
// (rather than imported) since that module is `server-only` and must never be
// pulled into a client bundle, even for a type-only import.
type TaskCapability = { hasPlannerIdentity: false } | { hasPlannerIdentity: true; canView: boolean; canManage: boolean };

// Feature 009 — mirrors `VendorCapability` from `src/lib/plannerVendors.ts`,
// same `server-only` reason as `TaskCapability` above. Deliberately a
// separate, independent type/state from Tasks' own (research.md R9) — not a
// generalization of the two.
type VendorCapability = { hasPlannerIdentity: false } | { hasPlannerIdentity: true; canView: boolean; canManage: boolean };

// Feature 010 — mirrors `ChecklistCapability` from `src/lib/plannerChecklist.ts`,
// same reasoning as `VendorCapability` above — a third independent
// type/state, not a generalization of Tasks/Vendors/Checklist into one system.
type ChecklistCapability = { hasPlannerIdentity: false } | { hasPlannerIdentity: true; canView: boolean; canManage: boolean };

// Feature 011 — mirrors `PeopleCapability` from `src/lib/plannerPeople.ts`,
// same reasoning as `ChecklistCapability` above — a fourth independent
// type/state, not a generalization of Tasks/Vendors/Checklist/People.
type PeopleCapability = { hasPlannerIdentity: false } | { hasPlannerIdentity: true; canView: boolean; canManage: boolean };

// Feature 012 — mirrors `LogisticsCapability` from `src/lib/plannerLogistics.ts`,
// same reasoning as `PeopleCapability` above — a fifth independent
// type/state, not a generalization of Tasks/Vendors/Checklist/People/Logistics.
type LogisticsCapability = { hasPlannerIdentity: false } | { hasPlannerIdentity: true; canView: boolean; canManage: boolean };

// Feature 014 — mirrors `ProductionCapability` from `src/lib/plannerProduction.ts`,
// same reasoning as `LogisticsCapability` above — a sixth independent
// type/state, not a generalization of any prior module.
type ProductionCapability = { hasPlannerIdentity: false } | { hasPlannerIdentity: true; canView: boolean; canManage: boolean };

/**
 * `/code-review` M2 correction — the Tasks-capability endpoint
 * (`GET .../planner-tasks/capability`) can legitimately return three shapes,
 * not two: a resolved `{capability}`, a Planner provisioning-phase response
 * with NO `capability` field at all (`{status:'pending'|'stale'|'failed'|
 * 'unavailable'}` — a normal, expected, non-error state the Tasks page's own
 * fetch already renders a friendly message for), or a genuine failure
 * (`{status:'backend_error'}`, a non-ok HTTP status, or the fetch itself
 * throwing). The prior L1 fix's `TaskCapability | 'loading' | 'error'` had no
 * way to represent "provisioning" and collapsed it into `'error'` — which,
 * because `activeSectionUnavailable` below blocks `children` entirely, meant
 * a still-provisioning Planner event could never reach the Tasks page's own
 * correct provisioning UI. `'provisioning'` is now its own explicit state,
 * deliberately carrying no phase detail: the Tasks page's own fetch (to the
 * full collection route, which returns the same phase vocabulary) already
 * owns rendering the specific pending/stale/failed/unavailable message — this
 * layout only needs to know "not ready, but not broken" so it can step aside
 * and let `children` render instead of showing its own generic block.
 */
type PlannerTaskCapabilityState =
  | { status: 'loading' }
  | { status: 'ready'; capability: TaskCapability }
  | { status: 'provisioning' }
  | { status: 'error' };

// Feature 009 — the identical shape as `PlannerTaskCapabilityState` above, for
// the identical reason (`/code-review` M2's three-shape distinction), but a
// wholly separate state machine — Vendors' capability can never be read from
// or written to Tasks' state, and vice versa (research.md R9: a deliberate
// parallel addition, not a generalization of the two).
type PlannerVendorCapabilityState =
  | { status: 'loading' }
  | { status: 'ready'; capability: VendorCapability }
  | { status: 'provisioning' }
  | { status: 'error' };

// Feature 010 — identical shape to `PlannerVendorCapabilityState`, a third
// wholly independent state machine (research.md R9's precedent, applied
// again: a parallel addition, not a generalization).
type PlannerChecklistCapabilityState =
  | { status: 'loading' }
  | { status: 'ready'; capability: ChecklistCapability }
  | { status: 'provisioning' }
  | { status: 'error' };

// Feature 011 — identical shape to `PlannerChecklistCapabilityState`, a
// fourth wholly independent state machine (research.md R9's precedent,
// applied again: a parallel addition, not a generalization).
type PlannerPeopleCapabilityState =
  | { status: 'loading' }
  | { status: 'ready'; capability: PeopleCapability }
  | { status: 'provisioning' }
  | { status: 'error' };

// Feature 012 — identical shape, a fifth wholly independent state machine.
type PlannerLogisticsCapabilityState =
  | { status: 'loading' }
  | { status: 'ready'; capability: LogisticsCapability }
  | { status: 'provisioning' }
  | { status: 'error' };

// Feature 014 — identical shape, a sixth wholly independent state machine.
type PlannerProductionCapabilityState =
  | { status: 'loading' }
  | { status: 'ready'; capability: ProductionCapability }
  | { status: 'provisioning' }
  | { status: 'error' };

export default function EventLayout({ children }: { children: React.ReactNode }) {
  const { eventId } = useParams<{ eventId: string }>();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { currentEvent, loading, canAccessWorkspace, workspaceAccessChecked, setCurrentEvent, clearCurrentEvent } = useEvent();
  const { organizationId } = useOrganization();
  const navRef = useRef<HTMLElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  // Navigation pass (016 continuation 3) — §19: the group-pill row needs the
  // same horizontal-scroll affordance as the child-tab row on narrow
  // screens, not just an overflow that silently runs off-screen. A second,
  // independent ref/state pair (matching this file's established
  // "duplicate rather than generalize across sibling UI" convention) rather
  // than parameterizing the existing tab-scroll logic.
  const groupNavRef = useRef<HTMLDivElement>(null);
  const [canScrollGroupLeft, setCanScrollGroupLeft] = useState(false);
  const [canScrollGroupRight, setCanScrollGroupRight] = useState(false);
  // Which products (per EVENT_SECTIONS' classification) are actually available for
  // this event -- Feature 003: navigation filtering is UX, this is the same data
  // source direct-route access below is gated on, never route names or nav state.
  const [productAvailability, setProductAvailability] = useState<Partial<Record<ProductKey, boolean>>>({});
  const [productAvailabilityChecked, setProductAvailabilityChecked] = useState(false);
  // Feature 007 — permission-aware Tasks-tab visibility. Resolved via a
  // dedicated, lightweight capability endpoint (never fetches tasks) so
  // tab-visibility never over-fetches. Access-gating (product entitlement)
  // already lives in `productAvailability` above -- this is the ADDITIONAL,
  // per-caller check Tasks alone needs on top of that.
  //
  // `/code-review` L1/M2 corrections — see `PlannerTaskCapabilityState` above.
  const [plannerTaskCapability, setPlannerTaskCapability] = useState<PlannerTaskCapabilityState>({ status: 'loading' });
  // Feature 009 — permission-aware Vendors-tab visibility. Independent of
  // `plannerTaskCapability` above: its own state, its own fetch, its own
  // gating branches below (research.md R9).
  const [plannerVendorCapability, setPlannerVendorCapability] = useState<PlannerVendorCapabilityState>({ status: 'loading' });
  // Feature 010 — independent of both Tasks' and Vendors' own capability state.
  const [plannerChecklistCapability, setPlannerChecklistCapability] = useState<PlannerChecklistCapabilityState>({ status: 'loading' });
  // Feature 011 — independent of Tasks'/Vendors'/Checklist's own capability state.
  const [plannerPeopleCapability, setPlannerPeopleCapability] = useState<PlannerPeopleCapabilityState>({ status: 'loading' });
  // Feature 012 — independent of Tasks'/Vendors'/Checklist's/People's own capability state.
  const [plannerLogisticsCapability, setPlannerLogisticsCapability] = useState<PlannerLogisticsCapabilityState>({ status: 'loading' });
  // Feature 014 — independent of every other module's own capability state.
  const [plannerProductionCapability, setPlannerProductionCapability] = useState<PlannerProductionCapabilityState>({ status: 'loading' });
  // Feature 006 (FR-034): the explicit product-origin signal a product-aware
  // discovery surface attaches to its entry link. Any value other than
  // 'bendie'/'planner' collapses to undefined -- identical to "absent/legacy".
  const originSignal = useMemo(() => parseEventOriginSignal(searchParams), [searchParams]);
  // Feature 006 (FR-054, hardened per /speckit.analyze finding L1): true for
  // the brief window between recognizing an organization switch and the
  // router.replace() below actually completing. While true, render the
  // existing loading skeleton instead of evaluating workspaceAuthDenied, so a
  // deliberate organization switch never flashes a misleading "no access"
  // message for an event that simply belongs to the organization being left.
  const [orgSwitchRedirecting, setOrgSwitchRedirecting] = useState(false);
  const prevOrgIdRef = useRef<string | null>(null);
  const orgSwitchGenerationRef = useRef(0);

  useEffect(() => {
    if (eventId) setCurrentEvent(eventId);
  }, [eventId, setCurrentEvent]);

  // Ends explicit-event-route intent when the user leaves this route
  // (Feature 003 corrective pass, R2-F3) -- lets EventContext's loadEvents()
  // resume normal auto-select behavior for non-event-scoped pages and future
  // organization switches, instead of staying permanently disabled after the
  // first event visit for the rest of the session.
  useEffect(() => {
    return () => {
      clearCurrentEvent();
    };
  }, [clearCurrentEvent]);

  useEffect(() => {
    let cancelled = false;
    setProductAvailabilityChecked(false);
    setPlannerTaskCapability({ status: 'loading' });
    setPlannerVendorCapability({ status: 'loading' });
    setPlannerChecklistCapability({ status: 'loading' });
    setPlannerPeopleCapability({ status: 'loading' });
    setPlannerLogisticsCapability({ status: 'loading' });
    setPlannerProductionCapability({ status: 'loading' });
    if (!currentEvent || !organizationId) return;

    const productKeys = Array.from(new Set(EVENT_SECTIONS.map((s) => s.product).filter((p): p is ProductKey => p !== 'shared')));
    Promise.all(productKeys.map((key) => isProductAvailableForEvent(currentEvent.id, organizationId, key))).then((results) => {
      if (cancelled) return;
      const next: Partial<Record<ProductKey, boolean>> = {};
      productKeys.forEach((key, i) => {
        next[key] = results[i];
      });
      setProductAvailability(next);
      setProductAvailabilityChecked(true);

      // Feature 007 — only fetch task capability once Planner is confirmed
      // available for this event; reuses the same `cancelled` closure-flag
      // stale-response guard as the product-availability fetch above, rather
      // than inventing a second mechanism.
      if (next.planner === true) {
        fetch(`/api/events/${currentEvent.id}/planner-tasks/capability`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (cancelled) return;
            // `/code-review` M2 — three genuinely distinct response shapes:
            // (1) a resolved `{capability}` -> 'ready'; (2) a legitimate
            // Planner provisioning-phase response with no `capability` field
            // at all (`status: 'pending'|'stale'|'failed'|'unavailable'`) --
            // NOT an error, just "not ready yet"; (3) everything else (no
            // response at all, or the endpoint's own `status:'backend_error'`)
            // is a genuine failure. Provisioning must never be reported as
            // 'error' -- doing so blocks `children` from ever rendering the
            // Tasks page's own correct, friendlier provisioning message.
            if (data?.capability) {
              setPlannerTaskCapability({ status: 'ready', capability: data.capability });
            } else if (data?.status && data.status !== 'backend_error') {
              setPlannerTaskCapability({ status: 'provisioning' });
            } else {
              setPlannerTaskCapability({ status: 'error' });
            }
          })
          .catch((err) => {
            if (cancelled) return;
            console.error('EventLayout: planner-tasks capability fetch failed', err);
            setPlannerTaskCapability({ status: 'error' });
          });
      }

      // Feature 009 — Vendors' own capability fetch, gated identically to
      // Tasks' (Planner confirmed available for this event), but entirely
      // independent of it: a separate request, a separate state setter,
      // never sharing or influencing Tasks' own `plannerTaskCapability`.
      if (next.planner === true) {
        fetch(`/api/events/${currentEvent.id}/planner-vendors/capability`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (cancelled) return;
            if (data?.capability) {
              setPlannerVendorCapability({ status: 'ready', capability: data.capability });
            } else if (data?.status && data.status !== 'backend_error') {
              setPlannerVendorCapability({ status: 'provisioning' });
            } else {
              setPlannerVendorCapability({ status: 'error' });
            }
          })
          .catch((err) => {
            if (cancelled) return;
            console.error('EventLayout: planner-vendors capability fetch failed', err);
            setPlannerVendorCapability({ status: 'error' });
          });
      }

      // Feature 010 — Checklist's own capability fetch, gated identically,
      // entirely independent of Tasks' and Vendors' own fetches/state.
      if (next.planner === true) {
        fetch(`/api/events/${currentEvent.id}/planner-checklist/capability`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (cancelled) return;
            if (data?.capability) {
              setPlannerChecklistCapability({ status: 'ready', capability: data.capability });
            } else if (data?.status && data.status !== 'backend_error') {
              setPlannerChecklistCapability({ status: 'provisioning' });
            } else {
              setPlannerChecklistCapability({ status: 'error' });
            }
          })
          .catch((err) => {
            if (cancelled) return;
            console.error('EventLayout: planner-checklist capability fetch failed', err);
            setPlannerChecklistCapability({ status: 'error' });
          });
      }

      // Feature 011 — People's own capability fetch, gated identically,
      // entirely independent of Tasks'/Vendors'/Checklist's own fetches/state.
      if (next.planner === true) {
        fetch(`/api/events/${currentEvent.id}/planner-people/capability`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (cancelled) return;
            if (data?.capability) {
              setPlannerPeopleCapability({ status: 'ready', capability: data.capability });
            } else if (data?.status && data.status !== 'backend_error') {
              setPlannerPeopleCapability({ status: 'provisioning' });
            } else {
              setPlannerPeopleCapability({ status: 'error' });
            }
          })
          .catch((err) => {
            if (cancelled) return;
            console.error('EventLayout: planner-people capability fetch failed', err);
            setPlannerPeopleCapability({ status: 'error' });
          });
      }

      // Feature 012 — Logistics' own capability fetch, gated identically,
      // entirely independent of every other module's own fetches/state.
      if (next.planner === true) {
        fetch(`/api/events/${currentEvent.id}/planner-logistics/capability`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (cancelled) return;
            if (data?.capability) {
              setPlannerLogisticsCapability({ status: 'ready', capability: data.capability });
            } else if (data?.status && data.status !== 'backend_error') {
              setPlannerLogisticsCapability({ status: 'provisioning' });
            } else {
              setPlannerLogisticsCapability({ status: 'error' });
            }
          })
          .catch((err) => {
            if (cancelled) return;
            console.error('EventLayout: planner-logistics capability fetch failed', err);
            setPlannerLogisticsCapability({ status: 'error' });
          });
      }

      // Feature 014 — Production's own capability fetch, gated identically,
      // entirely independent of every other module's own fetches/state.
      if (next.planner === true) {
        fetch(`/api/events/${currentEvent.id}/planner-production/capability`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => {
            if (cancelled) return;
            if (data?.capability) {
              setPlannerProductionCapability({ status: 'ready', capability: data.capability });
            } else if (data?.status && data.status !== 'backend_error') {
              setPlannerProductionCapability({ status: 'provisioning' });
            } else {
              setPlannerProductionCapability({ status: 'error' });
            }
          })
          .catch((err) => {
            if (cancelled) return;
            console.error('EventLayout: planner-production capability fetch failed', err);
            setPlannerProductionCapability({ status: 'error' });
          });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [currentEvent, organizationId]);

  const isSectionAvailable = useCallback(
    (section: EventSectionMeta) => {
      if (section.key === 'planner-tasks') {
        // 'loading'/'provisioning'/'error' all correctly fall through to
        // `false` here (tab hidden -- acceptable per `/code-review` M2 for
        // the nav item itself) -- 'loading' is separately kept out of the
        // generic "unavailable" block by `plannerTaskCapabilityPending`
        // below, and 'provisioning'/'error' are separately kept out of it by
        // `plannerTasksDeferToPage` below, so hiding the tab here never
        // prevents direct navigation from reaching the Tasks page's own
        // correct state for either case. Neither 'provisioning' nor 'error'
        // is ever treated as a capability answer (`/code-review` L1/M2/H2
        // class of correction).
        return (
          plannerTaskCapability.status === 'ready' &&
          plannerTaskCapability.capability.hasPlannerIdentity === true &&
          plannerTaskCapability.capability.canView === true
        );
      }
      if (section.key === 'planner-vendors') {
        // Feature 009 — identical shape to the `planner-tasks` branch above,
        // added alongside it rather than merging the two (research.md R9).
        return (
          plannerVendorCapability.status === 'ready' &&
          plannerVendorCapability.capability.hasPlannerIdentity === true &&
          plannerVendorCapability.capability.canView === true
        );
      }
      if (section.key === 'planner-checklist') {
        // Feature 010 — identical shape again, a third independent branch.
        return (
          plannerChecklistCapability.status === 'ready' &&
          plannerChecklistCapability.capability.hasPlannerIdentity === true &&
          plannerChecklistCapability.capability.canView === true
        );
      }
      if (section.key === 'planner-people') {
        // Feature 011 — identical shape again, a fourth independent branch.
        return (
          plannerPeopleCapability.status === 'ready' &&
          plannerPeopleCapability.capability.hasPlannerIdentity === true &&
          plannerPeopleCapability.capability.canView === true
        );
      }
      if (section.key === 'planner-logistics') {
        // Feature 012 — identical shape again, a fifth independent branch.
        return (
          plannerLogisticsCapability.status === 'ready' &&
          plannerLogisticsCapability.capability.hasPlannerIdentity === true &&
          plannerLogisticsCapability.capability.canView === true
        );
      }
      if (section.key === 'planner-production') {
        // Feature 014 — identical shape again, a sixth independent branch.
        return (
          plannerProductionCapability.status === 'ready' &&
          plannerProductionCapability.capability.hasPlannerIdentity === true &&
          plannerProductionCapability.capability.canView === true
        );
      }
      return section.product === 'shared' || productAvailability[section.product] === true;
    },
    [productAvailability, plannerTaskCapability, plannerVendorCapability, plannerChecklistCapability, plannerPeopleCapability, plannerLogisticsCapability, plannerProductionCapability]
  );

  const activeSectionKey = pathname.startsWith(`/portal/events/${eventId}/`) ? pathname.slice(`/portal/events/${eventId}/`.length).split('/')[0] : null;
  const activeSection = useMemo(() => EVENT_SECTIONS.find((s) => s.key === activeSectionKey), [activeSectionKey]);
  const visibleSections = useMemo(() => EVENT_SECTIONS.filter(isSectionAvailable), [isSectionAvailable]);

  // Corrective fix (Feature 016 continuation, navigation-stability
  // investigation) — the confirmed root cause of Logistics/Production
  // (and, less visibly, any other Planner sub-module) intermittently
  // appearing/disappearing between navigations: `visibleSections` is
  // recomputed on every render straight from `isSectionAvailable`, which
  // returns `false` for a Planner sub-module for as long as ITS OWN
  // capability fetch is still `'loading'` — and the six sub-module
  // capability fetches (Tasks/Vendors/Checklist/People/Logistics/
  // Production) all start concurrently but resolve independently, at
  // whatever speed each individual request happens to complete. Whichever
  // hasn't resolved yet at the moment of a given render is transiently
  // excluded from the tab bar, while its siblings that happened to resolve
  // faster are already shown — this is the exact "Participants and
  // Production visible, Logistics missing" symptom, a real race, not
  // user-, capability-, or product-config-dependent at all. `undefined`
  // (still loading) was being treated as `false` (denied) for navigation
  // purposes, exactly the anti-pattern flagged for this investigation.
  // Fix: track whether every relevant Planner sub-module capability has
  // left `'loading'` (settled to ready/provisioning/error) before trusting
  // `visibleSections` for the NAV BAR specifically — while unsettled, the
  // group-pill/tab rows render a stable skeleton instead of a partially-
  // computed, flicker-prone section list. This is deliberately narrower
  // than `productAuthPending` (which already correctly gates the CONTENT
  // pane on the ACTIVE tab's own capability) — this new flag additionally
  // covers the tab bar's need to know about every OTHER module's
  // visibility, not just the active one.
  const plannerCapabilitiesSettled =
    productAvailability.planner !== true ||
    (plannerTaskCapability.status !== 'loading' &&
      plannerVendorCapability.status !== 'loading' &&
      plannerChecklistCapability.status !== 'loading' &&
      plannerPeopleCapability.status !== 'loading' &&
      plannerLogisticsCapability.status !== 'loading' &&
      plannerProductionCapability.status !== 'loading');
  const navSettled = productAvailabilityChecked && plannerCapabilitiesSettled;

  // Portal UX pass (016) — group the tab strip instead of one flat 20+-tab
  // row (context/portal-ux-current-state-audit.md §17, "navigation
  // friction"). Purely a display grouping over the same `visibleSections`
  // array; no route, href, or availability logic changes. Group order
  // follows first appearance in EVENT_SECTIONS (Bendie groups, then Planner
  // groups, since Planner tabs are declared after Bendie ones there).
  const groupedVisibleSections = useMemo(() => {
    const order: string[] = [];
    const byGroup = new Map<string, EventSectionMeta[]>();
    for (const section of visibleSections) {
      if (!byGroup.has(section.group)) {
        byGroup.set(section.group, []);
        order.push(section.group);
      }
      byGroup.get(section.group)!.push(section);
    }
    return order.map((group) => ({ group, sections: byGroup.get(group)! }));
  }, [visibleSections]);

  // Navigation pass (016 continuation 3) — confirmed bug fix: the group pill
  // used to be independent React state, so clicking "Logistics" changed
  // which child tabs were LISTED without navigating anywhere — the page
  // content stayed on whatever section was previously routed to. Per the
  // brief's §9 ("prefer route-derived state over duplicated React state"),
  // there is no `selectedGroup` state at all anymore: the active group is
  // purely derived from the current route (`activeSection`), so it can never
  // disagree with what's actually on screen, and it automatically follows
  // deep links and browser Back/Forward for free (both just change
  // `pathname`, which `activeSection` already reacts to).
  const currentGroupKey = activeSection?.group ?? groupedVisibleSections[0]?.group;
  const tabsToShow = groupedVisibleSections.find((g) => g.group === currentGroupKey)?.sections ?? visibleSections;

  // Feature 005 — deterministic Planner-only default landing, generalized by
  // Feature 006 into the full Both-event and mismatched-origin contract
  // (FR-035-FR-039). Two independent rules, keyed on the same
  // product-availability state every other section already uses:
  //
  // 1. Both-event explicit-origin steering (FR-035/036/037): a Both event's
  //    Bendie entry tab is `dashboard`; if the user arrived with an explicit
  //    `?product=planner` origin signal, steer to `planner-overview` instead.
  //    No signal (or `?product=bendie`) preserves the exact legacy Feature 005
  //    default (stay on `dashboard`).
  // 2. Mismatched-origin/direct-URL safety net (FR-038/039): whenever the
  //    active tab's classified product is UNAVAILABLE for this event while the
  //    OTHER classified product IS available, land on that other product's
  //    entry tab instead of showing a fake "unavailable" block. This subsumes
  //    Feature 005's original one-directional case (dashboard unavailable +
  //    planner available -> planner-overview) as one instance of the general
  //    rule, and adds the symmetric case (planner-overview unavailable +
  //    bendie available -> dashboard) Feature 005 never needed.
  //
  // Both rules run strictly AFTER the workspaceAuthPending/workspaceAuthDenied
  // gates below have already resolved the render (FR-039/FR-058) — a
  // product-origin signal or mismatch can change WHICH valid tab an
  // authorized user lands on, but never reveals or grants access to a user
  // who fails that gate; the denial render is keyed on workspaceAuthDenied
  // alone; regardless of which sub-route this effect targets.
  //
  // Loop-safety (both rules): each redirects only toward a tab that is, by
  // construction, available for this event, so neither condition can match
  // again after its own redirect completes.
  useEffect(() => {
    if (!productAvailabilityChecked) return;

    const isBothEvent = productAvailability.bendie === true && productAvailability.planner === true;
    if (isBothEvent && activeSectionKey === 'dashboard' && originSignal === 'planner') {
      router.replace(`/portal/events/${eventId}/planner-overview?product=planner`);
      return;
    }

    // Defense-in-depth hardening (Feature 016 continuation, Planner
    // Participants navigation-stability investigation): a section whose own,
    // module-specific capability check has already confirmed real access
    // (`isSectionAvailable`, which independently re-verifies against the
    // server for every Planner sub-module — Tasks/Vendors/Checklist/People/
    // Logistics/Production) must never be redirected away from merely
    // because the coarser, event-level `productAvailability` snapshot
    // disagrees at this particular render. The per-module check is strictly
    // more precise (it re-derives availability from the live capability
    // endpoint, including provisioning/link state); this guard makes it
    // categorically impossible for a transient disagreement between the two
    // signals to bounce a legitimately-authorized user out of a tab they can
    // actually use — closing the whole class of "sometimes redirects to
    // Overview" bugs this investigation was asked to fix, independent of
    // pinning down one single exact trigger.
    if (activeSection && isSectionAvailable(activeSection)) {
      // fall through to the no-signal backfill below, never to a mismatch redirect
    } else if (activeSection && activeSection.product !== 'shared' && productAvailability[activeSection.product] !== true) {
      const otherProduct: ProductKey = activeSection.product === 'bendie' ? 'planner' : 'bendie';
      if (productAvailability[otherProduct] === true) {
        const entryTab = otherProduct === 'planner' ? 'planner-overview' : 'dashboard';
        router.replace(`/portal/events/${eventId}/${entryTab}?product=${otherProduct}`);
      }
      return;
    }

    // Origin-signal normalization, corrected 2026-09-17 (manual-recheck
    // regression): a legacy/direct link with NO `?product=` at all lands
    // correctly on this tab (no mismatch above), but leaves nothing for a
    // later non-entry tab (e.g. Members) to inherit. Backfill the query
    // param onto the current URL ONLY when the CURRENT tab is a genuine
    // product ENTRY point (`dashboard`/`planner-overview` — see
    // `resolveEventTabProduct`) — never by reading `activeSection.product`
    // directly, which is Feature 003's access-gating classification, not a
    // display signal (nearly every non-entry tab is classified `'bendie'`
    // there regardless of which product experience it's actually reached
    // from). For any other signal-less tab, there is no safe evidence to
    // invent a product from, so none is backfilled — the existing,
    // documented legacy/no-signal behavior applies instead. Never fires when
    // a signal is already present, so it cannot fight the deliberate-switch
    // or mismatch effects above, and cannot loop (once backfilled, this
    // condition is false on the next render).
    if (!originSignal) {
      const entryProduct = resolveEventTabProduct(activeSectionKey ?? undefined, undefined);
      if (entryProduct) {
        router.replace(`/portal/events/${eventId}/${activeSectionKey}?product=${entryProduct}`);
      }
    }
  }, [activeSectionKey, activeSection, productAvailability, productAvailabilityChecked, originSignal, eventId, router, isSectionAvailable]);

  // Corrected 2026-09-17 (manual-recheck regression): the product every
  // internal tab link should carry. ONLY `dashboard`/`planner-overview`
  // self-determine (see `resolveEventTabProduct`) — every other tab (e.g.
  // Members), regardless of its EVENT_SECTIONS.product access-gating
  // classification, inherits whatever origin signal is already on the
  // CURRENT url (set either by the normalization above, a deliberate-switch/
  // mismatch redirect, or the link that brought the user here). Display-only,
  // never a second stored product value.
  const effectiveTabProduct: ProductKey | undefined = resolveEventTabProduct(activeSectionKey ?? undefined, originSignal);

  // Feature 006 (FR-054): organization switch while this event workspace is
  // mounted must exit the old event and land on the new organization's
  // resolved product home, never leaving the previous organization's event
  // displayed as current. Guarded by its own generation ref so a rapid
  // double organization-switch cannot resolve out of order; additive to (never
  // a replacement for) EventContext's own checkWorkspaceAccess re-verification,
  // which still independently denies the old event against the new
  // organization if this redirect were ever somehow bypassed.
  //
  // Deliberately calls `getAvailableProducts` directly rather than reading
  // the shared `AvailableProductsProvider` context (/code-review finding
  // F4's fix elsewhere): that context's own state update, triggered by this
  // same organizationId change, lags one render behind by construction (its
  // `useEffect` schedules a state update rather than resolving synchronously
  // within this commit) — reading it here could act on the PREVIOUS
  // organization's still-`'ready'` entitlement for one cycle. A fresh,
  // independently generation-guarded fetch for exactly the new
  // `organizationId` avoids that stale-data race; the extra one-off read
  // during this specific, infrequent transition is a deliberately accepted
  // trade-off, not an oversight.
  useEffect(() => {
    const isRealSwitch = prevOrgIdRef.current !== null && organizationId !== null && organizationId !== prevOrgIdRef.current;
    prevOrgIdRef.current = organizationId;
    if (!isRealSwitch || !organizationId) return;

    const generation = ++orgSwitchGenerationRef.current;
    setOrgSwitchRedirecting(true);

    getAvailableProducts(organizationId)
      .then((available) => {
        if (orgSwitchGenerationRef.current !== generation) return;
        const resolved = resolveDefaultProduct(available);
        router.replace(resolved ? `/portal/${resolved}` : '/portal/no-product');
      })
      .catch((err) => {
        if (orgSwitchGenerationRef.current !== generation) return;
        console.error('EventLayout: org-switch product resolution failed', err);
        // Fail open to the existing auth flow rather than leaving the user
        // stuck on the loading skeleton forever — checkWorkspaceAccess will
        // still correctly deny the old event against the new organization.
        setOrgSwitchRedirecting(false);
      });
  }, [organizationId, router]);

  const updateScrollState = useCallback(() => {
    const el = navRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  // Re-check on mount/resize, and whenever the tab count could change the
  // overflow — including a group-pill switch (016), which changes how many
  // tabs `tabsToShow` renders without changing `updateScrollState` itself.
  useEffect(() => {
    updateScrollState();
    const el = navRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollState);
    window.addEventListener('resize', updateScrollState);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      window.removeEventListener('resize', updateScrollState);
    };
  }, [updateScrollState, tabsToShow]);

  const updateGroupScrollState = useCallback(() => {
    const el = groupNavRef.current;
    if (!el) return;
    setCanScrollGroupLeft(el.scrollLeft > 4);
    setCanScrollGroupRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateGroupScrollState();
    const el = groupNavRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateGroupScrollState);
    window.addEventListener('resize', updateGroupScrollState);
    return () => {
      el.removeEventListener('scroll', updateGroupScrollState);
      window.removeEventListener('resize', updateGroupScrollState);
    };
  }, [updateGroupScrollState, groupedVisibleSections]);

  // Keep the active tab visible when navigating directly to one that's
  // scrolled out of view (e.g. deep-linking to a tab near the end).
  useEffect(() => {
    navRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    groupNavRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  }, [pathname]);

  const scrollTabs = (amount: number) => navRef.current?.scrollBy({ left: amount, behavior: 'smooth' });
  const scrollGroups = (amount: number) => groupNavRef.current?.scrollBy({ left: amount, behavior: 'smooth' });

  const currentTabIndex = visibleSections.findIndex((tab) => pathname === `/portal/events/${eventId}/${tab.key}`);
  const nextTab = currentTabIndex >= 0 && currentTabIndex < visibleSections.length - 1 ? visibleSections[currentTabIndex + 1] : null;

  // --- Authorization state machine (Feature 003 / F-R1 correction) ---
  // A successful `currentEvent` fetch never implies workspace access -- org
  // admins can see event metadata without event_members. Correction from an
  // independent post-implementation review: the original version of this
  // guard only rendered the forbidden state once `workspaceAccessChecked`
  // became true, but fell through to render `children` (and the product
  // pane) for every render BEFORE that -- i.e. while the check was still
  // pending, protected content mounted and could fire its own queries. Fail
  // closed instead: nothing protected renders until the check has actually
  // resolved. RLS remains defense in depth underneath this, not the primary
  // mechanism.
  const workspaceAuthPending = !workspaceAccessChecked || orgSwitchRedirecting;
  const workspaceAuthDenied = workspaceAccessChecked && !canAccessWorkspace && !orgSwitchRedirecting;
  // The active tab's product-availability check is a separate async resolve;
  // 'shared' tabs have nothing to wait for.
  // `/code-review` L1 — the Tasks-specific capability fetch is a separate,
  // chained request that only starts once `productAvailabilityChecked` is
  // already true (see the effect above), so there is a real window where
  // product availability is resolved but capability is not yet. Only wait for
  // it when Planner IS available for this event (otherwise there is nothing
  // to wait for -- a Bendie-only event never even starts the capability
  // fetch, and must resolve straight to "unavailable", not hang pending
  // forever). Scoped strictly to `planner-tasks`; every other section's
  // pending/unavailable logic is unchanged.
  const plannerTaskCapabilityPending =
    activeSection?.key === 'planner-tasks' && productAvailability.planner === true && plannerTaskCapability.status === 'loading';
  // Feature 009 — identical shape to the Tasks pending/defer flags above,
  // scoped strictly to `planner-vendors`; Tasks' own flags are untouched.
  const plannerVendorCapabilityPending =
    activeSection?.key === 'planner-vendors' && productAvailability.planner === true && plannerVendorCapability.status === 'loading';
  // Feature 010 — identical shape, scoped strictly to `planner-checklist`.
  const plannerChecklistCapabilityPending =
    activeSection?.key === 'planner-checklist' && productAvailability.planner === true && plannerChecklistCapability.status === 'loading';
  // Feature 011 — identical shape, scoped strictly to `planner-people`.
  const plannerPeopleCapabilityPending =
    activeSection?.key === 'planner-people' && productAvailability.planner === true && plannerPeopleCapability.status === 'loading';
  // Feature 012 — identical shape, scoped strictly to `planner-logistics`.
  const plannerLogisticsCapabilityPending =
    activeSection?.key === 'planner-logistics' && productAvailability.planner === true && plannerLogisticsCapability.status === 'loading';
  // Feature 014 — identical shape, scoped strictly to `planner-production`.
  const plannerProductionCapabilityPending =
    activeSection?.key === 'planner-production' && productAvailability.planner === true && plannerProductionCapability.status === 'loading';
  const productAuthPending =
    !!activeSection &&
    activeSection.product !== 'shared' &&
    (!productAvailabilityChecked ||
      plannerTaskCapabilityPending ||
      plannerVendorCapabilityPending ||
      plannerChecklistCapabilityPending ||
      plannerPeopleCapabilityPending ||
      plannerLogisticsCapabilityPending ||
      plannerProductionCapabilityPending);
  // `/code-review` M2 — a Planner event that is legitimately still
  // provisioning (or a genuine capability-endpoint failure) must NOT trigger
  // this layout's generic "not available" block, because that block replaces
  // `children` entirely (see the render below) -- it would make the Tasks
  // page's own correct provisioning/error UI permanently unreachable via
  // direct navigation. Defer to the page in both cases: its own fetch (to the
  // full collection route, which returns the identical phase vocabulary)
  // independently re-verifies everything server-side and renders the right
  // state itself. Scoped strictly to `planner-tasks`; every other section's
  // unavailable logic is unchanged.
  const plannerTasksDeferToPage =
    activeSection?.key === 'planner-tasks' && (plannerTaskCapability.status === 'provisioning' || plannerTaskCapability.status === 'error');
  // Feature 009 — identical shape to `plannerTasksDeferToPage`, scoped
  // strictly to `planner-vendors`.
  const plannerVendorsDeferToPage =
    activeSection?.key === 'planner-vendors' && (plannerVendorCapability.status === 'provisioning' || plannerVendorCapability.status === 'error');
  // Feature 010 — identical shape, scoped strictly to `planner-checklist`.
  const plannerChecklistDeferToPage =
    activeSection?.key === 'planner-checklist' && (plannerChecklistCapability.status === 'provisioning' || plannerChecklistCapability.status === 'error');
  // Feature 011 — identical shape, scoped strictly to `planner-people`.
  const plannerPeopleDeferToPage =
    activeSection?.key === 'planner-people' && (plannerPeopleCapability.status === 'provisioning' || plannerPeopleCapability.status === 'error');
  // Feature 012 — identical shape, scoped strictly to `planner-logistics`.
  const plannerLogisticsDeferToPage =
    activeSection?.key === 'planner-logistics' && (plannerLogisticsCapability.status === 'provisioning' || plannerLogisticsCapability.status === 'error');
  // Feature 014 — identical shape, scoped strictly to `planner-production`.
  const plannerProductionDeferToPage =
    activeSection?.key === 'planner-production' && (plannerProductionCapability.status === 'provisioning' || plannerProductionCapability.status === 'error');
  const activeSectionUnavailable =
    !!activeSection &&
    productAvailabilityChecked &&
    !plannerTaskCapabilityPending &&
    !plannerTasksDeferToPage &&
    !plannerVendorCapabilityPending &&
    !plannerVendorsDeferToPage &&
    !plannerChecklistCapabilityPending &&
    !plannerChecklistDeferToPage &&
    !plannerPeopleCapabilityPending &&
    !plannerPeopleDeferToPage &&
    !plannerLogisticsCapabilityPending &&
    !plannerLogisticsDeferToPage &&
    !plannerProductionCapabilityPending &&
    !plannerProductionDeferToPage &&
    !isSectionAvailable(activeSection);

  if (workspaceAuthPending) {
    return (
      <div className="flex flex-col h-full" aria-busy="true">
        <div className="h-8 w-40 bg-surface-container-low rounded-lg animate-pulse mb-4" />
        <div className="flex-1 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-surface-container-low rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (workspaceAuthDenied) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4">
        <span className="material-symbols-outlined text-5xl text-on-surface-variant mb-3">lock</span>
        <h1 className="font-headline-sm text-headline-sm text-on-surface mb-1">You don&apos;t have access to this event</h1>
        <p className="text-body-md font-body-md text-on-surface-variant max-w-sm">
          You can see this event in your organisation&apos;s event list, but entering it requires being added as an event member.
        </p>
        <Link href="/portal/events" className="btn-secondary mt-4">
          Back to Events
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Static header — a sibling of the scroll area below, never inside it, so nothing can ever scroll behind or through it. */}
      <div className="flex-shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
          <div className="min-w-0">
            <Link
              href="/portal/events"
              className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-primary mb-1 w-fit"
            >
              <span className="material-symbols-outlined text-sm">arrow_back</span> All Events
            </Link>
            <h1 className="font-headline-lg text-headline-lg text-on-surface truncate">
              {loading ? 'Loading…' : (currentEvent?.name ?? 'Event')}
            </h1>
          </div>
          {currentEvent && (
            <span
              className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider flex-shrink-0 ${
                EVENT_LIFECYCLE_PILL_CLASSES[deriveEventLifecycle(currentEvent)]
              }`}
            >
              {EVENT_LIFECYCLE_LABELS[deriveEventLifecycle(currentEvent)]}
            </span>
          )}
        </div>
        {!navSettled ? (
          // Stable placeholder while Planner sub-module capabilities are
          // still resolving — never a partially-computed, flicker-prone tab
          // bar (see the `plannerCapabilitiesSettled` doc comment above).
          <div className="flex items-center gap-1.5 pb-2" aria-busy="true">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-6 w-20 bg-surface-container-low rounded-full animate-pulse" />
            ))}
          </div>
        ) : (
        <>
        {groupedVisibleSections.length > 1 && (
          <div className="relative flex items-center gap-1">
            {canScrollGroupLeft && (
              <button
                type="button"
                onClick={() => scrollGroups(-160)}
                className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors"
                aria-label="Scroll groups left"
              >
                <span className="material-symbols-outlined text-[16px]">chevron_left</span>
              </button>
            )}
            <div ref={groupNavRef} className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-2 -mb-px flex-1 min-w-0">
              {groupedVisibleSections.map(({ group, sections }, index) => {
                const isPlannerGroup = sections[0].product === 'planner';
                // §11 — a subtle divider (not a loud visual break) exactly
                // where the group row transitions from Bendie to Planner
                // areas, only ever rendered once, only on a Both event.
                const previousWasBendie = index > 0 && groupedVisibleSections[index - 1].sections[0].product !== 'planner';
                const isActive = group === currentGroupKey;
                // "Overview" is the one group that legitimately merges a
                // Bendie section (`dashboard`) and a Planner section
                // (`planner-overview`) under a single pill on a Both event
                // (per §11's own group list, which lists Overview once, not
                // twice) — every other group is single-product already.
                // Corrective fix (Feature 016 continuation) — a real, live
                // bug found while tracing the Participants-page navigation
                // report: for a single-product group (e.g. "Participants",
                // containing only the 'planner'-classified planner-people
                // section), the OLD code still built the href's `?product=`
                // from `effectiveTabProduct` (the CURRENTLY active tab's
                // product) rather than the target group's own product — so
                // clicking "Participants" while on a Bendie tab produced
                // `planner-people?product=bendie`, a self-contradictory
                // signal (right page, wrong product context) that made
                // TopHeader's product switcher display the wrong active
                // product immediately after navigating. A mixed-product
                // group (only Overview) still prefers whichever section
                // matches the current product context, exactly as before;
                // every other, single-product group now always targets its
                // own product, regardless of where the click originated.
                const isMixedProductGroup = sections.some((s) => s.product !== sections[0].product);
                const firstSection = isMixedProductGroup ? (sections.find((s) => s.product === effectiveTabProduct) ?? sections[0]) : sections[0];
                const targetProduct = isMixedProductGroup ? effectiveTabProduct : firstSection.product !== 'shared' ? firstSection.product : effectiveTabProduct;
                const basePath = `/portal/events/${eventId}/${firstSection.key}`;
                const href = targetProduct ? `${basePath}?product=${targetProduct}` : basePath;
                return (
                  <span key={group} className="flex items-center gap-1.5 flex-shrink-0">
                    {isPlannerGroup && previousWasBendie && <span className="w-px h-4 bg-outline-variant mx-0.5" aria-hidden="true" />}
                    <Link
                      href={href}
                      data-active={isActive}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-wide transition-colors whitespace-nowrap ${
                        isActive
                          ? isPlannerGroup
                            ? 'bg-orange-100 text-orange-700'
                            : 'bg-primary/10 text-primary'
                          : isPlannerGroup
                            ? 'bg-orange-50/70 text-orange-700/80 hover:bg-orange-50'
                            : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      {group}
                    </Link>
                  </span>
                );
              })}
            </div>
            {canScrollGroupRight && (
              <button
                type="button"
                onClick={() => scrollGroups(160)}
                className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors"
                aria-label="Scroll groups right"
              >
                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              </button>
            )}
          </div>
        )}
        <div className="relative flex items-center gap-1 border-b border-outline-variant">
          {canScrollLeft && (
            <button
              type="button"
              onClick={() => scrollTabs(-240)}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors"
              aria-label="Scroll tabs left"
            >
              <span className="material-symbols-outlined text-[20px]">chevron_left</span>
            </button>
          )}
          <nav ref={navRef} className="flex gap-6 overflow-x-auto custom-scrollbar flex-1 min-w-0">
            {tabsToShow.map((tab) => {
              const basePath = `/portal/events/${eventId}/${tab.key}`;
              // Propagate whatever product context this workspace is
              // currently operating in onto every internal tab link
              // (/code-review finding F5) — so a 'shared' tab reached from
              // either product retains the correct breadcrumb, and so does
              // whichever tab is reached next from there.
              const href = effectiveTabProduct ? `${basePath}?product=${effectiveTabProduct}` : basePath;
              const active = pathname === basePath;
              return (
                <Link
                  key={tab.key}
                  href={href}
                  data-active={active}
                  className={`flex-shrink-0 px-2 pb-3 pt-1 -mb-px text-label-sm font-label-sm border-b-2 rounded-t-md transition-colors whitespace-nowrap ${
                    active
                      ? 'border-primary text-primary font-bold bg-primary/5'
                      : 'border-transparent text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low/60'
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
          {canScrollRight && (
            <button
              type="button"
              onClick={() => scrollTabs(240)}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors"
              aria-label="Scroll tabs right"
            >
              <span className="material-symbols-outlined text-[20px]">chevron_right</span>
            </button>
          )}
        </div>
        </>
        )}
      </div>

      {/* The only thing that scrolls — sized to fill the rest of the event shell (see Portal App Shell in ui-registry.md). */}
      <div className="flex-1 min-h-0 min-w-0 overflow-y-auto custom-scrollbar pt-lg">
        {productAuthPending ? (
          <div className="space-y-3" aria-busy="true">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-surface-container-low rounded-xl animate-pulse" />
            ))}
          </div>
        ) : activeSectionUnavailable ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant mb-3">block</span>
            <h2 className="font-headline-sm text-headline-sm text-on-surface mb-1">This isn&apos;t available for this event</h2>
            <p className="text-body-md font-body-md text-on-surface-variant max-w-sm">
              This section belongs to a product that isn&apos;t currently active for this event&apos;s organisation.
            </p>
          </div>
        ) : (
          children
        )}
      </div>

      {/* §17 — the Dashboard already has its own "Recommended next" callout
          for the same purpose; showing this floating control there too would
          be two different controls both telling the user what to do next. */}
      {nextTab && activeSectionKey !== 'dashboard' && (
        <div className="fixed bottom-6 right-6 z-30">
          <Link
            href={
              effectiveTabProduct
                ? `/portal/events/${eventId}/${nextTab.key}?product=${effectiveTabProduct}`
                : `/portal/events/${eventId}/${nextTab.key}`
            }
            className="btn-primary shadow-lg flex items-center gap-2"
          >
            Next: {nextTab.label} <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
          </Link>
        </div>
      )}
    </div>
  );
}
