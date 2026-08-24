# UI Registry

Living document. Updated after every component is built or changed (run the `imprint` skill). Read this before building any new component — match existing patterns exactly before inventing new ones.

This baseline was seeded on 2026-08-19 by reading the real, currently-shipped components directly (not by guessing from the design docs) — it reflects what's actually in the codebase today, not an aspiration.

---

## How to Use

1. Check if a similar component already exists here.
2. If yes — match its exact classes.
3. If no — build it following `ui-rules.md` and `ui-tokens.md`, then add it here.

After building or materially changing any component, update this file with the component name, file path, and exact classes used. Run `/imprint [filepath]` to do this automatically.

---

## Components

### Layout

#### EventLayout (event tab bar)
- **File:** `src/app/portal/events/[eventId]/layout.tsx`
- **Key Classes:** root `flex flex-col h-full`; header block (breadcrumb + title + status pill + tab bar) is `flex-shrink-0`, a plain static sibling — **not** `sticky`, no scroll-related classes at all; breadcrumb link `flex items-center gap-1 text-xs text-on-surface-variant hover:text-primary mb-1`; event title `font-headline-lg text-headline-lg text-on-surface truncate`; status pill `px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider` (color from `EVENT_STATUS_PILL_CLASSES`); tab row `relative flex items-center gap-1 border-b border-outline-variant`; scroll buttons `flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface transition-colors` with `chevron_left`/`chevron_right` icons, rendered only when scrollable in that direction; `<nav>` itself `flex gap-6 overflow-x-auto custom-scrollbar flex-1 min-w-0`; tab link `pb-3 pt-1 text-label-sm font-label-sm border-b-2` — active: `border-primary text-primary font-bold`, inactive: `border-transparent text-on-surface-variant hover:text-on-surface`; **the per-tab content region is its own scroll container**: `flex-1 min-h-0 min-w-0 overflow-y-auto custom-scrollbar pt-lg` wrapping `{children}`; floating next-button `fixed bottom-6 right-6 z-30` wrapping `btn-primary shadow-lg`
- **Pattern notes:** Single source of truth for the tab order is `EVENT_SECTIONS` in `eventSectionMeta.ts` — this component only renders it, never hardcode the tab list here. Added 2026-08-20 to fix a real bug: with 21 tabs the bar overflowed the viewport with no visual hint more tabs existed (`overflow-x-auto` alone gives no affordance). Scroll position is tracked via a `scroll`/`resize`-listening effect on a `navRef` (`el.scrollLeft > 4` / `el.scrollLeft + el.clientWidth < el.scrollWidth - 4`) to conditionally show each chevron; clicking one calls `navRef.current.scrollBy({ left: ±240, behavior: 'smooth' })`. Each tab `<Link>` carries `data-active={active}`; a separate effect keyed on `pathname` calls `scrollIntoView({ behavior: 'smooth', inline: 'nearest' })` on the `[data-active="true"]` element so deep-linking to a tab scrolled out of view still reveals it. If the tab count grows further, this pattern needs no changes — it's driven by actual overflow, not a hardcoded count.
  **Scroll architecture, superseded twice on 2026-08-20 before landing here:** first tried `sticky top-0` on just the tab row, then on the whole header, then patched a padding-gap leak with a negative-margin trick (`-mt-4 sm:-mt-gutter pt-4 sm:pt-gutter`) — all three were verified to compile correctly in the actual generated CSS, but the leak (scrolled-past content visible in a strip above the header) persisted anyway, meaning the sticky-offset behavior in the running app didn't match the reasoned-through CSS spec behavior closely enough to trust further sticky tuning. Replaced with a structurally unambiguous fix instead: the header is a **regular flex sibling**, not layered via `position: sticky` over shared scrolled content at all — it and the scroll region are both direct children of this component's `flex flex-col h-full` root, so there is no shared scroll box for anything to leak through, full stop. This root's `h-full` resolves against `<main>`'s definite flex-computed height (see Portal App Shell), so `<main>`'s own `overflow-y-auto` never actually triggers on event routes — the inner `flex-1 min-h-0 overflow-y-auto` region is the only thing that scrolls. `min-h-0` on that region is required — flex items default to `min-height: auto`, which would otherwise let it grow to its content's height and defeat `flex-1`'s "only take the remaining space" intent, the vertical analogue of the `min-w-0` overflow fix documented under Portal App Shell. **If a similar "pinned header, scrolling content below it" need comes up elsewhere, prefer this sibling-flex-regions structure over `position: sticky` inside a padded scroll container** — sticky's exact behavior against ancestor padding proved unreliable here even after two correctly-compiled attempts at fixing it.

