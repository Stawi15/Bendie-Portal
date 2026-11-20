# 21 — Component Architecture

**Status:** PROPOSAL. It follows `bendie-react` (composition patterns, React 19) and `context/code-standards.md`. Two items conflict with current project rules and are marked **DECISION**.

## Layers

```mermaid
flowchart TB
  subgraph UI[src/components]
    Shell[shell/: AppShell · Sidebar · Toolbar · RightPanel · CommandPalette]
    Data[data/: DataTable · FilterBar · BulkBar · EmptyState · ErrorState · StatusBadge]
    Form[form/: Field · FormSection · DirtyGuard · SaveStatus]
    Ent[entities/: SpeakerInspector · SessionInspector · PersonInspector …]
  end
  subgraph Pages[src/app/portal/**/page.tsx]
    P[Thin pages: choose view, wire hooks]
  end
  subgraph Lib[src/lib]
    Dom[domain modules: speakers.ts · agenda.ts · members.ts · planner*.ts (exist)]
    Ready[readiness/: rules · evaluate]
    Reg[registry/: routes · entities (from data/*.json)]
  end
  P --> Shell & Data & Form & Ent
  Ent --> Dom
  P --> Dom
  Dom --> DB[(Supabase: browser client under RLS / server routes)]
```

## Folder change

`components/portal/` is flat with 70 files. It splits into `shell/`, `data/`, `form/`, `entities/` and keeps `portal/` for existing one-offs during migration. `code-standards.md` says *"flat until there's a real need"*; this is that need, and it gets recorded there if approved.

## Key components (compound APIs, no boolean pile-ups)

```tsx
<DataTable.Root data={speakers} columns={speakerColumns} selection urlState="speakers">
  <DataTable.Toolbar>
    <DataTable.Search placeholder="Search speakers…" />
    <DataTable.Filters />
    <DataTable.BulkBar actions={[assignSessions, exportCsv]} />
    <ImportButton entity="facilitators" />   {/* wraps CsvImportModal */}
    <PrimaryAction>Add speaker</PrimaryAction>
  </DataTable.Toolbar>
  <DataTable.Body onOpen={(row) => inspector.open('speaker', row.id)} />
  <DataTable.Empty rule="speakers.present" />
</DataTable.Root>

<RightPanel>                       {/* one slot: inspector OR Copilot */}
  <Inspector entity="speaker" id={selectedId} />
</RightPanel>
```

- **Entity inspector registry:** `entities/registry.ts` maps an entity type to its tabs, loader and save functions. The same registry later feeds the Copilot's "open record" and the command palette's record search. One source, not three.
- **`DirtyGuard`:** a context that blocks in-app navigation and inspector close while dirty (fixes doc 13 #4).
- **`ImportButton`** keeps `CsvImportModal` as is (doc 16 invariant 8).
- **Explicit variants, not flags:** `StatusBadge.Blocking`, `StatusBadge.Done`, rather than `<StatusBadge isBlocking …>`.

## DECISION 1: shared domain modules for Bendie writes

| | |
|---|---|
| Today | Bendie content writes live inside `'use client'` pages (`code-standards.md`: "no service layer"). Planner already has `src/lib/planner*.ts`. |
| Why change | The inspector, the "Everyone" list, bulk actions, imports **and** future AI tools all need the same writes. Copying them breaks Portal 2.0 rule 9 and AGENTS.md (no duplicate business logic). |
| Proposal | Per-domain modules `src/lib/<domain>.ts` (e.g. `speakers.ts`: `listSpeakers`, `saveSpeaker`, `deleteSpeaker`), written against a passed-in Supabase client so the **same function runs in the browser (RLS) or a server route**. Pages call them; nothing else changes. They're created **only when a second caller needs them**, not as a big-bang refactor. |
| Not proposed | Server Actions, a repository/ORM layer, or moving Bendie writes behind APIs. RLS stays the enforcement point. |

## DECISION 2: new dependencies (Portal 2.0 rule 7: evaluate before adding)

| Need | Options | Recommendation |
|---|---|---|
| Accessible primitives (dialog, popover, menu, tabs, focus trap) | Radix UI primitives · React Aria · hand-built (status quo; only 2 dialogs have `role="dialog"` today) | **Radix primitives**: unstyled, so they work with the existing Tailwind tokens, add the missing accessibility, and can be adopted per component |
| Data table logic | TanStack Table · hand-built | **TanStack Table** (headless; sort, filter, selection, column visibility) |
| List virtualisation | TanStack Virtual · `content-visibility` only | **TanStack Virtual** for lists over ~50 rows (Planner flights 605, tasks 691 live) |
| Command palette | `cmdk` · hand-built on a Radix dialog | **`cmdk`** (small, accessible) |
| Forms | `react-hook-form` + `zod` (installed, unused) | Use them in new inspectors only; existing pages keep `useState` until migrated |
| Drag and drop | `@dnd-kit` (installed, unused) | Use it for agenda timeline, ground transport board, reordering, always with keyboard alternatives |
| Motion | CSS only · `motion` | **CSS first.** Add `motion` only if the inspector or drawer needs interruptible springs, decided in the shell spec. |

Each new dependency gets its version pinned and gets recorded in `code-standards.md`. The Copilot's AI dependencies are decided separately in pass 3.

## Migration order (fits doc 36)

1. Tokens and the focus ring.
2. App shell around **existing** pages (no page rewrites).
3. Data table + inspector on Speakers (pilot), then Agenda, FAQs, the rest.
4. Readiness evaluator (doc 23).
5. "Everyone" and Travel views (read across, write through the owners).
6. Command palette.

Each step is its own Spec Kit feature, with parity rows filled in doc 16 and `/review` + `/imprint` at the end.
