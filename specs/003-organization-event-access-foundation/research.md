# Phase 0 Research: Organization & Event Access Foundation

Every decision below was verified against the live repository and live database during planning (`middleware.ts`, `portalAuth.ts`, `OrganizationContext.tsx`, `EventContext.tsx`, event layout, `eventSectionMeta.ts`, and live `pg_policies` for `events`, `event_members`, `organization_members`, `organizations`, `teams`, `organization_products`, `event_products`), not assumed from the specification or the prior architecture-discovery report.

## 0. The single most important finding: RLS alone is not enough to separate event metadata from workspace access

**Discovery**: `EventContext.handleSetCurrentEvent`/`refreshEvent` (`src/contexts/EventContext.tsx`) perform a bare `supabase.from('events').select('*').eq('id', eventId).single()` with **no application-level authorization check** — access is entirely RLS-driven today. The event layout (`src/app/portal/events/[eventId]/layout.tsx`) renders the full 24-tab shell unconditionally once `currentEvent` is non-null; it does not itself re-check `event_members`.

Today this is safe by accident: the only non-global-admin path into `/portal` is blocked entirely by `middleware.ts`, so no non-admin request ever reaches this code. Once admission is widened (FR-001), it stops being safe: this plan's own new `events` SELECT policy (below) will let an organization owner/admin's `events` row fetch succeed for *any* event in their organization — including ones they have no `event_members` row for — because RLS has no way to distinguish "the caller may see this row" from "the caller may enter this workspace." If `EventContext` continues to treat "the row fetch succeeded" as "the user may enter the workspace," an org admin would be able to open the tab shell (though individual tab pages querying `event_members`-gated content tables would return empty/denied results underneath it) for events they should not be workspace-managing.

