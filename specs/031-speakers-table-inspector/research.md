# Research: 031 Speakers Table and Inspector Pilot

Checked against `redesign` @ `1426691` and the Bendie test database on 2026-11-24.

## R1: Who reads and writes speakers today

| Caller | Operation |
|---|---|
| `facilitators/page.tsx` | select (13 columns, `display_order`), insert, update, delete, CSV/XLSX import insert |
| `members/page.tsx` `makeFacilitator` | select existing by `(event_id, user_id)`, insert (claimed, from profile), then `event_members.role = 'facilitator'` |
| `agenda/page.tsx`, `OrganizationHome.tsx`, `api/admin/planner-push-agenda` | read only |

- **Decision:** `speakers.ts` owns every operation used by the Speakers page and by `makeFacilitator`'s speaker part (the existence check and the insert). The `event_members` role update stays on Attendees: that's member logic, not speaker logic.
- **Why only these callers:** the read-only callers select different column sets for their own views. Moving them adds risk without a second writer. They can move when they're migrated.
- **Behaviour to preserve exactly:**
  - Insert from the page uses `display_order = current count`.
  - Import uses `count + rowIndex`.
  - Insert from Attendees sets no `display_order`.
  - Empty strings become `null`; `role_type` defaults to `speaker`.

## R2: Validation without zod

- **Finding:** doc 21 says "`react-hook-form` + `zod` (installed, unused)". In fact only `react-hook-form` 7.82.0 and `@hookform/resolvers` 3.10.0 are installed. `npm ls zod` is empty.
- **Decision:** don't add zod. `speakers.ts` exports `validateSpeaker(input) → { full_name?, email? }` with today's exact messages. A 15-line resolver (`components/form/zodlessResolver.ts`) adapts any `validate(values) → errors` function to react-hook-form. The v1 page's inline checks call the same function, so the messages live in one place.
- **Rationale:** two rules don't justify a dependency, and the rules must be callable outside a form (import, future AI tools).
- **Revisit:** add zod when a form needs nested or async schemas (Agenda may).

## R3: Table library

- **Decision:** `@tanstack/react-table@9.3.1`, pinned exact. It's headless, so the styling stays ours. It provides sorting, column visibility and row models, and is the base for Agenda and the large Planner tables.
- **Filtering and search:** done by our pure functions (`applyFilters`, `matchesSearch`) before the data reaches the table, so the rules are unit-tested and reusable. The table owns only sort state and the row model.
- **Install check:** after `npm install --save-exact`, confirm the lockfile resolves 9.3.1 and the build passes. If v9's API differs from the v8 examples used in docs, follow the installed version's types.

## R4: Inspector host (change to the 030 right panel)

- **Finding:** 030's `useRegisterRightPanelContent(id, {title, render})` stores `render` in a ref when the content is registered. The slot re-renders only on open or close, so a form inside it wouldn't update as you type. The slot also shows only at ≥1280 px (`hidden shellwide:flex`).
- **Decision:** add `<RightPanel.Portal open title onClose>{children}</RightPanel.Portal>`:
  - The children are rendered with `createPortal` into the slot's host element, so they stay in the page's React tree with live state, contexts and DirtyGuard.
  - **≥1280 px:** the slot docks beside the canvas, as in 030.
  - **Below 1280 px:** the same host renders as a fixed sheet from the right. It's `role="dialog"` and `aria-modal`, traps focus, closes with Escape or the close button, has a scrim, and returns focus to the invoker. It reuses the drawer's focus-trap logic from `AppShell`, extracted to `src/components/shell/focusTrap.ts`.
  - **Reduced motion:** no slide.
- **Compatibility:** the registration API stays. It has no callers, so this is additive (shell contract updated).

## R5: Unsaved-changes guard

The App Router has no way to block navigation, so the guard covers every exit itself:

| Way of leaving | Mechanism |
|---|---|
| In-app `<a>` click (sidebar, breadcrumbs, Previous/Next, links in the page) | A document click listener in the **capture** phase. Same-origin, left-click, no modifier, not `target=_blank`, a different URL → `preventDefault`, ask, then `router.push(href)` if confirmed |
| Browser Back/Forward | `popstate`: when dirty and the new URL drops or changes `?speaker=`, ask. If the user keeps editing, `router.push` the previous URL back |
| Programmatic navigation in the shell (event search, Logout) | `useNavigationGuard()` returns `confirmLeave(): Promise<boolean>`, which resolves `true` immediately when no guard is active. `useHeaderModel.goToEvent` and `handleLogout` await it |
| Reload or tab close | `beforeunload`, only while dirty |
| Inspector close, row switch, Escape, "Add speaker" | The inspector calls `confirmLeave()` before acting |

- **The prompt:** the existing `useConfirm()` dialog with title "Discard changes?", confirm "Discard" (destructive) and cancel "Keep editing".
- **Dirty means** react-hook-form's `formState.isDirty`, excluding a save in progress. After a successful save the form resets, so it's no longer dirty.

## R6: URL state

- `?speaker=<uuid>` opens that speaker, and `?speaker=new` opens the add form.
- Opening a row uses `router.push` (so Back closes it). Closing uses `router.push` without the parameter, or `router.back()` when the previous entry is the same page without a speaker.
- Other parameters, such as `?product=`, are kept.
- An unknown id means the list renders, a toast reads "That speaker couldn't be found.", and the parameter is removed with `router.replace`.
- v1 ignores the parameter.

## R7: Sessions list

- **Finding:** the Agenda page treats a speaker as on a session if `agenda_sessions.facilitator_id = speaker` **or** an `agenda_session_speakers` row links them (`agenda/page.tsx` lines 50–56).
- **Access:** event members can read both, under RLS (`agenda_session_speakers_select_event_member`; `agenda_sessions` is read by Agenda for the same roles).
- **Decision:** `listSpeakerSessions(client, eventId, speakerId)` runs two selects in parallel and merges and de-duplicates by session id, sorted by `starts_at`. A third parallel read gets `events.timezone`. The inspector shows the title plus day and time in the event's time zone (Feature 024), formatted with `Intl.DateTimeFormat`. Any error shows "Sessions aren't available", and the rest of the inspector keeps working.
- **Out of scope:** breakout room leads (`agenda_breakout_rooms.facilitator_id`).

## R8: Responsive and accessibility

- **Table at ≥768 px:**
  - semantic `<table>` and `<th scope="col">`;
  - sortable headers are buttons with `aria-sort`;
  - a row opens on click or on Enter/Space while the row link, the name cell's button, is focused;
  - one tab stop per row.
- **Below 768 px:** the same data renders as a `<ul>` of row buttons. There's no sideways scroll, and the toolbar wraps with search full width.
- **Live region:** announces "N speakers shown", sort changes and save results. Toasts already announce saves.
- **Focus:** the 029 global ring, with `.focus-ring` on custom controls. The inspector sits inside `[data-shell-chrome]`, so it gets the scoped 030 ring.

## R9: Verification approach

- **v1:** the walk-through (`STUDIO_SHELL=v1`) compared with a same-day reference of `redesign@1426691` gives SC-002. Speakers and Attendees screenshots should differ by data only.
- **v2:** the walk-through gives access parity. A dedicated parity script (quickstart) covers each capability and every way of leaving while dirty.
- **Unit tests:** `speakers.ts` rules and payloads, including that the Attendees payload is identical to today's.
