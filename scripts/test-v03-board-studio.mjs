import assert from "node:assert/strict";
import {
  createProject,
  parseProject,
  serialize,
  History,
} from "../web/board-studio/model.mjs";
import {
  stationTemplate,
  fromTemplate,
} from "../web/board-studio/stations.mjs";
import {
  builtInSymbols,
  applyVisualStyle,
  symbolBundle,
  importSymbolBundle,
} from "../web/board-studio/symbols.mjs";
const p = createProject(),
  base = stationTemplate(p, p.layout.stations[0]),
  records = builtInSymbols(base);
assert.equal(records.length, 18);
assert.equal(new Set(records.map((r) => r.category)).size, 3);
for (const r of records) {
  const s = fromTemplate(r.template, { x: 50, y: 60 }),
    q = createProject(false);
  q.layout.stations = [s];
  const valid = parseProject(q);
  assert.equal(valid.layout.stations[0].holes.length, s.points);
  assert.equal(s.source, null);
}
const saved = {
  id: "own",
  name: "Min kapsel",
  category: "Trondheim buss",
  template: records[2].template,
};
p.library.templates = [saved];
const round = parseProject(serialize(p));
assert.deepEqual(round.library, p.library);
const imported = importSymbolBundle(symbolBundle([saved]));
assert.notEqual(imported[0].id, saved.id);
assert.deepEqual(imported[0].template, saved.template);
const before = structuredClone(p.layout.stations.map((s) => s.holes)),
  changed = applyVisualStyle(
    p,
    p.layout.stations.map((s) => s.id),
    { ringOuter: 7, stroke: 0.3 },
  );
assert.ok(changed.layout.stations.every((s) => s.ringOuter === 7));
assert.deepEqual(
  changed.layout.stations.map((s) => s.holes),
  before,
);
const history = new History(p);
history.commit(changed);
assert.deepEqual(history.undo(), p);
assert.deepEqual(history.redo(), changed);
const legacy = structuredClone(p);
legacy.version = 2;
delete legacy.library;
for (const s of legacy.layout.stations)
  for (const k of [
    "capsuleType",
    "capsuleExtraWidth",
    "capsuleExtraHeight",
    "symbolKind",
    "allowShared",
    "transitionLength",
  ])
    delete s[k];
const migrated = parseProject(legacy);
assert.equal(migrated.version, 4);
assert.deepEqual(
  migrated.layout.stations.map((s) => s.holes),
  before,
);
console.log(
  "v0.3 A model PASS: 18 symbols/3 categories, user template import/export, unique identities, multi-style update with fixed holes, history and v2 migration",
);
const { newProfile, newSegment, ledPositions, validateLedLayout } =
  await import("../web/board-studio/led-layout.mjs");
const ledProject = createProject(false),
  profile = newProfile();
