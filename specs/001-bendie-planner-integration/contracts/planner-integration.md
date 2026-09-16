# Contracts: Bendie Planner Integration

Internal admin-only route-handler contracts. Every route below shares one non-negotiable
precondition (Constitution Principle II/IV, spec FR-029): **the caller's Portal admin
authorization is independently re-verified inside the route itself**, before any Planner-project
access is attempted, regardless of what the calling UI already checked. Every route responds with
an explicit status code and a JSON body on every branch, including failure — no silent
`200`-with-hidden-error responses, matching the existing `create-user`/`bulk-create-users`
convention.

## GET — list available Planner events

**Purpose**: Powers the linking picker (spec User Story 1, FR-002).

**Auth**: Portal admin required. Unauthenticated → `401`. Authenticated but not admin → `403`.

**Response (success)**: A list of Planner events with enough identity to display and select from
(Planner event id, title, and any other fields useful for disambiguating similarly named events —
e.g. date/location). Flat, unscoped by organization, per spec decision #4. **Each entry also
indicates whether it is currently actively linked to some Portal event** (`/speckit.analyze`
correction — checked against the corrected uniqueness design in `data-model.md`) — a Planner event
that's already someone else's active link must not be presented as freely selectable, since
attempting to link it would only be rejected (FR-004). This is a read-only annotation, not a
filter: an already-linked event still appears (so an admin can see where it went), it's just
visibly marked unavailable rather than silently offered.

**Response (failure)**: An explicit error body and non-`200` status if the Planner project is
unreachable or misconfigured — never a silently empty list standing in for an error.

## POST — link or unlink a Portal event to a Planner event

**Purpose**: Creates/updates/deactivates the one Planner Link row for a Portal event (spec User
Story 1, FR-003/FR-004/FR-006).

**Auth**: Portal admin required, same as above.

**Request**: identifies the Portal event, the chosen Planner event (or an explicit "unlink"
intent), and is attributed to the acting admin.

**Behavior**:
- Linking to a Planner event already actively linked to a *different* Portal event is rejected
  (`409`-class outcome) — the pre-existing link is left untouched (spec FR-004, SC-006). Enforced
  by the corrected partial-unique-index constraint in `data-model.md`; the route catches that
  constraint violation and returns the `409`-class rejection rather than a raw DB error.
- Linking to a Planner event whose only prior link is **inactive** (previously unlinked by some
  other Portal event) is permitted (`/speckit.analyze` correction) — the partial unique index only
  constrains active rows, matching FR-004's "actively linked" wording exactly.
- Linking a Portal event that already has an active link to some Planner event replaces that link
  (research.md decision) — this is an update, not a duplicate row.
- Unlinking deactivates the link without deleting any data previously synchronized under it.

**Response (success)**: Confirms the resulting link state (linked/unlinked, and to which Planner
event when linked).

## POST — synchronize one eligible member to the linked Planner event

**Purpose**: The automatic, best-effort sync triggered by the four existing Portal
member-provisioning flows (spec User Story 2, FR-008–FR-014). Not intended to be triggered
directly by an administrator through the UI — it is the target of the provisioning hooks, but it
is still an ordinary authenticated route, not a background job.

**Auth**: Portal admin required, same as above.

**Behavior**:
- No-ops (a `skipped` outcome, not an error) when the target Portal event has no active Planner
  link — this must be cheap, since most events won't be linked (spec FR-014).
- No-ops when the member's Portal role is `attendee` — in practice this route is never even called
  for that role (see `research.md`'s role-mapping decision), but the route itself must also treat
  an attendee-role request as a no-op rather than an error, as a second line of defense.
- Resolves the person's Planner identity by an exact, case-insensitive email match (spec
  FR-010/FR-011) — never a raw ILIKE pattern match, since `%`/`_` are legal in a real email's local
  part and would otherwise let one person's sync wrongly resolve to a different person's existing
  Planner identity (2026-09-14 hardening: `%`/`_` are escaped before the lookup).
- Creating a new identity when none exists is itself race-safe: Planner's `profiles.email` and
  `auth.users.email` are both live-unique, so a `createUser()` failure from a concurrent request
  winning the same race is recovered by re-fetching the winning identity (bounded retry, since the
  winner's own explicit profile-row insert — Planner has no auth-seed trigger — may not have landed
  yet) rather than reported as a permanent failure. Two or more concurrent first-time syncs for the
  same person converge on one Planner identity, never two (2026-09-14 hardening).
- Writes/updates the Planner-side participation record with the role-appropriate access flags
  (`research.md`'s role-mapping table), via a database-backed `upsert` against Planner's live
  `UNIQUE (event_id, profile_id)` constraint on `event_user_assignments` — not a check-then-write —
  so two concurrent sync requests for the same person+event cannot create duplicate assignment rows
  (2026-09-14 hardening; see `data-model.md`).
- Always returns a distinguishable outcome — `succeeded`, `failed` (with a reason), or `skipped`
  (with a reason) — surfaced back to whatever triggered it (spec FR-013).

**Critical constraint (spec FR-012)**: A failure in this route's Planner-side work MUST NOT be
allowed to make the *calling* Portal member-provisioning action report as failed. This is enforced
by the caller (the four provisioning hooks treat this as fire-and-forget / non-blocking), not by
this route pretending failures don't happen — the route itself reports failure accurately; it's
the caller's responsibility not to let that failure propagate into the primary operation's own
success/failure state.

## POST — push the linked event's Portal agenda to Planner

**Purpose**: Manual, administrator-triggered (spec User Story 3, FR-015–FR-019).

**Auth**: Portal admin required, same as above.

**Behavior**:
- Rejected (or unavailable) when the target Portal event has no active Planner link.
- Transforms and sends the current Portal agenda; a session already pushed in a prior call is
  updated in place on the Planner side, never duplicated (FR-016) — enforced by a database-backed
  `upsert` on `(event_id, source_portal_session_id)`, Planner's durable cross-system identity column
  for pushed items, rather than trusting Portal's own `planner_agenda_item_id` alone. This also
  means a retry after a lost `INSERT` response recovers and updates the already-created Planner row
  instead of creating a duplicate (2026-09-14 hardening; see `data-model.md`).
- Never deletes Planner-side agenda content, even when the corresponding Portal session no longer
  exists (FR-017).
- Returns a per-push outcome an administrator can read (how much was pushed, and whether it fully
  succeeded, partially succeeded, or failed) (FR-018).

## POST — pull flight/hotel travel data from the linked Planner event

**Purpose**: Manual, administrator-triggered (spec User Story 4, FR-020–FR-026).

**Auth**: Portal admin required, same as above.

**Behavior**:
- Rejected (or unavailable) when the target Portal event has no active Planner link.
- Retrieves flight and hotel/accommodation data only — no ground-transfer data (FR-027).
- Matches each Planner traveler to a member of *this specific linked Portal event* by email
  (FR-021); a traveler with no match is skipped, never attached to the wrong person, and reported
  back to the administrator by name/identifier so they can follow up (FR-022).
- A traveler already imported in a prior pull is updated in place, never duplicated (FR-026).
- Every written row is marked as Planner-sourced and immediately read-only in the Portal (FR-023,
  FR-024) — enforced at the database layer (see `data-model.md`), not only by this route's own
  behavior.
- Never touches a manually created Portal travel row for any traveler (FR-025).
- Returns a per-pull outcome: how many records were imported/updated, and how many Planner
  travelers were skipped as unmatched.
