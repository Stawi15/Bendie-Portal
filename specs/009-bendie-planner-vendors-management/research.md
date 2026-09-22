# Phase 0 Research: Bendie Planner Vendors Management

All findings below were re-verified live during this planning pass (fresh SQL against the Planner Supabase project, fresh reads of the current codebase), not carried over unchecked from the architecture-discovery pass.

## R1 — `notes` editability (resolves the spec's one open assumption)

**Decision**: `notes` IS editable after creation, by a `can_manage_vendors` caller, alongside the three lifecycle-status toggles. It is the one exception to "no detail-field editing."

**Rationale**: Freshly re-queried `information_schema.columns` — `notes` is `text`, nullable, no default, present on both `event_vendor_items` and the read view `event_vendor_items_v`. Freshly re-read `prevent_unsafe_vendor_item_edit`'s source: its detail-field guard explicitly enumerates `event_id`, `category`, `item_description`, `quantity_text`, `unit`, `sort_order` — six fields, curated one at a time — and does not mention `notes`. An UPDATE that changes only `notes` does not trip the `RAISE EXCEPTION` branch at all. This is a deliberate omission (the same author who carefully listed six adjacent columns would not accidentally skip a seventh sitting right next to them in the table), not an oversight to be treated with suspicion.

**Alternatives considered**: Excluding `notes` entirely, matching the other five detail fields, was the conservative fallback per the planning brief ("if not clearly supported, remove it"). Rejected because the evidence clearly supports inclusion — the trigger's own author-drawn line falls between `sort_order` and `notes`, not before `notes`.

## R2 — Identity resolution is required for every operation, including read

**Decision**: Every Vendors route (list, capability, create, patch, delete) MUST resolve the caller's own Planner identity (`profiles.planner_profile_id`) before it can answer anything, and must return a distinct, documented denial (`planner_identity_unavailable`) if it cannot.