### Section Chrome

#### SectionHeader
- **File:** `src/components/portal/SectionHeader.tsx`
- **Key Classes:** `flex items-start gap-4` wrapper; title `font-headline-md text-headline-md text-on-surface`; description `text-body-sm font-body-sm text-on-surface-variant mt-1`
- **Pattern notes:** Takes `sectionKey` (looked up in `eventSectionMeta.ts`) and an optional `desc` override for dynamic content like a live count. Every event-section page opens with this, wrapped in `mb-6`.

#### SectionIconBadge
- **File:** `src/components/portal/SectionIconBadge.tsx`
- **Key Classes:** `flex items-center justify-center rounded-xl flex-shrink-0` with `bg`/`fg` passed in per section (from `eventSectionMeta.ts`), default 44×44px, Material Symbols icon sized at 50% of the badge.

### Org Chrome

#### Portal App Shell
- **File:** `src/app/portal/layout.tsx`
- **Key Classes:** root `h-screen overflow-hidden bg-background lg:flex`; content column `flex flex-col h-full min-w-0 lg:flex-1`; `<main>` is the **only** scroll container: `flex-1 min-w-0 overflow-y-auto custom-scrollbar p-4 sm:p-gutter`.
- **Pattern notes:** Fixed 2026-08-20 — the previous shell made `OrgSideNav` `position: fixed` (out of flow, so it never actually occupied space in the `lg:flex` row) while sizing the content column with `lg:flex-1 lg:ml-[280px]`. Since a fixed sibling doesn't reduce a flex container's available width, the content column computed at ~100% width and was then shifted an *additional* 280px right by the margin — a real, silent ~280px horizontal overflow, masked by `overflow-x-hidden` on `<body>` in `src/app/layout.tsx` (also removed as part of this fix — masking the symptom instead of fixing the cause was itself the bug). The correct shape: the sidebar is a genuine flex sibling on desktop now (see `OrgSideNav` below), so `lg:flex-1 min-w-0` on the content column gets the actually-correct remaining width from flexbox itself — no manual margin arithmetic. `min-w-0` must stay on both the content column and `<main>`; without it, any child with intrinsic width demands (a table, a nowrap row) re-triggers the same class of overflow bug. This shell is shared by **every** `/portal/*` route — never patch an individual page for a layout-level overflow, fix it here.

#### OrgSideNav
- **File:** `src/components/portal/OrgSideNav.tsx`
- **Key Classes:** `fixed inset-y-0 left-0 z-50 w-[280px] flex-shrink-0 bg-surface-container-lowest border-r border-outline-variant flex flex-col py-6`, `lg:static lg:translate-x-0` to rejoin the flex row as a real sibling at desktop widths; slide-in on mobile via `transform transition-transform duration-200` + `-translate-x-full lg:translate-x-0`; nav link active: `text-primary border-l-4 border-primary bg-primary/10 font-bold`, inactive: `text-on-surface-variant hover:bg-surface-container-low border-l-4 border-transparent`
- **Pattern notes:** Org-level nav items are hardcoded in-component (`NAV_ITEMS`), unlike the event tab bar which reads from `eventSectionMeta.ts`. Mobile (`<lg`): stays `fixed` (off-canvas slide-in drawer, full-screen `bg-black/40` overlay), controlled by an `open`/`onClose` prop pair owned by the portal layout. Desktop (`lg:`): `lg:static` puts it back in normal flow so it's a real flex item — this is what makes the app shell's width math correct (see Portal App Shell above); don't revert this to `fixed` at `lg:` without also re-deriving the content column's width some other way.

