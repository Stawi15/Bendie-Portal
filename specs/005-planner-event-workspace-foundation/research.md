# Phase 0 Research: Planner Event Workspace Foundation

Each numbered question below resolves one implementation unknown left open by `spec.md`. Live-schema
facts were re-verified against the actual Bendie Planner Supabase project during this planning pass
(not assumed from the earlier architecture report), consistent with `spec.md`'s Context note that no
Bendie Planner client application source exists in this workspace.

## Q1. Exact current event-landing mechanism

**Decision**: There is no `page.tsx` at the bare `/portal/events/[eventId]` route, and no
default-section redirect logic exists anywhere today. Every "open this event" entry point
(`EventsOverviewPanel.tsx:117`, `NextMilestoneCard.tsx:79`, `TopHeader.tsx:46`) hardcodes a link/`router.push`
directly to `.../dashboard`. `EventLayout` (`src/app/portal/events/[eventId]/layout.tsx`) renders
whichever section route was requested; it does not itself choose a default.

**Rationale**: This means "default landing" is really "what happens when the hardcoded `/dashboard`
link is opened for an event that can't show `dashboard`" — today, `EventLayout`'s existing
`activeSectionUnavailable` branch renders the blocked "isn't available for this event" state, since
`dashboard` is classified `'bendie'`.

**Alternatives rejected**: Touching all three (and any future) hardcoded entry-point links to compute
product availability themselves and choose the correct href — rejected. It triples the surface area for
this fix, duplicates the availability check `EventLayout` already performs once per event, and risks a
future new entry point being added without the same product-awareness (exactly the class of drift this
codebase's `SECTION_CHECKS`-vs-`EVENT_SECTIONS` incident, documented in `progress-tracker.md`, already
warned about).

## Q2. Deterministic default-landing implementation point (see also Q1, Q20)

**Decision**: Add one redirect effect inside `EventLayout`, at the same point it already computes
`productAvailability`/`productAvailabilityChecked`: once availability is resolved, if
`activeSectionKey === 'dashboard'` and `productAvailability['bendie'] !== true` and
`productAvailability['planner'] === true`, call `router.replace(\`/portal/events/${eventId}/planner-overview\`)`
instead of falling through to the blocked-state render. No other section key ever triggers this
redirect. Bendie-only and Both events never satisfy the condition (`bendie` is available), so they take
no new code path — satisfying FR-024 by construction, not by a separate carve-out.

**Rationale**: `EventLayout` is the one place in the codebase that already knows, per request, both
which section was requested and whether each product is currently available for this event — reusing
that existing computation is the smallest possible change and cannot silently break as more sections
are added later, since it keys off product availability, not tab-array position (FR-023's explicit
concern).

**Alternatives rejected**: (a) "pick `visibleSections[0]`" — rejected; this is exactly the
array-ordering-dependent approach FR-023 forbids, since adding a future shared/Bendie/Planner section
in front of `dashboard` in `EVENT_SECTIONS` would silently change the default with no signal. (b) A
server-side redirect (e.g. a `page.tsx` at the bare event route) — rejected; it would need to duplicate
the same product-availability read `EventLayout` already performs client-side for every section, and
this codebase has no existing server-side redirect pattern for event routes to extend.

## Q3. Exact `EVENT_SECTIONS` structure and product-filtering mechanism

**Decision**: Add one entry to `EVENT_SECTIONS` (`src/lib/eventSectionMeta.ts`): `{ key:
'planner-overview', label: 'Planner Overview', desc: '...', icon: '...', badgeBg/badgeFg: ..., product:
'planner' }`. No change to the `EventSectionMeta` type, `getSectionMeta`, or any existing entry.

**Rationale**: `EVENT_SECTIONS[].product` already supports `'planner'` as a value (Feature 003 added
the field precisely so a future feature could populate it); `EventLayout`'s `isSectionAvailable`,
direct-route blocking, and tab-bar rendering already treat every entry uniformly by this field. No
mechanism change is needed — only data.

**Alternatives rejected**: A separate `PLANNER_SECTIONS` array merged at render time — rejected; it
would duplicate `EventLayout`'s existing single-array filtering/blocking logic for no benefit, since one
array already handles multi-product classification correctly today.

## Q4. Feature 003 workspace-auth helper semantics, and why they can't be imported as-is

**Decision**: `requireEventWorkspaceAccess(eventId, userId, selectedOrganizationId)` in
`src/lib/eventAuth.ts` is the correct, unchanged semantic to reuse (platform-admin bypass; else an
`events.organization_id` match against the caller's selected organization, plus an explicit
`event_members` row). It is currently written against the shared browser Supabase client
(`import { supabase } from '@/lib/supabaseClient'`) with no way to substitute a different client.
Calling it as-is from a server route would run its queries through the anonymous browser client with no
request-scoped session attached — RLS would see an unauthenticated caller and every check would
incorrectly evaluate to denied, not correctly authorize the real caller.

