import assert from "node:assert/strict";
import { SIGNAL_POLICY, applyMotionLifecycle, attachSignalPolicy, buildFrame, buildLinearRouteFrame, buildSignalTestSequence, holdTransientEmptyFrame, matchesDirection, validateConfiguration, vehicleAllowedByBoard } from "../worker/led-feed-worker.mjs";

assert.equal(SIGNAL_POLICY.version, 1);
assert.equal(SIGNAL_POLICY.approachPulseMs, 1800);
assert.equal(SIGNAL_POLICY.parkedAfterSeconds, 300);
assert.equal(SIGNAL_POLICY.atStopConfirmationSeconds, 10);
assert.equal(SIGNAL_POLICY.priorities.PARKED, 4);
assert.deepEqual(attachSignalPolicy({ schemaVersion: 1 }).signalPolicy, SIGNAL_POLICY);

const now = Date.parse("2026-08-11T12:00:00Z");
const board = { id: "trondheim-bus-board", leds: { count: 2 }, routes: ["route-1"], render: { freshnessSeconds: 120, approachRadiusMeters: 250, arrivalRadiusMeters: 85 }, nodes: [
  { led: 10, lat: 63.4305, lon: 10.3951, routes: ["route-1"], routeDirections: { "route-1": { directionIds: ["0"], destinationMatches: ["Kattem"] } } },
  { led: 11, lat: 63.4310, lon: 10.3951, routes: ["route-1"], routeDirections: { "route-1": { directionIds: ["1"], destinationMatches: ["Ranheim"] } } }
] };
const profiles = [{ id: "route-1", line: { publicCode: "1", color: "#00ff50" }, provider: {}, directions: [{ reverseShape: false, color: "#00ff50", destinationMatches: ["Kattem"] }, { reverseShape: true, color: "#0064ff", destinationMatches: ["Ranheim"] }] }];
const hardware = { schemaVersion: 1, boardProfile: "trondheim-bus-board", leds: { count: 2, brightnessLimit: 20 }, assignments: [{ logicalLed: 10, physicalLed: 1 }, { logicalLed: 11, physicalLed: 0 }] };
const vehicles = [{ vehicleId: "bus-1", lastUpdated: new Date(now - 5000).toISOString(), destinationName: "Kattem", line: { publicCode: "1" }, location: { latitude: 63.4305, longitude: 10.3951 } }];

validateConfiguration(board, profiles, hardware);
const frame = buildFrame({ board, profiles, hardware, vehicles, now });
assert.equal(frame.schemaVersion, 1);
assert.equal(frame.boardProfile, "trondheim-bus-board");
assert.equal(frame.ledCount, 2);
assert.equal(frame.ttlSeconds, 30);
assert.equal(frame.motionPolicy.atStopConfirmationSeconds, 0, "Korte busstopp skal ikke vente en ekstra feedperiode på AT_STOP");
assert.deepEqual(frame.leds, [{ id: 1, rgb: [0, 255, 80], brightness: 20, state: "AT_STOP", vehicle: { id: "bus-1", line: "1", destination: "Kattem", ageSeconds: 5, distanceMeters: 0, latitude: 63.4305, longitude: 10.3951 }, occupants: [{ id: "bus-1", line: "1", destination: "Kattem", rgb: [0, 255, 80], state: "AT_STOP", ageSeconds: 5, distanceMeters: 0 }] }]);
assert.equal(applyMotionLifecycle(frame, {}, now).frame.leds[0].state, "AT_STOP", "Første gyldige GPS-treff skal registrere en buss som stoppet med en gang");
const unknownDirectionFrame = buildFrame({
  board, profiles, hardware,
  vehicles: [{ ...vehicles[0], destinationName: "Ukjent endeholdeplass", location: { latitude: 63.4310, longitude: 10.3951 } }],
  now
});
assert.deepEqual(unknownDirectionFrame.leds, [], "Unknown destinations must not activate the opposite track");
assert.throws(() => validateConfiguration(board, profiles, { ...hardware, assignments: [{ logicalLed: 10, physicalLed: 0 }, { logicalLed: 11, physicalLed: 0 }] }), /Invalid physical LED/);
console.log("LED feed worker tests OK");

