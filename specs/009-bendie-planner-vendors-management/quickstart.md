# Quickstart: Bendie Planner Vendors Management

This is a validation guide for `/speckit.implement` and manual acceptance — not implementation code. It assumes `tasks.md` has been executed.

## Prerequisites

- A test Portal organization with an active Bendie Planner entitlement, and an event with a canonical `event_planner_links` row (`is_active = true`) — reuse the existing "Stawi Escape — Both Test" / "Stawi Escape — Planner Test" controlled fixtures from Features 005–008 if still present, per this codebase's own established fixture-reuse convention.
- At least two disposable synthetic Portal↔Planner-bridged identities for that event: one with `can_view_vendors = true, can_manage_vendors = false` (Viewer), one with `can_manage_vendors = true` (Manager) — provisioned and configured via Feature 008's own Enable/Save flow (never hand-inserted directly into `event_user_assignments`, since Feature 008 is the sole owner of that write path).
- `npm run dev` running locally.

## 1. Product/provisioning gating (reuse, not new)

1. Open the event workspace for a Bendie-only event (no Planner entitlement). **Expect**: no Vendors tab appears anywhere in the tab bar; a direct navigation to `/portal/events/[eventId]/planner-vendors` does not render the Vendors page (falls through the same `activeSectionUnavailable` block every other Planner-classified tab already uses for a Bendie-only event).
2. Open the event workspace for an event whose Planner provisioning is `pending`/`stale`/`failed`, or which has no active `event_planner_links` row. **Expect**: the Vendors page renders the exact same pending/stale/failed/unavailable copy Planner Overview and Planner Tasks already use — never a new message.
3. Simulate a Planner backend read failure (e.g. temporarily unset `PLANNER_SUPABASE_SERVICE_ROLE_KEY` in a local-only test run, then restore it). **Expect**: `backend_error` state, distinguishable from the provisioning states above.

## 2. Authorization boundary (Viewer vs. Manager vs. denied)

4. As the Viewer identity, open Vendors. **Expect**: the existing item list renders (empty-list state if none exist yet); no create button, no lifecycle-toggle controls, no delete control are present or clickable.
5. As the Viewer identity, call `POST /api/events/[eventId]/planner-vendors` directly (e.g. via curl with the Viewer's session cookie). **Expect**: `403 vendor_manage_denied`.
6. As an event member with no `event_user_assignments` row for this event at all (or one with both flags false), open Vendors and call every route directly. **Expect**: denied at the UI (tab absent) and at every route (`403 vendor_access_denied` for view-gated routes, `403 vendor_manage_denied` or the same denial for mutation routes).
7. As a caller holding `can_manage_tasks = true` but not `can_manage_vendors`, attempt every Vendors mutation directly. **Expect**: denied — a manage flag from a different module never substitutes.
8. As a platform admin or Planner org-admin with no explicit `event_user_assignments` row, confirm Vendors is still reachable per the standing admin-bypass Feature 008 already established (`is_admin_for_event`-equivalent), consistent with Features 007/008's own admin-bypass precedent.

## 3. Create

9. As the Manager identity, create a new item with only a description. **Expect**: `201`, item appears in the list with `category: "General"` (database default), all three lifecycle flags false, `createdByName` correctly showing the Manager's real name.
10. Submit a create request with an empty description. **Expect**: `400 invalid_request`, no item created.
11. Submit a create request that includes an `event_id`, `isPacked`, or `createdByProfileId` field directly. **Expect**: rejected with `400 invalid_request` (these are not accepted input fields at all).

## 4. Status lifecycle — the trigger-authoritative behavior

12. Mark the item Packed. **Expect**: `packedAt` populated, `packedByName` is `null` (the accepted, documented attribution gap — confirm the UI represents this honestly, e.g. omits the "by" line rather than inventing a name).
13. Mark it Loaded, then On-site. **Expect**: all three flags true after the respective calls; each response reflects the full, authoritative persisted row.
14. Un-mark Packed on the fully-progressed item from step 13. **Expect**: the single PATCH response shows `isPacked: false, isLoaded: false, isOnSite: false` — even though only `isPacked` was in the request body, confirming the database's own cascade (data-model.md §2.1) is what the client actually reflects, not an independent Portal-side recomputation.
15. Attempt to submit `{ "isOnSite": true }` on an item that is not currently Loaded. **Expect**: the response's persisted `isOnSite` is `false` (the database silently declines to honor the forward-skip) — confirm the UI does not misreport this as a successful "On-site" state.
16. Edit an item's `notes` only. **Expect**: succeeds; no lifecycle flag or timestamp is affected.

## 5. Explicitly unsupported: detail-field editing

17. Attempt `PATCH .../[itemId]` with `{ "category": "Changed" }` (or `item_description`/`quantity_text`/`unit`/`sort_order`). **Expect**: `400 invalid_request` — confirm this never reaches the Planner database at all (the route's own allowlist rejects it before any write is attempted), and confirm no raw Postgres trigger-exception text ever appears in the response.
18. Confirm the Vendors UI itself never renders an edit control for these fields on an existing item — only Notes and the three lifecycle toggles are ever presented as editable after creation.

## 6. Item-scope security

19. Using a valid `itemId` that belongs to a different event's vendor list, attempt `PATCH`/`DELETE` against the current event's route. **Expect**: `404 vendor_item_not_found` — the item is not mutated, and its existence in the other event is not confirmed or denied by the response shape.

## 7. Delete

20. As the Manager, delete an item. **Expect**: `200 ok`, item no longer appears in the list for any viewer.
21. Immediately repeat the same `DELETE` call for the same `itemId`. **Expect**: `404 vendor_item_not_found` (not a repeated `200` — research.md R8).

## 8. Product-navigation consistency (Feature 006 reuse)

22. Repeat steps 4–21 against a Planner-only event. **Expect**: identical behavior to a Both event.
23. On a Both event, confirm arriving at Vendors from a `?product=planner` origin and from the Bendie-origin dashboard both land on a working Vendors tab with the same `?product=planner` carried on its own internal links, matching every other Planner-classified tab's existing behavior.

## 9. Brownfield regression spot-check

24. Confirm Planner Overview, Planner Tasks, and the Feature 008 permissions modal all continue to function unchanged on the same test event (no shared file this feature touches — `EventLayout.tsx`, `eventSectionMeta.ts` — has altered their existing behavior).
25. Confirm a Bendie-only event's full tab set and dashboard are pixel- and behavior-unchanged.

## Cleanup

Fully remove every disposable synthetic identity/vendor item created for this verification pass; confirm via a final live-DB row count, not assumed — matching this codebase's own established fixture-hygiene convention from Features 007/008.
