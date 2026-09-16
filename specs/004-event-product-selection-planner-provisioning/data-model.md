# Phase 1 Data Model: Event Product Selection & Planner Provisioning

This feature introduces one new Portal table, five new columns on the existing `events` table, one
new Portal function group, two small guard additions to existing Feature 001 routes, and zero
Planner-side schema changes. No existing table's schema or RLS is modified.

## Schema changes (Portal project)

### New columns on `public.events`

```sql
ALTER TABLE public.events
  ADD COLUMN planner_provisioning_status text NOT NULL DEFAULT 'not_required'
    CHECK (planner_provisioning_status IN ('not_required','pending','provisioning','succeeded','failed')),
  ADD COLUMN planner_provisioning_error text,
  ADD COLUMN planner_provisioning_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN planner_provisioning_last_attempted_at timestamptz,
  ADD COLUMN planner_provisioning_succeeded_at timestamptz;
```

| Column | Type | Notes |
|---|---|---|
| `planner_provisioning_status` | `text`, `CHECK`, `NOT NULL DEFAULT 'not_required'` | The persisted state machine (FR-021–FR-023). Customer-readable. |
| `planner_provisioning_error` | `text`, nullable | Raw diagnostic detail. Column-level `SELECT` restricted (see Grants below) — never returned directly to a customer-facing caller. |
| `planner_provisioning_attempts` | `integer NOT NULL DEFAULT 0` | Incremented only by a successful CAS claim (research.md §9). |
| `planner_provisioning_last_attempted_at` | `timestamptz`, nullable | Set on every claimed attempt. |
| `planner_provisioning_succeeded_at` | `timestamptz`, nullable | Set only once, by the finalize step. |

**State transitions**:

```
not_required                              (Bendie-only; permanent, set at creation, never leaves)

pending --(claimed by CAS)--> provisioning --(Planner+link succeed)--> succeeded  [terminal]
                                     |
                                     +--(Planner or link step fails)--> failed
                                                                            |
                                                                     (retry re-claims)
                                                                            |
                                                                            v
                                                                      provisioning (again)
```

`succeeded` is terminal and is written by exactly one code path (research.md §5, Phase 4) —
never by any other statement, satisfying FR-023's "all four must exist together" rule by
construction (Phase 4 is only ever reached after Phases 2 and 3 have each already succeeded in the
same request or a prior one).

### New table: `public.event_creation_requests`

```sql
CREATE TABLE public.event_creation_requests (
  idempotency_key uuid PRIMARY KEY,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL,
  products text[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Purely an idempotency ledger (research.md §7) — never queried by any UI, never exposed via any RLS
policy to `authenticated`/`anon` (no SELECT/INSERT/UPDATE/DELETE grant to either; only the
`create_event_with_products` function, running as its definer, touches it).

**Correction, found during `/speckit.analyze`**: the first version of this table stored only
`event_id`, and the idempotency check simply returned whatever event an existing `idempotency_key`
mapped to — with no verification that the *new* request's payload actually matches the one that
created it. A client bug (or a deliberately malicious reuse) resubmitting the same key with a
**different** `organization_id` or `products` selection would have silently received back the
original, unrelated event's data instead of either creating a new one or being told the key was
already used for something else — confusing at best, a cross-tenant information leak in the worst
case (the response would name a real event, including its id, in an organization the reusing caller
might not even belong to). `organization_id` and `products` are now stored alongside the key
specifically so the idempotency check (research.md §7, updated) can compare them on every lookup, not
just the key.

### New function: `public.create_event_with_products(...)`

Signature: `(p_idempotency_key uuid, p_organization_id uuid, p_name text, p_location text,
p_starts_at timestamptz, p_ends_at timestamptz, p_products text[]) RETURNS TABLE(event_id uuid,
planner_provisioning_status text)`.

`SECURITY DEFINER`, `SET search_path TO 'public'`, `LANGUAGE plpgsql`. Body performs research.md §3's
nine steps inside the function's own implicit transaction. Internal checks: caller authorization
(`portal_is_global_admin()` or `is_organization_admin(p_organization_id)`), entitlement validity for
every requested product (`organization_products` `is_active = true`), idempotency-key lookup before
any write.

**Grants**: `REVOKE EXECUTE ON FUNCTION public.create_event_with_products(...) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_event_with_products(...) TO authenticated;` — mirrors
`get_event_planner_sync_status()`'s already-audited grant shape exactly. `service_role` needs no
explicit grant.

### New function: `public.get_event_planner_provisioning_error(p_event_id uuid)`

`SECURITY DEFINER`, re-verifies `portal_is_global_admin()` internally (mirrors
`get_event_planner_sync_status()` exactly), returns the raw `planner_provisioning_error` value for one
event. Same grant shape (`PUBLIC`/`anon` revoked, `authenticated` retained — the internal check is the
real boundary, exactly like its precedent).

### Column privilege change on `public.events`

**Live-verified during this planning pass** (`pg_class.relacl`): `public.events` currently holds a
full **table-level** grant to both `authenticated` and `anon` (`arwdDxtm` — `SELECT`/`INSERT`/
`UPDATE`/`DELETE`/`TRUNCATE`/`REFERENCES`/`TRIGGER`/`MAINTAIN`), matching Supabase's ordinary default
grant shape and relying entirely on RLS for row-level protection. A first draft of this document
assumed (incorrectly, without checking) that no such table-level grant existed and that a bare
column-level `REVOKE SELECT (planner_provisioning_error) ... FROM authenticated, anon` would be
sufficient — checking live caught this before it became a repeat of Feature 003's F-NEW-1 finding: a
column-level `REVOKE` is silently a no-op while the role still holds the table-level grant covering
that column. The corrected migration, matching the proven `event_members` pattern exactly:

```sql
REVOKE SELECT ON public.events FROM authenticated, anon;

