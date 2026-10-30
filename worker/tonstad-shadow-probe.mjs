// Explicitly invoked, ONE-shot source observation. This module never writes to
// the production feed, alters a board, calls a device or discloses raw IDs.
// No retries, no scheduling, no background polling.
import board from '../config/boards/trondheim-city-lines-catalog.json' with {type:'json'};
import profile from '../config/routes/atb-bus-1-live.json' with {type:'json'};
import {parseAtbReportedStops} from '../core/providers/entur/siri-vm-stop-parser.mjs';
import {parsePilotSiriJourneyRefs} from '../core/providers/entur/siri-vm-journey-parser.mjs';
import {joinSiriVehicleToServiceJourney} from '../core/engines/entur-trip-pattern-link.mjs';
import {evaluateEnturStopEvidence} from '../core/engines/entur-stop-evidence.mjs';
import {fetchAtbFleetGps} from './atb-fleet-gps.mjs';
import {TONSTAD_QUAY,evaluateTonstadShadowFrame} from '../scripts/shared-quay-frame-shadow.mjs';
import {publicSharedQuayEvent} from '../scripts/shared-quay-diagnostic-format.mjs';

const CLIENT='intransit-tonstad-shadow-staging';
const SIRI='https://api.entur.io/realtime/v1/rest/vm?datasetId=ATB&maxSize=1500';
const MCP='https://api.entur.io/transit-data/v1beta/mcp';
const MAX_LOOKUPS=2,MAX_REPORTS=4;

const safeCause=(cause)=>cause instanceof Error&&/^(source-|entur-)/.test(cause.message)?
 cause.message:'source-unavailable';
