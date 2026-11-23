# Research: 030 Studio 2.0 App Shell

Checked against `redesign` @ `304fa5c` on 2026-11-20.

## R1: Reusing the event layout logic

- **Finding:** `src/app/portal/events/[eventId]/layout.tsx` is 1,098 lines. Lines ~118–775 are logic: workspace access, product availability, six Planner capability states, `isSectionAvailable`, `visibleSections`, `groupedVisibleSections`, `journey` (Previous/Next), four redirect effects (Planner-only landing, wrong product, paused product, org switch), Manage modules state, plus the content gate flags (`workspaceAuthPending/Denied`, per-module `*DeferToPage`). Lines 808–1098 are the render.
- **Decision:** move the logic **verbatim** into `useEventWorkspace()` (same effects, same order), returning everything the render uses. The v1 JSX moves verbatim into `EventWorkspaceV1`. v2 consumes the same return value.
- **Rationale:** constitution II says availability is decided in one place. Moving rather than rewriting keeps behaviour identical, and the walk-through access matrix (252 visits, 3 roles) proves it.
- **Alternative rejected:** re-implementing availability in the new sidebar (two sources of truth; Feature 016 history shows how fragile it is).

## R2: Area metadata

- **Decision:** add `area: 'overview'|'setup'|'programme'|'people'|'logistics'|'content'|'utility'` to each `EVENT_SECTIONS` entry, following Feature 016's precedent for `group` (display only, never used by availability). The order and labels live in `src/lib/eventAreas.ts`. A vitest test asserts every one of the 32 keys has an area.
- Mapping (doc 17): see data-model.md.

## R3: Layout choice storage (changed from the blueprint's `localStorage`)

- **Decision:** a first-party cookie `studio_shell=v1|v2` (path `/portal`, 1 year, SameSite=Lax, not httpOnly so the toggle can set it), plus a `?shell=v1|v2` query override.
  - `portal/layout.tsx` becomes a **server** component that reads the cookie (`cookies()`), and passes `initialShell` to a client `PortalShell`.
  - The toggle writes the cookie, then calls `router.refresh()`.
  - The query override also writes the cookie, so links "stick", and is read client-side through `useSearchParams` in `PortalShell`.
- **Rationale:** the blueprint said `localStorage`. That's readable only after hydration, so v2 users would see the v1 layout flash on every full load. A cookie is still **per browser, no database**, which satisfies FR-002 and the confirmed intent. The middleware is untouched.
- **Edge:** if cookies are blocked, v1 shows (spec edge case).
- **Consequence (analysis U2):** reading `cookies()` in the `/portal` layout makes every `/portal/*` route dynamically rendered (some are prerendered as static today). Accepted: all are behind authentication and middleware already runs per request. Checked in T025.
- **Loop guard (analysis U1):** the override writes the cookie and refreshes only when the value differs.

## R4: Role label

- **Sources:** `useAuth().isGlobalAdmin`; the organisation role from the user's own `organization_members` row (browser client, RLS; one query per organisation, cached in a context); the event role from the existing `getUserEventRole(userId, eventId)`.
- **Wording:**
  - "Stawi admin"
  - "Organisation owner" / "Organisation admin"
  - event roles "Event host / Event organiser / Event admin / Event staff / Speaker / Facilitator / Attendee"
  - otherwise "Organisation member"
- **Precedence:** Stawi > org owner/admin > event role > org member.

## R5: Visibility sentence (verified behaviour, doc 09 + mobile contract M5)

| Status | Sentence |
|---|---|
| draft | "Draft · not public. Event members see changes in the attendee app immediately." |
| published / active | "Public in the attendee app · anyone can view this event's public details." |
| completed / archived | "Not public · past event. Members can still open it in the attendee app." |

Always followed by the scope note "Applies to the attendee app (Bendie Planner ignores status)" when the event has Planner. Read-only: it isn't a control in this feature.

## R6: Accessibility mechanics without new dependencies

- **Drawer (below `desk`):** `role="dialog"`, `aria-modal`, Escape closes, focus moves to the first link on open and returns to the menu button on close, and a scrim click closes it (no typed input, so nothing to lose). This is a small focus-trap helper in `src/components/shell/`.
- **Right panel:** `RightPanelProvider` with a pure reducer (open, close, toggle, content id), ⌘. / Ctrl+. bound **only when content is registered** (none in this feature, so the shortcut is a no-op and nothing is visible, per FR-017). Focus returns to the invoker.
- **Focus:** all v2 controls rely on the 029 global rule or `.focus-ring`. The extracted `ProductSwitcher` and `EventSearch` take a `variant` *component* (`ProductSwitcher.Sidebar`), not a boolean, and the sidebar variants use `.focus-ring`. That fixes K1 in v2 while v1 keeps today's look.
- Radix/TanStack/cmdk are **not** needed yet, so nothing is added (constitution V allows them later).

## R7: TopHeader extraction

- **Finding:** `TopHeader.tsx` (565 lines, one component) holds the org switcher (+ New Organisation, Organisations and Moderation for Stawi), product switcher, event search, bell (org activity), settings link, account menu (logout) and New event.
- **Decision:** extract each into `src/components/header/*` **with identical markup and behaviour**. `TopHeader` then composes them (v1 unchanged pixel-wise). v2's sidebar renders the same components in sidebar variants. This applies the "second caller" rule.

## R8: Verification approach

- `tools/walkthrough.py`: add `STUDIO_SHELL=v1|v2` (sets the cookie before the run). Run both; diff the access results against each other and against the 2026-11-19 baseline.
- v1 screenshots compared with the baseline: unchanged (SC-004).
- v2: the corrected 029 focus detector (settle delay, real rings, contrast); 390 px drawer checks; reduced motion.
