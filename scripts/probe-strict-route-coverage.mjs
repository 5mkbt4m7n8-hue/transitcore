// Read-only, best-effort coverage sampler for PR #279; never logs raw GPS/IDs.
// Run only on a trusted, credential-free CI runner. No writes to Entur or Workers.
import {readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {interpretStationVehicles} from '../core/engines/position-interpretation.mjs';
import {fetchAtbFleetGps} from '../worker/atb-fleet-gps.mjs';

const root=new URL('../',import.meta.url);
const read=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
const board=await read('config/boards/trondheim-city-lines-catalog.json');
const profiles=await Promise.all(board.routes.map(id=>read('config/routes/'+id+'.json')));
const sampleCount=6,intervalMs=8000;
const total={samples:0,observations:0,matched:0,unresolved:0,within60:0,reasons:{},lines:{}};
for(let poll=0;poll<sampleCount;poll++){
  if(poll)await delay(intervalMs);
  const now=Date.now();
  const source=await fetchAtbFleetGps({now});
  const vehicles=source.vehicles.map(v=>({
    id:v.id,publicCode:v.line,destination:v.destination,latitude:v.latitude,
    longitude:v.longitude,timestamp:v.lastUpdated
  }));
  const r=interpretStationVehicles({board,profiles,vehicles,now});
  if(r.observations.length!==vehicles.length)throw Error('Strict GPS observations missing');
  const summary={poll:poll+1,observations:r.observations.length,matched:0,unresolved:0,within60:0,line1:{observations:0,matched:0,within60:0},line11:{observations:0,matched:0,within60:0},reasons:{}};
  for(const o of r.observations){
    const matched=o.status==='matched',key=String(o.reason||'unspecified');
    summary[matched?'matched':'unresolved']++;
    summary.reasons[key]=(summary.reasons[key]||0)+1;
    if(o.nearestQuayDistanceMeters!=null&&o.nearestQuayDistanceMeters<=60)summary.within60++;
    const field=o.line==='1'?'line1':o.line==='11'?'line11':null;
    if(field){summary[field].observations++;if(matched)summary[field].matched++;if(o.nearestQuayDistanceMeters!=null&&o.nearestQuayDistanceMeters<=60)summary[field].within60++;}
    const line=String(o.line||'unknown');
    total.lines[line]??={observations:0,matched:0,within60:0};
    total.lines[line].observations++;if(matched)total.lines[line].matched++;
    if(o.nearestQuayDistanceMeters!=null&&o.nearestQuayDistanceMeters<=60)total.lines[line].within60++;
    total.reasons[key]=(total.reasons[key]||0)+1;
  }
  total.samples++;total.observations+=summary.observations;total.matched+=summary.matched;
  total.unresolved+=summary.unresolved;total.within60+=summary.within60;
  console.log('STRICT_GPS_SAMPLE '+JSON.stringify(summary));
}
const pct=(n,d)=>d?Math.round(n/d*1000)/10:null;
const lineSummary=Object.fromEntries(['1','11'].map(line=>[line,{...total.lines[line],matchedPercent:pct(total.lines[line]?.matched||0,total.lines[line]?.observations||0)}]));
console.log('STRICT_GPS_COVERAGE '+JSON.stringify({
  samples:total.samples,observations:total.observations,matched:total.matched,
  matchedPercent:pct(total.matched,total.observations),
  within60:total.within60,within60Percent:pct(total.within60,total.observations),
  unresolved:total.unresolved,lines:lineSummary,
  reasons:total.reasons,note:'Fresh upstream snapshots, repeated vehicles may occur; not a physical platform accuracy measurement.'
}));
if(total.observations===0)throw Error('No eligible live GPS observations');
