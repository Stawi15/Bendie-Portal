# 38 — Success Metrics

**Status:** PLAN. **No baselines have been measured yet** (docs 12 and 15 explain why: dev-server timings aren't valid). Targets below are **proposals**, to be confirmed once baselines exist. Don't quote them as results.

## How baselines will be measured

- Scripted journeys (doc 12, J1–J8) as Playwright specs on a **production build** (`next build && next start`) against the test environment, 5 runs each, median reported.
- Interaction counts (clicks, page transitions, form fields, decisions) counted from the scripts, not estimated.
- Usability: 3–5 organisers (internal Stawi + one client) doing the same tasks on the test copy, timed, with think-aloud notes.
- Production telemetry: `.env.example` lists `NEXT_PUBLIC_SENTRY_DSN` and `NEXT_PUBLIC_ANALYTICS_ID`, but **neither is wired** (doc 04). Wiring privacy-respecting page and performance telemetry is a prerequisite for real-world numbers.

## Metrics

| Metric | Baseline | Proposed target |
|---|---|---|
| Time to create an event (J1) | to measure | −40% |
| Time to initial setup to "Ready" on the synthetic event | to measure | −30% |
| Time to import 30 attendees / 8 speakers | to measure | −30% (deterministic); −50% with AI import |
| Time to configure a 10-session agenda | to measure | −30% |
| Time to locate a feature (5 tasks, first-time user) | to measure | −50% (palette) |
| Navigation steps per journey | to count | −30% |
| Repeated data entry (fields typed twice across a journey) | to count | −50% |
| Readiness correctness (issues found vs seeded issues) | **0% for Required attendees (B1, now fixed)** | 100% of seeded issues |
| Import error rate (rows needing manual fix) | to measure | −50% |
| Accessibility: axe violations per page | to measure | 0 serious/critical |
| Page performance (LCP, INP on production build) | to measure | LCP <2.5s, INP <200ms |
| AI task success (eval set) | n/a | ≥90% (doc 24 bars) |
| AI proposal acceptance (without edits / with edits) | n/a | track; ≥60% accepted |
| AI p95 first-token latency | n/a | ≤2.5s fast, ≤5s standard |
| AI cost per successful task | n/a | ≤ estimates in doc 34 |

**Outcome measure** (Portal 2.0 §20: "demonstrably easier"): organisers rate "I knew what to do next" and "I found what I needed" before and after (5-point scale).
