# Ledger

Static portfolio tracker and charting workspace deployed on Cloudflare Pages. Market data routes live under `functions/api/`.

- `/chart.html` opens Ledger's native crypto chart by default. It uses exchange candle history and same-exchange trade streams, with a REST refresh when the stream goes down. The second crypto chart is REST-refreshed and reports its source and cadence.
- Native charts include drawing and anchor editing, indicators, dated bar replay, local price alerts, screenshots, layouts, and a symbol watchlist. Local alerts only run while the relevant market is open and connected.
- For commodity benchmarks, the Ledger workspace uses public benchmark history described below. Exchange futures, forex, stocks, and indices without a built-in feed can be opened with imported OHLCV data. **Import CSV** enables native tools on your own historical candles for any selected symbol and timeframe. The import stays in the current tab; it is not a live feed.
- CSV headers: `time,open,high,low,close,volume` (volume optional). Use ISO timestamps or Unix seconds/milliseconds. Timestamps without a timezone are treated as UTC.
- The self-hosted renderer is TradingView Lightweight Charts™ v5.0.8, under Apache 2.0. See `assets/vendor/lightweight-charts-LICENSE.txt`. This is not TradingView Supercharts or a Pine Script runtime.

Run the CSV tests with `node --test`.

For a browser smoke test with deterministic market data, serve this directory with `python -m http.server 8765`, install Python Playwright and Chromium, then run `python tests/chart-smoke.py`. Set `CHROMIUM_PATH` to use a system browser instead of Playwright's.

## Commodity history

The Ledger workspace loads **all published observations** from the configured series, not an arbitrary recent window. Daily WTI, Brent and Henry Hub data come from the U.S. EIA via FRED (a dated bundled copy is used when the endpoint is unavailable). Weekly values average the available daily observations. The monthly World Bank Pink Sheet snapshot contains commodity benchmarks for 15 instruments with coverage beginning as far back as January 1960. Annual views average the published monthly observations and may show a partial current year. See the data-through date in the chart. The bundled monthly snapshot is used only when the upstream feed fails.

These are price observations, not live quotes, OHLCV bars, or exchange futures. Some Pink Sheet series change definition over time. In particular, early values in its historical Brent column predate the modern Brent spot series. Use the EIA daily series for a consistent modern Brent spot reference. No synthetic bars or volume are presented. Exchange futures (including gold futures, wheat futures, and soybeans futures) remain separate from their published benchmarks.