const reversedCanonicalProfile = { id: "metro-3", directions: [
  { reverseShape: false, destinationMatches: ["Mortensrud"] },
  { reverseShape: true, destinationMatches: ["KolsÃ¥s"] }
] };
const gtfsDirectionOneNode = { routeDirections: { "metro-3": {
  directionIds: ["1"], destinationMatches: ["Mortensrud", "Ryen", "TÃ¸yen"]
} } };
assert.equal(matchesDirection(gtfsDirectionOneNode, reversedCanonicalProfile, "Mortensrud"), true);
assert.equal(matchesDirection(gtfsDirectionOneNode, reversedCanonicalProfile, "Ryen"), true);
assert.equal(matchesDirection(gtfsDirectionOneNode, reversedCanonicalProfile, "KolsÃ¥s"), false);
console.log("GTFS quay direction matching tests OK");
assert.equal(vehicleAllowedByBoard({render:{vehicleDirectionFilters:{"metro-3":{destinationMatches:["KolsÃ¥s"]}}}},reversedCanonicalProfile,"KolsÃ¥s"),true);
assert.equal(vehicleAllowedByBoard({render:{vehicleDirectionFilters:{"metro-3":{destinationMatches:["KolsÃ¥s"]}}}},reversedCanonicalProfile,"Mortensrud"),false);
assert.equal(vehicleAllowedByBoard({render:{}},reversedCanonicalProfile,"Mortensrud"),true);
console.log("Board direction filter tests OK");

const tramProfile = { id: "tram-9", provider: {}, line: { publicCode: "9", color: "#ffffff" }, directions: [
  { reverseShape: true, color: "#00ff50", destinationMatches: ["Lian"] },
  { reverseShape: false, color: "#0064ff", destinationMatches: ["Ila"] }
], stops: [
  { id: "a", lat: 63.40, lon: 10.30, vled: 0, segmentToNext: { vledStart: 1, vledCount: 2 } },
  { id: "b", lat: 63.40, lon: 10.31, vled: 3 }
] };
const tramBoard = { id: "grakallbanen-board", layout: "linear-route-vled", positioning: "vehicle-proximity", routes: ["tram-9"], leds: { count: 4 },
  nodes: [{ led: 0, type: "station", routes: ["tram-9"], stopIds: ["a"] }, { led: 1, type: "segment", routes: ["tram-9"], stopIds: [] }, { led: 2, type: "segment", routes: ["tram-9"], stopIds: [] }, { led: 3, type: "station", routes: ["tram-9"], stopIds: ["b"] }],
  render: { freshnessSeconds: 120, arrivalRadiusMeters: 65, maximumTrackDistanceMeters: 250 } };
