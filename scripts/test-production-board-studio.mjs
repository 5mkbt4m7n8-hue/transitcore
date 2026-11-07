import assert from "node:assert/strict";
import { trondheimPrototype } from "../web/board-studio/prototype.mjs";
import {
  productionReport,
  productionHoles,
  productionPlan,
  productionPage,
  drillPdf,
  drillSvg,
  graphicsSvg,
  drillCsv,
  machiningSvg,
} from "../web/board-studio/production.mjs";
import { productionSettings } from "../web/board-studio/production-settings.mjs";
import { MM_TO_PT } from "../web/board-studio/pdf-vector.mjs";
import { ledFixture } from "./fixtures/board-studio-v031.mjs";
import { bindPoint } from "../web/board-studio/bindings.mjs";
import {
  parseProject,
  serialize,
  History,
} from "../web/board-studio/model.mjs";
const p = trondheimPrototype(),
  before = structuredClone(p),
  front = productionReport(p),
  back = productionReport(p, { side: "back" });
assert.equal(front.allowed, true);
assert.equal(front.holes.length, 18);
assert.equal(front.unboundCount, 0);
for (let i = 0; i < front.holes.length; i++) {
  assert.equal(back.holes[i].x, 300 - front.holes[i].x);
  assert.equal(back.holes[i].y, front.holes[i].y);
  assert.equal(back.holes[i].diameter, front.holes[i].diameter);
  assert.deepEqual(back.holes[i].references, front.holes[i].references);
}
const plan = productionPlan(p);
assert.equal(plan.pages.length, 4);
assert.deepEqual(
  plan.pages.map((page) => [page.x, page.y]),
  [
    [0, 0],
    [170, 0],
    [0, 257],
    [170, 257],
  ],
);
assert.equal(productionPlan(p, { paper: "a4-landscape" }).pages.length, 6);
const board = productionPlan(p, { paper: "board" });
assert.equal(board.pages.length, 1);
assert.equal(board.pages[0].width, 330);
assert.equal(board.pages[0].height, 430);
assert.throws(() => productionSettings({ margin: 0 }));
assert.throws(() => productionSettings({ overlap: 100 }));
const huge = structuredClone(p);
huge.board.width = 5000;
huge.board.height = 5000;
assert.throws(() => productionPlan(huge), /100/);
const scene = productionPage(p, plan, plan.pages[0]);
assert.ok(
  scene.items
    .filter((i) => i.type === "text")
    .some((i) => i.text.includes("X-kontroll 100 mm")),
);
assert.ok(
  scene.items
    .filter((i) => i.type === "text")
    .some((i) => i.text.includes("Y-kontroll 100 mm")),
);
assert.ok(scene.items.some((i) => i.layer === "registration"));
for (const i of scene.items.filter((i) => i.layer === "notes")) {
  assert.ok(i.x >= 5 && i.y >= 5);
  if (i.x2 !== undefined) assert.ok(i.x2 >= 5 && i.y2 >= 5);
  assert.ok(i.y <= scene.height - 5);
}
const hidden = structuredClone(p);
hidden.layers.holes.visible = false;
hidden.layers.holes.export = false;
assert.equal(productionHoles(hidden).length, 18);
const spacious = productionPlan(p, { margin: 30, overlap: 5 });
assert.equal(spacious.pages.length, 6);
assert.deepEqual(
  spacious.pages.slice(0, 3).map((p) => p.x),
  [0, 145, 290],
);
const small = ledFixture();
small.board.width = 20;
small.board.height = 20;
small.ledLayout = { profiles: [], segments: [], bindings: [] };
Object.assign(small.layout.stations[0], { x: 10, y: 10, symbolAngle: 0 });
small.layout.stations[0].holes.forEach((h, i) =>
  Object.assign(h, { x: 5 + 10 * i, y: 10 }),
);
assert.equal(productionReport(small, { allowUnbound: true }).allowed, true);
const smallPlan = productionPlan(small, { paper: "board" });
assert.equal(smallPlan.pages[0].width, 180);
assert.equal(smallPlan.pages[0].height, 80);
assert.ok(
  productionPage(small, smallPlan, smallPlan.pages[0]).items.some(
    (i) => i.type === "text" && i.text.includes("Y-kontroll 40 mm"),
  ),
);
const pdf = new TextDecoder().decode(drillPdf(p));
assert.ok(pdf.startsWith("%PDF-1.7"));
assert.ok(pdf.includes("/PrintScaling /None"));
assert.equal((pdf.match(/\/Type \/Page /g) ?? []).length, 4);
assert.ok(pdf.includes("/Type /OCG"));
const media = [...pdf.matchAll(/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/g)];
assert.equal(media.length, 4);
assert.ok(Math.abs(+media[0][1] - 210 * MM_TO_PT) < 1e-6);
assert.ok(Math.abs(+media[0][2] - 297 * MM_TO_PT) < 1e-6);
const xref = +pdf.match(/startxref\n(\d+)/)[1];
assert.equal(pdf.slice(xref, xref + 4), "xref");
const offsets = pdf.slice(xref).matchAll(/(\d{10}) 00000 n/g);
let object = 1;
for (const match of offsets)
  assert.ok(pdf.slice(+match[1]).startsWith(object++ + " 0 obj"));
