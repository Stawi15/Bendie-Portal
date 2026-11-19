# Implementation Plan: Content Moderation

**Branch**: `028-content-moderation` (stacked on 027) | **Date**: 2026-11-19 | **Spec**: [spec.md](spec.md)

## Design

**Server**
- **`src/lib/moderation.ts`** (server-only, service-role client from `getPortalAdminClient`):
  - `listReports(status: 'pending' | 'handled')`: reports, plus the reporter's name, each target's event (post → `posts.event_id`; message → `chats.event_id`) and event names.
  - `loadReportDetail(id)`: the target's content.
    - post: photo, caption, author, hidden state, comments
    - message: ±3 by `created_at` in the same chat, sender names, chat type and title
    - profile: public fields plus their events
    - also how many other reports exist about the same target
  - `applyModerationAction(id, action, actorUserId)`: performs the action and sets the status (see the table).
- **`src/lib/plannerRemoval.ts`**: `deactivatePlannerOnRemoval(portalAdmin, eventId, userId, actorUserId)`, extracted unchanged from `deactivate-on-removal/route.ts`, which now calls it. Moderation calls it after each removal.
- Routes, each behind `requirePlatformAdmin()`:
  - `GET /api/admin/moderation?status=`
  - `GET /api/admin/moderation/[reportId]`
  - `POST /api/admin/moderation/[reportId]` with `{ action, commentId?, eventIds?, note? }`
- **Reviewer fields**: the status update first tries `{ status, reviewed_by, reviewed_at, action_note }`. On an unknown-column error (`42703` / `PGRST204`) it retries with `{ status }`. Reads use `select('*')` and show the fields only if they're present.

| Action | Write | Status |
|---|---|---|
| `hide_post` / `unhide_post` | `posts.is_hidden` | actioned / unchanged |
| `hide_comment` / `unhide_comment` (comment must belong to the reported post) | `post_comments.is_hidden` | actioned / unchanged |
| `delete_message` | delete `messages` row | actioned |
| `remove_from_events` (eventIds ⊆ the person's events) | delete `event_members` rows + Planner deactivation | actioned |
| `dismiss` / `mark_reviewed` | n/a | dismissed / reviewed |

**Gallery** (FR-008):
- `GET /api/events/[eventId]/gallery`: the caller must be a Stawi admin or `is_event_member(event, caller)` (the same definer function as the RLS). Stawi admins see all posts; others see non-hidden posts plus their own. Read with the service role.
- `PATCH` (`is_hidden`) and `DELETE /api/events/[eventId]/gallery/[postId]`: allowed for a Stawi admin or the post's author (as RLS allows today). The write uses the **caller's session first**, so the audit trigger records who acted. Only if that matches 0 rows (for example, because the caller blocked the author) is it repeated with the service role. Deleting cascades likes and comments.

**UI**
- `src/app/portal/admin/moderation/page.tsx`:
  - Pending / Handled tabs and a list built from the admin table and card patterns, with an "over 24h" chip.
  - A detail panel with the content and action buttons.
  - Confirmations through `useConfirm`, an optional note, and loading, error and empty states (`EmptyState`).
- A **Moderation** item in TopHeader's admin menu.
- The Gallery page switches to the routes, and its UI is unchanged.

## Constitution Check

| Principle | Result | Notes |
|---|---|---|
| I. Brownfield | PASS | Reuses `requirePlatformAdmin`, `getPortalAdminClient`, `deactivateAssignmentForRemoval`/`recordAuditEntry`, `EmptyState`, `useConfirm`. Gallery behaviour is preserved. |
| II. Architecture | PASS | Service role only in server routes and libs, after authorization. |
| III. DB safety | PASS | No migration. Reviewer columns are optional and detected at runtime. |
| IV. Security | PASS | Stawi-admin only. Message context is capped at ±3. |
| V. UI | PASS | Existing tokens and components. |
| VI. Scope | PASS | No bans, no notifications, no schema changes. |
| VII. Docs | PASS | `architecture.md`, `progress-tracker.md`, `schema-reference.md`. |
| VIII. Verification | PASS | `tsc`, lint, tests, build, plus a live read of the 4 reports through the detail loader's queries. |
