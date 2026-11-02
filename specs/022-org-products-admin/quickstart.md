# Quickstart: validating Organisation Products Management (Feature 022)

API details: [contracts/admin-organizations-api.md](contracts/admin-organizations-api.md). Data: [data-model.md](data-model.md).

## Prerequisites
- **Portal migration** `organization_products_admin.sql` applied to Bendie `droaamagpsojkzznywgd`.
- **Planner SQL** `planner-sql/enforce_planner_organization_active.sql` run in Planner `zghoaawgrmvqdlksuiam`. Check the project id in the address bar.
- **Accounts:**
  - a platform admin
  - an org owner/admin (not a platform admin) of a test organisation
  - a Planner app user assigned to that organisation's Planner events
  - a Stawi staff Planner user assigned to one of its events
  - a Planner platform admin

## 1. Planner enforcement (before any Portal UI)
1. With the test organisation's Planner organisation active, confirm in the Planner app that the client user, the org admin and the Stawi staff user see the same events as before (no change for active organisations).
2. Set that Planner organisation's `is_active = false` (temporarily, in the Planner SQL editor):
   - the client user, the Planner org admin and the Stawi staff user see **none** of its events or their data (agenda, production, logistics, tasks, notifications)
   - the Planner platform admin still sees everything
   - other organisations are unaffected
3. Set it back to true. Everything returns.
4. If anything in the Planner app breaks for an **active** organisation, run `planner-sql/revert_enforce_planner_organization_active.sql` in the Planner project. It restores the original definitions.
5. **Before the Planner SQL is installed**, the pause dialog must **not** show "Also pause Planner app access" (it shows a note instead), and the API refuses `pausePlannerAppAccess` with `409`.

## 2. Access (US1, FR-001/002, SC-005)
- **Platform admin:** "Manage organisations" is in the top menu, and the list shows every organisation with product states and the Planner connection.
- **Org owner/admin:**
  - no menu entry
  - `/portal/admin/organisations` redirects to `/unauthorized`
  - calling any `/api/admin/organizations…` route returns 403

## 3. Create (US2, SC-001/002)
1. Create "QA Test Org" with Bendie + Planner, choosing "Create a new Planner organisation". Expect:
   - both products Active
   - Planner connected
   - the Planner organisation exists in Planner
2. As its admin, create a Planner event. It must succeed with no "Planner hasn't been set up" error. Time step 1: under 2 minutes.
3. **All-or-nothing:** if creation fails at the Portal step (e.g. a duplicate slug), no organisation, product rows or Planner link are left behind, and a just-created Planner organisation is removed.
4. **Rejections:**
   - creating with no product: refused
   - choosing an already-connected Planner organisation: it isn't offered
   - a duplicate slug: message shown

## 4. Upgrade (US3)
1. On a Bendie-only test organisation, switch Planner on. It must ask for a connection first.
2. In "Existing events", add Planner to one event. Its Planner tabs appear, and `planner_provisioning_status` is `succeeded`.

## 5. Pause and resume (US4, SC-003/004)
1. Snapshot the organisation's event, event_products, Planner link and Planner event counts.
2. Pause Planner **without** the checkbox. The org admin sees the paused notice, and the client Planner user still has app access.
3. Resume. Then pause Planner **with** "Also pause Planner app access". The client user and the Stawi staff user lose app access; the Planner platform admin keeps it.
4. Resume. App access returns, and the snapshot is unchanged.
5. Pause Bendie. The dialog says live events keep working; the attendee app still shows the events.

## 6. Organisation users (US5, SC-006)
With Planner paused and Bendie active, as the org admin check:
- the switcher shows Planner "Paused"
- `/portal/planner` shows the paused notice
- a direct Planner event tab link shows the notice
- Bendie works normally

Pause Bendie too: the all-paused page appears.

## 7. History (US6, SC-007)
The organisation's History lists, newest first, each with the right person and time:
- create
- product on/off
- Planner connection
- app access pause/resume
- product added to an event

## 8. Checks
`npm run type-check`, `npm run lint` (baseline 28 warnings), and an isolated build.
