"""Slow startup and independent Gold candle/quote requests, without live provider data."""
import os
from datetime import datetime, timezone
from playwright.sync_api import sync_playwright, expect

BASE = os.getenv("LEDGER_TEST_URL", "http://127.0.0.1:8765")
PROD = BASE.startswith("https://")
URL = BASE+("/chart" if PROD else "/chart.html")+"?symbol=XAUUSD&period=feed&interval=1"
CLOCK = datetime.now(timezone.utc).replace(second=0, microsecond=0)
STAMP = CLOCK.isoformat()
CORS = {"access-control-allow-origin": "*"}
BARS = {"symbol":"XAUUSD","interval":"1m","bars":[
    {"openTime":STAMP,"open":3501,"high":3510,"low":3490,"close":3502,"isOpen":True}
]}
QUOTE = {"symbol":"XAUUSD","mid":3503,"timestamp":STAMP,"stale":False,"marketState":"open"}

def new_page(browser, *, hold_module=False):
    page = browser.new_page(ignore_https_errors=True)
    page.clock.install(time=CLOCK)
    held = {"bars":[], "quote":[], "module":[]}
    errors = []
    page.on("pageerror",lambda error: errors.append(str(error)))
    page.route("https://biquote.io/api/XAUUSD/ohlc?*",lambda r:held["bars"].append(r))
    page.route("https://biquote.io/api/XAUUSD",lambda r:held["quote"].append(r))
    if hold_module:
        page.route("**/assets/gold-feed.js?v=2",lambda r:held["module"].append(r))
    page.goto(URL,wait_until="domcontentloaded")
    return page,held,errors

def wait_for_route(page,routes):
    for _ in range(100):
        if routes:
            return routes[0]
        page.wait_for_timeout(100)
    raise AssertionError("Expected provider request to start")

with sync_playwright() as w:
    opts = dict(executable_path=os.getenv("CHROMIUM_PATH"),args=["--no-sandbox"])
    if PROD and os.getenv("https_proxy"):
        opts["proxy"] = {"server":os.environ["https_proxy"]}
    browser = w.chromium.launch(**opts)
    p,held,errors = new_page(browser,hold_module=True)
    module = wait_for_route(p,held["module"])
    p.clock.fast_forward(6000)
    assert not held["bars"] and not held["quote"]
    module.continue_()
    quote = wait_for_route(p,held["quote"])
    bars = wait_for_route(p,held["bars"])
    quote.fulfill(json=QUOTE,headers=CORS)
    expect(p.locator("#quote")).to_have_text("$3,503.00")
    expect(p.locator("#streamState")).to_have_text("Quote updating · loading candles")
    p.clock.fast_forward(9500)
    expect(p.locator("#message")).to_have_text("Loading Gold candles…")
    bars.fulfill(json=BARS,headers=CORS)
    expect(p.locator("#ohlc")).to_contain_text("C 3,502.00")
    expect(p.locator("#streamState")).to_have_text("Updating · Gold OHLC")
    assert not errors,errors
    p.close()

    p,held,errors = new_page(browser)
    bars = wait_for_route(p,held["bars"])
    quote = wait_for_route(p,held["quote"])
    bars.fulfill(json=BARS,headers=CORS)
    expect(p.locator("#ohlc")).to_contain_text("C 3,502.00")
    expect(p.locator("#streamState")).to_have_text("Candles loaded · checking quote")
    assert p.locator("#chart canvas").count()>0
    quote.fulfill(json=QUOTE,headers=CORS)
    expect(p.locator("#quote")).to_have_text("$3,503.00")
    expect(p.locator("#streamState")).to_have_text("Updating · Gold OHLC")
    assert not errors,errors
    p.close()
    browser.close()
    print("Gold request budget excludes startup, and candles and quotes render independently")
