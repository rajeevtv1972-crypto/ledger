import {parseWorkbook,workbookUrl} from "../_lib/pink-sheet.js";
const SOURCE="https://www.worldbank.org/en/research/commodity-markets";
const init={cf:{cacheEverything:true,cacheTtl:900}};
export async function onRequestGet({request,waitUntil}){
 let stage="cache",upstreamStatus=null;
 try{
  // Cache only validated responses, at the edge. Refreshing a browser never pins a snapshot.
  const key=new Request(new URL("/api/commodity-monthly",request.url)), cache=globalThis.caches?.default;
  if(cache){const hit=await cache.match(key);if(hit)return hit}
  stage="index";
  const options={...init,signal:AbortSignal.timeout(8000)};
  const page=await fetch(SOURCE,options).catch(()=>null);
  let url;
  if(page?.ok)try{url=workbookUrl(await page.text())}catch{}
  if(!url)url="https://thedocs.worldbank.org/en/doc/74e8be41ceb20fa0da750cda2f6b9e4e-0050012026/related/CMO-Historical-Data-Monthly.xlsx";
  stage="workbook";
  const xlsx=await fetch(url,{signal:AbortSignal.timeout(14000),headers:{Accept:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, */*;q=0.1","User-Agent":"Ledger historical data refresh"}});
  upstreamStatus=xlsx.status;
  if(!xlsx.ok||Number(xlsx.headers.get("content-length"))>5e6)throw Error("Workbook unavailable");
  stage="download";
  const buffer=await xlsx.arrayBuffer();
  if(buffer.byteLength>5e6)throw Error("Workbook too large");
  stage="parse";
  const data=await parseWorkbook(buffer), result=Response.json({...data,checkedAt:new Date().toISOString()},{headers:{"cache-control":"public, max-age=900","x-content-type-options":"nosniff"}});
  if(cache&&waitUntil)waitUntil(cache.put(key,result.clone()).catch(()=>{}));
  return result;
 }catch{return Response.json({error:"World Bank benchmark source temporarily unavailable.",stage,upstreamStatus},{status:502,headers:{"cache-control":"no-store"}})}
}
