# Feature 010 Plan: Bendie Planner Checklist Management

Reuses Feature 009's architecture wherever the verified schema doesn't force a difference. Differences are called out explicitly.

## Canonical Data

`event_checklist_items` (Bendie Planner, existing) — no schema change, no Portal table, no sync. Columns: `checklist_item_id`, `event_id`, `category`, `item_name`, `quantity_text`, `specification`, `sort_order`, `owner_profile_id`, `is_sourced`/`sourced_at`/`sourced_by_profile_id`, `is_on_site`/`on_site_at`/`on_site_by_profile_id`, `notes`, `created_at`/`updated_at`, `created_by_profile_id`, `day_number`, `event_day_date`. List query ordered `event_id, category, sort_order` (matches the live `idx_event_checklist_items_event_sort` index, identical to Vendors).

## Data-Access Layer

New `src/lib/plannerChecklist.ts`, mirroring `plannerVendors.ts` function-for-function:
- `resolveCallerPlannerIdentity` (duplicated, same rationale as Vendors)
- `resolveChecklistCapability(plannerEventId, plannerProfileId)` — identical shape to `resolveVendorCapability`, reading `can_view_checklist`/`can_manage_checklist`
- `listChecklistItems(plannerEventId, viewerProfileId, isManager)` — **differs from Vendors**: when `!isManager`, adds `.eq('owner_profile_id', viewerProfileId)` (spec Rule 1); a Manager gets the unfiltered list
- `listEligibleOwners(plannerEventId)` — active `event_user_assignments` for the event, mirroring `plannerTasks.ts`'s `listAssignableStaff` exactly (same shape, new name)
- `getChecklistItem`, `createChecklistItem`, `updateChecklistItem`, `deleteChecklistItem`, `normalizePlannerChecklistError` — identical shape/pattern to Vendors' equivalents
- `createChecklistItem` **differs from Vendors**: requires `ownerProfileId` to be resolved before insert — defaults to the creating manager's own `plannerProfileId` when the request omits one (spec Rule 4); never inserts a null owner
- `updateChecklistItem`'s patch type is `Partial<{isSourced, isOnSite, notes}>` — **one fewer field than Vendors** (no ordering relationship to preserve, so no "no-op guard" beyond requiring at least one recognized key, same as Vendors)

## API Routes (identical structure to Vendors)

`src/app/api/events/[eventId]/planner-checklist/`
- `route.ts` — `GET` (list + capability + eligible-owners for the create form), `POST` (create)
- `capability/route.ts` — `GET`, dedicated lightweight capability check for `EventLayout`
- `[itemId]/route.ts` — `PATCH` (isSourced/isOnSite/notes), `DELETE`

Same 8-step authorization sequence, copied inline per route (Feature 007/008/009 precedent — never shared). Same allowlist-rejection pattern for the 7 protected fields (one more than Vendors: `ownerProfileId`, `dayNumber`, `eventDayDate` added to the create-only set; PATCH allowlist is `{isSourced, isOnSite, notes}`).

## UI Structure

- `EVENT_SECTIONS` entry: `planner-checklist`, `product: 'planner'`.
- `EventLayout.tsx`: a third, independent parallel capability block (`plannerChecklistCapability`), alongside the existing Tasks and Vendors blocks — not a generalization of either.
- `src/app/portal/events/[eventId]/planner-checklist/page.tsx` — identical state machine to `planner-vendors/page.tsx`.
- `PlannerChecklistList.tsx` — table: item/category, quantity/specification, day/date (display only), owner name (display only), Sourced toggle, On-site toggle, notes inline-edit, delete. Viewer rendering shows only their own rows (already filtered server-side) with zero mutation controls.
- `PlannerChecklistModal.tsx` — create-only form: item name (required), category, quantity, specification, notes, day number, event-day date, owner (select from eligible owners, defaults to self if left unset).

## Brownfield Files Reused

`plannerAdmin.ts` (service-role client), `eventAuth.ts` (`requireEventWorkspaceAccess`, `isProductAvailableForEvent`), `plannerOverview.ts` (`resolveProvisioningPhase`), `FormModal`, `useConfirm`, the `requestIdRef`/`mountedRef` stale-response pattern from `planner-tasks/page.tsx` and `planner-vendors/page.tsx`.

## Security Considerations

- Item-scope: every `PATCH`/`DELETE` verifies `checklist_item_id` belongs to the resolved canonical Planner `event_id` (identical `getChecklistItem` pre-check pattern to Vendors).
- Viewer-owner-scoping (Rule 1) is enforced server-side in `listChecklistItems`, never client-side filtering of an unfiltered response.
- No new authentication/impersonation mechanism; the `owner_profile_id`/detail-field immutability is accepted, not worked around.
- Edge case: a pre-existing Planner-native item with `owner_profile_id IS NULL` would raise a genuine Postgres exception on any Portal-originated status toggle — caught by `normalizePlannerChecklistError`'s generic catch-all (safe message, no raw Postgres text), not specially handled given rapid-workflow scope; noted here rather than silently ignored.
