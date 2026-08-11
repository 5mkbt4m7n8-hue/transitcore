import assert from "node:assert/strict";
import { buildFrame, validateConfiguration } from "../worker/led-feed-worker.mjs";

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

