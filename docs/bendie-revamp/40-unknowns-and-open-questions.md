# 40 — Unknowns and Open Questions

This file is updated as discovery continues. **Owner** is who can answer.

## Blocking further discovery

| # | Question | Why it matters | Owner |
|---|---|---|---|
| Q1 | ~~Test environment~~ **Resolved 2026-11-19:** two free test projects were loaded from schema-only `pg_dump`s plus the exact production permissions, storage buckets and policies, and Bendie's sign-up trigger. Counts match production. Scheduled jobs, Vault secrets, edge functions and the Planner push webhook were deliberately not copied (doc 15). Bendie test ref `baqivpboykobrqlxxoph`, Planner test ref `xwqhisiwvnhluihcpliz`. Seeded the same day with synthetic data and 3 logins; permissions verified equal to production. (Production hasn't yet applied the Feature 027 "C1" `profiles` column lock-down, so `email`/`phone` are still column-readable by `anon` and `authenticated` there and in the test copy. Row visibility is still governed by RLS.) | — | — |
| Q1b | ~~Production Planner service-role key embedded in the `push_dispatch_on_notification` webhook~~ **Resolved 2026-11-20: the developer rotated the key.** How it was exposed (no evidence of public disclosure or misuse): (1) Supabase's Database Webhooks feature stores request headers, including `Authorization: Bearer <service-role key>`, in plain text in the trigger definition, readable by anyone with project/database access; (2) it was therefore included in the local schema dump `~/planner-schema-full.sql`; (3) a diagnostic command in the Claude session printed that trigger line unmasked, putting the key in the conversation history. Still recommended: rebuild the webhook to read its key from Vault (or use a narrowly scoped secret) so the current key isn't stored in plain text too. | — | — |
| Q2 | ~~Mobile codebases?~~ **Resolved 2026-11-20:** both apps were audited with `prompts/mobile-app-extraction.md` (Events @ b64159b, Planner @ 0eeaac4). Results: `data/mobile/`, doc 09 "What the apps actually do", `entities.json` → `mobile_app`. New findings M1–M8 below. | — | — |
| Q3 | ~~Should `docs/` stay gitignored?~~ **Resolved:** `docs/bendie-revamp/` is now tracked; the rest of `docs/` stays local. | — | — |
| Q4 | ~~Link the JSM skills?~~ **Resolved:** symlinked into `.claude/skills`, and the skill set was consolidated (doc 02). | — | — |

## Found during test-environment setup (2026-11-19)

| # | Finding | Evidence |
|---|---|---|
| T1 | **An event can get stuck in Planner "pending" with no way to recover in the app.** If `/api/events/create` fails after `create_event_with_products` but before provisioning starts (seen in the test copy with a misconfigured server key), the event stays `pending` with 0 attempts. The dashboard shows "Setting up Bendie Planner…" and, after 5 min, "contact support". The **Retry** button only appears for `failed`, although `retry-planner-provisioning` accepts `pending`. Candidate fix: offer Retry when pending is stale. | `plannerProvisioningStaleness.ts`, retry route, test event `tester` |
| T2 | The live Bendie project has **no `event-assets` bucket**, although `architecture.md`, doc 04 and `supabase/migrations/004_storage_policies.sql` describe one. The live buckets are avatars, activity-images, event-photos, chat-media, post-images, org-assets and event-files. Doc 04 needs correcting once it's clear which bucket content images really use. | Live `storage.buckets` |

| T3 | When Planner setup succeeds after a failure, the old `events.planner_provisioning_error` text isn't cleared (only the failure path writes it, `plannerEventProvisioning.ts:85`). The UI hides it, but readiness or AI logic reading it would get stale data. | Test event `tester` after Retry |

## Found in the mobile app audit (2026-11-20)

These are app-side or cross-product issues. Studio can warn about them, but most need the app teams.