#### TopHeader
- **File:** `src/components/portal/TopHeader.tsx`
- **Key Classes:** `sticky top-0 min-h-[72px] bg-surface ... border-b border-outline-variant`; breadcrumb `Organisations / {org name ▾} / {page label}` using `font-label-md text-label-md`, current page in `text-primary font-bold`; search input `pl-10 pr-4 py-2 bg-surface-container-low border-none rounded-full`; dropdown panels (org switcher, event search, notifications, user menu) all share one recipe: `bg-white rounded-xl panel-shadow border border-outline-variant py-2 z-20`, closed by a `fixed inset-0 z-10` click-catcher; unread notification dot: `w-2.5 h-2.5 bg-error rounded-full border-2 border-surface`
- **Pattern notes:** `getPortalPageLabel(pathname)` (`src/lib/portalBreadcrumb.ts`) drives the breadcrumb's current-page label — add new routes there, don't hardcode a label per page. The "Create" button always links to `/portal/events` (create-event entry point), not a dropdown.

### Dashboard

#### MetricCard
- **File:** `src/components/portal/MetricCard.tsx`
- **Key Classes:** `bg-white p-6 rounded-[20px] border border-[#E4EAF0] panel-shadow relative overflow-hidden group`; oversized background icon `absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20`; icon chip `w-10 h-10 rounded-lg flex items-center justify-center mb-4` with `bg-primary/10 text-primary` (or `secondary/10`/`text-secondary` for the `accent="secondary"` variant); value `text-headline-md font-headline-md`; label `text-label-sm font-label-sm text-on-surface-variant`; trend row `mt-4 flex items-center gap-1 font-semibold` colored to match `accent`
- **Pattern notes:** `accent` prop is `'primary' | 'secondary'` only — don't add more accent variants without updating this entry. Shows `—`/`…` placeholders while `loading`.

#### NextMilestoneCard
- **File:** `src/components/portal/NextMilestoneCard.tsx`
- **Key Classes:** `bg-white rounded-[20px] border border-[#E4EAF0] panel-shadow overflow-hidden`; colored header band `h-32 bg-primary relative` with a bottom-anchored label/title overlay (`absolute inset-0 p-6 flex flex-col justify-end text-white`); pill badge `px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm text-[10px] font-bold uppercase tracking-wider`; days-left stat `text-headline-md font-headline-md text-primary`; progress bar `h-2 bg-surface-container-low rounded-full overflow-hidden` with inline `width: {progress}%` fill; loading state `h-64 ... animate-pulse`.
- **Pattern notes:** `daysLeft` and `progress` are computed from real `event.starts_at` and `EventStats`, not mock data — this card only renders once real event/stats data resolves.

#### NeedsAttentionCard
- **File:** `src/components/portal/NeedsAttentionCard.tsx`
- **Key Classes:** Card shell same as `MetricCard`; empty/all-clear state `flex items-center gap-3 p-3 bg-green-50 rounded-xl border border-green-100` with a `check_circle` icon; each attention item is `flex gap-3 p-3 rounded-xl border` with caller-supplied `bgClass`/`iconClass` (e.g. `bg-red-50 border-red-100` + `text-red-500` for a warning).
- **Pattern notes:** Takes a generic `AttentionItem[]` — the page assembling the dashboard decides what counts as "needs attention" and supplies the color classes per item; the component itself has no domain logic.

#### RecentActivityCard
- **File:** `src/components/portal/RecentActivityCard.tsx`
- **Key Classes:** Timeline via a `before:` pseudo-element vertical line (`before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-surface-container-high`); each entry is a `w-6 h-6 rounded-full border-4 border-white` dot (caller supplies `dotClass` for color) plus `font-bold` actor name inline with the description.
- **Pattern notes:** Purely presentational — `TopHeader`'s notification dropdown uses the same timeline visual language but its own markup, not this component; if you touch one, check whether the other should match.

