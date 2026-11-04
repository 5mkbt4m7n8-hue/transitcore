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
try{
 page=await browser.newPage({viewport:{width:1500,height:1050}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/web/board-studio/index.html`);
 const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('intransit-board-v1')));
 const screen=(x,y)=>page.locator('#canvas > g').first().evaluate((el,p)=>{const m=el.getScreenCTM();return {x:p.x*m.a+p.y*m.c+m.e,y:p.x*m.b+p.y*m.d+m.f};},{x,y});
 async function click(x,y){const p=await screen(x,y);await page.mouse.click(p.x,p.y);}
 await page.locator('#new').click();await page.locator('#library-toggle').click();await page.locator('#library-category').selectOption('Trondheim buss');assert.equal(await page.locator('[data-symbol]').count(),6);await page.locator('[data-symbol="builtin-0-double"]').click();await click(100,100);let s=await state();assert.equal(s.layout.stations[0].points,2);assert.equal(s.layout.stations[0].capsuleType,'none');await page.locator('#library-name').fill('Min bussholdeplass');await page.locator('#library-save').click();const record=(await state()).library.templates[0];await page.locator(`[data-symbol-default="${record.id}"]`).click();await page.getByRole('button',{name:'Legg til stasjon',exact:true}).click();await click(160,160);await page.getByRole('button',{name:'Velg og flytt',exact:true}).click();const ids=(await state()).layout.stations.map(s=>s.id);await page.locator(`[data-layer="rings"] [data-station="${ids[0]}"] circle`).first().click();await page.keyboard.down('Control');await page.locator(`[data-layer="rings"] [data-station="${ids[1]}"] circle`).first().click();await page.keyboard.up('Control');const holes=(await state()).layout.stations.map(s=>s.holes);await page.locator('#ring-outer').fill('7');await page.locator('#ring-outer').press('Tab');assert.ok((await state()).layout.stations.every(s=>s.ringOuter===7));assert.deepEqual((await state()).layout.stations.map(s=>s.holes),holes);await page.locator('#undo').click();assert.ok((await state()).layout.stations.every(s=>s.ringOuter===6));await page.locator('#redo').click();
 const exported=page.waitForEvent('download');await page.locator('#library-export').click();const file=await exported;await page.locator('#new').click();await page.locator('#library-file').setInputFiles(await file.path());await page.waitForFunction(()=>JSON.parse(localStorage.getItem('intransit-board-v1')).library.templates.length===1);assert.notEqual((await state()).library.templates[0].id,record.id);assert.deepEqual((await state()).library.templates[0].template,record.template);
 assert.deepEqual(errors,[]);console.log('v0.3 A Chromium PASS: category previews, placement, saved/default symbols, mass ring style with fixed holes, history and template export/import');
}catch(e){throw e;}finally{await browser.close();await new Promise(r=>server.close(r));}
