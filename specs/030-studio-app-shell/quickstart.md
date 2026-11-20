# Quickstart: validating 030

Test environment only (synthetic data). The dev server runs with `.env.test.local`; builds run in a separate git worktree.

1. **Static:** `npx tsc --noEmit && npm run lint && npm test && npm run build` (worktree, placeholder env). Expected:
   - tsc clean
   - lint 0 errors, no new warnings (baseline 28)
   - all tests pass, including the new area/visibility/role/shell/panel tests
   - the build succeeds
2. **Default layout unchanged (SC-004):** with no cookie, run the walk-through (`STUDIO_SHELL=v1`) and compare the screenshots with `docs/bendie-revamp/screenshots/` (2026-11-19 baseline, as in 029 T020). Expected: data-only differences.
3. **Access parity (SC-003):** run the walk-through with `STUDIO_SHELL=v2`. Expected: the same `(role, path) → final URL, no-access flag` as v1, for all 252 visits.
4. **Reachability (SC-001, SC-002):** in v2, for each role and both test events, every section reachable in v1 appears in the sidebar within ≤2 clicks; the top level shows ≤6 areas.
5. **Context strip (SC-005):** Summit (draft, Bendie) and tester (draft, both) for the 3 roles. Set the test event's status to Published on the test DB to check the public sentence, then restore it.
6. **Focus and responsive (SC-006):** corrected focus detector in v2 at 1440; drawer at 390 (open, Escape, focus return); reduced motion.
7. **Toggle (SC-007):** account menu → new layout → reload (persists) → back to current; then `?shell=v2` and `?shell=v1` links.
