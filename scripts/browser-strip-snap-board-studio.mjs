import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { serialize } from "../web/board-studio/model.mjs";
import { edgeGeometry } from "../web/board-studio/geometry.mjs";
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
import { ledFixture } from "./fixtures/board-studio-v031.mjs";
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
  const p = ledFixture(90);
  p.id = "strip-snapping";
  await page
    .locator("#file")
    .setInputFiles({
      name: "strip.json",
      mimeType: "application/json",
      buffer: Buffer.from(serialize(p)),
    });
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("intransit-board-v1")).id ===
      "strip-snapping",
  );
  const state = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("intransit-board-v1")));
  const screen = (x, y) =>
    page
      .locator("#canvas > g")
      .first()
      .evaluate(
        (el, p) => {
          const m = el.getScreenCTM();
          return { x: p.x * m.a + m.e, y: p.y * m.d + m.f };
        },
        { x, y },
      );
  async function move(x, y) {
    const a = await screen(x, y);
    await page.mouse.move(a.x, a.y);
  }
  await page.locator("#snap").check();
  await page.locator("#snap-guides").check();
  await move(60, 100);
  await page.mouse.down();
  await move(74.2, 148.8);
  await page.locator("#strip-snap-indicator").waitFor();
  assert.equal(
    await page.locator("#strip-snap-indicator").getAttribute("data-snap-kind"),
    "station",
  );
  await page.keyboard.down("Control");
  await page.waitForFunction(
    () => !document.querySelector("#strip-snap-indicator"),
  );
  await page.keyboard.up("Control");
  await page.locator("#strip-snap-indicator").waitFor();
  await page.mouse.up();
  let q = await state();
  assert.equal(q.ledLayout.segments[0].x, 75);
  assert.ok(Math.abs(q.ledLayout.segments[0].y - 130) < 1e-8);
  assert.deepEqual(q.layout.stations, p.layout.stations);
  assert.equal(q.ledLayout.bindings.length, 0);
  await page.locator("#undo").click();
  assert.deepEqual((await state()).ledLayout, p.ledLayout);
  await page.locator("#redo").click();
  // A second, independent physical chain docks alongside rather than on top.
  if (await page.locator("#led-panel").isHidden())
    await page.locator("#led-toggle").click();
  await page.locator("#led-new-segment").click();
  await page.locator("#seg-angle").fill("90");
  await page.locator("#seg-count").fill("12");
  await page.locator("#seg-length").fill("120");
  await page.locator("#segment-place").click();
  await move(80.7, 131.1);
  assert.equal(
    await page.locator("#strip-snap-indicator").getAttribute("data-snap-kind"),
    "side",
  );
  const a = await screen(80.7, 131.1);
  await page.mouse.click(a.x, a.y);
  q = await state();
  assert.equal(q.ledLayout.segments.length, 2);
  const side = q.ledLayout.segments.at(-1);
  assert.ok(Math.abs(side.x - 80) < 1e-8);
  assert.ok(Math.abs(side.y - 130) < 1e-8);
  assert.notEqual(side.chainId, q.ledLayout.segments[0].chainId);
  // Hold Ctrl from the start of a strip move; all snapping is temporarily off.
  await move(80, 150);
  await page.keyboard.down("Control");
  await page.mouse.down();
  await move(81.37, 151.23);
  assert.equal(await page.locator("#strip-snap-indicator").count(), 0);
  await page.mouse.up();
  await page.keyboard.up("Control");
  q = await state();
  assert.ok(Math.abs(q.ledLayout.segments.at(-1).x - 81.37) < 0.01);
  assert.ok(Math.abs(q.ledLayout.segments.at(-1).y - 131.23) < 0.01);
  await page.locator("#undo").click();
  assert.equal(await page.locator("[data-grid]").count(), 3);
  assert.equal(await page.locator("#grid-step").inputValue(), "5");
  await page.locator("#grid-half").click();
  assert.equal(await page.locator("#grid-step").inputValue(), "2.5");
  await page.locator("#grid-half").click();
  assert.equal(await page.locator("#grid-step").inputValue(), "1.25");
  const pending = page.waitForEvent("download");
  await page.locator("#save").click();
  const file = await pending,
    saved = JSON.parse(await readFile(await file.path(), "utf8"));
  assert.deepEqual(saved.ledLayout, (await state()).ledLayout); // Rotating only the visible symbol leaves old physical holes: propose, never move silently.
  const rotated = ledFixture(90);
  rotated.id = "rotated-physical-holes";
  rotated.layout.stations[0].holes[0].x = 70;
  rotated.layout.stations[0].holes[0].y = 140;
  rotated.layout.stations[0].holes[1].x = 80;
  rotated.layout.stations[0].holes[1].y = 140;
  await page
    .locator("#file")
    .setInputFiles({
      name: "rotated.json",
      mimeType: "application/json",
      buffer: Buffer.from(serialize(rotated)),
    });
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("intransit-board-v1")).id ===
      "rotated-physical-holes",
  );
  async function rotatedDrag() {
    await move(60, 100);
    await page.mouse.down();
    await move(74.2, 148.8);
    await page.mouse.up();
    await page.locator("#physical-dialog").waitFor();
  }
  await rotatedDrag();
  assert.deepEqual(await state(), rotated);
  await page.locator("#physical-cancel").click();
  assert.deepEqual(await state(), rotated);
  await rotatedDrag();
  await page.locator("#physical-confirm").click();
  q = await state();
  assert.equal(q.layout.stations[0].holes[0].x, 75);
  assert.equal(q.layout.stations[0].holes[0].y, 135);
  assert.equal(q.layout.stations[0].holes[1].y, 145);
  assert.equal(q.ledLayout.segments[0].x, 75);
  assert.deepEqual(
    q.layout.stations[0].holes.map((h) => h.id),
    rotated.layout.stations[0].holes.map((h) => h.id),
  );
  await page.locator("#undo").click();
  assert.deepEqual(await state(), rotated);
  assert.deepEqual(errors, []);
  console.log(
    "Strip snap Chromium PASS: 90° double-hole/LED alignment, Ctrl release/re-engage during live drag, independent side-by-side strip placement, Ctrl free placement with grid/guides enabled, undo/redo, JSON, three grid levels and repeated half-grid button",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