const tramHardware = { schemaVersion: 1, boardProfile: "grakallbanen-board", leds: { count: 4, brightnessLimit: 20 }, assignments: [0, 1, 2, 3].map(led => ({ logicalLed: led, physicalLed: led })) };
const tramVehicles = [{ vehicleId: "tram-1", lastUpdated: new Date(now - 5000).toISOString(), destinationName: "Lian", line: { publicCode: "9" }, location: { latitude: 63.40, longitude: 10.3075 } }];
const tramFrame = buildLinearRouteFrame({ board: tramBoard, profiles: [tramProfile], hardware: tramHardware, vehicles: tramVehicles, now });
assert.equal(tramFrame.leds.length, 1);
assert.deepEqual({id:tramFrame.leds[0].id,rgb:tramFrame.leds[0].rgb,brightness:tramFrame.leds[0].brightness,state:tramFrame.leds[0].state}, { id: 2, rgb: [0, 255, 80], brightness: 20, state: "APPROACHING" });
assert.equal(tramFrame.leds[0].vehicle.positionType,"segment");
assert.equal(tramFrame.motionPolicy.stationDepartureRadiusMeters,65);
assert.equal(tramFrame.motionPolicy.atStopConfirmationSeconds,10);
const sharedTramFrame = buildLinearRouteFrame({ board: tramBoard, profiles: [tramProfile], hardware: tramHardware, vehicles: [tramVehicles[0], { ...tramVehicles[0], vehicleId: "tram-2", destinationName: "Ila" }], now });
assert.equal(sharedTramFrame.leds[0].occupants.length, 2, "Begge vogner på samme Gråkallbane-LED må bevares");
assert.deepEqual(sharedTramFrame.leds[0].occupants.map(value => value.rgb), [[0, 255, 80], [0, 100, 255]], "Likt prioriterte vogner må kunne veksle mellom retningsfargene");
const sharedLifecycle = applyMotionLifecycle(sharedTramFrame, {}, now, 10000);
assert.equal(sharedLifecycle.frame.leds[0].occupants.length, 2, "Worker-livssyklusen må ikke fjerne en vogn fra en delt LED");
let movingTram = applyMotionLifecycle(tramFrame, {}, now, 10000);
movingTram = applyMotionLifecycle(tramFrame, movingTram.state, now + 1000, 10000);
assert.equal(movingTram.frame.leds[0].state, "APPROACHING", "A moving tram must keep pulsing until its state actually changes");
assert.equal(movingTram.frame.leds[0].brightness, 20, "A moving tram must not be mistaken for dimmed afterglow");
let emptyGuard = holdTransientEmptyFrame(tramFrame, null, now, 30000);
emptyGuard = holdTransientEmptyFrame({ ...tramFrame, leds: [], sequence: 2 }, emptyGuard.previous, now + 10000, 30000);
assert.equal(emptyGuard.frame.leds.length, 1, "A transient empty source sample must retain the last live frame");
assert.equal(emptyGuard.frame.sequence, 2, "A held frame must still expose the current response sequence");
emptyGuard = holdTransientEmptyFrame({ ...tramFrame, leds: [], sequence: 3 }, emptyGuard.previous, now + 30001, 30000);
assert.deepEqual(emptyGuard.frame.leds, [], "A genuinely empty source must be allowed through after the guard expires");
let stableTram = applyMotionLifecycle(tramFrame, {}, now, 10000);
stableTram = applyMotionLifecycle({ ...tramFrame, leds: [] }, stableTram.state, now + 1000, 10000);
assert.equal(stableTram.frame.leds.length, 0, "Manglende GPS-data skal ikke lage PASSED på en mellom-LED");
const lianOnlyBoard={...tramBoard,render:{...tramBoard.render,vehicleDirectionFilters:{"tram-9":{directionId:"lian",destinationMatches:["Lian"]}}}};
assert.deepEqual(buildLinearRouteFrame({board:lianOnlyBoard,profiles:[tramProfile],hardware:tramHardware,vehicles:[{...tramVehicles[0],destinationName:"Ila"}],now}).leds,[],"opposite Gråkallbanen direction must be excluded");
const shortBoard={...tramBoard,leds:{count:3},nodes:[tramBoard.nodes[0],{...tramBoard.nodes[1]},{...tramBoard.nodes[3],led:2}]};
const shortHardware={...tramHardware,leds:{count:3,brightnessLimit:20},assignments:[0,1,2].map(led=>({logicalLed:led,physicalLed:led}))};
assert.equal(buildLinearRouteFrame({board:shortBoard,profiles:[tramProfile],hardware:shortHardware,vehicles:tramVehicles,now}).leds[0].id,1,"board profile must control the number of intermediate LEDs");
console.log("GrÃƒÂ¥kallbanen linear VLED worker test OK");




