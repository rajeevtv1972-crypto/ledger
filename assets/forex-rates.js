export const ecbUrl="https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html";
export const ecbCurrencies=Object.freeze(["USD","JPY","GBP","CHF","AUD","CAD","INR","NZD"]);
export const ecbPairs=Object.freeze(["EURUSD","GBPUSD","USDJPY","GBPJPY","AUDUSD","USDCAD","USDCHF","NZDUSD","EURJPY","EURGBP","USDINR"]);
const validRate=x=>Number.isFinite(x)&&x>0;
const validDate=s=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;

export function readRecentECB(xml){
  const rows=[];
  if(!xml.includes("European Central Bank"))return rows;
  for(const match of xml.matchAll(/<Cube\s+time="(\d{4}-\d{2}-\d{2})"\s*>([\s\S]*?)<\/Cube>/g)){
    const date=match[1],rates={};
    if(!validDate(date))continue;
    for(const [,ccy,rate] of match[2].matchAll(/<Cube\s+currency="([A-Z]{3})"\s+rate="([\d.]+)"\s*\/>/g)){
      if(ecbCurrencies.includes(ccy)&&validRate(Number(rate)))rates[ccy]=Number(rate);
    }
    if(ecbCurrencies.every(ccy=>validRate(rates[ccy])))rows.push([date,...ecbCurrencies.map(c=>rates[c])]);
  }
  return rows.sort((a,b)=>a[0].localeCompare(b[0]));
}

export function fxPoints(rows,symbol,frame){
  if(!ecbPairs.includes(symbol))throw Error("Unknown FX lookup");
  const index=c=>c==="EUR"?0:1+ecbCurrencies.indexOf(c),base=index(symbol.slice(0,3)),quote=index(symbol.slice(3));
  const points=[];
  for(const r of rows){
    const a=base?r[base]:1,b=quote?r[quote]:1;
    if(validDate(r[0])&&validRate(a)&&validRate(b))points.push([Date.parse(r[0])/1000,b/a]);
  }
  if(frame==="day")return points;
  const groups=new Map();
  for(const [t,v] of points){
    const d=new Date(t*1000),key=frame==="week"?t-((d.getUTCDay()+6)%7)*86400:Date.UTC(d.getUTCFullYear(),frame==="month"?d.getUTCMonth():0,1)/1000;
    const pair=groups.get(key)||[0,0];pair[0]+=v;pair[1]++;groups.set(key,pair);
  }
  return [...groups].map(([t,[sum,n]])=>[t,sum/n]);
}

let baseRows,recentRows,recentChecked=0;
export async function loadForex(symbol,frame,info,signal,refresh){
  const stopped=()=>signal?.aborted;
  const snapshot=async()=>{
    if(baseRows)return baseRows;
    const r=await fetch("/assets/data/ecb-forex.bin",{signal});
    if(!r.ok||!r.body)throw Error("ECB archive unavailable");
    const csv=await new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).text();
    const lines=csv.trimEnd().split("\n");
    if(lines.shift()!=="Date,"+ecbCurrencies.join(",")||lines.length<6800)throw Error("Incomplete ECB archive");
    return baseRows=lines.map(line=>line.split(",").map((v,i)=>i?v?Number(v):null:v));
  };
  const recent=async()=>{
    if(!refresh&&recentRows&&Date.now()-recentChecked<900000)return recentRows;
    try{
      const r=await fetch("/api/forex-recent",{signal:AbortSignal.any([signal,AbortSignal.timeout(5500)]),cache:refresh?"no-store":"default"});
      if(!r.ok)throw Error("ECB update unavailable");
      const p=await r.json();
      if(!Array.isArray(p.rows)||p.rows.length<20||!p.rows.every(x=>validDate(x[0])&&x.length===9&&x.slice(1).every(validRate)))throw Error("ECB update invalid");
      const sorted=p.rows.slice().sort((a,b)=>a[0].localeCompare(b[0]));
      if(recentRows&&sorted.at(-1)[0]<recentRows.at(-1)[0])throw Error("Older ECB update");
      recentRows=sorted;recentChecked=Date.now();
      return recentRows;
    }catch(e){if(stopped())throw e;return null}
  };
  const [base,update]=await Promise.all([snapshot(),recent()]);
  const combined=update?new Map([...base,...update].map(row=>[row[0],row])):null;
  const rows=combined?[...combined.values()].sort((a,b)=>a[0].localeCompare(b[0])):base;
  const points=fxPoints(rows,symbol,frame);
  if(!points.length)throw Error("No Forex data");
  return {info,frame,points,forex:true,derived:symbol.slice(0,3)!=="EUR"||frame!=="day",source:"European Central Bank",url:ecbUrl,snapshot:!update,latestTime:Date.parse(rows.at(-1)[0])/1000};
}
