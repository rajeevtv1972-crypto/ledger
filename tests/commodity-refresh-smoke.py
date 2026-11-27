"""Check current/stale spot quotes, automatic official revisions, and both logo-free panes."""
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

base=os.getenv("LEDGER_TEST_URL","http://127.0.0.1:8765")
prod=base.startswith("https://")
pink=json.loads(Path(__file__).resolve().parent.parent.joinpath("assets/data/pink-sheet-monthly.json").read_text())
with sync_playwright() as w:
    args=dict(executable_path=os.getenv("CHROMIUM_PATH"),args=["--no-sandbox"])
    if prod and os.getenv("https_proxy"):args["proxy"]={"server":os.environ["https_proxy"]}
    b=w.chromium.launch(**args)
    p=b.new_page(viewport={"width":390,"height":844},has_touch=True,is_mobile=True,ignore_https_errors=True)
    errors=[];p.on("pageerror",lambda e:errors.append(str(e)))
    path=base+("/chart" if prod else "/chart.html")
    if not prod:
        now=datetime.now(timezone.utc).replace(microsecond=0)
        p.clock.install(time=now)
        ctr={"silver":0,"oil":0,"monthly":0}
        def spot(r):
            ctr["silver"]+=1;i=ctr["silver"];t=int(now.timestamp())+30*(i-1)
            r.fulfill(json={"quote":dict(t=t,price=30+i) if i<=2 else None})
        def oil(r):
            ctr["oil"]+=1;i=ctr["oil"]
            r.fulfill(json={"points":[[1600000000+j*86400,60 if j<999 else 66+i] for j in range(1000)]})
        def monthly(r):
            ctr["monthly"]+=1
            if ctr["monthly"]==1:r.fulfill(json=pink)
            else:r.fulfill(json={"months":pink["months"]+["2026-11"],"prices":{k:v+[36] for k,v in pink["prices"].items()}})
        p.route("**/api/commodity-spot?symbol=XAGUSD",spot)
        p.route("**/api/commodity-history?symbol=USOIL",oil)
        p.route("**/api/commodity-monthly",monthly)
    p.goto(path+"?symbol=XAGUSD&period=metalspot",wait_until="domcontentloaded")
    expect(p.locator('script[src*="chart-terminal.js?v=35"]')).to_have_count(1)
    expect(p.locator("#streamState")).to_have_text("Indicative · sampled",timeout=18000)
    expect(p.locator("#tradeInfo")).to_contain_text("sampled while this tab is open")
    expect(p.locator("#benchmarkExport")).to_be_hidden()
    expect(p.locator("#chart a[href*='tradingview']")).to_have_count(0)
    expect(p.locator("footer a[href*='tradingview']")).to_have_count(1)
    if not prod:
        expect(p.locator("#quote")).to_have_text("$31.00")
        p.clock.fast_forward(31000)
        expect(p.locator("#quote")).to_have_text("$32.00")
        p.clock.fast_forward(31000)
        expect(p.locator("#streamState")).to_have_text("Older samples · not live")
        expect(p.locator("#quote")).to_have_text("$32.00")
        p.locator('[data-bf="month"]').tap()
        expect(p.locator("#tradeInfo")).to_contain_text("Data through 2026-10")
        p.clock.fast_forward(301000)
        expect(p.locator("#tradeInfo")).to_contain_text("Data through 2026-11")
    else:
        before=p.locator("#tradeInfo").inner_text()
        for _ in range(8):
            p.wait_for_timeout(10000)
            if p.locator("#tradeInfo").inner_text()!=before:break
        else:raise AssertionError("Silver source timestamp did not advance")
        p.goto(path+"?symbol=PLATINUM&period=metalspot",wait_until="domcontentloaded")
        expect(p.locator("#streamState")).to_have_text("Indicative · sampled",timeout=18000)
        expect(p.locator("#pair")).to_have_text("Platinum spot")
    p.goto(path+"?symbol=USOIL&period=day",wait_until="domcontentloaded")
    expect(p.locator("#tradeInfo")).to_contain_text("Checked",timeout=18000)
    if not prod:
        expect(p.locator("#quote")).to_have_text("$67.00")
        p.clock.fast_forward(121000)
        expect(p.locator("#quote")).to_have_text("$68.00")
    assert not errors,errors
    print("Commodity refresh and logo-free chart verified")
