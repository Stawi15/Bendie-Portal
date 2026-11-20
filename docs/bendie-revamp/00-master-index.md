# Bendie Studio 2.0: Discovery and Planning, Master Index

The brief is [../Portal_2.0.md](../Portal_2.0.md). Branch: `redesign`.

**How this relates to Spec Kit:** these docs are discovery and research input, playing the role of `/architect` output. They are **not** specs or plans. Each roadmap phase becomes its own Spec Kit feature (`specs/030-…`) with its own `spec.md` / `plan.md` / `tasks.md`, which stay authoritative per AGENTS.md.

**Evidence labels used throughout:**
- **[V]** or SC: verified in source or the live schema.
- **BV:** browser-verified. Nothing is yet.
- **[D]:** documented, not re-verified.
- **INF:** inferred.
- **[U]:** unknown.

## Discovery (pass 1, done 2026-11-19)

| # | Doc | Status |
|---|---|---|
| 01 | [Executive summary](01-executive-summary.md) | done |
| 02 | [Skill registry](02-skill-registry.md) | done |
| 03 | [Product overview](03-product-overview.md) | done |
| 04 | [Technical architecture](04-technical-architecture.md) | done |
| 05 | [Complete route inventory](05-complete-route-inventory.md) | done (generated) |
| 06 | [Feature inventory](06-feature-inventory.md) | done (generated) |
| 07 | [Database schema](07-database-schema.md) | done |
| 08 | [Data dictionary](08-data-dictionary.md) | done |
| 09 | [Product relationships](09-product-relationships.md) | done (mobile side unknown) |
| 10 | [User roles and permissions](10-user-roles-and-permissions.md) | done |
| 11 | [Feature dependencies](11-feature-dependencies.md) | done |
| 12 | [Existing user journeys](12-existing-user-journeys.md) | done (no timings) |
| 13 | [UX friction audit](13-ux-friction-audit.md) | done |
| 14 | [Existing design system](14-existing-design-system.md) | done |
| 15 | [Browser exploration report](15-browser-exploration-report.md) | done (pass 1, test env; 252 visits, 5 bugs) |
| 16 | [Feature parity matrix](16-feature-parity-matrix.md) | done (generated; fill in per phase) |
| 40 | [Unknowns and open questions](40-unknowns-and-open-questions.md) | live |

## Product and design proposals (pass 2, 2026-11-20, PROPOSALS awaiting review)

| # | Doc | Key proposal |
|---|---|---|
| 17 | [Proposed information architecture](17-proposed-information-architecture.md) | 3 workspaces; event: 6 areas / 31 pages (all 32 sections mapped); products as tags, not a mode |
| 18 | [Proposed navigation](18-proposed-navigation.md) | Sidebar ≤2 levels, toolbar pattern, ⌘K palette from `routes.json`, one right panel (inspector or Copilot) |
| 19 | [Proposed user journeys](19-proposed-user-journeys.md) | Guided build vs direct over the same data; "Everyone" people view; unified Travel; agenda conflicts |
| 20 | [Design system proposal](20-design-system-proposal.md) | Radius, elevation, status, density, motion and focus tokens; copy standard; **inspector replaces FormModal (decision)** |
| 21 | [Component architecture](21-component-architecture.md) | Compound DataTable/Inspector; **DECISION 1:** domain modules for Bendie writes; **DECISION 2:** Radix, TanStack, cmdk |
| 22 | [Responsive and accessibility strategy](22-responsive-and-accessibility-strategy.md) | Breakpoint behaviour, 390px fixes, WCAG 2.2 AA baseline, axe + keyboard checks |
| 23 | [Event readiness architecture](23-event-readiness-architecture.md) | One server-side rule registry replaces both readiness models; severities; no single % |

## AI architecture (pass 3, 2026-11-20, PROPOSALS)

