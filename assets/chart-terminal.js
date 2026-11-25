(() => {
"use strict";
const $=id=>document.getElementById(id), q=s=>[...document.querySelectorAll(s)];
const read=(k,d)=>{try{return JSON.parse(localStorage.getItem(k)||"null")??d}catch{return d}};
const save=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch{}};
const commodities={XAUUSD:["Gold spot"],XAGUSD:["Silver spot"],USOIL:["WTI oil"],UKOIL:["Brent oil"],NATGAS:["Natural gas"],COPPER:["Copper"],PLATINUM:["Platinum"],PALLADIUM:["Palladium"],GOLD:["Gold futures"],SILVER:["Silver futures"],CORN:["Corn futures"],WHEAT:["Wheat futures"],SOYBEANS:["Soybean futures"]};
// Benchmarks with no matching exchange series do not pretend to be futures.
for(const [s,n] of Object.entries({MAIZE:"Maize benchmark",WHEATSRW:"U.S. soft red winter wheat",SOYBEANSPOT:"Soybean benchmark",COCOA:"Cocoa benchmark",COFFEE:"Arabica coffee",ALUMINUM:"Aluminum benchmark",NICKEL:"Nickel benchmark",ZINC:"Zinc benchmark"}))commodities[s]=[n];
const benchmarkSymbols=new Set(["XAUUSD","XAGUSD","PLATINUM","COPPER","USOIL","UKOIL","NATGAS","MAIZE","WHEATSRW","SOYBEANSPOT","COCOA","COFFEE","ALUMINUM","NICKEL","ZINC"]);
const fxBenchmarks=new Set(["EURUSD","GBPUSD","USDJPY","GBPJPY","AUDUSD","USDCAD","USDCHF","NZDUSD","EURJPY","EURGBP","USDINR"]);
for(const pair of fxBenchmarks)benchmarkSymbols.add(pair);
const firstArchiveMonth="2021-01",lastArchiveMonth="2026-10";
const validGoldMonth=m=>typeof m==="string"&&/^\d{4}-(0[1-9]|1[0-2])$/.test(m)&&m>=firstArchiveMonth&&m<=lastArchiveMonth;
const initialGoldMonth=new URLSearchParams(location.search).get("month");
let goldMonth=validGoldMonth(initialGoldMonth)?initialGoldMonth:null;
let benchmarkFrame=new URLSearchParams(location.search).get("period"), benchmarkInfo=null, benchmarkModule;
const getBenchmarks=()=>benchmarkModule??=import("/assets/commodity-benchmarks.js?v=5").catch(e=>{benchmarkModule=null;throw e});
const otherMarkets={EURUSD:["Euro / US Dollar","Forex"],GBPUSD:["British Pound / US Dollar","Forex"],USDJPY:["US Dollar / Yen","Forex"],GBPJPY:["British Pound / Yen","Forex"],AUDUSD:["Australian Dollar / US Dollar","Forex"],USDCAD:["US Dollar / Canadian Dollar","Forex"],USDCHF:["US Dollar / Swiss Franc","Forex"],NZDUSD:["New Zealand Dollar / US Dollar","Forex"],EURJPY:["Euro / Yen","Forex"],EURGBP:["Euro / British Pound","Forex"],USDINR:["US Dollar / Indian Rupee","Forex"],DXY:["US Dollar Index","Indices"],SPX:["S&P 500","Indices"],NDX:["Nasdaq 100","Indices"],DJI:["Dow Jones","Indices"],VIX:["Volatility Index","Indices"],NIFTY:["Nifty 50","Indices"],BANKNIFTY:["Nifty Bank","Indices"],SENSEX:["Sensex","Indices"],FTSE:["FTSE 100","Indices"],DAX:["DAX","Indices"],AAPL:["Apple","Stocks"],MSFT:["Microsoft","Stocks"],NVDA:["Nvidia","Stocks"],TSLA:["Tesla","Stocks"],AMZN:["Amazon","Stocks"],GOOGL:["Alphabet","Stocks"],META:["Meta","Stocks"],RELIANCE:["Reliance Industries","Stocks"],TCS:["Tata Consultancy Services","Stocks"]};
const cryptoNames={BTC:"Bitcoin",ETH:"Ethereum",SOL:"Solana",XRP:"XRP",ADA:"Cardano",DOGE:"Dogecoin",LINK:"Chainlink",AVAX:"Avalanche",XMR:"Monero",KAS:"Kaspa",BNB:"BNB",DOT:"Polkadot",LTC:"Litecoin",TRX:"TRON",SUI:"Sui",SHIB:"Shiba Inu",BCH:"Bitcoin Cash",NEAR:"NEAR",PEPE:"Pepe",UNI:"Uniswap",APT:"Aptos"};
const aliases={XAU:"XAUUSD",XAG:"XAGUSD",WTI:"USOIL",BRENT:"UKOIL",NG:"NATGAS",GC:"GOLD",SI:"SILVER",CL:"USOIL",HG:"COPPER"};
const normalize=s=>{s=String(s||"").trim().toUpperCase().replace(/\s+/g,"");return aliases[s]||s};
const valid=s=>/^[A-Z0-9]{1,15}$/.test(s);
const defaults={theme:"dark",up:"#089981",down:"#f23645",grid:"both",cross:"normal",scale:"normal",zone:"UTC",rsi:14,atr:14,ema:34};let settings={...defaults,...read("ledger_chart_settings_v2",{})};
const prefs=read("ledger_chart_prefs_v1",{})||{}, intervals=[1,5,15,30,60,240,1440,10080], initialUrl=new URLSearchParams(location.search), styles=["candles","line","area","bars","heikin"];
const storedSymbols=(key)=>{const v=read(key,[]);return Array.isArray(v)?v.filter(s=>typeof s==="string"&&valid(s)).slice(0,80):[]};
let favorites=storedSymbols("ledger_favorites_v1"),recents=storedSymbols("ledger_recents_v1");
let symbol=normalize(new URLSearchParams(location.search).get("symbol")||prefs.symbol||"BTC");if(!valid(symbol))symbol="BTC";
let interval=intervals.includes(Number(initialUrl.get("interval")))?Number(initialUrl.get("interval")):intervals.includes(prefs.interval)?prefs.interval:60,
style=styles.includes(initialUrl.get("style"))?initialUrl.get("style"):symbol==="XAUUSD"?"candles":styles.includes(prefs.style)?prefs.style:"candles";
let watch=read("ledger_chart_watch_v1",["BTC","ETH","SOL","XRP","ADA","DOGE","LINK","AVAX","XMR","KAS"]);if(!Array.isArray(watch))watch=["BTC","ETH"];
let all=read("ledger_chart_drawings_v1",{});if(!all||typeof all!=="object"||Array.isArray(all))all={};
let drawings=[],past=[],future=[],selected=-1,tool="cursor",pending=null,preview=null,hidden=false,magnet=false,log=false,data=[],loadedKey="",seq=0,busy=false,overlays=[],series,chart;
let L=window.LightweightCharts;const canvas=$("draw"),ctx=canvas.getContext("2d");
let replayPicking=false,pinnedBar=null,barHover=null,keepDrawing=read("ledger_keep_drawing",false),lockDrawings=read("ledger_lock_drawings",false),dataWindowLines=[];
let imported=null,editDrag=null,boxIndex=-1,textDraft=null,colorDraft=null,shiftDrawing=false,libraryPromise,replayData=null,replayIndex=0,thirdPoint=null;
let liveSocket=null,liveKey="",liveGeneration=0,liveState="idle",lastSocketMessage=0,lastTradeAt=0,liveRetry=null,liveBackoff=1000,liveFrame=0,liveDirty=false,lastRenderedTime=0,lastIndicatorUpdate=0,lastRestSync=0,liveTradeCount=0,liveSeen=new Set(),liveVolumeSeries=null,tradeBuffer=[],syncInProgress=false;
let historyView=false,canvasPainted=false,overlaySignals={},provider="auto",sourceName="",hasHistory=false,nextBefore=null,historyBusy=false,historyEnded=false,historyDelay=0,historyTimer,controller=null,lastPaint=0,lastStatsPaint=-Infinity;const MAX_BARS=20000;
function getLibrary(){if(L?.createChart)return Promise.resolve();if(libraryPromise)return libraryPromise;libraryPromise=(async()=>{for(const url of ["/assets/vendor/lightweight-charts-5.0.8.js"]){try{await new Promise((ok,no)=>{const s=document.createElement("script"),t=setTimeout(()=>{s.remove();no(Error("Library timed out"))},6000);s.src=url;s.onload=()=>{clearTimeout(t);ok()};s.onerror=()=>{clearTimeout(t);s.remove();no(Error("Library unavailable"))};document.head.append(s)});if(window.LightweightCharts?.createChart){L=window.LightweightCharts;return}}catch{}}throw Error("Chart library unavailable")})().catch(e=>{libraryPromise=null;throw e});return libraryPromise}
const prices=[new Intl.NumberFormat("en-US",{maximumFractionDigits:8}),new Intl.NumberFormat("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}),new Intl.NumberFormat("en-US",{minimumFractionDigits:2,maximumFractionDigits:5})];
const price=v=>Number.isFinite(v)?prices[v<1?0:fxBenchmarks.has(symbol)&&!localImport()?2:1].format(v):"—";
const key=()=>symbol+":"+interval;
function preferences(){const u=new URL(location.href);u.searchParams.set("interval",interval);u.searchParams.set("style",style);history.replaceState(null,"",u);save("ledger_chart_prefs_v1",{symbol,interval,style,ind:q("[data-ind]:checked").map(x=>x.dataset.ind)});}
function notify(t){$("status").textContent=t;updateMobileStatus()}
function updateMobileStatus(){const e=$("mobileStatus");if(e)e.textContent=[$("status").textContent,$("tradeInfo").textContent,$("historyInfo").textContent].filter(Boolean).join(" · ");if(e)e.title=e.textContent}
new MutationObserver(updateMobileStatus).observe($("historyInfo"),{childList:true,characterData:true,subtree:true});
function message(t){$("message").textContent=t;$("message").hidden=!t}
function startChart(){if(chart||!L)return;chart=L.createChart($("chart"),{autoSize:true,layout:{background:{type:"solid",color:"#10151d"},textColor:"#9baec1",attributionLogo:true},grid:{vertLines:{color:"#202a37"},horzLines:{color:"#202a37"}},rightPriceScale:{borderColor:"#293444",scaleMargins:{top:.08,bottom:.18}},timeScale:{borderColor:"#293444",timeVisible:true,secondsVisible:false,rightOffset:5,barSpacing:7},crosshair:{mode:L.CrosshairMode.Normal}});
chart.subscribeCrosshairMove(p=>{
 const a=typeof p.time==="number"?data[lowerBound(data,p.time)]:null;
 barHover=a?.time===p.time?a:null;const b=barHover||getPinnedBar()||data.at(-1);showOHLC(b);renderDataWindow(b);
});
makeSeries();applySettings();chart.timeScale().subscribeVisibleLogicalRangeChange(range=>{if(range&&range.from<30&&!historyBusy&&!busy&&!replayData&&hasHistory&&!historyEnded&&!csvOnlyMarket()){clearTimeout(historyTimer);historyTimer=setTimeout(()=>loadOlder(false),280)}});}
function getPinnedBar(){const a=pinnedBar==null?null:data[lowerBound(data,pinnedBar)];return a?.time===pinnedBar?a:null}
function renderDataWindow(a){
 if($("dataPanel").hidden)return;
 $("dataTime").textContent=a?symbol+" · "+new Intl.DateTimeFormat("en-GB",{timeZone:settings.zone,dateStyle:"medium",timeStyle:"short"}).format(new Date(a.time*1000))+" ("+settings.zone+")":"No data loaded";
 const vals=a?(benchmarkMode()?[["Value",a.close]]:[["Open",a.open],["High",a.high],["Low",a.low],["Close",a.close],goldLiveMode()?["Quote samples",a.samples]:[goldArchive()?"Tick count":"Volume",a.volume]]):[];
 if(a)for(const [label,points] of dataWindowLines){const row=points[lowerBound(points,a.time)];if(row?.time===a.time&&Number.isFinite(row.value))vals.push([label,row.value]);}
 const dl=$("dataValues");dl.replaceChildren();for(const [label,value] of vals){const dt=document.createElement("dt"),dd=document.createElement("dd");dt.textContent=label;dd.textContent=price(value);dl.append(dt,dd)}
}
let seriesKind;
function makeSeries(){if(!chart)return;seriesKind=benchmarkMode()?"benchmark":"ohlc";if(series)chart.removeSeries(series);const op={priceLineVisible:true,lastValueVisible:true,priceFormat:{type:"price",precision:2,minMove:.01}};
if(benchmarkMode())series=chart.addSeries(L.LineSeries,{...op,color:"#57d7be",lineWidth:2});
else if(style==="candles"||style==="heikin")series=chart.addSeries(L.CandlestickSeries,{...op,upColor:settings.up,downColor:settings.down,borderVisible:false,wickUpColor:settings.up,wickDownColor:settings.down});
else if(style==="bars")series=chart.addSeries(L.BarSeries,{...op,upColor:settings.up,downColor:settings.down});
else if(style==="area")series=chart.addSeries(L.AreaSeries,{...op,lineColor:"#57d7be",topColor:"#286659",bottomColor:settings.theme==="light"?"#ffffff":"#131722"});
else series=chart.addSeries(L.LineSeries,{...op,color:"#57d7be"});
series.setData(seriesData());adjustPrecision();}
function seriesData(){if(benchmarkMode())return data.map(a=>({time:a.time,value:a.close}));if(style==="heikin"){let prev;return data.map(a=>{const close=(a.open+a.high+a.low+a.close)/4,open=prev?(prev.open+prev.close)/2:(a.open+a.close)/2;return prev={time:a.time,open,close,high:Math.max(a.high,open,close),low:Math.min(a.low,open,close)}})}return style==="line"||style==="area"?data.map(a=>({time:a.time,value:a.close})):data.map(({time,open,high,low,close})=>({time,open,high,low,close}));}
function adjustPrecision(){if(!series||!data.length)return;const p=Math.abs(data.at(-1).close)||1,precision=benchmarkMode()&&fxBenchmarks.has(symbol)?5:p>=1?2:Math.min(8,Math.max(3,Math.ceil(-Math.log10(p))+3));series.applyOptions({priceFormat:{type:"price",precision,minMove:10**(-precision)}})}
function rollingMean(values,n){
 let sum=0,finite=0;return values.map((x,i)=>{
  if(Number.isFinite(x)){sum+=x;finite++;}
  if(i>=n&&Number.isFinite(values[i-n])){sum-=values[i-n];finite--;}
  return finite===n?sum/n:NaN;
 });
}
function indicatorData(){if(!chart)return;for(const s of overlays)chart.removeSeries(s);overlays=[];dataWindowLines=[];liveVolumeSeries=null;const enabled=new Set(q("[data-ind]:checked:not(:disabled)").map(x=>x.dataset.ind));overlaySignals={fvg:enabled.has("fvg"),sweep:enabled.has("sweep"),liveIndicators:[...enabled].some(x=>!["vol","fvg","sweep"].includes(x))};
function line(points,color,title="",pane=0){const s=chart.addSeries(L.LineSeries,{color,title,lineWidth:1,priceLineVisible:false,lastValueVisible:false,crosshairMarkerVisible:false},pane);s.setData(points);overlays.push(s);if(title)dataWindowLines.push([title,points])}
if(enabled.has("vol")){const v=chart.addSeries(L.HistogramSeries,{priceScaleId:"",priceFormat:{type:"volume"},priceLineVisible:false,lastValueVisible:false});v.priceScale().applyOptions({scaleMargins:{top:.83,bottom:0}});v.setData(data.map(a=>({time:a.time,value:a.volume,color:a.close>=a.open?"#25be9560":"#f0607260"})));overlays.push(v);liveVolumeSeries=v}
for(const [name,n,color] of [["ema20",20,"#f4b85b"],["ema50",50,"#8bb5ff"]])if(enabled.has(name)){let last;line(data.map(a=>({time:a.time,value:last=last===undefined?a.close:last+(a.close-last)*2/(n+1)})),color,"EMA "+n)}
if(enabled.has("sma200"))line(rollingMean(data.map(a=>a.close),200).slice(199).map((value,i)=>({time:data[i+199].time,value})),"#bb8af2","SMA 200");
if(enabled.has("bb")){let bands=data.slice(19).map((a,i)=>{let arr=data.slice(i,i+20),m=arr.reduce((s,x)=>s+x.close,0)/20,sd=Math.sqrt(arr.reduce((s,x)=>s+(x.close-m)**2,0)/20);return {time:a.time,m,hi:m+2*sd,lo:m-2*sd}});for(const k of ["m","hi","lo"])line(bands.map(a=>({time:a.time,value:a[k]})),"#6b9ace")}
const C=data.map(a=>a.close),H=data.map(a=>a.high),Lo=data.map(a=>a.low),V=data.map(a=>a.volume);
if(!C.length)return;
const E=(a,n)=>{let p;return a.map(x=>p=p===undefined?x:p+(x-p)*2/(n+1))},S=rollingMean,W=(a,n)=>{let p;return a.map((x,i)=>i<n-1?NaN:i===n-1?(p=a.slice(0,n).reduce((s,v)=>s+v,0)/n):(p=(p*(n-1)+x)/n))},P=a=>a.flatMap((v,i)=>Number.isFinite(v)?[{time:data[i].time,value:v}]:[]);let pane=0;
const plot=(a,color,title="",p=0)=>line(P(a),color,title,p),level=(v,p)=>plot(C.map(()=>v),"#657183","",p);
for(const [n,color] of [[9,"#f3b75d"],[21,"#9ea8ff"],[100,"#e4a6d3"],[200,"#60d8bc"]])if(enabled.has("ema"+n))plot(E(C,n),color,"EMA "+n);
for(const n of [20,50,100])if(enabled.has("sma"+n))plot(S(C,n),"#8cb6ea","SMA "+n);
if(enabled.has("customema"))plot(E(C,settings.ema),"#e4c263","EMA "+settings.ema);
if(enabled.has("vwap")){let pv=0,v=0,day=-1;plot(data.map(a=>{let d=Math.floor(a.time/86400);if(d!==day){day=d;pv=0;v=0}pv+=(a.high+a.low+a.close)/3*a.volume;v+=a.volume;return v?pv/v:NaN}),"#de9dff","VWAP")}
if(enabled.has("donchian")){plot(H.map((_,i)=>i<19?NaN:Math.max(...H.slice(i-19,i+1))),"#d6ab69","DC high");plot(Lo.map((_,i)=>i<19?NaN:Math.min(...Lo.slice(i-19,i+1))),"#d6ab69","DC low")}
if(enabled.has("rsi")){let g=W(C.map((x,i)=>i?Math.max(0,x-C[i-1]):0),settings.rsi),l=W(C.map((x,i)=>i?Math.max(0,C[i-1]-x):0),settings.rsi);pane++;plot(g.map((x,i)=>!Number.isFinite(x)?NaN:l[i]===0?x===0?50:100:100-100/(1+x/l[i])),"#b995ff","RSI",pane);level(70,pane);level(30,pane)}
if(enabled.has("macd")){let a=E(C,12),b=E(C,26),m=a.map((x,i)=>x-b[i]),sig=E(m,9);pane++;const s=chart.addSeries(L.HistogramSeries,{priceLineVisible:false,lastValueVisible:false},pane);s.setData(P(m.map((x,i)=>x-sig[i])).map(x=>({...x,color:x.value>=0?"#25be95":"#f06072"})));overlays.push(s);plot(m,"#71b9ff","MACD",pane);plot(sig,"#ffb65a","Signal",pane)}
if(enabled.has("atr")){pane++;plot(W(data.map((a,i)=>i?Math.max(a.high-a.low,Math.abs(a.high-C[i-1]),Math.abs(a.low-C[i-1])):a.high-a.low),settings.atr),"#ecad75","ATR",pane)}
if(enabled.has("stoch")){let k=C.map((x,i)=>{if(i<13)return NaN;let h=Math.max(...H.slice(i-13,i+1)),l=Math.min(...Lo.slice(i-13,i+1));return h===l?50:100*(x-l)/(h-l)});pane++;plot(k,"#75bdff","%K",pane);plot(S(k,3),"#f8b871","%D",pane);level(80,pane);level(20,pane)}
if(enabled.has("obv")){let v=0;pane++;plot(C.map((x,i)=>v+=i?Math.sign(x-C[i-1])*V[i]:0),"#64d8be","OBV",pane)}
if(enabled.has("cci")){let t=data.map(a=>(a.high+a.low+a.close)/3),m=S(t,20);pane++;plot(t.map((x,i)=>{if(i<19)return NaN;let d=t.slice(i-19,i+1).reduce((s,v)=>s+Math.abs(v-m[i]),0)/20;return d?(x-m[i])/(.015*d):0}),"#e5a5e3","CCI",pane);level(100,pane);level(-100,pane)}
if(enabled.has("roc")){pane++;plot(C.map((x,i)=>i<12?NaN:100*(x/C[i-12]-1)),"#81c8ed","ROC",pane);level(0,pane)}
if(pane&&chart.panes){const height=$("chartarea").clientHeight;for(const p of chart.panes().slice(1))p.setHeight(Math.max(60,Math.min(120,Math.floor(height*.45/pane))))}
}
function showOHLC(a){if(benchmarkMode()){$("ohlc").textContent=a?(goldIntraday()?new Date(a.time*1000).toISOString().slice(11,16)+" UTC":new Date(a.time*1000).toISOString().slice(0,10))+" · "+price(a.close):"No observation";return}$("ohlc").textContent=a?"O "+price(a.open)+" H "+price(a.high)+" L "+price(a.low)+" C "+price(a.close):"O — H — L — C —"}
function details(){let a=data.at(-1),p=data.at(-2);if(a&&!replayData)checkAlerts(a.close);$("quote").textContent=a?(benchmarkMode()&&fxBenchmarks.has(symbol)?"":"$")+price((goldLiveMode()&&goldQuote?.p)||a.close):"—";let change=a&&p&&p.close>0?(a.close/p.close-1)*100:null;$("change").textContent=change===null?"":(change>=0?"+":"")+change.toFixed(2)+"%";$("change").className=change>=0?"up":"down";showOHLC(a);$("details").replaceChildren();for(const [label,value] of (benchmarkMode()?[[goldIntraday()?"Last sample":"Published value",a?.close]]:[["Open",a?.open],["High",a?.high],["Low",a?.low],["Close",a?.close],[goldArchive()?"Tick count":"Volume",a?.volume]])){const e=document.createElement("span"),b=document.createElement("b");b.textContent=label;e.append(b,price(value));$("details").append(e)}renderDataWindow(barHover||getPinnedBar()||a)}
const localImport=()=>imported?.symbol===symbol&&imported.interval===interval;
const goldMinutes={"1m":1,"5m":5,"15m":15,"30m":30,"1h":60,"4h":240,day:1440,week:10080};
const goldArchive=()=>symbol==="XAUUSD"&&Object.hasOwn(goldMinutes,benchmarkFrame)&&!localImport();
const goldOverview=()=>goldArchive()&&(benchmarkFrame==="day"||benchmarkFrame==="week");
const goldLiveMode=()=>symbol==="XAUUSD"&&benchmarkFrame==="live-15m"&&!localImport();
const usingImport=()=>localImport()||goldArchive()||goldLiveMode();
const goldFrames=["live-15m","1m","5m","15m","30m","1h","4h","day","week","spot","month","year"];
function showBenchmarkFrames(frames){for(const b of q("[data-bf]")){b.hidden=!frames.includes(b.dataset.bf);b.disabled=false;b.classList.toggle("active",b.dataset.bf===benchmarkFrame)}}
const benchmarkMode=()=>!usingImport()&&benchmarkSymbols.has(symbol);
const drawingKey=()=>benchmarkMode()?"benchmark:"+symbol:symbol;
const goldIntraday=()=>benchmarkMode()&&symbol==="XAUUSD"&&benchmarkFrame==="spot";
const stepSeconds=()=>benchmarkMode()?({spot:300,"5m":300,"15m":900,"30m":1800,"1h":3600,"4h":14400,day:86400,week:604800,month:2629800,year:31557600}[benchmarkFrame]||2629800):interval*60;
const benchmarkRestricted=new Set(["vol","vwap","donchian","atr","stoch","obv","cci","fvg","sweep"]);
function csvOnlyMarket(){return !usingImport()&&!benchmarkMode()&&(Object.hasOwn(commodities,symbol)||Object.hasOwn(otherMarkets,symbol))}
function nativeControls(on){const bm=on&&benchmarkMode();syncReplayControls();$("replay").disabled=!on||goldLiveMode();const archived=on&&goldArchive(),spotCandles=on&&goldLiveMode();document.body.classList.toggle("benchmark-mode",bm);document.body.classList.toggle("gold-archive",archived);$("intervals").hidden=bm||archived||spotCandles;$("benchmarkFrames").hidden=!bm&&!archived&&!spotCandles;$("benchmarkCredit").hidden=(!bm&&!archived&&!spotCandles)||!benchmarkInfo;$("benchmarkExport").hidden=(!bm&&!archived)||!benchmarkInfo;$("goldLicense").hidden=!archived||!benchmarkInfo;$("goldMonthOpen").hidden=!archived||goldOverview();$("goldMonthOpen").disabled=!!replayData;$("alertOpen").title=bm?"Alerts require a live feed":"Price alerts";q(".tools button,.bottom button,[data-ind],#style,#color,#indOpen,#goDate,#settingsOpen,#alertOpen").forEach(b=>b.disabled=!on);$("replayPlay").disabled=!on||!replayData;$("replaySpeed").disabled=!on||!replayData;$("older").disabled=!on||!hasHistory||historyEnded||historyBusy||!!replayData;$("step").disabled=!on||!replayData;$("live").disabled=!on||!replayData;for(const input of q("[data-ind]")){input.disabled=!on||(bm&&benchmarkRestricted.has(input.dataset.ind))||(spotCandles&&["vol","vwap","obv","fvg","sweep"].includes(input.dataset.ind));input.closest("label").title=input.disabled&&(bm||spotCandles)?"Not available for this data source":""}if(spotCandles){$("alertOpen").disabled=true;$("goDate").disabled=true;}if(bm){$("alertOpen").disabled=true;if(data.some(a=>a.close<=0))$("log").disabled=true}
$("chart").style.visibility=on?"visible":"hidden";canvas.style.display=on?"block":"none";}
function showUnavailable(){
  stopLive();controller?.abort();seq++;busy=false;historyBusy=false;hasHistory=false;historyEnded=true;clearTimeout(historyTimer);
  replayData=null;data=[];loadedKey="";if(series)series.setData([]);
  nativeControls(false);details();setLiveStatus("idle");
  $("pair").textContent=symbol+" · "+(commodities[symbol]?.[0]||otherMarkets[symbol]?.[0]||"Market");
  $("source").textContent="No built-in feed";$("historyInfo").textContent="Import candles to see history";
  $("objects").textContent="Import candles for this market to use your saved drawings.";notify("CSV import available");
  message("Ledger does not have a built-in feed for "+symbol+". Import an OHLCV CSV to chart your own history.");
  const button=document.createElement("button");button.textContent="Import CSV";button.onclick=()=>$("importOpen").click();$("message").append(document.createElement("br"),button);
}

// Exchange-matched streaming. REST is the authoritative history and reconciliation feed.
function setLiveStatus(state){liveState=state;const e=$("streamState");if(!e)return;if(e.dataset.state===state)return;e.dataset.state=state;const labels={live:"LIVE · WebSocket",connecting:"Connecting…",polling:"REST · 3s fallback",idle:"Not streaming",benchmark:"Historical · not live",sampled:"Indicative · sampled",sampleStale:"Older samples · not live",goldLive:"Updating · sampled spot",goldLate:"No fresh spot quote",archive:"Historical candles · not live",dateHistory:"Historical view · not live",replay:"Replay · not live",imported:"CSV · not live"};e.textContent=labels[state]||labels.idle;e.title=state==="live"?sourceName+" · trade-driven updates":state==="polling"?"WebSocket unavailable; refreshing public candle endpoint":""}
function stopLive(){liveGeneration++;lastStatsPaint=-Infinity;clearTimeout(liveRetry);liveRetry=null;if(liveFrame)cancelAnimationFrame(liveFrame);liveFrame=0;liveDirty=false;lastRenderedTime=0;const ws=liveSocket;liveSocket=null;if(ws){ws.onopen=ws.onmessage=ws.onclose=ws.onerror=null;try{ws.close()}catch{}}liveKey="";$("tradeInfo").textContent="";lastTradeAt=0;lastSocketMessage=0;liveTradeCount=0;liveSeen.clear();tradeBuffer=[];syncInProgress=false;setLiveStatus("idle")}
function wsConfig(){const product=symbol+"-USD",pair=symbol+"/USD",channel="live_trades_"+symbol.toLowerCase()+"usd";if(provider==="bitstamp")return {url:"wss://ws.bitstamp.net",subscribe:{event:"bts:subscribe",data:{channel}},decode:m=>m.event==="trade"&&m.channel===channel?[{p:Number(m.data.price),q:Number(m.data.amount),t:Number(m.data.microtimestamp)/1e6||Number(m.data.timestamp),id:String(m.data.id)}]:[]};if(provider==="coinbase")return {url:"wss://ws-feed.exchange.coinbase.com",subscribe:{type:"subscribe",product_ids:[product],channels:["matches","heartbeat"]},decode:m=>m.type==="match"&&m.product_id===product?[{p:Number(m.price),q:Number(m.size),t:Date.parse(m.time)/1000,id:String(m.trade_id)}]:[]};if(provider==="kraken")return {url:"wss://ws.kraken.com/v2",subscribe:{method:"subscribe",params:{channel:"trade",symbol:[pair],snapshot:false}},decode:m=>m.channel==="trade"&&m.type==="update"?(m.data||[]).filter(x=>x.symbol===pair).map(x=>({p:Number(x.price),q:Number(x.qty),t:Date.parse(x.timestamp)/1000,id:String(x.trade_id)})):[]};return null}
function startLive(){if(historyView||benchmarkMode()||usingImport()||csvOnlyMarket()||replayData||!data.length||loadedKey!==key())return;const k=key()+":"+provider;if(liveKey===k&&(liveSocket||liveRetry))return;if(liveKey!==k)stopLive();const conf=wsConfig();if(!conf||typeof WebSocket==="undefined"){setLiveStatus("polling");return}liveKey=k;const gen=++liveGeneration;setLiveStatus("connecting");let ws;try{ws=new WebSocket(conf.url)}catch{setLiveStatus("polling");scheduleLive(k,gen);return}liveSocket=ws;lastSocketMessage=Date.now();const timeout=setTimeout(()=>{if(gen===liveGeneration&&liveState!=="live"){try{ws.close()}catch{}setLiveStatus("polling")}},10000);
ws.onopen=()=>{if(gen!==liveGeneration)return;ws.send(JSON.stringify(conf.subscribe));lastSocketMessage=Date.now()};
ws.onmessage=e=>{if(gen!==liveGeneration||replayData||csvOnlyMarket())return;lastSocketMessage=Date.now();let m;try{m=JSON.parse(e.data)}catch{return}if(m.event==="bts:request_reconnect"||m.type==="error"||m.event==="bts:error"||m.success===false){ws.close();return}const rows=conf.decode(m);if(!rows.length)return;clearTimeout(timeout);liveBackoff=1000;setLiveStatus("live");for(const t of rows)applyTrade(t);if(liveDirty&&!liveFrame)liveFrame=requestAnimationFrame(renderLive)};
ws.onerror=()=>{if(gen===liveGeneration){setLiveStatus("polling");try{ws.close()}catch{}}};ws.onclose=()=>{clearTimeout(timeout);if(gen!==liveGeneration)return;liveSocket=null;setLiveStatus("polling");scheduleLive(k,gen)}}
function scheduleLive(k,gen){clearTimeout(liveRetry);liveRetry=setTimeout(()=>{liveRetry=null;if(gen!==liveGeneration||csvOnlyMarket()||replayData||k!==key()+":"+provider)return;startLive()},liveBackoff);liveBackoff=Math.min(30000,liveBackoff*2)}
function candleTime(t){const step=interval*60,offset=step===604800?345600:0;return Math.floor((t-offset)/step)*step+offset}
function applyTrade(t,record=true,priceOnly=false){if(!Number.isFinite(t.p)||t.p<=0||!Number.isFinite(t.t)||!Number.isFinite(t.q)||t.q<0||!data.length)return;if(record){if(t.id!=="undefined"&&liveSeen.has(t.id))return;if(t.id!=="undefined"){liveSeen.add(t.id);if(liveSeen.size>2000)liveSeen.delete(liveSeen.values().next().value)}if(syncInProgress){tradeBuffer.push(t);if(tradeBuffer.length>5000)tradeBuffer.shift()}}const time=candleTime(t.t),last=data.at(-1);if(time<last.time||t.t<lastTradeAt)return;lastTradeAt=t.t;const newBar=time>last.time;if(newBar){data.push({time,open:t.p,high:t.p,low:t.p,close:t.p,volume:t.q});if(data.length>MAX_BARS+1000){data.splice(0,1);historyEnded=true;series.setData(seriesData())}}else{last.high=Math.max(last.high,t.p);last.low=Math.min(last.low,t.p);last.close=t.p;if(!priceOnly)last.volume+=t.q}if(record)liveTradeCount++;liveDirty=true;checkAlerts(t.p)}
function renderLive(now){liveFrame=0;if(!liveDirty||csvOnlyMarket()||replayData||!series||!data.length)return;liveDirty=false;const last=data.at(-1);try{if(style==="heikin"){const n=seriesData();if(lastRenderedTime&&last.time-lastRenderedTime>interval*60)series.setData(n);else series.update(n.at(-1))}else if(lastRenderedTime&&last.time-lastRenderedTime>interval*60){series.setData(seriesData())}else if(style==="line"||style==="area")series.update({time:last.time,value:last.close});else series.update({time:last.time,open:last.open,high:last.high,low:last.low,close:last.close});lastRenderedTime=last.time;if(liveVolumeSeries)liveVolumeSeries.update({time:last.time,value:last.volume,color:last.close>=last.open?"#25be9560":"#f0607260"});if(now-lastIndicatorUpdate>=1500&&overlaySignals.liveIndicators){const range=chart.timeScale().getVisibleLogicalRange();try{indicatorData()}catch{}if(range)chart.timeScale().setVisibleLogicalRange(range);lastIndicatorUpdate=now}if(now-lastStatsPaint<180)return;lastStatsPaint=now;details();historyLabel();const e=$("tradeInfo");if(e)e.textContent="Trades received: "+liveTradeCount.toLocaleString()+" · Last trade "+new Date(lastTradeAt*1000).toLocaleTimeString();if(!historyBusy&&!busy)notify(sourceName+" · Streaming")}catch(e){console.warn("Live candle",e)}}
function mergeBars(old,rows){return [...new Map([...old,...rows].map(a=>[a.time,a])).values()].sort((a,b)=>a.time-b.time)}
function historyLabel(){$("csvExport").disabled=!data.length;$("csvExport").hidden=benchmarkMode()||goldArchive()||goldLiveMode();const first=data[0]?.time,last=data.at(-1)?.time;if(!first||!last){$("historyInfo").textContent="No candle history";$("older").disabled=true;return}const fmt=t=>new Date(t*1000).toISOString().slice(0,10);if(goldLiveMode()){$("historyInfo").textContent=data.length+" sampled bars · "+fmt(first)+" to "+fmt(last);return}if(benchmarkMode()){$("historyInfo").textContent=data.length.toLocaleString()+" observations · "+fmt(first)+" to "+fmt(last)+" · "+(replayData?"Replay":"All available history loaded");$("older").disabled=true;return}$("historyInfo").textContent=data.length.toLocaleString()+" bars · "+fmt(first)+" to "+fmt(last)+(usingImport()?(replayData?" · Replay":" · CSV history"):historyEnded?" · End of loaded window":!hasHistory?" · Exchange history limited":historyView?" · Date window":" · Scroll left for older candles");$("older").disabled=historyBusy||!hasHistory||historyEnded||!!replayData;}
function updateChart(range){adjustPrecision();series.setData(seriesData());lastRenderedTime=data.at(-1)?.time||0;try{indicatorData()}catch(e){console.warn("Indicator rendering",e)}details();if(range)chart.timeScale().setVisibleLogicalRange(range);historyLabel();}
async function getCandles(params,signal){const url="/api/candles?"+new URLSearchParams({symbol,interval:String(interval),...params});const r=await fetch(url,{signal});const p=await r.json();if(!r.ok||!Array.isArray(p.candles))throw Error(p.error||"Candle data unavailable");return p;}
async function loadOlder(manual=true){if(csvOnlyMarket()||replayData||busy||historyBusy||!hasHistory||historyEnded||!nextBefore||!data.length)return;if(!manual&&Date.now()<historyDelay)return;const ticket=seq,k=key(),cursor=nextBefore;historyBusy=true;historyLabel();notify("Loading earlier candles…");
try{const p=await getCandles({provider,before:String(cursor)},AbortSignal.timeout(18000));if(ticket!==seq||k!==key())return;if(p.provider!==provider)throw Error("History feed changed");const oldStart=data[0].time,oldRange=chart.timeScale().getVisibleLogicalRange(),rows=p.candles.filter(a=>a.time<oldStart);if(!rows.length||!p.nextBefore||p.nextBefore>=cursor){historyEnded=true;notify("No earlier candles available from this feed");return}data=mergeBars(rows,data);nextBefore=p.nextBefore;if(data.length>=MAX_BARS)historyEnded=true;const added=data.findIndex(a=>a.time===oldStart);updateChart(oldRange?{from:oldRange.from+added,to:oldRange.to+added}:null);notify("Loaded "+added+" earlier bars · "+sourceName);if(manual&&added>0&&oldRange){const shift=Math.min(added,80);chart.timeScale().setVisibleLogicalRange({from:oldRange.from+added-shift,to:oldRange.to+added-shift})}}catch(e){if(ticket===seq){historyDelay=Date.now()+10000;notify("History request failed · retry Load older")}}finally{if(ticket===seq){historyBusy=false;historyLabel()}}}
async function load(reset=false){if(goldLiveMode()){if(reset)await loadGoldLive();return}if(goldArchive()){if(reset)await loadGoldArchive();return}if(localImport()){if(reset)await loadImported();return}if(benchmarkMode()){if(reset)await loadBenchmark();return}if(csvOnlyMarket()){if(reset)showUnavailable();return}if(replayData&&!reset)return;if((busy||historyBusy)&&!reset)return;const n=++seq,k=key(),fresh=loadedKey!==k||!data.length;lastRestSync=Date.now();controller?.abort();controller=new AbortController();const ctrl=controller,timer=setTimeout(()=>ctrl.abort(),22000);busy=true;historyBusy=false;clearTimeout(historyTimer);
try{if(!L){message("Starting chart engine…");await getLibrary()}if(n!==seq)return;startChart();if(seriesKind==="benchmark"){makeSeries();applySettings()}if(!series)throw Error("Chart series unavailable");nativeControls(true);$("pair").textContent=symbol+" / USD";
if(fresh){stopLive();provider="auto";sourceName="";hasHistory=false;historyEnded=false;nextBefore=null;historyDelay=0;data=[];series.setData([]);try{indicatorData()}catch{}details();message("Loading "+symbol+" candles…");historyLabel();}
syncInProgress=true;tradeBuffer=[];const snapshotStart=Date.now()/1000;const p=await getCandles({provider,mode:fresh?"initial":"latest"},ctrl.signal);if(n!==seq)return;const pendingTrades=tradeBuffer.slice();syncInProgress=false;tradeBuffer=[];if(!p.candles.length)throw Error("No candles returned");
const oldRange=chart.timeScale().getVisibleLogicalRange(),oldLength=data.length,following=oldRange&&oldRange.to>=oldLength-2;const existing=new Map(data.slice(-1000).map(a=>[a.time,a]));const changed=fresh||p.candles.some(a=>{const z=existing.get(a.time);return !z||z.open!==a.open||z.high!==a.high||z.low!==a.low||z.close!==a.close||z.volume!==a.volume});provider=p.provider||"kraken";sourceName=p.source||"Market feed";hasHistory=!!p.historyAvailable;if(fresh)nextBefore=p.nextBefore||null;
if(changed){data=mergeBars(fresh?[]:data,p.candles);if(fresh){updateChart(null);chart.timeScale().setVisibleLogicalRange({from:Math.max(0,data.length-100),to:data.length+5})}else{const count=data.length-oldLength;updateChart(oldRange?{from:oldRange.from+(following?count:0),to:oldRange.to+(following?count:0)}:null)}}else historyLabel();
if(pendingTrades.length&&liveState==="live"){lastTradeAt=0;for(const t of pendingTrades)if(t.t>=snapshotStart)applyTrade(t,false,t.t<=Date.now()/1000&&candleTime(t.t)<=p.candles.at(-1).time);if(liveDirty&&!liveFrame)liveFrame=requestAnimationFrame(renderLive)}loadedKey=k;message("");$("source").textContent=sourceName+" · USD";lastRestSync=Date.now();nativeControls(true);startLive();if(liveState!=="live"&&!liveSocket)setLiveStatus("polling");if(!liveSocket&&!liveRetry)startLive();if(fresh&&data.length<130&&hasHistory)setTimeout(()=>{if(n===seq)loadOlder(false)},400)}catch(e){if(n!==seq)return;if(!data.length){nativeControls(true);hasHistory=false;historyLabel();setLiveStatus("idle");message("No Ledger candles available for "+symbol+". Retry or import CSV.");notify("Market feed unavailable");return}message("");notify("Refresh unavailable · showing last loaded candles")}finally{clearTimeout(timer);if(n===seq){busy=false;syncInProgress=false;tradeBuffer=[]}}}
function renderWatch(){const el=$("watch");el.replaceChildren();if(favorites.length){const h=document.createElement("h3");h.textContent="Favorites";el.append(h);for(const s of favorites){const search=$("watchSearch").value.trim().toUpperCase(),x=findSymbol(s);if(search&&!(s+" "+x.n).toUpperCase().includes(search))continue;const row=document.createElement("div"),b=document.createElement("button");row.className="watchrow";b.textContent="★ "+s+" · "+x.n;b.className=s===symbol?"active":"";b.onclick=()=>select(s);row.append(b);el.append(row)}}const filter=$("watchSearch").value.trim().toUpperCase();for(const [title,items] of [["Crypto",watch.filter(s=>valid(s)&&!Object.hasOwn(commodities,s)&&!Object.hasOwn(otherMarkets,s))],["Commodities",Object.keys(commodities)],...["Forex","Indices","Stocks"].map(category=>[category,Object.keys(otherMarkets).filter(s=>otherMarkets[s][1]===category)])]){const h=document.createElement("h3");h.textContent=title;el.append(h);for(const s of items){if(filter&&!(s+" "+(commodities[s]?.[0]||otherMarkets[s]?.[0]||cryptoNames[s]||"")).toUpperCase().includes(filter))continue;const row=document.createElement("div");row.className="watchrow";const a=document.createElement("button");a.textContent=commodities[s]||otherMarkets[s]?s+" · "+(commodities[s]?.[0]||otherMarkets[s][0]):s+"/USD";a.className=s===symbol?"active":"";a.onclick=()=>select(s);row.append(a);if(!commodities[s]&&!otherMarkets[s]){const b=document.createElement("button");b.textContent="×";b.title="Remove from watchlist";b.onclick=()=>{watch=watch.filter(x=>x!==s);save("ledger_chart_watch_v1",watch);renderWatch()};row.append(b)}el.append(row)}}}
function clone(v){return JSON.parse(JSON.stringify(v))}
function saveDraw(){all[drawingKey()]=drawings;save("ledger_chart_drawings_v1",all);renderObjects()}
function changeDraw(fn){past.push(clone(drawings));future=[];fn();selected=-1;saveDraw()}
const boxColor=(color,fallback)=>/^#[0-9a-f]{6}$/i.test(color||"")?color:fallback;
function openBox(i){
 const d=drawings[i];if(d?.type!=="rectangle")return;
 boxIndex=i;selected=i;renderObjects();
 $("boxText").value=d.text||"";$("boxBorder").value=boxColor(d.color,"#57d7be");$("boxFill").value=boxColor(d.fill,d.color||"#57d7be");
 $("boxTextColor").value=boxColor(d.textColor,settings.theme==="light"?"#162132":"#e7edf5");$("boxOpacity").value=Math.round((d.opacity??.18)*100);$("boxMid").checked=d.mid!==false;showDialog("boxDialog");$("boxText").focus();
}
$("boxOptions").onclick=()=>openBox(selected);
function openDrawingText(i,newPoint){
 const existing=drawings[i];if(!newPoint&&existing?.type!=="text")return;
 textDraft={existing,point:newPoint,key:drawingKey()};
 $("drawingTextTitle").textContent=existing?"Edit text":"Add text";
 $("drawingText").value=existing?.text||"";showDialog("drawingTextDialog");$("drawingText").focus();
}
$("drawingTextForm").onsubmit=e=>{
 e.preventDefault();const draft=textDraft,text=$("drawingText").value.trim();if(!text){$("drawingText").focus();return}
 if(!draft||draft.key!==drawingKey())return;
 const i=draft.existing?drawings.indexOf(draft.existing):drawings.length;if(i<0)return;
 changeDraw(()=>{if(draft.existing)drawings[i].text=text;else drawings.push({type:"text",a:draft.point,text,color:$("color").value})});
 setTool(keepDrawing&&!draft.existing?"text":"cursor");chooseDrawing(i);$("drawingTextDialog").close();notify("Chart text saved");
};
$("drawingColorOpen").onclick=()=>{
 const d=drawings[selected];if(!d)return;colorDraft={drawing:d,key:drawingKey()};
 $("drawingColorLabel").textContent=d.type==="rectangle"?"Border color":d.type==="text"?"Text color":"Line color";
 $("drawingColor").value=boxColor(d.color,"#57d7be");showDialog("drawingColorDialog");
};
$("drawingColorForm").onsubmit=e=>{
 e.preventDefault();const draft=colorDraft;if(!draft||draft.key!==drawingKey())return;
 const i=drawings.indexOf(draft.drawing);if(i<0)return;
 changeDraw(()=>drawings[i].color=$("drawingColor").value);chooseDrawing(i);$("drawingColorDialog").close();notify("Drawing color updated");
};
$("boxSave").onclick=()=>{const i=boxIndex,field=$("boxOpacity");if(drawings[i]?.type!=="rectangle"||!field.reportValidity())return;
 const a={text:$("boxText").value.trim(),color:$("boxBorder").value,fill:$("boxFill").value,textColor:$("boxTextColor").value,opacity:Number(field.value)/100,mid:$("boxMid").checked};
 changeDraw(()=>Object.assign(drawings[i],a));selected=i;renderObjects();$("boxDialog").close()};
function syncBoxActions(){
 const d=drawings[selected],show=!csvOnlyMarket()&&!hidden&&!!d,box=d?.type==="rectangle",text=d?.type==="text";
 $("boxActions").hidden=!show;$("boxOptions").hidden=!show||!box;
 $("boxEditText").hidden=!box&&!text;$("boxEditText").textContent=d?.text?"Edit text":"Add text";
 $("boxMove").textContent=box?"Move / resize":"Move";$("boxMove").disabled=!!lockDrawings;
 $("boxMove").setAttribute("aria-pressed",tool==="edit");
}
function chooseDrawing(i){selected=i;renderObjects()}
$("boxEditText").onclick=()=>{if(drawings[selected]?.type==="rectangle")openBox(selected);else openDrawingText(selected)};
$("boxMove").onclick=()=>{setTool(tool==="edit"?"cursor":"edit");if(tool==="edit")notify(drawings[selected]?.type==="rectangle"?"Drag the box to move it, or drag any corner to resize":"Drag a handle to move the drawing")};
$("boxDelete").onclick=()=>{if(!drawings[selected])return;const i=selected;changeDraw(()=>drawings.splice(i,1));setTool("cursor");notify("Drawing deleted · Undo restores it")};
$("boxDismiss").onclick=()=>{setTool("cursor");chooseDrawing(-1)};
function renderObjects(){syncBoxActions();if(csvOnlyMarket())return;const e=$("objects");e.replaceChildren();drawings.forEach((d,i)=>{const row=document.createElement("div");row.className="objectrow";const a=document.createElement("button"),b=document.createElement("button");a.textContent=(i+1)+". "+(d.text||d.type);a.className=selected===i?"active":"";a.onclick=()=>chooseDrawing(i);b.textContent="×";b.title="Delete drawing";b.onclick=()=>changeDraw(()=>drawings.splice(i,1));row.append(a);if(d.type==="rectangle"||d.type==="text"){const c=document.createElement("button");c.textContent="⚙";c.title=d.type==="rectangle"?"Edit box":"Edit text";c.setAttribute("aria-label",c.title+" "+(d.text||i+1));c.onclick=()=>d.type==="rectangle"?openBox(i):openDrawingText(i);row.append(c)}row.append(b);e.append(row)});if(!drawings.length)e.textContent="No drawings yet"}
function select(s,frame){s=normalize(s);if(!valid(s))return;barHover=null;pinnedBar=null;setReplayPicking(false);historyView=false;stopLive();stopPlayback();replayData=null;seq++;busy=false;if(frame!==undefined||symbol!==s)benchmarkFrame=frame??null;
 if(s==="XAUUSD"){
  if(!goldFrames.includes(benchmarkFrame))benchmarkFrame="live-15m";
  if(symbol!==s&&frame===undefined){style="candles";$("style").value=style}
 }
 symbol=s;recents=[s,...recents.filter(x=>x!==s)].slice(0,12);save("ledger_recents_v1",recents);updateStar();$("symbol").value=s;drawings=Array.isArray(all[drawingKey()])?clone(all[drawingKey()]):[];past=[];future=[];selected=-1;setTool("cursor");preferences();const url=new URL(location.href);if(!benchmarkMode()&&!goldArchive()&&!goldLiveMode())url.searchParams.delete("period");if(!goldArchive())url.searchParams.delete("month");url.searchParams.set("symbol",s);url.searchParams.delete("engine");history.replaceState(null,"",url);renderWatch();renderObjects();load(true)}
function setTool(t){if(t==="edit"&&lockDrawings){notify("Drawing positions are locked");return}if(editDrag){drawings=editDrag.before;editDrag=null}tool=t;pending=null;preview=null;thirdPoint=null;q("[data-tool]").forEach(b=>b.classList.toggle("active",b.dataset.tool===t));canvas.classList.toggle("armed",t!=="cursor");syncBoxActions();$("hint").textContent=t==="cursor"?"Crosshair":t==="edit"?"Drag a handle to move a drawing or a box corner to resize":t==="text"?"Tap a box to label it, or tap the chart to add a note":t+" · select point"}
function resize(){const r=canvas.getBoundingClientRect(),d=devicePixelRatio||1;if(canvas.width!==Math.round(r.width*d)||canvas.height!==Math.round(r.height*d)){canvas.width=Math.round(r.width*d);canvas.height=Math.round(r.height*d)}ctx.setTransform(d,0,0,d,0,0);return r}
function point(e){if(!series||!data.length)return null;const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,ts=chart.timeScale();if(x<0||x>ts.width()||y<0||y>(chart.panes?.()[0]?.getHeight?.()||r.height-25))return null;const ix=ts.coordinateToLogical(x),p=series.coordinateToPrice(y);if(ix==null||p==null||!Number.isFinite(p))return null;const i=Math.round(ix);let a=data[i],time=a?.time??(data[0].time+i*stepSeconds()),value=p;if(magnet&&a)value=[a.open,a.high,a.low,a.close].sort((a,b)=>Math.abs(a-p)-Math.abs(b-p))[0];return {time,price:value}}
function lowerBound(bars,t){let lo=0,hi=bars.length;while(lo<hi){const m=(lo+hi)>>1;if(bars[m].time<t)lo=m+1;else hi=m}return lo}
function coords(p){if(!p||!data.length)return null;const first=data[0].time,last=data.at(-1).time;let i;if(p.time<first)i=(p.time-first)/stepSeconds();else if(p.time>last)i=data.length-1+(p.time-last)/stepSeconds();else{let lo=0,hi=data.length-1;while(lo<hi){let mid=(lo+hi)>>1;if(data[mid].time<p.time)lo=mid+1;else hi=mid}i=lo;if(lo>0&&data[lo].time!==p.time)i=lo-1+(p.time-data[lo-1].time)/(data[lo].time-data[lo-1].time)}const x=chart.timeScale().logicalToCoordinate(i),y=series.priceToCoordinate(p.price);return x==null||y==null?null:{x,y}}
function drawOne(d,w,h,highlight=false){const a=coords(d.a),b=coords(d.b||d.a);if(!a||!b)return;ctx.strokeStyle=d.color||"#57d7be";ctx.fillStyle=d.color||"#57d7be";ctx.lineWidth=highlight?3:1.5;ctx.font="12px system-ui";const ln=(x,y,x2,y2)=>{ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x2,y2);ctx.stroke()};
if(d.type==="horizontal"){ln(0,a.y,w,a.y);ctx.fillText(price(d.a.price),8,a.y-5)}
else if(d.type==="hRay"){ln(a.x,a.y,w,a.y);ctx.fillText(price(d.a.price),a.x+4,a.y-5)}
else if(d.type==="arrow"){ln(a.x,a.y,b.x,b.y);let t=Math.atan2(b.y-a.y,b.x-a.x);ln(b.x,b.y,b.x-12*Math.cos(t-.5),b.y-12*Math.sin(t-.5));ln(b.x,b.y,b.x-12*Math.cos(t+.5),b.y-12*Math.sin(t+.5))}
else if(d.type==="long"||d.type==="short"){const z=coords(d.c||d.b);if(!z)return;let x=Math.min(a.x,b.x),ww=Math.max(30,Math.abs(b.x-a.x));ctx.globalAlpha=.25;ctx.fillStyle="#f06072";ctx.fillRect(x,Math.min(a.y,b.y),ww,Math.abs(a.y-b.y));ctx.fillStyle="#25be95";ctx.fillRect(x,Math.min(a.y,z.y),ww,Math.abs(a.y-z.y));ctx.globalAlpha=1;ctx.fillStyle=d.color;ln(x,a.y,x+ww,a.y);ctx.fillText("R:R "+(Math.abs((d.c||d.b).price-d.a.price)/Math.max(1e-12,Math.abs(d.b.price-d.a.price))).toFixed(2),x+4,a.y-6)}
else if(d.type==="vertical")ln(a.x,0,a.x,h);
else if(d.type==="trend")ln(a.x,a.y,b.x,b.y);
else if(d.type==="ray"){const dx=b.x-a.x,dy=b.y-a.y;if(Math.abs(dx)<.001)ln(a.x,a.y,a.x,dy>=0?h:0);else{const end=dx>0?w:0;ln(a.x,a.y,end,a.y+dy*(end-a.x)/dx)}}
else if(d.type==="rectangle"){
 const x=Math.min(a.x,b.x),y=Math.min(a.y,b.y),ww=Math.abs(b.x-a.x),hh=Math.abs(b.y-a.y),mid=y+hh/2;
 ctx.save();ctx.globalAlpha=d.opacity??.18;ctx.fillStyle=d.fill||d.color||"#57d7be";ctx.fillRect(x,y,ww,hh);ctx.globalAlpha=1;ctx.strokeRect(x,y,ww,hh);
 const label=d.text||"",tc=d.textColor||(settings.theme==="light"?"#162132":"#e7edf5"),width=label?Math.min(ww,ctx.measureText(label).width+12):0;ctx.strokeStyle=tc;
 if(d.mid!==false&&ww>width+2){ctx.setLineDash([5,4]);ln(x,mid,x+(ww-width)/2,mid);ln(x+(ww+width)/2,mid,x+ww,mid);ctx.setLineDash([])}
 if(label&&ww>12&&hh>10){ctx.beginPath();ctx.rect(x,y,ww,hh);ctx.clip();ctx.fillStyle=tc;ctx.textAlign="center";ctx.textBaseline="middle";ctx.fillText(label,x+ww/2,mid,ww-10)}
 ctx.restore();
}
else if(d.type==="fib"){for(const f of [0,.236,.382,.5,.618,.786,1]){const y=a.y+(b.y-a.y)*f;ln(Math.min(a.x,b.x),y,Math.max(a.x,b.x),y);ctx.fillText(f+" · "+price(d.a.price+(d.b.price-d.a.price)*f),Math.min(a.x,b.x)+4,y-4)}}
else if(d.type==="measure"){ln(a.x,a.y,b.x,b.y);ctx.fillText((d.a.price>0?((d.b.price/d.a.price-1)*100).toFixed(2)+"% · ":"")+price(d.b.price-d.a.price),Math.min(a.x,b.x)+4,Math.min(a.y,b.y)-8)}
else if(d.type==="text")ctx.fillText(d.text||"",a.x,a.y);
else if(d.type==="channel"){const z=coords(d.c||d.b);if(z){const dx=b.x-a.x;if(Math.abs(dx)>.01){const dy=b.y-a.y,off=z.y-a.y-dy*(z.x-a.x)/dx;ctx.globalAlpha=.12;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(b.x,b.y+off);ctx.lineTo(a.x,a.y+off);ctx.closePath();ctx.fill();ctx.globalAlpha=1;ln(a.x,a.y,b.x,b.y);ln(a.x,a.y+off,b.x,b.y+off);ctx.setLineDash([4,4]);ln(a.x,a.y+off/2,b.x,b.y+off/2);ctx.setLineDash([])}}}
else if(d.type==="fibExt"){const z=coords(d.c||d.b);if(z)for(const f of [0,.618,1,1.272,1.618,2,2.618]){const v=(d.c||d.b).price+(d.b.price-d.a.price)*f,y=series.priceToCoordinate(v);if(y===null)continue;ln(z.x,y,w,y);ctx.fillText(f+" · "+price(v),Math.max(4,z.x+4),y-4)}}
else if(d.type==="avwap"){let weighted=0,volume=0,started=false;ctx.beginPath();for(let i=lowerBound(data,d.a.time);i<data.length;i++){const bar=data[i];weighted+=(bar.high+bar.low+bar.close)/3*bar.volume;volume+=bar.volume;if(!volume)continue;const xy={x:chart.timeScale().logicalToCoordinate(i),y:series.priceToCoordinate(weighted/volume)};if(xy.x==null||xy.y==null)continue;if(xy.x>w&&started){ctx.lineTo(xy.x,xy.y);break}if(!started){ctx.moveTo(xy.x,xy.y);started=true}else ctx.lineTo(xy.x,xy.y)}ctx.stroke();ctx.fillText("AVWAP",a.x+4,a.y-6)}
if(highlight||tool==="edit"){const extras=d.type==="rectangle"?[{x:a.x,y:b.y},{x:b.x,y:a.y}]:[];for(const p of [a,d.b?b:null,d.c?coords(d.c):null,...extras].filter(Boolean)){ctx.beginPath();ctx.arc(p.x,p.y,4,0,Math.PI*2);ctx.fill()}}}
function paintSignals(){if(benchmarkMode()||!data.length)return;const {fvg,sweep}=overlaySignals;if(!fvg&&!sweep)return;const r=chart.timeScale().getVisibleLogicalRange();if(!r)return;const end=Math.min(data.length,Math.ceil(r.to)+3),start=Math.max(2,Math.floor(r.from)-2,end-750);for(let i=start;i<end;i++){const a=data[i],b=data[i-2];if(fvg&&a.time-b.time===2*stepSeconds()){let low,high,col;if(a.low>b.high){low=b.high;high=a.low;col="#25be95"}else if(a.high<b.low){low=a.high;high=b.low;col="#f06072"}if(low!==undefined){const p=coords({time:b.time,price:low}),z=coords({time:a.time,price:high});if(p&&z){ctx.fillStyle=col;ctx.globalAlpha=.2;ctx.fillRect(p.x,Math.min(p.y,z.y),Math.max(4,z.x-p.x),Math.abs(p.y-z.y));ctx.globalAlpha=1}}}if(sweep&&i>=20){let hi=-Infinity,lo=Infinity;for(let j=i-20;j<i;j++){hi=Math.max(hi,data[j].high);lo=Math.min(lo,data[j].low);}for(const [ok,val,col,label] of [[a.high>hi&&a.close<hi,a.high,"#f06072","▼"],[a.low<lo&&a.close>lo,a.low,"#25be95","▲"]])if(ok){const p=coords({time:a.time,price:val});if(p){ctx.fillStyle=col;ctx.font="12px system-ui";ctx.fillText(label,p.x-5,p.y+(label==="▼"?-7:14))}}}}}
function paint(now){
 const active=!document.hidden&&!csvOnlyMarket()&&chart&&series&&!hidden&&data.length&&(drawings.length||pending||overlaySignals.fvg||overlaySignals.sweep);
 if(!active){
  if(canvasPainted){const r=resize();ctx.clearRect(0,0,r.width,r.height);canvasPainted=false;}
  setTimeout(()=>requestAnimationFrame(paint),100);return;
 }
 if(now-lastPaint<40){requestAnimationFrame(paint);return}
 lastPaint=now;canvasPainted=true;
 const r=resize(),w=chart.timeScale().width(),h=chart.panes?.()[0]?.getHeight?.()||r.height-25;
 ctx.clearRect(0,0,r.width,r.height);ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();
 paintSignals();drawings.forEach((d,i)=>drawOne(d,w,h,i===selected));
 if(pending&&preview)drawOne({type:tool,a:pending,b:thirdPoint||straight(pending,preview,shiftDrawing,tool),c:preview,color:$("color").value},w,h);
 ctx.restore();requestAnimationFrame(paint);
}
const snapTools=new Set(["trend","ray","arrow","measure"]);
function straight(origin,p,enabled,type){if(!enabled||!origin||!p||!snapTools.has(type))return p;const a=coords(origin),b=coords(p);if(!a||!b)return p;return Math.abs(b.x-a.x)>=Math.abs(b.y-a.y)?{...p,price:origin.price}:{...p,time:origin.time}}
function boxAt(e){const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;for(let i=drawings.length-1;i>=0;i--){const d=drawings[i];if(d.type!=="rectangle")continue;const a=coords(d.a),b=coords(d.b);if(a&&b&&x>=Math.min(a.x,b.x)-3&&x<=Math.max(a.x,b.x)+3&&y>=Math.min(a.y,b.y)-3&&y<=Math.max(a.y,b.y)+3)return i}return -1}
function drawingAt(e){
 const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
 const w=chart.timeScale().width(),h=chart.panes?.()[0]?.getHeight?.()||r.height-25;
 if(x<0||x>w||y<0||y>h)return -1;
 const tolerance=e.pointerType==="touch"?12:7;
 let best=tolerance,selectedHit=-1;
 const segment=(a,b)=>{
   if(!a||!b)return Infinity;
   const dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy;
   const t=den?Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/den)):0;
   return Math.hypot(x-a.x-t*dx,y-a.y-t*dy);
 };
 const xy=(x,y)=>({x,y}),horizontal=(at,from=0,to=w)=>segment(xy(from,at),xy(to,at));
 for(let i=drawings.length-1;i>=0;i--){
   const d=drawings[i],a=coords(d.a),b=coords(d.b||d.a);if(!a||!b)continue;
   let dist=Infinity;
   switch(d.type){
     case "horizontal":dist=horizontal(a.y);break;
     case "hRay":dist=horizontal(a.y,a.x);break;
     case "vertical":dist=segment(xy(a.x,0),xy(a.x,h));break;
     case "ray":{
       const dx=b.x-a.x,end=dx>0?w:0,dy=b.y-a.y;
       dist=Math.abs(dx)<.001?segment(a,xy(a.x,dy>=0?h:0)):segment(a,xy(end,a.y+dy*(end-a.x)/dx));break;
     }
     case "rectangle":{
       const ab=xy(a.x,b.y),ba=xy(b.x,a.y);
       dist=Math.min(segment(a,ab),segment(ab,b),segment(b,ba),segment(ba,a));break;
     }
     case "text":{
       ctx.save();ctx.font="12px system-ui";const width=ctx.measureText(d.text||"").width;ctx.restore();
       dist=segment(xy(a.x,a.y-5),xy(a.x+width,a.y-5));break;
     }
     case "fib":dist=Math.min(...[0,.236,.382,.5,.618,.786,1].map(f=>horizontal(a.y+(b.y-a.y)*f,a.x,b.x)));break;
     case "fibExt":{
       const c=coords(d.c);if(c)dist=Math.min(...[0,.618,1,1.272,1.618,2,2.618].map(f=>{
         const level=series.priceToCoordinate(d.c.price+(d.b.price-d.a.price)*f);return level==null?Infinity:horizontal(level,c.x);
       }));break;
     }
     case "channel":{
       const c=coords(d.c),dx=b.x-a.x;if(c&&Math.abs(dx)>.01){
         const off=c.y-a.y-(b.y-a.y)*(c.x-a.x)/dx;
         dist=Math.min(...[0,off/2,off].map(o=>segment(xy(a.x,a.y+o),xy(b.x,b.y+o))));
       }break;
     }
     case "long":case "short":{
       const c=coords(d.c),left=Math.min(a.x,b.x),right=left+Math.max(30,Math.abs(a.x-b.x));
       if(c)dist=Math.min(...[a.y,b.y,c.y].map(z=>horizontal(z,left,right)));break;
     }
     case "avwap":{
       let sum=0,vol=0,prev=null;
       for(let j=lowerBound(data,d.a.time);j<data.length;j++){
         const bar=data[j];sum+=(bar.high+bar.low+bar.close)/3*bar.volume;vol+=bar.volume;if(!vol)continue;
         const bx=chart.timeScale().logicalToCoordinate(j),by=series.priceToCoordinate(sum/vol);if(bx==null||by==null)continue;
         const next=xy(bx,by);if(prev&&bx>=x-tolerance&&prev.x<=x+tolerance)dist=Math.min(dist,segment(prev,next));if(bx>x+tolerance)break;prev=next;
       }break;
     }
     default:dist=segment(a,b);
   }
   if(dist<best){best=dist;selectedHit=i}
 }
 return selectedHit>=0?selectedHit:boxAt(e);
}
const chartArea=$("chartarea");let tap=null;
function isPlotTarget(e){return $("chart").contains(e.target)}
chartArea.addEventListener("pointerdown",e=>{if(tool==="cursor"&&!hidden&&data.length&&e.isPrimary&&e.button===0&&isPlotTarget(e))tap={id:e.pointerId,x:e.clientX,y:e.clientY}},true);
chartArea.addEventListener("pointerup",e=>{const t=tap;tap=null;if(!t||e.pointerId!==t.id||tool!=="cursor"||!isPlotTarget(e)||Math.hypot(e.clientX-t.x,e.clientY-t.y)>9)return;const pos=point(e);if(replayPicking){if(pos)startReplayAt(pos.time);return}
 if(pos){const a=data[lowerBound(data,pos.time)];pinnedBar=a?.time??null;renderDataWindow(a||data.at(-1))}
 const i=pos?drawingAt(e):-1;if(selected!==i)chooseDrawing(i)},true);
