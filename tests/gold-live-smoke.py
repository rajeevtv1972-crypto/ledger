"""Check touch controls and quote refresh without waiting a minute in the local fixture."""
from datetime import datetime, timezone
import os
import time
from playwright.sync_api import expect, sync_playwright

base=os.getenv("LEDGER_TEST_URL","http://127.0.0.1:8765").rstrip("/")
prod=base.startswith("https://")
with sync_playwright() as w:
    args={"executable_path":os.getenv("CHROMIUM_PATH"),"args":["--no-sandbox"]}
    if prod and os.getenv("https_proxy"):
        args["proxy"]={"server":os.environ["https_proxy"]}
    browser=w.chromium.launch(**args)
    p=browser.new_page(viewport={"width":390,"height":844},has_touch=True,is_mobile=True,ignore_https_errors=True)
    calls=[]
    issues=[]
    p.on("pageerror",lambda e:issues.append(str(e)))
    if prod:
        p.on("response",lambda r:calls.append((r.status,r.json())) if r.url.endswith("/api/gold-spot") else None)
    if not prod:
        now=int(time.time())//900*900+400
        p.clock.install(time=datetime.fromtimestamp(now, timezone.utc))
        samples=[{"t":now-40-i*300,"p":3005+i%7} for i in range(25)]
        p.route("**/api/gold-intraday",lambda r:r.fulfill(json={"symbol":"xau","currency":"USD","unit":"troy_oz","interval_seconds":300,"points":samples}))
        def quote(r):
            calls.append(1)
            i=len(calls)
            r.fulfill(json={"quote":{"t":now+(i-1)*60,"p":3100+i} if i<=2 else None})
        p.route("**/api/gold-spot",quote)
    p.goto(base+"/chart?symbol=XAUUSD&period=live-15m&style=candles" if prod else base+"/chart.html?symbol=XAUUSD&period=live-15m&style=candles",wait_until="domcontentloaded")
    expect(p.locator("#pair")).to_contain_text("Sampled Gold")
    expect(p.locator("#historyInfo")).to_contain_text("sampled bars",timeout=18000)
    expect(p.locator("#streamState")).to_have_text("Updating · sampled spot")
    expect(p.locator("#tradeInfo")).to_contain_text("not broker OHLC")
    expect(p.locator("#benchmarkExport")).to_be_hidden()
    expect(p.locator("#replay")).to_be_disabled()
    assert p.locator("#chart canvas").count()>0
    assert p.evaluate("document.documentElement.scrollWidth <= innerWidth")
    if not prod:
        expect(p.locator("#quote")).to_have_text("$3,101.00")
        p.locator("#refresh").tap()
        assert len(calls)==1
        p.clock.fast_forward(61000)
        expect(p.locator("#quote")).to_have_text("$3,102.00")
        p.clock.fast_forward(61000)
        expect(p.locator("#streamState")).to_have_text("No fresh spot quote")
        expect(p.locator("#quote")).to_have_text("$3,102.00")
    else:
        before=p.locator("#tradeInfo").inner_text()
        for _ in range(15):
            if p.locator("#tradeInfo").inner_text()!=before:break
            p.wait_for_timeout(10000)
        else:raise AssertionError(("Production quote timestamp did not advance",before,p.locator("#streamState").inner_text(),calls,p.evaluate("document.visibilityState")))
    p.locator('[data-bf="15m"]').tap()
    expect(p.locator("#streamState")).to_have_text("Historical candles · not live")
    expect(p.locator("#benchmarkExport")).to_be_visible()
    assert not issues,issues
    print("Gold quote refreshed, mobile candles rendered, and historical candles stayed separate")
