"""Check the real archive bytes and month browser with Playwright, locally or on Pages."""
import os
import re
import time
from playwright.sync_api import expect, sync_playwright

base=os.getenv("LEDGER_TEST_URL","http://127.0.0.1:8765").rstrip("/")
zip_path=os.getenv("LEDGER_GOLD_ZIP")
prod=base.startswith("https://")
with sync_playwright() as w:
    args={"executable_path":os.getenv("CHROMIUM_PATH"),"args":["--no-sandbox"]}
    if prod and os.getenv("https_proxy"):
        args["proxy"]={"server":os.environ["https_proxy"]}
    b=w.chromium.launch(**args)
    p=b.new_page(viewport={"width":390,"height":844},has_touch=True,is_mobile=True,ignore_https_errors=True)
    errors=[]
    p.on("pageerror",lambda e:errors.append(str(e)))
    requests=[]
    def fixture(route):
        match=re.fullmatch(r"bytes=(\d+)-(\d+)",route.request.headers.get("range",""))
        assert match
        start,end=map(int,match.groups())
        with open(zip_path,"rb") as f:
            f.seek(start)
            raw=f.read(end-start+1)
        route.fulfill(status=206,body=raw,headers={"content-type":"application/octet-stream","access-control-allow-origin":"*"})
    if zip_path:
        p.route("https://raw.githubusercontent.com/sepaulresearch/**",fixture)
    p.on("request",lambda r:requests.append(r.url))
    for attempt in range(20 if prod else 1):
        p.goto(base+"/chart.html?symbol=XAUUSD&period=1m&check="+str(int(time.time())),wait_until="domcontentloaded",timeout=15000)
        if p.locator('script[src*="chart-terminal.js?v=32"]').count():break
        time.sleep(3)
    else:raise RuntimeError("Expected Ledger release did not appear")
    expect(p.locator("#historyInfo")).to_contain_text("20,000 bars")
    assert not any("gold-index" in url or "multitf.zip" in url for url in requests)
    p.locator("#goldMonthOpen").tap()
    p.locator("#goldHistoryYear").select_option("2021")
    p.locator("#goldHistoryMonth").select_option("01")
    p.get_by_role("button",name="Load month").tap()
    expect(p.locator("#historyInfo")).to_contain_text("2021-01-04",timeout=25000)
    expect(p.locator("#goldMonthOpen")).to_have_text("History: 2021-01")
    assert "month=2021-01" in p.url
    assert p.evaluate("document.documentElement.scrollWidth <= innerWidth")
    p.locator("#shareChart").tap()
    assert "month=2021-01" in p.locator("#shareUrl").input_value()
    p.locator("[data-close=shareDialog]").tap()
    p.locator("#replay").tap()
    p.locator("#replayBegin").tap()
    expect(p.locator("#streamState")).to_have_text("Replay · not live")
    with p.expect_download() as f:p.locator("#benchmarkExport").tap()
    assert f.value.suggested_filename=="XAUUSD-1m-2021-01-replay-Sepaul-Research.csv"
    p.locator("#live").tap()
    expect(p.locator("#streamState")).to_have_text("Historical candles · not live")
    p.locator("#goDate").tap()
    p.locator("#dateInput").fill("2026-10-01")
    p.locator("#dateApply").tap()
    expect(p.locator("#goldMonthOpen")).to_have_text("History: 2026-09",timeout=25000)
    assert "month=2026-09" in p.url
    p.locator("#goDate").tap()
    p.locator("#dateInput").fill("2025-06-15")
    p.locator("#dateApply").tap()
    expect(p.locator("#status")).to_have_text("No Gold candles on 2025-06-15 IST · kept current chart",timeout=25000)
    assert "month=2026-09" in p.url
    p.locator("#goDate").tap()
    p.locator("#dateInput").fill("2025-06-16")
    p.locator("#dateApply").tap()
    expect(p.locator("#goldMonthOpen")).to_have_text("History: 2025-06",timeout=25000)
    assert "month=2025-06" in p.url
    p.reload()
    expect(p.locator("#goldMonthOpen")).to_have_text("History: 2025-06",timeout=25000)
    p.locator("#goldMonthOpen").tap()
    p.locator("#goldRecent").tap()
    expect(p.locator("#historyInfo")).to_contain_text("20,000 bars")
    assert "month=" not in p.url
    assert p.locator("iframe").count()==0
    assert not errors,errors
    print("Mobile Gold history verified: lean default, January 2021, IST month-boundary and closed-day date jumps, persistence, replay export, and return to latest.")
