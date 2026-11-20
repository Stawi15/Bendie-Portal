# 30 — Generative Agenda and Run of Show

**Status:** PROPOSAL. It fits the existing models:
- Bendie `agenda_sessions` (+ `agenda_session_speakers`, breakouts via `save_breakout_rooms`), stored in venue time through `eventTimeZone.ts`.
- Planner `event_agenda_items` (days, tracks, rooms, `is_parallel`) and `production_tasks` (base and shifted times, mode, mic, screen, stage-hand notes, `parent_production_id`).

## Agenda drafting (§13.1)

**Inputs:**
- dates and time zone (required)
- rooms/locations: from the existing sessions, or entered by hand
- speakers: existing `facilitators` only, unless the organiser adds names
- session lengths and break rules
- the brief, or the organiser's instructions

**Process:**
1. The model (standard or deep tier) proposes `SessionDraft[]` against a strict schema: title, block type from the enum, start/end in venue-local time, location, speaker ids from the provided list, audience.
2. **A deterministic validator** (`check_schedule_conflicts`, doc 27) checks:
   - overlaps by location and by speaker
   - sessions outside event dates or in invalid order
   - end before start
   - missing breaks (more than N minutes without a `break` or `meal`, configurable)
   - unassigned speakers
   - time-zone sanity (all times inside the event's local days)
3. Failures go back to the model once with the validator's messages. Whatever still fails is shown flagged, not hidden.
4. **Preview** in the Timeline view (doc 19 J3): drag to adjust, edit inline. **Approve** writes through `upsert_sessions` (a proposal).

**It never invents speaker availability.** The model can only place speakers it was given, and the validator rejects double-booking.

## Run of show (§13.2)

| Question | Finding |
|---|---|
| Does the system support it? | **Yes.** Planner `production_tasks` already models per-session production with time shifts (`shift_minutes`), parallel tracks and child rows (`parent_production_id`), plus `mic_type`, `presentation`, `main_screen`, `stage_hand_notes`, `guest_experience`. Planner `event_agenda_items` holds the programme. |
| Where does it live in the IA? | Programme › Run of show (doc 17), Planner tag |
| Separation from attendees | These rows are in the **Planner DB** and never sync to the attendee app. The Bendie → Planner agenda push is one-way. **No AI tool writes production notes into Bendie tables.** |

**Drafting:**
1. From the Planner programme (or the Bendie agenda, via the existing push), propose production rows per session: preparation and soundcheck before, transition after, buffers, mic and screen needs from session type and speaker count, and presenter notes. Each row is labelled **Internal**.
2. Validate deterministically: no overlap within a track unless `is_parallel`; buffers ≥ the configured minimum.
3. Approve, then write through `plannerProduction.createSession` / `updateSession` after `resolveProductionCapability` (manage).

## Other generative content (§13.3)

| Content | Grounding | Where it's saved |
|---|---|---|
| Event description, welcome message | Event record + brief | Event details (proposal) |
| Session descriptions | Session title, speakers' bios, brief | Session (proposal) |
| Speaker bios | **Only** text the organiser supplies (CV, LinkedIn text pasted in). Never web-searched. | Speaker (proposal) |
| Networking questions and options | Event themes and category | Networking (proposal) |
| FAQs | Brief, venue info, existing records | FAQs (proposal) |
| Push notification copy | Event context + organiser intent | Draft only. Sending is a separate high-impact action. |
| Sponsor/expo descriptions | Supplied sponsor material | Expo (proposal) |

Everything generated is labelled ✦ **Draft** until the organiser saves it.
