// Bounded read-only shadow replay of actual AtB line 1/11 vehicles.
// Exact SIRI VehicleRef -> GPS -> ServiceJourney -> source JourneyPattern.
// GPS near a Quay is only a *candidate*, never a confirmed stop. Only a
// fresh explicit SIRI MonitoredCall.VehicleAtStop can be provider-reported.
// Never output raw vehicle/trip IDs, GPS coordinates, or source XML.
// Never write to production, update frames, or change LED assignments.
import {readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {fetchAtbFleetGps} from '../worker/atb-fleet-gps.mjs';
import {parsePilotSiriJourneyRefs} from '../core/providers/entur/siri-vm-journey-parser.mjs';
import {parseAtbReportedStops} from '../core/providers/entur/siri-vm-stop-parser.mjs';
import {joinSiriVehicleToServiceJourney} from '../core/engines/entur-trip-pattern-link.mjs';
import {observeSourceQuaySequence} from '../core/engines/source-quay-sequence-shadow.mjs';
import {evaluateEnturStopEvidence} from '../core/engines/entur-stop-evidence.mjs';
import {distance} from '../core/frame/mapping-support.mjs';

const SAMPLE_COUNT=8,INTERVAL_MS=26000,MAX_TARGETS_PER_LINE=3;
const CLIENT='transitcore-atb-sequence-shadow';
const root=new URL('../',import.meta.url);
const read=async path=>JSON.parse(await readFile(new URL(path,root),'utf8'));
const [board,comp,route1,route11]=await Promise.all([
 read('config/boards/trondheim-city-lines-catalog.json'),
 read('config/gps/trondheim-quay-competitors.json'),
 read('config/routes/atb-bus-1-live.json'),
 read('config/routes/atb-bus-11-live.json')
]);
const byLineProfile=new Map([['1',route1],['11',route11]]);
const byQuay=new Map(board.nodes.map(n=>[n.quayId,n]));
// Include *all* known catalogued Quays and additional same-StopPlace
// competitors, not just the points belonging to a selected JourneyPattern.
const positions=new Map();
for(const node of board.nodes)if(/^NSR:Quay:[0-9]+$/.test(node.quayId||'')&&
 Number.isFinite(node.lat)&&Number.isFinite(node.lon))
 positions.set(node.quayId,{id:node.quayId,lat:node.lat,lon:node.lon});
for(const row of comp.quays||[])if(!positions.has(row[0])&&
 Number.isFinite(row[2])&&Number.isFinite(row[3]))
 positions.set(row[0],{id:row[0],lat:row[2],lon:row[3]});
const positionList=[...positions.values()];
function gpsCandidate(vehicle,route) {
 const point={lat:vehicle.latitude,lon:vehicle.longitude};
 let best=null,bestM=Infinity,secondM=Infinity;
 for(const node of positionList){
  const m=distance(point,node);
  if(m<bestM){secondM=bestM;bestM=m;best=node;}
  else if(m<secondM)secondM=m;
 }
 // Conservative same-side gate from the existing strict route candidate:
 // within 60 m AND >60 m closer than *every* other known Quay.
 if(!best||bestM>60||secondM-bestM<=60)return null;
 const index=route.quays.indexOf(best.id);
 return index<0?null:index;
}
const pilotLine=line=>line==='ATB:Line:2_1'?'1':line==='ATB:Line:2_11'?'11':null;
async function fetchSample(){
 const [siri,gps]=await Promise.all([
  fetch('https://api.entur.io/realtime/v1/rest/vm?datasetId=ATB&maxSize=1500',{
   headers:{'ET-Client-Name':CLIENT,Accept:'application/xml'},
   signal:AbortSignal.timeout(18000)}),
  fetchAtbFleetGps({now:Date.now(),clientName:CLIENT})
 ]);
 if(siri.status===429)throw Error('SIRI rate limited (429); stop without retry');
 if(!siri.ok)throw Error('SIRI HTTP '+siri.status+'; stop without retry');
 const xml=await siri.text();
 const refs=parsePilotSiriJourneyRefs(xml);
 const stopReports=parseAtbReportedStops(xml);
 const now=Date.now();
 const latest=new Map(),conflicts=new Set();
 for(const row of refs){
  const line=pilotLine(row.lineRef);
  if(!line)continue;
  const key=line+'|'+row.vehicleRef,prev=latest.get(key);
  if(prev&&prev.recordedAt===row.recordedAt&&prev.datedVehicleJourneyRef!==row.datedVehicleJourneyRef){
   conflicts.add(key);continue;
  }
  if(!prev||Date.parse(row.recordedAt)>Date.parse(prev.recordedAt))latest.set(key,row);
 }
 for(const key of conflicts)latest.delete(key);
 const gpsMap=new Map(gps.vehicles.filter(v=>v.line==='1'||v.line==='11')
  .map(v=>[v.line+'|'+v.id,v]));
 return {latest,gpsMap,stopReports,now,
  providerAtStopCount:stopReports.filter(r=>pilotLine(r.lineRef)).length,
  activities:refs.length,conflicts:conflicts.size};
}
async function serviceJourneyById(id,requestId){
 const request=await fetch('https://api.entur.io/transit-data/v1beta/mcp',{
  method:'POST',headers:{'ET-Client-Name':CLIENT,'Content-Type':'application/json',
   Accept:'application/json, text/event-stream'},
  body:JSON.stringify({jsonrpc:'2.0',id:requestId,method:'tools/call',
   params:{name:'serviceJourney',arguments:{id,
    fields:'id line{id} journeyPattern{id directionType}'}}}),
  signal:AbortSignal.timeout(16000)});
 if(request.status===429)throw Error('Transit Data rate limited (429); stop without retry');
 if(!request.ok)throw Error('Transit Data HTTP '+request.status);
 const data=await request.json();
 if(data.error||data.result?.isError)throw Error('Transit Data serviceJourney response invalid');
 return JSON.parse(data.result?.content?.find(x=>x.type==='text')?.text||'{}').data?.serviceJourney;
}
const count=(obj,key)=>obj[key]=(obj[key]||0)+1;
const lineStats=Object.fromEntries(['1','11'].map(code=>[code,{
 selected:0,identityAndTimePass:0,identityUnresolved:{},
 sourcePatternPass:0,gpsCandidates:0,gpsVisits:0,gpsForward:0,
 gpsAdjacentTriplets:0,providerReports:0,providerValidStops:0,
 providerVisits:0,providerForward:0,providerAdjacentTriplets:0,
 providerRejected:{},reverseOrConflict:0
}]));
const targets=new Map();
let initial=await fetchSample(),requestId=1;
for(const line of ['1','11']){
 const source=[...initial.latest.entries()]
  .filter(([key,row])=>key.startsWith(line+'|')&&
   /^ATB:ServiceJourney:[A-Za-z0-9_.+-]+$/.test(row.datedVehicleJourneyRef)&&
   initial.gpsMap.has(key))
  .sort((a,b)=>Date.parse(b[1].recordedAt)-Date.parse(a[1].recordedAt));
 for(const [key,siri] of source){
  if(lineStats[line].selected>=MAX_TARGETS_PER_LINE)break;
  const gps=initial.gpsMap.get(key);
  const service=await serviceJourneyById(siri.datedVehicleJourneyRef,requestId++);
  const join=joinSiriVehicleToServiceJourney({
   siri,vehicle:{id:gps.id,publicCode:gps.line,timestamp:gps.lastUpdated},
   serviceJourney:service,now:initial.now});
  if(join.status!=='route-pattern-supported'){
   count(lineStats[line].identityUnresolved,join.reason);continue;
  }
  targets.set(key,{line,serviceRef:siri.datedVehicleJourneyRef,service,route:join,
   state:{},lastGpsAt:null,lastProviderAt:null,retired:false});
  lineStats[line].selected++;
  lineStats[line].sourcePatternPass++;
 }
}
console.log('SEQUENCE_SHADOW_START '+JSON.stringify({
 samples:SAMPLE_COUNT,intervalSeconds:INTERVAL_MS/1000,
 initialPilots:initial.activities,knownQuayCoordinates:positionList.length,
 selectedLine1:lineStats['1'].selected,selectedLine11:lineStats['11'].selected,
 note:'Only exact SIRI/GPS/ServiceJourney source identities; GPS is not proof of stop.'
}));
for(let poll=0;poll<SAMPLE_COUNT;poll++){
 // First observation uses the SAME snapshot that selected the target vehicles.
 if(poll>0)await delay(INTERVAL_MS);
 const sample=poll===0?initial:await fetchSample();
 let linked=0,gpsCandidates=0,providerAccepted=0,providerRejected=0;
 for(const [key,target] of targets){
  const stats=lineStats[target.line];
  if(target.retired)continue;
  const siri=sample.latest.get(key),gps=sample.gpsMap.get(key);
  if(!siri||!gps){
   count(stats.identityUnresolved,!siri?'siri-missing':'gps-missing');continue;
  }
  if(siri.datedVehicleJourneyRef!==target.serviceRef){
   count(stats.identityUnresolved,'service-journey-changed');
   target.retired=true;continue;
  }
  const joined=joinSiriVehicleToServiceJourney({
   siri,vehicle:{id:gps.id,publicCode:gps.line,timestamp:gps.lastUpdated},
   serviceJourney:target.service,now:sample.now});
  if(joined.status!=='route-pattern-supported'){
   count(stats.identityUnresolved,joined.reason);continue;
  }
  stats.identityAndTimePass++;linked++;
  const gpsIndex=gpsCandidate(gps,target.route);
  if(gpsIndex!==null){stats.gpsCandidates++;gpsCandidates++;}
  // Current-stop evidence needs one unambiguous provider report in the same
  // SIRI snapshot. No inferred stop from OnwardCall or GPS candidate.
  const reports=sample.stopReports.filter(r=>
   r.vehicleRef===gps.id&&r.lineRef===siri.lineRef&&
   r.recordedAt===siri.recordedAt);
  let providerIndex=null,providerAt=null;
  if(reports.length>1){count(stats.providerRejected,'multiple-stop-reports');providerRejected++;}
  else if(reports.length===1){
   stats.providerReports++;
   const report=reports[0],index=target.route.quays.indexOf(report.quayId);
   if(index<0){count(stats.providerRejected,'quay-not-on-source-pattern');providerRejected++;}
   else {
    const gate=evaluateEnturStopEvidence({
     report,vehicle:{id:gps.id,publicCode:gps.line,
      destination:gps.destination,latitude:gps.latitude,longitude:gps.longitude,
      timestamp:gps.lastUpdated},
     profile:byLineProfile.get(target.line),node:byQuay.get(report.quayId),
     now:sample.now
    });
    if(gate.accepted){providerIndex=index;providerAt=report.recordedAt;
     stats.providerValidStops++;providerAccepted++;
    }else{count(stats.providerRejected,gate.reason);providerRejected++;}
   }
  }
  const result=observeSourceQuaySequence(target.state,{
   patternLength:target.route.quays.length,
   gpsCandidateIndex:gpsIndex,gpsAt:gpsIndex!==null?gps.lastUpdated:null,
   providerStopIndex:providerIndex,providerAt
  });
  target.state=result.state;
  for(const kind of ['gpsVisits','gpsForward','gpsAdjacentTriplets',
    'providerVisits','providerForward','providerAdjacentTriplets','reverseOrConflict'])
   stats[kind]+=result.delta[kind];
 }
 console.log('SEQUENCE_SHADOW_POLL '+JSON.stringify({
  poll:poll+1,selected:targets.size,linked,gpsCandidates,
  providerAccepted,providerRejected,sourceStopReports:sample.providerAtStopCount,
  note:'Aggregated counters only; not stop placement or a physical LED frame'
 }));
}
const summary=Object.fromEntries(['1','11'].map(code=>{
 const targeted=[...targets.values()].filter(t=>t.line===code);
 return [code,{...lineStats[code],tracksWithTwoGpsQuays:
  targeted.filter(t=>t.state.gps?.length>=2).length,
  tracksWithThreeGpsQuays:targeted.filter(t=>t.state.gps?.length>=3).length,
  tracksWithTwoProviderQuays:targeted.filter(t=>t.state.provider?.length>=2).length,
  tracksWithThreeProviderQuays:targeted.filter(t=>t.state.provider?.length>=3).length}];
}));
console.log('SEQUENCE_SHADOW_FINAL '+JSON.stringify({
 sampled:SAMPLE_COUNT,lines:summary,
 criteria:'GPS candidates use <=60m and >60m separation from all known Quays; provider stops require explicit current SIRI MonitoredCall and source route/direction/time/GPS checks',
 status:'NO_GO',note:'This bounded observation cannot establish complete trips or physical station arrival. No source IDs, coordinates, automatic merges, deployment or LED changes.'
}));
