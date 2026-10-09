# Quickstart: Validate Feature 017

## Prerequisites

- Portal running locally (`npm run dev`) against the Portal and Planner projects in `.env.local`.
- Test organization set up as a client: Planner product on, linked to a Planner organization, at
  least one Planner event (create it as the test admin so it is linked).
- Accounts: a platform (Stawi) admin; client admin A (org admin, created the event); client admin
  B (org admin, not on the event); a plain org member; an admin of a *different* organization.
- Never paste passwords or keys into this file or any spec artifact.

## Checks

| # | Who | Do | Expect | Spec |
| --- | --- | --- | --- | --- |
| 1 | Admin B | Planner Overview → Team & Access → Add team member, new email, role Staff, access Viewer | One success summary; person in Team & Access with Planner access; in Organisation People as Member | US1-1, FR-011 |
| 2 | Admin B | Same, email already in the org | No new account; added to event | US1-2, FR-007 |
| 3 | Admin A | Add an existing event attendee as team, role Staff | Role stays Attendee; Planner access on; message says role kept | US1-3, FR-012 |
| 4 | Admin A | Repeat check 1 for the same email | "Already set up"; no duplicate rows (query `event_members`, Planner `event_user_assignments`) | US1-4, SC-004 |
| 5 | Admin A | Add team member on an event with no Planner link | Added to org + event; clear "Planner access not available yet" | US1-5 |
| 6 | Admin A | Email of someone in another organization | Account reused; nothing about the other org shown | FR-008 |
| 7 | Plain member, other-org admin | Call both new routes directly | `403`, nothing written | FR-003, SC-003 |
| 8 | Admin A | Organisation People → Add Person with a new email | Created as Member; no role picker shown | US2-1, FR-004 |
| 9 | Admin A | People spreadsheet import with new, existing, duplicate and `org_role=admin` rows | Per-row results; admin row added as Member with a "limited to member" note | US2-2, US2-3 |
| 10 | Admin B | Bendie event → Add People | "Invite new attendee" and "Import spreadsheet" offered and work | US3, FR-018 |
| 11 | Stawi admin | Existing Stawi flows (create-user with admin role, bulk create) | Unchanged | FR-005, FR-020 |
| 12 | New person | "Forgot password" on the login page, then sign in | Lands in the organization | FR-006 |
| 13 | Admin A | Create a new event | Creation succeeds; Admin A is event admin once; Admin B is on the team as event admin | US4-1, FR-021, FR-023 |
| 14 | Admin B | Open an event Admin A created before release | Opens; full team visible; "Add from organisation" works | US4-4, FR-021 |
| 15 | Stawi admin | Make a member an org admin who is an attendee on one event | They become event admin on every org event (attendee raised to admin) | US4-2, US4-3, FR-022 |
| 16 | Admin A | Via the browser client: insert an org member with role admin; promote a member to admin; change an existing admin to member | All refused, nothing changes | US5-1, US5-2, FR-024, SC-008 |
| 17 | Admin A | Change a member's org role between non-admin roles | Works | US5-3, FR-025 |

## Repo checks

`npm run type-check`, `npm run lint`, `npm run build` must pass (constitution VIII).

## Results

| Date | Check | Result |
| --- | --- | --- |
| 2026-10-09 | T007 migration verification (SQL) | Pass — policies swapped, both triggers present, 0 org owners/admins missing or below admin on any org event, `event_members` 388 → 412 |
| 2026-10-09 | Row 16 (client admin, browser-equivalent anon client as `xperia.test`) | Pass — insert outsider as admin refused (42501); demote another admin: 0 rows; promote self to owner: 0 rows; memberships confirmed unchanged |
| — | Row 16 as Stawi admin, row 17 (member ↔ attendee) | Not yet run — needs a member row to change; to do in the browser pass |
