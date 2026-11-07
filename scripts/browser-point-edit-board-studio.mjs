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
import { createProject } from "../web/board-studio/model.mjs";
import { placementFixture } from "./fixtures/board-studio-placement.mjs";
import { ledPositions } from "../web/board-studio/led-layout.mjs";
const url = `http://127.0.0.1:${server.address().port}/web/board-studio/index.html`;
try {
  const page = await browser.newPage({
      viewport: { width: 1600, height: 1100 },
    }),
    errors = [];
  page.setDefaultTimeout(10000);
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  const state = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("intransit-board-v1")));
  async function load(p) {
    await page.locator("#file").setInputFiles({
      name: "design.json",
      mimeType: "application/json",
      buffer: Buffer.from(serialize(p)),
    });
    await page.waitForFunction(
      (id) => JSON.parse(localStorage.getItem("intransit-board-v1"))?.id === id,
      p.id,
    );
  }
  async function screen(x, y) {
    return page
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
  }
  async function click(x, y) {
    const p = await screen(x, y);
    await page.mouse.click(p.x, p.y);
  }
  async function set(id, value) {
    await page.locator("#" + id).fill(String(value));
    await page.locator("#" + id).press("Tab");
  }
  await load(createProject(false));
  await page.locator("#canvas").focus();
  await page.keyboard.press("s");
  await page.locator("#placement-symbol").selectOption("builtin-0-double");
  await page.locator("#placement-snap").selectOption("off");
  await click(150, 200);
  await page.keyboard.press("Escape");
  let p = await state(),
    id = p.layout.stations[0].id,
    originalHoles = structuredClone(p.layout.stations[0].holes);
  await set("symbol-points", 3);
  p = await state();
  assert.equal(p.layout.stations[0].points, 3);
  assert.equal(await page.locator("#symbol-points").inputValue(), "3");
  assert.equal(
    await page
      .locator(`[data-layer="rings"] [data-station="${id}"] [data-ring-point]`)
      .count(),
    3,
  );
  assert.equal(await page.locator("#physical-dialog").isVisible(), false);
  await set("symbol-spacing", 5);
  await page.locator("#graphic-point").selectOption("1");
  await set("point-outer", 4);
  await set("point-inner", 3);
  await set("point-stroke", 0.1);
  p = await state();
  assert.equal(
    p.layout.stations[0].pointStyles[p.layout.stations[0].pointIds[1]]
      .ringOuter,
    4,
  );
  assert.deepEqual(p.layout.stations[0].holes.slice(0, 2), originalHoles);
  const savedA = await state();
  const download = page.waitForEvent("download");
  await page.locator("#save").click();
  const file = await download;
  const json = JSON.parse(await readFile(await file.path(), "utf8"));
  await load({ ...createProject(false), id: "blank-after-A" });
  await load(json);
  assert.deepEqual(await state(), savedA);
  await click(
    json.layout.stations[0].ringCenters[0].x,
    json.layout.stations[0].ringCenters[0].y,
  );
  await page.locator("#graphic-point").selectOption("1");
  const centresBefore = (await state()).layout.stations[0].ringCenters;
  await set("point-x", 170);
  await set("point-y", 220);
  p = await state();
  assert.deepEqual(p.layout.stations[0].ringCenters[0], centresBefore[0]);
  assert.deepEqual(p.layout.stations[0].ringCenters[2], centresBefore[2]);
  assert.deepEqual(p.layout.stations[0].holes.slice(0, 2), originalHoles);
  await page.locator("#points-vertical").click();
  let q = await state();
  assert.deepEqual(q.layout.stations[0].holes.slice(0, 2), originalHoles);
  await page.locator("#points-uniform").click();
  q = await state();
  assert.ok(
    Math.abs(
      q.layout.stations[0].ringCenters[0].x -
        q.layout.stations[0].ringCenters[2].x,
    ) < 1e-8,
  );
  // Live handles use precisely the same geometry at pointer release.
  await page.locator("#point-edit-toggle").click();
  const centre = q.layout.stations[0].ringCenters[1],
    a = await screen(centre.x, centre.y),
    b = await screen(centre.x + 7, centre.y + 3);
  await page.keyboard.down("Control");
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y);
  const preview = await page
    .locator(
      `[data-layer="rings"] [data-station="${id}"] [data-ring-point="1"] circle`,
    )
    .first()
    .getAttribute("cx");
  await page.mouse.up();
  await page.keyboard.up("Control");
  q = await state();
  assert.equal(q.layout.stations[0].ringCenters[1].x, +preview);
  assert.ok(
    Math.abs(q.layout.stations[0].ringCenters[1].x - centre.x - 7) < 0.01,
  );
  const h = await page
    .locator('[data-point-index="1"] [data-point-handle="size"]')
    .boundingBox();
  const cnow = q.layout.stations[0].ringCenters[1],
    end = await screen(cnow.x + 3, cnow.y);
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y);
  const liveR = +(await page
    .locator(
      `[data-layer="rings"] [data-station="${id}"] [data-ring-point="1"] circle`,
    )
    .first()
    .getAttribute("r"));
  await page.mouse.up();
  q = await state();
  assert.ok(
    Math.abs(
      q.layout.stations[0].pointStyles[q.layout.stations[0].pointIds[1]]
        .ringOuter -
        liveR * 2,
    ) < 1e-8,
  );
  assert.ok(Math.abs(liveR - 3) < 0.01);
  assert.deepEqual(q.layout.stations[0].holes.slice(0, 2), originalHoles);
  // Own styles and arbitrary positions survive a template/default placement and copy.
  for (const [index, size] of [6, 4, 7].entries()) {
    await page.locator("#graphic-point").selectOption(String(index));
    await set("point-outer", size);
  }
  await page.locator("#set-template").click();
  await page.locator("#canvas").focus();
  await page.keyboard.press("s");
  assert.equal(await page.locator("#placement-mode").inputValue(), "normal");
  await page.locator("#placement-snap").selectOption("off");
  await click(160, 300);
  await page.keyboard.press("Escape");
  p = await state();
  const placed = p.layout.stations.at(-1);
  assert.equal(placed.points, 3);
  assert.deepEqual(
    placed.pointIds.map((key) => placed.pointStyles[key].ringOuter),
    [6, 4, 7],
  );
  assert.notDeepEqual(placed.pointIds, p.layout.stations[0].pointIds);
  await set("symbol-points", 9);
  assert.equal(await page.locator("#edit-error").isVisible(), true);
  assert.match(await page.locator("#edit-error").textContent(), /1 til 8/);
  assert.equal((await state()).layout.stations.at(-1).points, 3);
  await set("symbol-points", 3);
  if (process.env.BOARD_POINT_EDIT_SCREENSHOT)
    await page.screenshot({
      path: process.env.BOARD_POINT_EDIT_SCREENSHOT.replace(
        ".png",
        "-free.png",
      ),
      fullPage: true,
    });
  // B: two real 5-mm strips touching edge to edge; compact graphics never lose bindings.
  p = placementFixture();
  p.ledLayout.segments[1].y = 105;
  await load(p);
  const ledsA = ledPositions(p, p.ledLayout.segments[0]),
    ledsB = ledPositions(p, p.ledLayout.segments[1]);
  await page.locator("#canvas").focus();
  await page.keyboard.press("s");
  await page.locator("#placement-mode").selectOption("common");
  await click(ledsA[4].x, ledsA[4].y);
  await click(ledsB[4].x, ledsB[4].y);
  await page.keyboard.press("Escape");
  q = await state();
  assert.equal(q.ledLayout.bindings.length, 2);
  const hardware = structuredClone(q.ledLayout),
    physical = structuredClone(q.layout.stations[0].holes);
  await page.locator("#points-fit").click();
  assert.ok((await state()).layout.stations[0].ringOuter < 5);
  await set("ring-outer", 2);
  await set("ring-inner", 1.2);
  await set("symbol-padding", 0);
  await page.locator("#graphic-point").selectOption("0");
  await set("point-x", 102);
  q = await state();
  assert.deepEqual(q.ledLayout, hardware);
  assert.deepEqual(q.layout.stations[0].holes, physical);
  assert.equal(await page.locator("#physical-dialog").isVisible(), false);
  await page.locator("#production-open").click();
  assert.equal(await page.locator("#prod-pdf").isDisabled(), true);
  assert.equal(await page.locator("#prod-graphics").isDisabled(), false);
  const artDownload = page.waitForEvent("download");
  await page.locator("#prod-graphics").click();
  const art = await readFile(await (await artDownload).path(), "utf8");
  assert.ok(art.includes('r="1"'));
  assert.ok(!art.includes("data-hole="));
  await page.locator("#production-close").click();
  await set("symbol-points", 3);
  q = await state();
  assert.equal(q.layout.stations[0].points, 3);
  assert.deepEqual(q.ledLayout, hardware);
  if (process.env.BOARD_POINT_EDIT_SCREENSHOT)
    await page.screenshot({
      path: process.env.BOARD_POINT_EDIT_SCREENSHOT.replace(
        ".png",
        "-compact.png",
      ),
      fullPage: true,
    });
  // Removing a bound point is controlled; cancellation preserves all data.
  await page.locator("#graphic-point").selectOption("0");
  const beforeDelete = await state();
  await page.locator("#point-remove").click();
  await page.locator("#physical-dialog").waitFor({ state: "visible" });
  assert.deepEqual(await state(), beforeDelete);
  await page.locator("#physical-cancel").click();
  await page.locator("#point-remove").click();
  await page.locator("#physical-confirm").click();
  q = await state();
  assert.equal(q.layout.stations[0].points, 2);
  assert.equal(q.ledLayout.bindings.length, 1);
  await page.locator("#undo").click();
  assert.deepEqual(await state(), beforeDelete);
  // C: original v0.6 JSON; releasing references does not leave a hidden point lock.
  const legacy = JSON.parse(
    await readFile(
      path.join(root, "docs/board-studio/examples/two-strip-stations-v06.json"),
      "utf8",
    ),
  );
  await load(legacy);
  const first = legacy.layout.stations[0].ringCenters[0];
  await click(first.x, first.y);
  await page.locator("#bind-point").selectOption("0");
  await page.locator("#bind-remove").click();
  await page.locator("#bind-point").selectOption("1");
  await page.locator("#bind-remove").click();
  await set("symbol-points", 3);
  assert.equal((await state()).layout.stations[0].points, 3);
  await page.locator("#undo").click();
  assert.equal((await state()).layout.stations[0].points, 2);
  await page.locator("#redo").click();
  assert.equal((await state()).layout.stations[0].points, 3);
  const example = JSON.parse(
    await readFile(
      path.join(
        root,
        "docs/board-studio/examples/free-station-design-v07.json",
      ),
      "utf8",
    ),
  );
  await load(example);
  const beforeExport = await state();
  assert.equal(beforeExport.version, 4);
  await page.locator("#production-open").click();
  assert.equal(await page.locator("#prod-pdf").isDisabled(), false);
  const holesFile = page.waitForEvent("download");
  await page.locator("#prod-svg").click();
  const drill = await readFile(await (await holesFile).path(), "utf8");
  const actual = await page.evaluate(
    (text) =>
      [
        ...new DOMParser()
          .parseFromString(text, "image/svg+xml")
          .querySelectorAll("[data-hole]"),
      ].map((el) => ({ x: +el.getAttribute("cx"), y: +el.getAttribute("cy") })),
    drill,
  );
  assert.deepEqual(actual, [
    { x: 115, y: 215 },
    { x: 115, y: 220 },
  ]);
  assert.deepEqual(await state(), beforeExport);
  await page.locator("#production-close").click();
  if (process.env.BOARD_POINT_EDIT_SCREENSHOT)
    await page.screenshot({
      path: process.env.BOARD_POINT_EDIT_SCREENSHOT,
      fullPage: true,
    });
  assert.deepEqual(errors, []);
  console.log(
    "Point editing Chromium PASS A–D: no-strip 2→3, spacing, individual styles/XY, uniform layout, exact live handles, template/default without count override, actual JSON reopen, visible errors, compact edge-to-edge strips with intact bindings, design despite mechanical warnings, independent graphic export, controlled deletion/cancel/undo and v0.6 migration",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
