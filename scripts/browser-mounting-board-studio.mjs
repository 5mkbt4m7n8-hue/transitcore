import { addCorners } from "../web/board-studio/mounting.mjs";
import { trondheimPrototype } from "../web/board-studio/prototype.mjs";
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
  const empty = createProject();
  empty.layout = { stations: [], routes: [], guides: [] };
  await page.locator("#file").setInputFiles({
    name: "empty.json",
    mimeType: "application/json",
    buffer: Buffer.from(serialize(empty)),
  });
  const state = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("intransit-board-v1")));
  await page.locator("#mount-toggle").click();
  await page.locator("#mount-name").fill("Feste A");
  await page.locator("#mount-x").fill("30");
  await page.locator("#mount-y").fill("40");
  await page.locator("#mount-save").click();
  let p = await state();
  assert.equal(p.production.mountingHoles.length, 1);
  const id = p.production.mountingHoles[0].id;
  assert.equal(await page.locator("[data-mounting]").count(), 1);
  await page.locator("#mount-x").fill("35");
  await page.locator("#mount-save").click();
  await page.locator("#physical-dialog").waitFor({ state: "visible" });
  assert.equal((await state()).production.mountingHoles[0].x, 30);
  await page.locator("#physical-cancel").click();
  assert.equal((await state()).production.mountingHoles[0].x, 30);
  await page.locator("#mount-diameter").fill("4");
  await page.locator("#mount-save").click();
  assert.match(
    await page.locator("#physical-changes").innerText(),
    /Ø 3.2 → 4/,
  );
  await page.locator("#physical-confirm").click();
  assert.equal((await state()).production.mountingHoles[0].diameter, 4);
  await page.locator("#undo").click();
  assert.equal((await state()).production.mountingHoles[0].diameter, 3.2);
  await page.locator("#redo").click();
  await page.locator("#mount-preview").click();
  assert.equal(await page.locator("#mount-preview-overlay circle").count(), 4);
  assert.equal((await state()).production.mountingHoles.length, 1);
  await page.locator("#mount-corners").click();
  assert.equal((await state()).production.mountingHoles.length, 5);
  await page.locator("#undo").click();
  assert.equal((await state()).production.mountingHoles.length, 1);
  await page.locator("#redo").click();
  await page.locator("#mount-preview").click();
  assert.equal(await page.locator("#mount-corners").isDisabled(), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#mount-preview-overlay").count(), 0);
  await page.locator("#mount-select").selectOption(id);
  await page.locator("#mount-delete").click();
  await page.locator("#physical-confirm").click();
  assert.equal((await state()).production.mountingHoles.length, 4);
  await page.locator("#undo").click();
  assert.equal((await state()).production.mountingHoles[0].id, id);
  await page.locator('[data-lock="mounting"]').click();
  assert.equal(await page.locator("#mount-save").isDisabled(), true);
  await page.locator('[data-lock="mounting"]').click();
  // Move an existing hole by pointer with Ctrl: exact mm delta, no silent commit.
  await page.locator("#mount-select").selectOption(id);
  await page.locator("#mount-x").fill("160");
  await page.locator("#mount-y").fill("160");
  await page.locator("#mount-save").click();
  await page.locator("#physical-confirm").click();
  await page.locator("#mount-close").click();
  const screen = await page
    .locator(`[data-mounting="${id}"] circle`)
    .evaluate((el) => {
      const m = el.getScreenCTM(),
        p = new DOMPoint(
          +el.getAttribute("cx"),
          +el.getAttribute("cy"),
        ).matrixTransform(m);
      return { x: p.x, y: p.y, scale: m.a };
    });
  await page.mouse.move(screen.x, screen.y);
  await page.keyboard.down("Control");
  await page.mouse.down();
  await page.mouse.move(screen.x + 17.3, screen.y + 11.7);
  await page.mouse.up();
  await page.keyboard.up("Control");
  await page.locator("#physical-dialog").waitFor({ state: "visible" });
  assert.equal((await state()).production.mountingHoles[0].x, 160);
  await page.locator("#physical-confirm").click();
  const dragged = (await state()).production.mountingHoles[0];
  assert.ok(Math.abs(dragged.x - 160 - 17.3 / screen.scale) < 0.05);
  assert.ok(Math.abs(dragged.y - 160 - 11.7 / screen.scale) < 0.05);
  await page.locator("#mount-place").click();
  await page.mouse.move(screen.x + 40, screen.y + 40);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#mount-preview-overlay").count(), 0);
  assert.equal((await state()).production.mountingHoles.length, 5);
  await page.locator("#mount-place").click();
  await page.keyboard.down("Control");
  await page.mouse.click(screen.x + 80, screen.y + 50);
  await page.keyboard.up("Control");
  assert.equal((await state()).production.mountingHoles.length, 6);
  await page.locator("#undo").click();
  assert.equal((await state()).production.mountingHoles.length, 5);
  await page.locator("#edge-clearance").fill("14");
  await page.locator("#mount-settings").click();
  assert.equal((await state()).production.mechanicalSettings.edgeClearance, 14);
  await page.locator("#production-open").click();
  assert.equal(await page.locator("#prod-pdf").isDisabled(), true);
  await page.locator("#production-close").click();
  const beforeFocus = await state();
  await page.locator("#checks-toggle").click();
  await page.locator('[data-target-kind="mounting"]').first().click();
  assert.equal(await page.locator("#check-focus").count(), 1);
  assert.deepEqual(await state(), beforeFocus);
  await page.locator("#edge-clearance").fill("5");
  await page.locator("#mount-settings").click();
  p = await state();
  await page.reload();
  await page.locator("#mount-toggle").click();
  assert.deepEqual((await state()).production, p.production);
  if (process.env.BOARD_MOUNTING_SCREENSHOT) {
    await page
      .locator("#file")
      .setInputFiles({
        name: "prototype.json",
        mimeType: "application/json",
        buffer: Buffer.from(serialize(addCorners(trondheimPrototype()))),
      });
    await page.locator("#mount-select").selectOption({ label: "Hjørnehull 1" });
    await page.screenshot({
      path: process.env.BOARD_MOUNTING_SCREENSHOT,
      fullPage: true,
    });
  }
  assert.deepEqual(errors, []);
  console.log(
    "Mounting Chromium PASS: create, physical move cancellation, Ctrl pointer drag, read-only checklist focus and diameter confirmation, preview/corner atomic undo, collision rejection, delete confirmation and undo identity, independent layer lock, clearance export block, JSON reload",
  );
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
