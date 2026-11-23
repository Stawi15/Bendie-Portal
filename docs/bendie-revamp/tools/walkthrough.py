"""Browser walk-through of Bendie Studio against the TEST environment (doc 15).

Run from the repo root, with the dev server already started against the test projects:
    set -a; source .env.test.local; set +a; npm run dev          # terminal 1
    <venv>/bin/python docs/bendie-revamp/tools/walkthrough.py     # terminal 2

Reads logins from .env.test.local (never prints passwords). Refuses to run unless the
app's Supabase URL is a known TEST project. Read-only: it only navigates and screenshots.
Writes docs/bendie-revamp/data/walkthrough.json and screenshots/<role>/*.jpg.
"""
import json, os, re, sys, time
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(os.environ["WALKTHROUGH_OUT"]) if os.environ.get("WALKTHROUGH_OUT") else ROOT / "docs/bendie-revamp"
# Feature 030: run in the current layout (v1, default) or the Studio 2.0 shell (v2).
SHELL = os.environ.get("STUDIO_SHELL", "v1")
if SHELL not in ("v1", "v2"):
    sys.exit("STUDIO_SHELL must be v1 or v2")
BASE = os.environ.get("STUDIO_BASE_URL", "http://localhost:3000")
TEST_REFS = {"baqivpboykobrqlxxoph"}

env = {}
for line in (ROOT / ".env.test.local").read_text().splitlines():
    m = re.match(r"^([A-Z_]+)=(.*)$", line)
    if m:
        env[m.group(1)] = m.group(2)
if not any(r in env.get("NEXT_PUBLIC_SUPABASE_URL", "") for r in TEST_REFS):
    sys.exit("Refusing: .env.test.local does not point at the Bendie TEST project.")

ROLES = {
    "stawi_admin": ("STUDIO_TEST_STAWI_EMAIL", "STUDIO_TEST_STAWI_PASSWORD"),
    "org_admin": ("STUDIO_TEST_ORGADMIN_EMAIL", "STUDIO_TEST_ORGADMIN_PASSWORD"),
    "event_staff": ("STUDIO_TEST_STAFF_EMAIL", "STUDIO_TEST_STAFF_PASSWORD"),
}
EVENTS = {
    "summit": "5e5e0000-0000-4000-8000-0000000000e1",   # Bendie-only, seeded content
    "tester": "a8f27084-53ad-4779-9379-72d5e820664c",   # Bendie + Planner, created in the UI
}
routes = json.loads((ROOT / "docs/bendie-revamp/data/routes.json").read_text())["pages"]
ORG_ROUTES = [p["route"] for p in routes if p["scope"] in ("organization", "platform-admin")
              and "[" not in p["route"]] + ["/portal/admin/organisations/5e5e0000-0000-4000-8000-000000000001"]
EVENT_SECTIONS = [p["section_key"] for p in routes if p["scope"] == "event"]

def login(page, email, password):
    page.goto(f"{BASE}/auth/login")
    page.fill("#email", email)
    page.fill("#password", password)
    page.click("button[type=submit]")
    page.wait_for_url(re.compile(r".*/portal.*"), timeout=20000)

CONSOLE = []  # filled by one listener per page (see new_page); cleared on each visit

PROD_REFS = ("droaamagpsojkzznywgd", "zghoaawgrmvqdlksuiam")

def _guard(request):
    # Hard stop if the running app talks to a PRODUCTION Supabase project.
    if any(r in request.url for r in PROD_REFS):
        print("ABORT: the running dev server is using PRODUCTION Supabase. Restart it with .env.test.local.")
        os._exit(2)

def new_page(ctx):
    ctx.add_cookies([{"name": "studio_shell", "value": SHELL, "domain": urlparse(BASE).hostname, "path": "/portal"}])  # same path as the app's cookie
    page = ctx.new_page()
    page.on("console", lambda m: CONSOLE.append(m.text[:200]) if m.type == "error" else None)
    page.on("request", _guard)
    return page

