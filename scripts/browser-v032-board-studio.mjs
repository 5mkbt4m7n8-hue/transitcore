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
import { portFixture } from "./fixtures/board-studio-v032.mjs";
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
  const fixture = portFixture();
  await page.locator("#file").setInputFiles({
    name: "ports.json",
    mimeType: "application/json",
    buffer: Buffer.from(serialize(fixture)),
  });
  const port = (id, key) =>
    page.locator(`[data-port-station="${id}"][data-port="${key}"]`);
  assert.equal(await page.locator("[data-port]").count(), 0);
  await page.locator('[data-tool="route"]').click();
  assert.equal(await page.locator("[data-port]").count(), 60);
  await port("junction", "pair:left").hover();
  assert.equal(
    await port("junction", "pair:left").getAttribute("data-port-state"),
    "hover",
  );
  await port("junction", "pair:left").click();
  assert.equal(
    await port("junction", "pair:left").getAttribute("data-port-state"),
    "start",
  );
  assert.match(await page.locator("#port-selection").textContent(), /junction/);
  await port("branch", "pair:left").click();
  let q = await state();
  const r = q.layout.routes.at(-1);
  assert.equal(q.layout.routes.length, 3);
  assert.deepEqual(r.anchors[0], { start: "pair:left", end: "pair:left" });
  assert.deepEqual(q.layout.stations, fixture.layout.stations);
  const endpoints = await page
    .locator(`#canvas [data-route="${r.id}"][data-part="start"]`)
    .evaluateAll((els) =>
      els
        .filter((el) => el.getAttribute("stroke") !== "transparent")
        .map((el) => {
          const p = el.getPointAtLength(0);
          return { x: p.x, y: p.y };
        }),
    );
  assert.equal(endpoints.length, 2);
  for (const endpoint of endpoints) {
    assert.ok(
      Math.abs(
        endpoint.y -
          (130 +
            fixture.layout.stations[1].ringOuter / 2 +
            fixture.layout.stations[1].stroke / 2),
      ) < 0.003,
    );
    assert.ok(
      Math.abs(endpoint.x - 65) < 0.003 || Math.abs(endpoint.x - 75) < 0.003,
    );
  }

  assert.equal(
    await port("branch", "pair:left").getAttribute("data-port-state"),
    "end",
  );
  assert.equal(await page.locator("#line-advanced").getAttribute("open"), null);
  assert.equal(await page.locator("[data-handle]").count(), 0);
  assert.equal(await page.locator("#route-length").isVisible(), false);
  await page.locator("#line-advanced summary").click();
  await page.locator("#route-length").fill("21");
  await page.locator("#route-length").press("Tab");
  assert.equal(
    await page.locator("#line-advanced").evaluate((el) => el.open),
    true,
  );
  await page.locator("[data-handle]").first().waitFor();
  assert.ok((await page.locator("[data-handle]").count()) > 0);
  assert.equal(await page.locator("#route-length").isVisible(), true);
  await page.locator("#line-advanced summary").click();
  await page.waitForFunction(() => !document.querySelector("[data-handle]"));
  assert.equal(await page.locator("[data-handle]").count(), 0);
  await page.locator("#reconnect-ports").click();
  await port("junction", "pair:left").click();
  await port("branch", "point:0:left").click();
  assert.equal((await state()).layout.routes.length, 3);
  assert.equal((await state()).layout.routes.at(-1).id, r.id);
  assert.equal(
    (await state()).layout.routes.at(-1).anchors[0].end,
    "point:0:left",
  );
  await page.locator('[data-tool="station"]').click();
  assert.equal(await page.locator("[data-port]").count(), 0);
  await page.locator('[data-tool="select"]').click();
  await page.locator("#canvas").click({ position: { x: 40, y: 40 } });
  assert.equal(await page.locator("[data-port]").count(), 0);
  await page.locator('[data-tool="route"]').click();
  await port("pair-a", "pair:right").click();
  await port("pair-b", "pair:left").click();
  q = await state();
  const pair = q.layout.routes.at(-1),
    geometry = edgeGeometry(q, pair, 0);
  assert.ok(geometry.valid);
  assert.equal(geometry.curves.length, 1);
  assert.ok(
    Math.abs(geometry.curves[0].c1.x + geometry.curves[0].c2.x - 280) < 1e-8,
  );
  // Export is final vector artwork, without editor ports or handles.
  let pending = page.waitForEvent("download");
  await page.locator("#export").click();
  await page.locator("#export-download").click();
  let file = await pending;
  const artwork = await readFile(await file.path(), "utf8");
  assert.ok(!artwork.includes("data-port="));
  assert.ok(!artwork.includes("data-handle="));
  pending = page.waitForEvent("download");
  await page.locator("#save").click();
  file = await pending;
  const saved = JSON.parse(await readFile(await file.path(), "utf8"));
  assert.deepEqual(saved, q);
  await page.locator("#new").click();
  await page.locator("#file").setInputFiles(await file.path());
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("intransit-board-v1")).layout.routes
        .length === 4,
  );
  assert.deepEqual((await state()).layout.routes, q.layout.routes);
  // Re-select through a real point on the visible curve, then delete only it.
  await page.locator('[data-tool="select"]').click();
  const pt = await page
    .locator(`[data-route="${pair.id}"][data-part="core"]`)
    .first()
    .evaluate((el) => {
      const p = el.getPointAtLength(el.getTotalLength() * 0.35),
        m = el.getScreenCTM();
      return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f };
    });
  await page.mouse.click(pt.x, pt.y);
  assert.match(await page.locator("#connection-ports").textContent(), /Samlet/);
  if (process.env.BOARD_V032_SCREENSHOT)
    await page.screenshot({
      path: process.env.BOARD_V032_SCREENSHOT,
      fullPage: true,
    });
  await page.locator("#edge-delete").click();
  assert.equal((await state()).layout.routes.length, 3);
  assert.deepEqual((await state()).layout.stations, q.layout.stations);
  await page.locator("#undo").click();
  assert.deepEqual(await state(), q);
  await page.locator("#redo").click();
  assert.equal((await state()).layout.routes.length, 3);
  assert.deepEqual(errors, []);
  if (process.env.BOARD_V032_SCREENSHOT) {
    await page.setViewportSize({ width: 1200, height: 620 });
    await page.goto(
      `http://127.0.0.1:${server.address().port}/docs/board-studio/v032-before-after.svg`,
    );
    await page.screenshot({
      path: process.env.BOARD_V032_SCREENSHOT.replace(
        ".png",
        "-before-after.png",
      ),
    });
  }

  console.log(
    "v0.3.2 Chromium PASS A–G: visible/hover/selected explicit ports, main-line branch exit, paired symmetric geometry, simple/advanced mode, JSON and clean SVG downloads, reopen, targeted deletion and undo/redo",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