function destination(value){
 const v=String(value||'').normalize('NFC').trim().toLowerCase().split(/\s+via\s+/)[0];
 return ({ranheim:'Ranheim','østre lund':'Østre Lund',tillerterminalen:'Tillerterminalen',
  strindheim:'Strindheim',kattem:'Kattem'})[v]||'other';
}
async function transitJourney(id,fetcher) {
 const response=await fetcher(MCP,{
  method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json',
   'ET-Client-Name':CLIENT},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{
   name:'serviceJourney',arguments:{id,fields:'id line{id} journeyPattern{id directionType}'}
  }}),signal:AbortSignal.timeout(10000)
 });
 if(response.status===429)throw Error('entur-mcp-rate-limited');
 if(!response.ok)throw Error('source-mcp-http-error');
 const data=await response.json();
 if(data.error||data.result?.isError)throw Error('source-mcp-invalid-result');
 const text=data.result?.content?.find(x=>x.type==='text')?.text;
 if(typeof text!=='string'||text.length>50000)throw Error('source-mcp-invalid-result');
 const result=JSON.parse(text);
 return result?.data?.serviceJourney||null;
}
export async function runTonstadStagingProbe({fetcher=fetch,now=Date.now()}={}){
 const result={version:1,mode:'isolated-manual-staging',quayId:TONSTAD_QUAY,
  observedAtUtc:new Date(now).toISOString(),sourceReports:0,
  gpsVehiclesLine1:0,sourceLookups:0,events:[],
  simulatedLedOn:false,provenAtStopOccupants:0,
  status:'NO_GO',physicalStopIndependentlyVerified:false,
  eligibleForProduction:false};
 try {
  // Fetch source snapshots ONCE each. Abort and fail closed if rate-limited.
  const [siri,gps]=await Promise.all([
   fetcher(SIRI,{headers:{'ET-Client-Name':CLIENT,Accept:'application/xml'},
    signal:AbortSignal.timeout(10000)}),
   fetchAtbFleetGps({fetcher,now,clientName:CLIENT})
  ]);
  if(siri.status===429)throw Error('entur-siri-rate-limited');
  if(!siri.ok)throw Error('source-siri-http-error');
  const length=Number(siri.headers?.get?.('content-length'));
  if(Number.isFinite(length)&&length>8000000)throw Error('source-siri-oversize');
  const xml=await siri.text();
  if(xml.length>8000000)throw Error('source-siri-oversize');
  const atStop=parseAtbReportedStops(xml).filter(r=>
   r.lineRef===profile.line.id&&r.quayId===TONSTAD_QUAY);
  result.sourceReports=atStop.length;
  result.gpsVehiclesLine1=gps.vehicles.filter(v=>v.line==='1').length;
  if(atStop.length>MAX_REPORTS){
   result.reason='source-too-many-current-stops';return result;
  }
  const refs=parsePilotSiriJourneyRefs(xml),gpsById=new Map(
   gps.vehicles.filter(v=>v.line==='1').map(v=>[v.id,v]));
  const reports=[],journeys=new Map();
  // No duplicate/report conflict is promoted. Only a unique current event per
  // vehicle can supply the exactly matching service and stop reference.
  const counts=new Map();
  for(const report of atStop)counts.set(report.vehicleRef,
   (counts.get(report.vehicleRef)||0)+1);
  for(let i=0;i<atStop.length;i++){
   const report=atStop[i],gpsRow=gpsById.get(report.vehicleRef);
   const e={eventNumber:i+1,poll:1,quayId:TONSTAD_QUAY,
    siriRecordedAtUtc:report.recordedAt,
    siriTripReference:'missing',gpsVehicleIdMatch:gpsRow?'found':'missing',
    serviceJourneyLookup:'not-queried',sourceDirection:'unknown',
    sourceQuayRole:'unknown',sourceQuayOnTrip:false,
    siriGpsTimeAndIdentity:'not-checked',destination:destination(gpsRow?.destination),
    currentStopGate:'not-checked',reason:'unavailable'};
   const complete=(reason,gate=null)=>{
    e.reason=reason;if(gate)e.currentStopGate=gate;
    result.events.push(publicSharedQuayEvent(e));
   };
   if(counts.get(report.vehicleRef)!==1){
    complete('duplicate-provider-stop-reports');continue;
   }
   const candidates=refs.filter(x=>x.vehicleRef===report.vehicleRef&&
    x.lineRef===report.lineRef&&x.recordedAt===report.recordedAt);
   const ids=[...new Set(candidates.map(x=>x.datedVehicleJourneyRef))];
   if(ids.length!==1||!/^ATB:ServiceJourney:[A-Za-z0-9_.+-]+$/.test(ids[0]||'')){
    e.siriTripReference=ids.length>1?'conflicting':ids.length===1?'unsupported':'missing';
    complete('missing-or-invalid-trip-reference');continue;
   }
   e.siriTripReference='unique';
   if(!gpsRow){complete('gps-vehicle-not-found');continue;}
   if(result.sourceLookups>=MAX_LOOKUPS){
    complete('source-lookup-budget-exhausted');continue;
   }
   result.sourceLookups++;
   const sj=await transitJourney(ids[0],fetcher);
   if(!sj){
    e.serviceJourneyLookup='not-found';
    complete('service-journey-not-found');continue;
   }
   const vehicle={id:gpsRow.id,publicCode:gpsRow.line,
    destination:gpsRow.destination,latitude:gpsRow.latitude,
    longitude:gpsRow.longitude,timestamp:gpsRow.lastUpdated};
   const joined=joinSiriVehicleToServiceJourney({
    siri:candidates[0],vehicle,serviceJourney:sj,now
   });
   if(joined.status!=='route-pattern-supported'){
    e.serviceJourneyLookup='unverified';
    e.siriGpsTimeAndIdentity='unresolved';
    complete(joined.reason);continue;
   }
   e.serviceJourneyLookup='verified';
   e.siriGpsTimeAndIdentity='matched';
   e.sourceDirection=joined.directionType;
   const ix=joined.quays.indexOf(TONSTAD_QUAY);
   e.sourceQuayOnTrip=ix>=0&&joined.quays.lastIndexOf(TONSTAD_QUAY)===ix;
   e.sourceQuayRole=!e.sourceQuayOnTrip?'unknown':ix===0?'origin':
    ix===joined.quays.length-1?'terminus':'intermediate';
   const node=board.nodes.find(n=>n.quayId===TONSTAD_QUAY);
   const accepted=evaluateEnturStopEvidence({
    report,vehicle,profile,node,now,
    sharedQuayJourney:{siri:candidates[0],serviceJourney:sj}
   });
   if(!accepted.accepted){
    complete(accepted.reason,'rejected');continue;
   }
   reports.push(report);journeys.set(report.vehicleRef,{
    siri:candidates[0],serviceJourney:sj
   });
   complete('entur-provider-reported-at-stop','accepted');
  }
  const frame=evaluateTonstadShadowFrame({
   board,profile,now,
   vehicles:gps.vehicles.filter(v=>v.line==='1').map(v=>({
    id:v.id,publicCode:v.line,destination:v.destination,
    latitude:v.latitude,longitude:v.longitude,timestamp:v.lastUpdated
   })),reports,verifiedJourneys:journeys
  });
  result.simulatedLedOn=frame.simulatedLedOn;
  result.provenAtStopOccupants=frame.provenAtStopOccupants;
  result.targetLedId=frame.targetLedId;
  result.reason='one-shot-shadow-complete';
 }catch(error){
  result.reason=safeCause(error);
  // A source failure must never preserve a partial hypothetical LED frame.
  result.simulatedLedOn=false;result.provenAtStopOccupants=0;
  // Discard partial results from failed provider batches.
  result.events=[];
 }
 return result;
}
