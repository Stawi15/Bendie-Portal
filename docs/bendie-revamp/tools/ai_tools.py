"""Generates data/ai-tools-proposal.json (doc 27). Every tool maps to an EXISTING route,
library function or RPC (verified 2026-11-20), or to a domain module approved in doc 21
(marked "to_create"). Run: python3 docs/bendie-revamp/tools/ai_tools.py"""
import json, datetime
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "data/ai-tools-proposal.json"

# risk: read | draft | write | high
# perm: who may run it (the server re-checks; this is documentation, not the check)
T = []
def tool(name, risk, scope, desc, executes, perm, entities, approval, inputs, notes=""):
    T.append(dict(name=name, risk=risk, scope=scope, description=desc, executes=executes,
                  permission=perm, entities=entities, approval=approval, input_schema=inputs,
                  audit="ai_action_log" + (" + ai_proposals + content audit triggers" if risk in ("write", "high") else ""),
                  recovery={"read": "none needed", "draft": "discard draft",
                            "write": "proposal shows before-values; revert by applying the inverse proposal; trigger audit keeps the diff",
                            "high": "confirmation with affected count; inverse proposal where possible; sends can't be undone, so they require a typed confirmation"}[risk],
                  notes=notes))

E = {"event_id": "uuid (taken from context, never from the model)"}

# ---------- Read (no approval; runs as the user) ----------
tool("search_navigation", "read", "global", "Find a Studio page or feature by name or intent.",
     "registry: data/routes.json filtered by the user's products and permissions", "any signed-in user", ["routes"], "none",
     {"query": "string"}, "Deterministic; also used by the ⌘K palette.")
tool("navigate_to", "read", "global", "Open a verified Studio route (returns a URL the UI navigates to).",
     "registry lookup only; never builds arbitrary URLs", "any", ["routes"], "none", {"route_key": "enum from routes.json", **E})
tool("get_event_summary", "read", "event", "Event basics, products, status/visibility, counts per area.",
     "events + event_products (caller client) + readiness counts", "event access", ["events"], "none", E)
tool("get_event_readiness", "read", "event", "Readiness report: blocking, warnings, recommended, with affected records.",
     "src/lib/readiness/evaluate.ts (doc 23; to_create)", "event access", ["*"], "none", E)
tool("list_speakers", "read", "event", "Speakers with completeness flags (bio, photo, sessions).",
     "src/lib/speakers.ts listSpeakers (to_create; from facilitators/page.tsx)", "event access", ["facilitators"], "none",
     {**E, "filter": "missing_bio|missing_photo|no_sessions|all"})
tool("get_agenda", "read", "event", "Sessions by day with speakers, locations, breakouts.",
     "src/lib/agenda.ts listSessions (to_create; from agenda/page.tsx fetchData)", "event access", ["agenda_sessions", "agenda_session_speakers"], "none",
     {**E, "day": "date (venue time) optional"})
tool("check_schedule_conflicts", "read", "event", "Overlaps by location and speaker; sessions outside event dates.",
     "src/lib/agenda/conflicts.ts (to_create; deterministic)", "event access", ["agenda_sessions"], "none", E)
tool("list_attendees", "read", "event", "Event members with role, access status, travel coverage. Contacts only if the caller may see them.",
     "event_members (caller client) + profileContacts.eventMemberContacts", "event host/organizer/admin, org admin, Stawi", ["event_members"], "none",
     {**E, "filter": "no_access_code|no_email|no_travel|all", "include_contacts": "boolean (default false)"},
     "Contacts never go to the model unless the request needs them (doc 32).")
tool("list_participants", "read", "event", "Planner participants with flight/hotel/transport coverage.",
     "src/lib/plannerPeople.listParticipants after resolvePeopleCapability", "Planner people view", ["passengers", "event_passengers"], "none", {**E, "filter": "no_flight|no_hotel|no_transport|unlinked|all"})
