# Verification: 029 Design Tokens Foundation

Environment: branch `029-design-tokens-foundation`; builds run in a separate git worktree (so the developer's running `next dev` is untouched) with placeholder Supabase env; browser checks run against the TEST environment only.

## T001 Baseline (before changes, 2026-11-20)

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `next lint` | 0 errors, 28 warnings |
| `vitest` | 79/79 passed |
| `next build` | success; CSS bundle 69,588 bytes |

## T002 Baseline artefacts

The 2026-11-19 walk-through (`walkthrough.json`, 80 `stawi_admin` screenshots) and the baseline CSS were copied to a scratch folder outside the repo.

## T005 Existing outline-none cases (research R4)

Verified: `RowActionsMenu.tsx:113` shows `focus-visible:bg-surface-container-low` (menu-item highlight); `ThemeDesignerModal.tsx:51` is `tabIndex={-1}` (not keyboard-tabbable; shows `border-primary` when active). No change needed.

## T015 Rule reconciliation

`grep "Next.js 14|no service layer|always a FormModal|component library"` over `context/code-standards.md` and `context/ui-rules.md` returns only reconciled lines (the stack note and the headless-primitives allowance). `context/architecture.md` is deliberately deferred to the app-shell feature (research R7; doc 40 G1).
