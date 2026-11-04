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
  await page
    .locator("#file")
    .setInputFiles({
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
      .then((x) => x.includes("A")),
  );
  await page.locator("#edge-track").click();
  assert.equal((await saved()).layout.routes.length, 15);
  await page.locator("#route-tracks").selectOption("1");
  await page.locator("#undo").click();
  await page.locator("#undo").click();
  assert.equal((await saved()).layout.routes.length, 1);
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
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "mobile no horizontal page overflow",
  );
  assert.deepEqual(errors, []);
  console.log(
    "Board Studio Chromium: layer visibility/locks, precision, independent labels/rings/holes, multiselect, undo/redo, SVG download, JSON round-trip, invalid files, zoom/pan, persistence and mobile PASS",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
