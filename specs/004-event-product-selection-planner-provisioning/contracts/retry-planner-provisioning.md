# Contract: Retry Planner Provisioning

`POST /api/events/{eventId}/retry-planner-provisioning`

**Corrected during the post-review corrective pass (R2)** — the previous version of this contract
incorrectly claimed this endpoint "defensively" reclaims a stuck `provisioning` row past a staleness
threshold. It does not, and was never designed to. Never creates a new Portal event (FR-028) — always
targets the `eventId` in the URL.

## Retryable vs. non-retryable states

| `planner_provisioning_status` | Retryable via this endpoint? |
|---|---|
| `failed` | **Yes** — the only state this endpoint is designed to move forward from `pending`/`failed` into a fresh provisioning attempt (via the CAS claim below). |
| `pending` | Yes, in the sense that the CAS claim (`WHERE status IN ('pending','failed')`) will successfully claim it — but in normal operation `pending` is transient, since `POST /api/events/create` calls this same orchestration synchronously in the same request right after creation. A `pending` row surviving long enough for a customer to see it and retry usually means the original request's own provisioning attempt never ran at all (e.g. crashed before `provisionPlannerEvent` was even called). |
| `provisioning` | **No.** The CAS claim (`UPDATE events SET status='provisioning' ... WHERE status IN ('pending','failed')`) never matches a row already at `provisioning` — 0 rows affected, `409 provisioning_in_progress`, no Planner call made. This is true whether another attempt is *genuinely* still running or the row is *stuck* from a crash (research.md §14 scenario 12) — this endpoint cannot and does not distinguish the two, and does not attempt to. **This is an accepted MVP limitation, not a defect**: recovering a genuinely stuck `provisioning` row requires manual/administrator database intervention; no automatic stale-takeover exists in Feature 004. |
| `succeeded` / `not_required` | No — `404 event_not_found` (nothing to retry). |

## Stale `pending`/`provisioning` customer-facing behavior

`PlannerProvisioningBanner` (not this endpoint) is responsible for telling the customer the truth about
a `pending`/`provisioning` event that has been in that state for longer than
`PLANNER_PROVISIONING_STALE_AFTER_MS` (`src/lib/plannerProvisioningStaleness.ts`, currently 5 minutes)
— see research.md's post-review corrective-pass note. It shows a "taking longer than expected, contact
your administrator or support" message and **never** renders a Retry button for `provisioning` (retrying
would either no-op with `409 provisioning_in_progress`, for a row actually still in progress, or imply a
recovery capability that does not exist, for a row that is genuinely stuck). This endpoint's own behavior
for `provisioning` is unchanged by that UI correction — it still always returns `409
provisioning_in_progress` for that status, whether the UI currently shows the "recent" or "stale"
message.

## Request

No body required beyond the URL's `eventId`.

## Authorization

Identical predicate to creation (research.md §15): caller MUST be a platform administrator OR hold
`owner`/`admin` in the event's organization — not restricted to the original creator.

## Server behavior

1. Re-fetch the event; confirm `organization_id`, re-verify caller authorization against it (never
   reused from any earlier request).
2. Re-verify the `'planner'` entitlement is still active for the event's organization → else `422`
   `entitlement_inactive` (FR-029, failure-matrix scenario 9).
3. Re-verify `organization_planner_links` still exists for the organization → else `409`
   `planner_mapping_missing` (failure-matrix scenario 10).
4. Attempt the CAS claim (`pending`/`failed` → `provisioning`) → if 0 rows affected, another attempt
   already owns this event's provisioning → `409` `provisioning_in_progress`, no Planner call made.
5. Re-enter research.md §5's Phase 2 (using the same deterministic `event_code` — recovers an
   already-created-but-unlinked Planner event rather than duplicating it) through Phase 4.

## Success response

```json
{ "ok": true, "eventId": "uuid", "plannerProvisioningStatus": "succeeded" | "failed" }
```

A `"failed"` result here is still `200 ok: true` — the retry request itself succeeded in *attempting*
provisioning; whether provisioning succeeded is reported in `plannerProvisioningStatus`, mirroring
the create-event contract's own partial-outcome shape.

## Error responses

| Status | Reason | When |
|---|---|---|
| `401` | `not_authenticated` | no session |
| `403` | `forbidden` | not authorized for this event's organization |
| `404` | `event_not_found` | no such event, or its `planner_provisioning_status` is `not_required` (nothing to retry) |
| `422` | `entitlement_inactive` | Planner entitlement no longer active |
| `409` | `planner_mapping_missing` | organization mapping no longer present |
| `409` | `provisioning_in_progress` | another attempt currently holds the CAS claim |
| `200` (`plannerProvisioningStatus: "failed"`, reason `mapping_drift`) | — | a Planner event already exists under a *different* Planner organization than the one currently mapped (research.md §5 Phase 2 step 4, §14 scenario 15, added during `/speckit.analyze`) — not auto-resolved; requires a platform administrator to reconcile the mapping or the orphaned Planner-side event manually. Reported as a successful *retry attempt* whose provisioning outcome is `failed` with this specific reason, not as an HTTP error, since the retry request itself was correctly authorized and executed. |

Diagnostic detail (the raw `planner_provisioning_error` value) is never included in this endpoint's
response to an ordinary customer — only `plannerProvisioningStatus` and the fixed generic message
(research.md §17). A platform administrator retrieves the raw value separately via
`get_event_planner_provisioning_error(eventId)`, not through this endpoint.
