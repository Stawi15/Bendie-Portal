# Memory — Context Restructure & Mobile-Parity Build

Last updated: 2026-08-19

## What was built

**Context folder restructure** (`context/`, formerly `docs/`):
- Rewrote all 9 files AGENT.md's reading list expects — `project-overview.md`, `architecture.md`, `ui-tokens.md`, `ui-rules.md`, `ui-registry.md`, `code-standards.md`, `library-docs.md`, `build-plan.md`, `progress-tracker.md` — with real, verified facts pulled from the actual codebase (not the older, stale planning docs).
- Renamed `CURRENT_HOME.md` → `schema-reference.md` (the living, changelog-driven mobile-app field reference — most authoritative doc in the repo).
- Removed as redundant/superseded: `ALIGNMENT_MAP.md`, `IMPLEMENATION.md` (empty), `SCOPE.md`, `BLUEPRINT.md`, `UPDATE.md` (folded into `code-standards.md`), `DATABASE_SCHEMA.md`/`NEW_UI.md` (superseded by live Supabase MCP access and captured component patterns), and 5 JobPilot mockup images that had leaked into `context/designs/`.
- Removed the `context2/` reference folder (a different app's skill template) after confirming every one of its 9 files shaped the structure of our 9.
- Cleaned up `AGENT.md`: removed a stale "modified Next.js" banner that pointed at a nonexistent doc path.

**Mobile-parity gap analysis**: compared `schema-reference.md` (mobile app's schema/behavior doc) against the actual portal source code, file by file. Found the portal — despite having all 16 original `EVENT_SECTIONS` tabs — has fallen behind newer mobile-side schema. Full gap list written into `build-plan.md` Phases 5–14 and `progress-tracker.md`.

**Phase 5 (Quick Correctness Fixes) — shipped:**
- `games/page.tsx`: `type` field changed from free-text to a `<select>` constrained to `jeopardy`/`kmky` (verified live via `supabase` MCP — matches the real `game_type` enum).
- `facilitators/page.tsx`: added `role_type` (Speaker/Presenter select) and `linkedin_url` to both the manual form and the CSV import path (columns, sample rows, row validation).
- `basics/page.tsx`: added a checkbox grid for `disabled_menu_items`, exactly matching the live DB `CHECK` constraint's 8 allowed keys.
- `types/database.ts` updated to match: added `events.disabled_menu_items`, `facilitators.role_type`/`linkedin_url`; narrowed `GameType` from `string` to `'jeopardy' | 'kmky'`.
- `ui-registry.md` updated with a new "Checkbox group for a `text[]` field" pattern entry.
- `npm run type-check` and `npm run lint` both clean.

## Decisions made

- **Live-verify before building**: for every phase touching a table, cross-check `schema-reference.md` against the live Supabase schema via the `supabase` MCP (columns, CHECK constraints, RLS policies, function defs) before writing code — not just trust the doc. This found a real, undocumented RLS gap (see Open Questions).
- **AGENT.md compliance**: must actually follow AGENT.md's 9-file read order and its "update `ui-registry.md` after every feature" rule as explicit steps per phase — this was missed once (Phase 5) and corrected retroactively; don't skip it going forward.
- Kept `context2/` deletion and the JobPilot-image cleanup — user confirmed context2 was fully mined into the 9 files first.

## Problems solved

- `types/database.ts` (hand-maintained, not generated) had drifted from the live schema — three fields were missing entirely. Fixed as part of Phase 5 since it was directly relevant.

## Current state

- Phases 1–5 of `build-plan.md` are complete and verified against the live DB.
- Phase 6 (Agenda: multi-speaker assignment via `agenda_session_speakers` + `breakout_rooms` jsonb editor) is next, not yet started.
- Phase 7 (Members: Access Codes) is **blocked** — `event_user_access_codes` has no `portal_is_global_admin()` RLS bypass (confirmed live), so a global admin can issue a code via the `issue_event_access_code` RPC but cannot list/view existing codes for an event they aren't personally an `event_members` row on. Needs a backend fix (new RLS policy or a `SECURITY DEFINER` listing RPC) before it can be built. Full detail in `build-plan.md` Phase 7.
- Phase 9 (Gallery/`event_photos` reconciliation) is blocked on a product decision, not code — see Open Questions.
- No browser/UI verification has been done this session (no browser tool available) — Phase 5's changes are type-checked and linted but not click-tested against a live event.

## Next session starts with

Phase 6 — Agenda multi-speaker assignment (`agenda_session_speakers`) and `breakout_rooms` editor, per `build-plan.md`. Before writing code: re-verify the relevant schema/RLS live via the `supabase` MCP (per the decision above), and follow AGENT.md's read order + update `ui-registry.md` as part of finishing the phase, not after being reminded.

## Open questions

- **Phase 7 blocker**: does the team want a new RLS SELECT policy on `event_user_access_codes` (matching every sibling table's `portal_is_global_admin()` convention), or a `SECURITY DEFINER` listing RPC? Either resolves it; needs a decision before Phase 7 can be built.
- **Phase 9 (Gallery)**: is attendee social-feed moderation (`posts`/`post_likes`/`post_comments`) intentionally in scope for this portal despite `schema-reference.md` listing it as out of scope? Does `event_photos` (the actual documented photo-gallery table) still need its own page?
- MFA/TOTP enforcement, Networking Questionnaire drag-to-reorder, `ComingSoonPanel.tsx` fate, and test coverage remain open (Phase 15 — unrelated to the mobile-parity work, tracked separately in `progress-tracker.md`).
