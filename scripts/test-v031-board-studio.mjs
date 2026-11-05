import assert from "node:assert/strict";
import {
  connectionFixture,
  ledFixture,
} from "./fixtures/board-studio-v031.mjs";
import {
  deleteConnection,
  newConnection,
  routeStyle,
} from "../web/board-studio/connections.mjs";
import {
  parseProject,
  serialize,
  svg,
  History,
} from "../web/board-studio/model.mjs";
import { edgeGeometry, symbolCenters } from "../web/board-studio/geometry.mjs";
import {
  newProfile,
  newSegment,
  ledPositions,
} from "../web/board-studio/led-layout.mjs";
import {
  nearestPhysicalLed,
  snapStationPoint,
} from "../web/board-studio/station-snap.mjs";
import { snapPoint } from "../web/board-studio/editing.mjs";
import { bindPoint } from "../web/board-studio/bindings.mjs";
const p = connectionFixture(true),
  profile = newProfile();
p.ledLayout.profiles = [profile];
p.ledLayout.segments = [
  newSegment(p, profile.id, {
    id: "s0-leds",
    x: 40,
    y: 70,
    angle: 90,
    count: 2,
    length: 20,
  }),
];
for (let i = 0; i < 2; i++)
  Object.assign(
    p,
    bindPoint(p, {
      stationId: "s0",
      pointIndex: i,
      segmentId: "s0-leds",
      ledId: "s0-leds:led:" + i,
    }),
  );
const q = parseProject(deleteConnection(p, "main", 1));
assert.deepEqual(
  q.layout.routes.map((r) => r.stationIds),
  [
    ["s0", "s1"],
    ["s2", "s3"],
    ["s1", "s2"],
  ],
);
assert.deepEqual(q.layout.stations, p.layout.stations);
assert.deepEqual(q.ledLayout, p.ledLayout);
assert.deepEqual(q.layout.routes[2], p.layout.routes[1]);
for (const [oldEdge, newIndex] of [
  [0, 0],
  [2, 1],
])
  assert.deepEqual(
    edgeGeometry(p, p.layout.routes[0], oldEdge).paths,
    edgeGeometry(q, q.layout.routes[newIndex], 0).paths,
  );
