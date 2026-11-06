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
import { trondheimPrototype } from "../web/board-studio/prototype.mjs";
import { ledFixture } from "./fixtures/board-studio-v031.mjs";
import { mkdir, writeFile } from "node:fs/promises";
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
  let count = 0;
  async function load(p) {
    p = structuredClone(p);
    p.id = "production-" + ++count;
    await page.locator("#file").setInputFiles({
      name: "project.json",
      mimeType: "application/json",
      buffer: Buffer.from(serialize(p)),
    });
    await page.waitForFunction(
      (id) => JSON.parse(localStorage.getItem("intransit-board-v1")).id === id,
      p.id,
    );
    return p;
  }
  const original = await load(trondheimPrototype());
  const output = process.env.BOARD_PRODUCTION_OUTPUT;
  if (output) {
    await mkdir(output, { recursive: true });
    await writeFile(path.join(output, "source.json"), serialize(original));
  }
  async function download(id, name) {
    const pending = page.waitForEvent("download");
    await page.locator("#" + id).click();
    const file = await pending,
      data = await readFile(await file.path());
    if (output) await writeFile(path.join(output, name), data);
    return data;
  }
  await page.locator("#production-open").click();
  assert.ok(
    (await page.locator("#production-dialog").boundingBox()).width > 900,
  );
  assert.match(
    await page.locator("#prod-summary").textContent(),
    /18 fysiske hull/,
  );
  assert.match(await page.locator("#prod-summary").textContent(), /4 ark/);
  assert.equal(await page.locator("#prod-page option").count(), 4);
  assert.equal(await page.locator("#prod-pdf").isDisabled(), false);
  assert.equal(
    await page.locator("#prod-preview svg").getAttribute("width"),
    "210mm",
  );
  const frontPdf = await download("prod-pdf", "front-a4.pdf");
  assert.ok(frontPdf.toString().startsWith("%PDF-1.7"));
  assert.equal((frontPdf.toString().match(/\/Type \/Page /g) ?? []).length, 4);
  const frontSvg = (await download("prod-svg", "front.svg")).toString();
  const frontHoles = await page.evaluate((text) => {
    const root = new DOMParser().parseFromString(
      text,
      "image/svg+xml",
    ).documentElement;
    return {
      width: root.getAttribute("width"),
      height: root.getAttribute("height"),
      holes: [...root.querySelectorAll("[data-hole]")].map((el) => ({
        id: el.getAttribute("data-hole"),
        x: +el.getAttribute("cx"),
        y: +el.getAttribute("cy"),
        r: +el.getAttribute("r"),
      })),
      layers: [...root.querySelectorAll('[id^="production-"]')].map(
        (el) => el.id,
      ),
    };
  }, frontSvg);
  assert.equal(frontHoles.width, "330mm");
  assert.equal(frontHoles.height, "430mm");
  assert.equal(frontHoles.holes.length, 18);
  assert.equal(
    frontHoles.holes[0].x,
    original.layout.stations[0].holes[0].x + 15,
  );
  assert.equal(
    frontHoles.holes[0].r,
    original.layout.stations[0].holeDiameter / 2,
  );
  assert.ok(frontHoles.layers.includes("production-centers"));
  assert.ok(!frontSvg.includes("data-port="));
  await page.locator("#prod-side").selectOption("back");
  const rearSvg = (await download("prod-svg", "back.svg")).toString();
  const backX = await page.evaluate(
    (text) =>
      +new DOMParser()
        .parseFromString(text, "image/svg+xml")
        .querySelector("[data-hole]")
        .getAttribute("cx"),
    rearSvg,
  );
  assert.equal(backX, 300 - original.layout.stations[0].holes[0].x + 15);
  await download("prod-pdf", "back-a4.pdf");
  const machine = (
    await download("prod-machining", "back-machine.svg")
  ).toString();
  assert.ok(machine.includes('width="300mm"'));
  assert.ok(!machine.includes("<text"));
  const art = (await download("prod-graphics", "back-graphics.svg")).toString();
  assert.ok(art.includes("translate(300 0) scale(-1 1)"));
  assert.ok(!art.includes("data-hole="));
  const csv = (await download("prod-csv", "back.csv")).toString();
  assert.equal(csv.split("\r\n").filter(Boolean).length, 19);
  assert.deepEqual(await state(), original);
  await page.locator("#prod-paper").selectOption("board");
  assert.equal(await page.locator("#prod-page option").count(), 1);
  assert.equal(
    await page.locator("#prod-preview svg").getAttribute("width"),
    "330mm",
  );
  await page.locator("#prod-side").selectOption("front");
  await download("prod-pdf", "front-board.pdf");
  await page.locator("#prod-paper").selectOption("a4-landscape");
  assert.equal(await page.locator("#prod-page option").count(), 6);
  await download("prod-pdf", "front-landscape.pdf");
  await page.locator("#prod-paper").selectOption("board");
  // Saving preferences is explicit and reversible; exporting itself is read-only.
  await page.locator("#prod-side").selectOption("back");
  await page.locator("#prod-save").click();
  const saved = await state();
  assert.equal(saved.production.exportSettings.side, "back");
  assert.deepEqual(saved.layout, original.layout);
  assert.deepEqual(saved.ledLayout, original.ledLayout);
  assert.equal(saved.production.exportSettings.allowUnbound, undefined);
  await page.locator("#production-close").click();
  await page.locator("#undo").click();
  assert.deepEqual(await state(), original);
  await page.locator("#redo").click();
  assert.deepEqual(await state(), saved);
  const projectDownload = await download("save", "saved-project.json");
  await page.locator("#new").click();
  await page.locator("#file").setInputFiles({
    name: "saved.json",
    mimeType: "application/json",
    buffer: projectDownload,
  });
  await page.waitForFunction(
    () =>
      JSON.parse(localStorage.getItem("intransit-board-v1")).production
        .exportSettings?.side === "back",
  );
  await page.locator("#production-open").click();
  assert.equal(await page.locator("#prod-side").inputValue(), "back");
  assert.equal(await page.locator("#prod-paper").inputValue(), "board");
  await page.locator("#production-close").click();
  const unbound = await load(ledFixture());
  await page.locator("#production-open").click();
  assert.equal(await page.locator("#prod-pdf").isDisabled(), true);
  await page.locator("#prod-unbound").check();
  assert.equal(await page.locator("#prod-pdf").isDisabled(), false);
  await download("prod-pdf", "acknowledged-unbound.pdf");
  assert.deepEqual(await state(), unbound);
  await page.locator("#production-close").click();
  await page.locator("#production-open").click();
  assert.equal(await page.locator("#prod-unbound").isChecked(), false);
  assert.equal(await page.locator("#prod-pdf").isDisabled(), true);
  await page.locator("#production-close").click();
  const bad = trondheimPrototype();
  bad.layout.stations[0].holes[0].x = -5;
  const badOriginal = await load(bad);
  await page.locator("#production-open").click();
  assert.equal(await page.locator("#prod-pdf").isDisabled(), true);
  assert.equal(await page.locator("#prod-svg").isDisabled(), true);
  assert.match(await page.locator("#prod-report").textContent(), /utenfor/);
  assert.deepEqual(await state(), badOriginal);
  await page.locator("#production-close").click();
  await load(original);
  await page.locator("#production-open").click();
  await page.setViewportSize({ width: 390, height: 844 });
  const mobileDialog = await page.locator("#production-dialog").boundingBox();
  assert.ok(mobileDialog.x >= 0 && mobileDialog.x + mobileDialog.width <= 391);
  await page.setViewportSize({ width: 1600, height: 1100 });
  if (process.env.BOARD_PRODUCTION_SCREENSHOT)
    await page.screenshot({
      path: process.env.BOARD_PRODUCTION_SCREENSHOT,
      fullPage: true,
    });
  assert.deepEqual(errors, []);
  console.log(
    "Production Chromium PASS: real front/back vector PDF/SVG/CSV downloads, A4 tiling and full-size media, exact SVG physical holes and mirrored artwork, read-only export, saved preferences/history/JSON, explicit unbound acknowledgement, blocked physical errors and preview",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
