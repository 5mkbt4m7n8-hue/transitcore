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
