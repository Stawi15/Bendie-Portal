# Progress Tracker

Update this file after every completed feature. Any AI agent reading this should immediately know what is done, what is in progress, and what is next.

**Last synced against the actual codebase:** 2026-08-19 (by reading `src/` directly — file listings, line counts, and code content — not by trusting the older planning docs, which were dated 2026-07-20 and materially stale by comparison).

---

## Current Status

**Phase:** Mobile-parity gap analysis (Phases 5–13) is fully closed. Only Phase 14 (nice-to-have) and Phase 15 (unrelated hardening) remain.
**Foundation, org layer, event switcher, and all 21 content sections are built** (the original 16 plus Event Photos, Excursions, Expo Directory, News Feed, and Attendee Travel Details). Every gap found in the 2026-08-19 field-by-field comparison against `schema-reference.md` — cross-checked live against the database via the `supabase` MCP throughout — has been closed: 3 quick correctness fixes, Agenda multi-speaker/breakout-rooms, 4 brand-new content sections, a Resend Access Code action, and a cross-cutting edit-form-modal fix that turned out to affect 8 pages.
**Next:** Nothing blocking. Optional remaining work: Phase 14 (Games Leaderboard admin view, nice-to-have, explicitly low priority in `schema-reference.md`) or Phase 15 (MFA/TOTP enforcement, Networking drag-to-reorder, `ComingSoonPanel.tsx` decision, test coverage, `event-files` bucket UI, `types/database.ts` drift check — all pre-existing open items unrelated to mobile parity). Also worth a real browser click-through pass at some point — every phase this session was verified via `type-check`/`lint` only, never in a running app.

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

### Phase 14 — Games: Leaderboard Admin View (nice-to-have)

- [ ] Read-only panel calling `get_leaderboard(p_event_id, p_limit)`

### Phase 15 — Hardening (independent of mobile-feature parity)

- [ ] MFA/TOTP enforcement for privileged roles (documented as required, not implemented — `requiresMFA()` only checks role)
- [ ] Networking Questionnaire Builder drag-to-reorder (`@dnd-kit` installed, not wired in)
- [ ] Resolve `ComingSoonPanel.tsx` — currently dead code, decide wire-up vs. removal
- [ ] Automated test coverage (no test suite exists yet)
- [ ] Portal upload UI for the `event-files` bucket (mobile app already reads it)
- [ ] Verify `types/database.ts` against live schema (it's hand-maintained, drift risk)

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
