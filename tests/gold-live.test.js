import test from "node:test";
import assert from "node:assert/strict";
import {sampleBars,spotQuote} from "../assets/gold-live.js";
import {onRequestGet} from "../functions/api/gold-spot.js";

test("sampled bars preserve sampled extremes and skip unsupported buckets",()=>{
 const raw={symbol:"xau",currency:"USD",unit:"troy_oz",interval_seconds:300,points:[
  {t:1810,p:2500},{t:2110,p:2504},{t:2410,p:2501},{t:2710,p:4000},{t:3930,p:2450},{t:5410,p:4000}
 ]};
 assert.deepEqual(sampleBars(raw,[{t:2500,p:2495},{t:3990,p:2460},{t:2110,p:5000}],4300),[
  {time:1800,open:2500,high:2504,low:2495,close:2495,samples:4,volume:0},
  {time:3600,open:2450,high:2460,low:2450,close:2460,samples:2,volume:0}
 ]);
});
test("reject stale quotes, incorrect units, invalid and future timestamps",()=>{
 const now=Date.now()/1000|0;
 const iso=t=>new Date(t*1000).toISOString();
 const good={xau:{price:3340,currency:"USD",unit:"troy_oz"},stale:false,price_as_of:iso(now-10),data_state:{status:"fresh"}};
 assert.deepEqual(spotQuote(good,now),{p:3340,t:now-10});
 for(const input of [{...good,stale:true},{...good,data_state:{status:"stale"}},{...good,price_as_of:iso(now-151)},{...good,price_as_of:iso(now+31)},{...good,price_as_of:"junk"},{...good,xau:{...good.xau,unit:"gram"}}])assert.equal(spotQuote(input,now),null);
});
test("proxy returns timestamped quotes and restricts cache on source failures",async(t)=>{
 const now=new Date();
 const f=t.mock.method(globalThis,"fetch",async()=>Response.json({xau:{price:3300,currency:"USD",unit:"troy_oz"},stale:false,price_as_of:now.toISOString(),data_state:{status:"fresh"}}));
 const ok=await onRequestGet();assert.equal(ok.status,200);assert.deepEqual(await ok.json(),{quote:{p:3300,t:Math.floor(now.getTime()/1000)}});
 assert.equal(f.mock.calls[0].arguments[0],"https://xaus.com/api/v1/spot?compact=1");
 f.mock.mockImplementation(async()=>Response.json({}, {status:503}));
 const fail=await onRequestGet();assert.equal(fail.status,502);assert.equal(fail.headers.get("cache-control"),"no-store");
});
