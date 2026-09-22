# Progress Tracker

Update this file after every completed feature. Any AI agent reading this should immediately know what is done, what is in progress, and what is next.

**Last synced against the actual codebase:** 2026-09-17, for the "Product-Level Navigation & Product-Aware Event Discovery" (Feature 006) entry below; Feature 005's entry was last synced 2026-09-16; Feature 003's entry was last synced 2026-09-15; the mobile-parity content further down was last synced 2026-08-19.

---

## Carry-forward requirement for the next feature: BENDIE PLANNER STAFF & MODULE PERMISSIONS — OPEN (identified 2026-09-18, during Feature 007 manual acceptance)

**Working title only — FEATURE 008 — Bendie Planner Staff & Module Permissions.** This is a roadmap requirement, not a specification. Do not treat this block as scope-complete or start implementation from it directly — it exists so the requirement survives Feature 007's convergence rather than being lost. A full `/architect` + `/speckit.specify` pass is still required before any implementation.

**Discovered:** 2026-09-18, during Feature 007's own manual browser acceptance (not a Feature 007 defect — Feature 007 was deliberately scoped to Tasks management + enforcement of the *existing* Planner permission model, never the manager-facing administration of that model; see Feature 007's own Out of Scope section). The trigger was a real diagnosis: an org-owning Portal platform admin (`edwin@stawiexperiences.com`) correctly could not see the Tasks tab, because Feature 007's authorization deliberately requires a Planner identity bridge (`profiles.planner_profile_id`) and an active, capability-bearing `event_user_assignments` row — and Portal has no UI anywhere for a manager to establish either for a member of their own team.

**Problem:** `event_user_assignments` (Planner) already carries a real, enforced permission surface — but the only thing that currently writes to it is `plannerStaffSync.ts`'s automatic, role-derived sync (`syncStaffMemberToPlanner()`, fired silently from `members/page.tsx`), which maps a fixed set of Portal `event_members.role` values to an all-or-nothing Planner permission bundle (`host`/`organizer`/`admin` → full view+manage across every module; anything else → view-only, never manage). There is no independent, per-module control, and no visible screen where a manager can see or change what a given staff member can do in Bendie Planner.

**Live permission surface this future feature must work from as its initial source of truth** (confirmed live this session — do not invent additional `can_manage_*` columns without an explicit product/schema decision first):

| Module | View flag | Manage flag |
|---|---|---|
| Overview | `can_view_overview` | *(none exists)* |
| Production | `can_view_production` | *(none exists)* |
| Logistics | `can_view_logistics` | *(none exists)* |
| Tasks | `can_view_tasks` | `can_manage_tasks` |
| Notifications | `can_view_notifications` | *(none exists)* |
| Checklist | `can_view_checklist` | `can_manage_checklist` |
| Vendors | `can_view_vendors` | `can_manage_vendors` |

