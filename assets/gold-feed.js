// Fetch directly from the publisher. Ledger displays this feed but does not expose or export its raw API data.
export const root="https://biquote.io";
export const periodByMinutes=Object.freeze({1:"1m",5:"5m",15:"15m",30:"30m",60:"1h",240:"4h",1440:"1d"});
export const maxBars=500;
export function normalizeBars(payload,interval,now=Math.floor(Date.now()/1000)){
 if(!Object.hasOwn(periodByMinutes,interval)||payload?.symbol!=="XAUUSD"||payload.interval!==periodByMinutes[interval]||!Array.isArray(payload.bars)||payload.bars.length>maxBars+1)throw Error("Unexpected Gold candle response");
 const seen=new Map();
 for(const a of payload.bars){
  const time=Date.parse(a?.openTime)/1000,{open,high,low,close}=a||{};
  if(!Number.isSafeInteger(time)||time<=0||time>now+30||![open,high,low,close].every(x=>Number.isFinite(x)&&x>0)||high<Math.max(open,close)||low>Math.min(open,close))continue;
  const volume=Number.isSafeInteger(a.tickVolume)&&a.tickVolume>=0?a.tickVolume:0;
  seen.set(time,{time,open,high,low,close,volume,forming:a.isOpen===true});
 }
 if(!seen.size)throw Error("No valid Gold candles");
 return [...seen.values()].sort((a,b)=>a.time-b.time);
}
export function normalizeQuote(p,now=Math.floor(Date.now()/1000)){
 const time=Date.parse(p?.lastQuoteAt||p?.timestamp)/1000;
 if(p?.symbol!=="XAUUSD"||!Number.isSafeInteger(time)||time<=0||time>now+30||!Number.isFinite(p.mid)||p.mid<=0)return null;
 const fresh=p.marketState==="open"&&p.stale===false&&now-time<90;
 return {time,price:p.mid,state:fresh?"updating":p.marketState==="closed"?"closed":"stale"};
}
export function mergeFeedBars(previous,incoming){
 return [...new Map([...previous,...incoming].map(b=>[b.time,b])).values()].sort((a,b)=>a.time-b.time).slice(-maxBars);
}
// Separate the two time budgets so a slow quote never blocks the candle renderer.
export function requestGoldFeed(minutes,{signal,full,barsTimeout=8500,quoteTimeout=8500}){
 const interval=periodByMinutes[minutes];if(!interval)throw Error("Unsupported Gold timeframe");
 const get=async(url,timeout)=>{
  const requestSignal=AbortSignal.any([signal,AbortSignal.timeout(timeout)]);
  const r=await fetch(root+url,{signal:requestSignal,credentials:"omit",cache:"no-cache",referrerPolicy:"no-referrer"});
  if(!r.ok)throw Error("Gold provider unavailable");
  return r.json();
 };
 return {
  bars:get("/api/XAUUSD/ohlc?"+new URLSearchParams({interval,limit:full?String(maxBars):"12"}),barsTimeout)
   .then(p=>normalizeBars(p,minutes)).catch(()=>null),
  quote:get("/api/XAUUSD",quoteTimeout).then(p=>normalizeQuote(p)).catch(()=>null)
 };
}