tool("list_tasks", "read", "event", "Planner tasks by status, assignee, due date.",
     "src/lib/plannerTasks.listEventTasks after resolveTaskCapability", "Planner tasks view", ["operational_tasks"], "none", {**E, "status": "Pending|In progress|Completed|any"})
tool("list_vendor_items", "read", "event", "Vendor items and packed/loaded/on-site stages.",
     "src/lib/plannerVendors.listVendorItems after resolveVendorCapability", "Planner vendors view", ["event_vendor_items"], "none", E)
tool("list_checklist", "read", "event", "Checklist items and sourcing/on-site status.",
     "src/lib/plannerChecklist.listChecklistItems after resolveChecklistCapability", "Planner checklist view", ["event_checklist_items"], "none", E)
tool("get_run_of_show", "read", "event", "Planner programme with production rows.",
     "plannerAgenda.listAgendaItems + plannerProduction.listSessions after capability", "Planner production view", ["event_agenda_items", "production_tasks"], "none", E)
tool("get_recent_activity", "read", "event", "Recent changes (who, what, when) from the audit log.",
     "event_content_audit_log (caller client)", "event access", ["event_content_audit_log"], "none", {**E, "limit": "int ≤ 50"})

# ---------- Draft (no data change; returned as editable drafts) ----------
for name, desc in [
    ("draft_text", "Draft or improve copy (event description, session description, speaker bio, FAQ answer, welcome message) ONLY from supplied facts."),
    ("draft_networking_questions", "Propose networking questions and options for the event's themes."),
    ("draft_notification", "Draft a push notification title/body (never sends)."),
]:
    tool(name, "draft", "event", desc, "model only; output validated by zod", "same as the page the draft is for", [], "user edits then saves through the normal page/inspector",
         {**E, "kind": "enum", "source_facts": "string[] (from records/user)", "tone": "enum"})
tool("draft_agenda", "draft", "event", "Draft sessions from a brief/schedule, validated by check_schedule_conflicts before preview.",
     "model (deep tier) + deterministic validator", "agenda editors", ["agenda_sessions"], "preview → becomes a write proposal",
     {**E, "source_document_id": "uuid optional", "instructions": "string", "constraints": "object (days, rooms, break rules)"})
tool("draft_run_of_show", "draft", "event", "Draft production rows (cues, mics, screens, buffers) from the programme. Marked INTERNAL.",
     "model + validator", "Planner production manage", ["production_tasks"], "preview → write proposal", {**E, "session_ids": "uuid[] optional"})
tool("parse_document", "draft", "event", "Extract structured records from an uploaded file into staging (doc 28).",
     "deterministic parser (CSV/XLSX via spreadsheetImport.ts) → model only for mapping/semantic extraction", "same as the target import", ["ai_import_jobs"], "staging review",
     {**E, "file_id": "uuid", "hint": "entity type optional"})
tool("propose_field_mapping", "draft", "event", "Map spreadsheet columns to Studio fields when deterministic matching is unsure.",
     "spreadsheetImport.ts column matcher first; model only for unmatched columns", "same as the import", [], "shown in the import mapping step", {"columns": "string[]", "samples": "string[][] (redacted)", "target_entity": "enum"})

