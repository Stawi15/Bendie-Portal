# Phase 0 Research: Organization Product Entitlements & Event Product Foundation

Revised 2026-09-16. Every item below was verified against the live Portal Supabase database during
this revision (via the `supabase` MCP), not assumed — including one finding significant enough to
change this feature's entire shape (item 0).

## 0. Does `organization_members` already exist? *(the pivotal finding of this revision)*

**Finding**: **Yes — fully built, live, and already used throughout the app.**

```
organization_members (organization_id, user_id) PRIMARY KEY
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE
  user_id         uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE
  role            text NOT NULL DEFAULT 'member'
                  CHECK (role IN ('owner','admin','member','attendee','facilitator','staff'))
  created_at      timestamptz NOT NULL DEFAULT now()
```

Live RLS (already in production, unchanged by anything in this feature):
- `organization_members_select_org_member`: `is_organization_member(organization_id)`
- `organization_members_insert_self`: a user may insert themselves if they're already an org
  admin/creator, or an org admin may add anyone
- `organization_members_update_owner_admin`: `is_organization_admin(organization_id)`
- Global admins retain a separate `FOR ALL`/`SELECT` override, as with every other table

Live helper functions (already in production):
```sql
is_organization_member(org_id, uid) → EXISTS row in organization_members
is_organization_admin(org_id, uid)  → EXISTS row WHERE role IN ('owner','admin')
```

Live usage confirmed across 9 existing files including `portalAuth.ts` (`isOrgAdmin`),
`useOrgPeople.ts`, the People page, `TeamMembersModal.tsx`, `AddPersonModal.tsx`, and
`create-user/route.ts`. Live data: 163 `member` rows, 80 `attendee` rows, 2 `owner` rows.

**Decision**: This feature does **not** create `organization_members`. It is reused exactly as-is.
The "evaluate introducing organization_members" instruction in the revision brief is answered:
don't — it already exists and duplicating it would violate Constitution Principle I directly.

**Rationale**: This is precisely the "identify any existing table that already provides one of
these concepts" check the revision explicitly required before adding anything.

**Alternatives considered**: N/A — this is a fact-check, not a design choice.

## 1. Does an organization-admin authorization concept already exist?

**Decision**: Yes — `is_organization_admin()` (role `IN ('owner','admin')`), already live, already
matches `portalAuth.ts`'s existing `isOrgAdmin()` function exactly. No new concept is introduced.

**Rationale**: Direct precedent found via `pg_proc` inspection; this is the same "dormant but
complete" RLS layer already noted for `events`/`event_members` in the broader Planner Portal
Experience architecture discovery — currently unreachable in practice only because
`middleware.ts` gates all of `/portal` to platform (global) admins, not because the underlying
authorization model is missing.

**Alternatives considered**: None — this is a verified existing fact.

## 2. `organization_products` — new table, genuinely required

**Decision**: A new table is required; no existing table represents "what has this organization
purchased/been granted." `organization_members` answers *who* belongs to an org; nothing existing
answers *what the org can use*.

**Rationale**: Checked directly — no column on `organizations`, `organization_members`, or any
other existing table carries this concept.

**Alternatives considered**: Overloading `organization_members.role` or a new column on
`organizations` — rejected; entitlement is a many-valued (per-product), independently-revisable
fact about the organization, not a property of a membership row or a single organization column.

## 3. `organization_products` active/inactive representation

**Decision**: `is_active boolean NOT NULL DEFAULT true`, not a text `status` column.

**Rationale**: Matches this codebase's own established convention exactly
(`event_planner_links.is_active boolean`) rather than introducing a new "status enum" shape this
codebase has never used for an is-this-still-valid concept. Fully supports future revocation
(flip to `false`, preserving history) without deletion, satisfying the requirement to not block
future billing/subscription integration while adding nothing speculative now.

**Alternatives considered**: `status text CHECK (status IN ('active','inactive'))` as floated in
the revision brief — rejected in favor of the boolean already used identically elsewhere in this
schema; no behavioral difference, just consistency with existing precedent.

## 4. Enforcing "an event cannot use a product its organization isn't entitled to"

