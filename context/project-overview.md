# Project Overview

## About the Project

**Bendie Portal** (Event Content Portal) is an internal admin web application for Bendie staff. It replaces hand-run SQL updates against the Evently-App Supabase backend with a self-serve UI: global admins create organizations, assign teams and people to events, and configure every piece of an event's content — branding, agenda, speakers, activities, FAQs, emergency info, games, and more — without touching the database directly.

It is the control plane for the Evently-App ecosystem: everything an attendee sees in the mobile app (hero image, theme colors, speaker bios, agenda sessions, FAQs...) is authored here.

This is **not** a self-serve product for event organizers at large — it is operated by the internal Bendie team, gated to `profiles.global_role = 'admin'`.

---

## The Problem It Solves

Before this portal, event content lived in raw Supabase rows, edited by hand in the SQL editor or table view. That doesn't scale past one event, is error-prone (no validation, no scoping guardrails), and requires someone comfortable with SQL for every content change — hero copy, a new FAQ, a schedule tweak. The portal turns that into structured forms with validation, image upload, and automatic `event_id` scoping, so any admin can manage any event safely.

---

## Structure: Organizations → Teams → Events

```
Organization (e.g. "Bendie", a client org)
  ├─ People (organization_members — org-level roles: owner/admin/member/attendee/facilitator/staff)
  ├─ Teams (groups of people, for faster event assignment)
  └─ Events (event_members — event-level roles: host/organizer/admin/attendee/facilitator/staff/speaker)
       └─ 16 content sections (see Pages below)
```

Global admins (`profiles.global_role = 'admin'`) see and manage **every** organization and event — there is no per-org invitation flow to reach the portal itself. Access to the portal is granted by promoting a user's `global_role`, not by organization membership.

---

## Pages

```
/                                          → Redirects to /portal or /auth/login
/auth/login, /signup, /forgot-password,
  /reset-password                          → Auth flows
/unauthorized                              → Non-admin block page

/portal                                    → Org-scoped dashboard/landing
/portal/events                             → Events list (org-wide, for global admins)
/portal/events/[eventId]/...               → Event editor (21 tabs, see below)
/portal/people                             → Org people directory
/portal/teams                              → Org teams
/portal/assets                             → Org asset library (org-assets bucket)
/portal/settings                           → Org settings
/portal/activity-log                       → Org-wide audit trail

/portal/events/[eventId]/dashboard         → Event status overview + setup progress
/portal/events/[eventId]/basics            → Name, dates, location, status
/portal/events/[eventId]/hero              → Hero image, title, banner
/portal/events/[eventId]/theme             → Primary/secondary/tertiary theme colors
/portal/events/[eventId]/terminology       → Labels, icons, feature toggles
/portal/events/[eventId]/facilitators      → Speakers/coaches (CSV import)
/portal/events/[eventId]/agenda            → Session schedule
/portal/events/[eventId]/attendee-travel   → Per-attendee flight/ground-transfer details (event + attendee picker)
/portal/events/[eventId]/activities        → Activities
/portal/events/[eventId]/excursions        → Local recommendations, grouped by organizer-managed categories
/portal/events/[eventId]/expo              → Exhibitor/sponsor directory
/portal/events/[eventId]/news              → News feed articles and announcements
/portal/events/[eventId]/networking        → Networking preferences & questionnaire
/portal/events/[eventId]/faqs              → FAQs
/portal/events/[eventId]/info-center       → Support contacts
/portal/events/[eventId]/emergency         → Emergency contacts & images
/portal/events/[eventId]/gallery           → Attendee photo gallery moderation (posts/likes/comments)
/portal/events/[eventId]/event-photos      → Organizer-curated event photos (separate from gallery — see below)
/portal/events/[eventId]/games             → Quiz games and trivia
/portal/events/[eventId]/members           → Event members and access codes
/portal/events/[eventId]/bendie-planner    → Link to Bendie Planner; member sync status, agenda push, travel pull
/portal/events/[eventId]/activity-log      → Per-event audit trail
```

