# Memory — Backend catch-up roadmap (Features 023–027)

Last updated: 2026-11-17

## What was built

**Feature 023, Smart Spreadsheet Import:** done, browser-accepted, committed on branch `023-smart-spreadsheet-import` (not pushed, not merged).
- All 19 import screens (shared `src/components/portal/CsvImportModal.tsx`) now take Excel `.xlsx` as well as CSV and paste.
- There's a sheet picker and a "Match your columns" step, plus corrected-CSV and error-report downloads.
- New `src/lib/spreadsheetImport.ts` with 50 tests (`npm test`, vitest); `exceljs` is lazy-loaded.
- Spec Kit artifacts in `specs/023-smart-spreadsheet-import/`. All tasks ticked, including convergence Phase 7.
- It's a selective port of the unmerged Codex branch `codex/ux-foundations-smart-import` (import only). The AI-mapping commit and the Codex UX changes were deliberately left out. Both Codex branches are untouched.

**Reference docs (local only):**
- `docs/bendie-events-backend-changes.md` and `docs/bendie-planner-backend-changes.md` hold the backend-change briefs from the two app teams (16 Nov 2026).
- `docs/` is gitignored (`.gitignore:47`), so these exist only on this machine. Move them into `context/` if they should be versioned.

## Decisions made

- **Roadmap order (approved):**
  1. 023 CSV/Excel ✅
  2. 024 event time zone
  3. 025 Contact Organizer toggle (plus matchmaking checks, events item #10)
  4. 026 Planner access alignment
  5. 027 C1 profiles lock-down readiness
- **Each feature** gets its own Spec Kit run: `/architect` → specify → plan → tasks → analyze → implement → review → converge.
- **No AI column mapping:** it needs a hosted Ollama service that nobody has.
- **024 should also** pass the event's time zone to Planner at provisioning (`lib/plannerEventProvisioning.ts` sends none today, so Planner defaults to Africa/Nairobi). Planner agenda times should use the event's time zone instead of the browser's.
- **Dependency pins:** `vitest` ^4.1.12 (2.x had advisories). `package.json` `overrides.exceljs.uuid = 11.1.1`; drop it when exceljs updates.

## Problems solved

- **exceljs merged cells:** a merged value is repeated in every covered cell. Use `cell.isMerged` and `cell.master` to detect copies, otherwise title rows look like duplicate headings.
- **exceljs dates:** they're UTC-based. Read UTC parts only. A time-only cell comes back as a Date on 1899-12-30.
- **Build without env:** `npm run build` stops at page-data collection unless the Supabase env vars are set. Use placeholder values for a compile check. A Google Fonts download failure (`Plus_Jakarta_Sans`) is a transient network error, so retry.
- **No PowerShell here:** the Spec Kit `.ps1` setup scripts can't run, so set up feature dirs and `.specify/feature.json` by hand.

## Current state

- `main` is unchanged. The `production` branch is 10 commits behind `main` (Features 020–022 are not in production).
- **Bendie Events doc items 1–12:** none done yet except via the plans above.
  - **Data and process items for the team, not code:** #7 hide the test event (slug `test`); #8 set `app_release_config.latest_version` to 1.0.4; #9 keep the reviewer account in `stawi-escape-2026`.
  - **Unplanned code items:** #4 (announcement push `data`, probably in the app repo's edge function) and #5 (app version admin screen, optional).
- **Planner doc:** access-model changes, notifications and the time zone are not done (026/024). Task notes, slides and blueprints are unplanned (optional).
- **Biggest risk, C1:** once `profiles` column grants are revoked, `middleware.ts`, `lib/portalAuth.ts` and `lib/eventAuth.ts` (which read `global_role`) and `contexts/AuthContext.tsx` (`select('*')`) break, which locks everyone out of the portal. About 15 client email/phone reads also break.

## Next session starts with

Feature 024 (event time zone): `/architect`, on a branch stacked on `023-smart-spreadsheet-import`. Connect the `supabase` and `supabase-planner` MCP connectors first (`/mcp`), so the `events.timezone` grant, the `events_timezone_valid` constraint and Planner's `events.timezone` trigger can be verified live.

## Open questions

- 026: should portal-made Planner changes send Planner notifications? Today they don't, because the service role has no `auth.uid()`.
- 027: the C1 date, agreed with the app team.
- Events #12, walk-ins: a product decision.
- Should the `docs/` references be moved into `context/` so they're versioned?
