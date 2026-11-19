# 02 — Skill Registry

**Status:** VERIFIED 2026-11-19. Project-scope skills live in `.claude/skills/`. Third-party installs are tracked in `skills-lock.json`.

## Policy: fewer, Bendie-specific skills

At the developer's request (2026-11-19), generic skills that overlapped were **merged into Bendie-specific skills** and the originals removed. Every skill description loads into every session, and skills that aren't used are noise. The rules are:

1. Prefer one Bendie skill per concern over several generic ones.
2. A derived skill keeps the useful source material **verbatim** in `references/`, with commit and licence, and adds the Bendie decisions on top.
3. Don't install a generic skill when an existing Bendie skill or a global plugin skill already covers it.
4. Project files (`context/`, Spec Kit artifacts) always outrank skill guidance.

## Current skill set (18)

| Skill | Kind | Purpose | Source |
|---|---|---|---|
| `speckit-*` (10) | Workflow | Spec → plan → tasks → analyze → implement → converge (AGENTS.md) | Spec Kit |
| `architect`, `review`, `remember`, `imprint`, `recover` | Workflow | JSM skills required by AGENTS.md. **Now discoverable:** symlinked from `.agents/skills/` into `.claude/skills/` | JavaScript-Mastery-Pro/jsm-agent-skill |
| **`bendie-design`** | Derived | Every UI build or review: Bendie decisions, build checklist, review mode, 7 reference files | apple-design @64eb3de, apple-hig @d7fb453, ui-ux-pro-max @2de1134, frontend-design @e4bb5d9, web-interface-guidelines @434b7f9 |
| **`bendie-react`** | Derived | React/Next engineering: project invariants plus 31 selected rules | vercel-labs/agent-skills @1a2c79d (react-best-practices, composition-patterns) |
| `webapp-testing` | Kept as is | Playwright scripts for the browser pass (doc 15) and parity tests (doc 16) | anthropics/skills @e4bb5d9 |

## Removed (2026-11-19)

| Skill | Why | Replacement |
|---|---|---|
| `apple-design`, `apple-hig`, `ui-ux-pro-max`, `frontend-design`, `web-design-guidelines` | Overlapped heavily; mostly iOS/visionOS or marketing-site content (`ui-ux-pro-max` alone was 3.7 MB) | `bendie-design` (about 120 KB of web-relevant excerpts) |
| `vercel-react-best-practices`, `vercel-composition-patterns` | 78 generic rules, many RSC/server-only | `bendie-react` (31 relevant rules) |
| `pdf`, `xlsx`, `docx` | Duplicates of the globally available `anthropic-skills:pdf/xlsx/docx` plugin skills | The plugin skills |
| `ai-sdk` | Not needed until the AI architecture is approved (Portal 2.0 §2.8 says no runtime AI dependencies before approval) | Folded into `bendie-ai-copilot` in pass 3. Reinstall only if the AI SDK is chosen. |

Reinstalling any of them: `npx skills@latest add <repo> -s <skill> -a claude-code`.

## Not installed

| Item | Why |
|---|---|
| Playwright CLI (global) | Add `@playwright/test` as a project dev dependency when the test environment exists (doc 15) |

## Plan for the Portal 2.0 Part 19 skills: 3 skills instead of 9

Part 19 lists nine `bendie-*` skills. To keep the set small they'll be written as three, after passes 2–3 so they only contain verified decisions:

| Planned skill | Absorbs Part 19 | Main inputs |
|---|---|---|
| `bendie-product` | product-context, ux-architecture, event-workflows, feature-parity | Docs 03, 05, 06, 09, 11, 12, 16, 17–19, 23 + `routes.json`, `features.json` |
| `bendie-data` | data-schema, ingestion, security | Docs 07, 08, 10, 28, 32 + `entities.json`, `permissions.json` |
| `bendie-ai-copilot` | ai-copilot (+ the AI SDK knowledge) | Docs 24–27, 29–34 + `ai-tools-proposal.json` |

`bendie-design-system` from Part 19 already exists as `bendie-design`. Final target: about 21 skills, against 36 if everything in the brief were installed separately.

## Optional further trim

`speckit-checklist` and `speckit-taskstoissues` aren't in the AGENTS.md workflow. They're small and owned by Spec Kit, so they're left in place. Remove them only if you never use them; a Spec Kit upgrade may bring them back.
