# 35 — Migration Strategy

**Status:** PROPOSAL. It rebuilds Studio **in place, incrementally** (constitution Principle I, Portal 2.0 rule 1): no rewrite, no second app.

## Approach: strangler pattern inside the same Next.js app

1. **Same routes.** `/portal/events/[eventId]/<section>` URLs stay valid. New pages live at the same paths, or get a permanent redirect when two sections merge (`hero` and `theme` → App appearance; `planner-agenda` and `planner-production` → Run of show). Bookmarks and links in emails keep working.
2. **Flags, not branches.** The new shell and each migrated page sit behind a per-user (then per-organisation) flag. Old and new run side by side on `main` until parity is signed off; then the old code is deleted in a separate commit.
3. **No database changes for the UI phases.** The redesign is presentation, shared logic and readiness, all over existing tables. The only planned schema additions are the `ai_*` tables (Phase 7) and, possibly, a user-preferences column for flags and density. Each goes through a migration file with RLS (constitution III).
4. **Shared logic extracted on demand.** A domain module (`src/lib/<domain>.ts`) is created the first time a second caller needs a write. The old page and the new inspector both call it, and behaviour is diffed on the test copy.

## Mobile app compatibility

| Rule | Why |
|---|---|
| No renames or drops of columns the apps read | The attendee and Planner apps read the same tables (doc 09). The app code isn't available to check usages (doc 40 Q2). |
| Keep writing legacy mirrors | e.g. `agenda_sessions.facilitator_id` alongside `agenda_session_speakers` (B3); `breakout_rooms` JSON stays trigger-derived |
| Visibility semantics unchanged | The "Visibility" control maps 1:1 onto `events.status` (doc 40 Q5) |
| Planner writes only through existing libs | Same access rules (`plannerAccessRules*.ts`) |

## Per-feature cutover checklist

1. The parity rows for the feature are filled in doc 16 (new location + test).
2. The walk-through and journey tests pass on the test environment, for all roles.
3. Pilot users on the flag for ≥1 week with no regressions.
4. Remove the old page/component; update `context/` docs (constitution VII); `/imprint`.

## Data migrations

None are needed for phases 1–6. If a later spec changes data (e.g. backfilling `facilitator_id` for the 8 join-only sessions), it's a separate, reviewed migration tested on the test copy first. Applied migrations are never reordered or deleted (constitution III).
