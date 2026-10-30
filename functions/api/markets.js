const SYMBOLS = [
  "BTC", "ETH", "BNB", "XRP", "SOL", "DOGE", "ADA", "TRX", "LINK", "AVAX",
  "SHIB", "DOT", "LTC", "BCH", "UNI", "NEAR", "APT", "SUI", "PEPE", "ETC"
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
    // CoinLore is used because Binance returns 403 from the current Cloudflare
    // Pages runtime. Its public ticker endpoint needs no API key.
    const url = new URL("https://api.coinlore.net/api/tickers/");
    url.searchParams.set("start", "0");
    url.searchParams.set("limit", "100");

    const upstream = await fetch(url.toString(), {
      headers: { accept: "application/json" },
      cf: { cacheTtl: 20, cacheEverything: true }
    });

    if (!upstream.ok) {
      return json({
        error: "Crypto market data provider is temporarily unavailable.",
        upstreamStatus: upstream.status
      }, 502);
    }

    const payload = await upstream.json();
    if (!Array.isArray(payload.data)) {
      return json({ error: "Unexpected response from CoinLore." }, 502);
    }

    const allowed = new Set(SYMBOLS);
    const seen = new Set();
    const data = payload.data
      .filter(coin => allowed.has(String(coin.symbol || "").toUpperCase()))
      .filter(coin => {
        const symbol = String(coin.symbol).toUpperCase();
        if (seen.has(symbol)) return false;
        seen.add(symbol);
        return true;
      })
      .map(coin => ({
        symbol: String(coin.symbol).toUpperCase() + "USDT",
        lastPrice: Number(coin.price_usd),
        change1h: Number(coin.percent_change_1h),
        priceChangePercent: Number(coin.percent_change_24h),
        change7d: Number(coin.percent_change_7d),
        marketCap: Number(coin.market_cap_usd),
        quoteVolume: Number(coin.volume24),
        rank: Number(coin.rank)
      }))
      .filter(coin => Number.isFinite(coin.lastPrice) && coin.lastPrice > 0);

    if (!data.length) {
      return json({ error: "CoinLore returned no matching market prices." }, 502);
    }

    const updatedAt = Number(payload.info?.time) > 0
      ? Number(payload.info.time) * 1000
      : Date.now();

    return json({
      source: "CoinLore",
      updatedAt,
      fetchedAt: Date.now(),
      data
    });
  } catch (error) {
    console.error("Ledger markets API error:", error);
    return json({ error: "Unable to load crypto market prices right now." }, 502);
  }
}
