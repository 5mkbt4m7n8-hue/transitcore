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
  let serial = 0;
  async function load(p) {
    p = structuredClone(p);
    p.title += " · test " + ++serial;
    await page.locator("#file").setInputFiles({
      name: "project.json",
      mimeType: "application/json",
      buffer: Buffer.from(serialize(p)),
    });
    await page.waitForFunction(
      (title) => document.querySelector("#title").value === title,
      p.title,
    );
    return state();
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
  async function click(x, y) {
    const p = await screen(x, y);
    await page.mouse.click(p.x, p.y);
  }
  async function selectRoute(id) {
    const p = await page
      .locator(`[data-layer="routes"] [data-route="${id}"][data-part="core"]`)
      .first()
      .evaluate((el) => {
        const p = el.getPointAtLength(el.getTotalLength() / 2),
          m = el.getScreenCTM();
        return {
          x: p.x * m.a + p.y * m.c + m.e,
          y: p.x * m.b + p.y * m.d + m.f,
        };
      });
    await page.mouse.click(p.x, p.y);
    return p;
  }
  const shot = async (suffix) => {
    if (process.env.BOARD_AUTHORING_SCREENSHOT) {
      await mkdir(path.dirname(process.env.BOARD_AUTHORING_SCREENSHOT), {
        recursive: true,
      });
      await page.screenshot({
        path: process.env.BOARD_AUTHORING_SCREENSHOT.replace(
          ".png",
          suffix + ".png",
        ),
        fullPage: true,
      });
    }
  };
  async function exportSvg() {
    const promise = page.waitForEvent("download");
    await page.locator("#export").click();
    await page.locator("#export-download").click();
    return readFile(await (await promise).path(), "utf8");
  }
  const p = createProject();
  p.layout.stations[1].source = { quayId: "NSR:Quay:DO-NOT-COPY" };
  p.layout.stations[1].ledBinding = { segmentId: "do-not-copy", index: 42 };
  await load(p);
  await page
    .locator('[data-layer="rings"] [data-station="station-2"] circle')
    .first()
    .click();
  const original = structuredClone((await state()).layout.stations[1]);
  await page.locator("#canvas").focus();
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  const location = await screen(100, 110);
  await page.mouse.move(location.x, location.y);
  assert.equal((await state()).layout.stations.length, 16);
  assert.equal(await page.locator(".placement-preview").count(), 1);
  await page.mouse.click(location.x, location.y);
  let copied = (await state()).layout.stations.at(-1);
  assert.notEqual(copied.id, original.id);
  assert.equal(copied.source, null);
  assert.ok(!copied.ledBinding);
  assert.equal(copied.name, "Ny stasjon");
  assert.equal(copied.points, 2);
  assert.deepEqual(copied.label, original.label);
  assert.deepEqual((await state()).layout.stations[1], original);
  await page.locator("#station-name").fill("Min kopi");
  await page.locator("#station-name").press("Tab");
  await page.locator("#symbol-angle").fill("45");
  await page.locator("#symbol-angle").press("Tab");
  assert.deepEqual((await state()).layout.stations[1], original);
  await page.locator("#canvas").focus();
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+z");
  assert.equal((await state()).layout.stations.length, 16);
  await page.keyboard.press("Control+y");
  assert.equal((await state()).layout.stations.length, 17);
  const beforeCancel = await state();
  await page.locator("#canvas").focus();
  await page.keyboard.press("Control+v");
  await page.mouse.move(location.x, location.y);
  await page.keyboard.press("Escape");
  assert.deepEqual(await state(), beforeCancel);
  assert.equal(await page.locator(".placement-preview").count(), 0);
  await page
    .locator(
      `[data-layer="rings"] [data-station="${(await state()).layout.stations.at(-1).id}"] circle`,
    )
    .first()
    .click();
  await page.locator("#canvas").focus();
  await page.keyboard.press("Control+v");
  await page.locator("#station-name").click();
  await page.keyboard.press("Escape");
  assert.deepEqual(await state(), beforeCancel);
  assert.equal(await page.locator(".placement-preview").count(), 0);
  // Do not intercept native text copying/pasting.
  await page.locator("#station-name").click();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("Control+c");
  await page.keyboard.press("Control+v");
  assert.equal(await page.locator(".placement-preview").count(), 0);
  assert.equal((await state()).layout.stations.length, 17);
  await page
    .locator('[data-layer="rings"] [data-station="station-2"] circle')
    .first()
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "Dupliser stasjon" }).click();
  await click(100, 150);
  assert.equal((await state()).layout.stations.length, 18);
  await page.locator("#duplicate-station").click();
  await click(140, 150);
  assert.equal((await state()).layout.stations.length, 19);
  await page.locator("#set-template").click();
  const template = (await state()).stationTemplate,
    templateState = await state();
  await page.reload();
  await page.waitForFunction(
    (title) => document.querySelector("#title").value === title,
    templateState.title,
  );
  assert.deepEqual(await state(), templateState);
  await page
    .getByRole("button", { name: "Legg til stasjon", exact: true })
    .click();
  for (let i = 0; i < 5; i++) await click(40 + i * 35, 200);
  let authored = await state();
  assert.equal(authored.layout.stations.length, 24);
  for (const s of authored.layout.stations.slice(-5)) {
    assert.equal(s.points, template.appearance.points);
    assert.equal(s.symbolAngle, template.appearance.symbolAngle);
    assert.deepEqual(s.label, template.label);
    assert.equal(s.source, null);
  }
  await page.locator("#reset-template").click();
  await click(220, 200);
  assert.equal((await state()).layout.stations.at(-1).points, 1);
  authored = await state();
  await shot("");
  // Paste single, double and multiple-point symbols with their actual offsets.
  for (const points of [1, 2, 3]) {
    let type = createProject(false),
      s = structuredClone(createProject().layout.stations[1]);
    s.id = "typed-source";
    s.x = 60;
    s.y = 70;
    s.points = points;
    s.symbolAngle = 45;
    s.pointSpacing = 12;
    delete s.holes;
    type.layout.stations = [s];
    await load(type);
    await page
      .locator('[data-layer="rings"] [data-station="typed-source"] circle')
      .first()
      .click();
    await page.locator("#canvas").focus();
    await page.keyboard.press("Control+c");
    await page.keyboard.press("Control+v");
    await click(150, 100);
    const added = (await state()).layout.stations.at(-1);
    assert.equal(added.points, points);
    assert.equal(added.symbolAngle, 45);
    assert.equal(added.holes.length, points);
    assert.equal(
      await page
        .locator(`[data-layer="rings"] [data-station="${added.id}"] circle`)
        .count(),
      points * 2,
    );
  }
  const copiedSvg = await exportSvg();
  await page.evaluate((text) => {
    const root = new DOMParser().parseFromString(
      text,
      "image/svg+xml",
    ).documentElement;
    const groups = [...root.querySelectorAll("#rings [data-station]")];
    if (
      groups.length !== 2 ||
      groups.some((g) => g.querySelectorAll("circle").length !== 6)
    )
      throw Error("Copied three-point station is missing from SVG");
    if (root.querySelectorAll("#holes [data-hole]").length !== 6)
      throw Error("Copied physical holes are missing from SVG");
  }, copiedSvg);
  // Horizontal and diagonal routes: show preview with snapping off, then bind
  // exact offset and retain it when editing the reference after reopening.
  for (const diagonal of [false, true]) {
    await load(parallelFixture(diagonal));
    await page.locator("#parallel-distance").fill(diagonal ? "30" : "20");
    await page.locator("#snap").uncheck();
    await selectRoute("follower");
    await page.locator("#move-route").click();
    async function dragRoute(dy) {
      const pt = await page
        .locator(
          '[data-layer="routes"] [data-route="follower"][data-part="core"]',
        )
        .first()
        .evaluate((el) => {
          const p = el.getPointAtLength(el.getTotalLength() / 2),
            m = el.getScreenCTM();
          return {
            x: p.x * m.a + p.y * m.c + m.e,
            y: p.x * m.b + p.y * m.d + m.f,
            scale: m.a,
          };
        });
      await page.mouse.move(pt.x, pt.y);
      await page.mouse.down();
      await page.mouse.move(pt.x, pt.y + dy * pt.scale, { steps: 5 });
      assert.ok(
        (await page.locator('[data-smart-kind="parallel-offset"]').count()) > 0,
      );
      await shot("-parallel-preview");
      await page.mouse.up();
    }
    await dragRoute(0.2);
    assert.equal((await state()).layout.parallelConstraints.length, 0);
    await page.locator("#snap").check();
    await dragRoute(0.2);
    let constrained = await state();
    assert.equal(constrained.layout.parallelConstraints.length, 1);
    const relation = constrained.layout.parallelConstraints[0];
    assert.equal(Math.abs(relation.distance), diagonal ? 30 : 20);
    await page.reload();
    await page
      .locator('[data-route="follower"]')
      .first()
      .waitFor({ state: "attached" });
    assert.deepEqual(await state(), constrained);
    await selectRoute("reference");
    await page.locator("#move-route").click();
    const rp = await selectRoute("reference"); // selected route drag, no movement yet
    await page.mouse.move(rp.x, rp.y);
    await page.mouse.down();
    await page.mouse.move(rp.x + 10, rp.y + 10, { steps: 5 });
    await page.mouse.up();
    const after = await state(),
      ref = after.layout.stations.slice(0, 2),
      follow = after.layout.stations.slice(2),
      dx = ref[1].x - ref[0].x,
      dy = ref[1].y - ref[0].y;
    for (const pt of follow)
      assert.ok(
        Math.abs(
          (-(pt.x - ref[0].x) * dy + (pt.y - ref[0].y) * dx) /
            Math.hypot(dx, dy) -
            relation.distance,
        ) < 1e-7,
      );
    const parallelSvg = await exportSvg();
    await page.evaluate(
      ({ text, distance }) => {
        const root = new DOMParser().parseFromString(
          text,
          "image/svg+xml",
        ).documentElement;
        document.body.append(root);
        try {
          const a = root.querySelector(
              '[data-route="reference"][data-part="core"]',
            ),
            b = root.querySelector('[data-route="follower"][data-part="core"]'),
            start = a.getPointAtLength(0),
            end = a.getPointAtLength(a.getTotalLength()),
            pt = b.getPointAtLength(b.getTotalLength() / 2),
            dx = end.x - start.x,
            dy = end.y - start.y,
            gap =
              ((pt.x - start.x) * -dy + (pt.y - start.y) * dx) /
              Math.hypot(dx, dy);
          if (Math.abs(gap - distance) > 0.0001)
            throw Error("Exported parallel route offset differs: " + gap);
        } finally {
          root.remove();
        }
      },
      { text: parallelSvg, distance: relation.distance },
    );
    await shot("-parallel");
  }
  // A bend can snap its incoming logical segment and retain that relation.
  await load(parallelFixture(false, true));
  await page.locator("#parallel-distance").fill("20");
  await page.locator("#snap").check();
  await selectRoute("follower");
  const bendHandle = await page.locator('[data-handle="bend"]').boundingBox();
  await page.mouse.move(
    bendHandle.x + bendHandle.width / 2,
    bendHandle.y + bendHandle.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    bendHandle.x + bendHandle.width / 2 + 5,
    bendHandle.y + bendHandle.height / 2 + 0.3,
    { steps: 5 },
  );
  assert.ok(
    (await page.locator('[data-smart-kind="parallel-offset"]').count()) > 0,
  );
  await page.mouse.up();
  const bendSnap = await state();
  assert.equal(bendSnap.layout.parallelConstraints[0].follower.leg, "in");
  assert.ok(Math.abs(bendSnap.layout.stations[2].y - 100) < 1e-8);
  assert.ok(Math.abs(bendSnap.layout.routes[1].bends[0].y - 100) < 1e-8);
  // Interior knot and its tangent both move in TWO dimensions. The shared
  // tangent remains continuous and hole positions never follow graphic edits.
  await load(geometryFixture());
  await page.locator("#snap").uncheck();
  await selectRoute("rotated");
  await page.locator("#free-shape").click();
  const beforeShape = await state(),
    shape = beforeShape.layout.routes[1].controls[0].shape;
  for (const [kind, dx, dy] of [
    ["form", 5, -3],
    ["shape-tangent", 4, -3],
  ]) {
    const box = await page.locator(`[data-handle="${kind}"]`).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(
      box.x + box.width / 2 + dx,
      box.y + box.height / 2 + dy,
      { steps: 5 },
    );
    await page.mouse.up();
  }
  const reshaped = await state();
  assert.notDeepEqual(reshaped.layout.routes[1].controls[0].shape, shape);
  assert.ok(Number.isFinite(reshaped.layout.routes[1].controls[0].shapeAngle));
  assert.deepEqual(
    reshaped.layout.stations.map((s) => s.holes),
    beforeShape.layout.stations.map((s) => s.holes),
  );
  await page.locator("#canvas").focus();
  await page.keyboard.press("Control+z");
  await page.keyboard.press("Control+y");
  assert.deepEqual(await state(), reshaped);
  await shot("-curves");
  // Verify actual downloaded SVG in Chromium, before and after JSON reopen.
  const cases = [
    [90, 0, 6, 4, false],
    [90, 0, 10, 8, false],
    [90, 45, 14, 8, false],
    [60, 15, 10, 8, false],
    [90, 0, 10, 12, true],
    [90, 0, 14, 20, true],
    [90, 0, 10, 4, false, true],
  ];
  let maxGap = 0;
  for (const [angleA, angleB, spacing, radius, bend, shapeMode] of cases) {
    let q = geometryFixture();
    const indices = bend ? [0, 1] : [2, 3],
      r = structuredClone(q.layout.routes[bend ? 0 : 1]);
    q.layout.stations = indices.map((i) =>
      structuredClone(q.layout.stations[i]),
    );
    q.layout.routes = [r];
    q.layout.stations[0].symbolAngle = angleA;
    q.layout.stations[1].symbolAngle = angleB;
    for (const s of q.layout.stations) {
      s.pointSpacing = spacing;
      s.ringOuter = 4;
      s.ringInner = 3;
      delete s.holes;
    }
    r.portSigns = {};
    r.trackSpacing = spacing;
    r.cornerRadius = radius;
    r.autoGrow = 48;
    if (shapeMode)
      r.controls[0] = {
        startReach: 32,
        endReach: 32,
        shape: { x: 130, y: 178 },
        shapeAngle: 25,
        shapeReach: 25,
      };
    q = parseProject(q);
    const route = q.layout.routes[0],
      g = edgeGeometry(q, route, 0);
    assert.ok(g.valid, g.warnings.join(" "));
    const a = q.layout.stations[0],
      b = q.layout.stations[1],
      ac = symbolCenters(q, a),
      bc = symbolCenters(q, b),
      expected = {
        width: q.board.width,
        height: q.board.height,
        spacing,
        trackIds: route.trackIds,
        ringRadiusA: a.ringOuter / 2 + a.stroke / 2,
        ringRadiusB: b.ringOuter / 2 + b.stroke / 2,
        paths: g.paths.map((path) => ({
          part: path.part,
          edge: 0,
          trackId: path.trackId,
          points: path.samples.map(({ x, y }) => ({ x, y })),
        })),
        joins: shapeMode
          ? g.rails.map((rail) =>
              rail.samples.find((pt) => Math.abs(pt.t - 0.5) < 1e-9),
            )
          : [],
        ports: [-1, 1].map((side) => ({
          start: ac[side * route.portSigns[a.id] < 0 ? 0 : 1],
          end: bc[side * route.portSigns[b.id] < 0 ? 0 : 1],
        })),
      };
    await load(q);
    const first = await checkSvg(page, await exportSvg(), expected);
    maxGap = Math.max(maxGap, first.maxGapError);
    const download = page.waitForEvent("download");
    await page.locator("#save").click();
    const json = await download;
    const saved = await state();
    await page.locator("#new").click();
    await page.locator("#file").setInputFiles(await json.path());
    await page.waitForFunction(
      (title) => document.querySelector("#title").value === title,
      saved.title,
    );
    assert.deepEqual(await state(), saved);
    const second = await checkSvg(page, await exportSvg(), expected);
    assert.deepEqual(second.paths, first.paths);
  }
  assert.deepEqual(errors, []);
  console.log(
    `Authoring Chromium PASS: copy/paste/preview/cancel/context/button/template/reset, native text keys, horizontal/diagonal persisted parallel snapping, free 2D curve shape/tangent, SVG checks across ${cases.length} orientation/spacing/radius combinations before/after reopen; max rendered gap error ${maxGap.toFixed(6)} mm`,
  );
} catch (e) {
  if (page && process.env.BOARD_AUTHORING_SCREENSHOT)
    await page.screenshot({
      path: process.env.BOARD_AUTHORING_SCREENSHOT.replace(
        ".png",
        "-failure.png",
      ),
      fullPage: true,
    });
  throw e;
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
