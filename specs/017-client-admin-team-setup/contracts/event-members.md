# Contract: Ensure a person on an event (by email)

`POST /api/events/[eventId]/members`

Org-scoped privileged route (constitution v1.1.0, Principle II). Used by Planner "Add team
member", Bendie "Invite new attendee", and the event spreadsheet import (one call per row,
bounded concurrency in the browser).

## Authorization (server-side, every request, before any write)

1. Session user required → else `401 { error: "not_authenticated" }`.
2. `canAdministerPlannerPermissions(eventId, caller)` must be true: platform admin, or owner/admin
   of the event's own organization resolved from `events.organization_id` → else
   `403 { error: "forbidden" }`. Unknown event → `404 { error: "event_not_found" }`.

## Request

```json
{ "email": "sarah@example.co.ke", "fullName": "Sarah K.", "eventRole": "staff" }
```

- `email` required (trimmed, lower-cased, format check); `fullName` optional ≤ 200 chars.
- `eventRole` one of `EVENT_MEMBER_ROLES` (host, organizer, admin, facilitator, staff, attendee,
  speaker) → else `400 { error: "invalid_request" }`.

## Behavior

1. Ensure account (same rules as the organization contract, steps 1–2).
2. Ensure `organization_members` role `member` in the event's organization (on conflict do nothing).
3. Insert `event_members (event_id, user_id, organization_id = event's org, role = eventRole)` on
   conflict do nothing. If a row already existed, its role is left unchanged and returned.
4. Does **not** grant Bendie or Planner access; the browser does that next with the existing
   steps (current-event pointer, Bendie access code, `grantPlannerAccess` via Feature 008 routes).

## Response `200`

```json
{
  "userId": "uuid",
  "email": "sarah@example.co.ke",
  "account": "created",
  "organization": "added",
  "event": "added",
  "eventRole": "staff"
}
```

- `event`: `added` | `already_member`. When `already_member`, `eventRole` is the existing, kept
  role (may differ from the requested one); the UI says the role was kept (spec FR-012).
- Step failure after earlier steps succeeded → `200` with the completed fields plus
  `{ "failedStep": "organization" | "event", "error": "<plain message>" }`; a retry completes it
  with no duplicates.
