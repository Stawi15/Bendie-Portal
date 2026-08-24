# Build Plan

## Core Principle

Ship one content section fully wired to real Supabase data at a time — form UI, load, save, toast feedback — following the established reference pattern (see `ui-registry.md`'s "Event Basics form pattern" and `code-standards.md`'s page component structure). Every new section should be indistinguishable in shape from its 16 siblings.

This plan has been reconstructed against what's actually built (2026-08-19) rather than the original week-by-week estimate in the earlier planning pass — see `progress-tracker.md` for the live status table.

---

## Phase 1 — Foundation ✅ Built

- Next.js 14 + TypeScript + Tailwind scaffold
- Supabase browser client (`src/lib/supabaseClient.ts`)
- Auth: login, signup, forgot-password, reset-password pages
- `middleware.ts` — session gate + `global_role = 'admin'` gate for `/portal/*`, with a short-lived role cache cookie
- `AuthContext` — user + profile + `isGlobalAdmin`
- `event-assets` storage bucket + RLS (`004_storage_policies.sql`) — public read, global-admin write
- `types/database.ts` — hand-maintained DB types

## Phase 2 — Organization Layer ✅ Built

Not in the original scope document, but core to the shipped app:

- `OrganizationContext`, `organizations`/`organization_members` tables
- Org pages: `/portal` (org dashboard), `/portal/people`, `/portal/teams`, `/portal/assets`, `/portal/settings`, `/portal/activity-log`
- `CreateOrganizationModal`, `CreateTeamModal`, `AddPersonModal`, `TeamMembersModal`
- User provisioning via `/api/admin/create-user` and `/api/admin/bulk-create-users` (service-role, silent account creation — no password/email, since attendees authenticate through the Evently-App itself via event access codes)
- Org asset library: `org-assets` bucket + `src/lib/assetUpload.ts` + `AssetPickerModal`

## Phase 3 — Event Switcher & Editor Shell ✅ Built

- `EventContext` — loads accessible events, tracks current event
- `/portal/events` — org-wide events list, `CreateEventModal`
- `EventLayout` (`app/portal/events/[eventId]/layout.tsx`) — 16-tab bar + floating "Next" wizard button
- `src/lib/eventSectionMeta.ts` — single source of truth for the 16 tabs (label, description, icon, badge colors)

## Phase 4 — Content Sections ✅ Built (all 16)

Each shipped as a `'use client'` page following the standard load/edit/save pattern (`code-standards.md`):

`dashboard`, `basics`, `hero`, `theme`, `terminology`, `facilitators`, `agenda`, `activities`, `networking`, `faqs`, `info-center`, `emergency`, `gallery`, `games`, `members`, `activity-log`.

Notable specifics:

- **Facilitators** — primary input path is CSV import (`CsvImportModal` + `src/lib/csvImport.ts`), not a per-facilitator form, per `schema-reference.md`'s confirmed portal behavior.
- **Theme** — native `<input type="color">` + hex field + live preview swatches, not `react-color`.
- **Dashboard** — `MetricCard`, `NextMilestoneCard`, `NeedsAttentionCard`, `QuickActionsCard`, `RecentActivityCard` built from `src/lib/eventStats.ts` / `useRecentActivity.ts`.

## Mobile Parity Gap — Source

`schema-reference.md` documents everything the mobile app (Evently-App) now reads, including several tables and fields added after the original 16 sections were built. Phases 5–14 below close that gap, in priority order: quick correctness fixes first, then extensions to existing sections, then entirely new content sections, then a nice-to-have. This ordering was set 2026-08-19 from a field-by-field comparison of `schema-reference.md` against the live portal code — see `progress-tracker.md`'s Decisions Made log for how each gap was confirmed (not assumed).

Every new tab added in Phases 10–13 must be registered in `EVENT_SECTIONS` (`src/lib/eventSectionMeta.ts`) — that file is the single source of truth for the tab bar, dashboard cards, and page headers; a new route with no registry entry won't appear anywhere.