def visit(page, role, path, shot_name, results, screenshots=True):
    CONSOLE.clear()
    errors = CONSOLE
    t0 = time.time()
    try:
        resp = page.goto(f"{BASE}{path}", wait_until="networkidle", timeout=30000)
        status = resp.status if resp else None
    except Exception as e:  # timeouts are findings too
        status, errors = "timeout", errors + [str(e)[:200]]
    ms = int((time.time() - t0) * 1000)
    final = page.url.replace(BASE, "")
    h1 = page.locator("h1").first.inner_text(timeout=2000) if page.locator("h1").count() else None
    body = page.locator("body").inner_text(timeout=5000)[:4000] if status != "timeout" else ""
    flags = [f for f, pat in {
        "no_access": r"don.t have access|isn.t available|Unauthori[sz]ed|No access",
        "error_text": r"Something went wrong|Couldn.t load|Failed to|error",
        "empty_state": r"No .{0,40} yet|Nothing here|Get started",
    }.items() if re.search(pat, body, re.I)]
    rec = {"shell": SHELL, "role": role, "path": path, "final_url": final, "redirected": final.split("?")[0] != path,
           "status": status, "load_ms": ms, "h1": h1, "flags": flags, "console_errors": list(errors[:5])}
    if screenshots:
        d = OUT / "screenshots" / role
        d.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(d / f"{shot_name}.jpg"), type="jpeg", quality=55)
        rec["screenshot"] = f"screenshots/{role}/{shot_name}.jpg"
    results.append(rec)
    print(f"{role:12} {str(status):7} {ms:6}ms {path} -> {final} {flags}")

def main():
    results = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for role, (ek, pk) in ROLES.items():
            if not env.get(pk):
                print(f"skip {role}: {pk} empty in .env.test.local")
                continue
            ctx = browser.new_context(viewport={"width": 1440, "height": 900})
            page = new_page(ctx)
            try:
                login(page, env[ek], env[pk])
            except Exception as e:
                results.append({"role": role, "path": "/auth/login", "status": "login_failed", "error": str(e)[:200]})
                print(f"{role}: login failed"); ctx.close(); continue
            full = role == "stawi_admin"   # full screenshot set once; other roles record access only
            for r in ORG_ROUTES:
                visit(page, role, r, r.strip("/").replace("/", "_") or "root", results, screenshots=full)
            for ev_name, ev_id in EVENTS.items():
                for key in EVENT_SECTIONS:
                    visit(page, role, f"/portal/events/{ev_id}/{key}", f"{ev_name}_{key}", results,
                          screenshots=full or key == "dashboard")
            ctx.close()
        # Responsive pass (Stawi admin): key screens at tablet and phone width
        if env.get("STUDIO_TEST_STAWI_PASSWORD"):
            for w, h, tag in [(1024, 768, "w1024"), (768, 1024, "w768"), (390, 844, "w390")]:
                ctx = browser.new_context(viewport={"width": w, "height": h}, has_touch=w < 1024)
                page = new_page(ctx)
                login(page, env["STUDIO_TEST_STAWI_EMAIL"], env["STUDIO_TEST_STAWI_PASSWORD"])
                for path in ["/portal", f"/portal/events/{EVENTS['summit']}/dashboard",
                             f"/portal/events/{EVENTS['summit']}/agenda", f"/portal/events/{EVENTS['tester']}/planner-logistics"]:
                    visit(page, f"responsive_{tag}", path, path.strip("/").replace("/", "_")[-60:], results)
                ctx.close()
        browser.close()
    (OUT / "data").mkdir(parents=True, exist_ok=True)
    (OUT / "data/walkthrough.json").write_text(json.dumps(
        {"generated": time.strftime("%Y-%m-%d"), "base": BASE, "environment": "TEST (synthetic data)", "shell": SHELL,
         "results": results}, indent=2))
    print(f"\n{len(results)} page visits recorded -> docs/bendie-revamp/data/walkthrough.json")

if __name__ == "__main__":
    main()