**Rationale**: Re-read `plannerTasks.ts`'s `resolveTaskCapability` and every Feature 007 route — capability itself (`can_view_tasks`/`can_manage_tasks`) is read from `event_user_assignments` keyed on `profile_id = <the caller's own Planner identity>`. There is no way to answer "can this caller view Vendors" without first knowing which `event_user_assignments` row is theirs. Feature 007's own routes treat a missing identity as `403 planner_identity_unavailable` on the full collection/detail routes, and as `{ capability: { hasPlannerIdentity: false } }` (200, not an error) on the dedicated lightweight capability route — the same two-shape pattern this feature must mirror exactly for Vendors.

**Alternatives considered**: Treating "no Planner identity yet" as an implicit "no access" without a distinct response shape — rejected because it would make a genuine identity-resolution problem indistinguishable from a genuine permission denial, the exact class of defect Feature 007's own `/speckit.analyze` review (H2) already corrected once for capability-read failures.

## R3 — `event_user_assignments` existing without a resolved identity is not a realistic scenario for `can_manage_vendors`

**Decision**: No special-cased "manager with no identity" flow is needed. Document it as an edge case with a standard denial, not a distinct feature.

**Rationale**: `can_manage_vendors` can only ever be true on a row in `event_user_assignments`, and every such row requires a `profile_id` (Planner identity) to exist as its primary key component in the first place (`UNIQUE (event_id, profile_id)`, `profile_id uuid NOT NULL` implied by being part of that constraint and referenced by Feature 008's own `enableAssignment`/`savePermissions`, which always operate on an already-resolved `plannerProfileId`). A caller cannot hold `can_manage_vendors` for an event without a Planner identity already existing — the only way `resolveCallerPlannerIdentity` could fail for such a caller is a genuine, unrelated data-integrity break (e.g. their `profiles.planner_profile_id` bridge column was cleared after their assignment was created), which is already handled generically by the same `planner_identity_unavailable` denial from R2. No additional design is needed.

## R4 — Reuse the base table, not `event_vendor_items_v`

**Decision**: Portal reads `event_vendor_items` directly with an explicit column list and its own `profiles` embeds for actor names, exactly matching `plannerTasks.ts`'s `TASK_SELECT_COLUMNS` + `profiles(full_name)` pattern. It does not query `event_vendor_items_v`.

**Rationale**: `event_vendor_items_v` is confirmed (freshly re-read) to be a plain `SELECT ... LEFT JOIN profiles ...` view with no additional filtering, security-definer behavior, or business logic — selecting from it via the service-role client would be functionally identical to selecting from the base table with three extra joins, but would introduce a second, un-owned dependency (a Planner-side object this feature does not control and Feature 007 has no analogous reliance on). Matching Feature 007's own established style (never depend on a Planner "view," always select explicit base-table columns) keeps this feature's failure modes identical to every other Planner-reading feature in this codebase.

**Alternatives considered**: Reading from the view to save three explicit joins — rejected for the reason above; the saved code is trivial and the added external dependency is not worth it.

## R5 — Exact SELECT column list and ordering

**Decision**:
```
vendor_item_id, event_id, category, item_description, quantity_text, unit, sort_order,
is_packed, packed_at, packed_by_profile_id,
is_loaded, loaded_at, loaded_by_profile_id,
is_on_site, on_site_at, on_site_by_profile_id,
notes, created_at, updated_at, created_by_profile_id,
profiles!event_vendor_items_packed_by_profile_id_fkey(full_name),
profiles!event_vendor_items_loaded_by_profile_id_fkey(full_name),
profiles!event_vendor_items_on_site_by_profile_id_fkey(full_name)
```
ordered `.eq('event_id', plannerEventId).order('category').order('sort_order')`.

**Rationale**: This is every column on the live table (freshly re-confirmed, 20 columns, unchanged from the architecture-discovery pass) — there is no `select('*')` and no omitted field a manager might need. The `.order('category').order('sort_order')` matches the live composite index `idx_event_vendor_items_event_sort` on `(event_id, category, sort_order)` exactly — this is the schema's own evidence of its intended list-query shape, not a guess. Three separate named-FK embeds are required (not a single `profiles(full_name)`) because the table has three independent FKs to `profiles` (`packed_by_profile_id`, `loaded_by_profile_id`, `on_site_by_profile_id`) — PostgREST requires the explicit constraint name to disambiguate an embed when more than one FK exists to the same target table, exactly the same situation Feature 008's `plannerPermissions.ts` already handles for its own multi-FK `event_checklist_items`-adjacent lookups (`profiles!event_members_user_id_fkey(...)` pattern reused verbatim here). `created_by_profile_id`'s name is resolved separately only where needed (list display), using the same named-embed technique.

**Alternatives considered**: A single generic `profiles(full_name)` embed — rejected; PostgREST cannot disambiguate three FKs to the same table without the constraint name, and would either error or arbitrarily pick one.

## R6 — API shape: does Vendors need a single `status` PATCH or three independent toggles?

**Decision**: One `PATCH .../[itemId]` route accepting a partial body of `{ isPacked?, isLoaded?, isOnSite?, notes? }` (any subset), not three separate endpoints and not a single Tasks-style `status` enum string.

**Rationale**: Unlike Tasks (one `status` column with three mutually-exclusive string values, normalized by a dedicated canonicalization trigger), Vendors has three independent boolean columns that the database's own `enforce_vendor_item_stage_order` trigger reconciles into a valid combination on every write, regardless of which subset changed. A single PATCH accepting any subset of the three booleans plus `notes` lets the client send exactly what changed (e.g. "toggle Packed off") and lets the database do 100% of the ordering/cascade work, with zero client-side or route-level re-implementation of that logic. This mirrors the spec's explicit FR-028 requirement not to duplicate the trigger as an independent source of truth.

**Alternatives considered**: A dedicated `POST .../[itemId]/pack`, `.../load`, `.../ship` action-style set of endpoints — rejected as unnecessary indirection for a feature this narrow, and as a needless deviation from Feature 007/008's established flat-PATCH convention.

## R7 — Does create need an idempotency mechanism?

**Decision**: No. Plain `INSERT`, no client-generated operation ID, no idempotency key.

**Rationale**: Compared directly against Feature 007's `createTask`, which also has no idempotency mechanism (a retried `createTask` call after a network failure can create a duplicate task — an accepted, undocumented-as-a-concern gap in the existing, converged Feature 007). Feature 008 DOES use a client-generated `operationId` for its own mutations, but only because it also writes a paired, uniquely-constrained audit-log row — Vendors has no equivalent audit table (per spec Out of Scope: "any historical/audit-trail system... beyond the timestamp/actor fields already present"), so there is no unique constraint an idempotency key could usefully anchor to. Matching Feature 007's precedent (the more directly analogous "plain CRUD list" feature, not Feature 008's "administers a sensitive permission with an audit trail" feature) is the correct brownfield choice — adding idempotency infrastructure here would be new complexity with no existing anchor point, which the planning brief explicitly says not to introduce automatically.

**Alternatives considered**: A client-generated `operationId` with an application-level dedupe check — rejected; there is no table to dedupe against without inventing new schema, which is explicitly out of scope.

## R8 — Delete-of-already-deleted / not-found behavior

**Decision**: `DELETE .../[itemId]` returns `404 vendor_item_not_found` if the item does not exist (already deleted, wrong event, or never existed) — a plain not-found, not a Feature-008-style silent no-op success.

**Rationale**: Compared against Feature 007's `deleteTask` (already the more directly analogous precedent — a plain, non-audited CRUD delete): it throws `PlannerTaskNotFoundError` on a missing row, which the route maps to `404 task_not_found`. Feature 008's disable-is-a-no-op-success pattern exists specifically because Disable is idempotent domain behavior on a resource that is expected to still exist in a different state (an assignment being turned off, not removed) — Vendors' delete is a genuine, irreversible removal with no "already in the target state" concept once the row is gone, so Tasks' plain-404 precedent is the correct fit, not Feature 008's no-op-success one.

**Alternatives considered**: Returning `200 ok` for an already-deleted item (treating repeated delete calls as idempotent no-ops) — considered because it is a defensible general REST convention, but rejected in favor of matching this codebase's own existing, more specific precedent (Tasks) over a generic external convention, per Brownfield Preservation.

## R9 — `EventLayout.tsx`'s per-tab capability-gating is Tasks-specific, not generic

**Decision**: Add a second, parallel, Vendors-specific block to `EventLayout.tsx` (its own `plannerVendorCapability` state, its own fetch effect, its own `isSectionAvailable`/`activeSectionUnavailable` branches keyed on `section.key === 'planner-vendors'`), mirroring the existing `planner-tasks` block structurally rather than generalizing the two into a shared abstraction.

**Rationale**: Freshly re-read `EventLayout.tsx` in full. Its per-caller, capability-aware tab-visibility logic (`PlannerTaskCapabilityState`, `plannerTaskCapabilityPending`, `plannerTasksDeferToPage`) is written entirely in terms of the literal string `'planner-tasks'` and Tasks' own capability shape — there is no existing generic "any Planner module with per-caller view capability" mechanism to plug into. Every other `EVENT_SECTIONS` entry is gated purely on product-level availability (`productAvailability[section.product]`), which is necessary but not sufficient for Vendors (a caller can have Planner product access for the event but still lack `can_view_vendors` specifically). Introducing a generic capability-gating abstraction now, to serve a single second consumer, would be exactly the kind of speculative abstraction Brownfield Preservation and Scope Discipline both warn against — Feature 007 itself did not build one when it had the same opportunity. The correct brownfield move is to repeat Feature 007's own concrete shape for Vendors, the same way Feature 007 was added as a parallel block rather than a refactor of the pre-existing product-only gating.

**Alternatives considered**: Generalizing both Tasks' and Vendors' capability-gating into one shared hook/state shape in the same pass — rejected as an unrelated refactor bundled into this feature (explicitly disallowed by Constitution I/VI unless it blocks this feature, which it does not); flagged instead as a reasonable candidate for a future, dedicated cleanup pass once a third Planner module (Checklist) makes the duplication three-deep rather than two.

## R10 — Provisioning/product-gating sequence

**Decision**: Reuse the exact 7-step sequence already established by `planner-tasks/route.ts` verbatim: authenticate → resolve selected organization → `requireEventWorkspaceAccess` → `isProductAvailableForEvent(..., 'planner', ...)` → `resolveProvisioningPhase` → `event_planner_links` resolution → `resolveCallerPlannerIdentity` → capability resolution.

**Rationale**: This sequence is already proven, converged, and re-verified across Features 005, 007, and 008 with zero drift between them (each route file copies it inline rather than sharing a helper, a deliberate, already-established convention per Feature 008's own plan.md: "so no future edit to one route can silently alter another's authorization behavior"). Vendors introduces no new gating concept, so it follows the identical sequence with zero deviation.
