# Verification: 030 Studio 2.0 App Shell

## T001 Baseline (redesign @ 304fa5c + 030 docs), 2026-11-20

| Check | Result |
|---|---|
| tsc | clean |
| lint | 0 errors / 28 warnings |
| vitest | 79 passed (79) |

The walk-through baseline is the 2026-11-19 run (scratch copy from 029 T002, still valid; 029 changed no access).

## T007 No-change checkpoint (extraction only, commit 640cc06), 2026-11-20 → 2026-11-23

| Check | Result |
|---|---|
| tsc / lint / vitest | clean / 0 errors, 28 warnings (= baseline) / 79 passed |
| `next build` (separate worktree) | passes; route table (static/dynamic markers) identical to the baseline build |
| Line check | every line of `useEventWorkspace`, `EventWorkspaceV1`, `EventWorkspaceParts`, `useHeaderModel`, `HeaderParts`, `TopHeader`, `PortalShell` exists in the originals, except imports, comments, destructures, return lists and wrappers; no original line dropped (one became `export const PRODUCT_LABEL`) |
| Walk-through v1 vs a **same-day** reference run of the pre-030 code (`304fa5c` on port 3100, same test data) | 252/252 visits; **1 access difference, pre-existing and flaky** (see below); screenshots: 4 of 80 differ, all capture timing or data (Event Photos captured mid-load in the reference; dashboard greeting "Good morning/afternoon" and relative times) |

Why a same-day reference: compared with the 2026-11-19 baseline, the test data had moved on (16 screenshot differences, all data), which hid nothing but proved nothing either.

**Pre-existing race (not caused by 030, not fixed: out of scope):** org admin opening a Planner-only page (`planner-production`) on a Bendie-only event is *sometimes* redirected to the Dashboard and sometimes left on the page. The pre-030 code did both (the reference walk-through redirected; three direct probes of the same pre-030 code did not). Flagged for a follow-up bug on `main`.
