# 19 — Proposed User Journeys

**Status:** PROPOSAL. Each journey revises the current one in doc 12 (J1–J10). Steps marked ✦ depend on the AI architecture (pass 3) and **must also work without AI** (Portal 2.0 §18: "AI must remain optional").

## Two modes, one dataset (§8.5)

| | **Guided build** | **Direct** |
|---|---|---|
| For | First event, complex setup | Experienced organisers |
| Shape | A checklist rail beside the normal pages: steps come from the readiness rules (doc 23) for this event's products and modules | The normal sidebar, palette and tables |
| Switching | A "Guided build" toggle in the event sidebar header. It's on by default for an event's creator until Required is met, and remembered per user and event. | Turning guided off loses nothing; steps are just readiness rules |
| Data | Same pages, same saves, same rules | — |

Guided build is **not a wizard**. It never blocks navigation, and every step opens the real page.

## J1. Create an event (revised)

1. "+ New event" opens a **sheet** (not a 4-step dialog) with three fields: name, dates and time zone, and products. Location and modules are optional and collapsed.
2. Optional: "Start from…"
   - **a previous event:** copy setup, speakers, FAQs and contacts. Needs approval (doc 40 Q9).
   - **a brief or document ✦:** opens the staged import (doc 28).
3. Create, then land on Overview with Guided build on.
4. Planner setup runs in the background, with a **Retry** that also works for stale `pending` (B4).

Decisions drop from 4–6 to 3. Modules can be chosen later, and readiness adapts.

## J2. Set up attendee app content

- Guided rail order: Event details → App appearance (with live preview) → Speakers → Agenda → Attendees & access → Content modules.
- Every list uses one table pattern with an inspector (doc 21). "Save & add another" is everywhere (doc 13 #14).
- **Unsaved-change guard on in-app navigation** as well as on closing the browser (doc 13 #4). Modals and inspectors never discard typed data on a backdrop click.
- ✦ Draft bios, descriptions and FAQs only from text the organiser supplies, always as a reviewable draft.

## J3. Build the agenda

- Agenda gets **Table** (today's) and **Timeline** views (by day × location, drag to move with a keyboard alternative).
- **Conflict checks run as you edit:** same location, same speaker overlapping, sessions outside event dates. They show inline and in readiness (doc 23 `programme.overlaps`).
- "Send to Planner run of show" becomes a status ("Planner copy: up to date / 3 changes not sent") with one action, instead of a separate admin-only tab.
- ✦ Draft an agenda from a schedule document or brief, validated deterministically before preview (doc 30).

## J4. People: one list ("Everyone")

```
Name            App access     Participant   Planner access   Travel
Amina Otieno    ● Has code     —             —                —
Samuel Test     ● Has code     ● Linked      Manager          ✈ ✓  🏨 ✗
VIP Guest       —              ● Not linked  —                ✈ ✓  🏨 ✓
```

- One row per person, joined on email or `planner_profile_id`. Unlinked records are shown as such, never guessed.
- Inspector tabs: **Profile · App access · Travel · Planner access · Activity.** Each tab writes through today's owning page logic and API.
- Bulk actions: give app access, add as participants, set Planner role, resend codes. Each shows a preview count and asks for confirmation (high-impact, §15.3).
- The specialised pages (Attendees & access, Participants, Team & access) stay for experienced users.

## J5. Travel and logistics

- **Travel:** one row per person with flight, hotel and transfer coverage. Gaps can be filtered ("No flight").
  - Editing a row edits Planner (`planner-logistics` APIs).
  - "Shown to attendee" displays the Bendie `attendee_travel_details` copy with a **Sync** status, replacing the manual Stawi-only pull.
  - The pull stays Stawi-only until a spec says otherwise.
- **Ground transport:** board view (movements → vehicles → passengers), drag with a keyboard alternative.
- ✦ Flight manifest or rooming list import with a staged diff (doc 28).

## J6. Run of show

- One timeline: Planner agenda items with production rows nested, the same parallel-track model as `production_tasks.is_parallel` / `parent_production_id`.
- Internal notes are visibly **internal**, and are never exported to the attendee agenda (§13.2).
- ✦ Draft production rows from the programme.

## J7. Planner access

A Team & access page with a matrix (people × modules × view/manage), presets (Viewer / Manager / Custom), and the audit trail inline. It explains the Manager limitation (no manage on participants, logistics or production) in the UI.

## J8. Readiness

See doc 23: headline, grouped issues, "What's next", completion dots in the sidebar.

## J9. Live event

Overview switches to a **Live** layout during the event dates:
- today's sessions
- notifications sent and scheduled
- new gallery reports (Stawi admins)
- transport movements for today (Planner)

No new data, just a different arrangement of existing pages.

## J10. After the event and archive

- **Export** (new, read-only): attendees, speakers, sessions, travel, as CSV/XLSX through the existing `exceljs`. It respects RLS, and contact columns follow `can_view_profile_contact`.
- **Copy to new event** (pending Q9).
- Archive sets the status and shows what remains publicly visible (doc 09).

## Measures to collect (doc 38)

These are the same journeys, timed on the test copy before and after each phase. Only measured numbers are reported (no baselines exist yet; doc 12).
