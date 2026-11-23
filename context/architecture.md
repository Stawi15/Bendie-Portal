# Architecture

## Stack

| Layer          | Tool                                  | Purpose                                                              |
| -------------- | -------------------------------------- | ---------------------------------------------------------------------- |
| Framework      | Next.js 15.5 (App Router), React 19     | Full stack framework (standard install). Reconciled 2026-11-23 (Feature 030, doc 40 G1); earlier text said Next 14 |
| Language       | TypeScript                             | Throughout                                                            |
| Backend        | Supabase (Postgres + Auth + Storage)   | Shared with the Evently-App mobile backend — the portal is a second client against the same database |
| Styling        | Tailwind CSS 3, custom Material-style tokens | See `ui-tokens.md`                                              |
| Forms          | Plain `useState` + direct Supabase calls | The dominant pattern in this codebase — see `code-standards.md`; `react-hook-form` + `zod` are installed but not currently used anywhere in `src/` |
| Notifications  | `react-hot-toast`                      | Save/error feedback on every mutation                                 |
| CSV / Excel    | `papaparse` + `exceljs` (lazy-loaded)  | The shared import dialog (`CsvImportModal`) used by every bulk-import screen: CSV, pasted rows and `.xlsx` (Feature 023), via `src/lib/csvImport.ts` + `src/lib/spreadsheetImport.ts`. `exceljs` loads only when an `.xlsx` is chosen |
| Testing        | `vitest` (`npm test`)                  | Unit tests for pure helpers only (`src/lib/*.test.ts`, Feature 023); no component/DOM tests |
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
│       ├── layout.tsx (server)                               → reads the `studio_shell` cookie → `components/shell/PortalShell`
│       ├── events/[eventId]/layout.tsx                       → `useEventWorkspace()` → EventWorkspaceV1 (current) | EventWorkspaceV2 (Studio 2.0)
│       ├── events/[eventId]/{dashboard,basics,hero,theme,terminology,
│       │   facilitators,agenda,attendee-travel,activities,excursions,
│       │   expo,news,networking,faqs,info-center,emergency,
│       │   gallery,event-photos,games,members,activity-log}/page.tsx
│       │                                                       → the 21 content sections (single source of truth: `eventSectionMeta.ts`)
│       ├── people/page.tsx, teams/page.tsx, assets/page.tsx
│       ├── settings/page.tsx, activity-log/page.tsx
├── components/portal/          → reusable portal UI (pages' building blocks)
├── components/shell/           → Feature 030: PortalShell, AppShell (v2 frame), sidebars, ContextStrip, Breadcrumbs, RightPanel, EventWorkspaceV1/V2
├── components/header/          → Feature 030: the header's model (`useHeaderModel`) and parts, shared by v1 TopHeader and the v2 top bar/sidebar
├── contexts/                   → AuthContext, EventContext, OrganizationContext, ConfirmContext
├── lib/                        → supabaseClient.ts, portalAuth.ts, csvImport.ts, assetUpload.ts,
│                                   eventSectionMeta.ts, eventStats.ts, portalLabels.ts,
│                                   portalBreadcrumb.ts, formatRelativeTime.ts, reorder.ts,
│                                   useOrgEvents.ts, useOrgPeople.ts, useTeams.ts, useRecentActivity.ts
├── types/database.ts           → hand-maintained Supabase Database type (not auto-generated)
├── middleware.ts                → auth + portal admission (Stawi admin, or member of ≥1 organisation) for /portal and /auth
└── globals.css                  → Tailwind base + @layer components (.input, .btn-primary, etc.)
```

There is no `agent/`, `actions/`, or `services/` layer — this is a much flatter architecture than the original planning pass assumed (see `build-plan.md` for how the real build order diverged from that plan). All data access happens directly from `'use client'` page/component code via the shared `supabase` browser client, except the two `api/admin/*` routes which need the service-role key.

---

## System Boundaries

| Folder             | Owns                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------- |
| `app/portal/**`     | Pages. Each page owns its form state and calls Supabase directly or through a shared per-domain module. Constitution v2.0.0 (Principle II) allows domain modules in `src/lib/<domain>.ts` that take a passed-in Supabase client and run under RLS (precedent: `src/lib/planner*.ts`), and requires one once logic has a second caller. There is still no generic service/repository layer. |
| `app/api/admin/**`  | Platform-wide privileged operations (service-role). Every route re-verifies the caller is `global_role = 'admin'` via the cookie-based server client before touching the service-role client — never trust the client body alone. Stays platform-admin-only (constitution v2.0.0, Principle II). |
| `app/api/events/**`, `app/api/organizations/**` | Organization-scoped privileged operations (constitution v2.0.0, Principle II). Each route re-verifies, per request, that the caller is a platform admin **or** an owner/admin of the organization that owns the target record — resolved server-side (e.g. `events.organization_id`, or the route's organization verified against `organization_members`), never from a client-supplied or "currently selected" org id. Precedent: Feature 008 `planner-permissions/*` via `canAdministerPlannerPermissions`. Must never escalate (no platform admin, no org owner/admin grants unless a spec allows it, no cross-organization access). |
| `components/portal` | Presentational + lightly-stateful UI (modals, cards, badges). Can call Supabase directly (e.g. `AssetPickerModal`) — this project does not enforce "components never touch the DB." |
| `contexts/`         | Cross-page state: current user/profile, current event, current organization, a shared confirm-dialog. |
| `lib/`              | Supabase client singleton, auth/role helpers, domain modules, CSV parsing, asset upload, small per-domain hooks (`useOrgEvents`, `useTeams`, etc.), and pure logic with vitest tests. `useEventWorkspace.ts` is the single place event-section availability, redirects and the journey are decided (Feature 030). |
| `middleware.ts`     | The only route-level auth gate. |

---

## Studio 2.0 shell (Feature 030)

Two layouts wrap the same pages, chosen per browser by the `studio_shell` cookie (`v1` default, `v2` = Studio 2.0; `?shell=v1|v2` overrides and sticks). `app/portal/layout.tsx` is a server component that reads the cookie (so `/portal/*` renders per request) and passes it to the client `PortalShell`. The account menu's "Try the new layout" / "Back to the current layout" switches it.

- **v1** (current): `OrgSideNav` + `TopHeader`; event pages via `EventWorkspaceV1` (area tabs + steps).
- **v2**: `AppShell` (global top bar: search, activity, settings, account, New event) + a sidebar + canvas (breadcrumbs, page, Previous/Next) + one right-panel slot (no content yet). Organisation routes use `OrgSidebar`; event routes use `EventSidebar` (six areas from `EVENT_SECTIONS[].area`, display only) with the `ContextStrip` (products, visibility in the attendee app, your role).
- Both event layouts render from one `useEventWorkspace()` and share `EventContentGate`, so availability, redirects and paused-product rules can't drift. Never decide availability in a layout or sidebar.
- The header's state lives in `useHeaderModel()`; the v1 header and the v2 shell render the same parts (`components/header/HeaderParts.tsx`).

---

## Authentication & Authorization

### Identity & Session

- Supabase Auth, email/password. `@supabase/ssr` for cookie-based sessions across client and middleware.
- `src/lib/supabaseClient.ts` exports one browser client used everywhere in `src/`; there is currently no shared server-side client file — `middleware.ts` and the two `api/admin/*` routes each construct their own `createServerClient` inline against the request's cookies.

### Role-Based Access Control

Two tiers, both real and in use:

- **Portal admission** (`src/middleware.ts`, Feature 003): a Stawi admin (`profiles.global_role = 'admin'`) **or** a signed-in user with at least one `organization_members` row. Anyone else lands on `/portal/no-access` (not `/unauthorized`). `/portal/admin/**` stays Stawi-admin only (Feature 022). Earlier text here said admin-only; reconciled 2026-11-23 (doc 40 G1).
- **Org/event-scoped roles** (`organization_members.role`, `event_members.role`) — `host`/`organizer`/`admin` at the event level, `owner`/`admin` at the org level; checked via helpers in `src/lib/portalAuth.ts` (`canManageEvent`, `isOrgAdmin`, `getUserEventRole`) for finer-grained UI/action gating beyond the blanket global-admin check.

- **Feature 017 (2026-10-09)**: every organization `owner`/`admin` is automatically an event `admin` on every event of their organization (triggers on `events` and `organization_members` + backfill), so event access still comes from `event_members` as Feature 003 requires. Only platform admins (or the service role) can create or change organization `owner`/`admin` memberships — enforced by `organization_members` RLS, not only the UI.
- **Feature 021 (2026-10-14)**: organization `owner`/`admin`s can create, edit and delete their events' **agenda sessions** (`agenda_sessions` policies `*_org_admin`, helper `is_event_org_admin(ev_id)` resolved from `events.organization_id`). Breakout rooms and room assignments may be managed by platform admins, org admins and event `host`/`organizer`/`admin`s. The agenda page shows controls only to people who can use them (session editing: platform/org admin; breakout tools: those plus event hosts/organizers).
- **Feature 022 (2026-10-16)**: `/portal/admin/**` (the Organisations area) is platform-admin only — the middleware redirects anyone else to `/unauthorized`, the pages re-check `isGlobalAdmin`, and its routes live under `app/api/admin/organizations/**` and `app/api/admin/planner-organizations` (each calls `requirePlatformAdmin()` from `src/lib/orgProductsAdminServer.ts`). Organisation owners/admins can see their products' state (a paused notice) but never change it.

**Middleware pattern** (`src/middleware.ts`):

```typescript
// Redirect unauthenticated users away from /portal
if (!user && pathname.startsWith('/portal')) return redirectTo('/auth/login');

// Admission for /portal (both checks use short-lived httpOnly cache cookies;
// UX only — RLS still governs every read and write):
if (user && pathname.startsWith('/portal') && pathname !== '/portal/no-access') {
  const role = await getRole(user.id);
  if (role !== 'admin' && pathname.startsWith('/portal/admin')) return redirectTo('/unauthorized');
  if (role !== 'admin' && !(await getHasOrgMembership(user.id))) return redirectTo('/portal/no-access');
}
```

**Privileged API route pattern** (`src/app/api/admin/create-user/route.ts`; org-scoped variant: `src/app/api/events/[eventId]/members/[memberId]/planner-permissions/enable/route.ts`):

```typescript
// 1. Build a cookie-based server client, call auth.getUser()
// 2. Authorize server-side — reject with 401/403 otherwise:
//    platform-wide route: profiles.global_role = 'admin'
//    org-scoped route:    platform admin OR owner/admin of the target record's own organization
// 3. Only then construct the service-role client and perform the privileged action
const adminClient = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
```

MFA (TOTP) for privileged roles was documented as a requirement in the original scope document but is **not implemented** — `requiresMFA()` in `portalAuth.ts` only checks role, it does not check or enforce an actual TOTP factor. Track this as an open item in `progress-tracker.md`.

---

## Data Flow

**Venue time (Feature 024):** event dates typed into the Portal are wall-clock times in the event's time zone (`events.timezone`), the same rule the attendee app and Bendie Planner use. Convert with `src/lib/eventTimeZone.ts` (`zonedLocalToUtcIso`, `utcIsoToZonedLocal`, `zonedDateOf`), never with `new Date(local)` or `iso.slice(0, 10)`, which use the computer's zone or UTC. With no zone set, the computer's zone is used, as before.

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

**Breakout rooms (Feature 021):**
- **Storage:** rooms live in `agenda_breakout_rooms` / `agenda_breakout_room_items`; attendee placements in `agenda_breakout_assignments`.
- **The released app's JSON is derived:** the database rebuilds `agenda_sessions.breakout_rooms` from the tables by trigger, so the released attendee app keeps working. Pages must never write that column; a guard trigger refuses direct changes.
- **Saving rooms:** the agenda page saves a session's rooms atomically with the `save_breakout_rooms` RPC (SECURITY INVOKER).
- **Attendee picks:** made only through `choose_breakout_room`, which applies mode and capacity under a row lock.
- **Spreadsheets:** the agenda spreadsheet carries breakouts as one row per room (`breakout_room` column) and updates matching sessions instead of duplicating them. Each breakout's people list is downloaded and uploaded in `BreakoutAssignmentsModal`.
- **`CsvImportModal` options:** it gained optional `refineResults` (cross-row checks), `previewWarnings` and `importAll` (grouped import) for this.

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

- **Moderation and blocks (Feature 028)**: `content_reports` is service-role only (`src/lib/moderation.ts`, routes under `app/api/admin/moderation/**`, page `/portal/admin/moderation`). Bendie hides blocked authors' posts, comments and messages from the blocker, admins included, so moderation and the Gallery (`src/lib/galleryServer.ts`) read with the service role and re-apply the old RLS access themselves. Gallery writes run as the caller first, so the audit trigger keeps the actor, and fall back to the service role only when RLS matched nothing.
- **`profiles` column lock-down (Feature 027, Bendie C1)**: with a user key, select only `profiles`' public columns. Your own Stawi-admin status comes from `portal_is_global_admin()`; in server routes, your own `global_role`/`current_organization_id`/`planner_profile_id` come from `readCallerProfile(user.id)` (`src/lib/callerProfile.ts`, service role, verified id only). Other people's email/phone come from `src/lib/profileContacts.ts`: `eventMemberContacts`, `organizationPeopleContacts` (route `/api/organizations/[id]/people/contacts`), `profileContacts` / `emailsForUnnamed`. Lists must still render when contacts come back empty.
- **Planner access rule (Feature 026)**: the Portal uses the Planner service role, so it re-applies Planner's own rule in one place, `src/lib/plannerAccessRules.ts` (`loadPlannerAccessFacts`) and `plannerAccessRulesCore.ts` (`moduleAccess`, mirroring Planner's `has_event_module`). Never decide Planner access from `profiles.role` (job titles) or inline per module. When Planner's rule changes, change it there and re-run the live equivalence check described in `specs/026-planner-access-alignment/plan.md`.
- **Planner organisation switch (Feature 022)**: Planner's `organizations.is_active` is enforced by Planner's own access checks (`is_org_active` / `is_event_org_active`, installed by `specs/022-org-products-admin/planner-sql/enforce_planner_organization_active.sql`). When the Portal pauses an organisation's "Planner app access", it switches that flag off: the organisation's people and staff assigned to its events lose Planner access, Planner platform admins keep it. Resuming Planner in the Portal switches it back on. The Portal only offers this once `is_org_active` exists in Planner.

## Invariants

- `/portal/*` is reachable only by a Stawi admin or a member of at least one organisation (`/portal/admin/**`: Stawi admins only) — enforced in `middleware.ts`, backstopped by RLS (never rely on middleware alone).
- Every Supabase write from the client stamps `event_id` (or `organization_id`) to the current context — never a user-editable field.
- Privileged (service-role) operations only ever happen server-side in route handlers, gated by a fresh per-request authorization check, never by trusting a client-supplied "I'm an admin" flag: platform-wide operations in `app/api/admin/*` (platform admin only), organization-scoped ones elsewhere (platform admin or owner/admin of the target's own organization) — constitution v2.0.0, Principle II.
- No hardcoded hex values or raw Tailwind color classes in components — use the tokens in `ui-tokens.md`.
- Facilitators are populated via CSV import as the primary path — if you add fields to the facilitators form/table, verify the CSV template/parser (`src/lib/csvImport.ts` + `CsvImportModal.tsx`) covers them, per schema-reference.md's 2026-08-18 note that new fields have gone live without CSV support before.