**Rationale**: The function's own logic is exactly what FR-007 requires; only its client binding is
wrong for a server context. See Q6 for the resolution.

**Alternatives rejected**: Treating this as acceptable and calling it anyway — rejected; it would make
every legitimate caller see a false "denied," which is a functional bug, not merely a style concern.

## Q5. Product-availability helper semantics

**Decision**: `isProductActiveForOrg`/`isProductAvailableForEvent` in `eventAuth.ts` already implement
FR-008 exactly: an active `organization_products` row AND a matching `event_products` row, never
`event_planner_links` existence and never organization-level entitlement alone. Reused unchanged in
logic (same client-injection treatment as Q4/Q6).

**Rationale**: This is precisely the "Layer 2" gate `spec.md` requires; no new product-availability
concept is needed.

**Alternatives rejected**: None considered — the existing helper already matches the requirement
exactly.

## Q6. Resolving the client-binding problem (Q4) without forking logic

**Decision**: Add one optional, defaulted parameter to `requireEventWorkspaceAccess` and
`isProductAvailableForEvent` (and, transitively, `isProductActiveForOrg`) —
`client: SupabaseClient = supabase` — so every existing call site (which never passes this argument)
keeps its exact current behavior, while the new server route passes its own cookie-bound
`createServerClient` instance.

**Rationale**: Constitution Principle II requires reusing existing helpers before writing new ones. A
second, route-local reimplementation of "does this event belong to my selected organization, do I hold
an `event_members` row, is the product active" would be a second copy of Feature 003's authorization
logic that could silently drift from the original — exactly the class of risk this repository's own
history (documented `SECTION_CHECKS` drift, the `STAFF_ROLES`-duplicated-across-two-files finding from
Feature 001's review) warns against repeating.

**Alternatives rejected**: (a) Route-local reimplementation, matching how
`retry-planner-provisioning/route.ts` inlines its own admin/org-role check — rejected here specifically
because that route's check (platform-admin or org owner/admin) is *simpler* than, and not the same
logic as, `requireEventWorkspaceAccess`'s event-membership check; duplicating the more complex,
security-sensitive logic is a materially different risk than duplicating the simple one. (b) Moving the
browser client import out of `eventAuth.ts` entirely and requiring every caller to pass a client —
rejected as a larger, riskier diff touching every existing call site for no behavioral gain.

## Q7. `event_planner_links` active-link lookup pattern

**Decision**: `SELECT planner_event_id, is_active FROM event_planner_links WHERE event_id = :portalEventId AND is_active = true`
(single row expected — a partial unique index on `planner_event_id WHERE is_active = true` already
guarantees at most one active link per Planner event, and `event_id` is this table's primary key, so at
most one row can ever match regardless). Matches the exact pattern `plannerStaffSync.ts` already uses.

**Rationale**: Reusing the identical lookup Feature 001/004 already established, rather than inventing
a new query shape for the same table.

**Alternatives rejected**: None — this is a straight reuse of an existing, proven query.

## Q8. Feature 004 provisioning-state semantics

**Decision**: Reuse `events.planner_provisioning_status` (`'not_required' | 'pending' | 'provisioning' |
'succeeded' | 'failed'`) and `planner_provisioning_last_attempted_at`/`created_at` exactly as Feature
004 defined them; no new column, no new enum value.

**Rationale**: FR-018 explicitly forbids a second state machine.

**Alternatives rejected**: None.

## Q9. Staleness-helper reuse

**Decision**: Reuse `isPlannerProvisioningStale()` (`src/lib/plannerProvisioningStaleness.ts`) verbatim
— it already takes exactly the three fields (`planner_provisioning_status`,
`planner_provisioning_last_attempted_at`, `created_at`) the new route already has from its own `events`
read.

**Rationale**: Byte-for-byte reuse, zero duplication.

**Alternatives rejected**: None.

## Q10. `plannerAdmin.ts` client boundary

**Decision**: `getPlannerAdminClient()` is reused unchanged as the sole way `plannerOverview.ts`
constructs a Planner client. No new environment variable, no new client factory.

**Rationale**: This is the established, `server-only`-guarded boundary every Planner-touching module
already uses.

**Alternatives rejected**: A dedicated read-only Planner client/key — rejected; Planner exposes no
separate read-only credential today, and inventing one is out of this feature's scope (it touches
Planner-side credential provisioning, not Portal).

## Q11. Current API response/error conventions