**Decision**: Add an explicit, application-level workspace-access check, independent of whether the `events` row itself was fetchable. `EventContext` (or a new `requireEventWorkspaceAccess` helper in `src/lib/eventAuth.ts`) must additionally query `event_members` for `(event_id, auth.uid())` — or accept a platform-admin bypass — before flagging the event as workspace-accessible. The event layout renders the tab shell only when this explicit flag is true; otherwise it renders a forbidden/not-found state (spec FR-010, FR-013, FR-015; AGENTS.md's explicit "Do not allow org-admin event-list visibility to accidentally satisfy step 5" instruction).

**Rationale**: This is precisely the "canViewEventMetadata vs. canAccessEventWorkspace" conceptual separation the planning brief calls for, discovered from the actual code rather than assumed. It also matches Constitution Principle IV ("every privileged action must perform its own authorization check ... independent of any check already done in a calling layer") — RLS is the backstop, not the sole gate, for this specific boundary.

**Alternatives considered**: Rely on RLS alone and simply not add the org-admin metadata policy to `events` — rejected, it would leave FR-009 (org-admin implicit metadata visibility) unimplementable, since there would be no way for an org admin to even list events they don't hold `event_members` on. Encode the distinction only in a second, separate "public" query used by the event-list page, leaving `EventContext`'s full-row fetch as the sole gate for workspace entry — rejected, because the event list and direct-URL navigation must be independently secure; a user editing the URL bar does not go through the list page's query at all.

## 1. Portal admission gate

**Live behavior confirmed** (`src/middleware.ts`): a single check, `if (user && pathname.startsWith('/portal')) { role = getRole(user.id); if (role !== 'admin') redirectTo('/unauthorized'); }`. This is the entire admission gate; there is no secondary per-route check anywhere else server-side.

**Decision**: Change the middleware condition to admit the user when `role === 'admin'` **or** the user holds at least one live `organization_members` row (a lightweight existence query, cached the same way `getRole` already caches the role for 60s via the existing `portal_role_cache` cookie pattern — reuse that mechanism rather than inventing a second cache). Users who are neither get redirected to a new safe no-organization/no-access route (not `/unauthorized`, which implies a permissions failure rather than "you have no organization yet").

**Rationale**: This is the smallest change that satisfies FR-001/FR-002 exactly where the existing gate already lives, reusing its existing caching pattern rather than adding a second one.

**Alternatives considered**: Move the check into a root `/portal/layout.tsx` server component instead of middleware — rejected; middleware already owns this responsibility for the whole `/portal` tree and already handles the redirect-cookie-forwarding subtlety documented inline in the file, so duplicating that logic in a layout would be new complexity for no benefit.

## 2. `getAccessibleOrganizations()` / `OrganizationContext` — reuse as-is

**Live behavior confirmed**: `getAccessibleOrganizations()` (`src/lib/portalAuth.ts`) already has a correct non-admin branch (`organization_members` join), and `OrganizationContext` already resolves/persists/switches organizations via `profiles.current_organization_id`, already revalidating against `accessible.find(o => o.id === profile?.current_organization_id)` on every load (a stale ID silently falls back to the first accessible organization — this already satisfies FR-005's "must never grant access" requirement, since a stale ID simply isn't found in `accessible` and is discarded).

**Decision**: No change. This code path was simply unreachable (middleware blocked all non-admins); it needs no modification, only a widened admission gate to become reachable.

**Rationale**: Matches Constitution Principle I (reuse existing architecture) precisely; confirms the architecture-discovery report's finding.

## 3. `getAccessibleEvents()` — real non-admin implementation, RLS-driven

**Live behavior confirmed**: `getAccessibleEvents()` currently hard-returns `[]` for any non-admin (`if (!profile || profile.global_role !== 'admin') return [];`).

**Decision**: Replace the hard-`[]` branch with a real query scoped to the selected organization: `supabase.from('events').select('id,name,status,starts_at,organization_id,event_products(product_key)').eq('organization_id', organizationId).order('starts_at', { ascending: false })`, and let RLS do the per-caller filtering — platform admins keep their existing separate branch (unchanged); org owners/admins see every row in that organization because of the new `events` SELECT policy (research item 4); ordinary members see only rows `events_select_member` already permits (their own `event_members` rows or events they created). No role-branching is needed in application code for *which rows* come back — only for *which organization to scope the query to* (the caller's currently selected organization, per FR-007).

**Rationale**: Satisfies the "avoid N+1 authorization queries" instruction directly — one scoped query, RLS enforces the rest, exactly like `getAccessibleOrganizations()` already does for its non-admin branch.

**Alternatives considered**: Branch in application code on the caller's `organization_members.role` to decide whether to add an `event_members` join filter — rejected; it would duplicate logic RLS already needs to enforce anyway (a client could bypass a client-side-only distinction), and it reintroduces exactly the kind of "trust the client's role claim" pattern Constitution Principle IV prohibits.

## 4. `events` RLS — one new additive SELECT policy

**Live policies confirmed** (`pg_policies` on `public.events`): `Global admins can manage/view all events` (`portal_is_global_admin()`), `events_insert_creator`, `events_select_member` (`is_event_member(id) OR created_by = auth.uid()`), `events_select_public_showcase` (`status IN ('active','published')` — a pre-existing, unrelated public-read policy for showcased events, not modified by this feature), `events_update_host_organizer`. There is **no existing policy giving an organization owner/admin visibility into events they don't hold `event_members` for** — this confirms FR-009 requires a genuine, new RLS policy, not just an application-code change.

**Decision**: Add one new permissive SELECT policy: `events_select_org_admin` — `USING (is_organization_admin(organization_id))`, reusing the existing `is_organization_admin()` helper (confirmed live, already used by `organizations_update_owner_admin` and `organization_members_update_owner_admin`) verbatim, no new helper function.

**Rationale**: Minimal, additive, precedent-following (reuses an existing helper exactly as Constitution Principle III requires — "reuse the existing ... pattern matching whichever precedent the new table's access shape actually resembles"). Because this policy is added only to `events` (metadata) and never to `event_members` or any content table, it cannot by itself grant workspace/content access — that boundary is enforced by the application-level check in research item 0, and independently backstopped by `event_members`'s own unchanged RLS.

**Alternatives considered**: Make `is_organization_admin(organization_id)` a condition added directly inside `event_members`'s existing SELECT policy — explicitly rejected; this is exactly the "do not make `is_organization_admin(event.organization_id)` a generic substitute for `event_members`" instruction, and would collapse the metadata/content distinction the whole feature exists to preserve.

## 5. `event_members`, content tables — no RLS change

**Live policies confirmed**: `event_members_select_event_member` (`is_event_member(event_id)`), `event_members_insert_self_or_host`, `event_members_update_self_or_host`, plus the existing global-admin bypass. Content tables (agenda_sessions, etc.) already gate off `is_event_member`/equivalent per the Feature 001-era `010_event_scope_restrictive_admin_bypass.sql` dual-restrictive-policy pattern.

**Decision**: No change to any of these. They already correctly enforce the workspace/content boundary this feature must preserve.

## 6. `organization_members`, `organizations`, `organization_products`, `event_products` RLS — already customer-safe

**Live policies confirmed**: `organization_members_select_org_member` (`is_organization_member`), `organizations_select_member` (`is_organization_member(id) OR created_by`), and Feature 002's `organization_products`/`event_products` policies (admin `FOR ALL` + member `SELECT` via `is_organization_member`) are all already correctly org-scoped and customer-safe. They were simply unreachable behind the middleware gate.

**Decision**: No change.

## 7. `teams` table — pre-existing admin-only RLS, no action needed

**Live policies confirmed**: all four `teams` policies (`SELECT`/`INSERT`/`UPDATE`/`DELETE`) require `portal_is_global_admin()` — there is no organization-member read policy on `teams` at all today.

**Decision**: No change. `/portal/teams` will simply return empty results (RLS-denied) for a customer organization member after the middleware gate widens — this is safe (no data leak) and out of scope for Feature 003 to fix (no team-visibility requirement exists in spec.md). Documented in the route inventory (`data-model.md`) as a known, self-protected, pre-existing limitation, not a Feature 003 defect.

## 8. Platform-admin route boundary — minimum viable separation

**Live behavior confirmed**: `/portal/people`, `/portal/assets`, `/portal/activity-log`, `/portal/settings` are already organization-scoped in application code (`useOrganization()` → `organizationId` used directly in every query on these pages) — they are not platform-admin-only pages, they are customer-appropriate organization-management pages that merely required global-admin *login* today because of the middleware gate. `/portal/teams` is table-RLS-locked to global admins (research item 7) and needs no route-level change. No dedicated platform-admin-only page (e.g., a cross-tenant entitlement manager) exists yet in this repository.

**Decision**: No existing page needs to move into a new `/portal/admin/*` namespace for this feature — brownfield inspection found no currently-shipped page that is genuinely platform-admin-only at the *page* level (as opposed to being self-protected by table RLS, like `teams`). Establish the `/portal/admin/*` route-group convention now (an empty/reserved namespace, per FR-016/FR-017) so any future platform-admin-only surface (e.g., a future cross-tenant entitlement manager) has an obvious home, without moving any existing route.

**Rationale**: Satisfies "do not require a large migration of all existing admin UI if it is not needed" and "prefer the smallest brownfield-safe solution" directly — because every existing `/portal` page already either scopes itself correctly by organization or is already self-protected by its own table RLS, no route needs to move.

**Alternatives considered**: Move all of `/portal/people`, `/portal/assets`, `/portal/teams`, `/portal/activity-log`, `/portal/settings` under `/portal/admin/*` preemptively — rejected as unnecessary route churn; four of the five are already correctly org-scoped and safe for customers to use once admitted, and the fifth (`teams`) is already self-protected by RLS.

## 9. Active product entitlement — enforcement point

**Decision**: A single small helper, `isProductActiveForOrg(organizationId, productKey)` (or equivalent), reads `organization_products` filtered to `is_active = true`; product availability for an event additionally requires the corresponding `event_products` row. This is a pure read/filter helper, not a new authorization primitive — it feeds navigation filtering (research item 10) and is the reusable building block Feature 004's event-creation/Planner-provisioning eligibility checks will need later (per the spec's explicit forward-compatibility requirement).

## 10. Product-aware navigation — smallest safe model

**Live behavior confirmed**: `EVENT_SECTIONS` (`src/lib/eventSectionMeta.ts`) is a flat array of 24 tab-metadata objects with no product concept; the event layout (`layout.tsx`) maps over it unconditionally.

**Decision**: Add one field, `product: 'bendie' | 'planner' | 'shared'`, to `EventSectionMeta`. All 23 existing Bendie tabs plus the Feature-001 `bendie-planner` tab are classified `'bendie'` (the `bendie-planner` linking tab is Bendie-side tooling, not a Planner workspace module — it manages the link *from* the Bendie side). No tab is classified `'planner'` yet, because no Planner workspace module exists to classify (research item 11) — the classification field exists purely as the foundation later features will populate. The event layout filters `EVENT_SECTIONS` at render time: a `'bendie'`-classified tab renders only when the event's `event_products` includes `bendie` AND the organization's `bendie` entitlement is active; this is evaluated from data already being fetched for `currentEvent`/entitlement lookups, not from route names or hidden client state.

**Rationale**: Every existing event already has an active `bendie` entitlement and a `bendie` `event_products` row (Feature 002's backfill), so this filter is a no-op for all 16 existing events today (SC-005) while establishing the real mechanism.

## 11. Planner product context without Planner workspace modules

**Decision**: No Planner tab, route, or placeholder screen is added. The only Planner-facing artifact this feature adds is the `product: 'planner'` union member on the classification type introduced in research item 10 — an unused-but-declared value, not a rendered destination. If a future event's `event_products` were to include `planner` (none do today), the navigation filter in research item 10 would correctly compute "Planner is available for this event" without any tab existing to show it — which is the explicit, intentional foundation-without-implementation boundary FR-023/FR-024 require.

## 12. Feature 001 — regression safety, confirmed by inspection

**Live behavior confirmed**: all 5 `app/api/admin/planner-*` routes (`planner-sync-member`, `planner-link`, `planner-events`, `planner-push-agenda`, `planner-pull-travel`) independently check `profile.global_role !== 'admin'` server-side before doing anything privileged (grepped and confirmed across all 7 `app/api/admin/**` routes, not assumed). The `bendie-planner` tab page itself is just another entry in `EVENT_SECTIONS` (classified `'bendie'` per research item 10) and requires no special handling.

**Decision**: No Feature 001 code changes. Its API routes were never relying on the `/portal` middleware gate for their own protection — widening middleware admission does not change their reachability risk at all. The `bendie-planner` tab's visibility now goes through the same workspace-access guard (research item 0) as every other tab — a customer without `event_members` on an event cannot reach the tab shell to see it either, exactly like every other tab.

## 13. Feature 002 — regression safety, confirmed unchanged

**Decision**: No schema, RLS, or data change to `organization_members`, `organization_products`, `event_products`, or `organization_planner_links`. Verification is read-only re-confirmation (quickstart.md) that their live RLS and live row counts are unchanged after this feature's migration is applied.

## 14. Event-organization reassignment (M2) — confirmed, no code exists, no action needed

**Live behavior confirmed**: a repo-wide search for `organization_id` writes inside `app/portal/**` found no code path that updates `events.organization_id` after creation (`CreateEventModal` only ever inserts it; `basics/page.tsx`, the event-editing surface, does not include `organization_id` among its editable fields). `events_update_host_organizer`'s `WITH CHECK` does not exclude `organization_id` from an `UPDATE ... SET` at the RLS layer, but no application code ever attempts it.

**Decision**: No RLS or application change needed to enforce the M2 prohibition — it already holds by omission. Documented here rather than silently assumed, per AGENTS.md's brownfield-discipline instruction to verify rather than guess.

## 17. Addendum (corrective pass, F-R2/F-R5 re-audit): the customer-reachable-event-tab pattern is broader than Members alone, but not a second privilege escalation

**Discovery**: an independent post-implementation review found that `src/app/portal/events/[eventId]/members/page.tsx` had no management-role guard — any `event_members` row (including `attendee`) got the full role-management UI, and `event_members_update_self_or_host`'s RLS additionally permitted self-role-escalation (`user_id = auth.uid()` unconditionally, with no column restriction). Both were harmless only because `/portal` was previously global-admin-only; Feature 003 made them live. Prompted by this, a full re-audit was run across all 24 `EVENT_SECTIONS` tabs and their backing tables' RLS: `~15` ordinary content tables (`agenda_sessions`, `facilitators`, `activities`, `excursions`, `expo_spaces`, `games`, `faqs`, `emergency_contacts`, `info_content`, `support_contacts`, `event_photos`, etc.) grant UPDATE/DELETE to **any** `is_event_member(event_id)` — not host/organizer/admin-restricted.

**Decision**: this is **not** treated as a second instance of the Members bug, and no code was changed for it. Two things distinguish it from F-R2: (1) none of these tables has a role/privilege column analogous to `event_members.role` — they're plain content, so "any member can edit" is a data-scope question, not a privilege-escalation vector; (2) this pattern is genuinely pre-existing and was deliberately hardened by its own dedicated migration (`rls_audit_fix_missing_and_loose_write_policies`, dated before Feature 001 even existed) — it reads as an intentional "collaborative event-content editing" product decision for this application, not an oversight later masked by admin-only middleware. Per the review's own explicit constraint ("the purpose is NOT to redesign event permissions... apply only the minimum correction consistent with existing role semantics"), redesigning this broad content-editing model is out of scope for a corrective pass and would itself be an unapproved product-policy change. Documented here as a known, now-consciously-reconfirmed fact of the widened-reachability surface, not a defect.

## 18. Addendum (SUPERSEDED by item 20 — second corrective pass): `events_insert_creator`'s org-creator fallback — now RESOLVED

**Original status (first corrective pass)**: reported as open security debt requiring an explicit product decision, not fixed, per the instruction not to silently decide a product policy.

**Resolution**: the product decision was made explicitly — historical creator identity (`organizations.created_by`) is audit/history data, not a current authorization grant. See item 20 for the implemented fix. This item is retained for its historical record of the original discovery; item 20 is authoritative for current behavior.

## 19. Addendum (corrective pass, F-R6): duplicated `canCreateEvent` authorization logic — deferred

**Discovery**: the ~17-line effect resolving `canCreateEvent` (platform-admin short-circuit + `isOrgAdmin(organizationId)` lookup) is duplicated verbatim between `src/app/portal/events/page.tsx` and `src/app/portal/page.tsx`. No security failure follows from the duplication itself — both copies currently implement the identical rule.

**Decision**: left as-is per the review's own explicit "do not prioritize this over security corrections" instruction. Recorded as LOW-severity maintainability debt — a future change to this authorization rule must remember to update both copies, or extract a shared hook (e.g. `useCanCreateEvent(organizationId)`) at that time. Not re-examined in the second corrective pass (the second independent review did not re-flag it, and its own instructions explicitly said not to fail convergence over it alone).

## 20. Addendum (second corrective pass, R2-F1): historical-creator authorization removed

**Resolution of item 18**: `events_insert_creator` no longer contains any creator-fallback clause. The final policy is:

```sql
CREATE POLICY "events_insert_creator" ON public.events FOR INSERT
  WITH CHECK (created_by = auth.uid() AND public.is_organization_admin(organization_id));
```

Live-verified (`event_members_creator_fallback_removed_and_planner_metadata_locked.sql`): a former organization creator with zero current `organization_members` standing is denied INSERT; a current organization owner/admin is allowed; an ordinary current member is denied; an unrelated authenticated user is denied; a platform admin (no organization membership at all, via the separate, untouched `portal_is_global_admin()` ALL policy) is allowed; a manipulated/nonexistent `organization_id` is denied. All six scenarios were run against real temporary fixtures and cleaned up afterward.

## 21. Addendum (second corrective pass, R2-F2/R2-F3): EventContext stale-response and explicit-intent redesign

**Discovery**: the first corrective pass's `explicitEventIdRef` fix (research.md's own T068 entry) closed only the specific race it was built to catch (`loadEvents`'s auto-select overwriting an explicit URL-driven selection on initial mount). A second independent review correctly identified two further problems: (1) none of `EventContext`'s async writers (`checkWorkspaceAccess`, `handleSetCurrentEvent`'s fetch, `refreshEvent`) guarded against a slower, older request resolving *after* a newer one and overwriting state with stale results — the general "authorization state and displayed event can desynchronize under rapid navigation" class, not just the one mount-time instance; (2) `explicitEventIdRef` was set once and never reset, permanently disabling `loadEvents`'s auto-select fallback for the rest of the browser session after the first event visit, including across later organization switches.

**Decision**: replaced the single-purpose ref with two coordinated, narrowly-scoped mechanisms rather than another one-off patch:

1. **`latestEventIdRef`** — always holds the eventId that is currently authoritative. Every async writer compares its own target eventId against this ref immediately before committing any state, and silently discards itself on mismatch. This is the "eventId + organizationId request identity checked before state commit" pattern explicitly listed as acceptable — chosen over a raw incrementing generation counter because a shared counter across genuinely-independent concerns (event-detail fetch vs. workspace-access check) was found, on paper, to cause the two to spuriously invalidate *each other* even when both were legitimately converging on the same final target; comparing against the actual target eventId does not have this failure mode.
2. **`hasExplicitEventRef`** — scoped to the navigation lifecycle, not permanent. Set by `handleSetCurrentEvent` (called only while `EventLayout` is mounted on an event-scoped route) and cleared by a new `clearCurrentEvent()` context method that `EventLayout` calls on unmount. `loadEvents`'s auto-select checks this ref rather than "has any event ever been explicitly requested" — so leaving the event route, a later organization switch, and later unrelated event loads all correctly regain normal auto-select behavior instead of staying disabled for the rest of the session.

An organization change while no event-scoped route is mounted now also explicitly clears `currentEvent`/`currentEventId` rather than leaving the previous organization's event displayed under the new organization's context.

**Live verification**: authorized→unauthorized navigation shows forbidden with no leaked prior content; unauthorized→authorized (again) shows real content with no stale denial; rapid back-and-forth sequences settle on the correct final state; leaving the event route recovers cleanly; after actually switching the persisted organization selection (the same write the real org-switcher performs) and navigating to the new organization's own event, that event loads correctly. One test scenario (a bare cross-organization deep link with no accompanying organization switch) initially looked like a failure; live investigation confirmed it is the F1 selected-organization-mismatch protection correctly denying access, not a defect in this redesign. The deepest form of the race — an adversarially delayed response deliberately reordered against a same-tab in-memory SPA transition without a page reload — was not separately forced in a live test (Playwright's `page.goto()` always performs a real navigation, remounting `EventProvider` fresh each time); the guarantee for that exact scenario rests on the code-level design (every commit is gated on matching `latestEventIdRef`), not on a forced-timing live reproduction. Stated explicitly here rather than overclaimed.

## 22. Addendum (second corrective pass, R2-F4): Planner sync metadata now protected at the database privilege layer

**Discovery**: the first corrective pass's F-R5 fix gated only the `bendie-planner` page itself (client-side, platform-admin-only). `event_members.planner_sync_status`/`planner_sync_error` (and the related `planner_assignment_id`/`planner_synced_at`) remained readable by any ordinary event member through a direct client-side query, bypassing that page entirely — RLS is row-level (`event_members_select_event_member`'s `is_event_member(event_id)` legitimately grants roster-row access), not column-level, so it could not have addressed this on its own.

**Consumer discovery performed first** (per this task's explicit instruction not to choose a design before mapping consumers): exactly 3 — `bendie-planner/page.tsx` (reads, platform-admin-gated), `planner-sync-member/route.ts` (writes, via the calling admin's own authenticated session, not service-role), `src/types/database.ts` (types only). No ordinary-member-facing page reads these columns.

**Design chosen, and why**: column-level database privileges (Option C from the task's own menu), not a new table (Option A — unnecessary schema churn and data-migration risk for a genuinely column-scoped problem) and not merely an RLS policy (RLS cannot express column-level restriction at all).

**A first attempt was live-tested and found not to work** — `REVOKE SELECT (planner_sync_status, ...) ON event_members FROM authenticated, anon` while `authenticated`/`anon` still held the table-level SELECT grant. Direct testing (not assumption) showed an ordinary member could still read the column. Inspecting `pg_class.relacl` directly confirmed why: in PostgreSQL, a table-level SELECT grant subsumes column-level REVOKEs for that role — the REVOKE was a no-op in practice while the table-level grant remained. This is exactly the failure mode the task instructions warned against assuming away, and it was only caught because the fix was tested live immediately rather than trusted.

**Corrected fix**: `REVOKE SELECT ON event_members FROM authenticated, anon` (the whole table-level grant — the only thing that actually narrows column access), then `GRANT SELECT (event_id, user_id, organization_id, role, onboarding_status, onboarding_completed_at, invited_by, created_at)` back to both roles. A new `SECURITY DEFINER` function, `get_event_planner_sync_status(p_event_id)`, re-verifies `portal_is_global_admin()` internally and returns all Planner columns only when true — this is how the legitimate platform-admin page now reads this data, since column grants are role-wide and cannot distinguish "this particular authenticated user is a platform admin" the way RLS's `auth.uid()`-driven functions can.

**Live verification**: ordinary member's direct `SELECT planner_sync_status` → `42501 permission denied`; same member's `SELECT role, onboarding_status` → succeeds; ordinary member calling the RPC → denied; platform admin calling the RPC → succeeds, returns real data; platform admin's own authenticated-session `UPDATE` of `planner_sync_status` (matching the real Feature 001 write pattern) → still succeeds, confirming the SELECT-only revoke does not touch the legitimate write path; `bendie-planner/page.tsx` updated to call the RPC and re-verified rendering correctly for a platform admin.

## 23. Addendum (second corrective pass): role-escalation guard and service-role exemption re-confirmed, not weakened

Touching `event_members`-related migrations again in this pass prompted a full re-check of the first pass's role-immutability trigger and its `current_setting('role', true) = 'service_role'` exemption, per the second review's explicit request. Both re-verified live and left unchanged: ordinary member self-promotion to `admin`/`host` still denied; legitimate host/admin role management of other members still works; a real service-role write to `role` still succeeds. The exemption itself was re-examined for a possible spoofing path: `current_setting('role', true)` reflects the Postgres session-level `role` GUC that PostgREST sets from the connecting JWT's role claim at connection time — an ordinary `authenticated`-role request has no mechanism to set this GUC to `service_role` for itself (it is not a request body/header value the client controls; it is derived server-side from which API key signed the JWT). No escalation path found.

## 19. Addendum (corrective pass, F-R6): duplicated `canCreateEvent` authorization logic — deferred

**Discovery**: the ~17-line effect resolving `canCreateEvent` (platform-admin short-circuit + `isOrgAdmin(organizationId)` lookup) is duplicated verbatim between `src/app/portal/events/page.tsx` and `src/app/portal/page.tsx`. No security failure follows from the duplication itself — both copies currently implement the identical rule.

**Decision**: left as-is per the review's own explicit "do not prioritize this over security corrections" instruction. Recorded as LOW-severity maintainability debt — a future change to this authorization rule must remember to update both copies, or extract a shared hook (e.g. `useCanCreateEvent(organizationId)`) at that time.

## 24. Addendum (third corrective pass, R3-F1/R3-F3): actual migration ordering semantics

**Discovery, evidence-based, not assumed**: this repository has no `supabase/config.toml`, no
installed Supabase CLI, and no script or CI workflow anywhere that globs `supabase/migrations/`
(confirmed by searching the full repository). The only mechanism that has ever applied a migration
here is the Supabase MCP `apply_migration` tool, called once per file, which assigns its own UTC
timestamp as the `version` recorded in the live database's `supabase_migrations.schema_migrations`
table at the moment of the call — entirely independent of the local filename. `list_migrations`
against the live Portal project is therefore the ground truth for real apply order, not directory
listing order. Given that, "does this repo replay migrations in alphabetical filename order" is not
a real, currently-exercised code path — R3-F1 and R3-F3 are real reproducibility risks for a
*hypothetical future* fresh-bootstrap process, not an active bug in how migrations are applied
today (the live database's actual history, per `list_migrations`, is already in the correct
functional order for both).

**Exact fresh migration order** (evidence-based, derived from `list_migrations`): see
`supabase/migrations/MIGRATION_ORDER.md`, which is now the authoritative document — reproduced in
`context/schema-reference.md`'s "Fresh-bootstrap reproducibility" section rather than duplicated
here.

**R3-F1 resolved via documented order, not a rename**: `add_planner_sync_status_check.sql` sorts
alphabetically before `bendie_planner_integration.sql` but depends on a column the latter creates.
Empirically reproduced (disposable local Postgres 15 container): naive alphabetical replay crashes
outright (`column "planner_sync_status" does not exist`), aborting the whole chain — no later
migration can rescue a replay that already crashed. Neither file may be renamed or edited (both are
applied, immutable migration history per this repository's standing rule). Fix:
`MIGRATION_ORDER.md` declares the explicit required order as the one supported bootstrap
mechanism for this repository, superseding any assumption of naive alphabetical replay (which,
per the paragraph above, nothing in this repo currently performs anyway). Re-tested empirically in
the documented order: succeeds.

**R3-F3 was already resolved, differently, and more robustly**: the `event_members` role-guard
function went through four migrations live, in true chronological order ending with the correct
(service-role-exempting) body, but the four *filenames* sort alphabetically in the opposite order —
naive replay would silently leave the ORIGINAL broken body in place (no error). Unlike R3-F1, this
class of defect (wrong final state, not a crash) can be fixed by a later-sorting corrective file:
`zz_event_members_role_guard_final_authoritative.sql`, named to sort after every filename in this
repository, re-applies the verified-correct body with `CREATE OR REPLACE FUNCTION` regardless of
what ran before it. Empirically confirmed: replaying all five role-guard files in pure alphabetical
order still ends with the correct body. No manifest entry was required for correctness here (it is
self-healing by filename alone), though documented in `MIGRATION_ORDER.md` for completeness.

## 25. Addendum (third corrective pass, R3-F2): authorization helper functions brought under version control

**Discovery**: `is_organization_member`, `is_organization_admin`, `is_event_member`,
`is_event_host_or_organizer`, `is_event_manager`, and `is_global_admin` are referenced throughout
`supabase/migrations/` (from `006_global_admin_rls_bypass.sql` onward) and throughout the
application, but had no `CREATE FUNCTION` anywhere in committed migration history — only
`portal_is_global_admin()` was version-controlled. Found already fixed (uncommitted, but already
applied live, version `20260915130254`) via `000_authorization_helper_functions_baseline.sql`, a
"000_"-prefixed baseline whose 7 function bodies were verified, this pass, byte-for-byte against
live `pg_get_functiondef()` output — not reconstructed from memory, per this task's explicit
instruction for security-sensitive database code.

**Full dependency audit performed** (grepping every `public.<fn>(` call across all 26 committed
migration files against every `CREATE FUNCTION` in them) found one further gap the review didn't
name: `public.set_updated_at()`, called by a `CREATE TRIGGER` in Feature 002's own
`organization_and_event_product_foundation.sql`, also had no committed source anywhere. Not folded
into the already-applied `000_...baseline.sql` file (migration-immutability rule); instead a new
migration, `shared_trigger_helper_functions_baseline.sql`, applied live this pass (verified
byte-identical to the live definition via `pg_get_functiondef()`; idempotent no-op against the
current database).

**Broader gap, documented not fixed**: the same audit found 36 live migrations (spanning
pre-Feature-001 schema: teams, storage, leaderboard/points, chat, notifications, and more) and ~44
further live functions with zero committed source, entirely unrelated to Feature 003's own scope.
Per `AGENTS.md`'s scope-discipline rule, this is documented (`context/schema-reference.md`'s
"Fresh-bootstrap reproducibility" section) rather than reconstructed — attempting to recreate ~36
historical migrations from live introspection was judged clearly out of scope for this corrective
pass and too risky to do without being asked.

## 26. Addendum (third corrective pass, R3-F5): Planner sync-status RPC EXECUTE lockdown

**Discovery**: `get_event_planner_sync_status(uuid)` never had PostgreSQL's default `PUBLIC`
EXECUTE grant (which implicitly includes `anon`) explicitly revoked. The function's own internal
`portal_is_global_admin()` check already prevented any actual data exposure regardless of caller,
but the database privilege boundary itself was broader than the least-privilege design intended.

**Already fixed live** (found applied, version `20260915130736`) via
`get_event_planner_sync_status_execute_lockdown.sql`:
`REVOKE EXECUTE ... FROM PUBLIC` and `REVOKE EXECUTE ... FROM anon`; `authenticated` and
`service_role` retain EXECUTE. Verified this pass via direct `pg_proc.proacl` inspection (not
assumption): `{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}` — no `PUBLIC`
or `anon` entry present.

## 27. Addendum (third corrective pass, R3-F4/R3-F6): EventContext generation-based concurrency and events-array consistency

**Discovery**: found `src/contexts/EventContext.tsx` already rewritten (uncommitted) from the
second corrective pass's `latestEventIdRef` (which compares a response's target eventId against
"the current eventId," and therefore cannot distinguish two different requests for the *same*
event — exactly R3-F4's X→Y→X case) to two independent monotonic generation counters:
`eventGenerationRef` (guards `currentEvent`/`currentEventId`/`events`) and
`workspaceGenerationRef` (guards `canAccessWorkspace`/`workspaceAccessChecked`, bumped
unconditionally on every run of the workspace-check effect regardless of which dependency
triggered it). Two independent counters rather than one shared counter is a deliberate,
documented choice in the file itself: a single shared counter was tried first and found (by the
uncommitted predecessor session, per its own code comment) to cause the workspace-check effect and
the event-selection writers to spuriously invalidate each other under certain organization-switch
orderings — independent counters, each owned only by the writers that legitimately affect its own
piece of state, avoid that failure mode while preserving the same "latest request wins" invariant
per piece of state.

**Async writer audit performed** (all writers of `currentEvent`/`events`/`canAccessWorkspace`/
`workspaceAccessChecked`/`loading` re-mapped, not assumed complete from the file's own comments):
found one real, previously-unflagged bug. Three early-return branches inside the org-switch
effect's `loadEvents()` forced `setLoading(false)` unconditionally upon detecting a *stale*
(superseded) response — i.e. exactly the branch that exists *because* this response is no longer
authoritative was also unconditionally clearing shared `loading` state, which could prematurely
signal "done" while a newer, genuinely in-flight generation's own fetch was still the one that
should own that state. `loading` had not been generation-protected like the state list the review
named explicitly. Fixed by removing the forced `setLoading(false)` from the two branches reached
only when this generation is confirmed stale, leaving the correctly-gated `finally` block (and the
one early return that is NOT a staleness branch — the `hasExplicitEventRef` fast path, still the
current generation at that point) as the sole owners of `loading`.

**R3-F6 (events-array organization consistency) was also already implemented**: `setEvents(
fullEvents)` in `loadEvents()` runs for the current generation regardless of whether
`hasExplicitEventRef.current` is true — only the auto-*selection* step after it (picking and
fetching a default `currentEvent`) is suppressed by that ref, matching the review's required
separation of "refresh organization events collection" from "auto-select an event." An
organization switch also clears `events` to `[]` immediately (not only
`currentEvent`/`currentEventId`) while the new organization's fetch is in flight, so `events` can
never continue silently representing the previous organization mid-switch.

**Required ABA test — added and run**: no automated test framework exists in this repository
(unchanged from Features 001/002, per tasks.md's own "Tests" note); per the review's own "if
possible" allowance, a standalone deterministic script using deferred promises (not browser
timing), not wired into any test runner, was added:
`specs/003-organization-event-access-foundation/verify-event-context-aba.mjs`. It mirrors the
actual generation/discard-before-commit logic exactly against the two required scenarios: (1)
X₁→Y→X₂, X₂ resolves first, X₁ resolves last → X₁ discarded, X₂ authoritative; (2) Org A/X₁→Org
B→Org A/X₂, stale Org A/X₁ resolves last → old X₁ discarded, X₂ authoritative. Both pass. This
verifies the underlying invariant the real dual-ref implementation relies on; it does not replace
a live browser-timing test, and is documented as such rather than overclaimed (consistent with the
second corrective pass's own T077 precedent for this exact class of guarantee).

## 28. Addendum (F-NEW-1, final narrow verification's one new finding): Planner metadata UPDATE/INSERT privilege closed

**Discovery**: the final narrow verification found that R2-F4/R3-F5's Planner-metadata hardening
closed SELECT (`event_members_planner_metadata_column_grant_fix.sql`) and RPC EXECUTE
(`get_event_planner_sync_status_execute_lockdown.sql`) exposure, but never applied the equivalent
fix to UPDATE. `authenticated`/`anon` still held table-level UPDATE (and INSERT) on `event_members`
covering all columns, confirmed live via `information_schema.column_privileges` and
`pg_attribute.attacl`. Combined with `event_members_update_self_or_host`'s self-row `WITH CHECK`
(`user_id = auth.uid()`), an ordinary event member could directly `UPDATE` their own row's
`planner_sync_status`/`planner_sync_error`/`planner_synced_at`/`planner_assignment_id` via a raw
PostgREST call — forging Bendie Planner integration state that is meant to be exclusively
system-managed by the platform-admin-only `/api/admin/planner-sync-member` route.

**Fix, mirroring the proven SELECT mechanism exactly**: `supabase/migrations/event_members_
planner_metadata_update_privilege_fix.sql` revokes the table-level INSERT/UPDATE grant from
`authenticated`/`anon` and re-grants both only on the existing customer-safe column set. INSERT was
included alongside UPDATE (a small, deliberate scope decision, documented rather than made
silently): `event_members_insert_self_or_host`'s `WITH CHECK` also permits an ordinary member to
self-insert their own row, and the identical root cause (table-level grant subsuming column-level
control) would otherwise leave an equivalent forgery path open at row-creation time. Verified no
legitimate application `INSERT` call anywhere in `src/` sets any of the four columns, and all four
are nullable with no default, so this closes the equivalent gap with zero behavior change to any
working flow.

**A second, distinct privilege-semantics pitfall was found live while verifying this migration
itself** — caught by testing immediately rather than trusting the first version, per this feature's
now well-established pattern: `GRANT INSERT, UPDATE (column_list) ON t TO role` — multiple
privilege keywords sharing one trailing column list — applies that column list only to the
LAST-listed privilege. The first applied version of this migration left INSERT at the unrestricted
table level while correctly restricting UPDATE, confirmed via `pg_class.relacl` immediately after
applying it. Corrected to two separate single-privilege `GRANT` statements (mirroring the shape
R2-F4's own single-privilege SELECT grant already used, generalized to two privilege types
instead of one ambiguous combined statement). Both live migration versions (flawed, then corrected)
remain in the live project's migration history under the same name with different `version`
timestamps — documented in the migration file's own header rather than hidden, consistent with this
repository's migration-immutability rule and the precedent already set by the role-guard fix chain.

**Legitimate Feature 001 write path**: rather than introducing a new `SECURITY DEFINER` RPC,
`src/app/api/admin/planner-sync-member/route.ts`'s two `event_members` UPDATE calls were moved from
the caller's own authenticated session to the existing Portal service-role client
(`SUPABASE_SERVICE_ROLE_KEY`) — the identical, already-established pattern its sibling route,
`/api/admin/planner-pull-travel`, already uses for the equivalent problem on
`attendee_travel_details` (a system-managed field ordinary RLS-governed client privileges must not
reach). This was preferred over a new RPC because the route already independently verifies
`portal_is_global_admin()` via the authenticated client before any privileged action — switching
only the two Planner-column writes to service-role changes no authorization behavior, adds no new
privilege surface, and reuses rather than duplicates an existing, already-reviewed mechanism, which
is a smaller and safer change than hand-rolling a new parameter-validated RPC for a two-column write
that already has a proven, in-repository precedent.

**Live verification** (real Postgres privilege engine, every check wrapped in a rolled-back
transaction, no residual state): as `authenticated`, direct `UPDATE` of each of the four Planner
columns → `permission denied for table event_members` for all four; direct `INSERT` setting
`planner_sync_status` → denied the same way; `UPDATE` of a safe column (`onboarding_status`) →
privilege check passes. As `service_role`, `UPDATE` of `planner_sync_status` → privilege check
passes (the new Feature 001 write path). Immediately-related regression re-confirmed: the
`event_members_role_immutability` trigger is still enabled with its `service_role` exemption intact
(role-escalation guard unweakened by this pass), and Planner SELECT restriction is still intact.

## 15. Addendum (found during `/speckit.analyze`): event and organization creation were more permissive than intended

**Discovery**: `events_insert_creator`'s `WITH CHECK` allows any `is_organization_member(organization_id)` — not just `owner`/`admin` — to create an event, and `organizations_insert_creator`'s `WITH CHECK` allows any authenticated user (`created_by = auth.uid()`, no membership required at all) to create a new organization. Neither `src/app/portal/events/page.tsx`'s "New Event" button nor `src/components/portal/TopHeader.tsx`'s "New Organisation" trigger has any role gate. Both were harmless only because middleware previously blocked every non-platform-admin from `/portal` entirely.

**Decision**: Tighten both policies via a second, new migration (`supabase/migrations/event_and_organization_creation_admin_restriction.sql`) as part of this feature's Phase 2 foundation, restoring each capability to its pre-Feature-003 effective scope (event creation: organization `owner`/`admin`; organization creation: platform admin only) — see tasks.md T046–T050. This is treated as a security-compatibility fix required by Feature 003's own admission change (per FR-035 and AGENTS.md), not a Feature 004 concern, and not a new product decision (it restores existing effective behavior rather than removing a capability anyone currently has reachable access to).

## 16. Addendum: `requireEventWorkspaceAccess` must bind to the selected organization, not just `event_members` existence

**Discovery**: a multi-org user can legitimately hold `event_members` rows in more than one organization (User Story 5's exact scenario). FR-013 lists "event belongs to the user's currently selected organization" as a condition distinct from holding `event_members`. The original `eventAuth.ts` design in this document's earlier drafts and in plan.md's Phase 2 description did not make this parameter explicit.

**Decision**: `requireEventWorkspaceAccess(eventId, userId, selectedOrganizationId)` takes the selected organization as a required parameter and checks the event's own `organization_id` against it, in addition to `event_members` — see tasks.md T006 (corrected) and T023's added verification case. Also closes the parallel gap that product-availability (research.md item 9–10) was previously enforced only as navigation filtering, not as a direct-URL access gate — the event layout (T032) now blocks direct navigation to an unavailable product's route, not just its nav link.
