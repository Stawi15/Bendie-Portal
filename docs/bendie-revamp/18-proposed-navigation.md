# 18 — Proposed Navigation

**Status:** PROPOSAL. It builds on the IA in doc 17. HIG basis: sidebars no deeper than 2 levels, one search location, a toolbar with leading/centre/trailing groups (`bendie-design/references/hig-patterns-components.md`).

## Levels (at most 2 in the sidebar, then the page)

| Level | Today | Proposed |
|---|---|---|
| 1 | Org sidebar (7) **or** event area tabs (11) | Org sidebar (5 + Settings) **or** event sidebar (6 areas) |
| 2 | Section stepper (up to 8) | Pages under the active area, expanded inline in the sidebar (disclosure) |
| 3 | Logistics sub-tabs | **Removed.** Views live in the page toolbar (Table / Timeline / Board), not as navigation |

## Event sidebar

- **Collapsible.** Expanded is 248px, the rail is 64px, and the state is remembered per user (`localStorage`, a per-viewer convenience).
  - On hover-capable desktops (the `desk` breakpoint) it keeps today's hover-expand behaviour.
  - Below that it becomes an off-canvas drawer, as now.
- Each page row shows a **completion dot** from the readiness model (doc 23) rather than the stepper's position-only display (doc 13 #32), and a **product tag** icon when the event has both products.
- **"Back to organisation"** sits in the sidebar header. "← All events" returns to the list the user came from (fixes October audit #3).

## Toolbar (top of the canvas)

`[Page title · count] [View: Table | Timeline | Board] [Filters] [Search in page] ······ [Bulk bar when selected] [Import] [Primary action]`

- **One primary action per page, worded consistently:** "Add speaker", "Add session", "Add task". This fixes the inconsistent add-button wording (doc 13 #14).
- **Import is always beside the primary action** on the 17 import screens, and empty states repeat it **only** when the toolbar is hidden (fixes the doubled controls, doc 13 #14).
- **Filters and the selected view are kept in the URL query** (Web Interface Guidelines: URL reflects state), so they survive opening and closing the inspector.

## Command palette (⌘K / Ctrl K), replacing "Search experiences…"

Deterministic first, with no model needed (Portal 2.0 §10.5).

| Group | Source | Example |
|---|---|---|
| Go to | `data/routes.json` (+ the user's permissions and the event's products) | "Agenda", "Flights", "Moderation" |
| Events | Org events list | "Summit 2027" |
| Records | Server search over people, speakers, sessions, participants (the user's own RLS) | "Wanjiku" → speaker, attendee |
| Actions | Primary action per page | "Add session", "Import attendees" |
| Recent | The last 8 pages and records (per user, local) | — |
| Ask Copilot… | Only once pass 3 is approved; hands the query to the AI drawer | — |

The palette lists only reachable destinations and greys nothing out. Unavailable features are explained in the palette ("Planner isn't enabled for this event") instead of silently missing (doc 10 mismatch #5).

## Right-hand panel: one slot, two uses

There's one right panel, so the inspector and the Copilot never compete (Portal 2.0 Copilot §).
- **Inspector:** opens when a record is selected. Tabs depend on the entity type (doc 21), e.g. Speaker → Profile · Sessions · Travel · Activity.
- **Copilot:** opens with its own button. When a record is selected, the Copilot gets it as context and shows it as a chip.
- Width is resizable (360–560px). It overlays the canvas below 1280px and becomes a full-screen sheet below 768px (doc 22).

## Breadcrumbs

`Studio Test Org › Summit 2027 › Programme › Agenda › "Opening keynote"`. Shown in the toolbar on pages more than one level deep, and when an inspector is open (the last crumb is the record). This replaces `portalBreadcrumb.ts`'s partial use.

## Keyboard

| Keys | Action |
|---|---|
| ⌘K / Ctrl K | Command palette |
| G then O / S / P / E / L / C | Go to Overview, Setup, Programme, pEople, Logistics, Content |
| N | Primary action (when no input has focus) |
| J / K, Enter, Esc | Move in list, open inspector, close |
| ⌘. | Toggle the right panel |

All shortcuts are listed in the palette ("Keyboard shortcuts"), never needed to do anything, and don't override browser or assistive-technology keys.

## Removed or merged

| Removed | Because | Replacement |
|---|---|---|
| Header product switcher (as a mode) | Mode errors; product implied by colour | Product filters + per-event chips |
| Header settings gear | Duplicates the sidebar (October audit #8) | Sidebar footer |
| Header bell for org activity | Clashes with event "Notifications" (#17) | "Activity" panel in the org sidebar |
| Floating "Next" stepper | Position-only; extra navigation layer | Readiness "What's next" + sidebar completion dots; Previous/Next kept only in **Guided build** (doc 19) |
| Logistics sub-tab level | Third navigation level | Pages: Travel, Ground transport |
