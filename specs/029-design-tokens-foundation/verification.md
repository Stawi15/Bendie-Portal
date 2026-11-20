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

## T016 Checks after implementation

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| `next lint` | 0 errors, 28 warnings (unchanged from baseline) |
| `vitest` | 79/79 passed |
| `next build` (worktree, placeholder env) | success |
| FR-012 | `git diff --stat redesign -- package.json package-lock.json supabase/migrations` is empty |

## T017 New classes compile, and existing CSS is unchanged

- A temporary `src/app/__token-check.tsx` in the build worktree (never committed, then deleted) referenced 26 token classes. All 16 sampled classes were present in the built CSS.
- Baseline vs new CSS: 963 vs 995 rule chunks.
  - **No existing rule changed value.** The only two "differences" are minifier selector grouping: `.duration-200` now shares a rule with `.duration-motion-base` (same `.2s`), and `.shadow,.shadow-inner` share a rule with the elevation classes (same declarations).
  - 34 additions: the tokens, the `:where(…):focus-visible` rule, `.focus-ring`, and the reduced-motion block.
- The `!important` spinner, pulse and `:active` rules exist **only inside** `@media (prefers-reduced-motion: reduce)` (0 occurrences outside).

## T018 Keyboard focus (SC-001), test environment, Stawi admin. **Corrected after /review**

The first run's detector was unreliable: it treated any `box-shadow`, including Tailwind's zero-size placeholder, as a ring, and it read `transition-all` buttons mid-animation. The corrected detector counts a ring only when it has non-zero blur or spread and a visible colour, waits 300ms after each Tab, and measures indicator contrast against white. Results:

| Screen | Stops | Indicator from the **new shared rule** | Weak or missing (component-owned, existing) |
|---|---|---|---|
| Org overview | 30 | All links and buttons: primary outline, **6.49:1** | Product switcher "Bendie" / "Bendie Planner" ring 1.93:1; header search 1.48:1 |
| Event dashboard | 30 | All, 6.49:1 | Same 2 header controls |
| Agenda | 30 | All, 6.49:1 | Same 2 header controls |
| Create event | 14 | All buttons, 6.49:1 | None that matter (see below) |

- **Form fields (`.input`):** the detector flagged their 20% ring (1.36:1), but on focus their **border turns full primary (6.49:1)**, which is a sufficient indicator. The detector doesn't measure border changes.
- **Create event date fields ("no indicator" ×2):** at those Tab stops, focus is on the browser's native date-picker button inside the field, which draws its own 3px outline. Not an app issue.
- **"All" segment, "doubled":** the decorative `panel-shadow` marking the selected tab plus our outline. Not two focus rings.
- **Mouse click** on "Manage modules" → `:focus-visible` false.

**SC-001 outcome:** met for every control the shared rule covers. **Known issue K1 (deferred, existing styles):** two TopHeader controls have weak focus (product switcher ring 1.93:1; header search ring doesn't render, leaving a 50%-opacity border change). They're component-owned styles outside this feature's scope, and the app-shell feature replaces the header (docs/bendie-revamp/40, K1). Evidence: `evidence/focus-and-motion.json` (with per-stop details), `evidence/focus-*.png`.

## T019 Reduced motion (SC-002)

| Property | no-preference | reduce |
|---|---|---|
| Sidebar `transition-duration` | 0.2s, 0.2s | 1e-05s |
| Sidebar `transition-delay` (hover intent) | 0.25s | 0.25s (unchanged ✓) |
| Button `transition-duration` | 0.2s | 1e-05s |
| `animate-pulse` | 2s × infinite | 2s × infinite (kept ✓) |
| `animate-spin` | 1s × infinite | 1s × infinite (kept ✓) |

Press-scale under reduce: `:active` resets `--tw-scale-*` to 1 (CSS confirmed in T017).

## T020 Visual and access regression (SC-003, SC-004), 2026-11-20

- **Access (SC-004): 252/252 visits identical** to the 2026-11-19 baseline across all 3 roles (same final URL, status and no-access flags). 0 differences.
- **Screenshots (SC-003):** 80 `stawi_admin` screens compared (pixel diff, JPEG-noise threshold). 17 exceed 0.05% changed pixels, and **none is caused by this feature**:

  | Screens | Cause |
  |---|---|
  | `summit_dashboard` + 8 `summit_planner-*` (all redirect to the dashboard) | Required now shows 2/2: bug **B1 fix** shipped 2026-11-20, after the baseline |
  | `portal_admin_organisations_<id>` | Page now loads: **B2 fix** (baseline showed the error state) |
  | `summit_agenda` | Speaker column filled: **B3 fix** + seed correction |
  | `portal`, `portal_bendie`, `portal_planner` | Data: greeting (morning/afternoon), "speaker gaps 10 → 4", activity timestamps. Side-by-side checked: no styling change |
  | `summit_activity-log`, `tester_activity-log` | New audit entries since the baseline |
  | `tester_news` (3.3%) | Capture timing: the new shot caught the loading skeleton. **Re-captured after content loaded: 0.0% difference** |

- Evidence: `evidence/regression.json`. The regenerated walk-through files were **not** committed; the repo copies were restored to the 2026-11-19 baseline.
