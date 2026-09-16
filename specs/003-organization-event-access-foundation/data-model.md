# Phase 1 Data Model: Organization & Event Access Foundation

This feature introduces **no new database tables**. It adds one additive RLS policy and reshapes how existing entities are read. This document records the one schema change, the resulting authorization model, the route inventory, and the security matrix — the actual "data model" this feature changes is an authorization model, not a new set of entities.

## Schema Change

### New migration: `supabase/migrations/organization_admin_event_metadata_visibility.sql`

```sql
-- Organization & Event Access Foundation (Feature 003).
-- Lets an organization owner/admin see event METADATA (name, status, dates,
-- organization ownership, event_products) for every event in their own
-- organization, without granting event workspace/content access — that
-- remains gated by event_members's own unchanged RLS and by an explicit
-- application-level check (src/lib/eventAuth.ts). This is additive: it does
-- not replace or modify events_select_member, events_select_public_showcase,
-- or any event_members/content-table policy.

CREATE POLICY "events_select_org_admin"
  ON public.events
  FOR SELECT
  USING (public.is_organization_admin(organization_id));
```

No column changes. No changes to `event_members`, `organization_members`, `organization_products`, `event_products`, `organization_planner_links`, or `event_planner_links`. `src/types/database.ts` requires no edit (RLS-only change, no shape change).

## Reused Entities (unchanged schema, newly reachable/newly governed behavior)

| Entity | Table | Role in this feature |
|---|---|---|
| Platform Administrator | `profiles.global_role = 'admin'` | Retains full cross-tenant bypass everywhere (`portal_is_global_admin()`). |
| Organization Member | `organization_members` | `role IN ('owner','admin')` now also grants event-metadata visibility (new policy above); all roles retain existing organization-level visibility (`is_organization_member`). |
| Organization Entitlement | `organization_products` | `is_active = true` is the sole authoritative product-availability signal (FR-018–FR-021); read via a new `isProductActiveForOrg()` helper, no schema change. |
| Event | `events` | Gains one new SELECT policy (above); metadata (id, name, status, dates, `organization_id`) becomes visible to org owners/admins without `event_members`. |
| Event Access Grant | `event_members` | Unchanged; remains the sole basis (besides platform-admin bypass) for workspace/content access. |
| Event Product Usage | `event_products` | Unchanged; combined with active entitlement to compute navigation availability (research.md item 9–10). |

## Authorization Model

### Two-layer access model (the feature's core invariant)

```
Layer 1 — Organization membership (organization_members)
  → governs: which organizations are visible, event METADATA visibility for owners/admins
Layer 2 — Event access (event_members)
  → governs: event WORKSPACE/CONTENT access (all 24 tabs, attendee/operational data)

Layer 1 alone NEVER satisfies Layer 2. Platform admin bypasses both layers entirely.
```

### `src/lib/eventAuth.ts` (new module — conceptual shape, not final code)

- `canViewEventMetadata(event, membershipRole)` — true if platform admin, or `role IN ('owner','admin')` for the event's organization, or an explicit `event_members` row exists. Governs what the event-list page renders as a card.
- `requireEventWorkspaceAccess(eventId, userId)` — server/query-level check: true only if platform admin OR an `event_members` row exists for `(eventId, userId)`. Governs whether `EventContext`/the event layout renders the tab shell at all. **This is evaluated independently of whether the `events` row itself was fetchable** — fetchability now says nothing about workspace access, per research.md item 0.
- `isProductActiveForOrg(organizationId, productKey)` — reads `organization_products` filtered to `is_active = true`.
- `isProductAvailableForEvent(event, organizationId, productKey)` — `isProductActiveForOrg(...) && event_products contains productKey`.

## Route Inventory / Route-Category Analysis

Every existing `/portal` route/surface, classified against what becomes reachable once the top-level middleware gate widens:

