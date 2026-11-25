import {test} from "node:test";
import assert from "node:assert/strict";
import {readRecentECB,fxPoints} from "../assets/forex-rates.js";
import {aggregateGold} from "../assets/gold-candles.js";

test("Gold larger candles are derived from observed bars; no missing candle is fabricated",()=>{
 const bars=[
  {time:300,open:20,high:24,low:19,close:22,volume:70},
  {time:360,open:22,high:23,low:18,close:21,volume:50},
  {time:900,open:23,high:24,low:22,close:24,volume:15},
 ];
 assert.deepEqual(aggregateGold(bars,5),[
  {time:300,open:20,high:24,low:18,close:21,volume:120},bars[2]
 ]);
 assert.equal(bars[0].close,22);
 const day=Date.parse("2026-11-25")/1000;
 assert.equal(aggregateGold([{...bars[0],time:day}],10080)[0].time,Date.parse("2026-11-23")/1000);
});
test("ECB EUR rates and calculated cross-rates preserve missing days and weekly averages",()=>{
 const rows=[
  ["1999-01-04",1.2,185,.5,1,1.7,1.5,100,2],
  ["1999-01-05",1.4,186,null,1,1.7,1.5,102,2],
  ["1999-01-06",1.6,187,.55,1,1.7,1.5,103,2]
 ];
 assert.deepEqual(fxPoints(rows,"EURUSD","day").map(x=>x[1]),[1.2,1.4,1.6]);
 const crosses=fxPoints(rows,"GBPJPY","day");
 assert.equal(crosses.length,2);assert.equal(crosses[0][1],370);
 assert.equal(fxPoints(rows,"GBPJPY","week")[0][1],(370+187/.55)/2);
 assert.deepEqual(readRecentECB("<html>No data</html>"),[]);
 const codes=["USD","JPY","GBP","CHF","AUD","CAD","INR","NZD"];
 const data='<Cube time="2026-11-24">'+codes.map((k,i)=>'<Cube currency="'+k+'" rate="'+(i+1)+'"/>').join("")+'</Cube>';
 assert.deepEqual(readRecentECB("European Central Bank"+data),[["2026-11-24",1,2,3,4,5,6,7,8]]);
});
