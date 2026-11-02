# Research: Organisation Products Management (Feature 022)

Live state verified on 2026-10-15 against both projects: Bendie/Portal `droaamagpsojkzznywgd` and Planner `zghoaawgrmvqdlksuiam`.

## Live-state findings

| # | Finding | Consequence |
|---|---|---|
| L1 | `organization_products (organization_id, product_key, is_active, enabled_at, enabled_by)`, PK `(organization_id, product_key)`. RLS: platform admin manages everything; org members read their own. 11 rows over 10 organisations (Bendie only, Planner only, or both). | Pausing is just `is_active = false`; the Portal already hides inactive products (`getAvailableProducts`, `isProductAvailableForEvent`). No "last changed by/when" exists, so columns are needed. |
| L2 | `event_products` has FK `(organization_id, product_key)` → `organization_products`, so a used product row can't be deleted. A consistency trigger exists. Platform admin manages, members read. | "Pause, never remove" (FR-013) is already enforced by the database. |
| L3 | `organization_planner_links` (PK `organization_id`, UNIQUE `planner_organization_id`); only policy: platform admin. 4 links (Sample → 3, Acme → 4, CIPLA → 12, Xperia → 13). | One-to-one (FR-017) is already enforced. Reading it needs platform admin, which this feature has. |
| L4 | Planner `organizations (organization_id identity, name, slug UNIQUE, is_active default true)`. Orgs: 1 Stawi Experiences, 3, 4, 12, 13. **`is_active` is referenced by no function or policy.** | Option A must add enforcement (R2). Creating a Planner organisation needs a unique slug. |
| L5 | Planner event access goes through a few primitives: `is_org_admin(org)` (behind `is_admin_for_org`, `is_org_admin_for_event`, `is_admin_for_event`), `is_assigned_to_event`, and `is_event_admin`. Direct `event_user_assignments … is_active` checks sit in `has_event_module`, `can_view/manage_event_checklist`, `can_view/manage_event_vendors`, `can_manage_operational_task`, `can_see_profile`, and the policies `events_select_assigned_or_admin`, `event_notifications_insert_admin_or_task_managers` and `event_notifications_update_read_state`. Data tables (agenda, production, logistics, tasks, passengers, notifications) all use these helpers. | R2 covers the primitives, the direct checks and the 3 policies. The SECURITY DEFINER RPCs that read assignments themselves are listed for guarding (R2). |
| L6 | `create_event_with_products` inserts `event_products` rows, the creator's `event_members` row, and sets `events.planner_provisioning_status` to `pending` (Planner) or `not_required`. The route then calls `provisionPlannerEvent` (`src/lib/plannerEventProvisioning.ts`), which re-checks the entitlement and the Planner link. There's also a retry route (`/api/events/[eventId]/retry-planner-provisioning`). | "Add Planner to an existing event" = insert `event_products` + set status `pending` (service role, because the column is privilege-restricted), then call `provisionPlannerEvent`. "Add Bendie" = insert `event_products` only. |
| L7 | `organization_audit_log (organization_id, table_name, action, row_id, diff, actor_user_id, created_at)`. Platform admin reads; anyone may insert. `log_org_content_change()` uses `NEW.id`, and is attached to `teams` and `organization_assets`. | `organization_products` has no `id`, so it needs its own trigger function (R4). The actor is `auth.uid()`, so writes must use the caller's session (R5). |
| L8 | `CreateOrganizationModal` inserts only `name, slug, created_by`. It's opened from `TopHeader` for platform admins. | It is replaced by the new create flow (US2). |
| L9 | Middleware: `/portal` lets in platform admins and organisation members. There is no `/portal/admin` area. | Add a middleware rule: `/portal/admin/*` is for platform admins only (R6). |
| L10 | The org-facing Portal treats an inactive product as absent. `AvailableProductsContext`, `useProductGuard`, the event layout and `/portal/no-product` redirect away from it. | Add a paused state alongside active/none (R7). |

## Decisions

