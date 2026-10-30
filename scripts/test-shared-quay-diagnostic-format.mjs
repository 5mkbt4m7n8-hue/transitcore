import assert from 'node:assert/strict';
import {publicSharedQuayEvent,publicNearbyGpsCounts} from './shared-quay-diagnostic-format.mjs';
const raw={
 eventNumber:1,poll:4,quayId:'NSR:Quay:102733',
 siriRecordedAtUtc:'2026-10-30T13:11:02Z',
 siriTripReference:'unique',gpsVehicleIdMatch:'found',
 serviceJourneyLookup:'verified',sourceDirection:'inbound',
 sourceQuayRole:'intermediate',sourceQuayOnTrip:true,
 siriGpsTimeAndIdentity:'matched',destination:'Ranheim',
 currentStopGate:'accepted',reason:'entur-provider-reported-at-stop',
 vehicleRef:'ATB:Vehicle:PRIVATE-123',serviceJourneyId:'ATB:ServiceJourney:PRIVATE',
 latitude:63.4,longitude:10.4,deviceId:'NOT-FOR-LOGGING'
};
const result=publicSharedQuayEvent(raw);
assert.equal(result.quayId,'NSR:Quay:102733');
assert.equal(result.quayName,'Tonstadkrysset');
assert.equal(result.sourceDirection,'inbound');
assert.equal(result.currentStopGate,'accepted');
assert.equal(result.destination,'Ranheim');
assert.equal(result.siriRecordedAtUtc,'2026-10-30T13:11:02.000Z');
const log=JSON.stringify(result);
for(const secret of ['PRIVATE-123','PRIVATE','63.4','10.4','NOT-FOR-LOGGING'])
 assert(!log.includes(secret),'No raw sensitive context is serialized');
assert.deepEqual(Object.keys(result),[
 'eventNumber','poll','quayId','quayName','siriRecordedAtUtc',
 'siriTripReference','gpsVehicleIdMatch','serviceJourneyLookup',
 'sourceDirection','sourceQuayRole','sourceQuayOnTrip','siriGpsTimeAndIdentity',
 'destination','currentStopGate','reason'
]);
const invalid=publicSharedQuayEvent({
 ...raw,eventNumber:'bad',poll:-1,sourceDirection:'ATB:Vehicle:PRIVATE',
 sourceQuayRole:'private',siriGpsTimeAndIdentity:'sensitive',destination:'Some rider',
 currentStopGate:'maybe',reason:'ATB:Vehicle:PRIVATE',
 siriRecordedAtUtc:'bad',siriTripReference:'ATB:ServiceJourney:PRIVATE'
});
assert.equal(invalid.sourceDirection,'unknown');
assert.equal(invalid.sourceQuayRole,'unknown');
assert.equal(invalid.siriTripReference,'missing');
assert.equal(invalid.siriGpsTimeAndIdentity,'not-checked');
assert.equal(invalid.destination,'unknown');
assert.equal(invalid.currentStopGate,'not-checked');
assert.equal(invalid.reason,'unavailable');
assert.equal(invalid.siriRecordedAtUtc,null);
assert.equal(invalid.poll,null);
assert.throws(()=>publicSharedQuayEvent({...raw,quayId:'NSR:Quay:999999'}));
assert.deepEqual(publicNearbyGpsCounts({
 quayId:'NSR:Quay:102733',nearby:1,ranheimBound:1
}),{
 quayId:'NSR:Quay:102733',nearby:1,ranheimBound:1,
 warning:'GPS proximity alone does not confirm physical stop occupancy'
});
assert(!JSON.stringify(publicNearbyGpsCounts({quayId:'NSR:Quay:102721',
 nearby:1,ranheimBound:0,vehicleRef:'PRIVATE-123',latitude:63.4})).includes('PRIVATE'));
console.log('Per-event diagnostic allowlist: Quay, source direction, gate result, no IDs/coordinates PASS');
