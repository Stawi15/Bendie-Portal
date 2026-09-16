# Phase 1 Data Model: Organization Product Entitlements & Event Product Foundation

Revised 2026-09-16. One new migration, `organization_and_event_product_foundation.sql`, applied
via the `apply_migration` MCP tool. Everything lives in Portal's own Supabase project; no change
is made to Bendie Planner's project. **`organization_members` is not created by this migration —
it already exists and is only read from, never altered, by this feature.**

## Reused, Unmodified: Organization Membership (`organization_members`)

Already live (see `research.md` item 0). Answers "which organizations does this user belong to,
and with what role?" This feature's new tables relate to it only by reading through its existing
RLS helpers (`is_organization_member()`, `is_organization_admin()`) for the new member-scoped
`SELECT` policies below — no row, column, policy, or trigger on this table is touched.

## Entity: Organization Product Entitlement (new table `organization_products`)

Represents that a specific organization is entitled to use a specific product. The authoritative
answer to "what can this organization use?" — the prerequisite every event-level record below is
checked against (spec FR-001–FR-005).

| Column | Type | Notes |
|---|---|---|
| `organization_id` | `uuid`, `NOT NULL`, FK → `organizations.id` `ON DELETE CASCADE` | Part of the composite primary key. |
| `product_key` | `text`, `NOT NULL`, `CHECK (product_key IN ('bendie', 'planner'))` | Part of the composite primary key. |
| `is_active` | `boolean`, `NOT NULL`, default `true` | Supports future revocation without deleting history — matches `event_planner_links.is_active`'s exact precedent (`research.md` item 3). |
| `enabled_at` | `timestamptz`, `NOT NULL`, default `now()` | |
| `enabled_by` | `uuid`, nullable, FK → `profiles.id` `ON DELETE SET NULL` | `NULL` for every backfilled row. |

```sql
PRIMARY KEY (organization_id, product_key)
```

**Validation rules**: The composite primary key enforces "no duplicate organization/product pairs"
(FR-002) as a hard constraint. This is the table every `event_products` row is checked against —
see the composite foreign key below.

**RLS**:

```sql
CREATE POLICY "Global admins can manage all organization products"
  ON public.organization_products
  FOR ALL
  USING (public.portal_is_global_admin())
  WITH CHECK (public.portal_is_global_admin());

CREATE POLICY "Organization members can view their own organization's products"
  ON public.organization_products
  FOR SELECT
  USING (public.is_organization_member(organization_id));
```

Only a platform (global) administrator can create/update/delete a row (FR-005, FR-024, FR-028) —
an organization's own owner/admin/member cannot self-grant a product, matching the explicit
security requirement. A `SELECT`-only policy for existing organization members is added so a later
feature can build the product-aware navigation this foundation exists for without requiring another
migration (spec FR-026) — this is strictly additive to what the original plan had and grants no
write access.

## Entity: Event Product Usage (revised table `event_products`)

Represents that a specific event uses a specific product, always constrained to what its own
organization is entitled to (spec FR-006–FR-010).

| Column | Type | Notes |
|---|---|---|
| `event_id` | `uuid`, `NOT NULL`, FK → `events.id` `ON DELETE CASCADE` | Part of the composite primary key. |
| `product_key` | `text`, `NOT NULL`, `CHECK (product_key IN ('bendie', 'planner'))` | Part of the composite primary key. |
| `organization_id` | `uuid`, `NOT NULL`, FK → `organizations.id` `ON DELETE CASCADE` | **New in this revision.** Denormalized from `events.organization_id`, kept consistent by trigger (below) — exists solely to make the composite entitlement FK possible. Never set independently by application code; always derived from the event. |
| `enabled_at` | `timestamptz`, `NOT NULL`, default `now()` | Unchanged from the original plan. |
| `enabled_by` | `uuid`, nullable, FK → `profiles.id` `ON DELETE SET NULL` | Unchanged from the original plan. |

```sql
PRIMARY KEY (event_id, product_key),
FOREIGN KEY (organization_id, product_key) REFERENCES public.organization_products (organization_id, product_key)
```

**The entitlement invariant (spec FR-008), enforced two ways, matching `event_members`'s own
existing, live precedent exactly**:

1. The composite FK above makes it a hard, database-level impossibility to insert an
   `event_products` row whose `(organization_id, product_key)` doesn't exist in
   `organization_products` — this is what actually prevents an event from using an unentitled
   product, unbypassable by any client (`research.md` item 4).
2. A `BEFORE INSERT/UPDATE` trigger keeps the denormalized `organization_id` honest against the
   event's real `events.organization_id`, so nothing can smuggle in a mismatched organization to
   route around the entitlement check:

