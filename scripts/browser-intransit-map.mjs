// Optional real-browser suite: PLAYWRIGHT_MODULE=/path/to/playwright BROWSER_PATH=/usr/bin/chromium node scripts/browser-intransit-map.mjs
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=new URL('../',import.meta.url);
let calls=0,live=false;
const board=JSON.parse(await readFile(new URL('config/boards/trondheim-bus-board.json',root))),hardware=JSON.parse(await readFile(new URL('config/hardware/trondheim-bus-board-hardware.json',root)));
const server=createServer(async(req,res)=>{try{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path.startsWith('/api/v1/frame/')){calls++;res.setHeader('content-type','application/json');res.end(JSON.stringify({schemaVersion:1,boardProfile:path.split('/').pop(),ledCount:147,sequence:calls,generatedAt:new Date(Date.now()-(live?8000:0)).toISOString(),ttlSeconds:live?10:30,leds:live?[{id:0,brightness:32,state:'AT_STOP',rgb:[255,0,0],vehicle:{id:'fixture-bus',line:'1',source:'ETA'},occupants:[{id:'fixture-bus',line:'1',source:'ETA',state:'AT_STOP',rgb:[255,0,0]}]}]:[]}));return;}
 const file=new URL('.'+path,root);if(!file.href.startsWith(root.href)){res.writeHead(403).end();return;}
 res.setHeader('content-type',path.endsWith('.js')?'text/javascript':path.endsWith('.json')?'application/json':path.endsWith('.css')?'text/css':path.endsWith('.jpg')?'image/jpeg':'text/html');res.end(await readFile(file));
 }catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://transitcore-linear-staging.lgb84.workers.dev/**',r=>r.fulfill({status:503,body:'test staging unavailable'}));
 await page.goto(`http://127.0.0.1:${server.address().port}/web/linear/index.html`);
 await page.waitForFunction(()=>document.querySelectorAll('#rows .row').length>0);
 const rows=await page.locator('#rows').innerHTML(),route=await page.locator('#route').inputValue(),before=calls;
 await page.locator('#networkMode').click();await page.waitForSelector('.map-stop');
 assert.equal(calls,before,'Mode switch must not request another frame');assert.equal(await page.locator('#route').inputValue(),route);
 assert.equal(await page.locator('#linearView').isVisible(),false);
 assert.equal(await page.locator('.map-stop[data-state="OFF"]').count(),await page.locator('.map-stop').count(),'Unresolved points must stay OFF');
 const box=await page.locator('svg.map-viewport').getAttribute('viewBox');await page.locator('[data-act=in]').click();assert.notEqual(await page.locator('svg.map-viewport').getAttribute('viewBox'),box);await page.locator('[data-act=fit]').click();
 await page.locator('[data-act=edit]').click();await page.locator('.map-stop').first().click();
 await page.getByLabel('To dioder',{exact:true}).check();assert.equal(await page.locator('.map-stop[data-direction]').count(),2);
 await page.locator('[data-act=undo]').click();assert.equal(await page.locator('.map-stop[data-direction]').count(),0);
 const download=page.waitForEvent('download');await page.locator('[data-act=export]').click();assert.equal((await download).suggestedFilename(),'trondheim-layout.json');
 await page.locator('#linearMode').click();assert.equal(await page.locator('#rows').innerHTML(),rows);assert.equal(await page.locator('#linearView').isVisible(),true);
 // The supplied source has a confirmed Ranheim binding to physical LED 0.
 live=true;await page.locator('#refresh').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('VALID'));
 await page.locator('#networkMode').click();await page.waitForSelector('.map-stop[data-state="AT_STOP"]');
 await page.locator('.map-stop[data-state="AT_STOP"]').first().click();assert.match(await page.locator('[data-role=details]').innerText(),/Kilde: ETA/);
 assert.doesNotMatch(await page.locator('[data-role=details]').innerText(),/Kilde: GPS/);
 await page.waitForFunction(()=>document.querySelectorAll('.map-stop[data-state="AT_STOP"]').length===0,{timeout:7000});
 live=false;

 await page.locator('#source').selectOption('staging');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('503'));
 await page.locator('#networkMode').click();assert.equal(await page.locator('.map-stop:not([data-state="OFF"])').count(),0);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mobile must not overflow');
 assert.deepEqual(errors,[]);console.log('Browser: same-page mode switching, zero extra frame requests, unchanged Linear DOM, OFF safety, zoom, split/undo/export, staging failure and mobile PASS');
}finally{await browser.close();await new Promise(r=>server.close(r));}
