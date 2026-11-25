import {ecbPairs,loadForex} from "./forex-rates.js";
import {goldSamples} from "./gold-samples.js?v=2";
export const pinkUrl="https://www.worldbank.org/en/research/commodity-markets";
export const instruments=Object.freeze({
  XAUUSD:{name:"Gold benchmark",unit:"USD/troy oz",intraday:true},
  XAGUSD:{name:"Silver benchmark",unit:"USD/troy oz",metal:"Silver"},
  PLATINUM:{name:"Platinum benchmark",unit:"USD/troy oz",metal:"Platinum"},
  COPPER:{name:"Copper benchmark",unit:"USD/metric ton"},
  USOIL:{name:"WTI crude oil",unit:"USD/barrel",daily:"DCOILWTICO"},
  UKOIL:{name:"Brent crude oil",unit:"USD/barrel",daily:"DCOILBRENTEU"},
  NATGAS:{name:"U.S. natural gas",unit:"USD/MMBtu",daily:"DHHNGSP"},
  MAIZE:{name:"Maize benchmark",unit:"USD/metric ton"},
  WHEATSRW:{name:"U.S. soft red winter wheat",unit:"USD/metric ton"},
  SOYBEANSPOT:{name:"Soybean benchmark",unit:"USD/metric ton"},
  COCOA:{name:"Cocoa benchmark",unit:"USD/kg"},
  COFFEE:{name:"Arabica coffee",unit:"USD/kg"},
  ALUMINUM:{name:"Aluminum benchmark",unit:"USD/metric ton"},
  NICKEL:{name:"Nickel benchmark",unit:"USD/metric ton"},
  ZINC:{name:"Zinc benchmark",unit:"USD/metric ton"},
  ...Object.fromEntries(ecbPairs.map(s=>[s,{name:s.slice(0,3)+"/"+s.slice(3)+" · Forex reference",unit:s.slice(3)+" per "+s.slice(0,3),daily:true,forex:true}]))
});
export const frames = Object.freeze({metalspot:"Indicative spot",spot:"Indicative spot","5m":"5 min","15m":"15 min","30m":"30 min","1h":"1 hour","4h":"4 hour",day:"Daily",week:"Weekly",month:"Monthly",year:"Annual"});
export function periods(instrument){return instrument.metal?["month","year","metalspot"]:instrument.intraday?["spot","month","year"]:instrument.daily?["day","week","month","year"]:["month","year"]}
export function aggregateBenchmarks(points,frame){
  if(frame==="day"||frame==="month") return points;
  const groups = new Map();
  for(const [time,value] of points){
    const date = new Date(time*1000), key = frame==="week"?time-((date.getUTCDay()+6)%7)*86400:Date.UTC(date.getUTCFullYear(),0,1)/1000;
    const g=groups.get(key)||[0,0];g[0]+=value;g[1]++;groups.set(key,g);
  }
  return [...groups].map(([t,[sum,n]])=>[t,sum/n]);
}
async function getJson(url,signal,fresh=false){
  const r=await fetch(url,{signal,cache:fresh?"no-store":"default"});
  if(!r.ok)throw Error("Benchmark data unavailable");
  return r.json();
}
const metalSessions=new Map();
async function loadMetal(symbol,info,signal){
 let points=metalSessions.get(symbol)||[],stale=false;
 try{
  const p=await getJson("/api/commodity-spot?symbol="+symbol,AbortSignal.any([signal,AbortSignal.timeout(8500)]),true);
  const q=p.quote,last=points.at(-1)?.[0]||0,now=Date.now()/1000;
  if(!q||!Number.isSafeInteger(q.t)||q.t>now+30||now-q.t>120||q.t<last||!Number.isFinite(q.price)||q.price<=0)throw Error("No fresh quote");
  points=(q.t===last?points.slice(0,-1):points).concat([[q.t,q.price]]).filter(([t])=>t>q.t-14400).slice(-480);
  metalSessions.set(symbol,points);
 }catch(e){if(signal.aborted||!points.length)throw e;stale=true}
 return {frame:"metalspot",info:{...info,name:info.metal+" spot"},source:"Gold API",url:"https://gold-api.com/docs",metal:true,intraday:true,stale,latestTime:points.at(-1)[0],points};
}
let pink;
let pinkChecked=0;
export async function loadBenchmarkSeries(symbol,frame,signal,{refresh=false}={}){
  if(!Object.hasOwn(instruments,symbol)||!periods(instruments[symbol]).includes(frame))throw Error("This period is unavailable");
  const info=instruments[symbol], daily=frame==="day"||frame==="week";
  if(info.metal&&frame==="metalspot")return loadMetal(symbol,info,signal);
  if(info.forex)return loadForex(symbol,frame,info,signal,refresh);
  if(info.intraday&&frame==="spot"){
    const p=await goldSamples("5m",signal);
    return {...p,frame,intraday:true,source:"XAUS spot samples",url:"https://xaus.com/api/",info:{...info,name:"Gold spot · XAU/USD"}};
  }
  let checkedAt=null, points, source="World Bank Pink Sheet", url=pinkUrl, snapshot=false;
  if(daily){
    source="U.S. EIA via FRED";url="https://fred.stlouisfed.org/series/"+info.daily;
    try{
      const result=await getJson("/api/commodity-history?symbol="+symbol,AbortSignal.any([signal,AbortSignal.timeout(13000)]),refresh);
      if(!Array.isArray(result.points)||result.points.length<1000)throw Error("Unexpected daily history");
      points=result.points;checkedAt=result.checkedAt||null;
    }catch(e){
      if(signal.aborted)throw e;
      const d=await getJson("/assets/data/eia-"+symbol+".json",signal);
      points=d.values.flatMap((value,i)=>Number.isFinite(value)?[[d.first+i*86400,value]]:[]);
      snapshot=true;
    }
  }else{
    let d=pink;
    if(refresh||!d||Date.now()-pinkChecked>300000){
      try{
        const latest=await getJson("/api/commodity-monthly",AbortSignal.any([signal,AbortSignal.timeout(24000)]),refresh);
        if(!Array.isArray(latest.months)||latest.months.length<700||!Array.isArray(latest.prices?.[symbol])||latest.prices[symbol].length!==latest.months.length)throw Error("Incomplete monthly history");
        if(d&&latest.months.at(-1)<d.months.at(-1))throw Error("Monthly source returned older data");
        d=pink=latest;pinkChecked=Date.now();
      }catch(e){if(signal.aborted)throw e;snapshot=true}
    }
    if(!d)d=await getJson("/assets/data/pink-sheet-monthly.json",signal);
    checkedAt=d.checkedAt||null;
    points=d.prices[symbol].flatMap((value,i)=>Number.isFinite(value)?[[Date.parse(d.months[i]+"-01T00:00:00Z")/1000,value]]:[]);
  }
  if(!points.length)throw Error("No observations available");
  return {frame,info,source,url,snapshot,checkedAt,latestTime:points.at(-1)[0],points:aggregateBenchmarks(points,frame)};
}
