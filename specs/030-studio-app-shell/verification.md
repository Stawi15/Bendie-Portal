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

## T025 Static checks (commit 4c43db7 + top-bar fix), 2026-11-23

| Check | Result |
|---|---|
| tsc | clean |
| lint | 0 errors / 28 warnings (= baseline, no new warnings) |
| vitest | 102 passed (79 + 23 new: shell resolution, areas, visibility/role, panel reducer) |
| `next build` (separate worktree) | passes (one retry: the first attempt failed in `next/font` fetching Google Fonts, a network error unrelated to this change) |
| Build output change | exactly the 15 `/portal/*` pages moved from static (○) to per-request (ƒ), because the layout reads the `studio_shell` cookie (research R3 / analysis U2). No other route changed |
| Dependencies / database | no `package.json`, lockfile or migration changes |

## T026 Walk-throughs, 2026-11-23

**v1, final code vs same-day pre-030 reference (SC-004):** 252/252 visits, **0 access differences**; 1 of 80 screenshots differs (Event Photos, captured mid-load in the reference). 7 org-admin visits timed out while a build competed for the dev server; they were re-visited and match. Evidence: `evidence/regression-v1-final.json`.

**v2 vs v1 (SC-003):** 252/252 visits end on the **same final page**. The only flag difference is on `/portal/no-access` for all 3 roles: v2's breadcrumb reads "No Access", which the walk-through's text heuristic counts as a no-access message (page content identical, screenshot checked). Screenshots differ everywhere, as expected for a new layout. 1 timed-out visit was re-visited and matches. Evidence: `evidence/access-v2-vs-v1.json`.

## T027 Reachability and context strip (v2), 2026-11-23

**SC-001 / SC-002:** for every role and both events, the sidebar shows **6 areas** (≤ 6, down from up to 11 tabs) and lists exactly the sections v1's navigation lists (both render `useEventWorkspace().visibleSections`); each is one area click + one page click, utilities one click. Notes:
- tester: 8 sections open by URL but appear in neither layout's navigation, because Manage modules turned them off for that event (`portal_setup_modules`); same behaviour in v1 and v2.
- event staff on Summit: Attendees is listed in both layouts but the page itself says no access (page-level permission, unchanged).
- event staff has no workspace on tester (not an event member): access-denied screen in both layouts.

**SC-005:** context strip correct in all 5 role/event combinations with a workspace: organisation, event, product chips (Summit: Attendee app; tester: Attendee app + Planner), draft sentence, Planner scope note on tester only, role (Stawi admin / Organisation owner / Event staff, checked against the test DB). Published sentence verified by setting Summit to `published` on the **test** DB and restoring it to `draft` straight after (`evidence/v2_context_strip_published.png`). Evidence: `evidence/v2-checks-reach.json`.

## T028 Focus, responsive, motion, toggle (v2), 2026-11-23

| Check | Result |
|---|---|
| Focus (SC-006), 1440 px | 89 keyboard stops on an org and an event page; **47 shell-chrome controls, all with a visible outline at 6.49:1, none faint, none missing** (K1 fixed in v2). The only stop without an indicator is the Next.js dev overlay. A mouse click doesn't show the indicator |
| 768 / 390 px | no page overflow, no clipped top-bar control (**a real bug was found and fixed**: at 768 px the New event button was pushed off-screen; the wordmark now shows from 1024 px). Drawer: `role="dialog"` while open, focus moves in and wraps, Escape closes and returns focus to the menu button, closed drawer is `visibility: hidden` |
| Touch target | menu button is 44 × 44 px (`h-control-touch aspect-square`; 029 defines `control` sizes for height only) |
| Reduced motion | drawer transition 200 ms → 0.01 ms with `prefers-reduced-motion: reduce` |
| Toggle (SC-007) | v1 → "Try the new layout" → v2 → reload → v2 → "Back to the current layout" → v1; `?shell=v2` → v2 and sticks on plain URLs; `?shell=v1` → v1. **0 page errors** |

Test-harness note: Playwright sets a cookie given by URL on path `/`, which left two `studio_shell` cookies and made the toggle look broken in tests only. The walk-through now sets it on `/portal`, exactly as the app does.

Screenshots: `evidence/v2_w{1440,1024,768,390}_*.png`, `evidence/focus_v2_*.png`.

## T030 /review fixes (developer chose 4, 9, 10), 2026-11-23

| # | Issue | Fix | Check |
|---|---|---|---|
| 4 | v2 organisation breadcrumbs used v1 page names ("Assets", "Activity Log") unlike the sidebar | `orgBreadcrumbTrail()` in `src/lib/orgNav.ts` (+ 3 tests) worded like the sidebar; Teams shows under People | browser: Library, Activity, People › Teams |
| 9 | Organisation detail breadcrumb showed the raw organisation id | same function: "Organisations › Organisation details"; any id segment is never shown | browser + unit test |
| 10 | Organisation switcher menu (256px) could be clipped by the 264px sidebar | the sidebar panel clips only in rail mode (`globals.css`); full sidebar and drawer let header menus extend past the edge | browser probe at 1440/1100/390: menu edge visible; collapsed rail still clips (72px) |

tsc clean; lint 0 errors / 28 warnings; vitest 105 passed.

## Phase 9 Convergence (T031–T033), 2026-11-23

| Task | Result |
|---|---|
| T031 (FR-012) | v2, org admin, tester event, starting on the Dashboard: Manage modules (sidebar footer) → FAQs off → Save: FAQs left the sidebar immediately with no reload (page marker kept); FAQs back on → Save: returned immediately. Test DB `portal_setup_modules` checked afterwards: same 13 entries as before. (Saving while *on* the FAQs page keeps it listed until you leave, by existing design shared with v1.) |
| T032 (plan: Performance Goals) | `getUserOrgRole` / `getUserEventRole` take an optional `knownUserId`; `useWorkspaceRole` passes the id from `useAuth`, so the context strip makes no Auth requests, only the two cached role reads. Existing behaviour unchanged when no id is passed |
| T033 (FR-014) | spec wording updated: bell and settings live in the global top bar (analysis C1) |

tsc clean; lint 0 errors / 28 warnings; vitest 105 passed.
