"""Desktop mouse and real mobile touch input for Long/Short planning drawings."""
import os
import time
from playwright.sync_api import sync_playwright, expect

base=os.getenv("LEDGER_TEST_URL","http://127.0.0.1:8765").rstrip("/")
prod=base.startswith("https://")
def stored(p):
    return p.evaluate('JSON.parse(localStorage.getItem("ledger_chart_drawings_v1") || "{}").BTC || []')
def fixture(r):
    end=int(time.time())//3600*3600
    bars=[dict(time=end-(199-j)*3600,open=100+j%20,high=103+j%20,low=97+j%20,close=101+j%20,volume=j) for j in range(200)]
    r.fulfill(json=dict(candles=bars,source="Position fixture",provider="bitstamp",historyAvailable=False))
def inside(p):
    b=p.locator("#draw").bounding_box()
    return int(b["x"]+b["width"]*.34),int(b["y"]+b["height"]*.48)
def drag(p,x1,y1,x2,y2):
    p.mouse.move(x1,y1);p.mouse.down();p.mouse.move(x2,y2,steps=8);p.mouse.up()

with sync_playwright() as w:
    params=dict(executable_path=os.getenv("CHROMIUM_PATH"),args=["--no-sandbox"])
    if prod and os.getenv("https_proxy"):params["proxy"]={"server":os.environ["https_proxy"]}
    browser=w.chromium.launch(**params)
    for mobile in (False,True):
        p=browser.new_page(viewport={"width":390 if mobile else 1440,"height":844 if mobile else 900},has_touch=mobile,is_mobile=mobile,ignore_https_errors=True)
        errors=[]
        p.on("pageerror",lambda e:errors.append(str(e)))
        p.route("**/api/candles?*",fixture)
        p.route_web_socket("wss://ws.bitstamp.net/",lambda s:None)
        p.goto(base+("/chart" if prod else "/chart.html")+"?symbol=BTC&interval=60",wait_until="domcontentloaded")
        expect(p.locator("#source")).to_contain_text("Position fixture")
        expect(p.locator('script[src*="chart-terminal.js?v=27"]')).to_have_count(1)
        x,y=inside(p)
        input_at=p.touchscreen.tap if mobile else p.mouse.click
        p.get_by_role("button",name="Long position",exact=True).click();input_at(x,y)
        expect(p.locator("#positionOpen")).to_be_visible()
        pos=stored(p)[0]
        a,b,c=(pos[k] for k in "abc")
        assert b["price"]<a["price"]<c["price"] and abs((c["price"]-a["price"])/(a["price"]-b["price"])-2)<1e-6
        assert b["time"]==c["time"]>a["time"]
        if mobile:
            session=p.context.new_cdp_session(p)
            session.send("Input.dispatchTouchEvent",{"type":"touchStart","touchPoints":[{"x":x+15,"y":y+4}]})
            for i in range(1,6):
                session.send("Input.dispatchTouchEvent",{"type":"touchMove","touchPoints":[{"x":x+15+i*4,"y":y+4+i*3}]})
            session.send("Input.dispatchTouchEvent",{"type":"touchEnd","touchPoints":[]})
        else:
            drag(p,x+15,y+4,x+43,y+24)
        moved=stored(p)[0]
        assert moved["a"]!=a,(pos,moved)
        assert abs((moved["a"]["price"]-moved["b"]["price"])-(a["price"]-b["price"]))<1e-6
        assert moved["b"]["time"]-moved["a"]["time"]==b["time"]-a["time"]
        if mobile:p.locator("#positionOpen").click()
        else:p.mouse.dblclick(x+45,y+24)
        expect(p.locator("#positionTitle")).to_have_text("Long position settings")
        p.locator("#positionEntry").fill("110");p.locator("#positionStop").fill("114");p.locator("#positionTarget").fill("120")
        p.get_by_role("button",name="Save position").click()
        expect(p.locator("#positionError")).to_contain_text("Stop < Entry < Target")
        p.locator("#positionStop").fill("106");p.locator("#positionAccount").fill("5000");p.locator("#positionRisk").fill("1")
        expect(p.locator("#positionPreview")).to_have_text("R/R 2.5 · Qty 12.5 units")
        p.get_by_role("button",name="Save position").click()
        assert [stored(p)[0][k]["price"] for k in "abc"]==[110,106,120]
        p.locator("#boxDismiss").click()
        p.get_by_role("button",name="Short position",exact=True).click();input_at(x,y)
        short=stored(p)[1]
        assert short["b"]["price"]>short["a"]["price"]>short["c"]["price"]
        if not mobile:
            # Reward and risk handles are on the left; the shared right edge changes only time.
            # Geometry is deterministic at creation away from chart edges.
            drag(p,x,y+105,x,y+128)
            adjusted=stored(p)[1]
            assert adjusted["a"]==short["a"] and adjusted["b"]==short["b"],(short,adjusted)
            assert adjusted["c"]["price"]<short["c"]["price"],(short,adjusted)
            drag(p,x,y-55,x,y-75)
            with_stop=stored(p)[1]
            assert with_stop["a"]==adjusted["a"] and with_stop["c"]==adjusted["c"]
            assert with_stop["b"]["price"]>adjusted["b"]["price"]

        p.locator("#boxDelete").click();assert len(stored(p))==1
        p.locator("#undo").click();assert len(stored(p))==2
        p.reload(wait_until="domcontentloaded");expect(p.locator("#source")).to_contain_text("Position fixture")
        assert len(stored(p))==2
        assert p.evaluate("document.documentElement.scrollWidth <= innerWidth")
        assert not errors,errors
        p.close()
    print("Long/Short one-tap placement, mouse and touch move, target handles, validation, sizing, delete/undo, and persistence verified")
