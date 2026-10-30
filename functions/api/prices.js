const SYMBOLS = {
  bitcoin: "BTC",
  ethereum: "ETH",
  solana: "SOL",
  binancecoin: "BNB",
  ripple: "XRP",
  dogecoin: "DOGE",
  cardano: "ADA",
  "avalanche-2": "AVAX",
  polkadot: "DOT",
  chainlink: "LINK",
  tron: "TRX",
  "shiba-inu": "SHIB"
};

const ALLOWED_IDS = new Set(Object.keys(SYMBOLS));

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

async function getCoinLore(ids) {
  const url = new URL("https://api.coinlore.net/api/tickers/");
  url.searchParams.set("start", "0");
  url.searchParams.set("limit", "100");

  const r = await fetch(url.toString(), {
    headers: { accept: "application/json" },
    cf: { cacheTtl: 20, cacheEverything: true }
  });

  if (!r.ok) throw new Error("CoinLore returned " + r.status);

  const payload = await r.json();
  if (!Array.isArray(payload.data)) throw new Error("Invalid CoinLore response");

  const bySymbol = new Map();
  for (const coin of payload.data) {
    const symbol = String(coin.symbol || "").toUpperCase();
    if (symbol && !bySymbol.has(symbol)) bySymbol.set(symbol, Number(coin.price_usd));
  }

  const output = {};
  for (const id of ids) {
    const price = bySymbol.get(SYMBOLS[id]);
    if (Number.isFinite(price) && price > 0) output[id] = { usd: price };
  }
  return output;
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
        .filter(id => ALLOWED_IDS.has(id))
    )];

    if (!requested.length) {
      return response({ error: "No supported assets requested." }, 400);
    }

    let data = {};
    try {
      data = await getCoinLore(requested);
    } catch (error) {
      console.warn("CoinLore price request failed:", error);
    }

    const missing = requested.filter(id => !Number.isFinite(data[id]?.usd));
    if (missing.length) {
      try {
        Object.assign(data, await getCoinGecko(missing, env));
      } catch (error) {
        console.warn("CoinGecko fallback failed:", error);
      }
    }

    if (!Object.keys(data).length) {
      return response({ error: "No current prices were returned by the available providers." }, 502);
    }

    return response(data);
  } catch (error) {
    console.error("Ledger portfolio prices error:", error);
    return response({ error: "Unable to load market prices right now." }, 502);
  }
}
