import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { serialize } from "../web/board-studio/model.mjs";
const { chromium } = createRequire(import.meta.url)(
    process.env.PLAYWRIGHT_MODULE || "playwright",
  ),
  root = path.resolve(new URL("..", import.meta.url).pathname);
const server = createServer(async (req, res) => {
  try {
    const file = path.resolve(
      root,
      "." + decodeURIComponent(req.url.split("?")[0]),
    );
    if (!file.startsWith(root + path.sep)) throw Error();
    const data = await readFile(
      file.endsWith("/") ? file + "index.html" : file,
    );
    res.setHeader(
      "content-type",
      file.endsWith(".mjs")
        ? "text/javascript"
        : file.endsWith(".css")
          ? "text/css"
          : file.endsWith(".svg")
            ? "image/svg+xml"
            : "text/html",
    );
    res.end(data);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : {}),
  args: ["--no-sandbox"],
});
import { createProject, parseProject } from "../web/board-studio/model.mjs";
import {
  stationTemplate,
  fromTemplate,
} from "../web/board-studio/stations.mjs";
import { editStation } from "../web/board-studio/station-edit.mjs";
import { bindPoint } from "../web/board-studio/bindings.mjs";
import {
  newProfile,
  newSegment,
  ledPositions,
} from "../web/board-studio/led-layout.mjs";
const url = `http://127.0.0.1:${server.address().port}/web/board-studio/index.html`;
try {
  const page = await browser.newPage({
      viewport: { width: 1600, height: 1100 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.setDefaultTimeout(10000);
  await page.goto(url);
  const state = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("intransit-board-v1")));
  async function load(p) {
    await page.locator("#file").setInputFiles({
      name: "names.json",
      mimeType: "application/json",
      buffer: Buffer.from(serialize(p)),
    });
    await page.waitForFunction(
      (id) => JSON.parse(localStorage.getItem("intransit-board-v1"))?.id === id,
      p.id,
    );
    await page.evaluate(
      () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r)),
        ),
    );
  }
  async function set(id, v) {
    await page.locator("#" + id).fill(String(v));
    await page.locator("#" + id).press("Tab");
  }
  const base = createProject(),
    t = stationTemplate(base, base.layout.stations[0]);
  let p = createProject(false);
  p.layout.stations = Array.from({ length: 30 }, (_, i) => ({
    ...fromTemplate(t, {
      x: 25 + (i % 5) * 55,
      y: 30 + Math.floor(i / 5) * 60,
    }),
    name: i % 2 ? "Et langt navn" : "A",
    label: {
      ...t.label,
      dx: 0,
      dy: 0,
      position: "e",
      reference: "all",
      gap: 3,
      size: 2,
      color: "#151515",
    },
  }));
  p = parseProject(p);
  await load(p);
  await page.locator("#names-all").click();
  assert.equal(await page.locator("[data-selected-name]").count(), 30);
  assert.equal(await page.locator(".selected-station").count(), 0);
  await set("label-font", "Arial");
  await set("label-size", 4);
  await set("label-weight", 700);
  let q = await state();
  assert.ok(
    q.layout.stations.every(
      (s) =>
        s.label.size === 4 &&
        s.label.weight === 700 &&
        s.label.font === "Arial",
    ),
  );
  assert.deepEqual(
    q.layout.stations.map((s) => s.holes),
    p.layout.stations.map((s) => s.holes),
  );
  await page.locator("#undo").click();
  assert.ok(
    (await state()).layout.stations.every(
      (s) => s.label.weight === t.label.weight,
    ),
  );
  await page.locator("#redo").click();
  // Inspect actual SVG boxes, including the font's metrics, rather than only the model.
  for (const count of [1, 2, 3]) {
    let f = createProject(false);
    f.layout.stations = [
      { ...fromTemplate(t, { x: 100, y: 100 }, "short"), name: "A" },
      {
        ...fromTemplate(t, { x: 100, y: 200 }, "long"),
        name: "Et meget langt stasjonsnavn",
      },
    ];
    f = parseProject(f);
    for (const s of f.layout.stations) f = editStation(f, s.id, { count });
    for (const s of f.layout.stations)
      Object.assign(s.label, {
        position: "e",
        reference: "all",
        gap: 3,
        dx: 0,
        dy: 0,
      });
    await load(f);
    await page.locator("#names-all").click();
    for (const position of ["w", "e", "nw", "ne", "sw", "se"]) {
      await page.locator(`[data-name-position="${position}"]`).click();
      await page.mouse.move(20, 20);
      const checks = await page.evaluate(async () => {
        const { labelLayout, visibleBounds } = await import(
            "./label-layout.mjs"
          ),
          p = JSON.parse(localStorage.getItem("intransit-board-v1"));
        return p.layout.stations.map((s) => {
          const el = document.querySelector(`[data-label="${s.id}"]`),
            b = el.getBBox(),
            m = el.transform.baseVal.consolidate().matrix,
            cs = [
              [b.x, b.y],
              [b.x + b.width, b.y],
              [b.x, b.y + b.height],
              [b.x + b.width, b.y + b.height],
            ].map(([x, y]) => ({
              x: x * m.a + y * m.c + m.e,
              y: x * m.b + y * m.d + m.f,
            }));
          return {
            shape: visibleBounds(p, s),
            layout: labelLayout(p, s),
            actual: {
              x: Math.min(...cs.map((c) => c.x)),
              right: Math.max(...cs.map((c) => c.x)),
              y: Math.min(...cs.map((c) => c.y)),
              bottom: Math.max(...cs.map((c) => c.y)),
            },
          };
        });
      });
      for (const c of checks) {
        for (const k of ["x", "y", "right", "bottom"])
          assert.ok(
            Math.abs(c.layout.bounds[k] - c.actual[k]) < 0.005,
            JSON.stringify({ count, position, k, ...c }),
          );
        if (position.includes("w")) assert.ok(c.actual.right < c.shape.x);
        if (position.includes("e")) assert.ok(c.actual.x > c.shape.right);
        if (position.includes("n")) assert.ok(c.actual.bottom < c.shape.y);
        if (position.includes("s")) assert.ok(c.actual.y > c.shape.bottom);
      }
    }
    await page.locator('[data-name-position="e"]').click();
    await page.mouse.move(20, 20);
    const anchor = await page.evaluate(async () => {
      const { labelLayout } = await import("./label-layout.mjs"),
        p = JSON.parse(localStorage.getItem("intransit-board-v1"));
      return labelLayout(p, p.layout.stations[0]).anchor;
    });
    await set("label-angle", 45);
    const anchor2 = await page.evaluate(async () => {
      const { labelLayout } = await import("./label-layout.mjs"),
        p = JSON.parse(localStorage.getItem("intransit-board-v1"));
      return labelLayout(p, p.layout.stations[0]).anchor;
    });
    assert.deepEqual(anchor2, anchor);
    if (count > 1) {
      await page.locator("#name-reference").selectOption("1");
      assert.ok(
        (await state()).layout.stations.every((s) => s.label.reference === "1"),
      );
    }
  }
  // Select one name, then Ctrl/Shift toggle another; drag only names with exact free mm delta.
  await page.locator('[data-label="long"]').click({ modifiers: ["Control"] });
  await set("label-size", 5);
  await page.locator('[data-label="long"]').click({ modifiers: ["Control"] });
  assert.equal(await page.locator("#label-size").inputValue(), "");
  assert.equal(
    await page.locator("#label-size").getAttribute("placeholder"),
    "Blandet",
  );
  await page.locator('[data-label="long"]').click({ modifiers: ["Shift"] });
  assert.equal(await page.locator("[data-selected-name]").count(), 1);
  const before = await state(),
    rect = await page.locator('[data-label="short"]').boundingBox(),
    scale = await page
      .locator("#canvas > g")
      .first()
      .evaluate((el) => el.getScreenCTM().a);
  await page.keyboard.down("Control");
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await page.keyboard.up("Control");
  await page.mouse.down();
  await page.keyboard.down("Control");
  await page.mouse.move(
    rect.x + rect.width / 2 + 7 * scale,
    rect.y + rect.height / 2 + 3 * scale,
    { steps: 6 },
  );
  await page.mouse.up();
  await page.keyboard.up("Control");
  q = await state();
  assert.ok(
    Math.abs(
      q.layout.stations[0].label.dx - before.layout.stations[0].label.dx - 7,
    ) < 0.001,
  );
  assert.deepEqual(
    q.layout.stations.map((s) => s.holes),
    before.layout.stations.map((s) => s.holes),
  );
  await page.locator("#name-reset").click();
  await page.locator("#name-reference").selectOption("all");
  await page.locator("#name-standard").click();
  const defaultStyle = (await state()).labelDefault;
  await page.locator("#canvas").focus();
  await page.keyboard.press("s");
  await page.locator("#placement-snap").selectOption("off");
  const target = await page
    .locator("#canvas > g")
    .first()
    .evaluate((el) => {
      const m = el.getScreenCTM();
      return { x: 180 * m.a + m.e, y: 280 * m.d + m.f };
    });
  await page.mouse.click(target.x, target.y);
  await page.keyboard.press("Escape");
  assert.deepEqual((await state()).layout.stations.at(-1).label, defaultStyle);
  let download = page.waitForEvent("download");
  await page.locator("#save").click();
  const file = await download,
    saved = JSON.parse(await readFile(await file.path(), "utf8"));
  saved.id = crypto.randomUUID();
  await load(saved);
  assert.deepEqual((await state()).layout.stations, saved.layout.stations);
  download = page.waitForEvent("download");
  await page.locator("#export").click();
  await page.locator("#export-download").click();
  const exported = await download,
    svgText = await readFile(await exported.path(), "utf8");
  const exportedNames = await page.evaluate(
    (text) =>
      [
        ...new DOMParser()
          .parseFromString(text, "image/svg+xml")
          .querySelectorAll("[data-label]"),
      ].map((el) => ({
        id: el.getAttribute("data-label"),
        transform: el.getAttribute("transform"),
        color: el.getAttribute("fill"),
      })),
    svgText,
  );
  const displayedNames = await page
    .locator('[data-layer="names"] [data-label]')
    .evaluateAll((els) =>
      els.map((el) => ({
        id: el.getAttribute("data-label"),
        transform: el.getAttribute("transform"),
        color: el.getAttribute("fill"),
      })),
    );
  assert.deepEqual(exportedNames, displayedNames);
  // Real automatic length editing, live preview, inherited next range and preview placement.
  p = createProject(false);
  const profile = newProfile();
  p.ledLayout.profiles = [profile];
  p.ledLayout.segments = [
    newSegment(p, profile.id, { count: 10, x: 30, y: 50, angle: 45 }),
  ];
  p = parseProject(p);
  await load(p);
  await page.locator("#led-toggle").click();
  await page.locator("#led-segment").selectOption(p.ledLayout.segments[0].id);
  assert.equal(await page.locator("#seg-length").isDisabled(), true);
  await page.locator("#seg-count").fill("20");
  assert.equal(await page.locator("#seg-length").inputValue(), "200");
  assert.equal((await state()).ledLayout.segments[0].count, 10);
  assert.equal(await page.locator("[data-led]").count(), 20);
  await page.locator("#segment-save").click();
  assert.equal((await state()).ledLayout.segments[0].length, 200);
  await page.locator("#led-new-segment").click();
  assert.equal(await page.locator("#seg-count").inputValue(), "20");
  assert.equal(await page.locator("#seg-index").inputValue(), "20");
  assert.equal(await page.locator("#seg-angle").inputValue(), "45");
  assert.equal(await page.locator("#seg-name").inputValue(), "S02");
  await page.locator("#segment-save").click();
  q = await state();
  assert.notEqual(q.ledLayout.segments[0].id, q.ledLayout.segments[1].id);
  assert.equal(q.ledLayout.bindings.length, 0);
  await page.locator("#led-editor details").first().locator("summary").click();
  await page.locator("#profile-offset").fill("3");
  assert.equal(await page.locator("#seg-length").inputValue(), "198");
  await page.locator("#profile-save").click();
  assert.equal(await page.locator("#physical-dialog").isVisible(), true);
  await page.locator("#physical-confirm").click();
  assert.equal((await state()).ledLayout.segments[1].length, 198);
  await set("seg-end-margin", 9);
  assert.equal(await page.locator("#seg-length").inputValue(), "202");
  await page.locator("#segment-save").click();
  assert.equal((await state()).ledLayout.segments[1].length, 202);
  await page.locator("#seg-manual").check();
  await page.locator("#seg-length").fill("240");
  await page.locator("#segment-save").click();
  assert.equal((await state()).ledLayout.segments[1].lengthMode, "manual");
  const beforeChain = await state();
  await page.locator("#led-new-chain").click();
  assert.notEqual(
    await page.locator("#seg-chain").inputValue(),
    beforeChain.ledLayout.segments.at(-1).chainId,
  );
  assert.equal(await page.locator("#seg-index").inputValue(), "0");
  await page.locator("#canvas").focus();
  await page.keyboard.press("Escape");
  assert.deepEqual(await state(), beforeChain);
  // Reduction cannot silently drop bound LEDs; pitch movement uses the physical consent dialog.
  p = createProject(false);
  p.ledLayout.profiles = [newProfile()];
  p.ledLayout.segments = [
    newSegment(p, p.ledLayout.profiles[0].id, { count: 10 }),
  ];
  p.layout.stations = [fromTemplate(t, { x: 20, y: 20 })];
  p = parseProject(p);
  p = bindPoint(p, {
    stationId: p.layout.stations[0].id,
    pointIndex: 0,
    segmentId: p.ledLayout.segments[0].id,
    ledId: ledPositions(p, p.ledLayout.segments[0])[9].id,
    mode: "direct",
  });
  p.id = crypto.randomUUID();
  await load(p);
  if (!(await page.locator("#led-panel").isVisible()))
    await page.locator("#led-toggle").click();
  await page.locator("#led-segment").selectOption(p.ledLayout.segments[0].id);
  await page.locator("#seg-count").fill("5");
  await page.locator("#segment-save").click();
  assert.equal((await state()).ledLayout.segments[0].count, 10);
  assert.match(await page.locator("#edit-error").textContent(), /bundne LED/);
  await page.locator("#led-editor details summary").first().click();
  await page.locator("#profile-pitch").fill("11");
  await page.locator("#profile-save").click();
  assert.equal(await page.locator("#physical-dialog").isVisible(), true);
  assert.equal((await state()).ledLayout.profiles[0].pitch, 10);
  await page
    .locator("#physical-dialog button")
    .filter({ hasText: "Avbryt" })
    .click();
  assert.equal((await state()).ledLayout.profiles[0].pitch, 10);
  assert.deepEqual(errors, []);
  console.log(
    "Names/segments Chromium PASS: 30-name batch and mixed fields, real SVG bounds at 1/2/3 points and six edge/diagonal placements, A/B reference, fixed rotation anchor, Ctrl/Shift text selection, exact free name drag, default style, JSON download/reopen; auto length/live count preview, inherited segment/next index, asymmetric offsets/margins/manual override, rejected bound count reduction and physical pitch confirmation",
  );
} finally {
  await browser.close();
  server.close();
}
