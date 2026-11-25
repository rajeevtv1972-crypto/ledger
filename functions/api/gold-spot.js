import {spotQuote} from "../../assets/gold-live.js";
const upstream="https://xaus.com/api/v1/spot?compact=1";
export async function onRequestGet(){
  try{
    const r=await fetch(upstream,{signal:AbortSignal.timeout(5500),headers:{Accept:"application/json"}});
    if(!r.ok)throw Error("Source unavailable");
    const quote=spotQuote(await r.json());
    // The timestamp remains available so that browsers can detect stale caches.
    return Response.json({quote},{headers:{"cache-control":"public, max-age=60","x-content-type-options":"nosniff"}});
  }catch{return Response.json({error:"Gold quote unavailable"},{status:502,headers:{"cache-control":"no-store","x-content-type-options":"nosniff"}})}
}
