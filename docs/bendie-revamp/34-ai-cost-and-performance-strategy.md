# 34 — AI Cost and Performance Strategy

**Status:** PLAN with **estimates only**. Figures are calculated from the list prices in doc 24 (International, USD per 1M tokens, checked 2026-11-20). Nothing has been measured; real numbers come from the eval harness (docs 24, 33).

## Per-task estimates

| Task | Tier / model | Assumed tokens (in / out) | Est. cost |
|---|---|---|---|
| Palette "Ask" / routing | Fast: qwen3.7-flash ($0.03 / $0.13) | 3K / 0.2K | ≈ $0.0001 |
| Copilot question with 2 tool rounds | Standard: qwen3.7-plus ($0.40 / $1.60) | 2 × (8K / 0.5K) | ≈ $0.008 |
| Column mapping for one spreadsheet | Fast | 4K / 0.5K | ≈ $0.0002 |
| Draft 10 speaker bios | Standard | 12K / 3K | ≈ $0.01 |
| Agenda draft (2 days) + 1 repair round | Standard → Deep if needed | 15K / 4K (+ repair) | ≈ $0.01–0.05 |
| Event builder from a 30-page brief | Deep: qwen4-max ($1.50 / $4.50) | 40K / 5K | ≈ $0.08 |
| Scanned 10-page manifest | Vision: qwen3-vl-plus ($0.20 / $1.60) | 25K / 4K | ≈ $0.01 |

**Rough per-organisation month** (assumed 500 Copilot questions, 20 imports, 5 builders, 10 agenda drafts): about **$5–7**. Prompt-cache hits on the stable prefix (doc 26) lower this.

## Limits (enforced in the orchestrator)

| Limit | Default |
|---|---|
| Tool rounds per request | 6 |
| Wall time per request | 60s (imports run as jobs) |
| Input tokens per request | 60K (builder/import: 200K) |
| Retries | 1 for transient errors; 1 schema-repair round |
| Concurrent requests per user | 2 |
| Requests per user per minute | 20 |
| Tokens per organisation per month | Configurable cap, default 5M, with an alert at 80% |

## Performance

- **First token:** stream everything. Show tool-step status immediately (doc 31).
- **Deterministic first:** palette navigation, readiness, conflicts and parsing never wait for the model.
- **Fast tier for routing and classification;** escalate to standard or deep only when a task needs it.
- **Prompt caching:** stable system + product + schema prefix (doc 26).
- **Batch:** Model Studio batch inference is half price where available (Singapore; not Virginia or Frankfurt, doc 24). Useful later for bulk drafting overnight; not in phase 1.
- **No AI on page load.** Proactive suggestions come from deterministic rules; the model is only called when the user acts.