```sql
CREATE OR REPLACE FUNCTION public.enforce_event_product_org_consistency()
RETURNS trigger AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT e.organization_id INTO v_org_id FROM public.events e WHERE e.id = NEW.event_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Event % does not exist', NEW.event_id;
  END IF;
  IF NEW.organization_id IS DISTINCT FROM v_org_id THEN
    RAISE EXCEPTION 'event_products.organization_id (%) must match events.organization_id (%)', NEW.organization_id, v_org_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_event_products_org_consistency
  BEFORE INSERT OR UPDATE ON public.event_products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_event_product_org_consistency();
```

**RLS**:

```sql
CREATE POLICY "Global admins can manage all event products"
  ON public.event_products
  FOR ALL
  USING (public.portal_is_global_admin())
  WITH CHECK (public.portal_is_global_admin());

CREATE POLICY "Organization members can view their organization's event products"
  ON public.event_products
  FOR SELECT
  USING (public.is_organization_member(organization_id));
```

Same reasoning as `organization_products` above — write access stays platform-admin-only; read
access is opened to the event's own organization's members, scoped by the same denormalized
`organization_id` the entitlement check itself relies on.

## Entity: Organization Planner Mapping (revised table `organization_planner_links`)

Unchanged purpose from the original plan (spec FR-017–FR-022), with one revision:

| Column | Type | Notes |
|---|---|---|
| `organization_id` | `uuid`, PK, FK → `organizations.id` `ON DELETE CASCADE` | Unchanged — enforces "at most one mapping per organization" (FR-018). |
| `planner_organization_id` | `bigint`, `NOT NULL`, **`UNIQUE`** | **Revised**: now unique, enforcing tenant isolation (FR-019) — see `research.md` item 5. |
| `planner_organization_name` | `text`, nullable | Unchanged. |
| `linked_by` | `uuid`, nullable, FK → `profiles.id` `ON DELETE SET NULL` | Unchanged. |
| `created_at`, `updated_at` | `timestamptz`, `NOT NULL`, default `now()` | Unchanged; `updated_at` still maintained by the existing `set_updated_at()` trigger. |

**RLS** (unchanged from the original plan — administrator-only for both read and write, per spec
FR-025; no member-scoped `SELECT` policy is added here, unlike the two tables above, since no
approved future reader of a Bendie-Planner-internal identifier has been identified):

```sql
CREATE POLICY "Global admins can manage all organization planner links"
  ON public.organization_planner_links
  FOR ALL
  USING (public.portal_is_global_admin())
  WITH CHECK (public.portal_is_global_admin());
```

## Migration / Backfill (revised order — see `research.md` item 6)

```sql
-- Step 1: organization_products, derived ONLY from real existing events/links,
-- never a blanket grant (spec FR-011-FR-013).
INSERT INTO public.organization_products (organization_id, product_key)
SELECT DISTINCT organization_id, 'bendie' FROM public.events
ON CONFLICT (organization_id, product_key) DO NOTHING;

INSERT INTO public.organization_products (organization_id, product_key)
SELECT DISTINCT e.organization_id, 'planner'
FROM public.events e
JOIN public.event_planner_links epl ON epl.event_id = e.id
WHERE epl.is_active = true
ON CONFLICT (organization_id, product_key) DO NOTHING;

-- Step 2: event_products, now safe to insert because every organization
-- referenced below already has its matching entitlement row from Step 1.
INSERT INTO public.event_products (event_id, product_key, organization_id)
SELECT id, 'bendie', organization_id FROM public.events
ON CONFLICT (event_id, product_key) DO NOTHING;

INSERT INTO public.event_products (event_id, product_key, organization_id)
SELECT epl.event_id, 'planner', e.organization_id
FROM public.event_planner_links epl
JOIN public.events e ON e.id = epl.event_id
WHERE epl.is_active = true
ON CONFLICT (event_id, product_key) DO NOTHING;
```

**Why this is safe and idempotent**: Both `ON CONFLICT DO NOTHING` clauses make every statement
safe to re-run (spec FR-016). Step 2 cannot fail its composite FK check because Step 1 always runs
first within the same migration and derives entitlement from the exact same underlying data (every
organization with a `bendie`-using event gets a `bendie` entitlement; every organization with an
actively-linked event gets a `planner` entitlement) — so the set of `(organization_id,
product_key)` pairs Step 2 will insert is always a subset of what Step 1 just created.

## Full Migration Structure

