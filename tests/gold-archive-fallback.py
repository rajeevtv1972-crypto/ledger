"""Load January 2021 despite a stalled direct archive request.
Set LEDGER_GOLD_JAN_RANGE to pinned ZIP bytes 43–429127 (inclusive).
"""
import os
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

base=os.getenv("LEDGER_TEST_URL","http://127.0.0.1:8765")
prod=base.startswith("https:")
data=Path(os.environ["LEDGER_GOLD_JAN_RANGE"]).read_bytes()
assert len(data)==429085

with sync_playwright() as w:
    opts=dict(executable_path=os.getenv("CHROMIUM_PATH"),args=["--no-sandbox"])
    if prod and os.getenv("https_proxy"):
        opts["proxy"]={"server":os.environ["https_proxy"]}
    browser=w.chromium.launch(**opts)
    page=browser.new_page(viewport={"width":390,"height":844},has_touch=True,is_mobile=True,ignore_https_errors=True)
    page.clock.install()
    held,proxy=[],[]
    page.route("https://raw.githubusercontent.com/sepaulresearch/**",lambda r:held.append(r))
    def range_proxy(r):
        proxy.append(r.request.url)
        assert r.request.headers["range"]=="bytes=43-429127"
        r.fulfill(status=206,body=data,content_type="application/octet-stream")
    page.route("**/api/gold-history-range?*",range_proxy)
    page.goto(base+("/chart" if prod else "/chart.html")+"?symbol=XAUUSD&period=1m",wait_until="domcontentloaded",timeout=40000)
    expect(page.locator("#historyInfo")).to_contain_text("20,000 bars",timeout=20000)
    page.locator("#goldMonthOpen").tap()
    page.locator("#goldHistoryYear").select_option("2021")
    page.locator("#goldHistoryMonth").select_option("01")
    page.get_by_role("button",name="Load month").tap()
    for _ in range(70):
        if held:break
        page.wait_for_timeout(100)
    assert len(held)==1 and not proxy
    page.clock.fast_forward(10500)
    expect(page.locator("#historyInfo")).to_contain_text("2021-01-04",timeout=7000)
    expect(page.locator("#goldMonthOpen")).to_have_text("History: 2021-01")
    assert len(proxy)==1 and "month=2021-01" in page.url
    for route in held:
        try: route.abort()
        except Exception: pass
    browser.close()
    print("Same-origin archive fallback loads and verifies January while the direct range is still waiting.")
