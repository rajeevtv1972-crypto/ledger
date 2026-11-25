import {test} from "node:test";
import assert from "node:assert/strict";
import {parseCandleCsv} from "../assets/candle-csv.js";
const header = "time,open,high,low,close,volume\n";
const row = "2026-11-24T08:00:00Z,10,12,8,11,42";
test("sorts epoch and ISO dates and reads quoted fields", () => {
  const data = parseCandleCsv(header + row + '\n"1760000000000",10,12,8,9,0');
  assert.equal(data[0].time, 1760000000);
  assert.equal(data[1].time, Date.parse("2026-11-24T08:00:00Z") / 1000);
  assert.equal(data[1].volume, 42);
});
test("supports missing volume and UTC dates", () => {
  assert.deepEqual(parseCandleCsv("Date,Open,High,Low,Close\n2026-11-25,9,9,9,9")[0], {time:1795564800,open:9,high:9,low:9,close:9,volume:0});
});
test("rejects invalid candles, dates, duplicates and excess rows", () => {
  for (const input of [header, header + row + "\n" + row, header + "2026-02-30,1,2,1,2,0", header + "2026-11-24,2,1,1,2,0", header + "2026-11-24,1,2,1,2,-1", header + "2026-11-24,1,2,1,2,=1+2"]) assert.throws(() => parseCandleCsv(input));
  assert.throws(() => parseCandleCsv(header + row, 0), /exceeds/);
});
