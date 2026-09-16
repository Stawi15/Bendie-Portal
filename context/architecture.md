# Architecture

## Stack

| Layer          | Tool                                  | Purpose                                                              |
| -------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| Framework      | Next.js 14 (App Router)                | Full stack framework — this is a standard Next 14.2.x install, not a modified/breaking-changes fork |
| Language       | TypeScript                             | Throughout                                                            |
| Backend        | Supabase (Postgres + Auth + Storage)   | Shared with the Evently-App mobile backend — the portal is a second client against the same database |
| Styling        | Tailwind CSS 3, custom Material-style tokens | See `ui-tokens.md`                                              |
| Forms          | Plain `useState` + direct Supabase calls | The dominant pattern in this codebase — see `code-standards.md`; `react-hook-form` + `zod` are installed but not currently used anywhere in `src/` |
| Notifications  | `react-hot-toast`                      | Save/error feedback on every mutation                                 |
| CSV            | `papaparse`                            | Facilitator bulk import (`src/lib/csvImport.ts`)                      |
| Drag & drop    | `@dnd-kit/*`                           | Installed, not yet wired up — intended for the Networking Questionnaire Builder's reorderable options |
| Color picker   | `react-color`                          | Installed, not yet wired up — Theme Colors currently uses plain `<input type="color">` + hex text field |
| State          | `zustand`                              | Installed, not yet used — state today is React Context (`AuthContext`, `EventContext`, `OrganizationContext`, `ConfirmContext`) |

---

## Folder Structure

```
src/
├── app/
│   ├── layout.tsx, page.tsx
│   ├── auth/{login,signup,forgot-password,reset-password}/page.tsx
│   ├── unauthorized/page.tsx
│   ├── api/admin/{create-user,bulk-create-users}/route.ts   → service-role user provisioning
│   └── portal/
│       ├── layout.tsx, page.tsx, loading.tsx
│       ├── events/page.tsx                                  → org-wide events list
│       ├── events/[eventId]/layout.tsx                       → tab bar + "Next" wizard nav (EVENT_SECTIONS)
│       ├── events/[eventId]/{dashboard,basics,hero,theme,terminology,
│       │   facilitators,agenda,attendee-travel,activities,excursions,
│       │   expo,news,networking,faqs,info-center,emergency,
│       │   gallery,event-photos,games,members,activity-log}/page.tsx
│       │                                                       → the 21 content sections (single source of truth: `eventSectionMeta.ts`)
│       ├── people/page.tsx, teams/page.tsx, assets/page.tsx
│       ├── settings/page.tsx, activity-log/page.tsx
├── components/portal/          → all reusable portal UI (flat, no further nesting yet)
├── contexts/                   → AuthContext, EventContext, OrganizationContext, ConfirmContext
├── lib/                        → supabaseClient.ts, portalAuth.ts, csvImport.ts, assetUpload.ts,
│                                   eventSectionMeta.ts, eventStats.ts, portalLabels.ts,
│                                   portalBreadcrumb.ts, formatRelativeTime.ts, reorder.ts,
│                                   useOrgEvents.ts, useOrgPeople.ts, useTeams.ts, useRecentActivity.ts
├── types/database.ts           → hand-maintained Supabase Database type (not auto-generated)
├── middleware.ts                → auth + global_role gate for /portal and /auth
└── globals.css                  → Tailwind base + @layer components (.input, .btn-primary, etc.)
```

There is no `agent/`, `actions/`, or `services/` layer — this is a much flatter architecture than the original planning pass assumed (see `build-plan.md` for how the real build order diverged from that plan). All data access happens directly from `'use client'` page/component code via the shared `supabase` browser client, except the two `api/admin/*` routes which need the service-role key.

---

## System Boundaries

