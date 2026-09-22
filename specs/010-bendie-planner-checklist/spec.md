# Feature 010: Bendie Planner Checklist Management

**Status**: Rapid-implementation workflow (per explicit instruction) — lightweight artifacts, single working session, no separate architect/clarify/analyze passes.

## Scope

A dedicated Planner Checklist section in the event workspace, operating directly against Bendie Planner's canonical `event_checklist_items` — no Portal table, no sync. Structurally the closest sibling to Feature 009 Vendors, but **not a copy**: two verified schema differences change the contract materially (see Verified Business Rules).

## User Capabilities

- **Viewer** (`can_view_checklist=true`, `can_manage_checklist=false`): sees **only checklist items they personally own** (see Business Rule 1 — a locked product decision, not a Vendors-style full-list view). Cannot mutate anything.
- **Manager** (`can_manage_checklist=true`): sees the **full** event checklist regardless of ownership. May create items, toggle Sourced/On-site, edit notes, and delete items.
- Neither may edit an existing item's category, name, quantity, specification, sort order, owner, day number, or event-day date after creation.

## Verified Business Rules (live-schema-derived, not assumptions)

1. **Viewer visibility is owner-scoped, unlike Vendors** — verified via Planner's own live RLS (`can_manage_event_checklist(event_id) OR (can_view_event_checklist(event_id) AND owner_profile_id = auth.uid())`) and locked by product decision during this session: Portal's own list route replicates this — a Viewer's query is filtered to `owner_profile_id = <their own resolved Planner profile id>`; a Manager's is not filtered at all.
2. **Two independent lifecycle booleans, no cascade** — verified: `event_checklist_items` has no stage-ordering trigger (unlike Vendors' 3-stage cascade). `is_sourced` and `is_on_site` may be set in any order, independently, with no forced relationship between them.
3. **`notes` is the only field editable after creation** — verified via `prevent_unsafe_checklist_item_edit`'s guard list, which additionally protects `owner_profile_id`, `day_number`, and `event_day_date` beyond Vendors' five fields (`category`, `item_name`, `quantity_text`, `specification`, `sort_order`, plus `event_id`). `notes` is not in the guard list on either table.
4. **`owner_profile_id` must be set at creation and is then immutable** — verified: the same trigger's owner-authorization branch (`OLD.owner_profile_id IS NULL OR OLD.owner_profile_id != auth.uid()`) means a row with `owner_profile_id IS NULL` unconditionally raises `RAISE EXCEPTION 'You are not authorized to edit this checklist item.'` on **any** subsequent `UPDATE` under Portal's service-role write pattern (Portal's `auth.uid()` is always null, and `can_manage_event_checklist()` — also `auth.uid()`-dependent — can therefore never short-circuit this check either). **Locked design decision**: creation always sets `owner_profile_id`, defaulting to the creating manager's own resolved Planner profile id when no owner is explicitly chosen. This is a mechanical consequence of verified trigger behavior, not a debatable product choice (same class of finding as Vendors' immutable-detail-fields rule) — the one genuine product decision this pass surfaced (Rule 1) was raised and resolved before implementation began.
5. **Timestamps are correct regardless of writer; actor attribution is not** — `sourced_at`/`on_site_at` are always accurate. `sourced_by_profile_id`/`on_site_by_profile_id` will be `NULL` for every Portal-originated toggle (identical, already-accepted Vendors limitation — `auth.uid()` unavailable under service-role). Never fabricated in the UI.
6. **No `DELETE` trigger exists** — deleting an item has no side effects beyond the row disappearing; no notification fires for delete (same as Vendors).
7. **Creation and notification triggers behave exactly like Vendors'**: `INSERT` is untouched by the edit-guard trigger (only fires on `UPDATE`); `AFTER INSERT`/conditional `AFTER UPDATE` triggers fire identical `event_notifications` inserts (module `'checklist'`), with the same `auth.uid()`-degraded generic actor name for Portal-originated changes — an already-accepted characteristic, not a new risk.

## Authorization

- `can_view_checklist` (from `event_user_assignments`, resolved via the Portal↔Planner identity bridge, mirroring `resolveVendorCapability`) gates section visibility and read access.
- `can_manage_checklist` gates create/toggle/notes-edit/delete.
- Never inferred from Portal event role. Every route independently re-verifies server-side, identical 8-step sequence to Feature 009. Feature 008 remains the sole owner of these two flags — this feature only reads them.
- Every request resolves Portal `eventId` → workspace authorization → active Planner product → canonical `event_planner_links` → Planner `event_id` → capability → canonical `event_checklist_items`. Never trusts a browser-supplied Planner event id.

## Acceptance Criteria

1. A Manager can view the full checklist, create an item (name required; category/quantity/specification/notes/day-number/event-day-date/owner optional, owner defaults to self), toggle Sourced and On-site independently in any order, edit notes, and delete an item.
2. A Viewer sees only items they own; sees no usable mutation control anywhere.
3. Direct API calls independently enforce the same authorization as the UI.
4. A checklist item belonging to a different Planner event can never be mutated/deleted through the current event's routes.
5. No control anywhere allows editing category/item_name/quantity_text/specification/sort_order/owner/day_number/event_day_date after creation.
6. Every mutation response reflects the actual persisted row, never an assumed client-side state.
7. Feature 007/008/009 remain unaffected; Checklist's own flags never gate Tasks or Vendors and vice versa.
8. Works identically for Planner-only and Both events; absent entirely for Bendie-only events.

## Exclusions

- Editing category/item_name/quantity_text/specification/sort_order/owner/day_number/event_day_date after creation (verified schema-enforced, see Rule 3/4).
- Reassigning an item's owner after creation.
- Any Portal-side checklist table, sync job, new Planner/Portal schema, JWT impersonation, or trigger weakening.
- Broad UI redesign; broad manual browser acceptance (deferred to the combined Planner acceptance pass per the coverage audit's own recommendation).
- Administering `can_view_checklist`/`can_manage_checklist` (remains Feature 008's).