### R1 — Access and architecture
- **Pages:** `/portal/admin/organisations` and `/portal/admin/organisations/[organizationId]`. Every page and every route re-checks platform admin.
- **Reads:** pages read Portal tables directly with the browser client. Platform-admin row-level security already allows reading every organisation, product, link, event and member (L1–L3).
- **Writes:** all changes go through new **`/api/admin/organizations/**`** routes (the constitution's platform-admin-only zone). Each route:
  1. verifies platform admin server-side
  2. makes the Portal writes with the **caller's own session**, so audit triggers record who did it
  3. uses the service-role keys only for the Planner project and for the privilege-restricted provisioning columns
- **Alternatives rejected:**
  - Browser writes: Planner calls need server-only keys, and multi-step changes need one place for compensation.
  - Service-role Portal writes: they would lose the actor in the audit history.

### R2 — Option A: Planner respects its organisation switch (Planner SQL, run by the developer)
- **New helpers (SECURITY DEFINER, `search_path = public`):**
  - `is_org_active(p_org_id bigint)`: `organizations.is_active`, true for an unknown id (fail-open only for missing rows, which can't own events).
  - `is_event_org_active(p_event_id bigint)`: the event's organisation is active.
- **Gate:** every non-platform-admin access path ANDs this:
  - `is_org_admin(org)` gets `AND is_org_active(org)`, which covers `is_admin_for_org`, `is_org_admin_for_event` and `is_admin_for_event`.
  - `is_assigned_to_event`, `is_event_admin`, and the assignment branches of `has_event_module`, `can_view/manage_event_checklist`, `can_view/manage_event_vendors`, `can_manage_operational_task` and `can_view_operational_task` (assignee branch) get `AND is_event_org_active(event)`.
  - The policies `events_select_assigned_or_admin`, `event_notifications_insert_admin_or_task_managers` and `event_notifications_update_read_state` get the same condition on their assignment check.
  - **SECURITY DEFINER RPCs** that read assignments themselves get an early guard: `get_home_dashboard_summary`, `get_event_notifications`, `mark_event_notifications_as_read`, `get_event_task_assignable_profiles`, `create_operational_task_v2`, `set_operational_task_part_status`, `update_my_task`, `notify_event_audience`, `notify_task_audience`, `get_push_delivery_targets`. Read RPCs return nothing; write RPCs raise "This organisation's Planner access is paused."; push targets drop the paused org's events.
- **Platform admins** (`is_platform_admin()`) are never affected. `can_see_profile` stays as is (profile visibility without event data).
- **Delivery:**
  - A file `specs/022-org-products-admin/planner-sql/enforce_planner_organization_active.sql`, built from the **live** function definitions at implementation time and changing only the added conditions. Same precedent as Feature 020.
  - The developer runs it in the Planner project.
  - Before and after, check that an active organisation's access is unchanged.
- **Storage (U3):** the Planner `storage.objects` policies are checked in the same pass, and gated the same way if they are event- or organisation-scoped.
- **Revert (U2):** a revert file with the original live definitions is written alongside, so the change can be undone in one paste.
- **Enforcement check (I1):** the impact route reports `plannerEnforcementLive` (whether Planner's `is_org_active` exists). The "Also pause Planner app access" option is offered, and accepted by the API, only when it's live.
- **Alternative rejected:** Option B (turning off each person's access) was rejected by the developer on 2026-10-15.

### R3 — Planner connection and creation
- **Connect existing:** list Planner organisations not in `organization_planner_links` and not organisation 1 (Stawi), via the Planner service key. Insert the link with the caller's session (`linked_by = caller`). UNIQUE prevents double use (L3).
- **Create new:** insert a Planner `organizations` row with the Portal organisation's name and a slug derived from the Portal slug or name, with a numeric suffix on collision, and `is_active = true`. Then insert the link.
  - If the Portal write fails after the Planner organisation was created, the route deletes that just-created Planner organisation (compensation) and returns the error.
- **Read-only once set** (FR-007, FR-013).
- **Atomic create (/speckit-analyze U1):** the Portal side of "create organisation" (organisation, product rows, Planner link) runs in a single `SECURITY INVOKER` database function, `admin_create_organization`, so it is all or nothing. Only the Planner-org creation sits outside it, compensated by deletion.

### R4 — Product history
- **Trigger function:** new `log_organization_product_change()` on `organization_products` (row_id = `product_key`) and `organization_planner_links` (row_id = `planner_organization_id`). It writes to `organization_audit_log` with `auth.uid()`.
- **Planner app access pause/resume** is recorded by the `organization_planner_links` trigger as the UPDATE of `planner_app_paused_at` / `planner_app_paused_by` (implementation correction: `organization_audit_log.action` only allows INSERT/UPDATE/DELETE, so a separate PAUSE/RESUME entry would be rejected).
- **"Product added to an event"** is logged with `table_name = 'event_products'`, `action = 'INSERT'`, and the event id goes into the diff.
- **History view:** reads `organization_audit_log` filtered to these table names, newest first, with actor names from `profiles`.

### R5 — "Who / when" and the paused-access state
- **Product changes:** `organization_products` gains `status_changed_at timestamptz` and `status_changed_by uuid → profiles`, stamped by a BEFORE UPDATE trigger whenever `is_active` changes (`auth.uid()`, `now()`).
- **Planner app access:** `organization_planner_links` gains `planner_app_paused_at timestamptz NULL` and `planner_app_paused_by uuid NULL`. They mirror the Planner flag for display; Planner's `organizations.is_active` stays the enforcement truth. The pause/resume route sets both; resume clears them.

### R6 — Middleware
`src/middleware.ts`: `/portal/admin/*` requires a platform admin (existing global-role check and cache), otherwise redirect to `/unauthorized`. The pages also check `isGlobalAdmin` (defence in depth). The "Manage organisations" link is shown only when `isGlobalAdmin`.

### R7 — Organisation users' paused state
- **Product states:** `getAvailableProducts` gains a sibling, `getProductStates(orgId)`, returning `{ bendie, planner }` as `'active' | 'paused' | 'none'`. It's one query of all rows, readable by members (L1). `AvailableProductsContext` exposes it.
- **Where the paused state shows:**
  - **Top-header switcher:** a paused product appears disabled with a "Paused" pill and the message.
  - **`/portal/bendie` and `/portal/planner` home pages, and the event workspace for a paused product:** a new `PausedProductNotice` replaces the redirect, reading "{Product} is paused for your organisation — contact Stawi to resume it."
  - **All products paused:** `/portal/no-product` shows a paused variant.
- **Entitlement logic is unchanged** (paused still means unavailable). Only the presentation changes.

### R8 — Stale writes (FR-018)
Product switch requests carry `expectedActive`. The route updates `WHERE is_active = expectedActive`; 0 rows means `409` "This product was changed by someone else — reload." Planner connection relies on the UNIQUE/PK constraints, mapped to `409`.

### R9 — Impact numbers for the pause dialog
`GET …/impact?product=` returns:
- **Events using the product:** count of `event_products` for the organisation.
- **For Planner, people with Planner access:** distinct active `event_user_assignments` profiles on the organisation's Planner events (from `event_planner_links`), plus the Planner organisation's org admins. Counted with the Planner service key.

### R10 — Code placement (Principle II)
- **New lib `src/lib/orgProductsAdmin.ts`:** types, state helpers, slug helper. Pure, plus a server-only module `src/lib/orgProductsAdminServer.ts` for the shared route logic (platform-admin verification, Planner organisation create/list, impact counts).
- **New components** under `src/components/portal/admin/`: `CreateOrganizationFlow`, `ProductsCard`, `PauseProductDialog`, `AddProductToEvents`, `OrganisationHistory`, `PlannerConnectionPicker`. Plus `src/components/portal/PausedProductNotice.tsx`.
- **`CreateOrganizationModal`** is replaced. `TopHeader` opens the new flow and gets the "Manage organisations" entry.

### R11 — Team sync while Planner is paused (/speckit-analyze U4)
- **Decision:** Portal → Planner team sync (`plannerStaffSync`, member role changes) keeps running while an organisation's Planner product is paused. It only adds or updates people's Planner assignments; nothing is removed.
- **Rationale:** Planner is then up to date the moment the product resumes. Access during the pause is still blocked by the Portal (product hidden) and, if chosen, by Planner enforcement (R2).
- **Alternative rejected:** skipping sync while paused would leave Planner stale after resume, with no catch-up mechanism.
