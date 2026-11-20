# 41 — Final Recommendations and Discovery Report

**Date:** 2026-11-20 · **Branch:** `redesign`. This answers Portal 2.0 Part 25. [V] = verified (source, live schema or browser on the test environment); [P] = proposal.

## What Bendie Studio is [V]

The web back office for the Bendie ecosystem (repo "Bendie-Portal"). It authors the Bendie Events attendee app and operates Bendie Planner, for Stawi admins and client organisations.

| | Count |
|---|---|
| Pages | 54 |
| API route files | 64 |
| Event sections | 32 (24 Bendie/shared, 8 Planner) |
| Features | 55 (49 in Studio, 6 data/app-only) |
| Tables | 103 (63 Bendie, 40 Planner; all with RLS) |
| Roles | Stawi admin; org owner/admin/member (+ attendee/facilitator/staff); event host/organizer/admin/facilitator/staff/attendee/speaker; Planner Viewer/Manager/Custom |

Details: docs 03–11.

## How the ecosystem works [V]

- Studio writes Bendie content straight into the database the attendee app reads, so saves go live immediately. `events.status` decides public visibility.
- Planner is a separate project, reached only through server routes with the Planner service role.
- The bridges between them:
  - event provisioning (once, at creation)
  - staff sync (automatic)
  - agenda push (manual, one-way)
  - travel pull (manual, one-way)

  People are matched by email, and 86% of Planner passengers have none (doc 09).

## Biggest problems [V]

1. **Breadth.** 32 sections, up to 3 nav levels, and four "person" concepts (doc 13).
2. **Wrong readiness.** The main Required check never passed (B1, now fixed). Two different readiness models.
3. **No sense of state.** Product implied by colour; visibility consequences hidden.
4. **Fragmented workflows.** Three agenda-like lists; travel entered one person at a time.
5. **Design drift.** 248 raw colour classes, 111 hex literals, no shared table or inspector, no reduced motion (doc 14).
6. **Thin tooling.** No E2E tests, no telemetry wired, no export.

## Bugs found and fixed

B1–B5 (doc 15) are on `main` as of 2026-11-20. The production Planner key exposure is resolved by rotation (doc 40 Q1b).

## Recommendations

| # | Recommendation | Docs |
|---|---|---|
| 1 | **Amend the constitution first** (v2.0.0): domain modules, new navigation, inspector/headless primitives, Next 15 | 36 (030) |
| 2 | Rebuild **in place behind flags**, routes unchanged, parity matrix as the gate | 35, 16 |
| 3 | **6-area event workspace** with a context strip and one right panel; products as tags, not a mode | 17, 18 |
| 4 | **One server-side readiness engine** with severities, no percentage | 23 |
| 5 | **Table + inspector** as the standard record pattern; pilot on Speakers, then Agenda with conflict checks | 20, 21 |
| 6 | Treat **test infrastructure as part of the product**: Playwright parity + per-role data-access tests + axe | 37 |
| 7 | **Qwen Copilot as an optional, approval-gated layer**: read/draft first, writes as proposals, Frankfurt EU + ZDR, off by default per organisation | 24–34 |
| 8 | **Before Phase 5, get the mobile app codebases** (or a contract of which columns they read) | 40 Q2, 39 R1 |
| 9 | **Wire telemetry** (privacy-respecting) so success can be measured | 38 |
| 10 | Move the Planner webhook secret into Vault | 40 Q1b |

## Immediate next steps

1. **Feature 030:** `/speckit.constitution` amendment (needs your go-ahead to change the constitution).
2. **Feature 031:** tokens, focus ring, reduced motion.
3. **Feature 032:** app shell behind a flag.
4. In parallel: send the legal/DPA questions (doc 32) and ask the app team for the mobile codebases.

## Not verified or still unknown

- Mobile app read and caching behaviour.
- Real performance and timing baselines.
- RLS policy bodies policy by policy (relied on grants plus browser behaviour).
- Push and email delivery.
- Production telemetry.
- Qwen schema-mode and ZDR availability in Frankfurt.

All are tracked in doc 40.

## Documentation map

See [00-master-index.md](00-master-index.md).

The Part 19 development skills are planned as 3 (`bendie-product`, `bendie-data`, `bendie-ai-copilot`) plus the existing `bendie-design` (doc 02). They'll be written once the constitution amendment fixes the rules they encode.
