import assert from "node:assert/strict";
import { buildFrame } from "../worker/led-feed-worker.mjs";

const profile = (id, code, lineColor, directionColor, destination) => ({
  id,
  line: { publicCode: code, color: lineColor },
  directions: [{ reverseShape: false, color: directionColor, destinationMatches: [destination] }]
});
const profiles = [
  profile("line-a", "A", "#ff0000", "#00ff00", "Alpha"),
  profile("line-b", "B", "#0000ff", "#ffff00", "Beta")
];
const board = {
  id: "trondheim-bus-board",
  routes: profiles.map(value => value.id),
  leds: { count: 1 },
  nodes: [{
    id: "shared-stop", stationId: "shared-stop", name: "Shared",
    led: 0, lat: 63, lon: 10, routes: profiles.map(value => value.id),
    routeDirections: {
      "line-a": { directionIds: ["0"], destinationMatches: ["Alpha"] },
      "line-b": { directionIds: ["0"], destinationMatches: ["Beta"] }
    }
  }],
  render: { freshnessSeconds: 120, arrivalRadiusMeters: 85, approachRadiusMeters: 250 }
};
const hardware = {
  schemaVersion: 1, boardProfile: board.id,
  leds: { count: 1, brightnessLimit: 32 },
  assignments: [{ logicalLed: 0, physicalLed: 0 }]
};
const now = Date.parse("2026-08-14T10:00:00Z");
const vehicle = (id, line, destination, latitude) => ({
  vehicleId: id, lastUpdated: new Date(now).toISOString(), destinationName: destination,
  line: { publicCode: line }, location: { latitude, longitude: 10 }
});

const priorityFrame = buildFrame({
  board, profiles, hardware, now,
  vehicles: [vehicle("a1", "A", "Alpha", 63), vehicle("b1", "B", "Beta", 63.0015)]
});
assert.equal(priorityFrame.leds.length, 1);
assert.equal(priorityFrame.leds[0].vehicle.id, "a1", "AT_STOP must remain the legacy winner");
assert.equal(priorityFrame.leds[0].occupants.length, 2, "Both lines must be preserved");
assert.deepEqual(priorityFrame.leds[0].occupants.map(value => value.line), ["A", "B"]);
assert.deepEqual(priorityFrame.leds[0].occupants[0].rgb, [255, 0, 0]);
assert.deepEqual(priorityFrame.leds[0].occupants[1].rgb, [0, 0, 255]);

const equalFrame = buildFrame({
  board, profiles, hardware, now,
  vehicles: [vehicle("a2", "A", "Alpha", 63.0001), vehicle("b2", "B", "Beta", 63.0002)]
});
assert.equal(equalFrame.leds[0].occupants.filter(value => value.state === "AT_STOP").length, 2);
assert.equal(equalFrame.leds[0].occupants.length, 2);

console.log("Multiline occupant tests OK");
