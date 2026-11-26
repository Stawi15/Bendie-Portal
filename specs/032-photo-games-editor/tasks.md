# Tasks: Photo Games Editor and Chat Switch

**Input**: spec.md, plan.md. Tests: vitest for pure rules; browser checks on test env.

## Phase 1: Foundation
- [X] T001 `src/lib/photoGames.ts`: types; `validatePromptText`, `isValidQuestionId`, `suggestBingoId(text, existing)`, `nextCardId(existing)`, `boardRows(rows)` (first 15 active by sort_order), `reorderUpdates(rows, id, dir)`, `isEventRunning(event)`, warnings; data functions: `listGameRows(client, scope, game)`, `copyLibraryToEvent`, `updateRow`, `insertRow`, `saveSortOrders`, `listActivity`, `listPlayerNumbers`
- [X] T002 [P] `src/lib/photoGames.test.ts`
- [X] T003 [P] `src/types/database.ts` + `src/lib/eventColumns.ts`: `chat_enabled`, `player_number`

## Phase 2: US1 + US2 Editor (P1)
- [X] T004 Move today's Games page body verbatim into `src/components/portal/photo-games/QuizGamesPanel.tsx`; the page becomes tabs
- [X] T005 `PhotoGameEditor.tsx` (scope: event | library; game): source banner + Use own content / Pull new rows; list with ↑/↓, on/off, Edit (FormModal), Add (FormModal, id suggestion); Bingo board preview; warnings; read-only when not editable
- [X] T006 `src/app/api/events/[eventId]/photo-games/hands/route.ts` (role check via `is_event_host_or_organizer`, `is_event_org_admin`, `portal_is_global_admin`, then service-role count); shown per card in Connects
- [X] T007 `src/app/portal/admin/games/page.tsx` + "Games library" in the Stawi admin menu (TopHeader)

## Phase 3: US3 Activity and Leaderboard (P2)
- [X] T008 `PhotoGameActivity.tsx` and `PhotoGameLeaderboard.tsx`

## Phase 4: US4 Chat and player numbers (P1)
- [X] T009 Basics: Chats item in "hide items" (ticked = `chat_enabled = false`)
- [X] T010 Attendees: player-number column

## Phase 5: Verify and release
- [X] T011 tsc, lint, tests, build; walk-through (no change to existing pages)
- [X] T012 Browser checks on test data (editor actions, preview, warnings, hold counts, activity, leaderboard, chat, numbers, permissions: org admin, event staff, Stawi admin); restore test data
- [X] T013 /review, converge; merge to `main` (developer confirms), then merge `main` into `redesign`
