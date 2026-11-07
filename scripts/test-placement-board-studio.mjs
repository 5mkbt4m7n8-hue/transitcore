import assert from "node:assert/strict";
import {
  placementFixture,
  placementSymbols,
} from "./fixtures/board-studio-placement.mjs";
import {
  stationPlacement,
  placementTemplate,
  nearbyLeds,
  ledKey,
  rotateStation,
  moveBoundPair,
  rotationChanges,
} from "../web/board-studio/placement.mjs";
import { symbolCenters } from "../web/board-studio/geometry.mjs";
import { ledPositions } from "../web/board-studio/led-layout.mjs";
import {
  parseProject,
  serialize,
  History,
  stationMarkup,
  svg,
} from "../web/board-studio/model.mjs";
import {
  stationTemplate,
  fromTemplate,
} from "../web/board-studio/stations.mjs";
import {
  prepareBindings,
  physicalChanges,
  mechanicalCheck,
  bindPoint,
} from "../web/board-studio/bindings.mjs";
const p = placementFixture(),
  before = serialize(p),
  symbols = placementSymbols(),
  single = symbols[0].template,
  double = symbols[1].template;
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
for (const record of symbols)
  for (const rotation of [0, 90, 180, 270])
    for (const anchorIndex of [null, 0]) {
      const result = stationPlacement(p, {
        template: record.template,
        id: `test-${record.id}`,
        point: { x: 180.123, y: 240.456 },
        rotation,
        snap: "off",
        anchorIndex,
      });
      assert.equal(result.valid, true);
      assert.equal(result.station.points, record.template.appearance.points);
      const committed = parseProject(prepareBindings(p, result.project)),
        s = committed.layout.stations[0];
      assert.deepEqual(
        symbolCenters(committed, s),
        symbolCenters(result.project, result.station),
      );
      assert.deepEqual(s.holes, result.station.holes);
      if (anchorIndex === 0) {
        near(s.ringCenters[0].x, 180.123);
        near(s.ringCenters[0].y, 240.456);
      }
      for (const layer of ["rings", "capsules", "names", "holes"])
        assert.equal(
          stationMarkup(s, layer, committed),
          stationMarkup(result.station, layer, result.project),
        );
      assert.equal(s.source, null);
      assert.equal(committed.ledLayout.bindings.length, 0);
    }
assert.equal(serialize(p), before);
for (const zoom of [0.25, 1, 3.5, 8]) {
  const led = ledPositions(p, p.ledLayout.segments[0])[4],
    result = stationPlacement(p, {
      template: single,
      id: "zoom",
      point: { x: led.x, y: led.y + 3 / zoom },
      zoom,
      snap: "required",
    });
  assert.equal(result.valid, true);
  assert.equal(result.targets[0].id, led.id);
  near(result.station.holes[0].x, led.x);
  assert.deepEqual(
    symbolCenters(
      parseProject(prepareBindings(p, result.project)),
      result.station,
    ),
    symbolCenters(result.project, result.station),
  );
}
for (const mode of ["common", "double"])
  for (const angles of [
    [0, 0],
    [45, 45],
    [0, 7],
    [17, 22],
    [90, 90],
  ]) {
    const base = placementFixture({ angleA: angles[0], angleB: angles[1] }),
      a = ledPositions(base, base.ledLayout.segments[0])[3],
      b = ledPositions(base, base.ledLayout.segments[1])[5];
    const first = stationPlacement(base, {
      template: double,
      id: "pair",
      point: a,
      mode,
      snap: "required",
      zoom: 3,
    });
    assert.equal(first.action, "anchor");
    assert.equal(base.layout.stations.length, 0);
    const result = stationPlacement(base, {
      template: double,
      id: "pair",
      point: b,
      mode,
      snap: "required",
      zoom: 3,
      first: { segmentId: a.segmentId, ledId: a.id },
    });
    assert.equal(result.action, "place");
    assert.equal(result.targets.length, 2);
    assert.equal(result.project.layout.stations.length, 1);
    assert.equal(result.project.ledLayout.bindings.length, 2);
    const q = parseProject(prepareBindings(base, result.project)),
      s = q.layout.stations[0];
    for (let i = 0; i < 2; i++)
      for (const axis of ["x", "y"]) {
        near(s.holes[i][axis], [a, b][i][axis]);
        near(symbolCenters(q, s)[i][axis], [a, b][i][axis]);
      }
    assert.equal(q.ledLayout.bindings[1].ledId, b.id);
    assert.equal(b.index, 110);
    assert.deepEqual(q.ledLayout.segments, base.ledLayout.segments);
    for (const angle of [0, 90, 180, 270]) {
      const r = rotateStation(q, s.id, angle);
      assert.deepEqual(r.layout.stations[0].holes, s.holes);
      assert.deepEqual(r.ledLayout, q.ledLayout);
      assert.equal(r.layout.stations[0].markerAngle, angle);
    }
    const rotated = rotateStation(q, s.id, 90);
    assert.deepEqual(rotated.layout.stations[0].holes, s.holes);
    assert.deepEqual(
      symbolCenters(rotated, rotated.layout.stations[0]),
      symbolCenters(q, s),
    );
    assert.deepEqual(rotated.ledLayout, q.ledLayout);
    assert.equal(rotated.layout.stations[0].markerAngle, 90);
    assert.deepEqual(rotated.layout.stations[0].label, s.label);
    const round = parseProject(serialize(rotated));
    assert.deepEqual(round, rotated);
    assert.match(svg(round), /data-ring-point="1"/);
    const history = new History(base);
    history.commit(q);
    history.undo();
    assert.equal(history.value.layout.stations.length, 0);
    history.redo();
    assert.deepEqual(history.value.ledLayout.bindings, q.ledLayout.bindings);
  }
