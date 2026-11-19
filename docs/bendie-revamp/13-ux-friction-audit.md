# 13 — UX Friction and Cognitive Load Audit

**Status:** Findings come from source and the live data, plus the 43 observations in the October audit §30, re-checked where code changed. None is browser-verified.

**Severity:** S1 blocks or loses data · S2 slows a major task or misleads · S3 polish.
**Frequency:** F-high happens on every event · F-med on many events · F-low occasionally.
**Complexity** is how hard the fix is: L low, M medium, H high.

| # | Finding | Principle | Sev | Freq | Roles | Cx | Evidence |
|---|---|---|---|---|---|---|---|
| 1 | Up to **32 event sections** across 11 areas. Bendie+Planner events show both sets, with a 3rd nav level in Logistics. | Hick's law, chunking | S2 | F-high | all | H | `eventSectionMeta.ts` |
| 2 | **Four people concepts** (org people, attendees, participants, Planner access) on four surfaces with different add flows, joined only by email | Recognition over recall, mental model | S2 | F-high | managers, Planner | H | Audit §2; doc 09 |
| 3 | **No publish model.** Edits go live at once; `status` silently controls public visibility. Nothing says what attendees can see now. | Visibility of system status, error prevention | S2 | F-high | managers | M | Doc 09 |
| 4 | **Unsaved edits lost** on area change (Basics, Hero, Terminology). Modals close on a backdrop click without asking. | Error prevention, user control | S1 | F-med | all | L | Audit §16 |
| 5 | **Two readiness models** (Dashboard 2 Required checks vs org list 8-check %). Required ignores modules; "attendee" means role = attendee only. | Consistency, system status | S2 | F-high | managers | M | Docs 11, 23 |
| 6 | **No overlap or conflict checks** on the agenda (2 live overlaps) | Error prevention | S2 | F-med | managers | M | Live data |
| 7 | **Three agenda-like lists** (Bendie agenda, Planner agenda, Production) with a manual push | Fragmented workflow | S2 | F-med | managers, production | H | Doc 09 |
| 8 | **Repeated entry across events:** speakers, contacts and FAQs are per event, with no copy-from-event | Repetition | S2 | F-high | managers | M | Schema |
| 9 | **Travel one attendee at a time**; no overview of who's missing details | Visibility, direct manipulation | S2 | F-med | managers | M | Audit §30.2 |
| 10 | ~~Agenda cards about 160px tall~~ **Corrected by the browser pass (doc 15):** the Agenda is now a compact table. Directory density still varies between similar modules. | Information density | S3 | F-high | managers | M | Doc 15 |
| 10b | **Readiness is wrong in production:** "At least one attendee with access" is never marked done, because its count query is refused (doc 15 B1). This undermines trust in the only Required checklist. | Visibility of system status | S1 | F-high | managers | L | Doc 15 B1 |
| 11 | Search covers events only. No command palette, no feature search, no shortcuts. | Discoverability | S2 | F-high | experienced users | M | `TopHeader` |
| 12 | Technical keys in Networking (`question_key`); raw JSON in Games | Speak the user's language | S2 | F-low | managers | L | Audit §30.3 |
| 13 | UI offers actions the server refuses (Create user, People CSV, Pull travel); the Planner tab is locked but listed | Error prevention, trust | S2 | F-med | org admins | L | Doc 10 |
| 14 | Inconsistent CRUD: Save & Add Another on 11 of ~20 forms; Duplicate only on Activities. (Vendor and Checklist editing was added in Feature 020, so that October audit item is fixed.) | Consistency | S3 | F-med | all | M | Audit §30.3, spec 020 |
| 15 | Mixed validation (inline in 3 forms, toasts elsewhere); some raw backend error text | Error communication | S3 | F-med | all | L | Audit §30.4 |
| 16 | Mixed date entry (free text in travel, `date`, `datetime-local`) | Consistency, error prevention | S2 | F-med | managers | M | Audit §30.4 |
| 17 | The bell means organisation activity, "Notifications" means attendee push; Settings appears twice and is read-only | Terminology, duplicate nav | S3 | F-med | all | L | Audit §30.1 |
| 18 | Product type (Bendie, Planner or both) isn't stated on the event; it's inferred from colour | System status | S3 | F-high | all | L | Audit §30.1 |
| 19 | Thin empty states on most pages; one dismissible tip; Help is a mailto | Contextual guidance | S3 | F-high | new users | L | Audit §18 |
| 20 | British and American spelling mixed; "Organisation" also used for expo exhibitors | Consistency | S3 | F-high | all | L | Audit §30.8 |
| 21 | No export anywhere (attendees, speakers, travel, agenda) | User control | S2 | F-med | managers | M | Doc 06 |
| 22 | Planner basics drift: edits to name, dates or location after creation never reach Planner, with no warning | System status | S2 | F-low | managers | M | Doc 09 |
| 23 | Almost no bulk actions: only Tasks batch status (Feature 019), Delete all and replace-on-import for Vendors and Checklist (Feature 020), and multi-assign to vehicles. No multi-select on Bendie lists. | Efficiency | S2 | F-med | experienced users | M | Source, specs 019 and 020 |
| 24 | Data gaps go unflagged: 58 of 136 speakers without a bio, 51 without a photo; 6 orphaned sessions | Visibility | S2 | F-high | managers | L | Live data |
| 25 | Large single-file pages (agenda, logistics) carry the most complex flows | Maintainability (risk) | — | — | devs | H | Doc 04 |

## Checked against the Portal 2.0 §7.3 list

| Issue | Present? | Findings |
|---|---|---|
| Too many navigation options | Yes | 1 |
| Too many decisions at once | Partly (session modal, create wizard) | 3 / J3 |
| Excessive form fields | Partly (expo, production) | — |
| Repetitive entry | Yes | 8 |
| Long configuration workflows | Yes (22 Bendie sections) | 1 |
| Unnecessary page transitions | Yes (a page per section, no inspector) | 1, 9 |
| Nested settings | Partly (Logistics sub-tabs) | 1 |
| Unclear terminology | Yes | 2, 12, 17, 20 |
| Low discoverability | Yes | 11, 19 |
| Conflicting CTAs | Yes (two Add buttons on several pages) | 14 |
| Weak hierarchy | Partly (event name shown twice on the Dashboard) | 18 |
| Excessive dashboard cards | Partly (org overview) | — |
| Unclear completion status | Yes | 5 |
| Missing next steps | Partly ("Recommended next" exists) | 5 |
| Loss of context | Yes | 4 |
| Fragmented workflows | Yes | 2, 7 |
| Unnecessary confirmations | No (the opposite problem) | 4 |
| Unclear dependencies | Yes | doc 11 |
| Overwhelming empty states | No (too thin, not overwhelming) | 19 |
| Lack of intelligent defaults | Yes (nothing carries over from previous events) | 8 |

## Next step with skills

When the browser pass is unblocked, re-check findings 4, 10, 11, 15, 16 and 19 against the live UI with `web-design-guidelines`, and findings 1, 2 and 11 against `apple-hig` (navigation, inspectors, search). Then turn them into the proposals in docs 17–22.
