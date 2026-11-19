# 03 — Product Overview

**Labels:** [V] verified in source or the live database · [D] documented in `context/`, not re-verified · [U] unknown.

## What Bendie Studio is today

Bendie Studio is the web back office for the Bendie ecosystem. The repository is "Bendie-Portal"; the app calls itself "Bendie Studio" in the sidebar, browser title and login [V]. Organisations use it to:

- **Author the attendee app:** event identity, branding, theme, agenda, speakers, content, media, networking, emergency info, games, push notifications [V].
- **Manage people and access:** organisation people, teams, event attendees with emailed access codes, and Planner permissions [V].
- **Run Planner operations** without the Planner app: participants, flights, hotels, ground transport, tasks, vendors, checklist, programme and production run-of-show [V].
- **Govern the platform** (Stawi only): organisations, product entitlements, Planner connections, content moderation [V].

It started as an internal Stawi tool (`project-overview.md`). Since Features 003 and 017 it **admits any organisation member**, with client organisation owners and admins managing their own events [V: `middleware.ts`]. `project-overview.md` and `/unauthorized` still describe it as admin-only, which is stale.

## Scale (live, 2026-11-19) [V]

| | Bendie DB | Planner DB |
|---|---|---|
| Organisations | 12 | (own table) |
| Events | 34 (13 draft, 6 published, 14 active, 1 archived) | 25 |
| Event products | 25 Bendie, 12 Planner | — |
| People | 494 profiles, 254 org memberships, 632 event memberships (521 attendees) | 46 profiles, 409 passengers |
| Content | 227 sessions, 136 speakers, 95 FAQs, 22 expo spaces | 133 agenda items, 340 production rows, 691 tasks, 605 flights, 104 hotel bookings |

## Users

| User | What they do here | Evidence |
|---|---|---|
| Stawi admin (Bendie staff) | Everything: create organisations, manage products, moderate, link Planner, push and pull data | [V] |
| Client organisation owner or admin | Create and manage their organisation's events, people, teams and Planner permissions | [V] Features 017, 021 |
| Event host, organizer or admin | Configure an event's content and attendees | [V] |
| Other members (staff, facilitator, attendee, speaker) | Can enter, and RLS decides writes; mostly view | [V] |
| Planner team members | Use Planner modules in Studio according to their Planner flags | [V] |

## Event lifecycle as supported today

| Stage | Supported? | How |
|---|---|---|
| Organisation onboarding | Partly | Sign-up creates an organisation. Stawi enables products in `/portal/admin/organisations`. |
| Event creation | Yes | `CreateEventModal` → `create_event_with_products` (+ Planner provisioning) |
| Setup and content | Yes | 32 event sections, guided by area order and Previous/Next |
| Readiness review | Partly | Dashboard Required/Recommended/Optional (two Required checks); a separate org-level 8-check % |
| Publishing | **No content publish step** | Content saves are live for event members at once. `events.status` is set by hand on Basics, but it is more than a label: `active`/`published` make the event publicly readable (`events_select_public_showcase`, anon included) and turn on the "Contact organizer" lookup (doc 09). |
| Live operations | Partly | Push notifications, gallery moderation, Planner logistics and production; no live dashboard |
| Post-event | No | No reports, exports or analytics |
| Archiving | Label only | `status = archived` |

## Detailed references

- How each screen behaves: [context/bendie-portal-current-state-audit.md](../../context/bendie-portal-current-state-audit.md) (2026-10-01, still accurate apart from the changes in doc 01 §"What changed since October").
- Products and data flow: [09-product-relationships.md](09-product-relationships.md).
