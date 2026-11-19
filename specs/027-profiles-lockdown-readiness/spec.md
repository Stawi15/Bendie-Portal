# Feature Specification: Profiles Lock-down Readiness (C1)

**Feature Branch**: `027-profiles-lockdown-readiness` (stacked on 026)

**Created**: 2026-11-17

**Status**: Implemented, reviewed and browser-verified (2026-11-19)

**Input**: Bendie Events backend brief, action item #3 and "Coming next (Phase C1)". Bendie will revoke table-level `SELECT` on `profiles` from `authenticated` and grant back only the public columns: `id, username, full_name, avatar_url, bio, job_title, organization, linkedin_url, is_onboarded, last_seen_at, created_at, updated_at, current_event_id, current_organization_id`. After that, `email`, `phone`, `gender`, `location`, `role`, `global_role` (and `planner_profile_id`, which isn't on the list) can't be selected with a signed-in user's key. The Portal must keep working, both **before and after** C1 is applied, so the backend team can apply it on a date of their choosing.

Approved by the developer on 2026-11-17 ("go ahead with 027").

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Signing in and permission checks keep working (Priority: P1)

A Stawi admin or client organiser signs in, the Portal recognises their role, and every page and Planner module opens as today.

**Independent Test**: With C1 applied in a rolled-back session, the Portal's own-role check returns the same answer as today for every admin and a sample of non-admins.

**Acceptance Scenarios**:

1. **Given** a Stawi admin, **When** they sign in, **Then** they reach `/portal/admin` and see every organisation and event, as today.
2. **Given** a client organiser, **When** they open a Planner module, **Then** the route recognises their organisation and Planner identity, as today.
3. **Given** any signed-in user, **When** the Portal loads their own profile, **Then** their name, avatar, current organisation and their own email/phone load without a permission error.

### User Story 2 - Contact details stay visible to the people allowed to see them (Priority: P1)

Organisers still see email and phone on members, attendee travel, gallery, activity logs, team and participant pickers, and the organisation People list. Visibility follows Bendie's own rule (`can_view_profile_contact`): yourself; members of events you host/organise; members of organisations you administer; everyone, for Stawi admins.

**Acceptance Scenarios**:

1. **Given** an event organiser, **When** they open Members, **Then** each member's email and phone show.
2. **Given** an organisation admin, **When** they open People, **Then** each person's email and phone show.
3. **Given** someone not allowed to see a person's contact, **When** a list includes that person, **Then** the list still loads and shows their name, without email or phone.
4. **Given** a contact that couldn't be loaded, **When** the profile editor opens, **Then** email and phone can't be edited and aren't overwritten on save.

### User Story 3 - Stawi-only people tools keep working (Priority: P2)

Stawi admins still see who has Portal admin access in People, can grant or revoke it, and can import a people spreadsheet that reuses existing accounts.

### Edge Cases

- **Finding an existing account to add to an organisation** ("Search existing"): Stawi admins keep partial email search. Client org admins must type the **full email address**; the account is shown only if it exists. This stops the Portal from becoming a directory of every user's email, which is what C1 closes. "Create new" already reuses an existing account with that email (Feature 017).
- **Activity logs** show the actor's name. Their email shows only where the contact rule allows.
- **An event list that a viewer isn't allowed to see contacts for** (Bendie raises "Not allowed"): names show, contacts don't; the page doesn't fail.
- **Before C1**: every path uses functions and server routes that already work today, so nothing depends on the switch-over date.

## Requirements *(mandatory)*

- **FR-001**: No Portal code running with a signed-in user's key MAY select `email`, `phone`, `gender`, `location`, `role`, `global_role` or `planner_profile_id` from `profiles`, directly or through an embed, or use `select('*')` on `profiles`.
- **FR-002**: The caller's own Stawi-admin status MUST come from `portal_is_global_admin()` (browser and middleware) or a service-role read of the verified caller's own row (server routes).
- **FR-003**: The caller's own `planner_profile_id` and `current_organization_id` in server routes MUST be read with the service role, for the verified user id only.
- **FR-004**: The signed-in user's own profile MUST load the public columns explicitly; their own email and phone MUST come from `get_profile_contact(own id)`, falling back to the sign-in email.
- **FR-005**: Event-scoped lists MUST get contacts from `get_event_member_contacts(event)`. Other lists MUST get them from `get_profile_contact` (small sets) or from an organisation-scoped server route that applies the organisation-admin clause of the same rule. When contacts aren't allowed, the list MUST still load without them.
- **FR-006**: Other people's `global_role` MUST only be returned to Stawi admins, by a server route.
- **FR-007**: The Stawi spreadsheet import MUST resolve existing accounts on the server (service role), not with a browser email lookup.
- **FR-008**: Account search: Stawi admins get partial email search; organisation owners/admins get exact email match only; both go through a server route.
- **FR-009**: The profile editor MUST NOT write email or phone when they weren't loaded.
- **FR-010**: Behaviour before C1 MUST be unchanged except FR-008's client-admin search and contacts that Bendie's rule hides.

### Out of scope

- Any Bendie database change (C1 itself is applied by the backend team).
- Planner's own `profiles` (a different database, read with the service role).
- Writes: `UPDATE` grants aren't changed by C1.

## Success Criteria *(mandatory)*

- **SC-001**: A code search finds no user-key selection of the hidden columns (FR-001).
- **SC-002**: With C1 applied in a rolled-back live session, the Portal's own-profile load, admin check and contact functions all succeed as a client organiser and as a Stawi admin.
- **SC-003**: Type-check, lint, unit tests and build pass.
