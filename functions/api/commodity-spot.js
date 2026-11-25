const mapping=Object.freeze({XAGUSD:"XAG",PLATINUM:"XPT"});
const headers={"x-content-type-options":"nosniff","cache-control":"no-store"};
export function metalQuote(raw,asset,now=Math.floor(Date.now()/1000)){
 const t=Math.floor(Date.parse(raw?.updatedAt)/1000),price=raw?.price;
 return raw?.symbol===asset&&raw.currency==="USD"&&Number.isFinite(price)&&price>0&&Number.isSafeInteger(t)&&t<=now+30&&t>=now-120?{t,price}:null;
}
export async function onRequestGet({request}){
 const symbol=new URL(request.url).searchParams.get("symbol");
 if(!Object.hasOwn(mapping,symbol))return Response.json({error:"No spot quote for this symbol"},{status:400,headers});
 const asset=mapping[symbol];
 try{
  const r=await fetch("https://api.gold-api.com/price/"+asset,{signal:AbortSignal.timeout(6500),headers:{Accept:"application/json"}});
  if(!r.ok)throw Error("Provider unavailable");
  return Response.json({quote:metalQuote(await r.json(),asset)},{headers:{...headers,"cache-control":"public, max-age=30"}});
 }catch{return Response.json({error:"Metal spot source unavailable"},{status:502,headers})}
}
