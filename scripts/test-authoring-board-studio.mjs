import assert from "node:assert/strict";
import {
  createProject,
  parseProject,
  serialize,
  History,
  svg,
} from "../web/board-studio/model.mjs";
import {
  stationTemplate,
  fromTemplate,
  APPEARANCE,
} from "../web/board-studio/stations.mjs";
import {
  symbolCenters,
  holeCenters,
  edgeGeometry,
  evaluateCubic,
} from "../web/board-studio/geometry.mjs";
import {
  geometryFixture,
  parallelFixture,
} from "../web/board-studio/fixtures.mjs";
import {
  parallelCandidate,
  applyParallel,
  enforceParallels,
  translateRoute,
  segmentPoints,
} from "../web/board-studio/parallel.mjs";
const source = geometryFixture();
for (const station of source.layout.stations) {
  station.source = { quayId: "MUST-NOT-COPY" };
  station.ledBinding = { index: 123 };
  station.quayId = "PRIVATE";
  const original = structuredClone(station),
    template = stationTemplate(source, station),
    duplicate = fromTemplate(template, { x: 150, y: 200 });
  assert.notEqual(duplicate.id, station.id);
  assert.equal(duplicate.name, "Ny stasjon");
  assert.equal(duplicate.source, null);
  assert.ok(!("ledBinding" in duplicate) && !("quayId" in duplicate));
  for (const key of APPEARANCE)
    if (key !== "symbolAngle") assert.deepEqual(duplicate[key], station[key]);
  assert.deepEqual(duplicate.label, station.label);
  for (let i = 0; i < duplicate.holes.length; i++) {
    assert.ok(
      Math.abs(
        duplicate.holes[i].x - duplicate.x - (station.holes[i].x - station.x),
      ) < 1e-10,
    );
    assert.notEqual(duplicate.holes[i].id, station.holes[i].id);
  }
  duplicate.label.angle += 15;
  duplicate.holes[0].x++;
  assert.deepEqual(station, original);
  source.stationTemplate = template;
  assert.deepEqual(parseProject(serialize(source)).stationTemplate, template);
}
// An automatic symbol takes a snapshot of its visible orientation, even when
// pasted without a route. Explicit hole offsets remain distinct from rings.
const auto = createProject(),
  a = auto.layout.stations[1],
  t = stationTemplate(auto, a),
  dup = fromTemplate(t, { x: 10, y: 20 }),
  isolated = createProject(false);
isolated.layout.stations = [dup];
const old = symbolCenters(auto, a),
  fresh = symbolCenters(isolated, dup);
for (let i = 0; i < old.length; i++) {
  assert.ok(Math.abs(old[i].x - a.x - (fresh[i].x - dup.x)) < 1e-9);
  assert.ok(Math.abs(old[i].y - a.y - (fresh[i].y - dup.y)) < 1e-9);
}
const h = new History(isolated),
  withCopy = structuredClone(isolated);
withCopy.layout.stations.push(fromTemplate(t, { x: 80, y: 40 }));
h.commit(withCopy);
assert.equal(h.undo().layout.stations.length, 1);
assert.equal(h.redo().layout.stations.length, 2);
assert.match(svg(h.value), /Ny stasjon/);
for (const diagonal of [false, true]) {
  let p = parallelFixture(diagonal),
    original = structuredClone(p),
    c = parallelCandidate(p, "follower", 0, diagonal ? 30 : 20, 1);
  assert.ok(c);
  assert.deepEqual(p, original, "candidate is only a preview");
  applyParallel(p, c);
  p.layout.parallelConstraints = [
    {
      id: c.id,
      reference: c.reference,
      follower: c.follower,
      distance: c.distance,
    },
  ];
  p = parseProject(serialize(p));
  const history = new History(p),
    q = translateRoute(structuredClone(p), "reference", 2, 7);
  history.commit(q);
  const actual = history.value,
    ref = segmentPoints(actual, c.reference),
    follow = segmentPoints(actual, c.follower),
    dx = ref[1].x - ref[0].x,
    dy = ref[1].y - ref[0].y;
  for (const pt of follow)
    assert.ok(
      Math.abs(
        ((pt.x - ref[0].x) * -dy + (pt.y - ref[0].y) * dx) /
          Math.hypot(dx, dy) -
          c.distance,
      ) < 1e-8,
    );
  assert.deepEqual(history.undo(), p);
  assert.deepEqual(history.redo(), actual);
  assert.deepEqual(parseProject(serialize(actual)), actual);
}
const bent = parallelFixture(false, true),
  bc = parallelCandidate(bent, "follower", 0, 20, 1);