const bore = drillSvg(p),
  rear = drillSvg(p, { side: "back" });
assert.ok(bore.includes('width="330mm"'));
assert.equal((bore.match(/data-hole=/g) ?? []).length, 18);
assert.equal((rear.match(/data-hole=/g) ?? []).length, 18);
assert.ok(bore.includes('id="production-centers"'));
assert.ok(!bore.includes("data-route="));
const graphics = graphicsSvg(p, { side: "back" });
assert.ok(graphics.includes("translate(300 0) scale(-1 1)"));
assert.ok(!graphics.includes("data-hole="));
assert.ok(graphics.includes('id="names"'));
assert.ok(!graphics.includes("data-port="));
assert.ok(drillCsv(p).startsWith("\uFEFF"));
assert.equal(drillCsv(p).split("\r\n").filter(Boolean).length, 19);
assert.deepEqual(p, before);
const namesOff = structuredClone(p);
namesOff.layers.names.export = false;
assert.ok(!graphicsSvg(namesOff).includes('id="names"'));
const noGraphics = structuredClone(p);
for (const id of ["routes", "capsules", "rings", "names", "outline"])
  noGraphics.layers[id].export = false;
assert.throws(() => graphicsSvg(noGraphics), /eksportlag/);
const machine = machiningSvg(p, { side: "back" });
assert.ok(machine.includes('width="300mm"'));
assert.ok(machine.includes('data-origin="board-top-left"'));
assert.ok(!machine.includes("<text"));
assert.ok(!machine.includes("<path"));
assert.equal((machine.match(/<circle /g) ?? []).length, 18);
assert.ok(
  machine.includes(`cx="${300 - front.holes[0].x}" cy="${front.holes[0].y}"`),
);
const ringSize = structuredClone(p);
for (const s of ringSize.layout.stations) s.ringOuter = 7;
assert.deepEqual(productionHoles(ringSize), productionHoles(p));
const unbound = ledFixture();
assert.equal(productionReport(unbound).allowed, false);
assert.throws(() => drillPdf(unbound), /ubundne/);
assert.equal(productionReport(unbound, { allowUnbound: true }).allowed, true);
const mismatch = structuredClone(unbound);
mismatch.layout.stations[0].holes[0].x += 1;
assert.equal(productionReport(mismatch, { allowUnbound: true }).allowed, false);
assert.throws(() => drillSvg(mismatch, { allowUnbound: true }));
const outside = structuredClone(p);
outside.layout.stations[0].holes[0].x = -5;
assert.equal(productionReport(outside).allowed, false);
const sharedBase = ledFixture(),
  seg = sharedBase.ledLayout.segments[0];
let shared = bindPoint(sharedBase, {
  stationId: "double",
  pointIndex: 0,
  segmentId: seg.id,
  ledId: seg.id + ":led:0",
  share: true,
});
shared = bindPoint(shared, {
  stationId: "double",
  pointIndex: 1,
  segmentId: seg.id,
  ledId: seg.id + ":led:0",
  share: true,
});
assert.equal(productionReport(shared).allowed, true);
assert.equal(productionHoles(shared).length, 1);
assert.equal(productionHoles(shared)[0].references.length, 2);
assert.equal((drillSvg(shared).match(/data-hole=/g) ?? []).length, 1);
assert.equal(drillCsv(shared).split("\r\n").filter(Boolean).length, 3);
const mounted = structuredClone(p);
mounted.production.mountingHoles = [
  { id: "mount-1", x: 15, y: 15, diameter: 3 },
];
assert.equal(productionReport(mounted).allowed, true);
assert.equal(productionHoles(mounted).length, 19);
mounted.production.mountingHoles[0].x = front.holes[0].sourceX;
mounted.production.mountingHoles[0].y = front.holes[0].sourceY;
mounted.production.mountingHoles[0].diameter = front.holes[0].diameter;
assert.equal(productionReport(mounted).allowed, false);
const settings = productionSettings({ side: "back", paper: "board" }),
  saved = structuredClone(p);
saved.production.exportSettings = settings;
assert.deepEqual(parseProject(serialize(saved)), saved);
const history = new History(p);
history.commit(saved);
assert.deepEqual(history.undo(), p);
assert.deepEqual(history.redo(), saved);
assert.deepEqual(p, before);
console.log(
  "Production model PASS: exact front/back physical holes, shared-hole deduplication and identities, A4 tiling/overlap and full-size pages, PDF media boxes/xref/layers/100% printing, SVG layers/graphics isolation, CSV, blocking physical errors and unbound acknowledgement, mounting holes, nonmutation and persisted settings/history",
);
