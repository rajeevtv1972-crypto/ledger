import {goldFrames,goldSamples} from "./gold-samples.js?v=2";
export const pinkUrl="https://www.worldbank.org/en/research/commodity-markets";
export const instruments=Object.freeze({
  XAUUSD:{name:"Gold benchmark",unit:"USD/troy oz",intraday:true},
  XAGUSD:{name:"Silver benchmark",unit:"USD/troy oz"},
  PLATINUM:{name:"Platinum benchmark",unit:"USD/troy oz"},
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
  ZINC:{name:"Zinc benchmark",unit:"USD/metric ton"}
});
export const frames = Object.freeze({"5m":"5 min","15m":"15 min","30m":"30 min","1h":"1 hour","4h":"4 hour",day:"Daily",week:"Weekly",month:"Monthly",year:"Annual"});
export function periods(instrument){return instrument.intraday?["15m","5m","30m","1h","4h","month","year"]:instrument.daily?["day","week","month","year"]:["month","year"]}
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
let pink;
let pinkChecked=0;
export async function loadBenchmarkSeries(symbol,frame,signal,{refresh=false}={}){
  if(!Object.hasOwn(instruments,symbol)||!periods(instruments[symbol]).includes(frame))throw Error("This period is unavailable");
  const info=instruments[symbol], daily=frame==="day"||frame==="week";
  if(info.intraday&&Object.hasOwn(goldFrames,frame)){
    const p=await goldSamples(frame,signal);
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
    if(refresh||!d||Date.now()-pinkChecked>900000){
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