const motionBase = { schemaVersion: 1, boardProfile: "trondheim-bus-board", generatedAt: new Date(now).toISOString(), sequence: 1, ttlSeconds: 30, ledCount: 2 };
const approachingLed = { id: 1, rgb: [0, 255, 80], brightness: 20, state: "APPROACHING", vehicle: { id: "bus-motion", line: "1", destination: "Ranheim", ageSeconds: 1, distanceMeters: 120 } };
let motion = applyMotionLifecycle({ ...motionBase, leds: [approachingLed] }, {}, now);
assert.equal(motion.frame.leds[0].state, "APPROACHING");
motion = applyMotionLifecycle({ ...motionBase, leds: [{ ...approachingLed, state: "AT_STOP", vehicle: { ...approachingLed.vehicle, distanceMeters: 25 } }] }, motion.state, now + 10000);
assert.equal(motion.frame.leds[0].state, "AT_STOP");
motion = applyMotionLifecycle({ ...motionBase, leds: [{ ...approachingLed, vehicle: { ...approachingLed.vehicle, distanceMeters: 95 } }] }, motion.state, now + 20000);
assert.equal(motion.frame.leds[0].state, "AT_STOP");
assert.equal(motion.frame.leds[0].lifecycle, "PASSED");
assert.equal(motion.frame.leds[0].state, "AT_STOP", "PASSED beholdes i lifecycle-feltet for eldre ESP-kompatibilitet");
assert.equal(motion.frame.leds[0].brightness, 8);
motion = applyMotionLifecycle({ ...motionBase, leds: [{ ...approachingLed, vehicle: { ...approachingLed.vehicle, id: "following-bus", distanceMeters: 140 } }] }, motion.state, now + 25000);
assert.equal(motion.frame.leds[0].state, "APPROACHING", "A following bus must replace the first bus after it leaves");
let singlePosition = applyMotionLifecycle({ ...motionBase, leds: [{ ...approachingLed, id: 0, vehicle: { ...approachingLed.vehicle, id: "tram-single" } }] }, {}, now);
singlePosition = applyMotionLifecycle({ ...motionBase, leds: [{ ...approachingLed, id: 1, vehicle: { ...approachingLed.vehicle, id: "tram-single" } }] }, singlePosition.state, now + 1000);
assert.deepEqual(singlePosition.frame.leds.map(led => led.id), [1], "One vehicle must never own both its current LED and an old afterglow LED");
const stoppedAtPreviousLed = { ...approachingLed, id: 0, state: "AT_STOP", vehicle: { ...approachingLed.vehicle, id: "tram-passed", distanceMeters: 0 } };
let passedTransition = applyMotionLifecycle({ ...motionBase, leds: [stoppedAtPreviousLed] }, {}, now, 10000);
passedTransition = applyMotionLifecycle({ ...motionBase, leds: [{ ...approachingLed, id: 1, vehicle: { ...approachingLed.vehicle, id: "tram-passed" } }] }, passedTransition.state, now + 1000, 10000);
assert.deepEqual(passedTransition.frame.leds.map(led => led.id), [1], "APPROACHING skal erstatte PASSED og vognen skal bare vises én gang");
assert.equal(passedTransition.frame.leds[0].state, "APPROACHING");
const grakallMotionBase = { ...motionBase, boardProfile: "grakallbanen-board", ledCount: 47 };
let interpolated = applyMotionLifecycle({ ...grakallMotionBase, leds: [{ ...stoppedAtPreviousLed, id: 26, vehicle: { ...stoppedAtPreviousLed.vehicle, id: "tram-interpolate" } }] }, {}, now, 10000);
interpolated = applyMotionLifecycle({ ...grakallMotionBase, leds: [{ ...approachingLed, id: 24, vehicle: { ...approachingLed.vehicle, id: "tram-interpolate" } }] }, interpolated.state, now + 10000, 10000);
assert.deepEqual(interpolated.frame.leds.map(led => led.id), [25], "Et kort GPS-hopp 26 til 24 skal gå via LED 25");
assert.equal(interpolated.frame.leds[0].state, "APPROACHING", "Mellomposisjonen skal ha høyere prioritet enn gammelt PASSED");
const collisionAtCurrentLed = {
  ...approachingLed,
  id: 24,
  occupants: [
    { id: "tram-interpolate", rgb: [0, 80, 255], state: "APPROACHING" },
    { id: "tram-other", rgb: [0, 255, 72], state: "APPROACHING" }
  ],
  vehicle: { ...approachingLed.vehicle, id: "tram-interpolate" }
};
const collisionPosition = applyMotionLifecycle({ ...grakallMotionBase, leds: [collisionAtCurrentLed] }, interpolated.state, now + 20000, 10000);
assert.deepEqual(collisionPosition.frame.leds.map(led => led.id), [24], "En delt live-LED må ikke flyttes av interpolering for bare én vogn");
assert.equal(collisionPosition.frame.leds[0].occupants.length, 2);
const gpsMotionBase = { ...grakallMotionBase, motionPolicy: { stationDepartureRadiusMeters: 110 } };
const gpsStop = { ...stoppedAtPreviousLed, id: 26, vehicle: { ...stoppedAtPreviousLed.vehicle, id: "tram-gps-passed", positionType: "station", stationDistanceMeters: 20 } };
const gpsSegment = distance => ({ ...approachingLed, id: 25, vehicle: { ...approachingLed.vehicle, id: "tram-gps-passed", positionType: "segment", stationDistanceMeters: distance, nearestStationLed: 26 } });
let gpsPassed = applyMotionLifecycle({ ...gpsMotionBase, leds: [gpsStop] }, {}, now, 10000);
gpsPassed = applyMotionLifecycle({ ...gpsMotionBase, leds: [gpsSegment(85)] }, gpsPassed.state, now + 10000, 10000);
assert.deepEqual(gpsPassed.frame.leds.map(led => led.id), [26], "Innenfor GPS-avgangssonen skal bare stasjonen vise PASSED");
assert.equal(gpsPassed.frame.leds[0].lifecycle, "PASSED");
gpsPassed = applyMotionLifecycle({ ...gpsMotionBase, leds: [gpsStop] }, gpsPassed.state, now + 15000, 10000);
assert.equal(gpsPassed.frame.leds[0].lifecycle, "PASSED", "GPS-regresjon må ikke endre samme stasjon fra PASSED tilbake til AT_STOP");
gpsPassed = applyMotionLifecycle({ ...gpsMotionBase, leds: [gpsSegment(125)] }, gpsPassed.state, now + 20000, 10000);
assert.deepEqual(gpsPassed.frame.leds.map(led => led.id), [25], "Utenfor GPS-avgangssonen skal bare mellom-LED vise APPROACHING");
assert.equal(gpsPassed.frame.leds[0].state, "APPROACHING");
console.log("Server motion lifecycle tests OK");

