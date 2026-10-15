# Contract: Attendee app — Release 2 (Evently-App)

Implemented in the `Evently-App` repository after Release 1 is live. Nothing here is built in the Portal repo. Implements FR-032.

## Reads

- Rooms and mini-agendas: `agenda_breakout_rooms` and `agenda_breakout_room_items` for the session (ordered by `display_order`). Facilitator name = linked Speaker's `full_name`, else `facilitator_name`.
- Mode: `agenda_sessions.breakout_mode`.
- Fullness: `get_breakout_room_availability(session_id)`.
- Own assignment: `agenda_breakout_assignments` where `session_id` = the session (row-level security returns only the attendee's own row).
- Until the app ships, the released app keeps reading `agenda_sessions(_summary).breakout_rooms`, which Release 1 keeps derived. Room ids in that JSON are `legacy_key` when present, else the room `id`.

## Writes

- Replace the in-memory `breakoutRoomSelections` map (`domains/agenda/infrastructure/supabase/agenda.repository.ts:32,140-168`) with `choose_breakout_room(room_id)`.
- Keep the existing `award_game_point('breakout_room_join', session_id, event_id)` call, made only after `ok: true`.

## Behaviour

| Mode | Unassigned attendee | Assigned attendee |
|---|---|---|
| `attendee_choice` | Room picker; full rooms marked "Full" and disabled | Shows room + "Switch room" |
| `preassigned_switchable` | Room picker as above | Shows room + "Switch room" |
| `organizer_assigns` | "Your room will be announced", no picker | Shows room, no switch |

Refusal messages:

| `reason` | Message |
|---|---|
| `room_full` | "That room is full — choose another." (refresh availability) |
| `organizer_assigns` | "Rooms for this session are assigned by the organiser." |
| `not_attendee` | "Only attendees of this event can choose a room." |
| `room_not_found`, `no_event` | "This room is no longer available." (refresh) |
| `not_authenticated` | Sign-in prompt |

## Acceptance

Spec User Story 5, scenarios 1–6; SC-007.
