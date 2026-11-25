// Pass a directory containing the three all-history FRED CSV exports.
import {readFileSync, writeFileSync} from "node:fs";
import {parseEiaCsv} from "../functions/api/commodity-history.js";
const series = {USOIL:"DCOILWTICO",UKOIL:"DCOILBRENTEU",NATGAS:"DHHNGSP"};
for(const [symbol,key] of Object.entries(series)){
  const points = parseEiaCsv(readFileSync(process.argv[2]+"/"+key+".csv","utf8"),key);
  const first = points[0][0];
  const values = Array.from({length:(points.at(-1)[0]-first)/86400+1},()=>null);
  for(const [time,value] of points)values[(time-first)/86400]=value;
  writeFileSync("assets/data/eia-"+symbol+".json",JSON.stringify({first,values})+"\n");
}
