# Phase 0 Research: Event Product Selection & Planner Provisioning

Every decision below was checked against live Portal code, the live Portal database, and the live
Planner database (via the `supabase` and `supabase-planner` MCP tools) during this planning pass —
re-verified, not assumed carried-over from the earlier architecture/clarification passes.

## 1. Current event-creation flow (revalidated)

Traced again against current source, unchanged since the architecture pass:

```
User (org owner/admin or platform admin)
  → EventsPage (src/app/portal/events/page.tsx)
  → CreateEventModal (src/components/portal/CreateEventModal.tsx)
  → direct browser Supabase client INSERT into public.events
    (name, location, starts_at, ends_at, status:'draft', created_by, organization_id)
  → RLS (events_insert_creator) is the ONLY server-side gate
  → on success: local state update only — no event_products, no event_members, no navigation
```

Confirmed again: zero code path creates `event_products` or `event_members` for a newly created
event today, for any product. This is a pre-existing gap (not introduced by this feature) that this
feature is responsible for closing for every product mix, including Bendie-only.

## 2. Server/API boundary decision

**Decision**: Move creation behind a new, dedicated server route, `POST /api/events/create`, outside
the `app/api/admin/**` namespace (its authorized actor is org owner/admin, not platform admin — using
the admin namespace would be misleading). The route performs its own independent authorization check
(reusing `events_insert_creator`'s exact predicate), then delegates the atomic Portal-side write to a
new `SECURITY DEFINER` RPC (§3) and, for Planner-inclusive selections, orchestrates the cross-database
provisioning steps (§5) using Portal's and Planner's service-role clients.

**Rationale**: UI-side filtering (`canCreateEvent`, `isOrgAdmin`) is already documented in this
codebase's own comments as advisory-only, with RLS as the real gate (Feature 003 precedent). A
direct-from-browser INSERT was viable when the operation touched one row in one table; it is not
viable once the operation must (a) validate entitlement/mapping preconditions that must never be
client-trusted, (b) write four Portal-side records atomically, and (c) call a second database using
credentials that must never reach the browser (Constitution Principle IV). A server route is the only
option consistent with the existing `app/api/admin/**` pattern this codebase already uses for every
other privileged, multi-step, cross-project operation (Feature 001's five Planner-touching routes).

**Alternatives considered**: Keep the browser-client INSERT and add more RLS. Rejected — Planner
provisioning cannot happen from RLS (it's not a Postgres operation at all), and entitlement/mapping
preconditions needing to run *before* any write is more naturally expressed as request-handling logic
than as a constraint. A single monolithic RPC covering every phase including the Planner HTTP calls.
Rejected — Postgres functions cannot make outbound HTTP calls to Planner's REST API in this codebase's
existing architecture (no `pg_net`/HTTP-from-Postgres pattern is used anywhere in this schema; the one
extension that provides it, `pg_net`, is installed but unused for this purpose — introducing it here
would be a new architectural pattern for a single feature, which Constitution Principle II prohibits
without an approved specification asking for it).

## 3. Portal-side atomicity design

**Decision**: A new `SECURITY DEFINER` RPC, `public.create_event_with_products(p_idempotency_key uuid,
p_organization_id uuid, p_name text, p_location text, p_starts_at timestamptz, p_ends_at timestamptz,
p_products text[])`, performs, in one Postgres transaction:

1. Idempotency check (§7, corrected) — if `p_idempotency_key` already exists in `event_creation_
   requests`, compare its stored `organization_id`/`products` against this call's parameters: if they
   match, return the existing event's id immediately (no new writes); if they differ, `RAISE
   EXCEPTION` with a distinct `idempotency_conflict` condition rather than silently returning the
   unrelated prior event.
2. Internal re-verification: caller is `portal_is_global_admin()` OR
   `is_organization_admin(p_organization_id)` (`events_insert_creator`'s exact existing predicate —
   not a new rule).
3. Internal re-verification: every value in `p_products` has an active `organization_products` row
   for `p_organization_id` (`is_active = true`) — mirrors `isProductActiveForOrg`.
4. **Added during `/speckit.analyze` (closes a TOCTOU gap — see §5's Phase 0/1 note below)**:
   internal re-verification that `organization_planner_links` still has a row for `p_organization_id`
   whenever `'planner'` is in `p_products` — the same precondition the calling route already checked
   in Phase 0, re-checked here too, so the guarantee ("zero Portal writes without a usable mapping,"
   FR-019) holds even in the narrow race window between the route's own check and this transaction
   actually running, not just in the common case.
5. `INSERT INTO events (...)`.
6. `INSERT INTO event_products (event_id, product_key, organization_id)` for each requested product.
7. `INSERT INTO event_members (event_id, user_id, organization_id, role)` for the caller, `role =
   'admin'`.
8. Set the new provisioning columns (§6) on the `events` row: `planner_provisioning_status =
   'not_required'` if `'planner'` is not in `p_products`, else `'pending'`.
9. Record the idempotency mapping, including `organization_id`/`products` (§7).
10. Return the new event's id and its initial provisioning status.

**Rationale**: This is the established shape of every privileged mutation already in this schema
(`enforce_event_member_role_immutability`, `get_event_planner_sync_status`,
`enforce_event_product_org_consistency`) — `SECURITY DEFINER`, `SET search_path TO 'public'`,
internal re-verification before acting, minimum necessary mutation scope. A single Postgres function
is the only mechanism that makes steps 4–8 genuinely atomic (same transaction) without introducing a
distributed-transaction pattern this codebase has never used. This directly closes the historical gap
identified in §1 for every product mix, not just Planner ones.

**Required grants** (mirroring `get_event_planner_sync_status`'s already-audited, already-hardened
precedent exactly): `REVOKE EXECUTE ... FROM PUBLIC; REVOKE EXECUTE ... FROM anon; GRANT EXECUTE ...
TO authenticated;` — `service_role` needs no explicit grant (already bypasses everything). The function
performs no arbitrary-table mutation — every `INSERT` target and column list is fixed in the function
body, not parameterized by table/column name.

## 4. `event_planner_links` semantics — confirmed, not redesigned

**Discovery, confirmed against actual Feature 001 code** (not assumed): both
`src/app/api/admin/planner-push-agenda/route.ts` and `src/app/api/admin/planner-pull-travel/route.ts`
gate solely on `event_planner_links.is_active` —

```ts
const { data: link } = await authClient.from('event_planner_links')
  .select('planner_event_id,is_active').eq('event_id', eventId).maybeSingle();
if (!link || !link.is_active) { return ...error... }
```

— **neither route checks `event_products` today.** This confirms the exact risk this planning pass
was asked to verify: after this feature ships, a Planner-only event will also have an active
`event_planner_links` row (§5), and without a change, both routes would technically accept a request
against it (previously impossible, since no Planner-only event could ever have existed). In practice
this is harmless today only by accident of emptiness (no Bendie-side `agenda_sessions`/
`attendee_travel_details` content exists for a Planner-only event, since no `'bendie'`
`event_products` row means the Bendie-classified tabs that populate those tables never render) — but
"harmless by accident" is not the same as "correctly scoped."

**Decision**: `event_planner_links` remains the single, unmodified counterpart-mapping table — no
second mapping concept, no schema/semantics change, exactly as the spec requires (FR-015, FR-017).
What changes is two of Feature 001's *consumers*: `planner-push-agenda` and `planner-pull-travel` each
gain one additional precondition — `event_products` must include `'bendie'` for that event — before
proceeding, since both routes' entire purpose is moving Bendie-side content to/from Planner. This is
not a Feature 001 redesign (FR-035/Out-of-Scope): it only ever changes behavior for a case that could
not exist before this feature (a Planner-only event), and it changes nothing about how these routes
behave for every event already linked today, which by construction (Feature 002's backfill) already
carries `'bendie'` in `event_products`. `planner-sync-member` (staff sync) is **not** given this
additional gate — a Planner-only event's staff still legitimately need Planner access, matching the
resolved matrix in §12.

## 5. Cross-database orchestration sequence

```
PHASE 0 — PREFLIGHT (server route, before any write)
  1. authenticate caller (existing session)
  2. resolve target organization (server-derived from request, never trusted as sole input —
     cross-checked against the caller's own organization_members rows)
  3. determine active entitlements: isProductActiveForOrg() for 'bendie'/'planner'
  4. validate requested product selection against FR-002–FR-006 (auto-select for single
     entitlement, require explicit choice for both, reject for neither)
  5. if 'planner' requested: read organization_planner_links for this organization
     → missing/absent → STOP. Zero writes. Return the blocking response (FR-019).
  6. establish/accept the client-supplied idempotency key (§7)

PHASE 1 — PORTAL ATOMIC CREATE
  → call create_event_with_products(...) (§3). Returns event id + initial provisioning status.
  → NOTE (added during `/speckit.analyze`, closes a TOCTOU gap): Phase 0 step 5's mapping check and
    this call are not the same instant — the RPC itself independently re-checks mapping presence
    internally (§3 step 4) before writing anything, so a mapping removed in the narrow window between
    Phase 0 and Phase 1 still results in zero Portal writes (FR-019 holds even under this race), not
    just in the common case where nothing changes between the two checks.

PHASE 2 — PLANNER PROVISION (only if 'planner' in product selection)
  1. CAS claim: UPDATE events SET planner_provisioning_status = 'provisioning',
     planner_provisioning_attempts = planner_provisioning_attempts + 1,
     planner_provisioning_last_attempted_at = now()
     WHERE id = $1 AND planner_provisioning_status IN ('pending','failed')
     — 0 rows affected → another attempt already owns this; return its current status, do nothing
       further (§9 concurrency).
  2. re-verify (not reused from Phase 0): organization_planner_links still present; the
     'planner' entitlement is still active (FR-029/edge case: revoked mid-flight)
  3. compute the deterministic event_code (§10)
  4. via Planner's service-role client: SELECT events WHERE event_code = <computed> — if found,
     compare its organization_id against the mapped planner_organization_id read in step 2:
       - match → reuse it (ordinary recovery path, e.g. a lost-response retry)
       - MISMATCH → **mapping-drift case, added during `/speckit.analyze` (§14 scenario 15;
         previously undefined)**: a Planner event was created under a *different* Planner
         organization than the one currently mapped — this means the mapping changed between the
         original attempt and now. Do NOT create a second Planner event under the new mapping, and
         do NOT link the mismatched event to this Portal event (either would silently misattribute
         data across Planner tenants). Instead: mark this attempt `failed` with a distinct
         `mapping_drift` diagnostic (§6) explicitly naming both organization ids, and stop —
         this state requires a platform administrator to reconcile manually (restore the original
         mapping, or accept the drift as intentional and clear the stale Planner-side row
         themselves); no automatic resolution is attempted.
     if not found (no mismatch possible, since nothing was found): INSERT it (planner_organization_id,
     event_title, location, start_date, end_date, setup_date, event_code)
  5. on any failure in 3–4 (including the mapping-drift case): UPDATE events SET
     planner_provisioning_status='failed', planner_provisioning_error=<sanitized+raw, see §6> WHERE
     id=$1; return failure response; STOP (link step never runs)

PHASE 3 — COUNTERPART LINK (only reached if Phase 2 succeeded)
  → via Portal's service-role client (event_planner_links is admin-only RLS; this bypasses it
    deliberately, matching Feature 001's own established write pattern):
    UPSERT event_planner_links (event_id, planner_event_id, planner_event_title, is_active=true,
    linked_by=creator, updated_at=now()) ON CONFLICT (event_id) — recovers cleanly if a prior
    attempt already wrote this row but the finalize step (Phase 4) never ran.
  → on failure: mark 'failed' exactly as in Phase 2 step 5; STOP.

PHASE 4 — FINALIZE (only reached if Phase 3 succeeded)
  → UPDATE events SET planner_provisioning_status='succeeded',
    planner_provisioning_succeeded_at=now() WHERE id=$1
  → this is the ONLY point at which 'succeeded' is ever written — enforced by construction (no other
    code path sets this value), directly satisfying FR-023.
```

Bendie-only requests execute Phase 0–1 only; Phase 0 step 5 (mapping check) is skipped entirely since
it only applies "when the product selection requires Planner."

## 6. Provisioning-state data model — location decision

**Decision**: New nullable columns directly on `public.events`, not a dedicated table:

| Column | Type | Notes |
|---|---|---|
| `planner_provisioning_status` | `text`, `CHECK IN ('not_required','pending','provisioning','succeeded','failed')`, `NOT NULL DEFAULT 'not_required'` | Customer-readable. |
| `planner_provisioning_error` | `text`, nullable | Raw/diagnostic detail — see privacy note below. |
| `planner_provisioning_attempts` | `integer NOT NULL DEFAULT 0` | Incremented on every claimed attempt (Phase 2 step 1). |
| `planner_provisioning_last_attempted_at` | `timestamptz`, nullable | |
| `planner_provisioning_succeeded_at` | `timestamptz`, nullable | Set only by Phase 4. |

**Rationale — why `events`, not `event_planner_links` or a new table**: a Planner-required event can
fail *before* any `event_planner_links` row exists (Phase 2 failure), so the state cannot live on that
table without making it nullable-and-optional in a way that defeats its own existing meaning
("this row means a counterpart is established"). A dedicated table would be the textbook-generic
choice, but this schema's own established precedent for "add sync status directly to the row it
describes" is exactly `event_members.planner_sync_status/planner_sync_error/planner_synced_at` and
`agenda_sessions.planner_agenda_item_id/planner_synced_at` (both Feature 001) — reusing that shape
(Constitution Principle I) is smaller and more consistent than introducing a new table for a single
row of orchestration metadata per event, and this feature needs no multi-row attempt history beyond a
count and a last-error, both single-valued.

**Privacy — SELECT**: mirrors the exact, already-hardened precedent from Feature 003's F-NEW-1
correction on `event_members`'s own Planner columns — including re-learning the same lesson live
rather than assuming it away twice: `pg_class.relacl` was checked for `public.events` during this
planning pass and found to hold a full table-level grant to `authenticated`/`anon` (Supabase's default
shape), so a bare column-level `REVOKE SELECT (planner_provisioning_error)` would be silently
ineffective for the identical reason it was in Feature 003. The corrected design (data-model.md has
the exact SQL): revoke the table-level `SELECT` grant entirely and re-grant it only on every existing
column plus the new columns other than `planner_provisioning_error`. `planner_provisioning_status`
stays plainly readable (the customer-facing UI needs it to render pending/failed/succeeded). The
customer-facing retry UI is served a fixed, generic string ("Bendie Planner setup didn't complete —
try again, or contact support if this keeps happening") rather than the raw error column's contents. A
platform-admin-gated read path (a new `SECURITY DEFINER` function,
`get_event_planner_provisioning_error(p_event_id)`, mirroring `get_event_planner_sync_status()`'s
exact shape) exposes the raw value for diagnosis. This satisfies FR-024 without inventing a new
privacy mechanism.

**Privacy — INSERT/UPDATE, second correction found during `/speckit.analyze`**: SELECT was the only
privilege this document originally restricted; `INSERT`/`UPDATE` on `events` were left completely
untouched, on the reasoning that "no legitimate flow needs to write these columns from the client" —
true, but not the same as verifying no *illegitimate* flow could. Live-checked this pass:
`events_update_host_organizer`'s pre-existing RLS already lets an event's own host/organizer/`admin`
(exactly the role this feature's own `create_event_with_products` grants the creator) `UPDATE` their
event, and the pre-existing table-level `UPDATE` grant to `authenticated` covers every column
including the five new ones — meaning, unfixed, an ordinary event admin could directly forge
`planner_provisioning_status = 'succeeded'` (or any other value, or the attempt/timestamp columns)
via a raw PostgREST call, without ever actually provisioning anything. A parallel path exists on
`INSERT`: `events_insert_creator`'s RLS already permits a direct client `INSERT` bypassing
`create_event_with_products` entirely, which — absent a column restriction — could set the same forged
values at creation time. Corrected the same way as the `event_members` precedent: revoke the
table-level `INSERT`/`UPDATE` grants and re-grant both only on the 33 pre-existing columns (verified
this pass against every actual client-side `.update()` call on `events` in the repository — `basics`,
`hero`, `terminology`, `theme` pages — none is affected), excluding all five provisioning columns from
both privilege types entirely. A direct client `INSERT` that omits them still succeeds via their
column defaults (`'not_required'`/`0`/`NULL`), so the pre-existing direct-insert capability is
preserved without ever being able to produce a non-default provisioning state. Only
`create_event_with_products` (as its definer) and the service-role-driven provisioning routes can ever
write a non-default value to any of the five columns.

## 7. Create-request idempotency design

**Decision**: A new, small mapping table, `public.event_creation_requests (idempotency_key uuid
PRIMARY KEY, event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE, organization_id uuid NOT
NULL, products text[] NOT NULL, created_at timestamptz NOT NULL DEFAULT now())`. The client generates
a random UUID once, when the creation form is first submitted (not regenerated on retry), and sends it
as `p_idempotency_key` to `create_event_with_products` (§3). The RPC checks this table first: a hit
whose stored `organization_id`/`products` match the current call's parameters returns the
already-created event without writing anything new; a miss proceeds and inserts the mapping row
(including `organization_id`/`products`) in the same transaction as everything else.

**Rationale**: this is "prefer server-generated/client-generated request identity with database
uniqueness rather than timing/debounce alone," per this planning pass's own instruction. The `PRIMARY
KEY` on `idempotency_key` is what actually decides the winner under concurrent identical submissions
(§9) — not application logic.

**Conflicting-payload correction, found during `/speckit.analyze`**: the first version of this design
compared only the key, never the payload. A reused key submitted with a *different* `organization_id`
or `products` selection would have silently returned the original, unrelated event instead of
signaling a conflict — a real correctness gap (and, since the response includes a real event id from
potentially a different organization, a minor information-disclosure risk) this pass's own explicit
"same key + conflicting payload" question was designed to catch. Storing `organization_id`/`products`
alongside the key and comparing them on every lookup closes this: a genuine retry (identical payload)
is still silently idempotent; a conflicting reuse is rejected with a distinct `idempotency_conflict`
error instead of ever being confused for a successful new creation.

## 8. Planner-provisioning idempotency design

**Decision**: the deterministic `event_code` (§10) *is* the Planner-side idempotency anchor. Phase 2
step 4 always attempts a lookup by `event_code` before ever inserting — never a blind insert. Because
`event_code` is derived 1:1 from the Portal event's own immutable `id`, a lookup hit is only ever the
same logical event's own prior attempt; the extra `organization_id` cross-check in Phase 2 step 4 is
defense-in-depth (never trust a lookup match without confirming it belongs where expected), not a
realistic collision path given how the code is constructed (§10).

## 9. Concurrency control

**Create-request concurrency**: two simultaneous requests carrying the same `idempotency_key` race on
the `event_creation_requests` table's `PRIMARY KEY`. Postgres decides the winner; the loser's insert
attempt fails with `23505`, which the RPC catches and treats identically to a normal idempotency hit
(re-select and return the winner's event). Two requests with *different* keys are simply two different
legitimate creation attempts — not a conflict to resolve.

**Planner-provisioning concurrency**: the conditional `UPDATE ... WHERE planner_provisioning_status IN
('pending','failed')` in Phase 2 step 1 is the compare-and-swap. It is a single atomic statement;
Postgres guarantees exactly one concurrent caller can ever transition a given row out of
`pending`/`failed` into `provisioning` at a time, regardless of how long the subsequent Planner HTTP
call takes (that call happens *after* the claim, entirely outside any database transaction, so holding
a lock across it is neither necessary nor appropriate — the status column itself is the lock). A
second concurrent attempt sees 0 rows affected and returns "provisioning already in progress" without
touching Planner at all.

**Alternatives considered**: a Postgres advisory lock held for the duration of the request. Rejected
— an advisory lock would need to span the external Planner HTTP call, which does not execute inside a
Postgres session/transaction in this architecture (the caller is a Next.js server route, not a
database client holding an open transaction across a network call); the CAS-on-status-column pattern
achieves the same mutual-exclusion guarantee using only ordinary atomic SQL statements.

## 10. Event-code generation algorithm

**Schema evidence** (live-verified): `event_code` is `text`, `NOT NULL`, no `CHECK` constraint, no
length limit (`character_maximum_length` is `null`), guarded only by a `UNIQUE` index
(`ux_events_event_code`). No generation trigger or RPC exists anywhere in Planner's ~118 functions —
every existing value was hand-typed by Planner operators.

**Decision**: `event_code = 'PORTAL-' || <Portal event's events.id, canonical lowercase-hyphenated
UUID text>`. Example: `PORTAL-550e8400-e29b-41d4-a716-446655440000`.

**Why this satisfies every required property**:
- **Deterministic / stable forever**: derived solely from `events.id`, which never changes once
  assigned and is never regenerated by this feature (FR-039, immutability).
- **Collision-resistant**: not merely resistant — collision-*proof* by construction, since it embeds a
  value (`events.id`) that is already globally unique as Portal's own primary key. No probabilistic
  hashing or truncation is introduced, so there is no residual collision probability to reason about.
- **Schema-compatible**: `text`, no length constraint — a `PORTAL-` + 36-character UUID string (43
  characters total) fits trivially.
- **No title dependency**: does not reference `name`/`event_title` at all — a future rename (were one
  ever added) could never invalidate it.
- **Readable enough for operations**: immediately identifiable as Portal-sourced, and the embedded
  UUID is directly copy-pasteable back into Portal's own admin tooling/database for cross-referencing
  — arguably more operationally useful than a shortened/hashed form, which would require a lookup to
  trace back to its source event.

**Collision handling (documented per instruction, even though structurally near-impossible)**: if the
`event_code` `UNIQUE` index is ever violated despite the above (only conceivable if two different
Portal events somehow shared an `id`, which Postgres's own primary-key guarantee on `events.id`
already prevents), Phase 2 step 4 catches `23505`, re-runs its own lookup-by-code, and proceeds via the
same recovery path already used for ordinary retries (§8) — it never surfaces a raw constraint
violation to the caller.

## 11. Creator-access model

**Decision**: every created event's creator receives an `event_members` row with `role = 'admin'`
(§3 step 6), for all three product mixes uniformly (FR-008/FR-009) — this is the existing `admin`
event role already governed by Feature 003's `is_event_host_or_organizer`/workspace-access rules, not
a new role.

**Planner-side creator access — scoped decision**: for Planner-only and Both events, if the creator's
new `event_members.role` is staff-eligible (it always is — `admin` is in `STAFF_ROLES`, per
`planner-sync-member/route.ts`'s existing constant), the *existing* staff-sync mechanism is invoked
once, server-side, immediately after Phase 3 succeeds — this is calling the existing capability, not
building a new one. No new Planner auth/profile/assignment mechanism is introduced; the existing
`findOrCreatePlannerProfile`/`event_user_assignments` upsert already handles "person has no Planner
identity yet" correctly (FR-013). This is deliberately the *only* Planner-side access work this
feature does — a future Planner Event Access management feature, not this one, owns anything beyond
"the creator can already reach what they created."

## 12. Feature 001 sync matrix — resolved

| Capability | Bendie | Planner-only | Both |
|---|---|---|---|
| Planner counterpart (`event_planner_links`) | No | **Yes** | Yes |
| Staff sync (`planner-sync-member`) | No | **Yes** — gates on `event_planner_links.is_active` only (unchanged); staff access to Planner is meaningful regardless of Bendie presence | Yes |
| Agenda push (`planner-push-agenda`) | No | **No** — new precondition added: MUST also require `event_products` includes `'bendie'` | Yes (unaffected — already has `'bendie'`) |
| Travel pull (`planner-pull-travel`) | No | **No** — same new precondition | Yes (unaffected) |

Resolved directly from live code evidence (§4), not guessed: the two routes whose entire purpose is
moving *Bendie-side* content gain one precondition; the one route whose purpose is *access provisioning*
does not, because access is not product-specific.

## 13. Field mapping — final (re-verified this pass)

| Portal source | Planner column | Behavior |
|---|---|---|
| `events.id` | *(used to derive)* `event_code` | System-generated, §10 |
| `events.name` | `event_title` (`varchar(255)`) | Direct copy; Portal's `name` has no length cap today — if it ever exceeds 255 chars, Phase 2 step 4's insert fails and is reported as a provisioning failure (not silently truncated) |
| `events.location` | `location` (`varchar(255)`) | Direct copy, null-safe |
| `events.starts_at` (date part) | `start_date` | Time-of-day stripped — Planner has no time column (re-confirmed: no `start_time`) |
| `events.ends_at` (date part) | `end_date` | Same |
| *(none — defaults to `start_date`)* | `setup_date` | Per locked decision; re-confirmed no `CHECK` constraint blocks equality |
| *(not collected by Portal)* | `description` | Left `NULL` |
| *(not collected by Portal)* | `attendees` | Left `NULL` |
| `organization_planner_links.planner_organization_id` | `organization_id` | Resolved server-side, never client-supplied |

**Re-confirmed absent** (per this pass's explicit instruction to re-verify, not assume carried over):
`lead_coordinators`, `support_team`, `setup_time`, `start_time`, `end_time` do not exist as columns on
Planner's `events` table — live `information_schema.columns` query this pass returned the identical
12-column set found during the architecture pass. No plan content depends on any of these five.

## 14. Failure matrix

| # | Scenario | Portal state | Planner state | Link state | Provisioning state | Customer-visible | Retry behavior |
|---|---|---|---|---|---|---|---|
| 1 | Portal atomic creation fails | nothing committed (single transaction) | n/a | n/a | n/a | generic creation-failed error; no event exists to retry | resubmit the whole creation form |
| 2 | Planner creation fails before its own insert (e.g. network refused) | committed | none | none | `failed` | "Planner setup didn't complete" + retry action | retry action re-runs Phase 2 |
| 3 | Planner insert succeeds but response is lost | committed | exists (real row) | none yet | `failed` (this attempt) or `provisioning` (if crash mid-flight) | as above | retry's lookup-by-code (§8) finds the existing row, does not duplicate |
| 4 | Planner event exists but link creation fails | committed | exists | none | `failed` | as above | retry re-runs Phase 3 only (Phase 2's lookup finds the existing Planner event) |
| 5 | Link succeeds but final status UPDATE fails | committed | exists | active | stuck at `provisioning` (not yet `succeeded`) | shown as still-in-progress/failed depending on UI's staleness tolerance | retry re-checks: link already active + Planner event exists → Phase 4 runs directly, no duplicate work |
| 6 | Retry after `failed` | unchanged | recovered or re-created | recovered or created | `pending`→claimed→outcome | normal retry flow | as designed |
| 7 | Retry attempted while another is `provisioning` | unchanged | unaffected | unaffected | CAS claim fails (0 rows) | "provisioning already in progress, please wait" | no duplicate Planner call made |
| 8 | `event_code` collision with an unrelated event/org | structurally not reachable (§10) | n/a | n/a | n/a | n/a | documented defensively in §10 regardless |
| 9 | Entitlement disabled after Portal creation but before retry | unaffected | unaffected | unaffected | re-check in Phase 2 step 2 rejects; `failed` with a specific reason | "Planner is no longer active for your organisation" | blocked until entitlement restored |
| 10 | Planner org mapping removed, or changed, before retry *and before any Planner event exists yet for this attempt* | unaffected | unaffected | unaffected | re-check in Phase 2 step 2 rejects; `failed` | same messaging as the original missing-mapping block | blocked until mapping restored |
| 11 | Network/service timeout mid-call | committed | uncertain | uncertain | `failed` (conservatively, since the claim already transitioned to `provisioning` and the call didn't confirm success) | retryable | lookup-by-code recovers whichever side actually completed |
| 12 | Unexpected server crash mid-sequence | whatever was committed before the crash persists | as above | as above | left at whatever the last successful claim/write set it to (`provisioning` at worst) | shown as in-progress/failed; a stuck `provisioning` row with a stale `planner_provisioning_last_attempted_at` is a reconciliation signal (§ orphan behavior below), not a silent hang forever — a bounded staleness threshold (e.g. any `provisioning` row untouched for more than a few minutes) makes it eligible for manual retry again | retry's CAS claim (`WHERE status IN ('pending','failed')`) does **not** by itself un-stick a row stuck at `provisioning` from a genuine crash; documented as a known MVP limitation requiring an administrator/support action (not a background reconciliation job, per Out of Scope) rather than silently over-claiming automatic self-healing here |
| 13 | `event_code` unique-constraint violation despite §10's collision-proof design (defensive only) | committed | insert rejected by Planner | none | `failed` | generic failure message | retry's lookup-by-code (§8) recovers via the same path as scenario 3 |
| 14 | Two near-simultaneous retry requests for the same event | committed | at most one insert/reuse occurs | at most one link written | exactly one reaches `succeeded`, the other sees `409 provisioning_in_progress` at the CAS claim | the losing request's caller sees "already in progress" | no duplicate Planner call from the losing request (§9) |
| 15 | **Mapping drift — added during `/speckit.analyze`, previously undefined**: a Planner event was already created under Planner-organization A on a prior (failed-before-link) attempt, and `organization_planner_links` is changed to point at Planner-organization B before a retry runs | committed, unaffected | Planner event exists under organization A | none (never written) | `failed`, with a distinct `mapping_drift` diagnostic naming both organization ids (§5 Phase 2 step 4, §6) | a message directing the user to contact support/an administrator — this is not a self-service-retryable state, since blindly retrying again would hit the identical mismatch | **no automatic resolution** — retrying again reproduces the same `mapping_drift` failure until a platform administrator manually reconciles (restores the original mapping, or manually resolves the orphaned Planner-A event); the design deliberately never auto-creates a second Planner event under organization B nor auto-links the organization-A event, since either would silently misattribute data across Planner tenants |
| 16 | **Conflicting-payload idempotency reuse — added during `/speckit.analyze`, previously undefined**: the same `idempotencyKey` is submitted twice with a different `organizationId` or `products` selection | first request's event exists; second request writes nothing | unaffected by the second request | unaffected | unaffected by the second request | second request receives a distinct `idempotency_conflict` error, never the first request's event data | the caller must submit a new, distinct `idempotencyKey` for a genuinely different request — reusing the same key with different intent is rejected, not silently reinterpreted |

## 15. Retry semantics

A retry request (`POST /api/events/{eventId}/retry-planner-provisioning`, §"API contracts") re-runs
Phase 0's re-validation (authorization, organization, entitlement, mapping — all re-read live, never
reused from the original request) against the *existing* event id supplied in the URL, then re-enters
the orchestration at Phase 2. It never calls `create_event_with_products` again. Authorization for a
retry is identical to creation authorization (platform admin, or `owner`/`admin` of the event's
organization) — not restricted to only the original creator, since any authorized manager of the
organization should be able to unblock a stuck event. Retry is customer/administrator-triggered only;
no scheduled or background retry is introduced (Out of Scope, Assumptions).

## 16. Orphan / reconciliation behavior

Not built this feature (Out of Scope: no background jobs) — but the design supports a future,
manually-triggered reconciliation query without any further schema change: events with
`planner_provisioning_status = 'provisioning'` and a `planner_provisioning_last_attempted_at` older
than a chosen staleness threshold are exactly the "possibly orphaned" set; the Planner-side
`event_code` anchor (§10/§8) is what such a future utility would use to check whether a Planner-side
row actually exists for each one. Documented as future admin tooling, per the architecture report's
own recommendation — not re-litigated here.

## 17. Product-selection / missing-mapping / provisioning-failure UX

**Product selection**: `CreateEventModal` gains a preflight read (on modal open, using the already
fast, already-cached-by-React-state organization context) of both entitlements; renders no selector
for a single active entitlement (auto-selected, invisible to the user, matching FR-002/FR-003), a
Bendie/Planner/Both control only when both are active (FR-004), and disables the "New Event" trigger
entirely with an explanatory message when neither is active (FR-005) — this mirrors, not replaces,
the existing `canCreateEvent` gate already in `EventsPage`.

**Missing mapping**: checked at product-selection time (as soon as "Planner" or "Both" is chosen, not
only at final submit) so the blocking message (FR-019's exact wording) appears before the user fills
in the rest of the form — but the server-side check in Phase 0 step 5 remains the actual authority
regardless of what the client already showed (never trust the client's earlier read).

**Provisioning failure**: the creation request itself only ever reports Portal-side success/failure
(Phase 1's outcome) — a Planner-side failure after that point does not retroactively make the creation
response an error. The UI shows the event as created, with its provisioning state visibly `failed` or
`provisioning`, and a retry action, consistent with §14 and FR-021 ("DO NOT pretend creation completely
failed").

## 18. Post-create routing

All three product mixes route to the existing, unchanged event shell
(`/portal/events/[eventId]/dashboard`) — Feature 003's own product-aware navigation already renders
zero Bendie tabs for an event with no `'bendie'` `event_products` row, which is exactly correct for a
Planner-only event today (no Planner workspace exists yet to route into instead). No new route
namespace is introduced (Assumptions, Out of Scope).

## 18a. Entitlement revocation interaction

Unchanged from Feature 003: revoking `organization_products.is_active` never deletes or alters
existing `event_products` history for events that already exist. This feature adds exactly one new
interaction, already covered above: entitlement is re-checked at Phase 0 (initial creation) and again
at Phase 2 step 2 (immediately before any Planner-side write, including on retry) — a creation-time
and provisioning-time gate only, never an access-time gate; Feature 003's existing access-time
semantics (product-aware navigation, workspace access) are untouched.

## 19. Migration strategy

All new Portal-side objects (the two new columns groups on `events`, `event_creation_requests`,
`create_event_with_products`, `get_event_planner_provisioning_error`, the column-privilege revoke on
`planner_provisioning_error`, the two guard additions to `planner-push-agenda`/`planner-pull-travel`
being code, not schema) are captured as new, descriptively-named migrations, applied via
`apply_migration` and recorded in `supabase/migrations/`, positioned in
`supabase/migrations/MIGRATION_ORDER.md`'s documented fresh-bootstrap order (append after the current
last entry, `get_event_planner_sync_status_execute_lockdown.sql`/`shared_trigger_helper_functions_baseline.sql`/
`event_members_planner_metadata_update_privilege_fix.sql`, since none of this feature's new objects are
depended upon by anything earlier). The one Planner-side schema change (none — this feature adds no
Planner-side columns; §10's approach needed none) confirms Planner's schema requires zero migration for
this feature. This repository's accepted repository-wide historical migration gap (~36 migrations, ~44
functions predating Feature 001) is explicitly not touched or expanded upon by this feature — every
object this feature itself introduces will be fully committed, closing none of the historical gap and
opening none of its own.

## 20. Observability

The five new `events` columns (§6) directly answer every operational question this planning pass
asked for ("which events need Planner / are pending / provisioning / failed / why / how many attempts
/ which Planner event is linked / when did it succeed") via ordinary `SELECT`s an administrator (or a
future admin-tooling page, out of scope here) can run — `planner_event_id`/`is_active` on
`event_planner_links` answers "which Planner event is linked." No new logging/metrics/tracing
infrastructure is introduced; this matches the codebase's existing lack of such infrastructure
elsewhere and is proportionate to this feature's scope.

## 21. Post-review corrective pass (2026-09-16)

An independent review of the completed implementation identified five actionable findings (R1–R5).
This section records what changed and, just as importantly, what deliberately did **not** change —
none of §1–§20 above is superseded; this section is additive, per this repository's own append-only
correction convention (matching how `/speckit.analyze`'s §3/§5/§6/§7/§14 corrections were handled
during the original implementation pass).

**R1 — Stuck-`provisioning` customer messaging.** Scenario 12 (§14) already correctly predicted and
accepted that a row genuinely stuck at `provisioning` cannot be auto-reclaimed by the CAS claim, and
explicitly deferred any reconciliation tooling as out of scope. That design decision is **unchanged**.
What was missing was *honest customer-facing messaging* — the UI previously showed the identical
"Setting up Bendie Planner…" message for both a healthy, seconds-old `provisioning` row and one that
had been stuck for hours, with no Retry action available for either. `src/lib/
plannerProvisioningStaleness.ts` now defines a single, centrally-declared threshold
(`PLANNER_PROVISIONING_STALE_AFTER_MS`, 5 minutes — chosen because provisioning is designed as a
single bounded synchronous operation per this document's own "Performance Goals," so a healthy attempt
completes in seconds, not minutes) and `PlannerProvisioningBanner` uses it to show a distinct, truthful
"taking longer than expected — contact your administrator or support" message once a `pending`/
`provisioning` row crosses it. **No Retry button is ever shown for `provisioning`**, stale or not — the
backend still cannot safely reclaim it, and offering the button would either no-op (`409
provisioning_in_progress`) or falsely imply a recovery capability that does not exist. This is a
UI-truthfulness correction only; it introduces no automatic reclaim and no reconciliation worker.

**R2 — Retry contract correction.** `contracts/retry-planner-provisioning.md` previously claimed the
retry endpoint "defensively" handles a stuck `provisioning` row "past a staleness threshold," citing
this very scenario 12 as if it supported that claim — scenario 12 says the opposite. The contract has
been corrected to state plainly that `provisioning` is never retryable through this endpoint, cross-
referencing this section and the R1 UI correction, so contract/research/implementation now all agree.

**R3 — Concurrent same-key creation race.** The original `create_event_with_products` had a fast-path
pre-check (`SELECT ... WHERE idempotency_key = $1`) that was always a read-then-act race against its
own final `INSERT INTO event_creation_requests` — the `idempotency_key` PRIMARY KEY was always the
actual correctness backstop (no duplicate event could ever persist), but a concurrent loser surfaced a
raw, unmapped Postgres `23505` instead of gracefully recovering the winner's event. The function's
creation sequence (events/event_products/event_members/provisioning-status/event_creation_requests) is
now wrapped in its own `BEGIN … EXCEPTION WHEN unique_violation` block. PL/pgSQL implicitly opens a
SAVEPOINT for such a block; on a genuine race, the loser's own newly-inserted rows are rolled back to
that SAVEPOINT in full (never left as an orphaned second event — confirmed live, see tasks.md T093),
the handler confirms via `GET STACKED DIAGNOSTICS ... CONSTRAINT_NAME` that the violation is
specifically `event_creation_requests_pkey` (any other unique-violation is re-raised, never
misinterpreted), and then re-reads and returns the now-guaranteed-committed winning request — exactly
what a fresh replay would have returned. A same-key-*different*-payload race still raises
`idempotency_conflict`, not a silent misattribution.

Genuine concurrent HTTP-level request racing could not be reproduced in the non-interactive review/
correction session (no ability to hold two overlapping database sessions open across separate tool
calls). The strongest available evidence is a live mechanism-level reproduction (tasks.md T093) of the
exact `BEGIN`/`EXCEPTION`/`GET STACKED DIAGNOSTICS`/SAVEPOINT-rollback/recovery sequence against the
real database, plus a best-effort parallel-dispatch RPC attempt (tasks.md T094) — both documented
explicitly as what they are, not conflated with a true concurrent-request proof.

**R4 — Authorization before idempotent replay.** The authorization re-check
(`portal_is_global_admin() OR is_organization_admin(p_organization_id)`) is now the function's first
statement, before the idempotency lookup — previously, a caller who knew a still-valid
`idempotency_key` could read back an existing event via the fast-return path without this internal
check ever running (the calling route's own check still applied; only the RPC's own internal
defense-in-depth layer had the gap). A caller whose organization role is revoked after their original
request can no longer replay their old key to read the event back — confirmed live (tasks.md T092).

**R5 — Duplicate product values.** `p_products` is now checked for duplicates (`RAISE
invalid_request`) before anything else uses it, and canonicalized (`array_agg(... ORDER BY p)`) once
validated, both so a direct RPC caller can never reach `event_products`' own `PRIMARY KEY (event_id,
product_key)` as a raw constraint violation, and so `['planner','bendie']` and `['bendie','planner']`
are recognized as the same logical request for idempotency comparison. The three canonical product
sets (`{bendie}`, `{planner}`, `{bendie,planner}`) are otherwise unchanged.

**Explicitly not revisited in this pass** (per the review's own "do not reopen" list, unaffected by
R1–R5): SECURITY DEFINER EXECUTE lockdown, `events` provisioning-column privilege model,
`planner_provisioning_error`'s SELECT/INSERT/UPDATE exclusion, `event_planner_links`/
`organization_planner_links` uniqueness, Planner `event_code` uniqueness, `event_products` constraints,
the Feature 001 `bendie`-product guard placement. The harmless `REFERENCES` grant on
`planner_provisioning_error` noted by the review is accepted as-is — it permits only defining a foreign
key against the column, exposes no data, and does not warrant ACL churn.
