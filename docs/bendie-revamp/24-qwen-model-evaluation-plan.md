# 24 — Qwen Model Evaluation Plan

**Status:** PLAN + verified platform facts (checked 2026-11-20 against official Alibaba Cloud Model Studio docs). Qwen is mandatory (Portal 2.0 §10.1). No runtime AI dependency is installed until the architecture (doc 25) is approved.

## Verified platform facts

| Fact | Detail | Source |
|---|---|---|
| Function calling | Qwen Max / Plus / Flash series (incl. 4-max, 3.8, 3.7), Qwen3-VL, open-source Qwen3.x. **Parallel tool calls on by default.** | [Function calling](https://www.alibabacloud.com/help/en/model-studio/qwen-function-calling) |
| `tool_choice` | `auto`, a specific function, `none`. **`required` is not supported for Qwen**, so the app can't force a tool call and must handle plain-text replies. | same |
| Thinking mode | Tool-call examples run with `enable_thinking: false`. In thinking mode, previous reasoning must be passed back. | same |
| Structured output: JSON Object | Most current Qwen text models (some only in non-thinking mode). The prompt must contain the word "JSON". It doesn't guarantee keys or types. | [Structured output](https://www.alibabacloud.com/help/en/model-studio/qwen-structured-output) |
| Structured output: **JSON Schema (strict)** | qwen4-max, Qwen3.8-Max/Flash, Qwen3.7-Max/Plus/Flash. **Not yet supported in the Singapore region.** Image or document input falls back to JSON Object mode. `multipleOf`, `uniqueItems` and similar keywords are rejected. | same |
| Regions | Singapore (International scope), US Virginia (Global or US), Frankfurt (Global or EU), Tokyo, Hong Kong, Beijing. **Stored data stays in the chosen region; inference may run anywhere within the scope.** | [Regions](https://www.alibabacloud.com/help/en/model-studio/regions) |
| Retention | Prompts and responses are kept for **at most 30 days** by default. **Zero data retention (ZDR)** is available on supported models (encrypted cache ≤24h). Metadata (tokens, timestamps, trace ids) is always kept. | [Data retention](https://www.alibabacloud.com/help/en/model-studio/data-retention-policy) |
| Training | Business data (inputs, outputs, files) **isn't used to train or improve foundation models without separate consent.** | same; [Privacy notice](https://www.alibabacloud.com/help/en/model-studio/privacy-notice) |
| SDK | **`@ai-sdk/alibaba` 2.0.92**, official, in the `vercel/ai` repo, peer `zod`. Alternatives: `@ai-sdk/openai-compatible` 3.0.93 on the `compatible-mode/v1` endpoint, or the `openai` SDK. | npm registry, 2026-11-20 |

### Prices (USD per 1M tokens, International/Singapore list price; Global is often lower)

| Model | Input / Output | Notes |
|---|---|---|
| qwen3.7-flash | $0.03 / $0.13 (≤32K input) | Free quota 1M tokens; schema mode |
| qwen3.8-flash | $0.15 / $0.47 | Schema mode |
| qwen3.7-plus | $0.40 / $1.60 (≤256K) | Schema mode; limited-time discount noted |
| qwen4-max | $1.50 / $4.50 | Latest flagship; schema mode; prompt cache hits $0.075 |
| qwen3-vl-plus | $0.20 / $1.60 (≤32K) | Images and scanned documents |

Source: [Model pricing](https://docs.modelstudio.console.alibabacloud.com/en/model-studio/model-pricing). **Re-check before choosing.** Prices and model ids change often, and the pages disagree in places (they say so themselves).

## Candidate set (3 tiers, by task)

| Tier | Candidate | Tasks |
|---|---|---|
| **Fast** | qwen3.7-flash (fallback qwen3.8-flash) | Intent and routing, column mapping, entity classification, short drafts, palette "Ask" |
| **Standard** | qwen3.7-plus | Copilot conversation with tools, agenda drafting, readiness explanations |
| **Deep** | qwen4-max | Event builder from a long brief, multi-entity extraction, run-of-show drafting |
| **Vision** | qwen3-vl-plus | Scanned PDFs, images of schedules or manifests (no strict schema, so validate on our side) |

The thinking mode is evaluated per task: off for tool calls (as the docs advise) and for latency-sensitive paths; on is tested for the builder and agenda drafts.

## Region decision (needs a legal/DPA check; doc 32)

| Option | For | Against |
|---|---|---|
| **Frankfurt, EU scope** | Data and inference stay in the EU, closest to an adequacy-style argument; schema mode support **to be verified** | No batch or fine-tuning (not needed in phase 1) |
| US Virginia, US scope | Clear residency | No batch or fine-tuning |
| Singapore (International) | Free quota; batch | **No strict JSON Schema**; inference "global nodes" |

**Recommendation:** Frankfurt with **EU scope** and **ZDR-enabled models**, pending:
1. confirming the chosen models support schema mode and ZDR there;
2. a review of cross-border transfer rules for the organisers' and attendees' jurisdictions (most live events are in Africa/Nairobi; this is a question for counsel, not asserted here).

## Evaluation method

- **Data:** synthetic only (Portal 2.0 §17), generated from the test environment seed plus synthetic documents: briefs, agendas, manifests, rooming lists, speaker lineups as PDF, DOCX, XLSX and CSV, including deliberate errors and prompt-injection text.
- **Harness:** a server script calls each candidate with the **same** prompts and tool definitions (doc 27) and scores against expected outputs. Results are stored in `docs/bendie-revamp/data/ai-eval/`.

| Metric | How it's measured |
|---|---|
| Tool selection accuracy | Expected tool vs chosen tool across 100+ labelled requests |
| Argument validity | % passing the server's zod schema on the first try |
| Structured output validity | % parseable + schema-valid (per mode) |
| Field mapping accuracy | Column → field correct on 30 spreadsheets |
| Extraction precision/recall | Entities from briefs vs gold labels |
| Hallucination rate | Facts in the output not present in the source (judged per item) |
| Clarification behaviour | Asks when required data is missing rather than inventing it |
| Injection resistance | Follows a document's embedded instructions? (must be 0%) |
| Permission adherence | Attempts a tool the user can't use? Server blocks it, but the attempt rate is logged |
| Latency | p50/p95 time to first token and total, per tier |
| Cost per task | Tokens × list price |

**Pass bars** (proposed): tool selection ≥95%, argument validity ≥98% after one repair, injection-following 0%, hallucinated facts ≤1% of extracted items, p95 first token ≤2.5s (fast) / ≤5s (standard).

The cheapest model that clears the bar for each task wins.
