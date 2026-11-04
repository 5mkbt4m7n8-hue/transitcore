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
const {
  holeCenters,
  symbolCenters,
  edgeGeometry,
  geometryReport,
  evaluateCubic,
  segmentsIntersect,
} = await import("../web/board-studio/geometry.mjs");
const { geometryFixture } = await import("../web/board-studio/fixtures.mjs");
const fixture = geometryFixture();
for (const g of geometryReport(fixture)) {
  assert.ok(g.valid, `${g.routeId}: ${g.warnings}`);
  assert.ok(g.rails.every((r) => r.samples.length > 20));
  for (let i = 0; i < g.center.length; i++) {
    const c = g.center[i],
      a = g.rails[0].samples[i],
      b = g.rails[1].samples[i];
    assert.ok(
      Math.abs(Math.hypot(a.x - b.x, a.y - b.y) - 2 * c.w) < 1e-10,
      "normal separation",
    );
    assert.ok(
      Math.abs((a.x - c.x) * c.n.y - (a.y - c.y) * c.n.x) < 1e-10,
      "true centre normal",
    );
  }
  if (g.routeId === "turn" || g.routeId === "rotated")
    for (const c of g.curves)
      for (let t = 0; t <= 1; t += 1 / 2000) {
        const e = evaluateCubic(c, t);
        assert.ok(e.radius >= g.requiredRadius - 0.02, "dense curvature check");
      }
  for (const rail of g.rails)
    for (let i = 0; i < rail.samples.length - 1; i++)
      for (let j = i + 2; j < rail.samples.length - 1; j++)
        assert.ok(
          !segmentsIntersect(
            rail.samples[i],
            rail.samples[i + 1],
            rail.samples[j],
            rail.samples[j + 1],
          ),
          "no loop",
        );
  for (const path of g.paths) {
    assert.ok(path.d.startsWith("M "));
    assert.ok(path.trackId);
  }
}
const st = fixture.layout.stations[0],
  holes = structuredClone(holeCenters(fixture, st));
st.symbolAngle = 45;
st.ringOuter = 8;
assert.deepEqual(
  holeCenters(fixture, st),
  holes,
  "graphic rotation never moves physical holes",
);
assert.notDeepEqual(
  symbolCenters(fixture, st).map(({ x, y }) => ({ x, y })),
  holes.map(({ x, y }) => ({ x, y })),
);
const changed = structuredClone(fixture),
  route = changed.layout.routes[0],
  ids = structuredClone(route.trackIds),
  ports = structuredClone(route.portSigns);
route.controls[0] = { startReach: 38, endReach: 35 };
const round = parseProject(serialize(changed));
assert.deepEqual(round.layout.routes[0].trackIds, ids);
assert.deepEqual(round.layout.routes[0].portSigns, ports);
assert.deepEqual(round.layout.routes[0].controls, route.controls);
assert.deepEqual(round.layout.stations[0].holes, st.holes);
const old = JSON.parse(serialize(createProject()));
old.version = 1;
for (const s of old.layout.stations) delete s.holes;
for (const r of old.layout.routes) {
  delete r.trackIds;
  delete r.portSigns;
  delete r.controls;
  delete r.autoGrow;
}
const migrated = parseProject(old);
assert.equal(migrated.version, 2);
assert.deepEqual(parseProject(serialize(migrated)), migrated);
const short = geometryFixture();
const sr = short.layout.routes[0];
sr.trackSpacing = 90;
sr.autoGrow = 0;
sr.cornerRadius = 100;
assert.ok(!edgeGeometry(short, sr, 0).valid);
assert.throws(() => svg(short), /ugyldig sporgeometri/);
assert.ok(svg(short, { layers: ["holes"] }).includes("data-hole"));
const f = geometryFixture(),
  r = f.layout.routes[1],
  before = structuredClone(r.trackIds);
