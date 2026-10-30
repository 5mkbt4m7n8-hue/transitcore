import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {interpretStrictStationGps} from '../core/engines/strict-station-gps.mjs';
import {renderStationFrame} from '../core/frame/frame-renderer.mjs';

const profile=JSON.parse(readFileSync(new URL('../config/routes/atb-bus-11-live.json',import.meta.url)));
const now=Date.parse('2026-10-29T12:00:00Z');
const node={led:0,quayId:'NSR:Quay:75464',stationId:'NSR:StopPlace:43948',
 stopIds:['NSR:Quay:75464'],routes:[profile.id],lat:63.4,lon:10.4,
 routeDirections:{[profile.id]:{directionIds:['0'],destinationMatches:['Stavset']}}};
const board={id:'trondheim-city-lines-catalog',nodes:[node],leds:{count:1},routes:[profile.id],
 layout:'station-network',render:{freshnessSeconds:30,arrivalRadiusMeters:85,approachRadiusMeters:250}};
const v={id:'ATB:Vehicle:example',publicCode:'11',destination:'Stavset',
 latitude:63.4,longitude:10.4,timestamp:new Date(now-2000).toISOString()};
const report={source:'entur-siri-vm',vehicleRef:v.id,lineRef:profile.line.id,
 quayId:node.quayId,vehicleAtStop:true,recordedAt:new Date(now-1000).toISOString()};
const input={board,profiles:[profile],vehicles:[v],now};
const baseline=interpretStrictStationGps(input);
assert([...baseline.strongest.values()].every(x=>x.state==='APPROACHING'&&x.platformConfirmed===false));
const withStop=interpretStrictStationGps({...input,stopReports:[report]});
const accepted=withStop.strongest.get(0);
assert.equal(withStop.strongest.size,1);
assert.equal(accepted.state,'AT_STOP');
assert.equal(accepted.positionType,'entur-siri-provider-stop');
assert.equal(accepted.platformConfirmed,true);
assert.equal(withStop.occupantsByLed.get(0).length,1,'One vehicle cannot light twice');
assert.equal(withStop.observations[0].reason,'entur-provider-reported-at-stop');
const frame=renderStationFrame({board,hardware:{leds:{count:1,brightnessLimit:32}},now,
 signalPolicy:{fullBrightness:32} },withStop);
assert.equal(frame.leds[0].state,'AT_STOP');
assert.equal(frame.leds[0].vehicle.providerReportedAtStop,true);
assert.equal(frame.leds[0].vehicle.platformConfirmed,true);
const nextOnly=interpretStrictStationGps({...input,stopReports:[{...report,vehicleAtStop:false}]});
assert.equal(nextOnly.strongest.get(0).state,'APPROACHING');
const conflicting=interpretStrictStationGps({...input,stopReports:[report,{...report,quayId:'NSR:Quay:75463'}]});
assert.equal(conflicting.strongest.get(0).state,'APPROACHING','Conflicting provider Quays cannot promote');
const wrong=interpretStrictStationGps({...input,vehicles:[{...v,destination:'Blakli'}],stopReports:[report]});
assert.equal(wrong.strongest.size,0,'Provider report cannot override opposite direction');
const stale=interpretStrictStationGps({...input,stopReports:[{...report,recordedAt:new Date(now-40000).toISOString()}]});
assert.equal(stale.strongest.get(0).state,'APPROACHING');
console.log('Opt-in source-confirmed station projection: stronger than GPS, never next-stop, conflict/direction/stale fail-closed PASS');