// Explicit candidate choice resolves physically overlapping capture areas.
const close = placementFixture();
Object.assign(close.ledLayout.segments[1], { x: 55, y: 100 });
const a = ledPositions(close, close.ledLayout.segments[0])[4];
let result = stationPlacement(close, {
  template: single,
  id: "ambiguous",
  point: a,
  snap: "required",
  zoom: 2,
});
assert.equal(result.valid, false);
assert.match(result.reason, /Flere LED/);
assert.ok(result.candidates.length >= 2);
result = stationPlacement(close, {
  template: single,
  id: "chosen",
  point: a,
  snap: "required",
  zoom: 2,
  preferredLed: ledKey({ ...a, segmentId: "strip-B", id: "strip-B:led:4" }),
});
assert.equal(result.valid, true);
assert.equal(result.project.ledLayout.bindings[0].segmentId, "strip-B");
const occupied = stationPlacement(result.project, {
  template: single,
  id: "occupied",
  point: a,
  snap: "required",
  zoom: 2,
  preferredLed: "strip-B|strip-B:led:4",
});
assert.equal(occupied.valid, false);
assert.equal(result.project.layout.stations.length, 1);
const free = stationPlacement(p, {
  template: double,
  id: "free",
  point: { x: 105.123, y: 100.456 },
  snap: "bind",
  suspended: true,
});
assert.equal(free.valid, true);
assert.equal(free.targets.length, 0);
assert.equal(free.project.ledLayout.bindings.length, 0);
assert.equal(
  stationPlacement(p, {
    template: single,
    id: "required",
    point: { x: 280, y: 350 },
    snap: "required",
  }).valid,
  false,
);
const locked = structuredClone(p);
locked.layers.holes.locked = true;
assert.equal(
  stationPlacement(locked, {
    template: single,
    id: "locked",
    point: { x: 200, y: 200 },
    snap: "off",
  }).valid,
  false,
);
const base = placementFixture(),
  la = ledPositions(base, base.ledLayout.segments[0]),
  lb = ledPositions(base, base.ledLayout.segments[1]);
const pair = stationPlacement(base, {
  template: double,
  id: "move-pair",
  point: lb[3],
  first: { segmentId: la[3].segmentId, ledId: la[3].id },
  mode: "double",
  zoom: 3,
}).project;
const moved = moveBoundPair(pair, "move-pair", la[5], 3);
assert.equal(
  moved.ledLayout.bindings.find((b) => b.pointIndex === 0).ledId,
  la[5].id,
);
assert.equal(
  moved.ledLayout.bindings.find((b) => b.pointIndex === 1).ledId,
  lb[5].id,
);
assert.equal(physicalChanges(pair, moved).length, 2);
assert.deepEqual(moved.ledLayout.segments, pair.ledLayout.segments);
assert.equal(mechanicalCheck(moved).length, 0);
const copied = fromTemplate(
  stationTemplate(moved, moved.layout.stations[0]),
  { x: 150, y: 250 },
  "copied",
);
assert.equal(copied.symbolKind, "double-strip");
assert.equal(copied.source, null);
assert.ok(!("ledId" in copied));
const unbound = stationPlacement(p, {
  template: double,
  id: "unbound-rotation",
  point: { x: 200, y: 250 },
  snap: "off",
}).project;
const turn = rotateStation(unbound, "unbound-rotation", 90, { pointIndex: 0 }),
  us = unbound.layout.stations[0],
  ts = turn.layout.stations[0];
near(ts.holes[0].x, us.holes[0].x);
near(ts.holes[0].y, us.holes[0].y);
near(ts.holes[1].x, us.holes[0].x);
near(ts.holes[1].y, us.holes[0].y + 10);
near(ts.x + ts.label.dx, us.x + us.label.dx);
near(ts.y + ts.label.dy, us.y + us.label.dy);
assert.equal(rotationChanges(unbound, turn).length, 1);
assert.equal(mechanicalCheck(turn).length, 0);
const anchorLed = ledPositions(p, p.ledLayout.segments[0])[4],
  anchored = stationPlacement(p, {
    template: double,
    id: "point-B-anchor",
    point: anchorLed,
    anchorIndex: 1,
    rotation: 90,
    snap: "required",
    zoom: 3,
  });
assert.equal(anchored.valid, true);
near(anchored.station.holes[1].x, anchorLed.x);
near(anchored.station.holes[1].y, anchorLed.y);
assert.equal(anchored.project.ledLayout.bindings[0].pointIndex, 1);
console.log(
  "Placement model PASS: 18 symbols × 4 rotations × centre/point anchors, identical preview/commit mm/SVG, snap at four zooms, two-strip stations at five orientation pairs and reversed indexing, ambiguity/occupancy/locks, fixed direct-bound rotation, pair relocation/physical deltas, copy isolation and history/JSON",
);
