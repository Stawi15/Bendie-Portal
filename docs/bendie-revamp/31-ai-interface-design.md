# 31 — AI Interface Design

**Status:** PROPOSAL. It implements the four Copilot surfaces in Portal 2.0 (drawer, expanded workspace, inline, palette) inside the one right panel from doc 18. Rules come from `bendie-design` and the Apple generative-AI guidance (`references/hig-generative-ai.md`): keep people in control, be transparent, offer non-AI fallbacks, and make refining and reverting easy.

## Surfaces

| Surface | Opens from | Best for | Shape |
|---|---|---|---|
| **Drawer** | ✦ button in the toolbar, ⌘. or the palette's "Ask Copilot…" | Questions, short tasks, explanations | Right panel (shares the slot with the inspector) |
| **Expanded workspace** | "Expand" in the drawer, or automatically for imports, the event builder, agenda drafts | Multi-entity review, staging, timelines, diffs | Full canvas, **keeps the conversation**; "Back to Agenda" restores the previous page, filters and scroll |
| **Inline** | ✦ next to a field or table toolbar | One-shot help in place: "Draft bio from notes", "Find speakers missing bios", "Suggest options" | Popover with the draft and Insert / Edit / Retry / Discard |
| **Palette** | ⌘K | Navigation and actions first (deterministic); "Ask Copilot" as the last item | Doc 18 |

## Responses are components, not paragraphs (§18)

| Request | Rendered as |
|---|---|
| "Attendees missing info" | A filtered **table** (the same DataTable), with "Open in People" |
| "Draft the agenda for day 2" | An **editable timeline preview**, with conflicts flagged |
| "Import this manifest" | The **staging** view (doc 28) |
| "Set track A for these 12 sessions" | A **change preview**: affected records, before → after, then Approve |
| "Where do I add sponsors?" | A **link card** to Content › Expo |
| "Is my event ready?" | The **readiness card** (doc 23) + "What's next" |
| Explanations | Short text, at most 3 sentences, with links to records |

## States

| State | UI |
|---|---|
| Thinking | Status line naming the step ("Reading agenda…", "Checking conflicts…"), never a fake progress bar |
| Running a tool | Chip per tool call: name in plain words + record count |
| Proposal | Card: title, affected count, risk badge (Write / High impact), "Review" → diff → **Approve** / **Edit** / **Reject** |
| High impact | Confirmation sheet: exact consequences ("Sends 26 emails", "Makes the event public"), and a typed confirm for sends |
| Done | "Saved 8 sessions" + **Undo** (where possible) + link to the records |
| Error | What failed, and what to do; Retry; the rest of Studio unaffected |
| Unavailable / off | The ✦ entry points hide; inline buttons explain "Copilot is off for this organisation"; everything else works |

## Transparency and control

- Every AI-produced value carries a ✦ **Draft** marker until the organiser saves it. The activity log shows "via Copilot" next to the user's name (from `ai_action_log`).
- Context chips at the top of the drawer show what the Copilot can see (event · page · selection). The user can remove any of them.
- "What did you use?" shows the sources (records and document lines) behind an answer.
- Thumbs up/down with a reason, stored in `ai_action_log` for evaluation (doc 33). Never used to train a model without consent (doc 24).

## Proactive suggestions (limited)

At most **one** suggestion per page, and only from deterministic readiness rules (doc 23) with an `aiAssist` flag, e.g. "3 speakers have no bio. Draft from their notes?" It's dismissible, and a dismissal is remembered per event. There are no pop-ups and no notifications for AI suggestions.

## Motion and accessibility

The drawer and expanded workspace use the panel spring (doc 20) with a reduced-motion fade. Streaming text sits in an `aria-live="polite"` region, announced on completion (not per token). Every action is reachable by keyboard. Diffs are tables with header semantics, not colour-only highlights.
