import {readRecentECB} from "../../assets/forex-rates.js";
const source="https://www.ecb.europa.eu/stats/eurofxref/eurofxref-hist-90d.xml";

export async function onRequestGet(){
  try {
    const r=await fetch(source,{signal:AbortSignal.timeout(7000),cf:{cacheEverything:true,cacheTtl:900}});
    if(!r.ok)throw Error();
    const rows=readRecentECB(await r.text());
    if(rows.length<20||rows.length>95)throw Error();
    return Response.json({rows,source:"European Central Bank"},{headers:{"Cache-Control":"public,max-age=300,s-maxage=900,stale-while-revalidate=3600","X-Content-Type-Options":"nosniff"}});
  }catch{return Response.json({error:"ECB reference rates temporarily unavailable"},{status:502,headers:{"Cache-Control":"no-store"}})}
}