Sources: [U.S. EIA reuse policy](https://www.eia.gov/about/copyrights_reuse.php); EIA series via FRED: [WTI](https://fred.stlouisfed.org/series/DCOILWTICO), [Brent](https://fred.stlouisfed.org/series/DCOILBRENTEU), [Henry Hub](https://fred.stlouisfed.org/series/DHHNGSP). Fallback downloaded November 25, 2026. World Bank, [Commodity Markets (Pink Sheet)](https://www.worldbank.org/en/research/commodity-markets), November 3, 2026 release, [CC BY 4.0](https://datacatalog.worldbank.org/search/dataset/0038238/commodity-prices-history-and-projections). Transformed to chart series. To refresh the snapshot, download the current monthly XLSX and run `python scripts/update-pink-sheet.py FILE.xlsx` (requires openpyxl). To refresh the EIA fallbacks, download the three FRED CSV files and run `node scripts/update-eia-history.js DIRECTORY`.

The chart toolbar’s star adds the current market to Favorites, including commodities. Search (Ctrl/⌘+K) also lists recently opened markets and supports arrow keys and Enter. The browser remembers the split layout; Share generates a link to chart settings and markets only, excluding local or imported data.

Ledger checks the latest World Bank workbook on load and through Refresh. A chart left open checks for a new publication periodically; if the publisher is unavailable, Ledger labels the saved fallback. These are published benchmarks, not intraday prices; Gold’s separate Spot quotes view shows indicative samples, not tradable quotes or exchange candles.

Tap or click a box to select it, then use Edit text, Move / resize, or Delete above the chart. Drag any corner to resize in move mode. Undo restores a deleted box. Hold Shift while placing a line endpoint to snap it horizontal or vertical.

Gold (XAU/USD) opens in 15m mode by default. Ledger uses the [XAUS public Gold spot sampler](https://xaus.com/api/) for the separate Spot quotes line, with up to 48 hours of available history. It checks at five-minute intervals, labels stale samples, and does not infer candles, gaps, or trading volume. Longer 1M and 1Y views keep the World Bank benchmark; broker-supplied XAU/USD candles can be imported via CSV. No embed is used.

### Gold 1-minute historical candles

The built-in XAU/USD 1m chart and its CSV download contain a 20,000-row
historical subset (2026-09-11 through 2026-10-01 UTC) from **Mikael Bradford
S. R. Sepaul / Sepaul Research**, [Empirical Market Datasets v1.0.0](https://github.com/sepaulresearch/market-datasets),
licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Ledger
selected the most recent rows from the source archive's `xauusd_m1.csv`,
omitted spread and real-volume columns, and gzip-compressed the CSV. OHLC
and tick counts are unchanged. This is a broker spot Gold CFD historical
archive, not a live feed, and volumes are broker tick counts rather than
exchange totals. The indicative Spot quotes view remains separate.

### Chart workspace

Use **Panel** to switch among Watchlist, Objects, Alerts, and the Data window.
The Data window follows the crosshair; clicking or tapping a candle pins its
values when the crosshair leaves. **Replay → Pick on chart** starts on a candle
from the loaded series. The replay bar supports next-bar stepping, play/pause,
speed changes, and exiting to the active source. Exporting candles during
replay exports only the currently revealed bars.

**Layout → Saved workspaces** stores named symbol, timeframe, chart style,
layout, comparison and indicator presets on this browser. It does not
copy drawings, local CSV files or alerts. **Keep drawing** repeats the
selected tool; **Lock drawing positions** protects anchors while still
allowing a selected drawing's text or color to be edited or the drawing
deleted. Hold Shift to snap straight-line tools horizontally or vertically.

Ledger uses the TradingView Supercharts workflow as a reference, not its
embedded product. Pine Script, broker execution and cloud alerts are not
implemented. Source availability, coverage and licensing vary by market;
a historical Gold CSV is not a live feed.

**Browse older Gold minute candles:** choose **1m → Gold history**, or use
**Date** to jump to an older candle. The archive has 2,032,041 source candles
from 2021-01-03 23:05 UTC through 2026-10-01 14:56 UTC. The latest snapshot
still opens without an external request. Older views load one month at a
time using a byte range of the original, pinned CC BY 4.0 ZIP. Ledger verifies
each decompressed month with SHA-256, omits the source spread and real-volume
columns, and preserves OHLC and tick counts. The archive is historical and
separate from XAUS indicative prices. ZIP source attribution: **Mikael Bradford
S. R. Sepaul / Sepaul Research**, Empirical Market Datasets v1.0.0.

To regenerate indexes, download the exact pinned ZIP whose SHA-256 is recorded
in `scripts/build-gold-index.py`. Run `python scripts/build-gold-index.py ZIP`
with a C compiler and zlib development headers. Verify all archive months
with `LEDGER_GOLD_ZIP=ZIP node --test tests/gold-archive.test.js`.

### Market history coverage

- Gold opens as a 15-minute candle chart. The 1m, 5m, 15m, 30m, 1h and
  4h intervals are historical OHLC from the Sepaul archive or exact
  aggregates of its observed minute candles; the latest view initially
  loads the saved 20,000 minute bars. The 1D/1W candle views cover the full
  archive, with UTC day/Monday-week buckets. **Spot quotes** is a separate
  recent indicative XAUS line. World Bank 1M/1Y benchmarks are still
  reference observations, not candles.
- Forex offers 11 pairs based on [ECB reference rates](https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html),
  from the first available publication for each pair, generally 1999.
  EUR-base daily rates reproduce published values. Other pairs are ratios
  of same-date EUR-base observations, calculated by Ledger. Weekly,
  monthly and yearly averages are also Ledger calculations, not official
  trade prices. The snapshot is backed by the ECB’s 90-day update endpoint.
- **Date** opens an on-demand historical window on supported paginated
  crypto feeds. **Latest** returns from that window to the newest bars
  and resumes normal updates. The feed can still return no candles near
  the requested date. The page limits how many bars it keeps loaded at once.
- The Markets page links directly to all available benchmark charts.
  Stocks, indices and unlicensed futures still need an OHLCV CSV.

### Current Gold spot samples

Gold opens in **Live sampled**, a separate 15-minute chart built from XAUS indicative XAU/USD observations. It starts with up to 48 hours of 5-minute samples, then checks the source about every 60 seconds while the tab is visible. Counts refer to observations, not volume. Missing or single-sample periods are not filled. Its extremes are sampled highs/lows, not broker OHLC or executable prices. The archive, benchmark, and spot line remain separate. This feed has no alerts or CSV export.

### Long / Short position drawings

Pick **Long position** or **Short position** and click the entry once. Ledger starts with a 2:1 reward-to-risk ratio. Drag the selected zone to move it, the top/bottom level handles to change take profit or stop loss, and the right entry handle to extend its duration. Use **Position settings** (or double-click the drawing on a desktop) for exact prices and an optional risk-based estimate in base units. These are planning drawings, not orders; the estimate doesn't model leverage, fees or broker lots.