```sql
-- ============================================================
-- Organization Product Entitlements & Event Product Foundation
-- (Feature 002, revised). Foundational, additive-only.
-- organization_members is NOT created here -- it already exists
-- and is only read from (via its existing RLS helpers) by the
-- new member-scoped SELECT policies below. Does not alter
-- event_planner_links or any feature-001 table/semantics.
-- ============================================================

CREATE TABLE public.organization_products (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_key text NOT NULL CHECK (product_key IN ('bendie', 'planner')),
  is_active boolean NOT NULL DEFAULT true,
  enabled_at timestamptz NOT NULL DEFAULT now(),
  enabled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (organization_id, product_key)
);

ALTER TABLE public.organization_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Global admins can manage all organization products"
  ON public.organization_products FOR ALL
  USING (public.portal_is_global_admin()) WITH CHECK (public.portal_is_global_admin());

CREATE POLICY "Organization members can view their own organization's products"
  ON public.organization_products FOR SELECT
  USING (public.is_organization_member(organization_id));

CREATE TABLE public.event_products (
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  product_key text NOT NULL CHECK (product_key IN ('bendie', 'planner')),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled_at timestamptz NOT NULL DEFAULT now(),
  enabled_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (event_id, product_key),
  FOREIGN KEY (organization_id, product_key) REFERENCES public.organization_products (organization_id, product_key)
);

ALTER TABLE public.event_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Global admins can manage all event products"
  ON public.event_products FOR ALL
  USING (public.portal_is_global_admin()) WITH CHECK (public.portal_is_global_admin());

CREATE POLICY "Organization members can view their organization's event products"
  ON public.event_products FOR SELECT
  USING (public.is_organization_member(organization_id));

CREATE OR REPLACE FUNCTION public.enforce_event_product_org_consistency()
RETURNS trigger AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT e.organization_id INTO v_org_id FROM public.events e WHERE e.id = NEW.event_id;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Event % does not exist', NEW.event_id;
  END IF;
  IF NEW.organization_id IS DISTINCT FROM v_org_id THEN
    RAISE EXCEPTION 'event_products.organization_id (%) must match events.organization_id (%)', NEW.organization_id, v_org_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_event_products_org_consistency
  BEFORE INSERT OR UPDATE ON public.event_products
  FOR EACH ROW EXECUTE FUNCTION public.enforce_event_product_org_consistency();

CREATE TABLE public.organization_planner_links (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  planner_organization_id bigint NOT NULL UNIQUE,
  planner_organization_name text,
  linked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.organization_planner_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Global admins can manage all organization planner links"
  ON public.organization_planner_links FOR ALL
  USING (public.portal_is_global_admin()) WITH CHECK (public.portal_is_global_admin());

CREATE TRIGGER set_organization_planner_links_updated_at
  BEFORE UPDATE ON public.organization_planner_links
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Backfill (order matters -- see above)
INSERT INTO public.organization_products (organization_id, product_key)
SELECT DISTINCT organization_id, 'bendie' FROM public.events
ON CONFLICT (organization_id, product_key) DO NOTHING;

INSERT INTO public.organization_products (organization_id, product_key)
SELECT DISTINCT e.organization_id, 'planner'
FROM public.events e
JOIN public.event_planner_links epl ON epl.event_id = e.id
WHERE epl.is_active = true
ON CONFLICT (organization_id, product_key) DO NOTHING;

INSERT INTO public.event_products (event_id, product_key, organization_id)
SELECT id, 'bendie', organization_id FROM public.events
ON CONFLICT (event_id, product_key) DO NOTHING;

INSERT INTO public.event_products (event_id, product_key, organization_id)
SELECT epl.event_id, 'planner', e.organization_id
FROM public.event_planner_links epl
JOIN public.events e ON e.id = epl.event_id
WHERE epl.is_active = true
ON CONFLICT (event_id, product_key) DO NOTHING;
```

## `src/types/database.ts` additions

```typescript
organization_products: {
  Row: {
    organization_id: string;
    product_key: 'bendie' | 'planner';
    is_active: boolean;
    enabled_at: string;
    enabled_by: string | null;
  };
  Insert: {
    organization_id: string;
    product_key: 'bendie' | 'planner';
    is_active?: boolean;
    enabled_at?: string;
    enabled_by?: string | null;
  };
};
event_products: {
  Row: {
    event_id: string;
    product_key: 'bendie' | 'planner';
    organization_id: string;
    enabled_at: string;
    enabled_by: string | null;
  };
  Insert: {
    event_id: string;
    product_key: 'bendie' | 'planner';
    organization_id: string;
    enabled_at?: string;
    enabled_by?: string | null;
  };
};
organization_planner_links: {
  Row: {
    organization_id: string;
    planner_organization_id: number;
    planner_organization_name: string | null;
    linked_by: string | null;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    organization_id: string;
    planner_organization_id: number;
    planner_organization_name?: string | null;
    linked_by?: string | null;
  };
};
```

No changes to `organization_members`'s existing type entry. No standalone exported `ProductKey`
union type is added — see the original `research.md` item on this, unchanged.

## Non-Entities: No change to `event_planner_links` or `organization_members`

Both are read-only inputs to this feature's design and backfill. Neither's schema, RLS, or
semantics is touched, per spec FR-031 and Constitution Principle I.