GRANT SELECT (
  id, organization_id, name, slug, description, location, status, attendee_limit, starts_at,
  ends_at, created_by, created_at, updated_at, image_url, hero_title, hero_description,
  hero_image_url, category_label, theme_label, theme_icon, facilitator_label_singular,
  facilitator_label_plural, gallery_external_url, event_type, networking_mode, interests_enabled,
  feedback_form_url, theme_primary, theme_secondary, theme_tertiary, profile_banner_image_url,
  in_house, gallery_background, disabled_menu_items,
  planner_provisioning_status, planner_provisioning_attempts,
  planner_provisioning_last_attempted_at, planner_provisioning_succeeded_at
) ON public.events TO authenticated, anon;
```

Every pre-existing column is re-granted (no behavior change for anything already working) plus every
new provisioning column **except** `planner_provisioning_error`, which is the only column excluded
from `SELECT`.

**Second correction, found during `/speckit.analyze`**: the first version of this document restricted
only `SELECT` on `planner_provisioning_error` and left `INSERT`/`UPDATE` on `events` completely
untouched, reasoning that "no behavior needs it." That reasoning missed a real, exploitable gap:
`events` already carries a table-level `INSERT`/`UPDATE` grant to `authenticated`/`anon` (the same
`relacl` checked above), and `events_update_host_organizer`'s existing RLS (`USING/WITH CHECK
is_event_host_or_organizer(id)`) already permits **the event's own creator** — who this feature itself
just made an `event_members` `'admin'` — to `UPDATE` their own event row. Combined, an ordinary
customer (not a platform admin, not a service role — the event's own legitimate admin) could issue a
direct `UPDATE events SET planner_provisioning_status = 'succeeded' WHERE id = ...` via raw PostgREST
and forge a fully "succeeded" provisioning outcome without ever actually provisioning anything, or
forge `planner_provisioning_attempts`/timestamps to mislead diagnosis. Separately, `events_insert_
creator`'s existing RLS permits a direct client-side `INSERT` into `events` (bypassing
`create_event_with_products` entirely) — with no column-level restriction, that direct insert could
also set `planner_provisioning_status = 'succeeded'` at creation time. All five provisioning columns
are exactly the "system-managed, never customer-writable" class of field this feature's own `event_
members` precedent (Feature 003 F-NEW-1) already establishes a fix pattern for — that pattern was
simply not applied to the *new* columns this feature itself introduces. Corrected:

```sql
REVOKE INSERT, UPDATE ON public.events FROM authenticated, anon;

GRANT INSERT (
  id, organization_id, name, slug, description, location, status, attendee_limit, starts_at,
  ends_at, created_by, created_at, updated_at, image_url, hero_title, hero_description,
  hero_image_url, category_label, theme_label, theme_icon, facilitator_label_singular,
  facilitator_label_plural, gallery_external_url, event_type, networking_mode, interests_enabled,
  feedback_form_url, theme_primary, theme_secondary, theme_tertiary, profile_banner_image_url,
  in_house, gallery_background, disabled_menu_items
) ON public.events TO authenticated, anon;

