from playwright.sync_api import sync_playwright,expect
from urllib.parse import urlsplit
import os,time
base=os.getenv("LEDGER_TEST_URL","http://127.0.0.1:8775")
prod=base.startswith("https")
opts=dict(executable_path=os.getenv("CHROMIUM_PATH"),args=["--no-sandbox"])
if prod:
 proxy=urlsplit(os.environ["https_proxy"])
 opts["proxy"]={"server":proxy.scheme+"://"+proxy.netloc}
with sync_playwright() as p:
 b=p.chromium.launch(**opts)
 ctx=b.new_context(ignore_https_errors=True)
 page=ctx.new_page()
 page.add_init_script("""localStorage.setItem('ledger_local_portfolio_v1',JSON.stringify([{id:'bitcoin',amount:1,buyPrice:100},{id:'ethereum',amount:1,buyPrice:100}]))""")
 prices={"bitcoin":{"usd":120}}
 page.route("**/api/prices?*",lambda r:r.fulfill(json=prices))
 page.goto(base+"/portfolio.html")
 expect(page.locator("#priceStatus")).to_contain_text("Updated")
 expect(page.locator("#priceStatus")).to_contain_text("Fresh quotes for 1 of 2 holdings")
 expect(page.locator("#portfolioValueSub")).to_contain_text("Waiting for 1 of 2")
 expect(page.locator("#pnlValue")).to_have_text("—")
 expect(page.locator("#portfolioValue")).to_have_text("—")
 expect(page.locator("#investedValue")).to_have_text("$200.00")
 prices["ethereum"]={"usd":130}
 page.locator("#refreshBtn").click()
 expect(page.locator("#portfolioValue")).to_have_text("$250.00")
 expect(page.locator("#pnlValue")).to_have_text("$50.00")
 del prices["ethereum"]
 page.locator("#refreshBtn").click()
 expect(page.locator("#portfolioValueSub")).to_have_text("Includes last available prices")
 expect(page.locator("#holdingsBody tr").nth(1)).to_contain_text("(last)")
 p2=ctx.new_page()
 market={"data":[{"symbol":"BTCUSDT","lastPrice":100,"change1h":1,"priceChangePercent":2,"change7d":3,"marketCap":300,"quoteVolume":400}],"updatedAt":time.time()*1000}
 p2.route("**/api/markets?*",lambda r:r.fulfill(json=market))
 p2.goto(base+"/markets.html")
 expect(p2.locator("tr[data-symbol='BTCUSDT']")).to_be_visible()
 market["data"]=[{"symbol":"INVALID","lastPrice":100}]
 p2.locator("#refreshMarkets").click()
 expect(p2.locator("#marketDataStatus")).to_contain_text("last successful snapshot")
 p2.locator("#cryptoSearch").fill("Bitcoin")
 expect(p2.locator("tr[data-symbol='BTCUSDT']")).to_be_visible()
 print("Portfolio and Markets safely handle incomplete or malformed data")