| Route / Surface | Current protection | Classification | Feature 003 action |
|---|---|---|---|
| `/portal` (Overview) | middleware only | organization-scoped | No page-level guard exists yet; safe once org-scoped, no privileged data shown here today (verify at implementation time; if it shows cross-org data, scope it — out-of-band from this table if found, flag per AGENTS.md). |
| `/portal/events` (list) | middleware + `getAccessibleEvents()` | organization-scoped, event-metadata | `getAccessibleEvents()` gains real non-admin branch (research.md item 3). **Analysis correction**: the "New Event" button/`events_insert_creator` RLS was found over-permissive (any org member, not just owner/admin) — tightened to `is_organization_admin` (research.md item 15, tasks T046–T047, T049). |
| `/portal` org switcher ("New Organisation") | middleware only, `organizations_insert_creator` RLS | **found platform-admin-only by intent, was unrestricted** | **Analysis correction**: `organizations_insert_creator` allowed any authenticated user with no membership check at all — tightened to `portal_is_global_admin()` (research.md item 15, tasks T046, T048, T050). |
| `/portal/events/[eventId]/*` (24 tabs) | middleware + RLS per-table | event workspace/content | New explicit `requireEventWorkspaceAccess` guard added (research.md item 0); each tab's own content-table RLS unchanged. |
| `/portal/people` | middleware only, app already org-scoped (`useOrganization()`) | organization-scoped | No change needed — already safe once admitted. |
| `/portal/assets` | middleware only, app already org-scoped | organization-scoped | No change needed. |
| `/portal/activity-log` | middleware only, app already org-scoped | organization-scoped | No change needed. |
| `/portal/settings` | middleware only, app already org-scoped | organization-scoped | No change needed. |
| `/portal/teams` | middleware + table RLS (`portal_is_global_admin()`-only, all 4 policies) | **platform-admin-only (self-protected by RLS)** | No change needed — already denies customer reads/writes at the database layer regardless of middleware; documented, not fixed (no requirement to fix in spec.md). |
| `/portal/events/[eventId]/bendie-planner` | middleware + `event_planner_links` admin-only RLS + new workspace guard | event workspace/content (Feature 001) | Now additionally requires the new workspace-access guard like any other tab; its own admin-only writes (via `app/api/admin/planner-link`) are unaffected. |
| `app/api/admin/**` (7 routes) | independent `global_role==='admin'` server check in every route | platform-admin-only (self-protected) | No change needed — confirmed independently protected regardless of middleware (research.md item 12). |
| `/portal/admin/*` | N/A — does not exist yet | platform-admin-only (reserved) | New empty route-group convention established for future platform-admin-only surfaces; nothing moved into it by this feature. |

## Security Authorization Matrix

| Actor | Enter customer Portal | List org events | Enter event workspace | Platform admin routes (`app/api/admin/**`, future `/portal/admin/*`) |
|---|---|---|---|---|
| Unauthenticated | Denied → login | Denied | Denied | Denied |
| Authenticated, no `organization_members`, not platform admin | Admitted → no-organization/no-access state | Denied (no org selected) | Denied | Denied |
| Ordinary org member, no `event_members` | Admitted | Sees only events they hold `event_members` for | Denied | Denied |
| Ordinary org member, with `event_members` | Admitted | Sees their events (as above) + can open them | Allowed for events they hold `event_members` for | Denied |
| Org owner/admin, no `event_members` on event E | Admitted | Sees ALL org events (metadata), including E | Denied for E | Denied |
| Org owner/admin, with `event_members` on event E | Admitted | Sees ALL org events (metadata) | Allowed for E | Denied |
| Platform admin (`global_role='admin'`) | Admitted (bypass) | Sees ALL events, all orgs | Allowed for any event | Allowed |

Product gating (applies after workspace access is already granted): a tab classified `'bendie'`/`'planner'` renders only when `isProductAvailableForEvent()` is true for that product; an inactive organization entitlement hides the tab even if the historical `event_products` row still exists (FR-020).

## Validation Rules (from functional requirements)

- A stale/manipulated `current_organization_id` MUST be revalidated against live `organization_members` on every load (FR-005) — already implemented by `OrganizationContext`'s existing `accessible.find(...)` pattern (research.md item 2); no new validation code needed.
- A client-supplied `organization_id`/`event_id`/`product_key` MUST never be trusted directly by any server-side check (FR-026); all reads/writes re-derive these from the database via the helpers above.
- `organization_products.is_active = false` MUST NOT delete or hide historical `event_products` rows (FR-020) — enforced by construction (the navigation filter reads both tables independently; nothing deletes `event_products`).

## State Transitions

None. This feature adds no new stateful entity; the only "transition" is the two admission states already covered by the security matrix (admitted-with-organization vs. no-organization/no-access), which are derived live on every request, not stored.
