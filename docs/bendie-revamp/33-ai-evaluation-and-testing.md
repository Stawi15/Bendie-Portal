# 33 — AI Evaluation and Testing

**Status:** PLAN. It complements doc 24, which covers model selection. This doc covers keeping the Copilot reliable after launch (Portal 2.0 §17).

## Test layers

| Layer | What | Where | Gate |
|---|---|---|---|
| **Unit** | zod schemas, redaction, context assembly, proposal binding/staleness, conflict validator, readiness rules | vitest (existing `npm test`) | Every PR |
| **Tool contract** | Each tool: permission allowed/denied per role (doc 10 matrix), event/org injection can't be overridden, output redaction | vitest against the **test Supabase projects** (synthetic data) | Every PR touching `src/lib/ai` |
| **Scenario evals** | 150+ labelled requests across navigation, queries, drafting, import, agenda, readiness; run against the live Qwen model | Eval harness (doc 24); results in `data/ai-eval/<date>.json` | Weekly + before model or prompt changes |
| **Adversarial** | Injection docs, cross-tenant requests, oversized files, stale proposals, role revoked mid-session | Same harness + Playwright | Before launch, then monthly |
| **End-to-end** | Drawer, staging, approve, data written, audit row present, Undo works | Playwright on the test environment (extends `tools/walkthrough.py`) | Before each release |
| **Fallback** | Qwen unreachable / kill switch: Studio fully usable, AI entry points hidden or explained | Playwright with `AI_ENABLED=false` and a blocked endpoint | Before each release |

## Datasets (synthetic only)

- **Records:** the test environment seed (`~/studio-test/seed-bendie.sql`), extended with edge cases: missing emails, duplicate names, overlapping sessions, speakers without bios, participants without email.
- **Documents:** about 40 generated files.
  - 10 briefs/proposals (PDF/DOCX)
  - 10 agendas (XLSX/PDF, including multi-track)
  - 8 manifests and rooming lists (XLSX/CSV with messy headers)
  - 6 speaker lineups
  - 6 adversarial files (embedded instructions, fake "approved" text, huge tables)

  Each has a gold JSON of the expected extraction.
- No production data, and no real attendee names, in any dataset (§5.3, §17).

## Metrics tracked over time

The same metrics as doc 24, plus production signals from `ai_action_log`:
- proposal acceptance and edit rates (edits mean the drafts were close but not right)
- undo rate
- tool-error rate
- p50/p95 latency
- cost per completed task
- thumbs-down reasons

A drop of more than 5 points on any eval metric blocks a model or prompt change.

## Regression discipline

- Prompts, tool descriptions and schemas are versioned in code. A change runs the scenario evals before merge.
- Model id changes (Model Studio updates models often; doc 24) go through the same evals. Pin dated snapshot ids where Model Studio offers them.
