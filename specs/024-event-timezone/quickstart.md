# Quickstart: validating Event Time Zone (Feature 024)

**Before merging**: run the research R9 SQL in the Supabase SQL editor for both projects, and confirm the expected results.

## Automated

```bash
npx tsc --noEmit && npm run lint && npm test && TZ=America/Los_Angeles npm test
```

## Browser (test organisation, throwaway events)

| # | Do | Expect | Spec |
|---|---|---|---|
| 1 | Open **Create event** | Time zone is pre-filled with your Mac's zone (e.g. `Africa/Nairobi`) | US1 #1 |
| 2 | Type `kig` in Time zone | `Africa/Kigali` is offered, with its UTC offset | US1 #2 |
| 3 | Type `Mars/Base` and try to create | "Choose a time zone from the list"; nothing is created | US1 #3 |
| 4 | Create a **Bendie-only** event: `America/New_York`, 20–21 Nov | Created. Basics shows Time zone `America/New_York` and start 20 Nov 00:00 "in America/New_York" | US1 #4, FR-006 |
| 5 | Create a **Bendie + Planner** event in `Africa/Nairobi`, 20–21 Nov | The Planner overview shows dates 20–21 Nov. In Planner (or its DB), the event's time zone is `Africa/Nairobi` | US1 #5, FR-009 |
| 6 | Open an **older event** that has no time zone | "Reminders are off" notice; times shown as before | US2 #1, #4, FR-005 |
| 7 | On it, set `Africa/Kigali`, save, reload | Kept; notice gone | US2 |
| 8 | On the New York event, change the start to 09:00 and save | Reload shows 09:00 "in America/New_York", whatever your Mac's zone | US2 #3, FR-007 |
| 9 | Change the zone to `Europe/London` without editing the dates | The times re-show in London time (05:00 → …); a hint asks you to check them | FR-008 |
| 10 | On a Planner event's basics page | A hint says Planner keeps its own time zone | FR-011 |
| 11 | On the New York Planner-free event's terminology page | The Feedback Form URL hint mentions the 18:00 last-day push | FR-013 |
| 12 | On a Planner event with zone `America/New_York` starting 20 Nov, add a Planner agenda item dated 20 Nov | It's Day 1 | FR-012 |
