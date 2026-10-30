import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluateEnturStopEvidence} from '../core/engines/entur-stop-evidence.mjs';
const profile=JSON.parse(readFileSync(new URL('../config/routes/atb-bus-11-live.json',import.meta.url)));
const now=Date.parse('2026-10-29T12:00:00Z');
const vehicle={id:'ATB:Vehicle:test-1',publicCode:'11',destination:'Stavset',
 latitude:63.4,longitude:10.4,timestamp:new Date(now-5000).toISOString()};
const node={quayId:'NSR:Quay:75464',stationId:'NSR:StopPlace:43948',stopIds:['NSR:Quay:75464'],
 lat:63.4,lon:10.4,routes:[profile.id],routeDirections:{
 [profile.id]:{directionIds:['0'],destinationMatches:['Stavset'],headsigns:['Stavset']}
}};
const report={source:'entur-siri-vm',vehicleRef:vehicle.id,lineRef:profile.line.id,
 quayId:node.quayId,vehicleAtStop:true,recordedAt:new Date(now-7000).toISOString()};
const input={report,vehicle,profile,node,now};
const good=evaluateEnturStopEvidence(input);
assert.equal(good.accepted,true);assert.equal(good.providerReportedAtStop,true);
assert.equal(good.physicalStopVerified,false);
function reject(change,expected){
 const x=change(structuredClone(input));
 const result=evaluateEnturStopEvidence(x);
 assert.equal(result.accepted,false,expected);
 assert.equal(result.reason,expected);
}
reject(x=>{x.report.vehicleAtStop=false;return x;},'not-explicit-stop');
reject(x=>{delete x.report.vehicleAtStop;return x;},'not-explicit-stop');
reject(x=>{x.report.source='entur-eta';return x;},'not-explicit-stop');
reject(x=>{x.report.quayId='NSR:StopPlace:43948';return x;},'not-explicit-stop');
reject(x=>{x.report.vehicleRef='other';return x;},'vehicle-id-mismatch');
reject(x=>{x.report.lineRef='ATB:Line:other';return x;},'source-line-mismatch');
reject(x=>{x.node.quayId='NSR:Quay:75463';return x;},'quay-not-on-route');
reject(x=>{x.node.routeDirections[profile.id].directionIds=['0','1'];return x;},'ambiguous-quay-direction');
reject(x=>{x.vehicle.destination='Blakli';return x;},'destination-direction-mismatch');
reject(x=>{x.report.recordedAt=new Date(now-40000).toISOString();return x;},'stale-or-unsynchronized-report');
reject(x=>{x.vehicle.latitude=63.405;return x;},'gps-report-spatial-conflict');
reject(x=>{x.report.conflictingQuayIds=['NSR:Quay:75463'];return x;},'conflicting-provider-quays');
console.log('SIRI VM provider stop evidence: explicit/quay/identity/line/direction/time/GPS/conflict fail-closed PASS');


// Verified source line 1 Østre Lund: public live SIRI recorded source Quays
// Buran + Solsiden outbound, while GTFS catalogue lacked this exact headsign.
// Route-local exact alias is allowed only when the catalog has ONE direction.
const line1=JSON.parse(readFileSync(new URL('../config/routes/atb-bus-1-live.json',import.meta.url)));
const board=JSON.parse(readFileSync(new URL('../config/boards/trondheim-city-lines-catalog.json',import.meta.url)));
const sourcePatterns=JSON.parse(readFileSync(new URL('../config/gps/atb-journey-patterns-1-11.json',import.meta.url)));
assert.equal(line1.destinationDirectionAliases['Østre Lund'],'0');
assert(line1.directions.some(d=>d.destinationMatches.includes('Østre Lund')));
const outboundSource=sourcePatterns.lines['1'].patterns.filter(p=>p.directionType==='outbound');
const inboundSource=sourcePatterns.lines['1'].patterns.filter(p=>p.directionType==='inbound');
function line1StopEvidence(quayId,headsign='Østre Lund'){
 const n=board.nodes.find(item=>item.quayId===quayId);
 assert(n,'Quay must exist in authoritative board catalogue: '+quayId);
 return evaluateEnturStopEvidence({
  report:{source:'entur-siri-vm',vehicleRef:'ATB:Vehicle:pilot',lineRef:line1.line.id,
   quayId,recordedAt:new Date(now-7000).toISOString(),vehicleAtStop:true},
  vehicle:{id:'ATB:Vehicle:pilot',publicCode:'1',destination:headsign,
   latitude:n.lat,longitude:n.lon,timestamp:new Date(now-5000).toISOString()},
  profile:line1,node:n,now
 });
}
for(const quayId of ['NSR:Quay:103009','NSR:Quay:73975']){
 assert(outboundSource.some(p=>p.quays.includes(quayId)),'Source outbound proves Quay '+quayId);
 const real=board.nodes.find(item=>item.quayId===quayId);
 assert.deepEqual(real.routeDirections[line1.id].directionIds,['0']);
 assert.equal(line1StopEvidence(quayId).accepted,true,'Exact Østre Lund alias on source-backed Quay');
 assert.equal(line1StopEvidence(quayId,'Ranheim').reason,'destination-direction-mismatch');
}
const reverse=inboundSource.flatMap(p=>p.quays)
 .map(id=>board.nodes.find(n=>n.quayId===id))
 .find(n=>n?.routes?.includes(line1.id)&&
  n?.routeDirections?.[line1.id]?.directionIds?.length===1&&
  n.routeDirections[line1.id].directionIds[0]==='1');
assert(reverse,'Must find an exclusive opposite-direction Quay');
assert.equal(line1StopEvidence(reverse.quayId).reason,'destination-direction-mismatch',
 'The alias must never allow a bus on the opposite Quay');
for(const quayId of ['NSR:Quay:102733','NSR:Quay:102721']){
 const ambiguous=board.nodes.find(n=>n.quayId===quayId);
 assert(ambiguous?.routeDirections?.[line1.id]?.directionIds?.length!==1);
 assert.equal(line1StopEvidence(quayId).reason,'ambiguous-quay-direction',
  'Known shared/ambiguous Quay still fails closed');
}
console.log('Verified source line 1 Østre Lund alias accepts only exact outbound Quays; inbound and ambiguous Quays remain rejected PASS');
