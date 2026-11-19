# Tasks: Contact Organizer Toggle and Matchmaking Checks

- [X] T001 Confirm live: `support_contacts.show_on_access_screen` (boolean, not null, default false) and the index `support_contacts_one_access_contact_per_event` (developer, SQL in `specs/024-event-timezone/research.md`'s gate plus this one). Gates the merge, not the coding.
- [X] T002 [P] Add `show_on_access_screen: boolean` to the `support_contacts` Row in `src/types/database.ts`.
- [X] T003 [US1] `src/app/portal/events/[eventId]/info-center/page.tsx`:
  - select `show_on_access_screen`;
  - add `show_on_access_screen` to `Contact` and `ContactForm`, defaulting to false;
  - add the checkbox to the form, with the token-styled public warning shown when ticked (FR-001, FR-002);
  - validate that a ticked contact has a phone or an email (FR-003);
  - implement the confirm-swap-rollback save (FR-004) and the `23505` handling (FR-005);
  - show a "Shown on access screen" badge in the list and the "none set" note above the groups (FR-006).
- [X] T004 [US2] `src/app/portal/events/[eventId]/networking/page.tsx`:
  - a "Hidden from attendees" badge, and replacement empty-options text, for select questions with no options (FR-007);
  - a confirmation when deleting a select question's last option (FR-008);
  - `previewWarnings` on the `CsvImportModal`, counting existing and file options per select question (FR-009);
  - a hint under the add-question Key field (FR-010).
- [X] T005 Run `npx tsc --noEmit`, `npm run lint`, `npm test`, and the placeholder-env `npm run build`.
- [X] T006 Update docs: a `context/schema-reference.md` changelog entry and a `context/progress-tracker.md` entry.
- [X] T007 Browser pass (developer): spec US1 #1–6, US2 #1–4.
- [X] T008 Run `/review`, then converge.

## Verification note

**2026-11-17:** `tsc` and lint exit 0 (no new warnings; the two pages' existing `fetchData` hook warnings are unchanged), `npm test` 60/60, and the placeholder-env build passes. Still open: T001 (live column and index check), T007 (browser pass) and T008.

- **T001, live verification: PASS (2026-11-17, via the Supabase MCP, read-only):**
  - `support_contacts.show_on_access_screen` is `boolean NOT NULL DEFAULT false`;
  - the index is `CREATE UNIQUE INDEX support_contacts_one_access_contact_per_event ON public.support_contacts (event_id) WHERE show_on_access_screen`;
  - 11 contacts are ticked, and no event has more than one.

## Review (2026-11-19)

`/review` found 1 minor issue, now fixed: in a Contact Organizer swap, a save skipped by a permission rule (zero rows, no error) could leave the event with no access contact and a success message. Both the untick and the save now count rows, and a skipped save restores the previous contact. Converge remains to be run after the browser pass.

## Browser pass and converge (2026-11-19)

Developer browser pass: all steps pass (US1 #1, #2, #3, #5, #6; US2 #1, #2, #4). Checked in code only: US1 #4 (cancelling the replacement) and US2 #3 (spreadsheet preview warning, `previewWarnings={networkingPreviewWarnings}`). `/speckit.converge`: converged, all FR-001–FR-010 present, no tasks appended.
