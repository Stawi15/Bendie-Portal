'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { usePathname, useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEvent } from '@/contexts/EventContext';
import { useOrganization } from '@/contexts/OrganizationContext';
import { useAuth } from '@/contexts/AuthContext';
import { EVENT_SECTIONS, OVERVIEW_GROUP, type EventSectionMeta } from '@/lib/eventSectionMeta';
import { isSectionShownByModules, type ModuleProduct } from '@/lib/eventModules';
import { useProductEntitlement } from '@/contexts/AvailableProductsContext';
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

/**
 * Feature 030 — the event workspace's logic, moved VERBATIM from
 * `src/app/portal/events/[eventId]/layout.tsx` (no behaviour change): workspace
 * access, product availability, the six Planner capability states,
 * `isSectionAvailable`, redirects, the journey and Manage modules. It is the
 * single place these are decided (constitution v2.0.0, Principle II); both the
 * current layout (EventWorkspaceV1) and the Studio 2.0 shell (EventWorkspaceV2)
 * render from its return value. Never re-implement availability elsewhere.
 */
export function useEventWorkspace() {
  const { eventId } = useParams<{ eventId: string }>();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { currentEvent, loading, canAccessWorkspace, workspaceAccessChecked, setCurrentEvent, clearCurrentEvent, patchCurrentEvent } = useEvent();
  // Feature 016 — "Manage modules" (display preference only; see ManageModulesModal).
  const [manageModulesOpen, setManageModulesOpen] = useState(false);
  const { organizationId } = useOrganization();
  const { isGlobalAdmin } = useAuth();
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

  // Feature 016 (performance pass): product availability + Planner capabilities
  // depend only on WHICH event this is. Keying on the id (not the `currentEvent`
  // object) stops an in-place update of the same event — Manage modules' patch,
  // a refreshEvent — from flipping the nav to its skeleton and re-running 2 +
  // (formerly 6) authorization requests.
  const eventIdForEffect = currentEvent?.id ?? null;
  useEffect(() => {
    let cancelled = false;
    setProductAvailabilityChecked(false);
    setPlannerTaskCapability({ status: 'loading' });
    setPlannerVendorCapability({ status: 'loading' });
    setPlannerChecklistCapability({ status: 'loading' });
    setPlannerPeopleCapability({ status: 'loading' });
    setPlannerLogisticsCapability({ status: 'loading' });
    setPlannerProductionCapability({ status: 'loading' });
    if (!eventIdForEffect || !organizationId) return;

    const productKeys = Array.from(new Set(EVENT_SECTIONS.map((s) => s.product).filter((p): p is ProductKey => p !== 'shared')));
    Promise.all(productKeys.map((key) => isProductAvailableForEvent(eventIdForEffect, organizationId, key))).then((results) => {
      if (cancelled) return;
      const next: Partial<Record<ProductKey, boolean>> = {};
      productKeys.forEach((key, i) => {
        next[key] = results[i];
      });
      setProductAvailability(next);
      setProductAvailabilityChecked(true);

      // Feature 016 (performance pass): ONE request for all six Planner module
      // capabilities (/planner-capabilities runs the shared ~10-round-trip
      // authorization chain once instead of six times). Each module still gets
      // its own independent state with the exact same three-way mapping as the
      // old per-module fetches (Feature 007 `/code-review` M2):
      //   capability → 'ready'; a non-error status (pending/stale/failed/
      //   unavailable — provisioning, not an error) → 'provisioning';
      //   no response / backend_error → 'error'.
      if (next.planner === true) {
        type ModulePayload = { capability?: unknown; status?: string };
        const setters = {
          tasks: setPlannerTaskCapability,
          vendors: setPlannerVendorCapability,
          checklist: setPlannerChecklistCapability,
          people: setPlannerPeopleCapability,
          logistics: setPlannerLogisticsCapability,
          production: setPlannerProductionCapability,
        } as const;
        const apply = (key: keyof typeof setters, payload: ModulePayload | null) => {
          const set = setters[key] as (value: { status: 'ready'; capability: unknown } | { status: 'provisioning' } | { status: 'error' }) => void;
          if (payload?.capability) set({ status: 'ready', capability: payload.capability });
          else if (payload?.status && payload.status !== 'backend_error') set({ status: 'provisioning' });
          else set({ status: 'error' });
        };
        fetch(`/api/events/${eventIdForEffect}/planner-capabilities`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data: { modules?: Record<string, ModulePayload>; status?: string } | null) => {
            if (cancelled) return;
            (Object.keys(setters) as (keyof typeof setters)[]).forEach((key) => {
              // Whole-event phase (e.g. still provisioning) applies to every module,
              // exactly as each old per-module route returned the same status.
              apply(key, data?.modules ? (data.modules[key] ?? null) : data?.status ? { status: data.status } : null);
            });
          })
          .catch((err) => {
            if (cancelled) return;
            console.error('EventLayout: planner capabilities fetch failed', err);
            (Object.keys(setters) as (keyof typeof setters)[]).forEach((key) => apply(key, null));
          });
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the event ID on purpose (see above)
  }, [eventIdForEffect, organizationId]);

  const isSectionAvailable = useCallback(
    (section: EventSectionMeta) => {
      // Feature 017 (FR-030): the Bendie Planner integration page is a Stawi
      // (platform admin) tool — its page denies everyone else, so don't list it
      // for them (it was a Planner-only event's whole "Operations" area).
      if (section.key === 'bendie-planner') return isGlobalAdmin;
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
      if (section.key === 'planner-production' || section.key === 'planner-agenda') {
        // Feature 014 — identical shape again, a sixth independent branch.
        // Feature 018 — the Planner Agenda shares Production's permission (spec clarification).
        return (
          plannerProductionCapability.status === 'ready' &&
          plannerProductionCapability.capability.hasPlannerIdentity === true &&
          plannerProductionCapability.capability.canView === true
        );
      }
      return section.product === 'shared' || productAvailability[section.product] === true;
    },
    [isGlobalAdmin, productAvailability, plannerTaskCapability, plannerVendorCapability, plannerChecklistCapability, plannerPeopleCapability, plannerLogisticsCapability, plannerProductionCapability]
  );

  const activeSectionKey = pathname.startsWith(`/portal/events/${eventId}/`) ? pathname.slice(`/portal/events/${eventId}/`.length).split('/')[0] : null;
  const activeSection = useMemo(() => EVENT_SECTIONS.find((s) => s.key === activeSectionKey), [activeSectionKey]);
  // Feature 022: the organisation's product states (shared provider, no extra read). A tab whose
  // product is paused shows the paused notice instead of being redirected away.
  const entitlement = useProductEntitlement();
  const pausedActiveProduct: ProductKey | null =
    activeSection && activeSection.product !== 'shared' && entitlement.status === 'ready' && entitlement.states[activeSection.product] === 'paused'
      ? activeSection.product
      : null;
  // Feature 016 — setup-module preference (events.portal_setup_modules). DISPLAY
  // ONLY, layered after the access check: it can only hide an otherwise-available
  // tab from the bar, never make one available, and never blocks the route itself
  // (a hidden module's URL still works — and stays in the bar while you're on it).
  // NULL (every event created before this feature) → everything shows, as before.
  const selectedModules = currentEvent?.id === eventId ? (currentEvent.portal_setup_modules ?? null) : null;
  const selectedModulesKey = selectedModules ? selectedModules.join(',') : null;
  // Products this event actually has (already resolved for the tab bar — no new request).
  const moduleProducts: ModuleProduct[] = productAvailabilityChecked
    ? (['bendie', 'planner'] as const).filter((p) => productAvailability[p] === true)
    : [];
  const visibleSections = useMemo(
    () =>
      EVENT_SECTIONS.filter(isSectionAvailable).filter(
        (s) => s.key === activeSectionKey || isSectionShownByModules(s.key, selectedModulesKey === null ? null : selectedModulesKey.split(','))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- selectedModulesKey is the stable-by-value form of selectedModules
    [isSectionAvailable, selectedModulesKey, activeSectionKey]
  );

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
    const groups = order.map((group) => ({ group, sections: byGroup.get(group)! }));
    // Feature 016 (navigation hierarchy pass): the Overview hub always leads, and an
    // area made only of 'shared' utility pages (on a Planner-only event, Operations =
    // just the Bendie Planner link panel) goes last — previously it was declared first
    // and put "Operations" ahead of "Overview" and at the start of the Planner journey.
    // Otherwise first-appearance order is unchanged (sort is stable).
    const rank = (g: { group: string; sections: EventSectionMeta[] }) =>
      g.group === OVERVIEW_GROUP ? 0 : g.sections.every((s) => s.product === 'shared') ? 2 : 1;
    return groups.sort((a, b) => rank(a) - rank(b));
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
      if (pausedActiveProduct) return; // Feature 022: show the paused notice, don't redirect
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
  }, [activeSectionKey, activeSection, productAvailability, productAvailabilityChecked, originSignal, eventId, router, isSectionAvailable, pausedActiveProduct]);

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
    groupNavRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
  }, [pathname]);

  const scrollGroups = (amount: number) => groupNavRef.current?.scrollBy({ left: amount, behavior: 'smooth' });

  // Feature 016 (navigation hierarchy pass) — ONE canonical journey, derived
  // from the same `groupedVisibleSections` the area row and the area stepper
  // render, so top nav, numbered steps and Previous/Next can never disagree.
  // `groupedVisibleSections` already reflects product availability, per-module
  // Planner capability (permissions) and the event's module selection — pages
  // the user can't access or didn't choose are never counted or named. The
  // Overview hub (Dashboard / Planner Overview) is not a setup step, so it's
  // excluded from the sequence. Everything is route-derived (`activeSectionKey`
  // from `pathname`), never separate selected-tab state, and costs no requests.
  // (The old Next followed flat EVENT_SECTIONS order, which put Planner Overview
  // after Operations on Both events — out of step with the area row.)
  const journey = useMemo(
    () => groupedVisibleSections.filter((g) => g.group !== OVERVIEW_GROUP).flatMap((g) => g.sections),
    [groupedVisibleSections]
  );
  const journeyIndex = journey.findIndex((s) => s.key === activeSectionKey);
  const previousStep = journeyIndex > 0 ? journey[journeyIndex - 1] : null;
  const nextStep =
    activeSection?.group === OVERVIEW_GROUP
      ? // From an Overview hub, start that product's journey. The Dashboard keeps
        // its own "Recommended next" callout instead (§17 — never two "what's next" controls).
        activeSectionKey === 'dashboard'
        ? null
        : (journey.find((s) => s.product === activeSection.product) ?? null)
      : journeyIndex >= 0 && journeyIndex < journey.length - 1
        ? journey[journeyIndex + 1]
        : null;

  const currentGroup = groupedVisibleSections.find((g) => g.group === currentGroupKey);
  const groupSteps = currentGroup?.sections ?? [];
  const groupStepIndex = groupSteps.findIndex((s) => s.key === activeSectionKey);
  // Numbered steps only where they mean something: a non-Overview area with 2+ visible pages.
  const isSteppedGroup = !!currentGroup && currentGroup.group !== OVERVIEW_GROUP && groupSteps.length > 1 && groupStepIndex >= 0;

  // Same product-signal rule the area links use (corrective fix, Participants
  // investigation): single-product pages carry their own product, 'shared' ones
  // inherit the current context — so crossing Bendie → Planner via Next never
  // produces a self-contradictory `?product=`.
  const sectionHref = (section: EventSectionMeta) => {
    const product = section.product === 'shared' ? effectiveTabProduct : section.product;
    const base = `/portal/events/${eventId}/${section.key}`;
    return product ? `${base}?product=${product}` : base;
  };
  // Name the area only when crossing into a different one ("Content — News"),
  // and not when the area and page share a name ("Participants").
  const journeyLabel = (section: EventSectionMeta) =>
    section.group !== activeSection?.group && section.group !== section.label ? `${section.group} — ${section.label}` : section.label;

  // Feature 016 (product environment identity): which product's accent an AREA wears.
  // Single-product areas wear their own product; mixed (Overview) and shared-only
  // areas follow the CURRENT view context (the route's product signal) — so on a
  // Both event, Planner Overview reads orange in Planner context, not blue.
  const areaProductFor = (sections: EventSectionMeta[]): ProductKey => {
    const mixedOrShared = sections.some((s) => s.product !== sections[0].product) || sections[0].product === 'shared';
    if (mixedOrShared) return effectiveTabProduct ?? (activeSection?.product === 'planner' ? 'planner' : 'bendie');
    return sections[0].product === 'planner' ? 'planner' : 'bendie';
  };

  // Area link target — unchanged logic from the previous pill row (Participants
  // corrective fix): mixed-product Overview prefers the current product's page;
  // every single-product area targets its own product.
  const groupHref = (sections: EventSectionMeta[]) => {
    const isMixedProductGroup = sections.some((s) => s.product !== sections[0].product);
    const firstSection = isMixedProductGroup ? (sections.find((s) => s.product === effectiveTabProduct) ?? sections[0]) : sections[0];
    const targetProduct = isMixedProductGroup ? effectiveTabProduct : firstSection.product !== 'shared' ? firstSection.product : effectiveTabProduct;
    const basePath = `/portal/events/${eventId}/${firstSection.key}`;
    return targetProduct ? `${basePath}?product=${targetProduct}` : basePath;
  };

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
    (activeSection?.key === 'planner-production' || activeSection?.key === 'planner-agenda') &&
    productAvailability.planner === true &&
    plannerProductionCapability.status === 'loading';
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
    (activeSection?.key === 'planner-production' || activeSection?.key === 'planner-agenda') &&
    (plannerProductionCapability.status === 'provisioning' || plannerProductionCapability.status === 'error');
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

  return {
    activeSection,
    activeSectionKey,
    activeSectionUnavailable,
    areaProductFor,
    canScrollGroupLeft,
    canScrollGroupRight,
    currentEvent,
    currentGroup,
    currentGroupKey,
    eventId,
    groupHref,
    groupNavRef,
    groupStepIndex,
    groupSteps,
    groupedVisibleSections,
    isSectionAvailable,
    isSteppedGroup,
    journey,
    journeyLabel,
    loading,
    manageModulesOpen,
    moduleProducts,
    navSettled,
    nextStep,
    organizationId,
    patchCurrentEvent,
    pausedActiveProduct,
    plannerCapabilitiesSettled,
    previousStep,
    productAuthPending,
    productAvailability,
    productAvailabilityChecked,
    router,
    scrollGroups,
    sectionHref,
    setManageModulesOpen,
    visibleSections,
    workspaceAuthDenied,
    workspaceAuthPending,
  };
}

export type EventWorkspace = ReturnType<typeof useEventWorkspace>;
