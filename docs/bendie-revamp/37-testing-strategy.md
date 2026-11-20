# 37 — Testing Strategy

**Status:** PROPOSAL. Today the repo has `vitest` with 4 helper test files (79 tests) and no component, end-to-end or Playwright tests (doc 04). The browser walk-through (doc 15) and the AI eval plan (doc 33) are the starting points.

## Environments

| Env | Use |
|---|---|
| Local + **test Supabase projects** (`baqivpboykobrqlxxoph`, `xwqhisiwvnhluihcpliz`) | All development and automated tests. Synthetic data; reseedable from `~/studio-test/seed-*.sql`. |
| Production | Never used by tests. A request guard aborts any test that reaches a production project (as `tools/walkthrough.py` does). |

## Layers

| Layer | Tooling | Covers | When |
|---|---|---|---|
| Unit | vitest (existing) | Domain modules, readiness rules, conflict validator, time-zone conversions, mapping, redaction | Every change |
| Data-access contract | vitest against the test DB, with JWT-claims impersonation per role (the technique already used for Features 026–027) | RLS and column grants per role, so failures like B1 are caught before release | Changes to queries or migrations |
| E2E parity | **`@playwright/test` as a dev dependency**, promoting `tools/walkthrough.py` into TypeScript specs | Doc 16 parity rows; doc 12 journeys J1–J8; role access matrix | Before each phase is "done" |
| Accessibility | `@axe-core/playwright` (dev) + keyboard specs | WCAG 2.2 AA baseline (doc 22) | Same |
| Visual | Playwright screenshots at 1440/1024/768/390 compared against the last approved set | Layout regressions | Same |
| AI | Doc 33 | Tools, evals, adversarial, fallback | Phases 7–9 |

## Gates per Spec Kit feature (constitution VIII)

`tsc` · lint (0 errors, no new warnings) · vitest · build · E2E parity for the touched area · axe with no new violations · `/review` · `/speckit.converge`.

## First tests to write (Phase 1)

1. **A regression test for B1 and B2:** dashboard counts and the admin organisation page as each role, so column-grant problems fail CI.
2. Walk-through access-matrix spec: the 252-visit result as assertions.
3. Agenda conflict validator unit tests using the seeded Hall A overlap.
