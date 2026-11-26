# Verification: 032 Photo Games Editor and Chat Switch

Test environment only. The backend mirrored by `docs/test-env/photo-games-test-setup.sql` (developer ran it in the SQL editor; the `chat_enabled` column grants were added after the first run, matching production's column grants read on 2026-11-26).

## Static (2026-11-26)
tsc clean; lint 0 errors / 28 warnings (= main baseline); vitest 88 passed (79 + 9 in `photoGames.test.ts`).

## Browser (port 3200, branch from main 992e198), 30/30
Org admin on Summit:
- tabs; quiz tab unchanged;
- Bingo: library banner and 15 read-only rows with a 15-square board; "Use own content" → editable; edit text (list and board update); empty text refused; move up (list and board update); switch off → "Only 14 active" warning and an empty square, then back on; add prompt with an id suggested from the text, added as a spare; duplicate id refused;
- Connects: own content, 60 cards, hold counts per card (2/2/1/0 as seeded), next id `card-61`, add card;
- Activity: 6 photos with names and player numbers; Connects filter = 3;
- Leaderboard: 6 players, top = 10 points;
- Basics: Chats item, ticked survives reload (chat off), then switched back on;
- Attendees: player numbers shown;
- no page errors.

Event staff: read-only note, no edit controls; the hold-counts route returns 403.

Stawi admin: library 15 + 60 rows editable; one edit saved and restored.

Script bugs fixed during the run: an "Edit" locator matching "(edited)", a list locator hitting the step navigator, and an ambiguous "Game" label. No app bugs found.

Test data restored: Summit back on the library (77 own rows removed), `chat_enabled = true`, library unchanged (75 rows, no leftovers).
