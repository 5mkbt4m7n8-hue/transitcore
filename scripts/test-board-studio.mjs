import assert from "node:assert/strict";
import {
  createProject,
  parseProject,
  serialize,
  svg,
  moveStations,
  History,
} from "../web/board-studio/model.mjs";
const p = createProject();
assert.equal(p.board.width, 300);
assert.equal(p.board.height, 400);
assert.equal(p.layout.stations.length, 16);
assert.deepEqual(parseProject(serialize(p)), p);
const fine = structuredClone(p);
fine.layout.stations[0].x = 123.123456789;
assert.equal(parseProject(serialize(fine)).layout.stations[0].x, 123.123456789);
const out = svg(p);
assert.match(out, /width="300mm" height="400mm" viewBox="0 0 300 400"/);
assert.ok(!out.includes("<image"));
assert.match(out, /id="names"/);
assert.ok(!svg(p, { layers: ["holes"] }).includes("<text"));
assert.match(svg(p, { layers: ["holes"] }), /cx="198" cy="42" r="1.25"/);
assert.match(svg(p, { layers: ["rings"] }), /cx="198" cy="42" r="3"/);
const q = moveStations(p, ["station-1"], 2.125, 3.25);
assert.equal(q.layout.stations[0].x, 200.125);
assert.deepEqual(q.network, p.network);
assert.deepEqual(q.ledLayout, p.ledLayout);
assert.equal(p.layout.stations[0].x, 198);
q.layers.rings.locked = true;
assert.deepEqual(moveStations(q, ["station-1"], 5, 6), q);
const h = new History(p);
h.commit(q);
assert.deepEqual(h.undo(), p);
assert.deepEqual(h.redo(), q);
h.undo();
h.commit(fine);
assert.equal(h.future.length, 0);
for (const change of [
  (x) => (x.version = 999),
  (x) => (x.board.width = NaN),
  (x) => (x.layout.stations[0].x = Infinity),
  (x) => (x.layout.stations[0].label.size = -1),
  (x) => (x.layout.routes[0].stationIds = ["missing"]),
  (x) => (x.layers.names.visible = "yes"),
]) {
  const bad = structuredClone(p);
  change(bad);
  assert.throws(() => parseProject(bad));
}
const evil = structuredClone(p);
evil.layout.stations[0].name = '<script>&"';
assert.match(svg(evil), /&lt;script&gt;&amp;&quot;/);
assert.ok(!svg(evil).includes("<script>"));
console.log(
  "Board Studio fase A: mm, SVG layers, independent holes/rings, precision, source isolation, locks, history and invalid files PASS",
);
const { holeCenters, edgeGeometry, roundedPolyline, stationTangent } =
  await import("../web/board-studio/geometry.mjs");
const b = createProject(),
  s = b.layout.stations[1];
assert.equal(s.points, 2);
let centers = holeCenters(b, s);
assert.ok(
  Math.abs(
    Math.hypot(centers[1].x - centers[0].x, centers[1].y - centers[0].y) - 10,
  ) < 1e-10,
);
const oldCenters = structuredClone(centers);
s.ringOuter = 20;
s.holeDiameter = 3;
assert.deepEqual(holeCenters(b, s), oldCenters);
s.pointSpacing = 12.7;
centers = holeCenters(b, s);
assert.ok(
  Math.abs(
    Math.hypot(centers[1].x - centers[0].x, centers[1].y - centers[0].y) - 12.7,
  ) < 1e-10,
);
const r = b.layout.routes[0],
  edge = edgeGeometry(b, r, 0);
assert.equal(edge.paths.filter((x) => x.part === "core").length, 1);
assert.equal(edge.paths.filter((x) => x.part === "end").length, 2);
for (const path of edge.paths.filter((x) => !x.d))
  assert.ok(
    Object.values(path)
      .filter((x) => typeof x === "object")
      .every((v) => Number.isFinite(v.x) && Number.isFinite(v.y)),
  );
// Cubic derivative at the join is collinear with the central segment.
for (const path of edge.paths.filter((x) => x.part === "start")) {
  const dx = path.end.x - path.c2.x,
    dy = path.end.y - path.c2.y,
    core = edge.paths.find((x) => x.part === "end");
  const vx = core.start.x - path.end.x,
    vy = core.start.y - path.end.y;
  assert.ok(Math.abs(dx * vy - dy * vx) < 1e-9);
}
r.tracks = 2;
r.trackSpacing = 10;
r.bends = { 0: { x: 175, y: 65 } };
r.cornerRadius = 15;
const dbl = edgeGeometry(b, r, 0);
assert.equal(dbl.paths.filter((x) => x.part === "core").length, 2);
assert.ok(
  dbl.paths.filter((x) => x.part === "core").every((x) => x.d.includes(" A ")),
);
assert.match(
  roundedPolyline(
    [
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 20, y: 20 },
    ],
    5,
  ),
  /L 15 0 A 5 5 0 0 1 20 5/,
);
const dBefore = svg(b);
b.layout.stations[1].x += 4.125;
assert.notEqual(svg(b), dBefore);
assert.deepEqual(parseProject(serialize(b)), b);
const fallback = structuredClone(b);
delete fallback.layout.stations[0].points;
assert.equal(parseProject(fallback).layout.stations[0].points, 1);
const moved = moveStations(b, ["station-2"], 5, 0);
for (const id of ["station-1", "station-2"]) {
  const st = moved.layout.stations.find((s) => s.id === id);
  for (const c of holeCenters(moved, st)) {
    assert.ok(
      svg(moved, { layers: ["holes"] }).includes(`cx="${c.x}" cy="${c.y}"`),
    );
    assert.ok(
      svg(moved, { layers: ["rings"] }).includes(`cx="${c.x}" cy="${c.y}"`),
    );
  }
}
const horizontal = createProject(false);
horizontal.layout.stations = [
  { ...structuredClone(s), id: "a", x: 30, y: 20 },
  { ...structuredClone(s), id: "b", x: 90, y: 20 },
];
horizontal.layout.routes = [
  { ...structuredClone(r), id: "r", stationIds: ["a", "b"], bends: {} },
];
assert.deepEqual(stationTangent(horizontal, horizontal.layout.stations[0]), {
  x: 1,
  y: 0,
});
assert.ok(
  edgeGeometry(horizontal, horizontal.layout.routes[0], 0).paths.every(
    (c) => !JSON.stringify(c).includes("null"),
  ),
);
console.log(
  "Board Studio fase B: double/multiple symbols, measured symbol spacing, independent centres, cubic tangents, single/double rails, circular corners, edited geometry, additive v1 migration PASS",
);
