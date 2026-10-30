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

const CLIENT='transitcore-shared-quay-observer';
const SAMPLES=5,INTERVAL_MS=26000,MAX_SOURCE_LOOKUPS=8;
const targets={'NSR:Quay:102733':'Tonstadkrysset',
 'NSR:Quay:102721':'Østre Lund'};
const board=JSON.parse(await readFile(new URL('../config/boards/trondheim-city-lines-catalog.json',import.meta.url),'utf8'));
const profile=JSON.parse(await readFile(new URL('../config/routes/atb-bus-1-live.json',import.meta.url),'utf8'));
const nodes=new Map(board.nodes.filter(n=>Object.hasOwn(targets,n.quayId)).map(n=>[n.quayId,n]));
if(nodes.size!==2)throw Error('Source Quay catalog incomplete; diagnostic aborted');
const cache=new Map(),events=new Set(),failureCount={};
const failure=reason=>failureCount[reason]=(failureCount[reason]||0)+1;
const totals=Object.fromEntries(Object.entries(targets).map(([id,name])=>[id,{
 name,uniqueSourceReports:0,identityAndTimeMatched:0,sourceTripPatternVerified:0,
 sourceDirections:{inbound:0,outbound:0},sourceRoles:{origin:0,intermediate:0,terminus:0},
 sourceQuayNotOnTrip:0,strictProviderGateAccepted:0,strictProviderGateRejected:{},
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
 for(const report of reports){
  const uniqueKey=report.vehicleRef+'|'+report.quayId+'|'+report.recordedAt;
  if(events.has(uniqueKey))continue;
  events.add(uniqueKey);newReports++;
  const row=totals[report.quayId];row.uniqueSourceReports++;
  const candidate=pilot.filter(x=>x.lineRef===report.lineRef&&
   x.vehicleRef===report.vehicleRef&&x.recordedAt===report.recordedAt);
  const refs=[...new Set(candidate.map(x=>x.datedVehicleJourneyRef))];
  if(refs.length!==1||!/^ATB:ServiceJourney:[A-Za-z0-9_.+-]+$/.test(refs[0]||'')){
   failure('missing-or-conflicting-service-reference');continue;
  }
  const gpsRow=gpsById.get(report.vehicleRef);
  if(!gpsRow){failure('gps-vehicle-not-found');continue;}
  const sj=await serviceJourney(refs[0]);
  if(!sj){failure(lookups>=MAX_SOURCE_LOOKUPS?'lookup-budget-or-not-found':'service-journey-not-found');continue;}
  const joined=joinSiriVehicleToServiceJourney({siri:candidate[0],
   vehicle:{id:gpsRow.id,publicCode:gpsRow.line,timestamp:gpsRow.lastUpdated},
   serviceJourney:sj,now});
  if(joined.status!=='route-pattern-supported'){
   failure(joined.reason);continue;
  }
  row.identityAndTimeMatched++;linked++;
  const role=inspectSharedQuayContext({lineCode:'1',journeyEvidence:joined,
   quayId:report.quayId});
  if(role.status==='source-pattern-context-only'){
   row.sourceTripPatternVerified++;
   row.sourceDirections[role.sourceDirection]++;
   row.sourceRoles[role.role]++;
   // These MUST remain zero, even when a source direction is known.
   if(role.physicalSideConfirmed||role.eligibleForLed)throw Error('Unsafe shared Quay escalation');
  }else{
   row.sourceQuayNotOnTrip++;failure(role.reason);
  }
  const evidence=evaluateEnturStopEvidence({report,
   vehicle:{id:gpsRow.id,publicCode:gpsRow.line,
    destination:gpsRow.destination,latitude:gpsRow.latitude,
    longitude:gpsRow.longitude,timestamp:gpsRow.lastUpdated},
   profile,node:nodes.get(report.quayId),now});
  if(evidence.accepted)row.strictProviderGateAccepted++;
  else row.strictProviderGateRejected[evidence.reason]=(row.strictProviderGateRejected[evidence.reason]||0)+1;
 }
 console.log('SHARED_QUAY_POLL '+JSON.stringify({
  poll:poll+1,newUniqueReports:newReports,sourceTripIdentityTimeMatches:linked,
  note:'Counts only; no physical-side assumption or LED action'
 }));
}
console.log('SHARED_QUAY_FINAL '+JSON.stringify({
 samples:SAMPLES,lookups,byQuay:totals,unresolved:failureCount,
 status:'NO_GO',note:'Same Quay can appear in both source directions. A journey pattern proves planned route context, not a distinct physical platform. Existing ambiguity guard remains.'
}));
