export const goldFrames=Object.freeze({"5m":300,"15m":900,"30m":1800,"1h":3600,"4h":14400});
const endpoint="https://xaus.com/api/v1/intraday?symbol=xau&hours=48";
export function groupGold(raw,frame,now=Date.now()/1000){
  const step=goldFrames[frame];
  if(!Object.hasOwn(goldFrames,frame)||raw?.symbol!=="xau"||raw.currency!=="USD"||raw.unit!=="troy_oz"||raw.interval_seconds!==300||!Array.isArray(raw.points)||raw.points.length>800)throw Error("Unrecognized Gold sample data");
  const samples=raw.points.filter(x=>Number.isSafeInteger(x?.t)&&x.t>now-49*3600&&x.t<=now+60&&Number.isFinite(x.p)&&x.p>0).sort((a,b)=>a.t-b.t);
  if(samples.length<2)throw Error("No recent Gold samples");
  // Take the last sample per UTC period without inventing candles or filling gaps.
  const groups=new Map();
  for(const {t,p} of samples)groups.set(Math.floor(t/step)*step,p);
  const latestTime=samples.at(-1).t;
  return {points:[...groups],latestTime,stale:raw.data_state?.status!=="fresh"||now-latestTime>900};
}
let cache,checked=0;
export async function goldSamples(frame,signal){
  if(!cache||Date.now()-checked>=60000){
    const r=await fetch(endpoint,{signal:AbortSignal.any([signal,AbortSignal.timeout(12000)])});
    if(!r.ok)throw Error("Gold feed unavailable");
    const raw=await r.json(),data=groupGold(raw,frame);
    cache=raw;checked=Date.now();return data;
  }
  return groupGold(cache,frame);
}