GRANT UPDATE (
  organization_id, name, slug, description, location, status, attendee_limit, starts_at,
  ends_at, updated_at, image_url, hero_title, hero_description, hero_image_url, category_label,
  theme_label, theme_icon, facilitator_label_singular, facilitator_label_plural,
  gallery_external_url, event_type, networking_mode, interests_enabled, feedback_form_url,
  theme_primary, theme_secondary, theme_tertiary, profile_banner_image_url, in_house,
  gallery_background, disabled_menu_items
) ON public.events TO authenticated, anon;
```

Both lists are exactly the 33 pre-existing columns — **none of the five new provisioning columns
appear in either list**. This is deliberately safe for every existing customer-facing write path
(live-audited this pass: `basics/page.tsx`, `hero/page.tsx`, `terminology/page.tsx`, `theme/page.tsx`
are the only four client-side `.update()` calls against `events` in the entire repository, and every
field each of them writes is in the re-granted list — none is broken). A direct client `INSERT`
omitting the provisioning columns still succeeds using their `DEFAULT`/`NULL` values (Postgres permits
omitting a column with no `INSERT` privilege as long as it has a default or is nullable — it only
blocks explicitly naming that column in the insert's column list), so `events_insert_creator`'s
existing direct-insert capability is preserved, but can never result in anything other than
`planner_provisioning_status = 'not_required'` (the column default) — never a forged `'succeeded'`.
Only `create_event_with_products` (as its `SECURITY DEFINER` owner) and the service-role-driven
provisioning routes can ever set a non-default value on any of the five columns.

### Guard additions to existing Feature 001 routes (code, not schema)

`src/app/api/admin/planner-push-agenda/route.ts` and `src/app/api/admin/planner-pull-travel/route.ts`
each gain one additional check, immediately after the existing `event_planner_links.is_active` check:

```ts
const { data: products } = await authClient.from('event_products')
  .select('product_key').eq('event_id', eventId).eq('product_key', 'bendie').maybeSingle();
if (!products) {
  return NextResponse.json({ error: 'This event does not use Bendie — nothing to synchronize.' }, { status: 400 });
}
```

No schema change; `event_products` is already fully readable to a platform admin via its existing
`portal_is_global_admin()` `FOR ALL` policy.

## Reused entities (unchanged schema, newly populated or newly gated)

| Entity | Table | Role in this feature |
|---|---|---|
| Event | `events` | Gains the 5 provisioning columns above; every other column populated exactly as today's `CreateEventModal` already does. |
| Event Product Usage | `event_products` | Now actually written at creation (research.md §3 step 5) for every event, for the first time. No schema change. |
| Event Access Grant | `event_members` | Now actually written for the creator at creation (§3 step 6), for the first time. No schema change. Role guard trigger (`enforce_event_member_role_immutability`) and Planner-column privilege restrictions (Feature 003) are both unaffected — this feature's RPC inserts `role='admin'` directly via `SECURITY DEFINER`, bypassing the trigger's `UPDATE`-only scope entirely (the trigger only fires on `UPDATE`, never `INSERT`) and never touches the four restricted Planner columns. |
| Organization Product Entitlement | `organization_products` | Read-only for this feature; unchanged. |
| Organization Planner Mapping | `organization_planner_links` | Read-only for this feature; unchanged, still platform-admin-only to write (FR-020). |
| Planner Link | `event_planner_links` | Written by this feature (Phase 3) using the *same* table Feature 001 already uses — no schema change, no new mapping concept. |
| Planner Event | Planner's own `events` table | Written by this feature for the first time from Portal. No schema change on Planner's side — the deterministic `event_code` (research.md §10) needs no new Planner column. |

## Validation rules (from functional requirements)

- `event_products` MUST NEVER contain `'bendie'` for an event whose product selection was
  Planner-only (FR-003) — enforced by construction: `create_event_with_products`'s product-insert
  loop only ever inserts exactly the caller's `p_products` array, itself validated against active
  entitlement, never expanded.
- `planner_provisioning_status` MUST NEVER be `'succeeded'` without an active `event_planner_links`
  row and a real Planner event existing (FR-023) — enforced by construction: Phase 4 is unreachable
  except immediately after Phase 3's own success.
- A retry MUST target the same Portal event (FR-028) — enforced by the retry endpoint requiring an
  existing `eventId` in its URL and never calling `create_event_with_products` again.
- Client-supplied organization/product/entitlement values are never trusted (FR-026, FR-032) —
  enforced by `create_event_with_products`'s own internal re-verification, independent of whatever the
  calling server route already checked.

## State transitions summary (event-level)

None of `events`'s existing columns gain new transition semantics. The one new stateful concept is
`planner_provisioning_status`, whose full transition diagram is given above. `event_products` and
`event_members` are write-once at creation for this feature's scope (FR-039 — no upgrade/downgrade,
no membership-role-change path introduced here).
