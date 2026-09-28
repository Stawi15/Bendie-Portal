# Feature 016 Spec: Bendie Portal Guided Event Setup UX

Lightweight rapid-implementation spec. Product principle: **"Setup is a journey. Management is a workspace."** The Portal is already a functional management workspace (Features 001–015); this feature reduces the friction of *initial* event population without touching backend architecture, canonical data, authorization, or API contracts.

Full context: `context/portal-ux-current-state-audit.md` (read-only discovery pass that preceded this feature) and `context/planner-backend-coverage-audit.md` (backend domain coverage).

## Non-negotiable brownfield boundary

No database changes, no new API routes, no changed authorization semantics, no changed canonical write targets (Ground Transport stays Movement→Vehicle→Assignment via the existing RPCs; Production stays `production_tasks`), no removed functionality from Features 001–015. Every improvement composes *existing* endpoints/components differently or adds client-side-only orchestration.

## Scope actually delivered this pass

The user's brief specified 9 phases (A–I). Given the size of that brief (a multi-week UX program, by its own admission spanning navigation, a full guided wizard, six forms' worth of "Save & Add Another," a person-centric Logistics rebuild, a Ground Transport workflow redesign, Production progressive disclosure, a Team & Access widget, a dedicated Review & Readiness page, and a full responsive pass), this implementation pass delivers the highest-leverage, safely-shippable subset and defers the rest explicitly rather than shipping all nine phases shallowly or fabricating completion. See `tasks.md` for the exact per-phase status.