#### QuickActionsCard
- **File:** `src/components/portal/QuickActionsCard.tsx`
- **Key Classes:** Action row: `flex items-center gap-3 px-4 py-3 border border-outline-variant rounded-xl hover:border-primary hover:bg-primary/5 transition-all group`, icon turns `text-primary` on hover via `group-hover:text-primary`.
- **Pattern notes:** Mixes `<button onClick>` (Create Event, Add Person — opens a modal owned by the parent page) and `<Link>` (Assign People — navigates) in the same visual row style; match whichever the action actually needs, don't force everything through one or the other.

#### EventsOverviewPanel
- **File:** `src/components/portal/EventsOverviewPanel.tsx`
- **Key Classes:** Card shell `bg-white rounded-[20px] border border-[#E4EAF0] panel-shadow`; segmented tab control `flex bg-surface-container-low p-1 rounded-xl` with active tab `bg-white text-primary panel-shadow`; table `thead` cells `font-label-md text-label-md text-on-surface-variant`, rows `divide-y divide-outline-variant/30`, `hover:bg-surface-container-low/20`; per-event type icon chip `w-10 h-10 rounded-lg bg-primary-container/20`; progress cell reuses the same thin-bar pattern as `NextMilestoneCard`; status pill sourced from `EVENT_STATUS_PILL_CLASSES`/`EVENT_STATUS_LABELS` (`portalLabels.ts`) — never hardcode status colors per usage.
- **Pattern notes:** Reusable with `limit`/`title`/`showFooterLink` props — the same component powers both the full `/portal/events` list and a trimmed dashboard preview. Columns progressively hide on narrow viewports (`hidden sm:table-cell`, `hidden md:table-cell`) rather than the table scrolling horizontally.

#### OrgPeoplePanel
- **File:** `src/components/portal/OrgPeoplePanel.tsx`
- **Key Classes:** Same card/table shell as `EventsOverviewPanel`; role badge `px-2.5 py-1 rounded-md bg-surface-container-low text-on-surface-variant text-xs font-semibold`; destructive/admin-toggle action text-only buttons (`text-red-700 hover:bg-red-50` to revoke, `text-primary hover:bg-primary/5` to grant) rather than `.btn-danger`/`.btn-primary` — small inline table actions don't use the full button classes, only icon-button or text-button treatments.
- **Pattern notes:** Every action prop (`onToggleAdmin`, `onEditPerson`, `onRemovePerson`) is optional — the same panel renders a read-only view when the caller omits them. Follow this "optional action props" shape for any other panel that might need a stripped-down variant.

### Master-detail two-column layout (Games, Excursions, Attendee Travel)
- **Files:** `src/app/portal/events/[eventId]/games/page.tsx` (original), `.../excursions/page.tsx` (categories/excursions), `.../attendee-travel/page.tsx` (attendees/travel entries — 3rd consumer, and the first where the left list is a genuine **picker** rather than a managed entity list in its own right)
- **Key Classes:** `grid grid-cols-1 lg:grid-cols-3 gap-6`; left list `lg:col-span-1` — each row `cursor-pointer rounded-[20px] p-3 border transition`, selected: `border-primary bg-primary/5`, unselected: `border-[#E4EAF0] bg-white panel-shadow hover:border-primary/30`; right detail panel `lg:col-span-2`, empty state before anything is selected: `flex items-center justify-center h-64 bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow text-on-surface-variant text-sm`.
- **Pattern notes:** Use when a section has a real parent→children relationship (game→questions, category→excursions, attendee→travel entries) that's too shallow to justify a full nested-tab UI but too structured for a flat list. Selecting a left-list item drives a `useEffect` that fetches its children; clicking inside a row's own action buttons must `e.stopPropagation()` so it doesn't also trigger row selection. When the left list is an attendee/person picker rather than a managed entity, add a search input above it (`attendee-travel/page.tsx`) and cap its height with `max-h-[600px] overflow-y-auto custom-scrollbar` — org/event membership lists can get long in a way games/categories lists don't.

