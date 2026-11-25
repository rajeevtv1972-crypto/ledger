"""Change a selected rectangle with taps and direct mouse/touch drags."""
import os
from playwright.sync_api import expect, sync_playwright
base=os.getenv("LEDGER_TEST_URL","http://127.0.0.1:8765")
prod=base.startswith("https://")
with sync_playwright() as w:
    args=dict(executable_path=os.getenv("CHROMIUM_PATH"),args=["--no-sandbox"])
    if prod and os.getenv("https_proxy"):args["proxy"]={"server":os.environ["https_proxy"]}
    b=w.chromium.launch(**args)
    for touch in (True,False):
        p=b.new_page(viewport={"width":390 if touch else 1280,"height":844},has_touch=touch,is_mobile=touch,ignore_https_errors=True)
        p.goto(base+("/chart" if prod else "/chart.html")+"?symbol=XAUUSD&period=15m",wait_until="domcontentloaded")
        expect(p.locator('script[src*="chart-terminal.js?v=28"]')).to_have_count(1)
        expect(p.locator("#streamState")).to_have_text("Historical candles · not live",timeout=18000)
        p.locator('[data-tool="rectangle"]').click()
        r=p.locator("#draw").bounding_box()
        x,y=round(r["x"]),round(r["y"])
        tap=p.touchscreen.tap if touch else p.mouse.click
        tap(x+66,y+140);tap(x+228,y+208)
        p.locator("#boxDismiss").click()
        tap(x+145,y+165)
        expect(p.locator("#boxActions")).to_be_visible()
        expect(p.locator('[data-tool="cursor"]')).to_have_class("active")
        box=lambda:p.evaluate('JSON.parse(localStorage.getItem("ledger_chart_drawings_v1")).XAUUSD[0]')
        old=box()
        tap(x+228,y+208)
        tap(x+260,y+241)
        expanded=box()
        assert expanded["a"]==old["a"] and expanded["b"]["time"]>old["b"]["time"] and expanded["b"]["price"]<old["b"]["price"],(old,expanded)
        if touch:
            session=p.context.new_cdp_session(p)
            session.send("Input.dispatchTouchEvent",{"type":"touchStart","touchPoints":[{"x":x+67,"y":y+140}]})
            for i in range(1,6):
                session.send("Input.dispatchTouchEvent",{"type":"touchMove","touchPoints":[{"x":x+67+i*4,"y":y+140+i*4}]})
            session.send("Input.dispatchTouchEvent",{"type":"touchEnd","touchPoints":[]})
        else:
            p.mouse.move(x+67,y+140);p.mouse.down();p.mouse.move(x+87,y+160,steps=5);p.mouse.up()
        assert box()["a"]!=expanded["a"] and box()["b"]==expanded["b"]
        p.locator("#undo").click()
        assert box()==expanded
        p.close()
    print("Box resizing verified by tap-tap and handle drag on mobile and desktop")
