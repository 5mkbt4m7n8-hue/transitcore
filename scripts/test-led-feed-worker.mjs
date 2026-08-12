import assert from "node:assert/strict";
import { buildFrame, buildLinearRouteFrame, matchesDirection, validateConfiguration } from "../worker/led-feed-worker.mjs";

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
assert.deepEqual(frame.leds, [{ id: 1, rgb: [0, 255, 80], brightness: 20, state: "AT_STOP" }]);
assert.throws(() => validateConfiguration(board, profiles, { ...hardware, assignments: [{ logicalLed: 10, physicalLed: 0 }, { logicalLed: 11, physicalLed: 0 }] }), /Invalid physical LED/);
console.log("LED feed worker tests OK");

const reversedCanonicalProfile = { id: "metro-3", directions: [
  { reverseShape: false, destinationMatches: ["Mortensrud"] },
  { reverseShape: true, destinationMatches: ["Kolsås"] }
] };
const gtfsDirectionOneNode = { routeDirections: { "metro-3": {
  directionIds: ["1"], destinationMatches: ["Mortensrud", "Ryen", "Tøyen"]
} } };
assert.equal(matchesDirection(gtfsDirectionOneNode, reversedCanonicalProfile, "Mortensrud"), true);
assert.equal(matchesDirection(gtfsDirectionOneNode, reversedCanonicalProfile, "Ryen"), true);
assert.equal(matchesDirection(gtfsDirectionOneNode, reversedCanonicalProfile, "Kolsås"), false);
console.log("GTFS quay direction matching tests OK");

const tramProfile = { id: "tram-9", provider: {}, line: { publicCode: "9", color: "#ffffff" }, directions: [
  { reverseShape: true, color: "#00ff50", destinationMatches: ["Lian"] },
  { reverseShape: false, color: "#0064ff", destinationMatches: ["Ila"] }
], stops: [
  { id: "a", lat: 63.40, lon: 10.30, vled: 0, segmentToNext: { vledStart: 1, vledCount: 2 } },
  { id: "b", lat: 63.40, lon: 10.31, vled: 3 }
] };
const tramBoard = { id: "grakallbanen-board", layout: "linear-route-vled", positioning: "vehicle-proximity", routes: ["tram-9"], leds: { count: 4 },
  nodes: [0, 1, 2, 3].map(led => ({ led, routes: ["tram-9"], stopIds: [] })),
  render: { freshnessSeconds: 120, arrivalRadiusMeters: 65, maximumTrackDistanceMeters: 250 } };
const tramHardware = { schemaVersion: 1, boardProfile: "grakallbanen-board", leds: { count: 4, brightnessLimit: 20 }, assignments: [0, 1, 2, 3].map(led => ({ logicalLed: led, physicalLed: led })) };
const tramVehicles = [{ vehicleId: "tram-1", lastUpdated: new Date(now - 5000).toISOString(), destinationName: "Lian", line: { publicCode: "9" }, location: { latitude: 63.40, longitude: 10.3075 } }];
const tramFrame = buildLinearRouteFrame({ board: tramBoard, profiles: [tramProfile], hardware: tramHardware, vehicles: tramVehicles, now });
assert.deepEqual(tramFrame.leds, [{ id: 2, rgb: [0, 255, 80], brightness: 20, state: "APPROACHING" }]);
console.log("GrÃ¥kallbanen linear VLED worker test OK");


