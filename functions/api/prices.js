const SYMBOLS = {
  bitcoin: "BTCUSDT",
  ethereum: "ETHUSDT",
  solana: "SOLUSDT",
  binancecoin: "BNBUSDT",
  ripple: "XRPUSDT",
  dogecoin: "DOGEUSDT",
  cardano: "ADAUSDT",
  "avalanche-2": "AVAXUSDT",
  polkadot: "DOTUSDT",
  chainlink: "LINKUSDT",
  tron: "TRXUSDT",
  "shiba-inu": "SHIBUSDT"
};

const ALLOWED_IDS = new Set(Object.keys(SYMBOLS));

function response(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store, no-cache, must-revalidate, proxy-revalidate"
    }
  });
}

async function getBinance(ids) {
  const symbols = ids.map(id => SYMBOLS[id]);
  const url = new URL("https://api.binance.com/api/v3/ticker/price");
  url.searchParams.set("symbols", JSON.stringify(symbols));

  const r = await fetch(url.toString(), {
    headers: { accept: "application/json" },
    cf: { cacheTtl: 0, cacheEverything: false }
  });

  if (!r.ok) throw new Error("Binance returned " + r.status);

  const rows = await r.json();
  const bySymbol = new Map(rows.map(row => [row.symbol, Number(row.price)]));
  const output = {};

  for (const id of ids) {
    const price = bySymbol.get(SYMBOLS[id]);
    if (Number.isFinite(price)) output[id] = { usd: price };
  }

  return output;
}

async function getCoinGecko(ids, env) {
  const url = new URL("https://api.coingecko.com/api/v3/simple/price");
  url.searchParams.set("ids", ids.join(","));
  url.searchParams.set("vs_currencies", "usd");

  const headers = { accept: "application/json" };
  if (env.COINGECKO_API_KEY) headers["x-cg-demo-api-key"] = env.COINGECKO_API_KEY;

  const r = await fetch(url.toString(), {
    headers,
    cf: { cacheTtl: 0, cacheEverything: false }
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

    if (!requested.length) return response({ error: "No supported assets requested." }, 400);

    // Binance gives a direct, frequently updated ticker for the supported USDT pairs.
    try {
      const data = await getBinance(requested);

      // Fill any missing symbols through CoinGecko instead of failing the whole request.
      if (Object.keys(data).length !== requested.length) {
        try {
          const fallback = await getCoinGecko(
            requested.filter(id => !data[id]),
            env
          );
          Object.assign(data, fallback);
        } catch (_) {}
      }

      if (Object.keys(data).length) return response(data);
    } catch (_) {
      // Fall through to CoinGecko.
    }

    return response(await getCoinGecko(requested, env));
  } catch (error) {
    console.error(error);
    return response({ error: "Unable to load live market prices right now." }, 502);
  }
}
