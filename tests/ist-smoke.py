"""IST display and replay parsing ignore both browser zone and saved legacy zone."""
import os
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright, expect
base=os.getenv("LEDGER_TEST_URL","http://127.0.0.1:8765")
prod=base.startswith("https://")
with sync_playwright() as w:
    args=dict(executable_path=os.getenv("CHROMIUM_PATH"),args=["--no-sandbox"])
    if prod and os.getenv("https_proxy"):args["proxy"]={"server":os.environ["https_proxy"]}
    b=w.chromium.launch(**args)
    p=b.new_page(viewport={"width":1280,"height":850},timezone_id="America/Los_Angeles",ignore_https_errors=True)
    p.add_init_script("""localStorage.setItem("ledger_chart_settings_v2",JSON.stringify({zone:"Europe/London"}))""")
    t=int(datetime(2026,11,24,18,30,tzinfo=timezone.utc).timestamp())
    candles=[dict(time=t+i*1800,open=100+i,high=103+i,low=99+i,close=101+i,volume=1) for i in range(10)]
    p.route("**/api/candles?*",lambda r:r.fulfill(json=dict(candles=candles,provider="bitstamp",source="IST fixture",historyAvailable=False)))
    p.route_web_socket("wss://ws.bitstamp.net/",lambda s:None)
    p.goto(base+("/chart" if prod else "/chart.html")+"?symbol=BTC&interval=30",wait_until="domcontentloaded")
    expect(p.locator("#chartZone")).to_have_text("IST")
    expect(p.locator("#source")).to_contain_text("IST fixture")
    p.locator("#settingsOpen").click()
    expect(p.get_by_role("textbox",name="Fixed India time zone")).to_have_value("India (IST, UTC+05:30)")
    expect(p.locator("#zoneChoice")).to_have_count(0)
    p.locator("button[data-close=settingsDialog]").first.click()
    p.locator("#replay").click()
    expect(p.locator("#replayStart")).to_have_value("2026-11-25T00:00")
    p.locator("#replayStart").fill("2026-11-25T00:30")
    p.locator("#replayBegin").click()
    expect(p.locator("#replayProgress")).to_have_text("25 Nov 2026, 00:30 IST")
    expect(p.locator("#ohlc")).to_contain_text("C 102.00")
    p.locator('[data-side="data"]').click()
    expect(p.locator("#dataTime")).to_have_text("BTC · 25 Nov 2026, 00:30 IST")
    print("IST replay and data labels verified across midnight with non-India browser settings")
