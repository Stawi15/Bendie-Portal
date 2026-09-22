# Feature 011 Plan: Bendie Planner People & Participant Identity

## Canonical Data

- `passengers` (global identity) + `event_passengers` (event join), both in the Planner Supabase project. No Planner schema change. No Portal-side copy of either table.
- No triggers on either table — Portal sets `updated_at` on `passengers` itself on every edit (no DB trigger does it).
- Item-scope security: every mutation resolves the target by `(plannerEventId, passengerId)` via `event_passengers` existence, mirroring `getVendorItem`/`getChecklistItem`'s "404 covers both missing and wrong-event" shape.

## Data-Access Layer — `src/lib/plannerPeople.ts`

Mirrors `plannerVendors.ts`/`plannerChecklist.ts` shape exactly (`'server-only'`, explicit column lists, no `select('*')`, narrow single-purpose functions, no route concerns).

- `Participant` type: `{ id (passenger_id), eventPassengerId, fullName, title, passport, dietaryRequirements, gender, email, phone, createdAt, updatedAt, linkedAt }`.
- `PeopleCapability` / `ResolvedPeopleCapability` — same `{hasPlannerIdentity:false} | {hasPlannerIdentity:true, canView, canManage}` shape as every prior module.
- `ParticipantCreateInput` (new person): `{ fullName (required), title?, passport?, dietaryRequirements?, gender?, email?, phone? }`.
- `ParticipantPatch`: `Partial<{ fullName, title, passport, dietaryRequirements, gender, email, phone }>` — all fields editable (no protected-field trigger exists here, unlike Vendors/Checklist).
- `PlannerPeopleValidationError` / `PlannerPeopleNotFoundError` — same pattern as Vendors/Checklist.
- `PEOPLE_SELECT_COLUMNS` — explicit `event_passengers` + embedded `passengers(...)` column list.
- `resolveCallerPlannerIdentity` — duplicated verbatim (established per-module duplication convention).
- `resolvePeopleCapability(plannerEventId, plannerProfileId)` — **differs from every prior module**: Planner platform-admin bypass grants full access as usual; otherwise checks only for the *existence* of an active `event_user_assignments` row (any flags) to grant `canView`, and never grants `canManage` on its own (that only ever comes from the Portal-layer `canAdministerPlannerPermissions` check, applied at the route layer — see Security below).
- `listParticipants(plannerEventId)` — join `event_passengers` → `passengers`, sorted by `full_name` in JS (PostgREST foreign-table ordering not needed at this scale — an event's roster, not the full 342-row global table).
- `getParticipant(plannerEventId, passengerId)` — the shared item-scope check.
- `searchUnlinkedPassengers(plannerEventId, query)` — `ilike` on `full_name`/`email` against the global `passengers` table (capped, e.g. 20 rows), filtered in application code against the event's already-linked passenger IDs. Deliberately not org-scoped (spec.md Verified Business Rule 8).
- `createNewParticipant(plannerEventId, input)` — inserts `passengers` then `event_passengers`; if the second insert fails, deletes the just-created `passengers` row (avoids orphaning an identity nobody can see). Not a distributed transaction — acceptable at this scale/rapid-workflow scope, documented here rather than building new transaction infrastructure.
- `linkExistingParticipant(plannerEventId, passengerId)` — inserts `event_passengers` only; a unique-violation (Postgres `23505`) is mapped to `PlannerPeopleValidationError('already_linked')`.
- `updateParticipant(plannerEventId, passengerId, patch)` — item-scope check, then updates `passengers` fields present in the patch (`'field' in patch` idiom throughout, since every field is a nullable string with no separate "false" case to distinguish) plus `updated_at: new Date().toISOString()`.
- `removeParticipantFromEvent(plannerEventId, passengerId)` — deletes the `event_passengers` row only; never touches `passengers`.
- `normalizePlannerPeopleError` — same safe-mapping pattern as every prior module.

## Authorization — Route-Layer Composition (the one genuine deviation from prior modules)

Every route resolves, in order: 1) Portal auth, 2) selected org, 3) `requireEventWorkspaceAccess`, 4) `isProductAvailableForEvent('planner')`, 5) provisioning/`event_planner_links`, then diverges:

