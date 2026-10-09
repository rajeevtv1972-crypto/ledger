const SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "BNBUSDT", "XRPUSDT", "SOLUSDT",
  "DOGEUSDT", "ADAUSDT", "TRXUSDT", "LINKUSDT", "AVAXUSDT",
  "SHIBUSDT", "DOTUSDT", "LTCUSDT", "BCHUSDT", "UNIUSDT",
  "NEARUSDT", "APTUSDT", "SUIUSDT", "PEPEUSDT", "ETCUSDT"
];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate",
      "x-content-type-options": "nosniff"
    }
  });
}

export async function onRequestGet() {
  try {
    const url = new URL("https://data-api.binance.vision/api/v3/ticker/24hr");
    url.searchParams.set("symbols", JSON.stringify(SYMBOLS));

    const upstream = await fetch(url.toString(), {
      headers: { accept: "application/json" },
      cf: { cacheTtl: 0, cacheEverything: false }
    });

    if (!upstream.ok) {
      return json({
        error: "Binance market data is temporarily unavailable.",
        upstreamStatus: upstream.status
      }, 502);
    }

    const rows = await upstream.json();
    if (!Array.isArray(rows)) {
      return json({ error: "Unexpected response from Binance market data." }, 502);
    }

    const allowed = new Set(SYMBOLS);
    const data = rows
      .filter(row => allowed.has(row.symbol))
      .map(row => ({
        symbol: row.symbol,
        lastPrice: Number(row.lastPrice),
        priceChangePercent: Number(row.priceChangePercent),
        priceChange: Number(row.priceChange),
        highPrice: Number(row.highPrice),
        lowPrice: Number(row.lowPrice),
        quoteVolume: Number(row.quoteVolume),
        openPrice: Number(row.openPrice)
      }))
      .filter(row => Number.isFinite(row.lastPrice));

    return json({ source: "Binance Spot", updatedAt: Date.now(), data });
  } catch (error) {
    console.error("Ledger markets API error:", error);
    return json({ error: "Unable to connect to Binance market data." }, 502);
  }
}
