import assert from "node:assert/strict";
import { validatePublishProfiles } from "./led-feed-worker.mjs";

function profiles() {
  const board = {
    schemaVersion: 2,
    id: "test-board",
    name: "Test",
    layout: "station-network",
    positioning: "station-arrival",
    routes: ["route-1"],
    leds: { count: 2 },
    render: { departureAfterglowSeconds: 10 },
    nodes: [
      { id: "a-0", name: "A", lat: 63.4, lon: 10.4, led: 0, stopIds: ["NSR:Quay:1"], routes: ["route-1"], routeDirections: { "route-1": { directionIds: ["0"] } } },
      { id: "a-1", name: "A", lat: 63.4, lon: 10.4, led: 1, stopIds: ["NSR:Quay:2"], routes: ["route-1"], routeDirections: { "route-1": { directionIds: ["1"] } } }
    ]
  };
  const hardware = {
    schemaVersion: 1,
    boardProfile: "test-board",
    leds: { count: 2, brightnessLimit: 32 },
    assignments: [
      { sourceNodeId: "a-0", logicalLed: 0, physicalLed: 0 },
      { sourceNodeId: "a-1", logicalLed: 1, physicalLed: 1 }
    ]
  };
  return { board, hardware };
}

assert.equal(validatePublishProfiles(...Object.values(profiles())), true);
{
  const value = profiles();
  for (const node of value.board.nodes) {
    delete node.lat;
    delete node.lon;
  }
  assert.equal(
    validatePublishProfiles(value.board, value.hardware),
    true,
    "Station-network nodes may inherit coordinates from their route profiles"
  );
}
const rejects = [
  p => { p.board.routes.push("route-1"); },
  p => { p.board.nodes[0].routes = ["unknown"]; },
  p => { p.board.nodes[0].routeDirections["unknown"] = { directionIds: ["0"] }; },
  p => { p.board.nodes[0].stopIds = []; },
  p => { delete p.board.nodes[0].lon; },
  p => { p.board.nodes[0].lat = 91; },
  p => { p.board.render.departureAfterglowSeconds = 11; },
  p => { p.hardware.leds.brightnessLimit = 0; },
  p => { p.hardware.assignments[1].physicalLed = 0; }
];
for (const mutate of rejects) {
  const value = profiles();
  mutate(value);
  assert.throws(() => validatePublishProfiles(value.board, value.hardware));
}
console.log("Worker profile validation tests OK");
