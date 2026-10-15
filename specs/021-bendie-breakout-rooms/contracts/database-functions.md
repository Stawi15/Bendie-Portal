# Contract: Database functions (Feature 021)

Callable through Supabase RPC by authenticated users. All return JSON; none raise for expected refusals.

## `save_breakout_rooms(p_session_id uuid, p_rooms jsonb, p_prune boolean) → jsonb`

**Caller**: Portal room editor (`p_prune = true`) and Breakout rooms CSV (`p_prune = false`). SECURITY INVOKER — the caller's row-level security applies (organiser predicate: host/organizer/admin of the event, owner/admin of the event's organisation, or platform admin).

**`p_rooms`**: array, in display order:

```json
[
  {
    "id": "uuid | omitted",
    "name": "Room A",
    "description": "text | null",
    "location": "text | null",
    "facilitator_id": "uuid | null",
    "capacity": 30,
    "blocks": [
      { "id": "uuid | omitted", "title": "Intro", "description": null,
        "starts_at": "2026-09-01T11:00:00Z", "ends_at": "2026-09-01T11:30:00Z", "location": null }
    ]
  }
]
```

- Room match: `id` if present, else normalised `name` within the session.
- `blocks` present → replaces the room's blocks (skipped if identical); absent → blocks untouched.
- `p_prune = true` → rooms of the session not in `p_rooms` are deleted (their assignments cascade), and `display_order` follows array order.
- `p_prune = false` → existing rooms keep their `display_order`; new rooms are appended after the session's highest `display_order`, in array order.
- Session without an event → `{ "ok": false, "reason": "no_event" }`.
- Validation failures (blank name, duplicate name, capacity < 1, end ≤ start, facilitator from another event) abort the whole call.

**Returns**

```json
{ "ok": true, "rooms": [{ "id": "uuid", "name": "Room A" }], "removed_assignments": 0 }
{ "ok": false, "reason": "validation", "message": "Room names must be unique in a session." }
{ "ok": false, "reason": "no_event" }
```

Permission failures surface as the standard Supabase error (row-level security).

## `choose_breakout_room(p_room_id uuid) → jsonb`

**Caller**: attendee app (Release 2). SECURITY DEFINER; EXECUTE granted to `authenticated` only.

**Rules** (FR-016), applied atomically with the room row locked:

1. Caller signed in, else `not_authenticated`.
2. Room exists, else `room_not_found`.
3. Session has an event, else `no_event`.
4. Caller is an `attendee` member of that event, else `not_attendee`.
5. Session mode `organizer_assigns` → `organizer_assigns`.
6. Already in this room → `ok` (no change).
7. Room capacity set and headcount ≥ capacity → `room_full`. Headcount counts only assignments of members whose current role is `attendee`.
8. Upsert the caller's assignment for the session to this room, `source = 'attendee'`.

**Returns**

```json
{ "ok": true, "session_id": "uuid", "room_id": "uuid" }
{ "ok": false, "reason": "not_authenticated | room_not_found | no_event | not_attendee | organizer_assigns | room_full" }
```

## `get_breakout_room_availability(p_session_id uuid) → table`

**Caller**: attendee app (Release 2); Portal may use it too. SECURITY DEFINER; returns no rows unless the caller is an event member or platform admin.

| Column | Type |
|---|---|
| `room_id` | uuid |
| `legacy_key` | text (null for new rooms) |
| `capacity` | integer (null = unlimited) |
| `headcount` | integer (current attendees only) |
| `seats_left` | integer (null when unlimited) |
| `is_full` | boolean |

Never returns attendee identities (FR-018).

## Direct table access (Portal)

- `agenda_breakout_rooms`, `agenda_breakout_room_items`: read by event members; written only via `save_breakout_rooms`.
- `agenda_sessions`: unchanged access, plus INSERT/UPDATE/DELETE for owners/admins of the event's organisation (FR-033).
- `agenda_breakout_assignments`: Portal organisers (organiser predicate) read all rows of the event; writes with `upsert(..., { onConflict: 'session_id,user_id' })` setting `room_id` and `source` (`organizer` or `csv`), and `delete` to unassign. Attendees read only their own rows.
