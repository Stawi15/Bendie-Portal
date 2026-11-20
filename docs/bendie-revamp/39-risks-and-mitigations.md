# 39 — Risks and Mitigations

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R1 | **Breaking the mobile apps** by changing data they read | Medium | High | No column renames or drops (doc 35). **App contracts now known** (`data/mobile/`, 2026-11-20): every column and view the apps read is in `entities.json`; turn them into contract tests (doc 37). Watch: explicit-column selects on `events`; `select('*')` in Planner; view and RPC output shapes |
| R2 | **Losing functionality** in the redesign | Medium | High | Parity matrix (doc 16) gate per feature; flags; old pages kept until signed off |
| R3 | **Permission regressions** (like B1, found only in the browser) | Medium | High | Data-access contract tests per role on the test DB; walk-through access matrix in CI |
| R4 | **Constitution conflicts** stall work or get silently ignored | High (known) | Medium | Feature 030 amends the constitution first (doc 36) |
| R5 | Large pages (agenda 1,267 lines, logistics 1,211, event layout 1,098) resist change | High | Medium | Extract hooks and domain modules unchanged first; migrate the list/editor only; keep breakout and logistics internals |
| R6 | **AI legal/residency** blocks Copilot | Medium | Medium | AI is gated and optional; the non-AI redesign delivers value alone; legal review started early (doc 32) |
| R7 | Qwen model/API churn (ids, regions, features change often) | High | Medium | Provider adapter isolates it; pinned snapshot ids; eval harness on every change (doc 33) |
| R8 | AI hallucination or prompt injection changes data | Low (by design) | High | All writes are approval-gated proposals; injection eval bar 0%; sensitive data excluded (doc 32) |
| R9 | Email-only identity bridge (86% of passengers without email) makes "Everyone" misleading | High | Medium | Show "not linked" explicitly; never auto-merge; a separate spec for better linking |
| R10 | Test environment drifts from production schema | Medium | Medium | Re-dump and diff schemas before each phase (`~/dump-schemas.sh` approach, with redaction); counts check as in doc 15 |
| R11 | Secrets exposure (as happened with the Planner webhook key) | Medium | High | Vault for webhook secrets; redaction rule for tooling and AI logs; `QWEN_*` server-only |
| R12 | Scope creep from the Portal 2.0 brief's breadth | High | Medium | One Spec Kit feature per phase; anything new goes to doc 40 first |
| R13 | Single developer bandwidth | High | Medium | Phases independently shippable; AI track can pause without blocking the UX track |
