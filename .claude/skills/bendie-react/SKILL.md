---
name: bendie-react
description: Bendie Studio's React/Next.js engineering skill, for writing, refactoring or reviewing Studio pages, components, hooks and API routes. Combines the Vercel React best-practices and composition-pattern rules that fit this codebase (Next 15 App Router, React 19, client pages + Supabase, server routes for privileged and Planner work) with the project's invariants. Use instead of the generic Vercel React skills.
---

# Bendie React

## Always read first

1. `context/code-standards.md`: page shape, Supabase usage, the API route authorization pattern, errors, dependencies. **This skill doesn't override it.**
2. `context/architecture.md` (note that it still says Next 14; the app is on Next 15.5 / React 19) and `docs/bendie-revamp/04-technical-architecture.md`.
3. The feature's Spec Kit `plan.md`.

## Invariants (never break these)

1. Scope every read and write to the current `event_id` / `organization_id`. Never trust a client-supplied organisation.
2. The service role is used only in route handlers or `server-only` helpers, **after** a per-request authorization check (`code-standards.md` steps 1–5).
3. Planner access is decided only in `src/lib/plannerAccessRules*.ts` / `plannerModuleAccess.ts`. Never re-decide it inline.
4. Read venue times only through `src/lib/eventTimeZone.ts`. Never use `new Date(local)` or `iso.slice(0, 10)`.
5. Read other people's contacts only through `src/lib/profileContacts.ts`; read the caller's hidden profile columns only through `src/lib/callerProfile.ts`.
6. Never write `agenda_sessions.breakout_rooms`. Use `save_breakout_rooms` / `choose_breakout_room`.
7. A Planner failure never fails a successful Portal operation.
8. Every importer keeps CSV, paste and `.xlsx` support through `CsvImportModal`.
9. **No duplicate business logic.** If a second caller (another page, an AI tool, an import) needs a write that lives inline in a page, move it into a `src/lib/<domain>.ts` module and call that from both. Don't copy it.

## Rules that matter here (ordered by impact; details in `references/rules/`)

**Waterfalls and data fetching**
- `async-parallel`: independent Supabase or Planner calls go in `Promise.all`. The event layout and Dashboard already depend on this.
- `async-api-routes`, `async-defer-await`: in route handlers, start promises early and await late or only in the branch that needs them.
- `client-event-listeners`, `client-localstorage-schema`: deduplicate global listeners; version and wrap every `localStorage` value (Create event drafts).

**Bundle**
- `bundle-dynamic-imports`, `bundle-conditional`: lazy-load heavy editors and libraries (`exceljs` is already loaded only when an `.xlsx` is chosen; follow that pattern for agenda, logistics, theme designer and Copilot surfaces).
- `bundle-barrel-imports`: import directly from the file; no barrel `index.ts`.
- `bundle-preload`: preload on hover or focus for likely next screens.

**Re-renders** (the large client pages: agenda, planner-logistics, the event layout)
- `rerender-derived-state-no-effect`: derive during render, not in `useEffect` + `setState`.
- `rerender-functional-setstate`, `rerender-dependencies`, `rerender-move-effect-to-event`.
- `rerender-no-inline-components`: never define components inside components.
- `rerender-transitions`, `rerender-use-deferred-value`, `rendering-usetransition-loading`: keep search and filter input responsive on long lists.
- `rendering-content-visibility`: long lists. Virtualise past about 50 rows.
- `rendering-conditional-render`: use a ternary, not `&&`, with numbers.
- `js-set-map-lookups`, `js-index-maps`: build a `Map` when joining people, sessions or speakers in the client.

**Server safety**
- `server-auth-actions`: if Server Actions are ever introduced, authenticate them exactly like route handlers.
- `server-no-shared-module-state`: no request data in module scope. (A `NextResponse` can't be reused across requests; build it per call.)

**Component architecture** (for the redesign's shared table, inspector and toolbar)
- `architecture-avoid-boolean-props`, `patterns-explicit-variants`: no `isPlanner`/`compact`/`readonly` boolean pile-ups; use explicit variants or composition.
- `architecture-compound-components`, `state-context-interface`, `state-decouple-implementation`, `state-lift-state`: e.g. `<Inspector.Root> <Inspector.Header> <Inspector.Tabs>` with the provider owning state.
- `patterns-children-over-render-props`.
- `react19-no-forwardref`: React 19, so pass `ref` as a prop and use `use()` for context.

## Checks before declaring done

`npm run type-check`, `npm run lint`, `npm test` (vitest; note it doesn't resolve `@/` in re-exports that tests import, so use relative paths there), `npm run build` (needs placeholder Supabase env values). Then `/review`.

## Sources and licences

Rule files in `references/rules/` are verbatim from vercel-labs/agent-skills @1a2c79d (`react-best-practices`, `composition-patterns`; MIT). 31 of the 78 rules were kept: the ones that apply to a client-page + route-handler Next app without RSC data fetching. If the redesign adopts React Server Components, revisit the `server-*` rules in the upstream repo.
