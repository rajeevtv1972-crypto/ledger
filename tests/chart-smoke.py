from playwright.sync_api import sync_playwright, expect
import os
import time
base=os.getenv("LEDGER_TEST_URL","http://127.0.0.1:8765").rstrip("/")
def bars(end,n=230,step=3600,mid=100):
 return [{"time":end-(n-j-1)*step,"open":mid+j%20,"high":mid+j%20+4,"low":mid+j%20-3,"close":mid+j%20+2,"volume":80+j} for j in range(n)]
with sync_playwright() as w:
 b=w.chromium.launch(executable_path=os.getenv("CHROMIUM_PATH"),args=["--no-sandbox"])
 p=b.new_page(viewport={"width":1440,"height":900}); errs=[]
 p.on("pageerror",lambda e:errs.append(str(e)))
 requests=[]
 def fixture(route):
  from urllib.parse import urlparse,parse_qs
  qs=parse_qs(urlparse(route.request.url).query)
  s=qs["symbol"][0]; i=int(qs["interval"][0]); before=int(qs.get("before",["0"])[0]); end=(before-i*60) if before else int(time.time())//(i*60)*(i*60)
  requests.append((s,i,before))
  if s=="FAIL":
   route.fulfill(status=502,json={"error":"Unavailable"}); return
  rows=bars(end,step=i*60,mid=200 if s=="ETH" else 100)
  route.fulfill(json={"candles":rows,"provider":"bitstamp","source":"Fixture exchange","historyAvailable":True,"nextBefore":rows[0]["time"]})
 p.route("**/api/candles?*",fixture)
 p.route("https://s3.tradingview.com/**",lambda route:route.abort())
 def ws(sock): sock.on_message(lambda msg:sock.send('{"event":"trade","channel":"live_trades_btcusd","data":{"price":"175","amount":"1.2","timestamp":"'+str(int(time.time()))+'","id":"test"}}'))
 p.route_web_socket("wss://ws.bitstamp.net/",ws)
 p.goto(base); p.get_by_role("link",name="Open Ledger Chart").click()
 expect(p.locator("#engine")).to_have_value("native")
 expect(p.locator("#source")).to_contain_text("Fixture exchange")
 expect(p.locator("#streamState")).to_contain_text("LIVE")
 expect(p.locator("#quote")).to_have_text("$175.00")
 p.locator("#older").click();expect(p.locator("#historyInfo")).to_contain_text("460 bars")
 p.locator("#indOpen").click();p.locator("[data-ind=rsi]").check();p.locator("[data-close=indicatorDialog]").click()
 p.locator("#replay").click();p.locator("#replayBegin").click();expect(p.locator("#streamState")).to_contain_text("Replay")
 count=p.locator("#historyInfo").inner_text()
 p.locator("#step").click(); assert p.locator("#historyInfo").inner_text()!=count
 p.locator("#live").click()
 p.locator("#layoutOpen").click();p.locator('[data-layout="horizontal"]').click()
 expect(p.locator("#compareTitle")).to_contain_text("ETH · Fixture exchange")
 p.locator("#compareClose").click(); expect(p.locator("#comparePane")).to_be_hidden()
 p.locator("[data-tool=channel]").click()
 area=p.locator("#draw").bounding_box()
 for x,y in [(200,150),(300,175),(250,220)]: p.mouse.click(area["x"]+x,area["y"]+y)
 drawings=lambda: p.evaluate("JSON.parse(localStorage.getItem('ledger_chart_drawings_v1')||'{}').BTC || []")
 assert drawings()[0]["type"]=="channel",drawings()
 first=drawings()[0]["a"]
 p.locator("[data-tool=edit]").click()
 p.mouse.move(area["x"]+200,area["y"]+150);p.mouse.down();p.mouse.move(area["x"]+240,area["y"]+195,steps=5);p.mouse.up()
 assert drawings()[0]["a"]!=first,drawings()
 p.locator("#undo").click();assert drawings()[0]["a"]==first
 p.reload();expect(p.locator("#source")).to_contain_text("Fixture exchange");assert drawings()[0]["a"]==first
 p.goto(base+"/chart.html?symbol=XAUUSD")
 expect(p.locator("body")).to_have_class("advanced-mode")
 p.locator("#importOpen").click()
 end=int(time.time())//3600*3600
 rows=bars(end,n=50)
 csv="time,open,high,low,close,volume\n"+"\n".join(",".join(str(v) for v in a.values()) for a in rows)
 p.locator("#csvFile").set_input_files({"name":"gold.csv","mimeType":"text/csv","buffer":csv.encode()})
 p.locator("#csvApply").click()
 expect(p.locator("#pair")).to_have_text("XAUUSD · Imported")
 expect(p.locator("#streamState")).to_have_text("CSV · not live")
 expect(p.locator("#historyInfo")).to_contain_text("50 bars")
 p.locator("#importOpen").click();p.locator("#csvExit").click()
 expect(p.locator("body")).to_have_class("advanced-mode")
 p.goto(base+"/chart.html?symbol=FAIL");expect(p.locator("#message")).to_contain_text("No Ledger candles")
 assert "advanced-mode" not in (p.locator("body").get_attribute("class") or "")
 assert not errs,errs
 p.set_viewport_size({"width":390,"height":844});p.goto(base+"/chart.html")
 expect(p.locator("#chart canvas").first).to_be_visible()
 assert p.evaluate("document.documentElement.scrollWidth <= innerWidth")
 print("Browser passed: homepage launch, WebSocket, REST history, RSI, replay, native comparison, channel and anchor editing, commodity CSV, outage state, mobile layout.")