| # | Finding | Impact | Owner / next step |
|---|---|---|---|
| **M1** | **The Events app hard-codes `Africa/Nairobi`** for agenda and speaker times and never reads `events.timezone` (Feature 024). | Any event outside East Africa shows **wrong session times to attendees**, although Studio stores them correctly | Events app team. Meanwhile Studio warns when `timezone ≠ Africa/Nairobi` (doc 23 rule `event.app_timezone`). |
| **M2** | **The `agenda_sessions_summary` view (security invoker) reads `profiles.email`.** When Feature 027's C1 lock-down revokes that column, the view fails for attendees, and the app falls back to one speaker per session. | **Blocks C1 as planned** | Bendie backend: change the view to `f.email` only (or drop email from the JSON) **before** C1 |
| M3 | `facilitator_label_singular/plural` are fetched but **never displayed** in the Events app. | Studio's "speaker label" setting has no visible effect | Decide: the app displays them, or Studio marks the field "not used by the app yet" |
| M4 | Neither app reads `event_products` / `organization_products`. | Pausing **Bendie** for an organisation doesn't affect the attendee app | Product decision: is pause meant to hide the event in the app? |
| M5 | The Planner app never reads `events.status`. | Studio "Visibility" affects the attendee app only (the doc 17 visibility line must say so) | Studio copy |
| M6 | Global rows: `info_content` with `event_id IS NULL` is also shown in **every** event (in addition to news, excursions, categories, expo). | Studio must never use null as "unassigned" | Studio rule (doc 07 updated) |
| M7 | `news_items.published_at` isn't a schedule; future-dated news shows immediately. | Studio mustn't present it as scheduling | Studio copy, or the app adds a filter |
| M8 | The Planner app saves `event_user_assignments` as **whole-row upserts** (from an offline outbox that replays later), resetting switches and turning `org_default` into `manual`. | Studio Team & access edits can be silently overwritten by a Planner save | Planner team: partial updates; Studio shows "last changed in Planner app" |
| M9 | Legacy Planner tables `capetown`, `johburg_one/two`, `slt_vip`, `shuttles`, `transport_logistics`, `users`, `vehicle_passengers`, `staging_production_csv` are **not used by the Planner app code** (`vehicle_boardings` still is). | Candidates for retirement (Q11), after checking RPC/view bodies and edge functions | Planner team |

## Deferred reconciliations (constitution Governance)

| # | Item | Deferred to |
|---|---|---|
| G1 | `context/architecture.md` still says Next.js 14, "no service layer" and admin-only access, which conflicts with constitution v2.0.0. Flagged by the 029 analysis. | The app-shell feature, which changes structure (constitution VII) |

## Product

| # | Question | Context |
|---|---|---|
| Q5 | ~~Draft/publish model for content?~~ **Decided 2026-11-20 (developer took the recommended approach).** Phase 1 does **not** add content drafts: that needs every attendee-app query changed (doc 09), which is out of reach without the mobile codebases (Q2). Instead, visibility is made explicit: `events.status` becomes a "Visibility" control that says what each value does (members see edits immediately; Active/Published = publicly readable), and AI-generated content is never saved without approval (§11). Revisit content drafts once the app code is available. | — |
| Q6 | Should Bendie attendees and Planner participants become one person concept in the UI? | Four people concepts; email bridge misses 86% (docs 09, 13) |
| Q7 | Should Basics edits keep the Planner event in sync after creation? | Currently copied once |
| Q8 | Who are the target users of 2.0: Stawi staff, client organisers, or both equally? | `project-overview.md` says internal staff; the code admits client organisations |
| Q9 | Should reusable speaker and contact libraries exist at organisation level? | Speakers are per event (doc 13 #8) |
| Q10 | Is engagement-reminder delivery for **draft** events intended? | `enqueue_engagement_notifications` includes `draft` |

## Data and ownership

| # | Question |
|---|---|
| Q11 | Who owns the Planner legacy tables (`capetown`, `johburg_*`, `slt_vip`, `staging_production_csv`, `shuttles`, `users`, `transport_logistics`, `vehicle_passengers`, `planner_access_backup_022`), and can they be retired? |
| Q12 | 6 `agenda_sessions` have `event_id IS NULL`. Are they global by design or orphans? |
| Q13 | `app_release_config` version (1.0.4 vs iOS 3.2.5) is still open from `memory.md`. |

## AI (for docs 24–34)

The recommendations are now in docs 24 and 32: Frankfurt EU scope + ZDR models + per-organisation opt-in, default off. **Timing (developer, 2026-11-20):** these questions are deferred until the AI concept is approved as a working prototype on synthetic test data (doc 36 Phase 7). They must be answered before any real data reaches Qwen.


| # | Question |
|---|---|
| Q14 | Which Qwen hosting route is acceptable for data residency (Alibaba Model Studio international or Singapore, a third-party host, self-hosted)? Attendee, travel and passport data is involved. |
| Q15 | What's the budget ceiling per organisation or month for Copilot inference? |
| Q16 | May passport, dietary or phone fields **ever** be sent to the model, or must they always be redacted? |
| Q17 | Should AI features be per-organisation entitlements, like `organization_products`? |
