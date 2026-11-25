// Same-origin fallback for browsers that cannot fetch the pinned public ZIP directly.
const source = "https://raw.githubusercontent.com/sepaulresearch/market-datasets/8a133f5bf704babc4633ed76afb4e9a85aa184ae/data/xauusd/xauusd_raw_spread_multitf.zip";
export async function onRequestGet({request}) {
  const q=new URL(request.url).searchParams,s=q.get("start"),e=q.get("end");
  if(!/^\d{1,8}$/.test(s??"")||!/^\d{1,8}$/.test(e??""))return new Response("Invalid archive range",{status:400});
  const start=Number(s),end=Number(e);
  if(start<43||end<start||end>32704702||end-start>=1048576)return new Response("Invalid archive range",{status:400});
  try {
    const r=await fetch(source,{headers:{Range:"bytes="+start+"-"+end},signal:AbortSignal.timeout(12000)});
    if(r.status!==206||r.headers.get("content-range")!=="bytes "+start+"-"+end+"/48425825"){
      await r.body?.cancel();
      return new Response("Source range unavailable",{status:502});
    }
    return new Response(r.body,{status:206,headers:{"Content-Type":"application/octet-stream","Content-Range":r.headers.get("content-range"),"Cache-Control":"public,max-age=31536000,immutable","X-Content-Type-Options":"nosniff"}});
  }catch{return new Response("Source range unavailable",{status:502})}
}
