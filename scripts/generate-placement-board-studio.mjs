import { writeFile } from "node:fs/promises";
import {
  createProject,
  parseProject,
  serialize,
  svg,
} from "../web/board-studio/model.mjs";
import { stationTemplate } from "../web/board-studio/stations.mjs";
import { builtInSymbols } from "../web/board-studio/symbols.mjs";
import {
  newProfile,
  newSegment,
  ledPositions,
} from "../web/board-studio/led-layout.mjs";
import { stationPlacement } from "../web/board-studio/placement.mjs";
import { mechanicalCheck } from "../web/board-studio/bindings.mjs";
let p = createProject(false);
p.id = "two-strip-stations-v06";
p.title = "To LED-striper · felles stasjon og dobbelstasjon";
const profile = newProfile();
profile.id = "two-strip-profile";
p.ledLayout.profiles.push(profile);
p.ledLayout.segments = [
  newSegment(p, profile.id, {
    id: "demo-strip-A",
    name: "Stripe A · retning sentrum",
    x: 55,
    y: 100,
    count: 16,
    length: 160,
    startIndex: 10,
    chainId: "A",
  }),
  newSegment(p, profile.id, {
    id: "demo-strip-B",
    name: "Stripe B · retning fra sentrum",
    number: 2,
    x: 55,
    y: 140,
    count: 16,
    length: 160,
    startIndex: 100,
    direction: -1,
    chainId: "B",
  }),
];
const base = createProject(true),
  records = builtInSymbols(stationTemplate(base, base.layout.stations[0]));
for (const [id, name, mode, slotA, slotB] of [
  ["shared-stop", "Felles holdeplass", "common", 3, 3],
  ["double-stop", "Dobbel retning", "double", 8, 10],
  ["single-stop", "Enkeltstopp", "normal", 12, null],
]) {
  const a = ledPositions(p, p.ledLayout.segments[0])[slotA],
    b = slotB === null ? null : ledPositions(p, p.ledLayout.segments[1])[slotB];
  const result = stationPlacement(p, {
    template: records[mode === "normal" ? 0 : 1].template,
    id,
    point: b ?? a,
    mode,
    snap: "required",
    zoom: 3,
    ...(b ? { first: { segmentId: a.segmentId, ledId: a.id } } : {}),
  });
  if (!result.valid) throw Error(result.reason);
  p = result.project;
  const s = p.layout.stations.at(-1);
  s.name = name;
  s.label.dx = 10;
  s.label.dy = 0;
  s.label.anchor = "start";
}
p.layers.leds.visible = true;
p.layers.strips.visible = true;
p.layers.holes.visible = true;
p.layers.bindings.visible = true;
p = parseProject(p);
if (mechanicalCheck(p).length) throw Error(JSON.stringify(mechanicalCheck(p)));
const root = new URL("../docs/board-studio/examples/", import.meta.url);
await writeFile(new URL("two-strip-stations-v06.json", root), serialize(p));
await writeFile(new URL("two-strip-stations-v06.svg", root), svg(p));
console.log(
  "Placement example: 3 logical stations, 5 independent physical LED bindings, opposite LED indexing, exact mm vectors and JSON",
);
