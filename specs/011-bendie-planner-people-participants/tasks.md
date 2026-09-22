# Feature 011 Tasks: Bendie Planner People & Participant Identity

Lightweight checklist per the rapid-implementation workflow. ~30 tasks.

## Data-access layer

- [x] T01 Create `src/lib/plannerPeople.ts` (`'server-only'`), types: `Participant`, `PeopleCapability`, `ParticipantCreateInput`, `ParticipantPatch`, error classes.
- [x] T02 `PEOPLE_SELECT_COLUMNS` — `event_passengers` columns + embedded `passengers(...)` column list; `shapeParticipant` mapper.
- [x] T03 `resolveCallerPlannerIdentity` (duplicated from Vendors/Checklist's identical function).
- [x] T04 `resolvePeopleCapability(plannerEventId, plannerProfileId)` — Planner platform-admin bypass grants `canView+canManage`; otherwise `canView` reflects only whether an *active* `event_user_assignments` row exists (any flags), `canManage` always `false` here (Portal-layer-only elevation, per plan.md).
- [x] T05 `listParticipants(plannerEventId)` — join, sorted by `full_name`.
- [x] T06 `getParticipant(plannerEventId, passengerId)` — item-scope check via `event_passengers` existence.
- [x] T07 `searchUnlinkedPassengers(plannerEventId, query)` — global `ilike` search, filtered against already-linked IDs.
- [x] T08 `createNewParticipant(plannerEventId, input)` — insert `passengers` then `event_passengers`; rollback (delete) the `passengers` row if the link insert fails.
- [x] T09 `linkExistingParticipant(plannerEventId, passengerId)` — insert `event_passengers` only; map unique-violation (`23505`) to `already_linked`.
- [x] T10 `updateParticipant(plannerEventId, passengerId, patch)` — item-scope check, updates only fields present in patch (`'field' in patch` idiom) + manually sets `updated_at`.
- [x] T11 `removeParticipantFromEvent(plannerEventId, passengerId)` — deletes `event_passengers` row only.
- [x] T12 `normalizePlannerPeopleError` — safe category/message mapping.

## API routes

- [x] T13 `src/app/api/events/[eventId]/planner-people/capability/route.ts` — capability-only, mirrors Vendors' capability route, using the `canAdministerPlannerPermissions`-first sequence (plan.md).
- [x] T14 `.../planner-people/route.ts` `GET` — list + capability.
- [x] T15 `.../planner-people/route.ts` `POST` — create-new-person-and-link; allowlist `{fullName(required), title, passport, dietaryRequirements, gender, email, phone}`; `canManage` gate.
- [x] T16 `.../planner-people/search/route.ts` `GET` — `canManage`-gated global search (`?q=`).
- [x] T17 `.../planner-people/link/route.ts` `POST` — `canManage`-gated, `{passengerId}` link-existing.
- [x] T18 `.../planner-people/[passengerId]/route.ts` — shared context + item pre-fetch (404 on cross-event/missing), `PATCH` allowlist (all 6 editable fields, empty-body rejected), `DELETE` (remove from event).
- [x] T19 Wire `normalizePlannerPeopleError` into all route files' catch blocks.

## Navigation/capability integration

- [x] T20 `eventSectionMeta.ts` — add `planner-people` (`product: 'planner'`).
- [x] T21 `EventLayout.tsx` — fourth independent capability block (`PlannerPeopleCapabilityState`, its own fetch effect, its own `isSectionAvailable`/pending/defer branches) — parallel addition, no changes to Tasks/Vendors/Checklist blocks.

## UI

- [x] T22 `src/app/portal/events/[eventId]/planner-people/page.tsx` — state machine identical to `planner-checklist/page.tsx`.
- [x] T23 `PlannerPeopleModal.tsx` — "New person" tab (fullName required, rest optional) + "Search existing" tab (debounced search, pick-to-link) + edit-mode rendering for an existing participant.
- [x] T24 `PlannerPeopleList.tsx` — table with Edit/Remove actions; Viewer rendering has zero mutation controls.
- [x] T25 Confirm the UI never exposes a "delete participant globally" control anywhere — only "remove from event." (Verified by inspection: neither `PlannerPeopleList.tsx` nor `PlannerPeopleModal.tsx` calls any endpoint but `DELETE .../planner-people/[passengerId]`, which is `removeParticipantFromEvent` — there is no global-delete route at all.)

## Quality gate

- [x] T26 `npm run type-check` clean.
- [x] T27 `npm run lint` clean (no errors; only pre-existing warnings in unrelated files, nothing new from Feature 011's own files).
- [ ] T28 Production build not run — the dev server was live throughout this session and shares the `.next` directory, making a concurrent build unsafe (identical accepted precedent to Features 008/009/010).

## Live verification (synthetic fixtures only)

- [x] T29 Manage-capable caller (via `canAdministerPlannerPermissions`, a disposable org-admin identity with **no** Planner identity at all — proving the admin bypass genuinely doesn't require one): capability (`canView:true, canManage:true`), create, edit, link-to-a-second-event, remove-from-event, repeat-delete-404 — all live-HTTP verified against the running dev server.
- [x] T30 View-only caller (disposable identity with a real Planner identity + an *active* `event_user_assignments` row holding **zero** of the specific `can_view_*`/`can_manage_*` flags — proving `canView` really is "any active assignment," not a flag check): capability (`canView:true, canManage:false`), list succeeded, create/edit/remove each independently denied `403 people_manage_denied`.
- [x] T31 No-access caller (disposable identity with event workspace access but no Planner identity and no admin authority): capability returned `{hasPlannerIdentity:false}` (200, matching the established non-error capability-shape convention); the collection route correctly denied with `403 planner_identity_unavailable`.
- [x] T32 Linking an already-linked participant rejected cleanly: `400 already_linked` / "This person is already part of this event." — not a crash, not a silent duplicate row.
- [x] T33 Cross-event PATCH rejected: a participant linked only to "Both Test" returned `404 participant_not_found` when PATCHed through "Planner Test"'s route; confirmed still present and unmodified on "Both Test" immediately after.
- [x] T34 Canonical visibility: every create/link/edit response is a direct re-read of `event_passengers`/`passengers` via the service-role client (no second store); additionally confirmed via direct SQL at multiple points during the run (e.g., `event_passengers` row count for the test passenger dropped to exactly 0 after both removals, before the final cleanup delete).
- [x] T35 Removing from one event leaves the other untouched: linked the same passenger to both "Both Test" and "Planner Test," removed from "Planner Test" only, then confirmed via `GET` that the "Both Test" link and the global `passengers` record were both still fully intact.
- [x] T36 Planner-only event tested at the API/data level: capability and list both succeeded (full access) against "Stawi Escape — Planner Test" (a genuinely Planner-only event, not just used as a cross-event target). **Bendie-only `product_unavailable` denial was not independently re-run this pass** — no fresh Bendie-only fixture was provisioned; this gate (`isProductAvailableForEvent`) is byte-identical, unmodified code already proven live for Vendors/Checklist/Tasks. Left as shared, already-proven behavior rather than re-tested here, matching Checklist's own T33 precedent — not a defect.
- [x] T37 Tasks/Vendors/Checklist/Feature 008 unaffected: spot-checked all four capability/administration endpoints with the same org-admin session immediately after the People mutations above — Tasks/Vendors/Checklist each correctly returned their own independent `{hasPlannerIdentity:false}` (this identity was never given a Planner profile, and People's admin-bypass logic is fully local to `plannerPeople.ts`/People's own routes — it does not leak into or alter any other module's capability resolution), and Feature 008's `can-administer` endpoint correctly still returned `true`.
- [x] T38 Fixture cleanup: all 4 disposable auth users (3 Portal, 1 Planner) deleted via the Auth Admin API; all supporting rows (`organization_members`, `event_members`, `event_user_assignments`, Planner `profiles`, the disposable `passengers` row) deleted; confirmed via a live-DB row-count query returning all zeros on both projects. The two long-lived retained fixtures (`f005-creator-*`, `f007-viewself-test@bendie-test.invalid`) were independently re-confirmed present and untouched.

## Close-out

- [x] T39 Checkboxes above reflect exactly what was genuinely verified this pass; T28 (production build) is the one item left honestly unchecked and deferred, per established precedent.
