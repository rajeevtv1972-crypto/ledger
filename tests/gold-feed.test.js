import test from "node:test";
import assert from "node:assert/strict";
import {normalizeBars,normalizeQuote,mergeFeedBars,readGoldFeed} from "../assets/gold-feed.js";
const t=1795609800,stamp=v=>new Date(v*1000).toISOString();
const raw=(time,more={})=>({openTime:stamp(time),open:3500,high:3520,low:3490,close:3510,tickVolume:6,isOpen:false,...more});
test("provider OHLC sorts, rejects invalid extrema, and preserves gaps",()=>{
 const payload={symbol:"XAUUSD",interval:"1m",bars:[raw(t,{isOpen:true}),raw(t-60,{high:3455}),raw(t-180)]};
 const bars=normalizeBars(payload,1,t);
 assert.deepEqual(bars.map(v=>[v.time,v.forming,v.volume]),[[t-180,false,6],[t,true,6]]);
 assert.throws(()=>normalizeBars(payload,5,t));
 assert.equal(mergeFeedBars(bars,[{...bars.at(-1),close:3515}]).at(-1).close,3515);
});
test("quotes distinguish fresh, closed and stale",()=>{
 const q={symbol:"XAUUSD",mid:3511,lastQuoteAt:stamp(t),marketState:"open",stale:false};
 assert.equal(normalizeQuote(q,t).state,"updating");
 assert.equal(normalizeQuote(q,t+90).state,"stale");
 assert.equal(normalizeQuote({...q,marketState:"closed"},t).state,"closed");
 assert.equal(normalizeQuote({...q,mid:0},t),null);
});
test("uses public provider directly without credentials or export proxy",async(t)=>{
 const now=Math.floor(Date.now()/1000);
 const fetch=t.mock.method(globalThis,"fetch",async url=>Response.json(String(url).includes("/ohlc")?{symbol:"XAUUSD",interval:"1m",bars:[raw(now)]}:{symbol:"XAUUSD",mid:3500,lastQuoteAt:stamp(now),marketState:"open",stale:false}));
 const r=await readGoldFeed(1,{signal:new AbortController().signal,full:true});
 assert.equal(r.bars.length,1);assert.equal(r.quote.state,"updating");
 assert.ok(fetch.mock.calls.every(({arguments:[u,o]})=>String(u).startsWith("https://biquote.io/")&&o.credentials==="omit"));
});
test("empty or failed candles preserve a fresh quote",async(t)=>{
 const now=Math.floor(Date.now()/1000);
 let fail=false;
 t.mock.method(globalThis,"fetch",async url=>String(url).includes("/ohlc")?
 (fail?Response.json({}, {status:502}):Response.json({symbol:"XAUUSD",interval:"1m",bars:[]})):
 Response.json({symbol:"XAUUSD",mid:3505,lastQuoteAt:stamp(now),marketState:"open",stale:false}));
 for(fail of [false,true]){
  const r=await readGoldFeed(1,{signal:new AbortController().signal,full:true});
  assert.equal(r.bars,null);assert.equal(r.quote?.price,3505);assert.equal(r.quote?.state,"updating");
 }
});
