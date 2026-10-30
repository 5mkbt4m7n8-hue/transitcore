import assert from 'node:assert/strict';
import {parsePilotSiriJourneyRefs} from '../core/providers/entur/siri-vm-journey-parser.mjs';
import {joinSiriVehicleToDatedTrip,patternInventory} from '../core/engines/entur-trip-pattern-link.mjs';
const date='2026-10-30',now=Date.parse('2026-10-30T12:00:00Z');
const iso=new Date(now-2000).toISOString();
const ref='ATB:DatedServiceJourney:pilot-test-only';
const vehicleRef='ATB:Vehicle:pilot-test-only';
const xml=(line,datedRef=ref,stop='NSR:Quay:75464')=>`<Siri><ServiceDelivery><VehicleMonitoringDelivery>
 <VehicleActivity><RecordedAtTime>${iso}</RecordedAtTime>
 <MonitoredVehicleJourney><LineRef>${line}</LineRef>
 <FramedVehicleJourneyRef><DatedVehicleJourneyRef>${datedRef}</DatedVehicleJourneyRef></FramedVehicleJourneyRef>
 <VehicleRef>${vehicleRef}</VehicleRef>
 <OnwardCalls><OnwardCall><StopPointRef>${stop}</StopPointRef></OnwardCall></OnwardCalls>
 </MonitoredVehicleJourney></VehicleActivity>
 </VehicleMonitoringDelivery></ServiceDelivery></Siri>`;
const parsed=parsePilotSiriJourneyRefs(xml('ATB:Line:2_11'));
assert.equal(parsed.length,1);
assert.equal(parsed[0].datedVehicleJourneyRef,ref);
assert.equal(parsed[0].lineRef,'ATB:Line:2_11');
assert.equal(parsePilotSiriJourneyRefs(xml('ATB:Line:2_3')).length,0);
assert.equal(parsePilotSiriJourneyRefs(xml('ATB:Line:2_11', 'ATB:DatedServiceJourney:other')).length,1);
assert.equal(parsePilotSiriJourneyRefs(xml('ATB:Line:2_11').replace('<VehicleRef>','<VehicleRef>').replace('</VehicleRef>','</VehicleRef><VehicleRef>second</VehicleRef>')).length,0);
assert.throws(()=>parsePilotSiriJourneyRefs('broken'),/Invalid SIRI/);
const inv=patternInventory().get('11');
const pattern=inv.patterns.find(p=>p.quays.includes('NSR:Quay:75464'));
const datedJourney={id:ref,operatingDay:date,tripAlteration:'planned',
 serviceJourney:{id:'ATB:ServiceJourney:pilot-test-only',line:{id:inv.lineId},journeyPattern:{id:pattern.id}},
 journeyPattern:{id:pattern.id}};
const vehicle={id:vehicleRef,publicCode:'11',timestamp:iso};
const params={siri:parsed[0],vehicle,datedJourney,operatingDay:date,now};
const result=joinSiriVehicleToDatedTrip(params);
assert.equal(result.status,'linked');
assert.equal(result.providerStopConfirmed,false);
assert.deepEqual(result.quays,pattern.quays);
function bad(edit,reason){
 const x=structuredClone(params);edit(x);
 const y=joinSiriVehicleToDatedTrip(x);
 assert.equal(y.status,'unresolved');assert.equal(y.reason,reason);
}
bad(x=>x.vehicle.id='other','vehicle-id-not-exact');
bad(x=>x.vehicle.publicCode='1','vehicle-line-not-exact');
bad(x=>x.siri.recordedAt='2026-10-30T11:58:00Z','unsynchronized-siri-gps');
bad(x=>x.vehicle.timestamp='2026-10-30T11:58:00Z','unsynchronized-siri-gps');
bad(x=>x.operatingDay='2026-10-29','operating-day-mismatch');
bad(x=>x.siri.datedVehicleJourneyRef='ATB:DatedVehicleJourney:pilot-test-only','unverified-siri-trip-id-type');
bad(x=>x.datedJourney.serviceJourney.line.id='ATB:Line:2_1','service-journey-line-unverified');
bad(x=>x.datedJourney.id='ATB:DatedServiceJourney:wrong','dated-id-unverified');
console.log('SIRI VehicleRef -> exact DatedServiceJourney -> verified source Quay sequence, strict identity/timing/schedule fail-closed PASS');