ledProject.ledLayout.profiles.push(profile);
const segment = newSegment(ledProject, profile.id, {
  x: 20,
  y: 30,
  count: 4,
  length: 40,
});
ledProject.ledLayout.segments.push(segment);
let leds = ledPositions(ledProject, segment);
assert.deepEqual(
  leds.map((l) => [l.x, l.y]),
  [
    [25, 30],
    [35, 30],
    [45, 30],
    [55, 30],
  ],
);
const identities = leds.map((l) => l.id);
segment.angle = 45;
leds = ledPositions(ledProject, segment);
for (let i = 0; i < 4; i++) {
  assert.ok(Math.abs(leds[i].x - (20 + (5 + i * 10) * Math.SQRT1_2)) < 1e-10);
  assert.ok(Math.abs(leds[i].y - (30 + (5 + i * 10) * Math.SQRT1_2)) < 1e-10);
}
profile.pitch = 10.27;
assert.deepEqual(
  ledPositions(ledProject, segment).map((l) => l.id),
  identities,
);
const second = newSegment(ledProject, profile.id, { count: 4 });
ledProject.ledLayout.segments.push(second);
validateLedLayout(ledProject);
second.chainId = segment.chainId;
assert.throws(() => validateLedLayout(ledProject), /Duplisert/);
second.startIndex = 4;
validateLedLayout(ledProject);
assert.deepEqual(parseProject(serialize(ledProject)), ledProject);
console.log(
  "v0.3 B model PASS: 10 mm and measured pitch, 45-degree coordinates, stable physical LED IDs, separate chains and duplicate-index rejection",
);
const {
  bindPoint,
  unbindPoint,
  prepareBindings,
  physicalChanges,
  mechanicalCheck,
  setFrontPoint,
} = await import("../web/board-studio/bindings.mjs");
const { symbolCenters } = await import("../web/board-studio/geometry.mjs");
let bound = createProject(false);
bound.ledLayout.profiles = [newProfile()];
const strip = newSegment(bound, bound.ledLayout.profiles[0].id, {
  count: 8,
  length: 80,
  x: 30,
  y: 70,
});
bound.ledLayout.segments = [strip];
const singleton = records[0].template;
bound.layout.stations = [
  fromTemplate(singleton, { x: 100, y: 120 }, "stationA"),
  fromTemplate(singleton, { x: 160, y: 130 }, "stationB"),
];
const target = ledPositions(bound, strip)[3];
const proposal = bindPoint(bound, {
  stationId: "stationA",
  pointIndex: 0,
  segmentId: strip.id,
  ledId: target.id,
});
assert.equal(physicalChanges(bound, proposal).length, 1);
assert.equal(bound.ledLayout.bindings.length, 0);
bound = proposal;
assert.deepEqual(
  symbolCenters(bound, bound.layout.stations[0]).map(({ x, y }) => ({ x, y })),
  [{ x: target.x, y: target.y }],
);
assert.equal(bound.layout.stations[0].holes[0].x, target.x);
const move = structuredClone(bound);
move.ledLayout.segments[0].x += 5;
const prepared = prepareBindings(bound, move);
assert.equal(physicalChanges(bound, prepared).length, 1);
assert.equal(bound.layout.stations[0].holes[0].x, target.x);
assert.equal(prepared.layout.stations[0].holes[0].x, target.x + 5);
const pitch = structuredClone(bound);
pitch.ledLayout.profiles[0].pitch = 10.2;
const pitched = prepareBindings(bound, pitch);
assert.equal(pitched.ledLayout.bindings[0].ledId, target.id);
assert.ok(
  Math.abs(pitched.layout.stations[0].holes[0].x - (30 + 5 + 3 * 10.2)) < 1e-9,
);
assert.throws(
  () =>
    bindPoint(bound, {
      stationId: "stationB",
      pointIndex: 0,
      segmentId: strip.id,
      ledId: target.id,
    }),
  /allerede/,
);
const shared = bindPoint(bound, {
  stationId: "stationB",
  pointIndex: 0,
  segmentId: strip.id,
  ledId: target.id,
  share: true,
});
assert.ok(shared.ledLayout.bindings.every((b) => b.shared));
assert.ok(
  !mechanicalCheck(shared).some((i) => i.message.includes("Overlappende")),
);
assert.throws(
  () =>
    bindPoint(bound, {
      stationId: "stationA",
      pointIndex: 0,
      segmentId: strip.id,
      ledId: "missing",
    }),
  /finnes/,
);
assert.equal(
  unbindPoint(bound, "stationA", 0).layout.stations[0].holes[0].x,
  target.x,
);
let guide = bindPoint(bound, {
  stationId: "stationB",
  pointIndex: 0,
  segmentId: strip.id,
  ledId: ledPositions(bound, strip)[4].id,
  mode: "lightguide",
});
guide = setFrontPoint(guide, "stationB", 0, {
  holeX: 170,
  holeY: 130,
  ringX: 170,
  ringY: 130,
  diameter: 2.5,
});
const guideMoved = structuredClone(guide);
guideMoved.ledLayout.segments[0].y += 8;
const guidePreview = prepareBindings(guide, guideMoved);
assert.equal(guidePreview.layout.stations[1].holes[0].y, 130);
assert.ok(
  physicalChanges(guide, guidePreview).some((r) => r.name === "Ny stasjon"),
);
assert.deepEqual(parseProject(serialize(guidePreview)), guidePreview);
const corrupt = structuredClone(bound);
corrupt.ledLayout.segments = [];
assert.ok(mechanicalCheck(corrupt).some((i) => i.message.includes("slettet")));
const outside = structuredClone(bound);
outside.ledLayout.segments[0].x = -10;
outside.layout.stations[0].holes[0].x = -2;
assert.ok(mechanicalCheck(outside).some((i) => i.message.includes("utenfor")));
const mismatch = structuredClone(bound);
mismatch.layout.stations[0].holes[0].x += 2;
assert.ok(
  mechanicalCheck(mismatch).some((i) => i.message.includes("sammenfallende")),
);
const { trondheimPrototype } = await import(
  "../web/board-studio/prototype.mjs"
);
const demo = trondheimPrototype();
assert.equal(demo.layout.stations.length, 12);
assert.equal(demo.ledLayout.segments.length, 3);
assert.equal(demo.ledLayout.bindings.length, 18);
assert.deepEqual(mechanicalCheck(demo), []);
assert.deepEqual(parseProject(serialize(demo)), demo);
console.log(
  "v0.3 C model PASS: direct concentric binding, physical change detection, identity through pitch/movement, explicit sharing/conflict rejection, lightguide offsets, orphan/boundary/alignment diagnostics and 12-stop/3-segment Trondheim prototype",
);
const colliding = structuredClone(bound);
colliding.layout.stations[1].holes[0] = {
  ...colliding.layout.stations[1].holes[0],
  x: target.x + 0.1,
  y: target.y,
};
assert.ok(
  mechanicalCheck(colliding).some((i) => i.message.includes("Overlappende")),
);
colliding.layout.stations[1].holes[0].x = target.x + 3;
assert.ok(
  mechanicalCheck(colliding).some((i) => i.message.includes("nærmere")),
);
const incompatible = structuredClone(bound);
incompatible.ledLayout.profiles[0].width = 1;
assert.ok(
  mechanicalCheck(incompatible).some((i) => i.message.includes("LED-hus")),
);
const boundMass = applyVisualStyle(
  demo,
  demo.layout.stations.map((s) => s.id),
  { ringOuter: 7 },
);
assert.deepEqual(
  boundMass.layout.stations.map((s) => s.holes),
  demo.layout.stations.map((s) => s.holes),
);
assert.deepEqual(boundMass.ledLayout, demo.ledLayout);
assert.deepEqual(mechanicalCheck(boundMass), []);
const { readFile } = await import("node:fs/promises");
const oldFile = JSON.parse(
    await readFile(
      new URL(
        "../docs/board-studio/examples/grakallbanen-300x400.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ),
  upgraded = parseProject(oldFile);
assert.equal(upgraded.version, 4);
assert.deepEqual(upgraded.network, oldFile.network);
assert.deepEqual(upgraded.ledLayout, oldFile.ledLayout);
for (let i = 0; i < oldFile.layout.stations.length; i++) {
  assert.equal(upgraded.layout.stations[i].id, oldFile.layout.stations[i].id);
  assert.deepEqual(
    upgraded.layout.stations[i].holes,
    oldFile.layout.stations[i].holes,
  );
}
const unusual = structuredClone(demo.layout.stations[0]);
unusual.holes[0].diameter = 2.8;
const holeStyle = stationTemplate(
  { ...demo, layout: { ...demo.layout, stations: [unusual] } },
  unusual,
);
assert.equal(fromTemplate(holeStyle, { x: 200, y: 50 }).holes[0].diameter, 2.8);
