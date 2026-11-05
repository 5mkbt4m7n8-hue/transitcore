import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const root = path.resolve(new URL("..", import.meta.url).pathname);
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
const base =
  process.env.BOARD_TEST_URL ||
  `http://127.0.0.1:${server.address().port}/web/board-studio/index.html`;
try {
  const page = await browser.newPage({
      viewport: { width: 1500, height: 1050 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base);
  await page
    .locator('[data-layer="rings"] [data-station="station-1"]')
    .waitFor();
  const saved = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("intransit-board-v1")));
  await page.getByLabel("Vis Stasjonsnavn", { exact: true }).uncheck();
  assert.equal(await page.locator("[data-label]").count(), 0);
  assert.equal(
    await page.locator('[data-layer="rings"] [data-station]').count(),
    16,
  );
  await page.getByLabel("Vis Stasjonsnavn", { exact: true }).check();
  await page.locator('[data-layer="rings"] [data-station="station-1"]').click();
  await page.locator("#station-x").fill("199.125");
  await page.locator("#station-x").press("Tab");
  assert.equal((await saved()).layout.stations[0].x, 199.125);
  await page.locator("#ring-outer").fill("8");
  await page.locator("#ring-outer").press("Tab");
  assert.equal((await saved()).layout.stations[0].holeDiameter, 2.5);
  await page.getByRole("button", { name: "Angre", exact: true }).click();
  assert.equal((await saved()).layout.stations[0].ringOuter, 6);
  await page.getByRole("button", { name: "Gjør om", exact: true }).click();
  assert.equal((await saved()).layout.stations[0].ringOuter, 8);
  await page
    .getByRole("button", { name: "Lås Stasjonsringer", exact: true })
    .click();
  assert.ok(await page.locator("#station-x").isDisabled());
  await page
    .getByRole("button", { name: "Lås Stasjonsringer", exact: true })
    .click();
  // Ctrl-click only selects, never merges.
  await page.keyboard.down("Control");
  await page
    .locator('[data-layer="rings"] [data-station="station-2"] circle')
    .first()
    .click();
  await page.keyboard.up("Control");
  assert.match(await page.locator("#selection-count").innerText(), /2 valgt/);
  assert.equal((await saved()).layout.stations.length, 16);
  const before = await saved();
  await page.locator("#station-x").fill("201.125");
  await page.locator("#station-x").press("Tab");
  const after = await saved();
  assert.equal(after.layout.stations[1].x - before.layout.stations[1].x, 2);
  await page.getByRole("button", { name: "Angre", exact: true }).click();
  // Names move independently from physical holes.
  await page.locator('[data-layer="rings"] [data-station="station-1"]').click();
  await page.locator("#label-dx").fill("15");
  await page.locator("#label-dx").press("Tab");
  assert.equal((await saved()).layout.stations[0].x, 199.125);
  await page.getByLabel("Eksporter Stasjonsnavn", { exact: true }).uncheck();
  const dlPromise = page.waitForEvent("download");
  await page.locator("#export").click();
  await page.locator("#export-download").click();
  const dl = await dlPromise;
  const exported = await readFile(await dl.path(), "utf8");
  assert.match(exported, /width="300mm"/);
  assert.ok(!exported.includes("<text"));
  await page.getByLabel("Eksporter Stasjonsnavn", { exact: true }).check();
  const jsonPromise = page.waitForEvent("download");
  await page.locator("#save").click();
  const json = await jsonPromise;
  const exact = await saved();
  await page.locator("#new").click();
  assert.equal(
    await page.locator('[data-layer="rings"] [data-station]').count(),
    0,
  );
  await page.locator("#file").setInputFiles(await json.path());
  await page
    .locator('[data-layer="rings"] [data-station="station-1"]')
    .waitFor();
  assert.deepEqual(await saved(), exact);
  await page.locator("#file").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"format":"other"}'),
  });
  await page.waitForFunction(() =>
    document.querySelector("#status").textContent.includes("Ukjent"),
  );
  assert.deepEqual(await saved(), exact);
  // Zoom at pointer then Space pan; no model edits.
  const pos = await page.locator("#canvas").boundingBox();
  await page.mouse.move(pos.x + pos.width / 2, pos.y + pos.height / 2);
  await page.mouse.wheel(0, -200);
  await page.waitForTimeout(100);
  assert.deepEqual(await saved(), exact);
  await page.keyboard.down("Space");
  await page.mouse.down();
  await page.mouse.move(
    pos.x + pos.width / 2 + 40,
    pos.y + pos.height / 2 + 20,
  );
  await page.mouse.up();
  await page.keyboard.up("Space");
  assert.deepEqual(await saved(), exact);
  await page.locator("#fit").click();
  await page.reload();
  await page
    .locator('[data-layer="rings"] [data-station="station-1"]')
    .waitFor();
  assert.deepEqual(await saved(), exact);
  // Phase B: symbols, physical holes, orientation and curve editing.
  await page
    .locator('[data-layer="rings"] [data-station="station-2"] circle')
    .first()
    .click();
  assert.equal(await page.locator("#symbol-points").inputValue(), "2");
  await page.locator("#symbol-spacing").fill("12.7");
  await page.locator("#symbol-spacing").press("Tab");
  assert.equal((await saved()).layout.stations[1].pointSpacing, 12.7);
  await page.locator("#symbol-angle").fill("45");
  await page.locator("#symbol-angle").press("Tab");
  assert.equal((await saved()).layout.stations[1].symbolAngle, 45);
  await page.locator("#symbol-angle").fill("");
  await page.locator("#symbol-angle").press("Tab");
  assert.equal((await saved()).layout.stations[1].symbolAngle, null);
  const capture = await saved();
  await page.locator("#ring-outer").fill("7");
  await page.locator("#ring-outer").press("Tab");
  assert.equal(
    (await saved()).layout.stations[1].pointSpacing,
    capture.layout.stations[1].pointSpacing,
  );
  await page.getByLabel("Vis Hull og boremarkeringer", { exact: true }).check();
  assert.equal(await page.locator('[data-hole="station-2"]').count(), 2);
  assert.equal(
    await page
      .locator('[data-layer="rings"] [data-station="station-2"] circle')
      .count(),
    4,
  );
  await page.getByLabel("Vis Kapsler og overganger", { exact: true }).uncheck();
  assert.equal(await page.locator('[data-layer="capsules"]').count(), 0);
  assert.equal(
    await page
      .locator('[data-layer="rings"] [data-station="station-2"] circle')
      .count(),
    4,
  );
  await page.getByLabel("Vis Kapsler og overganger", { exact: true }).check();
  // Select the SVG rail through actual pointer events.
  await page
    .locator('[data-layer="routes"] [data-route]')
    .first()
    .click({ position: { x: 1, y: 1 }, force: true });
  // The visible endpoint may hit a symbol: use a point midway on the central path.
  const middle = await page
    .locator('[data-layer="routes"] [data-part="core"]')
    .first()
    .evaluate((el) => {
      const p = el.getPointAtLength(el.getTotalLength() / 2),
        m = el.getScreenCTM();
      return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f };
    });
  await page.mouse.click(middle.x, middle.y);
  await page.locator("#route-tracks").selectOption("2");
  assert.equal((await saved()).layout.routes[0].tracks, 2);
  await page.locator("#route-length").fill("15");
  await page.locator("#route-length").press("Tab");
  await page.locator("#bend-x").fill("180");
  await page.locator("#bend-y").fill("60");
  await page.locator("#bend-save").click();
  assert.deepEqual((await saved()).layout.routes[0].bends[0], {
    x: 180,
    y: 60,
  });
  assert.ok(
    await page
      .locator('[data-layer="routes"] [data-part="core"]')
      .first()
      .getAttribute("d")
      .then((x) => x.includes("L")),
  );
  await page.locator("#edge-track").click();
  assert.equal((await saved()).layout.routes.length, 15);
  await page.locator("#route-tracks").selectOption("1");
  await page.locator("#undo").click();
  await page.locator("#undo").click();
  assert.equal((await saved()).layout.routes.length, 1);
  // v0.2 acceptance: real curve drag on shared logical geometry.
  await page.locator("#fixture").click();
  const rail = page
    .locator('[data-layer="routes"] [data-route="turn"][data-part="core"]')
    .first();
  const centre = await rail.evaluate((el) => {
    const p = el.getPointAtLength(el.getTotalLength() / 2),
      m = el.getScreenCTM();
    return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f };
  });
  await page.mouse.click(centre.x, centre.y);
  await page.locator('[data-handle="bend"]').waitFor();
  const initialCurve = await saved();
  const drag = await page.locator('[data-handle="bend"]').boundingBox();
  await page.mouse.move(drag.x + drag.width / 2, drag.y + drag.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    drag.x + drag.width / 2 - 12,
    drag.y + drag.height / 2 + 12,
    { steps: 8 },
  );
  assert.equal(
    (await saved()).layout.routes[0].bends[0].x,
    initialCurve.layout.routes[0].bends[0].x,
    "drag preview does not create history entries",
  );
  await page.mouse.up();
  const movedCurve = await saved();
  assert.notDeepEqual(
    movedCurve.layout.routes[0].bends,
    initialCurve.layout.routes[0].bends,
  );
  assert.deepEqual(
    movedCurve.layout.routes[0].trackIds,
    initialCurve.layout.routes[0].trackIds,
  );
  assert.deepEqual(
    movedCurve.layout.stations.map((s) => s.holes),
    initialCurve.layout.stations.map((s) => s.holes),
  );
  await page.locator("#canvas").focus();
  await page.keyboard.press("Control+z");
  assert.deepEqual(
    (await saved()).layout.routes[0].bends,
    initialCurve.layout.routes[0].bends,
  );
  await page.keyboard.press("Control+y");
  assert.deepEqual(
    (await saved()).layout.routes[0].bends,
    movedCurve.layout.routes[0].bends,
  );
  const numericHandle = await page.locator("#control-start").inputValue();
  const h = await page.locator('[data-handle="start"]').boundingBox();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
  await page.mouse.down();
  await page.mouse.move(h.x + h.width / 2 + 10, h.y + h.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
  assert.notEqual(
    await page.locator("#control-start").inputValue(),
    numericHandle,
  );
  const exactControls = await saved();
  await page.reload();
  await page.locator('[data-route="turn"]').first().waitFor();
  assert.deepEqual(await saved(), exactControls);
  const curveDownload = page.waitForEvent("download");
  await page.locator("#save").click();
  const curveJson = await curveDownload;
  await page.locator("#new").click();
  await page.locator("#file").setInputFiles(await curveJson.path());
  await page.locator('[data-route="turn"]').first().waitFor();
  assert.deepEqual(await saved(), exactControls);
  // SVG keeps track identities and contains no editor handles.
  const curvesSvg = page.waitForEvent("download");
  await page.locator("#export").click();
  await page.locator("#export-download").click();
  const exportedCurves = await curvesSvg;
  const curvesText = await readFile(await exportedCurves.path(), "utf8");
  assert.ok(curvesText.includes('data-track="turn:negative"'));
  assert.ok(!curvesText.includes("data-handle"));
  // Impossible geometry stays visible and cannot be exported as valid art.
  await page.locator("#fixture").click();
  const invalidRail = page
    .locator('[data-layer="routes"] [data-route="turn"][data-part="core"]')
    .first();
  const invalidPoint = await invalidRail.evaluate((el) => {
    const p = el.getPointAtLength(el.getTotalLength() / 2),
      m = el.getScreenCTM();
    return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f };
  });
  await page.mouse.click(invalidPoint.x, invalidPoint.y);
  await page.locator("#route-grow").fill("0");
  await page.locator("#route-grow").press("Tab");
  await page.locator("#route-radius").fill("2");
  await page.locator("#route-radius").press("Tab");
  assert.ok((await page.locator('[data-valid="false"]').count()) > 0);
  assert.ok(
    (await page.locator("#geometry-status").innerText()).includes("Ugyldig"),
  );
  let invalidDownloads = 0;
  const onInvalidDownload = () => invalidDownloads++;
  page.on("download", onInvalidDownload);
  await page.locator("#export").click();
  await page.locator("#export-download").click();
  await page.waitForTimeout(100);
  assert.equal(invalidDownloads, 0);
  page.off("download", onInvalidDownload);
  assert.ok(
    (await page.locator("#status").innerText()).includes("SVG stoppet"),
  );
  await page.locator("#export-close").click();
  if (process.env.BOARD_SCREENSHOT)
    await page.screenshot({
      path: process.env.BOARD_SCREENSHOT.replace(".png", "-invalid.png"),
      fullPage: true,
    });
  await page.locator("#route-grow").fill("20");
  await page.locator("#route-grow").press("Tab");
  assert.equal(await page.locator('[data-valid="false"]').count(), 0);
  assert.ok(
    (await page.locator("#geometry-status").innerText()).includes("utvidelse"),
  );
  // Exercise the tools with actual screen gestures on a blank board.
  await page.locator("#new").click();
  await page.locator("#fit").click();
  const screen = async (x, y) =>
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
  const clickMM = async (x, y) => {
    const p = await screen(x, y);
    await page.mouse.click(p.x, p.y);
  };
  await page
    .getByRole("button", { name: "Legg til stasjon", exact: true })
    .click();
  await clickMM(50, 50);
  await clickMM(100, 50);
  assert.equal((await saved()).layout.stations.length, 2);
  await page
    .getByRole("button", { name: "Koble stasjoner", exact: true })
    .click();
  await clickMM(50, 50);
  await clickMM(100, 50);
  assert.equal((await saved()).layout.routes.length, 1);
  await page
    .getByRole("button", { name: "Velg og flytt", exact: true })
    .click();
  await clickMM(50, 50);
  const from = await screen(50, 50),
    to = await screen(62, 62);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
  assert.equal((await saved()).layout.stations[0].x, 60);
  assert.equal((await saved()).layout.stations[0].y, 60);
  await page.locator("#label-angle").fill("-45");
  await page.locator("#label-angle").press("Tab");
  assert.equal((await saved()).layout.stations[0].label.angle, -45);
  await page.locator("#guide-value").fill("73");
  await page.locator("#guide-add").click();
  assert.deepEqual((await saved()).layout.guides, [{ axis: "x", value: 73 }]);
  const boxA = await screen(40, 35),
    boxB = await screen(110, 70);
  await page.mouse.move(boxA.x, boxA.y);
  await page.mouse.down();
  await page.mouse.move(boxB.x, boxB.y, { steps: 5 });
  await page.mouse.up();
  assert.match(await page.locator("#selection-count").innerText(), /2 valgt/);
  await page.getByRole("button", { name: "Mål i mm", exact: true }).click();
  const ma = await screen(30, 100),
    mb = await screen(130, 100);
  const stateBeforeMeasure = await saved();
  await page.mouse.move(ma.x, ma.y);
  await page.mouse.down();
  await page.mouse.move(mb.x, mb.y);
  await page.mouse.up();
  assert.ok(
    (await page.locator("#canvas").textContent()).includes("100.00 mm"),
  );
  assert.deepEqual(await saved(), stateBeforeMeasure);
  // Grid contrast and adaptive major/minor patterns at different zooms.
  await page.locator("#grid").check();
  const opacity = [];
  for (const contrast of ["faint", "normal", "strong"]) {
    await page.locator("#grid-contrast").selectOption(contrast);
    opacity.push(
      +(await page.locator('[data-grid="major"] path').getAttribute("opacity")),
    );
  }
  assert.ok(opacity[0] < opacity[1] && opacity[1] < opacity[2]);
  for (let i = 0; i < 6; i++) await page.locator("#zoom-out").click();
  assert.equal(await page.locator("[data-grid]").count(), 2);
  const minor = +(await page
    .locator('[data-grid="minor"]')
    .getAttribute("data-spacing"));
  assert.ok(minor >= 5);
  await page.locator("#fit").click();
  // Align a moving station against a separate physical LED hole; guides do
  // not change raw coordinates unless the user enabled snapping.
  const guided = await saved();
  guided.layout.stations[1].holes = [{ id: "target-hole", x: 83, y: 97 }];
  await page.locator("#file").setInputFiles({
    name: "guided.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(guided)),
  });
  await page
    .getByRole("button", { name: "Velg og flytt", exact: true })
    .click();
  await page.locator("#snap").uncheck();
  await page.locator("#snap-guides").uncheck();
  const mmScreen = async (x, y) =>
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
  for (const snapping of [false, true]) {
    if (snapping) {
      await page.locator("#snap").check();
      await page.locator("#snap-guides").check();
    }
    const state = await saved(),
      station = state.layout.stations[0],
      start = await mmScreen(station.x, station.y),
      end = await mmScreen(83.6, 120.4);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(end.x, end.y, { steps: 6 });
    assert.ok(
      (await page.locator('[data-smart-kind="hole"]').count()) > 0,
      "physical-hole guide is visible during drag",
    );
    await page.mouse.up();
    const moved = (await saved()).layout.stations[0];
    if (snapping) assert.equal(moved.x, 83);
    else
      assert.ok(
        Math.abs(moved.x - 83.6) < 0.1,
        "snapping off preserves raw millimetres",
      );
    assert.equal(await page.locator(".smart-guides").count(), 0);
  }
  // Per-edge numeric controls follow the selected segment, not the previous one.
  await page.locator("#demo").click();
  const edgeRail = page
    .locator(
      '[data-layer="routes"] [data-route="route-1"][data-edge="0"][data-part="core"]',
    )
    .first();
  const edgePoint = await edgeRail.evaluate((el) => {
    const p = el.getPointAtLength(el.getTotalLength() / 2),
      m = el.getScreenCTM();
    return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f };
  });
  await page.mouse.click(edgePoint.x, edgePoint.y);
  await page.locator("#control-start").fill("7");
  await page.locator("#control-start").press("Tab");
  await page.locator("#route-edge").selectOption("1");
  assert.notEqual(await page.locator("#control-start").inputValue(), "7");
  await page.locator("#control-start").fill("9");
  await page.locator("#control-start").press("Tab");
  assert.equal((await saved()).layout.routes[0].controls[0].startReach, 7);
  assert.equal((await saved()).layout.routes[0].controls[1].startReach, 9);
  // Return to an untouched reference study for the screenshot.
  await page.locator("#demo").click();
  await page
    .getByRole("button", { name: "Velg og flytt", exact: true })
    .click();
  await page.locator("#grid").uncheck();
  await page.locator("aside").evaluate((el) => (el.scrollTop = 0));
  if (process.env.BOARD_SCREENSHOT) {
    await mkdir(path.dirname(process.env.BOARD_SCREENSHOT), {
      recursive: true,
    });
    await page.screenshot({
      path: process.env.BOARD_SCREENSHOT,
      fullPage: true,
    });
  }
  if (process.env.BOARD_SCREENSHOT) {
    await page.locator("#fixture").click();
    const target = page
      .locator('[data-layer="routes"] [data-route="rotated"][data-part="core"]')
      .first();
    const screenPt = await target.evaluate((el) => {
      const p = el.getPointAtLength(el.getTotalLength() / 2),
        m = el.getScreenCTM();
      return { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f };
    });
    await page.mouse.click(screenPt.x, screenPt.y);
    await page.locator("#grid").check();
    await page.locator("#grid-contrast").selectOption("normal");
    await page.locator("aside").evaluate((el) => (el.scrollTop = 0));
    await page.screenshot({
      path: process.env.BOARD_SCREENSHOT.replace(".png", "-curves.png"),
      fullPage: true,
    });
    const comparison = await browser.newPage({
      viewport: { width: 1440, height: 650 },
    });
    await comparison.goto(
      `http://127.0.0.1:${server.address().port}/docs/board-studio/geometry-comparison.html`,
    );
    await comparison.screenshot({
      path: process.env.BOARD_SCREENSHOT.replace(".png", "-comparison.png"),
      fullPage: true,
    });
    await comparison.close();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "mobile no horizontal page overflow",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Board Studio v0.2 Chromium A–H: shared-curve handles, stable tracks/holes, Ctrl+Z/Y, contrast/dual grid, hole guides with snap off/on, invalid/adjusted preview and export block; regression: layer visibility/locks, precision, independent labels/rings/holes, multiselect, undo/redo, SVG download, JSON round-trip, invalid files, zoom/pan, persistence and mobile PASS",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
