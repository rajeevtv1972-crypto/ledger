const columns={XAUUSD:"Gold",XAGUSD:"Silver",PLATINUM:"Platinum",COPPER:"Copper",USOIL:"Crude oil, WTI",UKOIL:"Crude oil, Brent",NATGAS:"Natural gas, US",MAIZE:"Maize",WHEATSRW:"Wheat, US SRW",SOYBEANSPOT:"Soybeans",COCOA:"Cocoa",COFFEE:"Coffee, Arabica",ALUMINUM:"Aluminum",NICKEL:"Nickel",ZINC:"Zinc"};
const decoder=new TextDecoder(), limit=8*1024*1024;
const attrs=(tag,k)=>tag.match(new RegExp('(?:^|\\s)'+k+'="([^"]*)"'))?.[1];
const decode=s=>s.replace(/&(amp|lt|gt|quot|apos);/g,(_,k)=>({amp:"&",lt:"<",gt:">",quot:'"',apos:"'"}[k]));
const strings=xml=>[...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(m=>text(m[1]));
const text=xml=>[...xml.matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)].map(m=>decode(m[1])).join("");
export function workbookUrl(html){
 const m=html.match(/https:\/\/thedocs\.worldbank\.org\/en\/doc\/[a-z0-9-]+\/related\/CMO-Historical-Data-Monthly\.xlsx/i);
 if(!m)throw Error("Missing official workbook link");
 return m[0];
}
function zipIndex(bytes){
 const d=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u=(i)=>d.getUint32(i,true),s=i=>d.getUint16(i,true);
 let p=bytes.length-22;while(p>=Math.max(0,bytes.length-65557)&&!(u(p)===0x06054b50&&p+22+s(p+20)===bytes.length))p--;
 if(p<Math.max(0,bytes.length-65557))throw Error("Invalid workbook archive");
 let files=new Map(),c=u(p+16),total=s(p+10);
 if(total>500)throw Error("Unexpected workbook archive");
 for(let j=0;j<total;j++){
  if(u(c)!==0x02014b50)throw Error("Invalid directory");
  const nn=s(c+28),x=s(c+30),comment=s(c+32);
  const name=decoder.decode(bytes.subarray(c+46,c+46+nn));
  files.set(name,{size:u(c+24),packed:u(c+20),method:s(c+10),offset:u(c+42)});c+=46+nn+x+comment;
 }
 return async(name,optional=false)=>{
  const f=files.get(name);if(!f&&optional)return "";if(!f||f.size>limit||u(f.offset)!==0x04034b50)throw Error("Invalid workbook entry");
  const start=f.offset+30+s(f.offset+26)+s(f.offset+28);if(start+f.packed>bytes.length)throw Error("Truncated workbook entry");
  const raw=bytes.subarray(start,start+f.packed);if(f.method===0&&raw.length===f.size)return decoder.decode(raw);
  if(f.method!==8)throw Error("Unknown workbook encoding");
  const reader=new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader(),output=new Uint8Array(f.size);
  let at=0;try{for(;;){const {done,value}=await reader.read();if(done)break;if(at+value.length>output.length)throw Error("Invalid expanded workbook size");output.set(value,at);at+=value.length}}finally{await reader.cancel()}
  if(at!==f.size)throw Error("Incomplete workbook data");return decoder.decode(output);
 };
}
export async function parseWorkbook(buffer){
 const get=zipIndex(new Uint8Array(buffer));
 const [book, rels, shared]=await Promise.all([get("xl/workbook.xml"),get("xl/_rels/workbook.xml.rels"),get("xl/sharedStrings.xml",true)]);
 const tag=[...book.matchAll(/<sheet\s+([^>]+)>/g)].find(m=>attrs(m[1],"name")==="Monthly Prices");
 const id=tag&&attrs(tag[1],"r:id"),rel=[...rels.matchAll(/<Relationship\s+([^>]+)>/g)].find(m=>id&&attrs(m[1],"Id")===id);
 const target=rel&&attrs(rel[1],"Target");if(!target||! /^(?:\/xl\/)?worksheets\/sheet\d+\.xml$/.test(target))throw Error("Missing price sheet");
 const sheet=await get(target.startsWith("/")?target.slice(1):"xl/"+target), ss=strings(shared), months=[], prices=Object.fromEntries(Object.keys(columns).map(k=>[k,[]]));
 let refs=null;
 for(const row of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)){
  const cells={};
  for(const m of row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)){
   if(!m[2])continue;
   const col=attrs(m[1],"r")?.match(/^[A-Z]+/)?.[0];if(!col||refs&&col!=="A"&&!refs.used.has(col))continue;
   const v=m[2].match(/<v>([^<]*)<\/v>/)?.[1], type=attrs(m[1],"t");
   cells[col]=type==="s"?ss[Number(v)]:type==="inlineStr"?text(m[2]):type==="e"||v===undefined?null:Number(v);
  }
  if(!refs&&Object.values(cells).includes("Gold")){
   const map=Object.fromEntries(Object.entries(columns).map(([k,n])=>[k,Object.keys(cells).find(c=>cells[c]===n)]));
   if(Object.values(map).some(x=>!x))throw Error("Unexpected price headers");
   refs={map,used:new Set(Object.values(map))};continue;
  }
  const m=typeof cells.A==="string"&&cells.A.match(/^(\d{4})M(0[1-9]|1[0-2])$/);if(!m||!refs)continue;
  const stamp=m[1]+"-"+m[2];if(months.length&&stamp<=months.at(-1))throw Error("Invalid month order");months.push(stamp);
  for(const [k,c] of Object.entries(refs.map))prices[k].push(Number.isFinite(cells[c])?Math.round(cells[c]*1e6)/1e6:null);
 }
 if(months.length<700||Object.values(prices).some(a=>a.filter(Number.isFinite).length<100))throw Error("Incomplete price history");
 return {months,prices};
}