# ---------- Write (proposal + approval; executes via existing logic) ----------
W = [
    ("upsert_speaker", "Create or update a speaker.", "src/lib/speakers.ts saveSpeaker (to_create)", "event content editors", ["facilitators"]),
    ("upsert_sessions", "Create/update sessions (and their speakers; breakouts via save_breakout_rooms RPC).", "src/lib/agenda.ts saveSession (to_create) + rpc save_breakout_rooms", "agenda editors (platform/org admin per Feature 021)", ["agenda_sessions", "agenda_session_speakers", "agenda_breakout_rooms"]),
    ("upsert_faqs", "Create/update FAQs.", "src/lib/faqs.ts (to_create)", "event content editors", ["faqs"]),
    ("update_event_details", "Change name, description, dates (venue time via eventTimeZone.ts), location.", "src/lib/events.ts updateEventDetails (to_create; from basics/page.tsx)", "event host/organizer/admin", ["events"]),
    ("apply_import", "Write the approved rows of a staged import, in dependency order (doc 11).", "the existing per-entity importers (CsvImportModal handlers) moved into domain modules", "same as each target entity", ["*"]),
    ("create_planner_tasks", "Create Planner tasks.", "src/lib/plannerTasks.createTask after resolveTaskCapability (manage)", "Planner tasks manage", ["operational_tasks"]),
    ("upsert_participants", "Add or update Planner participants.", "plannerPeople.createNewParticipant / updateParticipant after resolvePeopleCapability (manage)", "Planner people manage / org admin", ["passengers", "event_passengers"]),
    ("upsert_flights_hotels", "Add/update flights and hotel bookings.", "plannerLogistics.createFlight/updateFlight/createHotelBooking/updateHotelBooking after resolveLogisticsCapability", "Planner logistics manage / org admin", ["all_flights_combined_table", "hotel_bookings"]),
    ("upsert_run_of_show", "Write approved production rows / programme items.", "plannerProduction.createSession/updateSession, plannerAgenda.createAgendaItem/updateAgendaItem", "Planner production manage", ["production_tasks", "event_agenda_items"]),
]
for n, d, ex, p, en in W:
    tool(n, "write", "event", d, ex, p, en, "per-proposal approval in the UI; diff shows before/after; bound to user+org+event+record versions",
         {**E, "records": "array (validated per entity zod schema)", "proposal_id": "uuid (on execute)"})

# ---------- High impact (explicit confirmation; some kept out of AI entirely) ----------
H = [
    ("bulk_update", "Apply one change to many records (e.g. assign track, set status).", "domain module per entity, row by row in a transaction where possible", "as per entity", ["*"]),
    ("delete_records", "Delete records.", "domain module delete functions; Planner delete* functions", "as per entity", ["*"]),
    ("add_event_members", "Give people app access. Triggers access-code emails.", "POST /api/events/[eventId]/members (Feature 017 roster route + guards) plus the follow-ups the browser runs today (current-event pointer, access code via trigger), moved into one shared module so the AI and UI run the same steps", "event host/organizer/admin, org admin", ["event_members", "event_user_access_codes"]),
    ("schedule_push_notification", "Send or schedule a push to attendees.", "event_push_notifications insert (existing page logic → domain module)", "event managers", ["event_push_notifications"]),
    ("set_event_visibility", "Change status/visibility (public readability, doc 09).", "events update via domain module", "event host/organizer/admin", ["events"]),
]
for n, d, ex, p, en in H:
    tool(n, "high", "event", d, ex, p, en, "typed confirmation showing exact affected count and consequences; never auto-run; never in background",
         {**E, "proposal_id": "uuid", "confirmation_text": "string"})

EXCLUDED = [
    {"capability": "Planner permission changes (Team & access)", "why": "Grants access to another product; keep human-only (doc 32)"},
    {"capability": "Platform admin: organisations, products, moderation", "why": "Stawi-only governance; not delegated to AI"},
    {"capability": "Account creation / make admin", "why": "Identity and privilege changes"},
    {"capability": "Raw SQL, arbitrary HTTP, file system, shell", "why": "Portal 2.0 §15.1"},
    {"capability": "Reading passports / dietary data into model context", "why": "Sensitive; doc 32 redaction"},
]

data = {"generated": datetime.date.today().isoformat(),
        "status": "PROPOSAL (doc 27). 'to_create' = domain module approved in doc 21, not yet built.",
        "counts": {r: sum(t["risk"] == r for t in T) for r in ("read", "draft", "write", "high")},
        "tools": T, "excluded": EXCLUDED}
OUT.write_text(json.dumps(data, indent=2))
print(data["counts"], len(T))
