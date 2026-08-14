import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const load = path => readFile(new URL(path, import.meta.url), "utf8").then(JSON.parse);
const board = await load("../config/boards/trondheim-bus-board.json");
const routeIds = ["atb-bus-1-live", "atb-bus-3-live"];

for (const routeId of routeIds) {
  const profile = await load(`../config/routes/${routeId}.json`);
  const nodes = board.nodes.filter(node => node.routes.includes(routeId));
  const byStop = new Map();
  nodes.forEach(node => (node.stopIds || []).forEach(id => byStop.set(id, node)));
  const stationIds = new Set();

  for (const stop of profile.stops) {
    const nearest = nodes.reduce((best, node) => {
      const distance = Math.hypot(node.lat - stop.lat, node.lon - stop.lon);
      return !best || distance < best.distance ? { node, distance } : best;
    }, null)?.node;
    const match = byStop.get(stop.id) || nearest;
    if (match) stationIds.add(match.stationId);
  }

  const expected = nodes.filter(node => stationIds.has(node.stationId));
  for (const node of expected) {
    const direction = profile.directions.slice(0, 2).find(item =>
      node.routeDirections?.[routeId]?.directionIds?.includes(item.reverseShape ? "1" : "0")
    );
    assert(direction, `${routeId}: LED ${node.led} at ${node.name} has no visible direction`);
  }

  const extras = nodes.filter(node => !stationIds.has(node.stationId));
  console.log(`${routeId}: ${expected.length} route LEDs covered, ${extras.length} board-only LEDs`);
}

console.log("Linear platform coverage tests OK");
