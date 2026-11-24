# Data Model: 031 (no database change)

## Speaker (`facilitators`)

| Field | Type | Rules (from today's page, kept exactly) |
|---|---|---|
| `id` | uuid | — |
| `event_id` | uuid | Set from the route; never user-editable |
| `full_name` | text | **Required**: "Enter the speaker’s name." |
| `email` | text \| null | Optional; if present it must match `^[^\s@]+@[^\s@]+\.[^\s@]+$`: "Enter a valid email address, for example name@company.com — or leave it empty." Empty string → `null` |
| `job_title`, `organization`, `facilitator_group`, `linkedin_url`, `expertise`, `bio`, `avatar_url` | text \| null | Optional; empty string → `null` |
| `role_type` | text | `speaker` \| `presenter`; default `speaker` |
| `display_order` | int | Page add: current count. Import: count + row index. Attendees add: not set (as today). Edits never change it |
| `claim_status` | text | Read only here. `claimed` → "Profile claimed" (`StatusBadge.Done`, icon `verified`); anything else → "Not claimed" (`StatusBadge.Neutral`, icon `radio_button_unchecked`). Attendees add sets `claimed` + `claimed_at` (as today) |
| `user_id` | uuid \| null | Set only by the Attendees add (as today) |

Selected columns (unchanged): `id,full_name,email,job_title,organization,bio,avatar_url,facilitator_group,role_type,linkedin_url,expertise,display_order,claim_status`.

## Speaker session (read only)

`{ id, title, starts_at, ends_at }`, the union of:
- `agenda_sessions` where `event_id = :event` and `facilitator_id = :speaker`;
- `agenda_sessions` linked through `agenda_session_speakers.facilitator_id = :speaker` (event-scoped).

De-duplicated by `id`, sorted by `starts_at`. Plus `events.timezone` for display.

## Table view state (client only)

| State | Values | Where |
|---|---|---|
| search | text | component state |
| filters | `group` (one of the groups present, or all), `role` (`speaker` \| `presenter` \| all), `unclaimedOnly` (bool) | component state |
| sort | `display_order` (default) \| `full_name` \| `organization` \| `facilitator_group` \| `claim_status`, asc/desc | table state |
| open inspector | `?speaker=<id>` \| `?speaker=new` \| absent | **URL** |
| dirty | boolean | DirtyGuard context |

Sort rules: text compares case-insensitively with locale (`localeCompare`, sensitivity base). Empty values sort last in both directions. Ties are broken by `display_order`.
