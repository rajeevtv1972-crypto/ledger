const intervals=new Set([1,5,15,30,60,240,1440,10080]);
const base={1:60,5:300,15:900,30:900,60:3600,240:3600,1440:86400,10080:86400};
const aliases={BTC:"XBT",DOGE:"XDG"};
const reply=(body,status=200,ttl=0)=>Response.json(body,{status,headers:{"cache-control":status===200?"public, max-age="+ttl:"no-store","x-content-type-options":"nosniff"}});
const valid=a=>Object.values(a).every(Number.isFinite)&&a.time>0&&a.low>0&&a.high>=a.low;
const unique=rows=>[...new Map(rows.filter(valid).map(a=>[a.time,a])).values()].sort((a,b)=>a.time-b.time);
const iso=t=>new Date(t*1000).toISOString();
const fetchJSON=async(url,ttl)=>{const r=await fetch(url,{headers:{Accept:"application/json","User-Agent":"Ledger-Charts/1.0"},signal:AbortSignal.timeout(6500),cf:{cacheEverything:true,cacheTtl:ttl}});if(!r.ok)throw Error("Market feed returned "+r.status);return r.json()};
function bucket(t,step){const offset=step===604800?345600:0;return Math.floor((t-offset)/step)*step+offset}
function aggregate(rows,step,gran,from,to){const m=new Map();for(const a of rows){const t=bucket(a.time,step);if(t<from||t>=to)continue;let x=m.get(t);if(!x)m.set(t,{...a,time:t});else{x.high=Math.max(x.high,a.high);x.low=Math.min(x.low,a.low);x.close=a.close;x.volume+=a.volume}}return [...m.values()]}
async function coinbase(symbol,interval,before,mode){
const step=interval*60,gran=base[interval],now=Math.floor(Date.now()/1000);
const edge=before?bucket(before,step):bucket(now,step)+step;
const per=Math.max(1,Math.floor(280*gran/step)),count=mode==="latest"?Math.min(4,per):per;
const from=edge-count*step,to=edge;
const params=new URLSearchParams({granularity:String(gran),start:iso(from),end:iso(to)});
const rows=await fetchJSON("https://api.exchange.coinbase.com/products/"+symbol+"-USD/candles?"+params, before?3600:10);
if(!Array.isArray(rows))throw Error("Unexpected Coinbase response");
const raw=unique(rows.map(a=>({time:Number(a[0]),low:Number(a[1]),high:Number(a[2]),open:Number(a[3]),close:Number(a[4]),volume:Number(a[5])}))).filter(a=>a.time>=from&&a.time<to&&a.time<=now);
const candles=aggregate(raw,step,gran,from,to);
return {symbol,pair:symbol+"/USD",source:"Coinbase spot",provider:"coinbase",interval,candles,historyAvailable:true,nextBefore:candles.length?candles[0].time:from,updatedAt:Date.now()};
}
async function bitstamp(symbol,interval,before,mode){
const step=interval*60,gran=interval===10080?86400:step,now=Math.floor(Date.now()/1000),edge=before?bucket(before,step):bucket(now,step)+step;
const count=mode==="latest"?4:Math.floor(700*gran/step),from=edge-count*step;
const params=new URLSearchParams({step:String(gran),limit:String(count*step/gran),end:String(Math.min(edge-1,now))});
const d=await fetchJSON("https://www.bitstamp.net/api/v2/ohlc/"+symbol.toLowerCase()+"usd/?"+params,before?3600:10);
if(!Array.isArray(d.data?.ohlc))throw Error("Bitstamp pair unavailable");
const raw=unique(d.data.ohlc.map(a=>({time:Number(a.timestamp),open:Number(a.open),high:Number(a.high),low:Number(a.low),close:Number(a.close),volume:Number(a.volume)}))).filter(a=>a.time>=from&&a.time<edge&&a.time<=now);
const candles=aggregate(raw,step,gran,from,edge);
return {symbol,pair:symbol+"/USD",source:"Bitstamp spot",provider:"bitstamp",interval,candles,historyAvailable:true,nextBefore:candles.length?candles[0].time:from,updatedAt:Date.now()};
}
async function kraken(symbol,interval){
const d=await fetchJSON("https://api.kraken.com/0/public/OHLC?pair="+encodeURIComponent((aliases[symbol]||symbol)+"USD")+"&interval="+interval,10);
if(d.error?.length)throw Error("Kraken pair unavailable");
const rows=Object.entries(d.result||{}).find(([k,v])=>k!=="last"&&Array.isArray(v))?.[1]||[];
const candles=unique(rows.map(a=>({time:Number(a[0]),open:Number(a[1]),high:Number(a[2]),low:Number(a[3]),close:Number(a[4]),volume:Number(a[6])})));
if(!candles.length)throw Error("No Kraken candles");
return {symbol,pair:symbol+"/USD",source:"Kraken spot",provider:"kraken",interval,candles,historyAvailable:false,updatedAt:Date.now()};
}
export async function onRequestGet({request}){
const q=new URL(request.url).searchParams,symbol=(q.get("symbol")||"BTC").toUpperCase(),interval=Number(q.get("interval")||60),before=q.has("before")?Number(q.get("before")):null,provider=q.get("provider")||"auto",mode=q.get("mode")==="latest"?"latest":"initial";
if(!/^[A-Z0-9]{1,15}$/.test(symbol)||!intervals.has(interval)||!["auto","bitstamp","coinbase","kraken"].includes(provider)||(before!==null&&(!Number.isSafeInteger(before)||before<1230768000||before>Date.now()/1000+60)))return reply({error:"Invalid chart request."},400);
if(before&&provider==="kraken")return reply({error:"Kraken only exposes the latest 720 bars.",historyAvailable:false},409);
try{if(provider==="auto"||provider==="bitstamp"){try{const p=await bitstamp(symbol,interval,before,mode);if(p.candles.length||before)return reply(p,200,before?3600:10);throw Error("No Bitstamp data")}catch(e){if(before||provider==="bitstamp")throw e}}if(provider==="auto"||provider==="coinbase"){try{const p=await coinbase(symbol,interval,before,mode);if(p.candles.length||before)return reply(p,200,before?3600:10);throw Error("No Coinbase data")}catch(e){if(before||provider==="coinbase")throw e}}
return reply(await kraken(symbol,interval),200,10);
}catch(e){return reply({error:"Candle feed unavailable. Please retry or use Advanced chart."},502)}
}