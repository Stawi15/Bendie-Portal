# Build Prompt: Evently-App Event Content Portal

**How to use this file:** Copy everything below the horizontal rule into a fresh AI coding session
(or hand it to a developer) as the complete brief for building the portal. It is self-contained,
but the executing agent should also be given read access to `EventlyApp_EventPortal_Fields.md` in
this repo for the exhaustive field-by-field schema reference — this prompt tells it *what to
build and how*; that file tells it *exactly which columns exist*.

**Assumption stated up front:** this prompt targets a **separate Next.js web application** (not
a screen bolted onto the existing Expo/React Native app), connecting to the *same* Supabase
project. Admin CMS work (data tables, drag-to-reorder, color pickers, drop-zone uploads) is
materially easier in a standard React web stack than in React Native Web, and a separate deploy
means a portal bug can never crash the attendee-facing mobile app. If you'd rather this live
inside the existing Expo app's web build instead, say so and the stack section below gets swapped
out — nothing else in this brief changes.

---

## ROLE

You are building **Evently Portal**, an internal administrative web application for organizers of
events run on the "Evently-App" platform (an Expo/React Native conference & team-building event
app backed by Supabase/Postgres). Organizers currently configure their event by having an
engineer hand-run SQL `UPDATE` statements against the `events` table and hand-insert rows into
content tables (`facilitators`, `agenda_sessions`, `faqs`, etc.) — see
`docs/MULTI_EVENT_GUIDE.md` in the mobile repo for how painful that currently is. Your job is to
replace that entirely with a secure, self-serve web portal.

This is an **administrative system that can mutate production event data attendees see live in
the mobile app.** Treat security as a first-class requirement, not a follow-up pass — see the
dedicated section below before writing any auth code.

---

## 1. Tech Stack

- **Framework:** Next.js 14+ (App Router), TypeScript strict mode.
- **Styling/components:** Tailwind CSS + shadcn/ui (Radix primitives). Use a component library
  that gives you accessible dialogs, dropdowns, and form primitives out of the box — do not
  hand-roll these.
- **Data/auth:** `@supabase/supabase-js` + `@supabase/ssr` for cookie-based session handling in
  Server Components, Route Handlers, and Server Actions.
- **Forms:** `react-hook-form` + `zod` for schema validation, shared between client and server.
- **Tables/lists with reordering:** `@dnd-kit` for drag-to-reorder (`display_order` columns appear
  on almost every content table).
- **Color pickers:** any accessible hex-color-picker component, for `theme_primary/secondary/tertiary`
  and `agenda_sessions.accent_color`.
- **Image upload:** native `<input type="file">` + drag-drop zone, uploading through Supabase
  Storage — reuse the *pattern* already established in the mobile repo's
  `services/storageService.ts` (`uploadFile`, `buildEventScopedPath`, content-type allowlist, size
  cap) rather than inventing new upload semantics.
- **Hosting:** Vercel (or any Node host). Environment variables via `.env.local` in dev, host
  secrets manager in prod — **never commit `.env*` files.**

---

## 2. Authentication & Sign-In

- Use **Supabase Auth**, pointed at the **same Supabase project** as the mobile app. Organizers
  already have `profiles` rows there; a person who has an event-organizer role in the mobile app
  should be able to sign into the portal with the *same* credentials, not a duplicate account.
- Sign-in screen: email + password. Add "Forgot password" (Supabase's built-in recovery email
  flow). Do not build a custom password-reset token system — use Supabase's.
- After password auth succeeds, if the user has **any** TOTP factor enrolled (see MFA below),
  require the second factor before establishing a full session.
- Session handling: use `@supabase/ssr`'s cookie-based session so Server Components/Route
  Handlers can read the authenticated user without shipping a service-role key to the browser.
  Set a reasonably short session/access-token lifetime and rely on Supabase's refresh-token
  rotation; do not persist long-lived tokens in `localStorage`.
- Lock the sign-in form with basic client+server rate limiting (e.g. exponential backoff after 5
  failed attempts per email+IP in a rolling 15-minute window) to blunt credential stuffing —
  mirror the throttling approach already used in the mobile app's `lib/rateLimiter.ts`.

## 3. Sign-Up — this is an admin portal, so sign-up must NOT be an open door

A plain "anyone can sign up and get an admin panel" flow is a security hole for a system that can
edit live event content. Implement **two distinct sign-up paths**, both ending in a normal
Supabase Auth account + `profiles` row, but differing in what access (if any) they grant:

