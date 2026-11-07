import assert from "node:assert/strict";
import { portFixture } from "./fixtures/board-studio-v032.mjs";
import {
  connectPorts,
  deleteConnection,
  splitConnection,
} from "../web/board-studio/connections.mjs";
import { stationPorts, stationPort } from "../web/board-studio/ports.mjs";
import {
  edgeGeometry,
  symbolCenters,
  sub,
  length,
} from "../web/board-studio/geometry.mjs";
import {
  parseProject,
  serialize,
  svg,
  History,
  moveStations,
} from "../web/board-studio/model.mjs";
const p = portFixture(),
  before = structuredClone(p.layout.stations),
  main = structuredClone(p.layout.routes);
const q = parseProject(
    connectPorts(
      p,
      { stationId: "junction", portId: "pair:left" },
      { stationId: "branch", portId: "pair:left" },
    ).project,
  ),
  r = q.layout.routes.at(-1),
  g = edgeGeometry(q, r, 0);
assert.ok(g.valid, g.warnings.join(" "));
assert.deepEqual(q.layout.stations, before);
assert.deepEqual(q.layout.routes.slice(0, 2), main);
assert.equal(r.anchors[0].start, "pair:left");
assert.deepEqual(
  g.curves[0].start,
  stationPort(q, "junction", "pair:left").point,
);
assert.ok(g.curves[0].c1.y > 130);
assert.equal(g.curves[0].c1.x, 70);
assert.ok(g.curves.at(-1).c2.x < 210);
for (const route of p.layout.routes)
  assert.deepEqual(
    edgeGeometry(p, route, 0).paths,
    edgeGeometry(q, route, 0).paths,
  );
const pair = parseProject(
    connectPorts(
      p,
      { stationId: "pair-a", portId: "pair:right" },
      { stationId: "pair-b", portId: "pair:left" },
    ).project,
  ),
  pairRoute = pair.layout.routes.at(-1),
  geom = edgeGeometry(pair, pairRoute, 0),
  c = geom.curves[0];
assert.ok(geom.valid, geom.warnings.join(" "));
assert.equal(geom.curves.length, 1);
for (const rail of g.rails) {
  const first = rail.samples[0],
    radius =
      q.layout.stations[1].ringOuter / 2 + q.layout.stations[1].stroke / 2;
  assert.equal(first.y, 130 + radius);
  assert.ok(Math.abs(first.x - 65) < 1e-8 || Math.abs(first.x - 75) < 1e-8);
}

assert.ok(Math.abs(c.c1.x + c.c2.x - c.start.x - c.end.x) < 1e-10);
assert.ok(Math.abs(c.c1.y + c.c2.y - c.start.y - c.end.y) < 1e-10);
for (let i = 0; i < geom.rails[0].samples.length; i++)
  assert.ok(
    Math.abs(
      length(sub(geom.rails[0].samples[i], geom.rails[1].samples[i])) - 10,
    ) < 1e-8,
  );
// Rotation and spacing do not introduce independent curve logic per rail.
for (const angle of [45, 90, 135])
  for (const spacing of [6, 10, 14]) {
    const board = portFixture(),
      a = board.layout.stations.find((s) => s.id === "pair-a"),
      b = board.layout.stations.find((s) => s.id === "pair-b"),
      rad = (angle * Math.PI) / 180,
      n = { x: Math.cos(rad), y: Math.sin(rad) },
      t = { x: n.y, y: -n.x };
    a.x = 70;
    a.y = 180;
    b.x = a.x + t.x * 140 + n.x * 30;
    b.y = a.y + t.y * 140 + n.y * 30;
    for (const s of [a, b]) {
      s.symbolAngle = angle;
      s.pointSpacing = spacing;
      s.ringOuter = 4;
      s.ringInner = 3;
      s.holes.forEach((h, i) => {
        h.x = s.x + n.x * (i - 0.5) * spacing;
        h.y = s.y + n.y * (i - 0.5) * spacing;
      });
    }
    board.routeDefaults.trackSpacing = spacing;
    const changed = parseProject(
        connectPorts(
          board,
          { stationId: a.id, portId: "pair:right" },
          { stationId: b.id, portId: "pair:left" },
        ).project,
      ),
      geometry = edgeGeometry(changed, changed.layout.routes.at(-1), 0);
    assert.ok(geometry.valid);
    for (let i = 0; i < geometry.rails[0].samples.length; i++)
      assert.ok(
        Math.abs(
          length(
            sub(geometry.rails[0].samples[i], geometry.rails[1].samples[i]),
          ) - spacing,
        ) < 1e-8,
      );
  }
