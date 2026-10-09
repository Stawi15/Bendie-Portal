# Contract: Planner Agenda routes

All routes: `resolvePlannerEventAccess(eventId)` first — its `error` → that HTTP status
(`401/403/404`); its `phase` → `200 { ok: true, status }` (pending/stale/failed/unavailable/
backend_error). Then capability (plan D1). Writes require `canManage` → else
`403 { error: 'agenda_manage_denied' }`.

## `GET /api/events/[eventId]/planner-agenda`

`200 { ok: true, capability, items: AgendaItem[] }` — `capability = { hasPlannerIdentity: false }`
or `{ hasPlannerIdentity: true, canView, canManage }`; `items` empty unless `canView`.

```ts
type AgendaItem = {
  id: number; date: string | null; startTime: string | null; endTime: string | null;
  dayNumber: number | null; dayLabel: string | null; title: string; subtitle: string | null;
  speakers: string | null; mc: string | null; roomName: string | null; trackName: string | null;
  itemType: string | null; description: string | null; notes: string | null;
  sortOrder: number; readOnly: boolean; // true when pushed from a Bendie Agenda
};
```

Ordered by `agenda_date`, `start_time` (nulls first), `sort_order`, `agenda_item_id`.

## `POST /api/events/[eventId]/planner-agenda`

Body: `title` (required, ≤ 300), `date` (required, YYYY-MM-DD), optional `startTime`/`endTime`
(HH:MM), `dayNumber` (int ≥ 1), `dayLabel`, `subtitle`, `speakers`, `mc`, `roomName`, `trackName`,
`itemType`, `description`, `notes` (each ≤ 2000), `sortOrder` (int). Unknown fields → 400.
End ≤ start → `400 { error: 'invalid_request', message: 'End time must be after start time.' }`.
`201 { ok: true, item }`.

## `PATCH /api/events/[eventId]/planner-agenda/[itemId]`

Partial body, same fields/validation (merged with the stored row for the time check). Item not in
this Planner event → 404. Pushed item → `409 { error: 'pushed_item_read_only' }`. `200 { ok, item }`.

## `DELETE /api/events/[eventId]/planner-agenda/[itemId]`

Same 404/409 rules. `200 { ok: true }`.
