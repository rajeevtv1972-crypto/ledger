const intervals = new Set([1,5,15,30,60,240,1440,10080]);
const aliases = {BTC:"XBT",DOGE:"XDG"};
const reply = (body,status=200) => Response.json(body,{status,headers:{"cache-control":status===200?"public, max-age=10":"no-store","x-content-type-options":"nosniff"}});
export async function onRequestGet({request}) {
  const query = new URL(request.url).searchParams;
  const symbol = (query.get("symbol")||"BTC").toUpperCase();
  const interval = Number(query.get("interval")||60);
  if(!/^[A-Z0-9]{1,15}$/.test(symbol)||!intervals.has(interval)) return reply({error:"Invalid symbol or timeframe."},400);
  const pair=(aliases[symbol]||symbol)+"USD";
  try {
    const r=await fetch("https://api.kraken.com/0/public/OHLC?pair="+encodeURIComponent(pair)+"&interval="+interval,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(12000)});
    if(!r.ok) return reply({error:"Exchange temporarily unavailable."},502);
    const d=await r.json();
    if(d.error?.length) return reply({error:"No Kraken USD market available for this symbol."},404);
    const rows=Object.entries(d.result||{}).find(([key,value])=>key!=="last"&&Array.isArray(value))?.[1]||[];
    const candles=rows.map(a=>({time:Number(a[0]),open:Number(a[1]),high:Number(a[2]),low:Number(a[3]),close:Number(a[4]),volume:Number(a[6])})).filter(a=>Object.values(a).every(Number.isFinite)&&a.time>0&&a.low>0&&a.high>=a.low).sort((a,b)=>a.time-b.time);
    if(!candles.length) return reply({error:"No candle history returned by Kraken."},404);
    return reply({symbol,pair:symbol+"/USD",source:"Kraken spot",interval,candles,updatedAt:Date.now()});
  } catch(e){return reply({error:"Could not reach Kraken. Please retry."},502);}
}