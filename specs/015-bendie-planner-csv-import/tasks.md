# Feature 015 Tasks: Bendie Portal Bulk CSV Import

Lightweight checklist per the rapid-implementation workflow. Revised after a mid-implementation architecture pivot (see spec.md/plan.md) — the original T01/T02 (new `csvParse.ts`/`CsvImportModal.tsx`) and the six new `/import` API routes were abandoned in favor of reusing the existing `src/lib/csvImport.ts` + `src/components/portal/CsvImportModal.tsx` framework. Task list below reflects what was actually built.

## Shared infrastructure (pre-existing, reused, not modified)

- [x] T01 Confirmed `src/lib/csvImport.ts` already provides `parseCsvFile`/`validateHeaders`/`getField`/`buildCsvTemplate`/`parseFlexibleDate`/`runWithConcurrency` — no changes needed.
- [x] T02 Confirmed `src/components/portal/CsvImportModal.tsx` already provides the generic `<CsvImportModal<T>>` staged-import UI — no changes needed. (Recovered via `git checkout` after an accidental overwrite during initial implementation; `npm run type-check` confirmed a clean restore.)

## People import

- [x] T03 `planner-people/page.tsx`: `PersonCsvRow`/`PEOPLE_CSV_COLUMNS`/`PEOPLE_CSV_SAMPLES`, `parseRow` (requires `fullName`, rejects email already in this event's roster).
- [x] T04 `planner-people/page.tsx`: `importPersonRow` — searches `GET .../planner-people/search?q=<email>` for an exact match; links via `POST .../planner-people/link` if found, else creates via `POST .../planner-people`. No new server code.
- [x] T05 `planner-people/page.tsx`: "Import CSV" button + `<CsvImportModal<PersonCsvRow>>`, gated on `capability.canManage`.

## Flights import

- [x] T06 `planner-logistics/page.tsx`: `resolveParticipantForCsv` (email-preferred, exact-name fallback, ambiguous/not-found handling) against the already-loaded roster; `PlannerFlightModal.tsx`'s `ParticipantOption` extended with optional `email`.
- [x] T07 `planner-logistics/page.tsx`: `FlightCsvRow`/`FLIGHT_CSV_COLUMNS`, `parseFlightCsvRow` (participant resolution, `flightType`/`flightDate` required, duplicate-tuple rejection).
- [x] T08 `planner-logistics/page.tsx`: `importFlightRow` — POSTs to the existing `.../planner-logistics/flights`. No new server code.
- [x] T09 "Import CSV" button (Flights sub-tab) + `<CsvImportModal<FlightCsvRow>>`, gated on `capability.canManage`.

## Hotels import

- [x] T10 `planner-logistics/page.tsx`: `HotelCsvRow`/`HOTEL_CSV_COLUMNS`, `parseHotelCsvRow` (participant resolution, numeric field validation, duplicate-tuple rejection).
- [x] T11 `planner-logistics/page.tsx`: `importHotelRow` — converts CSV strings to numbers/booleans, POSTs to the existing `.../planner-logistics/hotels`. No new server code.
- [x] T12 "Import CSV" button (Hotels sub-tab) + `<CsvImportModal<HotelCsvRow>>`, gated on `capability.canManage`.

## Vendors import

- [x] T13 `planner-vendors/page.tsx`: `VendorCsvRow`/`VENDOR_CSV_COLUMNS`, `parseVendorCsvRow` (`description` required, `sortOrder` numeric).
- [x] T14 `planner-vendors/page.tsx`: `importVendorRow` — POSTs to the existing `.../planner-vendors`. No new server code.
- [x] T15 "Import CSV" button + `<CsvImportModal<VendorCsvRow>>`, gated on `capability.canManage`.

## Checklist import

- [x] T16 `planner-checklist/page.tsx`: `ChecklistCsvRow`/`CHECKLIST_CSV_COLUMNS`, `parseChecklistCsvRow` (`itemName` required, `ownerName` resolved against `eligibleOwners`, unmatched → `null` for server default).
- [x] T17 `planner-checklist/page.tsx`: `importChecklistRow` — POSTs to the existing `.../planner-checklist`. No new server code.
- [x] T18 "Import CSV" button + `<CsvImportModal<ChecklistCsvRow>>`, gated on `capability.canManage`.

## Production import

- [x] T19 `planner-production/page.tsx`: `ProductionCsvRow`/`PRODUCTION_CSV_COLUMNS`, `parseProductionCsvRow` (`sessionTitle`/`sessionDate` required, timing-order + 5-value status-enum validation).
- [x] T20 `planner-production/page.tsx`: `importProductionRow` — POSTs to the existing `.../planner-production` with `isParallel: false, parentProductionId: null` always. No new server code.
- [x] T21 "Import CSV" button + `<CsvImportModal<ProductionCsvRow>>`, gated on `capability.canManage`.

## Quality gate

- [x] T22 `npm run type-check` clean (also confirmed this cleared the CsvImportModal-overwrite fallout in Agenda/Facilitators/FAQs/Members/Networking/People pages).
- [x] T23 `npm run lint` clean (only pre-existing unrelated warnings: `no-explicit-any`, `react-hooks/exhaustive-deps`, `no-img-element`, `no-page-custom-font`).
- [ ] T24 Production build — deferred; the shared dev server has been continuously active across this session and a concurrent build against the same `.next` directory is unsafe, per established precedent from prior features.

## Live verification — general (synthetic fixtures only, via direct HTTP calls replicating each importRow's payload shape)

- [x] T25 CSV parsing edge cases (quoted commas, escaped quotes, blank rows, CRLF/BOM) — not re-tested from scratch; treated as already-proven by `csvImport.ts`'s existing use across 6 other Portal pages, consistent with precedent from prior features for shared, unmodified infrastructure.
- [x] T26 Viewer (Manage-denied) caller's request rejected server-side (403) for all six domains — verified directly against each domain's underlying endpoint (`vendor_access_denied`, `checklist_access_denied`, `logistics_manage_denied`, `production_manage_denied`, `people_manage_denied`).
- [x] T27 Cross-event/nonexistent participant reference rejected — verified (`participant_not_found` / 400) against Flights' endpoint with a bogus `passengerId`.
- [ ] T28 Browser-driven walkthrough of the "Import CSV" button → file picker → preview → result-summary UI in each of the six pages — deferred; this session verified the underlying `parseRow`/`importRow` logic and endpoints directly via HTTP, not through an actual browser file upload.

## Live verification — per domain

- [x] T29 People: `importPersonRow`'s create branch verified (new participant, `POST .../planner-people`); search-then-link branch verified (existing global passenger by email found via `GET .../search`, linked via `POST .../link` rather than duplicated).
- [x] T30 Flights: `importFlightRow` payload verified against `POST .../planner-logistics/flights`; row visible in `all_flights_combined_table`.
- [x] T31 Hotels: `importHotelRow` payload verified for both `accommodationRequired=true` (fields populated) and `accommodationRequired=false` (hotel/room fields nulled server-side, confirmed in the response body).
- [x] T32 Vendors: `importVendorRow` payload verified against `POST .../planner-vendors` (required a Planner-identity + `can_manage_vendors` fixture, since Feature 009's capability model has no admin-bypass-without-identity, unlike Flights/Hotels/Production).
- [x] T33 Checklist: `importChecklistRow` payload verified; an omitted/unmatched owner correctly defaulted to the importing manager's own profile server-side (zero null-owner rows possible).
- [x] T34 Production: `importProductionRow` payload verified against `POST .../planner-production`; the created row confirmed visible through `production_sessions_v` (not just the base `production_tasks` table) via direct SQL.

## Regression

- [x] T35 Existing manual create forms for all six modules confirmed unmodified — CSV import reuses their exact endpoints rather than adding parallel logic; no route or lib file for Vendors/Checklist/Flights/Hotels/Production/People's create path was changed by this feature.
- [x] T36 Capability resolution unaffected — same routes, same 8-step authorization sequence, same 403 error codes observed as in Features 009–014's own verification.

## Cleanup & close-out

- [x] T37 All synthetic imported records (1 flight, 2 hotel bookings, 1 vendor item, 1 checklist item, 1 production session, 2 global passengers + event links) deleted from the Planner project; all 4 disposable auth identities (2 Portal, 2 Planner) and their supporting rows (`organization_members`, `event_members`, `event_user_assignments`, `profiles`) deleted from both projects; confirmed via live-DB row-count=0 queries on every table touched.
- [x] T38 Retained long-lived fixtures (`f005-creator-1789552424@bendie-test.invalid`, `f007-viewself-test@bendie-test.invalid`) independently re-confirmed present/untouched (count=2) after cleanup.
- [x] T39 Do not start Blueprints or Agenda; do not converge any feature — stopping per instructions.
