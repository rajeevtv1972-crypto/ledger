import test from "node:test";
import assert from "node:assert/strict";
import {metalQuote,onRequestGet} from "../functions/api/commodity-spot.js";
test("metal spot validates provider timestamp, units and allowlist",async()=>{
 const now=Math.floor(Date.now()/1000),valid={symbol:"XAG",updatedAt:new Date(now*1000).toISOString(),price:35.25,currency:"USD"};
 assert.deepEqual(metalQuote(valid,"XAG",now),{t:now,price:35.25});
 assert.equal(metalQuote({...valid,currency:"EUR"},"XAG",now),null);
 assert.equal(metalQuote(valid,"XPT",now),null);
 assert.equal(metalQuote(valid,"XAG",now+121),null);
 assert.equal(metalQuote(valid,"XAG",now-31),null);
 assert.equal((await onRequestGet({request:new Request("https://ledger.test/api/commodity-spot?symbol=USOIL")})).status,400);
});