### 3a. "Create your organization" (bootstraps a brand-new tenant)
- Public self-serve form: name, work email, password, organization name.
- On submit: create the Supabase Auth user (email verification required before first login —
  do not allow an unverified email to reach the dashboard), create the `profiles` row, create a
  new `organizations` row, and create an `organization_members` row for this user with
  `role = 'owner'`.
- This user does **not** get access to any event automatically — they must create one (Section 5)
  or an event created under their org needs an `event_members` row too (create it in the same
  transaction as the event so the creating owner isn't locked out of their own event).

### 3b. "Accept invite" (everyone else — staff, additional organizers, facilitullators-with-portal-access)
- No open sign-up form for this path. An existing `organization_members`/`event_members` row with
  role `owner`/`admin`/`host`/`organizer` can send an invite (email + intended role + optionally
  scoped to one event vs. the whole org) from inside the portal.
- Generate a single-use, expiring invite token (hash it at rest — do not store the raw token in
  the DB, same principle as `event_user_access_codes.code_hash` in the existing schema). Email a
  link containing the raw token.
- The invite-accept page verifies the token, lets the invitee set a password (or sign in if they
  already have a Supabase Auth account from the mobile app), then — and only then — inserts the
  `organization_members`/`event_members` row with the role the inviter specified.
- Invites expire (24–72h) and are single-use; expired/used tokens must be rejected server-side, not
  just hidden in the UI.

### 3c. Role model inside the portal
Reuse the existing schema's roles verbatim — do not invent a parallel role system:
- `organization_members.role`: `owner`, `admin`, `member`, `attendee`, `facilitator`, `staff`.
- `event_members.role`: `host`, `organizer`, `admin`, `attendee`, `facilitator`, `staff`, `speaker`.
- Only `host` / `organizer` / `admin` on `event_members` (or `owner`/`admin` on
  `organization_members`) may reach any editor screen for that event. Mirror the
  `canManageCurrentEvent` gate already implemented in the mobile app's
  `app/admin-event-codes.tsx` for the pattern to follow.

## 4. Authorization — defense in depth, not just hidden buttons

- **Every** table this portal writes to must have (or must be given, as part of this build) Row
  Level Security policies that check the requester's `event_members`/`organization_members` role
  server-side. The portal's Next.js layer is a UX convenience, not the security boundary — assume
  a hostile actor can call the Supabase REST/PostgREST API directly with a stolen anon-key session
  and must still be blocked by RLS.
- Never expose the Supabase **service role key** to the browser. If any operation genuinely needs
  to bypass RLS (e.g. an admin-only cross-org action), perform it in a Next.js Route Handler /
  Server Action that reads the service role key from a server-only env var, and re-check the
  caller's role yourself before doing anything privileged.
- Add an `event_content_audit_log` table (new — not in the current schema) capturing
  `actor_user_id`, `event_id`, `table_name`, `row_id`, `action` (`insert`/`update`/`delete`),
  `diff` (jsonb, old vs new values for changed columns only), `created_at`. Write to it from every
  mutation path in the portal. Surface a simple "Activity Log" page per event so organizers can
  see who changed what — this is both a security control and a trust feature for teams with
  multiple organizers.
- Consider Supabase MFA (TOTP) as **required** (not optional) for `owner`/`host`/`admin` roles
  specifically, since those roles can rewrite public-facing event content and issue access codes.
  Gate MFA enrollment as a blocking step the first time such a user signs in if they haven't
  enrolled yet.

## 5. Event Switcher & Guard

- Every authenticated portal session lands on an event picker: list events where the signed-in
  user has a qualifying `event_members` role (join through `organization_members` if you also want
  org-level admins to see every event in their org without a per-event row).
- Persist the "currently selected event" in a URL segment (e.g. `/events/[eventId]/...`), not just
  client state, so links are shareable/bookmarkable and server-side role checks can key off the
  URL param directly.
- Every server-side data loader and mutation must re-verify the caller's role for `eventId` from
  the URL — never trust a client-supplied "I'm allowed to edit this" flag.

---

## 6. Information Architecture (pages to build)

Build these as tabs/sections under `/events/[eventId]/...`. Full field lists, types, defaults,
and fallback behavior for each are in `EventlyApp_EventPortal_Fields.md` §1–§11 — pull the exact
column names, enums, and constraints from there rather than guessing.

1. **Dashboard** — event status at a glance (status, dates, attendee count vs. `attendee_limit`,
   quick links into each editor section, recent activity log entries).
2. **Event Basics** — `name`, `slug` (validate URL-safe + uniqueness live), `description`,
   `location`, `status` (enum select), `attendee_limit`, `starts_at`/`ends_at` (date-time pickers).
3. **Hero & Branding** — `hero_title`, `hero_description`, `hero_image_url`, `image_url`,
   `gallery_background`, `profile_banner_image_url` (all with upload dropzones + URL fallback
   preview matching the mobile app's actual fallback chain), `category_label`, `theme_label`,
   `theme_icon` (constrain to a curated list of valid Ionicons names with an icon picker, not a
   free-text field that can silently render nothing).
4. **Theme Colors** — `theme_primary`, `theme_secondary`, `theme_tertiary` hex pickers with a
   **live preview** panel that mimics the mobile hero card (reimplement the derived-shade math
   from `lib/themeColors.ts`'s `buildDerivedThemePalette` so the preview matches what attendees
   will actually see, including the light/dark text contrast pick).
5. **Terminology & Feature Toggles** — `facilitator_label_singular/plural` (text inputs, live
   sample sentence showing where each is used), `event_type`, `networking_mode`,
   `interests_enabled`, `in_house`, `gallery_external_url`, `feedback_form_url` — annotate each
   toggle in-UI with the one-line behavior effect documented in the Fields doc (organizers should
   not have to guess what "attendees_only" does).
6. **Facilitators / Speakers** — CRUD list with `display_order` drag-reorder; fields per §2 of the
   Fields doc; show `claim_status`/`claimed_at` as **read-only** badges (system-managed, not
   editable); avatar upload.
7. **Agenda** — session CRUD (title, description, start/end pickers, location, audience filter,
   accent color, `block_type` shown only when the event's `event_type = 'teambuilding'`); a
   speaker-assignment sub-panel per session backed by `agenda_session_speakers` letting the
   organizer pick existing facilitators, a `speaker_type` (`speaker`/`panelist`/`moderator`/
   `facilitator`/`host`), and order.
8. **Activities** — CRUD (title, slug, description, rating, location, featured flag,
   `display_order`) plus a per-activity image manager for `activity_images` (hero vs gallery type,
   alt text, reorder).
9. **Networking Questionnaire Builder** — a proper form-builder UI over `event_interest_options`:
   group rows by `question_key`, let the organizer add/reorder question groups and their options,
   toggle `question_type` and `is_required`, edit `question_label`. Do not ship this as a flat
   CRUD table — the mobile app groups these into a multi-step form and the editor should mirror
   that structure so organizers can predict what attendees will see.
10. **FAQs** — CRUD grouped by `section`, reorderable within section.
11. **Info Center Contacts** — `support_contacts` CRUD grouped by `contact_group`.
12. **Emergency Contacts & Images** — `emergency_contacts` CRUD + `emergency_images` gallery
    manager.
13. **Photo Gallery** — moderation view over `event_photos` (list, toggle `is_featured`, delete,
    reorder featured photos); this table is attendee-populated, so this page is review/curate, not
    primary authoring.
14. **Games** — `games` + `game_questions` CRUD. **Before shipping this page, add `event_id`
    filtering to the underlying data layer** — the mobile app's current `services/gameService.ts`
    has no event scoping at all (`getGames()` selects `*` unfiltered), so today every event shares
    every game. Fix this at the schema/query level as part of this feature, not just in the
    portal's UI filter, otherwise organizer A's trivia questions leak into organizer B's event.
15. **Members & Access Codes** — extend, don't rebuild, the pattern already in the mobile app's
    `app/admin-event-codes.tsx`: list `event_members` for the event, issue/regenerate access codes
    via the existing `issue_event_access_code` RPC, and add the invite flow from Section 3b here
    (invite by email + role, see pending invites, revoke an unused invite).
16. **Activity Log** — read-only feed over the new `event_content_audit_log` table, filterable by
    table/user/date range.

**Explicitly do not build editor UI for:** `posts`, `messages`, `chats`, `connections`,
`notifications`, `feedback` (read-only results view is fine, but no "populate" UI),
`session_attendees`, `facilitator_favorites`, `game_results`, `networking_preferences`,
`user_settings`, `user_push_tokens`, `meeting_requests`. These are attendee-generated runtime data
or an unrelated marketing form — see §13 of the Fields doc for the full reasoning.

---

## 7. Cross-Cutting Requirements

- **Validation:** every form field's constraints (length limits, required-ness, enum values,
  numeric ranges like `rating` 0–5 or `attempt_count >= 0`) must be enforced with a `zod` schema
  shared between the client form and the server mutation — never trust client-side validation
  alone.
- **Sanitization:** sanitize all free-text fields before persisting (mirror
  `lib/validators.ts`'s `sanitizeText` pattern from the mobile repo) to prevent stored XSS, since
  this content renders unescaped-ish in a native app's `Text`/image components and, if this portal
  itself ever renders any of it back (e.g. live preview), it must be escaped there too.
- **Optimistic UI + rollback:** for reorder (drag-and-drop) actions, update UI optimistically but
  roll back on server rejection with a visible error toast.
- **Empty/loading/error states:** every list/editor page needs explicit empty state, loading
  skeleton, and error state — do not ship bare blank screens.
- **Accessibility:** all interactive components keyboard-navigable, proper labels/ARIA on form
  inputs, color pickers must show a text hex input alongside the visual picker for screen-reader
  and keyboard users.
- **Responsive:** organizers may use this portal on a laptop or tablet backstage at an event —
  target down to ~768px width without horizontal scrolling on core pages.
- **Audit-safe deletes:** prefer soft-delete or at minimum log the pre-delete row into
  `event_content_audit_log` before hard-deleting, so an accidental deletion is recoverable from
  the log even if there's no "undo" button in v1.

---

## 8. Schema/Backend Changes Required (do these before or alongside the UI)

1. Add `event_content_audit_log` table (see Section 4) with RLS restricting reads to members of
   the relevant event/org.
2. Add an `event_invites` table: `id`, `organization_id`, `event_id nullable`, `email`, `role`,
   `token_hash`, `invited_by`, `created_at`, `expires_at`, `used_at`, `revoked_at`. RLS: only
   inviter's org/event admins can read/write; the accept-invite server action uses the service
   role to validate the hashed token (a not-yet-authenticated invitee can't otherwise read this
   table).
3. Fix `games`/`game_questions` event scoping: ensure all reads/writes filter by `event_id`
   (update the equivalent service layer in this new portal, and flag the mobile app's
   `services/gameService.ts` for the same fix so both surfaces agree).
4. Create a new Supabase Storage bucket (e.g. `event-assets`) with an event-scoped path
   convention (`{organizationId}/{eventId}/{feature}/{filename}`, reusing the
   `buildEventScopedPath` helper's shape from the mobile repo) and storage RLS policies restricting
   writes to users with a qualifying `event_members`/`organization_members` role for that event's
   folder.
5. Double-check/extend RLS on every table listed in Section 6 so that `UPDATE`/`INSERT`/`DELETE`
   require the requester to have a qualifying role — do not assume existing policies (written for
   the read-mostly mobile app) already cover organizer write access.

---

## 9. Delivery Plan (build in this order)

1. Project scaffold, Supabase client setup (server + browser), env config, base layout, design
   system primitives.
2. Auth: sign-in, password reset, MFA enrollment/challenge, session middleware/guards.
3. Sign-up path 3a (create org) end-to-end, including the owner's first event creation flow.
4. Sign-up path 3b (invite send + accept) end-to-end.
5. Event switcher + role-gated route guard.
6. Schema/backend changes from Section 8 (audit log, invites table, storage bucket + policies,
   RLS hardening, games event-scoping fix).
7. Event Basics + Hero & Branding + Theme Colors + Terminology/Toggles pages (these share the
   single `events` row, so ship together).
8. Facilitators, Agenda (+ speaker assignment), Activities.
9. Networking Questionnaire Builder.
10. FAQs, Info Center Contacts, Emergency Contacts & Images.
11. Photo Gallery moderation, Games (post-fix).
12. Members & Access Codes (extending existing RPCs) + pending invites management.
13. Activity Log page.
14. Pass over Section 7's cross-cutting requirements on every page; accessibility and responsive
    QA pass.

## 10. Definition of Done

- A brand-new organizer can: sign up (3a), create an org, create an event, fully brand it (hero,
  theme, terminology), populate facilitators/agenda/activities/FAQs/emergency info, configure the
  networking questionnaire, invite a co-organizer (3b), and see their own changes reflected
  live in the mobile app (verify against the actual mobile queries in `services/*.ts`, not just
  that a row exists in the DB).
- A user without a qualifying `event_members`/`organization_members` role cannot reach any editor
  page or mutate any row for that event, verified by attempting the underlying Supabase call
  directly (not just checking the UI hides the button).
- Every mutation appears in the Activity Log with a correct diff.
- No service-role key or other secret is present in any client-shipped bundle (grep the built
  output before calling this done).