**Decision**: Match `src/app/api/events/create/route.ts` and `.../retry-planner-provisioning/route.ts`
exactly: `NextResponse.json({ error: '<code>', message?: '<safe string>' }, { status })` for requests
that are rejected outright (401/403/404/400), and `NextResponse.json({ ok: true, ... })` (HTTP 200) for
a request that was itself valid and fully processed, even when the *result* it reports is "not ready
yet" (mirroring how a Planner-provisioning failure during creation is still `ok: true` at the HTTP
level). The new GET route follows the same split: authentication/authorization/product-availability
failures are real HTTP errors (401/403); once the caller is authorized to view the Overview, every
subsequent state (ready, pending, stale, failed, unavailable, backend error) is a 200 `{ ok: true,
status: '<state>', ... }` response, since the request itself succeeded — only the underlying Planner
data's readiness varies.

**Rationale**: Consistency with the two existing routes in the same `app/api/events/**` group; the
client only needs one branch (HTTP status) for "was I allowed to ask this," and one further branch
(`status` field) for "what should I show," instead of overloading HTTP status codes for both concerns.

**Alternatives rejected**: Using distinct HTTP status codes for each non-ready state (e.g. 425 for
pending, 502 for backend failure, matching `planner-events/route.ts`'s 502-on-Planner-error pattern) —
rejected for this route specifically, since that route is a platform-admin-only diagnostic surface,
while this one's non-ready states are ordinary, expected, frequently-occurring outcomes for an
authorized ordinary viewer, better modeled as data than as HTTP-level exceptions.

## Q12. Planner `events` columns needed for identity

**Decision**: None read directly from Planner's base `events` table — see Q18. Identity fields are
read from `event_summary_realtime` instead, which already carries `event_title`, `description`,
`location`, `setup_date`, `start_date`, `end_date` verbatim from `events` (confirmed by its `LEFT JOIN`
definition, live-inspected during planning).

**Rationale**: Avoids a second query for fields already present in the one row this feature needs
anyway.

**Alternatives rejected**: See Q18.

## Q13. `event_summary_realtime` columns/types (live-verified during planning)

**Decision**: The columns this feature selects are: `event_title text`, `description text NULL`,
`location text NULL`, `setup_date date NULL`, `start_date date NULL`, `end_date date NULL`,
`number_of_sessions bigint` (from `COALESCE(count(...), 0)`, never null), `status text` (one of
`'Planning' | 'Active' | 'Completed' | 'Unknown'`, derived purely from `CURRENT_DATE` vs.
`start_date`/`end_date` at the last refresh). The view also carries `event_id integer` and `attendees
smallint` — both present in the same row but **must not** be selected or returned, per FR-004's
explicit exclusion of an attendee count and per the "explicit column selection" requirement (FR-015):
the query itself lists only the seven approved columns, it does not `SELECT *` and filter afterward.

**Rationale**: Explicit, named column selection is both a security requirement (FR-015) and a concrete
guard against a future Planner-side column addition silently leaking into the Overview.

**Alternatives rejected**: `SELECT *` with response-shaping filtering the result afterward — rejected;
it satisfies the same instant-behavior but leaves a live foot-gun (a future column addition to the view
would flow through to the query result and could be forgotten in the response-shaping step).

## Q14. Materialized-view refresh cadence and UX implications

**Decision**: `event_summary_realtime` is refreshed by a `pg_cron` job (`refresh_event_summary_realtime`,
`REFRESH MATERIALIZED VIEW CONCURRENTLY`) roughly once per minute. This feature does not attempt to
force a synchronous refresh, does not poll, and does not add a "last updated" timestamp to the
response — the spec's Assumptions section already treats up to ~1 minute of staleness on rarely-changing
identity fields as acceptable, and `status`'s date-only derivation means a same-day refresh lag has no
user-visible effect in practice.

**Rationale**: Forcing a synchronous refresh from a read-only Overview endpoint would turn a cheap read
into a write-adjacent operation against Planner's database on every page view — disproportionate to a
workspace-foundation feature with no stated latency requirement.

**Alternatives rejected**: Calling `REFRESH MATERIALIZED VIEW` synchronously from the new route before
reading — rejected; out of scope (this feature does not modify Planner), adds latency and write-like
load for a benefit (sub-minute freshness) nothing in the spec asks for.

## Q15. Zero-session behavior (live-verified during clarification and re-confirmed during planning)

**Decision**: An event with zero rows in `production_tasks` still receives a real
`event_summary_realtime` row with `number_of_sessions = 0`. The route returns `status: 'ready'` with
`sessionSummary.totalSessions = 0` — never a separate "empty" status, since this is not distinguishable
from, nor treated differently than, any other successful read (FR-005).

**Rationale**: Directly verified against three real zero-task events (`CIPLA CASCADE`,
`Old Mutual Kenya Strategy Day — Event One/Two`) during `/speckit.clarify`; re-confirmed here as the
basis for the API contract.

**Alternatives rejected**: A distinct `zero_sessions` status value — rejected; it would require the
client to treat a legitimate, successful read as a special case, contradicting FR-005's "present this as
a normal, legitimate state" requirement.

## Q16. Missing/dangling counterpart behavior

**Decision**: If no active `event_planner_links` row exists for the Portal event, the route returns
`{ ok: true, status: 'unavailable' }` without attempting any Planner read at all. If an active link
exists but the Planner-side `event_summary_realtime` query returns no row for that `planner_event_id`
(a dangling/externally-deleted Planner event — not expected in practice, since Planner events are never
deleted by any code path this repository controls, but not assumed impossible either), the route
returns the same `status: 'unavailable'` rather than treating a missing row as "zero sessions" (which
requires a *present* row with `number_of_sessions = 0`, not an absent row).

**Rationale**: FR-017's "safe not-yet-set-up state" and the spec's explicit distinction between "zero
sessions" and "data unavailable" both require an absent row to be treated differently from a present
zero-valued one.

**Alternatives rejected**: Treating a dangling link the same as `backend_error` — rejected; a dangling
link is a link-integrity condition (this feature does not diagnose it further), while `backend_error` is
reserved for the read itself throwing/timing out, a materially different condition worth distinguishing
in logs even though both render similarly to the end user (see contracts/get-planner-overview.md).

## Q17. Planner-organization validation for the linked counterpart

**Decision**: This feature does not re-validate that the linked Planner event's `organization_id`
still matches the Portal organization's current `organization_planner_links.planner_organization_id`
mapping on every read. It trusts the existing active link exactly as Feature 001/004 already do.

**Rationale**: Feature 004's `plannerEventProvisioning.ts` already performs this exact check (the
`mapping_drift` code path) at the one moment it actually matters — when a link is being newly
established. Feature 005 is read-only and does not create or modify links; re-deriving the same
integrity check on every ordinary page view would duplicate Feature 004's own responsibility and add an
extra Planner-side round trip for a condition this feature cannot fix or even usefully report beyond
"unavailable" (repair remains Feature 004/an administrator's job, not this feature's, per the
Counterpart Integrity guidance in the source prompt).

