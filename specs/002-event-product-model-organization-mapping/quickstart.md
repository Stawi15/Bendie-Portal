# Quickstart: Organization Product Entitlements & Event Product Foundation

Revised 2026-09-16. Manual, live-database validation guide — no automated test framework exists in
this repository. All steps run against the real Portal Supabase project. Nothing here requires a
browser or dev server (no UI in this feature). Prefer rolled-back transactions for anything that
writes real-looking data.

## Prerequisites

- The migration from `data-model.md` has been applied.
- At least one pre-existing organization with events but no Planner link, and one with an actively
  linked event, are available (or create fresh ones per the destructive-step notes below).

## 1. Organization entitlement backfill correctness

```sql
-- Every organization with at least one event must have a 'bendie' entitlement.
SELECT count(*) FROM (SELECT DISTINCT organization_id FROM public.events) e
WHERE NOT EXISTS (
  SELECT 1 FROM public.organization_products op
  WHERE op.organization_id = e.organization_id AND op.product_key = 'bendie'
);
-- Expect: 0

-- Every organization with an actively-linked event must have a 'planner' entitlement.
SELECT count(*) FROM (
  SELECT DISTINCT e.organization_id FROM public.events e
  JOIN public.event_planner_links epl ON epl.event_id = e.id WHERE epl.is_active = true
) linked
WHERE NOT EXISTS (
  SELECT 1 FROM public.organization_products op
  WHERE op.organization_id = linked.organization_id AND op.product_key = 'planner'
);
-- Expect: 0

-- No organization without any actively-linked event should have a 'planner' entitlement.
SELECT count(*) FROM public.organization_products op
WHERE op.product_key = 'planner'
AND NOT EXISTS (
  SELECT 1 FROM public.events e
  JOIN public.event_planner_links epl ON epl.event_id = e.id
  WHERE e.organization_id = op.organization_id AND epl.is_active = true
);
-- Expect: 0

-- An organization with zero events must receive zero entitlement rows.
SELECT count(*) FROM public.organizations o
WHERE NOT EXISTS (SELECT 1 FROM public.events e WHERE e.organization_id = o.id)
AND EXISTS (SELECT 1 FROM public.organization_products op WHERE op.organization_id = o.id);
-- Expect: 0
```

## 2. Event product backfill correctness

```sql
SELECT count(*) FROM public.events e
WHERE NOT EXISTS (
  SELECT 1 FROM public.event_products ep WHERE ep.event_id = e.id AND ep.product_key = 'bendie'
);
-- Expect: 0

SELECT count(*) FROM public.event_planner_links epl
WHERE epl.is_active = true
AND NOT EXISTS (
  SELECT 1 FROM public.event_products ep WHERE ep.event_id = epl.event_id AND ep.product_key = 'planner'
);
-- Expect: 0
```

## 3. Idempotency

Re-run all four `INSERT ... SELECT ... ON CONFLICT DO NOTHING` statements from `data-model.md` a
second time (in the same order); every query in steps 1–2 must still return `0`, and row counts on
both tables must be unchanged.

## 4. The entitlement invariant is genuinely unbypassable (rolled back)

```sql
BEGIN;
-- Pick an organization with NO 'planner' entitlement, and one of its real events.
WITH target AS (
  SELECT e.id AS event_id, e.organization_id FROM public.events e
  WHERE NOT EXISTS (
    SELECT 1 FROM public.organization_products op
    WHERE op.organization_id = e.organization_id AND op.product_key = 'planner'
  )
  LIMIT 1
)
INSERT INTO public.event_products (event_id, product_key, organization_id)
SELECT event_id, 'planner', organization_id FROM target;
-- Expect: foreign_key_violation (23503) — the composite FK rejects it.
ROLLBACK;
```

## 5. Organization-consistency trigger (rolled back)

```sql
BEGIN;
WITH target AS (SELECT id, organization_id FROM public.events LIMIT 1),
     wrong_org AS (SELECT id FROM public.organizations WHERE id <> (SELECT organization_id FROM target) LIMIT 1)
INSERT INTO public.event_products (event_id, product_key, organization_id)
SELECT target.id, 'bendie', wrong_org.id FROM target, wrong_org;
-- Expect: the trigger raises "event_products.organization_id (...) must match events.organization_id (...)"
ROLLBACK;
```

## 6. Duplicate rejection (rolled back)

```sql
BEGIN;
INSERT INTO public.organization_products (organization_id, product_key)
SELECT organization_id, 'bendie' FROM public.organization_products LIMIT 1;
-- Expect: unique_violation (23505)
ROLLBACK;
```

## 7. Tenant isolation on `organization_planner_links` (rolled back)

```sql
BEGIN;
INSERT INTO public.organization_planner_links (organization_id, planner_organization_id)
SELECT id, 999001 FROM public.organizations LIMIT 1;
INSERT INTO public.organization_planner_links (organization_id, planner_organization_id)
SELECT id, 999001 FROM public.organizations OFFSET 1 LIMIT 1; -- a DIFFERENT organization, same Planner org id
-- Expect: unique_violation (23505) on planner_organization_id
ROLLBACK;
```

## 8. Cascade on delete (rolled back)

```sql
BEGIN;
INSERT INTO public.events (id, organization_id, name, status)
VALUES (gen_random_uuid(), (SELECT id FROM public.organizations LIMIT 1), 'Quickstart Cascade Test', 'draft')
RETURNING id, organization_id \gset
INSERT INTO public.event_products (event_id, product_key, organization_id) VALUES (:'id', 'bendie', :'organization_id');
DELETE FROM public.events WHERE id = :'id';
SELECT count(*) FROM public.event_products WHERE event_id = :'id';
-- Expect: 0
ROLLBACK;
```

## 9. RLS: write is admin-only, read is member-scoped

Using a genuine authenticated, non-admin client session for a real member of a real test
organization (matching feature 001's own T033 RLS-verification pattern):

```
SELECT * FROM organization_products WHERE organization_id = '<their own org>';  -- expect: their org's rows
SELECT * FROM organization_products WHERE organization_id = '<a different org>'; -- expect: 0 rows
INSERT INTO organization_products (...) VALUES (...);                            -- expect: rejected
SELECT * FROM event_products WHERE organization_id = '<their own org>';          -- expect: their org's rows
INSERT INTO event_products (...) VALUES (...);                                   -- expect: rejected
SELECT * FROM organization_planner_links;                                        -- expect: 0 rows (admin-only, even for own org)
```

## 10. No self-service membership or self-promotion (existing `organization_members` behavior — confirm unchanged)

```
-- As a non-admin, non-org-admin user, attempt to insert themselves into a DIFFERENT organization,
-- or update their own role to 'owner'/'admin' within an organization they're only a 'member' of.
-- Expect: both rejected by organization_members' existing, unmodified RLS policies.
```

This step confirms this feature did not accidentally weaken anything on the pre-existing table.

## 11. Feature 001 regression check

Using real, temporary test data (create → exercise → fully clean up, per the established pattern):

1. Link a Portal event to a Bendie Planner event via the existing `bendie-planner` tab — confirm it
   still succeeds.
2. Provision a staff-tier member, push the agenda, pull travel data — confirm all three existing
   flows still succeed.

## 12. Standard gate

```
npm run lint
npm run type-check
npm run build
```

All three must be clean.
