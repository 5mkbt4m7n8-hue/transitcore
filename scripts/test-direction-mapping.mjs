import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { matchesDirection } from "../worker/led-feed-worker.mjs";

const load = path => readFile(new URL(path, import.meta.url), "utf8").then(JSON.parse);
const board = await load("../config/boards/trondheim-bus-board.json");
const routeIds = ["atb-bus-1-live", "atb-bus-3-live"];

for (const routeId of routeIds) {
  const profile = await load(`../config/routes/${routeId}.json`);
  const routeNodes = board.nodes.filter(node => node.routes.includes(routeId));
  assert(routeNodes.length > 0, `${routeId}: no board nodes`);

  for (const direction of profile.directions.slice(0, 2)) {
    const directionId = direction.reverseShape ? "1" : "0";
    const directionNodes = routeNodes.filter(node =>
      node.routeDirections?.[routeId]?.directionIds?.includes(directionId)
    );
    assert(directionNodes.length > 0, `${routeId}: no nodes for direction ${directionId}`);

    for (const destination of direction.destinationMatches || []) {
      const matches = routeNodes.filter(node => matchesDirection(node, profile, destination));
      assert(matches.length > 0, `${routeId}: destination ${destination} matches no nodes`);
      const wrong = matches.filter(node => {
        const ids = node.routeDirections?.[routeId]?.directionIds || [];
        return !ids.includes(directionId) && ids.length < 2;
      });
      assert.equal(wrong.length, 0,
        `${routeId}: destination ${destination} can activate wrong direction: ${wrong.map(node => node.id).join(", ")}`);
    }
  }
}

console.log("Direction mapping tests OK: lines 1 and 3");
