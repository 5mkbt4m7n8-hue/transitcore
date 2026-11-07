import { writeFile } from "node:fs/promises";
import {
  createProject,
  parseProject,
  serialize,
  svg,
} from "../web/board-studio/model.mjs";
import {
  fromTemplate,
  stationTemplate,
} from "../web/board-studio/stations.mjs";
import { builtInSymbols } from "../web/board-studio/symbols.mjs";
import {
  editStation,
  editGraphicPoint,
} from "../web/board-studio/station-edit.mjs";
import { stationPlacement } from "../web/board-studio/placement.mjs";
import {
  newProfile,
  newSegment,
  ledPositions,
} from "../web/board-studio/led-layout.mjs";
import { productionReport } from "../web/board-studio/production.mjs";
const src = createProject(),
  template = builtInSymbols(stationTemplate(src, src.layout.stations[0]))[1]
    .template;
let p = createProject(false);
p.id = "free-station-design-v07";
p.title = "Fri stasjonsdesign · tre punkter og kompakt LED-stasjon";
p.layout.stations.push(fromTemplate(template, { x: 90, y: 90 }, "free-three"));
p = editStation(p, "free-three", { count: 3 });
for (const [i, c] of [
  { x: 75, y: 90 },
  { x: 90, y: 84, ringOuter: 4, ringInner: 3, stroke: 0.1 },
  { x: 105, y: 90 },
].entries())
  p = editGraphicPoint(p, "free-three", i, c);
let s = p.layout.stations[0];
s.name = "Tre punkter";
s.holes.forEach((h) => (h.enabled = false));
Object.assign(s.label, { dx: 0, dy: -12, anchor: "middle" });
const profile = newProfile();
profile.id = "profile-5-mm";
p.ledLayout.profiles.push(profile);
p.ledLayout.segments = [
  newSegment(p, profile.id, {
    id: "strip-A",
    name: "A · 5 mm bred",
    x: 55,
    y: 200,
    count: 16,
    length: 160,
    chainId: "A",
  }),
  newSegment(p, profile.id, {
    id: "strip-B",
    name: "B · kant mot kant",
    number: 2,
    x: 55,
    y: 205,
    count: 16,
    length: 160,
    direction: -1,
    startIndex: 100,
    chainId: "B",
  }),
];
const a = ledPositions(p, p.ledLayout.segments[0])[4],
  b = ledPositions(p, p.ledLayout.segments[1])[4],
  placed = stationPlacement(p, {
    template,
    id: "compact-two",
    point: b,
    mode: "common",
    snap: "required",
    zoom: 3,
    first: { segmentId: a.segmentId, ledId: a.id },
  });
if (!placed.valid) throw Error(placed.reason);
p = placed.project;
s = p.layout.stations.at(-1);
Object.assign(s, {
  name: "Kompakt",
  ringOuter: 3.8,
  ringInner: 2.8,
  stroke: 0.1,
  capsulePadding: 0.2,
});
Object.assign(s.label, { dx: 8, dy: 0, anchor: "start" });
p.stationTemplate = stationTemplate(p, p.layout.stations[0]);
p.library.templates.push({
  id: "free-three-template",
  name: "Tre punkter · liten midtring",
  category: "Trondheim buss",
  template: structuredClone(p.stationTemplate),
});
p.layers.leds.visible = true;
p.layers.strips.visible = true;
p.layers.holes.visible = true;
p.layers.bindings.visible = true;
p = parseProject(p);
if (!productionReport(p).allowed)
  throw Error(JSON.stringify(productionReport(p).errors));
const root = new URL("../docs/board-studio/examples/", import.meta.url);
await writeFile(new URL("free-station-design-v07.json", root), serialize(p));
await writeFile(new URL("free-station-design-v07.svg", root), svg(p));
console.log(
  "v0.7 example: format v4, custom 6/4/6 mm triple, 3 inactive hole slots, compact 3.8 mm rings across touching 5 mm strips, 2 bound physical holes and reusable style template",
);
