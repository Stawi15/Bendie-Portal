# Implementation Plan: Organisation Products Management

**Branch**: `022-org-products-admin` | **Date**: 2026-10-15 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/022-org-products-admin/spec.md`

## Summary

A platform-admin-only **Organisations** area (`/portal/admin/organisations`) lists every organisation with its product states and Planner connection. It creates organisations with products and a Planner connection (existing or new Planner organisation), switches products on and off with the impact shown, and adds a newly enabled product to existing events. All of it goes through new platform-admin routes under `src/app/api/admin/organizations/**`.

**Product data:** pausing reuses `organization_products.is_active`, which the Portal already treats as unavailable. One migration adds who/when columns, the Planner app pause mirror columns, and a product-history trigger.

**Planner side (Option A):** a developer-run Planner SQL makes Planner honour its own `organizations.is_active`. Pausing app access is then one switch, and only Planner platform admins keep access.

**Organisation users:** they see a "paused" notice instead of the product disappearing.

> **Naming (/speckit-analyze T1):** user-facing text and page paths use UK spelling ("organisations", `/portal/admin/organisations`). Code, tables and API paths keep the existing US spelling (`organizations`, `/api/admin/organizations`). This matches the rest of the codebase.

## Technical Context

**Language/Version**: TypeScript 5, Next.js 14 App Router, React 18; SQL (PostgreSQL 15, Supabase).

**Primary Dependencies**:
- `@supabase/supabase-js` and `@supabase/ssr`, with cookie-auth route clients as in the existing `api/admin` routes
- the existing Planner admin client (`getPlannerAdminClient`)
- `provisionPlannerEvent`
- existing portal components: `SectionHeader`, `FormModal`, `useConfirm`, toast

**Storage**: the shared Bendie Supabase project (one new migration), and the Planner Supabase project (SQL run by the developer).

**Testing**: there is no automated suite. Verification is type-check, lint and an isolated build, plus the [quickstart.md](quickstart.md) scenarios, including a Planner before/after access check.

**Target Platform**: the Portal web app (desktop-first).

**Project Type**: a web application (single Next.js project) plus SQL in two databases.

**Performance Goals**: the organisation list (about 10–100 organisations) loads in one round of queries; creating an organisation takes under 2 minutes end to end (SC-001).

**Constraints**:
- Platform admin only, re-checked on the server (Constitution II/IV).
- Portal writes use the caller's session, so audit records the actor.
- No data is ever deleted by a pause.
- The Planner SQL only *adds* conditions, so active organisations behave exactly as before.

**Scale/Scope**: 10 Portal organisations, 5 Planner organisations, 32 event-product rows (2026-10-15).

**Live-state verification**: done 2026-10-15; see research L1–L10.

## Constitution Check

*GATE: checked before Phase 0 and again after Phase 1. Result: **PASS**, with one justified structure addition (see Complexity Tracking).*

| Principle | Check | Result |
|---|---|---|
| I. Brownfield Preservation | Reuses `organization_products.is_active` (already the "unavailable" switch), `organization_planner_links`, `provisionPlannerEvent`, the audit log and the existing admin-route pattern. Entitlement logic is unchanged; only its presentation gains "paused". | Pass |
| II. Architecture Boundaries | Privileged actions live only in `app/api/admin/**`, platform-admin-only and re-checked per request. Pages read through the browser client under existing RLS. **New navigation structure:** `/portal/admin/*` is platform-wide, not event-scoped, so it can't fit the event tab model. Justified below. | Pass (justified) |
| III. Supabase & DB Safety | One descriptive migration with a "why" header; new columns and triggers; RLS reviewed (existing platform-admin policies cover the new columns); types updated by hand. The Planner SQL is built from live definitions at implementation time, kept as a file in the spec folder, and run by the developer (Feature 020 precedent). | Pass |
| IV. Security | Service keys stay server-side. Each route checks platform admin before acting. No org-scoped path is added, so there is no escalation. The middleware adds a `/portal/admin` gate. | Pass |
| V. UI Consistency | Uses `SectionHeader`, `FormModal`, `useConfirm`, the `.btn-*`/`.input` classes, token colours, and the choice-card and badge patterns from the UI registry. Run `/imprint` for the new admin list and Products card. | Pass |
| VI. Scope Discipline | Billing, removal, connection changes and attendee-app changes are out of scope, as the spec says. | Pass |
| VII. Documentation | Update `architecture.md` (the new admin tier area and Planner enforcement), `schema-reference.md` and `progress-tracker.md`. | Pass |
| VIII. Verification | Loading, error and empty states on both admin pages and the notices; quickstart; `/review`. | Pass |
| IX. Spec Kit + JSM | This plan is the single plan; the `/architect` blueprint was folded in. | Pass |

## Project Structure

### Documentation (this feature)

```text
specs/022-org-products-admin/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md
├── contracts/admin-organizations-api.md
├── planner-sql/enforce_planner_organization_active.sql   # written during implement, run by the developer
├── checklists/requirements.md
└── tasks.md                                               # /speckit-tasks
```

### Source Code

```text
supabase/migrations/organization_products_admin.sql          # NEW: status/paused columns, stamp + audit triggers

src/middleware.ts                                            # EDIT: /portal/admin/* platform-admin gate
src/types/database.ts                                        # EDIT: new columns; ProductState type

src/lib/orgProductsAdmin.ts                                  # NEW: pure types and helpers (states, slug)
src/lib/orgProductsAdminServer.ts                            # NEW (server-only): requirePlatformAdmin, Planner org list/create, impact
src/lib/eventAuth.ts                                         # EDIT: add getProductStates (active | paused | none)
src/contexts/AvailableProductsContext.tsx                    # EDIT: expose product states

src/app/api/admin/planner-organizations/route.ts             # NEW: GET unconnected Planner orgs
src/app/api/admin/organizations/route.ts                     # NEW: POST create
src/app/api/admin/organizations/[organizationId]/planner-connection/route.ts       # NEW
src/app/api/admin/organizations/[organizationId]/impact/route.ts                   # NEW
src/app/api/admin/organizations/[organizationId]/products/[product]/route.ts       # NEW: PATCH on/off (+ app pause)
src/app/api/admin/organizations/[organizationId]/events/[eventId]/products/route.ts # NEW: add product to event

src/app/portal/admin/organisations/page.tsx                  # NEW: list + create
src/app/portal/admin/organisations/[organizationId]/page.tsx # NEW: Products, Overview, History

src/components/portal/admin/CreateOrganizationFlow.tsx       # NEW (replaces CreateOrganizationModal)
src/components/portal/admin/PlannerConnectionPicker.tsx      # NEW
src/components/portal/admin/ProductsCard.tsx                 # NEW
src/components/portal/admin/PauseProductDialog.tsx           # NEW
src/components/portal/admin/AddProductToEvents.tsx           # NEW
src/components/portal/admin/OrganisationHistory.tsx          # NEW
src/components/portal/PausedProductNotice.tsx                # NEW
src/components/portal/TopHeader.tsx                          # EDIT: "Manage organisations" entry; open the new create flow; paused switcher state
src/components/portal/CreateOrganizationModal.tsx            # REMOVE (replaced)
src/app/portal/{bendie,planner}/page.tsx, events/[eventId]/layout.tsx, no-product/page.tsx   # EDIT: paused notice instead of redirect

context/architecture.md, schema-reference.md, progress-tracker.md, ui-registry.md   # EDIT
```

**Structure Decision**: the single Next.js project. New platform-wide pages go under `/portal/admin/`, new routes under the existing platform-admin `api/admin` zone, and the shared logic in `src/lib`.

## Implementation phases

1. **Planner enforcement (blocks US4's app-pause).**
   - Re-read the live definitions of every helper, policy and RPC in research R2.
   - Write `planner-sql/enforce_planner_organization_active.sql` (adding conditions only).
   - The developer runs it; then verify quickstart §1.
2. **Portal migration and types:** status/paused columns, the stamp trigger, the audit trigger; `database.ts`.
3. **Server library and routes:** platform-admin guard, Planner organisation list/create, and the create, connect, impact, product switch and add-to-event routes, per the contract.
4. **Admin UI:**
   - the list page and create flow (US1/US2)
   - the organisation page's Products card with the pause dialog and add-to-events list (US3/US4), plus History (US6)
   - the middleware gate and TopHeader entry
5. **Organisation-user paused state (US5):** `getProductStates`, the context, the switcher, `PausedProductNotice` and the no-product variant.
6. **Wrap-up:** docs, checks, `/imprint`, `/review`, `/speckit-converge`, commit.

## Complexity Tracking

| Addition | Why needed | Simpler alternative rejected because |
|---|---|---|
| New `/portal/admin/*` navigation area (outside the event tab model, Principle II) | Product management is platform-wide, across organisations. It can't live inside one organisation's or one event's workspace without being mistaken for org-admin settings. | A tab in the organisation workspace would sit beside org-admin-editable settings and blur who may change products. |
| Planner SQL changes many Planner helpers and policies | Planner's own `organizations.is_active` is unenforced; Option A was the developer's decision. | Option B (per-person deactivation with a restore record) drifts and was rejected 2026-10-15. |