const arrivingStationLed = {
  ...approachingLed,
  id: 1,
  state: "AT_STOP",
  vehicle: { ...approachingLed.vehicle, id: "arrival-confirmation", latitude: 63.4305, longitude: 10.3951 },
  occupants: [{ id: "arrival-confirmation", rgb: [0, 255, 80], state: "AT_STOP" }]
};
const confirmationMotionBase = { ...motionBase, motionPolicy: { atStopConfirmationSeconds: 10 } };
let confirmedStop = applyMotionLifecycle({ ...confirmationMotionBase, leds: [arrivingStationLed] }, {}, now);
assert.equal(confirmedStop.frame.leds[0].state, "APPROACHING", "Første GPS-treff ved stasjonen må fortsette å pulsere");
assert.equal(confirmedStop.frame.leds[0].occupants[0].state, "APPROACHING");
confirmedStop = applyMotionLifecycle({ ...confirmationMotionBase, leds: [arrivingStationLed] }, confirmedStop.state, now + 10000);
assert.equal(confirmedStop.frame.leds[0].state, "AT_STOP", "Fast lys krever bekreftet stans gjennom en hel feedperiode");

const stationaryLed = {
  ...approachingLed,
  state: "AT_STOP",
  vehicle: { ...approachingLed.vehicle, id: "parked-bus", latitude: 63.4305, longitude: 10.3951 }
};
let parking = applyMotionLifecycle({ ...motionBase, leds: [stationaryLed] }, {}, now);
parking = applyMotionLifecycle({ ...motionBase, leds: [{ ...stationaryLed, vehicle: { ...stationaryLed.vehicle, latitude: 63.43055 } }] }, parking.state, now + 299999);
assert.equal(parking.frame.leds[0].lifecycle, undefined, "GPS-jitter innenfor 15 meter må ikke nullstille parkeringstiden");
parking = applyMotionLifecycle({ ...motionBase, leds: [stationaryLed] }, parking.state, now + 300000);
assert.equal(parking.frame.leds[0].lifecycle, "PARKED");
assert.deepEqual(parking.frame.leds[0].rgb, [255, 0, 0]);
assert.equal(parking.frame.leds[0].state, "AT_STOP", "Eldre ESP-er skal vise PARKED som fast rødt AT_STOP");
parking = applyMotionLifecycle({ ...motionBase, leds: [{ ...stationaryLed, vehicle: { ...stationaryLed.vehicle, latitude: 63.4307 } }] }, parking.state, now + 301000);
assert.equal(parking.frame.leds[0].lifecycle, undefined, "Mer enn 15 meter reell bevegelse skal oppheve PARKED straks");
console.log("PARKED GPS lifecycle tests OK");

