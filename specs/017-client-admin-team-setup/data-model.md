# Data Model: Client Admins Set Up Their Own Team (Feature 017)

**No new tables or columns; `src/types/database.ts` unchanged.** One migration changes behavior
only: two `organization_members` policies, two triggers and a one-time backfill (research R7–R9).
All entities exist and were verified against the live Portal database on 2026-10-09.

## Migration `zz_organization_admin_event_membership_and_role_guard.sql`

| Object | Change |
| --- | --- |
| Policy `organization_members_insert_self` | Replaced by `organization_members_insert_org_admin`: org owner/admin may insert only non-owner/admin roles |
| Policy `organization_members_update_owner_admin` | Replaced by `organization_members_update_org_admin`: org owner/admin may update only rows that are, and stay, non-owner/admin |
| Function + trigger `add_org_admins_to_new_event` | `AFTER INSERT ON events`, `SECURITY DEFINER`: org owners/admins except the creator → `event_members` role `admin`, on conflict do nothing |
| Function + trigger `add_new_org_admin_to_events` | `AFTER INSERT OR UPDATE OF role ON organization_members`, `SECURITY DEFINER`, when role becomes owner/admin: every org event → role `admin`, raising lower roles |
| Backfill | Same upsert for all current owners/admins × their org's events, executed as `service_role` (24 added, 1 raised, measured 2026-10-09) |

| Entity (table) | Fields used | Written by Feature 017 | Rules |
| --- | --- | --- | --- |
| Account (`auth.users` + `profiles`, created by the on-signup trigger) | `id`, `email`, `full_name`, `planner_profile_id` | Created silently when the email has no account; `full_name` set if given | Email matched case-insensitively; never a second account per email |
| Organization membership (`organization_members`) | `organization_id`, `user_id`, `role` | Inserted with `role = 'member'` only, on conflict do nothing | Existing row and role never changed by the new routes; owner/admin rows writable only by Stawi or the service role (FR-024) |
| Event membership (`event_members`, PK `(event_id, user_id)`) | `event_id`, `user_id`, `organization_id`, `role` | Inserted with the requested role, on conflict do nothing; org owners/admins auto-inserted/raised to `admin` by triggers | One row per person per event (the single roster); team adds keep an existing role; org owners/admins are raised to `admin` (FR-022); `organization_id` must equal the event's (trigger `trg_event_members_integrity`) |
| Planner access (`event_members.planner_*` + Planner `event_user_assignments`) | via Feature 008 routes | Unchanged code path (`grantPlannerAccess`) | Planner profile reused by email / `planner_profile_id`; assignment upserted on `(event_id, profile_id)` |

## State of one "Add team member" request

```text
email entered
  → account: existing | created
  → organization: already_member | added (role member)
  → event: already_member (role kept) | added (role chosen)
  → planner access: granted | already set | failed (reason) | denied
```

Each step is idempotent, so repeating the request after a partial failure completes the missing
steps and changes nothing that already succeeded.
