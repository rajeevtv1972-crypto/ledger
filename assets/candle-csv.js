// Parse documented OHLCV exports locally without executing spreadsheet formulas.
function fields(line) {
  const out = [];
  let value = "", quoted = false, ended = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { value += '"'; i++; }
      else if (c === '"') { quoted = false; ended = true; }
      else value += c;
    } else if (c === ",") { out.push(value.trim()); value = ""; ended = false; }
    else if (c === '"' && !ended && !value.trim()) { value = ""; quoted = true; }
    else if (c === '"' || (ended && !/\s/.test(c))) throw new Error("Invalid CSV quoting.");
    else value += c;
  }
  if (quoted) throw new Error("Invalid CSV quoting.");
  return [...out, value.trim()];
}
function utcSeconds(value) {
  if (/^\d{9,13}$/.test(value)) {
    const n = Number(value);
    return Math.floor(n >= 1e12 ? n / 1000 : n);
  }
  if (!/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.test(value)) return NaN;
  const date = value.slice(0, 10);
  const midnight = Date.parse(date + "T00:00:00Z");
  if (!Number.isFinite(midnight) || new Date(midnight).toISOString().slice(0, 10) !== date) return NaN;
  const iso = value.replace(" ", "T");
  return iso.length === 10 ? midnight / 1000 : Math.floor(Date.parse(/Z$|[+-]\d{2}:\d{2}$/.test(iso) ? iso : iso + "Z") / 1000);
}
export function parseCandleCsv(text, limit = 20000) {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const header = fields(lines[0]).map(x => x.toLowerCase());
  const index = Object.fromEntries(["time", "open", "high", "low", "close", "volume"].map(x => [x, header.indexOf(x)]));
  if (index.time < 0) index.time = ["timestamp", "datetime", "date"].map(x => header.indexOf(x)).find(i => i >= 0) ?? -1;
  if (new Set(header).size !== header.length || ["time", "open", "high", "low", "close"].some(x => index[x] < 0)) throw new Error("CSV must contain unique time, open, high, low, and close columns.");
  const bars = new Map();
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const row = fields(lines[i]);
    const num = k => row[index[k]] ? Number(row[index[k]]) : NaN;
    const time = utcSeconds(row[index.time] ?? ""), open = num("open"), high = num("high"), low = num("low"), close = num("close"), volume = index.volume < 0 || !row[index.volume] ? 0 : num("volume");
    if (row.length !== header.length || ![time, open, high, low, close, volume].every(Number.isFinite) || time < 1 || volume < 0 || low <= 0 || low > Math.min(open, close) || high < Math.max(open, close)) throw new Error("Invalid candle on row " + (i + 1) + ".");
    if (bars.has(time)) throw new Error("Duplicate candle time on row " + (i + 1) + ".");
    bars.set(time, {time, open, high, low, close, volume});
    if (bars.size > limit) throw new Error("CSV exceeds " + limit.toLocaleString() + " candles.");
  }
  if (!bars.size) throw new Error("CSV contains no candle rows.");
  return [...bars.values()].sort((a, b) => a.time - b.time);
}
