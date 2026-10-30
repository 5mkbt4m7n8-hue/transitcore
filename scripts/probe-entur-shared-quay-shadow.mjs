// Live public-data diagnostic ONLY. Never publish vehicle IDs, GPS coordinates,
// service trip IDs, source XML, or modify an LED frame or production state.
// Shared Quays may be used in both source directions; a planned direction is
// not proof of physical side, stop occupancy, or a safe LED.
import {readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {parseAtbReportedStops} from '../core/providers/entur/siri-vm-stop-parser.mjs';
import {parsePilotSiriJourneyRefs} from '../core/providers/entur/siri-vm-journey-parser.mjs';
import {joinSiriVehicleToServiceJourney} from '../core/engines/entur-trip-pattern-link.mjs';
import {inspectSharedQuayContext} from '../core/engines/entur-shared-quay-context.mjs';
import {evaluateEnturStopEvidence} from '../core/engines/entur-stop-evidence.mjs';
import {fetchAtbFleetGps} from '../worker/atb-fleet-gps.mjs';
import {distance} from '../core/frame/mapping-support.mjs';
import {resolveExactServiceJourneyPattern} from '../core/engines/entur-trip-pattern-link.mjs';
import {publicSharedQuayEvent,publicNearbyGpsCounts} from './shared-quay-diagnostic-format.mjs';
import {evaluateTonstadShadowFrame,TONSTAD_QUAY} from './shared-quay-frame-shadow.mjs';

const CLIENT='transitcore-shared-quay-observer';
// A future read-only sample; not tied to the already elapsed 14:11 pass.
const SAMPLES=8,INTERVAL_MS=20000,MAX_SOURCE_LOOKUPS=16;
const targets={'NSR:Quay:102733':'Tonstadkrysset',
 'NSR:Quay:102721':'Østre Lund'};
const board=JSON.parse(await readFile(new URL('../config/boards/trondheim-city-lines-catalog.json',import.meta.url),'utf8'));
const profile=JSON.parse(await readFile(new URL('../config/routes/atb-bus-1-live.json',import.meta.url),'utf8'));
const nodes=new Map(board.nodes.filter(n=>Object.hasOwn(targets,n.quayId)).map(n=>[n.quayId,n]));
if(nodes.size!==2)throw Error('Source Quay catalog incomplete; diagnostic aborted');
const routeDestination=value=>{
 const normalized=String(value||'').normalize('NFC').trim().toLowerCase().split(/\s+via\s+/)[0];
 return ({'ranheim':'Ranheim','østre lund':'Østre Lund','tillerterminalen':'Tillerterminalen',
  'strindheim':'Strindheim','kattem':'Kattem'})[normalized]||'other';
};
let uniqueNumber=0;
const cache=new Map(),events=new Set(),failureCount={};
const failure=reason=>failureCount[reason]=(failureCount[reason]||0)+1;
const totals=Object.fromEntries(Object.entries(targets).map(([id,name])=>[id,{
 name,uniqueSourceReports:0,identityAndTimeMatched:0,sourceTripPatternVerified:0,
 sourceDirections:{inbound:0,outbound:0},sourceRoles:{origin:0,intermediate:0,terminus:0},
 sourceQuayNotOnTrip:0,strictProviderGateAccepted:0,
 sharedSameLedAccepted:0,strictProviderGateRejected:{},
 physicalSideVerified:0,ledEligible:0
}]));
let lookups=0;
async function serviceJourney(id) {
 if(cache.has(id))return cache.get(id);
 if(lookups>=MAX_SOURCE_LOOKUPS)return null;
 lookups++;
 const response=await fetch('https://api.entur.io/transit-data/v1beta/mcp',{
  method:'POST',headers:{'Content-Type':'application/json',
   'Accept':'application/json, text/event-stream','ET-Client-Name':CLIENT},
  body:JSON.stringify({jsonrpc:'2.0',id:lookups,method:'tools/call',
   params:{name:'serviceJourney',arguments:{id,
    fields:'id line{id} journeyPattern{id directionType}'}}}),
  signal:AbortSignal.timeout(16000)});
 if(response.status===429)throw Error('Transit MCP HTTP 429; stop without retry');
 if(!response.ok)throw Error('Transit MCP HTTP '+response.status+'; stop without retry');
 const body=await response.json();
 if(body.error||body.result?.isError)throw Error('Invalid Transit MCP response');
 const value=JSON.parse(body.result?.content?.find(x=>x.type==='text')?.text||'{}').data?.serviceJourney||null;
 cache.set(id,value);return value;
}
console.log('SHARED_QUAY_START '+JSON.stringify({
 quays:Object.entries(targets).map(([id,name])=>({id,name})),
 samples:SAMPLES,intervalSeconds:INTERVAL_MS/1000,
 diagnostic:'future observed reports, not a replay of the 2026-10-30 14:11 passage',
 rule:'Strict existing provider gate is NOT overridden; source direction is only route context'
}));
for(let poll=0;poll<SAMPLES;poll++){
 if(poll)await delay(INTERVAL_MS);
 const [siri,gps]=await Promise.all([
  fetch('https://api.entur.io/realtime/v1/rest/vm?datasetId=ATB&maxSize=1500',{
   headers:{'ET-Client-Name':CLIENT,Accept:'application/xml'},
   signal:AbortSignal.timeout(18000)}),
  fetchAtbFleetGps({now:Date.now(),clientName:CLIENT})
 ]);
 if(siri.status===429)throw Error('SIRI HTTP 429; stop without retry');
 if(!siri.ok)throw Error('SIRI HTTP '+siri.status+'; stop without retry');
 const xml=await siri.text(),now=Date.now();
 const reports=parseAtbReportedStops(xml).filter(r=>
  r.lineRef==='ATB:Line:2_1'&&Object.hasOwn(targets,r.quayId));
 const pilot=parsePilotSiriJourneyRefs(xml);
 const gpsById=new Map(gps.vehicles.filter(v=>v.line==='1').map(v=>[v.id,v]));
 let newReports=0,linked=0;
 const shadowReports=[],shadowJourneys=new Map();
 for(const report of reports){
  // Raw identities stay private inside this process; they are never output.
  const uniqueKey=report.vehicleRef+'|'+report.quayId+'|'+report.recordedAt;
  if(events.has(uniqueKey))continue;
  events.add(uniqueKey);newReports++;
  const row=totals[report.quayId];row.uniqueSourceReports++;
  const event={
   eventNumber:++uniqueNumber,poll:poll+1,quayId:report.quayId,
   siriRecordedAtUtc:report.recordedAt,
   siriTripReference:'missing',gpsVehicleIdMatch:'not-checked',
   serviceJourneyLookup:'not-queried',sourceDirection:'unknown',
   sourceQuayRole:'unknown',sourceQuayOnTrip:false,
   siriGpsTimeAndIdentity:'not-checked',destination:'unknown',
   currentStopGate:'not-checked',reason:'unavailable'
  };
  const finish=(reason,failed=true)=>{
   event.reason=reason;
   if(failed)failure(reason);
   console.log('SHARED_QUAY_EVENT '+JSON.stringify(publicSharedQuayEvent(event)));
  };
  const candidate=pilot.filter(x=>x.lineRef===report.lineRef&&
   x.vehicleRef===report.vehicleRef&&x.recordedAt===report.recordedAt);
  const refs=[...new Set(candidate.map(x=>x.datedVehicleJourneyRef))];
  if(refs.length!==1){
   event.siriTripReference=refs.length?'conflicting':'missing';
   finish('missing-or-conflicting-service-reference');continue;
  }
  if(!/^ATB:ServiceJourney:[A-Za-z0-9_.+-]+$/.test(refs[0])){
   event.siriTripReference='unsupported';
   finish('unsupported-service-reference');continue;
  }
  event.siriTripReference='unique';
  const gpsRow=gpsById.get(report.vehicleRef);
  if(gpsRow){
   event.gpsVehicleIdMatch='found';
   event.destination=routeDestination(gpsRow.destination);
  }else event.gpsVehicleIdMatch='missing';
  if(!cache.has(refs[0])&&lookups>=MAX_SOURCE_LOOKUPS){
   event.serviceJourneyLookup='budget-exhausted';
   finish('source-lookup-budget-exhausted');continue;
  }
  const sj=await serviceJourney(refs[0]);
  if(!sj){
   event.serviceJourneyLookup='not-found';
   finish('service-journey-not-found');continue;
  }
  const sourcePattern=resolveExactServiceJourneyPattern({
   lineCode:'1',datedVehicleJourneyRef:refs[0],
   serviceJourney:sj,vehicleLineRef:report.lineRef
  });
  if(sourcePattern.status!=='route-pattern-supported'){
   event.serviceJourneyLookup='unverified';
   finish('source-'+sourcePattern.reason);continue;
  }
  event.serviceJourneyLookup='verified';
  event.sourceDirection=sourcePattern.directionType;
  const sourceQuayIndex=sourcePattern.quays.indexOf(report.quayId);
  const isUniqueSourceQuay=sourceQuayIndex>=0&&
   sourcePattern.quays.lastIndexOf(report.quayId)===sourceQuayIndex;
  event.sourceQuayOnTrip=isUniqueSourceQuay;
  if(isUniqueSourceQuay){
   event.sourceQuayRole=sourceQuayIndex===0?'origin':
    sourceQuayIndex===sourcePattern.quays.length-1?'terminus':'intermediate';
  }
  if(!gpsRow){
   finish('gps-vehicle-not-found');continue;
  }
  const joined=joinSiriVehicleToServiceJourney({siri:candidate[0],
   vehicle:{id:gpsRow.id,publicCode:gpsRow.line,timestamp:gpsRow.lastUpdated},
   serviceJourney:sj,now});
  if(joined.status!=='route-pattern-supported'){
   event.siriGpsTimeAndIdentity='unresolved';
   finish(joined.reason);continue;
  }
  event.siriGpsTimeAndIdentity='matched';
  row.identityAndTimeMatched++;linked++;
  const role=inspectSharedQuayContext({lineCode:'1',journeyEvidence:joined,
   quayId:report.quayId});
  if(role.status==='source-pattern-context-only'){
   row.sourceTripPatternVerified++;
   row.sourceDirections[role.sourceDirection]++;
   row.sourceRoles[role.role]++;
   if(role.physicalSideConfirmed||role.eligibleForLed)
    throw Error('Unsafe shared Quay escalation');
  }else{
   row.sourceQuayNotOnTrip++;
   finish(role.reason);continue;
  }
  const evidence=evaluateEnturStopEvidence({report,
   vehicle:{id:gpsRow.id,publicCode:gpsRow.line,
    destination:gpsRow.destination,latitude:gpsRow.latitude,
    longitude:gpsRow.longitude,timestamp:gpsRow.lastUpdated},
   profile,node:nodes.get(report.quayId),now,
   sharedQuayJourney:report.quayId==='NSR:Quay:102733'?
     {siri:candidate[0],serviceJourney:sj}:null
  });
  event.currentStopGate=evidence.accepted?'accepted':'rejected';
  if(evidence.accepted){
   if(report.quayId===TONSTAD_QUAY){
    shadowReports.push(report);
    shadowJourneys.set(report.vehicleRef,{siri:candidate[0],serviceJourney:sj});
   }
   row.strictProviderGateAccepted++;
   if(evidence.sharedQuaySameLed)row.sharedSameLedAccepted++;
   finish(evidence.reason,false);
  }else{
   row.strictProviderGateRejected[evidence.reason]=
    (row.strictProviderGateRejected[evidence.reason]||0)+1;
   finish(evidence.reason);
  }
 }
 // Run the REAL strict interpreter and frame renderer locally against
 // the complete board. Log only a sanitized target summary, never raw frames.
 const frameShadow=evaluateTonstadShadowFrame({
  board,profile,now,
  vehicles:[...gpsById.values()].map(v=>({
   id:v.id,publicCode:v.line,destination:v.destination,
   latitude:v.latitude,longitude:v.longitude,timestamp:v.lastUpdated
  })),
  reports:shadowReports,verifiedJourneys:shadowJourneys
 });
 if(frameShadow.provenAtStopOccupants>shadowReports.length)
  throw Error('Shadow frame has unproven occupants');
 console.log('SHARED_QUAY_FRAME_SHADOW '+JSON.stringify({
  poll:poll+1,...frameShadow
 }));
 const nearbyCounts=Object.keys(targets).map(quayId=>{
  const node=nodes.get(quayId);
  const near=gps.vehicles.filter(v=>v.line==='1'&&
   Number.isFinite(v.latitude)&&Number.isFinite(v.longitude)&&
   Number.isFinite(Date.parse(v.lastUpdated||''))&&
   now-Date.parse(v.lastUpdated)>=0&&now-Date.parse(v.lastUpdated)<=30000&&
   distance({lat:v.latitude,lon:v.longitude},node)<=100);
  return publicNearbyGpsCounts({quayId,nearby:near.length,
   ranheimBound:near.filter(v=>routeDestination(v.destination)==='Ranheim').length});
 });
 console.log('SHARED_QUAY_POLL '+JSON.stringify({
  poll:poll+1,newUniqueReports:newReports,sourceTripIdentityTimeMatches:linked,
  nearbyGps:nearbyCounts,
  note:'Only GPS proximity counts, not proof of actual stop or permission to light LED'
 }));
}
console.log('SHARED_QUAY_FINAL '+JSON.stringify({
 samples:SAMPLES,lookups,byQuay:totals,unresolved:failureCount,
 status:'NO_GO',note:'Same Quay can appear in both source directions. A journey pattern proves planned route context, not a distinct physical platform. Existing ambiguity guard remains.'
}));
