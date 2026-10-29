// Live shadow replay of independent route checkpoints. No production writes,
// no LED activation. Report ONLY counts, never vehicle IDs or GPS coordinates.
import {readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {fetchAtbFleetGps} from '../worker/atb-fleet-gps.mjs';
import {updateRouteProgress} from '../core/engines/route-progress.mjs';
const root=new URL('../',import.meta.url);
const read=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
const board=await read('config/boards/trondheim-city-lines-catalog.json');
const profiles=await Promise.all(board.routes.filter(id=>id!=='trondheim-flybuss-live').map(id=>read('config/routes/'+id+'.json')));
let state={tracks:{}};
const samples=15,byLine={'1':{observations:0,tracked:0},'11':{observations:0,tracked:0}};
let total=0,tracked=0,unresolved=0;
for(let poll=1;poll<=samples;poll++){
  if(poll>1)await delay(8000);
  const now=Date.now(),source=await fetchAtbFleetGps({now});
  const vehicles=source.vehicles.map(v=>({
    id:v.id,publicCode:v.line,destination:v.destination,
    latitude:v.latitude,longitude:v.longitude,timestamp:v.lastUpdated
  }));
  const value=updateRouteProgress({profiles,vehicles,previousState:state,now});
  state=value.state;
  let thisTracked=0,other=0;
  for(const row of value.results){
    const line=row.key.split(':')[0];
    const good=row.status==='direction-tracked';
    if(good)thisTracked++;else other++;
    if(byLine[line]){byLine[line].observations++;if(good)byLine[line].tracked++;}
  }
  total+=value.results.length;tracked+=thisTracked;unresolved+=other;
  console.log('ROUTE_TRACK_SHADOW_SAMPLE '+JSON.stringify({
    poll,vehicles:value.results.length,directionTracked:thisTracked,unresolved:other
  }));
}
const pct=(n,d)=>d?Math.round(1000*n/d)/10:null;
console.log('ROUTE_TRACK_SHADOW_TOTAL '+JSON.stringify({
  samples,observations:total,directionTracked:tracked,
  directionTrackedPercent:pct(tracked,total),unresolved,
  line1:{...byLine['1'],percent:pct(byLine['1'].tracked,byLine['1'].observations)},
  line11:{...byLine['11'],percent:pct(byLine['11'].tracked,byLine['11'].observations)},
  note:'Repeated buses counted per sample. Direction inferred from route checkpoint order is not an actual stop confirmation; no frame or production changes.'
}));
