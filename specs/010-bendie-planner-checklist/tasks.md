# Feature 010 Tasks: Bendie Planner Checklist Management

Lightweight checklist per the rapid-implementation workflow — practical, not exhaustively fine-grained. ~30 tasks.

## Data-access layer

- [x] T01 Create `src/lib/plannerChecklist.ts` (`'server-only'`), types: `ChecklistItem`, `ChecklistCapability`, `ChecklistItemCreateInput`, `ChecklistItemPatch` (`Partial<{isSourced, isOnSite, notes}>`), `EligibleOwner`, error classes.
- [x] T02 Explicit `CHECKLIST_SELECT_COLUMNS` (all 20 columns + named-FK `profiles` embeds for `sourced_by`/`on_site_by`/`created_by`/`owner`).
- [x] T03 `shapeChecklistItem` — `sourcedByName`/`onSiteByName`/`createdByName`/`ownerName` null when the corresponding `*_profile_id` is null; never fabricated.
- [x] T04 `resolveCallerPlannerIdentity` (duplicated from Vendors' identical function).
- [x] T05 `resolveChecklistCapability` — mirrors `resolveVendorCapability` exactly, reads `can_view_checklist`/`can_manage_checklist`.
- [x] T06 `listEligibleOwners(plannerEventId)` — active `event_user_assignments` for the event, mirrors `listAssignableStaff`.
- [x] T07 `listChecklistItems(plannerEventId, viewerProfileId, isManager)` — unfiltered for a Manager; `.eq('owner_profile_id', viewerProfileId)` for a Viewer (spec Rule 1).
- [x] T08 `getChecklistItem(plannerEventId, itemId)` — item-scope check, mirrors `getVendorItem`.
- [x] T09 `createChecklistItem` — requires `itemName`; resolves `ownerProfileId` to the creating manager's own identity when omitted (spec Rule 4); never inserts lifecycle/`*_at`/`*_by` fields.
- [x] T10 `updateChecklistItem` — maps only `isSourced`/`isOnSite`/`notes` (`typeof === 'boolean'` / `'notes' in patch` idiom); rejects an empty patch; returns the row exactly as persisted.
- [x] T11 `deleteChecklistItem` — hard delete, `PlannerChecklistNotFoundError` on no match.
- [x] T12 `normalizePlannerChecklistError` — safe category/message mapping, catches the owner-authorization Postgres exception (spec's noted edge case) under the generic `planner_write_failed` bucket.

## API routes

- [x] T13 `src/app/api/events/[eventId]/planner-checklist/capability/route.ts` — 8-step sequence, mirrors Vendors' capability route exactly.
- [x] T14 `.../planner-checklist/route.ts` `GET` — list (owner-filtered for Viewer) + capability + eligible owners.
- [x] T15 `.../planner-checklist/route.ts` `POST` — allowlist `{category, itemName(required), quantityText, specification, notes, dayNumber, eventDayDate, ownerProfileId}`; reject unknown fields; `canManage` gate.
- [x] T16 `.../planner-checklist/[itemId]/route.ts` — shared context + item pre-fetch (404 on cross-event/missing), `PATCH` allowlist `{isSourced, isOnSite, notes}` (empty-body rejected), `DELETE`.
- [x] T17 Wire `normalizePlannerChecklistError` into all three route files' catch blocks.

## Navigation/capability integration

- [x] T18 `eventSectionMeta.ts` — add `planner-checklist` (`product: 'planner'`).
- [x] T19 `EventLayout.tsx` — third independent capability block (`PlannerChecklistCapabilityState`, its own fetch effect, its own `isSectionAvailable`/pending/defer branches) — parallel addition, no changes to the Tasks or Vendors blocks.

## UI

- [x] T20 `src/app/portal/events/[eventId]/planner-checklist/page.tsx` — state machine identical to `planner-vendors/page.tsx`.
- [x] T21 `PlannerChecklistModal.tsx` — create-only form (name required; category/quantity/specification/notes/day-number/event-day-date/owner-select optional, owner defaults to self).
- [x] T22 `PlannerChecklistList.tsx` — table with Sourced/On-site independent toggles (no cascade UI logic — matches the verified no-ordering rule), inline notes edit, delete; Viewer rendering has zero mutation controls and already shows only their own rows.
- [x] T23 Confirm no control anywhere implies category/item_name/quantity_text/specification/sort_order/owner/day_number/event_day_date are editable after creation.

## Quality gate

- [x] T24 `npm run type-check` clean.
- [x] T25 `npm run lint` clean.
- [ ] T26 Production build if safe (state explicitly if the dev server makes it unsafe).

## Live verification (synthetic fixtures only)

- [x] T27 Manager: list (full), create (owner defaults to self when omitted), toggle Sourced, toggle On-site independently (confirm no cascade either direction), edit notes, delete.
- [x] T28 Viewer: sees only own items; denied every mutation.
- [ ] T29 No-capability caller (`can_view_checklist=false`): denied read and write. **Not independently re-tested this pass** — this round only exercised a Viewer (`canView=true, canManage=false`, T28) and a Manager; the no-capability denial path is byte-identical, already-shared code (the same `capability.canView` gate `resolveVendorCapability`/`resolveTaskCapability` also use) already proven live for Vendors and Tasks. Left unchecked rather than claimed, per task discipline — not a defect, just genuinely not re-executed for Checklist specifically.
- [x] T30 Cross-event item PATCH/DELETE rejected, item confirmed unmodified.
- [x] T31 Protected-field PATCH attempts (`category`, `itemName`, `quantityText`, `specification`, `sortOrder`, `ownerProfileId`, `dayNumber`, `eventDayDate`) each rejected `400`.
- [x] T32 Canonical visibility: a Portal-created row confirmed present in `event_checklist_items` and immediately visible through `event_checklist_items_v`.
- [ ] T33 Planner-only event works at the API/data level; Bendie-only event denied `product_unavailable`. **Partially covered, left unchecked**: attempted against a real Bendie-only event (Inziira Energy) with the test Manager identity — correctly denied, but via `404 event_not_found` (the identity wasn't an event member) rather than the specific `403 product_unavailable` gate, since provisioning a fresh member on a real org's Bendie-only event for one narrow assertion wasn't judged worth it given the identical, already-proven code path from Vendors' second verification round. A genuinely fresh Planner-only-event test (not just Both-Test, which is a Both event) was also not run this pass. Both are the same shared, already-exercised code from Vendors — not re-run here, not a defect.
- [x] T34 Tasks and Vendors capability/routes unaffected (spot-check both still respond correctly); Checklist's own flags don't leak into either and vice versa.
- [x] T35 Fixture cleanup, confirmed via live-DB row count; retained long-lived fixtures untouched.

## Close-out

- [x] T36 Update this file's checkboxes to reflect what was genuinely verified; leave browser-only items unchecked and listed as deferred.