### Global-vs-event-scoped toggle (nullable `event_id`)
- **Files:** `excursions/page.tsx` (`excursion_categories` and `excursions` both use this)
- **Key Classes:** A single checkbox — `<input type="checkbox" checked={form.is_global} .../>` + `<span>Apply to all events</span>` — same visual weight as any other boolean field, no special styling.
- **Pattern notes:** Several tables (`excursion_categories`, `excursions`, and — per `schema-reference.md` — `expo_spaces`/`news_items` too, relevant to Phases 11–12) use a nullable `event_id` where `NULL` means "shown on every event," not "unscoped/broken." Map that directly to one boolean form field: checked → save `event_id: null`; unchecked → save `event_id: eventId`. When loading a row for edit, derive the checkbox from `row.event_id === null` — don't add a third state. Default **unchecked** or new rows (event-scoped by default), per `schema-reference.md`'s own portal guidance, even though it isn't the DB column's own default.

#### TagInput
- **File:** `src/components/portal/TagInput.tsx` — extracted 2026-08-20 when News Feed (`themes`) became a 2nd consumer alongside Expo Directory (`chips`), per this codebase's "extract on 2nd consumer" convention (see also `ImageField`, `moveItem`).
- **Key Classes:** Add row `flex gap-2`: `input flex-1` + `btn-secondary text-xs` "Add" button (also triggered by Enter in the input); rendered tags `flex flex-wrap gap-2 mt-2`, each one `flex items-center gap-1 bg-primary/5 border border-primary/20 rounded-full px-3 py-1` with the label in `text-sm text-primary` and a `×` remove glyph in `text-primary/60 hover:text-error` — the same pill style already established in the Networking page's option chips, reused here even though the underlying data shape differs (a plain `text[]` array field here vs. separate DB rows there).
- **Pattern notes:** Controlled component — `value: string[]` + `onChange: (tags: string[]) => void`, owns only its own input-in-progress text, not the array. Use for any free-text tag list on a `text[]` column; for a *fixed* enum instead (like `disabled_menu_items`), use the checkbox-grid pattern, not this.

### Card grid with hover-overlay actions (Event Photos, Gallery)
- **File:** `src/app/portal/events/[eventId]/event-photos/page.tsx` (also see `gallery/page.tsx` for the original)
- **Key Classes:** Grid `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4`; card `group relative bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow overflow-hidden`, image `w-full h-40 object-cover`; hover overlay `absolute inset-0 bg-black/0 sm:group-hover:bg-black/40 transition-all flex items-end justify-between opacity-100 sm:opacity-0 sm:group-hover:opacity-100 p-2` — actions are always visible on touch devices (no hover), only overlay-revealed on `sm:` and up; small white pill buttons (`text-xs bg-white text-on-surface px-2 py-1 rounded-lg font-medium hover:bg-surface-container-low`) for non-destructive actions, `bg-error text-white` for delete.
- **Pattern notes:** Event Photos is otherwise a standard top-level CRUD list (`FormModal` + `.input` fields + `display_order`, same shape as Activities/FAQs/Info Center) — only the **list view** borrows Gallery's card-grid-with-overlay presentation instead of the row-list presentation everything else uses, because it's photo content. Don't reuse the diffed-sub-list pattern (Agenda's Speakers, Activities' gallery images) here — `event_photos` rows are top-level records with their own `id`, not children nested inside another entity's edit form.

