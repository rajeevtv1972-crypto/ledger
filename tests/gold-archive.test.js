import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile,open} from "node:fs/promises";
import {gunzipSync} from "node:zlib";
import {loadGoldMonth} from "../assets/gold-history.js";
import {onRequestGet} from "../functions/api/gold-history-range.js";

test("Gold indexes cover the permitted archive and constrain each download",async()=>{
 let total=0,count=0;
 for(let year=2021;year<=2026;year++){
  const index=JSON.parse(gunzipSync(await readFile(new URL("../assets/data/gold-index/"+year+".bin",import.meta.url))));
  for(const [month,m] of Object.entries(index)){
   assert.ok(month.startsWith(String(year)));
   assert.ok(m.endBit-m.startBit<=8*1048576&&m.endBit>m.startBit);
   assert.match(m.sha256,/^[a-f0-9]{64}$/);
   total+=m.rows;count++;
  }
 }
 assert.equal(total,2032041);assert.equal(count,70);
 await assert.rejects(loadGoldMonth("2026-11"),/January 2021/);
 const r=await onRequestGet({request:new Request("https://ledger.test/api/gold-history-range?start=43&end=32700000")});
 assert.equal(r.status,400);
});

const zip=process.env.LEDGER_GOLD_ZIP;
test("seekable DEFLATE reconstructs every month and verifies every row checksum",{skip:!zip},async()=>{
 const raw=await open(zip,"r");
 try{
  const fetcher=async(url,options)=>{
   if(url.startsWith("/assets/"))return new Response(await readFile(new URL(".."+url,import.meta.url)));
   const [start,end]=options.headers.Range.slice(6).split("-").map(Number);
   const out=Buffer.alloc(end-start+1);
   await raw.read(out,0,out.length,start);
   return new Response(out,{status:206});
  };
  let count=0;
  for(let year=2021;year<=2026;year++)for(let month=1;month<=(year===2026?10:12);month++){
   const key=year+"-"+String(month).padStart(2,"0"),p=await loadGoldMonth(key,null,fetcher);
   assert.equal(p.month,key);
   count+=p.bars.length;
  }
  assert.equal(count,2032041);
 }finally{await raw.close();}
});