const h = new History(p);
h.commit(q);
assert.deepEqual(h.undo(), p);
assert.deepEqual(h.redo(), q);
assert.deepEqual(parseProject(serialize(q)), q);
// Constraints on surviving edges keep their real edge references; deleted edges release them.
const constrained = connectionFixture();
for (const [id, edge] of [
  ["keep", 2],
  ["remove", 1],
]) {
  const original = constrained.layout.routes[0],
    a = constrained.layout.stations.find(
      (s) => s.id === original.stationIds[edge],
    ),
    b = constrained.layout.stations.find(
      (s) => s.id === original.stationIds[edge + 1],
    ),
    distance = Math.hypot(b.x - a.x, b.y - a.y),
    dx = (-(b.y - a.y) / distance) * 20,
    dy = ((b.x - a.x) / distance) * 20;
  const ids = [a, b].map((s, i) => {
    const t = structuredClone(s);
    t.id = id + i;
    t.x += dx;
    t.y += dy;
    t.holes = t.holes.map((h, j) => ({
      ...h,
      id: t.id + ":hole:" + j,
      x: h.x + dx,
      y: h.y + dy,
    }));
    constrained.layout.stations.push(t);
    return t.id;
  });
  constrained.layout.routes.push({
    ...newConnection(constrained, ids),
    id: "follower-" + id,
  });
  constrained.layout.parallelConstraints.push({
    id,
    reference: { routeId: "main", edge, leg: "whole" },
    follower: { routeId: "follower-" + id, edge: 0, leg: "whole" },
    distance: 20,
  });
}
parseProject(constrained);
const remapped = parseProject(deleteConnection(constrained, "main", 1));
assert.equal(remapped.layout.parallelConstraints.length, 1);
assert.equal(
  remapped.layout.parallelConstraints[0].reference.routeId,
  remapped.layout.routes[1].id,
);
assert.equal(remapped.layout.parallelConstraints[0].reference.edge, 0);
const exported = svg(q);
assert.ok(!exported.includes('data-route="main" data-edge="1"'));
const gap = parseProject(deleteConnection(connectionFixture(), "main", 1));
for (const r of gap.layout.routes) assert.equal(r.stationIds.length, 2);
const paths = [...svg(gap).matchAll(/<path[^>]*data-route="([^"]+)"[^>]*>/g)];
assert.ok(paths.length > 0);
assert.ok(paths.every(([path]) => path.includes('data-edge="0"')));
assert.throws(() =>
  deleteConnection(
    {
      ...p,
      layers: { ...p.layers, routes: { ...p.layers.routes, locked: true } },
    },
    "main",
    1,
  ),
);
const choice = structuredClone(q);
choice.routeDefaults = routeStyle({
  ...q.layout.routes[0],
  tracks: 1,
  stroke: 0.4,
});
assert.equal(
  newConnection(parseProject(serialize(choice)), ["s0", "s3"]).stroke,
  0.4,
);
assert.equal(newConnection(choice, ["s0", "s2"]).tracks, 1);
assert.equal(q.layout.routes[0].tracks, 2);
for (const angle of [0, 45, 90]) {
  let board = ledFixture(angle),
    leds = ledPositions(board, board.ledLayout.segments[0]);
  for (const zoom of [0.5, 1, 4]) {
    const l = leds[4];
    assert.equal(
      nearestPhysicalLed(
        board,
        {
          x: l.x - (Math.sin((angle * Math.PI) / 180) * 5) / zoom,
          y: l.y + (Math.cos((angle * Math.PI) / 180) * 5) / zoom,
        },
        zoom,
      ).id,
      l.id,
    );
    assert.equal(
      nearestPhysicalLed(
        board,
        {
          x: l.x - (Math.sin((angle * Math.PI) / 180) * 30) / zoom,
          y: l.y + (Math.cos((angle * Math.PI) / 180) * 30) / zoom,
        },
        zoom,
      ),
      null,
    );
    assert.equal(nearestPhysicalLed(board, l, zoom, { enabled: false }), null);
  }
  board = snapStationPoint(board, "double", 0, leds[2]);
  board = snapStationPoint(board, "double", 1, leds[3]);
  const s = board.layout.stations[0];
  for (let i = 0; i < 2; i++) {
    assert.equal(symbolCenters(board, s)[i].x, leds[i + 2].x);
    assert.equal(symbolCenters(board, s)[i].y, leds[i + 2].y);
    assert.equal(s.holes[i].x, leds[i + 2].x);
    assert.equal(s.holes[i].y, leds[i + 2].y);
  }
  assert.throws(() => snapStationPoint(board, "double", 1, leds[2]));
  assert.deepEqual(parseProject(serialize(board)), board);
}
const alignBase = ledFixture(),
  aligned = snapStationPoint(
    alignBase,
    "double",
    0,
    ledPositions(alignBase, alignBase.ledLayout.segments[0])[0],
    { bind: false },
  );
assert.equal(aligned.ledLayout.bindings.length, 0);
const grid = snapPoint(
  p,
  { x: 43.2, y: 51.3 },
  { gridEnabled: true, guidesEnabled: false },
);
assert.deepEqual(grid.point, { x: 45, y: 50 });
assert.deepEqual(
  snapPoint(
    p,
    { x: 43.2, y: 51.3 },
    { gridEnabled: false, guidesEnabled: false },
  ).point,
  { x: 43.2, y: 51.3 },
);
console.log(
  "v0.3.1 model PASS: real connection gaps, overlapping route isolation, unchanged surviving rail geometry/stations/LED data, history, JSON/SVG persistence, inherited track style, exact 0/45/90° LED snap at three zooms, separate double points, conflict rejection and independent grid/guide switches",
);
