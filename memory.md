# Memory: Backend catch-up roadmap (Features 023–027), complete

Last updated: 2026-11-19

## What was built

Everything is on one stacked local branch, `027-profiles-lockdown-readiness` (023 → 024 → 025 → 026 → 027). It is **not pushed and not merged**; `main` is unchanged. All five features are browser-verified by the developer, reviewed and converged. Spec Kit artifacts are in `specs/023…` to `specs/027…`.

- **023 Smart spreadsheet import:** `.xlsx` and column matching in `CsvImportModal` (`src/lib/spreadsheetImport.ts`).
- **024 Event time zone:**
  - `events.timezone` is required on Create event and editable on Basics. Dates are venue time.
  - Planner gets a copy of the zone once, at creation (`src/lib/eventTimeZone.ts`, `TimeZoneField.tsx`).
  - Back-fill: all 32 events were set to Africa/Nairobi (developer-approved).
- **025 Contact Organizer and matchmaking:**
  - Info Center has a one-per-event "Show on access screen" toggle, with a confirmed swap.
  - Networking flags select questions that have no options.
- **026 Planner access alignment:**
  - One copy of Planner's `has_event_module`: `src/lib/plannerAccessRulesCore.ts` (pure, tested) and `plannerAccessRules.ts`.
  - New Manage switches for Production and Logistics. Clearer contractor message.
- **027 Profiles lock-down readiness (Bendie C1):** no signed-in-user read of `profiles` email, phone, gender, location, role, `global_role` or `planner_profile_id` remains.
  - `src/lib/callerProfile.ts`: the caller's own row, read with the service role.
  - `src/lib/profileContacts.ts`: contact lookups through the Bendie RPCs.
  - New routes: `api/organizations/[id]/people/contacts` and `people/search`.
  - `src/lib/concurrency.ts` (`runWithConcurrency`, moved out of `csvImport.ts`).

## Decisions made

- Portal writes to Planner send **no** Planner notifications. Contractor, member-type and "all events" administration stays in the Planner app.
- Viewer/Manager presets write **explicit** Production and Logistics manage values. Existing NULLs (Planner reads them as "same as view") were not bulk-rewritten.
- Contacts follow Bendie's `can_view_profile_contact` rule. Viewers who aren't allowed see names only, and the profile editor then locks email and phone.
- "Search existing" in Add person: Stawi admins get a partial email match; client org admins must type the full email.
- No AI column mapping.

## Problems solved

- **Testing against live data safely:** run checks in one `DO` block that ends with `RAISE EXCEPTION`, so everything rolls back. To impersonate a user, `set_config('request.jwt.claims', …)` + `set local role authenticated`. This was used for the 026 equivalence check (1,850/1,850) and the 027 C1 simulation.
- **Vitest doesn't resolve `@/` in re-exports** from modules that tests import. Use relative paths there (e.g. `csvImport.ts` → `./concurrency`).
- **Builds:** they need placeholder Supabase env values just to compile. There are no PowerShell Spec Kit scripts on this Mac, so set `.specify/feature.json` by hand.
- **Planner time zone:** Planner rejects unknown zones with "Unknown timezone …". Provisioning retries without the zone.

## Current state

- All code work in the two backend briefs that was in the approved plan is done and verified.
- Not exercised in the browser, only checked in code: creating a Bendie + Planner event and confirming the zone reaches Planner (024 quickstart #5).
- `docs/bendie-*-backend-changes.md` exist only on this machine (`docs/` is gitignored).

## Next session starts with

1. Push `027-profiles-lockdown-readiness` and open a PR to `main`. Then decide on promoting to `production`, which was already 10 commits behind `main`.
2. Tell the Bendie team the portal is ready for C1, and agree the date.

## Open questions

- Team and data items, not code:
  - Events #7: hide or rename the test event (slug `test`).
  - Events #8: set `app_release_config.latest_version` to 1.0.4 once it's live in both stores.
  - Events #9: keep the store-reviewer account in `stawi-escape-2026`.
- Unbuilt:
  - Events #4: announcement push `data` (app team's edge function).
  - Events #5: optional app-version admin screen.
  - Events #12: walk-ins (needs a product decision).
  - Planner: task notes, slides and blueprints.
- Should the `docs/` briefs move into `context/` so they're versioned?
