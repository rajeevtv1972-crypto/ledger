"""Quote and candle refresh failures are independent, using the production UI with fixtures."""
import os
import time
from datetime import datetime,timezone
from playwright.sync_api import sync_playwright,expect
base=os.getenv("LEDGER_TEST_URL","http://127.0.0.1:8765")
prod=base.startswith("https://")
def iso(t):return datetime.fromtimestamp(t,timezone.utc).isoformat()
with sync_playwright() as w:
    args=dict(executable_path=os.getenv("CHROMIUM_PATH"),args=["--no-sandbox"])
    if prod and os.getenv("https_proxy"):args["proxy"]={"server":os.environ["https_proxy"]}
    b=w.chromium.launch(**args)
    p=b.new_page(viewport={"width":390,"height":844},has_touch=True,is_mobile=True,ignore_https_errors=True)
    now=int(time.time());p.clock.install(time=datetime.fromtimestamp(now,timezone.utc))
    headers={"access-control-allow-origin":"*"}
    polls=[0];q=[0]
    def candles(r):
        polls[0]+=1;i=polls[0];s=now//900*900
        if i==3:r.fulfill(status=503,json={},headers=headers);return
        rows=[dict(openTime=iso(s-j*900),open=3490,high=3520,low=3480,close=3501 if i==1 else 3504,tickVolume=4,isOpen=j==0) for j in range(30)] if i!=2 else []
        r.fulfill(json=dict(symbol="XAUUSD",interval="15m",bars=rows),headers=headers)
    def quote(r):
        q[0]+=1;i=q[0]
        r.fulfill(json=dict(symbol="XAUUSD",mid=3510+i,timestamp=iso(now+(i-1)*10),stale=False,marketState="open"),headers=headers)
    p.route("https://biquote.io/api/XAUUSD/ohlc?*",candles)
    p.route("https://biquote.io/api/XAUUSD",quote)
    p.goto(base+("/chart" if prod else "/chart.html")+"?symbol=XAUUSD&period=feed&interval=15",wait_until="domcontentloaded")
    expect(p.locator("#streamState")).to_have_text("Updating · Gold OHLC",timeout=18000)
    expect(p.locator("#ohlc")).to_contain_text("C 3,501.00")
    for price in ("$3,512.00","$3,513.00"):
        p.clock.fast_forward(11000)
        expect(p.locator("#quote")).to_have_text(price)
        expect(p.locator("#ohlc")).to_contain_text("C 3,501.00")
        expect(p.locator("#streamState")).to_have_text("Quote updating · candles delayed")
        expect(p.locator("#tradeInfo")).to_contain_text("Showing last loaded candles")
        expect(p.locator("#tradeInfo")).to_contain_text("IST")
    p.clock.fast_forward(11000)
    expect(p.locator("#streamState")).to_have_text("Updating · Gold OHLC")
    expect(p.locator("#ohlc")).to_contain_text("C 3,504.00")
    print("Quotes advance during empty and failed candle updates; candles retain and recover")
