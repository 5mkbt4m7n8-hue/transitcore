import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(new URL('..',import.meta.url).pathname);
const server=createServer(async(req,res)=>{try{const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep))throw Error();const data=await readFile(file.endsWith('/')?file+'index.html':file);res.setHeader('content-type',file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html');res.end(data);}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--no-sandbox']});
const base=process.env.BOARD_TEST_URL||`http://127.0.0.1:${server.address().port}/web/board-studio/index.html`;
try{
 const page=await browser.newPage({viewport:{width:1500,height:1050}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base);await page.locator('[data-station="station-1"]').waitFor();
 const saved=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('intransit-board-v1')));
 await page.getByLabel('Vis Stasjonsnavn',{exact:true}).uncheck();assert.equal(await page.locator('[data-label]').count(),0);assert.equal(await page.locator('[data-station]').count(),16);
 await page.getByLabel('Vis Stasjonsnavn',{exact:true}).check();
 await page.locator('[data-station="station-1"]').click();await page.locator('#station-x').fill('199.125');await page.locator('#station-x').press('Tab');assert.equal((await saved()).layout.stations[0].x,199.125);
 await page.locator('#ring-outer').fill('8');await page.locator('#ring-outer').press('Tab');assert.equal((await saved()).layout.stations[0].holeDiameter,2.5);
 await page.getByRole('button',{name:'Angre',exact:true}).click();assert.equal((await saved()).layout.stations[0].ringOuter,6);await page.getByRole('button',{name:'Gjør om',exact:true}).click();assert.equal((await saved()).layout.stations[0].ringOuter,8);
 await page.getByRole('button',{name:'Lås Stasjonsringer',exact:true}).click();assert.ok(await page.locator('#station-x').isDisabled());await page.getByRole('button',{name:'Lås Stasjonsringer',exact:true}).click();
 // Ctrl-click only selects, never merges.
 await page.keyboard.down('Control');await page.locator('[data-station="station-2"]').click();await page.keyboard.up('Control');assert.match(await page.locator('#selection-count').innerText(),/2 valgt/);assert.equal((await saved()).layout.stations.length,16);
 const before=await saved();await page.locator('#station-x').fill('201.125');await page.locator('#station-x').press('Tab');const after=await saved();assert.equal(after.layout.stations[1].x-before.layout.stations[1].x,2);
 await page.getByRole('button',{name:'Angre',exact:true}).click();
 // Names move independently from physical holes.
 await page.locator('[data-station="station-1"]').click();await page.locator('#label-dx').fill('15');await page.locator('#label-dx').press('Tab');assert.equal((await saved()).layout.stations[0].x,199.125);
 await page.getByLabel('Eksporter Stasjonsnavn',{exact:true}).uncheck();const dlPromise=page.waitForEvent('download');await page.locator('#export').click();await page.locator('#export-download').click();const dl=await dlPromise;const exported=await readFile(await dl.path(),'utf8');assert.match(exported,/width="300mm"/);assert.ok(!exported.includes('<text'));
 await page.getByLabel('Eksporter Stasjonsnavn',{exact:true}).check();
 const jsonPromise=page.waitForEvent('download');await page.locator('#save').click();const json=await jsonPromise;const exact=await saved();await page.locator('#new').click();assert.equal(await page.locator('[data-station]').count(),0);await page.locator('#file').setInputFiles(await json.path());await page.locator('[data-station="station-1"]').waitFor();assert.deepEqual(await saved(),exact);
 await page.locator('#file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"format":"other"}')});await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('Ukjent'));assert.deepEqual(await saved(),exact);
 // Zoom at pointer then Space pan; no model edits.
 const pos=await page.locator('#canvas').boundingBox();await page.mouse.move(pos.x+pos.width/2,pos.y+pos.height/2);await page.mouse.wheel(0,-200);await page.waitForTimeout(100);assert.deepEqual(await saved(),exact);await page.keyboard.down('Space');await page.mouse.down();await page.mouse.move(pos.x+pos.width/2+40,pos.y+pos.height/2+20);await page.mouse.up();await page.keyboard.up('Space');assert.deepEqual(await saved(),exact);await page.locator('#fit').click();
 await page.reload();await page.locator('[data-station="station-1"]').waitFor();assert.deepEqual(await saved(),exact);
 if(process.env.BOARD_SCREENSHOT){await mkdir(path.dirname(process.env.BOARD_SCREENSHOT),{recursive:true});await page.screenshot({path:process.env.BOARD_SCREENSHOT,fullPage:true});}
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile no horizontal page overflow');assert.deepEqual(errors,[]);
 console.log('Board Studio Chromium: layer visibility/locks, precision, independent labels/rings/holes, multiselect, undo/redo, SVG download, JSON round-trip, invalid files, zoom/pan, persistence and mobile PASS');
}finally{await browser.close();await new Promise(r=>server.close(r));}
