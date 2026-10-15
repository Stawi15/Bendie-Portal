# Contract: Spreadsheet formats (Feature 021)

*Simplified 2026-10-14 at the developer's request. There is one agenda spreadsheet, plus an optional people list per breakout. The earlier separate "Breakout rooms" and "Room assignments" uploads are gone.*

Both uploads use the existing `CsvImportModal` (file or paste, then preview, then results). Header names are case-insensitive and ignore surrounding spaces. Date-times use the formats the agenda import already accepts (browser local time), e.g. `2026-09-01 14:00`.

## 1. Agenda spreadsheet: sessions and breakouts (agenda page → "Import spreadsheet")

These are the existing columns plus three optional breakout columns.

| Column | Required | Meaning |
|---|---|---|
| `title`, `starts_at`, `ends_at` | yes | As before |
| `location`, `block_type`, `audience`, `speakers`, `accent_color`, `description` | no | As before |
| `breakout_room` | no | **Blank = regular session.** Filled = this row is one room of a breakout |
| `room_capacity` | no | Whole number ≥ 1; blank = no limit |
| `room_facilitator` | no | Speaker name or email on this event |

**How a breakout is written:** one row per room, with the same `title`, `starts_at` and `ends_at` on each row. Session details (location, description, speakers, …) can go on the first row only.

```csv
title,starts_at,ends_at,location,block_type,speakers,description,breakout_room,room_capacity,room_facilitator
Opening Keynote,2026-09-01 09:00,2026-09-01 10:00,Main Hall,session,Jane Smith,Welcome,,,
Afternoon Breakouts,2026-09-01 14:00,2026-09-01 16:00,,session,,Choose one room.,Room A: Innovation Lab,30,Jane Smith
Afternoon Breakouts,2026-09-01 14:00,2026-09-01 16:00,,session,,,Room B: Leadership Circle,25,
```

**Rules:**

- **Same session:** rows with the same title (ignoring case and spaces) and the same start time, to the minute, are one session.
  - Several such rows are only valid if every row has a different `breakout_room`.
  - The rows must also not disagree on `ends_at` or on any other filled-in detail.
  - Otherwise every row involved is an error.
- **Re-uploading updates instead of duplicating:** a session that matches exactly one existing session (same title and start) is **updated**.
  - Filled cells overwrite the current values; blank cells keep them.
  - Filled `speakers` replace the session's speakers.
  - A match with two or more existing sessions is an error.
- **Rooms:** rooms are added or updated by name through `save_breakout_rooms(p_prune = false)`.
  - Rooms not in the file are kept.
  - Mini-agendas (time blocks) are edited only in the session editor.
- **Uploading the same file again changes nothing.**

## 2. People list: who goes where, per breakout (Manage people → "Download list" / "Upload list")

| Column | Required | Meaning |
|---|---|---|
| `attendee_email` | yes | An attendee of this event |
| `attendee_name` | no | For reference only; ignored on upload |
| `room` | no | A room of **this** breakout session. **Blank = not in a room** |

- **Download list:** every attendee of the event, with their current room for this session. People in a room are listed first, by room then name.
- **Upload errors:** an unknown email, a room not in this session, or the same person on two rows. Each is shown as a row error.
- **Over capacity:** rooms that would end up over capacity are a non-blocking warning in the preview.
- **What a valid row does:** places, moves or removes the attendee. It is recorded as a CSV upload. Same room as now means no change: the original source and time are kept.
- **Round trip:** uploading the downloaded list unchanged changes nothing.
