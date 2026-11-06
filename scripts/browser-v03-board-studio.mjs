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
let page;
try {
  page = await browser.newPage({ viewport: { width: 1500, height: 1050 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    `http://127.0.0.1:${server.address().port}/web/board-studio/index.html`,
  );
  const state = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("intransit-board-v1")));
  await page.evaluate(() => {
    window.placementPointerLog = [];
    document.addEventListener(
      "pointerdown",
      (e) => {
        window.placementPointerLog.push({
          x: e.clientX,
          y: e.clientY,
          tag: e.target.tagName,
          id: e.target.id,
          parent: e.target.parentElement?.id,
        });
        window.placementPointerLog = window.placementPointerLog.slice(-4);
      },
      true,
    );
  });
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
    const p = await screen(x, y);
    await page.mouse.click(p.x, p.y);
  }
  await page.locator("#new").click();
  await page.locator("#library-toggle").click();
  await page.locator("#library-category").selectOption("Trondheim buss");
  assert.equal(await page.locator("[data-symbol]").count(), 6);
  await page.locator('[data-symbol="builtin-0-double"]').click();
  await click(100, 100);
  let s = await state();
  assert.equal(s.layout.stations[0].points, 2);
  assert.equal(s.layout.stations[0].capsuleType, "none");
  await page.locator("#library-name").fill("Min bussholdeplass");
  await page.locator("#library-save").click();
  const record = (await state()).library.templates[0];
  await page.locator(`[data-symbol-default="${record.id}"]`).click();
  await page
    .getByRole("button", { name: "Legg til stasjon", exact: true })
    .click();
  await click(160, 160);
  assert.equal(
    (await state()).layout.stations.length,
    2,
    JSON.stringify(
      await page.evaluate(() => ({
        events: window.placementPointerLog,
        status: document.querySelector("#status").textContent,
        placement: document.querySelector("#placement-status").textContent,
        valid: document
          .querySelector(".placement-preview")
          ?.getAttribute("data-placement-valid"),
        errors: document.querySelector("#geometry-status").textContent,
      })),
    ),
  );

  await page
    .getByRole("button", { name: "Velg og flytt", exact: true })
    .click();
  const ids = (await state()).layout.stations.map((s) => s.id);
  await page
    .locator(`[data-layer="rings"] [data-station="${ids[0]}"] circle`)
    .first()
    .click();
  await page.keyboard.down("Control");
  await page
    .locator(`[data-layer="rings"] [data-station="${ids[1]}"] circle`)
    .first()
    .click();
  await page.keyboard.up("Control");
  const holes = (await state()).layout.stations.map((s) => s.holes);
  await page.locator("#ring-outer").fill("7");
  await page.locator("#ring-outer").press("Tab");
  assert.ok((await state()).layout.stations.every((s) => s.ringOuter === 7));
  assert.deepEqual(
    (await state()).layout.stations.map((s) => s.holes),
    holes,
  );
  await page.locator("#undo").click();
  assert.ok((await state()).layout.stations.every((s) => s.ringOuter === 6));
  await page.locator("#redo").click();
  const oldPlaced = (await state()).layout.stations;
  await page.locator(`[data-symbol-update="${record.id}"]`).click();
  assert.deepEqual((await state()).layout.stations, oldPlaced);
  record.template = (await state()).library.templates[0].template;
  assert.equal(record.template.appearance.ringOuter, 7);
  const exported = page.waitForEvent("download");
  await page.locator("#library-export").click();
  const file = await exported;
  await page.locator("#new").click();
  await page.locator("#library-file").setInputFiles(await file.path());
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("intransit-board-v1")).library.templates
        .length === 1,
  );
  assert.notEqual((await state()).library.templates[0].id, record.id);
  assert.deepEqual(
    (await state()).library.templates[0].template,
    record.template,
  );
  await page.locator("#library-close").click();
  await page.locator("#led-toggle").click();
  await page.locator("#led-add-profile").click();
  await page.locator("#seg-x").fill("20");
  await page.locator("#seg-y").fill("30");
  await page.locator("#seg-count").fill("4");
  await page.locator("#seg-manual").check();
  await page.locator("#seg-length").fill("40");
  await page.locator("#segment-save").click();
  let physical = await state();
  const seg = physical.ledLayout.segments[0];
  assert.equal(await page.locator("[data-led]").count(), 4);
  assert.deepEqual(
    await page
      .locator("[data-led]")
      .evaluateAll((nodes) => nodes.map((n) => [+n.dataset.x, +n.dataset.y])),
    [
      [25, 30],
      [35, 30],
      [45, 30],
      [55, 30],
    ],
  );
  await page.locator("#seg-angle").fill("45");
  await page.locator("#segment-save").click();
  assert.ok(
    Math.abs(
      +(await page.locator("[data-led]").first().getAttribute("data-x")) -
        (20 + 5 * Math.SQRT1_2),
    ) < 1e-10,
  );
  assert.equal(await page.locator("[data-coordinate-led]").count(), 4);
  await page.locator("#undo").click();
  assert.equal((await state()).ledLayout.segments[0].angle, 0);
  await page.locator("#redo").click();
  assert.equal((await state()).ledLayout.segments[0].angle, 45);
  console.log(
    "v0.3 B Chromium PASS: create profile and physical segment, exact DOM coordinates, 45-degree rotation, coordinate table and history",
  );
  await page.locator("#seg-x").fill("25");
  await page.locator("#segment-save").click();
  assert.equal((await state()).ledLayout.segments[0].x, 25);
  assert.equal(await page.locator("#physical-dialog[open]").count(), 0);
  await page.locator("#seg-x").fill("20");
  await page.locator("#segment-save").click();
  await page.locator("#seg-angle").fill("0");
  await page.locator("#segment-save").click();
  await page.locator("#led-close").click();
  await page.locator("#library-toggle").click();
  await page.locator('[data-symbol="builtin-0-single"]').click();
  await click(120, 120);
  await page.locator("#library-close").click();
  let physicalBefore = await state(),
    station = physicalBefore.layout.stations[0];
  await page.locator("#bind-led").selectOption({ index: 2 });
  await page.locator("#bind-apply").click();
  await page.locator("#physical-dialog").waitFor();
  assert.deepEqual(await state(), physicalBefore);
  assert.ok(
    (await page.locator("#physical-changes").innerText()).includes(
      "Ny stasjon",
    ),
  );
  await page.locator("#physical-cancel").click();
  assert.deepEqual(await state(), physicalBefore);
  await page.locator("#bind-apply").click();
  await page.locator("#physical-confirm").click();
  let boundState = await state();
  assert.equal(boundState.ledLayout.bindings.length, 1);
  assert.equal(boundState.layout.stations[0].holes[0].x, 45);
  assert.equal(boundState.layout.stations[0].holes[0].y, 30);
  assert.equal(boundState.layout.stations[0].ringCenters[0].x, 45);
  await page.locator("#led-toggle").click();
  await page.locator("#seg-x").fill("25");
  await page.locator("#segment-save").click();
  assert.equal((await state()).ledLayout.segments[0].x, 20);
  await page.locator("#physical-cancel").click();
  assert.equal((await state()).layout.stations[0].holes[0].x, 45);
  await page.locator("#seg-x").fill("25");
  await page.locator("#segment-save").click();
  await page.locator("#physical-confirm").click();
  assert.equal((await state()).layout.stations[0].holes[0].x, 50);
  await page.locator("#undo").click();
  assert.equal((await state()).layout.stations[0].holes[0].x, 45);
  await page.locator("#redo").click();
  assert.equal((await state()).layout.stations[0].holes[0].x, 50);
  await page.locator("#led-editor details").first().locator("summary").click();
  await page.locator("#profile-pitch").fill("10.2");
  await page.locator("#profile-save").click();
  await page.locator("#physical-dialog").waitFor();
  const beforePitch = await state(),
    ledIdentity = beforePitch.ledLayout.bindings[0].ledId;
  await page.locator("#physical-confirm").click();
  assert.equal((await state()).ledLayout.bindings[0].ledId, ledIdentity);
  assert.ok(
    Math.abs((await state()).layout.stations[0].holes[0].x - 50.4) < 1e-8,
  );
  await page.locator("#led-close").click();
  await page.locator("#library-toggle").click();
  await page.locator('[data-symbol="builtin-0-shared"]').click();
  await click(150, 140);
  await page.locator("#library-close").click();
  await page.locator("#bind-led").selectOption(ledIdentity);
  const conflictBefore = await state();
  await page.locator("#bind-apply").click();
  assert.deepEqual(await state(), conflictBefore);
  assert.ok((await page.locator("#status").innerText()).includes("allerede"));
  await page.locator("#bind-share").check();
  await page.locator("#bind-apply").click();
  await page.locator("#physical-confirm").click();
  assert.ok((await state()).ledLayout.bindings.every((b) => b.shared));
  await page.locator("#bind-remove").click();
  assert.equal((await state()).ledLayout.bindings.length, 1);
  await page.locator("#bind-mode").selectOption("lightguide");
  await page.locator("#bind-led").selectOption({ index: 3 });
  await page.locator("#bind-click").click();
  const clickLed = page.locator("[data-led]").nth(3).locator("circle");
  await clickLed.click();
  assert.equal((await state()).ledLayout.bindings.at(-1).mode, "lightguide");
  assert.equal((await state()).layout.stations.at(-1).holes[0].x, 50.4);
  const savedProject = page.waitForEvent("download");
  await page.locator("#save").click();
  const json = await savedProject,
    exact = await state();
  await page.locator("#new").click();
  await page.locator("#file").setInputFiles(await json.path());
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("intransit-board-v1")).ledLayout.bindings
        .length === 2,
  );
  assert.deepEqual(await state(), exact);
  await page.locator("#trondheim-demo").click();
  assert.equal((await state()).layout.stations.length, 12);
  assert.equal((await state()).ledLayout.segments.length, 3);
  assert.equal((await state()).ledLayout.bindings.length, 18);
  assert.equal(await page.locator("[data-led]").count(), 72);
  assert.ok(
    (await page.locator("#mechanical-report").innerText()).includes(
      "ingen funn",
    ),
  );
  const intervalState = await state(),
    intervalStation = intervalState.layout.stations.find(
      (s) => s.name === "Lerkendal",
    );
  await page.locator(`[data-label="${intervalStation.id}"]`).click();
  await page.locator("#names-to-stations").click();
  for (const interval of [1, 2, 3, 4]) {
    await page.locator("#bind-led").selectOption({ index: 0 });
    await page.locator("#bind-interval").selectOption(String(interval));
    await page.locator("#bind-next").click();
    assert.equal(
      await page.locator("#bind-led").evaluate((el) => el.selectedIndex),
      interval,
    );
  }
  await page.locator("#bind-interval").selectOption("custom");
  const cursor = await page.locator("#bind-led").inputValue();
  await page.locator("#bind-next").click();
  assert.equal(await page.locator("#bind-led").inputValue(), cursor);
  assert.deepEqual(await state(), intervalState);
  if (process.env.BOARD_V03_SCREENSHOT) {
    await mkdir(path.dirname(process.env.BOARD_V03_SCREENSHOT), {
      recursive: true,
    });
    await page.screenshot({
      path: process.env.BOARD_V03_SCREENSHOT,
      fullPage: true,
    });
  }
  console.log(
    "v0.3 C Chromium PASS: binding preview/cancel/confirm, bound segment movement, undo/redo, pitch and LED identity, explicit sharing/conflict, click-to-bind lightguide, JSON roundtrip and Trondheim prototype",
  );
  if (process.env.BOARD_V03_SCREENSHOT) {
    await page.locator("aside").evaluate((el) => (el.scrollTop = 0));
    await page.screenshot({
      path: process.env.BOARD_V03_SCREENSHOT,
      fullPage: true,
    });
    await page.locator("#library-toggle").click();
    await page.screenshot({
      path: process.env.BOARD_V03_SCREENSHOT.replace(".png", "-library.png"),
      fullPage: true,
    });
    await page.locator("#library-close").click();
    const lerkendal = (await state()).layout.stations.find(
      (s) => s.name === "Lerkendal",
    );
    await page.locator(`[data-label="${lerkendal.id}"]`).click();
    await page.locator("#names-to-stations").click();
    await page.locator("#station-bindings").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: process.env.BOARD_V03_SCREENSHOT.replace(".png", "-binding.png"),
      fullPage: true,
    });
    await page.locator("#led-toggle").click();
    await page.locator("#led-segment").selectOption("strip-S02");
    await page.locator("#seg-x").fill("40");
    const original = await state();
    await page.locator("#segment-save").click();
    await page.locator("#physical-dialog").waitFor();
    assert.deepEqual(await state(), original);
    await page.screenshot({
      path: process.env.BOARD_V03_SCREENSHOT.replace(
        ".png",
        "-confirmation.png",
      ),
      fullPage: true,
    });
    await page.locator("#physical-cancel").click();
    assert.deepEqual(await state(), original);
  }
  assert.deepEqual(errors, []);
  console.log(
    "v0.3 A Chromium PASS: category previews, placement, saved/default symbols, mass ring style with fixed holes, history and template export/import",
  );
} catch (e) {
  throw e;
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
