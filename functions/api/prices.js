const LEGACY_COIN_IDS = {
  bitcoin: "90",
  ethereum: "80",
  solana: "48543",
  binancecoin: "2710",
  ripple: "58",
  dogecoin: "2",
  cardano: "257",
  "avalanche-2": "44883",
  polkadot: "45219",
  chainlink: "2751",
  tron: "2713",
  "shiba-inu": "45088"
};

const LEGACY_IDS = new Set(Object.keys(LEGACY_COIN_IDS));

function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "x-content-type-options": "nosniff"
    }
  });
}

function resolveCoinLoreId(id) {
  if (LEGACY_COIN_IDS[id]) return LEGACY_COIN_IDS[id];
  const match = /^coinlore-(\d+)$/.exec(id);
  return match ? match[1] : null;
}

async function getCoinLorePrices(coinIds) {
  const prices = new Map();
  const uniqueIds = [...new Set(coinIds)];

  // Keep requests reasonably small while supporting portfolios with many assets.
  for (let start = 0; start < uniqueIds.length; start += 30) {
    const batch = uniqueIds.slice(start, start + 30);
    const url = new URL("https://api.coinlore.net/api/ticker/");
    url.searchParams.set("id", batch.join(","));

    const r = await fetch(url.toString(), {
      headers: { accept: "application/json" },
      cf: { cacheTtl: 20, cacheEverything: true }
    });

    if (!r.ok) {
      console.warn("CoinLore returned", r.status, "for a price batch");
      continue;
    }

    const rows = await r.json();
    if (!Array.isArray(rows)) continue;

    for (const coin of rows) {
      const id = String(coin.id || "");
      const price = Number(coin.price_usd);
      if (id && Number.isFinite(price) && price > 0) prices.set(id, price);
    }
  }

  return prices;
}

async function getCoinGecko(ids, env) {
  const url = new URL("https://api.coingecko.com/api/v3/simple/price");
  url.searchParams.set("ids", ids.join(","));
  url.searchParams.set("vs_currencies", "usd");

  const headers = { accept: "application/json" };
  if (env?.COINGECKO_API_KEY) headers["x-cg-demo-api-key"] = env.COINGECKO_API_KEY;

  const r = await fetch(url.toString(), {
    headers,
    cf: { cacheTtl: 20, cacheEverything: true }
  });

  if (!r.ok) throw new Error("CoinGecko returned " + r.status);
  return await r.json();
}

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const requested = [...new Set(
      String(url.searchParams.get("ids") || "")
        .split(",")
        .map(v => v.trim())
        .filter(Boolean)
    )];

    if (!requested.length) {
      return response({ error: "No assets requested." }, 400);
    }
    if (requested.length > 150) {
      return response({ error: "Request up to 150 portfolio assets at a time." }, 400);
    }

    const resolved = requested
      .map(id => ({ id, coinLoreId: resolveCoinLoreId(id) }))
      .filter(item => item.coinLoreId);

    if (!resolved.length) {
      return response({ error: "No supported assets requested." }, 400);
    }

    let data = {};
    try {
      const coinLorePrices = await getCoinLorePrices(resolved.map(item => item.coinLoreId));
      for (const item of resolved) {
        const price = coinLorePrices.get(item.coinLoreId);
        if (Number.isFinite(price) && price > 0) data[item.id] = { usd: price };
      }
    } catch (error) {
      console.warn("CoinLore portfolio price request failed:", error);
    }

    // Preserve the existing CoinGecko fallback for the original 12 popular assets.
    const missingLegacy = resolved
      .filter(item => LEGACY_IDS.has(item.id) && !Number.isFinite(data[item.id]?.usd))
      .map(item => item.id);

    if (missingLegacy.length) {
      try {
        Object.assign(data, await getCoinGecko(missingLegacy, env));
      } catch (error) {
        console.warn("CoinGecko fallback failed:", error);
      }
    }

    if (!Object.keys(data).length) {
      return response({ error: "No current prices were returned for the requested assets." }, 502);
    }

    return response(data);
  } catch (error) {
    console.error("Ledger portfolio prices error:", error);
    return response({ error: "Unable to load market prices right now." }, 502);
  }
}
