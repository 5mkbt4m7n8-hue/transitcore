import assert from "node:assert/strict";
import {
  createProject,
  parseProject,
  serialize,
  History,
  svg,
} from "../web/board-studio/model.mjs";
import {
  editMount,
  removeMount,
  cornerPattern,
  addCorners,
  mountChanges,
  mountingIssues,
  edgeDistance,
  mechanicalSettings,
} from "../web/board-studio/mounting.mjs";
import {
  mechanicalCheck,
  physicalChanges,
} from "../web/board-studio/bindings.mjs";
import {
  productionReport,
  productionHoles,
  drillCsv,
  machiningSvg,
} from "../web/board-studio/production.mjs";
import { trondheimPrototype } from "../web/board-studio/prototype.mjs";
import { snapPoint } from "../web/board-studio/editing.mjs";
const p = createProject(),
  before = serialize(p),
  q = addCorners(p, { inset: 15, diameter: 3.2 });
assert.equal(serialize(p), before);
assert.deepEqual(
  q.production.mountingHoles.map((h) => [h.x, h.y]),
  [
    [15, 15],
    [285, 15],
    [15, 385],
    [285, 385],
  ],
);
assert.equal(new Set(q.production.mountingHoles.map((h) => h.id)).size, 4);
assert.deepEqual(q.layout, p.layout);
assert.deepEqual(q.ledLayout, p.ledLayout);
const h = q.production.mountingHoles[0];
assert.equal(edgeDistance(q, h), 13.4);
let moved = editMount(q, h.id, { x: 20, diameter: 4 }).project;
assert.equal(moved.production.mountingHoles[0].id, h.id);
assert.equal(h.x, 15);
assert.equal(physicalChanges(q, moved).length, 1);
assert.equal(mountChanges(q, moved)[0].diameterAfter, 4);
assert.equal(
  mountChanges(moved, removeMount(moved, h.id))[0].holeAfter,
  undefined,
);
const history = new History(q);
history.commit(moved);
history.undo();
assert.deepEqual(
  history.value.production.mountingHoles,
  q.production.mountingHoles,
);
history.redo();
assert.deepEqual(
  history.value.production.mountingHoles,
  moved.production.mountingHoles,
);
assert.deepEqual(parseProject(serialize(moved)), moved);
const old = structuredClone(p);
delete old.layers.mounting;
assert.equal(parseProject(old).layers.mounting.locked, false);
const locked = structuredClone(q);
locked.layers.mounting.locked = true;
assert.throws(() => editMount(locked, h.id, { x: 1 }), /låst/);
assert.throws(() => removeMount(locked, h.id), /låst/);
assert.throws(() => addCorners(locked), /låst/);
assert.throws(() => addCorners(q), /Overlappende/);
assert.throws(() => cornerPattern(p, { inset: 180 }), /halve/);
assert.throws(() => editMount(p, null, { diameter: 0 }));
assert.throws(() => mechanicalSettings({ edgeClearance: -1 }));
const bad = structuredClone(q);
bad.production.mechanicalSettings = {
  version: 1,
  edgeClearance: 14,
  holeClearance: 1,
};
assert.equal(mountingIssues(bad).length, 4);
assert.equal(productionReport(bad).allowed, false);
assert.equal(mechanicalCheck(q).length, 0);
assert.equal(productionReport(q, { allowUnbound: true }).allowed, true);
const overlap = editMount(q, null, { x: 15, y: 15, diameter: 2 }).project;
assert.ok(
  mountingIssues(overlap).some((i) => i.message.includes("Overlappende")),
);
const outside = editMount(q, h.id, { x: 1 }).project;
assert.ok(mountingIssues(outside).some((i) => i.message.includes("utenfor")));
assert.deepEqual(snapPoint(q, { x: 15.8, y: 15.7 }, { enabled: true }).point, {
  x: 15,
  y: 15,
});
assert.deepEqual(snapPoint(q, { x: 15.8, y: 15.7 }, { enabled: false }).point, {
  x: 15.8,
  y: 15.7,
});
assert.match(svg(q), /data-mounting/);
const proto = addCorners(trondheimPrototype());
assert.equal(productionReport(proto).allowed, true);
assert.equal(productionHoles(proto).length, 22);
const back = productionHoles(proto, "back");
for (const a of productionHoles(proto)) {
  const b = back.find((b) => b.id === a.id);
  assert.equal(b.x, 300 - a.x);
}
assert.match(drillCsv(proto), /Hjørnehull/);
assert.equal((machiningSvg(proto).match(/<circle /g) ?? []).length, 22);

const stationHole = p.layout.stations[0].holes[0];
const collision = editMount(p, null, {
  x: stationHole.x,
  y: stationHole.y,
  diameter: 3.2,
}).project;
assert.ok(
  mechanicalCheck(collision).some(
    (i) => i.target?.kind === "mounting" && i.message.includes("Overlappende"),
  ),
);
const stationEdge = structuredClone(p);
stationEdge.layout.stations[0].holes[0].x = 3;
stationEdge.production.mechanicalSettings = {
  version: 1,
  edgeClearance: 2,
  holeClearance: 1,
};
assert.ok(
  mountingIssues(stationEdge).some(
    (i) => i.target.kind === "station" && i.message.includes("Kantavstand"),
  ),
);

console.log(
  "Mounting model PASS: 4-corner mm geometry, stable IDs, lock, collision/edge clearance, preview nonmutation, confirmation deltas, undo/redo, migration/JSON, snap override, 22-hole front/back SVG/CSV exports",
);
