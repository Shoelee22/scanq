#!/usr/bin/env python3
"""Headless verification for the stationery queue demo pages.

Screenshots (desktop + mobile) + console/page error capture.
Requires: /tmp/shot-venv with playwright, Chrome headless shell at ~/chs-bin.
"""
import os
import subprocess
import time
from playwright.sync_api import sync_playwright

ROOT = os.path.expanduser("~/workspace/stationery-queue")
OUT = os.path.join(ROOT, "qr", "..", "shots")
os.makedirs(OUT, exist_ok=True)
CHS = os.path.expanduser("~/chs-bin/chrome-headless-shell-linux64/chrome-headless-shell")

# Serve over HTTP — ES modules are blocked from file:// by CORS.
srv = subprocess.Popen(["python3", "-m", "http.server", "8123", "--directory", ROOT],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
BASE = "http://127.0.0.1:8123"

errors = []

with open("/tmp/dummy.pdf", "wb") as f:
    f.write(b"%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
            b"2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj\n"
            b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\n"
            b"trailer<</Root 1 0 R>>\n%%EOF")

with sync_playwright() as p:
    b = p.chromium.launch(headless=True, executable_path=CHS,
                          args=["--no-sandbox", "--disable-gpu"])

    def shot(name, url, width=1440, height=900, mobile=False, full=False):
        pg = b.new_page(viewport={"width": width, "height": height}, is_mobile=mobile)
        pg.on("console", lambda m: errors.append(f"[{name}] console.{m.type}: {m.text}") if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(f"[{name}] pageerror: {e}"))
        pg.goto(BASE + "/" + url, wait_until="networkidle")
        pg.wait_for_timeout(2200)
        pg.screenshot(path=os.path.join(OUT, name + ".png"), full_page=full)
        pg.close()
        print("shot", name)

    # 1. customer form
    shot("c-form-desktop", "index.html?demo=1")
    shot("c-form-mobile", "index.html?demo=1", 390, 844, mobile=True, full=True)

    # 2. full demo submit -> token view
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.on("console", lambda m: errors.append(f"[c-submit] console.{m.type}: {m.text}") if m.type == "error" else None)
    pg.on("pageerror", lambda e: errors.append(f"[c-submit] pageerror: {e}"))
    pg.goto(BASE + "/index.html?demo=1", wait_until="networkidle")
    pg.wait_for_timeout(1500)
    pg.fill("#inName", "Aarav Mehta")
    pg.set_input_files("#inFile", "/tmp/dummy.pdf")
    pg.wait_for_timeout(600)
    pg.click("#cpPlus")
    pg.click('#segColor button[data-v="color"]')
    pg.screenshot(path=os.path.join(OUT, "c-form-filled.png"))
    pg.click("#btnSubmit")
    pg.wait_for_selector("#view-token:not([hidden])", timeout=15000)
    pg.wait_for_timeout(800)
    pg.screenshot(path=os.path.join(OUT, "c-token-desktop.png"))
    m2 = b.new_page(viewport={"width": 390, "height": 844}, is_mobile=True)
    m2.goto(BASE + "/index.html?demo=1", wait_until="networkidle")
    m2.wait_for_timeout(1200)
    m2.fill("#inName", "Aarav Mehta")
    m2.set_input_files("#inFile", "/tmp/dummy.pdf")
    m2.click("#btnSubmit")
    m2.wait_for_selector("#view-token:not([hidden])", timeout=15000)
    m2.wait_for_timeout(800)
    m2.screenshot(path=os.path.join(OUT, "c-token-mobile.png"), full_page=True)
    pg.close(); m2.close()
    print("shot c-token-*")

    # 3. admin dashboard (demo bypasses lock)
    shot("a-dash-desktop", "admin.html?demo=1", full=False)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.goto(BASE + "/admin.html?demo=1", wait_until="networkidle")
    pg.wait_for_timeout(2500)
    # click through tabs
    pg.click('.tabs button[data-tab="printing"]')
    pg.wait_for_timeout(400)
    pg.screenshot(path=os.path.join(OUT, "a-tab-printing.png"))
    pg.click('.tabs button[data-tab="done"]')
    pg.wait_for_timeout(400)
    pg.screenshot(path=os.path.join(OUT, "a-tab-done.png"))
    pg.close()

    # 4. counter display board
    shot("a-board-desktop", "admin.html?display=1&demo=1")

    # 5. admin lock screen (real mode, no demo)
    shot("a-lock-desktop", "admin.html", 1440, 900)

    b.close()

print("\n=== ERRORS ===" if errors else "\n=== NO JS ERRORS ===")
for e in errors:
    print(e)
print("done", sorted(os.listdir(OUT)))
srv.terminate()
