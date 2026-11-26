# Implementation Plan: Photo Games Editor and Chat Switch

**Branch**: `032-photo-games-editor` (from `main` 992e198) | **Date**: 2026-11-26 | **Spec**: [spec.md](spec.md)

Templates copied by hand (no PowerShell). Architect blueprint confirmed by the developer 2026-11-26. Kept short at the developer's request ("as fast and efficiently as possible").

## Summary

A domain module `src/lib/photoGames.ts` (passed-in client, pure rules with tests) backs:
- a tabbed Games page (Quiz games unchanged; Human Bingo, Connects, Activity, Leaderboard);
- a Stawi admin Games library page;
- one server route for Connects hold counts.

Basics gains a Chats item (`chat_enabled`), and Attendees a player-number column. It's built on `main` with the live layout's patterns, then `main` is merged into `redesign`.

## Technical Context

- Next.js 15.5, React 19, TypeScript, Tailwind (live tokens only: `main` has no 029 tokens).
- **No new dependencies. No database change**: the backend is live, and mirrored on test by `docs/test-env/photo-games-test-setup.sql`.
- Tests: vitest for the pure rules. Browser checks on the test environment, plus the walk-through for no-change.

## Constitution Check (v1.1.1 on `main`; v2.0.0 on `redesign`)

| Principle | Check |
|---|---|
| Brownfield | Quiz games, Basics and Attendees unchanged apart from additions; the Games page's quiz body moved verbatim into a component |
| Architecture | The domain module takes the client as a parameter; the one privileged route re-checks the caller's role (organiser, org admin or Stawi admin, using the same DB helpers as RLS) before using the service role; library writes rely on RLS (Stawi admin) |
| DB safety | No migration; `src/types/database.ts` gains the live columns `chat_enabled` and `player_number` (types only) |
| Security | No secrets; the service role is used server-side only, after the role check |
| UI | Existing patterns (FormModal, `.input`, `btn-*`), no hard-coded colours beyond existing conventions |
| Scope | Photo hiding excluded |

**Gate: PASS.**

## Structure

```text
src/lib/photoGames.ts (+ photoGames.test.ts)       rules: validation, id suggestion, board selection, reorder, warnings; data: list, copy, update, insert, reorder, activity
src/components/portal/photo-games/
  PhotoGameEditor.tsx                              shared editor (event scope or library scope; game prop)
  PhotoGameActivity.tsx, PhotoGameLeaderboard.tsx
  QuizGamesPanel.tsx                               today's Games page body, moved verbatim
src/app/portal/events/[eventId]/games/page.tsx     tabs (?tab=quiz|bingo|connects|activity|leaderboard)
src/app/portal/admin/games/page.tsx                Stawi admin library
src/app/api/events/[eventId]/photo-games/hands/route.ts   hold counts (role check → service role)
src/app/portal/events/[eventId]/basics/page.tsx    + Chats (chat_enabled)
src/app/portal/events/[eventId]/members/page.tsx   + player number
src/components/portal/TopHeader.tsx                + "Games library" in the Stawi admin menu
src/lib/eventColumns.ts, src/types/database.ts     + chat_enabled / player_number
```

## Key decisions

- **Reorder** rewrites `sort_order` as 10, 20, 30… for the whole game list in the new order, so there are never ties and a move is one consistent write set.
- **Bingo id** from the text: a lowercase slug, made unique with `-2`, `-3`…. **Connects id**: the next `card-NN` after the highest existing number.
- **Leaderboard** uses `get_leaderboard(event_id, 100)` (callable by signed-in users, security definer), plus player numbers from `event_members`.
- **Running event** means today is between `starts_at` and `ends_at`.
- **Event using the library:** the list shows the library rows read-only, with the "Use own content" call to action.
