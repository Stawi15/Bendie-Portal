# Implementation Plan: Bendie Planner Integration

**Branch**: `001-bendie-planner-integration` | **Date**: 2026-09-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-bendie-planner-integration/spec.md`

**Historical input**: [docs/implementation-plans/bendie-planner-integration-baseline.md](../../docs/implementation-plans/bendie-planner-integration-baseline.md) (pre-Spec-Kit baseline) and the in-conversation architecture validation of that baseline (concluded **VALID WITH CORRECTIONS**). This plan supersedes the baseline as the authoritative technical plan; the baseline file itself is left in place, unmodified, as historical record.

## Summary

Bendie Portal (authoritative for event members and agenda) and Bendie Planner (a separate Supabase
project, authoritative for travel logistics) need a per-event, opt-in integration with three
one-directional data flows: staff-tier members push from Portal to Planner automatically at
provisioning time; agenda pushes from Portal to Planner on manual admin trigger; flight/hotel
travel data pulls from Planner to Portal on manual admin trigger and is read-only once in Portal.
Technical approach: a new admin-only "Bendie Planner" tab per event (following the existing
tab-section pattern), a small set of new `app/api/admin/*` route handlers following the existing
service-role-after-auth-check pattern (now duplicated across two Supabase projects instead of one),
one new Portal-side migration adding a link table and tracking columns, and hooks added to the four
existing member-provisioning code paths in `members/page.tsx`.

## Technical Context

**Language/Version**: TypeScript, Next.js 14.2.x (App Router) — existing, unchanged.

**Primary Dependencies**: `@supabase/supabase-js`, `@supabase/ssr` (existing, reused for the second
project's service-role client) + **`server-only`** (new — confirmed absent from `package.json`
this session; required per architecture-validation correction #2, see Security Design below).

**Storage**: Supabase Postgres — two separate projects. Portal's own project (existing) gains one
new table and a handful of new nullable tracking columns on existing tables. Bendie Planner's
project (external, not owned by this repository) is read/written via its service-role key but its
own schema is not modified by this feature.

**Testing**: No automated test framework exists in this repository today (confirmed: no test
script in `package.json`). This feature does not introduce one — verification is manual, per the
Quickstart guide and the repository's existing lint/type-check/build gate (Constitution Principle
VIII).

**Target Platform**: Web, admin browser — existing Next.js host (Vercel or equivalent Node host).

**Project Type**: Web application (single Next.js app serving both UI and its own API routes) —
not a frontend/backend split; the existing single-project structure applies unchanged.

**Performance Goals**: None newly introduced. Member sync is fire-and-forget/best-effort
(spec FR-012) and must not add perceptible latency to the existing provisioning action it piggybacks
on. Agenda push and travel pull are manually triggered, synchronous-to-the-triggering-click
operations with no formal latency target, consistent with every other admin action in this app.

**Constraints**: A Planner-side failure must never cause an otherwise-successful Portal operation to
be reported as failed (spec FR-012) — this is a hard behavioral constraint on the member-sync
design, not a performance constraint.

**Scale/Scope**: Single-event, admin-triggered operations (one link, one push, one pull at a time)
— not a bulk/mass cross-project sync system. Matches the existing admin tool's scale (an internal
tool operated by Bendie staff, per `project-overview.md`).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design — see bottom of this section.*

| Principle | Check | Result |
|---|---|---|
| I. Brownfield Preservation | Reuses the existing tab-section model, existing admin-route pattern, existing member-provisioning hook points; no unrelated refactor bundled in. | PASS |
| II. Architecture Boundaries | No Server Actions or service layer introduced. All privileged operations confined to `app/api/admin/**`, each independently re-verifying `global_role = 'admin'`. **One narrow exception**: a shared `getPlannerAdminClient()` helper (see Complexity Tracking) — justified below, not a service layer. | PASS (with one justified, documented exception) |
| III. Supabase and Database Safety | Schema change goes through one new numbered migration; RLS explicitly designed per new/changed table; `database.ts` updated by hand alongside it; live-schema assumptions flagged for pre-implementation verification (see Research). | PASS |
| IV. Security | Planner service-role key stays server-only, never `NEXT_PUBLIC_`; every privileged route re-checks Portal admin auth before touching Planner; `server-only` package added to make the shared cross-project client hard-fail on any accidental client import. | PASS |
| V. UI Consistency | New tab reuses `SectionHeader`, existing card/skeleton/badge/button classes, no new design system. | PASS |
| VI. Scope Discipline | Out-of-scope list from spec.md carried forward verbatim into this plan's non-goals; no speculative abstraction beyond the one justified helper. | PASS |
| VII. Documentation Discipline | Only the docs genuinely touched by this feature are updated (see Documentation Plan); the `schema-reference.md`/`updatedmobilefeatures.md` duplication is flagged, not resolved here. | PASS |

**Post-Phase-1 re-check**: No new violations introduced by the data model or contracts design below — see the end of this document.

## Project Structure

### Documentation (this feature)

```text
specs/001-bendie-planner-integration/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/            # Phase 1 output
│   └── planner-integration.md
└── tasks.md              # Phase 2 output (/speckit-tasks — not created by this command)
```

### Source Code (repository root)

Single Next.js App Router project — no frontend/backend split, matching the existing repository
structure exactly:

```text
src/
├── app/
│   ├── api/admin/
│   │   ├── create-user/route.ts            # existing — pattern reference only
│   │   ├── bulk-create-users/route.ts       # existing — pattern reference only
│   │   ├── planner-events/route.ts          # NEW — list/search available Planner events
│   │   ├── planner-link/route.ts            # NEW — link/unlink a Portal event ↔ Planner event
│   │   ├── planner-sync-member/route.ts     # NEW — sync one staff-tier member to Planner
│   │   ├── planner-push-agenda/route.ts     # NEW — push Portal agenda to Planner
│   │   └── planner-pull-travel/route.ts     # NEW — pull flight/hotel data from Planner
│   └── portal/events/[eventId]/
│       ├── members/page.tsx                 # MODIFIED — bug fix + 4 sync-trigger hooks
│       └── bendie-planner/page.tsx           # NEW — the integration control tab
├── lib/
│   ├── eventSectionMeta.ts                   # MODIFIED — one new EVENT_SECTIONS entry
│   └── plannerAdmin.ts                       # NEW — server-only shared Planner service-role client
├── types/
│   ├── database.ts                           # MODIFIED — new table + new columns on 4 existing tables
│   └── plannerDatabase.ts                    # NEW — hand-maintained types for Planner's schema
supabase/migrations/
└── bendie_planner_integration.sql   # NEW — no numeric prefix; live-verified (research.md
    item 4) that this repo's actual migration-naming convention dropped the old `NNN_` scheme
    after `018`, applied via apply_migration (auto-assigns a timestamp version)
```

**Structure Decision**: Extends the existing single-project structure with no new top-level
directories — every new file lands inside an existing folder (`app/api/admin/`,
`app/portal/events/[eventId]/`, `lib/`, `types/`), matching Constitution Principle I.

## Security Design

- Every new route independently re-verifies `profiles.global_role = 'admin'` via the existing
  cookie-based server client, before constructing any privileged client — matching
  `create-user`/`bulk-create-users` exactly (spec FR-029, Constitution Principle IV).
- The Planner project's service-role key is read only from a server-only environment variable,
  never `NEXT_PUBLIC_`-prefixed, and never returned in any route's response body (spec FR-030).
- `src/lib/plannerAdmin.ts` imports the `server-only` package (new dependency — see Technical
  Context) so any accidental import from a client component fails the build, rather than relying
  on convention alone. This directly resolves architecture-validation correction #2, which flagged
  that a shared `src/lib/` helper — unlike the existing per-route-inlined service-role clients — has
  no structural guarantee against client-side import without this.
- Planner-sourced travel rows are protected against direct client edits at the database layer
  (RLS), not only in the route/UI layer — see `data-model.md`. This directly resolves
  architecture-validation correction #3.
- No new authorization tier is introduced — this feature reuses the existing single Portal
  admin gate exactly, per the assumption already recorded in `spec.md`.

## Documentation Plan

Per Constitution Principle VII and matching the baseline's own documentation list:

- **Always**: `context/progress-tracker.md` — new dated entry describing this feature once
  implemented.
- **Because schema usage changes**: `context/schema-reference.md` — document the new
  `event_planner_links` table and the new tracking columns, and why they carry no foreign key into
  Planner's database (cross-project).
- **Because architecture scope changes**: `context/architecture.md` — a new section on the
  cross-project integration pattern (two Supabase projects, service-role-to-service-role,
  email-based identity bridging, which of the three flows are automatic vs. manual).
- **If it enumerates features at that level**: `context/project-overview.md`.

**Explicit non-goal (architecture-validation correction #4)**: this feature does **not** resolve
the `context/schema-reference.md` / `context/updatedmobilefeatures.md` duplication discovered
during architecture validation. That duplication is flagged again here for visibility, and is left
untouched — resolving it is a separate, explicitly-scoped documentation task, not an incidental
part of implementing this feature (Constitution Principle VII).

## Verification Plan

Full runnable detail lives in `quickstart.md` (Phase 1 output); summarized here for traceability:

1. Re-verify all five live-schema facts listed in `research.md` before writing any code.
2. Migration applies cleanly; RLS enabled and correctly scoped (admin-only on the new table, the
   new restrictive policy on `attendee_travel_details`) — checked via the `supabase` MCP's
   advisors/policy inspection, not assumed.
3. All four existing member-provisioning paths (`handleAddMember`, `importMemberRow`,
   `handleAddAllOrgMembers`, `handleAssignTeam`) correctly stamp `pointCurrentEventAt` (the bundled
   bug fix) and correctly trigger — or correctly skip — the Planner sync call, per role and per
   link state.
4. Attendee-role provisioning never produces a Planner-sync status, on a linked or unlinked event.
5. A simulated Planner-sync failure does not cause the Portal provisioning action to report
   failure.
6. Repeated agenda pushes and repeated travel pulls are both idempotent (no duplicate rows/items
   on the Planner or Portal side respectively).
7. A direct attempt to edit a Planner-sourced travel row is rejected; a manually created row is
   unaffected by a pull.
8. An unmatched Planner traveler is skipped and reported, never attached to the wrong Portal member.
9. Unlink followed by re-link (same or different Planner event) behaves per `data-model.md`'s
   state-transition definition.
10. The repository's existing `lint`, `type-check`, and `build` scripts all pass — no test suite
    exists in this repository to run (Constitution Principle VIII; `research.md`'s Testing note).

## Remaining Technical Risks

- **Travel-pull write path must use the service-role client, not the authenticated client
  (implementation-critical, not optional)**: the read-only RLS enforcement on
  `attendee_travel_details` (see `data-model.md`) is restrictive by design — it blocks any
  RLS-bound `INSERT`/`UPDATE` of a Planner-sourced row (`source_planner_key IS NOT NULL`) from any
  caller, including the pull route itself if it were implemented using the authenticated
  cookie-based client instead of the Portal's own service-role client. Using the wrong client for
  this one write step would make the entire travel-pull feature fail silently on every attempt,
  first pull included. This must be treated as a hard constraint during implementation, not a
  stylistic preference.
- **Planner `item_type` constraint (unverified)**: if Planner enforces a stricter enum than
  Portal's `block_type` values, the passthrough mapping in the agenda-push design will need a
  small translation table discovered only once live-verified — flagged in `research.md`, not
  blocking this plan but must be resolved before that specific code path ships.
- **Planner `profiles` auto-seed-on-signup behavior (unverified)**: if Planner has no such trigger,
  the member-sync identity-creation step needs an explicit profile insert in addition to the
  `auth.admin.createUser()` call — a small, contained addition, not a design change, once confirmed.
- **Cross-project reliability**: member sync depends on a second Supabase project being reachable
  at the moment of provisioning; the fire-and-forget design (spec FR-012) already absorbs this, but
  a prolonged Planner-side outage would silently accumulate `failed`/unattempted sync rows with no
  automatic retry in this MVP — acceptable per spec (status/feedback is the requirement, not
  guaranteed eventual consistency), but worth surfacing to the team as a known limitation rather
  than a silent gap.
- **RESOLVED (2026-09-14) — duplicate Planner assignment under concurrent member sync**: previously
  an accepted residual risk (see prior revision of this section, preserved in git history). The
  user explicitly approved a targeted Planner-side schema investigation and fix. Live introspection
  at implementation time found Planner's `event_user_assignments` **already carries** a
  `UNIQUE (event_id, profile_id)` constraint (`event_user_assignments_event_profile_unique`) —
  the earlier "no unique constraint (live-verified)" finding from the original T033 pass is now
  known to be stale; live state is authoritative. Zero existing duplicate rows were confirmed before
  proceeding. `planner-sync-member/route.ts` was changed from a manual check-then-insert-or-update
  to a single `.upsert(row, { onConflict: 'event_id,profile_id' })` against that constraint, making
  the write atomic: two concurrent sync requests for the same person+event now serialize through
  Postgres's own conflict resolution instead of racing. No Planner-side DDL was required for this
  one — see `data-model.md` for the full write-up. Live-verified via a genuine concurrency test.
- **RESOLVED (2026-09-14) — a lost agenda-push response could create a duplicate Planner agenda
  item**: previously an accepted residual risk. The user explicitly approved adding a small,
  dedicated Planner-side column for this — applied via `apply_migration` on the `supabase-planner`
  MCP (Planner's own tracked migration history): `event_agenda_items.source_portal_session_id uuid
  NULL`, guarded by a plain `UNIQUE (event_id, source_portal_session_id)` constraint (deliberately
  not partial, learning directly from the `attendee_travel_details` upsert lesson recorded above).
  Zero existing rows needed backfilling (all prior `source_document = 'bendie-portal'` test rows had
  already been cleaned up from the database). `planner-push-agenda/route.ts` now always upserts on
  `(event_id, source_portal_session_id)` rather than branching on whether Portal's own
  `planner_agenda_item_id` happens to be populated — the durable identity now lives on the Planner
  side, where a lost response can't erase it. See `data-model.md` for the full write-up and the
  live-simulated lost-response recovery test.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| Shared `src/lib/plannerAdmin.ts` helper, where every existing privileged client is instead constructed inline per-route | 5 new routes (`planner-events`, `planner-link`, `planner-sync-member`, `planner-push-agenda`, `planner-pull-travel`) all need an identically-configured second-project service-role client; duplicating the 3-line construction five times is pure repetition with no behavioral difference between copies, and a typo in one copy (wrong env var, missing `persistSession: false`) is a real security-relevant risk this helper eliminates | Inlining it five times was considered (to match `create-user`/`bulk-create-users`'s existing per-route duplication exactly) and rejected: those two existing routes duplicate the *portal's own* client because each route's auth-check block is otherwise-unique; here the *entire* client-construction snippet would be byte-identical five times, which is exactly the "3rd consumer → extract" convention already established elsewhere in this codebase (`ui-registry.md`'s `TagInput`/`ImageField`/`moveItem` precedents) — not a new pattern, an application of an existing one. The portal-side auth-check block itself remains duplicated per route, unextracted, to stay consistent with `create-user`/`bulk-create-users`. |
