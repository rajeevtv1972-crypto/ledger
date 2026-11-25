"""Broker-feed chart integration: production endpoint or deterministic fixture, offline fallback, and native modes."""
import os
import time
from urllib.parse import urlparse,parse_qs
from datetime import datetime,timezone
from playwright.sync_api import expect,sync_playwright
base=os.getenv("LEDGER_TEST_URL","http://127.0.0.1:8765")
prod=base.startswith("https://")
def iso(t):return datetime.fromtimestamp(t,timezone.utc).isoformat().replace("+00:00","Z")
steps={"1m":60,"15m":900,"4h":14400}
with sync_playwright() as w:
    launch=dict(executable_path=os.getenv("CHROMIUM_PATH"),args=["--no-sandbox"])
    if prod and os.getenv("https_proxy"):launch["proxy"]={"server":os.environ["https_proxy"]}
    b=w.chromium.launch(**launch)
    p=b.new_page(viewport={"width":390,"height":844},has_touch=True,is_mobile=True,ignore_https_errors=True)
    issues=[];p.on("pageerror",lambda e:issues.append(str(e)))
    if not prod:
        now=int(time.time())
        p.clock.install(time=datetime.fromtimestamp(now,timezone.utc))
        tick=[0]
        def quote(r):
            tick[0]+=1
            t=now+(tick[0]-1)*10
            r.fulfill(json=dict(symbol="XAUUSD",mid=3500+tick[0],timestamp=iso(t),stale=False,marketState="closed" if tick[0]==3 else "open"),headers={"access-control-allow-origin":"*"})
        def bars(r):
            f=parse_qs(urlparse(r.request.url).query)["interval"][0];step=steps[f]
            t=now//step*step
            r.fulfill(json={"symbol":"XAUUSD","interval":f,"bars":[dict(openTime=iso(t-i*step),open=3490,high=3510,low=3480,close=3500,tickVolume=12,isOpen=i==0) for i in range(70)]},headers={"access-control-allow-origin":"*"})
        p.route("https://biquote.io/api/XAUUSD",quote)
        p.route("https://biquote.io/api/XAUUSD/ohlc?*",bars)
    p.goto(base+("/chart" if prod else "/chart.html")+"?symbol=XAUUSD&period=feed&interval=15",wait_until="domcontentloaded")
    expect(p.locator('script[src*="chart-terminal.js?v=31"]')).to_have_count(1)
    expect(p.locator("#historyInfo")).to_contain_text("provider bars",timeout=22000)
    expect(p.locator("#benchmarkCredit")).to_have_text("biquote ↗")
    expect(p.locator("#tradeInfo")).to_contain_text("IST")
    expect(p.locator("#benchmarkExport")).to_be_hidden()
    expect(p.locator("#csvExport")).to_be_hidden()
    expect(p.locator("#streamState")).to_have_text("Updating · Gold OHLC")
    assert p.locator("#chart canvas").count()>0
    if not prod:
        expect(p.locator("#quote")).to_have_text("$3,501.00")
        p.clock.fast_forward(11000)
        expect(p.locator("#quote")).to_have_text("$3,502.00")
        p.clock.fast_forward(11000)
        expect(p.locator("#streamState")).to_have_text("Market closed · last candle")
    else:
        previous=p.locator("#tradeInfo").inner_text()
        for _ in range(7):
            p.wait_for_timeout(5000)
            if p.locator("#tradeInfo").inner_text()!=previous:break
        else:raise AssertionError("Quote timestamp did not update on the production chart")
    for frame in ("1","240"):
        p.locator(f'[data-i="{frame}"]').tap()
        expect(p.locator(f'[data-i="{frame}"]')).to_have_class("active")
        expect(p.locator("#historyInfo")).to_contain_text("provider bars",timeout=20000)
        assert "interval="+frame in p.url
    p.locator('[data-bf="archive"]').tap()
    expect(p.locator("#streamState")).to_have_text("Historical candles · not live")
    assert not issues,issues
    assert p.evaluate("document.documentElement.scrollWidth <= innerWidth")
    print("Native Gold OHLC loaded, refreshed, switched 1m and 4h, and kept the archive separate")
