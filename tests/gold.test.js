import {test} from "node:test";
import assert from "node:assert/strict";
import {groupGold} from "../assets/gold-samples.js";
test("intraday gold uses last observed samples, preserves gaps and labels old data",()=>{
  const at=1795593600, base={symbol:"xau",currency:"USD",unit:"troy_oz",interval_seconds:300,data_state:{status:"fresh"}};
  const result=groupGold({...base,points:[{t:at+305,p:3502},{t:at+5,p:3501},{t:at+1805,p:3505}]}, "15m",at+1850);
  assert.deepEqual(result.points,[[at,3502],[at+1800,3505]]);
  assert.equal(result.latestTime,at+1805);
  assert.equal(result.stale,false);
  assert.equal(groupGold({...base,points:[{t:at+5,p:3501},{t:at+305,p:3502}]}, "5m",at+1900).stale,true);
  assert.throws(()=>groupGold({...base,points:[]}, "5m",at));
  assert.throws(()=>groupGold({...base,points:[{t:at,p:1},{t:at+301,p:2}]}, "1m",at+310));
});
