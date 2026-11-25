const maxAge=48*3600;
export const spotPeriod=60_000;
export const sourceUrl="https://xaus.com/api/";

// Only use the provider's observation time, never the time of our request.
export function spotQuote(raw,now=Math.floor(Date.now()/1000)){
  const asOf=raw?.price_as_of??raw?.data_state?.as_of, t=asOf?Math.floor(Date.parse(asOf)/1000):NaN;
  const x=raw?.xau;
  if(raw?.stale!==false||raw.data_state?.status!=="fresh"||x?.currency!=="USD"||x.unit!=="troy_oz"||!Number.isFinite(x.price)||x.price<=0||!Number.isFinite(t)||t>now+30||now-t>150)return null;
  return {t,p:x.price};
}

export function sampleBars(raw,local,now=Math.floor(Date.now()/1000)){
  const verified=raw?.symbol==="xau"&&raw.currency==="USD"&&raw.unit==="troy_oz"&&raw.interval_seconds===300&&Array.isArray(raw.points)&&raw.points.length<=800;
  const points=new Map();
  for(const x of [...local,...(verified?raw.points:[])]){
    if(Number.isSafeInteger(x?.t)&&x.t>now-maxAge&&x.t<=now+30&&Number.isFinite(x.p)&&x.p>0)points.set(x.t,x.p);
  }
  const groups=new Map();
  for(const [t,p] of [...points].sort((a,b)=>a[0]-b[0])){
    const time=Math.floor(t/900)*900;
    const b=groups.get(time);
    if(b){b.high=Math.max(b.high,p);b.low=Math.min(b.low,p);b.close=p;b.samples++}
    else groups.set(time,{time,open:p,high:p,low:p,close:p,volume:0,samples:1});
  }
  // No bars made from just one point; no artificial open, close, or weekend fill.
  return [...groups.values()].filter(b=>b.samples>=2);
}
