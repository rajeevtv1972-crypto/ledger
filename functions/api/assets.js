function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300, stale-while-revalidate=3600",
      "x-content-type-options": "nosniff"
    }
  });
}

export async function onRequestGet({ request }) {
  try {
    const requestUrl = new URL(request.url);
    const query = String(requestUrl.searchParams.get("q") || "").trim().toLowerCase();
    const upstream = await fetch("https://api.coinlore.net/api/assets/", {
      headers: { accept: "application/json" },
      cf: { cacheTtl: 3600, cacheEverything: true }
    });

    if (!upstream.ok) {
      return json({ error: "The cryptocurrency directory is temporarily unavailable." }, 502);
    }

    const payload = await upstream.json();
    if (!Array.isArray(payload.data)) {
      return json({ error: "Unexpected cryptocurrency directory response." }, 502);
    }

    const filtered = payload.data
      .filter(asset => {
        const name = String(asset.name || "").toLowerCase();
        const symbol = String(asset.symbol || "").toLowerCase();
        const nameid = String(asset.nameid || "").toLowerCase();
        return !query || name.includes(query) || symbol.includes(query) || nameid.includes(query);
      })
      .sort((a, b) => (Number(a.rank) || 999999999) - (Number(b.rank) || 999999999))
      .slice(0, 40)
      .map(asset => ({
        id: String(asset.id),
        symbol: String(asset.symbol || "").toUpperCase(),
        name: String(asset.name || asset.symbol || "Unknown asset"),
        rank: Number(asset.rank) || null
      }))
      .filter(asset => /^\d+$/.test(asset.id) && asset.symbol && asset.name);

    return json({
      source: "CoinLore",
      count: filtered.length,
      query,
      data: filtered
    });
  } catch (error) {
    console.error("Ledger asset directory error:", error);
    return json({ error: "Unable to search cryptocurrency assets right now." }, 502);
  }
}
