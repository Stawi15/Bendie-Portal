---
name: bendie-design
description: Bendie Studio's design skill for building, reshaping or reviewing any Studio UI (pages, tables, forms, modals, inspectors, navigation, command palette, Copilot surfaces). Combines Apple HIG, Apple fluid motion, UI/UX Pro Max, frontend-design and Vercel Web Interface Guidelines with the Bendie tokens and decisions. Use instead of those generic skills.
---

# Bendie Design

Studio is a **dense, desktop-first professional workspace** for event organisers. Clarity and speed beat decoration. This skill replaces the generic design skills (apple-design, apple-hig, ui-ux-pro-max, frontend-design, web-design-guidelines). Their useful parts are in `references/`.

## Always read first (project sources of truth, in priority order)

1. The current feature's Spec Kit `spec.md` / `plan.md`, if one exists.
2. `context/ui-tokens.md`: colours, type scale, radius, buttons, inputs. Never hard-code hex values or raw Tailwind palette classes.
3. `context/ui-rules.md` and `context/ui-registry.md`: established component patterns. Reuse before inventing, and run `/imprint` after adding a pattern.
4. `docs/bendie-revamp/14-existing-design-system.md` (current drift) and, once written, `20-design-system-proposal.md`.

If this skill conflicts with those files, they win. Flag the conflict; don't silently pick one.

## Bendie decisions (where the source skills disagree)

| Topic | Decision | Why |
|---|---|---|
| Materials | Solid surfaces. Translucency (`backdrop-filter`) only on floating chrome: command palette, popovers, sticky toolbars over scrolling content. Never on cards or tables. | Portal 2.0 §9.1; Feature 016 removed glass |
| Density | 44px default table rows, an optional 36px compact mode for tables only, ≥24×24px pointer targets (WCAG 2.2), 44px targets on touch | Professional density + accessibility |
| Type | Plus Jakarta Sans, the token scale only. `tabular-nums` on times, dates, counts, durations and flight numbers. No all-caps labels. | Brand; HIG; frontend-design |
| Copy | Sentence case for headings, buttons and menu items. British spelling (Organisation, Colour). Verbs on buttons ("Add speaker", "Send notification"). Errors say what to do. No "Oops", no "we". | **Proposed standard; confirm in doc 20.** Today it's mixed ("Add Speaker", "New Task" vs "Create event", "Continue setup"). Overrides the WIG "Title Case" rule. |
| Motion | Purposeful only. Never animate routine, frequent admin actions. Springs critically damped (`bounce: 0`) for drawers and inspectors. **Always** provide a `prefers-reduced-motion` variant (none exists today). | HIG + motion.md |
| Modality | One modal at a time. Use a sheet/modal only for a short, scoped task. Editing a record from a list should prefer a **right-hand inspector** that keeps list filters, selection and scroll. Confirm before discarding typed input; backdrop clicks must not lose data. | HIG modality; doc 13 #4 |
| Colour meaning | Never colour alone. Product (Bendie blue vs Planner orange) and status always also carry a label or icon. | HIG contrast; WCAG |
| AI surfaces | Structured results (tables, diffs, editable previews) over chat paragraphs. Label AI-generated content. Approval is always explicit. Read `references/hig-generative-ai.md`. | Portal 2.0 §18 |

## Build checklist (new or changed UI)

1. **Find the existing pattern** in `ui-registry.md` and `src/components/portal/` (`FormModal`, `CsvImportModal`, `EmptyState`, `SaveStatus`, `SectionHeader`, `RowActionsMenu` and so on). Extend it; don't fork it.
2. **Pick the container.** List and table for records, inspector for edit-in-context, modal for short tasks, page for a workspace. See the decision tables in `references/hig-patterns-components.md` (Modality, Sheets, Popovers, Panels, Sidebars, Toolbars, Lists and tables, Search fields).
3. **Design all states:** loading (skeleton for >1s), empty (what it is + a primary action + an import action where one exists), error (cause + fix + retry), partial, permission-hidden (say why when it matters), and Planner provisioning.
4. **Forms:** visible labels, inline errors on blur, focus the first error on submit, venue-time dates through `src/lib/eventTimeZone.ts`, an unsaved-changes guard on in-app navigation as well as `beforeunload`.
5. **Accessibility:** semantic elements, `aria-label` on icon buttons, `role="dialog"` + `aria-modal` + focus trap and return, `focus-visible` rings, keyboard alternatives for drag, `aria-live="polite"` for toasts and status. Details in `references/ux-rules.md` §1.
6. **Responsive:** desktop first, but at 1024, 768 and 390px adapt nav, tables (column priority or stacked rows) and inspectors (a full-screen sheet on small screens). The `desk` breakpoint means hover-capable ≥1024px.
7. **Performance:** virtualise lists over ~50 rows, lazy-load heavy editors, no layout reads in render.
8. **Before you deliver:** run `references/pre-delivery-checklist.md`, then `/imprint` if a pattern was added or changed.

## Review mode

When asked to review UI, read the target files and check them against `references/web-interface-guidelines.md`, `references/ux-rules.md` and the Bendie decisions above, plus token compliance (`ui-tokens.md`). Output terse findings grouped by file in `path:line — issue` form, most severe first, and no fixes unless asked (AGENTS.md `/review` rule).

## References (load only what the task needs)

| File | Use for |
|---|---|
| `references/hig-patterns-components.md` | Modality, search, feedback, data entry, undo, help, drag and drop, onboarding, charts; toolbars, context menus, sidebars, split views, tables, sheets, popovers, inspectors |
| `references/motion.md` | Drawers, inspectors, drag, springs, interruptibility, reduced motion, materials, type tracking |
| `references/web-interface-guidelines.md` | Concrete web rules and anti-patterns for review |
| `references/ux-rules.md` | Accessibility (WCAG 2.2), interaction, performance, layout, forms, navigation rule IDs |
| `references/pre-delivery-checklist.md` | The final pass before handing over UI |
| `references/distinctive-design.md` | Avoiding generic, templated looks, and UI writing (use with the Bendie copy rules) |
| `references/hig-generative-ai.md` | Copilot and AI-assisted UI |

## Sources and licences

Derived 2026-11-19 from: emilkowalski/skills `apple-design` @64eb3de (MIT) · daft2/apple-hig-skill @d7fb453 (MIT) · nextlevelbuilder/ui-ux-pro-max-skill @2de1134 (MIT) · anthropics/skills `frontend-design` @e4bb5d9 (Apache-2.0, see `references/LICENSE-frontend-design-Apache-2.0.txt`) · vercel-labs/web-interface-guidelines @434b7f9 (MIT). Apple's live HIG is authoritative for Apple guidance.