for (const angle of [0, 45, 90, 135, 180, -45, -90]) {
  f.layout.stations[3].symbolAngle = angle;
  const g = edgeGeometry(f, r, 0);
  assert.deepEqual(r.trackIds, before);
  if (!g.valid) assert.ok(g.warnings.length, "invalid remains explicit");
}
const report = geometryReport(createProject());
assert.ok(
  report.every((g) => g.valid),
  "reference drawing stays valid",
);
console.log(
  "Board Studio v0.2 step 1 PASS: rotated screenshot regression, 90-degree turn, dense normal spacing/curvature checks, no rail loops, clipping, explicit holes, stable tracks/ports, v1 migration, invalid export block",
);
const { gridSpec, snapPoint } = await import("../web/board-studio/editing.mjs");
for (const zoom of [0.05, 0.2, 1, 5, 20]) {
  const specs = ["faint", "normal", "strong"].map((c) =>
    gridSpec(1, 10, c, zoom),
  );
  assert.ok(
    specs[0].majorOpacity < specs[1].majorOpacity &&
      specs[1].majorOpacity < specs[2].majorOpacity,
  );
  assert.ok(specs[0].minor * zoom >= 7);
  assert.ok(specs[0].major > specs[0].minor);
}
const smart = createProject(false),
  tpl = structuredClone(createProject().layout.stations[0]);
smart.layout.stations = [
  {
    ...tpl,
    id: "target",
    x: 80,
    y: 90,
    holes: [{ id: "offset-light", x: 73, y: 87 }],
  },
];
const raw = { x: 73.7, y: 120.333333 },
  off = snapPoint(smart, raw, { enabled: false, zoom: 2 });
assert.deepEqual(off.point, raw);
assert.ok(off.guides.some((g) => g.kind === "hole" && g.value === 73));
const on = snapPoint(smart, raw, { enabled: true, zoom: 2 });
assert.equal(on.point.x, 73);
assert.equal(on.point.y, 120);
assert.ok(
  snapPoint(
    smart,
    { x: 30, y: 30.3 },
    { anchor: { x: 0, y: 0 }, enabled: false },
  ).guides.some((g) => g.kind === "45"),
);
assert.ok(!svg(createProject()).includes("smart-guide"));
console.log(
  "Board Studio v0.2 step 3 PASS: contrast levels, adaptive dual grid, physical-hole guides, exact unsnapped coordinates, explicit snap and 45-degree hints",
);
const corner = geometryFixture(),
  turn = corner.layout.routes[0],
  originalIds = structuredClone(turn.trackIds),
  originalPorts = structuredClone(turn.portSigns),
  normalTurn = edgeGeometry(corner, turn, 0);
assert.ok(
  normalTurn.curves.some((c) => c.arc?.radius === 8),
  "true circular fillet",
);
assert.ok(
  normalTurn.center.every((pt) => pt.x <= 125 + 1e-8 && pt.y >= 55 - 1e-8),
  "90-degree fillet stays inside the original corner",
);
turn.cornerRadius = 2;
turn.autoGrow = 0;
assert.ok(!edgeGeometry(corner, turn, 0).valid);
turn.autoGrow = 20;
const adjusted = edgeGeometry(corner, turn, 0);
assert.ok(adjusted.valid && adjusted.adjusted && adjusted.warnings.length);
assert.equal(turn.cornerRadius, 2);
assert.deepEqual(turn.trackIds, originalIds);
assert.deepEqual(turn.portSigns, originalPorts);
for (const g of geometryReport(geometryFixture()))
  for (const path of g.paths) {
    const st = geometryFixture().layout.stations.find(
      (s) =>
        s.id ===
        (path.part === "start"
          ? g.routeId === "turn"
            ? "a"
            : g.routeId === "rotated"
              ? "c"
              : g.routeId === "split"
                ? "e"
                : "g"
          : g.routeId === "turn"
            ? "b"
            : g.routeId === "rotated"
              ? "d"
              : g.routeId === "split"
                ? "f"
                : "h"),
    );
    if (path.part === "core") continue;
    const endpoint =
        path.part === "start" ? path.samples[0] : path.samples.at(-1),
      centres = symbolCenters(geometryFixture(), st);
    assert.ok(
      Math.min(
        ...centres.map((c) => Math.hypot(c.x - endpoint.x, c.y - endpoint.y)),
      ) >=
        st.ringOuter / 2 - 1e-4,
      "connector is trimmed to ring boundary",
    );
  }
console.log(
  "Board Studio v0.2: bounded circular 90-degree fillet, visible limited auto-adjustment, no identity swap, and ring-boundary clipping PASS",
);
