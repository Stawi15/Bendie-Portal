# Memory: Backend catch-up roadmap (Features 023–028), complete

Last updated: 2026-11-19

## What was built

Everything is on one stacked local branch, `028-content-moderation` (023 → 024 → 025 → 026 → 027 → 028). It is **not pushed and not merged**; `main` is unchanged. All six features are browser-verified by the developer, reviewed (findings fixed) and converged. Spec Kit artifacts are in `specs/023…` to `specs/028…`.

- **023 Smart spreadsheet import:** `.xlsx` and column matching in `CsvImportModal` (`src/lib/spreadsheetImport.ts`).
- **024 Event time zone:**
  - `events.timezone` is required on Create event and editable on Basics. Dates are venue time.
  - Planner gets a copy of the zone once, at creation.
  - All 32 events were back-filled to Africa/Nairobi.
- **025 Contact Organizer and matchmaking:** a one-per-event "Show on access screen" toggle, and flags for select questions with no options. The fallback support email is now `support@bendie.app`.
- **026 Planner access alignment:** one copy of Planner's `has_event_module` (`plannerAccessRulesCore.ts` / `plannerAccessRules.ts`), plus explicit Production and Logistics manage switches.
- **027 Profiles lock-down readiness (Bendie C1):** no signed-in-user read of hidden `profiles` columns.
  - `src/lib/callerProfile.ts`: the caller's own row, read with the service role.
  - `src/lib/profileContacts.ts`: contacts through the Bendie RPCs.
  - Org routes `people/contacts` and `people/search`.
- **028 Content moderation:**
  - `/portal/admin/moderation` (Stawi admins only; linked in the admin menu) handles `content_reports`, which holds every Report and Block from the app.
    - Pending reports show oldest first with an over-24h flag; a Handled tab shows the rest.
    - Actions: hide/unhide a post or comment, delete a message, remove from chosen events (Planner access switched off too), dismiss, mark reviewed.
  - Code: `src/lib/moderation.ts` (service role), `src/lib/moderationRules.ts` (pure, tested), `src/lib/plannerRemoval.ts` (shared with `deactivate-on-removal`).
  - Gallery loads and writes through `/api/events/[id]/gallery` (`src/lib/galleryServer.ts`), so blocks never hide photos in the Portal.

## Decisions made

- Portal writes to Planner send no Planner notifications. Contractor, member-type and "all events" administration stays in the Planner app.
- Contacts follow Bendie's `can_view_profile_contact` rule. "Search existing" in Add person: Stawi admins get a partial match, client org admins exact email only.
- Moderation:
  - **Profile reports:** the admin picks which events to remove someone from (none pre-ticked). Post and message reports pre-tick the content's event.
  - **Message context:** up to 3 messages before and after.
  - **Reviewer columns:** requested from the backend, not built ourselves.
- Gallery permissions are unchanged: only Stawi admins or the author can hide or delete; only Stawi admins see hidden posts. Writes run as the caller first, so the audit trigger keeps the actor, with the service role as fallback.

## Problems solved

- **Testing against live data safely:** run checks in one `DO` block ending in `RAISE EXCEPTION`, so everything rolls back. Impersonate with `set_config('request.jwt.claims', …)` + `set local role authenticated`. Used for the 026 equivalence check (1,850/1,850) and the 027 C1 simulation.
- **Bendie's block policies** (restrictive SELECT on `posts`, `post_comments`, `messages`) also apply to UPDATE/DELETE with a WHERE clause. Any "see everything" screen needs the service role.
- **Vitest doesn't resolve `@/`** in re-exports that tests import. Use relative paths there.
- **A `NextResponse` can't be shared across requests** (its body is consumed once). Build it per call.
- **Builds** need placeholder Supabase env values just to compile. There are no PowerShell Spec Kit scripts on this Mac, so set `.specify/feature.json` by hand.

## Current state

- Final check on `028-content-moderation` (2026-11-19): `tsc` clean, lint 0 errors, 79/79 tests, the build passes, no user-key hidden-column reads, and no secrets in tracked files. The working tree is clean.
- 028 browser pass: when the review started, the working copy was on the 027 branch. The developer was asked to repeat 28.1–28.12 on 028 if the Moderation menu item wasn't visible during the pass, plus 28.4–28.7 and 28.13–28.14 after the review fixes.
- Live: 4 pending `content_reports`, which look like test data. `app_release_config` is still `1.0.2` on both rows.

## Next session starts with

1. Push `028-content-moderation` and open a PR to `main`. Then decide on promoting to `production`, which was already 10 commits behind `main`.
2. Send `specs/028-content-moderation/backend-request.md` to the Bendie team (`reviewed_by`, `reviewed_at`, `action_note`; optional `event_id`).
3. Tell the Bendie team the portal is ready for C1, and agree the date.

## Open questions

- Which version goes into `app_release_config`: the first brief said 1.0.4, the latest says iOS 3.2.5. Confirm with the app team.
- Unbuilt:
  - Events #4: push `data` (app team).
  - Events #5: app-version admin screen.
  - Events #11: automated-reminder labels.
  - Events #12: walk-ins (needs a product decision; removal isn't a ban until then).
  - Planner: task notes, slides and blueprints.
- Should the `docs/` briefs move into `context/` so they're versioned? `docs/` is gitignored.
