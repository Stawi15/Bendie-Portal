# 29 — Intelligent Event Builder

**Status:** PROPOSAL. It's an AI layer **on top of** journey J1 (doc 19) and the staging pipeline (doc 28). It never replaces the manual "New event" sheet.

## Flow

1. **Input:** a typed description, or a dropped brief, proposal, spreadsheet or schedule (doc 28 limits).
2. **Extraction (deep tier, schema-validated):** an `EventDraft` object.
3. **Plan view:** an editable checklist grouped by area (doc 17). Each item is one of:
   - **Found**, with its source quote
   - **Needs you** (unknown or ambiguous)
   - **Suggested** (a module or default, with the reason)
4. **The organiser accepts or edits each section.** Nothing is created until **Create draft event**.
5. **Create:** `create_event_with_products` (the existing RPC, via the existing route), then the approved sections are applied as proposals (doc 27). The event is created in **Draft**. **It's never published or made public by AI** (§11, rule 13).

```ts
type EventDraft = {
  name: Field<string>; dates: Field<{ start: string; end: string }>; timezone: Field<string>;
  location: Field<string>; products: Field<('bendie'|'planner')[]>;
  modules: Suggestion<SectionKey[]>;              // only keys from EVENT_SECTIONS
  objectives: Field<string[]>;
  speakers: Field<SpeakerDraft[]>; sessions: Field<SessionDraft[]>;
  sponsors: Field<ExpoDraft[]>; faqs: Field<FaqDraft[]>;
  unsupported: { label: string; reason: string }[];   // content Studio has no place for
};
type Field<T> = { value: T | null; status: 'found'|'needs_you'|'conflict'; source?: SourceRef; note?: string };
```

## Guardrails (§11)

| Rule | Mechanism |
|---|---|
| Never invent dates, venues, people | A `Field` must cite a `SourceRef` to be `found`; otherwise it's `needs_you`. A post-check confirms that every found value occurs in the source text (normalised match). |
| Only supported configuration | `modules` is a closed enum from `EVENT_SECTIONS`; sessions validate against the agenda schema and `block_type` enum; anything else goes to `unsupported` |
| Products and entitlement | Only products the organisation has active (`organization_products`) can be suggested |
| Time zone | Never guessed from a city name silently: suggested with "Check", and required before create (Feature 024) |
| Planner | If Planner is chosen, provisioning runs as in today's create path; failures show the Retry (B4 fix) |

## Without AI

The same plan view can be filled by hand (it's just the readiness rules and section list), so the guided build works with Copilot off.
