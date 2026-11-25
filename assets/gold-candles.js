import {parseCandleCsv} from "./candle-csv.js";

export const goldIntervals=Object.freeze({"1m":1,"5m":5,"15m":15,"30m":30,"1h":60,"4h":240,day:1440,week:10080});
export const goldLabel=frame=>frame==="day"?"1D":frame==="week"?"1W":frame;
export const goldOverview=frame=>frame==="day"||frame==="week";

// No filled gaps: each bucket is formed solely from observed source candles.
export function aggregateGold(bars,minutes){
 if(minutes===1)return bars;
 if(!Number.isFinite(minutes)||minutes<1)throw Error("Unsupported Gold candle interval");
 const size=minutes*60,offset=minutes===10080?345600:0;
 const rows=[];
 for(const b of bars){
  const t=Math.floor((b.time-offset)/size)*size+offset;
  const last=rows.at(-1);
  if(!last||last.time!==t){rows.push({...b,time:t});continue}
  last.high=Math.max(last.high,b.high);last.low=Math.min(last.low,b.low);last.close=b.close;last.volume+=b.volume;
 }
 return rows;
}
let daily;
export async function loadGoldOverview(signal){
 if(daily)return daily;
 const r=await fetch("/assets/data/gold-daily.bin",{signal});
 if(!r.ok||!r.body)throw Error("Daily Gold history unavailable");
 const csv=await new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).text();
 const bars=parseCandleCsv(csv);
 if(bars.length<1400||signal?.aborted)throw Error("Gold daily history incomplete");
 return daily={csv,bars};
}
