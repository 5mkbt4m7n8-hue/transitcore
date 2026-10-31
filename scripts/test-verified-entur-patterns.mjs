import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {create,availableLines}=require('../web/linear/network/line1-route-progress.js');
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const board=read('config/boards/trondheim-city-lines-catalog.json');
const original=read('config/gps/atb-journey-patterns-1-11.json');
const files=Array.from({length:5},(_,i)=>
 read('config/gps/atb-verified-patterns-'+String(i+1).padStart(2,'0')+'.json'));
const allExtra={};
for(const file of files){
 assert.equal(file.schemaVersion,1);
 assert.match(file.sourceURL,/^https:\/\/api\.entur\.io\/transit-data\/v1beta\/graphql$/);
 assert.equal(file.retrievedDate,'2026-10-31');
 for(const [code,line] of Object.entries(file.lines)){
  assert(!allExtra[code], 'No duplicate line snapshot '+code);
  assert(!['1','11'].includes(code),'Preserve original source-locked pilot lines');
  allExtra[code]=line;
 }
}
const patternData={...original,lines:{...allExtra,...original.lines}};
assert.equal(Object.keys(allExtra).length,41,'Exactly 41 newly verified lines');
assert.equal(Object.keys(patternData.lines).length,43,'41 extra plus two original pilots');
const catalogCodes=[...new Set(board.routes.map(id=>id.match(/^atb-bus-(\d+)-live$/)?.[1]).filter(Boolean))];
assert.equal(catalogCodes.length,47);
const excluded=catalogCodes.filter(c=>!patternData.lines[c]).sort((a,b)=>Number(a)-Number(b));
assert.deepEqual(excluded,['53','54','91','92']);
const quays=n=>[...new Set([n?.quayId,...(Array.isArray(n?.stopIds)?n.stopIds:[])])];
const mapped=new Map(),perLed=new Map();
for(const n of board.nodes||[]){
 if(!Number.isInteger(n.led))continue;
 for(const q of quays(n)){
  if(!/^NSR:Quay:\d+$/.test(q))continue;
  const ids=mapped.get(q)||new Set();ids.add(n.led);mapped.set(q,ids);
  const existing=perLed.get(n.led)||new Set();existing.add(q);perLed.set(n.led,existing);
 }
}
const available=availableLines({board,patterns:patternData});
assert.equal(available.length,43);
const now=Date.parse('2026-10-31T10:00:00Z');
const summary=[];
for(const [code,line] of Object.entries(patternData.lines)){
 assert.equal(line.lineId,'ATB:Line:2_'+code);
 const patterns=line.patterns,patternIds=new Set(),directions=new Set(),routeQuays=new Set();
 for(const p of patterns){
  assert(/^ATB:JourneyPattern:[\w.+-]+$/.test(p.id),'Invalid source ID '+p.id);
  assert(!patternIds.has(p.id),'Duplicate pattern '+p.id);
  patternIds.add(p.id);directions.add(p.directionType);
  assert(['inbound','outbound'].includes(p.directionType));
  assert(p.quays.length>=2&&p.quays.length<=200);
  for(const q of p.quays){assert(/^NSR:Quay:\d+$/.test(q));routeQuays.add(q);}
 }
 assert(patterns.length>=2&&directions.size===2,'Both directions must be source verified for '+code);
 const byLed=new Map();
 for(const n of board.nodes)for(const q of quays(n)){
  if(!routeQuays.has(q))continue;
  const list=byLed.get(n.led)||new Set();list.add(q);byLed.set(n.led,list);
 }
 let usablePairs=0,goodPair=null;
 for(const p of patterns)for(let i=1;i<p.quays.length;i++){
  const from=p.quays[i-1],to=p.quays[i];
  const ledA=[...(mapped.get(from)||[])],ledB=[...(mapped.get(to)||[])];
  if(ledA.length===1&&ledB.length===1&&ledA[0]!==ledB[0]&&
    byLed.get(ledA[0])?.size===1&&byLed.get(ledB[0])?.size===1){
   usablePairs++;goodPair??={from,to,ledA:ledA[0],ledB:ledB[0]};
  }
 }
 assert(usablePairs>=2,'Too few genuinely unambiguous adjacent GPS Quays for '+code);
 const info=available.find(x=>x.lineCode===code);
 assert(info?.usable, 'Tracker must expose approved line '+code);
 const route=read('config/routes/atb-bus-'+code+'-live.json');
 const tracker=create({board,patterns:patternData,profile:route,lineCode:code,clock:()=>now});
 const leds=[{id:goodPair.ledA,state:'APPROACHING',occupants:[{
  id:'PRIVATE-BUS',line:code,positionType:'gps-nearest-stop',
  nearestQuayLed:goodPair.ledA,destination:'test',state:'APPROACHING'}]}];
 const frame={boardProfile:board.id,generatedAt:new Date(now).toISOString(),ttlSeconds:30,leds};
 const observation=tracker.ingest(frame,{now});
 assert.equal(observation.active.length,1,'Exact mapped Quay must give one observation for '+code);
 assert.equal(observation.active[0].quay,goodPair.from);
 assert(!JSON.stringify(observation).includes('PRIVATE-BUS'));
 // Verify actual A -> B progression for every approved source line, not
 // just the first Quay. An inferred direction may remain unknown if variants
 // overlap, but a genuine adjacent sequence must never be a conflict.
 const continued=tracker.ingest({...frame,generatedAt:new Date(now+10000).toISOString(),
  leds:[{id:goodPair.ledB,state:'APPROACHING',occupants:[{
   id:'PRIVATE-BUS',line:code,positionType:'gps-nearest-stop',
   nearestQuayLed:goodPair.ledB,withinStopRadius:true,
   state:'APPROACHING'}]}]},{now:now+10000});
 assert.equal(continued.active[0].sequence.length,2,'A -> B must work for '+code);
 assert.notEqual(continued.active[0].status,'CONFLICT',
  'Documented adjacent Quays must not be rejected for '+code);
 // Only source-verified SIRI or explicit GPS can advance a sequence.
 // An estimated call with a real-looking Quay must not become a GPS event.
 const untrusted=[
  ['estimated call',{quayId:goodPair.from,positionType:'estimated-station-call'}],
  ['unknown type',{quayId:goodPair.from,positionType:'unknown'}],
  ['missing provenance',{quayId:goodPair.from}],
  ['outside stop radius',{positionType:'gps-nearest-stop',
   nearestQuayLed:goodPair.ledA,withinStopRadius:false}],
  ['wrong nearest LED',{quayId:goodPair.from,positionType:'gps-nearest-stop',
   nearestQuayLed:goodPair.ledB}],
  ['unconfirmed SIRI',{quayId:goodPair.from,
   positionType:'entur-siri-provider-stop',providerReportedAtStop:false,state:'AT_STOP'}]
 ];
 for(const [reason,invalid] of untrusted){
  const isolated=create({board,patterns:patternData,profile:route,lineCode:code,clock:()=>now});
  const state=invalid.state||'APPROACHING';
  const input={...frame,leds:[{id:goodPair.ledA,state,occupants:[{
   id:'PRIVATE-BUS',line:code,destination:'test',...invalid,state}]}]};
  const rejected=isolated.ingest(input,{now});
  assert.equal(rejected.active.length,0,code+' must reject '+reason);
  assert.equal(rejected.events.length,0,code+' must not log '+reason);
 }
 for(const [evidence,attributes,state] of [
  ['explicit GPS',{quayId:goodPair.from,positionType:'gps-route-quay'},'APPROACHING'],
  ['verified SIRI',{quayId:goodPair.from,positionType:'entur-siri-provider-stop',
   providerReportedAtStop:true,plannedSourceDirection:'inbound'},'AT_STOP']
 ]){
  const isolated=create({board,patterns:patternData,profile:route,lineCode:code,clock:()=>now});
  const input={...frame,leds:[{id:goodPair.ledA,state,occupants:[{
   id:'PRIVATE-BUS',line:code,destination:'test',...attributes,state}]}]};
  const result=isolated.ingest(input,{now});
  assert.equal(result.active.length,1,code+' accepts '+evidence);
  assert.equal(result.events[0].type,evidence==='verified SIRI'?'SOURCE_STOP':'GPS_NEAR');
  assert(!JSON.stringify(result).includes('PRIVATE-BUS'));
 }
 summary.push({line:code,patterns:patterns.length,quays:routeQuays.size,
  mappedQuays:info.mappedQuays,uniqueAdjacentPairs:usablePairs});
}
const unsupported=availableLines({board,patterns:{lines:{'1':original.lines['1']}}});
assert.equal(unsupported.find(x=>x.lineCode==='11').usable,false);
assert.throws(()=>create({board,patterns:patternData,profile:read('config/routes/atb-bus-53-live.json'),lineCode:'53'}),
 /unsupported-route-pattern/,'Rejected patterns must never create a tracker');
console.log('ENTUR_EXPANSION_TEST_SUMMARY '+JSON.stringify({approved:summary.length,excluded,lines:summary}));
console.log('Entur verified 43 lines: real source patterns, exact Quays/LEDs, both directions and safe GPS observations PASS');
