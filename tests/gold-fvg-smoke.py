"""An unfinished Gold candle must not paint a confirmed fair value gap."""
import os
import time
from datetime import datetime, timezone
from playwright.sync_api import expect, sync_playwright

base=os.getenv("LEDGER_TEST_URL","http://127.0.0.1:8765").rstrip("/")
prod=base.startswith("https://")
def iso(t):return datetime.fromtimestamp(t,timezone.utc).isoformat().replace("+00:00","Z")

with sync_playwright() as w:
    args=dict(executable_path=os.getenv("CHROMIUM_PATH"),args=["--no-sandbox"])
    if prod and os.getenv("https_proxy"):args["proxy"]={"server":os.environ["https_proxy"]}
    b=w.chromium.launch(**args)
    for fills in (True,False):
        p=b.new_page(viewport={"width":390,"height":844},has_touch=True,is_mobile=True,ignore_https_errors=True)
        now=int(time.time())
        p.clock.install(time=datetime.fromtimestamp(now,timezone.utc))
        p.add_init_script("""(() => {
          window.fvgPaints=0;
          const original=CanvasRenderingContext2D.prototype.fillRect;
          CanvasRenderingContext2D.prototype.fillRect=function(...args){
            if(this.canvas.id==='draw'&&this.fillStyle==='#25be95'&&this.globalAlpha>0.19&&this.globalAlpha<0.21&&args[3]>0)window.fvgPaints++;
            return original.apply(this,args);
          };
        })()""")
        stage=[0]
        def quote(r):
            r.fulfill(json=dict(symbol="XAUUSD",mid=4010+stage[0],timestamp=iso(now+stage[0]*11),stale=False,marketState="open"),headers={"access-control-allow-origin":"*"})
        def bars(r):
            t=now//900*900
            rows=[dict(openTime=iso(t-1800),open=3990,high=4000,low=3980,close=3995),
                  dict(openTime=iso(t-900),open=4001,high=4010,low=3999,close=4005),
                  dict(openTime=iso(t),open=4005,high=4020,low=3999 if fills and stage[0]>=1 else 4003,close=4010,isOpen=stage[0]<2)]
            r.fulfill(json=dict(symbol="XAUUSD",interval="15m",bars=rows),headers={"access-control-allow-origin":"*"})
        p.route("https://biquote.io/api/XAUUSD",quote)
        p.route("https://biquote.io/api/XAUUSD/ohlc?*",bars)
        p.goto(base+("/chart" if prod else "/chart.html")+"?symbol=XAUUSD&period=feed&interval=15",wait_until="domcontentloaded")
        expect(p.locator("#historyInfo")).to_contain_text("provider bars")
        p.locator("#indOpen").tap()
        p.get_by_text("Fair value gaps (Gold OHLC: closed candles)",exact=True).tap()
        expect(p.locator('[data-ind="fvg"]')).to_be_checked()
        p.locator('[data-close="indicatorDialog"]').tap()
        p.wait_for_timeout(250)
        assert p.evaluate("window.fvgPaints")==0,"Forming gap was painted as confirmed"
        stage[0]=1
        p.clock.fast_forward(11000)
        expect(p.locator("#quote")).to_have_text("$4,011.00")
        p.wait_for_timeout(250)
        assert p.evaluate("window.fvgPaints")==0,"Filled gap should not paint"
        stage[0]=2
        p.clock.fast_forward(11000)
        expect(p.locator("#quote")).to_have_text("$4,012.00")
        if fills:
            p.wait_for_timeout(250)
            assert p.evaluate("window.fvgPaints")==0,"Filled gap was confirmed after close"
        else:
            p.wait_for_function("window.fvgPaints>0")
        p.close()
    print("Gold FVG waits for candle close; the overlay paints the closed gap.")