| Folder             | Owns                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------- |
| `app/portal/**`     | Pages. Each page owns its own data fetching, form state, and Supabase calls — there is no separate "service layer" to route through. |
| `app/api/admin/**`  | The only server-side privileged operations (service-role user creation). Every route re-verifies the caller is `global_role = 'admin'` via the cookie-based server client before touching the service-role client — never trust the client body alone. |
| `components/portal` | Presentational + lightly-stateful UI (modals, cards, badges). Can call Supabase directly (e.g. `AssetPickerModal`) — this project does not enforce "components never touch the DB." |
| `contexts/`         | Cross-page state: current user/profile, current event, current organization, a shared confirm-dialog. |
| `lib/`              | Supabase client singleton, auth/role helpers, CSV parsing, asset upload, and small per-domain hooks (`useOrgEvents`, `useTeams`, etc.). |
| `middleware.ts`     | The only route-level auth gate. |

---

## Authentication & Authorization

### Identity & Session

- Supabase Auth, email/password. `@supabase/ssr` for cookie-based sessions across client and middleware.
- `src/lib/supabaseClient.ts` exports one browser client used everywhere in `src/`; there is currently no shared server-side client file — `middleware.ts` and the two `api/admin/*` routes each construct their own `createServerClient` inline against the request's cookies.

### Role-Based Access Control

Two tiers, both real and in use:

- **Global gate** (`profiles.global_role = 'admin'`) — required for `/portal/*` at all. Checked in `src/middleware.ts`.
- **Org/event-scoped roles** (`organization_members.role`, `event_members.role`) — `host`/`organizer`/`admin` at the event level, `owner`/`admin` at the org level; checked via helpers in `src/lib/portalAuth.ts` (`canManageEvent`, `isOrgAdmin`, `getUserEventRole`) for finer-grained UI/action gating beyond the blanket global-admin check.

**Middleware pattern** (`src/middleware.ts`):

```typescript
// Redirect unauthenticated users away from /portal
if (!user && pathname.startsWith('/portal')) return redirectTo('/auth/login');

// Global-admin gate for /portal, with a short-lived httpOnly cache cookie
// (60s TTL) to avoid a profiles round-trip on every navigation. This cache
// is a UX optimization only — real data access is still fully governed by
// RLS via portal_is_global_admin(), so a stale cache can never grant actual
// data access, only delay a demotion showing up in the UI.
if (user && pathname.startsWith('/portal')) {
  const role = await getRole(user.id); // checks ROLE_CACHE_COOKIE first
  if (role !== 'admin') return redirectTo('/unauthorized');
}
```

**Privileged API route pattern** (`src/app/api/admin/create-user/route.ts`):

```typescript
// 1. Build a cookie-based server client, call auth.getUser()
// 2. Look up profiles.global_role for that user — reject with 401/403 if not admin
// 3. Only then construct the service-role client and perform the privileged action
const adminClient = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
```

MFA (TOTP) for privileged roles was documented as a requirement in the original scope document but is **not implemented** — `requiresMFA()` in `portalAuth.ts` only checks role, it does not check or enforce an actual TOTP factor. Track this as an open item in `progress-tracker.md`.

---

## Data Flow

There is no Server Actions layer. The pattern is uniform across all 16 content-section pages:

```
Page mounts ('use client')
    ↓
useEffect → supabase.from(table).select(...).eq('id', eventId).single()
    ↓
setForm(data)  — plain useState, not react-hook-form
    ↓
User edits inputs directly bound to form state
    ↓
handleSave() → supabase.from(table).update(payload).eq('id', eventId)
    ↓
toast.success(...) / toast.error(error.message)
```

Image uploads follow the same direct-call shape via `src/lib/assetUpload.ts` (org assets → `org-assets` bucket) — event-content images upload to the `event-assets` bucket (bucket + RLS policies created in `supabase/migrations/004_storage_policies.sql`, gated to `global_role = 'admin'`, public read).

---

## Database Schema & Event Scoping

Full, continuously-updated field-by-field reference (with a dated changelog of every schema/behavior change) lives in **[schema-reference.md](schema-reference.md)** — treat that file as the living source of truth for schema, RLS, and app-behavior detail; it is kept current far more tightly than this file. For anything schema-reference.md doesn't cover, or to confirm current live state, use the **`supabase` MCP server** directly (`list_tables`, `execute_sql`, `get_advisors`, `generate_typescript_types`) rather than a static SQL dump — a point-in-time export goes stale immediately given how often this schema changes (see schema-reference.md's own changelog).