const oppositeDirectionColorFrame = buildFrame({
  board, profiles, hardware,
  vehicles: [{ ...vehicles[0], vehicleId: "bus-line-color", destinationName: "Ranheim", location: { latitude: 63.4310, longitude: 10.3951 } }],
  now
});
assert.deepEqual(oppositeDirectionColorFrame.leds[0].rgb, [0, 255, 80], "Bus line colour must not change with direction or state");
assert.deepEqual(oppositeDirectionColorFrame.leds[0].occupants[0].rgb, [0, 255, 80], "Occupant and LED must use the same line colour");

const firstAtStop = {
  ...approachingLed,
  state: "AT_STOP",
  rgb: [0, 255, 80],
  vehicle: { ...approachingLed.vehicle, id: "first-bus", distanceMeters: 10 },
  occupants: [
    { id: "first-bus", line: "1", destination: "Ranheim", rgb: [0, 255, 80], state: "AT_STOP" },
    { id: "old-bus", line: "2", destination: "Strindheim", rgb: [239, 83, 80], state: "PASSED" }
  ]
};
let latestDeparture = applyMotionLifecycle({ ...motionBase, leds: [firstAtStop] }, {}, now);
latestDeparture = applyMotionLifecycle({ ...motionBase, leds: [] }, latestDeparture.state, now + 1000);
assert.equal(latestDeparture.frame.leds[0].lifecycle, "PASSED");
assert.equal(latestDeparture.frame.leds[0].occupants.length, 1, "Afterglow must not alternate between old occupants");
assert.deepEqual(latestDeparture.frame.leds[0].occupants[0].rgb, [0, 255, 80]);

const secondAtStop = {
  ...firstAtStop,
  rgb: [239, 83, 80],
  vehicle: { ...firstAtStop.vehicle, id: "second-bus", line: "2" },
  occupants: [{ id: "second-bus", line: "2", destination: "Strindheim", rgb: [239, 83, 80], state: "AT_STOP" }]
};
latestDeparture = applyMotionLifecycle({ ...motionBase, leds: [secondAtStop] }, latestDeparture.state, now + 2000);
assert.equal(latestDeparture.frame.leds[0].state, "AT_STOP", "AT_STOP must replace afterglow");
latestDeparture = applyMotionLifecycle({ ...motionBase, leds: [] }, latestDeparture.state, now + 3000);
assert.deepEqual(latestDeparture.frame.leds[0].rgb, [239, 83, 80], "The latest departed bus owns the afterglow colour");
assert.equal(latestDeparture.frame.leds[0].occupants.length, 1);
console.log("LED priority, line colour and latest-departure tests OK");

const signalFrames = buildSignalTestSequence({
  boardProfile: "trondheim-bus-board",
  ledCount: 147,
  ledId: 76,
  firstLine: { code: "1", rgb: [239, 83, 80] },
  secondLine: { code: "2", rgb: [66, 165, 245] },
  brightness: 32,
  now,
  afterglowMs: 10000
});
assert.equal(signalFrames.length, 8);
assert.deepEqual(signalFrames.map(frame => frame.leds[0]?.lifecycle || frame.leds[0]?.state || "OFF"), [
  "APPROACHING", "AT_STOP", "PASSED", "APPROACHING", "AT_STOP", "AT_STOP", "PASSED", "OFF"
]);
assert.deepEqual(signalFrames[2].leds[0].rgb, [239, 83, 80], "First departure keeps line 1 colour");
assert.deepEqual(signalFrames[6].leds[0].rgb, [66, 165, 245], "Latest departure keeps line 2 colour");
assert.equal(signalFrames[6].leds[0].brightness, 8);
assert.deepEqual(signalFrames[7].leds, [], "Afterglow expires to OFF after ten seconds");
console.log("Isolated Worker signal sequence tests OK");