assert.ok(bc);
applyParallel(bent, bc);
bent.layout.parallelConstraints = [bc];
enforceParallels(bent);
assert.deepEqual(
  parseProject(serialize(bent)).layout.parallelConstraints,
  bent.layout.parallelConstraints,
);
const cycle = parallelFixture();
cycle.layout.parallelConstraints = [
  {
    id: "a",
    reference: { routeId: "reference", edge: 0, leg: "whole" },
    follower: { routeId: "follower", edge: 0, leg: "whole" },
    distance: 20,
  },
  {
    id: "b",
    reference: { routeId: "follower", edge: 0, leg: "whole" },
    follower: { routeId: "reference", edge: 0, leg: "whole" },
    distance: -20,
  },
];
assert.throws(() => parseProject(cycle), /sirkel/);
const curves = geometryFixture(),
  r = curves.layout.routes[1];
r.controls[0] = {
  startReach: 32,
  endReach: 32,
  shape: { x: 130, y: 178 },
  shapeAngle: 25,
  shapeReach: 25,
};
const g = edgeGeometry(curves, r, 0);
assert.ok(g.valid, g.warnings.join(" "));
assert.equal(g.curves.length, 2);
const first = evaluateCubic(g.curves[0], 1),
  second = evaluateCubic(g.curves[1], 0);
assert.deepEqual(first.p, second.p);
assert.ok(
  Math.hypot(first.d.x - second.d.x, first.d.y - second.d.y) < 1e-8,
  "C1 shared tangent",
);
assert.deepEqual(
  parseProject(serialize(curves)).layout.routes[1].controls,
  r.controls,
);
const holes = structuredClone(
  curves.layout.stations.map((s) => holeCenters(curves, s)),
);
r.controls[0].shape.y += 4;
assert.deepEqual(
  curves.layout.stations.map((s) => holeCenters(curves, s)),
  holes,
);
assert.deepEqual(
  r.trackIds,
  g.rails.map((s) => s.id),
);
console.log(
  "Board Studio authoring model PASS: single/double copies, appearance snapshots, unique IDs, no source/LED bindings, independent holes/labels, templates, history, horizontal/diagonal/bend parallel constraints, persistence/cycle rejection, 2D shape and C1 continuity",
);
const rotatedParallel = parallelFixture(),
  constraint = parallelCandidate(rotatedParallel, "follower", 0, 20);
applyParallel(rotatedParallel, constraint);
rotatedParallel.layout.parallelConstraints = [constraint];
const oldLength = Math.hypot(
  rotatedParallel.layout.stations[3].x - rotatedParallel.layout.stations[2].x,
  rotatedParallel.layout.stations[3].y - rotatedParallel.layout.stations[2].y,
);
rotatedParallel.layout.stations[1].x = 40;
rotatedParallel.layout.stations[1].y = 220;
enforceParallels(rotatedParallel);
const follower = segmentPoints(rotatedParallel, constraint.follower);
assert.ok(
  Math.abs(
    Math.hypot(follower[1].x - follower[0].x, follower[1].y - follower[0].y) -
      oldLength,
  ) < 1e-8,
);
assert.ok(follower.every((pt) => Math.abs(pt.x - 20) < 1e-8));
assert.deepEqual(parseProject(serialize(rotatedParallel)), rotatedParallel);
const invalidParallel = structuredClone(rotatedParallel);
invalidParallel.layout.stations[2].x += 1;
assert.throws(() => parseProject(invalidParallel), /samsvarer/);