| # | Doc | Key point |
|---|---|---|
| 24 | [Qwen model evaluation plan](24-qwen-model-evaluation-plan.md) | Verified facts with sources: no strict JSON Schema in Singapore; no `tool_choice: required`; 30-day retention or ZDR; official `@ai-sdk/alibaba`. Flash/Plus/Max/VL tiers; Frankfurt EU recommended |
| 25 | [AI Copilot architecture](25-ai-copilot-architecture.md) | Provider adapter, orchestrator, context engine, registry, proposal store; no AI service-role client |
| 26 | [AI context engine](26-ai-context-engine.md) | 7 layers, data via tools only, user×org×event isolation, PII rules |
| 27 | [AI action registry](27-ai-action-registry.md) | 35 tools (14 read, 7 draft, 9 write, 5 high-impact) mapped to real code; 5 excluded |
| 28 | [Smart ingestion](28-smart-ingestion-architecture.md) | Deterministic import stays local (Feature 023 FR-018); AI import is opt-in; staging, dependency order, undo |
| 29 | [Intelligent event builder](29-intelligent-event-builder.md) | `EventDraft` with sourced fields; never invents facts; creates Draft only |
| 30 | [Generative agenda and run of show](30-generative-agenda-and-run-of-show.md) | Deterministic conflict validator; run of show fits `production_tasks`; internal notes stay in Planner |
| 31 | [AI interface design](31-ai-interface-design.md) | Drawer, expanded workspace, inline, palette; components not paragraphs; ✦ Draft markers |
| 32 | [AI security and privacy](32-ai-security-and-privacy.md) | Threat/control table; passport, dietary, emergency never sent; legal decisions listed |
| 33 | [AI evaluation and testing](33-ai-evaluation-and-testing.md) | Unit → tool contract → scenario evals → adversarial → E2E → fallback |
| 34 | [AI cost and performance](34-ai-cost-and-performance-strategy.md) | Estimates ≈ $5–7 per org per month; hard limits |

## Implementation planning (pass 4, 2026-11-20, PROPOSALS)

| # | Doc | Key point |
|---|---|---|
| 35 | [Migration strategy](35-migration-strategy.md) | Strangler pattern in the same app; routes unchanged; flags; no schema changes for the UI phases; mobile compatibility rules |
| 36 | [Phased implementation roadmap](36-phased-implementation-roadmap.md) | Phases 0–10 → Spec Kit features 030–049; **030 = constitution v2.0.0 amendment** (Principles II and V conflict with the approved decisions) |
| 37 | [Testing strategy](37-testing-strategy.md) | Test env only; per-role data-access tests; Playwright parity + axe; gates per feature |
| 38 | [Success metrics](38-success-metrics.md) | No baselines yet; how to measure; proposed targets clearly labelled |
| 39 | [Risks and mitigations](39-risks-and-mitigations.md) | 13 risks; top: mobile compatibility, parity, permission regressions |
| 41 | [Final recommendations](41-final-recommendations.md) | Part 25 discovery report + 10 recommendations + next steps |

## Machine-readable registries (`data/`)

| File | Contents |
|---|---|
| [routes.json](data/routes.json) | 54 pages, 64 API route files: scope, product, tables, RPCs, APIs, auth helpers |
| [features.json](data/features.json) | 55 features, including the 6 with no Portal UI |
| [entities.json](data/entities.json) | 63 Bendie and 40 Planner tables, enums, RPCs, edge functions, buckets |
| [permissions.json](data/permissions.json) | Tiers, capability matrix, known mismatches |
| [feature-dependencies.json](data/feature-dependencies.json) | Dependency edges, import order |
| [ai-tools-proposal.json](data/ai-tools-proposal.json) | 35 AI tools with risk, permission, executor, approval, recovery (generated by `tools/ai_tools.py`) |

## Still to write

Nothing from the Portal 2.0 document list. Next: Spec Kit features 030+ (doc 36) and the 3 Part 19 skills (doc 02).

## Prompts

| File | Use |
|---|---|
| [prompts/mobile-app-extraction.md](prompts/mobile-app-extraction.md) | Paste into an agent inside each mobile app repo; returns `studio-contract-<app>.md/.json` for `data/mobile/` |

## Regenerating the generated docs

Docs 05, 06 and 16 and the JSON registries are generated, so don't hand-edit them. Run from the repo root:

```sh
node docs/bendie-revamp/tools/gen-routes.mjs .      # data/routes.json from src/app
node docs/bendie-revamp/tools/gen-routes-md.mjs .   # 05 from routes.json
node docs/bendie-revamp/tools/features.mjs .        # features.json, 06, 16
node docs/bendie-revamp/tools/registries.mjs .      # entities, permissions, dependencies
```

`registries.mjs` holds the live-schema findings from 2026-11-19. Re-run the read-only catalog queries (doc 07) before refreshing it.
