# Data Model: Bendie Planner Vendors Management

## 1. No schema change — canonical Planner table, read/written as-is

This feature introduces **zero** migrations (Portal or Planner). `event_vendor_items` (Bendie Planner, existing) is used exactly as-is.

Freshly re-verified live column list (unchanged from the architecture-discovery pass):

| Column | Type | Nullable | Default |
|---|---|---|---|
| `vendor_item_id` | bigint (identity PK) | NO | — |
| `event_id` | bigint (FK → `events.event_id` ON DELETE CASCADE) | NO | — |
| `category` | text | NO | `'General'` |
| `item_description` | text | NO | — |
| `quantity_text` | text | YES | — |
| `unit` | text | YES | — |
| `sort_order` | integer | NO | `0` |
| `is_packed` | boolean | NO | `false` |
| `packed_at` | timestamptz | YES | — |
| `packed_by_profile_id` | uuid (FK → `profiles(id)` ON DELETE SET NULL) | YES | — |
| `is_loaded` | boolean | NO | `false` |
| `loaded_at` | timestamptz | YES | — |
| `loaded_by_profile_id` | uuid (FK → `profiles(id)` ON DELETE SET NULL) | YES | — |
| `is_on_site` | boolean | NO | `false` |
| `on_site_at` | timestamptz | YES | — |
| `on_site_by_profile_id` | uuid (FK → `profiles(id)` ON DELETE SET NULL) | YES | — |
| `notes` | text | YES | — |
| `created_at` | timestamptz | NO | `now()` |
| `updated_at` | timestamptz | NO | `now()` |
| `created_by_profile_id` | uuid (FK → `profiles(id)` ON DELETE SET NULL) | YES | — |

Index: `idx_event_vendor_items_event_sort` on `(event_id, category, sort_order)` — the live evidence for this feature's list-query ordering (research.md R5).

## 2. Live trigger behavior this feature must account for, never re-implement

Three triggers fire on every write to this table regardless of writer (service-role writes are never exempt from triggers — only RLS is bypassed for `service_role`, and Postgres does not evaluate RLS for trigger execution decisions):

1. **`trg_enforce_vendor_item_stage_order`** (BEFORE INSERT/UPDATE) — makes `is_packed → is_loaded → is_on_site` a live, bidirectional invariant. If `is_packed` is false, both `is_loaded` and `is_on_site` are forced false; else if `is_loaded` is false, `is_on_site` is forced false. This means a client can never persist an invalid combination no matter what it submits, and reversing an earlier stage automatically clears every later one in the same write.
2. **`trg_prevent_unsafe_vendor_item_edit`** (BEFORE UPDATE) — re-stamps whichever `*_at`/`*_by_profile_id` pair corresponds to a stage flag that just changed, using `auth.uid()` for the actor. Since Portal's writes go through a Planner service-role connection with no Planner-authenticated session, `auth.uid()` is null for every Portal-originated write — the `*_at` timestamp is still always correct (`now()` does not depend on session), but `*_by_profile_id` will always be null. Separately, this same trigger raises a hard `RAISE EXCEPTION` if `event_id`, `category`, `item_description`, `quantity_text`, `unit`, or `sort_order` changes and the writer cannot satisfy `can_manage_event_vendors()` (which also depends on `auth.uid()`, so it is also always false for Portal's service-role writes) — this is the live, database-level reason those five fields are not editable through this feature after creation. `notes` is not in this guard list and is freely editable.
3. **`trg_notify_vendor_item_change`** / **`trg_notify_vendor_item_created`** (AFTER) — insert a row into `event_notifications` for every active assignment with `can_view_notifications = true` (excluding the actor, when known). Actor name resolution also depends on `auth.uid()`, so Portal-originated changes will generate notifications attributed to a generic fallback rather than the real Portal-authenticated manager — this is outside this feature's control or scope, and is the same class of behavior Feature 007's Tasks notifications already exhibit today for the identical reason (confirmed by inspecting `notify_operational_task_status_change`, which has the identical `auth.uid()`-with-fallback pattern). `trg_notify_vendor_item_change`'s own `WHEN` clause only fires when one of the three stage booleons differs — a notes-only `UPDATE` does not trigger a notification at all. **`DELETE` has zero triggers of any kind defined for it on this table** (all five live triggers are INSERT/UPDATE-scoped) — deleting an item produces no notification, unlike create or a status change; this is a real, accepted asymmetry, not a defect to fix.

**Load-bearing fact, verified during `/speckit.analyze` (2026-09-21) — trigger firing order, not merely trigger existence, is why cascade-cleared timestamps/actors come out correct**: Postgres fires multiple `BEFORE` triggers for the same table/event in alphabetical order by trigger name. The three `BEFORE UPDATE` triggers on this table are named `trg_enforce_vendor_item_stage_order`, `trg_event_vendor_items_set_updated_at`, `trg_prevent_unsafe_vendor_item_edit` — alphabetically, `enforce` < `event` < `prevent`, so the stage-order cascade (trigger 1 above) always completes and writes its forced-`false` values into `NEW` *before* the re-stamp trigger (trigger 2 above) ever runs. This means the re-stamp trigger's own `IF NEW.is_loaded IS DISTINCT FROM OLD.is_loaded` checks see the *already-cascaded* value, not the originally-requested one — so a cascaded stage's timestamp/actor genuinely does get nulled in the same `UPDATE`, not left stale. This was previously asserted below without being traced against the actual trigger names/firing order; if either trigger is ever renamed in a way that changes this alphabetical relationship, this composition — and this feature's entire "no semantic problem" conclusion for cascades — would need to be re-verified.

