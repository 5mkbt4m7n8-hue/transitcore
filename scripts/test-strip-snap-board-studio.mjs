import assert from "node:assert/strict";
import { ledFixture } from "./fixtures/board-studio-v031.mjs";
import { snapStrip, alignStripHoles } from "../web/board-studio/strip-snap.mjs";
import { ledPositions, newSegment } from "../web/board-studio/led-layout.mjs";
import {
  parseProject,
  serialize,
  History,
} from "../web/board-studio/model.mjs";
import {
  bindPoint,
  physicalChanges,
  prepareBindings,
} from "../web/board-studio/bindings.mjs";
import { gridSpec } from "../web/board-studio/editing.mjs";
for (const angle of [0, 45, 90]) {
  const p = ledFixture(angle),
    profile = p.ledLayout.profiles[0],
    source = p.ledLayout.segments[0],
    rad = (angle * Math.PI) / 180,
    u = { x: Math.cos(rad), y: Math.sin(rad) },
    s = p.layout.stations[0];
  s.x = 100;
  s.y = 150;
  s.symbolAngle = angle;
  s.holes.forEach((h, i) => {
    h.x = s.x + u.x * (i - 0.5) * 10;
    h.y = s.y + u.y * (i - 0.5) * 10;
  });
  p.ledLayout.segments = [];
  const exact = {
    ...source,
    x: s.holes[0].x - u.x * profile.firstOffset,
    y: s.holes[0].y - u.y * profile.firstOffset,
  };
  for (const zoom of [0.5, 2, 5]) {
    const moving = { ...exact, x: exact.x + 2 / zoom, y: exact.y + 1 / zoom },
      snap = snapStrip(p, moving, zoom);
    assert.equal(snap.guide.matched, 2);
    assert.ok(Math.abs(snap.segment.x - exact.x) < 1e-8);
    assert.ok(Math.abs(snap.segment.y - exact.y) < 1e-8);
    assert.deepEqual(
      snapStrip(p, moving, zoom, { enabled: false }).segment,
      moving,
    );
  }
  const ref = { ...source, x: 40, y: 60 };
  p.layout.stations = [];
  p.ledLayout.segments = [ref];
  const n = { x: -u.y, y: u.x },
    side = newSegment(p, profile.id, {
      angle,
      count: 12,
      length: 120,
      x: ref.x + n.x * 5 + 1,
      y: ref.y + n.y * 5 + 1,
    });
  const snap = snapStrip(p, side, 2);
  assert.equal(snap.guide.kind, "side");
  assert.ok(Math.abs(snap.segment.x - (ref.x + n.x * 5)) < 1e-8);
  assert.ok(Math.abs(snap.segment.y - (ref.y + n.y * 5)) < 1e-8);
  assert.notEqual(snap.segment.chainId, ref.chainId);
  const end = {
    ...side,
    x: ref.x + u.x * ref.length + 1,
    y: ref.y + u.y * ref.length + 1,
  };
  const joined = snapStrip(p, end, 2);
  assert.equal(joined.guide.kind, "end");
  assert.ok(Math.abs(joined.segment.x - ref.x - u.x * ref.length) < 1e-8);
  assert.ok(Math.abs(joined.segment.y - ref.y - u.y * ref.length) < 1e-8);
}
const rotated = ledFixture(90),
  oldHoles = rotated.layout.stations[0].holes;
oldHoles[0].x = 70;
oldHoles[0].y = 140;
oldHoles[1].x = 80;
oldHoles[1].y = 140;
const snapshot = structuredClone(rotated),
  proposal = snapStrip(
    rotated,
    { ...rotated.ledLayout.segments[0], x: 74, y: 129 },
    2,
  );
assert.equal(proposal.guide.alignHoles.length, 2);
const aligned = alignStripHoles(rotated, proposal.guide);
assert.equal(aligned.changes.length, 2);
assert.deepEqual(rotated, snapshot);
assert.equal(aligned.project.layout.stations[0].holes[0].x, 75);
assert.equal(aligned.project.layout.stations[0].holes[0].y, 135);
assert.equal(aligned.project.layout.stations[0].holes[0].id, oldHoles[0].id);
const p = ledFixture(),
  s = p.ledLayout.segments[0],
  led = ledPositions(p, s)[2],
  bound = bindPoint(p, {
    stationId: "double",
    pointIndex: 0,
    segmentId: s.id,
    ledId: led.id,
  }),
  q = structuredClone(bound);
q.ledLayout.segments[0].x += 4;
const proposed = prepareBindings(bound, q);
assert.ok(physicalChanges(bound, proposed).length > 0);
const h = new History(bound);
h.commit(proposed);
assert.deepEqual(h.undo(), bound);
assert.deepEqual(h.redo(), proposed);
assert.deepEqual(parseProject(serialize(proposed)), proposed);
for (const zoom of [0.05, 0.5, 2, 10]) {
  const spec = gridSpec(5, 10, "normal", zoom);
  assert.equal(spec.fine, spec.minor / 2);
  assert.ok(spec.fine * zoom >= 3.5);
}
console.log(
  "Strip snap model PASS: exact double-hole alignment at 0/45/90°, constant screen tolerance, parallel edge docking and LED rows, physical end joins, independent chains, off switch, physical move approval/history/persistence and third grid level",
);
