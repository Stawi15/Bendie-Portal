# Implementation Plan: Contact Organizer Toggle and Matchmaking Checks

**Branch**: `025-contact-organizer-and-matchmaking` (stacked on 024) | **Date**: 2026-11-17 | **Spec**: [spec.md](spec.md)

## Summary

Two page-local changes, with no migration and no route:
- `info-center/page.tsx` gains the access-screen toggle, its warning, the one-per-event swap, the list badge and the "none set" note.
- `networking/page.tsx` gains "hidden from attendees" flags, a last-option delete confirmation, a CSV `previewWarnings` hook (the Feature 021 option, reused), and a key-permanence hint.

## Technical Context

- **Stack**: TypeScript, React 18, Next 14. Page-owned Supabase calls (the existing pattern on both pages).
- **Storage**: `support_contacts.show_on_access_screen` already exists live per the brief. `types/database.ts` gets the field by hand.
- **Testing**: type-check, lint, build, the browser pass. No pure logic big enough to unit-test beyond a tiny helper.

## Constitution Check

| Principle | Result | Notes |
|---|---|---|
| I. Brownfield | PASS | Extends the existing forms and lists. Reuses `useConfirm`, `friendlyError`, `CsvImportModal.previewWarnings`. |
| II. Architecture | PASS | Page-owned writes under the existing RLS. No service role. |
| III. DB safety | PASS (gated) | No migration. Types are updated by hand. Live column and index check before merge (with 024's T001). |
| IV. Security | PASS | The feature *publishes* contact details by design. FR-002's warning and FR-003 keep that deliberate. Nothing is ticked by default. |
| V. UI | PASS | Tokens only. Badges use `bg-primary/10 text-primary`; warnings use the tertiary token box. |
| VI. Scope | PASS | Only brief items 6 and 10. |
| VII. Docs | PASS (planned) | `schema-reference.md` changelog, `progress-tracker.md`. |
| VIII. Verification | PASS (planned) | Checks plus the browser pass. Loading, error and empty states already exist on both pages. |

## Design

1. **Swap (FR-004)**:
   1. Ticking B while A is ticked: confirm.
   2. `update A set show_on_access_screen=false`.
   3. Save B with `true`.
   4. If step 3 fails: `update A set true` (best effort), and toast.
   5. A `23505` from step 3: toast "Another contact is already on the access screen", then reload (FR-005).
2. **Hidden flag (FR-007)**: computed from the existing `groups` (select type with no `option_key` rows).
3. **CSV (FR-009)**: `previewWarnings(validRows)` merges the file's option rows with the existing `options`, per `question_key`.

## Complexity Tracking

Empty.
