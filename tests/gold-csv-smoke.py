"""Gold's live 1W limit must not block an imported weekly CSV."""
import os
import time
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import expect, sync_playwright

base=os.getenv("LEDGER_TEST_URL","http://127.0.0.1:8765").rstrip("/")
prod=base.startswith("https://")
def iso(t):return datetime.fromtimestamp(t,timezone.utc).isoformat().replace("+00:00","Z")

with sync_playwright() as w:
    launch=dict(executable_path=os.getenv("CHROMIUM_PATH"),args=["--no-sandbox"])
    if prod and os.getenv("https_proxy"):launch["proxy"]={"server":os.environ["https_proxy"]}
    b=w.chromium.launch(**launch)
    p=b.new_page(viewport={"width":390,"height":844},has_touch=True,is_mobile=True,ignore_https_errors=True)
    errors=[]
    p.on("pageerror",lambda e:errors.append(str(e)))
    feeds=[]
    now=int(time.time())

    def quote(r):
        r.fulfill(json=dict(symbol="XAUUSD",mid=3501,timestamp=iso(now),stale=False,marketState="open"),headers={"access-control-allow-origin":"*"})
    def bars(r):
        f=parse_qs(urlparse(r.request.url).query)["interval"][0]
        step={"15m":900,"5m":300}[f]
        feeds.append(f)
        t=now//step*step
        r.fulfill(json={"symbol":"XAUUSD","interval":f,"bars":[dict(openTime=iso(t-i*step),open=3490,high=3510,low=3480,close=3500,tickVolume=12,isOpen=i==0) for i in range(3)]},headers={"access-control-allow-origin":"*"})
    p.route("https://biquote.io/api/XAUUSD",quote)
    p.route("https://biquote.io/api/XAUUSD/ohlc?*",bars)
    required_release=os.getenv("LEDGER_EXPECT_RELEASE")
    for _ in range(20 if prod and required_release else 1):
        p.goto(base+("/chart" if prod else "/chart.html")+"?symbol=XAUUSD&period=feed&interval=15&check="+str(time.time_ns()),wait_until="domcontentloaded")
        if not required_release or p.locator(f'script[src*="chart-terminal.js?v={required_release}"]').count():break
        p.wait_for_timeout(3000)
    else:raise AssertionError("Expected Ledger release did not appear")
    expect(p.locator("#historyInfo")).to_contain_text("provider bars")
    p.locator("#importOpen").tap()
    p.locator("#csvInterval").select_option("10080")
    csv=b"time,open,high,low,close,volume\n2026-11-02,111,114,110,113,5\n2026-11-09,113,116,112,115,6\n2026-11-16,115,118,114,117,7\n"
    p.locator("#csvFile").set_input_files({"name":"gold-weekly.csv","mimeType":"text/csv","buffer":csv})
    p.locator("#csvApply").tap()
    expect(p.locator("#streamState")).to_have_text("CSV · not live")
    expect(p.locator("#pair")).to_have_text("XAUUSD · Imported")
    expect(p.locator("#source")).to_have_text("gold-weekly.csv")
    expect(p.locator("#quote")).to_have_text("$117.00")
    expect(p.locator('[data-i="10080"]')).to_be_visible()
    expect(p.locator('[data-i="10080"]')).to_have_class("active")
    expect(p.locator("#historyInfo")).to_contain_text("3 bars")
    assert feeds==["15m"],feeds

    p.locator("#importOpen").tap()
    p.locator("#csvExit").tap()
    expect(p.locator("#historyInfo")).to_contain_text("provider bars")
    expect(p.locator("#quote")).to_have_text("$3,501.00")
    expect(p.locator('[data-i="15"]')).to_have_class("active")
    expect(p.locator('[data-i="10080"]')).to_be_hidden()
    assert feeds==["15m","15m"],feeds
    p.locator('[data-i="5"]').tap()
    expect(p.locator("#historyInfo")).to_contain_text("provider bars")
    expect(p.locator('[data-i="5"]')).to_have_class("active")
    assert "interval=5" in p.url and feeds==["15m","15m","5m"],(p.url,feeds)
    assert not errors,errors
    print("Mobile weekly Gold CSV shows the file's candles and exits to the normal Gold feed.")
