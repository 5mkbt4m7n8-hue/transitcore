import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {patternInventory} from '../core/engines/entur-trip-pattern-link.mjs';
import {interpretStrictStationGps} from '../core/engines/strict-station-gps.mjs';
import {evaluateEnturStopEvidence} from '../core/engines/entur-stop-evidence.mjs';
import {renderStationFrame} from '../core/frame/frame-renderer.mjs';

const file=name=>JSON.parse(readFileSync(new URL('../'+name,import.meta.url)));
const profile=file('config/routes/atb-bus-1-live.json');
const fullBoard=file('config/boards/trondheim-city-lines-catalog.json');
const actual=fullBoard.nodes.filter(n=>n.quayId==='NSR:Quay:102733');
assert.equal(actual.length,1,'Tonstadkrysset must be represented by exactly one Quay node');
assert.deepEqual(actual[0].routeDirections[profile.id].directionIds.map(String).sort(),['0','1']);
const node={...structuredClone(actual[0]),led:0};
const board={id:'trondheim-city-lines-catalog',nodes:[node],routes:[profile.id],
 leds:{count:1},layout:'station-network',
 render:{freshnessSeconds:30,arrivalRadiusMeters:85,approachRadiusMeters:250}};
const now=Date.parse('2026-10-30T12:00:00Z');
const timestamp=new Date(now-2000).toISOString(),recordedAt=new Date(now-1000).toISOString();
const patterns=patternInventory().get('1').patterns;
const outbound=patterns.find(p=>p.directionType==='outbound'&&p.quays.length===32);
const inbound=patterns.find(p=>p.directionType==='inbound'&&p.quays.length===32);
const shortOut=patterns.find(p=>p.directionType==='outbound'&&p.quays.length===19);
const shortIn=patterns.find(p=>p.directionType==='inbound'&&p.quays.length===19);
assert(outbound&&inbound&&shortOut&&shortIn);
function fixture(id,headsign,pattern){
 const vehicle={id,publicCode:'1',destination:headsign,
  latitude:node.lat,longitude:node.lon,timestamp};
 const report={source:'entur-siri-vm',vehicleRef:id,lineRef:profile.line.id,
  quayId:node.quayId,recordedAt,vehicleAtStop:true};
 const serviceJourney={id:'ATB:ServiceJourney:'+id.split(':').at(-1),
  line:{id:profile.line.id},journeyPattern:{id:pattern.id,directionType:pattern.directionType}};
 const siri={source:'entur-siri-vm',vehicleRef:id,lineRef:profile.line.id,
  datedVehicleJourneyRef:serviceJourney.id,recordedAt};
 return {vehicle,report,source:{siri,serviceJourney}};
}
const south=fixture('ATB:Vehicle:tonstad-south','Østre Lund',outbound);
const north=fixture('ATB:Vehicle:tonstad-north','Ranheim',inbound);
function check(value,expected){
 const args={report:value.report,vehicle:value.vehicle,profile,node,now,
  sharedQuayJourney:value.source};
 const response=evaluateEnturStopEvidence(args);
 assert.equal(response.accepted,expected,JSON.stringify({reason:response.reason}));
 return response;
}
for(const [value,sourceDirection] of [[south,'outbound'],[north,'inbound']]){
 const result=check(value,true);
 assert.equal(result.sharedQuaySameLed,true);
 assert.equal(result.plannedSourceDirection,sourceDirection);
 assert.equal(result.providerReportedAtStop,true);
 assert.equal(result.physicalStopVerified,false);
}
const shortened=[fixture('ATB:Vehicle:short-south','Tillerterminalen',shortOut),
 fixture('ATB:Vehicle:short-north','Strindheim',shortIn)];