**Decision**: A real, unbypassable database-level constraint — not merely an application check —
achieved by (a) denormalizing `organization_id` onto `event_products` (redundant with
`events.organization_id`, kept consistent by a trigger), and (b) a composite foreign key
`(organization_id, product_key) REFERENCES organization_products(organization_id, product_key)`.

**Rationale**: A simple FK from `event_products.event_id` to `events.id` cannot express "and that
event's organization must have this product" — Postgres foreign keys only match against columns
physically present on the referencing row. **This codebase already has a direct, live precedent for
exactly this problem**: `event_members` already denormalizes `organization_id` (redundant with
`events.organization_id`) specifically so a `BEFORE INSERT/UPDATE` trigger
(`enforce_event_member_integrity()`, confirmed live) can raise an exception if the two ever
disagree. `event_products` follows the identical pattern: its own
`enforce_event_product_org_consistency()` trigger keeps the denormalized `organization_id`
honest, and the composite FK does the actual entitlement enforcement — genuinely unbypassable by
any client, service-role write included, since it's a real constraint, not an application-layer
check that a route could forget to run.

**Alternatives considered**:
- *Application-layer check only* — rejected: the spec (FR-008) explicitly requires this cannot be
  bypassed by a client-supplied value, and an app-layer check is exactly the kind of thing a future
  route could forget, especially once several features are adding write paths to this table.
- *A view or generated column instead of a trigger* — rejected: Postgres cannot express a
  cross-table consistency check as a generated column, and a view doesn't enforce anything at
  write time.

## 5. `organization_planner_links` tenant isolation

**Decision**: Add `UNIQUE (planner_organization_id)`, reversing the original plan's silence on this
(the original plan explicitly left it unconstrained).

**Rationale**: The revision brief explicitly asks to default toward tenant isolation "unless there
is a verified business reason not to." No such reason was found or supplied. A unique constraint
directly enforces spec FR-019 ("the same Bendie Planner organization MUST NOT be mapped from more
than one Portal organization") as a hard schema guarantee rather than an application check.

**Alternatives considered**: Leaving it unconstrained (the original design) — rejected now that the
requirement has been made explicit; nothing about the "shared reseller" scenario mentioned in the
brief was confirmed as a real, current need.

## 6. Backfill ordering

**Decision**: `organization_products` must be backfilled *before* `event_products`, since the new
composite FK (item 4) requires an organization's entitlement row to exist before any of its
events' product rows can be inserted.

**Rationale**: Direct consequence of item 4's enforcement design — this is a hard ordering
requirement, not a preference.

**Alternatives considered**: None — this follows mechanically from the FK design.

## 7. Backfill derivation logic (organization level)

**Decision**:
- An organization receives a `bendie` entitlement if it has **at least one** existing event
  (`SELECT DISTINCT organization_id FROM events`).
- An organization receives a `planner` entitlement if, and only if, it has **at least one**
  existing event with an active `event_planner_links` row (`SELECT DISTINCT e.organization_id FROM
  events e JOIN event_planner_links epl ON epl.event_id = e.id WHERE epl.is_active = true`).
- An organization with zero events receives no entitlement rows at all.

**Rationale**: Directly satisfies the revision brief's explicit example ("if an existing
organization has Bendie events, it likely needs a Bendie entitlement... if it owns an event with an
active Planner link, it likely needs both") and spec FR-011–FR-013, using only real, existing data
as evidence — never a blanket grant.

**Alternatives considered**: Granting every organization a `bendie` entitlement unconditionally
(even with zero events) — rejected; would contradict "never grant an entitlement an organization's
real existing data does not support" (FR-011) for organizations that were created but never used.

## 8. All items retained unchanged from the original plan

Items 1–2, 5, 7–11 of the original `research.md` (migration-naming convention; `event_products`
composite primary key shape; `product_key` as `text` + `CHECK` rather than a Postgres enum;
`organization_planner_links.organization_id` as its own primary key; RLS pattern choice of
`portal_is_global_admin()`-based `FOR ALL`, extended with new member-scoped `SELECT` policies per
spec FR-026; `planner_organization_id` as a plain `bigint`, no cross-project FK; `ON DELETE`
cascade/set-null choices; `updated_at` trigger reuse; hand-maintained `database.ts` convention) are
retained unchanged and are not repeated here — see `data-model.md` for their application to the
revised table set.
