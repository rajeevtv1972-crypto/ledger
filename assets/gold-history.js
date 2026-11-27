import {parseCandleCsv} from "./candle-csv.js";

const upstream = "https://raw.githubusercontent.com/sepaulresearch/market-datasets/8a133f5bf704babc4633ed76afb4e9a85aa184ae/data/xauusd/xauusd_raw_spread_multitf.zip";
const decoder = new TextDecoder();
export const firstGoldMonth = "2021-01";
export const lastGoldMonth = "2026-10";
const indexes = new Map();

const newest = new Map();
const valid = month => /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month >= firstGoldMonth && month <= lastGoldMonth;
const decompress = async (data, format) => new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream(format))).arrayBuffer());

async function readRange(fetcher, start, end, signal) {
  signal?.throwIfAborted();
  const request = new AbortController();
  const combined = signal ? AbortSignal.any([signal, request.signal]) : request.signal;
  const read = async url => {
    combined.throwIfAborted();
    const r = await fetcher(url, {headers:{Range:"bytes=" + start + "-" + end},signal:combined});
    // Never stream the full archive if a host ignores Range.
    if (r.status !== 206) { await r.body?.cancel(); throw Error("Range unavailable"); }
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.length !== end-start+1) throw Error("Unexpected Gold range");
    return bytes;
  };
  let startBackup, timer, started = false;
  const backup = new Promise(resolve => {
    startBackup = () => {
      if(started)return;
      started = true;
      clearTimeout(timer);
      resolve(read("/api/gold-history-range?start=" + start + "&end=" + end));
    };
    timer = setTimeout(startBackup, 8000);
  });
  try {
    // A stalled direct connection must not use up the entire shared budget before
    // the existing same-origin fallback gets a turn. Keep the direct request alive.
    const primary = read(upstream).catch(error => { startBackup(); throw error; });
    return await Promise.any([primary, backup]);
  } catch (error) {
    signal?.throwIfAborted();
    throw Error("The archive provider did not return the requested range.", {cause:error});
  } finally {
    clearTimeout(timer);
    // Stop the slower request and suppress accidental fallback after primary success.
    started = true;
    request.abort();
  }
}

const reverse = (v, count) => {
  let out=0;
  for (let i=0;i<count;i++) { out=(out<<1)|(v&1);v>>=1; }
  return out;
};

export async function decodeGoldRange(bytes, entry) {
  // A fixed-Huffman block restores the original ZIP dictionary. Padding literals
  // go before the 32 KiB window, so the original stream's references are unchanged.
  const dict=Uint8Array.from(atob(entry.dict),c=>c.charCodeAt(0));
  const from=entry.startBit%8, length=entry.endBit-entry.startBit;
  let prefix=10;
  for (const b of dict) prefix+=b<144?8:9;
  const padding=(from-prefix%8+8)%8;
  const result=new Uint8Array(Math.ceil((prefix+padding*9+length+10)/8));
  let at=0,buffer=0,bits=0;
  const put=(value,n)=>{
    buffer|=value<<bits;bits+=n;
    while(bits>=8){result[at++]=buffer&255;buffer>>>=8;bits-=8;}
  };
  const lit=b=>{if(b<144)put(reverse(48+b,8),8);else put(reverse(400+b-144,9),9);};
  put(2,3);
  for(let i=0;i<padding;i++)lit(160);
  for(const b of dict)lit(b);
  put(0,7);
  let remaining=length;
  if(from){const n=Math.min(remaining,8-from);put((bytes[0]>>from)&((1<<n)-1),n);remaining-=n;}
  let i=from?1:0;
  // Input alignment is preserved, including any stored DEFLATE blocks.
  for(;remaining>=8;remaining-=8)put(bytes[i++],8);
  if(remaining)put(bytes[i]&((1<<remaining)-1),remaining);
  if(!entry.zipFinal){put(3,3);put(0,7);}
  if(bits)result[at++]=buffer&255;
  const inflated=await decompress(result.subarray(0,at),"deflate-raw");
  const skip=dict.length+padding;
  if(inflated.length!==skip+entry.inflateSize)throw Error("Gold data length mismatch");
  const rows=inflated.subarray(skip+entry.startRowOffset,skip+entry.endRowOffset);
  const digest=[...new Uint8Array(await crypto.subtle.digest("SHA-256",rows))].map(x=>x.toString(16).padStart(2,"0")).join("");
  if(digest!==entry.sha256)throw Error("Gold data verification failed");
  return rows;
}

export async function loadGoldMonth(month, signal, fetcher=fetch) {
  if(!valid(month))throw Error("Choose a month between January 2021 and October 2026.");
  if(newest.has(month))return newest.get(month);
  const year=month.slice(0,4);
  let index=indexes.get(year);
  if(!index){
    const r=await fetcher("/assets/data/gold-index/"+year+".bin",{signal});
    if(!r.ok)throw Error("Gold archive index unavailable");
    index=JSON.parse(decoder.decode(await decompress(await r.arrayBuffer(),"gzip")));
    indexes.set(year,index);
  }
  const entry=index[month];
  if(!entry||entry.rows>36000)throw Error("Invalid Gold archive month");
  const start=Math.floor(entry.startBit/8),end=Math.ceil(entry.endBit/8)-1;
  const raw=await decodeGoldRange(await readRange(fetcher,start,end,signal),entry);
  const original=decoder.decode(raw).trimEnd().split(/\r?\n/);
  const csv="time,open,high,low,close,tick_volume\n"+original.map(line=>line.split(",").slice(0,6).join(",")).join("\n")+"\n";
  const bars=parseCandleCsv(csv,36000);
  if(bars.length!==entry.rows||new Date(bars[0].time*1000).toISOString().slice(0,7)!==month||signal?.aborted)throw Error("Incomplete Gold archive month");
  const result={csv,bars,month};
  newest.set(month,result);
  while(newest.size>2)newest.delete(newest.keys().next().value);
  return result;
}


// The Date picker supplies midnight IST. Archive files instead follow UTC months.
export async function loadGoldDate(start, signal, loadMonth=loadGoldMonth) {
  const end=start+86400;
  const utcMonth=t=>new Date(t*1000).toISOString().slice(0,7);
  for(const month of new Set([utcMonth(start),utcMonth(end-1)])){
    if(!valid(month))continue;
    const archive=await loadMonth(month,signal);
    const first=archive.bars.find(bar=>bar.time>=start && bar.time<end);
    if(first)return {archive,first};
  }
  return null;
}