for(const v of shortened)check(v,true);
function reject(value,alter,reason){
 const input=structuredClone(value);
 alter(input);
 const result=evaluateEnturStopEvidence({
  report:input.report,vehicle:input.vehicle,profile,node,
  now,sharedQuayJourney:input.source
 });
 assert.equal(result.accepted,false,'Must fail closed: '+reason);
 assert.equal(result.reason,reason);
}
reject(south,v=>{v.source=null},'shared-quay-source-journey-unverified');
reject(south,v=>{v.source.siri.vehicleRef='different'},'shared-quay-source-journey-unverified');
reject(south,v=>{v.source.siri.recordedAt=new Date(now-3000).toISOString()},'shared-quay-source-journey-unverified');
reject(south,v=>{v.source.siri.datedVehicleJourneyRef='ATB:ServiceJourney:other'},'shared-quay-source-journey-unverified');
reject(south,v=>{v.source.serviceJourney.journeyPattern.id=inbound.id},'shared-quay-source-journey-unverified');
reject(south,v=>{v.source.serviceJourney.line.id='ATB:Line:2_11'},'shared-quay-source-journey-unverified');
reject(south,v=>{v.vehicle.destination='Ranheim'},'shared-quay-headsign-conflict');
reject(north,v=>{v.vehicle.destination='Østre Lund'},'shared-quay-headsign-conflict');
reject(south,v=>{v.report.recordedAt=new Date(now-45000).toISOString()},'shared-quay-source-journey-unverified');
reject(south,v=>{v.vehicle.latitude+=0.004},'gps-report-spatial-conflict');
reject(south,v=>{v.report.vehicleAtStop=false},'not-explicit-stop');
reject(south,v=>{v.report.vehicleRef='ATB:Vehicle:wrong'},'vehicle-id-mismatch');
reject(south,v=>{v.report.lineRef='ATB:Line:2_11'},'source-line-mismatch');
reject(south,v=>{v.report.conflictingQuayIds=['NSR:Quay:999']},'conflicting-provider-quays');
const other=structuredClone(actual[0]);
other.quayId='NSR:Quay:102721';
other.stopIds=[other.quayId];
other.routeDirections[profile.id].directionIds=['0','1'];
const wrongShared=evaluateEnturStopEvidence({report:{...south.report,quayId:other.quayId},
 vehicle:south.vehicle,profile,node:other,now,sharedQuayJourney:south.source});
assert.equal(wrongShared.accepted,false);
assert.equal(wrongShared.reason,'ambiguous-quay-direction',
 'No blanket shared Quay exception for Østre Lund');
const inputs={board,profiles:[profile],vehicles:[south.vehicle,north.vehicle],
 now,stopReports:[south.report,north.report]};
const withoutSource=interpretStrictStationGps(inputs);
assert.equal(withoutSource.strongest.size,0,'Unverified shared reports must not light LEDs');
const withSource=interpretStrictStationGps({...inputs,
 sharedQuayJourneys:new Map([[south.vehicle.id,south.source],[north.vehicle.id,north.source]])});
assert.equal(withSource.strongest.size,1,'Both buses occupy the SAME shared physical LED');
assert.equal(withSource.strongest.get(0).state,'AT_STOP');
const occupants=withSource.occupantsByLed.get(0);
assert.equal(occupants.length,2);
assert.deepEqual(new Set(occupants.map(o=>o.vehicleId)),
 new Set([south.vehicle.id,north.vehicle.id]));
assert(occupants.every(o=>o.sharedQuaySameLed===true));
assert(occupants.every(o=>o.quayId==='NSR:Quay:102733'));
const frame=renderStationFrame({
 board,hardware:{leds:{count:1,brightnessLimit:32}},
 now,signalPolicy:{fullBrightness:32}
},withSource);
assert.equal(frame.leds[0].state,'AT_STOP');
const conflicts=interpretStrictStationGps({...inputs,
 stopReports:[south.report,{...south.report,quayId:'NSR:Quay:102721'}],
 sharedQuayJourneys:new Map([[south.vehicle.id,south.source]])});
assert.equal(conflicts.strongest.size,0,'Conflicting provider Quays must remain rejected');
const duplicateBoard={...board,nodes:[node,{...node,led:1}],leds:{count:2}};
const duplicate=interpretStrictStationGps({...inputs,board:duplicateBoard,
 sharedQuayJourneys:new Map([[south.vehicle.id,south.source],[north.vehicle.id,north.source]])});
assert.equal(duplicate.strongest.size,0,'Duplicate same-Quay LED definitions must fail closed');
console.log('Tonstadkrysset: same Quay/LED for both source-verified directions, short turns, conflicting source and GPS guards, no arbitrary side selection PASS');
