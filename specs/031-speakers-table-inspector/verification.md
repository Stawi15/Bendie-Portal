# Verification: 031 Speakers Table and Inspector Pilot

## T001 Baseline (redesign @ 1426691 + 031 docs), 2026-11-24

| Check | Result |
|---|---|
| tsc | clean |
| lint | 0 errors / 28 warnings |
| vitest | 105 passed (105) |

Same-day v1 reference walk-through: `redesign@1426691` on port 3100 (separate worktree, test env), output in the scratch folder (`ref031`).

## T007 + T025 Walk-throughs, 2026-11-25

T007's no-change proof was run on the **final** code (it contains every Phase 2 change plus the guard), against a same-day reference run of `redesign@1426691` (port 3100).

| Comparison | Result |
|---|---|
| **v1 vs reference (SC-002)** | 252/252 visits. **1 access difference**: Stawi admin, Summit `planner-overview`, which is the intermittent wrong-product redirect flagged in Feature 030 (here it redirected correctly; the reference didn't). Screenshots: 2 of 80 differ, both explained (that redirect, and tester Terminology captured mid-load in the reference). Evidence: `evidence/regression-v1.json` |
| **v2 vs v1 (access parity)** | 252/252 visits, **0 access differences**. Evidence: `evidence/access-v2-vs-v1.json` |

Notes:
- A ~15-minute stall (the dev server and the database tool together; likely the Mac sleeping) caused timeouts. 33 v1 visits and 8 v2 visits were re-visited and match. The event-staff login failed during the stall, so that role was re-run in full (80 visits).
- Stall-time screenshots (loading skeletons) were retaken before comparing.

## T026 Parity and behaviour (v2, Stawi admin, Summit), 2026-11-25

Script: the quickstart §4 checks (`evidence/parity-checks.json`, `parity-checks-rerun.json`). Every check passed with clean data:
- **List, search, sort and filters:** display order; count; claim badges with text; search on all 6 fields; sort asc/desc/off on name, organisation, group and profile (empties last in both directions, ties in display order); group / role / not-claimed filters and their combination; no-match state; reset.
- **Editing:** add with both validation messages, saved at the end with the address moving to the new id; edit; delete with confirm and cancel.
- **Guard:** asks on close, another row, sidebar link, breadcrumb, Escape, Add speaker, event search, Logout and Back (address restored). The browser warning appears on reload. Discard closes without saving; with no changes nothing asks.
- **Sessions:** a lead + linked session is de-duplicated (1), a speaker with 2 sessions shows 2, and a speaker with none says so.
- **Address:** a deep link opens the speaker, Back stays on the page, and an unknown id shows the message.
- **Import** lands at the end, with no page errors.
- **Attendees "Add to speakers"** works in v1 and v2: one claimed record each and the role set to facilitator (as before).

**Bugs found and fixed by this run:**
1. **End-of-list order.** "Count" collided with existing orders that start at 1, so new or imported speakers landed before the last one. The rule is now max + 1, in `nextSpeakerDisplayOrder`, shared by both layouts. This is a small behaviour change in v1 too; the old rule broke FR-012.
2. **Deep links.** Opening `?speaker=…` directly closed the inspector during the history swap. That intermediate address is now ignored.
3. **Inspector footer.** Sticky positioning sat 16px short of the bottom, so content showed below it.

**Found, not fixed (pre-existing, outside scope): organisation owners/admins can't add, edit or remove speakers.** `facilitators` has no write policy for them; only Stawi admins can write. That's identical in v1. The new page shows the same "You don't have permission" message and keeps the typed values.

**Test data:** the script varied 3 speakers temporarily and added test records. A script fallback also wrongly made Test Org Admin a speaker and changed their event role; the fallback was removed. Everything was restored (developer approved): records deleted by SQL, and roles reset through the app (a trigger blocks role changes from SQL). Final state verified: 8 speakers, original values, org admin = admin, attendee11/12 = attendee, no stray records.

## T027 Focus, widths, reduced motion (v2), 2026-11-25

| Check | Result |
|---|---|
| Focus, page (40 stops) | Every control has a visible indicator. The search box and the 2 filter selects use the shared `.input` style: on focus the border turns primary (rgb(0,98,157), ~6.5:1 on white) with a 20% ring. The detector doesn't count borders; checked directly |
| Focus, inspector (39 stops) | All shown with the shared outline at ≥3:1 |
| Escape | Closes the inspector and returns focus to the row |
| 1024 / 768 px | Sheet (`role="dialog"`), focus moves in and Shift+Tab stays inside, no overflow, nothing clipped |
| 390 px | List mode, no sideways scroll. **Bug found and fixed:** "Add speaker" was clipped; the header buttons now wrap under the title |
| Reduced motion | The sheet slide-in (`shell-sheet-in` 0.3s) is removed (`none`) |

Evidence: `evidence/a11y-responsive.json`, `focus_*.png`, `v2_w{1024,768,390}_{list,sheet}.png`.

## T024 Static checks, 2026-11-25

tsc clean; lint 0 errors / 28 warnings (= baseline); vitest **120 passed** (105 + 15 in `speakers.test.ts`). The only dependency change is `@tanstack/react-table@9.3.1` (exact) and its own sub-packages. Worktree build: see below.

**Worktree `next build` (commit 01292e1):** passes. The build's lint output shows the same 28 pre-existing warnings, none new. There are no route rendering-mode changes in this feature.
