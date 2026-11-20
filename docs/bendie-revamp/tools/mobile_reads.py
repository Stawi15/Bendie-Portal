"""Annotates data/entities.json with which mobile app reads/writes each table, from the
mobile contract files in data/mobile/ (produced by prompts/mobile-app-extraction.md).
Run from repo root: python3 docs/bendie-revamp/tools/mobile_reads.py"""
import json
from collections import defaultdict
from pathlib import Path

D = Path(__file__).resolve().parents[1] / "data"
ent = json.loads((D / "entities.json").read_text())
APPS = {"bendie-events": "bendie", "bendie-planner": "planner"}

summary = {}
for app, db in APPS.items():
    c = json.loads((D / "mobile" / f"studio-contract-{app}.json").read_text())
    use = defaultdict(lambda: {"ops": set(), "columns": set()})
    for t in c["tables"]:
        u = use[t["name"]]
        u["ops"].add(t["op"])
        for col in t.get("columns", []) or []:
            u["columns"].add(str(col))
    fragile = defaultdict(list)
    for f in c.get("fragile_columns", []):
        fragile[f["table"].split(".")[0].strip()].append(f"{f['column']}: {f['why'][:140]}")
    tables = ent["databases"][db]["tables_detail"]
    names = {t["name"] for t in tables}
    for t in tables:
        u = use.get(t["name"])
        t["mobile_app"] = None if not u else {
            "app": app, "ops": sorted(u["ops"]),
            "columns": sorted(u["columns"])[:60],
            "fragile": fragile.get(t["name"], []),
            "source": f"data/mobile/studio-contract-{app}.json @ {c['git_commit']}",
        }
    summary[app] = {
        "git_commit": c["git_commit"],
        "tables_used": sorted(n for n in use if n in names),
        "views_or_other_used": sorted(n for n in use if n not in names),
        "tables_not_used_directly": sorted(names - set(use)),
        "note": "Not used DIRECTLY by app code. The app may still reach these through RPCs or views (see the contract's rpcs list), e.g. Planner tasks via get_operational_tasks_for_mobile_v2.",
    }

ent["mobile_contracts"] = summary
(D / "entities.json").write_text(json.dumps(ent, indent=2))
for app, s in summary.items():
    print(app, "| tables used:", len(s["tables_used"]), "| views/other:", len(s["views_or_other_used"]), "| tables NOT used:", len(s["tables_not_used_directly"]))
    print("   not used:", ", ".join(s["tables_not_used_directly"]))
    print("   views/other:", ", ".join(s["views_or_other_used"]))
