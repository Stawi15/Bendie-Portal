# 01 — Executive Summary (Discovery, pass 1)

**Date:** 2026-11-19 · **Branch:** `redesign` (from `main` @ `cb5f1bf`) · **Mode:** discovery only. No application code, schema or data was changed.

## Bottom line

Bendie Studio is a mature, permission-heavy back office. It has 54 pages, 64 API route files, 32 event sections, 55 features and 103 tables across two Supabase projects. It authors the Bendie Events attendee app and operates Bendie Planner. The architecture is sound and well guarded: RLS on every table, a server-side authorization check on every privileged route, and one source each for Planner access rules and venue time.

The main problem is **cognitive load from breadth, not missing capability**: one page per section, four people concepts, three agenda-like lists, two readiness models, and no publish model. None of the AI goals in Portal 2.0 exist yet. There's no AI code, no command palette, and no export.

## Key findings (verified)

1. **Scope has grown past its docs.** Studio now admits any organisation member, not only Stawi admins. There are 32 event sections (8 Planner), the Planner mirror is complete, and moderation and an organisations admin exist. `context/project-overview.md` and `architecture.md` are stale on this (doc 04).
2. **No content publish step.** Saves go live in the attendee app. `events.status` isn't just a label: `active`/`published` makes the event **publicly readable**, including to signed-out users (doc 09).
3. **People are fragmented** across organisation people, attendees, Planner participants and Planner access. Bendie↔Planner identity is joined by email, and **86% of Planner passengers have no email** (doc 09).
4. **Readiness is shallow and inconsistent.** The Dashboard has only 2 Required checks; the org list uses a different 8-check %. There are no agenda conflict checks (2 live overlaps), and 58 of 136 speakers have no bio (docs 11, 13).
5. **Import is strong, but there's no export.** The shared CSV/paste/xlsx importer covers 17 screens, which is a good base for smart ingestion. There's no data export.
6. **Reuse readiness for AI is uneven.** Planner logic lives in reusable `src/lib/planner*.ts` modules. Bendie writes are inline in client pages, so AI actions on Bendie content need those writes pulled into shared services first, to avoid duplicating business logic (rule 9).
7. **Design system drift:** 248 raw palette classes, 111 hex literals, three competing radii, no shared table or inspector, no reduced-motion support (doc 14).
8. **Planner database debt:** 10 legacy or one-off tables, text and typed time columns side by side, and free-text task status (doc 07).

## What changed since the October 2026 audit

Features 017–028 shipped after `context/bendie-portal-current-state-audit.md`:

- Client org admins on events (017).
- Planner agenda (018).
- Task batch status (019).
- Vendor/checklist edit and delete-all (020).
- Breakout rooms (021).
- Organisations admin and pause (022).
- XLSX and column matching (023).
- Event timezone (024).
- Contact organizer and matchmaking (025).
- Planner access alignment (026).
- Profiles lock-down (027).
- Moderation (028).

The October audit remains the screen-level reference for everything else.

## Not verified

- ~~No browser verification~~ Done 2026-11-19 on an isolated test copy (doc 15): access matrix browser-verified; bugs B1–B5 found, including a production readiness bug (B1).
- **No mobile codebases**, so app read and cache behaviour is unknown.
- **No timings or baselines.**
- **RLS policy bodies** weren't re-audited individually.

## Done in this pass

- 12 skills reviewed and installed (doc 02).
- Discovery docs 00–16 and 40.
- Registries: `routes.json`, `features.json`, `entities.json`, `permissions.json`, `feature-dependencies.json`.

## Next pass (needs your review of this one first)

| Pass | Docs | Notes |
|---|---|---|
| 2: Product and design proposals | 17–23 | IA, navigation, journeys, design system, components, responsive and accessibility, readiness architecture |
| 3: AI architecture | 24–34 + `ai-tools-proposal.json` | Qwen evaluation (with official docs), context engine, action registry, ingestion, builder, agenda and run-of-show, security, evaluation, cost |
| 4: Implementation planning | 35–39, 41 | Roadmap phases, which then go into Spec Kit as features 030+ |
| Custom skills | `bendie-*` (Part 19) | After passes 2–3, so they contain verified decisions |

Open questions that block or shape the next passes are in [40-unknowns-and-open-questions.md](40-unknowns-and-open-questions.md). Q1–Q4 matter most.
