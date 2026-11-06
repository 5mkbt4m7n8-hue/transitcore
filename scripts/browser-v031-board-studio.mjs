import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import {
  createProject,
  parseProject,
  serialize,
} from "../web/board-studio/model.mjs";
import {
  geometryFixture,
  parallelFixture,
} from "../web/board-studio/fixtures.mjs";
import {
  edgeGeometry,
  symbolCenters,
  stationTangent,
} from "../web/board-studio/geometry.mjs";
import { checkSvg } from "./fixtures/board-studio-svg-check.mjs";
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
import {
  connectionFixture,
  ledFixture,
} from "./fixtures/board-studio-v031.mjs";
import { ledPositions } from "../web/board-studio/led-layout.mjs";
try {
  const page = await browser.newPage({
      viewport: { width: 1600, height: 1100 },
    }),
    errors = [];
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    `http://127.0.0.1:${server.address().port}/web/board-studio/index.html`,
  );
  const state = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("intransit-board-v1")));
  async function load(p) {
    await page.locator("#file").setInputFiles({
      name: "fixture.json",
      mimeType: "application/json",
      buffer: Buffer.from(serialize(p)),
    });
    await page.waitForFunction(
      (id) => JSON.parse(localStorage.getItem("intransit-board-v1")).id === id,
      p.id,
    );
    // Reopening the same project keeps its ID and data. Wait for the load's
    // selection reset as well, then let fit/ResizeObserver reach the rendered CTM.
    await page.waitForFunction(
      () => !document.querySelector(".selected-connection"),
    );
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
  }
  const screen = (x, y) =>
    page
      .locator("#canvas > g")
      .first()
      .evaluate(
        (el, p) => {
          const m = el.getScreenCTM();
          return {
            x: p.x * m.a + p.y * m.c + m.e,
            y: p.x * m.b + p.y * m.d + m.f,
          };
        },
        { x, y },
      );
  async function click(x, y) {
    const a = await screen(x, y);
    await page.mouse.click(a.x, a.y);
  }
  async function selectRoute(id, edge = 0) {
    const point = await page
      .locator(
        `[data-layer="routes"] [data-route="${id}"][data-edge="${edge}"][data-part="core"]`,
      )
      .first()
      .evaluate((el) => {
        const p = el.getPointAtLength(el.getTotalLength() * 0.35),
          m = el.getScreenCTM();
        return {
          x: p.x * m.a + p.y * m.c + m.e,
          y: p.x * m.b + p.y * m.d + m.f,
        };
      });
    await page.mouse.click(point.x, point.y);
  }
  async function drag(a, b, inspect) {
    const start = await screen(a.x, a.y),
      end = await screen(b.x, b.y);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 8 });
    if (inspect) await inspect();
    await page.mouse.up();
  }
  const p = connectionFixture(true);
  await load(p);
  await selectRoute("main", 1);
  assert.equal(await page.locator("#route-object option").count(), 2);
  await page.locator("#route-object").selectOption("main");
  assert.equal(await page.locator(".selected-connection").count(), 1);
  await page.locator("#edge-delete").click();
  let q = await state();
  assert.deepEqual(
    q.layout.routes.map((r) => r.stationIds),
    [
      ["s0", "s1"],
      ["s2", "s3"],
      ["s1", "s2"],
    ],
  );
  assert.deepEqual(q.layout.stations, p.layout.stations);
  await page.locator("#undo").click();
  assert.deepEqual((await state()).layout.routes, p.layout.routes);
  await page.locator("#redo").click();
  let download = page.waitForEvent("download");
  await page.locator("#save").click();
  const json = await download;
  const saved = JSON.parse(await readFile(await json.path(), "utf8"));
  assert.deepEqual(saved, q);
  await load(saved);
  await selectRoute("other");
  assert.equal(await page.locator("#route-object").inputValue(), "other");
  await page.keyboard.press("Delete");
  assert.equal((await state()).layout.routes.length, 2);
  download = page.waitForEvent("download");
  await page.locator("#export").click();
  await page.locator("#export-download").click();
  const svgFile = await download,
    svgText = await readFile(await svgFile.path(), "utf8");
  const exportedEdges = await page.evaluate(
    (text) =>
      [
        ...new DOMParser()
          .parseFromString(text, "image/svg+xml")
          .querySelectorAll("[data-route]"),
      ].map((el) => ({
        route: el.getAttribute("data-route"),
        edge: el.getAttribute("data-edge"),
      })),
    svgText,
  );
  assert.ok(exportedEdges.length > 0);
  assert.ok(exportedEdges.every((e) => e.route !== "other" && e.edge === "0"));
  await page.locator("#undo").click();
  await selectRoute("main");
  await page.locator("#route-tracks").selectOption("2");
  await page.locator("#route-spacing").fill("12");
  await page.locator("#route-spacing").press("Tab");
  await page.locator('[data-tool="route"]').click();
  await page
    .locator('[data-port-station="s0"][data-port="pair:right"]')
    .click();
  await page.locator('[data-port-station="s3"][data-port="pair:left"]').click();
  assert.equal((await state()).layout.routes.at(-1).tracks, 2);
  assert.equal((await state()).layout.routes.at(-1).trackSpacing, 12);
  await page.locator('[data-tool="select"]').click();
  await page.locator('[data-tool="route"]').click();
  await page.locator("#new-route-tracks").selectOption("1");
  await page
    .locator('[data-port-station="s0"][data-port="pair:right"]')
    .click();
  await page.locator('[data-port-station="s2"][data-port="pair:left"]').click();
  assert.equal((await state()).layout.routes.at(-1).tracks, 1);
  assert.equal((await state()).layout.routes.at(-2).tracks, 2);
  await page.locator('[data-tool="select"]').click();
  for (const angle of [0, 45]) {
    const base = ledFixture(angle);
    base.id = "led-" + angle;
    await load(base);
    await page.locator("#snap").uncheck();
    await page.locator("#snap-guides").uncheck();
    await page.locator("#snap-led").check();
    await page.locator("#snap-led-bind").check();
    const leds = ledPositions(base, base.ledLayout.segments[0]);
    await click(75, 135);
    await page.locator("#station-snap-point").selectOption("0");
    const camera = await page
      .locator("#canvas > g")
      .first()
      .getAttribute("transform");
    await drag(
      { x: 75, y: 135 },
      { x: leds[3].x + 1, y: leds[3].y },
      async () => {
        assert.equal(
          await page.locator("#led-snap-indicator").getAttribute("data-led-id"),
          leds[3].id,
        );
      },
    );
    await page.locator("#physical-dialog").waitFor();
    assert.deepEqual(await state(), base);
    await page.locator("#physical-confirm").click();
    q = await state();
    assert.equal(q.ledLayout.bindings[0].ledId, leds[3].id);
    assert.equal(q.layout.stations[0].holes[0].x, leds[3].x);
    assert.equal(q.layout.stations[0].holes[0].y, leds[3].y);
    assert.equal(
      await page.locator("#canvas > g").first().getAttribute("transform"),
      camera,
    );
    // Rebinding a bound ring starts a real move gesture even when physical LEDs overlay it.
    await drag(leds[3], { x: leds[4].x + 1, y: leds[4].y });
    await page.locator("#physical-confirm").click();
    assert.equal((await state()).ledLayout.bindings[0].ledId, leds[4].id);
    await page.locator("#undo").click();
    assert.equal((await state()).ledLayout.bindings[0].ledId, leds[3].id);
    await page.locator("#redo").click();
    // Point B snaps independently; A stays bound and motion requires confirmation.
    await page.locator("#station-snap-point").selectOption("1");
    await drag((await state()).layout.stations[0].holes[1], {
      x: leds[5].x + 1,
      y: leds[5].y,
    });
    await page.locator("#physical-confirm").click();
    q = await state();
    assert.equal(q.ledLayout.bindings.length, 2);
    assert.equal(q.layout.stations[0].holes[0].x, leds[4].x);
    assert.equal(q.layout.stations[0].holes[1].x, leds[5].x);
    const beforeConflict = await state();
    await drag(beforeConflict.layout.stations[0].holes[1], leds[4]);
    assert.deepEqual(await state(), beforeConflict);
    assert.equal(await page.locator("#physical-dialog").isVisible(), false);
    assert.match(
      await page.locator("#status").textContent(),
      /allerede i bruk/,
    );
    // Three zoom levels use the same screen-space capture radius.
    for (const button of ["zoom-in", "zoom-out", "zoom-out"]) {
      await page.locator("#" + button).click();
      await page.locator('[data-tool="station"]').click();
      const a = await screen(leds[8].x, leds[8].y);
      await page.mouse.move(a.x + 4, a.y);
      assert.equal(
        await page.locator("#led-snap-indicator").getAttribute("data-led-id"),
        leds[8].id,
      );
      await page.locator('[data-tool="select"]').click();
    }
    download = page.waitForEvent("download");
    await page.locator("#save").click();
    const file = await download;
    const round = JSON.parse(await readFile(await file.path(), "utf8"));
    await load(round);
    assert.deepEqual((await state()).ledLayout, q.ledLayout);
  }
  // Stop placement: align without binding and fully disabled LED snapping are independent.
  const base = ledFixture();
  base.id = "alignment";
  await load(base);
  await page.locator("#snap-led-bind").uncheck();
  await page.locator('[data-tool="station"]').click();
  await click(145.4, 80);
  q = await state();
  assert.equal(q.ledLayout.bindings.length, 0);
  assert.equal(q.layout.stations.at(-1).holes[0].x, 145);
  await page.locator("#snap-led").uncheck();
  await click(165.4, 80.3);
  q = await state();
  assert.ok(Math.abs(q.layout.stations.at(-1).x - 165.4) < 0.5);
  assert.equal(q.ledLayout.bindings.length, 0);
  await page.locator("#snap-led").check();
  await page.locator("#snap-led-bind").check();
  await click(175.4, 80);
  q = await state();
  assert.equal(q.ledLayout.bindings.at(-1).ledId, "strip:led:11");
  assert.equal(q.layout.stations.at(-1).holes[0].x, 175);
  assert.deepEqual(errors, []);
  if (process.env.BOARD_V031_SCREENSHOT)
    await page.screenshot({
      path: process.env.BOARD_V031_SCREENSHOT,
      fullPage: true,
    });
  console.log(
    "v0.3.1 Chromium PASS: explicit overlapping-route selection; delete/split without station loss; keyboard/undo/redo/JSON; inherited double-track settings; exact LED snapping/binding at 0° and 45°; independent double points; physical approval; unchanged camera; three zoom levels; align-only and disabled snapping",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
