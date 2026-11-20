# Quickstart: validating 029

Everything runs against the **test environment** (synthetic data). See `docs/bendie-revamp/15` and memory "studio-test-environment".

## Prerequisites

- `.env.test.local` filled in (test URLs, keys, test-login passwords; gitignored)
- Playwright venv (from the doc 15 walk-through) or `@playwright/test` once added
- A baseline: the screenshots in `docs/bendie-revamp/screenshots/stawi_admin/` (2026-11-19)

## 1. Static checks

```sh
npx tsc --noEmit && npm run lint && npm test && npm run build
```
Expected: tsc clean; lint 0 errors and no new warnings (baseline 28); 79/79 tests; the build succeeds (with placeholder Supabase env, as usual).

## 2. No visual change (SC-003)

Start the app against the test env (`set -a; source .env.test.local; set +a; npm run dev`), re-run `tools/walkthrough.py`, and compare the new `stawi_admin` screenshots with the baseline.

Expected: no differences other than data-driven text (relative times such as "x minutes ago", newly created test records). Report any pixel region that differs with no data reason.

## 3. Access matrix unchanged (SC-004)

Compare `data/walkthrough.json` with the 2026-11-19 baseline for each role and path: same final URL, same `no_access` flags.

## 4. Keyboard focus (SC-001)

On org Overview, event Dashboard, Agenda and the Create event dialog, Tab through every control.

Expected:
- each control shows exactly one focus indicator (outline, or its own ring for inputs and buttons that already define one)
- a mouse click shows none

## 5. Reduced motion (SC-002)

Emulate `prefers-reduced-motion: reduce` and repeat: hover the desktop sidebar, press buttons, open and close a dialog.

Expected:
- no width, slide or scale animation
- the sidebar still waits for hover intent before expanding
- spinners and skeleton pulses still animate

## 6. Documentation (SC-005, SC-006)

- Every class in `contracts/ui-tokens-contract.md` is in `context/ui-tokens.md`.
- `grep -n "Next.js 14\|no service layer\|always a .FormModal" context/code-standards.md context/ui-rules.md` returns only reconciled or explanatory lines.
