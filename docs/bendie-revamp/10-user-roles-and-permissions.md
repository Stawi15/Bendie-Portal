# 10 — User Roles and Permissions

**Status:** VERIFIED in source (middleware, `portalAuth.ts`, `eventAuth.ts`, `plannerAccessRules*.ts`, API route guards) and by the RLS helper names in the live database. RLS policy bodies weren't re-audited row by row, and no permission was tested in a browser. Machine-readable version: [data/permissions.json](data/permissions.json).

## Roles

| Tier | Values | Source of truth | Live count |
|---|---|---|---|
| Platform | Stawi admin | `profiles.global_role = 'admin'` → `portal_is_global_admin()` | — |
| Organisation | owner, admin, member ("Employee"), attendee, facilitator ("External facilitator"), staff | `organization_members.role` | 254 memberships |
| Event | host, organizer, admin, facilitator, staff, attendee, speaker | `event_members.role` | admin 62, host 4, staff 11, facilitator 3, speaker 31, attendee 521 |
| Planner | Viewer, Manager or Custom: 7 view and 5 manage flags | Planner `event_user_assignments` (+ `org_member_access`) | 165 assignments |

Org owners and admins are **automatically event admins** on every event in their organisation, kept in sync by triggers (Feature 017).

## Permission matrix

| Capability | Stawi admin | Org owner/admin | Org member | Event host/org/admin | Other event roles | Planner flag |
|---|---|---|---|---|---|---|
| Enter Studio | ✓ | ✓ | ✓ | (needs an org membership) | (needs an org membership) | — |
| Organisations, products, moderation | ✓ | | | | | |
| Create organisation | ✓ | | | | | |
| Create event | ✓ | ✓ | | | | |
| Open the event workspace | ✓ | ✓ | only with an event membership | ✓ | ✓ | |
| Edit Basics and modules | ✓ | ✓ | | ✓ | | |
| Edit Bendie content | ✓ | ✓ | | ✓ (RLS) | RLS decides | |
| Edit agenda sessions | ✓ | ✓ (Feature 021) | | per RLS | | |
| Manage breakouts | ✓ | ✓ | | ✓ | | |
| Attendees & Access | ✓ | ✓ | | ✓ | | |
| Create brand-new accounts | ✓ | org-scoped route only | | | | |
| Grant platform admin | ✓ | | | | | |
| Planner Team & Access | ✓ | ✓ | | | | |
| Planner tasks / vendors / checklist | ✓ | ✓ | | | | view / manage |
| Planner participants / logistics / production (manage) | ✓ | ✓ (Studio override) | | | | manage flag |
| Bendie Planner tab (link, push, pull) | ✓ | | | | | |
| Push notifications | ✓ | ✓ | | per RLS | | |
| Hide or delete others' gallery posts | ✓ | | | | own posts only | |
| See others' email and phone | `can_view_profile_contact` rule | | | | | |

Delete, import and export follow the same row as the matching write. Imports run through the same client and RLS as single writes. There is no export.

## Where the UI and the server disagree [V]

1. UI offered, server refuses (non-Stawi admins): Create New User tab, People CSV, Attendee Travel "Pull from Planner".
2. The Bendie Planner tab is listed for everyone and locked for all but Stawi admins.
3. "Make Admin" on People grants **platform-wide** admin.
4. MFA for privileged roles is documented but not enforced.
5. Navigation hides unauthorised actions. It doesn't explain why something is missing. Nothing tells a user what role they hold.

## Personalisation today

The nav adapts to product entitlement and Planner capability only. Org owners/admins and event staff see the same shell and the same 32-section structure, filtered. Role-specific landing pages or guidance don't exist.

## Rules for the Copilot (from Portal 2.0 §6 and §16, checked against the architecture)

- It runs as the signed-in user: the same cookie client, RLS and API guards. It **never** gets a service-role client of its own.
- Planner tools go through the existing `resolvePlannerEventAccess` / `moduleAccess` chain, never a new check.
- Contact data comes only through `profileContacts.ts`.
