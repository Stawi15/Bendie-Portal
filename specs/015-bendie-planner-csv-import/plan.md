# Feature 015 Plan: Bendie Portal Bulk CSV Import

**Revised mid-implementation.** The plan below describes what was actually shipped. The original plan (a new `csvParse.ts`, a new `CsvImportModal.tsx`, six new atomic-bulk-insert `/import` API routes, and new bulk-insert functions in every lib file) was abandoned after discovering that `src/lib/csvImport.ts` + `src/components/portal/CsvImportModal.tsx` already existed in the codebase and were already used by 6 other Portal pages (Agenda, Facilitators, FAQs, Members, Networking, People). Recreating that infrastructure would have violated AGENTS.md's brownfield mandate against parallel architectures. See spec.md's "Architecture (as implemented)" section for the full rationale.

**Process note**: `src/components/portal/CsvImportModal.tsx` was briefly overwritten by mistake during initial implementation (before its prior existence was discovered), breaking the 6 pre-existing pages that depended on it. It was restored via `git checkout -- <path>` before any further work; `npm run type-check` confirmed a clean restore and that the errors surfaced in those 6 unrelated pages were entirely a side effect of the overwrite, not pre-existing bugs.

## Shared Infrastructure (pre-existing, unchanged, reused as-is)

- `src/lib/csvImport.ts`: `parseCsvFile` (papaparse), `validateHeaders`, `getField`, `buildCsvTemplate`/`downloadCsvTemplate`, `parseFlexibleDate`, `runWithConcurrency`.
- `src/components/portal/CsvImportModal.tsx`: generic `<CsvImportModal<T> open, onClose, onImported, title, templateFilename, columns, sampleRows, parseRow, importRow, beforeImport? />`. Internal steps `pick → preview → result`. Imports via `runWithConcurrency(validRows, 5, importRow, onWorkerError)` — non-atomic, concurrency 5, partial-success reporting. Neither file was modified for this feature.

## Domain Wiring (added to each existing page — no new lib functions, no new API routes)

Each domain gets: a `ColumnSpec[]` template definition, a `parseRow` function (client-side validation, closing over already-loaded page state for participant/roster/owner lookups), an `importRow` function (POSTs to the **existing** single-create/link endpoint for that domain), and a "Import CSV" button + `<CsvImportModal<T>>` wired into the page's existing header, gated on `capability.canManage`.

- **`planner-people/page.tsx`**: `parseRow` requires `fullName`, rejects rows whose email matches a participant already in the event (against already-loaded roster). `importRow` calls `GET .../planner-people/search?q=<email>` for an exact-match check, then either `POST .../planner-people/link` (match found) or `POST .../planner-people` (no match, create).
- **`planner-logistics/page.tsx`** (Flights sub-tab): `resolveParticipantForCsv` (email-preferred, exact-name-fallback, 0/2+ matches → not_found/ambiguous) against the already-loaded roster. `parseRow` validates `flightType`/`flightDate`, rejects an existing-tuple duplicate. `importRow` POSTs to `.../planner-logistics/flights`. `ParticipantOption` (in `PlannerFlightModal.tsx`) extended with an optional `email` field (additive, non-breaking) so the roster carries what's needed for matching.
- **`planner-logistics/page.tsx`** (Hotels sub-tab): same participant resolution; `parseRow` validates `roomNumber`/`nightsCount` numeric, rejects an existing-tuple duplicate; `importRow` converts CSV strings to numbers/booleans and POSTs to `.../planner-logistics/hotels`.
- **`planner-vendors/page.tsx`**: `parseRow` requires `description`, validates `sortOrder` numeric. `importRow` POSTs to `.../planner-vendors`.
- **`planner-checklist/page.tsx`**: `parseRow` requires `itemName`, resolves `ownerName` against the already-loaded `eligibleOwners` list (exact case-insensitive match; 0/2+ matches leaves `ownerProfileId: null`, letting the server apply its own existing default-to-importing-manager rule). `importRow` POSTs to `.../planner-checklist`.
- **`planner-production/page.tsx`**: `parseRow` requires `sessionTitle`/`sessionDate`, validates `startTime < endTime` when both given and `status` against the real 5-value enum. `importRow` POSTs to `.../planner-production` with `isParallel: false, parentProductionId: null` always.

## API Routes

**None added.** Every domain's CSV import reuses its existing single-create (or, for People, search+link/create) endpoint verbatim — the same endpoint the manual "Add" form already calls. This is the direct consequence of the pivot: since the write path is unchanged, server-side authorization, event-scoping, and validation are unchanged and already proven by Features 009–014's own verification.

## UI Changes

Each of the six pages received: a `csvModalOpen` state variable, and the header button row changed from a single `btn-primary` "Add" button to a `flex gap-2` div containing a `btn-secondary` "Import CSV" button (Logistics: shown only for the Flights/Hotels sub-tabs, not Ground Transport) next to the existing `btn-primary` "Add" button, both gated on `capability.canManage`.

## Verification Strategy

Synthetic fixtures only, via direct HTTP calls replicating each `importRow` function's exact payload shape against the running dev server (not a browser UI walkthrough — deferred, see final report). Because import is row-by-row against existing endpoints, verification is a direct re-confirmation that those endpoints behave exactly as Features 009–014 already proved (authorization, event-scoping, field-clearing, canonical visibility), plus new coverage of the People search-then-link-or-create branch, participant/owner resolution logic, and the six domains' respective duplicate/validation rules.

## Security Considerations

- No new authorization surface: every import POST hits the same route, same 8-step authorization sequence, same Manage-capability gate as the existing manual-create path for that domain.
- No new event-scoping logic: the existing endpoints' own Portal-`eventId`-to-Planner-`event_id` resolution and cross-event/participant-scope rejection apply unchanged.
- Client-side `parseRow` validation (participant matching, duplicate checks, required fields) is UX-only; the authoritative check remains each existing endpoint's own server-side validation, unchanged by this feature.
