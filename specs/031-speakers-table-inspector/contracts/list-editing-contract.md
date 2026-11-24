# List-Editing Contract (031): what later page migrations may rely on

## Domain module: `src/lib/speakers.ts`

All functions take `client: SupabaseClient<Database>` first and run under the caller's RLS. They never create a client and never use the service role.

| Function | Returns | Notes |
|---|---|---|
| `listSpeakers(client, eventId, signal?)` | `{ data: Speaker[] } \| { error }` | Ordered by `display_order` |
| `createSpeaker(client, eventId, input, displayOrder)` | `{ data: Speaker } \| { error }` | Normalises empties to null |
| `updateSpeaker(client, id, input)` | `{ error? }` | Never touches `display_order` |
| `deleteSpeaker(client, id)` | `{ error? }` | |
| `importSpeakerRow(client, eventId, row, displayOrder)` | `{ error?: string }` | Shape expected by `CsvImportModal.importRow` |
| `addSpeakerFromAttendee(client, eventId, member)` | `{ created: boolean } \| { error }` | Existence check + claimed insert; the role update stays with the caller |
| `listSpeakerSessions(client, eventId, speakerId)` | `{ data: SpeakerSession[], timeZone } \| { error }` | Union of the lead and linked sessions |
| `validateSpeaker(input)` | `{ full_name?: string; email?: string }` | Today's exact messages |
| `matchesSearch`, `applySpeakerFilters`, `compareSpeakers`, `speakerGroups` | pure | Unit tested |
| `SPEAKER_CSV_COLUMNS`, `SPEAKER_CSV_SAMPLES`, `parseSpeakerCsvRow` | — | Moved verbatim from the page |

## Components

| API | Guarantee |
|---|---|
| `<DataTable.Root data columns getRowId initialSort onOpenRow>` | Headless sort via TanStack Table; one tab stop per row; Enter/Space opens; `aria-sort` on sortable headers; list mode below 768 px |
| `<DataTable.Toolbar>`, `.Search`, `.Filter` (`<select>`), `.Reset`, `.Body`, `.Empty`, `.Error`, `.Loading` | Composable; callers pass already-filtered data |
| `<StatusBadge.Done>`, `.Neutral`, `.Warning`, `.Blocking`, `.Info` | Icon + text always; 029 status tokens |
| `<DirtyGuardProvider>` + `useDirtyGuard(isDirty)` | While dirty: guards link clicks, Back, `beforeunload` and the shell's guarded actions |
| `useNavigationGuard().confirmLeave()` | Resolves `true` with no active guard; otherwise asks "Discard changes?" |
| `<RightPanel.Portal open title onClose>` | Live children. Docked ≥1280 px; below that a focus-trapped `role="dialog"` sheet; Escape and close button; focus returns to the invoker; reduced motion |

## URL

`?speaker=<uuid>|new` on the Speakers route, in v2 only. Later inspectors use `?<entity>=<id>|new`. Other parameters are preserved.

## Behaviour guarantees

1. The v1 Speakers page is pixel-identical; only its data calls moved.
2. Attendees' "Add to speakers" writes exactly what it wrote before (verified by a payload unit test).
3. No way of leaving with unsaved changes skips the prompt (6 in-app ways plus reload and tab close).