chartArea.addEventListener("pointercancel",()=>{tap=null},true);
chartArea.addEventListener("dblclick",e=>{if((tool==="edit"&&e.target===canvas)||(tool==="cursor"&&isPlotTarget(e))){const i=drawingAt(e);if(drawings[i]?.type==="rectangle")openBox(i);else if(drawings[i]?.type==="text")openDrawingText(i)}},true);
document.addEventListener("keydown",e=>{if(e.key==="Shift")shiftDrawing=true});document.addEventListener("keyup",e=>{if(e.key==="Shift")shiftDrawing=false});window.addEventListener("blur",()=>{shiftDrawing=false});
canvas.addEventListener("pointermove",e=>{preview=point(e);if(editDrag?.pointer===e.pointerId&&preview){const d=drawings[editDrag.index],field=editDrag.field;if(field==="body"){const base=editDrag.before[editDrag.index],start=editDrag.start;for(const k of ["a","b"])d[k]={time:base[k].time+preview.time-start.time,price:base[k].price+preview.price-start.price};editDrag.changed=true;return}if(field==="ab"||field==="ba"){const [x,y]=field;d[x].time=preview.time;d[y].price=preview.price;editDrag.changed=true;return}if(field==="a"||field==="b")preview=straight(field==="a"?d.b:d.a,preview,e.shiftKey,d.type);const entry=field==="a"?preview:d.a,stop=field==="b"?preview:d.b,target=field==="c"?preview:d.c;if(d.type==="long"&&!(stop.price<entry.price&&target.price>entry.price)||d.type==="short"&&!(stop.price>entry.price&&target.price<entry.price))return;d[field]=preview;editDrag.changed=true}});
function finishEdit(e){if(editDrag?.pointer!==e.pointerId)return;const d=editDrag;editDrag=null;if(e.type==="pointercancel"){drawings=d.before;return}if(d.changed){past.push(d.before);future=[];saveDraw()}}
canvas.addEventListener("pointerup",finishEdit);canvas.addEventListener("pointercancel",finishEdit);
function grabAnchor(e){
 const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
 let best=e.pointerType==="touch"?23:16,hit;
 const order=drawings.map((_,i)=>i).reverse();
 if(selected>=0&&order.includes(selected)){order.splice(order.indexOf(selected),1);order.unshift(selected)}
 for(const i of order){
  const d=drawings[i],a=coords(d.a),b=coords(d.b),corners={a,b,c:coords(d.c)};
  if(d.type==="rectangle"&&a&&b){corners.ab={x:a.x,y:b.y};corners.ba={x:b.x,y:a.y}}
  for(const [field,p] of Object.entries(corners)){if(!p)continue;const dist=Math.hypot(x-p.x,y-p.y);if(dist<best){best=dist;hit={index:i,field}}}
 }
 if(!hit){const i=drawingAt(e),start=point(e);if(drawings[i]?.type!=="rectangle"||!start){chooseDrawing(i);return}hit={index:i,field:"body",start}}
 chooseDrawing(hit.index);editDrag={...hit,pointer:e.pointerId,before:clone(drawings),changed:false};canvas.setPointerCapture(e.pointerId)
}
canvas.addEventListener("pointerdown",e=>{if(tool==="cursor"||hidden)return;if(tool==="edit"){grabAnchor(e);return}if(tool==="avwap"&&!data.some(bar=>bar.volume>0)){$("hint").textContent="Anchored VWAP requires volume";return}const p=straight(thirdPoint?null:pending,point(e),e.shiftKey,tool);if(!p)return;let d={type:tool,a:pending||p,color:$("color").value};if(tool==="text"){const i=boxAt(e);setTool("cursor");if(i>=0)openBox(i);else openDrawingText(-1,p);return}if(["horizontal","vertical","hRay","avwap"].includes(tool)){changeDraw(()=>drawings.push(d));setTool(keepDrawing?d.type:"cursor")}else if(!pending){pending=p;$("hint").textContent=tool+" · second point"}else if(["long","short","channel","fibExt"].includes(tool)&&!thirdPoint){if((tool==="long"&&p.price>=pending.price)||(tool==="short"&&p.price<=pending.price)){$("hint").textContent="Select stop on correct side of entry";return}thirdPoint=p;$("hint").textContent=tool==="channel"?"Select channel width":tool==="fibExt"?"Select projection start":"Select target"}else{d.b=thirdPoint||p;if(thirdPoint){if((tool==="long"&&p.price<=pending.price)||(tool==="short"&&p.price>=pending.price)){$("hint").textContent="Select target on correct side of entry";return}d.c=p}changeDraw(()=>drawings.push(d));setTool(keepDrawing?d.type:"cursor");if(d.type==="rectangle"&&!keepDrawing){chooseDrawing(drawings.length-1);notify("Box selected · use Add text, Change color, Move / resize or Delete")}}});
$("search").onsubmit=e=>{e.preventDefault();select($("symbol").value)};
$("addwatch").onclick=()=>{if(!Object.hasOwn(commodities,symbol)&&!Object.hasOwn(otherMarkets,symbol)&&!watch.includes(symbol)){watch.push(symbol);save("ledger_chart_watch_v1",watch);renderWatch()}};
q("[data-i]").forEach(b=>b.onclick=()=>{barHover=null;pinnedBar=null;setReplayPicking(false);historyView=false;stopLive();stopPlayback();interval=Number(b.dataset.i);replayData=null;q("[data-i]").forEach(x=>x.classList.toggle("active",Number(x.dataset.i)===interval));preferences();setTool("cursor");load(true)});
q("[data-tool]").forEach(b=>b.onclick=()=>{if(replayPicking)setReplayPicking(false);if(hidden){hidden=false;$("hide").classList.remove("active")}setTool(b.dataset.tool)});
$("style").value=style;$("style").onchange=()=>{style=$("style").value;makeSeries();preferences()};
q("[data-ind]").forEach(b=>{if(Array.isArray(prefs.ind))b.checked=prefs.ind.includes(b.dataset.ind);b.onchange=()=>{preferences();try{indicatorData()}catch(e){notify("Indicator error: "+e.message)}}});
$("older").onclick=()=>loadOlder(true);$("watchSearch").oninput=renderWatch;$("indicatorSearch").oninput=()=>{const f=$("indicatorSearch").value.toLowerCase();q(".indicatorbox label").forEach(l=>l.hidden=!l.textContent.toLowerCase().includes(f))};$("refresh").onclick=()=>{if(goldLiveMode()){loadGoldLive(true);return}if(historyView&&!replayData){leaveHistory();return}if(benchmarkMode()&&!replayData){loadBenchmark({refresh:true});return}stopPlayback();stopLive();if(replayData)data=replayData;replayData=null;load(true)};$("fit").onclick=()=>chart?.timeScale().fitContent();
$("goLatest").onclick=()=>{if(historyView&&!replayData){leaveHistory();return}if(!chart||!data.length)return;const t=chart.timeScale(),r=t.getVisibleLogicalRange(),width=r?Math.max(10,Math.min(200,r.to-r.from)):95;t.setVisibleLogicalRange({from:Math.max(0,data.length-width+5),to:data.length+5});notify(replayData?"At latest replayed observation":"Showing latest loaded data")};
q("[data-range]").forEach(b=>b.onclick=()=>{if(data.length)chart.timeScale().setVisibleLogicalRange({from:Math.max(0,data.length-Number(b.dataset.range)),to:data.length+5})});
$("log").onclick=()=>{log=!log;chart.priceScale("right").applyOptions({mode:log?L.PriceScaleMode.Logarithmic:L.PriceScaleMode.Normal});$("log").classList.toggle("active",log)};
function setDrawingToggles(){
 for(const [id,on] of [["keepDrawing",keepDrawing],["lockDrawings",lockDrawings]]){
  $(id).classList.toggle("active",!!on);$(id).setAttribute("aria-pressed",String(!!on));
 }
 syncBoxActions();
}
$("keepDrawing").onclick=()=>{keepDrawing=!keepDrawing;save("ledger_keep_drawing",keepDrawing);setDrawingToggles();notify(keepDrawing?"Keep drawing enabled":"Keep drawing disabled")};
$("lockDrawings").onclick=()=>{lockDrawings=!lockDrawings;save("ledger_lock_drawings",lockDrawings);if(lockDrawings&&tool==="edit")setTool("cursor");setDrawingToggles();notify(lockDrawings?"Drawing positions locked":"Drawing positions unlocked")};
setDrawingToggles();
$("magnet").onclick=()=>{magnet=!magnet;$("magnet").classList.toggle("active",magnet)};
$("hide").onclick=()=>{hidden=!hidden;$("hide").classList.toggle("active",hidden);setTool("cursor")};
$("undo").onclick=()=>{if(past.length){future.push(clone(drawings));drawings=past.pop();selected=-1;saveDraw()}};
$("redo").onclick=()=>{if(future.length){past.push(clone(drawings));drawings=future.pop();selected=-1;saveDraw()}};
$("clear").onclick=()=>{if(drawings.length&&confirm("Delete all drawings for "+symbol+"?"))changeDraw(()=>drawings=[])};
$("fullscreen").onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{notify("Fullscreen is not available in this browser.")}};
function syncReplayControls(){
 $("replayBar").hidden=!replayData&&!replayPicking;
 $("replay").setAttribute("aria-pressed",String(!!replayData||replayPicking));
 $("replayCancelPick").hidden=!replayPicking;
 for(const id of ["replayPlay","step","replaySpeed","live"])$(id).hidden=!replayData;
}
function setReplayPicking(on){
 replayPicking=on;document.body.classList.toggle("replay-pick",on);syncReplayControls();
 if(on){$("replayProgress").textContent="Tap a candle to start";notify("Pick a bar before the last candle");}
}
$("replayCancelPick").onclick=()=>{setReplayPicking(false);notify("Replay selection cancelled")};
$("replayPick").onclick=()=>{$("replayDialog").close();setTool("cursor");setReplayPicking(true)};
$("replay").onclick=()=>{if(replayPicking){$("replayCancelPick").click();return}if(replayData){$("live").click();return}if(data.length<3){notify("Load at least three bars to start replay");return}const iso=i=>new Date(data[i].time*1000).toISOString().slice(0,16),input=$("replayStart");input.min=iso(0);input.max=iso(data.length-2);input.value=iso(Math.max(0,data.length-100));$("replayError").textContent="";showDialog("replayDialog")};
function startReplayAt(t){
 const i=lowerBound(data,t);if(busy||historyBusy||!Number.isFinite(t)||t<data[0]?.time||i>=data.length-1){
  const msg=busy||historyBusy?"Wait for history to finish loading.":"Choose a time before the last loaded bar and within loaded history.";
  if($("replayDialog").open)$("replayError").textContent=msg;else notify(msg);return;
 }
 if($("replayDialog").open)$("replayDialog").close();setReplayPicking(false);stopLive();barHover=null;pinnedBar=null;
 replayData=data.slice();replayIndex=i+1;setLiveStatus("replay");nativeControls(true);replayStep();
}
$("replayBegin").onclick=()=>startReplayAt(Date.parse($("replayStart").value+"Z")/1000);
function replayStep(){
 data=replayData.slice(0,replayIndex);barHover=null;updateChart(null);chart.timeScale().setVisibleLogicalRange({from:Math.max(0,data.length-90),to:data.length+5});
 $("replayProgress").textContent=new Date(data.at(-1).time*1000).toISOString().slice(0,16).replace("T"," ")+" UTC";
 notify("Replay · "+replayIndex+"/"+replayData.length+" bars");const ended=replayIndex>=replayData.length;
 $("step").disabled=ended;$("replayPlay").disabled=ended;if(ended)stopPlayback();
}
$("step").onclick=()=>{if(replayData&&replayIndex<replayData.length){replayIndex++;replayStep()}};
$("live").onclick=()=>{stopPlayback();if(replayData){data=replayData;replayData=null;barHover=null;updateChart(null);chart.timeScale().setVisibleLogicalRange({from:Math.max(0,data.length-90),to:data.length+5});nativeControls(true);if(historyView){$("alertOpen").disabled=true;setLiveStatus("dateHistory");notify("Historical date window")}else load(true)}};
$("csvExport").onclick=()=>{
 if(!data.length||benchmarkMode()||goldArchive()||goldLiveMode())return;
 const rows=data.map(a=>[new Date(a.time*1000).toISOString(),a.open,a.high,a.low,a.close,a.volume].join(","));
 const url=URL.createObjectURL(new Blob(["time,open,high,low,close,volume\n",rows.join("\n"),"\n"],{type:"text/csv;charset=utf-8"}));
 const link=document.createElement("a");link.href=url;link.download=symbol+"-"+interval+"min"+(replayData?"-replay":"")+"-Ledger.csv";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$("snapshot").onclick=()=>{if(!chart)return;const shot=chart.takeScreenshot();const c=shot.getContext("2d");c.drawImage(canvas,0,0,shot.width,shot.height);const a=document.createElement("a");a.href=shot.toDataURL("image/png");a.download="ledger-"+symbol+".png";a.click()};
document.addEventListener("keydown",e=>{if(document.querySelector("dialog[open]"))return;if(e.key==="Escape"){if(replayPicking)$("replayCancelPick").click();if(document.body.classList.contains("sidebar-open"))togglePanel(false);setTool("cursor");chooseDrawing(-1)}
 if(!/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)){
   if(replayData&&e.code==="Space"&&document.activeElement.tagName!=="BUTTON"){e.preventDefault();if(!$("replayPlay").disabled)play()}
   else if(replayData&&e.key==="ArrowRight"){e.preventDefault();$("step").click()}
   else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="z"){e.preventDefault();$(e.shiftKey?"redo":"undo").click()}
 }if(e.key==="Delete"&&selected>=0&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)){$("boxDelete").click()}});
