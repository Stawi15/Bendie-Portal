# AGENTS.md

## Purpose

This repository uses both:

1. GitHub Spec Kit
2. JSM Agent Skills

Claude Code must use both systems together without creating duplicate or competing sources of truth.

This is an existing brownfield application. Preserve existing architecture, patterns, behavior, and conventions unless an approved feature explicitly requires a change.

---

## Read Before Working

Before planning or implementing a substantial feature, read:

1. `AGENTS.md`
2. relevant project context files
3. relevant existing feature documentation
4. relevant source code
5. relevant installed JSM skill instructions
6. relevant Spec Kit instructions/templates

If a feature already has an implementation plan, read it before using `/architect`.

Do not ask the user to repeat information already available in:

- the current session
- existing feature documents
- repository context
- code
- Spec Kit artifacts

---

# Responsibility Boundaries

## Spec Kit owns the formal development workflow

Spec Kit is the authoritative system for:

- project constitution
- feature requirements
- clarification
- technical planning
- implementation task generation
- pre-implementation consistency analysis
- implementation workflow
- post-implementation convergence

### Authoritative artifacts

- `spec.md` = WHAT the feature must do
- `plan.md` = HOW the feature will be implemented
- `tasks.md` = implementation work to execute
- Constitution = project-wide non-negotiable rules

Do not create separate competing specification, planning, or task documents once Spec Kit artifacts exist.

---

# JSM Agent Skills

JSM skills support the Spec Kit workflow.

They do not replace Spec Kit artifacts.

## `/architect`

Use `/architect` for architecture discovery or architecture validation.

### If no implementation plan exists

Use it to:

- inspect the current repository
- understand the existing architecture
- identify affected domains/modules
- identify reusable services, repositories, hooks, components, and patterns
- identify dependencies
- identify architecture boundaries
- identify implementation-changing decisions

Do not implement code.

### If an implementation plan already exists

Do NOT generate another competing implementation plan.

Instead:

- validate the existing plan against the actual codebase
- verify proposed integration points
- identify stale assumptions
- identify missing files or modules
- identify duplicated abstractions
- identify architecture conflicts
- identify unresolved implementation-critical decisions
- recommend corrections to the existing plan

Spec Kit `plan.md` remains the authoritative formal technical plan.

---

## `/remember`

Use `/remember` only for session continuity.

It may store:

- current state
- important decisions
- unresolved questions
- problems already solved
- next steps
- useful debugging learnings

Do NOT duplicate:

- full specifications
- full technical plans
- complete task lists
- information already obvious from the codebase

Never persist secrets, credentials, tokens, service-role keys, or private configuration values.

---

## `/imprint`

Use `/imprint` for UI consistency.

Use it when:

- significant UI is introduced
- an existing visual pattern is materially changed
- a reusable component pattern is established
- the UI registry needs auditing

The UI registry documents actual UI conventions.

It does not replace:

- project UI rules
- design tokens
- Spec Kit requirements

---

## `/review`

Run `/review` after implementation and before declaring a feature complete.

Review:

1. Plan alignment
2. System integrity
3. Production readiness

Check especially:

- scope drift
- architecture boundary violations
- duplicated patterns
- missing error states
- missing loading states
- missing empty states
- obvious runtime issues
- hardcoded values where project tokens/patterns exist
- unintended behavior changes

`/review` should report findings first.

Do not automatically fix everything before the developer has reviewed the report.

---

## `/recover`

Use `/recover` when implementation or debugging begins failing repeatedly.

Determine whether the failure is:

1. an isolated bug
2. a polluted/tangled session
3. a wrong architectural or requirement assumption

Do not keep stacking patches without identifying root cause.

---

# Feature Workflow

For a substantial feature, follow this sequence:

1. `/architect`
2. `/speckit.specify`
3. `/speckit.clarify` if genuine ambiguity remains
4. `/speckit.plan`
5. `/speckit.tasks`
6. `/speckit.analyze`
7. `/speckit.implement`
8. `/imprint` if significant UI changed
9. `/review`
10. `/speckit.converge`
11. `/remember save`

Do not skip directly from feature description to implementation unless explicitly instructed.

---

# Existing Implementation Plans

Some features may already have detailed implementation plans created before Spec Kit was introduced.

When such a plan exists:

1. Treat it as important input.
2. Do not discard or rewrite it unnecessarily.
3. Use `/architect` to validate it against the current repository.
4. Use `/speckit.specify` to extract the formal WHAT and WHY.
5. Use `/speckit.clarify` to resolve remaining real ambiguities.
6. Use `/speckit.plan` to reconcile and formalize the existing technical plan.
7. Preserve correct decisions from the existing plan.
8. Explicitly identify any changed, stale, or conflicting assumptions.

Do not create multiple competing plans for the same feature.

---

# Brownfield Rules

This is an existing application.

Before introducing new abstractions:

- inspect the current implementation
- reuse existing patterns where appropriate
- reuse existing domain boundaries
- reuse existing services/repositories/hooks
- reuse existing UI components and tokens
- reuse existing API route conventions
- reuse existing database-access patterns
- reuse existing validation/error-handling patterns

Do not create a parallel architecture simply because a template suggests one.

Preserve existing application behavior unless the approved specification explicitly changes it.

---

# Scope Discipline

Do not:

- invent functionality
- expand scope without approval
- perform unrelated refactors
- rename unrelated files
- redesign working architecture without justification
- create speculative abstractions
- modify unrelated features while implementing the current feature

If an unrelated issue is discovered:

- document it
- flag it
- do not fix it unless it blocks the current feature or the developer explicitly approves it

---

# Clarification Rules

Before asking the user a question:

1. search the current context
2. inspect relevant docs
3. inspect relevant code
4. inspect existing Spec Kit artifacts

Ask only when the answer materially changes implementation or product behavior.

Do not ask technical questions that can be verified from the repository or connected systems.

---

# Implementation Discipline

Before coding:

- confirm `spec.md` is sufficiently clear
- confirm the plan fits existing architecture
- confirm tasks map to requirements
- run `/speckit.analyze`

During coding:

- implement from `tasks.md`
- keep changes focused
- preserve traceability from requirement → task → code
- verify each task before moving on
- avoid unrelated cleanup

After coding:

- run tests/checks required by the repo
- use `/imprint` if UI changed
- run `/review`
- run `/speckit.converge`
- resolve important gaps
- save session state with `/remember save`

---

# Source of Truth Order

When instructions conflict, use this priority:

1. explicit current user instruction
2. approved Spec Kit constitution
3. approved `spec.md`
4. approved `plan.md`
5. approved `tasks.md`
6. project architecture/context documentation
7. existing codebase patterns
8. JSM skill guidance
9. assumptions

If a lower-priority source conflicts with a higher-priority one, flag the conflict before proceeding.

---

# Security

Never expose or commit:

- API keys
- service-role keys
- passwords
- access tokens
- private credentials
- secrets from environment files

Use environment variables and existing secret-management conventions.

Never copy secrets into:

- `memory.md`
- Spec Kit artifacts
- logs
- documentation
- commits