**Design consequence**: this feature's own application code (`src/lib/plannerVendors.ts`) never computes or validates the packed/loaded/on-site combination itself — it submits whatever the caller requested for the fields they touched, then reads back and returns the row the database actually persisted (`.select(...)` on the same `UPDATE`, never a second round-trip).

## 3. Entities (as exposed by this feature — not new tables)

### VendorItem (derived shape returned by every Feature 009 API route — never the raw row)

| Field | Type | Source | Notes |
|---|---|---|---|
| `id` | number | `vendor_item_id` | Internal identifier — never described to the user as anything but an item's identity; not otherwise surfaced as a "raw ID" in the UI copy (FR-019). |
| `category` | string | `category` | |
| `description` | string | `item_description` | Required at creation. |
| `quantityText` | string \| null | `quantity_text` | |
| `unit` | string \| null | `unit` | |
| `isPacked` | boolean | `is_packed` | |
| `packedAt` | string \| null | `packed_at` | ISO timestamp. |
| `packedByName` | string \| null | `packed_by_profile_id` → joined `profiles.full_name` | `null` whenever the underlying `*_by_profile_id` is `null` — including every Portal-originated stage change (see §2.2). The client must render this as "no attribution available," never a fabricated name (FR-032). |
| `isLoaded` / `loadedAt` / `loadedByName` | (as above) | (as above) | Same shape and same attribution caveat as the packed triple. |
| `isOnSite` / `onSiteAt` / `onSiteByName` | (as above) | (as above) | Same shape and same attribution caveat. |
| `notes` | string \| null | `notes` | Editable after creation (research.md R1). |
| `createdAt` / `updatedAt` | string | `created_at` / `updated_at` | |
| `createdByName` | string \| null | `created_by_profile_id` → joined `profiles.full_name` | Correctly populated for Portal-originated creates (not subject to the trigger's `auth.uid()` overwrite — only the three stage `*_by_profile_id` fields are). |

`sort_order` is accepted only as a creation-time input (see ModuleCreateInput below); it is not part of the returned shape as an editable field, since this feature provides no mechanism to change it afterward.

### VendorCapability (derived — the shape returned by the dedicated capability route and embedded in the collection route)

```
{ hasPlannerIdentity: false }
| { hasPlannerIdentity: true; canView: boolean; canManage: boolean }
```

Structurally identical to `plannerTasks.ts`'s `TaskCapability`/`ResolvedTaskCapability` — deliberately reusing the same shape so `EventLayout.tsx`'s existing capability-state-machine pattern (research.md R9) can be repeated for Vendors with the smallest possible diff.

### VendorItemCreateInput

| Field | Required | Notes |
|---|---|---|
| `category` | No (defaults to `'General'` at the database level if omitted) | |
| `description` | Yes | Rejected if empty/whitespace-only. |
| `quantityText` | No | |
| `unit` | No | |
| `notes` | No | |
| `sortOrder` | No (defaults to `0`) | Accepted only here — see §1/VendorItem above. |

### VendorItemPatch

```
Partial<{ isPacked: boolean; isLoaded: boolean; isOnSite: boolean; notes: string | null }>
```

Never accepts `category`/`description`/`quantityText`/`unit`/`sortOrder`/`event_id` (rejected as `invalid_request` if present — FR-039), never accepts any `*_at`/`*_by_profile_id` field (SR-008), never accepts `access_role`-equivalent or any field this table doesn't have. A fully empty body (or one containing only unrecognized keys) is rejected as `invalid_request` — "at least one field required" — never a silent no-op write (contracts.md).

**Omission vs. explicit value** (clarified during `/speckit.analyze`, 2026-09-21): an omitted key must never be confused with an explicitly-submitted falsy value. For the three booleans, presence is checked via `typeof patch.X === 'boolean'` (an omitted key is `undefined`, which fails this check; an explicit `false` passes it) — matching `plannerTasks.ts`'s own `patch.X !== undefined` idiom. For `notes` (a nullable string), presence is checked via `'notes' in patch` — matching `updateTaskAsManager`'s own `'remarks' in body` idiom for the identical nullable-string shape — so an explicit `{notes: null}` (clearing existing notes) is distinguishable from an omitted `notes` key (leave unchanged).

## 4. State transitions (lifecycle)

```
[created]  is_packed=false, is_loaded=false, is_on_site=false
   --(mark Packed)-->        is_packed=true
   --(mark Loaded)-->        is_packed=true, is_loaded=true            [requires is_packed already true or set true in the same request]
   --(mark On-site)-->       is_packed=true, is_loaded=true, is_on_site=true   [requires is_loaded already true or set true in the same request]
   --(un-mark Packed)-->     is_packed=false, is_loaded=false, is_on_site=false   [database cascade — automatic, regardless of what was requested]
   --(un-mark Loaded, while On-site)--> is_loaded=false, is_on_site=false          [database cascade — automatic]
```

This diagram documents *observable outcomes*, not application logic — every transition above is enforced by `trg_enforce_vendor_item_stage_order` at the database layer (§2.1); `src/lib/plannerVendors.ts` never encodes this diagram as code.

## 5. No Planner-side or Portal-side schema change

Confirmed not needed and not permitted (spec FR-014, Out of Scope). `event_vendor_items` is used exactly as-is: no new column, no new table, no RLS change, no new trigger. `src/types/plannerDatabase.ts` (this codebase's hand-maintained Planner column reference, per `plannerAdmin.ts`'s own documented convention) gains a new `event_vendor_items` entry describing the columns in §1, for the same reference purpose Feature 007/008's own equivalent entries serve — not a generated type, and not a schema change.