### Compact row list (Facilitators)
- **File:** `src/app/portal/events/[eventId]/facilitators/page.tsx`
- **Key Classes:** row `flex items-center gap-3 bg-white border border-[#E4EAF0] rounded-2xl panel-shadow px-4 py-2.5`, list `space-y-2`; avatar `40px` (was `48px`); text stack `leading-tight` with `text-sm`/`text-xs`/`text-[11px]` for name/title/group (was `base`/`sm`/`xs`).
- **Pattern notes:** Tightened 2026-08-20 — rows were oversized (~96px) and wasted vertical space; this brings a row to ~64–72px while keeping the avatar+3-line-text content readable and the Edit/Delete click targets unchanged. This density change is scoped to Facilitators only (that's what was reported as too tall) — don't propagate it to other row-list pages (FAQs, Info Center, etc.) without a separate reason to.

### Modals

#### FormModal
- **File:** `src/components/portal/FormModal.tsx`
- **Key Classes:** Backdrop `fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4` (click closes); card `bg-white rounded-[20px] panel-shadow p-6 w-full {maxWidthClassName} max-h-[90vh] overflow-y-auto` (click inside stops propagation so it doesn't close); header row `flex items-start justify-between gap-4 mb-4` with the title (`font-headline-sm text-headline-sm text-on-surface`) and a top-right close button (`p-1.5 -m-1.5 rounded-full text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface`, `close` icon).
- **Pattern notes:** This is the **required** shell for every add/edit form in the portal — added 2026-08-19 to fix a real bug: every list-based section used to render its add/edit form as an inline panel positioned right after the page header, above the list. Editing an item near the bottom of a long list yanked the page back to the top with no visual connection to what was clicked — looked like the app was broken. `maxWidthClassName` defaults to `max-w-3xl`; pass a narrower one (`max-w-md`, `max-w-xl`) for shorter forms. Converted to this shell: `facilitators`, `agenda` (session form), `activities`, `faqs`, `emergency` (both the contact form and the image form), `info-center`, `networking` (add-question form), `games` (both the game form and the question form), and `EditProfileModal`. `CsvImportModal` is a separate, deliberately different flow (import, not edit) and was left as-is.

### Content Editor Pages (per-section pattern, not a shared component)

#### Event Basics form pattern (single-entity pages — no list, no modal)
- **File:** `src/app/portal/events/[eventId]/basics/page.tsx`
- **Key Classes:** Card: `bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow p-6 sm:p-8 space-y-6`; field grid: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5`; loading skeleton: `animate-pulse h-96 bg-surface-container-low rounded-[20px]`; save row: `pt-2 border-t border-outline-variant` + `.btn-primary`
- **Pattern notes:** This is the canonical shape for pages editing **one row that always exists** (`hero`, `theme`, `terminology` follow this too — plain `useState` form, `useEffect` load, `handleSave` with `supabase.from().update()`, `react-hot-toast` feedback, no add/edit toggle since there's nothing to add). For pages that manage a **list** of records (facilitators, agenda, activities, faqs, emergency, info-center, networking, games), the add/edit form is a `FormModal` (see Modals above) — never an inline panel.

#### Checkbox group for a `text[]` field
- **File:** `src/app/portal/events/[eventId]/basics/page.tsx` (`disabled_menu_items` section)
- **Key Classes:** Section wrapper: `border-t border-outline-variant pt-6`; heading `text-label-sm font-label-sm text-on-surface-variant uppercase tracking-wide mb-1`; grid `grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3`; each option `flex items-center gap-2 cursor-pointer` wrapping a `w-4 h-4 accent-primary rounded` checkbox (same checkbox style as every other boolean field in the codebase).
- **Pattern notes:** For a `text[]` column with a fixed, DB `CHECK`-constrained set of allowed values, render every allowed key as its own checkbox (label lookup in a `Record<string, string>` constant, e.g. `MENU_ITEM_LABELS`) rather than a multi-select or freeform tag input — matches the CHECK constraint 1:1 so an invalid value can never be produced client-side. Toggle handler adds/removes the key from the form array; never submit values outside the known set.

#### ImageField
- **File:** `src/components/portal/ImageField.tsx` — extracted 2026-08-19 when Activities became a second consumer (was inline in `hero/page.tsx` only until then).
- **Key Classes:** `flex gap-2` row: `input flex-1` (or `text-sm` if `compact`) + an optional `btn-secondary` "Browse Assets" button (`photo_library` icon); preview `mt-2 rounded-xl overflow-hidden border border-outline-variant bg-surface-container-low` at `h-36` (or `h-20` if `compact`), image `object-contain`, hidden via `onError` if the URL 404s.
- **Pattern notes:** `onBrowse` is optional — omit it (or pass `undefined`, e.g. while `organizationId` hasn't loaded yet) to fall back to a plain URL-paste field with no picker button. Pass `compact` for a smaller preview when the field is one row inside a repeatable list (see Activities' gallery images) rather than a full-width standalone field (see Hero's four image fields).

#### Repeatable image list (Activities — hero slot + gallery list)
- **File:** `src/app/portal/events/[eventId]/activities/page.tsx`
- **Pattern notes:** Hero image is a single `ImageField` (0-or-1 `activity_images` row with `image_type='hero'`). Gallery images reuse the same diffed-list save pattern as Agenda's Speakers (`key`/`dbId` per row, `moveItem` for reorder, delete/update/insert diff against `originalImageIds` on save) — each row is a compact `ImageField` + an alt-text input + up/down/remove. `moveItem` moved to `src/lib/reorder.ts` when Activities became its second consumer (was local to `agenda/page.tsx` only until then) — import it from there, don't redefine it locally again.
- **Note:** `AssetPickerModal` picks from the **organization's** shared asset library (`organization_assets` / `org-assets` bucket), not an event- or activity-scoped one — same image can be reused across activities/events in the same org. Needs `organizationId`, sourced from `useEvent()`'s `currentEvent.organization_id` (no extra fetch needed, unlike `hero/page.tsx` which fetches it directly because it needs other `events` columns in the same query anyway).

#### Theme Colors — ColorField
- **File:** `src/app/portal/events/[eventId]/theme/page.tsx` (inline `ColorField` component, not extracted to `components/`)
- **Key Classes:** `flex flex-col gap-3 p-4 bg-surface-container-low rounded-xl border border-outline-variant`; native color input `w-10 h-10 rounded-lg cursor-pointer border-0 bg-transparent p-0`; swatch preview `w-12 h-12 rounded-xl border border-outline-variant shadow-inner`; hex text field uses `.input text-sm font-mono`
- **Pattern notes:** Native `<input type="color">`, not `react-color` (installed but unused). If a second page needs a color picker, extract this into `components/portal/ColorField.tsx` rather than duplicating it inline again.

#### Repeatable/nested list panel (Speakers & Breakout Rooms)
- **File:** `src/app/portal/events/[eventId]/agenda/page.tsx` (`SpeakersPanel`, `BreakoutRoomsPanel` — inline sub-components, not extracted to `components/`)
- **Key Classes:** Panel wrapper `border-t border-outline-variant mt-4 pt-4`; each list row `flex items-center gap-3 bg-surface-container-low rounded-xl p-3` (flat list) or `bg-surface-container-low rounded-xl p-4` (card-style, for nested/2-level lists like rooms); reorder controls are a `flex items-center gap-0.5` trio of icon-only buttons (`arrow_upward` / `arrow_downward` / `close` or `delete`, each `p-1 rounded text-on-surface-variant hover:text-primary` or `hover:text-error` for the remove action), `disabled:opacity-30 disabled:cursor-not-allowed` at the first/last position; an "add new" row sits at the bottom of the list, not the top.
- **Pattern notes:** This is the established shape for any field that's an array of sub-records edited inline within a parent form (session speakers, breakout rooms, and each room's own mini-agenda). State lives in the parent page as a plain array with a stable client-side `id`/`key` per item (`crypto.randomUUID()` for new entries); reordering is a `moveItem<T>(list, index, direction)` array-swap helper — **no `@dnd-kit`**, matches the codebase-wide "not yet adopted" status for that dependency (`code-standards.md`). For a jsonb-backed field (no DB rows, e.g. `breakout_rooms`), the whole array just gets serialized on save. For a join-table-backed field (e.g. `agenda_session_speakers`), track each item's real DB id separately from its list key (`dbId: string | null`) and diff on save: delete ids no longer present, update the ones that still exist, insert the ones with `dbId === null`.

### Global Form Primitives (defined in `globals.css`, not React components)

`.input`, `.label`, `.hint`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.panel-shadow`, `.custom-scrollbar` — see `ui-tokens.md` for exact definitions. Always reuse these classes rather than rebuilding equivalent styles per component.

---

## Not Yet Captured

These exist and are in active use but haven't had their classes extracted into this registry yet — capture with `/imprint [filepath]` the next time each is touched:

`CsvImportModal`, `AssetPickerModal`, `Avatar`, `CreateEventModal`, `CreateOrganizationModal`, `CreateTeamModal`, `AddPersonModal`, `EditProfileModal`, `TeamMembersModal`, `EventAssignmentsDropdown`, `ComingSoonPanel` (currently unused dead code — confirm before deleting or wiring it up).
