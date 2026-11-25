import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {aggregateBenchmarks,instruments,periods} from "../assets/commodity-benchmarks.js";
import {parseEiaCsv,onRequestGet} from "../functions/api/commodity-history.js";
const at = s => Date.parse(s+"T00:00:00Z")/1000;
test("weekly and annual samples are averages of published observations", () => {
  const points=[[at("2020-04-20"),-37.63],[at("2020-04-21"),11.57],[at("2020-04-27"),12.17]];
  assert.deepEqual(aggregateBenchmarks(points,"week"), [[at("2020-04-20"),(-37.63+11.57)/2],[at("2020-04-27"),12.17]]);
  assert.deepEqual(aggregateBenchmarks(points,"year"), [[at("2020-01-01"),(-37.63+11.57+12.17)/3]]);
  assert.deepEqual(periods(instruments.XAUUSD),["month","year"]);
});
test("monthly snapshots preserve each available month and energy fallback includes negative WTI", () => {
  const d=JSON.parse(readFileSync(new URL("../assets/data/pink-sheet-monthly.json",import.meta.url)));
  for(const key of Object.keys(instruments))assert.equal(d.prices[key].length,d.months.length);
  assert.equal(d.months[0],"1960-01");
  assert.ok(d.months.length>790);
  assert.equal(d.prices.XAUUSD[0],35);
  const w=JSON.parse(readFileSync(new URL("../assets/data/eia-USOIL.json",import.meta.url)));
  assert.equal(w.values[(at("2020-04-20")-w.first)/86400],-36.98);
});
test("daily route rejects unknown symbols and malformed CSV", async () => {
  const r=await onRequestGet({request:new Request("https://local/api/commodity-history?symbol=toString")});
  assert.equal(r.status,400);
  assert.throws(()=>parseEiaCsv("<html>","DCOILWTICO"));
  assert.throws(()=>parseEiaCsv("observation_date,DCOILWTICO\n2020-01-01,5","DCOILWTICO"),/Incomplete/);
});