**Also register it in `SECTION_CHECKS`, `events/[eventId]/dashboard/page.tsx`.** This is a second, separate map keyed by the same `EVENT_SECTIONS` key, and it does **not** degrade gracefully — a tab present in `EVENT_SECTIONS` but missing from `SECTION_CHECKS` crashes the entire Dashboard page (`Cannot read properties of undefined (reading 'kind')`), not just that one card. This exact gap shipped silently across Phases 9–13 (`attendee-travel`, `excursions`, `expo`, `news`, `event-photos` were all missing) and wasn't caught until the user hit it live — fixed 2026-08-20, see `progress-tracker.md`. Decide `scored: true` (counts toward setup-progress %, for organizer-authored content that's expected before launch) vs `scored: false` (shown as an informational count only, for optional/attendee-generated content) per section, and if the table has a nullable `event_id` (global-vs-event-scoped pattern), add it to `GLOBAL_CAPABLE_TABLES` in that same file so the count includes global rows.

---

## Phase 5 — Quick Correctness Fixes

Small, self-contained, low-risk. No new tables, no new tabs.

### 5.1 Games — constrain `type` to the real enum

**Problem:** `games/page.tsx`'s `GameForm.type` is a free-text `<input>` (placeholder `"trivia"`), but the DB `CHECK` constraint only allows `jeopardy` / `kmky`. Any other value fails on insert.

**Fix:** Replace the text input with a `<select>` restricted to `jeopardy` / `kmky`, matching the pattern already used for `block_type` in the Agenda form.

### 5.2 Facilitators — add `role_type` and `linkedin_url`

**Problem:** Both fields exist on `facilitators` (added 2026-08-14, fully supported app-side) but are missing from the manual Add/Edit form *and* `FACILITATOR_CSV_COLUMNS` — confirmed still open as of this comparison, exactly the gap `schema-reference.md`'s own 2026-08-18 entry warned about.

**Fix:**
- Add `role_type` (`select`: Speaker / Presenter, default `speaker`) and `linkedin_url` (`url` input) to `FacilitatorForm` and the Add/Edit panel in `facilitators/page.tsx`.
- Add both columns to `FACILITATOR_CSV_COLUMNS` / `FACILITATOR_CSV_SAMPLES` / `parseFacilitatorCsvRow` in the same file, and to the insert payload in `importFacilitatorRow`.

### 5.3 Basics — `disabled_menu_items` checklist

**Problem:** `events.disabled_menu_items` (`text[]`, CHECK-constrained to a fixed 8-item set) has zero portal coverage — no way to hide any optional mobile-app menu item per event.

