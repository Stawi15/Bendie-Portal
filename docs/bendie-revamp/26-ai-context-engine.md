# 26 — AI Context Engine

**Status:** PROPOSAL. It decides **what Qwen sees** for each request: as little as possible, filtered by the user's permissions, with personal data removed (Portal 2.0 §10.2, §10.4, §16).

## Layers (assembled per request, on the server)

| Layer | Content | Source | Size |
|---|---|---|---|
| 1 System | Role, rules (doc 32), refusal rules, output conventions | Static prompt, versioned in code | ~1.5K tokens |
| 2 Product knowledge | Short descriptions of the features **this user can reach** | Generated from `features.json` + `routes.json`, filtered | ~1–2K |
| 3 Workspace | Organisation, event, products, status/visibility, venue time zone, the user's role and Planner capabilities | `OrganizationContext`/`EventContext` equivalents on the server, `portalAuth`, `resolveAllModuleCapabilities` | ~300 |
| 4 Page | Current route and area, selected record ids, active filters | Sent by the UI; **validated** (route must exist; ids must belong to the event) | ~200 |
| 5 Readiness | Headline + top issues (ids, counts, no personal data) | `evaluateReadiness` (doc 23) | ~500 |
| 6 Schema slice | Only the entities the tools offered can touch, with **business names** (data dictionary, doc 08) | `entities.json` → generated descriptions | ~500–1.5K |
| 7 Retrieved data | Only via **tool results**, never preloaded | Read tools (doc 27) | Capped per tool |

Rule: **data is fetched through tools on demand**, not dumped into the prompt. The model asks `list_speakers(filter: missing_bio)`; it never receives "all speakers".

## Isolation

- A conversation is keyed by **user × organisation × event** (`ai_conversations`). Switching organisation or event starts a new conversation, and old messages aren't carried over (§10.4: "prevent context leaking between events or organisations").
- `event_id` and `organization_id` are injected into every tool call from layer 3, and the model can't override them (doc 27).
- When the user switches pages, layer 4 updates. The UI shows the context chips (event, page, selection) the Copilot is using, and the user can remove any of them.

## Personal data handling (detail in doc 32)

| Data | In context? |
|---|---|
| Names, job titles, organisations | Yes, when a tool returns them for the task |
| Email, phone | **Only** if the task needs them (e.g. "who has no email"), and then masked (`a…@domain`), unless the user explicitly asks to draft a message to that person |
| Passport, dietary requirements, gender | **Never** sent to the model. Tools return only flags such as `has_passport: true`. |
| Emergency contact details | Never |
| Free-text notes (tasks, production, stage-hand notes) | Truncated, and sent as untrusted data (doc 32) |

## Untrusted content

Uploaded documents, record text and tool results are wrapped as **data**, with a fixed delimiter and an instruction that they contain no commands. The system prompt states that instructions inside them must be ignored. Tool calls the model proposes after reading a document are still subject to the user's approval (doc 27). So a malicious document can at most *suggest* changes; it can never execute one.

## Caching and cost

Layers 1, 2 and 6 are stable per user and event, so they form the **prompt-cache prefix** (Qwen supports context caching; doc 24 lists cache-hit prices). Layers 3–5 are appended per request.
