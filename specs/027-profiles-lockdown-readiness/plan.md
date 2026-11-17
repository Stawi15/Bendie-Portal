# Implementation Plan: Profiles Lock-down Readiness (C1)

**Branch**: `027-profiles-lockdown-readiness` (stacked on 026) | **Date**: 2026-11-17 | **Spec**: [spec.md](spec.md)

## Summary

Each `profiles` read that uses a signed-in user's key and touches a hidden column gets replaced with something that works today and after C1. No migration is needed: every Bendie function used here is already live.

| Read today | Replacement |
|---|---|
| Own `global_role`: middleware, `portalAuth`, `eventAuth`, `orgProductsAdminServer` | `rpc('portal_is_global_admin')` |
| Own `global_role, current_organization_id, planner_profile_id` in about 40 server routes, plus `resolveCallerPlannerIdentity` in 6 libs | **`src/lib/callerProfile.ts`** (server-only): a service-role read of the verified caller's own row. It returns the same `{ data }` shape, so each call site is a one-line change |
| `AuthContext` `select('*')` | Explicit public columns, plus `portal_is_global_admin()`. Own email/phone come from `get_profile_contact(own id)`, falling back to `auth.user.email` |
| Event-scoped lists with email/phone (members, attendee travel, gallery, Planner people, breakouts, team access, participant picker, event activity) | Embed public columns only. Contacts come from **`get_event_member_contacts(event)`**, one call per event |
| Organisation lists (People, team members, org candidates, team preview, participant picker from the organisation) | Embed public columns only. Contacts and roles come from new **`GET /api/organizations/[id]/people/contacts`**: caller is a Stawi admin or org owner/admin, then a service-role read of that organisation's members. Owner/admin is exactly the `is_organization_admin` clause of `can_view_profile_contact`. `globalRoles` is returned only to Stawi admins |
| Activity logs (org, event, home, recent activity) and admin organisation actors | Embed `full_name, avatar_url` only. Email comes from batched `get_profile_contact` (one call per distinct actor on the page, at most 6 at a time) |
| People-page Stawi import email lookup | `bulk-create-users` resolves existing accounts with `ensureAccountByEmail` (service role). The browser lookup is removed |
| Add person, "Search existing" (`ilike` on email) | New **`GET /api/organizations/[id]/people/search?q=`**: partial match for Stawi admins, exact match for org owners/admins, otherwise 403 |
| `planner-pull-travel` member emails (user key) | `get_event_member_contacts` (the route is Stawi-admin only and event-scoped) |

New shared code:
- **`src/lib/callerProfile.ts`**: `readCallerProfile(userId)`.
- **`src/lib/profileContacts.ts`**: `eventMemberContacts`, `profileContacts`, `organizationPeopleContacts`. Each returns a `Map<userId, {email, phone}>`, and an empty map when not allowed or on error (logged).

Kept as they are:
- `people/page.tsx` `update({ global_role })`. An UPDATE needs SELECT only on the `WHERE` column (`id`), which stays granted.
- The service-role reads already in place: `plannerStaffSync`, `accountProvisioning`, people `[userId]`, members, and planner-permissions targets.

## Live facts (verified 2026-11-17, Bendie, read-only)

- `portal_is_global_admin()` = `global_role = 'admin'` for `auth.uid()`. The only live values are `admin` (7) and `attendee` (304), and every Portal comparison is `=== 'admin'`.
- `can_view_profile_contact(id)` = self, or a member of an event where the caller is host/organizer/admin, or a member of an organisation where the caller is owner/admin, or a Stawi admin.
- `get_event_member_contacts(event)` raises 42501 unless the caller is the event's host/organizer/admin, an org admin, or a Stawi admin.
- Largest organisation: 154 members. Largest event: 145 members.

## Constitution Check

| Principle | Result | Notes |
|---|---|---|
| I. Brownfield | PASS | Same shapes and call sites. Behaviour changes are limited to FR-008/FR-010 and documented. |
| II. Architecture | PASS | Service-role reads only in server routes and `server-only` libs, after authorization. Each new route follows the org-people route pattern. |
| III. DB safety | PASS | No migration. Uses live functions. |
| IV. Security | PASS | Closes pentest R01 on the Portal side. Contacts follow Bendie's rule. Directory search is restricted. |
| V. UI | PASS | No new patterns. Missing contacts show as blank, as an empty email does today. |
| VI. Scope | PASS | Only hidden-column reads. |
| VII. Docs | PASS | `architecture.md`, `progress-tracker.md`, `schema-reference.md`. |
| VIII. Verification | PASS | `tsc`, lint, tests, build, plus a rolled-back C1 simulation on live Bendie. |
