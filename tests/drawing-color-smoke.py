"""Verify a touch-first box recolors on the canvas before closing Change color."""
import os
from playwright.sync_api import expect, sync_playwright
base=os.getenv("LEDGER_TEST_URL","http://127.0.0.1:8765")
prod=base.startswith("https://")
with sync_playwright() as w:
    args=dict(executable_path=os.getenv("CHROMIUM_PATH"),args=["--no-sandbox"])
    if prod and os.getenv("https_proxy"):args["proxy"]={"server":os.environ["https_proxy"]}
    browser=w.chromium.launch(**args)
    p=browser.new_page(viewport={"width":390,"height":844},has_touch=True,is_mobile=True,ignore_https_errors=True)
    p.goto(base+("/chart" if prod else "/chart.html")+"?symbol=XAUUSD&period=15m",wait_until="domcontentloaded")
    expect(p.locator('script[src*="chart-terminal.js?v=28"]')).to_have_count(1)
    expect(p.locator("#streamState")).to_have_text("Historical candles · not live",timeout=18000)
    p.locator('[data-tool="rectangle"]').tap()
    r=p.locator("#draw").bounding_box()
    p.touchscreen.tap(r["x"]+65,r["y"]+140);p.touchscreen.tap(r["x"]+235,r["y"]+205)
    p.locator("#drawingColorOpen").tap()
    box=lambda:p.evaluate('JSON.parse(localStorage.getItem("ledger_chart_drawings_v1")).XAUUSD[0]')
    before=box()
    rgb="""() => {
     const c=document.querySelector('#draw'),k=devicePixelRatio;
     return [...c.getContext('2d').getImageData(Math.round(130*k),Math.round(152*k),1,1).data];
    }"""
    body=p.locator("#drawingFillPresets").get_by_role("button",name="Red")
    body.tap()
    expect(body).to_have_attribute("aria-pressed","true")
    p.wait_for_function("("+rgb+")()[0] > 200 && ("+rgb+")()[1] < 100")
    assert box()["fill"]=="#ef4444" and box()["color"]==before["color"]
    p.locator("#drawingColorPresets").get_by_role("button",name="Blue").tap()
    assert box()["color"]=="#3b82f6" and box()["fill"]=="#ef4444"
    expect(p.locator("#drawingColorDialog")).to_be_visible()
    p.get_by_role("button",name="Done").tap()
    p.reload(wait_until="domcontentloaded");expect(p.locator("#streamState")).to_have_text("Historical candles · not live")
    assert box()["fill"]=="#ef4444" and box()["color"]=="#3b82f6"
    print("Touch swatches repaint immediately and independent body/border colors persist")
