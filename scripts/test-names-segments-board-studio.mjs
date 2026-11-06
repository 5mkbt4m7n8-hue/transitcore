import assert from "node:assert/strict";
import {
  createProject,
  parseProject,
  serialize,
  History,
  stationMarkup,
} from "../web/board-studio/model.mjs";
import {
  stationTemplate,
  fromTemplate,
} from "../web/board-studio/stations.mjs";
import { editStation } from "../web/board-studio/station-edit.mjs";
import {
  DIRECTIONS,
  labelLayout,
  visibleBounds,
  editLabels,
} from "../web/board-studio/label-layout.mjs";
import {
  newProfile,
  newSegment,
  segmentLength,
  inheritSegment,
  ledPositions,
} from "../web/board-studio/led-layout.mjs";
import { bindPoint, prepareBindings } from "../web/board-studio/bindings.mjs";
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
let p = createProject(),
  t = stationTemplate(p, p.layout.stations[0]);
p.layout.routes = [];
p.layout.stations = Array.from({ length: 30 }, (_, i) => ({
  ...fromTemplate(t, { x: 30 + (i % 5) * 50, y: 30 + Math.floor(i / 5) * 50 }),
  name: i % 2 ? "Et meget langt stasjonsnavn" : "A",
}));
p = parseProject(p);
const hardware = p.layout.stations.map((s) => ({
  id: s.id,
  name: s.name,
  holes: s.holes,
  centers: s.ringCenters,
}));
let q = parseProject(
  editLabels(
    p,
    p.layout.stations.map((s) => s.id),
    { font: "Arial", size: 4, weight: 700, color: "#224455" },
  ),
);
assert.ok(
  q.layout.stations.every(
    (s) =>
      s.label.font === "Arial" && s.label.size === 4 && s.label.weight === 700,
  ),
);
assert.deepEqual(
  q.layout.stations.map((s) => ({
    id: s.id,
    name: s.name,
    holes: s.holes,
    centers: s.ringCenters,
  })),
  hardware,
);
for (const count of [1, 2, 3])
  for (const name of ["A", "Et meget langt stasjonsnavn"])
    for (const position of Object.keys(DIRECTIONS))
      for (const angle of [0, 45, 90, 135, 180, 225, 270, 315]) {
        let v = editStation(q, q.layout.stations[0].id, { count });
        const s = v.layout.stations[0];
        s.name = name;
        Object.assign(s.label, { position, angle, gap: 3, dx: 0, dy: 0 });
        for (const reference of [
          "all",
          ...Array.from({ length: count }, (_, i) => String(i)),
        ]) {
          s.label.reference = reference;
          const box = visibleBounds(v, s, reference),
            l = labelLayout(v, s),
            [dx, dy] = DIRECTIONS[position],
            gap = dx && dy ? 3 / Math.sqrt(2) : 3;
          if (dx < 0) near(box.x - l.bounds.right, gap);
          if (dx > 0) near(l.bounds.x - box.right, gap);
          if (dy < 0) near(box.y - l.bounds.bottom, gap);
          if (dy > 0) near(l.bounds.y - box.bottom, gap);
          const a = l.anchor;
          s.label.angle = (angle + 45) % 360;
          assert.deepEqual(labelLayout(v, s).anchor, a);
          s.label.angle = angle;
        }
        assert.deepEqual(
          labelLayout(parseProject(serialize(v)), s),
          labelLayout(v, s),
        );
      }
const s = q.layout.stations[0];
Object.assign(s.label, {
  position: "nw",
  reference: "all",
  gap: 5,
  color: "#123456",
});
t = stationTemplate(q, s);
assert.deepEqual(fromTemplate(t, { x: 5, y: 5 }).label, s.label);
const h = new History(q);
h.commit(editLabels(q, [s.id], { size: 7 }));
h.undo();
assert.equal(h.value.layout.stations[0].label.size, 4);
h.redo();
assert.equal(h.value.layout.stations[0].label.size, 7);
let r = newProfile();
p = createProject(false);
p.ledLayout.profiles = [r];
for (const count of [10, 20, 30]) {
  const seg = newSegment(p, r.id, { count });
  assert.equal(seg.length, count * 10);
}
r.firstOffset = 3;
r.endMargin = 7;
let a = newSegment(p, r.id, { count: 10, angle: 45, direction: -1 });
assert.equal(a.length, 100);
a.endMargin = 9;
assert.equal(segmentLength(p, a), 102);
p.ledLayout.segments = [a];
p = parseProject(p);
a = p.ledLayout.segments[0];
const b = inheritSegment(p, a);
assert.notEqual(a.id, b.id);
assert.equal(b.startIndex, 10);
assert.equal(b.chainId, a.chainId);
assert.equal(b.name, "S02");
near(b.x, a.x + Math.cos(Math.PI / 4) * a.length);
p.ledLayout.segments.push(b);
p = parseProject(p);
assert.equal(
  new Set(
    p.ledLayout.segments.flatMap((s) => ledPositions(p, s).map((l) => l.index)),
  ).size,
  20,
);
const oldIds = ledPositions(p, a).map((l) => l.id);
p.ledLayout.profiles[0].pitch = 11;
const shifted = parseProject(p);
assert.deepEqual(
  ledPositions(shifted, shifted.ledLayout.segments[0]).map((l) => l.id),
  oldIds,
);
assert.equal(shifted.ledLayout.segments[0].length, 111);
const legacy = structuredClone(p);
delete legacy.ledLayout.segments[0].lengthMode;
legacy.ledLayout.segments[0].length = 123;
assert.equal(parseProject(legacy).ledLayout.segments[0].length, 123);
const base = createProject();
p.layout.stations = [
  fromTemplate(stationTemplate(base, base.layout.stations[0]), {
    x: 20,
    y: 20,
  }),
];
p.layout.stations[0].points = 1;
p.layout.stations[0].holes = p.layout.stations[0].holes.slice(0, 1);
p = parseProject(p);
p = bindPoint(p, {
  stationId: p.layout.stations[0].id,
  pointIndex: 0,
  segmentId: a.id,
  ledId: oldIds[9],
  mode: "direct",
});
q = structuredClone(p);
q.ledLayout.segments[0].count = 5;
assert.throws(() => parseProject(prepareBindings(p, q)));
assert.ok(stationMarkup(s, "names", h.value).includes("#123456"));
const invalidDefault = structuredClone(p);
invalidDefault.labelDefault = { font: "Arial" };
assert.throws(() => parseProject(invalidDefault), /tekststil/);
console.log(
  "Names/segments model PASS: 30-name atomic style, 1/2/3-point bounds and A/B/all references, 9 directions × 8 rotations × short/long names, stable placement anchor, templates/JSON/history; auto/asymmetric/manual lengths, inherited segments/unique IDs/indices, 45° continuation, stable LED IDs and rejected bound-count reduction",
);
