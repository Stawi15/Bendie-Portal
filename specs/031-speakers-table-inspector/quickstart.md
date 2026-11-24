# Quickstart: validating 031

Test environment only (synthetic data). The dev server runs with `.env.test.local`; builds run in a separate git worktree. Any test data written is restored afterwards.

1. **Static:** `npx tsc --noEmit && npm run lint && npm test` plus a worktree `next build`. Expected:
   - tsc clean;
   - lint 0 errors and no new warnings (baseline 28);
   - all tests pass, including `speakers.test.ts`;
   - the build succeeds;
   - the only dependency change is `@tanstack/react-table@9.3.1` (exact).
2. **v1 unchanged (SC-002):** walk-through `STUDIO_SHELL=v1` compared with a same-day reference run of `redesign@1426691`. Expected: 0 access differences, and the Speakers and Attendees screenshots differ by data only.
3. **v2 access parity:** walk-through `STUDIO_SHELL=v2`. Expected: same final pages as v1.
4. **Parity and behaviour script (v2, org admin, Summit):**
   - **List and narrowing:** the list in display order with a count; search on each of the 6 fields; each sort both ways and back to display order; each filter and their combination; reset; the no-match and empty states (on an event with no speakers).
   - **Editing:**
     - add a speaker, which goes to the end of the order and opens;
     - edit a field and save;
     - try saving with an empty name and with a bad email (same messages as v1);
     - delete, with both confirm and cancel;
     - check the claim badges (claimed and not claimed);
     - check the sessions list for a speaker on sessions, one on none, and a lead-only speaker.
   - **URL:** a deep link reopens the speaker; Back closes it; an unknown id shows the not-found message.
   - **Guard:** with unsaved changes, try each way of leaving: close, another row, sidebar link, breadcrumb, Back, Escape, event search, Logout, reload. Each one asks; "Keep editing" keeps the values; "Discard" proceeds. With no changes, nothing asks.
   - **Import:** import the template with 2 rows; they appear at the end. Delete them afterwards.
   - **Attendees "Add to speakers"** in v1 and v2: same records as before. Restore the test data afterwards.
5. **Responsive and keyboard (SC-007):**
   - 1440 px: docked inspector.
   - 1024 and 768 px: sheet (focus trapped, Escape, focus returns to the row).
   - 390 px: list mode; no sideways scroll or clipped controls.
   - Focus detector: all controls at ≥3:1.
   - Reduced motion: the sheet doesn't slide.