**Alternatives rejected**: Re-checking organization consistency on every read and surfacing a distinct
"mapping drift" status — rejected as scope creep into a repair/diagnostic responsibility this
workspace-foundation feature explicitly does not own.

## Q18. One Planner query or two

**Decision**: One query, against `event_summary_realtime` only, returning both the identity fields and
the session summary in a single row.

**Rationale**: `event_summary_realtime` already contains every approved identity field (Q13) alongside
the session summary — a second query against Planner's base `events` table would only buy marginally
fresher identity data (title/location/dates, which change rarely) at the cost of a second round trip and
a second, independent failure mode to handle (what happens if `events` succeeds but
`event_summary_realtime` fails, or vice versa?). One query means one success/failure branch, which
directly simplifies satisfying FR-006's "generic, safe couldn't-load-right-now state" requirement.

**Alternatives rejected**: `events` for identity + `event_summary_realtime` for the summary (two
queries) — rejected; doubles partial-failure handling for a freshness benefit (well under a minute, on
fields that rarely change) the spec does not ask for.

## Q19. Current UI card/loading/error/empty-state patterns

**Decision**: The Planner Overview page reuses `SectionHeader` (page title/description header, used by
every existing content-section page) and the tab-level skeleton/blocked-state visual language
`EventLayout` already uses (`animate-pulse` placeholder blocks for loading; a centered icon + heading +
short copy for a non-ready state) — not a new visual pattern. Provisioning-related messaging
(pending/stale/failed) reuses `PlannerProvisioningBanner`'s existing copy and severity styling.

**Rationale**: Constitution Principle V (UI Consistency) requires reusing established patterns before
introducing a new one; this feature introduces no new visual pattern.

**Alternatives rejected**: A bespoke Overview-specific loading/error component — rejected; nothing
about this page's states differs from patterns already established.

## Q20. Summary: why the redirect belongs in `EventLayout`, not in each entry-point component

**Decision**: Confirmed (see Q1/Q2) — `EventLayout` is the single choke point every event-workspace
navigation passes through regardless of entry point (list card, header switcher, dashboard widget, a
bookmarked/direct URL, or a browser refresh), so it is the only place a fix can be applied once and
cover every case in `spec.md`'s Edge Cases list (direct URL, refresh, entitlement changing mid-session)
without auditing every current and future "open this event" call site individually.

**Rationale**: Directly satisfies FR-023's "MUST be capable of producing a section other than the Bendie
dashboard... rather than an incidental consequence of tab ordering" by tying the decision to the same
authoritative product-availability computation already gating every other section, not to where the
user clicked from.

**Alternatives rejected**: See Q1.
