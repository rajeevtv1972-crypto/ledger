const source="https://xaus.com/api/v1/intraday?symbol=xau&hours=48";
export async function onRequestGet(){
  try{
    const r=await fetch(source,{signal:AbortSignal.timeout(16000),headers:{Accept:"application/json","User-Agent":"Ledger historical data refresh"},cf:{cacheEverything:true,cacheTtlByStatus:{"200-299":90,"400-599":0}}});
    if(!r.ok)return Response.json({error:"Gold sample provider unavailable",upstream:r.status},{status:502,headers:{"cache-control":"no-store"}});
    const d=await r.json();
    if(d.symbol!=="xau"||!Array.isArray(d.points)||d.points.length>800)throw Error("Unexpected response");
    return Response.json(d,{headers:{"cache-control":"public, max-age=90","x-content-type-options":"nosniff"}});
  }catch{return Response.json({error:"Gold sample provider unavailable"},{status:502,headers:{"cache-control":"no-store"}})}
}
