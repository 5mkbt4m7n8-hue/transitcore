import { translateRoute } from "../web/board-studio/parallel.mjs";
import { connectPorts } from "../web/board-studio/connections.mjs";
import { stationPort } from "../web/board-studio/ports.mjs";
import assert from "node:assert/strict";
import {
  createProject,
  parseProject,
  serialize,
  History,
  stationMarkup,
} from "../web/board-studio/model.mjs";
import {
  placementFixture,
  placementSymbols,
} from "./fixtures/board-studio-placement.mjs";
import { stationPlacement } from "../web/board-studio/placement.mjs";
import {
  fromTemplate,
  stationTemplate,
} from "../web/board-studio/stations.mjs";
import {
  editStation,
  editGraphicPoint,
  fitPointSizes,
  setHoleEnabled,
  moveGraphicStation,
} from "../web/board-studio/station-edit.mjs";
import { pointStyle, activeHole } from "../web/board-studio/point-style.mjs";
import { symbolCenters } from "../web/board-studio/geometry.mjs";
import {
  prepareBindings,
  physicalChanges,
  unbindPoint,
  mechanicalCheck,
} from "../web/board-studio/bindings.mjs";
import { ledPositions } from "../web/board-studio/led-layout.mjs";
import {
  productionReport,
  productionHoles,
  graphicsSvg,
} from "../web/board-studio/production.mjs";
const template = placementSymbols()[1].template;
let p = createProject(false);
p.layout.stations.push(fromTemplate(template, { x: 150, y: 150 }, "station"));
const original = structuredClone(p),
  oldIds = [...p.layout.stations[0].pointIds];
let q = editStation(p, "station", { count: 3 });
assert.equal(q.layout.stations[0].points, 3);
assert.equal(q.layout.stations[0].holes.length, 3);
assert.equal(q.layout.stations[0].ringCenters.length, 3);
assert.deepEqual(q.layout.stations[0].pointIds.slice(0, 2), oldIds);
assert.equal(q.layout.stations[0].holes[2].enabled, false);
assert.deepEqual(p, original);
q = editStation(q, "station", { spacing: 5 });
q = editGraphicPoint(q, "station", 1, {
  ringOuter: 4,
  ringInner: 3,
  stroke: 0.1,
});
q = parseProject(prepareBindings(p, q));
assert.equal(pointStyle(q.layout.stations[0], 1).ringOuter, 4);
assert.equal(pointStyle(q.layout.stations[0], 0).ringOuter, 6);
assert.deepEqual(
  q.layout.stations[0].holes.slice(0, 2),
  p.layout.stations[0].holes,
);
assert.equal(physicalChanges(p, q).length, 0);
assert.deepEqual(parseProject(serialize(q)), q);
for (const count of [8, 1, 4, 2, 3]) {
  q = parseProject(editStation(q, "station", { count }));
  assert.equal(q.layout.stations[0].pointIds.length, count);
  assert.equal(q.layout.stations[0].holes.length, count);
  assert.equal(q.layout.stations[0].ringCenters.length, count);
}
assert.throws(() => editStation(q, "station", { count: 9 }), /1 til 8/);
// B: edge-to-edge 5 mm strips; overlapping 6 mm graphics are accepted.
p = placementFixture();
p.ledLayout.segments[1].y = 105;
const a = ledPositions(p, p.ledLayout.segments[0])[4],
  b = ledPositions(p, p.ledLayout.segments[1])[4];
const result = stationPlacement(p, {
  template,
  id: "compact",
  point: b,
  mode: "common",
  first: { segmentId: a.segmentId, ledId: a.id },
  snap: "required",
  zoom: 4,
});
assert.equal(result.valid, true);
p = parseProject(result.project);
const hardware = structuredClone(p.ledLayout),
  holes = structuredClone(p.layout.stations[0].holes);
q = fitPointSizes(p, "compact");
assert.ok(q.layout.stations[0].ringOuter < 5);
q = editGraphicPoint(q, "compact", 0, {
  x: a.x - 2,
  ringOuter: 2,
  ringInner: 1,
});
q = parseProject(prepareBindings(p, q));
assert.deepEqual(q.ledLayout, hardware);
assert.deepEqual(q.layout.stations[0].holes, holes);
assert.ok(mechanicalCheck(q).length);
assert.equal(productionReport(q).allowed, false);
assert.match(graphicsSvg(q), /<svg/);
assert.equal(physicalChanges(p, q).length, 0);
const hardwareEdit = structuredClone(q);
hardwareEdit.ledLayout.segments[0].x += 10;
const prepared = prepareBindings(q, hardwareEdit),
  again = prepareBindings(q, prepared);
