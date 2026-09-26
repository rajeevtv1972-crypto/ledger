const ALLOWED_IDS = new Set([
  "bitcoin","ethereum","solana","binancecoin","ripple","dogecoin","cardano",
  "avalanche-2","polkadot","chainlink","tron","shiba-inu"
]);

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const requested = [...new Set(
      String(url.searchParams.get("ids") || "")
        .split(",")
        .map(v => v.trim())
        .filter(Boolean)
        .filter(id => ALLOWED_IDS.has(id))
    )];

    if (!requested.length) {
      return new Response(JSON.stringify({ error: "No supported assets requested." }), {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
      });
    }

    const upstream = new URL("https://api.coingecko.com/api/v3/simple/price");
    upstream.searchParams.set("ids", requested.join(","));
    upstream.searchParams.set("vs_currencies", "usd");
    upstream.searchParams.set("include_24hr_change", "true");

    const headers = { accept: "application/json" };
    if (env.COINGECKO_API_KEY) headers["x-cg-demo-api-key"] = env.COINGECKO_API_KEY;

    const response = await fetch(upstream.toString(), {
      headers,
      cf: { cacheTtl: 30, cacheEverything: true }
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: "Market price provider unavailable." }), {
        status: response.status === 429 ? 429 : 502,
        headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
      });
    }

    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store"
      }
    });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: "Unable to load market prices." }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
    });
  }
}