The 16 event tabs are defined once in `src/lib/eventSectionMeta.ts` (`EVENT_SECTIONS`) — that file is the single source of truth for tab labels, descriptions, and icons across the tab bar, dashboard cards, and each page's header. Add or reorder a tab there, not per-page.

---

## Navigation

- Org-level sidebar (`OrgSideNav`) for Events / People / Teams / Assets / Settings / Activity Log.
- Once inside an event, a horizontal tab bar (`EventLayout`, `src/app/portal/events/[eventId]/layout.tsx`) exposes all 16 sections, with a floating "Next: {section}" button that walks an admin through them in order — the portal is designed as a guided setup wizard as much as a CRUD tool.

---

## Core User Flow

1. Admin logs in (`/auth/login`) → middleware checks `profiles.global_role = 'admin'` → redirected to `/portal`.
2. Admin selects or creates an organization, optionally sets up teams and invites people (`CreateOrganizationModal`, `CreateTeamModal`, `AddPersonModal` — provisioning goes through `/api/admin/create-user` and `/api/admin/bulk-create-users`, which use the Supabase service-role key server-side after verifying the caller is a global admin).
3. Admin opens an event (or creates one via `CreateEventModal`) and works through the 16 content tabs.
4. Each tab loads the relevant Supabase row(s) directly in a client component, edits via a plain form, and saves with `supabase.from(...).update()/.insert()`, confirmed by a toast (`react-hot-toast`).
5. Images (hero, avatars, activity photos, etc.) upload to the `event-assets` bucket; org-level files (logos, shared docs) upload to `org-assets` via `src/lib/assetUpload.ts` and are picked via `AssetPickerModal`.
6. Facilitators are populated primarily via CSV import (`CsvImportModal` + `src/lib/csvImport.ts`, built on `papaparse`) rather than one-by-one forms.
7. Every mutation is expected to show up in the Activity Log (`event_content_audit_log` / `organization_audit_log`, surfaced at `/portal/activity-log` and `/portal/events/[eventId]/activity-log`).

---

## Features In Scope

- Organizations, teams, and people management (org-level roles)
- Event switcher / events list, scoped to what the signed-in admin can see
- All 16 event content sections listed above, each with full CRUD
- CSV import for facilitators
- Image upload (event assets + org assets) with a public-read, admin-write bucket
- Org-wide and per-event activity log (audit trail)
- Role-gated access (`global_role = 'admin'` only, enforced in middleware + RLS)
- Per-event, opt-in integration with Bendie Planner (a separate app/Supabase project for event
  organizers): staff-tier member sync, agenda push, and flight/hotel travel pull — see
  `architecture.md`'s Cross-Project Integration section

## Features Out of Scope

Per `context/schema-reference.md` §13 — these are attendee/system-generated runtime data, not organizer content, and are intentionally excluded from the portal (moderation/read-only views only, if ever):

- Social feed (`posts`, `post_likes`, `post_comments`)
- Direct messaging (`messages`, `chats`, `chat_participants`)
- Attendee networking connections, session ratings, game results/points
- Attendee's own questionnaire answers (`networking_preferences`)
- Per-user app prefs (`user_settings`, `user_push_tokens`)
- `meeting_requests` (a separate public marketing lead-capture form)

---

## Target User

An internal Bendie staff member — not a technical event organizer — who needs to stand up or update an event's content quickly without writing SQL or waiting on an engineer.

## Success Criteria

- Any global admin can fully configure a new event (branding through FAQs) without SQL access.
- Every write is correctly scoped to `event_id` — zero cross-event data leakage.
- Image uploads work reliably through the portal, not by pasting hosted URLs.
- Every content mutation is visible in the Activity Log with the correct actor and diff.
- Non-admins are blocked from every portal route and every RLS-protected write, even via direct API calls.