The short version:

- Every content table has an `event_id uuid` FK to `events.id`. Some tables (`excursions`, `expo_spaces`, `news_items`, `excursion_categories`) allow `event_id IS NULL` to mean "global, shown on every event" — most do not.
- RLS enforces event-scoped read/write via `event_members` role membership, with an admin-bypass function `portal_is_global_admin()` layered on top so global admins can read/write everything regardless of per-event membership.
- **Every write must stamp the correct `event_id`** — never leave it to a client-supplied value beyond the currently-selected event.
- As of 2026-08-18 all 49 tables in `public` have RLS enabled with no exceptions (see schema-reference.md's Changelog for the full audit).

---

## Storage

| Bucket         | Access                                              | Contents                                    |
| -------------- | ---------------------------------------------------- | -------------------------------------------- |
| `event-assets` | Public read; write restricted to `global_role = 'admin'` (`004_storage_policies.sql`) | Hero images, facilitator avatars, activity/emergency/game images |
| `org-assets`   | Per-organization, via `src/lib/assetUpload.ts`       | Org logos, shared documents, picked via `AssetPickerModal` |

The mobile app additionally uses `avatars`, `post-images`, `chat-media`, and `event-files` buckets — see schema-reference.md §12 for the full picture; those are largely attendee-facing and outside this portal's direct concern except `event-files` (organizer-upload-only shared documents), which is not yet built into the portal UI.

---

## Cross-Project Integration (Bendie Planner)

The portal also integrates with **Bendie Planner** — a separate Expo/React Native app for event
organizers/production staff, running against its own, entirely separate Supabase project
(different `auth.users` realm, bigint/serial IDs instead of UUIDs). This is a second, deliberately
narrow exception to the "one Supabase project" pattern described above, not a general precedent —
see `specs/001-bendie-planner-integration/` for the full spec/plan/tasks.

- **Per-event, opt-in link** (`event_planner_links`), not automatic for every event. One Portal
  event ↔ one Planner event, enforced by a partial unique index on the active row only.
- **Three one-directional flows, never bidirectional for the same data type:**
  - Members: Portal → Planner, automatic at provisioning time, staff-tier roles only.
  - Agenda: Portal → Planner, manual ("Push to Planner" button).
  - Travel (flight/hotel): Planner → Portal, manual ("Pull from Planner" button), read-only once
    in Portal.
- **Identity bridging is email-based** — the two projects share no auth realm, so a person's
  Planner-side `profiles.id` is resolved (or created, since Planner has no auto-seed trigger on
  signup) by matching email and cached on `profiles.planner_profile_id`.
- **Server-only, service-role-to-service-role**: `src/lib/plannerAdmin.ts` is the one shared
  (`server-only`-guarded) exception to this codebase's usual per-route-inlined service-role client
  pattern — justified because 5 routes under `src/app/api/admin/planner-*` each need an identical
  cross-project client, not because this project has adopted shared service clients generally.
  Every one of those routes still independently re-verifies the caller is a Portal global admin
  before touching Planner, exactly like `create-user`/`bulk-create-users`.
- **A Planner-side failure never fails a successful Portal operation** — member sync is
  fire-and-forget from the caller's perspective; its outcome is recorded and surfaced to admins,
  not treated as blocking.

## Invariants

- `/portal/*` is unreachable without `profiles.global_role = 'admin'` — enforced in `middleware.ts`, backstopped by RLS (never rely on middleware alone).
- Every Supabase write from the client stamps `event_id` (or `organization_id`) to the current context — never a user-editable field.
- Privileged operations (user creation) only ever happen server-side in `app/api/admin/*`, gated by a fresh role check, never by trusting a client-supplied "I'm an admin" flag.
- No hardcoded hex values or raw Tailwind color classes in components — use the tokens in `ui-tokens.md`.
- Facilitators are populated via CSV import as the primary path — if you add fields to the facilitators form/table, verify the CSV template/parser (`src/lib/csvImport.ts` + `CsvImportModal.tsx`) covers them, per schema-reference.md's 2026-08-18 note that new fields have gone live without CSV support before.
