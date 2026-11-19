# Request to the Bendie Events backend team: reviewer fields on `content_reports`

**From:** the Portal team. **Date:** 2026-11-19.

The Portal's new **Moderation** screen (Stawi admins only) reads and handles `content_reports` with the service role. Today the table has only a `status` column, so there's no record of **who** handled a report, **when**, or **why**. Writes made with the service role also don't appear in any audit log with an actor.

Please add these nullable columns:

| Column | Type | Meaning |
|---|---|---|
| `reviewed_by` | `uuid` references `profiles(id)` **ON DELETE SET NULL** | The Stawi admin who changed the status |
| `reviewed_at` | `timestamptz` | When the status was last changed |
| `action_note` | `text` | Optional note from the reviewer (up to 1,000 characters from the Portal) |

- **RLS:** no change needed. The Portal writes them with the service role, and app users keep insert-only access.
- **Grants:** no `authenticated` select grant is needed.
- **`ON DELETE SET NULL`** keeps in-app account deletion working (see the Planner brief's FK note).

**No coordination needed:** the Portal already sends these fields. If the columns don't exist (Postgres `42703` / PostgREST `PGRST204`), it retries with `status` alone. Once they're added, the screen starts recording and showing who handled each report, with no Portal release.

Two related observations:
- A **profile** report doesn't record the event it came from. The Portal asks the admin which of the person's events to act on. An optional `event_id` column, filled in by the app when it knows the event, would let the Portal pre-select it.
- Comments can't be reported (`content_type` is `post`, `message` or `profile`). The Portal can hide comments only while reviewing a post report.
