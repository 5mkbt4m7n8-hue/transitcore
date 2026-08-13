import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = name => JSON.parse(fs.readFileSync(path.join(root, "config", "boards", name), "utf8"));
const a = read("oslo-metro-board-direction-a.json");
const b = read("oslo-metro-board-direction-b.json");
const union = (left = [], right = []) => [...new Set([...left, ...right])].sort();
function merge(routes) {
  const merged = new Map();
  for (const node of [...a.nodes, ...b.nodes]) {
    if (!node.routes.some(route => routes.has(route))) continue;
    const target = merged.get(node.id) || { id: node.id, stopIds: [], routes: [], routeDirections: {} };
    target.stopIds = union(target.stopIds, node.stopIds);
    target.routes = union(target.routes, node.routes.filter(route => routes.has(route)));
    for (const [route, details] of Object.entries(node.routeDirections || {})) {
      if (!routes.has(route)) continue;
      const previous = target.routeDirections[route] || {};
      target.routeDirections[route] = {
        directionIds: union(previous.directionIds, details.directionIds),
        headsigns: union(previous.headsigns, details.headsigns),
        destinationMatches: union(previous.destinationMatches, details.destinationMatches),
      };
    }
    merged.set(node.id, target);
  }
  return merged;
}

const allRoutes = a.routes;
for (let mask = 1; mask < 1 << allRoutes.length; mask++) {
  const routes = new Set(allRoutes.filter((_, index) => mask & (1 << index)));
  const merged = merge(routes);
  const aIds = new Set(a.nodes.filter(node => node.routes.some(route => routes.has(route))).map(node => node.id));
  const bIds = new Set(b.nodes.filter(node => node.routes.some(route => routes.has(route))).map(node => node.id));
  assert.equal(merged.size, new Set([...aIds, ...bIds]).size);
  assert.equal([...merged.keys()].length, new Set(merged.keys()).size);
}

const routes = new Set(allRoutes), merged = merge(routes);
const aIds = new Set(a.nodes.filter(node => node.routes.some(route => routes.has(route))).map(node => node.id));
const bIds = new Set(b.nodes.filter(node => node.routes.some(route => routes.has(route))).map(node => node.id));
const common = [...aIds].filter(id => bIds.has(id));
assert.equal(merged.size, new Set([...aIds, ...bIds]).size);
assert.equal([...merged.keys()].length, new Set(merged.keys()).size);
for (const id of common) {
  assert(merged.has(id), `Common station ${id} is missing`);
  const sourceDirections = union(
    Object.values(a.nodes.find(node => node.id === id).routeDirections).flatMap(value => value.directionIds),
    Object.values(b.nodes.find(node => node.id === id).routeDirections).flatMap(value => value.directionIds),
  );
  const mergedDirections = union([], Object.values(merged.get(id).routeDirections).flatMap(value => value.directionIds));
  for (const direction of sourceDirections) assert(mergedDirections.includes(direction), `${id} lost direction ${direction}`);
}

console.log(`Project wizard merge OK: ${common.length} common stations share one LED point; ${merged.size} unique stations total.`);