6. `canAdministerPlannerPermissions(eventId, userId, authClient)` (from `@/lib/eventAuth`, Feature 008's existing export) — if true, `capability = { hasPlannerIdentity: <whether a Planner identity also resolves>, canView: true, canManage: true }`, **without requiring a Planner identity to exist**.
7. Otherwise, resolve `plannerProfileId` via `resolveCallerPlannerIdentity`; if absent, deny (`planner_identity_unavailable` for the collection/item routes; `{hasPlannerIdentity:false}` for the capability route, matching Vendors' own split).
8. Otherwise, call `resolvePeopleCapability(plannerEventId, plannerProfileId)` for the `{canView, canManage: false}` outcome.

Copied inline per route file (established Feature 007–010 convention — no shared route helper).

## API Routes

- `GET/POST /api/events/[eventId]/planner-people` — list + capability (GET); create new person + link (POST, `{fullName(required), title?, passport?, dietaryRequirements?, gender?, email?, phone?}`).
- `GET /api/events/[eventId]/planner-people/capability` — dedicated capability-only endpoint (mirrors Vendors' `capability/route.ts`).
- `GET /api/events/[eventId]/planner-people/search?q=` — Manage-only global passenger search for the "add existing" flow.
- `POST /api/events/[eventId]/planner-people/link` — Manage-only, links an existing `passengerId` to the event.
- `PATCH/DELETE /api/events/[eventId]/planner-people/[passengerId]` — Manage-only edit (any subset of the editable fields) / remove-from-event.

## UI Structure

- `src/app/portal/events/[eventId]/planner-people/page.tsx` — identical state machine to `planner-checklist/page.tsx` (loading/denied/configuring/loaded), `requestIdRef`/`mountedRef` stale-response guards.
- `PlannerPeopleList.tsx` — table (name, title, passport, dietary requirements, gender, email, phone, linked-since), Edit/Remove actions for Manage-capable users, read-only for View-only.
- `PlannerPeopleModal.tsx` — two-tab create flow ("New person" form / "Search existing" picker with debounced search-as-you-type against `/search`) plus a separate edit-mode rendering of the same field set for an existing participant.

## Brownfield Files Reused

`plannerAdmin.ts` (service-role client), `eventAuth.ts` (`requireEventWorkspaceAccess`, `isProductAvailableForEvent`, and **newly reused** `canAdministerPlannerPermissions`), `plannerOverview.ts` (`resolveProvisioningPhase`), `eventSectionMeta.ts` (`EVENT_SECTIONS`), the event workspace layout's independent-capability-block pattern (now a fourth parallel block, alongside Tasks/Vendors/Checklist — never merged into a shared abstraction, per standing instruction).

## Security Considerations

- `passengers`' own live RLS (`SELECT USING (true)`) is more permissive than Portal's own View gate — Portal's server-side check is strictly narrower, which is safe (Portal never relies on Planner RLS for its own authorization; it always writes/reads via service-role and re-derives its own authorization independently, per every prior module's established principle).
- `event_passengers` has zero RLS policies (full default-deny for non-service-role) — irrelevant to Portal, which always uses the service-role client, but confirms Planner's own client has no ordinary-user path to read/write this join table either.
- Global passenger search is intentionally not org-scoped (spec.md Verified Business Rule 8) — a Manage-capable user for one org's event can find and link a passenger who was first created under a different org's event. This mirrors Planner's own existing global visibility and is not a new exposure Portal introduces.
- No attribution fields exist on either table (no `created_by_profile_id` equivalent) — no NULL-actor-attribution concern to design around, unlike Vendors/Checklist.
- `updated_at` must be set by application code on every `passengers` edit (no DB trigger provides it) — a real, easy-to-forget point of divergence from every prior module, called out explicitly here so it isn't missed during implementation.
