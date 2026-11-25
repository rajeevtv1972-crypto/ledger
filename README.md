# Ledger

Static portfolio tracker and charting workspace deployed on Cloudflare Pages. Market data routes live under `functions/api/`.

- `/chart.html` opens Ledger's native crypto chart by default. It uses exchange candle history and same-exchange trade streams, with a REST refresh when the stream goes down. The second crypto chart is REST-refreshed and reports its source and cadence.
- Native charts include drawing and anchor editing, indicators, dated bar replay, local price alerts, screenshots, layouts, and a symbol watchlist. Local alerts only run while the relevant market is open and connected.
- For commodities, forex, stocks, and indices, the existing TradingView embed remains available. **Import CSV** enables native tools on your own historical candles for any selected symbol and timeframe. The import stays in the current tab; it is not a live feed.
- CSV headers: `time,open,high,low,close,volume` (volume optional). Use ISO timestamps or Unix seconds/milliseconds. Timestamps without a timezone are treated as UTC.
- The self-hosted renderer is TradingView Lightweight Charts™ v5.0.8, under Apache 2.0. See `assets/vendor/lightweight-charts-LICENSE.txt`. This is not TradingView Supercharts or a Pine Script runtime.

Run the CSV tests with `node --test`.

For a browser smoke test with deterministic market data, serve this directory with `python -m http.server 8765`, install Python Playwright and Chromium, then run `python tests/chart-smoke.py`. Set `CHROMIUM_PATH` to use a system browser instead of Playwright's.