q("[data-i]").forEach(b=>b.classList.toggle("active",Number(b.dataset.i)===interval));

// Workstation controls and local preferences.
const showDialog=id=>{const d=$(id);if(!d.open)d.showModal()};
q("[data-close]").forEach(b=>b.onclick=()=>$(b.dataset.close).close());
const smallScreen=window.matchMedia("(max-width:730px)");
function togglePanel(open){
 if(smallScreen.matches){document.body.classList.toggle("sidebar-open",open);$("focusMode").setAttribute("aria-expanded",String(open));}
 else{document.body.classList.toggle("focus",!open);$("focusMode").setAttribute("aria-expanded",String(open));}
}
function sideTab(name){
 q("[data-side]").forEach(b=>{const active=b.dataset.side===name;b.classList.toggle("active",active);b.setAttribute("aria-pressed",String(active))});
 for(const [tab,id] of Object.entries({watch:"watchPanel",objects:"objectPanel",alerts:"alertsPanel",data:"dataPanel"}))$(id).hidden=tab!==name;
 if(name==="data")renderDataWindow(barHover||getPinnedBar()||data.at(-1));
}
q("[data-side]").forEach(b=>b.onclick=()=>sideTab(b.dataset.side));sideTab("watch");
$("focusMode").onclick=()=>togglePanel($("focusMode").getAttribute("aria-expanded")!=="true");
$("closePanel").onclick=()=>{togglePanel(false);$("focusMode").focus()};
const panelBreakpoint=()=>{document.body.classList.remove("sidebar-open","focus");togglePanel(!smallScreen.matches)};
smallScreen.addEventListener("change",panelBreakpoint);panelBreakpoint();
const catalog=[...Object.entries(cryptoNames).map(([s,n])=>({s,n,cat:"Crypto"})),...Object.entries(commodities).map(([s,v])=>({s,n:v[0],cat:"Commodities"})),...Object.entries(otherMarkets).map(([s,v])=>({s,n:v[0],cat:v[1]}))];
let category="All",symbolActive=-1;
const findSymbol=s=>catalog.find(x=>x.s===s)||{s,n:"Exchange market",cat:"Crypto"};
function updateStar(){const starred=favorites.includes(symbol),b=$("starSymbol");$("currentSymbol").textContent=symbol;b.textContent=starred?"★":"☆";b.setAttribute("aria-pressed",starred);b.setAttribute("aria-label",starred?"Unstar "+symbol:"Star "+symbol);b.title=b.getAttribute("aria-label")}
$("starSymbol").onclick=()=>{const starred=favorites.includes(symbol);favorites=starred?favorites.filter(s=>s!==symbol):[symbol,...favorites].slice(0,80);save("ledger_favorites_v1",favorites);updateStar();renderWatch();notify(starred?"Removed "+symbol+" from favorites":"Starred "+symbol)};
function symbolResults(){
  const value=$("symbolQuery").value.trim().toUpperCase(),box=$("symbolResults");
  box.replaceChildren();symbolActive=-1;
  const match=x=>(x.s+" "+x.n).toUpperCase().includes(value);
  const groups=[];
  if(category==="Favorites")groups.push(["",favorites.map(findSymbol).filter(match)]);
  else if(category==="All"&&!value){
    if(favorites.length)groups.push(["Favorites",favorites.map(findSymbol)]);
    if(recents.length)groups.push(["Recent",recents.filter(x=>!favorites.includes(x)).map(findSymbol)]);
    groups.push(["All markets",catalog.filter(x=>!favorites.includes(x.s)&&!recents.includes(x.s))]);
  }else{
    const items=catalog.filter(x=>(category==="All"||x.cat===category)&&match(x));
    const canonical=normalize(value);
    if(category==="All"&&valid(canonical)&&!items.some(x=>x.s===canonical)&&(canonical!==value||!items.length))items.unshift(findSymbol(canonical));
    groups.push(["",items]);
  }
  for(const [heading,items] of groups){
    if(!items.length)continue;
    if(heading){const h=document.createElement("div");h.className="symbolGroup";h.textContent=heading;box.append(h)}
    for(const x of items){
      const b=document.createElement("button"),s=document.createElement("span"),k=document.createElement("small");
      s.textContent=(favorites.includes(x.s)?"★ ":"")+x.s+" · "+x.n;k.textContent=x.cat;
      b.dataset.result=x.s;b.append(s,k);b.onclick=()=>{$("symbolDialog").close();select(x.s)};box.append(b);
    }
  }
  if(!box.querySelector("button"))box.textContent=category==="Favorites"&&!value?"Star a market using ☆ beside its symbol.":"No matching markets.";
}
for(const name of ["All","Favorites","Crypto","Forex","Commodities","Indices","Stocks"]){const b=document.createElement("button");b.textContent=name;b.classList.toggle("active",name===category);b.onclick=()=>{category=name;[...$("symbolCategories").children].forEach(x=>x.classList.toggle("active",x===b));symbolResults();$("symbolQuery").focus()};$("symbolCategories").append(b)}
function openSymbols(){category="All";[...$("symbolCategories").children].forEach(x=>x.classList.toggle("active",x.textContent===category));$("symbolQuery").value="";symbolResults();showDialog("symbolDialog");$("symbolQuery").focus()}
$("symbolPicker").onclick=openSymbols;$("symbolQuery").oninput=symbolResults;
$("symbolQuery").onkeydown=e=>{
  const items=q("#symbolResults button");if(!items.length)return;
  if(e.key==="Enter"){e.preventDefault();items[Math.max(0,symbolActive)]?.click();return}
  if(e.key!=="ArrowDown"&&e.key!=="ArrowUp")return;
  e.preventDefault();const d=e.key==="ArrowDown"?1:-1;
  symbolActive=symbolActive===-1?(d>0?0:items.length-1):(symbolActive+d+items.length)%items.length;
  items.forEach((b,i)=>b.classList.toggle("chosen",i===symbolActive));
  items[symbolActive].scrollIntoView({block:"nearest"});
};
document.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==="k"&&!document.querySelector("dialog[open]")){e.preventDefault();openSymbols()}});
$("indicatorHost").append($("indicatorSearch"),document.querySelector(".indicatorbox"));$("indOpen").onclick=()=>{showDialog("indicatorDialog");$("indicatorSearch").focus()};
function redrawIndicators(){preferences();if(chart&&!csvOnlyMarket())try{indicatorData()}catch(e){notify("Indicator error: "+e.message)}}
$("indClear").onclick=()=>{q("[data-ind]").forEach(x=>x.checked=false);redrawIndicators()};
let templates=read("ledger_indicator_templates_v1",{});if(!templates||typeof templates!=="object"||Array.isArray(templates))templates={};
function listTemplates(){const s=$("templateSelect");s.replaceChildren(new Option("Load template…",""));for(const k of Object.keys(templates))s.add(new Option(k,k))}
$("templateSave").onclick=()=>{const n=prompt("Indicator template name");if(!n?.trim())return;const k=n.trim().slice(0,60);templates={...templates,[k]:{ind:q("[data-ind]:checked").map(x=>x.dataset.ind),rsi:settings.rsi,atr:settings.atr,ema:settings.ema}};save("ledger_indicator_templates_v1",templates);listTemplates();notify("Indicator template saved")};
$("templateSelect").onchange=()=>{const v=templates[$("templateSelect").value];if(!v)return;q("[data-ind]").forEach(x=>x.checked=v.ind.includes(x.dataset.ind));settings={...settings,rsi:v.rsi||14,atr:v.atr||14,ema:v.ema||34};save("ledger_chart_settings_v2",settings);redrawIndicators();$("templateSelect").value=""};listTemplates();
const settingIds={theme:"themeChoice",up:"upColor",down:"downColor",grid:"gridChoice",cross:"crossChoice",scale:"scaleChoice",zone:"zoneChoice",rsi:"rsiLength",atr:"atrLength",ema:"emaLength"};
function populateSettings(){for(const [k,id] of Object.entries(settingIds))$(id).value=settings[k]}
function axisLabels(zone){const make=(fields)=>new Intl.DateTimeFormat("en-GB",{timeZone:zone,...fields});const year=make({year:"numeric"}),month=make({year:"2-digit",month:"short"}),day=make({month:"short",day:"numeric"}),time=make({hour:"2-digit",minute:"2-digit",hourCycle:"h23"});return (stamp,type)=>typeof stamp==="number"?([year,month,day,time,time][type]||day).format(new Date(stamp*1000)):String(stamp)}
function applySettings(){document.body.classList.toggle("light",settings.theme==="light");if(!chart||!L)return;const light=settings.theme==="light",grid=light?"#e9ebf0":"#222733",edge=light?"#dce1e9":"#303643",fg=light?"#505a6b":"#9598a1";let fmt;try{fmt=new Intl.DateTimeFormat("en-GB",{timeZone:settings.zone,month:"short",day:"numeric",hour:"2-digit",minute:"2-digit",hour12:false})}catch{fmt=new Intl.DateTimeFormat("en-GB",{timeZone:"UTC",month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"})}chart.applyOptions({layout:{background:{type:"solid",color:light?"#ffffff":"#131722"},textColor:fg},grid:{vertLines:{visible:settings.grid==="both",color:grid},horzLines:{visible:settings.grid!=="none",color:grid}},rightPriceScale:{borderColor:edge,mode:settings.scale==="log"&&(!benchmarkMode()||data.every(a=>a.close>0))?L.PriceScaleMode.Logarithmic:settings.scale==="percent"?L.PriceScaleMode.Percentage:L.PriceScaleMode.Normal},timeScale:{borderColor:edge,timeVisible:goldIntraday()||!benchmarkMode()&&interval<1440,tickMarkFormatter:axisLabels(fmt.resolvedOptions().timeZone)},localization:{timeFormatter:t=>typeof t==="number"?fmt.format(new Date(t*1000)):String(t)},crosshair:{mode:settings.cross==="magnet"?L.CrosshairMode.Magnet:L.CrosshairMode.Normal}});log=settings.scale==="log"&&(!benchmarkMode()||data.every(a=>a.close>0));$("log").classList.toggle("active",log);if(series&&!benchmarkMode()&&["candles","heikin","bars"].includes(style))series.applyOptions({upColor:settings.up,downColor:settings.down,...(style!=="bars"?{wickUpColor:settings.up,wickDownColor:settings.down}:{})});if(series&&!benchmarkMode()&&style==="area")series.applyOptions({bottomColor:light?"#fff":"#131722"});}
$("settingsOpen").onclick=()=>{populateSettings();showDialog("settingsDialog")};$("settingsReset").onclick=()=>{settings={...defaults};populateSettings()};$("settingsApply").onclick=()=>{for(const [k,id] of Object.entries(settingIds)){const el=$(id);if(el.type==="number"){const n=Number(el.value);if(!Number.isFinite(n)||n<Number(el.min)||n>Number(el.max)){el.reportValidity();return}settings[k]=Math.round(n)}else settings[k]=el.value}save("ledger_chart_settings_v2",settings);applySettings();redrawIndicators();$("settingsDialog").close()};
const layouts=["single","horizontal","vertical"], layoutPrefs=read("ledger_layout_v1",{})||{};
const configuredLayout=initialUrl.get("layout");
let comparison="single";
const compareConfig=(key,fallback)=>{const value=initialUrl.has("layout")?initialUrl.get(key):layoutPrefs[key];return value||fallback};
for(const x of catalog)$("compareSymbol").add(new Option(x.s+" · "+x.n,x.s));$("compareSymbol").value=catalog.some(x=>x.s===compareConfig("compare","ETH"))?compareConfig("compare","ETH"):"ETH";
const availableCompareIntervals=["1","15","60","240","D"];
$("compareInterval").value=availableCompareIntervals.includes(compareConfig("compareInterval","240"))?compareConfig("compareInterval","240"):"240";
let compareChart,compareAbort,compareEpoch=0,compareTimer;
function disposeComparison(){$("compareInterval").disabled=false;compareEpoch++;clearTimeout(compareTimer);compareAbort?.abort();compareChart?.remove();compareChart=null;$("compareChart").replaceChildren()}
async function renderComparison(){disposeComparison();if(comparison==="single")return;const s=$("compareSymbol").value,i=$("compareInterval").value==="D"?1440:Number($("compareInterval").value);if(!benchmarkSymbols.has(s)&&(commodities[s]||otherMarkets[s])){$("compareInterval").disabled=true;$("compareTitle").textContent="No built-in comparison feed";$("compareChart").textContent="Choose a crypto or commodity benchmark for the second chart.";return}
const ticket=compareEpoch,target=$("compareChart");$("compareTitle").textContent="Ledger comparison · "+s;target.textContent="Loading candles…";
try{await getLibrary();if(ticket!==compareEpoch)return;const light=settings.theme==="light";const bg=light?"#ffffff":"#131722",fg=light?"#505a6b":"#9598a1",grid=light?"#e9ebf0":"#222733";target.textContent="";compareChart=L.createChart(target,{autoSize:true,layout:{background:{type:"solid",color:bg},textColor:fg,attributionLogo:true},grid:{vertLines:{color:grid},horzLines:{color:grid}},timeScale:{timeVisible:i<1440,rightOffset:4}});const candles=compareChart.addSeries(L.CandlestickSeries,{upColor:settings.up,downColor:settings.down,wickUpColor:settings.up,wickDownColor:settings.down,borderVisible:false});let rows=[],feed="auto";
if(benchmarkSymbols.has(s)){$("compareInterval").disabled=true;compareAbort=new AbortController();const m=await getBenchmarks(),frame=m.instruments[s].daily?"day":"month",p=await m.loadBenchmarkSeries(s,frame,compareAbort.signal);if(ticket!==compareEpoch)return;compareChart.removeSeries(candles);const line=compareChart.addSeries(L.LineSeries,{color:"#57d7be",lineWidth:2});line.setData(p.points.map(([time,value])=>({time,value})));compareChart.timeScale().fitContent();$("compareTitle").textContent=p.info.name+" · "+m.frames[frame]+" · "+p.info.unit;return}
async function refresh(){if(ticket!==compareEpoch)return;try{compareAbort=new AbortController();const ctrl=compareAbort,t=setTimeout(()=>ctrl.abort(),20000);let p;try{const r=await fetch("/api/candles?"+new URLSearchParams({symbol:s,interval:i,provider:feed,mode:rows.length?"latest":"initial"}),{signal:ctrl.signal});p=await r.json();if(!r.ok||!p.candles?.length)throw Error("No data")}finally{clearTimeout(t)}if(ticket!==compareEpoch)return;const initial=!rows.length,ts=compareChart.timeScale(),range=ts.getVisibleLogicalRange(),following=range?.to>=rows.length-2;feed=p.provider||"auto";const previous=rows.length;rows=mergeBars(rows,p.candles);candles.setData(rows);if(initial){const value=rows.at(-1).close,precision=value>=1?2:Math.min(8,Math.max(3,Math.ceil(-Math.log10(value))+3));candles.applyOptions({priceFormat:{type:"price",precision,minMove:10**(-precision)}});ts.setVisibleLogicalRange({from:Math.max(0,rows.length-100),to:rows.length+4})}else if(range){const shift=following?rows.length-previous:0;ts.setVisibleLogicalRange({from:range.from+shift,to:range.to+shift})}$("compareTitle").textContent=s+" · "+p.source+" · 15s refresh"}catch{if(ticket!==compareEpoch)return;$("compareTitle").textContent=s+(rows.length?" · Showing last loaded candles":" · Feed unavailable; retrying")}finally{if(ticket===compareEpoch)compareTimer=setTimeout(refresh,15000)}}await refresh();
}catch{if(ticket===compareEpoch)target.textContent="Chart engine unavailable."}}
function storeLayout(){save("ledger_layout_v1",{layout:comparison,compare:$("compareSymbol").value,compareInterval:$("compareInterval").value})}
function setLayout(mode,remember=true){if(!layouts.includes(mode))return;comparison=mode;if(remember)storeLayout();$("comparePane").hidden=mode==="single";$("chartdeck").classList.toggle("stacked",mode==="vertical");if(mode==="single")disposeComparison();else renderComparison();$("layoutDialog").close()}
let workspaces=read("ledger_workspaces_v1",[]);
if(!Array.isArray(workspaces))workspaces=[];
function listWorkspaces(index=-1){
 const menu=$("workspaceSelect");menu.replaceChildren(new Option(workspaces.length?"Choose a workspace":"No saved workspaces",""));
 workspaces.forEach((item,i)=>{if(typeof item?.name==="string")menu.add(new Option(item.name,String(i)))});
 if(index>=0)menu.value=String(index);$("workspaceLoad").disabled=$("workspaceRemove").disabled=!menu.value;
}
$("workspaceSelect").onchange=()=>{$("workspaceLoad").disabled=$("workspaceRemove").disabled=!$("workspaceSelect").value};
$("workspaceSaveForm").onsubmit=e=>{
 e.preventDefault();const name=$("workspaceName").value.trim();if(!name)return;
 const existing=workspaces.findIndex(item=>item?.name?.toLowerCase()===name.toLowerCase());
 if(existing>=0){$("workspaceFeedback").textContent="That name already exists. Use a new name or remove the existing workspace.";return}
 if(workspaces.length>=30){$("workspaceFeedback").textContent="You can save up to 30 workspaces on this device.";return}
 const item={name,symbol,interval,style,frame:(benchmarkMode()||goldArchive()||goldLiveMode())?benchmarkFrame:null,goldMonth:goldArchive()?goldMonth:null,layout:comparison,compare:$("compareSymbol").value,compareInterval:$("compareInterval").value,ind:q("[data-ind]:checked").map(x=>x.dataset.ind)};
 workspaces.push(item);save("ledger_workspaces_v1",workspaces);listWorkspaces(workspaces.length-1);
 $("workspaceName").value="";$("workspaceFeedback").textContent=localImport()?"Workspace saved. Local CSV data stays in this tab.":"Saved “"+name+"” on this device.";
};
$("workspaceLoad").onclick=()=>{
 const x=workspaces[Number($("workspaceSelect").value)];
 if(!$("workspaceSelect").value||!x||!valid(x.symbol)||!intervals.includes(x.interval)||!styles.includes(x.style)||!layouts.includes(x.layout))return;
 goldMonth=validGoldMonth(x.goldMonth)?x.goldMonth:null;interval=x.interval;style=x.style;$("style").value=style;
 q("[data-i]").forEach(b=>b.classList.toggle("active",Number(b.dataset.i)===interval));
 if(Array.isArray(x.ind))q("[data-ind]").forEach(b=>b.checked=x.ind.includes(b.dataset.ind));
 if(q("#compareSymbol option").some(o=>o.value===x.compare))$("compareSymbol").value=x.compare;
 if(availableCompareIntervals.includes(x.compareInterval))$("compareInterval").value=x.compareInterval;
 if(chart){makeSeries();indicatorData()}setLayout(x.layout);select(x.symbol,x.frame??null);
};
$("workspaceRemove").onclick=()=>{
 const value=$("workspaceSelect").value;if(!value)return;
 workspaces.splice(Number(value),1);save("ledger_workspaces_v1",workspaces);listWorkspaces();
 $("workspaceFeedback").textContent="Saved workspace removed. Your drawings were kept.";
};
$("layoutOpen").onclick=()=>{listWorkspaces();$("workspaceFeedback").textContent="Saves markets, timeframes, chart type, layout and active indicators on this device.";showDialog("layoutDialog")};q("[data-layout]").forEach(b=>b.onclick=()=>setLayout(b.dataset.layout));$("compareClose").onclick=()=>setLayout("single");$("compareSymbol").onchange=$("compareInterval").onchange=()=>{storeLayout();renderComparison()};
const firstLayout=layouts.includes(configuredLayout)?configuredLayout:layoutPrefs.layout;
if(layouts.includes(firstLayout)&&firstLayout!=="single")setLayout(firstLayout,false);
$("shareChart").onclick=()=>{
  const url=new URL("/chart.html",location.origin);
  url.searchParams.set("symbol",symbol);
  url.searchParams.set("interval",interval);url.searchParams.set("style",style);url.searchParams.set("layout",comparison);
  if((benchmarkMode()||goldArchive()||goldLiveMode())&&benchmarkFrame)url.searchParams.set("period",benchmarkFrame);if(goldArchive()&&!goldOverview()&&goldMonth)url.searchParams.set("month",goldMonth);
  if(comparison!=="single"){url.searchParams.set("compare",$("compareSymbol").value);url.searchParams.set("compareInterval",$("compareInterval").value)}
  $("shareUrl").value=url.href;$("shareFeedback").textContent=localImport()?"This link opens the public market without your imported data.":"";
  showDialog("shareDialog");$("shareUrl").select();
};
$("copyChart").onclick=async()=>{try{await navigator.clipboard.writeText($("shareUrl").value);$("shareFeedback").textContent="Link copied."}catch{$("shareUrl").select();$("shareFeedback").textContent="Link selected. Press Ctrl+C or ⌘C to copy."}};

function leaveHistory(){
 historyView=false;loadedKey="";barHover=null;pinnedBar=null;load(true);
}
async function openHistoryWindow(target){
 if(!hasHistory||historyBusy||busy||replayData||!data.length)return false;
 const ticket=++seq,step=interval*60,oldKey=key();
 controller?.abort();controller=new AbortController();const ctrl=controller;
 const timer=setTimeout(()=>ctrl.abort(),18000);
 historyBusy=true;historyLabel();notify("Loading candles near the selected date…");
 try{
   const before=Math.min(Math.floor(Date.now()/1000),Math.floor(target+Math.min(50*step,2592000)));
   const p=await getCandles({provider,before:String(before)},ctrl.signal);
   if(ticket!==seq||oldKey!==key())return false;
   if(p.provider!==provider||!p.candles?.length)throw Error("No candles");
   const nearest=p.candles[lowerBound(p.candles,target)]||p.candles.at(-1);
   if(Math.abs(nearest.time-target)>Math.max(2*86400,2*step))throw Error("No candles close to requested date");
   stopLive();historyView=true;barHover=null;pinnedBar=null;
   data=p.candles;nextBefore=p.nextBefore||null;historyEnded=!nextBefore;
   nativeControls(true);$("alertOpen").disabled=true;$("tradeInfo").textContent="Date window · select Latest to resume live updates";
   updateChart(null);setLiveStatus("dateHistory");
   return true;
 }catch{if(ticket===seq)notify("No candles near that date from this feed, or the request failed · kept current chart");return false}
 finally{clearTimeout(timer);if(ticket===seq){historyBusy=false;historyLabel()}}
}
async function jump(target,period=false){
 if(goldArchive()&&!goldOverview()&&!period&&!busy&&!replayData&&data.length&&(target<data[0].time||target>data.at(-1).time)){
   const month=new Date(target*1000).toISOString().slice(0,7);
   if(!validGoldMonth(month)){notify("Gold minute archive runs from Jan 2021 to Oct 2026.");return}
   if(month!==goldMonth){if(!await loadGoldArchive(month))return;}
 }
 if(csvOnlyMarket()||!data.length||replayData||busy||historyBusy){notify("Open a native live chart before using date ranges");return}
 if(!period&&!benchmarkMode()&&!usingImport()&&hasHistory&&(target<data[0].time||historyView&&target>data.at(-1).time)){
   if(!await openHistoryWindow(target))return;
 }else if(period&&hasHistory&&!benchmarkMode()&&!usingImport()&&target<data[0].time){
   const desired=Math.ceil((data.at(-1).time-target)/(interval*60));
   if(desired>MAX_BARS){notify("This span exceeds the chart window. Choose a larger timeframe or pick a date.");return}
 }
 const k=key();let count=0;while(data[0]?.time>target&&hasHistory&&!historyEnded&&count++<8&&key()===k){const first=data[0].time;await loadOlder(false);if(data[0]?.time===first)break}if(key()!==k||!data.length)return;let i=data.findIndex(a=>a.time>=target);if(i<0)i=data.length-1;const end=period?data.length+4:Math.min(data.length+4,i+45);chart.timeScale().setVisibleLogicalRange({from:period?Math.max(0,i):Math.max(0,i-45),to:Math.max(i+1,end)});if(target<data[0].time)notify("Showing earliest loaded history · use Load older for more");else notify("Date range updated");}
q("[data-period]").forEach(b=>b.onclick=()=>{if(data.length)jump(data.at(-1).time-Number(b.dataset.period),true)});$("goDate").onclick=()=>{$("dateInput").max=goldArchive()?"2026-10-01":new Date().toISOString().slice(0,10);$("dateInput").min=goldArchive()?"2021-01-03":hasHistory&&!usingImport()&&!benchmarkMode()?"2009-01-01":"";$("dateInput").value=new Date((data[0]?.time||Date.now()/1000)*1000).toISOString().slice(0,10);showDialog("dateDialog")};$("dateApply").onclick=()=>{const t=Date.parse($("dateInput").value)/1000;if(Number.isFinite(t)){$("dateDialog").close();jump(t)}};
let playbackTimer=null;
function stopPlayback(){if(playbackTimer)clearInterval(playbackTimer);playbackTimer=null;if($("replayPlay")){$("replayPlay").textContent="▶";$("replayPlay").setAttribute("aria-label","Play replay")}}
function play(){if(!replayData)return;if(playbackTimer){stopPlayback();return}$("replayPlay").textContent="Ⅱ";$("replayPlay").setAttribute("aria-label","Pause replay");playbackTimer=setInterval(()=>{if(!replayData||replayIndex>=replayData.length){stopPlayback();return}replayIndex++;replayStep()},Number($("replaySpeed").value))}
$("replayPlay").onclick=play;$("replaySpeed").onchange=()=>{if(playbackTimer){stopPlayback();play()}};
let alerts=read("ledger_alerts_v1",[]);if(!Array.isArray(alerts))alerts=[];let lastAlertPrice={};
function renderAlerts(){const box=$("alertList");box.replaceChildren();for(const a of alerts){const row=document.createElement("div");row.className="objectrow";const t=document.createElement("span");t.style.flex="1";t.textContent=a.symbol+" "+(a.condition==="above"?"↑":"↓")+" "+price(a.price)+(a.triggered?" · triggered":" · active");const b=document.createElement("button");b.textContent="×";b.onclick=()=>{alerts=alerts.filter(v=>v.id!==a.id);save("ledger_alerts_v1",alerts);renderAlerts()};row.append(t,b);box.append(row)}if(!alerts.length)box.textContent="No price alerts."}
function checkAlerts(p){if(historyView||benchmarkMode()||usingImport())return;const prev=lastAlertPrice[symbol];lastAlertPrice[symbol]=p;if(prev===undefined||!Number.isFinite(p))return;let changed=false;for(const a of alerts){if(a.triggered||a.symbol!==symbol)continue;if(a.condition==="above"?prev<a.price&&p>=a.price:prev>a.price&&p<=a.price){a.triggered=true;changed=true;const n=document.createElement("div");n.textContent="Price alert · "+symbol+" crossed "+price(a.price);n.style.cssText="position:fixed;right:15px;bottom:40px;background:var(--panel);border:1px solid var(--accent);padding:14px;z-index:50;border-radius:6px";n.onclick=()=>n.remove();document.body.append(n);setTimeout(()=>n.remove(),12000)}}if(changed){save("ledger_alerts_v1",alerts);renderAlerts()}}
function openAlert(){if(historyView||benchmarkMode()||usingImport()||csvOnlyMarket()||!data.length){notify("Price alerts require a native chart");return}$("alertSymbol").textContent=symbol+" / USD";$("alertPrice").value=data.at(-1).close;showDialog("alertDialog")}
$("alertOpen").onclick=openAlert;$("newAlert").onclick=openAlert;$("alertSave").onclick=()=>{const p=Number($("alertPrice").value);if(!Number.isFinite(p)||p<=0)return;alerts.push({id:Date.now()+"-"+Math.random(),symbol,condition:$("alertCondition").value,price:p,triggered:false});lastAlertPrice[symbol]=data.at(-1)?.close;save("ledger_alerts_v1",alerts);renderAlerts();sideTab("alerts");togglePanel(true);$("alertDialog").close()};renderAlerts();applySettings();

let lastBenchmarkCheck=0;
async function loadBenchmark({refresh=false,quiet=false}={}){
  lastBenchmarkCheck=Date.now();
  const keep=refresh&&benchmarkInfo&&loadedKey==="benchmark:"+symbol+":"+benchmarkFrame&&data.length&&!replayData;
  const oldRange=keep?chart.timeScale().getVisibleLogicalRange():null;
  const ticket=++seq;controller?.abort();controller=new AbortController();const ctrl=controller;
  stopLive();stopPlayback();clearTimeout(historyTimer);busy=true;historyBusy=false;historyEnded=true;hasHistory=false;nextBefore=null;replayData=null;
  if(!keep){benchmarkInfo=null;
  data=[];if(series)series.setData([]);nativeControls(true);$("pair").textContent=(commodities[symbol]||otherMarkets[symbol])[0];$("source").textContent=fxBenchmarks.has(symbol)?"ECB reference history":"Historical benchmark";details();historyLabel();message("Loading full benchmark history…")}else if(!quiet)notify("Checking for newly published prices…");
  try{
    const [m]=await Promise.all([getBenchmarks(),getLibrary()]);if(ticket!==seq)return;
    const frames=m.periods(m.instruments[symbol]);if(!frames.includes(benchmarkFrame))benchmarkFrame=frames[0];
    showBenchmarkFrames(symbol==="XAUUSD"?goldFrames:frames);
    const p=await m.loadBenchmarkSeries(symbol,benchmarkFrame,ctrl.signal,{refresh});if(ticket!==seq||replayData)return;
    if(keep&&p.latestTime<benchmarkInfo.latestTime){if(!quiet)notify("Provider unavailable · keeping more recent loaded prices");return}
    const changed=!keep||p.points.length!==data.length||p.points.some(([t,v],i)=>data[i].time!==t||data[i].close!==v);
    const updated=keep&&p.latestTime>benchmarkInfo.latestTime;
    benchmarkInfo=p;if(changed){data=p.points.map(([time,close])=>({time,close,open:close,high:close,low:close,volume:0}));startChart();if(seriesKind!=="benchmark")makeSeries()}
    $("tradeInfo").textContent="";$("pair").textContent=p.info.name;$("source").textContent=m.frames[p.frame]+" · "+p.info.unit;$("benchmarkCredit").href=p.url;$("benchmarkCredit").textContent=p.source+" ↗";
    if(p.forex)$("tradeInfo").textContent=p.derived?"Ledger calculations from ECB daily rates · not trading quotes":"Daily ECB reference observations · not trading quotes";
    else if(p.intraday)$("tradeInfo").textContent="Up to 48h · sampled every 5m · latest "+new Date(p.latestTime*1000).toISOString().slice(11,16)+" UTC"+(p.stale?" · older samples":"");
    else if(p.frame==="year")$("tradeInfo").textContent="Annual averages of posted months; current year can be partial";
    else if(p.frame==="week")$("tradeInfo").textContent="Weekly average of published daily observations";
    if(p.snapshot)$("tradeInfo").textContent+=($("tradeInfo").textContent?" · ":"")+"Saved snapshot / provider unavailable";
    if(!p.intraday)$("tradeInfo").textContent+=($("tradeInfo").textContent?" · ":"")+"Data through "+new Date(p.latestTime*1000).toISOString().slice(0,!p.forex&&(p.frame==="month"||p.frame==="year")?7:10);
    setLiveStatus(p.intraday?(p.stale?"sampleStale":"sampled"):"benchmark");loadedKey="benchmark:"+symbol+":"+benchmarkFrame;
    nativeControls(true);applySettings();if(changed){updateChart(oldRange);if(!oldRange)chart.timeScale().fitContent()}message("");
    notify(p.intraday?(p.stale?"No recent samples from the feed":"Indicative spot quotes · not broker candles"):p.snapshot?"Showing saved prices":p.forex?"ECB reference rates · not live":updated?"New benchmark prices loaded":keep?"No new publication yet":"Published prices · not intraday");
    if(symbol==="UKOIL"&&(p.frame==="month"||p.frame==="year"))$("tradeInfo").textContent+=" · Early history predates modern Brent spot";
    const url=new URL(location.href);url.searchParams.set("period",benchmarkFrame);history.replaceState(null,"",url);
  }catch{if(ticket===seq){if(!keep)message(goldIntraday()?"Intraday Gold samples are unavailable. Try Refresh, switch to 1M/1Y, or import broker candles.":"Benchmark history unavailable. Try Refresh, or import your own CSV.");if(keep&&goldIntraday())setLiveStatus("sampleStale");notify(keep?"Provider unavailable · showing loaded prices":"Chart data unavailable")}}
  finally{if(ticket===seq)busy=false}
}
function fillGoldMonths(year,chosen="01"){
 const menu=$("goldHistoryMonth");menu.replaceChildren();
 for(let month=1;month<=(year==="2026"?10:12);month++){
  const date=new Date(Date.UTC(Number(year),month-1,1));
  menu.add(new Option(new Intl.DateTimeFormat("en-GB",{month:"long",timeZone:"UTC"}).format(date),String(month).padStart(2,"0")));
 }
 menu.value=[...menu.options].some(o=>o.value===chosen)?chosen:"01";
}
for(let year=2026;year>=2021;year--)$("goldHistoryYear").add(new Option(year,year));
$("goldHistoryYear").onchange=()=>fillGoldMonths($("goldHistoryYear").value,$("goldHistoryMonth").value);
$("goldMonthOpen").onclick=()=>{
 if(!goldArchive()||replayData)return;
 const [year,month]=(goldMonth||"2026-09").split("-");
 $("goldHistoryYear").value=year;fillGoldMonths(year,month);showDialog("goldMonthDialog");
};
$("goldMonthForm").onsubmit=e=>{
 e.preventDefault();const requested=$("goldHistoryYear").value+"-"+$("goldHistoryMonth").value;
 if(!goldArchive()||replayData||!validGoldMonth(requested))return;
 $("goldMonthDialog").close();loadGoldArchive(requested);
};
$("goldRecent").onclick=()=>{if(goldArchive()&&!replayData){$("goldMonthDialog").close();loadGoldArchive(null)}};
async function loadGoldArchive(requested=goldMonth){
  const frame=benchmarkFrame,overview=goldOverview(),minutes=goldMinutes[frame],archiveKey="archive:XAUUSD:"+frame;
  const keep=loadedKey===archiveKey&&data.length>0&&benchmarkInfo, ticket=++seq;
  controller?.abort();controller=new AbortController();const ctrl=controller;
  const timer=setTimeout(()=>ctrl.abort(),23000);
  setReplayPicking(false);stopPlayback();clearTimeout(historyTimer);
  if(!keep)stopLive();
  busy=true;hasHistory=historyBusy=false;historyEnded=true;nextBefore=null;replayData=null;
  interval=minutes;barHover=null;pinnedBar=null;
  if(!keep){benchmarkInfo=null;data=[];if(series)series.setData([]);}
  nativeControls(true);showBenchmarkFrames(goldFrames);$("pair").textContent="XAU/USD · Historical Gold";
  $("source").textContent=(frame==="day"?"1D":frame==="week"?"1W":frame)+" candles · USD/troy oz";$("alertOpen").disabled=true;details();historyLabel();
  if(keep)notify("Loading "+(requested||"latest")+" Gold candles…");else message("Loading Gold candles…");
  try{
    const [m,c]=await Promise.all([import("/assets/gold-minute.js"),import("/assets/gold-candles.js"),getLibrary()]);
    const archive=overview?await c.loadGoldOverview(ctrl.signal):requested?await (await import("/assets/gold-history.js")).loadGoldMonth(requested,ctrl.signal):await m.loadGoldMinute(ctrl.signal);
    if(ticket!==seq||!goldArchive())return false;
    if(!overview)goldMonth=requested;benchmarkInfo=archive;data=c.aggregateGold(archive.bars,minutes);loadedKey=archiveKey;
    const url=new URL(location.href);url.searchParams.set("period",frame);url.searchParams.set("interval",String(minutes));
    if(!overview&&goldMonth)url.searchParams.set("month",goldMonth);else url.searchParams.delete("month");history.replaceState(null,"",url);
    const started=!!chart;startChart();if(started&&!keep)makeSeries();
    $("benchmarkCredit").href=m.sourceUrl;$("benchmarkCredit").textContent=m.source+" ↗";
    $("goldLicense").href=m.licenseUrl;
    $("goldMonthOpen").textContent=goldMonth?"History: "+goldMonth:"Gold history";
    $("tradeInfo").textContent="Spot Gold CFD · tick counts · archive: Jan 2021–Oct 2026";
    nativeControls(true);$("alertOpen").disabled=true;applySettings();updateChart(null);
    chart.timeScale().setVisibleLogicalRange({from:Math.max(0,data.length-100),to:data.length+5});
    setLiveStatus("archive");message("");notify("Gold OHLC candles · historical only");renderObjects();return true;
  }catch{
    if(ticket===seq){
      if(keep)notify("That month couldn’t load · keeping the current candles");
      else{message("Gold archive unavailable. Try Refresh, or select the 1m view and choose Gold history → Latest archive bars.");notify("Chart data unavailable");}
    }
    return false;
  }finally{clearTimeout(timer);if(ticket===seq)busy=false}
}
$("benchmarkExport").onclick=()=>{if(goldArchive()&&benchmarkInfo){const u=URL.createObjectURL(new Blob([replayData||interval!==1?"time,open,high,low,close,tick_volume\n"+data.map(a=>[new Date(a.time*1000).toISOString(),a.open,a.high,a.low,a.close,a.volume].join(",")).join("\n")+"\n":benchmarkInfo.csv],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=u;a.download="XAUUSD-"+(benchmarkFrame==="day"?"1D":benchmarkFrame==="week"?"1W":benchmarkFrame)+"-"+(!goldOverview()&&goldMonth?goldMonth+"-":"")+(replayData?"replay-":"")+"Sepaul-Research.csv";a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);return}if(!benchmarkMode()||!benchmarkInfo)return;const p=benchmarkInfo,len=p.frame==="month"?7:p.frame==="year"?4:p.intraday?20:10;const text="period,value,unit,source\n"+p.points.map(([t,v])=>[new Date(t*1000).toISOString().slice(0,len),v,p.info.unit,p.source+(p.derived?" (Ledger calculations)":"")].join(",")).join("\n")+"\n";const u=URL.createObjectURL(new Blob([text],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=u;a.download=symbol+"-"+p.frame+"-ledger.csv";a.click();setTimeout(()=>URL.revokeObjectURL(u),1000)};
q("[data-bf]").forEach(b=>b.onclick=()=>{
 if(!benchmarkMode()&&!goldArchive()&&!goldLiveMode()||benchmarkFrame===b.dataset.bf)return;
 barHover=null;pinnedBar=null;setReplayPicking(false);
 const fromArchive=goldArchive();
 if(b.dataset.bf==="live-15m"){style="candles";$("style").value=style;}
 if(fromArchive&&Object.hasOwn(goldMinutes,b.dataset.bf)){benchmarkFrame=b.dataset.bf;loadGoldArchive();return}
 select(symbol,b.dataset.bf);
});
let goldSpotRaw=null,goldSpotPoints=[],goldQuote=null,goldSpotRequest=0,goldBackfillRequest=0;
async function loadGoldLive(manual=false){
 if(!goldLiveMode()||busy)return;
 const already=loadedKey==="spot-candles:XAUUSD",now=Date.now();
 if(already&&now-goldSpotRequest<59000){
   if(manual)notify("Showing latest checked spot quote · feed refreshes about every minute");
   return;
 }
 goldSpotRequest=now;
 const ticket=++seq;controller?.abort();controller=new AbortController();
 const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(9500)]);
 if(!already){
   data=[];benchmarkInfo=null;if(series)series.setData([]);
   interval=15;historyBusy=hasHistory=false;historyEnded=true;nextBefore=null;
   nativeControls(true);showBenchmarkFrames(goldFrames);
   $("pair").textContent="XAU/USD · Sampled Gold";
   $("source").textContent="15m spot-sample candles · USD/troy oz";
   $("tradeInfo").textContent="Indicative quotes, not broker OHLC · actual highs and lows may differ";
   setLiveStatus("connecting");details();historyLabel();message("Loading sampled Gold candles…");
 }
 busy=true;
 const get=async(url,cache="default")=>{const r=await fetch(url,{signal,cache});if(!r.ok)throw Error("Spot source unavailable");return r.json()};
 const backfill=async()=>{
   if(goldSpotRaw&&now-goldBackfillRequest<300000)return;
   goldBackfillRequest=now;
   const raw=await get("/api/gold-intraday").catch(()=>null);
   if(ticket===seq&&raw?.points?.length)goldSpotRaw=raw;
 };
 const seed=backfill();
 try{
   const [spot,m]=await Promise.all([
     get("/api/gold-spot","no-cache").catch(()=>null),
     import("/assets/gold-live.js"),getLibrary(),already?null:seed
   ]);
   if(ticket!==seq||!goldLiveMode())return;
   const t=Math.floor(Date.now()/1000),q=spot?.quote;
   const fresh=!!q&&Number.isSafeInteger(q.t)&&t-q.t<=150&&q.t<=t+30&&Number.isFinite(q.p)&&q.p>0&&q.t>=(goldQuote?.t??0);
   if(fresh){
     goldQuote=q;
     if(q.t!==goldSpotPoints.at(-1)?.t)goldSpotPoints.push(q);
   }
   goldSpotPoints=goldSpotPoints.filter(x=>x.t>t-48*3600);
   const bars=m.sampleBars(goldSpotRaw,goldSpotPoints,t);
   if(bars.length<2)throw Error("Not enough fresh observations");
   const changed=!already||bars.length!==data.length||bars.some((x,i)=>["time","open","high","low","close","samples"].some(k=>x[k]!==data[i]?.[k]));
   if(!already){
     benchmarkInfo={spotCandles:true};loadedKey="spot-candles:XAUUSD";
     const url=new URL(location.href);url.searchParams.set("period","live-15m");url.searchParams.set("interval","15");history.replaceState(null,"",url);
     const started=!!chart;startChart();if(started)makeSeries();
     $("benchmarkCredit").href=m.sourceUrl;$("benchmarkCredit").textContent="XAUS ↗";
     nativeControls(true);applySettings();
   }
   if(changed){
     const ts=chart.timeScale(),range=already?ts.getVisibleLogicalRange():null;
     const shift=range?(range.to>=data.length-2?bars.length-data.length:lowerBound(bars,data[0].time)-lowerBound(data,bars[0].time)):0;
     data=bars;barHover=null;pinnedBar=null;updateChart(range?{from:range.from+shift,to:range.to+shift}:null);
     if(!range)ts.setVisibleLogicalRange({from:Math.max(0,bars.length-90),to:bars.length+5});
   }
   if(goldQuote)$("quote").textContent="$"+price(goldQuote.p);
   $("tradeInfo").textContent="Indicative quotes · not broker OHLC · "+(goldQuote?"last quote "+new Date(goldQuote.t*1000).toISOString().slice(11,19)+" UTC":"no fresh quote");
   setLiveStatus(fresh?"goldLive":"goldLate");message("");
   if(manual||!already||!fresh)notify(fresh?"Gold spot samples · checked about every minute":"No fresh spot quote · showing available samples");
 }catch(e){
   console.warn("Gold samples",e);
   if(ticket===seq){setLiveStatus("goldLate");if(!already){
     message("Spot samples unavailable. Try Refresh or choose 15m for historical Gold candles.");
   }else notify("Quote unavailable · keeping loaded bars")}
 }finally{if(ticket===seq)busy=false}
}
const refreshSpot=()=>{if(!document.hidden&&goldLiveMode()&&!busy&&Date.now()-goldSpotRequest>=60000)loadGoldLive()};
setInterval(refreshSpot,1000);
document.addEventListener("visibilitychange",refreshSpot);
window.addEventListener("pageshow",refreshSpot);

async function loadImported(){const ticket=++seq;controller?.abort();stopLive();stopPlayback();clearTimeout(historyTimer);busy=false;historyBusy=false;historyEnded=true;hasHistory=false;nextBefore=null;replayData=null;
try{await getLibrary();if(ticket!==seq||!usingImport())return;startChart();if(seriesKind==="benchmark")makeSeries();applySettings();data=imported.bars.map(x=>({...x}));loadedKey="csv:"+key();nativeControls(true);$("pair").textContent=symbol+" · Imported";$("source").textContent=imported.name;$("tradeInfo").textContent="Historical data only";$("alertOpen").disabled=true;setLiveStatus("imported");updateChart(null);chart.timeScale().setVisibleLogicalRange({from:Math.max(0,data.length-100),to:data.length+5});message("");notify("Local CSV · not a live feed");renderObjects()}catch{if(ticket===seq)message("Could not start the Ledger chart engine.")}}
$("importOpen").onclick=()=>{$("csvInterval").value=String(interval);$("csvError").textContent="";$("csvExit").hidden=!localImport();showDialog("csvDialog")};
$("csvExit").onclick=()=>{imported=null;$("csvDialog").close();select(symbol)};
$("csvApply").onclick=async()=>{const file=$("csvFile").files[0],error=$("csvError"),button=$("csvApply"),chosen=symbol,activeFrame=interval,frame=Number($("csvInterval").value);error.textContent="";if(!file||file.size>4*1024*1024){error.textContent="Choose a CSV file up to 4 MB.";return}button.disabled=true;try{const raw=await file.text(),module=await import("/assets/candle-csv.js");const bars=module.parseCandleCsv(raw,MAX_BARS);if(!$("csvDialog").open||chosen!==symbol||activeFrame!==interval||!intervals.includes(frame))return;interval=frame;q("[data-i]").forEach(b=>b.classList.toggle("active",Number(b.dataset.i)===interval));imported={symbol:chosen,interval:frame,name:file.name,bars};$("csvFile").value="";$("csvDialog").close();select(symbol)}catch(e){error.textContent=e.message||"Unable to read this file."}finally{button.disabled=false}};

$("themeToggle").onclick=()=>{settings.theme=settings.theme==="light"?"dark":"light";save("ledger_chart_settings_v2",settings);applySettings();if(comparison!=="single")renderComparison()};select(symbol);requestAnimationFrame(paint);
setInterval(()=>{if(document.hidden||historyView||benchmarkMode()||usingImport()||csvOnlyMarket()||replayData||!data.length)return;if(liveState==="live"&&Date.now()-lastSocketMessage>45000){stopLive();startLive()}if(liveState!=="live"&&Date.now()-lastRestSync>=3000&&!busy&&!historyBusy)load();else if(liveState==="live"&&Date.now()-lastRestSync>=60000&&!busy&&!historyBusy)load();},1000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden&&!historyView&&!benchmarkMode()&&!usingImport()&&!csvOnlyMarket()&&!replayData){if(Date.now()-lastRestSync>5000)load();else startLive()}});
const refreshBenchmarks=()=>{if(!document.hidden&&benchmarkMode()&&!busy&&!replayData&&Date.now()-lastBenchmarkCheck>(goldIntraday()?300000:900000))loadBenchmark({refresh:true,quiet:true})};
setInterval(refreshBenchmarks,60000);document.addEventListener("visibilitychange",refreshBenchmarks);
window.addEventListener("pagehide",stopLive);
window.addEventListener("pageshow",e=>{if(e.persisted&&!historyView&&!benchmarkMode()&&!usingImport()&&!csvOnlyMarket()&&!replayData)load()});
})();
