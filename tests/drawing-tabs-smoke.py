import os,time
from pathlib import Path
from urllib.parse import parse_qs,urlparse
from datetime import datetime,timezone
from playwright.sync_api import sync_playwright,expect
base=os.getenv("LEDGER_TEST_URL","http://127.0.0.1:8765").rstrip("/")
prod=base.startswith("https://")
now=int(time.time())
def iso(t):return datetime.fromtimestamp(t,timezone.utc).isoformat().replace("+00:00","Z")
def gold(r):
 f=parse_qs(urlparse(r.request.url).query)["interval"][0];step={"15m":900,"4h":14400}[f];t=now//step*step
 r.fulfill(json={"symbol":"XAUUSD","interval":f,"bars":[dict(openTime=iso(t-i*step),open=3490+i%4,high=3510,low=3480,close=3500,tickVolume=12,isOpen=i==0) for i in range(100)]},headers={"access-control-allow-origin":"*"})
def crypto(r):
 t=now//3600*3600
 r.fulfill(json={"candles":[dict(time=t-(99-i)*3600,open=100+i%7,high=111,low=98,close=106,volume=12) for i in range(100)],"provider":"bitstamp","source":"Fixture","historyAvailable":False})
def initialize(p,s,f):
 url=base+("/chart" if prod else "/chart.html")
 p.goto(url+f"?symbol={s}&interval={f}"+("&period=feed" if s=="XAUUSD" else ""),wait_until="domcontentloaded")
 expect(p.locator("#historyInfo")).to_contain_text("provider bars" if s=="XAUUSD" else "100 bars")
def note(p,text):
 p.bring_to_front()
 p.locator('[data-tool="text"]').click()
 p.locator("#draw").click(position={"x":180,"y":128})
 expect(p.locator("#drawingTextDialog")).to_be_visible()
 p.locator("#drawingText").fill(text)
 p.locator("#drawingText").press("Enter")
 expect(p.locator("#drawingTextDialog")).to_be_hidden()
def persisted(p,key,expected,version=2):
 p.wait_for_function("""([key, names, version]) =>
   JSON.stringify((JSON.parse(localStorage.getItem('ledger_chart_drawings_v'+version)||'{}')[key]||[]).map(x=>x.text))===JSON.stringify(names)
 """,arg=[key,expected,version])

def context(browser):
 c=browser.new_context(viewport={"width":1280,"height":820},ignore_https_errors=True)
 c.route("https://biquote.io/api/XAUUSD",lambda r:r.fulfill(json={"symbol":"XAUUSD","mid":3500,"timestamp":iso(now),"marketState":"open","stale":False},headers={"access-control-allow-origin":"*"}))
 c.route("https://biquote.io/api/XAUUSD/ohlc?*",gold)
 c.route("**/api/candles?*",crypto)
 c.route_web_socket("wss://ws.bitstamp.net/",lambda s:None)
 return c

def show_objects(p):
 p.locator('[data-side="objects"]').click()

def delete_note(p,text):
 row=p.locator("#objects .objectrow").filter(has_text=text)
 row.locator('button[title="Delete drawing"]').click()

with sync_playwright() as w:
 args=dict(executable_path=os.getenv("CHROMIUM_PATH"),args=["--no-sandbox"])
 if prod and os.getenv("https_proxy"):args["proxy"]={"server":os.environ["https_proxy"]}
 b=w.chromium.launch(**args)
 c=context(b);a,z=c.new_page(),c.new_page()
 initialize(a,"XAUUSD",240);initialize(z,"BTC",60)
 note(a,"Gold four-hour note")
 note(z,"BTC note")
 persisted(z,"XAUUSD",["Gold four-hour note"]);persisted(a,"BTC",["BTC note"])
 z.reload(wait_until="domcontentloaded");persisted(z,"XAUUSD",["Gold four-hour note"]);persisted(z,"BTC",["BTC note"])
 c.close()

 c=context(b);a,z=c.new_page(),c.new_page()
 initialize(a,"XAUUSD",240);initialize(z,"XAUUSD",15)
 # Hold the real production lock until both tabs have queued changes from the same baseline.
 a.evaluate("() => new Promise(ready => {navigator.locks.request('ledger_chart_drawings_v2',() => new Promise(done => {window.releaseDrawingLock=done;ready()}))})")
 note(a,"Gold A");note(z,"Gold B")
 a.evaluate("window.releaseDrawingLock()")
 persisted(z,"XAUUSD",["Gold A","Gold B"])
 show_objects(a);show_objects(z)
 expect(a.locator("#objects")).to_contain_text("Gold B")
 z.locator('#objects button[aria-label="Edit text Gold A"]').click()
 z.locator("#drawingText").fill("Stale edit")
 delete_note(a,"Gold A");persisted(a,"XAUUSD",["Gold B"])
 z.locator("#drawingText").press("Enter")
 expect(z.locator("#status")).to_contain_text("Drawings changed in another tab")
 persisted(z,"XAUUSD",["Gold B"])
 z.locator("#undo").click();persisted(z,"XAUUSD",["Gold B"])
 a.locator("#undo").click();persisted(a,"XAUUSD",["Gold A","Gold B"])
 a.locator("#redo").click();persisted(z,"XAUUSD",["Gold B"])
 c.close()

 prior=os.getenv("LEDGER_PREVIOUS_CHART_JS")
 if prior:
  c=context(b);old,new=c.new_page(),c.new_page()
  script=Path(prior).read_bytes()
  old.route("**/assets/chart-terminal.js?*",lambda r:r.fulfill(body=script,content_type="application/javascript"))
  initialize(old,"XAUUSD",240);note(old,"Legacy drawing");persisted(old,"XAUUSD",["Legacy drawing"],version=1)
  initialize(new,"XAUUSD",15);persisted(new,"XAUUSD",["Legacy drawing"])
  note(new,"New drawing");persisted(new,"XAUUSD",["Legacy drawing","New drawing"])
  note(old,"Late legacy drawing");persisted(old,"XAUUSD",["Legacy drawing","Late legacy drawing"],version=1)
  new.reload(wait_until="domcontentloaded");persisted(new,"XAUUSD",["Legacy drawing","New drawing"])
  expect(new.locator("#historyInfo")).to_contain_text("provider bars");show_objects(new)
  delete_note(new,"Legacy drawing");persisted(new,"XAUUSD",["New drawing"])
  new.reload(wait_until="domcontentloaded");persisted(new,"XAUUSD",["New drawing"])
  c.close()
 print("Drawing saves survived cross-market, simultaneous same-market, stale edit, Undo/Redo, and mixed-release cases." if prior else "Drawing saves survived cross-market, simultaneous same-market, stale edit, and Undo/Redo cases.")