**Delivered (this pass):**
- **Phase A — Grouped navigation.** The event workspace tab bar is grouped (Overview / Event Setup / Programme / Attendees / Content / Media / Operations for Bendie; Overview / People / Planning / Logistics / Production for Planner) via a new pill-selector row, cutting the always-visible tab count from 20+ to ~4 at a time. Zero routes changed, zero hrefs changed, zero availability logic changed — purely a display grouping over the existing `EVENT_SECTIONS` array.
- **Phase B — Dashboard command centre.** The existing Dashboard tab gained: (1) a fix for a pre-existing crash (`SECTION_CHECKS` was missing entries for 5 Planner tabs, added in Features 009–014, that `EVENT_SECTIONS` already had — every Dashboard render for those tabs threw `Cannot read properties of undefined (reading 'kind')`); (2) a deterministic "Recommended next" callout (first incomplete Bendie section + a dependency-ordered Planner recommendation); (3) a "Bendie Planner Readiness" card grid, shown only when the event has Planner active, built entirely from composing 8 existing GET endpoints (People, Tasks, Vendors, Checklist, Flights, Hotels, Ground Transport movements, Production) client-side — no new API routes.
- **Phase C (partial) — Save & Add Another + empty states.** "Save & Add Another" implemented end-to-end for Vendors (the simplest form) as the reference pattern — reuses the exact same single-create endpoint, adds no new API behavior, remounts the modal (fresh fields) via a `key` bump instead of closing it. Dependency-aware, actionable empty states (with Add/Import CSV CTAs, or an honest "bulk import isn't available here" note where CSV genuinely doesn't exist) shipped across all eight Planner list surfaces: Vendors, Checklist, People, Flights, Hotels, Ground Transport, Tasks, Production.

**Explicitly deferred (not started this pass — see tasks.md "Deferred" phases):**
- Phase C remainder: "Save & Add Another" replicated to Checklist, People, Flights, Hotels, Tasks, Production (the pattern is proven on Vendors; repeating it 6× is mechanical but was not done here to keep this pass verifiable rather than rushed).
- Phase D — Person-centric Logistics view (per-participant Flights/Hotel/Transport readiness on the People tab).
- Phase E — Ground Transport composite workflow (Movement→Vehicles→Assignments as one guided flow instead of three separate screens).
- Phase F — Production form progressive disclosure (grouped/collapsed sections).
- Phase G — Team & Access discoverability widget inside the Planner workspace (currently only reachable via the Bendie-side Members page, unchanged).
- Phase H — A dedicated Review & Readiness page/tab (the Dashboard's new Planner Readiness grid is a partial, lighter-weight step toward this, not the full page the brief describes).
- Phase I — Broader responsive pass (fixed grid-cols-2/3 forms, wide-table mobile card views) beyond what Phase A/B's own new markup already handles responsively.

## Why this scope, not less or more

- **Not less**: the crash fix, navigation grouping, and Dashboard readiness summary are the three changes that most directly address the audit's own top-ranked friction ("navigation overload," "no meaningful completion state," "no recommended next action") for the *most* users, at the *lowest* risk (no changes to any create/edit/delete code path).
- **Not more**: Phases D/E/F are genuine UI *rebuilds* of already-shipped, already-verified interaction models (Features 011–014). Doing them well requires the same discipline as those original features (live verification, disposable fixtures, typecheck/lint) — attempting all of them in one pass risked exactly the kind of "half-migrated between two incompatible systems" the brief explicitly warned against (§21). Shipping Phase A/B/C-partial cleanly, verified, is preferred over shipping six phases unverified.

## Acceptance criteria (this pass)

1. Bendie-only, Planner-only, and Both-product events all open, navigate, and render without regression (verified by typecheck/lint + reasoning about the additive nature of every change; live browser verification not performed — see final report).
2. The Dashboard no longer crashes on any event with a Planner tab (regression fixed, verified via a direct audit of `EVENT_SECTIONS` vs `SECTION_CHECKS` key coverage).
3. Grouped navigation preserves every existing route/href; a direct link to any tab still lands on that tab with its correct group auto-selected.
4. The Planner Readiness grid never fabricates a count — every number is read from an existing endpoint's real response, and a module whose fetch fails or is denied shows "Not available," never a zero pretending to be real.
5. Vendors' "Save & Add Another" creates exactly one record per click (no duplicate submissions), refreshes the authoritative list, and does not alter the existing "Add Item" (single-save) behavior.
6. Every modified/new file passes `tsc --noEmit` and introduces zero new ESLint warnings.

## Exclusions (same as the user's original boundary)

No database/migration changes. No new API routes. No changed authorization/permission semantics. No changed canonical write targets. No CSV added to Tasks or Ground Transport. No Blueprints or Agenda work. No convergence of prior deferred features.

---

## Continuation pass 2 — data-entry efficiency and workflow continuity

Second pass, same feature (016), no new feature folder. Focus per the user's explicit priority order: Save & Add Another everywhere it's safe, context preservation, Production progressive disclosure, Ground Transport workflow continuity, People as the participant hub, Team & Access discoverability, and responsive fixes. Same brownfield boundary as above — every change composes existing endpoints/RPCs; no new API routes, no changed canonical write targets, no changed authorization.

**Delivered this pass** (see `plan.md`'s continuation section for exact files/mechanics and `tasks.md` for the itemized checklist):
1. **Save & Add Another** extended from the Vendors reference to People (new-person path only), Flights, Hotels, Checklist, Tasks, and Production — all six remaining repetitive-creation forms. Edit mode never shows the button. Every module still calls its existing single-create endpoint exactly as the manual "Save" path always has.
2. **Context preservation**: Flights/Hotels carry the selected participant forward; Checklist carries category/day/date/owner; Production carries date/day/track/room; Tasks carries only category. People deliberately resets fully (per the brief's own conservative-default instruction).
3. **Production progressive disclosure**: the ~17-field modal is now five visually grouped sections (Session Details, Programme & Location, Production Requirements, Additional Details, Advanced), Advanced collapsed by default on create and auto-expanded on edit whenever a record already has an Advanced value set (never hidden/lost). No validation or write-shape change.
4. **Ground Transport workflow continuity**: creating a Movement auto-opens Add Vehicle for it; creating a Vehicle auto-opens Assign Passengers for it (both with a guiding toast). Assignment is now multi-select — the UI collects several participant IDs, but the page still calls the existing single-assignment endpoint once per participant (`assign_or_board_passenger` via the same route, never a bulk RPC), reporting partial failure by name rather than claiming atomicity.
5. **People as the participant hub**: the People table gained a Logistics column (Flights/Hotel/Transport status per participant) built from three aggregate fetches (Flights, Hotels, Ground Transport movements — the same endpoints/shapes Phase B's Dashboard already established), correlated client-side by `passengerId`. Zero per-row requests. Each row also gets "Add Flight"/"Add Hotel"/"Transport" links that deep-link into Logistics with the participant preselected.
6. **Logistics summary + URL-backed sub-tab**: a truthful counts strip (Participants/Flights/Accommodation/Ground Transport, "N configured · M need attention") sits above the Flights/Hotels/Ground Transport sub-tabs, computed from data the page already fetches. The active sub-tab now lives in `?view=flights|hotels|ground-transport`, so a refresh or a deep link (from People, or from the Dashboard's readiness cards) lands on the right sub-tab instead of always resetting to Flights.
7. **Team & Access discoverability**: a new card on Planner Overview explains that Planner access is granted per staff member from the Members page, reusing the existing `can-administer` endpoint to decide whether to show a "Manage Team & Access" link — no new permissions editor, no new permission flags.
8. **Responsive**: every remaining `grid-cols-2`/`grid-cols-3` in the eight Planner create/edit modals (Vendors, Checklist, People, Flights, Hotels, Movement, Vehicle — Tasks/Production already covered by Phase A's own pass) now collapses to one column below the `sm` breakpoint.

**Explicitly deferred, still** (unchanged in kind from pass 1, now smaller in scope):
- A full responsive **table→card** rewrite for Flights/Hotels/Production on narrow viewports (the brief's §14) — not attempted; these tables still rely on horizontal scroll. This is the largest remaining item from the original 9-phase brief.
- A dedicated **Review & Readiness page/tab** distinct from the Dashboard's existing Planner Readiness grid — the grid now deep-links to the exact sub-tab per issue (§12's ask), but no separate page was built; the brief was explicit not to build a second competing readiness engine, and a full dedicated page is additional net-new surface beyond that instruction's scope.
- **Browser/visual verification** — no browser automation tool is available in this environment (confirmed via tool search; `WebFetch` explicitly cannot reach `localhost`). This is disclosed, not hidden — see the final report's verification section.

---

## Continuation pass 3 — Navigation Hierarchy & Dashboard Simplification

Third pass, same feature (016), no new feature folder. Triggered by the user's own visual review of pass 1/2's UI, which surfaced concrete, confirmed bugs (not new feature requests): group pills that changed labels without navigating, a sidebar that never highlighted "Events" while inside an event, a redundant event name repeated in both the global breadcrumb and the workspace's own title, and a Dashboard that still rendered 25+ individual section cards despite pass 1's grouped navigation. This pass fixes navigation/presentation only — no forms, no backend, no Blueprints/Agenda work, matching the user's explicit scope boundary.

**Navigation hierarchy adopted** (per the user's own 5-level model): Organisation (sidebar + org selector) → Product (Bendie/Planner selector) → Event (title inside the workspace) → Event Area (group pills) → Section (child tabs / page-internal sub-tabs for Logistics). Each level now owns exactly one job; no level repeats what another already shows.

**Confirmed bugs fixed:**
1. **Group pills weren't navigation.** Clicking a pill (e.g. "Logistics") only changed which child tabs were *listed* — the page content stayed on whatever section was previously routed to, via an independent `selectedGroup` React state that could silently disagree with the actual route. Fixed by deleting that state entirely: the active group is now purely derived from the current route (`activeSection.group`), and each pill is a real `<Link>` to its group's first (or product-context-matching, for the one merged "Overview" pill) section.
2. **Sidebar never highlighted "Events" inside an event workspace.** The old `isActive('/portal/events')` check only matched the three exact discovery-list routes, never falling through to a prefix check for `/portal/events/{id}/...`. Fixed by explicitly matching that prefix. Every other sidebar item (People/Assets/Teams/Activity Log/Settings — none of which has any nested child route) was tightened from `startsWith` to an exact match, so none of them could ever falsely match a longer, unrelated path.
3. **Redundant event name in the global breadcrumb.** `TopHeader`'s breadcrumb used to end in the event's name whenever inside a workspace, duplicating the `<h1>` EventLayout already renders immediately below it. That branch is removed; the global bar now stops at product context (`Organisations > Org ▾ > Product ▾`) for event-workspace routes, and the "← All Events" back-link in the workspace itself is untouched.
4. **Dashboard was still a 25+-card grid.** Replaced with 5 Bendie "setup area" cards (Event Setup, Programme, Attendees, Content & Media, Operations) plus one Bendie Planner card, each showing a compact "N of M complete" status and linking to the first incomplete section in that area — reusing the exact same per-section completion truth the progress bar already used, not a new calculation. The separate 8-card "Bendie Planner Readiness" grid is now one compact list panel instead.
5. **Duplicate "what's next" controls on the Dashboard.** The floating "Next: {label}" button is now suppressed specifically on the Dashboard tab (every other tab keeps it), since "Recommended Next" already serves that exact purpose there.

**Also delivered**: horizontal-scroll affordance (chevrons) added to the group-pill row (previously only the child-tab row had one); a subtle divider + faint orange tint distinguishing Planner group pills from Bendie ones at rest on a Both event; a stronger active-state treatment for child tabs (background tint added alongside the existing colored underline).

**Deferred / not touched**: no form, backend, API, authorization, entitlement, or database change of any kind (confirmed via `git status` — no file under `src/app/api/` touched). No new browser-automation verification became available this pass either — the same disclosed gap as passes 1 and 2.

---

## Continuation pass 4 — Global Header Redesign, Organisation Isolation & Event Status Audit

Fourth pass, same feature (016), no new feature folder. Two independent workstreams per the user's explicit split: (A) implementing an approved visual redesign of the global header, and (B) auditing organization-access security and the event-status model — the latter genuinely security/correctness work, not cosmetic, done first since its findings determined what the header's organisation/product selectors should actually show.

### A. Organisation access audit — result: no bug found, no fix required

Read-only audit (client code + live Supabase RLS inspection via `mcp__supabase__execute_sql` against the Portal project) confirmed organization visibility is enforced at **both** layers: `getAccessibleOrganizations()` (`src/lib/portalAuth.ts`) scopes non-admin users to their own `organization_members` rows client-side, **and** the live `organizations_select_member`/`organization_members_select_org_member` RLS policies independently enforce the identical restriction at the database level — a non-admin cannot see or switch into an organization they don't belong to, even by tampering with the client query. Platform admins get a real, RLS-backed bypass (`portal_is_global_admin()`), not a client-only one. Organization creation is gated both client-side (`isGlobalAdmin` in `TopHeader.tsx`, unchanged) and server-side (`organizations_insert_creator` RLS, platform-admin-only, live-verified). **No security fix was required** — this audit's result directly determined the header redesign's organisation-selector behavior (§B below), not the other way around.

### B. Header redesign

`TopHeader.tsx` — replaced the entire "Organisations > Org ▾ > Product ▾ > Page" breadcrumb (arrows, repeated labels, and all) with two independent context controls, matching the approved mockup exactly: no breadcrumb arrows, no repeated product name, no page-name segment, no event name (already removed in pass 3).
- **Organisation selector**: a compact pill (`🏢 OrgName`). Renders as a real dropdown button **only when `organizations.length > 1`** (the audit-confirmed, already-correctly-scoped list) — a user with exactly one accessible organization sees a plain, non-interactive label instead of a dropdown with nothing to switch to, per §4 of the brief. "New Organisation" remains reachable only for `isGlobalAdmin`, exactly as before — inside the dropdown for multi-org admins, as a small standalone button for single-org admins (so the capability isn't lost when the dropdown itself doesn't exist).
- **Product switcher**: a two-segment control (`[Bendie] [Bendie Planner]`, active segment highlighted) when both products are entitled; a plain static label (no control chrome at all) when only one is — the same "don't render a switcher with nothing to switch to" principle applied to product context. Entitlement source (`useProductEntitlement()`), `?product=` semantics, and `resolveProductSwitchDestination` are **completely untouched** — this is a display-only change on top of unchanged switching logic.
- **Right-side actions** (search, notifications, settings, profile, Create): unchanged in function; Create remains the existing single-link action (`/portal/events`) — no dropdown was added, since none existed to preserve (per §9's explicit instruction not to invent functionality the mockup merely implies).
- **Responsive**: the organisation pill always renders (icon + truncated name, `max-w-[220px]`) since it's compact enough not to need a separate mobile form; the product segmented control is desktop-only (`hidden sm:flex`), with a compact icon-triggered dropdown fallback on narrow screens — but, consistent with the "nothing to switch to" principle, that mobile fallback only renders when both products are genuinely available.

### C. Event status/lifecycle audit — result: confirmed real bug, fixed with a shared helper

Read-only audit (component reads + live schema/data inspection) found: `events.status` (`text NOT NULL CHECK (status IN ('draft','published','active','completed','archived'))`) is a single, fully manual dimension — nothing in the application auto-transitions it. "Upcoming" is not a status value at all; it was a compound `status === 'published' && starts_at > now` check, duplicated identically in `EventsOverviewPanel.tsx` and `OrganizationHome.tsx`. **Confirmed bug**: an event whose dates had clearly passed but whose `status` was never manually updated became permanently invisible from both the "Upcoming" and "Live" tabs/counts, surfacing only under "All" still labeled by its stale status — live-verified against real production events (see plan.md's verification table), and found to affect **`active`-status events at least as much as `published` ones** (the majority of real `active` events in the database had end dates weeks-to-months in the past).

**Fix**: a new single canonical helper, `src/lib/eventLifecycle.ts`'s `deriveEventLifecycle()`, now used everywhere status is displayed or counted (`EventsOverviewPanel.tsx`'s tabs and pill, `OrganizationHome.tsx`'s metric counts and attention-scan filter, `EventLayout.tsx`'s workspace status pill). Rule: `draft`/`archived`/`completed` are terminal human decisions that always win outright, never second-guessed by dates. `active` and `published` are each reclassified to `completed` when their own recorded `ends_at` has unambiguously passed (closing the exact gap found); `published` is further split into `upcoming` (future `starts_at`) or `active`/"Live" (currently within its date window) when dates are present, and left as plain `published` only when there's no date evidence to reason from at all. No database change — this is purely a smarter, consistent, shared *read-side* derivation.

### D. Overview copy simplification

`OrganizationHome.tsx`'s greeting sentence — "Here is what is happening across {org} in {product}." — no longer repeats the product name in words, since the header's new segmented control already makes it visually unambiguous: "Here's what's happening in {org}."

---

## Continuation pass 5 — Activity Log Simplification + People/Teams/Event Access Discovery

Fifth pass, same feature (016), no new feature folder. Two independent workstreams: (A) a real UI implementation — simplifying both Activity Log surfaces from raw table/action/JSON exposure to human-readable "who did what, where, when" — and (B) a pure read-only discovery/audit of the People → Teams → Event Members → Bendie access → Planner access model, explicitly **not** implemented this pass (no schema changes, no new membership tables, no role changes — discovery only, per the user's own instruction).

### A. Activity Log — implemented

**Problem confirmed**: both `/portal/activity-log` (`organization_audit_log`) and the event workspace's own Activity Log tab (`event_content_audit_log`) rendered every row as a raw `INSERT`/`UPDATE`/`DELETE` badge, a raw table name in `<code>`, and — on expansion — a raw `JSON.stringify(diff)` blob including UUIDs, storage paths, and internal foreign keys by default.

**Live-verified `diff` shapes** (read-only queries against real audit rows) that the fix is built on: INSERT/DELETE `diff` is a flat snapshot of the row's own columns; UPDATE `diff` has one key per **already-changed** field only, each shaped `{old, new}` — the trigger populating it has already done the "only show what changed" filtering at the database level, so no unchanged-field noise needed removing at the UI layer for UPDATE rows.

**New shared module**: `src/lib/activityPresentation.ts` — one place for both Activity Log pages (which share an identical row shape and had an identical problem) rather than two copies of the same mapping. Exports: `friendlyArea(table)` (friendly module names, e.g. `organization_assets` → "Assets", `event_members` → "Event Members", with an automatic humanized fallback for any table not explicitly mapped — never a broken UI for an unanticipated table); `describeAction(entry, subjectName?)` (per-table, per-action human verb phrases, e.g. `event_members`+`DELETE` → "removed {subject} from the event," with a generic "{Added/Updated/Removed} {area}" fallback for anything unmapped); `extractHeadline(entry)` (a short second line — e.g. an asset's file name — from whichever common field is present, `null` when none is found, never fabricated); `extractSubjectId`/`tableHasSubject` (resolves which `diff` field names the *person the row is about*, e.g. `event_members.user_id`, distinct from `actor_user_id` who performed the action); `summarizeChanges(entry)` (the human "old → new" list for UPDATE, or a handful of the record's own meaningful fields for INSERT/DELETE — always excluding a fixed set of internal fields: ids, foreign keys, storage paths, sync bookkeeping).

**Subject-name resolution**: both pages now do one small batch `profiles` lookup per page of results (never per-row) to resolve `event_members`/`organization_members`/`team_members`' subject `user_id` into an actual name, enabling "Mary Mwende removed John Kamau from the event" rather than a bare UUID — the exact detail the brief's own worked examples asked for.

**Raw JSON**: never the default view. It sits behind a second, nested "Technical details" disclosure inside the already-expanded human "Changes" view, and that disclosure is only rendered at all for `isGlobalAdmin` — the existing platform-admin flag already used elsewhere in the app for exactly this class of "raw technical view" gating, not a new permission concept.

**Filters**: "All Tables" → "All Areas" (values still map to the real table names for the query; only the visible label is friendlied); "Insert/Update/Delete" → "Added/Updated/Removed".

**Known, disclosed gap**: the brief's own worked example shows a second line naming the *event* an `event_members` change happened on ("Stawi Escape — Event Members"). This wasn't implemented — on the event-scoped Activity Log page it would be redundant (the whole page is already scoped to one event, visible in the page header), and the org-scoped page doesn't currently log `event_members` at all in real data (confirmed live — only `organization_assets` INSERTs exist there today). Implementing event-name resolution for a hypothetical future cross-event org-level member log was judged not worth a second batch-lookup path for a case that doesn't occur in current data — flagged honestly rather than silently built partially.

### B. People/Teams/Event Access — discovery only, see plan.md's full findings and the final report

No implementation. A dedicated research pass audited: the Organisation People model (`organization_members`), Organisation Teams (`teams`/`team_members`) and whether they integrate with events today, the Event Members model and its three add-paths (Add Member, Add All Organisation Members, CSV import), the Organisation-People-page's own event-assignment action, actual `event_members.role` values and their real effects, what grants Bendie vs. Planner access, and confirmation that Planner People/Participants (`passengers`/`event_passengers`) remains structurally separate from every staff/access identity table. Full findings, the identity matrix, and the three-person worked example are in the final report — no code, schema, or migration changes were made for this half of the pass.

---

## Continuation pass 6 — Event Team Foundation Fix + Unified People Assignment

Sixth pass, same feature (016), no new feature folder. Implements against the pass 5 discovery findings: fixes the two confirmed foundation bugs (Teams RLS, `event_members` DELETE RLS), then consolidates the previously-scattered Add Member / Add All Organisation Members / Import CSV / Assign Team / People-page-checkbox provisioning paths into one shared service and one "+ Add People" entry point on the renamed "Event Team" page, with Event Role and Product Access made visually and architecturally distinct per the locked product decision.

### Foundation fixes (Phase 1)

- **Teams RLS**: `teams`/`team_members` were previously readable/writable only by `portal_is_global_admin()`. Added organisation-scoped policies (additive — the existing global-admin policies are untouched): any organisation member can `SELECT` their org's teams/membership; only organisation owner/admin can `INSERT`/`UPDATE`/`DELETE` a team belonging to their own organisation, and can only add people who are themselves already members of that same organisation. Cross-organisation access remains structurally impossible (every check is scoped via the team's own `organization_id`). Verified via direct boolean-expression evaluation of the exact `is_organization_admin`/`is_organization_member` calls the new policies use, against real organisation admins and a real cross-organisation pair (see plan.md for the query results) — not a full session-impersonation behavioral test (this session's tooling cannot safely construct a fake authenticated session; the logical-equivalence proof is the safe alternative, consistent with the precedent set in Feature 008's convergence pass).
- **`event_members` DELETE**: previously had no DELETE policy beyond the global-admin one, so an authorized event host/organizer/admin saw a working "Remove" control with no underlying DELETE path. Added `event_members_delete_host_or_organizer`, mirroring the existing UPDATE policy's host/organizer half exactly (`is_event_host_or_organizer(event_id, auth.uid())`) — cross-event/cross-organisation deletion remains impossible since that helper is already event-scoped, and the existing role-update guard trigger is UPDATE-only and untouched.
- Neither fix required inventing a new security rule — both are additive uses of already-established, already-tested helper functions, so the "stop and ask" escalation path in the brief was not triggered.

### Shared provisioning service (Phase 2)

New `src/lib/eventTeamProvisioning.ts` — the single service every add-people entry point now routes through, replacing four previously-divergent hardcoded-`attendee` implementations (`handleAddAllOrgMembers`, `handleAssignTeam`, `EventAssignmentsDropdown`'s direct insert, and the CSV importer's own insert). Event Role and Product Access are deliberately independent: adding someone always writes one `event_members` row (Event Role is a required field of that row — there is no way to represent "product access with no event role" without a schema change, and none was invented), then Bendie/Planner access are separate, optional, individually-awaited-and-checked steps layered on top. Planner access reuses Feature 008's own `enable`/`PATCH` routes verbatim (never a second permissions implementation) — both independently re-verify `canAdministerPlannerPermissions` server-side, so a UI that incorrectly offered the option still cannot bypass authorization; the result (`granted`/`denied`/`failed`) is reported per person, never assumed.

**Bendie access — the disclosed architectural limitation (per the brief's own instruction not to fake independence):** an `event_members` row is architecturally always Bendie-eligible in the current schema (an access code can be issued for any member at any time via the pre-existing Resend Code action) — there is no independent "Bendie enabled" flag to toggle without a schema change, and none was added. The "Bendie access" toggle in the new Add People flow is therefore honestly scoped to mean "send an access code now," not "grant/deny eligibility" — documented in the Event Team list's own inline copy and in code comments, not silently glossed over.

### Unified Add People experience (Phases 3–6)

- **Event Team page** (`members/page.tsx`, route path unchanged — no route migration): "Members" → "Event Team" throughout (page title, section label in `eventSectionMeta.ts`, counts, empty states); the single `+ Add People ▾` menu (`AddPeopleMenu.tsx`) replaces the old scattered buttons, offering From organisation, From team, Invite new person, Import CSV, and — deliberately last, not beside the primary CTA — Add all organisation people.
- **From organisation / Invite new** (`AddPeopleModal.tsx`, one component with a `mode` switch — selection UI differs, the Event Role/Product Access configuration step and the underlying provisioning call are identical): multi-select search picker or email+name form, then the shared config step, then a per-person result list (never a bare success toast for a multi-step operation).
- **From team** (`AddFromTeamModal.tsx`): pick a team → live preview of exactly who would actually be added (already-on-event people are pre-excluded, never blindly inserting the whole team) → deselect individuals if needed → shared config step. Teams themselves carry no event-role or product-access implication, matching the locked "Teams = reusable grouping only" decision.
- **Add all organisation people** (`AddAllOrgPeopleModal.tsx`): shows total/already-in-event/will-be-added counts and the shared config step before any write — never a silent bulk attendee-add.
- **Event Role / Product Access — visually separated** (`EventAccessConfigFields.tsx`, one shared component used by all four flows above): two bordered sections, "Event Role" (a single select) and "Product Access" (Bendie checkbox + Planner Viewer/Manager/None, each only shown when the event actually has that product). When the caller cannot administer Planner permissions, the Planner control is replaced with explanatory text, never a toggle that would silently 403 — satisfying the brief's "a UI toggle must never bypass authorization" rule directly, on top of the server-side re-verification already described above.
- **People page** (`EventAssignmentsDropdown.tsx`): "adding" a person to an event now opens an inline Event Role picker + Bendie-access checkbox and calls the exact same `addPersonToEvent` shared function, instead of the old instant hardcoded-`attendee` insert — the two provisioning engines are now one. Planner access configuration was deliberately left out of this compact inline surface (full Planner configuration remains a page-level concern) — a disclosed scope reduction, not an oversight. Removal (unchecking) is functionally unchanged, now genuinely reliable given the `event_members` DELETE RLS fix above.
- **Teams page**: added an organisation-admin client-side check (`is_organization_admin` RPC) so Create/Delete/Manage Members controls are only shown to people who can actually use them post-RLS-fix; copy updated to reference the new "Add People → From team" journey. No event-role, Planner-permission, or Bendie-access concept was added to Teams (teams remain pure grouping, per the locked decision).
- **CSV** (`Import Event Team` on the Event Team page): `csvImport.ts`/`CsvImportModal.tsx` (Feature 015) are unchanged. The row template gained two optional columns — `bendieAccess` (yes/no) and `plannerAccess` (none/viewer/manager) — additive and backward-compatible: an omitted `bendieAccess` defaults to `false` (matching the pre-existing CSV path, which never auto-issued a code either) and an omitted `plannerAccess` defaults to `none`. This is a deliberate, disclosed behavior change from the old CSV path's implicit role-derived Planner auto-sync: per the locked "never infer product access from role" decision, Planner access must now be explicit even via CSV. Each row now routes through the same shared `resolveOrCreatePersonByEmail` + `addPersonToEvent` calls as every other entry point (previously its own separate insert logic), at the cost of per-row rather than batched identity resolution — a simplicity trade-off, not a correctness gap.

### Deliberately deferred within this pass

- Planner access "Custom" module-by-module configuration is not offered in the Add People flow (Viewer/Manager/None only) — a manager needing Custom permissions for a newly-added person uses the pre-existing per-row "Bendie Planner Access" action afterward (unchanged, still available). A simplicity trade-off, not a missing capability.
- The Event Team list's "Products" column shows a static "Bendie" badge for every row (per the architectural limitation above) and a "Planner…" link rather than eagerly fetching and displaying live per-row Planner status — building that would require a new batch-read endpoint against Planner's `event_user_assignments` that does not exist today; out of scope for a focused pass.
- The Teams page's "Manage Members" control is hidden entirely (not shown read-only) for non-admin organisation members, even though the new Teams RLS lets them `SELECT` team membership — a minor, disclosed UX gap, not a security gap.
- No browser/visual verification was performed (same disclosed environment limitation as every prior pass in this feature — no browser-automation tool is available in this workspace).

---

## Continuation pass 7 — Attendees / Participants Person-Journey Clarification

Seventh pass, same feature (016), no new feature folder. Two stages: Stage 1 traced the current person models (no code changes); Stage 2 implemented the safest UX improvement the evidence supported.

### Stage 1 finding — the central discovery

**"Bendie Attendees" is not a separate canonical model.** It is `event_members` itself — the exact same table and page as "Event Team" (Continuation pass 6). The Portal's "Attendees" navigation group today contains the Event Team tab, `attendee-travel`, and `networking` — there is no distinct attendee-only table or page underneath the word "Attendees." Any event_members row (any role) is what makes someone Bendie-eligible, confirmed again this pass via `issue_event_access_code`'s precondition check. This means the premise "should Jane be entered twice" for Bendie access doesn't arise for Bendie itself — Event Team IS the attendee list. The real duplicate-entry question is specifically about **Planner Participants** (`passengers`/`event_passengers`, Feature 011), which are genuinely, structurally separate — confirmed again this pass: zero FK from `passengers`/`event_passengers` to `profiles`/`event_members`, matching Continuation pass 5's finding.

**The matching mechanism was not invented — it was found, already twice-precedented.** `src/app/api/admin/planner-pull-travel/route.ts` (Feature 001) already matches Planner `passengers.email` against Portal `event_members`' joined `profiles.email` (exact, lowercased, event-scoped) to pull travel data into Bendie's `attendee_travel_details`. `planner-people/page.tsx`'s existing CSV importer (Feature 015) already implements the identical "search by email → exact match → link, else create" rule for adding participants from a spreadsheet. Both are real, shipped, already-accepted uses of exact-email matching between these two models — this pass's "From Bendie Attendees"/"From Organisation" flows apply the exact same rule a third time, in the reverse direction, via Feature 011's own existing routes. No new stable cross-model ID was found or was needed; per the locked "safe matching" rule, only exact email matches link to an existing global `passengers` record, and a person is always an explicit, named selection by the manager — never an automatic guess.

### Stage 2 — implemented

New shared `src/lib/plannerParticipantMatching.ts` (`matchOrCreateParticipant`) — reuses Feature 011's existing `/planner-people`, `/planner-people/search`, `/planner-people/link` routes only, no new API. New `AddParticipantMenu.tsx` (From Bendie Attendees — gated to Bendie-available events only — / From organisation / Add new participant / Import CSV) and `AddParticipantFromPortalModal.tsx` (multi-select picker, excludes/marks already-linked participants, per-person outcome reporting) on the Planner Participants page. The CSV importer was refactored (not rewritten) to call the same shared matcher for its common case. Planner "People" was relabeled "Participants" in user-facing copy (`eventSectionMeta.ts` label/desc/group only — route `key` unchanged, Feature 011's CRUD/component names untouched). A "Bendie Attendee" cross-status badge appears on a Participant row only on an exact-email match against the event's own `event_members` — never inferred from name, and never shown before the match data has loaded.

**Explicitly preserved, per instruction:** no `event_user_assignments` row is ever created as a side effect of becoming a Participant — Feature 008 remains the sole authority for Planner staff access, and nothing in this pass's new code path touches Planner permissions at all.

### Visual cleanup completed this pass

Event Team's role column no longer shows a duplicate badge+select pair — one editable colored-pill `<select>`. The Person-column pencil icon was inspected and confirmed to open `EditProfileModal` (profile fields, not role) — retained, not removed. The organisation selector's `max-w-[220px]` cap (both dropdown-button and static-label variants) was widened to `max-w-[360px]` so normal-length organisation names display fully; `truncate` remains as a safety net. Activity Log's raw-JSON "Technical details" disclosure was confirmed still gated to `isGlobalAdmin` only (unchanged from Continuation pass 5) — no code change was needed there, only verification. A "Planner…" product-label truncation site beyond the already-fixed organisation selector could not be located from source alone (`TopHeader.tsx`, `OrganizationEventsList.tsx`, `EventLayout.tsx`, `OrgSideNav.tsx` were all checked) — deferred pending a concrete repro.

### Deliberately not done

No new "Attendees" page distinct from Event Team was built — the evidence shows they are the same model today, and fabricating a separate page/table split would have been the "merge/split models without evidence" mistake this pass was explicitly warned against in the other direction. No schema change, no new API route, no change to Feature 008/011/012/013's canonical relationships.

---

## Continuation pass 8 — Portal UX Cleanup, Identity Clarity & Navigation Polish

### Locked terminology (per this pass's explicit instruction — record verbatim)

- **Organisation People** = reusable people belonging to the organisation (`organization_members`).
- **Bendie Attendees & Access** = `event_members` — people belonging to the Bendie event / Bendie access population. (Renamed from "Event Team," which wrongly implied internal-staff-only.)
- **Planner Participants** = `passengers` + `event_passengers` — people operationally tracked for travel/logistics (Feature 011, unchanged).
- **Planner Team & Access** = `event_user_assignments` + the Feature 008 permission model — people who actually work inside Planner and their permissions.

These four remain architecturally independent — this pass changed presentation/copy only, never the underlying models or their relationships.

### Planner Participants navigation-stability investigation

Traced end-to-end: `EventLayout`'s per-module capability state machine (`plannerPeopleCapability`/`plannerPeopleCapabilityPending`/`plannerPeopleDeferToPage`), the redirect effects (mismatched-origin safety net, origin-signal backfill), the group-pill/tab href construction, and the Participants page's own data-loading effects. The capability state machine itself is structurally sound and identical in shape to every other already-shipped Planner module (Tasks/Vendors/Checklist/Logistics/Production), none of which are reported as crashing — this rules out the state machine itself as a uniquely-Participants-specific cause. Two genuine, concrete defects were found and fixed in the Participants-specific code from the previous pass (missing error handling that could leave the UI stuck), plus one confirmed real navigation bug affecting the group-pill link itself (wrong `?product=` signal for single-product groups), and one defense-in-depth hardening was added to `EventLayout`'s redirect effect. Full technical detail in plan.md, including an honest account of what live verification was and wasn't possible in this environment.

### Terminology and presentation changes

"Event Team" → "Attendees & Access" everywhere user-visible (route/`key` unchanged). "People" → "Participants" for every Planner-participant-specific label, including one the previous pass missed (Dashboard's Planner Readiness card). "Organisation People" (a distinct, legitimate concept) was explicitly left untouched. The Products/access column on Attendees & Access no longer shows a Planner-access pill that looked like live status but wasn't — it's been replaced with an honest, static Bendie-eligibility label, and the Planner-access management action moved to Actions, relabeled "Team & Access."

### Deliberately not done

No broad empty-state audit across every Planner module (Tasks/Vendors/Checklist/Production/Logistics) — only Planner Participants (the one actually reported) was fixed; Tasks was spot-checked and found not to have the same duplication. No live Planner-access batch-status endpoint was built (would be N+1 or require new infrastructure) — the Products column was made honest instead of building that. No browser verification was performed (disclosed, consistent with every prior pass).

---

## Continuation pass 9 — Portal Performance, Navigation Stability & Login UX Pass

### The Logistics/Production flicker — root cause and fix

**Confirmed root cause**: `EventLayout` fires six independent Planner sub-module capability fetches (Tasks/Vendors/Checklist/Participants/Logistics/Production) concurrently once Planner availability is confirmed. They resolve at whatever speed each individual network request happens to complete — not atomically. `visibleSections`/`groupedVisibleSections` are recomputed on every render directly from current capability state, so a module whose fetch simply hasn't resolved *yet* is correctly-but-misleadingly excluded from the tab bar while its faster-resolving siblings are already shown. This is exactly the reported "Participants and Production visible, Logistics missing" symptom — a genuine race, unrelated to the user's actual capabilities or the event's product configuration, and unrelated to which tab is currently active.

**Fix**: a new `navSettled` flag (true once every relevant Planner sub-module capability has left `'loading'`) gates the group-pill/tab-bar rendering specifically — while unsettled, a stable skeleton placeholder renders instead of the partially-computed section list. This directly closes the "`undefined` treated as `false`" anti-pattern this investigation was asked to look for.

### Performance findings

Two genuine, confirmed duplicate-request bugs were found and fixed on the login/initial-page-load critical path: `AuthContext` was fetching the user's profile TWICE on every single page load (an unnecessary explicit `getSession()` call racing the already-sufficient `onAuthStateChange` listener, which fires once immediately with the current session on subscribe); `getAccessibleOrganizations()` and `getAccessibleEvents()` (`portalAuth.ts`) were each independently re-fetching the user and their `global_role` from scratch via `supabase.auth.getUser()` + a separate profile query, even though their real callers (`OrganizationContext`/`EventContext`) already have both from `AuthContext`. All three are fixed with a minimal, backward-compatible pattern (an optional `knownUser`/removed-redundant-call), removing real, unnecessary sequential Supabase round trips from every login and every fresh page load — not a speculative change, each one traced to an exact duplicate request in the actual source. Full request-waterfall map in plan.md.

### Login page and loading UX

Reused the existing `/public/bendie.png` logo (already used in `OrgSideNav.tsx` — no new asset created or downloaded) above the login form, matching the requested "Welcome back / Sign in to continue" hierarchy. The submit-button loading state ("Signing in…", disabled inputs, credentials preserved on failure) was found to already meet every requirement in this pass's brief — confirmed, not rebuilt. The post-login transitional screen (`AuthContext.loading`) now carries the same branding and clearer copy instead of a bare unbranded spinner.

### Small cleanup items

Participants page description de-duplicated (one line in `eventSectionMeta.ts`, a subtle contextual link instead of a second paragraph); "Add People" → "Add Attendees" / "Invite new person" → "Invite new attendee" (the explicitly-preserved source labels — From organisation, From team, Import CSV, Add all organisation people — left unchanged); Attendees & Access description simplified to one sentence; role filter chips and selects properly capitalized via the existing `EVENT_MEMBER_ROLE_LABELS` map (stored values unchanged).

### Bendie Access / Onboarding — documented, not changed

Re-confirmed: "Eligible" reflects genuine architecture (any `event_members` row is Bendie-eligible), `onboarding_status` has no write path anywhere in this codebase, and `event_user_access_codes`' own RLS (`user_id = auth.uid()` only) means a manager cannot read whether another person's access code exists, was sent, or was used — so no richer truthful status is currently derivable without an RLS change, which was correctly not made. No fake status logic was introduced.

### Deliberately not done

No route-level `loading.tsx` files added, no further Supabase query restructuring beyond the two confirmed duplicate-request fixes, no prefetch tuning, and no measured before/after millisecond timings (no browser-timing/APM tool available in this environment — only source-level request-count reduction could be established, not measured latency). No broader Actions-menu redesign on Attendees & Access (explicitly out of scope this pass).

---

## Continuation pass 10 — Portal Navigation Performance & Stress-Stability Pass

### The rapid-navigation instability — root cause

Every event-workspace child page implicated in the reported stress sequences already guarded its own local state against a stale response overwriting fresher state (`requestIdRef` staleness counters) — ruling out state corruption as the primary mechanism. The genuine, evidenced mechanism instead: none of these pages' `fetch()`/Supabase calls were ever actually CANCELLED when superseded by a newer navigation — only state-guarded after the fact. Under rapid tab switching, every previous tab's in-flight request kept running to completion regardless, consuming real network/Supabase capacity that the currently-visible destination was competing for. This is a genuine request-storm/resource-contention problem, not a logic bug — and it directly explains every symptom reported (feels frozen, unstable under stress, slow across many pages), independent of the earlier passes' already-fixed duplicate-fetch and nav-flicker issues.

### Fix

New shared `src/lib/useLatestRequest.ts` — a small "latest request wins" primitive built on the standard `AbortController` pattern, retrofitted into the four highest-traffic pages named in the user's own stress sequences (Participants, Logistics, Production, Attendees & Access). A superseded request is now actually aborted, and an abort is always treated as a silent no-op — never a toast, never an error state, never a redirect, per the explicit "cancellation is not an application error" rule.

### EventLayout — re-verified, not changed

Re-traced the capability/redirect state machine specifically for the RAPID-clicking scenario (as opposed to the previous pass's initial-load-race scenario): the six Planner capability fetches only run once per event (not per tab click), and the redirect effect's single-authority bypass (added last pass) already prevents spurious redirects once capability state has settled. No further EventLayout logic change was needed — confirmed via source tracing, not assumed.

### Deliberately not done (scope discipline)

The remaining ~16 simple Bendie content pages (not named in any stress sequence, and structurally simpler single-table reads) were NOT retrofitted with `useLatestRequest` — flagged as a future candidate, not done here, to avoid the "broad refactor" this pass was explicitly warned against. Server-side per-request re-verification of the full Planner authorization chain (a real, measurable source of redundant work) was investigated and deliberately left unchanged — it is this codebase's own established, repeatedly-documented security posture across 6+ shipped modules, and the explicit "authorization must remain correct" instruction rules out trading it for speed. No automated tests were added (no existing test framework in this codebase). No browser-based stress testing was performed (no browser-automation tool available) — verification this pass is source-level tracing plus live HTTP probing, disclosed honestly throughout.

## Continuation pass 11 — CSV Coverage Expansion & Both-Product Travel Journey Guidance

### Part A — CSV import extended to Activities, Excursions, News, Expo, Planner Tasks

Every module's canonical model was inspected from source before writing any CSV code — never inferred from a page's label. Expo, specifically, was confirmed to be `expo_spaces` (an exhibitor/sponsor directory), a genuinely distinct table and product from Feature 009's Bendie Planner Vendors (`event_vendor_items`); the two were never conflated. All five modules reuse Feature 015's existing `csvImport.ts`/`CsvImportModal<T>` framework exactly as the six already-shipped modules do — no second CSV framework, no new generic modal.

Four of the five (Activities, Excursions, News, Expo) write directly to their Bendie-side Supabase table via the same client the manual "Add" forms already use, matching the existing Facilitators/Agenda/Networking/FAQs precedent. Planner Tasks is architecturally different: because task creation requires server-side resolution of the canonical Planner event and the caller's Planner profile identity (data the browser doesn't have), its CSV import instead POSTs each row through the existing `POST /api/events/[eventId]/planner-tasks` route — the identical authorization/capability/validation boundary the manual "New Task" form already goes through, never a direct table write.

Excursions required one genuine extension to the pattern: its CSV rows name a category by human-readable label, never a database id. A new `beforeImport` hook resolves every distinct category label in the batch to an existing or newly-created event-scoped category, sequentially, before the per-row concurrent import begins — preventing two rows that both introduce the same brand-new category from racing each other into a duplicate-key error. This is the correct, minimal extension of `CsvImportModal`'s own documented `beforeImport` contract ("one-time setup run once with all valid rows"), not a new import mechanism.

Planner Tasks' assignee field reuses, rather than reinvents, an existing safe identity-matching rule: `planner-logistics/page.tsx`'s established `resolveParticipantForCsv` (email preferred, else exact case-insensitive full-name match; zero or 2+ matches is a blocking validation error, never a guess) is mirrored exactly as `resolveAssigneeForCsv`, matching against Tasks' own assignable-staff list. That list (`listAssignableStaff`) was extended to also carry each staff member's email — verified live against the Planner database that `profiles.email` exists before depending on it — purely for this matching purpose; the existing assignee dropdown UI is unchanged.

Every one of the five new templates ships with two realistic, human-readable sample rows (never a blank header-only template), and no template exposes a UUID, event id, organization id, or other internal identifier — matching Feature 015's own established template convention. Global ("apply to all events") rows are deliberately not offered as a CSV option in any of the five modules — a conservative, disclosed scope-narrowing decision (not a schema limitation): a bulk-import mistake fanning bad rows out to every other event in the organization is a materially larger blast radius than a manual single-row mistake, so "apply to all events" remains a manual, one-row-at-a-time action everywhere it already existed.

On the empty-state-vs-header-actions question: none of the five target modules had previously adopted the Participants-specific pattern (primary actions live in the empty state, not duplicated in the header) — each already had exactly one, unconditional header action ("Add X") with no empty-state action at all. Rather than newly introducing that pattern to five pages that never had it (a broader redesign than requested), the new "Import CSV" button was added next to the existing header action, matching the majority precedent already shipped on Facilitators/Vendors/Agenda/Networking/FAQs. This satisfies the actual instruction ("if the page already follows the Feature 016 empty-state pattern... avoid duplicating") without inventing a new duplication that didn't previously exist.

### Part B — Both-Product Travel Journey guidance

Feature 001's existing travel relationship was re-confirmed from source before any UI was built, not assumed: `POST /api/admin/planner-pull-travel` is the sole travel-transfer mechanism, one-directional (Planner → Bendie only), manual (button-triggered, no background job), and limited to flight/hotel data. `attendee_travel_details` carries two restrictive RLS policies that explicitly forbid any client write to a row already marked as Planner-sourced — confirming the one-directional design is a structural database property, not merely an unbuilt feature. This pass adds no new synchronization direction and no new synchronization endpoint.

The user-identified problem — a manager entering travel manually in Bendie Attendee Travel, unaware that Bendie Planner already supports (and is meant to be the source for) the same data — is addressed purely as in-app guidance, never a blocking workflow. A new Both-product-only banner on Attendee Travel (rendered only once `isProductAvailableForEvent` confirms Planner is also active for this specific event — never shown on a Bendie-only or Planner-only event) offers two actions: "Set up in Bendie Planner" and "Pull from Bendie Planner" (the latter reusing Feature 001's exact endpoint directly from this page, not merely linking to where it already lived on the separate `bendie-planner` tab). The user remains free to keep entering travel manually in Bendie at any time — the banner is advisory, and the existing manual form beneath it is never disabled or hidden.

"Set up in Bendie Planner" lands on Planner Logistics' Flights sub-tab specifically (`?view=flights`, reusing that page's own pre-existing deep-link mechanism from Features 012/013), chosen over a generic Planner Overview landing as the most useful entry point into actually configuring travel. A lightweight, narrowly-scoped return mechanism (`src/lib/travelReturnContext.ts`, backed by per-event `sessionStorage`, never an arbitrary URL — see plan.md for the full rationale) lets Planner Logistics and Planner Participants each show a subtle "Return to Attendee Travel" banner for exactly the duration of this one guided round trip, surviving ordinary tab-bar navigation between Participants and Logistics (needed when a manager must first link a Bendie attendee as a Planner Participant via the pre-existing "From Bendie Attendees" flow before Flights/Hotels has anyone to attach a booking to). Returning shows a one-time, honestly-worded prompt ("Travel setup in Planner complete? Pull the latest travel details into Bendie.") — never a claim that setup is verified complete, only that the user asked to come back.

Verified explicitly: a Bendie-only event never renders any part of this guidance (the Both-product check resolves false, so the entire code path is inert); a Planner-only event has no Attendee Travel tab to begin with, so the return banners on the Planner side simply never find an active journey to show. No Bendie → Planner synchronization exists anywhere in the result.

## Continuation pass 12 — Portal Data Entry UX & Productivity Pass

### Audit findings — the Portal was further along than assumed

Before writing any code, every data-entry surface named in the brief was inventoried. The most important finding: **"Save & Add Another" already existed on every Planner create modal** (Participants, Flights, Hotels, Vendors, Checklist, Production, Tasks) — this was solved incrementally across Feature 015 and earlier Feature 016 passes, not a gap this pass needed to fill. Two reusable "`[+ Add] ▾`" menu primitives (`AddPeopleMenu.tsx`, `AddParticipantMenu.tsx`) already exist and are already wired up correctly. The "enter once, reuse existing data" principle the brief asks for is already fully implemented across every named pathway (Organisation People → Bendie Attendees, Organisation People → Planner Participants, Bendie Attendees → Planner Participants, Planner Travel → Bendie Attendee Travel) with exact, never-fuzzy matching, and the four person/identity data models remain correctly unmerged. This pass's actual, genuine gaps were narrower than the brief's full list implied: the four Bendie-side modules added to the CSV framework last pass (Activities, Excursions, News, Expo) never had Save & Add Another; paste-from-spreadsheet didn't exist anywhere; inline editing existed only for the self-assignee Tasks control, not for managers; and a real, if small, bug was found — Planner Tasks' empty state still claimed "Bulk CSV import isn't available for Tasks," which stopped being true the moment last pass added it.

### Paste from spreadsheet — implemented as one shared-component change, not sixteen bespoke ones

Rather than hand-building a separate paste workflow per module, `CsvImportModal.tsx` — the one component every CSV-enabled module already shares — was extended with a source-mode toggle ("Upload File" / "Paste from Spreadsheet"). A new `parseCsvText` helper (`csvImport.ts`, PapaParse's own delimiter auto-detection) converts pasted text into the identical `ParsedCsv` shape the file-upload path already produces, so every downstream step — `parseRow`, the valid/invalid preview, `runWithConcurrency`'s bounded-concurrency import, per-row error reporting — is exactly, structurally the same code regardless of which path produced the rows. This single change gives all 16 already-CSV-enabled modules paste support at once (the 11 from Feature 015/Continuation pass 11, plus every module added since), rather than the 5-7 modules a hand-wired approach would have realistically covered at the same time budget. Column-alias matching (e.g. "Email" vs. "Email Address") was investigated and deliberately left for a future pass — the brief itself frames it as a nice-to-have, not a requirement, and every module's own template already documents its exact expected headers.

### Save & Add Another, retained values, and Duplicate

Activities, Excursions, News, and Expo — the four modules that genuinely lacked it — each gained a "Save & Add Another" action, with per-module value retention decided from each module's actual field set rather than a generic rule: Activities retains `location`; Excursions' category is already fixed panel context outside the form entirely; News retains `themes` and refreshes its publish timestamp; Expo retains `is_exhibitor`/`is_sponsor`. "Duplicate" (open a prefilled, unsaved copy of an existing record, requiring an explicit Save, never writing directly) was implemented for Activities only, as a depth-over-breadth proof of the pattern — the same mechanism trivially extends to the other seven candidate modules in a future pass.

### Inline editing — Tasks only, bulk actions deferred

Planner Tasks managers previously had no way to change a task's status without opening the full Edit modal (only the narrower self-assignee status control was interactive). A manager-only inline status dropdown was added, firing immediately (optimistic, with rollback to the prior value on failure) and reusing the exact same PATCH endpoint/authorization path the Edit modal's own Status field already used — no new mutation, no new RLS. Bulk actions (Tasks bulk status-change, Checklist bulk complete, Attendees bulk resend-code) were confirmed genuinely safe to build the same way (bounded-concurrency calls to an existing single-record endpoint, exactly like Ground Transport's existing multi-passenger assignment already does) but were deliberately deferred — building a real row-selection UI at genuine quality is a substantial increment on its own, and the brief explicitly permits prioritizing depth over attempting every item shallowly.

### Deliberately not done this pass

Post-save contextual next actions ("12 activities added → Add Excursions") and the Dashboard "Finish setting up your event" assistant — both the brief's own lowest-priority (P3) tier — were not implemented. The former requires real cross-module state awareness (e.g. Activities' success toast would need to know whether Excursions has any rows yet, which its page doesn't currently fetch); the latter touches a large, unaudited page and risks exactly the "broad redesign" scope creep every prior pass was explicitly warned against. Both are flagged as natural candidates for a future, focused Feature 016 continuation pass rather than attempted shallowly here. Column-alias matching, bulk actions beyond the one proven inline-edit pattern, and Duplicate beyond Activities are likewise deferred, each for the reasons given above.

## Continuation pass 13 — Theme Colour Picker & Measured Screen Performance Pass

### Theme colour picker

Auditing the existing theme implementation before writing anything turned up a pleasant surprise: the native `<input type="color">` swatch and a live preview panel were already there from an earlier pass — the real gap was narrower than the brief assumed. What was missing: any HEX validation at all (a malformed value would previously be saved verbatim), a set of preset shortcuts, a lightweight contrast warning, and a working "Reset to Default" (the default values already existed in code, just with no button to apply them). All four gaps are now closed. The picker and the HEX field share one validation path — an in-progress, momentarily-invalid HEX is never silently cleared or corrected mid-keystroke, and (structurally, not just by convention) an invalid value can never reach the saved form state, since the shared `draft`/`normalizeHex` logic only ever commits a value upstream once it parses as valid six-digit HEX. The five presets and the contrast check's reference colour are drawn from this codebase's own real `tailwind.config.js` design tokens, never invented. No new dependency was needed.

### The real performance question: where does a normal tab click actually spend its time?

Rather than re-auditing what Continuation pass 10 already fixed (request cancellation, duplicate context fetches, navigation races), this pass traced the literal, current request path for a representative Planner page load, then went and measured it instead of guessing. Two pieces of real evidence turned up:

First, `EXPLAIN ANALYZE` against the live Portal and Planner databases (read-only, via the same MCP access this session already uses for verification) showed every query in the authorization chain — the `profiles` lookups, the `event_user_assignments` check — executing in 1-3 milliseconds. These are tiny, correctly-indexed tables; there is no query or index worth tuning here. Second, unauthenticated `curl` timing against the live dev server showed the Next.js middleware/routing layer itself resolving in under 10ms for every representative route tested. Together, these rule out both "the database is slow" and "the framework is slow" as explanations.

What's left, and what the source-level request map already made clear even before the measurements confirmed it: every Planner page load runs a genuinely long CHAIN of sequential network round trips — roughly nine to ten of them, each individually fast, each still paying its own fixed network/API-gateway latency, one after another. The fix for that kind of bottleneck isn't a faster query; it's fewer round trips.

### The single biggest finding: Planner Logistics fires four independent authorization chains per page load

`planner-logistics/page.tsx` doesn't call one bundled endpoint the way Tasks, Vendors, Checklist, People, and Production each do — it fires four requests in parallel (`flights`, `hotels`, `ground-transport/movements`, and `planner-people`), and every one of them independently re-runs the *entire* ~9-10-step authorization chain against both databases before it ever reaches its own data query. The page's total load time is gated by whichever of the four finishes last, and none of them benefit from the others' work. This is the clearest, most concrete target found this pass — and also the one genuinely too large to fix safely in this pass: consolidating it into one bundled route would mean rewriting the page's fetch pattern and merging four route handlers, a real architectural change, not a small one. Per the brief's own explicit constraint, this was documented rather than attempted, and is the natural headline item for a focused future pass.

### The fix that was safe to make now, and made broadly

A smaller, genuinely zero-risk redundancy was found and fixed instead: 29 route files each independently query the Portal `profiles` table twice for the exact same row in the same request — once inline for `global_role`/`current_organization_id`, and again inside a `resolveCallerPlannerIdentity` helper (duplicated six times, once per Planner module's lib file) for `planner_profile_id`. Since it's the same table, same row, same client, with no dependency between the two reads, merging them into one query is pure elimination of a redundant round trip — never a behavior change. This was applied to the 8 routes that represent actual page-load requests (Tasks, Vendors, Checklist, People, Production, and Logistics' own Flights/Hotels/Ground-Transport-Movements endpoints); the remaining ~21 item-mutation routes have the identical fixable pattern but were left for a future pass, since they fire on individual actions rather than gating initial page render. Separately, `isProductAvailableForEvent` (`eventAuth.ts`) — called from nearly every event-workspace route and page — had two genuinely independent reads running sequentially; these now run via `Promise.all`, benefiting the broadest possible surface of any single change made this pass.

Two other candidate optimizations were investigated and deliberately left unchanged, for good reasons rather than lack of effort: parallelizing each Planner capability function's two queries would have removed the existing, correct platform-admin short-circuit (which currently skips the second query entirely for admins); and `requireEventWorkspaceAccess`/`canAdministerPlannerPermissions`'s two-step reads have a genuine data dependency between steps, not an incidental one. Both cases are recorded as "investigated, correctly left alone," which the brief's own standard of evidence over assumption calls for just as much as the changes that were made.

## Continuation pass 14 — Visual Event Theme Designer

### User-testing finding (why this pass exists)

Real user testing of the pass-13 Theme Colours page found two problems. The page worked technically, but people couldn't understand or find their way around it:

1. **People didn't know where each colour appears.** The labels ("Primary — buttons, highlights, CTAs", "Secondary — hover states, accents", "Tertiary — background tints, badges") were generic design-system wording. As the audit below shows, they were also partly **wrong**: the attendee app has no hover states, and Tertiary colours no badges or tints.
2. **People didn't realise the small coloured square opens a picker.** The only way into the native picker was a 40×40px `<input type="color">` sitting beside a separate, non-interactive swatch.

The old page also showed made-up defaults (`#3B82F6` / `#1D4ED8` / `#DBEAFE`) for events with no saved theme. The attendee app never shows those colours: when a column is null it uses its own `lightblue` theme (`#00ADE4` / `#FFFFFF` / `#002345`). "Reset to Default" then saved those unrelated colours to the event.

### Actual theme field → attendee-app mapping (traced from source, not assumed)

Source: Evently-App `origin/main` @ `2fe8f1f` (2026-09-18; the local checkout `edwin-prod` is identical to it). Theme columns are loaded in `context/AuthContext.tsx` and applied via `applyEventThemeOverrides` (`assets/styles/global/color.ts`). Themed styles rebuild when the theme changes through `hooks/useThemedStyles.ts`.

| Field | Name in the Portal | Where the attendee app uses it |
|---|---|---|
| `theme_primary` | Brand colour | The round menu button on every screen (`menuButton`, 19 style files). Active bottom-menu icon and label (`Navbar.tsx`). Selected Agenda date chip (`dateChipSelected`). Notification badge. "Today's Schedule" subtitle and audience pills on the Agenda (tinted at 10%). Active Speakers/Presenters tab on Home (tinted at 15%). Primary action buttons (Connect, Submit, Retry, CTA, FAB). |
| `theme_secondary` | Card & contrast colour | Icons and text drawn directly on the brand colour: the menu icon, badge numbers, "Retry" text. The event title over the Home hero photo (`heroTitle`). The background of many cards and pills: the Home header action pill, the Speakers tab track, facilitator cards, and search boxes and cards on FAQ, Networking, Expo, News and Settings. Also feeds `onPrimary`. Default is white. |
| `theme_tertiary` | Heading colour | Activity card titles on Home (`activityTitle`) and section headings in the Info Center (`InfoStyles.sectionTitle`). Nothing else in the signed-in app. |

**Automatic readable text:** the app computes `onPrimary = luminance(primary) > 0.62 ? black : secondary` (`getReadableTextColor`). It applies this in only a few places: the selected Agenda date chip, the chat send button and the notifications header. Everywhere else (the menu icon, badge numbers, button text), Secondary is drawn directly on Primary with no adjustment. The preview copies this split exactly and invents no extra auto-contrast.

### What was built

- **Theme summary page.** The Theme Colours tab now opens on a phone-sized preview of the current theme, three rows (swatch + plain name + technical name + HEX + one-line real mapping), a "Using the standard Bendie theme" note when nothing is saved, and one prominent button: **Customize theme**, or **Create event theme** when no custom theme exists.
- **Theme Designer modal** (large, `FormModal` at `max-w-6xl`). Colour controls sit on the left and a live phone preview on the right (stacked with the preview first below `lg`). The preview switches between a **Home screen** and an **Agenda screen**, each modelled on the real attendee layouts.
- **Local draft only.** Choosing colours never touches the network. **Apply theme** persists through the page's existing `events` update. **Cancel** or X discards the draft; if anything changed, a "Discard theme changes?" confirmation (Keep editing / Discard) appears first.
- **Discoverable picker.** Each colour is a large card showing a 48px swatch, the HEX and a visible "Choose colour" pill. The native colour input covers that whole card (transparent), so clicking anywhere on it opens the browser's own picker, with no hidden hit targets. Keyboard: Tab to the control, then Space or Enter.
- **HEX is secondary but kept.** "Exact colour code (HEX) — optional, for brand guidelines" sits under each control. It accepts `0057B8`, `#0057b8` and 3-digit shorthand. Invalid input shows a plain-language message, the preview keeps the last valid colour, and Apply stays disabled until it's fixed. The other fields are unaffected.
- **Highlight what changes.** The active field's card is marked "Outlined in preview", and every preview element it controls gets a static two-tone ring (no animation).
- **Click what you want to change.** Themed preview elements are buttons that select their field and scroll to and focus its control. Hovering or focusing one shows "Brand colour (Primary) — click to edit" in a caption under the phone. Only elements with an unambiguous single field are clickable.
- **Presets.** "Start from a Bendie theme" offers the two complete themes the attendee app actually ships: Bendie Blue (the default) and Bendie Green. Per-field "Quick colours" include the app's theme colours plus the Portal's existing design tokens. The selected swatch shows a check mark, not just a colour.
- **Contextual readability warnings** (never blocking), with wording based on real app pairings: Secondary on Primary ("The menu icon and badge numbers may be hard to see…", 3:1), black card text on Secondary (4.5:1), and Tertiary headings on the app's `#F8FBFC` page background (3:1).
- **Reset to Bendie default** loads the app's real null-fallback theme into the draft. **Undo changes** restores the theme saved when the designer opened. Neither saves.

### Boundaries kept

No change to database columns, RLS, API routes, the event/product model or the save path. The page still does exactly one `events` select on load (now also reading `name`, for the preview) and one `events` update, on Apply only. No dependency added.

### Deliberately not built

Per-component colours, fonts, CSS or any page-builder features. Using the event's real hero image in the preview (it would need another column or request; a neutral gradient is used instead). Session-only "Recently used" colours from pass 13 were dropped: the native picker's drag events would flood the list, and the app-theme presets replace its purpose.

## Continuation pass 15 — Theme Preview Polish, Collapsible Sidebar & Speakers Terminology

### A. Theme preview polish (user-testing finding)

The phone header in the preview looked unpolished. The icons were oversized and clashed, the badge competed with the bell, and the white action pill dominated the welcome text. Re-checking the attendee app showed the preview was also **inaccurate**. The real Home header pill holds **notifications + settings** (Ionicons, 20pt, in 30×24pt slots with a 16pt badge), not chat + notifications. And on conference events the app shows the **Speakers (n) / Presenters (n)** tabs with **no heading above them**; the preview had added a redundant "Speakers" title.

Fixes, all inside the preview: one icon scale (`ICON` constants; the phone is ~0.7× a 390pt screen, so menu 16px, header actions 14px, nav 15px, content 16px, status 11px). Menu circle 36→32px with a lighter shadow. The pill is kept, because it's a real Secondary-coloured element, but made compact: two 24px icon slots holding 14px filled glyphs, and a 13px badge anchored inside the bell's slot. The header is a three-part flex row (menu · flexible centre · pill) with gaps, so nothing collides at the 240px (mobile) or 272px preview widths. The bottom menu now uses `grid-cols-5` equal slots. The badge is highlight-only (not its own click target) to avoid a 13px hit area; the bell pill and menu button remain clickable. Theme mapping, local draft, HEX sync and Apply-only persistence are untouched.

### B. Collapsible global sidebar

The Portal has exactly one sidebar, `OrgSideNav`: seven flat global items plus Help and Logout, with no nested or product/event children. Event-level navigation lives in the event workspace's own tab bar. Collapse is therefore simple, with no flyouts.

- Desktop (`lg`, ≥1024px): 280px expanded ↔ 72px icon-only, with a 200ms width transition. The main column is `flex-1`, so it widens automatically.
- The toggle (double-chevron icon, 40px target, tooltip, `aria-label` + `aria-expanded`) sits in the sidebar header.
- Collapsed items show CSS tooltips on hover and keyboard focus. Every item keeps a permanent `aria-label`, and the active item keeps its existing treatment (primary left border + tint + primary icon) plus `aria-current="page"`.
- The preference is saved in `localStorage` (no database) and applied before first paint by an inline script, so there's no flicker.
- Collapse is layout-only. The CSS is keyed off an `<html>` attribute and the toggle state is local to the sidebar, so the layout, contexts and page content never re-render, remount or refetch.
- Below `lg` (phones and tablets), the existing off-canvas drawer is unchanged and always full width.

### C. Facilitators → Speakers (user-facing terminology only)

**Model found.** The `facilitators` table is the speaker/presenter directory. `role_type` (`speaker` | `presenter`) drives the app's separate Speakers and Presenters tabs, so **Presenters is a genuine separate concept and was not renamed**. Per-event labels (`facilitator_label_singular/plural`) default to "Speaker(s)" in the app. "Facilitator" also appears as two **other, distinct concepts**:
- an event/org membership role (`event_members.role = 'facilitator'`, alongside a separate `'speaker'` role);
- an agenda session role type (`agenda_session_speakers.speaker_type = 'facilitator'`, alongside speaker/panelist/moderator/host).

The attendee app also shows breakout rooms as "Facilitator: {facilitator_name}".

**Renamed (user-facing):** event tab label and description (`eventSectionMeta`, which also covers the Dashboard cards, the Recommended-next copy and page headings); the Dashboard count noun and Programme group description; Speakers page header count, Add/New/Edit/Update buttons, empty and no-results states, remove confirmation, toasts, the "Speaker Group" field, the CSV modal title and template filename (`speakers-template.csv`); Activity Log section and action labels; the Organisation Home "no speaker assigned" alert; Terminology's "Speaker Labels" heading and placeholders (which now match the app's real "Speaker(s)" default); the agenda speaker picker label, "Unknown speaker" and validation toasts; the agenda CSV column; the Members action ("Add to Speakers" / "Already a speaker"); and the theme preview (removed the duplicate heading and shows the app's real "Speakers (n) / Presenters (n)" tabs).

**Deliberately retained:**
- Route `/portal/events/[eventId]/facilitators` and section key `facilitators`, for bookmark stability.
- Table, columns and all TypeScript identifiers.
- The membership role labels "Facilitator" / "External Facilitator". Relabelling would produce two "Speaker" roles, since `speaker` is a separate role.
- The agenda speaker-type option "Facilitator", which is a real enum value.
- The breakout room "Facilitator Name" label, which matches what attendees see.

**CSV backward compatibility:** new templates use the headers `speaker_group` (Speakers) and `speakers` (Agenda). The parsers still accept the old `facilitator_group` and `facilitator` headers, plus `speaker`, so previously downloaded templates keep importing unchanged.

No database, RLS, API, permission or route changes.

## Continuation pass 16 — Agenda Preview Proportions & Hover-Expand Sidebar

### A. Agenda preview proportions (visual-review finding)

**Root cause.** Home and Agenda already rendered inside the same frame element, so the shell never actually resized on screen switch. The problems were four others:
1. The frame had two viewport-dependent sizes (240×500 below `sm`, 272×540 above), with different aspect ratios (1:2.08 vs 1:1.99). So the preview's proportions depended on the browser, not on one design.
2. The Agenda screen had its own denser type and spacing (9px chips, 10px titles, `mb-2`/`mb-3` rhythm, 1px chip padding) with no shared rhythm with Home, so it read as compressed.
3. The status-bar Material Symbols glyphs fill their whole 11px box at the global `opsz 24` and looked heavier than the 9px time.
4. The Theme Designer's mapping highlight (a solid dark `ring-2` plus a white `ring-offset`) sat on every Primary element by default, including "Today's Schedule" and the audience pills. It read as a permanent double border or button outline the app doesn't have.

**Fixes.**
- One `PHONE` constant set (256×540 ≈ 9:19, radius 36, border 7, status bar 26, bottom menu 48) shared by all screens and the summary page.
- Uniform whole-frame scaling (`--phone-scale`: 1, or 0.86 on desktop viewports ≤820px tall or screens ≤380px wide, or 0.74 at ≤700px tall), replacing breakpoint widths.
- A status bar with small matched-weight inline SVGs (10px tall, `px-5`, 4px gaps) and a 10px time.
- One icon hierarchy: status < badge (13px) < header action (14px) < bottom menu (15px) < menu glyph (16px, in a 32px circle).
- The Agenda header now matches Home's rhythm: title 14/18px bold, "Today's Schedule" as plain 10px Primary text (it's plain `Text` in the app's `agenda-tab.tsx`, not a control), and `mb-4` before the dates.
- Date chips are equal thirds, 32px high.
- Agenda cards: `px-2.5 py-2`, 11px/14px title, 9px/12px time, a borderless 16px-high audience pill, and a 3px accent bar.
- The bottom menu has a fixed 48px height with 40px slots; only the active slot changes.
- The mapping highlight is now a dashed amber outline, clearly a Portal annotation rather than app styling, and the caption says "dashed outline (preview only)".

### B. Hover-expand global sidebar

This replaces pass 15's « » arrow toggle and its localStorage preference. Both are removed entirely, with no dead code.
- On hover-capable desktops, the sidebar is **collapsed to a 72px icon rail by default** and expands to 280px while the pointer or keyboard focus is inside it.
- The expanded panel **overlays** the content. The layout only ever reserves 72px, so tables, forms and the Theme Designer never shift on hover.
- Hover intent: expanding waits 120ms, so a pointer that just crosses the rail triggers nothing; collapsing waits 250ms.
- The hover target is the panel itself, which only grows under the pointer, so its own width transition can't cause a leave/enter oscillation.
- Keyboard: Tab into the sidebar expands it (`:has(:focus-visible)`); tabbing out collapses it. Mouse clicks don't hold it open.
- Accessible names are permanent. There are no tooltips, since hover already reveals the labels, so a tooltip and a label never show together.
- The collapsed rail shows the Bendie mark, nav icons, Help and Logout; all text fades in only when expanded.
- **Touch devices, including tablets ≥1024px wide**, don't get hover behaviour. They keep the existing drawer and menu button through a new app-shell-only `desk` breakpoint (`(min-width:1024px) and (hover:hover) and (pointer:fine)`), so no touch user is stuck with an icon-only rail.
- Hover-expand is pure CSS: no React state, no listeners, and nothing re-renders, so it can't trigger data work, remounts or form resets.

## Continuation pass 17 — Guided Event Creation, Module Selection, Draft Preservation & Contextual Onboarding

**Why this pass exists:** the original user test took about two hours against an expected one. The goal is fewer confusing decisions, less repeated work, and a faster first setup, not visual polish. **AI-assisted Word/PDF/document import is explicitly out of scope and was not implemented** (no LLM, AI extraction or AI field mapping).

### Master user-test feedback matrix

| # | Feedback | Before this pass | Action this pass | After | Evidence |
|---|---|---|---|---|---|
| 1 | "Boarding time" → "Departure" | Partial: Planner Flights already used Departure/Arrival; Bendie Attendee Travel said "Boarding Time" | Relabelled to "Departure time", with a hint that attendees see "Boarding Time"; list shows "Departs …". Column kept | Done | `attendee-travel/page.tsx` |
| 2 | Departure/Arrival as the primary flight fields | Partial (Planner yes, Attendee Travel no) | "Arrival / travel time" label on the free-text `travel_time` | Done | same |
| 3 | CSV templates shouldn't use Boarding Time | Implemented: the Planner flight CSV uses `departureTime`/`arrivalTime`; Attendee Travel has no CSV | None needed; no old "boarding" header ever existed | Done | `planner-logistics/page.tsx` columns |
| 4 | Working Back button in event creation | Missing (single-screen modal) | Stepper with Back on every step after the first | Done | `CreateEventModal.tsx` |
| 5 | Data survives Back/Next | Missing (form reset on every open) | Local state across steps + an on-device draft | Done | same |
| 6 | Safe draft/autosave | Missing | On-device draft (no network), "Save & exit", resume banner, "Discard draft"; server draft **deferred** | Partial (local) | same |
| 7 | Ask which modules the event needs | Missing | "What do you need for this event?" step | Done | `ModulePicker.tsx`, `eventModules.ts` |
| 8 | Show only relevant modules | Missing | Tab bar and Dashboard progress/recommendations follow the selection; "Manage modules" to change it later | Done | `layout.tsx`, `dashboard/page.tsx`, `ManageModulesModal.tsx` |
| 9 | "What event would you like to build today?" | Missing ("New Event") | Step 1 title | Done | `CreateEventModal.tsx` |
| 10 | Preparation checklist | Missing | "Get ready to build your event", module-aware, non-blocking | Done | same |
| 11 | Clear Bendie ↔ Planner path | Implemented (Feature 006 switcher, Bendie Planner tab, pass-11 travel guidance) | Product step explains each product in one line | Done | same |
| 12 | Don't re-enter shared event info | Implemented (Feature 004 provisions the Planner counterpart from the same create request) | Copy says "you only enter the event's details once" | Done | `/api/events/create` unchanged |
| 13 | Show current product/environment | Implemented (TopHeader product switcher, Feature 006) | Unchanged | Done | `TopHeader.tsx` |
| 14 | Collapsible/hover sidebar | Implemented (passes 15–16) | None | Done | `OrgSideNav.tsx` |
| 15 | Better theme picker | Implemented (passes 13–16) | None | Done | Theme Designer |
| 16 | Remove brown preset | Partial (brown still a quick colour) | Removed from the quick colours; still pickable | Done | `eventTheme.ts` |
| 17 | Keep the org-specific image library | Implemented | Audited: queries filtered by `organization_id`, storage path prefixed `{orgId}/`. No change | Done (no regression) | `AssetPickerModal.tsx`, `assetUpload.ts` |
| 18 | Contextual guidance for first-time users | Partial (Planner empty states, Recommended-next) | Section descriptions rewritten; Speakers empty state explains the section and offers Add / Import-or-paste; module and product descriptions | Partial → improved | `eventSectionMeta.ts`, `facilitators/page.tsx` |
| 19 | Explain event-industry concepts | Partial | Plain-language descriptions for Production, Logistics, Vendors, Checklist, Expo, Excursions, Networking, Attendee Travel | Done | `eventSectionMeta.ts`, `eventModules.ts` |
| 20 | Less manual typing | Largely implemented (CSV/paste, Save & Add Another, retained values, Duplicate, reuse of people) | Module selection removes irrelevant sections from view | Done | — |
| 21 | Easy bulk entry | Implemented (CSV + paste across modules) | Bulk *actions* still deferred | Done / deferred as noted | — |
| 22 | Suitable for agencies | Partial | Short copy, no forced tutorial, one Continue per step, Select all / Clear optional | Done | — |
| 23 | Understandable for first-time users | Partial | Guided flow + checklist + contextual copy | Done (pending user test) | — |
| — | AI-assisted document import | — | **Deferred / out of scope** | Not implemented | — |

### Guided event creation

The single-screen "New Event" modal became a stepper:
1. **Event basics:** name, start and end date, location (the only Feature 004 fields; end ≥ start is checked).
2. **Products:** Bendie / Bendie Planner / Both, with one-line explanations. Shown only when the org is entitled to both; Feature 004's entitlement logic is unchanged.
3. **Modules:** "What do you need for this event?", grouped by category, filtered to the chosen product(s).
4. **Get ready:** a module-aware preparation list that ticks items already provided, "You don't need everything now — you can add it later", a summary, and **Create event**.

Back/Continue only change local state, so moving between steps makes no network request. Nothing is created until **Create event**, which calls the unchanged Feature 004 saga (same RPC, same idempotency key per open, same partial-outcome contract and read-back retry). After creation the user lands in the new event's workspace; Planner-only events are redirected to Planner Overview by the existing layout.

### Modules

- **Module = an existing EVENT_SECTIONS tab**, never a new concept (`src/lib/eventModules.ts`).
- **Always included** (locked in the picker, always in navigation), chosen from real product dependencies only:
  - Bendie: Attendees & access (how people get in), Agenda and Emergency (both always in the attendee app's menu).
  - Planner: Participants (logistics and operations all attach to participants).
  - Setup sections (Dashboard, Basics, Hero, Theme, Terminology, Activity Log, Bendie Planner, Planner Overview) aren't modules and are always shown.
- **Nothing optional is preselected.** "Select all" and "Clear optional" are available.
- **Storage:** `events.portal_setup_modules text[]`, nullable (migration `event_portal_setup_modules.sql`). A new column was needed because `event_products` is product entitlement and `disabled_menu_items` changes the attendee app. `NULL` (all 24 existing events) = show everything, unchanged.
- **Display only:** the layout filters its tab bar *after* the existing `isSectionAvailable` access check. It can never make a section available, never blocks a route, and keeps the current page's tab visible even if hidden. Entitlement, membership, RLS and Planner permissions are untouched.
- **Manage modules** (event header, every tab): one save, with an amber "Nothing is deleted" note when a previously-on module is unticked. No code path deletes module data. Re-enabling shows the existing data again.

### Deferred

- Server-side drafts (would need a draft table or pre-creating events; the latter would mean half-provisioned events).
- Syncing module choices to the attendee app's `disabled_menu_items` (a product decision, since it would change what attendees see).
- Richer empty states on the remaining Bendie pages beyond Speakers.
- Bulk actions.
- AI document import (separate future work).

## Continuation pass 18 — Event Workspace Navigation Hierarchy & Previous/Next

### User-testing finding

The workspace had two horizontal rows (area pills, then the area's pages) that looked like two equal tab bars. First-time users read the top row as the sequence ("Attendees → Content") instead of the pages inside the area ("Attendees & Access → Attendee Travel → Networking"). There was no Previous action. Tracing also found that the floating Next followed **flat `EVENT_SECTIONS` order**, while the area row grouped by first appearance. On a Both event, Planner Overview therefore lived in the Overview area but came after Operations in Next's sequence: the two navigations already disagreed.

### Hierarchy traced from `EVENT_SECTIONS`

- **Overview:** Dashboard (Bendie), Planner Overview (Planner). A hub, not a setup step.
- **Event Setup:** Basics, Hero & Branding, Theme Colors, Terminology.
- **Programme:** Speakers, Agenda, Activities, Excursions.
- **Attendees:** Attendees & Access, Attendee Travel, Networking.
- **Content:** News Feed, FAQs, Info Center, Expo Directory.
- **Media:** Gallery, Event Photos, Files.
- **Operations:** Emergency, Games, Notifications, Activity Log, Bendie Planner (shared).
- **Planner:** Participants, Planning (Tasks, Vendors, Checklist), Logistics, Production. All single-page except Planning.

### What changed

1. **Event areas (level 1):** flat text links with an underline, no pills and no numbers, because it's non-linear navigation. On narrow screens it becomes an "Event area" select.
2. **Current area (level 2):** area name + one-line description; for 2+ visible pages, "Step X of N" and a numbered, connected stepper (previous / current / upcoming). No checkmarks, since there's no real completion data and visited isn't complete. Single-page areas show context only; the Overview hub shows plain links.
3. **Previous / Next (level 4):** an in-flow footer replaces the floating button. It uses real destination names and names the area when crossing into another one ("Next: Content — News Feed", "Previous: Attendees — Networking"). Hidden on the Dashboard, which keeps its own "Recommended next". From Planner Overview, Next starts the Planner journey.
4. **One canonical journey:** the area row, the stepper and Previous/Next all derive from `groupedVisibleSections`, which is already filtered for product availability, per-module Planner capability (permissions) and module selection, minus the Overview hub, plus the route. Hidden or inaccessible pages are never counted or named.
5. **Area order fix:** Overview always first; areas made only of shared utility pages go last. Before, a Planner-only event's area row started with "Operations" (just the Bendie Planner panel) ahead of "Overview".

Routes, authorization, product architecture, module selection, database and RLS are unchanged. The navigation makes no new requests.

### Known gap (documented, not solved)

There's no global unsaved-form guard. Dirty-state tracking exists only inside modals (Create event, Theme Designer, Tasks inline edit), which are full-screen overlays, so navigation can't be clicked while they're open. Inline single-record forms (Basics, Hero, Terminology) still lose unsaved edits on any navigation, exactly as tab clicks did before this pass.

## Continuation pass 19 — Reliability, Saving, Validation & Import Clarity

**Explicitly recorded:**
- AI document import: **deferred, not implemented**.
- Multi-sheet XLSX import: **investigated only, not implemented**.
- Navigation hierarchy (pass 18): **preserved, not redesigned**.

### Findings matrix

| Area | Finding | Before | Action | After |
|---|---|---|---|---|
| Auth | Password reset works end-to-end | **Broken for link emails.** The flow was code-only (`verifyOtp` email + code); a recovery *link* landed on `/auth/reset-password?code=…` and was ignored. The middleware bounced signed-in admins off `/auth/reset-password`. A Site-URL fallback landed on `/`, which silently signed the user in | Link support (PKCE `?code=`, `token_hash`, implicit), code kept; invalid/expired states; middleware exemption; `PASSWORD_RECOVERY` fallback in AuthContext; sign-out + "password updated" sign-in | Fixed (source + route smoke; email not verified) |
| Auth | Account enumeration | Forgot page toasted "No account found with this email" on that error | Neutral "If an account exists…" copy | Fixed |
| Auth | Raw Supabase text on auth pages | Login/signup/forgot/reset showed `error.message` | `authErrorMessage` mapper | Fixed |
| Validation | Raw DB errors in toasts | 80 `toast.error(error.message)` sites in 31 files (constraint/table/RLS text could leak) | `friendlyError` mapper applied to 79 sites in 30 files; signup mapped separately | Fixed |
| Validation | Field-level errors | Mostly toast-only | Field-level on create-event Basics (name, end date) and Speakers (name, email); pattern established | Partial (representative) |
| Validation | Input kept on failure | Implemented: modals stay open with values on error | Verified; failure copy improved | Preserved |
| Completion | Dashboard "Setup Progress NN%" | Misleading: "complete" = one record / two fields; attendees never counted; red/amber/green ring | Required / Recommended / Optional readiness; ✓ only on verifiable required items; "Has content"/"Not started" elsewhere; percentage removed | Fixed |
| Modules | Manage modules after setup | Implemented (pass 17; live-verified in a rolled-back transaction) | Re-verified in source; "nothing is deleted" note present | Preserved |
| Onboarding | Skip/Dismiss | Missing | `DismissibleTip` (Got it + Show help); "Skip for now" on the create-event Modules step | Implemented |
| CSV | Beginner explanation | Missing ("Upload a CSV file…") | "Import from spreadsheet" lead + dismissible "What's a CSV file?" | Implemented |
| CSV | Expected columns | Implemented (table + sample rows); only required marked with `*` | Every column labelled Required/Optional (parser truth: `ColumnSpec.required`) | Improved |
| CSV | Preview | "N valid · N will be skipped"; first error only; `#` = rowIndex+1 (wrong spreadsheet row) | Ready / Needs attention counts; full per-row issue list; spreadsheet row numbers; column keys shown as labels | Improved |
| CSV | Result | Always green "Imported X of Y" | Complete / partly complete / nothing imported; duplicate-safe retry guidance; readable per-row reasons; no invented duplicate counts | Fixed |
| Travel | "Travel time" | Relabelled "Arrival / travel time" in pass 17 (only one reading) | Traced: free text shown as "Time:" in the app (also read as `time_range`; the hotel pull stores stay dates) → **Journey time** + hint | Fixed |
| Saving | Visible save state | Missing (toast only) | `useSaveStatus` + `SaveStatus` on Basics, Hero & Branding, Terminology; `beforeunload` while dirty | Implemented |
| Drafts | Navigation draft | Implemented (pass 17) | Preserved | Preserved |
| Drafts | Durable draft | Partial: localStorage keyed by **organisation only**, restored silently | Keyed by **user + organisation**, `savedAt`, 30-day expiry, explicit "Continue setting up …? Last saved …" prompt, truthful "Draft saved on this device" status | Fixed (same-browser); cross-device deferred |
| Terminology | Speakers | Implemented (pass 15) | Re-verified: only deliberate retentions remain | Preserved |
| Terminology | Person model | Partial | Attendees & Access description clarified; "Onboarding" column explained. Participants and Team & Access were already explained | Improved |

### Password recovery architecture

Email step: `resetPasswordForEmail(email, { redirectTo: origin + '/auth/reset-password' })`, which is unchanged.

The reset page resolves one of five modes:
- **`checking`:** waits for the Supabase client, which exchanges `?code=` (PKCE) or `#access_token` itself on load, or verifies `token_hash`.
- **`link`:** a valid recovery session → new password + confirm only.
- **`code`:** no link → email + recovery code (the previous flow, kept for code-style templates).
- **`invalid`:** Supabase `?error_code=otp_expired` or any other error, or no session. For a missing PKCE exchange it explains "opened in a different browser from the one you requested it in".
- **`done`:** after `updateUser`, the recovery session is signed out and the user goes to `/auth/login?reset=success`, which shows "Your password has been updated. Sign in with your new password."

Tokens are stripped from the URL only after the client has read them. There are two safety nets:
- The middleware no longer redirects signed-in admins away from `/auth/reset-password`.
- If Supabase falls back to the Site URL (for example when the redirect URL isn't allow-listed), `AuthContext` sees `PASSWORD_RECOVERY` and sends the user to the reset page (full-page replace, excluded on the reset page itself, so there's no loop).

The password rules are the existing ones from the last commit.

**Deployment prerequisite (not verifiable from code):** the production `/auth/reset-password` URL should be in Supabase Auth → URL Configuration → Redirect URLs. The Site-URL fallback covers it if not.

### Completion semantics

- **Required** is derived from what the attendee experience can't work without: the event's name and dates, and at least one attendee with access.
- **Recommended:** Hero & Branding (the app's home screen), Agenda and Emergency (always in the attendee menu), plus the modules chosen for the event.
- **Optional:** everything else.
- "Recommended next" points at an unmet required item, then a recommended section with no content, and **never** at an optional one.
- There's no percentage, no ring, and no checkmark except on verifiable required items. Area cards say "N of M have content".

### Multi-sheet XLSX import — investigation (not implemented)

- **Dependencies:** only `papaparse` (CSV) is installed. XLSX needs a parser, e.g. SheetJS (`xlsx`, Apache-2.0; the maintained build is distributed from the SheetJS CDN rather than npm) or `exceljs`. Both are sizeable, so load them **lazily** inside the import modal and never in the main bundle.
- **Sheet → module mapping:** match worksheet names case-insensitively against the existing module import configs (`title`/`templateFilename`/aliases such as "Speakers", "Agenda", "Participants", "Flights", "Hotels"). Unknown sheets are listed as "Not imported — no matching section" with a manual "Import as…" choice. Duplicate sheet names can't exist in one workbook; two sheets mapping to the same module import one after the other and are both shown.
- **Validation and preview:** each sheet converts to `{headers, rows}` and goes through that module's existing `parseRow` → preview, shown as one tab per sheet with Ready / Needs attention counts, so no new parser architecture is needed.
- **Order and dependencies:** Bendie Attendees, then Speakers, then Agenda (the Agenda CSV resolves speakers by name/email). Planner Participants must be imported **before** Flights/Hotels, which attach to existing participants. Enforce the order and re-resolve references between steps.
- **Partial failure and rollback:** imports are per-row API/DB writes with bounded concurrency 5 and **no cross-sheet transaction**. There's no rollback, so the result must be reported per sheet, with the same "import only the failed rows again" guidance. True all-or-nothing would need server-side batch endpoints: a separate backend project.
- **Authorization:** each sheet uses its module's existing endpoint and RLS/capability checks; a sheet for a module the user can't manage is shown as unavailable, never imported.
- **Recommendation:** a later pass with a lazily-loaded parser, sheet-by-sheet preview reusing each module's config, and an enforced dependency order. Start with Attendees + Speakers + Agenda (Bendie) and Participants → Flights → Hotels (Planner).

### Deferred

- Cross-device draft recovery (needs a server draft model).
- A global in-app unsaved-changes guard (only `beforeunload` on the three settings pages).
- Field-level validation beyond the representative forms.
- Multi-sheet XLSX import.
- AI document import.

## Continuation pass 20 — Global Create Path & Product Environment Identity

Preserved as-is, per review: the event workspace layout (not redesigned), the navigation hierarchy, Feature 004 provisioning, the module architecture, database and RLS.

### A. Duplicate Create / New Event

**Trace:**
- Header **Create** was a `<Link href="/portal/events">`, a redirect-only route that lands on `/portal/{product}/events`, where **+ New Event** finally opened `CreateEventModal`. So one creation intent took two clicks plus a page load.
- Header Create was also shown to users who **can't** create events.
- Other entry points: the Events-page **+ New Event**, the Events empty-state **Create Event**, and on Home the events-panel empty state and **Quick Actions → Create Event**.
- Each page mounted its own `CreateEventModal` and ran its own `isOrgAdmin` check.

**Decision:** event is the only genuine *global* create action. Teams are created on Teams; organisations in the org switcher, for platform admins. So there's **no dropdown**. Header **Create** becomes **+ New Event**, which opens the guided flow immediately. It's icon-only below `sm`, keeping the accessible name "New event".

**One canonical entry:** `CreateEventProvider` (portal layout) owns the single `CreateEventModal` mount and a single permission check per organisation (platform admin or org owner/admin, as before). Every entry point calls `openCreateEvent(productHint)`.
- The page-level + New Event and the empty states remain as contextual shortcuts.
- The flow always targets the **current organisation** and closes if the organisation changes.
- The current product is passed as an **initial, changeable** selection (only applies when the org has both products); Both remains selectable.
- Entitlement checks and Feature 004 provisioning are unchanged.
- After creation, the user lands on the new event's dashboard, as before, with EventLayout's existing Planner-only redirect.

### B. Product environment identity

**Finding:** switching Bendie ↔ Bendie Planner changed only the segmented control's text colour.

**Treatment** (restrained, environmental only), centralised in `src/lib/productPresentation.ts`:
- **Global header:** a 3px product-accent strip along the top, a barely-there tint (Bendie `primary/3.5%`, Planner `orange-50/70`) and an accent bottom border. Organisation-global pages (People, Teams, Assets, Settings, Activity Log) stay neutral.
- **Product switcher:** the selected segment gets accent text, an accent ring and a small dot (a shape cue), plus `aria-pressed`. The unselected segment stays a normal, hoverable button. The mobile menu marks the current product with accent text, a check and `aria-current`.
- **Event areas:** the active area underline and the current-area heading use the product accent. Bendie's underline was neutral dark and is now Bendie blue. Mixed/shared areas (Overview, the Planner-only Operations panel) follow the current view context.
- **Deliberately unchanged:** action buttons (Save/Add/Create/Import/Delete), the numbered page stepper (still Portal primary, so page progression reads as navigation rather than decoration), cards, tables and page backgrounds.

**Colours:** Bendie uses the Portal `primary` token `#00629D`. Planner uses the Tailwind orange scale the Portal already used for Planner areas (orange-500/600 accents, orange-700 text for contrast). There's no separate Planner brand token in the design system, so none was invented.

**Both events:** colour follows the **current view context** (route product: `/portal/{product}` or the event tab's `?product=` signal via `resolveEventTabProduct`), never "the event has both". Title, layout and hierarchy are unchanged when switching.

**Source of truth and performance:** all styling derives from the same route-based product the switcher already used (`parseProductFromPathname` is synchronous from the pathname). There's no new state, no request and no remount. A directly loaded Planner route renders orange on the header's first render, with no blue→orange flash.

## Continuation pass 21 — Product Identity Refinement, Navigation Glass & Sidebar Active State

This is a visual refinement of pass 20. The workspace information architecture, navigation hierarchy, routes, data, permissions and provisioning are unchanged.

### Findings

- **Selected segment blended in on Bendie, search looked muddy on Planner.** Both the switcher track and the search field used `bg-surface-container-low` (`#f0f3ff`, a cool lavender). On the blue-tinted header the selected Bendie segment had too little separation; on the warm Planner tint the lavender search looked muddy.
- **Unequal strips.** The Planner strip was full-strength `orange-500`, while Bendie's was a darker navy, so the two didn't read with equal weight.
- **Switcher changed size.** The selected segment switched to bold and only the selected one rendered the dot, so the control's width shifted between products.
- **Sidebar active state.** It was a square-cornered slab plus a 4px left bar plus a tint plus bold blue: four indicators at once.

### Decisions

- **Colour by role** (`productPresentation.ts`): the same recipe for both products (same alpha steps, same thickness).
  1. **Selected product segment:** white elevated segment, accent text, a 35% accent ring and a dot.
  2. **Header environment:** a 2px strip at 60%, a 3.5% tint and a 20% border.
  3. **Navigation accent:** the active event-area underline, the area heading and the current/previous step.
- **Neutral controls:** a `NEUTRAL_PRESENTATION.controlSurface` (white/90 + neutral border) for the search field, organisation selector/label and switcher track, identical in both products. They take the product accent **only on focus**. The New Event button, utilities (bell, settings, profile) and action buttons stay neutral.
- **Constant switcher geometry:** both segments are always semibold and always reserve the dot slot (shown only when selected). The track is fixed at `h-10`, the same height as the search and organisation controls.
- **Restrained glass** (`.glass-surface` in `globals.css`): only on the Event Areas row and the current-area stepper, plus a light `backdrop-blur-sm` on the switcher track. Neutral in both products. There's an `outline-variant` border (via `theme()`), a very soft shadow, and a 1rem radius.
  - **Fallback:** a solid 85% white. Only browsers that support it (`@supports`) get the 60% white + `blur(12px) saturate(140%)` layer, so text never depends on the blur.
  - Not used on tables, cards, rows, modals or the sidebar, and no glass surface sits inside another.
  - The event header block isn't sticky (the content scrolls in its own container), so no sticky positioning was added.
- **Sidebar:** a rounded tile (`rounded-xl`, 48×48 around the icon when collapsed) that becomes a rounded row inset from both edges when expanded. It's the same element, so the transition is continuous.
  - The left bar is removed. Active = soft `primary/10` tint + primary icon/text; hover = neutral `on-surface/5%`, so it never looks selected. The inset focus ring is kept.
  - The sidebar is global navigation, so it stays Portal primary and never turns orange in Planner.

### Both events

Only the three cue families change with the current view context. Geometry, the neutral controls and the glass surfaces are identical in Bendie and Planner, so it reads as "I switched products", not "a different website".

### Pass 21 correction — navigation containers removed (user review)

The `.glass-surface` containers around the Event Areas row and the current-area section read as "card inside card". They're **removed**, and both navigation levels are back to the pre-pass-21 flat, open presentation: a `border-b border-outline-variant` divider, active underline links with `-mb-px`, and `pt-4 pb-3` plus a bottom divider for the area section. Everything else from pass 21 is kept: the product-aware active colours (area underline, heading, current/previous step), the switcher, the neutral search, the header environment, the sidebar tile and the central tokens. The `.glass-surface` CSS, used only there, was deleted. The switcher track's own light blur is unchanged.


## Continuation pass 22 — Portal-Wide Performance & Loading Optimization

**Evidence standard:** there's no browser automation or authenticated session in this environment, so **no timings were measured**. Every claim below is **SOURCE-CONFIRMED** (traced in code: request and round-trip counts) or marked **EXPECTED**.

### Root causes found (by user impact)

| Pri | Where | Class | Finding (source-confirmed) |
|---|---|---|---|
| **P1** | Every Planner/Both event workspace entry | C (authorization overhead) + J (cross-DB) | EventLayout fired **6 parallel** `/planner-{module}/capability` requests. Each re-ran the identical chain server-side: `getUser` → `profiles` → `organization_members` → workspace access (2) → `events` → product availability (2) → provisioning → `event_planner_links` → a **second** `profiles` read → Planner `profiles` + `event_user_assignments`. That's ≈10 sequential round trips × 6. |
| **P1** | Every session, all pages | G (request storm) + F | `AuthContext` replaced `user` with a new object and re-fetched the profile on **every** auth event, including `TOKEN_REFRESHED` (hourly, on refocus near expiry, and broadcast to every open Portal tab). `OrganizationContext` and `EventContext` depend on `user`, so each refresh re-fetched organisations, memberships and the events list with nothing having changed. |
| **P1** | Planner Logistics initial load | A/C/J | 4 parallel requests (flights, hotels, movements, people), each running the full chain (T264, deferred in pass 13). |
| **P2** | Event workspace after Manage modules / a same-event refresh | B/F | The layout's availability/capability effect depended on the whole `currentEvent` **object** and reset every capability to `loading` first. So patching the same event flipped the nav to its skeleton and re-ran 2 + 6 authorization requests. |
| **P2** (deferred) | Dashboard on Planner/Both events | D + J | 8 Planner data requests, each a full chain, fetching whole collections only to count them. Needs a counts-only endpoint. |
| **P2** (deferred, correctness risk) | Events list stats (`eventStats.batchCountByEventId`) | D | Batched per table (no N+1), but it selects every matching row to count client-side. PostgREST's default 1,000-row cap would **silently undercount** in large organisations. A proper fix needs a counting RPC/view (a DB change). |
| **P3** (deferred) | People page | D | Loads all organisation members plus their event memberships in one go (batched, not N+1). Pagination is a UI change. |
| P3 | `AuthContext` `profiles select('*')` | D | A single row per load; `profile` is also a shared type. Left as is (low value, and it would make the `Profile` type lie). |

### Fixed

1. **Combined capability endpoint** `GET /api/events/[eventId]/planner-capabilities`. It runs the shared chain **once** (reading `planner_profile_id` in the first `profiles` read) and then resolves the six module capabilities in parallel.
   - Authorization is copied exactly, including the People/Logistics/Production-only `canAdministerPlannerPermissions` override precedence.
   - Each module's failure is isolated (`backend_error` per module, never `canView:false`).
   - EventLayout makes 1 request instead of 6 and applies the unchanged three-way `ready`/`provisioning`/`error` mapping.
   - The per-module capability routes are unchanged.
2. **Auth identity stability.** The same user keeps the same `user` object and profile; the profile is only re-fetched when the user changes or on `USER_UPDATED`. A different user always refreshes immediately, so there's no cross-user carry-over.
3. **Logistics overview** `GET /api/events/[eventId]/planner-logistics/overview`: flights, hotels and movements behind one copy of the flights route's authorization. Participants are included only under the People route's own rule (admin override, else `resolvePeopleCapability(...).canView`), **not** inferred from Logistics `canManage`, because Planner-side admins also get that. Failure semantics match the four old calls. Mutations and refreshes still use the individual routes.
4. **Layout effect keyed on the event id**, so an in-place event update no longer blanks the nav or re-runs authorization.

### Verified already good (no change needed)

- Activity Log pages are paginated (30) with batched `.in()` actor lookups; the header feed has `limit(10)`; Teams and the event stats are batched.
- The event-level `loading.tsx` is content-only inside the persistent layout, so the shell stays stable. No new loading boundaries are needed.
- `useLatestRequest` covers Members, Participants, Logistics and Production. Bendie pages do a single request each and unmount on navigation (no global side effects), so cancellation there adds little and wasn't mechanically added.
- `AddParticipantFromPortalModal` is sequential by design (the matching helpers aren't concurrency-safe per event).
- Product identity is route-derived and synchronous (pass 20).


## Continuation pass 23 — Main Event Tab Navigation Performance & Stability

**Manual finding:** rapid main-tab switching (Overview → Event Setup → … → Production) lagged and could eventually fail. There was also a vertical scrollbar on the Event Areas row. No timings were measured (no browser or session here); the claims below are **SOURCE-CONFIRMED** unless marked **EXPECTED**.

### Failure mechanism (source-traced)

1. **Uncancelled same-origin requests blocked routing.** Several main-area landing pages fired Portal API requests that were never cancelled on unmount:
   - the Dashboard: **8** Planner collection requests, each a full ~10-round-trip Portal + Planner chain;
   - Planning → Tasks, and Planner Overview (Vendors and Checklist had the same gap).

   Browsers allow ~6 concurrent connections per origin over HTTP/1.1, which is what the dev server uses. Leaving the Dashboard left up to eight long requests occupying those slots. The **next tab's own navigation request (the Next.js RSC payload fetch) and its data requests queued behind them**, so the click appeared to do nothing and data arrived late. Each rapid click added more uncancelled chains, so the queue and the server work (dev-server compilation plus N concurrent auth chains) grew faster than it drained. That's the "the user can move faster than the loading architecture" failure. Routing itself doesn't block on async work (area links are plain `<Link>`s, and the layout persists), so this is **fast routing starved by slow, abandoned page data**.
2. **Stale error toasts.** Bendie landing pages (Basics, Speakers, News, Gallery, Emergency) toasted `Failed to load …` from their load promise even after unmount. Under load, a page you'd already left could pop an error over the page you were on.
3. **Dashboard counts** (~20 Supabase head-counts) also ran to completion after leaving.

No uncaught-exception path was found in the traced code. All the touched loads catch errors, and abort is now distinguished from failure everywhere touched.

### Fixes

- **`/api/events/[eventId]/planner-readiness`** (counts only): the Dashboard's 8 Planner requests become **1**. It runs one access chain, then per-module capability with the exact per-route precedence. Only modules the caller may **view** are read, and they're counted server-side; others return `null` ("Not available"), exactly as a 403 did before. Checklist is counted viewer-scoped, as its route lists it. No row data is returned. The request is cancelled on unmount.
- **Shared access library** `src/lib/plannerModuleAccess.ts` (server-only). The single-run chain plus module-capability resolution, used by `/planner-capabilities` (refactored, identical responses) and `/planner-readiness`. The per-module routes keep their own inline copies.
- **Cancellation** (`useLatestRequest` / `AbortController` + Supabase `.abortSignal`):
  - Planner Tasks, Vendors, Checklist and Overview;
  - the Bendie Basics, Speakers, News, Gallery and Emergency landing pages;
  - the Dashboard counts and readiness.

  Every aborted load returns silently: no toast, no state write, no redirect.

### Vertical scrollbar

- **Owner:** the inner scroll `<div ref={groupNavRef}>` inside `<nav aria-label="Event areas">` in `EventLayout`.
- **Cause:** `overflow-x-auto` makes `overflow-y` compute to `auto` (CSS spec), and the area links' `-mb-px` made their content 1px taller than that box. The result was a 1px vertical overflow and the 6px `custom-scrollbar` track.
- **Fix:** removed `-mb-px` (the cause), which also restores the full 2px active underline, and added `overflow-y-hidden` to that one element. `overflow-x-auto` is unchanged, so horizontal scrolling on narrow screens remains. No other element or visual changed.
