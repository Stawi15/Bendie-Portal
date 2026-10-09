<!--
Sync Impact Report
Version change: 1.1.0 → 1.1.1 (PATCH — wording/clarification only; no new obligation)
Modified principles:
  - III. Supabase and Database Safety — migration naming now describes the real repository
    convention (descriptive snake_case names; later-sorting name, e.g. `zz_`, when a file
    supersedes earlier ones) instead of "sequential numeric prefix", which only the earliest files
    follow. Renaming/reordering applied files stays forbidden (made explicit).
Added sections: none
Removed sections: none
Approved by: the developer, 2026-10-09 (resolves /speckit-analyze finding C1, Feature 017).
Follow-up TODOs: none.

Previous amendment —
Version change: 1.0.0 → 1.1.0 (MINOR — materially expanded guidance; no principle removed)
Modified principles:
  - II. Architecture Boundaries — privileged operations may now be authorized by either platform
    admin or, for single-organization operations, an owner/admin of that organization (resolved
    server-side); app/api/admin/** stays platform-admin-only; explicit no-escalation rule added.
    Codifies the precedent already shipped in Feature 008 (planner-permissions routes).
  - IV. Security — gating reference updated from "same as app/api/admin/**" to the two
    authorization tiers defined in Principle II.
Added sections: none
Removed sections: none
Approved by: the developer, 2026-10-09. First consumer: Feature 017 (client organization admins
  create member accounts for their own organization).
Follow-up TODOs: none. Note for /architect and /review: context/architecture.md and
  context/code-standards.md may still describe privileged routes as admin-only — flag and
  reconcile if found (Governance rule), not done by this amendment.
-->

# Bendie Portal Constitution

## Core Principles

### I. Brownfield Preservation
This is an existing, production-oriented application. Existing behavior MUST be preserved unless
an approved specification explicitly changes it. Existing architecture, domain boundaries, and
conventions MUST be reused before a new abstraction is introduced. New work MUST NOT create a
parallel architecture merely because a template, framework default, or planning document suggests
one — the actual shipped codebase is the reference, not any prior planning document. Unrelated
refactors MUST NOT be bundled into feature work; an unrelated issue discovered along the way MUST
be documented and flagged, not silently fixed, unless it blocks the current feature or is
explicitly approved.

### II. Architecture Boundaries
The application is a standard Next.js 14 App Router project (TypeScript) with no Server Actions
layer and no service/repository layer — pages under `app/portal/**` own their own data fetching
and mutation directly via the shared browser Supabase client. This MUST NOT change without an
approved specification; do not introduce Server Actions or a service layer for a single new
feature. Privileged operations (anything requiring the Supabase service-role key) MUST live only in
server-side route handlers, each independently re-verifying the caller's authorization server-side
immediately before performing the privileged action — never trust a client-supplied authorization
flag, and never assume a UI-level check is sufficient. Exactly two authorization tiers are allowed:
- **Platform admin** (`profiles.global_role = 'admin'`): the only tier for `app/api/admin/**`,
  which MUST remain platform-admin-only.
- **Organization owner/admin**, only for operations scoped to a single organization: the caller
  MUST be an owner/admin of the organization that owns the target record, resolved server-side from
  that record (e.g. `events.organization_id`) or from a route-addressed organization verified
  against `organization_members` — never from a client-supplied or "currently selected"
  organization id taken on trust. Such routes live outside `app/api/admin/**` (e.g.
  `app/api/events/**`, `app/api/organizations/**`), following the precedent of Feature 008's
  `planner-permissions` routes and `canAdministerPlannerPermissions`.
Organization-scoped privilege MUST NOT allow escalation: it can never grant platform admin, never
grant organization owner/admin roles unless an approved spec explicitly allows it, and never read or
act on another organization's people or records. New features
MUST reuse existing helpers, hooks, and shared components (`src/lib/**`, `src/components/portal/**`,
`src/contexts/**`) before writing new ones, and event-scoped work MUST fit within the existing
`app/portal/events/[eventId]/<section>` tab-section model rather than inventing a new navigational
structure.

### III. Supabase and Database Safety
Every schema change MUST go through a migration file in `supabase/migrations/`, following the
existing convention: a descriptive snake_case file name and a header comment explaining *why* the
migration exists (only the earliest files carry numeric prefixes). When a migration replaces
objects created by earlier files, its name MUST sort after theirs in filename order so a fresh
replay applies it last — a `zz_` prefix is the established way (precedent:
`zz_event_members_role_guard_final_authoritative.sql`). Migrations MUST NOT be created for
logic-only or documentation-only changes, and a migration already applied to production MUST NOT be
deleted, renamed, or reordered even if later superseded.
Row Level Security MUST be explicitly considered for every new table and column — reuse the
existing `portal_is_global_admin()` bypass pattern for admin-only data, or the dual
restrictive-policy pattern for data attendees also read, matching whichever precedent the new
table's access shape actually resembles; RLS MUST NOT be assumed adequate without checking the live
policy set. `src/types/database.ts` is hand-maintained, not generated, and MUST be updated by hand
whenever the schema changes. Assumptions about live schema state (current columns, constraints,
trigger behavior, current RLS policy text) MUST be verified against the live database before
implementation when the outcome depends on them — a static doc snapshot is not sufficient on its
own.

### IV. Security
No secret, API key, service-role key, password, or access token MUST ever be committed to source
control, or written into `context/`, `memory.md`, Spec Kit artifacts, logs, or documentation.
Environment variables MUST follow the existing convention: public/browser-safe values prefixed
`NEXT_PUBLIC_`, server-only values (service-role keys, etc.) never prefixed that way and never
referenced outside server-only code paths. Service-role credentials MUST NEVER be exposed to or
usable from the browser. Every privileged action MUST perform its own authentication and
authorization check immediately before acting, independent of any check already done in a calling
layer, and any cross-project or admin-only operation MUST remain server-only, gated by one of the
two authorization tiers defined in Principle II (platform-wide operations by platform admin only;
organization-scoped operations by platform admin or an owner/admin of that same organization). No
API response MUST ever echo back a secret, key, or raw
credential. New code SHOULD default to the least privilege that accomplishes the task — reach for
the service-role client only when the operation genuinely requires bypassing RLS, not as a default
convenience.

### V. UI Consistency
New UI MUST be visually and structurally indistinguishable from the existing portal: reuse
`SectionHeader`, `FormModal`, `.btn-primary`/`.btn-secondary`/`.btn-danger`, `.input`/`.label`/
`.hint`, and the established card/grid/loading-skeleton shapes documented in
`context/ui-registry.md` before building a new equivalent. Colors and surfaces MUST use the tokens
defined in `tailwind.config.js` (per `context/ui-tokens.md`) — hardcoded hex values or raw Tailwind
color utility classes MUST NOT be used for portal chrome (the one documented legacy exception,
`border-[#E4EAF0]`/`rounded-[20px]`, is normalized opportunistically, not treated as a new
precedent). Established loading, error, and empty-state patterns MUST be reused, not reinvented per
page. Material Symbols Outlined MUST remain the only icon set, and this project MUST NOT adopt a
second design system or component library. When a feature introduces a materially new, reusable UI
pattern, the `/imprint` skill SHOULD be run to record it in the UI registry before the pattern is
treated as established.

### VI. Scope Discipline
A specification defines the intended behavior for a feature; implementation MUST stay within that
approved scope. Speculative features and speculative abstractions (building for a hypothetical
future need not in the current spec) MUST NOT be introduced. An unrelated bug or gap discovered
during implementation MUST be documented and flagged rather than silently fixed, unless it blocks
the current feature or a human explicitly approves fixing it in the same pass.

### VII. Documentation Discipline
After a completed feature, `context/progress-tracker.md` MUST be updated at minimum; `context/
architecture.md` and `context/project-overview.md` MUST also be updated when the feature changes
structure, scope, or schema usage, and the relevant schema documentation MUST be updated when the
database structure changes. Each category of durable project knowledge SHOULD have one clear
canonical source — new documentation MUST NOT be created where an existing file already owns that
information, and a near-duplicate document covering ground an existing file already owns MUST NOT
be allowed to silently drift apart from it once noticed (resolving an existing duplication is a
separate, explicit task, not something a feature's routine doc-update step does incidentally).

### VIII. Verification and Quality
Implementation MUST be checked against its approved spec/plan/tasks before being considered
complete, not just against recollection of intent. Whatever lint, type-check, and build commands
already exist in this repository MUST pass before a feature is considered done. Every new or
touched list/form page MUST have an explicit loading, error, and empty state, matching the
established patterns — no bare blank screens. A feature MUST NOT be declared complete before
`/review` has reported on it, and `/speckit.converge` SHOULD run for substantial work.

### IX. Spec Kit + JSM Responsibilities
Spec Kit is the authoritative system for the project constitution, `spec.md` (WHAT), `plan.md`
(HOW), `tasks.md` (implementation work), pre-implementation consistency analysis, the
implementation workflow, and post-implementation convergence. JSM skills support that workflow and
MUST NOT create a competing authoritative spec, plan, or task list once Spec Kit artifacts exist for
a feature: `/architect` performs architecture discovery when no plan exists yet, or validates an
existing plan/spec against the real codebase when one does — it does not replace `plan.md`.
`/remember` is for session continuity only (state, decisions, open questions, lessons) and MUST NOT
duplicate full specs, plans, task lists, or anything already obvious from the codebase, and MUST
NEVER persist secrets. `/imprint` maintains UI consistency records and does not replace design
tokens or UI rules. `/review` runs after implementation, before a feature is declared complete, and
reports findings first rather than auto-fixing everything. `/recover` is used when implementation or
debugging is failing repeatedly, to distinguish an isolated bug from a polluted session or a wrong
architectural assumption, rather than continuing to stack patches.

## Source-of-Truth Priority

When guidance conflicts, priority is: (1) explicit current user instruction, (2) this ratified
constitution, (3) an approved `spec.md`, (4) an approved `plan.md`, (5) an approved `tasks.md`,
(6) project architecture/context documentation, (7) existing codebase patterns, (8) JSM skill
guidance, (9) assumptions. A lower-priority source that conflicts with a higher-priority one MUST
be flagged explicitly, not silently resolved in either direction.

## Governance

This constitution supersedes ad hoc practice for any rule it states. Amendments are made only by
re-running `/speckit.constitution` with the proposed change, which MUST produce an updated Sync
Impact Report and a version bump: MAJOR for a backward-incompatible removal or redefinition of a
principle, MINOR for a new principle or materially expanded guidance, PATCH for wording or
clarification only. `context/code-standards.md`, `context/architecture.md`, and the
`context/ui-*.md` files remain the detailed, day-to-day implementation references this constitution
summarizes and governs — when one of them is found to conflict with this document, the conflict
MUST be flagged and reconciled explicitly, not silently overridden in either direction. `/architect`
and `/review` MUST check proposed and completed work against these principles as part of their
existing validation/review responsibilities.

**Version**: 1.1.1 | **Ratified**: 2026-09-10 | **Last Amended**: 2026-10-09