**Intended future scope** (for whichever feature addresses this):
- A manager-facing Portal workflow to add/select event staff and establish their Planner identity/event assignment explicitly (rather than the current silent, role-derived side effect).
- Visibility and editing of `event_user_assignments` — including `is_active` (activate/deactivate, not just create).
- Module-level permission configuration, scoped to what the table above actually supports today.
- An explicit design decision on whether to decouple Planner permissions from Portal `event_members.role` (today's binding) or continue deriving from it.

**Open questions for that feature to resolve** (not answered here — this is a carry-forward prompt, not a spec): should the existing automatic role-derived sync be replaced, kept as a default with manual override, or removed entirely; should the UI cover only the 3 modules with an existing `can_manage_*` column (Tasks/Checklist/Vendors) or also justify adding the other 4; where does this screen live in the existing Portal navigation (Members tab extension vs. a new dedicated surface); does it depend on any Planner module beyond Tasks actually shipping in the Portal first. See the 2026-09-18 roadmap-inspection analysis (this session) for the full comparison of Features 001–007's existing identity/permission foundations this would build on.

---

## Carry-forward requirement for the next feature: PRODUCT-LEVEL NAVIGATION + PRODUCT-AWARE EVENT DISCOVERY — ✅ RESOLVED by Feature 006 (2026-09-17)

**Resolution:** Implemented exactly as intended below — see the Feature 006 entry further down for the full implementation summary. This block is kept for historical record; do not re-open it.

**Discovered:** 2026-09-16, during Feature 005's own manual browser verification (not a Feature 005 defect —
Feature 005 was deliberately scoped as workspace-foundation only, per its own spec's Out of Scope section).

**Problem:** The Portal still has only the original, single, Bendie-oriented organization/event discovery
experience (`Organisations → Events → All`). A Planner-only event therefore appears in the same general
event list as Bendie-only and Both events. Clicking it correctly opens Planner Overview (Feature 005 works
exactly as specified), but its mere presence in what still reads as "the Bendie event list" can lead a user
to assume it is a Bendie event before they click it.

**Intended future product experience** (for whichever feature addresses this):
- Bendie product context → shows events whose `event_products` contains `'bendie'`.
- Planner product context → shows events whose `event_products` contains `'planner'`.
- A Both event may appropriately appear in both contexts.
- A Planner-only event should not appear as though it were a Bendie event, and vice versa.

**Open questions for that feature to resolve** (not answered here — this is a carry-forward prompt, not a
spec): how does a user enter Bendie vs. Bendie Planner as a top-level choice; where does a product
switcher/navigation surface live; what determines the default product after login; how is the selected
product context preserved across navigation; how does it interact with the existing organization selector
(`OrganizationContext`/`TopHeader`'s switcher); how do direct URLs behave when an event doesn't contain the
currently selected product context; how does organization-level entitlement (`organization_products`)
bound which product contexts are even offered.

---

## Current Status

**Phase:** Mobile-parity gap analysis (Phases 5–13) is fully closed. Only Phase 14 (nice-to-have) and Phase 15 (unrelated hardening) remain.
**Foundation, org layer, event switcher, and all 21 content sections are built** (the original 16 plus Event Photos, Excursions, Expo Directory, News Feed, and Attendee Travel Details). Every gap found in the 2026-08-19 field-by-field comparison against `schema-reference.md` — cross-checked live against the database via the `supabase` MCP throughout — has been closed: 3 quick correctness fixes, Agenda multi-speaker/breakout-rooms, 4 brand-new content sections, a Resend Access Code action, and a cross-cutting edit-form-modal fix that turned out to affect 8 pages.
**Next:** Nothing blocking. Optional remaining work: Phase 14 (Games Leaderboard admin view, nice-to-have, explicitly low priority in `schema-reference.md`) or Phase 15 (MFA/TOTP enforcement, Networking drag-to-reorder, `ComingSoonPanel.tsx` decision, test coverage, `event-files` bucket UI, `types/database.ts` drift check — all pre-existing open items unrelated to mobile parity). Also worth a real browser click-through pass at some point — every phase this session was verified via `type-check`/`lint` only, never in a running app.

**2026-09-16 — Event-discovery outage found and fixed (brownfield, pre-dates Feature 005):** manual browser
testing surfaced that ordinary users saw zero events anywhere in the Portal — every org's dashboard/Events
list, and the event workspace itself, silently came up empty. Root cause: a Feature 004 migration correctly
narrowed `events`' client-facing SELECT grant to a specific column list (excluding the diagnostic-only
`planner_provisioning_error`), but 4 call sites (`useOrgEvents.ts`, `EventContext.tsx` ×3,
`CreateEventModal.tsx`, `basics/page.tsx`) still did `.select('*')` — which Postgres denies in full the
instant the requesting role lacks SELECT on even one column, and each call site's own error handling
silently swallowed that failure into an empty state. Fixed by replacing every `.select('*')` on `events`
with an explicit column list matching the actual grant (`src/lib/eventColumns.ts`); no RLS or migration
change — the grant itself was correct. Live-verified with a real authenticated (non-service-role) session:
`403 permission denied` before, correct per-org event counts after, cross-tenant/draft isolation unaffected.
Full details in `schema-reference.md`'s changelog entry of the same date.

**2026-09-16 — Feature 004 post-convergence corrective fix: Planner-inclusive event creation was
RLS-blind to its own mapping table (brownfield, discovered while preparing a Feature 005 manual-test
fixture — not a Feature 005 defect):** an ordinary org owner/admin (not a platform admin) could never
create a Planner-inclusive event, even with a genuinely valid `organization_planner_links` mapping —
three places in the creation/provisioning flow read that admin-only-RLS table through the caller's own
session instead of a privileged client, so each silently saw "no mapping" for exactly the population this
flow exists to serve. Fixed: removed the redundant, non-authoritative preflight in
`src/app/api/events/create/route.ts` (the RPC's own `SECURITY DEFINER` check already guarantees the
FR-019 zero-write contract on its own); switched the genuine TOCTOU re-check in
`src/lib/plannerEventProvisioning.ts` and the staff-auto-sync read in `src/lib/plannerStaffSync.ts` to the
already-available `portalAdmin` service-role client; removed the equivalently-blind advisory UI check in
`CreateEventModal.tsx`. No RLS/policy or migration change — the restrictive policy was correct and
intentional. Live-verified end-to-end with a real non-platform-admin org-admin session against the real
route: creation, Planner provisioning, canonical link, and creator staff-sync all now succeed; the
zero-write missing-mapping guarantee, platform-admin creation, cross-tenant denial, and ordinary-member
denial were all re-confirmed live and unaffected. Full details in `schema-reference.md`'s changelog entry
of the same date. Feature 005 manual browser verification remains paused pending review of this fix.

---

## Progress

### Phase 1 — Foundation

- [x] Next.js 14 + TypeScript + Tailwind scaffold
- [x] Auth (login/signup/forgot-password/reset-password)
- [x] `middleware.ts` — session + `global_role = 'admin'` gate, with role-cache cookie
- [x] `event-assets` storage bucket + RLS
- [x] Database types (`types/database.ts`, hand-maintained)

### Phase 2 — Organization Layer

- [x] Organizations, org people, org teams
- [x] `OrganizationContext`
- [x] Org asset library (`org-assets` bucket + `AssetPickerModal`)
- [x] User provisioning API routes (service-role, silent account creation)
- [x] Org-wide activity log page

### Phase 3 — Event Switcher & Editor Shell

- [x] `EventContext` + events list + `CreateEventModal`
- [x] `EventLayout` — 16-tab bar + wizard "Next" button
- [x] `eventSectionMeta.ts` — single source of truth for tabs

### Phase 4 — Content Sections (all 16 have working editor pages)

- [x] Dashboard
- [x] Basics
- [x] Hero & Branding
- [x] Theme Colors
- [x] Terminology
- [x] Facilitators (CSV import path)
- [x] Agenda
- [x] Activities
- [x] Networking
- [x] FAQs
- [x] Info Center
- [x] Emergency
- [x] Gallery
- [x] Games
- [x] Members
- [x] Activity Log (per-event)

### Phase 5 — Quick Correctness Fixes ✅ Built (2026-08-19)

- [x] Games — `type` is now a `<select>` constrained to `jeopardy`/`kmky` (matches the live `game_type` enum, verified via MCP); list view shows the friendly label
- [x] Facilitators — `role_type` (Speaker/Presenter select) and `linkedin_url` (url input) added to the manual form, the CSV column spec, sample rows, and row parser/validation (`role_type` must be `speaker`/`presenter` if provided)
- [x] Basics — `disabled_menu_items` checkbox grid for the exact 8 CHECK-constrained keys, with inline copy explaining why Gallery/Help-FAQs aren't listed and that Networking is controlled separately
- [x] `types/database.ts` updated to match: `events.disabled_menu_items: string[]`, `facilitators.role_type`/`linkedin_url`, `GameType` narrowed from `string` to `'jeopardy' | 'kmky'`
- [x] `npm run type-check` and `npm run lint` both clean — no errors, no new warnings

**Not done:** no browser verification against a live event (no browser tool available this session) — recommend a manual pass before considering this fully shipped.

### Phase 6 — Agenda: Multi-Speaker & Breakout Rooms ✅ Built (2026-08-19)

- [x] Multi-speaker assignment via `agenda_session_speakers` — inline repeatable list (facilitator + speaker_type, up/down reorder), replaces the single legacy `facilitator_id` `<select>`
- [x] Legacy `facilitator_id` auto-synced to the first assigned speaker (or `null`) on every save, per the confirmed decision
- [x] `breakout_rooms` jsonb editor — full nested editor: rooms (name/description/facilitator_name, reorderable) each with their own repeatable mini-agenda (title/description/start/end/location)
- [x] Reordering via up/down buttons (`moveItem` helper) — no `@dnd-kit` introduced, matches its "not yet adopted" status
- [x] `types/database.ts` synced: `agenda_sessions.breakout_rooms` added (was missing)
- [x] `ui-registry.md` updated with the new repeatable/nested-list panel pattern
- [x] `npm run type-check` and `npm run lint` both clean — no new warnings
- **Design refinement vs. the original plan:** speakers can now be added to a brand-new (not-yet-saved) session in the same save action — the plan's "save the session first" limitation turned out avoidable since the insert's returned id is available before the speaker writes happen, so it was dropped.
- **Not done:** no browser verification (no browser tool available this session); CSV import intentionally left untouched (still legacy single-facilitator only), per the agreed-scope decision.

### Cross-Cutting — Edit Form Modal Fix ✅ Built (2026-08-19)

Not part of the mobile-parity work — a UI bug reported directly: every list-based section's add/edit form rendered as an inline panel above the list, so editing an item near the bottom of a long list yanked the page back to the top with no visual link to what was clicked.

- [x] New shared `components/portal/FormModal.tsx` — centered modal, backdrop-click-to-close, top-right X close button.
- [x] Converted to `FormModal`: `facilitators`, `agenda` (session form), `activities`, `faqs`, `emergency` (contact form + image form), `info-center`, `networking` (add-question form), `games` (game form + question form), `EditProfileModal`.
- [x] `games`' game-form modal already existed but was refactored onto the shared component (was previously a one-off implementation with no close button).
- [x] `ui-rules.md` and `ui-registry.md` updated with the rule and the component entry so this doesn't regress on the next section built.
- [x] `npm run type-check` and `npm run lint` both clean, no new warnings.
- **Deliberately left inline, not converted:** `CsvImportModal` (a different flow — import, not edit); the tiny inline "add option" form inside each Networking question card (genuinely contextual, rendered next to the specific card, not the page-jump bug).
- **Not done:** no browser verification (no browser tool available this session).

### Phase 7 — Members: Resend Access Code ✅ Built (2026-08-20)

- [x] "Resend Access Code" action per member on `members/page.tsx` — confirmed via `useConfirm()`, calls `issue_event_access_code` RPC then the `send-event-access-code-email` Edge Function in sequence; the plaintext code never touches component state or the UI, only a success/error toast.
- [x] Guard: errors immediately (no confirm dialog, no RPC call) if the member has no email on file.
- [x] Per-row `resendingCode` loading state, button reads "Sending…" while in flight.
- [x] `library-docs.md` gained a new "RPCs and Edge Functions" section documenting this pattern for reuse, plus a real drift fix caught in passing: the doc's Supabase client example showed `createClient` from `@supabase/supabase-js`, but the actual `supabaseClient.ts` uses `createBrowserClient` from `@supabase/ssr` — corrected.
- [x] `npm run type-check` and `npm run lint` both clean, no new warnings.
- **Original view/issue/revoke scope still blocked if ever wanted** — `event_user_access_codes`'s missing `portal_is_global_admin()` RLS bypass is real and unfixed, but resend-only never reads that table, so this build wasn't affected by it.
- **Not done:** no browser verification (no browser tool available this session) — in particular, the actual Resend email delivery (env-configured `RESEND_API_KEY`) couldn't be end-to-end tested from here.

### Phase 8 — Activities: Image Uploads ✅ Built (2026-08-19)

- [x] Hero image slot (`ImageField`, single `activity_images` row, `image_type='hero'`)
- [x] Gallery images — repeatable list with the same diffed add/update/delete pattern as Agenda's Speakers, reorder via `moveItem`
- [x] `rating` now editable (number input, 0–5, step 0.5) — was display-only
- [x] `ImageField` extracted to `components/portal/ImageField.tsx` (2nd consumer); `moveItem` extracted to `lib/reorder.ts` (2nd consumer) — both docs updated
- [x] `npm run type-check` and `npm run lint` both clean, no new warnings
- **Flagged, not fixed:** live `media_type` enum has 5 values, not the 2 `schema-reference.md` documents for this table — see `build-plan.md` Phase 8 for detail. Not a portal bug; flagging for whoever maintains that doc.
- **Not done:** no browser verification (no browser tool available this session); activity list-view thumbnails intentionally left out of scope.

### Phase 9 — Event Photos (new section) ✅ Built (2026-08-20)

- [x] New `event-photos` tab, registered in `eventSectionMeta.ts` (17th tab) — `gallery` untouched, still moderates `posts`.
- [x] `event_photos` CRUD via `FormModal` + `ImageField`/`AssetPickerModal` (org-assets, same as Activities/Event Photos), caption, `display_order`, `is_featured`.
- [x] List view is a card grid with hover-reveal actions (Edit/Feature/Delete), reusing Gallery's visual presentation — new pattern captured in `ui-registry.md`.
- [x] `uploaded_by` stamped from the current admin (`useAuth()`'s `user.id`) on organizer-seeded photos.
- [x] `npm run type-check` and `npm run lint` both clean — caught and fixed one real lint **error** (not just a warning) along the way: an unescaped apostrophe in the empty-state copy (`react/no-unescaped-entities`).
- [x] `architecture.md` and `project-overview.md`'s route listings updated (16 → 17 sections) — these are the two files that explicitly enumerate every tab and would otherwise silently go stale each time a new section ships.
- **Not done:** no browser verification (no browser tool available this session).

### Phase 10 — New Section: Excursions & Categories ✅ Built (2026-08-20)

- [x] New `excursions` tab (18th tab), registered in `eventSectionMeta.ts`
- [x] Master-detail layout (categories left, selected category's excursions right) reusing Games' existing two-column pattern — now documented in `ui-registry.md` as a named, reusable pattern since it has a 2nd consumer
- [x] `excursion_categories` CRUD — label + icon (emoji or Ionicons name, free text, no picker) + "Apply to all events" toggle; `key` auto-derived from label, never shown in the UI (matches `schema-reference.md`'s guidance)
- [x] `excursions` CRUD — title/description/image (`ImageField` + `AssetPickerModal`) + the same global-vs-event-scoped toggle
- [x] Category deletion checks for child excursions first (`excursions.category_id` has no `ON DELETE CASCADE`, confirmed live via MCP) and asks to delete-with-children rather than failing on a FK violation
- [x] Category name collisions handled gracefully — catches Postgres `23505` (violates the live `UNIQUE (event_id, key)` constraint, also confirmed via MCP before building) and shows a friendly message instead of the raw DB error
- [x] `types/database.ts` gained `excursion_categories`/`excursions` (previously absent — one of the 4 newer tables that predate the hand-maintained type file)
- [x] `architecture.md`/`project-overview.md` route counts updated (17 → 18); `project-overview.md`'s old "Activities/excursions" line (written before Excursions existed as its own page) split into two accurate lines
- [x] `npm run type-check` and `npm run lint` both clean, no new warnings
- **Not done:** no browser verification (no browser tool available this session).

### Phase 11 — New Section: Expo Directory ✅ Built (2026-08-20)

- [x] New `expo` tab (19th tab), registered in `eventSectionMeta.ts`
- [x] `expo_spaces` CRUD — flat row-list (Facilitators-style), `is_exhibitor`/`is_sponsor` as two independent checkboxes defaulting `true`/`false` (matches the live column defaults, and avoids the "both true" bug `schema-reference.md` explicitly warns about)
- [x] Reused Phase 10's global-vs-event-scoped toggle pattern directly — no new design needed, confirmed `expo_spaces` has the identical nullable-`event_id` convention (no unique/CHECK constraints on this table, verified via MCP before building — simpler than Excursions' categories)
- [x] `chips` (`text[]`) — new chip/tag-input pattern, reusing Networking's existing pill visual style; flagged in `ui-registry.md` as a first-use candidate for extraction once Phase 12's `news_items.themes` needs the identical pattern
- [x] `cta_description` intentionally left out of the form — `schema-reference.md` confirms it's currently unused in-app
- [x] `types/database.ts` gained `expo_spaces`
- [x] `architecture.md`/`project-overview.md` route counts updated (18 → 19)
- [x] `npm run type-check` and `npm run lint` both clean, no new warnings
- **Not done:** no browser verification (no browser tool available this session).

### Phase 12 — New Section: News Feed ✅ Built (2026-08-20)

- [x] New `news` tab (20th tab), registered in `eventSectionMeta.ts`
- [x] `news_items` CRUD — row-list matching Expo Directory's style; `is_featured` as an independent per-row toggle (any number can be featured, confirmed not a single-pick); `body` as one large textarea with a hint about the blank-line-paragraph convention (never modeled as an array); `registration_url` and `read_time_minutes` both optional with hints explaining their fallback behavior in-app
- [x] `TagInput` extracted from Expo Directory's inline chip UI into `components/portal/TagInput.tsx` — News Feed's `themes` is its 2nd consumer, exactly as flagged when Phase 11 shipped. `expo/page.tsx` refactored to use the shared component too, no more duplicate implementation.
- [x] `display_order` deliberately **not** exposed in the form — `schema-reference.md` confirms the app sorts this table by `published_at desc` and never reads `display_order` at all; the portal's own list fetch matches that same real sort order instead of the column
- [x] Reused Phase 10's global-vs-event-scoped toggle again — this table's RLS is tighter than Excursions/Expo (`(event_id IS NOT NULL) AND is_event_host_or_organizer(...)`, organizer-only), but the portal's global-admin bypass covers it the same way; confirmed via MCP before building, no unique/CHECK constraints on this table
- [x] `types/database.ts` gained `news_items`
- [x] `architecture.md`/`project-overview.md` route counts updated (19 → 20)
- [x] `npm run type-check` and `npm run lint` both clean — caught and fixed a raw double-quote in JSX text (same `react/no-unescaped-entities` class of error as Phase 9) before it ever hit lint
- **Not done:** no browser verification (no browser tool available this session).

### Phase 13 — New Section: Attendee Travel Details ✅ Built (2026-08-20)

- [x] New `attendee-travel` tab (21st tab), registered in `eventSectionMeta.ts`
- [x] Master-detail layout (3rd consumer of that pattern) — attendee picker (searchable, sorted alphabetically) on the left, selected attendee's travel entries on the right
- [x] **Deviation from the build-plan's exploratory suggestion, noted not hidden:** built the attendee picker as a direct `event_members` query (same shape as `members/page.tsx`'s own fetch) instead of reusing `useOrgPeople` — read that hook first and it's organization-wide (queries `organization_members`, plus a second query joining every event assignment across the whole org), which is heavier and less correct for a picker that only needs to answer "who's in *this* event."
- [x] `type` (flight/ground_transfer/other, matches the live CHECK constraint), `title`, `date`/`boarding_time`/`travel_time` as free-text fields (never real date/time inputs — they're genuinely free text in the schema, not parseable), `route` with a hint that it falls back to Origin/Destination if left blank, `pickup_vehicle`/`pickup_location` shown always (not conditionally hidden by type) to keep the form predictable, matching how Emergency Contacts doesn't hide fields by its own `type` enum either
- [x] Writes always stamp a real `event_id` — this table's organizer-write RLS requires `event_id IS NOT NULL`, unlike Excursions/Expo/News, so there's no "apply to all events" toggle here
- [x] `types/database.ts` gained `attendee_travel_details`
- [x] `architecture.md`/`project-overview.md` route counts updated (20 → 21)
- [x] `npm run type-check` and `npm run lint` both clean, no new warnings, no lint errors this time
- **Not done:** no browser verification (no browser tool available this session).

**This closes out all four new-section phases (9–13) from the mobile-parity gap analysis.** Only Phase 14 (Leaderboard, nice-to-have) and Phase 15 (Hardening, unrelated to mobile parity) remain from the full Phase 5–15 plan.

### UI Fix — Scrollable Event Tab Bar ✅ Built (2026-08-20)

- [x] User tested the live app after Phase 13 shipped the 21st tab and found the tab bar overflowing the viewport with no visual hint more tabs existed — `overflow-x-auto` was already present but gave zero affordance.
- [x] `EventLayout` (`src/app/portal/events/[eventId]/layout.tsx`) reworked: left/right chevron buttons (matching `TopHeader`'s icon-button styling, scaled to 32px) now flank the `<nav>`, shown conditionally based on tracked scroll position (`scroll`/`resize`-listening effect on a `navRef`); clicking scrolls by ±240px with `behavior: 'smooth'`.
- [x] Each tab `<Link>` gained `data-active={active}`; a `pathname`-keyed effect scrolls the active tab into view on navigation, so deep-linking to a tab scrolled out of view (e.g. a bookmarked URL near the end of the list) still reveals it.
- [x] The `border-b border-outline-variant` underline moved off the scrolling `<nav>` onto its wrapping `<div>` so it stays continuous regardless of whether the chevrons are shown.
- [x] `ui-registry.md`'s `EventLayout` entry updated with the new classes and pattern notes.
- [x] `npm run type-check` and `npm run lint` both clean — no new warnings introduced (all lint warnings present are pre-existing, unrelated to this file).
- **Not done:** no browser verification (no browser tool available this session) — the user should confirm the chevrons appear/scroll correctly against the real 21-tab bar.

### UI Fix — Portal Shell Overflow & Scroll Architecture ✅ Built (2026-08-20)

- [x] **Root cause found, not patched around:** the previous shell (`src/app/portal/layout.tsx`) made `OrgSideNav` `position: fixed` — which removes it from flex flow entirely — while still sizing the content column with `lg:flex-1 lg:ml-[280px]`. A fixed sibling doesn't reduce a flex container's available width, so the content column computed at ~100% width and was then shoved an *additional* 280px right by the margin: a real, silent ~280px horizontal overflow. `src/app/layout.tsx` had `overflow-x-hidden` on `<body>`, which hid the overflow rather than fixing it — exactly why the Import button on Facilitators (and the last tab, before the earlier tab-scroll fix) rendered clipped with no way to reach it.
- [x] `OrgSideNav.tsx`: sidebar is now `fixed` only below `lg:` (off-canvas slide-in drawer, unchanged mobile behavior); at `lg:` it's `lg:static`, rejoining the flex row as a genuine sibling so its 280px width is actually subtracted from the content column's available space by flexbox itself — no manual margin arithmetic to keep in sync.
- [x] `portal/layout.tsx`: root shell is now `h-screen overflow-hidden` (was `min-h-screen`, allowing body-level scroll); content column `flex flex-col h-full min-w-0 lg:flex-1`; `<main>` is the **one** scroll container (`flex-1 min-w-0 overflow-y-auto custom-scrollbar`), replacing whole-page browser scrolling with a single contained region using the app's existing thin `custom-scrollbar` styling instead of the OS default scrollbar.
- [x] `src/app/layout.tsx`: removed `overflow-x-hidden` from `<body>` — no longer needed once the actual overflow source was fixed; leaving it would have re-masked any future regression of this same class.
- [x] `events/[eventId]/layout.tsx`: tab bar wrapper is now `sticky top-0 z-20 bg-background` so it stays pinned while event content scrolls beneath it (resolves correctly now that `<main>` is the real scroll ancestor); the event title/breadcrumb above it deliberately stays non-sticky, matching "only the tab nav needs to stay visible." **Revised same day:** user clarified they wanted the whole header (title included) static from the first scroll pixel, not scrolling away before the tabs pin — moved `sticky top-0 z-20 bg-background` from the tab row alone to the wrapper around both the title row and tab row, so the entire header reads as pinned immediately and only the per-tab page content scrolls.
- [x] **Follow-on fix, same day:** user reported a visible gap above the sticky header once scrolled — a strip showing leftover scrolled-past agenda content peeking through above "All Events." First attempt: `-mt-4 sm:-mt-gutter pt-4 sm:pt-gutter` on the sticky wrapper (negative margin cancels `<main>`'s inherited top padding, matching padding re-adds the same visual space) — verified this compiled correctly in the actual built CSS (`.next/static/css/app/layout.css`, both base and `sm:` variants present), but the user reported the leak was still there after this shipped.
- [x] **Second attempt, replacing `sticky` entirely:** rather than keep tuning sticky-offset arithmetic that wasn't matching observed behavior, restructured `EventLayout` so the header is a genuine flex sibling (`flex-shrink-0`) of a dedicated scroll region (`flex-1 min-h-0 overflow-y-auto`), both children of a `flex flex-col h-full` root — no `position: sticky` anywhere, so there's no shared scroll box for anything to leak through by construction. This root's `h-full` resolves against `<main>`'s flex-computed height, so `<main>`'s own scrollbar never triggers on event routes (capped exactly to fit); only the inner region scrolls. `min-h-0` required on that region — same class of fix as `min-w-0` from the app-shell overflow bug, just on the vertical axis this time.
- [x] `ui-registry.md`'s `EventLayout` entry rewritten to document this as the preferred pattern over sticky-in-padded-scroll-container for any future pinned-header need.
- [x] Verified all three existing `<table>` usages (Members, `OrgPeoplePanel`, `EventsOverviewPanel`) already wrap in their own `overflow-x-auto` container — they'll now correctly self-scroll instead of forcing the whole page wider, since `min-w-0` is properly set up the flex chain.
- [x] Facilitators rows tightened for density (see `ui-registry.md`'s "Compact row list" entry) — ~96px rows down to ~64–72px, scoped to Facilitators only per what was reported.
- [x] `ui-registry.md` updated: new "Portal App Shell" entry, `OrgSideNav` entry rewritten, `EventLayout` entry's tab-bar-wrapper classes updated for the sticky behavior, new "Compact row list" entry for Facilitators.
- [x] `npm run type-check` and `npm run lint` both clean, no new warnings.
- **Not done:** no browser verification at the specific viewport widths requested (1920/1600/1440/1366/1280/1024px) — no browser tool available this session. The fix is reasoned from the actual CSS/flex mechanics (fixed elements don't participate in flex sizing; `min-width: auto` is the default on flex items unless overridden), not observed in a running browser — the user should confirm the Import button, tab bar, and sticky/scroll behavior render as expected before considering this closed.

### Bug Fix — Dashboard Crash on Missing Section Checks ✅ Built (2026-08-20)

- [x] **Real regression, not a layout issue:** Dashboard (`events/[eventId]/dashboard/page.tsx`) throws `Cannot read properties of undefined (reading 'kind')` and won't render at all, surfaced via a browser console dump from the running app. Root cause: `SECTION_CHECKS` (keyed by `EVENT_SECTIONS` key, used to compute each section's completion badge and the overall setup-progress percentage) was never updated when Phases 9–13 added five new tabs to `EVENT_SECTIONS` — `attendee-travel`, `excursions`, `expo`, `news`, `event-photos` had no entry, so `SECTION_CHECKS[s.key]` was `undefined` for those and `.kind` on `undefined` crashed the whole page render.
- [x] Added all five missing entries: `attendee-travel` → `attendee_travel_details` (unscored — not every event needs travel logistics), `excursions` → `excursions` (scored), `expo` → `expo_spaces` (scored), `news` → `news_items` (scored), `event-photos` → `event_photos` (unscored, same treatment as `gallery`'s `posts` count — decorative/supplementary, not a required setup step).
- [x] **Follow-on correctness fix caught while touching this:** the count query only ever filtered `.eq('event_id', eventId)`, which would undercount `excursions`/`expo_spaces`/`news_items` for events relying on global (`event_id IS NULL`) rows — per the documented global-vs-event-scoped toggle pattern (`ui-registry.md`). Added a `GLOBAL_CAPABLE_TABLES` set so those three tables' count query uses `.or('event_id.eq.{eventId},event_id.is.null')` instead, so a correctly-configured global excursion/exhibitor/news item isn't shown as "Not started."
- [x] `npm run type-check` and `npm run lint` both clean, no new warnings.
- **Lesson for future phases:** `EVENT_SECTIONS` (`eventSectionMeta.ts`) is the tab source of truth, but `SECTION_CHECKS` in `dashboard/page.tsx` is a second, easy-to-forget place that must stay in sync with it — any future new section needs an entry here too, or the Dashboard crashes outright rather than degrading gracefully. Worth flagging in `build-plan.md`/`ui-registry.md` as a required step whenever a new tab ships.
- **Not done:** no browser verification (no browser tool available this session) — the user's own console dump is what surfaced this, so it should be re-checked in the running app to confirm the Dashboard now renders cleanly for an event with all section types.

### Bendie Planner Integration ✅ Built (2026-09-11)

Cross-project integration with Bendie Planner (a separate Expo/React Native app for event
organizers, its own Supabase project). Full Spec Kit workflow followed: constitution → spec →
plan → tasks → analyze → Phase A live verification → implementation, at `specs/001-bendie-planner-integration/`.

- [x] New per-event, opt-in link (`event_planner_links`) — one Portal event ↔ one Planner event,
  enforced by a **partial unique index** on `planner_event_id` (`WHERE is_active = true`) so an
  unlinked Planner event can be reused by a different Portal event later, matching the "actively
  linked" wording in the approved spec. New "Bendie Planner" tab (`bendie-planner/page.tsx`) is
  the control surface — link/unlink, member sync status, agenda push, travel pull.
- [x] **Members (Portal → Planner, automatic)**: staff-tier roles only (host/organizer/admin/
  facilitator/staff/speaker) — ordinary attendees are never synced. Identity bridged by email;
  Planner has no `auth.users` → `profiles` auto-seed trigger (confirmed live), so a missing
  Planner account is created explicitly, with partial-failure handling so an auth user is never
  silently treated as fully provisioned if the profile insert fails. Fire-and-forget from all four
  existing provisioning paths in `members/page.tsx` — a Planner-side failure never fails the
  Portal provisioning action it's attached to. Bundled fix: `handleAddAllOrgMembers`/
  `handleAssignTeam` were missing the `pointCurrentEventAt` call that `handleAddMember`/
  `importMemberRow` already had — same "missing event" bug flagged previously, fixed here since
  it's the same hook point this feature needed anyway.
- [x] **Agenda (Portal → Planner, manual)**: "Push to Planner" button, idempotent (upserts on
  `agenda_sessions.planner_agenda_item_id`, never duplicates), never deletes Planner-side content.
  Speaker names are flattened via the same two-flat-queries-joined-in-code pattern `agenda/page.tsx`
  already uses — not a PostgREST embedded select, which was never actually used/verified anywhere
  in this codebase.
- [x] **Travel (Planner → Portal, manual)**: "Pull from Planner" button, flight + hotel only
  (ground transfer deferred). Matching is scoped to the linked event's own members by email;
  unmatched Planner passengers are skipped and reported, never attached to the wrong person.
  Planner-sourced rows are marked with `source_planner_key` and enforced read-only via two new
  **restrictive** RLS policies on `attendee_travel_details` (blocking client `INSERT`/`UPDATE`
  when `source_planner_key IS NOT NULL`) — `SELECT`/`DELETE` stay governed by the table's existing
  policies, since the approved spec's "read-only" language is consistently edit-scoped, not
  delete-scoped. The pull route's writes go through the Portal service-role client specifically —
  the authenticated client would be blocked by the same restrictive policies.
- [x] Migration `supabase/migrations/bendie_planner_integration.sql` — no numeric prefix; live
  verification found this repo's actual migration-naming convention dropped the old `NNN_` scheme
  after `018`, so the file matches every migration since.
- [x] `src/lib/plannerAdmin.ts` — shared, `server-only`-guarded service-role client for Planner's
  project (the one exception to this codebase's per-route-inlined service-role client pattern,
  justified by 5 new routes needing an identical cross-project client).
- **Not done / deferred (explicitly out of scope, not an oversight):** ordinary-attendee sync,
  ground-transfer sync, agenda breakout/sub-item sync, automatic/continuous agenda sync, agenda
  delete-sync, organization-level Planner linking, role-change/removal sync, an automatic retry
  system for failed syncs.
- **Live-verified in a follow-up session (2026-09-13)**, once the real `PLANNER_SUPABASE_SERVICE_ROLE_KEY`
  was supplied: a full real browser + real dev server pass exercised every `quickstart.md` scenario
  end-to-end (linking, duplicate-link rejection, unlink, cross-event reuse-after-unlink, staff-tier
  sync with real Planner identity/assignment creation, attendee exclusion, agenda push idempotency
  and update-in-place, no-delete-on-push, travel pull matching/idempotency/value-refresh, the
  restrictive-RLS negative tests via a genuine non-service-role client, and the non-admin
  authorization checks). All temporary test accounts/data were created and fully deleted afterward.
  **Two real bugs were found and fixed in the process:**
  1. `attendee_travel_details`'s dedupe key was originally a *partial* unique index
     (`WHERE source_planner_key IS NOT NULL`) — correct in intent, but PostgREST's
     `.upsert(..., { onConflict: 'event_id,source_planner_key' })` cannot target a partial index
     without repeating its predicate, so every real travel pull failed with `"there is no unique or
     exclusion constraint matching the ON CONFLICT specification"`. Fixed by replacing it with a
     plain `UNIQUE (event_id, source_planner_key)` constraint — Postgres never treats two `NULL`s as
     conflicting, so manual rows were never actually at risk either way; the partial predicate was
     protecting against something that couldn't happen, at the cost of breaking the real upsert.
  2. The travel-pull route only added a Planner passenger to the `unmatchedEmails` report when they
     *had* an email that failed to match — a passenger with no email on file at all was silently
     dropped from the count entirely, under-reporting exactly the case FR-022 most needs surfaced.
     Fixed to report every unmatched traveler regardless of reason, using a name-based fallback
     label when no email exists.
  Both fixes were retested live and confirmed; `lint`/`type-check`/`build` were rerun clean after
  each.
- **JSM `/code-review` hardening pass (2026-09-13)**, verdict APPROVED WITH MINOR FINDINGS: fixed 4
  of 7 findings — unchecked query errors in `planner-pull-travel` (was silently reporting a failed
  Planner query as "nothing to pull"), unwrapped `getPlannerAdminClient()` calls in two routes (now
  matches `planner-sync-member`'s existing try/catch), a profile-lookup failure in
  `planner-sync-member` misreported as "no email on file", and a documented-but-unenforced
  `planner_sync_status` CHECK constraint (closed via a corrective migration,
  `add_planner_sync_status_check.sql`; live rows were all `NULL`, safe to add). 2 findings — a
  Planner-side `event_user_assignments` concurrency race, and a lost-response duplicate-insert edge
  case in agenda push — were investigated in depth but left as accepted residual risk: both genuine
  fixes require a Planner-side schema change, and this feature does not own or modify Planner's
  schema (confirmed again by checking that every plausible existing free-text column on
  `event_agenda_items` is already in real use by Planner's own data — there was no safe way to reuse
  existing schema for the second one). 1 finding (`STAFF_ROLES` duplicated across two files) was
  left as-is — no existing shared constant of that shape exists in this codebase to centralize it
  into. See `plan.md`'s Remaining Technical Risks for the full write-up of both accepted risks.
- **Planner schema hardening (2026-09-14)**: the user explicitly approved closing the two
  previously-accepted residual risks with real Planner-side schema changes. Live introspection
  before applying anything found `event_user_assignments` **already** carries a live
  `UNIQUE (event_id, profile_id)` constraint (contradicting the earlier "no unique constraint"
  finding from the original T033 pass — that finding is now known to be stale) with zero existing
  duplicates, so no Planner DDL was needed for the concurrency fix — only
  `planner-sync-member/route.ts` was changed to a database-backed `.upsert(..., { onConflict:
  'event_id,profile_id' })` against that existing constraint, closing the race atomically. For the
  agenda lost-response case, one new Planner-side column was applied via `apply_migration` on the
  `supabase-planner` MCP (Planner's own tracked migration history):
  `event_agenda_items.source_portal_session_id uuid NULL`, guarded by a plain
  `UNIQUE (event_id, source_portal_session_id)` — deliberately plain, not partial, learning directly
  from the earlier `attendee_travel_details` upsert bug. `planner-push-agenda/route.ts` now always
  upserts on that key. Both fixes were live-verified, including a genuine concurrency test for the
  assignment race and a simulated lost-response state for the agenda case. See `data-model.md` and
  `plan.md` for full detail.
- **Second JSM `/review` pass (2026-09-14)**, 10 further findings triaged with the user: 6 fixed now
  (identity-creation race, ILIKE wildcard identity mismatch, silently-swallowed `pointCurrentEventAt`
  errors, an unhandled worker rejection in `runWithConcurrency` that could strand the CSV/bulk-import
  UI mid-import, a stale `organizationId` source in the two bulk member-add paths, and an incorrect
  travel date/time fallback chain), 2 fixed as small/mechanical (a guaranteed no-op Planner-sync HTTP
  call from attendee-only bulk adds; two raw Tailwind color classes swapped for real design tokens
  where one existed), 1 deferred by explicit instruction (sequential per-session writes in the agenda
  push loop — a throughput concern, not correctness), 1 no-action (role-change re-sync — confirmed
  already out of MVP scope per `spec.md`'s Assumptions).
  - `planner-sync-member/route.ts`: email lookups now escape `%`/`_` before `ilike()` (previously a
    real identity-misrouting risk — live-verified against a same-shaped decoy Planner profile that
    an unescaped `_` would have wrongly matched); `createUser()` failures of any shape (not just the
    clean `email_exists` code — live-verified that real concurrent load can surface a noisier error
    for the same underlying race) now trigger a bounded re-fetch recovery instead of a permanent
    failure. Live-verified with 6 simultaneous first-time syncs for one person converging on exactly
    one Planner identity.
  - `members/page.tsx`: `pointCurrentEventAt` now surfaces select/update errors to every caller
    instead of discarding them; the two bulk-add paths now resolve `organizationId` via the same
    `resolveOrganizationId()` fetch `handleAddMember`/CSV import already used (closing the
    possibly-stale-context risk for real, not just partially), and skip the guaranteed-no-op
    Planner-sync call entirely for their hardcoded-attendee inserts.
  - `csvImport.ts`'s `runWithConcurrency` now takes a required `onWorkerError` mapper so a thrown
    (not just returned-as-failed) worker item settles the batch instead of rejecting it outright —
    all three real callers (`CsvImportModal`, `bulk-create-users/route.ts`, `members/page.tsx`'s bulk
    paths) updated; live-verified the pure function directly (a genuinely throwing item is isolated,
    the batch still settles, other items are unaffected).
  - `planner-pull-travel/route.ts`: flight `boarding_time`/`date` are now derived by one explicit
    rule (date from `date_time` only, time from `depart_time` falling back to `departuretime`) —
    live-verified against 4 representative flight rows covering the real production shape, a missing
    time, and a missing date; the old code could produce a raw time string where a date was expected.
  - `bendie-planner/page.tsx` (`failed` status badge → `bg-error-container`/`text-on-error-container`)
    and `attendee-travel/page.tsx` ("From Planner" badge → `bg-secondary-container`/
    `text-on-secondary-container`) now use real tokens where one existed; the `succeeded` (green)
    badge was left as a raw class — no success/green token exists anywhere in this project's design
    system (`tailwind.config.js` only defines primary/secondary/tertiary/error).
  All temporary test accounts/data (Portal and Planner) were created and fully deleted afterward.

### Organization Product Entitlements & Event Product Foundation ✅ Built (2026-09-16)

Feature 002 of the "Planner Portal Experience" initiative — the first foundational feature toward
turning the Portal into a multi-product platform (Bendie / Bendie Planner / both). Followed the
full Spec Kit workflow (specify → plan → tasks → analyze → implement) at
`specs/002-event-product-model-organization-mapping/`. **Schema/types/docs only — zero UI, zero
API routes, zero change to the current Bendie experience or to feature 001.**

- [x] **`organization_members` was NOT created — it already existed live** (composite PK, role
  `CHECK` constraint, `is_organization_member()`/`is_organization_admin()` RLS helpers, already
  used across 9 existing files). This was the single most important finding of this feature's
  planning phase — an earlier draft assumed it needed to be built before live inspection found it
  already fully wired up.
- [x] **`organization_products`** (new) — organization-level product entitlement
  (`organization_id`, `product_key` `'bendie'|'planner'`, `is_active`, `enabled_at`/`enabled_by`).
  Platform-admin-only write; organization members can read their own organization's entitlements
  only.
- [x] **`event_products`** (new) — which product(s) an event uses. A real, unbypassable database
  constraint (a composite FK to `organization_products`, plus a consistency trigger modeled
  directly on `event_members`'s own existing `enforce_event_member_integrity()`) makes it
  impossible for an event to use a product its organization isn't entitled to.
- [x] **`organization_planner_links`** (new) — durable Portal-organization ↔ Bendie-Planner-organization
  mapping, tenant-isolated via `UNIQUE (planner_organization_id)` (the same Planner organization
  can never be mapped from two different Portal organizations). Platform-admin-only, no
  Planner-organization creation of any kind.
- [x] Backfill derived entitlement/product rows only from real existing data (never a blanket
  grant) — every organization with ≥1 event got `bendie`; every organization with ≥1
  *actively-linked* event additionally got `planner`; matching `event_products` rows for every
  event. Two-phase, order-dependent within one migration (organization entitlements before event
  products, since the FK requires the former first). Live result: 6 `organization_products` rows,
  16 `event_products` rows — idempotency re-confirmed by re-running the backfill.
- [x] **`event_planner_links` (feature 001) is completely untouched** — same schema, same
  semantics. An event using both products never auto-creates a link; that stays feature 001's
  separate, manual mechanism, confirmed via a full live regression pass (linking, staff sync,
  agenda push, travel pull all re-verified working after the migration).
- [x] Full live verification: all 20 `tasks.md` verification tasks (T009–T028, T001–T008 being
  setup/schema/type work) passed against the real database — backfill correctness, idempotency,
  the entitlement invariant, the org-consistency trigger, duplicate rejection on both new tables,
  cascade-on-delete at both the event and organization level, RLS (member reads own org only,
  every write path platform-admin-only, no self-service membership/promotion/entitlement-granting),
  platform-admin cross-tenant access with zero fake memberships, and multi-organization membership
  (confirmed via existing real data — a user with 6 organization memberships mixing `member`/`owner`
  roles). All temporary test accounts/data (Portal and Planner) were created and fully deleted
  afterward.
- [x] `lint`/`type-check`/`build` all clean.
- **Not done / deferred, explicitly out of scope for this feature:** any UI (organization/product
  selector, dashboard switcher, entitlement management), automatic Planner organization/event
  creation, billing/subscriptions/payments, invitations, non-global-admin Portal access. All belong
  to later features in this same initiative.

### Organization & Event Access Foundation ✅ Built (2026-09-15)

Feature 003 (`specs/003-organization-event-access-foundation/`). Opens `/portal` to authenticated
customer organization members (not just `profiles.global_role = 'admin'`), while establishing a
strict, live-verified separation between organization membership and event content access —
without building product-aware event creation or any Planner workspace module (deferred to a
future Feature 004).

- [x] **Portal admission widened** (`middleware.ts`) — platform admins unchanged; a customer is
  admitted only if they hold ≥1 live `organization_members` row (checked via a new, similarly
  60s-cached `portal_org_membership_cache` cookie, reusing the existing role-cache pattern). A
  customer with zero memberships lands on a new safe empty state, `/portal/no-access`
  (`src/app/portal/no-access/page.tsx`), never `/unauthorized`. The cache is admission-UX-only —
  every resource-level check re-derives its answer live from RLS/`organization_members`, never
  trusts the cookie.
- [x] **New RLS policy** — `events_select_org_admin` (migration
  `organization_admin_event_metadata_visibility.sql`) lets an organization `owner`/`admin` see
  event *metadata* (id, name, status, dates, `event_products`) for every event in their own
  organization without an `event_members` row, reusing the existing `is_organization_admin()`
  helper verbatim. Additive only — `event_members` and all content-table RLS are untouched.
- [x] **New server-side authorization module**, `src/lib/eventAuth.ts` —
  `canViewEventMetadata` / `requireEventWorkspaceAccess` (event *workspace/content* access,
  requiring both an explicit `event_members` row **and** that the event belongs to the caller's
  currently *selected* organization — a real gap found during `/speckit.analyze`: a multi-org user
  can legitimately hold `event_members` in more than one organization) / `isProductActiveForOrg` /
  `isProductAvailableForEvent` (`organization_products.is_active = true` **and** a matching
  `event_products` row — mere row existence is never sufficient).
- [x] **`EventContext`/event layout workspace guard** — a successful `events` row fetch no longer
  implies workspace access (the new metadata policy above would otherwise let an org admin's tab
  shell render for events they hold no `event_members` on). `EventContext` now independently calls
  `requireEventWorkspaceAccess`; the event layout renders a forbidden state instead of the tab
  shell when it's denied, live-verified against the exact "org admin can see metadata but not
  content" attack scenario.
- [x] **Product-aware navigation, enforced as access control, not just UX** — `EVENT_SECTIONS`
  gained a `product: 'bendie' | 'planner' | 'shared'` field (all 24 existing tabs classified
  `'bendie'`; no tab is `'planner'` yet — no Planner workspace module exists to classify). The
  event layout both hides an unavailable product's tab link *and* blocks direct URL navigation to
  it (a second `/speckit.analyze` finding: navigation filtering alone would not have stopped a
  bookmarked/direct URL from reaching real content once an entitlement went inactive).
- [x] **`getAccessibleEvents()`** (`src/lib/portalAuth.ts`) gained a real non-admin branch — one
  organization-scoped query, letting RLS (not client-side role branching) determine which rows come
  back per caller. It previously hard-returned `[]` for every non-admin.
- [x] **Security-compatibility fix found during `/speckit.analyze`, not originally in scope**:
  live inspection found `events_insert_creator` RLS permitted *any* organization member (not just
  owner/admin) to create events, and `organizations_insert_creator` permitted *any* authenticated
  user (no membership at all) to create a new organization — both harmless only because middleware
  previously blocked all non-admins from `/portal`. A second migration,
  `event_and_organization_creation_admin_restriction.sql`, tightens both back to their effective
  pre-feature scope (event creation: org owner/admin; organization creation: platform-admin-only),
  with the "New Event"/"New Organisation" UI triggers gated to match
  (`events/page.tsx`, `portal/page.tsx`, `QuickActionsCard.tsx`, `TopHeader.tsx`).
- [x] Full live verification against the real database and running app (real temporary test
  users/organizations/events, fully cleaned up afterward): the org-admin-metadata-vs-workspace
  attack scenario, cross-tenant denial, multi-org role isolation (admin in Org A / member in Org B
  never gets Org-A-level visibility in Org B), the selected-organization-scoping gap, active/inactive
  product-entitlement gating (including a temporary, restored `is_active` flip on a real
  organization), the two creation-restriction RLS changes (both denial and continued-capability
  paths), platform-admin bypass with zero `organization_members`/`event_members` rows, Feature 001's
  `bendie-planner` tab and all 5 `planner-*` API routes (still independently admin-gated,
  unaffected), and Feature 002's `organization_products`/`event_products`/`organization_planner_links`
  row counts and RLS all confirmed unchanged.
- [x] `lint`/`type-check`/`build` all clean (only pre-existing, unrelated warnings).
- **Not done / deferred, explicitly out of scope for this feature:** product-aware event creation
  (Bendie/Planner/Both picker), automatic `event_products` creation at event-creation time, Planner
  organization creation/linking UI, Planner event provisioning, any Planner workspace module,
  event-organization reassignment (explicitly prohibited). All belong to a future Feature 004.

#### Corrective pass (independent post-implementation review) ✅ Built (2026-09-15)

An independent `/code-review` after the initial 51/51-task pass found 2 BLOCKING gaps and 4 lower-
severity findings. All are now addressed (2 fixed as designed, 1 fixed with a bug found and
corrected mid-verification, 1 fixed conservatively, 2 investigated and explicitly documented rather
than silently changed):

- [x] **F-R1 (BLOCKING, fixed)** — `EventLayout` (`src/app/portal/events/[eventId]/layout.tsx`)
  previously fell through to render `children`/the tab shell while the workspace/product
  authorization checks were still pending, not just while denied. Rewritten as an explicit
  CHECKING → AUTHORIZED/DENIED state machine — a loading skeleton renders for both the workspace
  check and the per-tab product-availability check; nothing protected mounts until both resolve.
- [x] **F-R2 (BLOCKING, fixed)** — the Members page (`members/page.tsx`) had no management-role
  guard (any `event_members` row, including `attendee`, got the full role-management UI), and
  `event_members_update_self_or_host`'s RLS separately permitted a user to change their **own**
  `role` unconditionally — a live self-role-escalation path once Feature 003 admitted ordinary
  customers. Fixed at both boundaries: a new migration
  (`event_members_role_self_promotion_guard.sql`, finalized as
  `event_members_role_guard_role_setting_fix.sql` after two live-verification-driven corrections —
  see below) adds a `BEFORE UPDATE` trigger rejecting any `role` change unless the caller is a
  platform admin or `is_event_host_or_organizer(event_id)`; the Members page itself now fails
  closed on that same predicate before rendering anything.
  **Bug found and fixed during this same pass's own live verification**: the first two attempts at
  exempting legitimate service-role writes from the new trigger (`current_user = 'service_role'`,
  then `session_user = 'service_role'`) were both wrong — `current_user` reflects the function
  owner inside a `SECURITY DEFINER` trigger, and `session_user` is always the pooled `authenticator`
  role under this project's PostgREST connection setup regardless of caller. The correct signal,
  confirmed via a temporary debug probe, is `current_setting('role', true) = 'service_role'`.
- [x] **F-R5 (security-adjacent, fixed)** — the Bendie Planner integration tab
  (`bendie-planner/page.tsx`) is an administrative Feature 001 surface (all 5 `planner-*` API
  routes have only ever authorized platform admins) that previously relied entirely on the old
  admin-only `/portal` gate. Added a platform-admin-only page guard (fail-closed, same pattern as
  F-R2); its `product: 'bendie'` navigation classification is unchanged (product classification and
  administrative role are different concerns).
- [x] **F-R4 (handled conservatively)** — org/event managers admitted to the Members page under
  Feature 003 could see "Import CSV"/"Add Member" controls that 403 server-side (both call
  platform-admin-only `create-user`/`bulk-create-users` routes, correctly left unweakened). Those
  two controls are now hidden for non-platform-admin managers, with an inline note that new-account
  provisioning remains a deferred capability; "Add All Organisation Members"/"Assign a Team"
  (existing-account only) remain visible.
- [x] **Re-audit performed** across all 24 event tabs for the same pattern: found that ~15 ordinary
  content tables (agenda, facilitators, activities, etc.) grant write access to any `event_members`
  row, not host/organizer/admin-restricted — assessed as pre-existing, deliberately-hardened
  collaborative-content-editing design (no privilege/role column involved, unlike `event_members`),
  not a second privilege escalation. No code changed for this.
- [ ] **F-R3 (documented, not fixed)** — `events_insert_creator`'s org-creator fallback clause is
  pre-existing (predates Feature 003) but is now more practically reachable under widened admission.
  Reported as an explicit open decision for before `/speckit.converge`, not silently resolved either
  way — see `specs/003-organization-event-access-foundation/research.md` addendum item 18.
- [ ] **F-R6 (documented, deferred)** — duplicated `canCreateEvent` authorization effect between
  `events/page.tsx` and `portal/page.tsx`; LOW-severity maintainability debt, no security impact.
- [x] **Additional bug found and fixed live during this pass's own verification (not one of the
  original review findings)**: `EventContext.loadEvents()` unconditionally overwrote
  `currentEventId`/`currentEvent` with "the first accessible event" once its own network call
  resolved, racing against — and deterministically beating — `EventLayout`'s synchronous
  `setCurrentEvent(eventId)` for the event actually named in the URL. Live-observed effect:
  navigating directly to a workspace-denied event silently displayed a *different*,
  legitimately-accessible event's dashboard instead, with the URL still showing the denied event's
  id. Fixed with an `explicitEventIdRef` that `loadEvents()` now defers to regardless of async
  resolution order; re-verified live.
- [x] Full live regression re-run after all corrections: self-role-escalation denied, legitimate
  manager role-changes preserved, non-role self-updates preserved, Members/Bendie-Planner forbidden
  states correctly rendered for unauthorized roles, the event-selection race fixed and re-verified,
  platform-admin behavior preserved, Feature 001/002 unaffected, all temporary test data cleaned up.

#### Second corrective pass (second independent review) ✅ Built (2026-09-15)

A second independent `/code-review` found the first corrective pass incomplete in three ways.
All four findings are now resolved:

- [x] **R2-F1 (F-R3 now actually resolved)** — the product decision was made explicitly:
  historical creator identity is audit data, not authorization. `events_insert_creator` no longer
  contains the `organizations.created_by = auth.uid()` fallback — only
  `created_by = auth.uid() AND is_organization_admin(organization_id)` remains. Live-verified: a
  former creator removed from an organization's membership is denied event creation; current
  owner/admin, platform admin, ordinary member, unrelated user, and a manipulated `organization_id`
  all behave exactly as the approved rule requires.
- [x] **R2-F2/R2-F3 (EventContext redesign)** — the first pass's `explicitEventIdRef` fix closed
  only one specific race. Replaced with two coordinated mechanisms: `latestEventIdRef` (every async
  writer of `currentEvent`/`canAccessWorkspace` compares its own target event against this before
  committing state, discarding stale out-of-order responses) and `hasExplicitEventRef` (scoped to
  the navigation lifecycle via a new `clearCurrentEvent()` call on `EventLayout` unmount, instead of
  permanently latching after the first event visit). Live-verified across authorized↔unauthorized
  navigation, rapid back-and-forth sequences, leaving the event route, and switching organizations.
- [x] **R2-F4 (Planner sync metadata database-layer protection)** — the first pass's Bendie Planner
  fix was UI-only; `event_members.planner_sync_status`/`planner_sync_error` remained readable by any
  ordinary event member via a direct client query. Consumer-mapped first (3 real consumers found),
  then fixed with column-level database privileges. **A first attempt was live-tested and found not
  to work** — `REVOKE SELECT (columns)` while a table-level SELECT grant remained is a documented
  PostgreSQL no-op (the table-level grant subsumes column REVOKEs); confirmed by inspecting
  `pg_class.relacl` directly. Corrected: revoke the table-level SELECT entirely, then grant SELECT
  back only on the safe columns; platform-admin reads now go through a new `SECURITY DEFINER`
  function, `get_event_planner_sync_status()`, which re-verifies `portal_is_global_admin()` itself.
  Live-verified: direct customer read denied (`42501`), unrelated columns still readable, RPC denies
  non-admins and serves admins correctly, and the real Feature 001 write path (an admin's own
  authenticated-session `UPDATE`, not service-role) is unaffected since only SELECT was revoked.
- [x] Role-escalation guard and its service-role exemption re-confirmed unweakened after touching
  `event_members` migrations again.
- [x] Full 23-item live security regression re-run; `lint`/`type-check`/`build` all clean; all
  temporary test data and the diagnostic probe function used to root-cause the R2-F4 first-attempt
  failure cleaned up; baseline (7 organizations, 16 events) unchanged.
- [x] `lint`/`type-check`/`build` all clean after the corrective pass.

#### Third corrective pass (third independent review) ✅ Built (2026-09-15)

A third independent review found six remaining issues, five database/reproducibility-focused
(R3-F1, R3-F2, R3-F3, R3-F5) and two `EventContext` concurrency/consistency issues (R3-F4, R3-F6).
On investigation, R3-F2, R3-F3, and R3-F5's database fixes, and R3-F4/R3-F6's `EventContext`
redesign, were found **already implemented and (for the database fixes) already live** from an
earlier, uncommitted session of this same corrective pass — this pass's job was to verify each is
actually correct and complete (not assume it), close the one gap it found, and bring everything
under documentation/tasks.md, since none of it had been recorded there yet.

- [x] **R3-F1 (migration ordering, fixed via documented bootstrap order, not a rename)** —
  `add_planner_sync_status_check.sql` sorts alphabetically *before*
  `bendie_planner_integration.sql` (the migration that adds the column the CHECK constraint
  targets). Empirically reproduced against a disposable local Postgres 15 container: naive
  alphabetical replay crashes with `column "planner_sync_status" does not exist`, aborting the
  whole replay — no later corrective migration can fix this, since the replay never reaches
  anything after a hard crash. This repository has no `supabase/config.toml`, no installed CLI
  convention, and no script anywhere globs this directory (confirmed by full-repo search) — the
  only real apply mechanism is the Supabase MCP `apply_migration` tool, order-independent of local
  filenames. Fix: `supabase/migrations/MIGRATION_ORDER.md`, a manifest documenting the exact
  required fresh-bootstrap order (derived from the live project's actual `list_migrations` history,
  the ground truth), declared the one supported bootstrap process for this repo — replacing, not
  supplementing, any assumption of naive alphabetical replay. Neither original file was renamed or
  edited, per this repository's migration-immutability rule. Re-tested empirically in the correct
  order: succeeds.
- [x] **R3-F2 (authorization helper functions, already fixed live, verified + one gap closed)** —
  `supabase/migrations/000_authorization_helper_functions_baseline.sql` (found already applied live,
  version `20260915130254`) brings `portal_is_global_admin`, `is_global_admin`,
  `is_organization_member`, `is_organization_admin`, `is_event_member`, `is_event_host_or_organizer`,
  and `is_event_manager` under version control — all were previously live-only, referenced by
  migrations from `006_global_admin_rls_bypass.sql` onward with no `CREATE FUNCTION` anywhere in
  committed history. Verified byte-for-byte against live `pg_get_functiondef()` output — exact
  match, not reconstructed from memory. Full dependency audit (grepping every `public.<fn>(` call
  across all committed migrations against every `CREATE FUNCTION` in them) found one more gap the
  review didn't name: `public.set_updated_at()`, called by a `CREATE TRIGGER` in Feature 002's
  `organization_and_event_product_foundation.sql`, also had no committed source. Closed with a new
  migration, `shared_trigger_helper_functions_baseline.sql`, applied live (idempotent no-op against
  the current database) and verified byte-identical to the live definition.
- [x] **R3-F3 (role-guard final-state replay, already fixed live, verified)** — the
  `event_members` role-immutability trigger function went through four migrations live, in true
  chronological order ending with the correct, service-role-exempting body — but the four filenames
  sort alphabetically in the *opposite* order, which would leave the *original, broken* body in
  place after a naive replay (no error, silently wrong). Already fixed (found already applied live,
  version `20260915130515`) via `zz_event_members_role_guard_final_authoritative.sql`, named to sort
  after every other filename in this repository and re-apply the correct body with
  `CREATE OR REPLACE FUNCTION` regardless of what ran before it. Empirically re-verified against the
  disposable Postgres container: replaying all five files in pure alphabetical order still ends with
  the correct, service-role-exempting body. Unlike R3-F1, this class of problem (silently-wrong
  final state, not a hard crash) is fully self-healing by a later-sorting corrective file — no
  manifest entry was required for correctness, though the pair is documented in
  `MIGRATION_ORDER.md` for completeness.
- [x] **R3-F4 (EventContext ABA staleness, already redesigned, verified + one bug fixed)** — found
  `EventContext.tsx` already rewritten (uncommitted) to two independent generation counters
  (`eventGenerationRef` for `currentEvent`/`currentEventId`/`events`; `workspaceGenerationRef` for
  `canAccessWorkspace`/`workspaceAccessChecked`, bumped unconditionally on every run of the
  workspace-check effect regardless of which dependency triggered it) — the correct fix for the
  second corrective pass's `latestEventIdRef` gap (it compared a response's target eventId against
  "the current eventId," which cannot distinguish two different requests for the *same* event,
  exactly R3-F4's X→Y→X case). Full async-writer audit performed as required found one real,
  previously-unflagged bug: three early-return branches in the org-switch effect's `loadEvents()`
  forced `setLoading(false)` unconditionally on a *stale* (superseded) response, which could
  prematurely clear the loading indicator while a newer, still-in-flight generation's own fetch was
  the one that should own that state. Fixed by removing the forced clears from the two genuinely
  stale branches, leaving only the properly generation-gated `finally` block (and the one
  non-stale early-return, which is unaffected) responsible for `loading`. Verified via a standalone
  deterministic script using deferred promises (not browser timing),
  `specs/003-organization-event-access-foundation/verify-event-context-aba.mjs`: both the
  same-event ABA case (X₁→Y→X₂, X₂ resolves first, X₁ resolves last) and the cross-organization ABA
  case (Org A/X₁→Org B→Org A/X₂, stale Org A/X₁ resolves last) pass — the stale response is
  correctly discarded in both.
- [x] **R3-F6 (events-array organization consistency, already fixed)** — found already implemented:
  `loadEvents()` now calls `setEvents(fullEvents)` for the current generation regardless of whether
  an explicit event route is active, and only the *auto-selection* step below that (choosing and
  fetching a default `currentEvent`) is suppressed by `hasExplicitEventRef`. An organization switch
  also now clears `events` to `[]` immediately (not just `currentEvent`/`currentEventId`) while the
  new organization's fetch is in flight, so `events` can never continue silently representing the
  previous organization. Verified by code inspection of the exact control flow (not re-forced with a
  live adversarial timing test this pass, consistent with the second pass's own documented
  precedent for this class of guarantee).
- [x] **R3-F5 (Planner-status RPC EXECUTE lockdown, already fixed live, verified)** — found already
  applied live (version `20260915130736`): `REVOKE EXECUTE ON FUNCTION
  public.get_event_planner_sync_status(uuid) FROM PUBLIC, anon`. Verified via `pg_proc.proacl`
  directly: only `postgres`, `authenticated`, and `service_role` hold EXECUTE — no PUBLIC or `anon`
  grant remains. The function's internal `portal_is_global_admin()` check is untouched and remains
  the actual authorization boundary for which `authenticated` caller succeeds.
- [x] **Full dependency/reproducibility audit performed** (not limited to the six named findings):
  compared all 26 locally-committed migration files against the live project's full 62-entry
  `list_migrations` history. Finding: **36 migrations applied live have no committed `.sql` source
  at all** (`015_fix_storage_allow_all_and_org_assets` through
  `allow_global_admin_update_any_profile`, spanning teams, storage, leaderboard/points, chat,
  notifications, facilitators, and more — all pre-dating Feature 001 and unrelated to it), plus one
  Feature-001-era migration (`fix_attendee_travel_details_planner_key_constraint`) and two temporary
  debug migrations. Of ~58 live `public` schema functions, only 14 have committed source (the 7 in
  `000_authorization_helper_functions_baseline.sql`, `set_updated_at`, `get_event_planner_sync_status`,
  `enforce_event_member_role_immutability`, `enforce_event_product_org_consistency`, and the 3 audit-log
  functions in `014_activity_log_setup.sql`) — confirming **a brand-new database cannot reach the
  current live schema/security state from committed migrations alone**, for reasons entirely
  predating and unrelated to Feature 003. Per this repository's scope-discipline rule
  (`AGENTS.md` — document and flag pre-existing issues, fix only what blocks the current feature),
  this gap is documented here and in `context/schema-reference.md`'s "Fresh-bootstrap
  reproducibility" section, not reconstructed — recreating ~36 historical migrations from live
  state was judged clearly out of this pass's scope and too risky to attempt without being asked
  (mirrors R3-F2's own "do not reconstruct security-sensitive functions from guesses" instruction,
  applied to the broader gap it sits inside). Within Feature 003's own migrations specifically, no
  ordering violation beyond R3-F1/R3-F3 was found (one filename/true-order mismatch was found
  between `organization_admin_event_metadata_visibility.sql` and
  `organization_and_event_product_foundation.sql` but confirmed functionally inconsequential — the
  two touch independent policy/table domains).
- [x] Live re-confirmation (read-only) that nothing touched by earlier passes regressed:
  `events_insert_creator`/`organizations_insert_creator` policy text, `event_members` Planner-column
  SELECT grants (still excluding the 4 Planner columns for `authenticated`/`anon`), and all
  `events`/`organizations` RLS policy text match the second corrective pass's documented final
  state exactly.
- [x] `lint`/`type-check`/`build` (`next build`) all clean; no new warnings in any file this pass
  touched. No temporary test data was created this pass (all verification was read-only live
  queries plus a disposable, fully-torn-down local Postgres container used only for the R3-F1/R3-F3
  ordering proofs).

#### F-NEW-1 correction (final narrow verification's one new finding) ✅ Built (2026-09-15)

The final narrow verification (post-third-review) found one new MEDIUM finding: R2-F4/R3-F5's
Planner-metadata hardening closed SELECT and RPC EXECUTE exposure but never applied the same fix to
UPDATE — `authenticated`/`anon` still held table-level UPDATE/INSERT on `event_members` covering the
four Planner-managed columns, letting an ordinary event member forge their own row's Planner sync
state (e.g. `planner_sync_status = 'succeeded'`) via a direct PostgREST call.

- [x] **Fixed at the database privilege layer**, not RLS, not a new RPC —
  `event_members_planner_metadata_update_privilege_fix.sql` revokes the table-level INSERT/UPDATE
  grant from `authenticated`/`anon` and re-grants both only on the existing customer-safe column set,
  mirroring the proven SELECT fix exactly. INSERT was closed alongside UPDATE, a deliberate small
  scope addition (documented, not silent): the self-insert policy has the identical root cause and
  would otherwise leave an equivalent forgery path open at row creation.
- [x] **A second pitfall found live while verifying the fix itself**: `GRANT INSERT, UPDATE
  (column_list) ON t TO role` only applies the column list to the last-listed privilege — the first
  applied version silently left INSERT unrestricted at the table level. Caught via direct
  `pg_class.relacl` inspection, corrected to two separate single-privilege `GRANT` statements.
- [x] **Legitimate Feature 001 write path preserved**: `planner-sync-member/route.ts`'s two
  `event_members` UPDATE calls now use the Portal service-role client instead of the caller's
  authenticated session — the same established pattern its sibling route
  (`planner-pull-travel/route.ts`) already uses for an equivalent system-managed-field problem. No
  new RPC introduced.
- [x] Live-verified against the real Postgres privilege engine (rolled-back transactions, no
  residual state): ordinary `authenticated` role denied UPDATE on all four Planner columns and
  denied INSERT setting them; safe-column UPDATE still passes; `service_role` UPDATE of Planner
  columns still passes. Role-escalation guard and Planner SELECT restriction re-confirmed unweakened.
- [x] `lint`/`type-check`/`build` all clean.

## Feature 006 — Product-Level Navigation & Product-Aware Event Discovery ✅ Built (2026-09-17)

Full Spec Kit lifecycle run (`/architect` → `/speckit.specify` → `/speckit.clarify` → `/speckit.plan`
→ `/speckit.tasks` → `/speckit.analyze` [1 High + 2 Medium finding, corrected, re-analyzed PASS] →
`/speckit.implement`), documented in `specs/006-product-navigation-event-discovery/`. Resolves the
carry-forward requirement Feature 005 identified: the Portal now has an explicit product axis
(Bendie / Bendie Planner), orthogonal to organization selection, with event discovery correctly
scoped per product.

- [x] New routes `/portal/bendie`, `/portal/bendie/events`, `/portal/planner`,
  `/portal/planner/events`, `/portal/no-product`; existing `/portal/events/[eventId]/...` workspace
  routes fully preserved and unchanged in structure.
- [x] `/portal` and `/portal/events` converted to thin redirects to the resolved default product
  (Bendie-only → Bendie, Planner-only → Planner, both active → Bendie, none active → no-product) —
  the actual Overview/Events UI moved to new shared, product-parameterized components
  (`OrganizationHome.tsx`, `OrganizationEventsList.tsx`), reused by both products.
- [x] Event discovery filters at the query layer: `useOrgEvents` gained an optional `product`
  parameter using a PostgREST inner-join embed on `event_products` (never `event_planner_links`) —
  confirmed live against the real fixture that a Bendie-only event is excluded from the Planner
  query and vice versa, with zero duplicate rows for a Both event.
- [x] URL-derived `ProductContext` (no persistence, no competing source of truth) and a product
  switcher added to `TopHeader.tsx`'s existing organization-switcher visual pattern.
- [x] Event entry from a product-aware surface carries an explicit `?product=` origin signal;
  `EventLayout`'s existing one-directional Planner-only landing effect (Feature 005) was generalized
  into the full bidirectional Both-event/mismatched-origin contract, strictly after the existing
  workspace-authorization gates.
- [x] Deliberate in-event product switching (distinct from mismatched-origin redirects, per an
  explicit clarification) resolved via a click-time `isProductAvailableForEvent` check — corrected
  mid-analysis (finding H1) away from an initially-planned but non-existent `EventLayout`-state data
  path.
- [x] Organization-switch-from-event-workspace hardened (finding L1) with a transition flag so
  switching organizations from inside an event never flashes a misleading "no access" message.
- [x] New controlled test fixture: "Stawi Escape — Both Test" created via the real, unmodified
  Feature 004 creation RPC + retry-provisioning flow (not a raw insert) — see
  `schema-reference.md`'s 2026-09-17 entry. Feature 004/005's existing fixture events untouched.
- [x] Zero migrations, zero new HTTP APIs, zero DB persistence of product selection. Regression audit
  (greps + diffs) confirmed no touch to Feature 001 Planner admin/sync, Feature 002
  entitlement/membership semantics, Feature 003's `requireEventWorkspaceAccess`, Feature 004's
  creation/provisioning route, or Feature 005's Planner Overview module.
- [x] `lint`/`type-check`/`build` all clean.
- [ ] Manual browser acceptance (Phase 17, 13 tasks) — intentionally left to the user; see the
  session's implementation report for the exact checklist.

## Feature 004 — Event Product Selection & Planner Provisioning ✅ Built (2026-09-16)

Full Spec Kit lifecycle run (`/architect` equivalent → `/speckit.specify` → `/speckit.clarify` →
`/speckit.plan` → `/speckit.tasks` → `/speckit.analyze` → `/speckit.implement`), documented in
`specs/004-event-product-selection-planner-provisioning/`. Makes event creation product-aware and
closes a pre-existing gap: the previous creation flow (`CreateEventModal.tsx`'s direct browser
`INSERT`) wrote only an `events` row — no `event_products`, no `event_members` — for **any** product
mix, meaning a newly created event's own creator had no workspace access to it under Feature 003's
access model. Also adds the genuinely new capability of provisioning a real Bendie Planner event (and
its Portal-side counterpart mapping) when Planner is selected.

- [x] **Product-aware creation, atomic Portal foundation**: new `SECURITY DEFINER` RPC
  `create_event_with_products` atomically creates the `events` row, its `event_products` (Bendie-only,
  Planner-only, or Both — never inferred, never silently expanded), the creator's `event_members`
  row (`role='admin'`, uniform across all three product mixes), and the initial Planner-provisioning
  state, behind a new server route (`POST /api/events/create`) replacing the old direct client insert.
  Own internal authorization/entitlement/mapping re-verification, independent of the calling route
  (defense in depth) — including a mapping re-check added during `/speckit.analyze` to close a TOCTOU
  gap the first implementation draft would have missed.
- [x] **Planner provisioning**: for Planner-only/Both selections, a synchronous cross-database
  orchestration (`src/lib/plannerEventProvisioning.ts`) provisions a real Planner-side event using a
  deterministic, collision-proof `event_code` (`'PORTAL-' || events.id`), recovers rather than
  duplicates on retry, and writes the counterpart via the **existing, unmodified** `event_planner_links`
  table — no second mapping concept introduced. An explicit five-column provisioning-state machine on
  `events` (`not_required`/`pending`/`provisioning`/`succeeded`/`failed`) replaces relying on link
  presence/absence as a proxy signal.
- [x] **`event_planner_links` semantic broadening handled**: `event_planner_links` now legitimately
  represents both Planner-only and Both events, not only Both as under Feature 001's original design.
  Audited all 5 Feature 001 Planner routes; found (confirmed via direct code inspection, not assumed)
  that `planner-push-agenda` and `planner-pull-travel` gated solely on link existence — both now also
  require `'bendie'` in `event_products`, since their entire purpose is moving *Bendie*-side content.
  `planner-sync-member` (staff/counterpart access) correctly left ungated — access is not
  product-specific. The creator's own staff-eligible sync now reuses this exact same capability
  (extracted to `src/lib/plannerStaffSync.ts`, shared by both the admin route and the new creation
  flow) rather than a second implementation.
- [x] **Provisioning-column security, closing a near-repeat of Feature 003's F-NEW-1 finding**: the
  five new `events` provisioning columns are system-managed. `/speckit.analyze` found the first
  migration draft restricted only `SELECT`, leaving `INSERT`/`UPDATE` fully exposed via `events`'
  existing table-level grant + `events_update_host_organizer`'s RLS (which now covers the creator this
  feature itself grants `admin` on their own event) — closed with the full table-level-revoke-then-
  explicit-regrant pattern for all three privilege types, covering only the 33 pre-existing columns.
- [x] **Idempotency, both layers**: creation-request idempotency (`event_creation_requests`, keyed by
  a client-generated UUID, now comparing the full payload — not just the key — after `/speckit.analyze`
  found the first draft would have silently returned an unrelated event on a conflicting-payload
  reuse) and Planner-provisioning idempotency (the deterministic `event_code` as lookup-before-insert
  anchor, including an explicit `mapping_drift` failure path for the case where a Planner event already
  exists under a *different* Planner organization than the one currently mapped — also found and closed
  during `/speckit.analyze`, previously undefined).
- [x] **Concurrency**: a compare-and-swap `UPDATE ... WHERE planner_provisioning_status IN
  ('pending','failed')` claim, not an advisory lock (the Planner HTTP call isn't inside a database
  transaction) — a losing concurrent attempt makes no Planner API call at all.
- [x] `lint`/`type-check`/`build` all clean against the full implementation.
- [x] **Migrations applied and live-verified**: both Supabase projects were in scheduled maintenance
  for part of this session (all code/migration files were written in the meantime); once they returned,
  all 4 migrations were applied and independently re-verified (`pg_class.relacl`,
  `information_schema.column_privileges`, `pg_proc.proacl`/`proconfig`). `create_event_with_products`
  was exercised end-to-end for Bendie-only, Planner-only (through to a real linked Planner event), and
  Both selections; both `/speckit.analyze` HIGH findings and both MEDIUM findings were each
  independently reproduced and confirmed fixed against the real privilege engine; the Feature 001
  guards were confirmed both necessary and effective; Feature 003 hardening re-confirmed unweakened.
  All temporary test data cleaned up; baseline counts on both projects (7 orgs/16 events; 2 orgs/13
  events) exactly restored. Five narrow scenarios (deliberate Planner-side failure injection, a
  multi-actor retry-endpoint HTTP matrix requiring a running server, and three related failure/recovery
  permutations) were not independently exercised as isolated tests — see
  `specs/004-event-product-selection-planner-provisioning/tasks.md`'s "Implementation status" note for
  the exact accounting and the one genuine design note it surfaced (a row stuck at `provisioning` from
  a real crash is not auto-recovered by retry — a documented, intentional MVP limitation, not a gap).

### Phase 14 — Games: Leaderboard Admin View (nice-to-have)

- [ ] Read-only panel calling `get_leaderboard(p_event_id, p_limit)`

### Phase 15 — Hardening (independent of mobile-feature parity)

- [ ] MFA/TOTP enforcement for privileged roles (documented as required, not implemented — `requiresMFA()` only checks role)
- [ ] Networking Questionnaire Builder drag-to-reorder (`@dnd-kit` installed, not wired in)
- [ ] Resolve `ComingSoonPanel.tsx` — currently dead code, decide wire-up vs. removal
- [ ] Automated test coverage (no test suite exists yet)
- [ ] Portal upload UI for the `event-files` bucket (mobile app already reads it)
- [ ] Verify `types/database.ts` against live schema (it's hand-maintained, drift risk)

### Feature 004 post-review corrective pass (2026-09-16)

An independent review found five actionable findings, all resolved and live-verified — see
`specs/004-event-product-selection-planner-provisioning/research.md` §21 and `tasks.md` Phase 12
(T091–T109) for full detail:

- **R1**: `PlannerProvisioningBanner` now truthfully distinguishes a recently-`pending`/`provisioning`
  event from one stale past `PLANNER_PROVISIONING_STALE_AFTER_MS` (`src/lib/
  plannerProvisioningStaleness.ts`, 5 minutes) — shows a "contact your administrator or support"
  message for the stale case, never a Retry button for `provisioning` either way. No automatic
  stale-reclaim was added; a genuinely stuck row still requires manual/admin database intervention
  (unchanged, accepted MVP limitation).
- **R2**: `contracts/retry-planner-provisioning.md` corrected — it previously falsely claimed the
  retry endpoint defensively reclaims a stuck `provisioning` row.
- **R3**: `create_event_with_products` (new migration `create_event_with_products_race_auth_
  validation_fix.sql`) now wraps its creation sequence in a `BEGIN…EXCEPTION WHEN unique_violation`
  block so a concurrent same-idempotency-key race recovers gracefully (loser's own rows roll back via
  the implicit SAVEPOINT, then it returns the winner's event) instead of surfacing a raw `23505`.
- **R4**: authorization is now re-checked before the idempotency-replay fast-return path in the same
  function — a caller who loses their organization role can no longer replay an old idempotency key to
  read back an existing event.
- **R5**: duplicate values in `p_products` (e.g. `['bendie','bendie']`) now raise a clean
  `invalid_request` instead of a raw `event_products_pkey` violation; product order is canonicalized
  for idempotency comparison only.

### Feature 005 — Planner Event Workspace Foundation ✅ Built (2026-09-16)

Full Spec Kit lifecycle (architecture discovery → `/speckit.specify` → `/speckit.clarify` →
`/speckit.plan` → `/speckit.tasks` → four `/speckit.analyze` passes with narrow correction cycles in
between → `/speckit.implement`), at `specs/005-planner-event-workspace-foundation/`. The first real
Planner-facing screen inside Portal: a read-only Planner Overview, usable by any ordinary event
workspace member (not only platform admins), plus a fix for a foundation-only gap Feature 004
deliberately left open.

- [x] **Architecture correction, made before specifying anything**: the sibling repo initially assumed
  to be Bendie Planner's client (`Evently-App`) turned out, on live inspection, to be Bendie's own
  attendee-facing app sharing Portal's database — Bendie Planner has no local client source anywhere in
  this workspace. Every Planner-specific fact in this feature is grounded in the live Bendie Planner
  Supabase schema/RLS (inspected via the `supabase-planner` MCP) and this codebase's own existing
  Feature 001/004 integration code instead.
- [x] **Data-source correction, found during `/speckit.clarify`**: the originally-assumed session-status
  source (`session_status_realtime`/`session_summary_realtime`/`overall_session_summary`) was live-verified
  to have a usable row for only 1 of Bendie Planner's 13 live events, and to be internally inconsistent
  even there (a real bug in Planner's own refresh job). The Overview's session/production summary was
  narrowed to what a separate, genuinely reliable materialized view — `event_summary_realtime` — actually
  supports: a total session count and a date-derived event phase, not a pending/active/completed
  breakdown. Verified live (this session) to return a real `number_of_sessions = 0` row for zero-session
  events, not a missing one — a legitimate ready state, never treated as an error.
- [x] **Planner Overview** (`src/app/portal/events/[eventId]/planner-overview/page.tsx`, backed by
  `GET /api/events/[eventId]/planner-overview`) shows event identity (title, description, location,
  start/end/setup date) and the session summary above. Explicitly excludes attendee count, participants,
  flights, accommodation, transfers, staff identities, task/checklist/vendor content, blueprints,
  notifications, and agenda content — none of those are touched by this feature.
- [x] **New narrow server-only data-access module**, `src/lib/plannerOverview.ts` — one explicit-column
  read against `event_summary_realtime` (`getPlannerOverviewSummary`) and one pure precedence function
  (`resolvePlannerOverviewStatus`) implementing the provisioning/link-state precedence table exactly:
  `planner_provisioning_status` is evaluated *before* counterpart-link presence, so an active
  `event_planner_links` row is never treated as sufficient authority to load Planner data once status
  says `failed` (or while it's still `pending`/`provisioning`). Reuses Feature 004's existing
  `isPlannerProvisioningStale()` unchanged — no second state machine.
- [x] **`src/lib/eventAuth.ts` adaptation**: `requireEventWorkspaceAccess`/`isProductActiveForOrg`/
  `isProductAvailableForEvent` gained an optional, defaulted `client: SupabaseClient` parameter (plain
  `SupabaseClient`, not `SupabaseClient<Database>` — matching this codebase's existing untyped-client
  convention) so the new server route can reuse the identical Feature 003 authorization logic with its
  own cookie-bound server client, instead of forking a second copy. Every existing call site (which
  passes no fourth argument) is unchanged — confirmed by the whole-project `type-check` passing.
- [x] **Live-verified, not assumed**: `event_planner_links` has exactly one RLS policy
  (`FOR ALL USING (portal_is_global_admin())`) — an ordinary caller's own session can never read it, even
  for their own event. The new route resolves the canonical counterpart via the Portal service-role
  client for this one lookup, exactly matching how `plannerEventProvisioning.ts` already *writes* to this
  table. Missing this would have silently reported "unavailable" to every ordinary event member.
- [x] **Deterministic Planner-only landing**: one `useEffect` added to `EventLayout`
  (`src/app/portal/events/[eventId]/layout.tsx`), keyed on the same product-availability state the tab
  bar already computes — when Bendie is unavailable and Planner is available on the (still hardcoded,
  unchanged) `.../dashboard` entry point, it redirects to `.../planner-overview` instead of rendering the
  existing blocked state. Bendie-only and Both events take no new code path (Bendie stays available for
  both, so the condition never matches) — no other entry-point link needed touching.
- [x] **Navigation**: exactly one new `EVENT_SECTIONS` entry, `planner-overview`, classified
  `product: 'planner'` — reuses the existing product-filtering/route-blocking mechanism Feature 003 built
  unchanged. No product switcher, no placeholder tabs for future Planner modules.
- [x] **Verification performed this session**: `lint`/`type-check`/`build` all clean, zero new warnings.
  The provisioning/link precedence function was unit-tested standalone against all 10 named state
  combinations (10/10 passed, including both explicitly-flagged contradictory ones). The exact
  `event_summary_realtime` and `organization_products`/`event_products` queries were live-verified against
  a temporary real fixture (organization, event, product/link rows) for both a zero-session and a
  33-session Planner event, then fully deleted. Static checks (grep-confirmed) verified no reference to
  `event_user_assignments`, `attendees`, or the excluded Planner views anywhere in the new files, and that
  the route accepts no client-suppliable input beyond the URL's own event id.
- **Not performed this session, explicitly left as open verification rather than assumed**: full
  browser/HTTP-level walkthroughs (real login, real navigation, observing actual rendered states) for the
  navigation/landing/UI-rendering scenarios and the remaining regression checks against Features
  001/002/003/004 — see `tasks.md`'s "Implementation-pass verification status" note for the exact
  accounting of what was and wasn't exercised, and why.
- [x] **Post-implementation review corrections (2026-09-16, same day)**: `/code-review` found 5 genuine
  defects (F1–F5, all Medium/Low) in the shipped code above; all five fixed, no migration, no scope
  expansion. F1 — the organization-selection fallback in the new route only handled a `null`
  `current_organization_id`, not a **stale** one (set but no longer a valid membership); corrected to
  mirror `OrganizationContext`'s exact fallback (`accessible.find(o => o.id === saved) ?? accessible[0]`),
  re-verified with a standalone 5-case unit test. F2 — `bendie-planner`'s tab classification
  (`product: 'bendie'` since Feature 003, predating Planner-only events) silently made Feature 001's
  admin surface unreachable for Planner-only events despite linking/staff-sync already being documented
  as product-mix-agnostic; reclassified `product: 'shared'` in `eventSectionMeta.ts` — see
  `schema-reference.md`'s corrected page-visibility-vs-operation-authorization matrix for the full
  before/after. F3 — a genuine `event_planner_links` query failure was silently falling through to
  `status: 'unavailable'` instead of `backend_error`; fixed. F4 — the Overview page's fetch had no
  stale-response guard; added the same `requestIdRef` generation-counter pattern already used by
  `EventContext.tsx`. F5 — `resolvePlannerOverviewStatus` (Feature 005 above) was split into a
  link-independent `resolveProvisioningPhase` plus the original combined function, so
  `event_planner_links` is queried (and the Portal service-role client constructed at all) only for the
  one `succeeded`-status case that genuinely needs it — re-verified with a standalone 13-case unit test
  (12 precedence combinations + the deferral property). `lint`/`type-check`/`build` re-run clean after
  every fix. Full accounting in `specs/005-planner-event-workspace-foundation/tasks.md`'s
  "Post-implementation review-correction pass" note.
- [x] **Final corrective re-review pass (2026-09-16, same day)**: a second `/code-review` re-review found
  one genuine Medium — the F1 fallback's "first accessible membership" wasn't provably deterministic
  between the browser (`getAccessibleOrganizations()`, an embedded-join query) and the server (this
  route's plain-select query), since neither carried an explicit order and Postgres/PostgREST gives no
  same-row-order guarantee across two structurally different queries. Fixed by adding the identical
  `.order('organization_id', { ascending: true })` to both — a pure, product-meaningless tie-break, not a
  new fallback rule — re-verified via live SQL against a real 6-membership user (both shapes agree once
  ordered) and a synthetic adversarial-order test (8/8 passed). Also closed three Low findings from the
  same re-review: two error-discard patterns in `src/lib/eventAuth.ts`/this route's own memberships query
  (added server-side-only logging, no behavior change) and a `bendieActive` initial-value race in
  `bendie-planner/page.tsx` (now defaults `false`, fail closed). One Low nav-visibility observation
  (the now-`'shared'` `bendie-planner` tab is visible to ordinary event members, not just platform admins
  — a pre-existing `EventLayout` characteristic widened, not introduced, by F2) left as reported follow-up
  debt, not fixed, per explicit instruction not to introduce new role-aware navigation logic in this pass.
  `lint`/`type-check`/`build` re-run clean.
- [x] **Runtime verification pass (2026-09-16, same day)**: real authenticated-HTTP-session verification
  against the actual running `next dev` server — two Supabase Auth test users created via the standard
  Admin API, signed in for genuine tokens, session cookie hand-built in the exact `@supabase/ssr` format
  and used for real `curl` requests (same code path a browser takes, minus DOM rendering). Confirmed live:
  401/403 (unauthenticated, zero-membership), F1's null- and stale-selection fallback (both resolve to the
  same deterministic organization), valid-selection preservation, cross-tenant/wrong-org/org-without-
  membership denials, platform-admin override, the full Bendie-only/Planner-only/Both product matrix,
  ready + zero-session rendering, every provisioning state including both contradiction cases (failed/
  provisioning with an active link never becomes `ready`), all succeeded+link-integrity states, an ordinary
  member with zero Planner-side identity loading Overview successfully, and Feature 001's admin routes
  still denying an ordinary session. All 16 dedicated test events + both test users fully deleted and
  cleanup verified (zero residual rows). Found and fixed a `.next` dev-cache corruption this session's own
  earlier `npm run build` runs caused against the pre-existing dev server (affected every page, not a
  Feature 005 defect) by restarting the dev server cleanly. Not performed — genuinely unavailable in this
  environment, not assumed: actual browser rendering (tab bar, redirects, banners, responsive layout), the
  F4 client-side race (inherently unobservable via HTTP alone), and `backend_error` (would require
  degrading real credentials, explicitly out of bounds). No source code changed; no task checkbox changed
  — tasks.md's "Runtime verification pass" note has the full accounting.
- **Deferred to future features, by design**: Planner staff/coordinator roster, Planner `event_user_assignments`
  reconciliation with Portal's `event_members`, and every full operational Planner module (Tasks, Agenda
  editing, Participants, Flights, Accommodation, Transfers, Event Access, Blueprints, Checklist, Vendors,
  Notifications) — this feature is workspace-foundation only.

---

## Decisions Made During Build

(Carried forward from the original build log, still accurate)

- `profiles.id` equals `auth.users.id` (no separate `user_id`). FKs use `ON DELETE CASCADE` except `jobs`-style `run_id` patterns elsewhere in the schema (`SET NULL`) — see `schema-reference.md` for current per-table detail.
- DB trigger `handle_new_user` auto-creates a `profiles` row on signup — no app code needed.
- DB trigger `set_updated_at` auto-manages `updated_at` columns — app code never sets it directly.
- RLS enabled on all 49 `public` tables as of the 2026-08-18 audit (`schema-reference.md` Changelog) — `portal_is_global_admin()` is the bypass function most tables layer on top of their event/org-scoped policies.
- Attendees don't sign in with email/password through the portal's user-creation flow — `createUser` (not `inviteUserByEmail`) is used deliberately, since attendees actually authenticate via the Evently-App's own event-access-code flow.
- Facilitators are populated via CSV import as the primary path, not a per-field form — confirmed operational reality, not just a design choice (see `schema-reference.md` §2).
- `games.event_id` scoping was a known gap (flagged repeatedly across planning docs) and was fixed 2026-08-18 in `getGames()` — confirm this fix has an equivalent guard anywhere the portal itself queries games, if it queries them outside the standard section page.
- **2026-08-19 mobile-parity comparison** — every gap in Phases 5–14 was confirmed by reading the actual portal source (not inferred from docs): `games/page.tsx`'s `type` field, `facilitators/page.tsx` + `FACILITATOR_CSV_COLUMNS`, `basics/page.tsx`'s `BasicsForm`, `agenda/page.tsx`'s single-facilitator `<select>`, `members/page.tsx` (no access-code queries), `activities/page.tsx`'s `ActivityForm` (no image fields), and `gallery/page.tsx` (queries `posts`, not `event_photos`) were all read directly. The four new sections (Excursions, Expo Directory, News Feed, Attendee Travel Details) were confirmed absent by checking `EVENT_SECTIONS` in `eventSectionMeta.ts` and the `app/portal/events/[eventId]/` route listing.
- **2026-08-19 live schema verification (via `supabase` MCP)** — before starting Phase 5, cross-checked `schema-reference.md` directly against the live database: all columns/defaults/CHECK constraints for `games`, `facilitators`, `events`, `agenda_sessions`, `agenda_session_speakers`, `event_user_access_codes`, `activity_images`, `event_photos`, and all 4 new tables (`excursion_categories`, `excursions`, `expo_spaces`, `news_items`, `attendee_travel_details`) matched the doc exactly — no drift found. Also read the RLS policies and function definitions (`is_event_host_or_organizer`, `is_event_member`, `portal_is_global_admin`, `issue_event_access_code`, `get_leaderboard`, `award_game_point`) for every table this build plan touches, which is how the Phase 7 blocker below was found — that gap exists in the live database, not just the docs.
- **2026-08-20 product decisions on Phases 7 & 9:** (1) Gallery — `posts` moderation stays in scope permanently; `event_photos` becomes its own separate new section rather than replacing anything. (2) Access codes — the admin should never see a plaintext code; the actual need is "resend to a locked-out member," not "view/manage codes." Investigated live via MCP: `resend_email_event_access_code` doesn't send email itself (it's an email+slug-lookup wrapper around `issue_event_access_code`, for the mobile app's self-service "I forgot my code" flow); the actual email delivery is a separate deployed Edge Function, `send-event-access-code-email` (Resend-based, `verify_jwt: false`), which sends but doesn't generate a code — the two have to be called in sequence. Neither call touches `event_user_access_codes`'s RLS, so the resend flow needed no backend fix.

---

## Open Questions

- Is MFA enforcement still required for launch, or has that requirement been deprioritized? (documented as required in `architecture.md`'s Authentication section, sourced from the original scope doc; nothing in the codebase enforces it yet.)
- Should `ComingSoonPanel.tsx` be deleted, or is there a section still intended to use it?
- Is there a target test coverage expectation, or is manual QA the accepted process for this internal tool?
- If the team ever wants a full access-codes list/view (not just resend), the `event_user_access_codes` RLS gap from Phase 7's original scope is still real and still unfixed — see `build-plan.md` Phase 7's "separately flagged" note.
