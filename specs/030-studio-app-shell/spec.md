# Feature Specification: Studio 2.0 App Shell

**Feature Branch**: `030-studio-app-shell`

**Created**: 2026-11-20

**Status**: Draft

**Input**: User description: "Studio 2.0 app shell (roadmap docs/bendie-revamp/36 Phase 2; IA doc 17; navigation doc 18; components doc 21; responsive/a11y doc 22; constitution v2.0.0). Architect blueprint confirmed by the developer 2026-11-20. Build a new application shell behind a per-browser flag that wraps every existing page without rewriting page content: organisation sidebar, event sidebar with 6 areas listing today's sections plus footer utilities, a context strip, a toolbar slot, breadcrumbs, and a right-panel slot with no visible trigger yet. Previous/Next guidance kept. Routes, data, permissions, section availability, redirect and paused-product rules unchanged and shared between old and new shells. Flag: per browser, toggled in the account menu plus a link override; old shell stays default. Fix known issue K1 in the new shell. Reconcile context/architecture.md (doc 40 G1). Out of scope: page rewrites or merges, inspector content, data table, command palette, Copilot, org-wide rollout, products-as-filters."

## Context

Today an event shows up to **11 horizontal areas and 32 sections across 3 navigation levels**, the product (Bendie / Planner) acts as a mode in the header, and nothing tells an organiser who can see their changes or what role they have (docs/bendie-revamp/13 #1, #3, #18). The approved Studio 2.0 design (docs 17 and 18) replaces this with a left sidebar of **6 areas**, an always-visible context strip, and a single right-hand panel.

This feature builds that **shell** around the existing pages, behind a switch, so the organisation can try it without risk. Page contents, data and permissions don't change. Later features migrate pages into it.

## User Scenarios & Testing *(mandatory)*

### User Story 1: Find any event section in two steps (Priority: P1)

An organiser inside an event sees a left sidebar with six plainly named areas (Overview, Setup, Programme, People, Logistics, Content). Opening an area shows that area's pages. Every page they could reach before is still reachable, and pages they can't use are not shown.

**Why this priority**: This is the core navigation simplification (11 areas → 6, at most 2 levels). Without it the shell has no purpose.

**Independent Test**: With the new shell on, open the Summit (Bendie-only) and "tester" (Bendie + Planner) events as each test role. Every section that is reachable in the old shell is reachable from the sidebar in at most 2 clicks, and no section appears that the role or event can't use.

**Acceptance Scenarios**:

1. **Given** a Bendie-only event, **When** the organiser opens the event, **Then** the sidebar shows only areas that contain at least one available Bendie section, and no Planner pages.
2. **Given** a Bendie + Planner event and a user with Planner access, **When** they open Logistics, **Then** Attendee travel, Logistics, Tasks, Vendors and Checklist appear (as permitted by their Planner capabilities).
3. **Given** a user without access to a section today (e.g. event staff and Attendees & Access), **When** they use the new shell, **Then** that section is not offered, and typing its address gives exactly today's outcome (no-access message or redirect).
4. **Given** any event page, **When** it's open, **Then** the sidebar highlights the current area and page, and keyboard users can reach every sidebar item.

---

### User Story 2: Always know where I am, what I can do, and who sees my changes (Priority: P1)

At the top of the event sidebar the organiser always sees:
- the organisation and event they're in
- which products the event has (Attendee app, Planner)
- a plain sentence about visibility, e.g. "Draft · event members see changes immediately" or "Public · anyone can view this event in the attendee app"
- their role (e.g. "You: Organisation admin")

**Why this priority**: It addresses the "no sense of state" problem (doc 13 #3, #18, doc 10 mismatch #5), and the information already exists.

**Independent Test**: For events with different statuses and products, and for each test role, the context strip shows the correct organisation, event, product chips, visibility sentence and role.

**Acceptance Scenarios**:

1. **Given** an event with status Draft, **When** shown, **Then** the visibility line says members see changes immediately and the event isn't public.
2. **Given** an event with status Active or Published, **When** shown, **Then** the visibility line says the event is publicly viewable in the attendee app.
3. **Given** a Bendie + Planner event, **When** shown, **Then** both product chips appear, each with a text label (not colour alone). The visibility sentence states it applies to the attendee app (the Planner app ignores status).
4. **Given** the user is an organisation admin, **When** shown, **Then** the role reads "Organisation admin"; for Stawi admins it reads "Stawi admin"; for event staff, "Event staff".

---

### User Story 3: Try the new layout and switch back at any time (Priority: P1)

Any signed-in user can switch to the new layout from their account menu and back again. The choice is remembered on that browser. A shared link can force either layout for testing.

**Why this priority**: The organisation needs a safe trial. The old layout must remain the default and fully working.

**Independent Test**: Switch on, reload: the new layout stays. Switch off: the old layout returns, identical to today. Open a link with the override: the requested layout shows.

**Acceptance Scenarios**:

1. **Given** a first visit, **When** a page opens, **Then** the old layout shows (default).
2. **Given** the user chooses "Try the new layout", **When** they navigate or reload, **Then** the new layout persists on that browser only.
3. **Given** the new layout, **When** the user chooses to go back, **Then** the old layout shows immediately and stays.
4. **Given** a link with the layout override, **When** opened, **Then** that layout shows, regardless of the saved choice.

---

### User Story 4: Organisation workspace in the new layout (Priority: P2)

Outside an event, the sidebar shows the organisation destinations: Home, Events, People (with Teams), Library (assets), Activity, and Settings in the footer. The product switcher sits in the sidebar header, the activity bell and settings shortcut sit in the footer, and the event list and home behave exactly as today.

**Why this priority**: It's needed for a coherent layout, but organisation pages change less than event pages.

**Independent Test**: In the new layout, every organisation page from today is reachable. The product switcher changes the home and event list exactly as today. The Stawi-only admin pages are still reachable only by Stawi admins.

**Acceptance Scenarios**:

1. **Given** an organisation with both products, **When** the user switches product in the sidebar header, **Then** Home and Events show the same product-specific content as today's header switcher.
2. **Given** a Stawi admin, **When** using the new layout, **Then** Organisations and Moderation remain reachable; for anyone else they're not offered, and direct links still go to "unauthorised".
3. **Given** the Teams page, **When** opening People, **Then** Teams is reachable from People (a tab or second level), and its address is unchanged.

---

### User Story 5: Works on laptop, tablet and phone, and by keyboard (Priority: P2)

The new layout adapts:
- **Wide screens:** a full sidebar.
- **Laptops:** a collapsible narrow rail.
- **Tablets and phones:** a drawer, with the current area and page shown at the top.

Every control has a visible keyboard focus indicator, including the product switcher and search controls that are weak today (known issue K1).

**Why this priority**: Accessibility and responsive behaviour are constitution requirements (v2.0.0 Principle V; doc 22).

**Independent Test**: At 1440, 1024, 768 and 390 px wide, all navigation is usable. Tabbing through the new layout shows a clear focus indicator on every control (at least 3:1 contrast). With reduced motion on, nothing slides.

**Acceptance Scenarios**:

1. **Given** a 390 px wide screen, **When** the user opens the menu, **Then** the sidebar opens as a drawer that can be closed with Escape or a close button, and focus returns to the menu button.
2. **Given** keyboard use, **When** focus reaches the product switcher or any search field in the new layout, **Then** a focus indicator of at least 3:1 contrast is visible.
3. **Given** reduced motion, **When** the sidebar collapses or expands, **Then** there's no sliding animation.

### Edge Cases

- **Product availability still loading** (Planner capabilities resolve after page load): the sidebar shows a loading state for affected areas, and must not flash pages that then disappear (today's layout guards this; the same guard applies).
- **Planner setup pending or failed:** Planner pages behave as today (provisioning banner, Retry).
- **Paused product:** the page shows today's paused notice; the sidebar still lists the page.
- **Redirect rules** (Planner-only landing, wrong-product link, organisation switched while inside an event): identical outcomes in both layouts.
- **User loses access mid-session or opens an event they're not a member of:** today's "You don't have access to this event" screen, within the new layout.
- **Event with no products, or an area with no available pages:** the area isn't shown.
- **Very long organisation or event names:** truncated with the full name available (tooltip or accessible name). Never pushes controls off-screen.
- **The saved layout choice can't be stored** (private browsing, storage blocked): the default (old) layout shows and nothing breaks.
- **Manage modules:** still opens from the event (footer utility) and updates the area contents immediately, as today.

## Requirements *(mandatory)*

### Functional Requirements

**Layout switch**
- **FR-001**: The system MUST offer two layouts, current and new, with the **current layout as the default** for every user.
- **FR-002**: Any signed-in user MUST be able to switch layouts from the account menu. The choice MUST persist on that browser across navigation and reloads, and MUST NOT affect other users or devices.
- **FR-003**: A link parameter MUST be able to force either layout for that visit, overriding the saved choice.
- **FR-004**: In the current layout, every page MUST look and behave exactly as before this feature.

**Behaviour parity (both layouts)**
- **FR-005**: Routes MUST be unchanged. Every page MUST be reachable at its current address in both layouts.
- **FR-006**: Which sections a user sees, which pages redirect where, product pausing, Planner capability checks and access-denied handling MUST be decided by the **same single logic** in both layouts, with identical outcomes.
- **FR-007**: Page content (forms, lists, actions, banners) MUST render unchanged inside the new layout.

**Event workspace (new layout)**
- **FR-008**: The event sidebar MUST group all 32 existing sections into six areas: Overview, Setup, Programme, People, Logistics, Content (per docs/bendie-revamp/17). Activity log, Bendie Planner link and Manage modules appear as footer utilities. No section may be left without a place.
- **FR-009**: The sidebar MUST show at most two levels (area → page), MUST hide areas and pages the user or event can't use, and MUST mark the current area and page.
- **FR-010**: The event context strip MUST show: organisation and event name, product chips with text labels, a visibility sentence derived from the event status that names the attendee app as its scope, and the user's role in plain words.
- **FR-011**: Previous/Next step guidance MUST remain available on event pages.
- **FR-012**: Manage modules MUST remain available and update the sidebar immediately after saving.

**Organisation workspace (new layout)**
- **FR-013**: The organisation sidebar MUST offer Home, Events, People (with Teams reachable within it), Library (assets), Activity, and Settings in the footer.
- **FR-014**: The product switcher MUST move into the sidebar header and behave exactly as today's header switcher. The activity bell and settings shortcut MUST be available from the sidebar.
- **FR-015**: Stawi-only destinations (Organisations, Moderation) MUST be offered only to Stawi admins, as today.

**Shared shell elements**
- **FR-016**: The new layout MUST provide a breadcrumb trail (organisation › event › area › page) on event pages.
- **FR-017**: The new layout MUST provide a page toolbar area and a single right-hand panel area for future features. The panel MUST support open and close (including by keyboard), return focus correctly, and respect reduced motion, but MUST NOT be visible or offered to users in this feature.

**Accessibility and responsive**
- **FR-018**: Every interactive control in the new layout MUST show a keyboard focus indicator of at least 3:1 contrast. This includes the product switcher and search fields (resolves known issue K1 for the new layout).
- **FR-019**: The new layout MUST adapt at the documented widths: full sidebar on wide screens, collapsible rail on laptops, drawer on tablets and phones (doc 22). The drawer MUST be closable by Escape and return focus.
- **FR-020**: Sidebar and panel motion MUST follow the reduced-motion preference.
- **FR-021**: The new layout MUST use the Studio 2.0 design tokens (Feature 029) and no hard-coded colours.

**Documentation**
- **FR-022**: The architecture documentation MUST be reconciled with constitution v2.0.0: stack, domain modules, admission rules, and the new shell (resolves doc 40 G1).

### Key Entities

- **Layout choice:** current or new; per browser; can be overridden for a visit by a link.
- **Area:** one of six display groups; holds an ordered list of existing sections. Display-only, never used for permission decisions.
- **Context:** organisation, event, products, status → visibility sentence, user role.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: In the new layout, 100% of the sections reachable in the current layout for each test role are reachable in **at most 2 clicks** from any event page.
- **SC-002**: Top-level choices inside an event drop from up to 11 areas to **at most 6**.
- **SC-003**: The access walk-through (252 page visits, 3 roles) gives **identical** final pages and no-access outcomes in both layouts.
- **SC-004**: With the current layout selected, screenshots of all audited pages show **no visual change** from before this feature (data differences excepted).
- **SC-005**: The context strip shows the correct organisation, event, products, visibility sentence and role for **100%** of tested event and role combinations.
- **SC-006**: **100%** of interactive controls in the new layout show a visible keyboard focus indicator with at least 3:1 contrast. 0 controls hidden or clipped at 390 px width.
- **SC-007**: Switching layouts takes one action and **0** page errors; the choice survives a reload.

## Assumptions

- Area membership follows docs/bendie-revamp/17 exactly, but **without** its page merges ("App appearance", "Run of show", "Everyone", "Travel", "Team & access"), which are later features. Each area lists today's sections.
- Visibility sentence: Draft, Completed and Archived are "not public; members see changes immediately"; Active and Published are "public in the attendee app". This is per verified behaviour (docs/bendie-revamp/09, mobile contract).
- Role wording maps Stawi admin, Organisation owner/admin, event host/organizer/admin and other event roles to plain words, using the same role sources as today.
- The organisation-wide rollout, products-as-filters, the command palette, the inspector and Copilot contents are separate later features.
- The current layout's K1 weaknesses stay until it's retired (known issue K1).
