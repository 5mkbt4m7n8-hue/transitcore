import assert from "node:assert/strict";
import { portFixture } from "./fixtures/board-studio-v032.mjs";
import { ledFixture } from "./fixtures/board-studio-v031.mjs";
import {
  connectionPreview,
  nextRapidStop,
  placeRapidStop,
  boardChecks,
} from "../web/board-studio/workflows.mjs";
import { connectPorts } from "../web/board-studio/connections.mjs";
import { edgeGeometry, symbolCenters } from "../web/board-studio/geometry.mjs";
import {
  parseProject,
  serialize,
  History,
} from "../web/board-studio/model.mjs";
import { stationTemplate } from "../web/board-studio/stations.mjs";
import { builtInSymbols } from "../web/board-studio/symbols.mjs";
const original = portFixture(),
  snapshot = structuredClone(original),
  start = { stationId: "junction", portId: "pair:left" },
  end = { stationId: "branch", portId: "pair:left" },
  preview = connectionPreview(original, start, end);
assert.ok(preview.valid);
assert.deepEqual(original, snapshot);
const result = connectPorts(original, start, end);
assert.deepEqual(
  preview.paths.map((p) => p.d),
  edgeGeometry(
    result.project,
    result.project.layout.routes.at(-1),
    0,
  ).paths.map((p) => p.d),
);
assert.equal(connectionPreview(original, start, start).valid, false);
assert.deepEqual(original, snapshot);
const p = ledFixture(45),
  template = builtInSymbols(stationTemplate(p, p.layout.stations[0]))[1]
    .template;
p.layout.stations = [];
p.ledLayout.segments[0].startIndex = 100;
p.ledLayout.segments[0].direction = -1;
const config = {
    segmentId: "strip",
    template,
    startSlot: 0,
    step: 3,
    namePrefix: "Holdeplass",
  },
  history = new History(p);
let q = p;
for (let i = 0; i < 4; i++) {
  const candidate = nextRapidStop(q, config);
  assert.equal(candidate.startSlot, i * 3);
  const placed = placeRapidStop(q, config);
  q = parseProject(placed.project);
  history.commit(q);
  const s = q.layout.stations.at(-1);
  assert.equal(s.source, null);
  for (let j = 0; j < s.points; j++) {
    const ring = symbolCenters(q, s)[j],
      led = candidate.leds[j];
    assert.equal(ring.x, led.x);
    assert.equal(ring.y, led.y);
    assert.equal(s.holes[j].x, led.x);
    assert.equal(s.holes[j].y, led.y);
    assert.equal(
      q.ledLayout.bindings.find(
        (b) => b.stationId === s.id && b.pointIndex === j,
      ).ledId,
      led.id,
    );
  }
}
assert.equal(nextRapidStop(q, config), null);
assert.equal(q.layout.stations.length, 4);
assert.equal(new Set(q.layout.stations.map((s) => s.id)).size, 4);
assert.equal(new Set(q.ledLayout.bindings.map((b) => b.ledId)).size, 8);
assert.equal(nextRapidStop(history.undo(), config).startSlot, 9);
assert.deepEqual(history.redo(), q);
assert.deepEqual(parseProject(serialize(q)), q);
assert.deepEqual(p.layout.stations, []);
for (const record of builtInSymbols(template)) {
  const board = ledFixture(90);
  board.layout.stations = [];
  board.ledLayout.profiles[0].pitch = 9.7;
  board.ledLayout.profiles[0].firstOffset = 4.8;
  const settings = { ...config, template: record.template };
  const placed = placeRapidStop(board, settings),
    station = placed.project.layout.stations[0];
  assert.equal(station.points, record.template.appearance.points);
  assert.equal(placed.project.ledLayout.bindings.length, station.points);
  assert.equal(station.ringOuter, record.template.appearance.ringOuter);
  assert.equal(station.holeDiameter, record.template.appearance.holeDiameter);
}
const custom = { ...config, indices: [111, 107, 102] };
assert.equal(nextRapidStop(p, custom).leds[0].index, 111);
assert.equal(
  nextRapidStop(placeRapidStop(p, custom).project, custom).leds[0].index,
  107,
);
assert.throws(
  () => nextRapidStop(p, { ...custom, indices: [999] }),
  /finnes ikke/,
);
assert.throws(
  () => nextRapidStop(p, { ...custom, indices: [111, 111] }),
  /forskjellige/,
);
const locked = structuredClone(p);
locked.layers.bindings.locked = true;
assert.throws(() => placeRapidStop(locked, config), /Lås opp/);
assert.throws(() => placeRapidStop(q, config), /Ingen flere/);
const physical = ledFixture(),
  s = physical.layout.stations[0];
s.name = "Lik navn";
s.holes[0].x = -5;
const other = structuredClone(s);
other.id = "other";
other.name = s.name;
other.holes = other.holes.map((h, i) => ({ ...h, id: "other:" + i }));
physical.layout.stations.push(other);
const checks = boardChecks(physical);
assert.ok(
  checks.some((i) => i.category === "unbound" && i.target.id === "other"),
);
assert.ok(
  checks.some((i) => i.message.includes("utenfor") && i.target.id === s.id),
);
assert.ok(
  checks
    .filter((i) => i.message.includes("Overlappende"))
    .every((i) => i.target.stationIds.includes(s.id)),
);
assert.ok(checks.every((i) => i.target));
const malformed = structuredClone(original);
malformed.layout.routes[0].curveStyle = "straight";
malformed.layout.routes[0].anchors[0].start = "pair:right";
assert.ok(
  boardChecks(malformed).some(
    (i) => i.category === "geometry" && i.target.kind === "route",
  ),
);
console.log(
  "Workflows model PASS: immutable exact connection preview/rejection; repeated double stops on 45° physical strip, intervals and reversed custom indices, unique identities, no LED reuse, locks/exhaustion, undo/redo/JSON; structured physical/geometry/unbound findings including duplicate station names",
);
