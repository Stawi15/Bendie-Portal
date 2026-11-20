# 32 — AI Security and Privacy

**Status:** PROPOSAL. It extends the platform's existing controls (RLS on all 103 tables, per-route authorisation, the Feature 027 contact rules) to the Copilot. Facts about the provider come from doc 24.

## Threats and controls

| Threat | Control |
|---|---|
| **Tenant / event leakage** | Conversations keyed by user × org × event; `event_id`/`organization_id` injected server-side, never from model output; tools run on the caller's RLS client; tool results filtered again before they reach the model |
| **Privilege escalation** | No AI service-role client. Tools reuse page/route checks (`portalAuth`, `resolve*Capability`, `canAdministerPlannerPermissions`). Planner permission changes, platform admin and account creation are **excluded** (doc 27). |
| **Prompt injection** (documents, record text, names) | Untrusted content is delimited as data; the system rule says it can't issue instructions; **all writes need human approval**; tools only accept schema-valid args; injection tests in the eval set must score 0% (doc 24) |
| **Malicious files** | Type and size allow-list; parse as data (no macros or scripts); page and row caps; stored in a private bucket; deleted after 30 days |
| **Tool misuse / runaway loops** | Max 6 tool rounds, 60s, per-request token budget, per-user rate limits (doc 34); high-impact actions never chain automatically |
| **Data exposure to the provider** | Minimisation (doc 26): passport, dietary, gender and emergency data are **never** sent; contacts masked unless needed; ZDR-enabled models where available |
| **Approved change altered later** | Proposals bound to record `updated_at` versions; revalidated before execution; immutable once approved |
| **Secrets** | `QWEN_*` keys server-only; never logged; rotated like the Supabase keys. Lesson from doc 40 Q1b: keys never go inside database objects (webhooks/triggers). |
| **Abuse / cost** | Organisation-level AI entitlement + global kill switch; per-org monthly token cap |
| **Auditability** | `ai_action_log` (who, which tool, which records, model, tokens, outcome) plus the existing content audit triggers for the actual writes |

## Personal data inventory (what can reach Qwen)

| Data class | Example tables | Sent? |
|---|---|---|
| Event content | sessions, FAQs, news, expo | Yes, when relevant to the task |
| Professional profile | speaker name, title, organisation, bio | Yes, when relevant |
| Contact | email, phone (`profiles`, `passengers`) | Masked by default; unmasked only for a user-requested task the caller may already see under `can_view_profile_contact` |
| Travel | flights, hotels, transfers | Times, routes and coverage flags yes; **passport no** |
| Sensitive | passport, dietary requirements, gender, emergency contacts | **Never** |
| Attendee runtime | messages, chats, posts, reports | **Never** (outside Copilot scope) |

## Provider and legal (decisions needed before any **real** data; doc 40)

Timing (developer, 2026-11-20): these are answered **after** the concept is approved as a working prototype on synthetic test data (doc 36 Phase 7, step 1). They must be settled before any organisation's real data reaches Qwen.

1. **Region:** Frankfurt EU scope recommended (doc 24). Confirm model availability, ZDR and strict-schema support there.
2. **DPA / contract terms** with Alibaba Cloud covering retention (≤30 days, or ZDR), no training without consent, and sub-processors.
3. **Cross-border transfer review** for the organisers' and attendees' jurisdictions (events are mostly in Kenya and Africa/Nairobi time; Kenya's Data Protection Act 2019 regulates transfers). That's for counsel. This doc doesn't assert compliance.
4. **Transparency:** tell organisations (and, through them, attendees where relevant) that AI processing happens, and where.
5. **Per-organisation opt-in** to AI (default off until 1–4 are settled).

## Security tests before launch (doc 33)

Cross-org and cross-event access attempts through the Copilot; injection documents (instructions, fake approvals, "ignore previous"); oversized and malformed files; permission downgrade mid-conversation (role removed, so the next tool call is denied); stale-proposal execution; rate-limit and kill-switch behaviour.
