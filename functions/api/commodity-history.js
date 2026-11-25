const series = {USOIL:"DCOILWTICO",UKOIL:"DCOILBRENTEU",NATGAS:"DHHNGSP"};
export function parseEiaCsv(csv, key) {
  const lines = csv.trim().split(/\r?\n/);
  if (!new RegExp("^(observation_date|DATE),"+key+"$","i").test(lines.shift())) throw Error("Unexpected EIA CSV");
  const points = [];
  for (const row of lines) {
    const [date, raw] = row.split(",");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^-?\d+(?:\.\d+)?$/.test(raw)) continue;
    const time = Date.parse(date+"T00:00:00Z") / 1000, value = Number(raw);
    if (!Number.isFinite(time) || !Number.isFinite(value) || (points.length && time <= points.at(-1)[0])) throw Error("Invalid EIA data ordering");
    points.push([time,value]);
  }
  if(points.length<1000) throw Error("Incomplete EIA history");
  return points;
}
export async function onRequestGet({request}) {
  const symbol = new URL(request.url).searchParams.get("symbol");
  if(!Object.hasOwn(series,symbol)) return Response.json({error:"Daily energy symbol unavailable."},{status:400});
  const key = series[symbol];
  try {
    const upstream = await fetch("https://fred.stlouisfed.org/graph/fredgraph.csv?id="+key,{signal:AbortSignal.timeout(9000),cf:{cacheEverything:true,cacheTtl:300}});
    if(!upstream.ok) throw Error("Upstream unavailable");
    const points = parseEiaCsv(await upstream.text(),key);
    return Response.json({points,checkedAt:new Date().toISOString()},{headers:{"cache-control":"public, max-age=300","x-content-type-options":"nosniff"}});
  } catch {
    return Response.json({error:"EIA data through FRED unavailable."},{status:502,headers:{"cache-control":"no-store"}});
  }
}