const chain = structuredClone(p);
chain.layout.routes = [
  {
    ...chain.layout.routes[0],
    stationIds: ["north", "junction", "south"],
    anchors: {
      0: chain.layout.routes[0].anchors[0],
      1: chain.layout.routes[1].anchors[0],
    },
  },
];
const split = parseProject(
  splitConnection(parseProject(chain), chain.layout.routes[0].id).project,
);
assert.deepEqual(
  split.layout.routes[1].anchors[0],
  chain.layout.routes[0].anchors[1],
);
const h = new History(p);
h.commit(q);
assert.deepEqual(h.undo(), p);
assert.deepEqual(h.redo(), q);
assert.deepEqual(parseProject(serialize(q)), q);
assert.deepEqual(
  edgeGeometry(parseProject(serialize(pair)), pairRoute, 0).paths,
  geom.paths,
);
const removed = parseProject(deleteConnection(q, r.id, 0));
assert.deepEqual(removed.layout.stations, before);
assert.deepEqual(removed.layout.routes, main);
assert.ok(!svg(removed).includes(`data-route="${r.id}"`));
assert.ok(!svg(q).includes("data-port="));
assert.equal(stationPorts(p, p.layout.stations[0]).length, 10);
const invalid = structuredClone(q);
invalid.layout.routes.at(-1).anchors[0].start = "point:7:right";
assert.throws(() => parseProject(invalid), /port/);
const single = structuredClone(p);
single.routeDefaults.tracks = 1;
const explicit = parseProject(
  connectPorts(
    single,
    { stationId: "pair-a", portId: "point:0:right" },
    { stationId: "pair-b", portId: "point:0:left" },
  ).project,
);
assert.ok(edgeGeometry(explicit, explicit.layout.routes.at(-1), 0).valid);
// Invalid straight geometry never overrides a selected direction.
const wrong = structuredClone(q);
wrong.layout.routes.at(-1).curveStyle = "straight";
assert.equal(edgeGeometry(wrong, wrong.layout.routes.at(-1), 0).valid, false);
assert.throws(() => svg(wrong), /SVG stoppet/);
// Auto stations retain the local frame chosen before adding a branch and moving.
const auto = structuredClone(p);
auto.layout.stations.find((s) => s.id === "pair-a").symbolAngle = null;
const centers = symbolCenters(
  auto,
  auto.layout.stations.find((s) => s.id === "pair-a"),
);
const anchored = connectPorts(
  auto,
  { stationId: "pair-a", portId: "pair:right" },
  { stationId: "pair-b", portId: "pair:left" },
).project;
assert.deepEqual(
  symbolCenters(
    anchored,
    anchored.layout.stations.find((s) => s.id === "pair-a"),
  ),
  centers,
);
const moved = moveStations(anchored, ["pair-a"], 10, 0);
assert.deepEqual(
  moved.layout.tangentHints["pair-a"],
  anchored.layout.tangentHints["pair-a"],
);
console.log(
  "v0.3.2 model PASS: named ports/rotation, explicit branch uses same main-line exit, immutable old routes/stations/holes, symmetric shared curve, nine rotated/6–14 mm pairs, single-ring ports, invalid direction rejection, frozen auto frame, history, JSON/SVG and deletion",
);