assert.deepEqual(again, prepared);
assert.equal(
  prepared.layout.stations[0].ringCenters[0].x,
  q.layout.stations[0].ringCenters[0].x + 10,
);
assert.equal(
  prepared.layout.stations[0].holes[0].x,
  q.layout.stations[0].holes[0].x + 10,
);
// C: v0.6 file migration, release bindings and resize; undo retains complete identities.
const legacy = JSON.parse(serialize(p));
legacy.version = 3;
for (const s of legacy.layout.stations) {
  delete s.pointIds;
  delete s.pointStyles;
  delete s.pointDataVersion;
}
p = parseProject(legacy);
assert.equal(p.version, 4);
p = unbindPoint(unbindPoint(p, "compact", 0), "compact", 1);
q = editStation(p, "compact", { count: 3 });
const history = new History(p);
history.commit(q);
history.undo();
assert.equal(history.value.layout.stations[0].points, 2);
history.redo();
assert.equal(history.value.layout.stations[0].points, 3);
assert.deepEqual(parseProject(serialize(history.value)), history.value);
// D: independent styles/positions, copies and snapshots without identity inheritance.
p = q;
const before = symbolCenters(p, p.layout.stations[0]);
for (const [i, d] of [6, 4, 7].entries())
  p = editGraphicPoint(p, "compact", i, {
    ringOuter: d,
    ringInner: d * 0.7,
    stroke: 0.12,
  });
p = editGraphicPoint(p, "compact", 1, { x: 140, y: 120 });
const after = symbolCenters(p, p.layout.stations[0]);
assert.deepEqual(after[0], before[0]);
assert.deepEqual(after[2], before[2]);
const saved = stationTemplate(p, p.layout.stations[0]),
  copy = fromTemplate(saved, { x: 220, y: 250 }, "copy");
assert.deepEqual(
  [0, 1, 2].map((i) => pointStyle(copy, i).ringOuter),
  [6, 4, 7],
);
assert.equal(copy.holes.length, 3);
assert.equal(copy.holes[2].enabled, false);
assert.notDeepEqual(copy.pointIds, p.layout.stations[0].pointIds);
assert.equal(copy.source, null);
assert.match(
  stationMarkup(copy, "rings", {
    ...p,
    layout: { ...p.layout, stations: [copy] },
  }),
  /r="2"/,
);
const reset = editGraphicPoint(p, "compact", 1, { inherit: true });
assert.equal(
  pointStyle(reset.layout.stations[0], 1).ringOuter,
  reset.layout.stations[0].ringOuter,
);
q = editStation(p, "compact", { angle: 90, uniform: true });
const centers = symbolCenters(q, q.layout.stations[0]);
assert.ok(Math.abs(centers[0].x - centers[2].x) < 1e-8);
assert.deepEqual(q.layout.stations[0].holes, p.layout.stations[0].holes);
q = setHoleEnabled(p, "compact", 2, true);
assert.equal(physicalChanges(p, q).length, 1);
assert.equal(productionHoles(p).length, 2);
assert.equal(productionHoles(q).length, 3);
const compact = result.project,
  removed = editStation(compact, "compact", { removeIndex: 0 });
assert.equal(removed.layout.stations[0].points, 1);
assert.equal(removed.ledLayout.bindings.length, 1);
assert.equal(removed.ledLayout.bindings[0].pointIndex, 0);
assert.equal(removed.ledLayout.bindings[0].ledId, b.id);
assert.equal(physicalChanges(compact, removed).length, 1);
assert.deepEqual(
  parseProject(prepareBindings(compact, removed)).layout.stations[0].holes,
  removed.layout.stations[0].holes,
);
let routes = createProject(false);
routes.layout.stations = [
  fromTemplate(template, { x: 80, y: 100 }, "route-A"),
  fromTemplate(template, { x: 180, y: 150 }, "route-B"),
];
routes = parseProject(routes);
routes = connectPorts(
  routes,
  { stationId: "route-A", portId: "pair:right" },
  { stationId: "route-B", portId: "pair:left" },
).project;
const direction = stationPort(routes, "route-A", "pair:right").direction,
  resized = parseProject(editStation(routes, "route-A", { count: 1 }));
assert.deepEqual(
  resized.layout.routes[0].stationIds,
  routes.layout.routes[0].stationIds,
);
assert.deepEqual(
  stationPort(resized, "route-A", resized.layout.routes[0].anchors[0].start)
    .direction,
  direction,
);
const routeMoved = translateRoute(
  structuredClone(routes),
  routes.layout.routes[0].id,
  5,
  7,
);
assert.deepEqual(
  routeMoved.layout.stations.map((s) => s.holes),
  routes.layout.stations.map((s) => s.holes),
);
assert.equal(routeMoved.layout.stations[0].x, routes.layout.stations[0].x + 5);
console.log(
  "Point editing model PASS A–D: 1–8 synchronized stable IDs/centres/hole slots, independent styles/positions/inheritance, compact 5 mm strips and intentional overlap, graphics without physical movement, controlled removal/reindexing, active-hole consent, legacy migration, copy/template snapshots, SVG/JSON and undo/redo",
);
