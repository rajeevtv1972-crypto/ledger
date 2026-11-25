import {parseCandleCsv} from "./candle-csv.js";

export const source = "Sepaul Research";
export const sourceUrl = "https://github.com/sepaulresearch/market-datasets";
export const licenseUrl = "https://creativecommons.org/licenses/by/4.0/";
const snapshotUrl = "/assets/data/gold-m1-20261001.bin";
let cached;

export async function loadGoldMinute(signal) {
  if (cached) return cached;
  const response = await fetch(snapshotUrl, {signal});
  if (!response.ok || !response.body) throw Error("Gold history unavailable");
  const csv = await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).text();
  // The source reports broker tick count, not exchange-traded volume.
  const bars = parseCandleCsv(csv);
  if (bars.length !== 20000) throw Error("Incomplete Gold archive");
  if (signal?.aborted) throw signal.reason;
  return cached = {csv, bars};
}
