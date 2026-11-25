"""A new Gold timeframe must supersede, not wait for, an in-flight request."""
import os
import time
from datetime import datetime,timezone
from urllib.parse import urlparse,parse_qs
from playwright.sync_api import expect,sync_playwright

base=os.getenv("LEDGER_TEST_URL","http://127.0.0.1:8765")
prod=base.startswith("https://")
with sync_playwright() as w:
    args=dict(executable_path=os.getenv("CHROMIUM_PATH"),args=["--no-sandbox"])
    if prod and os.getenv("https_proxy"):args["proxy"]={"server":os.environ["https_proxy"]}
    b=w.chromium.launch(**args)
    p=b.new_page(viewport={"width":390,"height":844},has_touch=True,is_mobile=True,ignore_https_errors=True)
    headers={"access-control-allow-origin":"*"}
    observed=[]
    now=int(time.time())
    def iso(t):return datetime.fromtimestamp(t,timezone.utc).isoformat()
    def response(r,f):
        step={"15m":900,"4h":14400}[f]
        last=now//step*step
        c=3500 if f=="4h" else 15
        r.fulfill(json={"symbol":"XAUUSD","interval":f,"bars":[dict(openTime=iso(last-i*step),open=c,high=c+1,low=c-1,close=c,tickVolume=2,isOpen=i==0) for i in range(12)]},headers=headers)
    hanging=[]
    def bars(r):
        f=parse_qs(urlparse(r.request.url).query)["interval"][0]
        observed.append(f)
        if f=="15m":
            hanging.append(r)
            return
        response(r,f)
    p.route("https://biquote.io/api/XAUUSD/ohlc?*",bars)
    p.route("https://biquote.io/api/XAUUSD",lambda r:r.fulfill(json={"symbol":"XAUUSD","mid":3500,"timestamp":iso(now),"stale":False,"marketState":"open"},headers=headers))
    p.goto(base+("/chart" if prod else "/chart.html")+"?symbol=XAUUSD&period=feed&interval=15",wait_until="domcontentloaded")
    expect(p.locator("#message")).to_have_text("Loading Gold candles…",timeout=15000)
    for _ in range(30):
        if hanging:break
        p.wait_for_timeout(100)
    assert hanging,"15m did not start"
    p.locator('[data-i="240"]').tap()
    expect(p.locator("#ohlc")).to_contain_text("C 3,500.00",timeout=2500)
    try:response(hanging[0],"15m")
    except Exception:pass # An aborted navigation or request may have already destroyed the route.
    p.wait_for_timeout(150)
    expect(p.locator('[data-i="240"]')).to_have_class("active")
    expect(p.locator("#ohlc")).to_contain_text("C 3,500.00")
    assert "interval=240" in p.url and observed[:2]==["15m","4h"],(p.url,observed)
    p.locator("#replay").tap()
    p.locator("#replayBegin").tap()
    expect(p.locator("#streamState")).to_contain_text("Replay")
    p.locator("#live").tap()
    expect(p.locator("#streamState")).to_have_text("Updating · Gold OHLC",timeout=2500)
    print("Gold timeframe switches cancel stale requests; replay returns to updating status")
