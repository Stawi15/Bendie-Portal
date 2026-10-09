# Contract: Ensure people in an organization

`POST /api/organizations/[organizationId]/people`

Org-scoped privileged route (constitution v1.1.0, Principle II). Used by Organisation People
single add and spreadsheet import when the caller is a client owner/admin. Platform admins may
also call it; their existing `/api/admin/*` flows are unchanged.

## Authorization (server-side, every request, before any write)

1. Session user required → else `401 { error: "not_authenticated" }`.
2. Allowed if `profiles.global_role = 'admin'`, or the caller has an `organization_members` row for
   the route's `organizationId` with role `owner` or `admin` → else
   `403 { error: "forbidden" }`. The organization comes from the route and is verified against
   the caller's membership; no body field can change it.

## Request

```json
{ "people": [ { "email": "ann@example.co.ke", "fullName": "Ann W." } ] }
```

- `people`: 1–500 items. `email` required, trimmed, lower-cased, basic format check.
  `fullName` optional, ≤ 200 chars. There is no role field: membership role is always `member`.
- Invalid body → `400 { error: "invalid_request", message }`.

## Behavior per person (independent; one failure never aborts the rest)

1. Find account by email (case-insensitive, service role). If none, create silently
   (`email_confirm: true`, no password, no email). On create failure, re-look-up with backoff
   (concurrent-create race) before reporting an error.
2. If created and `fullName` given, set `profiles.full_name`.
3. Insert `organization_members (organization_id, user_id, role='member')` on conflict do nothing.
4. Duplicate emails in one request are processed once; later duplicates report `duplicate`.

## Response `200`

```json
{
  "results": [
    { "email": "ann@example.co.ke", "userId": "uuid", "account": "created", "organization": "added" },
    { "email": "old@example.com", "userId": "uuid", "account": "existing", "organization": "already_member" },
    { "email": "bad@", "error": "invalid_email" }
  ]
}
```

- `account`: `created` | `existing`. `organization`: `added` | `already_member`.
- Never returns other organizations, roles elsewhere, or any secret (spec FR-008).
