# 12 — Existing User Journeys

**Status:** SOURCE-TRACED. Step and decision counts come from reading the code. **Nothing was timed or watched in a browser**, so there are no baseline durations (doc 38 has to measure them). Per-screen detail is in [context/bendie-portal-current-state-audit.md](../../context/bendie-portal-current-state-audit.md) §12–§18.

"Decisions" means choices the user has to make. "Context switches" means moving to a different page or area.

## J1. Create an event (org owner/admin or Stawi admin)

| | |
|---|---|
| Goal | A new event ready to fill in |
| Entry | Header "+ New Event", Events page, empty-table CTA, or Overview quick action. All open `CreateEventModal`. |
| Steps | 1 Basics (name, start, end, timezone, location) → 2 Products (only if the organisation has both) → 3 Modules (`ModulePicker`, skippable) → 4 Get ready (checklist + summary) → Create |
| Decisions | 4–6 (products, modules, timezone) |
| Required fields | name, start, timezone (Feature 024) |
| Drafts | `localStorage`, this device, 30 days |
| Done when | It lands on the Dashboard (or Planner Overview for Planner-only events) |
| Friction | Module choice only affects Dashboard grouping, not the app menu. Planner failure leaves a half-created state with a retry. No brief or document input. |
| AI opportunity | Start from a brief or proposal: extract name, dates, venue and modules, and flag what's missing (doc 29) |

## J2. Set up attendee app content (event manager)

| | |
|---|---|
| Goal | A usable attendee app |
| Path | Dashboard → Event Setup (Basics, Hero, Theme, Terminology) → Programme (Speakers, Agenda, Activities, Excursions) → Attendees (Members, Travel, Networking) → Content (News, FAQs, Info, Expo) → Media (Gallery, Photos, Files) → Operations (Emergency, Games, Notifications) |
| Screens | Up to **22 Bendie sections** across 6 areas, plus Previous/Next |
| Context switches | One per section. Each section is its own page with its own load. |
| Required by readiness | Only name + dates and ≥1 `attendee` |
| Repeated entry | Speakers re-entered per event (no reuse across events). Org assets picked per field. Support and emergency contacts re-entered per event. |
| Friction | Unsaved edits on Basics, Hero and Terminology are lost when you change area. Modals close on a backdrop click. Mixed validation styles. Technical keys in Networking. Raw JSON in Games. |
| AI opportunity | Draft descriptions, bios and FAQs from supplied material. Gap detection. Reuse last event's content. |

## J3. Build the agenda (event manager, org admin)

| | |
|---|---|
| Path | Agenda → pick a day → Add Session (modal: title, block type, start/end in venue time, location, audience, accent, speakers with types, breakouts) or CSV/XLSX import (with breakouts) |
| Decisions per session | 6–10 |
| Prerequisites | Speakers (soft), timezone (soft) |
| Validation | End after start. **No overlap or speaker-conflict check** (2 live location overlaps found). |
| Friction | ~160px cards show only 3–4 sessions per screen. The date repeats on every card. No timeline view. Push to Planner is a separate manual step on another tab. |
| AI opportunity | Draft from a schedule document. Deterministic conflict check. Timeline preview (doc 30). |

## J4. Invite attendees (event manager)

| | |
|---|---|
| Path | Attendees & Access → Add ▾ (from org, team, all org people, new / CSV) → codes auto-issued and emailed |
| Friction | Four people concepts (org people, attendees, participants, Planner access). Up to 4 text actions per row. "Bendie Access" always says Eligible. Onboarding status is shown but never written by Studio. |
| AI opportunity | Spot duplicates and missing emails before import. Bulk-role suggestions. |

## J5. Manage travel logistics (Planner team)

| | |
|---|---|
| Path | Participants (add or CSV) → Logistics → sub-tabs Flights / Hotels / Ground transport (movements → vehicles → assign or move) |
| Navigation depth | Area → section → **sub-tab** (3 levels) |
| Context switches | Participants ↔ Logistics. Attendee Travel (Bendie) is separate, and pulling into it is manual and Stawi-only. |
| Friction | 1,211-line page. Attendee Travel shows one person at a time. Email bridge misses 86% of participants. |
| AI opportunity | Flight manifest and rooming list ingestion with a staged diff (doc 28). Missing-flight and missing-hotel reports. |

## J6. Production run-of-show (Planner production)

| | |
|---|---|
| Path | Planner Agenda (programme) and Production (per-session rows: times with shift, mode, mic, screen, stage-hand notes) |
| Friction | The Bendie agenda, the Planner agenda and Production are three lists of overlapping sessions. Only the Bendie → Planner agenda push exists. |
| AI opportunity | Generate a run-of-show draft from the programme (doc 30) and keep it internal. |

## J7. Grant Planner access (org admin)

| | |
|---|---|
| Path | Attendees & Access → row → Team & Access (Viewer, Manager or Custom flags) |
| Friction | No screen of its own. Manager doesn't grant manage on participants, logistics or production. |

## J8. Readiness review (event manager)

| | |
|---|---|
| Path | Dashboard: Required (2 checks), Recommended ("has content" / "not started"), Optional (collapsed), "Recommended next"; plus a Planner card |
| Friction | The org list shows a different 8-check "Setup progress %". "Needs attention" isn't clickable. Required ignores modules. |

## J9. Live event (event manager, Stawi)

Push notifications (send now or schedule), gallery moderation, content moderation (Stawi only), Planner logistics on site. There's no live dashboard and no check-in in Studio.

## J10. Post-event and archive

`status = archived`. There are no exports, reports or analytics. Content can't be copied into a new event.

## New vs experienced users

| | New organiser | Experienced organiser |
|---|---|---|
| Helped by | Create wizard, Dashboard "Recommended next", area order, Previous/Next, Speakers empty state | Direct URLs, area nav, CSV/XLSX import on 17 screens |
| Hindered by | 32 possible sections; terminology (facilitator vs speaker, participant vs attendee); thin empty states; no help beyond a mailto | No global search beyond events, no command palette, almost no bulk actions (only Planner tasks, vendors and checklist), no keyboard shortcuts, no cross-event copy, one-at-a-time travel |
