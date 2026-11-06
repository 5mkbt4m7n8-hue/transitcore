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
import {
  placementFixture,
  placementSymbols,
} from "./fixtures/board-studio-placement.mjs";
import { ledPositions } from "../web/board-studio/led-layout.mjs";
import { stationMarkup } from "../web/board-studio/model.mjs";
const canonicalMarkup = (s) => s.replace(/<(\w+)([^<>]*?)\/>/g, "<$1$2></$1>");
const url = `http://127.0.0.1:${server.address().port}/web/board-studio/index.html`;
try {
  const errors = [],
    page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  const state = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("intransit-board-v1")));
  async function load(p) {
    await page.locator("#file").setInputFiles({
      name: "placement.json",
      mimeType: "application/json",
      buffer: Buffer.from(serialize(p)),
    });
    await page.waitForFunction(
      (id) => JSON.parse(localStorage.getItem("intransit-board-v1")).id === id,
      p.id,
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
  async function move(x, y) {
    const pos = await screen(x, y);
    await page.mouse.move(pos.x, pos.y);
    return pos;
  }
  async function click(x, y) {
    const pos = await move(x, y);
    await page.mouse.click(pos.x, pos.y);
  }
  const ghost = () =>
    page.locator(".placement-preview").evaluate((el) =>
      Object.fromEntries(
        ["capsules", "rings", "names", "holes"].map((layer) => {
          const groups = [
            ...el.querySelectorAll(
              layer === "names"
                ? "text[data-label]"
                : layer === "holes"
                  ? "[data-hole]"
                  : layer === "rings"
                    ? "g[data-station]:has([data-ring-point])"
                    : "g[data-station]:has(rect)",
            ),
          ];
          return [layer, groups.map((el) => el.outerHTML).join("")];
        }),
      ),
    );
  const p = placementFixture();
  await load(p);
  await page.locator("#snap").uncheck();
  await page.locator("#snap-guides").uncheck();
  await page.locator("#canvas").focus();
  await page.keyboard.press("s");
  await page.locator("#placement-toolbar").waitFor({ state: "visible" });
  await page.locator("#placement-snap").selectOption("off");
  await page.locator("#placement-symbol").selectOption("builtin-0-capsule");
  await move(180.125, 230.375);
  assert.equal(await page.locator(".placement-preview").count(), 1);
  assert.equal(
    await page.locator("#canvas").evaluate((el) => el.style.cursor),
    "none",
  );
  let before = await state();
  await page.locator("#canvas").focus();
  await page.keyboard.press("r");
  assert.equal(await page.locator("#placement-angle").textContent(), "90°");
  await move(180.125, 230.375);
  let expected = await ghost();
  const previewBox = await page
    .locator('.placement-preview [data-ring-point="0"] circle')
    .first()
    .boundingBox();
  await click(180.125, 230.375);
  let q = await state(),
    s = q.layout.stations.at(-1);
  for (const layer of ["capsules", "rings", "names", "holes"])
    assert.equal(canonicalMarkup(stationMarkup(s, layer, q)), expected[layer]);
  const actualBox = await page
    .locator(
      `[data-layer="rings"] [data-station="${s.id}"] [data-ring-point="0"] circle`,
    )
    .first()
    .boundingBox();
  assert.ok(
    Math.abs(actualBox.x - previewBox.x) < 0.1 &&
      Math.abs(actualBox.y - previewBox.y) < 0.1,
  );
  assert.equal(s.symbolAngle, 90);
  assert.equal(await page.locator("#placement-toolbar").isVisible(), true);
  await move(220, 250);
  await page.locator("#canvas").focus();
  await page.keyboard.press("Shift+r");
  assert.equal(await page.locator("#placement-angle").textContent(), "0°");
  await click(220, 250);
  assert.equal((await state()).layout.stations.length, 2);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator(".placement-preview").count(), 0);
  assert.equal(await page.locator("#placement-toolbar").isVisible(), false);
  // Native text keys still type normally.
  await page.locator("#station-name").fill("Rute S");
  await page.locator("#station-name").press("r");
  assert.equal(await page.locator("#placement-toolbar").isVisible(), false);
  await page.locator("#station-name").press("Tab");
  const unboundBefore = await state(),
    last = unboundBefore.layout.stations.at(-1);
  await page.locator("#station-rotate").click();
  await page.locator("#physical-dialog").waitFor({ state: "visible" });
  assert.deepEqual(await state(), unboundBefore);
  await page.locator("#physical-cancel").click();
  await page.locator("#station-rotate").click();
  await page.locator("#physical-confirm").click();
  const unboundAfter = (await state()).layout.stations.at(-1);
  assert.notDeepEqual(unboundAfter.holes, last.holes);
  assert.deepEqual(
    unboundAfter.holes.map((h) => ({ x: h.x, y: h.y })),
    unboundAfter.ringCenters,
  );
  await page.locator("#undo").click();
  assert.deepEqual(await state(), unboundBefore);
  // Exact physical snap and preview across camera changes, reversed LED indexing.
  await load(placementFixture());
  const leds = ledPositions(p, p.ledLayout.segments[0]),
    other = ledPositions(p, p.ledLayout.segments[1]);
  for (const zoomButton of ["zoom-in", "zoom-out", "zoom-out"]) {
    await page.locator("#" + zoomButton).click();
    await page.locator("#canvas").focus();
    await page.keyboard.press("s");
    await page.locator("#placement-snap").selectOption("required");
    if (zoomButton === "zoom-in") {
      const beforePan = await state();
      await page.locator("#canvas").focus();
      await page.keyboard.down("Space");
      const pos = await screen(210, 250);
      await page.mouse.move(pos.x, pos.y);
      await page.mouse.down();
      await page.mouse.move(pos.x + 25, pos.y + 20);
      await page.mouse.up();
      await page.keyboard.up("Space");
      assert.deepEqual(await state(), beforePan);
    }
    const led = leds[4],
      pos = await move(led.x, led.y);
    assert.equal(
      await page
        .locator('.placement-preview [data-placement-target="0"]')
        .getAttribute("data-led-id"),
      led.id,
    );
    await page.locator("#placement-rotate").hover();
    assert.equal(
      await page
        .locator('.placement-preview [data-placement-target="0"]')
        .getAttribute("data-led-id"),
      led.id,
    );
    await move(led.x, led.y);
    expected = await ghost();
    await page.mouse.click(pos.x, pos.y);
    q = await state();
    s = q.layout.stations.at(-1);
    assert.equal(s.holes[0].x, led.x);
    assert.equal(s.holes[0].y, led.y);
    assert.equal(canonicalMarkup(stationMarkup(s, "rings", q)), expected.rings);
    await page.keyboard.press("Escape");
    await page.locator("#undo").click();
  }
  // Two clicks create one logical station and two separate binding identities.
  await page.locator("#canvas").focus();
  await page.keyboard.press("s");
  await page.locator("#placement-symbol").selectOption("builtin-0-double");
  await page.locator("#placement-mode").selectOption("double");
  before = await state();
  await click(leds[3].x, leds[3].y);
  assert.deepEqual(await state(), before);
  assert.equal(
    await page
      .locator(".placement-preview")
      .getAttribute("data-placement-stage"),
    "second",
  );
  await move(other[5].x, other[5].y);
  assert.equal(await page.locator("[data-placement-target]").count(), 2);
  expected = await ghost();
  if (process.env.BOARD_PLACEMENT_SCREENSHOT)
    await page.screenshot({
      path: process.env.BOARD_PLACEMENT_SCREENSHOT,
      fullPage: true,
    });
  await click(other[5].x, other[5].y);
  q = await state();
  s = q.layout.stations.at(-1);
  const pairId = s.id;
  assert.equal(s.points, 2);
  assert.equal(s.symbolKind, "double-strip");
  assert.equal(q.ledLayout.bindings.length, 2);
  assert.equal(q.ledLayout.bindings[1].ledId, other[5].id);
  assert.equal(other[5].index, 110);
  for (const layer of ["rings", "capsules", "names", "holes"])
    assert.equal(canonicalMarkup(stationMarkup(s, layer, q)), expected[layer]);
  await page.keyboard.press("Escape");
  // Rotate the graphic marker while direct-bound rings, holes and LED references stay fixed.
  await page.locator("#station-rotate").click();
  let rotated = await state();
  assert.deepEqual(rotated.ledLayout, q.ledLayout);
  assert.deepEqual(rotated.layout.stations.at(-1).holes, s.holes);
  assert.equal(rotated.layout.stations.at(-1).markerAngle, 90);
  await page.locator("#station-parts").selectOption("0");
  assert.equal(await page.locator('[data-selected-point="0"]').count(), 1);
  assert.equal(await page.locator('[data-selected-point="1"]').count(), 0);
  await page.locator("#station-parts").selectOption("1");
  assert.equal(await page.locator("#station-snap-point").inputValue(), "1");
  await page.locator("#station-parts").selectOption("all");
  assert.equal(await page.locator("[data-selected-point]").count(), 2);
  await page.locator("#undo").click();
  assert.deepEqual((await state()).layout.stations.at(-1), s);
  await page.locator("#undo").click();
  assert.equal((await state()).layout.stations.length, 0);
  await page.locator("#redo").click();
  assert.deepEqual((await state()).ledLayout.bindings, q.ledLayout.bindings);
  // Whole-object moves preserve both strip identities and require two-hole confirmation.
  await click(leds[3].x, leds[3].y);
  await page.locator("#station-parts").selectOption("all");
  async function drag(a, b) {
    const from = await screen(a.x, a.y),
      to = await screen(b.x, b.y);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 5 });
    await page.mouse.up();
  }
  const pairBefore = await state();
  await drag(leds[3], leds[5]);
  await page.locator("#physical-dialog").waitFor({ state: "visible" });
  assert.equal(await page.locator("#physical-changes tr").count(), 2);
  assert.deepEqual(await state(), pairBefore);
  await page.locator("#physical-cancel").click();
  await drag(leds[3], leds[5]);
  await page.locator("#physical-confirm").click();
  let moved = await state();
  assert.equal(
    moved.ledLayout.bindings.find((b) => b.pointIndex === 0).ledId,
    leds[5].id,
  );
  assert.equal(
    moved.ledLayout.bindings.find((b) => b.pointIndex === 1).ledId,
    other[7].id,
  );
  assert.deepEqual(moved.ledLayout.segments, pairBefore.ledLayout.segments);
  await page.locator("#undo").click();
  await page.locator("#station-parts").selectOption("1");
  await drag(other[5], other[6]);
  await page.locator("#physical-confirm").click();
  moved = await state();
  assert.equal(
    moved.ledLayout.bindings.find((b) => b.pointIndex === 0).ledId,
    leds[3].id,
  );
  assert.equal(
    moved.ledLayout.bindings.find((b) => b.pointIndex === 1).ledId,
    other[6].id,
  );
  await page.locator("#undo").click();
  const holesBefore = (await state()).layout.stations[0].holes;
  await page.locator("#ring-outer").fill("7");
  await page.locator("#ring-outer").press("Tab");
  assert.deepEqual((await state()).layout.stations[0].holes, holesBefore);
  await page.locator("#undo").click();
  const jsonDownload = page.waitForEvent("download");
  await page.locator("#save").click();
  const jsonFile = await jsonDownload;
  const saved = JSON.parse(await readFile(await jsonFile.path(), "utf8"));
  await load({ ...placementFixture(), id: "empty-roundtrip" });
  await load(saved);
  assert.deepEqual(await state(), saved);
  const svgDownload = page.waitForEvent("download");
  await page.locator("#export").click();
  await page.locator("#export-download").click();
  const exported = await readFile(await (await svgDownload).path(), "utf8");
  assert.ok(!exported.includes("placement-preview"));
  assert.ok(exported.includes(`data-station="${pairId}"`));
  assert.ok(exported.includes('data-ring-point="1"'));
  // Deleting a two-strip station is one logical operation, with both bindings restored by undo.
  await click(leds[3].x, leds[3].y);
  await page.locator("#delete").click();
  await page.locator("#physical-confirm").click();
  assert.equal((await state()).layout.stations.length, 0);
  assert.equal((await state()).ledLayout.bindings.length, 0);
  await page.locator("#undo").click();
  assert.deepEqual(await state(), saved);
  await page.reload();
  assert.deepEqual(await state(), saved);
  await click(leds[3].x, leds[3].y);
  await page.locator("#set-template").click();
  await page.locator("#canvas").focus();
  await page.keyboard.press("s");
  assert.equal(await page.locator("#placement-mode").inputValue(), "double");
  assert.equal(
    await page
      .locator(".placement-preview")
      .getAttribute("data-placement-stage"),
    "first",
  );
  await page.keyboard.press("Escape");
  await page.locator("#undo").click();
  assert.deepEqual(await state(), saved);
  // Ambiguous overlapping strips require an explicit LED choice.
  const close = placementFixture();
  close.id = "ambiguous-fixture";
  close.ledLayout.segments[1].y = 100;
  await load(close);
  await page.locator("#canvas").focus();
  await page.keyboard.press("s");
  await page.locator("#placement-snap").selectOption("required");
  await move(leds[4].x, leds[4].y);
  assert.equal(
    await page
      .locator(".placement-preview")
      .getAttribute("data-placement-valid"),
    "false",
  );
  assert.match(
    await page.locator("#placement-status").textContent(),
    /Flere LED/,
  );
  await page.locator("#placement-led").selectOption("strip-B|strip-B:led:4");
  expected = await ghost();
  await click(leds[4].x, leds[4].y);
  q = await state();
  assert.equal(q.ledLayout.bindings[0].segmentId, "strip-B");
  assert.equal(
    canonicalMarkup(stationMarkup(q.layout.stations[0], "rings", q)),
    expected.rings,
  );
  assert.deepEqual(errors, []);
  // Real touchscreen: 64-screen-pixel finger offset and explicit confirmation.
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 820, height: 1180 },
  ]) {
    const touch = await browser.newPage({
      viewport,
      hasTouch: true,
      isMobile: true,
    });
    touch.setDefaultTimeout(10000);
    touch.on("pageerror", (e) => errors.push(e.message));
    await touch.goto(url);
    const empty = placementFixture();
    empty.id = "touch-" + viewport.width;
    await touch.locator("#file").setInputFiles({
      name: "touch.json",
      mimeType: "application/json",
      buffer: Buffer.from(serialize(empty)),
    });
    await touch.locator('[data-tool="station"]').tap();
    await touch.locator("#placement-snap").selectOption("off");
    await touch.locator("#snap").uncheck();
    await touch.locator("#snap-guides").uncheck();
    await touch.locator("#canvas").scrollIntoViewIfNeeded();
    const coord = await touch
      .locator("#canvas > g")
      .first()
      .evaluate((el) => {
        const m = el.getScreenCTM();
        return { x: 150 * m.a + m.e, y: 170 * m.d + m.f };
      });
    await touch.touchscreen.tap(coord.x, coord.y + 64);
    await touch
      .locator("#placement-touch-confirm")
      .waitFor({ state: "visible" });
    const preview = await touch
      .locator('.placement-preview [data-ring-point="0"] circle')
      .first()
      .evaluate((el) => ({
        x: +el.getAttribute("cx"),
        y: +el.getAttribute("cy"),
      }));
    const savedBefore = await touch.evaluate(() =>
      JSON.parse(localStorage.getItem("intransit-board-v1")),
    );
    assert.equal(savedBefore.layout.stations.length, 0);
    assert.ok(Math.abs(preview.x - 150) < 1.5);
    assert.ok(Math.abs(preview.y - 170) < 1.5);
    if (process.env.BOARD_PLACEMENT_SCREENSHOT)
      await touch.screenshot({
        path: process.env.BOARD_PLACEMENT_SCREENSHOT.replace(
          ".png",
          `-touch-${viewport.width}.png`,
        ),
        fullPage: false,
      });
    await touch.locator("#placement-touch-confirm").tap();
    const actual = await touch.evaluate(() =>
      JSON.parse(localStorage.getItem("intransit-board-v1")),
    );
    assert.equal(actual.layout.stations.length, 1);
    assert.ok(
      Math.abs(actual.layout.stations[0].ringCenters[0].x - preview.x) < 1e-8,
    );
    assert.ok(
      Math.abs(actual.layout.stations[0].ringCenters[0].y - preview.y) < 1e-8,
    );
    await touch.locator("#placement-symbol").selectOption("builtin-0-double");
    await touch.locator("#placement-mode").selectOption("common");
    async function touchLed(led) {
      await touch.locator("#canvas").scrollIntoViewIfNeeded();
      const pos = await touch
        .locator("#canvas > g")
        .first()
        .evaluate((el, p) => {
          const m = el.getScreenCTM();
          return { x: p.x * m.a + m.e, y: p.y * m.d + m.f };
        }, led);
      await touch.touchscreen.tap(pos.x, pos.y + 64);
    }
    await touchLed(leds[2]);
    await touch.locator("#placement-touch-confirm").tap();
    assert.equal(
      (
        await touch.evaluate(() =>
          JSON.parse(localStorage.getItem("intransit-board-v1")),
        )
      ).layout.stations.length,
      1,
    );
    await touchLed(other[4]);
    assert.equal(await touch.locator("[data-placement-target]").count(), 2);
    if (process.env.BOARD_PLACEMENT_SCREENSHOT)
      await touch.screenshot({
        path: process.env.BOARD_PLACEMENT_SCREENSHOT.replace(
          ".png",
          `-pair-touch-${viewport.width}.png`,
        ),
        fullPage: false,
      });
    await touch.locator("#placement-touch-confirm").tap();
    const touchPair = await touch.evaluate(() =>
      JSON.parse(localStorage.getItem("intransit-board-v1")),
    );
    assert.equal(touchPair.layout.stations.length, 2);
    assert.equal(touchPair.ledLayout.bindings.length, 2);
    assert.equal(touchPair.ledLayout.bindings[0].ledId, leds[2].id);
    assert.equal(touchPair.ledLayout.bindings[1].ledId, other[4].id);
    await touch.locator("#placement-touch-exit").tap();
    assert.equal(await touch.locator(".placement-preview").count(), 0);
    assert.equal(
      await touch.locator("#placement-touch-controls").isVisible(),
      false,
    );
    await touch.close();
  }
  assert.deepEqual(errors, []);
  console.log(
    "Placement Chromium PASS: S mouse ghost without screen jump and exact vector preview/commit, R/Shift+R/repeat/type selection/Escape/native text, physical snap through zoom/pan, two-strip double/reversed indices, A/B/all selection, bound marker rotation, whole-pair and individual moves with physical confirmation, style without hole movement, JSON/SVG downloads, deletion/undo, explicit ambiguous LED choice, real mobile/tablet single and two-strip touch placement",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
