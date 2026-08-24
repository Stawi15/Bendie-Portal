# UI Rules

Concise rules for building Bendie Portal UI, derived from the patterns already live across the 16 event-section pages and shared components. Keep new pages indistinguishable in style from existing ones.

---

## Font

Plus Jakarta Sans via `next/font/google`, applied at the root layout as `--font-plus-jakarta-sans`. Never introduce a second font family.

---

## Layout

- Org-level pages: `OrgSideNav` sidebar + main content area.
- Event pages: no sidebar — a horizontal tab bar (`EventLayout`) across all 16 sections, with a floating bottom-right "Next: {section}" button (`btn-primary shadow-lg`, `fixed bottom-6 right-6`) that guides an admin through setup in order.
- Every event-section page starts with a `<SectionHeader sectionKey="..." />` (icon badge + title + description, driven by `eventSectionMeta.ts`) inside a `mb-6` wrapper, followed by one primary content card.

---

## Cards

The single content card per page:

```
bg-white border border-[#E4EAF0] rounded-[20px] panel-shadow p-6 sm:p-8 space-y-6
```

Grid layout inside a card for form fields: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5`, with fields that need more room spanning `sm:col-span-2 lg:col-span-4` (or fewer columns as appropriate). A `pt-2 border-t border-outline-variant` divider separates the save button from the fields above it.

Never use a colored card background — always white, with color carried by text/icons/badges/buttons inside.

---

## Section Header

Every content page uses the same header shape — don't hand-roll a page title:

```tsx
<SectionHeader sectionKey="basics" />
// or with a dynamic description:
<SectionHeader sectionKey="facilitators" desc={`${count} facilitators`} />
```

Backed by `SectionIconBadge` (a colored rounded-square icon, colors/icon sourced per-section from `EVENT_SECTIONS` in `eventSectionMeta.ts`) plus a `font-headline-md text-headline-md` title and `text-body-sm font-body-sm text-on-surface-variant` description.

---

## Typography Hierarchy

| Use                          | Classes                                          |
| ------------------------------ | --------------------------------------------------- |
| Page/section title             | `font-headline-md text-headline-md text-on-surface` (or `-lg` for the event name in the tab-bar header) |
| Body/description text          | `font-body-sm text-body-sm text-on-surface-variant` |
| Form labels                    | `.label` (`text-label-sm text-on-surface-variant`)  |
| Field hints                    | `.hint` (`text-xs text-on-surface-variant/70`)      |
| Metric/stat numbers            | `font-headline-md text-headline-md` (see `MetricCard`) |

Always pair a `text-*` size token with its matching `font-*` weight class (they're defined together in `tailwind.config.js` — see `ui-tokens.md`).

---

## Forms

- Plain `useState` per page, one form object, one `set(field)` curried handler per input type (text/select/textarea vs checkbox) — this is the established pattern (`basics/page.tsx`, `theme/page.tsx`). Do not introduce `react-hook-form` for a single page unless the form is genuinely complex enough to need field-level validation — it's an installed but unused dependency, not yet an established convention here.
- Load current data in a `useEffect` keyed on `eventId` (from `useParams`), show a pulse skeleton (`animate-pulse h-96 bg-surface-container-low rounded-[20px]`) while loading.
- Save via a `handleSave` async function calling `supabase.from(...).update(...)`, with a `saving` boolean disabling the button and swapping its label to `"Saving..."`.
- Always confirm success/failure with `react-hot-toast` (`toast.success(...)` / `toast.error(error.message)`) — never fail silently, never show a raw Supabase error object.
- Textareas that accept free text should disable Grammarly's inline UI (`data-gramm="false" data-gramm_editor="false" data-enable-grammarly="false"`) — established in `basics/page.tsx`, prevents Grammarly's overlay from clashing with the styled textarea.
- **Add/edit forms for any list-based section are always a `FormModal` (`components/portal/FormModal.tsx`), never an inline panel rendered above the list.** An inline panel appears at the top of the page/tab regardless of which item was clicked — for a long list, editing something near the bottom yanks the page back to the top with no visual link to what was clicked, which reads as a bug, not a feature. Single-entity pages with no list (`basics`, `hero`, `theme`, `terminology`) don't have this problem and don't need a modal — their one form is always visible in its natural position.

---

## Buttons

Use `.btn-primary` / `.btn-secondary` / `.btn-danger` from `globals.css` — never rebuild button styling inline. Primary for the main save/confirm action per card, secondary for cancel/alternate actions, danger for destructive actions (delete, revoke).

---

## Color Pickers

Current pattern (Theme Colors page): a native `<input type="color">` swatch (40×40px, borderless) next to a live-updating preview block and a `.input`-styled hex text field, both bound to the same state value. `react-color` is installed but not used — don't introduce it without a reason; the native picker + hex field is the working convention today.

---

## Empty / Loading States

- Loading: `animate-pulse h-96 bg-surface-container-low rounded-[20px]` block in place of the content card.
- Empty states inside a section (e.g. no facilitators yet): keep them minimal — muted text (`text-on-surface-variant`) plus a CTA button if there's an obvious next action.

---

## Status Badges

Event status pills (draft/published/active/completed/archived) use `EVENT_STATUS_LABELS` / `EVENT_STATUS_PILL_CLASSES` from `src/lib/portalLabels.ts` — a shared lookup, not per-page hardcoded strings/colors. Follow the same "shared lookup table" pattern for any other status-driven badge you add.

---

## Do Nots

- Never use raw Tailwind color classes (`bg-blue-500`, `text-gray-600`) for portal chrome — use the tokens in `ui-tokens.md`.
- Never introduce a second icon set alongside Material Symbols Outlined.
- Never show a raw Supabase/JS error message to the user beyond `error.message` in a toast — no stack traces, no raw error objects rendered in the UI.
- Never build a new inline add/edit panel above a list — use `FormModal`. This was a real, recurring bug across 8 pages (fixed 2026-08-19) before it was written down here.
- Never skip the `event_id` scoping check when writing — every mutation on this page must be scoped to `eventId` from `useParams`, not a stale/cached value.
- Never build a new "page title" pattern — always route through `SectionHeader` for event-section pages.
