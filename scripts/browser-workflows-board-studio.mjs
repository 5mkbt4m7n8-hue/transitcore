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
  const state = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("intransit-board-v1")));
  let serial = 0;
  async function load(p) {
    p = structuredClone(p);
    p.id = "workflow-" + ++serial;
    await page.locator("#file").setInputFiles({
      name: "workflow.json",
      mimeType: "application/json",
      buffer: Buffer.from(serialize(p)),
    });
    await page.waitForFunction(
      (id) => JSON.parse(localStorage.getItem("intransit-board-v1")).id === id,
      p.id,
    );
    return p;
  }
  const p = await load(portFixture()),
    port = (id, key) =>
      page.locator(`[data-port-station="${id}"][data-port="${key}"]`);
  await page.locator('[data-tool="route"]').click();
  await port("junction", "pair:left").click();
  await port("branch", "pair:right").hover();
  assert.equal(
    await page.locator("#connection-preview").getAttribute("data-valid"),
    "false",
  );
  assert.deepEqual(await state(), p);
  await port("branch", "pair:right").click();
  assert.deepEqual(await state(), p);
  await port("branch", "pair:left").hover();
  await page.locator("#connection-preview").waitFor();
  assert.equal(
    await page.locator("#connection-preview").getAttribute("data-valid"),
    "true",
  );
  if (process.env.BOARD_WORKFLOWS_SCREENSHOT)
    await page.screenshot({
      path: process.env.BOARD_WORKFLOWS_SCREENSHOT.replace(
        ".png",
        "-preview.png",
      ),
      fullPage: true,
    });
  const previewPaths = await page
    .locator("#connection-preview path")
    .evaluateAll((nodes) => nodes.map((el) => el.getAttribute("d")));
  assert.deepEqual(await state(), p);
  await port("branch", "pair:left").click();
  let q = await state();
  assert.deepEqual(
    edgeGeometry(q, q.layout.routes.at(-1), 0).paths.map((p) => p.d),
    previewPaths,
  );
  assert.equal(await page.locator("#connection-preview").count(), 0);
  // One session places double symbols repeatedly on every third physical position.
  const physical = ledFixture(45);
  physical.layout.stations = [];
  physical.ledLayout.segments[0].startIndex = 100;
  physical.ledLayout.segments[0].direction = -1;
  await load(physical);
  await page.locator("#led-toggle").click();
  await page.locator("#rapid-panel summary").click();
  await page.locator("#rapid-symbol").selectOption("builtin-0-double");
  assert.equal(await page.locator("#rapid-start").inputValue(), "111");
  await page.locator("#rapid-step").selectOption("3");
  await page.locator("#rapid-name").fill("Buss");
  await page.locator("#rapid-begin").click();
  assert.equal(await page.locator("[data-rapid-led]").count(), 2);
  assert.match(await page.locator("#rapid-status").textContent(), /111, 110/);
  await page.locator("#rapid-place").click();
  q = await state();
  assert.equal(q.layout.stations.length, 1);
  assert.equal(q.ledLayout.bindings.length, 2);
  assert.match(q.layout.stations[0].name, /Buss/);
  assert.match(await page.locator("#rapid-status").textContent(), /108, 107/);
  await page.locator("#undo").click();
  assert.equal((await state()).layout.stations.length, 0);
  assert.match(await page.locator("#rapid-status").textContent(), /111, 110/);
  await page.locator("#redo").click();
  await page.locator("#rapid-place").click();
  assert.equal((await state()).layout.stations.length, 2);
  if (process.env.BOARD_WORKFLOWS_SCREENSHOT)
    await page.screenshot({
      path: process.env.BOARD_WORKFLOWS_SCREENSHOT.replace(
        ".png",
        "-rapid.png",
      ),
      fullPage: true,
    });
  // Enter and actual clicks on the highlighted physical LED both place one stop.
  await page.locator("#canvas").focus();
  await page.keyboard.press("Enter");
  assert.equal((await state()).layout.stations.length, 3);
  const nextLed = await page
    .locator("[data-rapid-led]")
    .first()
    .getAttribute("data-rapid-led");
  const point = await page
    .locator(`[data-layer="leds"] [data-led="${nextLed}"]`)
    .evaluate((el) => {
      const b = el.getBoundingClientRect();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
  await page.mouse.click(point.x, point.y);
  q = await state();
  assert.equal(q.layout.stations.length, 4);
  assert.equal(q.ledLayout.bindings.length, 8);
  assert.equal(new Set(q.ledLayout.bindings.map((b) => b.ledId)).size, 8);
  assert.equal(await page.locator("#rapid-place").isDisabled(), true);
  await page.locator("#rapid-stop").click();
  assert.equal(await page.locator("#rapid-preview").count(), 0);
  const pending = page.waitForEvent("download");
  await page.locator("#save").click();
  const file = await pending,
    saved = JSON.parse(await readFile(await file.path(), "utf8"));
  assert.deepEqual(saved, q);
  await page.locator("#file").setInputFiles(await file.path());
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("intransit-board-v1")).layout.stations
        .length === 4,
  );
  assert.deepEqual((await state()).ledLayout, q.ledLayout);
  // Structured findings navigate without editing JSON, even with duplicate names.
  const bad = ledFixture();
  bad.layout.stations[0].name = "Samme navn";
  bad.layout.stations[0].holes[0].x = -5;
  const other = structuredClone(bad.layout.stations[0]);
  other.id = "other";
  other.holes = other.holes.map((h, i) => ({ ...h, id: "other:" + i }));
  bad.layout.stations.push(other);
  const loaded = await load(bad);
  await page.locator("#check-filter").selectOption("physical");
  const issue = page
    .locator('[data-target-kind="station"][data-target-id="other"]')
    .filter({ hasText: "utenfor" })
    .first();
  await issue.click();
  assert.equal(await page.locator("#station-name").inputValue(), "Samme navn");
  assert.equal(await page.locator("#check-focus").count(), 1);
  assert.deepEqual(await state(), loaded);
  assert.deepEqual(await page.locator(".selected-mark").count(), 1);
  await page.locator("#check-filter").selectOption("unbound");
  assert.match(
    await page.locator("#mechanical-report").textContent(),
    /LED-binding/,
  );
  assert.deepEqual(errors, []);
  if (process.env.BOARD_WORKFLOWS_SCREENSHOT)
    await page.screenshot({
      path: process.env.BOARD_WORKFLOWS_SCREENSHOT,
      fullPage: true,
    });
  console.log(
    "Workflows Chromium PASS: exact live port preview without mutation; repeated double-stop placement by button/Enter/LED click, intervals/reversed indices/exhaustion, undo/redo/JSON; structured filtered checklist navigation without document edits",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