**Fix:** Add a checkbox group to `basics/page.tsx` for exactly these 8 keys — no more, no fewer, matching the DB `CHECK` constraint:
`excursions`, `expo`, `news`, `interactives`, `event_photos`, `files`, `feedback`, `info`.
Render as checkboxes (per `schema-reference.md`'s explicit portal recommendation), not freeform text. Note in the UI copy that Gallery and Help/FAQs are intentionally not hideable here (the mobile bottom tab bar is hardcoded and not event-aware — see `schema-reference.md` §1e), and that Networking is controlled by `networking_mode` instead, not this list.

---

## Phase 6 — Agenda: Multi-Speaker & Breakout Rooms ✅ Built (2026-08-19)

### 6.1 Multi-speaker assignment

**Problem:** The Agenda form only supports one facilitator via the legacy `facilitator_id` column. The app has moved to `agenda_session_speakers` (join table: `session_id`, `facilitator_id`, `speaker_type` enum `speaker`/`panelist`/`moderator`/`facilitator`/`host`, `display_order`) for multi-speaker sessions.

**Build:** Replace the single facilitator `<select>` with a multi-add list — pick a facilitator, assign a `speaker_type`, add to the session; support reordering and removal. Keep writing legacy `facilitator_id` too only if something still reads it as a fallback (confirm in `schema-reference.md` §4 before deciding — it's documented as a fallback, not primary, so the join table write is the one that matters).

### 6.2 Breakout rooms editor

**Problem:** `agenda_sessions.breakout_rooms` (`jsonb`) has no editor. Shape: array of `{id, name, description?, facilitator_name?, agenda: [{id, title, description, starts_at, ends_at, location}]}`.

**Build:** An expandable "Breakout Rooms" panel on the session edit form — add/remove rooms, each room with its own mini-agenda (add/remove time blocks). This is nested repeatable form state; keep it a self-contained sub-component so the main `SessionForm` doesn't balloon.

---

## Phase 7 — Members: Resend Access Code — ✅ Built (2026-08-20)

**Original scope (view/issue/revoke a codes list) is blocked** — see the RLS gap below, still real, still unresolved. **But the actual product need, per explicit direction, is narrower and sidesteps the blocker entirely: a "Resend Access Code" action for a locked-out member, with the admin never seeing the plaintext code.** That flow needs zero reads from `event_user_access_codes` and therefore hits no RLS wall.

**The real flow, reverse-engineered from the live DB + an Edge Function (via `supabase` MCP), matching how the mobile app's own "forgot my code" screen almost certainly works:**

1. Call the RPC `issue_event_access_code(p_event_id uuid, p_user_id uuid, p_expires_in interval DEFAULT '00:30:00')` — `SECURITY DEFINER`, **no caller-authorization check at all** (confirmed by reading its body), so it works from any authenticated session regardless of `event_members` role. It invalidates the member's previous active code, inserts a new one (hashed — plaintext is never persisted), and returns `{event_id, user_id, access_code, expires_at}` — the plaintext code exists only in this one response.
2. Immediately pass that response into the Edge Function `send-event-access-code-email` (`verify_jwt: false`, already deployed and configured with `RESEND_API_KEY`/`EVENTLY_FROM_EMAIL`) via `supabase.functions.invoke(...)`, with body `{ email, eventName, accessCode, expiresAt }`. It sends the actual email via Resend — this function does **not** generate the code itself, it only delivers one it's given, which is why step 1 has to happen first.
3. The portal never renders `access_code` anywhere — it goes straight from the RPC response into the function call, and the UI only ever shows a success/failure toast.

**Build:** On `members/page.tsx`, a "Resend Access Code" action per member (icon button, e.g. `mail`), confirmed via `useConfirm()` ("Send a new access code to {name}?"). Requires the member to have an email on file — show an error and don't proceed if `profiles.email` is null. On confirm: call the RPC, then the Edge Function, single success/error toast at the end. No new table, no new tab, no RLS change needed.

**Separately flagged, not fixed — the original blocker still stands if the team ever wants a real codes list/view/manual-revoke UI:**
- `event_user_access_codes`'s RLS (`event_user_access_codes_insert_host` / `..._select_own` / `..._update_host_or_own`) has no `portal_is_global_admin()` bypass, unlike every sibling table in this plan — a global admin who isn't personally an `event_members` row for a given event still can't `SELECT` other users' codes. There's also no `list`/`revoke` RPC, only `issue_event_access_code`, `resend_email_event_access_code` (a thin wrapper around `issue_event_access_code` that looks a user up by email+event-slug instead of id — not needed here since the portal already has both ids), `verify_event_access_code`, and an auto-issue trigger. This only matters if the team later wants the fuller admin view — the resend-only flow above doesn't need it.

---

## Phase 8 — Activities: Image Uploads ✅ Built (2026-08-19)

**Problem:** `activity_images` (one activity → many images, `image_type`: `hero`/`gallery`) had zero portal coverage. `rating` was also read-only in the list view.

**Built:** The Activity edit modal now has a Hero Image (`ImageField`, 0-or-1 `activity_images` row with `image_type='hero'`) and a Gallery Images section (repeatable list, same diffed add/update/delete pattern as Agenda's Speakers). `rating` is an editable `number` input (0–5, step 0.5). `ImageField` was extracted from `hero/page.tsx` into `components/portal/ImageField.tsx` since Activities is now a second consumer; `moveItem` was extracted from `agenda/page.tsx` into `lib/reorder.ts` for the same reason.

**Correction vs. this section's original wording:** images actually upload to the **`org-assets`** bucket via `AssetPickerModal` (organization-scoped, shared across events), not a per-event `event-assets`-style bucket as originally guessed — confirmed by reading `AssetPickerModal.tsx` directly before building. `AssetPickerModal` needs `organizationId`, sourced from `useEvent()`'s `currentEvent.organization_id`.

**Flagged, not fixed:** the live `media_type` enum (used by `activity_images.image_type`) actually has 5 values — `hero`, `gallery`, `thumbnail`, `avatar`, `general` — confirmed via the `supabase` MCP, not just the 2 (`hero`/`gallery`) `schema-reference.md` documents for this table. The portal only uses `hero`/`gallery`, matching the doc's intent for this specific table; the extra enum values are presumably used by other tables sharing the same Postgres enum type. Not a portal bug, just a doc-vs-reality gap worth someone flagging back to whoever maintains `schema-reference.md` — not edited here since that file is meant to be updated from the mobile-app side, not by the portal.

**Deliberately out of scope:** activity list-view thumbnails (the list stays text-only, matching every other section's list rows) — would need restructuring the main `activities` fetch to join `activity_images`, which wasn't part of this phase's plan.

---

## Phase 9 — Event Photos (new section) — ✅ Built (2026-08-20)

**Decision:** `posts`/`post_likes`/`post_comments` moderation (the existing `gallery` tab) is **intentionally in scope** — leave `gallery/page.tsx` exactly as it is, no changes. `event_photos` (§8 in `schema-reference.md` — `image_url`, `caption`, `uploaded_by`, `is_featured`, `display_order`) is a **separate** concern and gets its own new section, not a replacement of the existing tab.

**Build:** A new tab, `event-photos` (label "Event Photos" — this name isn't arbitrary: it's the exact key already sitting unused in Basics' `disabled_menu_items` checklist since Phase 5, so this closes that loop too). Small CRUD page, simpler than the `posts` moderation view it sits alongside:
- List existing `event_photos` for the event (`image_url`, `caption`, `is_featured`, `display_order`), most-recent or `display_order` first.
- Organizer can seed new photos directly (upload via `AssetPickerModal`/org-assets, matching the Activities pattern from Phase 8) — not just moderate attendee uploads.
- Toggle `is_featured` per photo (same `toggleFeatured`-style pattern as Activities).
- Delete.
- No `posts`-style hide/unhide needed — `event_photos` has no `is_hidden` column, only feature/delete.
- Register the new tab in `eventSectionMeta.ts`.

---

## Phase 10 — New Section: Excursions & Categories — ✅ Built (2026-08-20)

Tables: `excursion_categories` (event-scoped or global via nullable `event_id`; `key`, `label`, `icon`, `display_order`), `excursions` (`category_id` FK, `title`, `description`, `image_url`, `display_order`, nullable `event_id`).

**Build:**
- A "Categories" manager — add/rename/reorder/remove tabs, open-ended (not fixed to 3). Icon field accepts an Ionicons name or a single emoji (same convention as `events.theme_icon`).
- An "Excursions" list scoped to the selected category — title/description/image CRUD, with an explicit "apply to all events" toggle for the nullable `event_id` (default to event-scoped for new rows per `schema-reference.md`'s guidance, but allow switching).
- Image field via the `AssetPickerModal` pattern.
- Register the new tab in `eventSectionMeta.ts`.

---

## Phase 11 — New Section: Expo Directory — ✅ Built (2026-08-20)

Table: `expo_spaces` — one row per organization (not per exhibitor/sponsor membership), with `is_exhibitor`/`is_sponsor` booleans, `name`, `summary`, `image_url`, `chips` (text[] tags), `intro`, `offering`, `contact_name`/`contact_email`/`contact_phone`, nullable `event_id`.

**Build:** Standard CRUD list + form. Both `is_exhibitor` and `is_sponsor` as independent checkboxes (an org can be either, both, or neither) — and per `schema-reference.md`'s explicit caveat, make sure the form doesn't default both to `true`, or the Exhibitors/Sponsors tabs will look identical in-app the way the original seed data did. `chips` as a simple tag input. Register the new tab in `eventSectionMeta.ts`.

---

## Phase 12 — New Section: News Feed — ✅ Built (2026-08-20)

Table: `news_items` — `title`, `summary`, `body` (single textarea, paragraphs separated by a blank line — **not** an array field), `themes` (text[] tags), `image_url`, `is_featured` (boolean — any number of articles can be featured at once, not a single-pick), `registration_url` (nullable — external link, button disabled when blank), `read_time_minutes` (nullable — safe to leave empty, app estimates from `body`), `published_at` (defaults `now()`), nullable `event_id`.

**Build:** Standard CRUD list + form. `body` as one large textarea with a hint explaining the blank-line-paragraph convention. `is_featured` as an independent toggle per row, not a radio/single-select. Writes should be organizer/host/admin-only per the RLS already in place (tighter than Excursions/Expo). Register the new tab in `eventSectionMeta.ts`.

---

## Phase 13 — New Section: Attendee Travel Details — ✅ Built (2026-08-20)

Table: `attendee_travel_details` — `user_id` FK (required), nullable `event_id`, `type` (`flight`/`ground_transfer`/`other`), `title`, `boarding_time` (free text), `route` or `origin`/`destination`, `travel_time` (free text), `pickup_vehicle`, `pickup_location`, `date` (free text).

**Build:** This page needs an **attendee picker in addition to the event picker** — likely reuse the org people list (`useOrgPeople`) filtered to the event's members, then a per-attendee list of travel rows (add/edit/delete). This is organizer-populated only; there's no attendee self-service to reconcile against. Register the new tab in `eventSectionMeta.ts`.

---

## Phase 14 — Games: Leaderboard Admin View (nice-to-have)

**Build:** A read-only panel on the Games page calling the `get_leaderboard(p_event_id, p_limit)` RPC — ranked `{user_id, full_name, username, total_points}`. No writes; `game_points` itself is system-generated. Lowest priority of the mobile-parity phases since it's explicitly optional in `schema-reference.md`.

---

## Phase 15 — Hardening (independent of mobile-feature parity)

Carried forward from the previous Phase 5 — not related to the schema-reference.md gap analysis above, but still open:

- **MFA / TOTP enforcement** — documented as required in `project-overview.md`'s security expectations; `requiresMFA()` in `portalAuth.ts` only checks role today, no actual TOTP challenge exists.
- **Networking Questionnaire Builder drag-to-reorder** — `@dnd-kit` is installed but not wired into the `networking` page yet.
- **`ComingSoonPanel.tsx`** — exists, currently unused anywhere. Decide: wire it up somewhere, or remove it as dead code.
- **Automated tests** — no test suite exists yet (no Vitest/Playwright config in the repo despite being planned in the original architecture doc).
- **Event-files bucket in the portal** — the mobile app already reads a 4th storage bucket (`event-files`, organizer-upload-only shared documents); the portal has no upload UI for it yet.
- **Schema type drift risk** — `types/database.ts` is hand-maintained, not generated; verify it against the live schema (`mcp__supabase__generate_typescript_types`) periodically, especially after schema changes noted in `schema-reference.md`'s changelog.

---

## Working Convention Going Forward

When adding a genuinely new feature (not one of the 16 sections, which already exist):

1. Confirm the schema shape against `schema-reference.md` (the living field reference) before writing any form — it's updated far more tightly than `architecture.md`'s own schema summary, which can lag behind.
2. Build the page following the standard content-editor shape (`code-standards.md`).
3. Update `context/progress-tracker.md` when the feature ships.
4. Run `/imprint` on any new or materially changed component so `ui-registry.md` stays current.
